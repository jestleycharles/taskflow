# TaskFlow — Feature reference

TaskFlow is a real-time team task manager with Kanban boards, chat, and direct messages. Features depend on how you sign in and your role on each team.

**Account types**

| Type | Description |
|------|-------------|
| **Guest** | Shared demo account (`Continue as guest`). Anyone using it shares the same user identity, teams, and data. |
| **Registered** | Personal account (email/password or OAuth). Private profile, DMs, and full collaboration tools. |

**Team roles** (registered users on a team)

| Role | Description |
|------|-------------|
| **Owner** | Created the team. Full team settings, member management, custom roles, and deletion. |
| **Admin** | Can invite members by email (when the team owner is registered). Cannot change team settings or remove members. |
| **Member** | Kanban, tasks, chat (if registered), comments, and activity. No team administration. |

---

## Registration benefits

Short list shown to guest users in the app. Full details are in the sections below.

- **Private account** — Your teams, tasks, and activity are tied to your own identity instead of a shared guest login.
- **Profile & avatar** — Edit username, email, and password; choose a preset avatar or upload your own image.
- **Direct messages** — Private one-to-one conversations with other registered users from the dashboard.
- **DM privacy controls** — Block email addresses and block or ignore users in direct messages.
- **Team chat participation** — Send, edit, and delete your own messages in team-wide chat (guests can only read).
- **Emoji reactions** — React to team chat, direct messages, and task comments.
- **@mentions** — Mention teammates in task comments and team chat.
- **Full task editing** — Edit task title and description and delete tasks (guests have limited task editing in the UI).
- **Team invites by email** — Receive invitations at your email and accept or decline them on the dashboard.
- **Team avatar upload** — Upload a custom team image when you own the team (guests can only use presets).
- **Invite teammates from the board** — Send email invitations when you are owner/admin and the team owner is registered.
- **OAuth sign-in** — Sign in with Google or GitHub in addition to email and password.
- **Manage your own messages** — Edit or delete messages you sent in team chat and direct messages.

---

## Authentication & account

### Guest users

- **Continue as guest** — Instant access without registration via a single shared account.
- **Guest safety notice** — First dashboard visit explains that other guests can see and change the same data.
- **Create teams** — Guests can create teams and become **owner** of those teams (with restrictions below).
- **Sign out** — End session like any other user.

### Registered users

- **Email registration** — Username, email, and password (minimum 8 characters).
- **Email & password login** — Session-based auth with HTTP-only cookies (7-day session).
- **OAuth** — Google and GitHub via Supabase Auth (`/auth/callback`).
- **Logout** — Clear server session.
- **Profile** — Update username, email, and password (with current-password check for password changes).
- **User avatar** — Eight preset SVG avatars or upload JPEG/PNG/WebP/GIF (max 2 MB) to Supabase Storage.
- **Session refresh** — `/api/me` reloads avatar and profile from the database.

### Everyone (signed in)

- **Health check** — `GET /health` for uptime monitoring.
- **PWA** — Installable web app (`manifest.webmanifest`, service worker, install prompt).
- **Responsive UI** — Tailwind-based layout for dashboard, board, login, and register pages.

---

## Dashboard

### Guest users

- **Team list** — View and open teams you belong to; see your role badge (`owner` / `member`).
- **Create team** — Name, description, and preset team avatar only (no image upload).
- **Online indicators** — See how many members are online per team (`online_count` / `member_count`).
- **Feedback** — Submit feedback or bug reports (optional Cloudflare Turnstile in production; rate limits per browser session).
- **Guest badge** — UI shows you are on the shared guest account.

### Registered users

- **Everything guests have**, plus:
- **Profile panel** — Edit account and avatar from the dashboard.
- **Pending team invites** — Accept or decline email-based invitations.
- **Direct message inbox** — FAB to open DM conversations; start chats by registered user email.
- **DM online status** — See which DM contacts are online (app-level presence).
- **Feedback** — Same as guests without captcha when Turnstile is not configured.

### Feedback admin (registered, configured email only)

- **Feedback inbox** — Paginated list of all user submissions with search.

---

## Teams & membership

### Guest users — as team **owner**

- **Edit team** — Name and description.
- **Team avatar** — Preset avatars only (no upload).
- **Custom display roles** — Create, rename, reorder, and delete custom role labels; assign them to members; toggle “separate members by role” in the member list.
- **Remove members** — Remove non-owner members.
- **Delete team** — Permanently delete the team.
- **Cannot send email invites** — Invites are disabled while the team owner is a guest account; UI explains that a registered owner is required.

### Guest users — as team **member**

- **View team** — Members, roles, pending invites (read-only), and board access.
- **No team settings** — Cannot open owner-only settings panel.

### Registered users — as team **owner**

- **Everything guest owners have**, plus:
- **Upload team avatar** — Custom image to Supabase Storage (replaces stored file when changing avatar).
- **Email invites** — Invite registered users by email; pending invites appear until accepted.
- **Cancel pending invites** — Remove a pending invitation.

### Registered users — as team **admin**

- **Invite by email** — Same as owner when team owner is registered (not guest-owned).
- **No settings access** — Cannot edit team name/description, avatars, custom roles, remove members, or delete team.

### Registered users — as team **member**

- **Join via invite** — Accept invite from dashboard; decline to dismiss.
- **Board access** — Full Kanban participation (see Tasks).
- **No administration** — No team settings or invites unless promoted (admin/owner).

### All signed-in members

- **Presence on board** — Heartbeat while viewing a board; “online” counts for teammates on that team.
- **Activity log** — Per-team history (task changes, comments, joins, team updates).

---

## Kanban board & tasks

### Guest users

- **View board** — Three columns: To Do, Doing, Done.
- **Create tasks** — Add tasks to any column.
- **Drag and drop** — Move tasks between columns and reorder within a column.
- **Real-time sync** — Task list polls every 5 seconds.
- **Task detail panel** — Status, priority, due date, assignee, creator, and comments tab.
- **Update task fields** — Change status, priority, due date, and assignee via the detail panel.
- **Limited title/description** — Cannot edit title or description or delete tasks (buttons hidden; API still allows member updates if called directly).
- **Task comments** — Read and post comments; cannot use @mentions (keyboard and paste blocked).
- **View reactions** — See emoji reactions on comments; cannot add reactions.
- **Unread comment badges** — Per-task unread counts and read-state tracking.
- **Comment search & pagination** — Search within comments; batched loading for long threads.
- **Team chat** — Read-only; composer hidden with guest notice.
- **Activity panel** — View team activity feed.
- **Member list** — See owners, custom roles, and online status.

### Registered users — team **member**, **admin**, or **owner**

- **Everything guests have**, plus:
- **Edit task title & description** — Inline edit with “view original” when edited.
- **Delete tasks** — Remove tasks from the board.
- **Edit history** — System comments and activity entries when title, description, status, priority, due date, or assignee changes.
- **@mentions** — Autocomplete `@username` in task comments and team chat.
- **Emoji reactions** — Toggle reactions on task comments, team chat, and DMs.
- **Team chat** — Send messages; edit or delete your own messages; read receipts (`last_read_at`).
- **Chat search & pagination** — Search and batch navigation in team chat.
- **Spam protection** — Per-thread cooldown, duplicate detection, and similar-message guards on send.

### Team **owner** / **admin** (registered)

- **Invite panel on board** — Email invite UI (disabled if team owner is guest).

### Team **owner** only (registered or guest)

- **Team settings panel** — Edit team info, avatar, custom roles, member roles, and remove members.

---

## Direct messages (registered only)

- **Start conversation** — By registered user’s email (guests and blocked users cannot be messaged).
- **Conversation list** — Recent DMs with preview and unread state.
- **Send / edit / delete** — Own messages only; soft-delete support in UI.
- **Read state** — Per-conversation `last_read_at`.
- **Reactions** — Emoji on DM messages.
- **Search & batch loading** — Same pagination pattern as team chat.
- **App presence** — Ping while dashboard is open; online list for DM contacts.
- **Privacy settings**:
  - Block email addresses (prevent new conversations from those addresses).
  - Block user (existing conversation; cannot send).
  - Ignore user (hide conversation without blocking sends from their side in all cases — see in-app behavior).

---

## Security & abuse prevention

- **Message send guard** — Cooldown, duplicate, near-duplicate, and burst detection for chat, DMs, and comments.
- **Feedback honeypot** — Hidden field bot trap on feedback form.
- **Guest feedback limits** — Per-session hourly/daily caps and cooldown (server-side).
- **Turnstile (optional)** — Cloudflare captcha for guest feedback when keys are configured.
- **Session security** — HTTP-only cookies, `trust proxy` for TLS behind Render, `sameSite: lax`.

---

## Deployment & operations

- **Environment-based config** — Supabase URL/keys, session secret, optional Turnstile keys (see `.env.example`).
- **Static frontend** — Served from `public/` (HTML pages, shared JS modules, avatars, PWA icons).
- **Render-ready** — Production deployment example in README.

---

## Official hosted service vs self-hosted

The open-source codebase is licensed for self-hosting and customization (see [LICENSE](LICENSE)). The official deployment at [taskflow-byjest.onrender.com](https://taskflow-byjest.onrender.com) may offer **subscription or paid tiers** in the future with features that are not necessarily included in this repository. Self-hosted instances are independent and are not required to implement the same billing model.
