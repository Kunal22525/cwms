/*
# Initial Schema — Construction Workforce Management System (CWMS)

## Purpose
Creates the core operational tables for the CWMS application: profiles, user_roles,
sites, workers, attendance, salary_advances, and report_logs.

## New Tables

1. **profiles**
   - id (uuid, PK, references auth.users, CASCADE on delete)
   - full_name (text, not null)
   - email (text, unique, not null)
   - mobile (text, nullable)
   - created_at, updated_at (timestamptz, default now())

2. **user_roles**
   - id (uuid, PK, default gen_random_uuid)
   - user_id (uuid, references auth.users, CASCADE on delete)
   - role (app_role enum: admin | supervisor, default 'supervisor')
   - created_at (timestamptz, default now())
   - UNIQUE(user_id, role)

3. **sites**
   - id (uuid, PK)
   - site_code (text, unique, not null) — auto-generated S001, S002...
   - site_name (text, not null)
   - address (text, nullable)
   - supervisor_id (uuid, references profiles)
   - status (text, default 'Active')
   - created_at, updated_at

4. **workers**
   - id (uuid, PK)
   - worker_code (text, unique, not null) — auto-generated W001, W002...
   - name, mobile, address, aadhaar, trade, daily_wage, joining_date, site_id
   - photo_url (text, nullable)
   - status (text, default 'Active')
   - working_place, work_type, working_since (for worker summary/history)
   - created_at, updated_at

5. **attendance**
   - id (uuid, PK)
   - worker_id (uuid, NOT NULL, references workers, CASCADE)
   - site_id (uuid, references sites)
   - attendance_date (date, not null)
   - attendance_time (timestamptz, default now())
   - shift (text: Day | Night, not null)
   - status (text: Present | Absent | Half Day | Leave, not null)
   - supervisor_id (uuid, references profiles)
   - created_at, updated_at
   - UNIQUE constraint on (worker_id, attendance_date, shift) to prevent duplicates

6. **salary_advances**
   - id (uuid, PK)
   - worker_id (uuid, NOT NULL, references workers, CASCADE)
   - amount (numeric(12,2), not null)
   - request_date (date, default current_date)
   - reason, remarks (text, nullable)
   - status (text: Pending | Approved | Rejected, default 'Pending')
   - requested_by, approved_by (uuid, references profiles)
   - approved_at (timestamptz, nullable)
   - created_at, updated_at

7. **report_logs**
   - id (uuid, PK)
   - report_type, file_name (text, nullable)
   - generated_by (uuid, references profiles)
   - generated_at (timestamptz, default now())

## Enums
- app_role: 'admin', 'supervisor'

## Notes
- All tables use UUID primary keys via gen_random_uuid().
- updated_at triggers are created in a separate migration.
- RLS policies are created in a separate migration.
- Site codes and worker codes are generated via database functions.
*/

-- ============================================================
-- ENUM: app_role
-- ============================================================
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'supervisor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE: profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  mobile text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- TABLE: user_roles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'supervisor',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

-- ============================================================
-- TABLE: sites
-- ============================================================
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_code text UNIQUE NOT NULL,
  site_name text NOT NULL,
  address text,
  supervisor_id uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- TABLE: workers
-- ============================================================
CREATE TABLE IF NOT EXISTS workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_code text UNIQUE NOT NULL,
  name text NOT NULL,
  mobile text,
  address text,
  aadhaar text,
  trade text,
  daily_wage numeric(12,2),
  joining_date date,
  site_id uuid REFERENCES sites(id),
  photo_url text,
  status text NOT NULL DEFAULT 'Active',
  working_place text,
  work_type text,
  working_since date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- TABLE: attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  site_id uuid REFERENCES sites(id),
  attendance_date date NOT NULL,
  attendance_time timestamptz DEFAULT now(),
  shift text NOT NULL,
  status text NOT NULL,
  supervisor_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Prevent duplicate attendance for same worker/date/shift
DO $$ BEGIN
  ALTER TABLE attendance
    ADD CONSTRAINT attendance_unique UNIQUE (worker_id, attendance_date, shift);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE: salary_advances
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  remarks text,
  status text NOT NULL DEFAULT 'Pending',
  requested_by uuid REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- TABLE: report_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS report_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text,
  generated_by uuid REFERENCES profiles(id),
  generated_at timestamptz DEFAULT now(),
  file_name text
);
