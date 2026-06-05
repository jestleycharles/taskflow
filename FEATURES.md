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
- **Team invite links** — Join a team via a shareable link after registering or signing in.
- **Team avatar upload** — Upload a custom team image when you own the team (guests can only use presets).
- **Invite teammates from the board** — Send email invitations or copy a shareable invite link when you are owner and the team owner is registered.
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

### Everyone

- **PWA** — Installable web app (`manifest.webmanifest`, service worker, install prompt).

---

## Dashboard

### Guest users

- **Team list** — View and open teams you belong to; see your role badge (`owner` / `member`).
- **Create team** — Name, description, and preset team avatar only (no image upload).
- **Online indicators** — See how many members are online per team (`online_count` / `member_count`).
- **Feedback** — Submit feedback or bug reports
- **Guest badge** — UI shows you are on the shared guest account.

### Registered users

- **Everything guests have**, plus:
- **Profile panel** — Edit account and avatar from the dashboard.
- **Pending team invites** — Accept or decline email-based invitations.
- **Direct message inbox** — FAB to open DM conversations; start chats by registered user email.
- **DM online status** — See which DM contacts are online (app-level presence).
- **Feedback** — Same as guests
- **Roadmap comments** — Comment on dashboard “What we’re building” posts (guests can read only).

### Everyone (guest + registered)

- **What we’re building** — Social-style roadmap feed below your teams on the dashboard: title, caption, picture, emoji reactions (same set as chat), and comments. Guests can read and view reactions; only registered users can react or comment.

### Feedback admin (registered, `FEEDBACK_ADMIN_EMAIL` in server `.env`)

- **Feedback inbox** — Paginated list of all user submissions with search. Only visible when `FEEDBACK_ADMIN_EMAIL` is set and matches your signed-in email. The admin address is never exposed to the client; `/api/me` returns `is_feedback_admin: true` for that account only.
- **Roadmap posts** — Create, edit, and delete dashboard roadmap posts (`POST/PATCH/DELETE /api/feature-posts`). Posts are attributed to the admin account. Use **in progress** for the feature currently being built and **Shipped** when it is done.

---

## Teams & membership

### Guest users — as team **owner**

- **Edit team** — Name and description.
- **Team avatar** — Preset avatars only (no upload).
- **Custom display roles** — Create, rename, reorder, and delete custom role labels; assign them to members; toggle “separate members by role” in the member list.
- **Remove members** — Remove non-owner members.
- **Delete team** — Permanently delete the team.
- **Cannot send email invites or invite links** — Invites are disabled while the team owner is a guest account; UI explains that a registered owner is required.

### Guest users — as team **member**

- **View team** — Members, roles, pending invites (read-only), and board access.
- **No team settings** — Cannot open owner-only settings panel.

### Registered users — as team **owner**

- **Everything guest owners have**, plus:
- **Upload team avatar** — Custom image to Supabase Storage (replaces stored file when changing avatar).
- **Email invites** — Invite registered users by email; pending invites appear until accepted. Guest accounts cannot be invited.
- **Invite links** — Generate a tokenized shareable link (7-day expiry by default). New users open the link, register or sign in, and land on the team board. Owners can revoke links. Guest-owned teams cannot create links.
- **Cancel pending invites** — Remove a pending invitation.
- **Transfer ownership** — Assign another registered member as owner (you become a member). Guest accounts cannot receive ownership. Recorded in the activity log.

### Registered users — as team **member**

- **Join via invite** — Accept email invite from dashboard; decline to dismiss. Or join via invite link (auto-join after sign-in/register).
- **Board access** — Full Kanban participation (see Tasks).
- **Leave team** — Voluntarily leave from the team panel on the board (pending invites for you on that team are cleared).
- **No administration** — No team settings or invites unless you are the team owner.

### Ownership & leaving (rules)

- **Owners cannot leave** until they transfer ownership to another registered member or delete the team.
- **Guest accounts** cannot transfer ownership, receive ownership, or use leave-team (API returns 403/400 with a clear message).

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
- **Task attachments (read-only)** — View and preview image/PDF attachments on tasks; cannot upload files or change cover images.
- **Task comments** — Read and post comments; cannot use @mentions (keyboard and paste blocked).
- **View reactions** — See emoji reactions on comments; cannot add reactions.
- **Unread comment badges** — Per-task unread counts and read-state tracking.
- **Comment search & pagination** — Search within comments; batched loading for long threads.
- **Team chat** — Read-only; composer hidden with guest notice.
- **Activity panel** — View team activity feed.
- **Member list** — See owners, custom roles, and online status.

### Registered users — team **member** or **owner**

- **Everything guests have**, plus:
- **Edit task title & description** — Inline edit with “view original” when edited.
- **Delete tasks** — Remove tasks from the board.
- **Edit history** — System comments and activity entries when title, description, status, priority, due date, or assignee changes.
- **@mentions** — Autocomplete `@username` in task comments and team chat.
- **Emoji reactions** — Toggle reactions on task comments, team chat, and DMs.
- **Team chat** — Send messages; edit or delete your own messages; read receipts (`last_read_at`).
- **Chat search & pagination** — Search and batch navigation in team chat.
- **Spam protection** — Per-thread cooldown, duplicate detection, and similar-message guards on send.

### Team **owner** (registered)

- **Invite panel on board** — Email invite and “Copy invite link” (disabled if team owner is guest; guest accounts cannot be invited).
- **Team settings panel** — Edit team info, avatar (disabled if team owner is guest), custom roles, member roles, and remove members.

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

- **Message send guard** — Cooldown, duplicate, near-duplicate, and burst detection for chat, DMs, and comments; composers show a live countdown when rate-limited. The account matching `FEEDBACK_ADMIN_EMAIL` in `.env` bypasses these guards.
- **Feedback honeypot** — Hidden field bot trap on feedback form.
- **Guest feedback limits** — Per-session hourly/daily caps and cooldown (server-side).
- **Turnstile** — Cloudflare captcha for guest feedback when keys are configured.
- **Session security** — HTTP-only cookies, `trust proxy` for TLS behind Render, `sameSite: lax`.

---

## Deployment & operations

- **Environment-based config** — Supabase URL/keys, session secret, optional Turnstile keys (see `.env.example`).
- **Static frontend** — Served from `public/` (HTML pages, shared JS modules, avatars, PWA icons).
- **Render-ready** — Production deployment example in README.

---

## Official hosted service vs self-hosted

The open-source codebase is licensed for self-hosting and customization (see [LICENSE](LICENSE)). The official deployment at [taskflow-byjest.onrender.com](https://taskflow-byjest.onrender.com) may offer **subscription or paid tiers** in the future with features that are not necessarily included in this repository. Self-hosted instances are independent and are not required to implement the same billing model.
