# TaskFlow — Real-Time Team Task Manager Web App

A real-time team task manager with Kanban boards, built with Node.js, Express, Supabase, and Tailwind CSS.

https://taskflow-byjest.onrender.com

## Screenshots

**Sign in** — register, sign in, or continue as guest.

![TaskFlow login screen](docs/images/login.png)

**Dashboard** — create teams and open a Kanban board.

![TaskFlow dashboard — your teams](docs/images/dashboard.png)

**Kanban board** — columns, tasks, team invites, and activity.

![TaskFlow Kanban board](docs/images/board.png)

---

## Features
- User registration & login (email/password, Google, GitHub via Supabase Auth, plus guest account)
- Create teams and invite members by email
- Kanban board (To Do / Doing / Done) with drag-and-drop
- Real-time task updates via polling (5s interval)
- Task comments
- Team chat (read-only for guests; send, edit, and delete for signed-in users)
- Due dates, priorities, and assignees
- Activity history per team
- Responsive design

---

## Project Structure

```
taskflow/
├── server.js              # Express app entry point
├── package.json
├── schema.sql             # Run this in Supabase SQL Editor
├── lib/
│   └── supabase.js        # Supabase client setup
├── middleware/
│   └── auth.js            # Session auth middleware
├── routes/
│   ├── auth.js            # Login, register, logout
│   ├── teams.js           # Team CRUD + invite
│   └── tasks.js           # Tasks, comments, activity
└── public/
    ├── login.html
    ├── register.html
    ├── dashboard.html     # Team list
    └── board.html         # Kanban board
```

---

## Usage

1. **Register** or use the guest account
2. From the **Dashboard**, click **New Team** to create a team
3. Click on a team card to open its **Kanban Board**
4. Use **+ buttons** on each column to add tasks
5. **Drag & drop** tasks between columns
6. **Click a task** to open its detail panel (edit priority, due date, assignee, add comments)
7. Click **Team** in the navbar to invite members by email
8. Click **Activity** to see recent team activity
9. Use the **chat button** (bottom-left) for team-wide messages

Run `migrations/team_chat_messages.sql` in the Supabase SQL Editor before using team chat. If the table already exists, also run `migrations/team_chat_content_before_edit.sql`.

Run `migrations/auth_oauth.sql` before using Google or GitHub sign-in.

### OAuth setup (Google & GitHub)

1. In [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **Providers**, enable **Google** and **GitHub** and add each provider’s client ID/secret.
2. Under **Authentication** → **URL Configuration**, set **Site URL** to your app origin (e.g. `http://localhost:3000` or your Render URL).
3. Add this **Redirect URL**: `https://your-domain/auth/callback` (and `http://localhost:3000/auth/callback` for local dev).
4. Ensure `.env` includes `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

**Same email, different sign-in methods:** If someone registers with a Gmail address and a password, they can sign in with email/password. If they later use **Continue with Google** with the same Gmail address, Supabase links the Google identity to the same auth user when automatic linking is enabled; the app matches by email and keeps one TaskFlow profile. OAuth-only accounts have no password until they set one in **Profile**. Legacy accounts created before Supabase Auth still sign in with email/password until they use OAuth or change password (which migrates auth to Supabase).

---

## Tech Stack

| Layer      | Tech                       |
|------------|----------------------------|
| Backend    | Node.js, Express           |
| Database   | Supabase (PostgreSQL)      |
| Auth       | Supabase Auth + express-session |
| Frontend   | HTML, Tailwind CSS (CDN)   |
| Real-time  | 5-second polling           |
| Deployment | Render                     |
