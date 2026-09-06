/*
# Auth Profiles Trigger & has_role() Security Function

## Purpose
1. Creates a SECURITY DEFINER function `has_role(p_role app_role)` that checks
   whether the current authenticated user has a given role. This is the ONLY
   authorized way to check roles — the frontend must never trust a role it
   supplies itself.
2. Creates a trigger on `auth.users` that automatically inserts a `profiles`
   row whenever a new user signs up, populating full_name and email from
   auth metadata.
3. Creates a trigger on `auth.users` that automatically assigns the
   'supervisor' role to new users. Admin can only be granted by updating
   user_roles directly (via SQL or admin UI).
4. Creates `updated_at` trigger functions and applies them to all tables
   with an `updated_at` column.

## Security
- `has_role()` is SECURITY DEFINER so it can read user_roles regardless of RLS.
- It uses `auth.uid()` to identify the caller — never trusts a passed user_id.
- New users default to 'supervisor'. No self-service admin elevation.
- The `handle_new_user` trigger runs as SECURITY DEFINER to insert into profiles
  and user_roles (which are RLS-locked).

## Notes
- `search_path` is set to `public` on all SECURITY DEFINER functions for security.
- Triggers are idempotent via `DROP TRIGGER IF EXISTS`.
*/

-- ============================================================
-- FUNCTION: has_role(p_role app_role) — SECURITY DEFINER
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(p_role app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_has boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role = p_role
  ) INTO v_has;

  RETURN v_has;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.has_role(app_role) TO authenticated;

-- ============================================================
-- FUNCTION: handle_new_user() — auto-create profile + default role
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert default role: supervisor (never admin)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'supervisor')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================
-- TRIGGER: on auth.users insert
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCTION: update_updated_at() — auto-update updated_at column
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TRIGGERS: updated_at on all relevant tables
-- ============================================================
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS sites_updated_at ON public.sites;
CREATE TRIGGER sites_updated_at
  BEFORE UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS workers_updated_at ON public.workers;
CREATE TRIGGER workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS attendance_updated_at ON public.attendance;
CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS salary_advances_updated_at ON public.salary_advances;
CREATE TRIGGER salary_advances_updated_at
  BEFORE UPDATE ON public.salary_advances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
