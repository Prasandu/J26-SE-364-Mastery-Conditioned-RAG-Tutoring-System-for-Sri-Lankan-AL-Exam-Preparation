# frontend - the integrated web app (all four components)

React 19 + TypeScript + Vite + Tailwind 4. One app, one Supabase Auth sign-in, with a
section per component:

| Path | Component | Code | Backend (`.env`) |
|---|---|---|---|
| `/lab` | 1. Virtual Chemistry Lab | `src/features/lab/` (opens `apps/web`) | `VITE_LAB_URL` |
| `/papers`, `/practice`, `/my-results`, `/review`, `/admin` | 2. Assessment | `src/features/{papers,attempt,practice,history,review,admin,generate}` | `VITE_API_URL` |
| `/planning` | 3. Study planning | `src/features/planning/` | `VITE_PLANNING_API_URL` |
| `/tutor` | 4. AI tutor | `src/features/tutor/` | `VITE_SUPPORT_API_URL` |

## Sign-in

- `src/auth/` holds the Supabase session (`AuthProvider`, `LoginPanel`); planning and the tutor
  read it directly.
- `src/hooks/useAuth.tsx` adds the assessment account on top (role and name from
  `GET /auth/me`), which role-based pages and the navigation use.
- `src/api/client.ts` attaches the Supabase access token to every request: `request()` for the
  assessment service, `requestService()` for the others.

## Run

```powershell
copy .env.example .env   # Supabase URL + anon key, and each service's URL
npm install
npm run dev              # http://localhost:5173 - the origin every backend's CORS allows
npm run check            # lint, type-check, tests, build, audit
```
