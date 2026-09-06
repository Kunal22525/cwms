# Construction Workforce Management System (CWMS)

A complete, production-ready enterprise construction workforce management dashboard built with Next.js, TypeScript, and Supabase.

## Features

- **Authentication** — Email/password login with Supabase Auth, session persistence, protected routes
- **Role-Based Access Control** — Admin and Supervisor roles with PostgreSQL SECURITY DEFINER `has_role()` function
- **Site Management** — Create, edit, deactivate/reactivate sites; auto-generated site codes (S001, S002...)
- **Worker Management** — Full CRUD with photo upload (Supabase Storage), auto-generated worker codes (W001, W002...)
- **Worker Summary/History** — Detailed profile with personal info, employment info, attendance history, advance history, and advance balance
- **Attendance** — Mobile-optimized marking with large touch targets; Present/Absent/Half Day/Leave; Day/Night shifts; duplicate prevention
- **Salary Advances** — Request/approve/reject workflow with status tracking and balance calculation
- **Reports** — Monthly Attendance, Worker Advance, Site-wise Attendance, Worker Summary
- **Excel Export** — One-click .xlsx export for all reports using the `xlsx` library
- **Dashboard** — Real-time statistics, charts (attendance trend, site-wise counts, status distribution, advance summary), recent activity
- **Responsive** — Full sidebar on desktop, bottom navigation on mobile
- **No Mock Data** — All data comes from Supabase; empty states shown when no data exists

## Tech Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, React, Tailwind CSS, shadcn/ui, Lucide React icons, Recharts, React Hook Form, Zod, TanStack React Query, date-fns
- **Backend:** Supabase (PostgreSQL, Auth, Storage)
- **Exports:** xlsx (Excel), CSV fallback
- **Deployment:** Vercel

## Folder Structure

```
app/
  login/           — Login page
  dashboard/       — Dashboard (protected)
  sites/           — Site management (admin only)
  workers/         — Worker management
  workers/[id]/    — Worker detail/summary page
  attendance/      — Attendance marking
  salary-advances/ — Salary advance management
  reports/         — Reports with Excel export
  users/           — User management (admin only)
  settings/        — Profile, password, about

components/
  layout/          — Sidebar, topbar, page header, stat card, status badge, empty state
  ui/              — shadcn/ui components
  providers.tsx    — React Query + Auth providers

lib/
  supabase/        — Supabase client, server, middleware
  auth/            — Auth context
  validations/     — Zod schemas
  utils.ts         — Utility functions

types/             — TypeScript type definitions

supabase/
  migrations/      — SQL migration files
```

## Supabase Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your Project URL and anon key from Settings > API

### 2. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run SQL Migrations

The migrations are in `supabase/migrations/`. Run them in order in the Supabase SQL Editor (Dashboard > SQL Editor):

1. `001_initial_schema.sql` — Creates all tables and the `app_role` enum
2. `002_auth_profiles.sql` — Creates `has_role()` function, auth trigger for auto-profile creation, updated_at triggers
3. `003_roles_and_rls.sql` — Enables RLS on all tables, creates all policies, creates code generation functions
4. `004_storage.sql` — Creates the `worker-photos` storage bucket and policies
5. `005_indexes.sql` — Creates performance indexes

Copy the contents of each file and paste into the SQL Editor, then click Run.

### 4. Configure Worker Photo Storage

The `worker-photos` bucket is created automatically by migration `004_storage.sql`. It accepts:
- **File types:** JPG, JPEG, PNG, WebP
- **Max size:** 5 MB

No additional configuration needed.

## How to Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key

# 3. Run SQL migrations (see Supabase Setup above)

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected to `/login`.

## Build

```bash
npm run build
npm start
```

## How to Create the First Admin

1. **Create a user in Supabase Dashboard:**
   - Go to Authentication > Users > Add user
   - Enter an email and password
   - Click "Create user"
   - The database trigger will automatically create a profile and assign the `supervisor` role

2. **Promote to admin — run this SQL in the Supabase SQL Editor:**

```sql
-- Replace with your email
UPDATE user_roles
SET role = 'admin'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
```

If no role row exists yet:

```sql
INSERT INTO user_roles (user_id, role)
VALUES ((SELECT id FROM auth.users WHERE email = 'your-email@example.com'), 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

3. **Sign in** at `/login` with the email and password you set.

## How to Create a Supervisor

**Option A — Via the Users page (admin only):**
1. Sign in as admin
2. Go to Users > Add User
3. Enter name, email, password, and select "Supervisor" role
4. Click "Create User"

**Option B — Via Supabase Dashboard:**
1. Go to Authentication > Users > Add user
2. Enter email and password
3. The trigger will automatically assign the `supervisor` role

## How to Assign a Supervisor to a Site

1. Go to Sites (admin only)
2. Edit a site
3. Select a supervisor from the dropdown
4. Save

The supervisor will then only see data for their assigned site.

## Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import the repository
3. Set the following environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon key
4. Deploy

### Vercel Environment Variables

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon/public key |

## Data Retention (90-Day Policy)

The SRS requires 90-day operational data retention. The current implementation:

- **Identifies** records older than 90 days (visible in reports by filtering by date range)
- **Allows export** of old data via the Excel export feature before any archival
- **Does NOT automatically delete** any data without explicit confirmation

To export old data before archival:
1. Go to Reports
2. Use the date filters to select records older than 90 days
3. Export to Excel

## Testing Checklist

- [ ] Login works with valid credentials
- [ ] Login fails with invalid credentials
- [ ] Logout redirects to /login
- [ ] Unauthenticated users redirected to /login
- [ ] Admin can access all pages
- [ ] Supervisor cannot access Sites or Users pages
- [ ] Supervisor only sees their assigned site's data
- [ ] Create a site (auto-generates S001 code)
- [ ] Edit a site
- [ ] Deactivate and reactivate a site
- [ ] Create a worker (auto-generates W001 code)
- [ ] Upload a worker photo
- [ ] Edit a worker
- [ ] View worker detail page with attendance and advance history
- [ ] Mark attendance for a site/date/shift
- [ ] Duplicate attendance is prevented
- [ ] Mark all present works
- [ ] Save attendance works
- [ ] Create a salary advance request
- [ ] Admin can approve/reject advances
- [ ] Supervisor cannot approve/reject advances
- [ ] Dashboard shows real statistics
- [ ] Reports generate with real data
- [ ] Excel export downloads .xlsx file
- [ ] Mobile navigation works
- [ ] Empty states display when no data

## Future Enhancements

These features are NOT implemented in v1.0 but may be added in future versions:

- Face recognition attendance
- QR code-based attendance
- GPS location tracking
- Geofencing for site attendance
- Payroll calculation and processing
- Overtime tracking
- Equipment management
- Inventory management
- Automated data archival (90-day retention with auto-delete)
- SMS notifications
- Multi-language support
- Offline mode for attendance marking

## Limitations

- User creation via the admin UI requires the Supabase service role key to be configured as a Vercel environment variable (or use Supabase Dashboard directly)
- No public signup — only admins can create users
- Photos are stored in a private bucket; URLs are public URLs generated by Supabase
- Data is not automatically archived at 90 days — manual export is required before any deletion
