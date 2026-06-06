# TaskFlow — Feature checklist (agent work items)

Use this document to pick **one feature per PR/agent session**. Each section is self-contained with scope, fixes to apply, files to touch, and acceptance criteria.

**Before starting any item**

- [ ] Read [FEATURES.md](../FEATURES.md) (permissions: guest vs registered, owner vs member).
- [ ] Read [CONTRIBUTING.md](../CONTRIBUTING.md) (setup, style, PR rules).
- [ ] Update [FEATURES.md](../FEATURES.md) and [schema.sql](../schema.sql) when behavior or DB changes.
- [ ] Test: guest flow, registered member, team owner.

**Dashboard roadmap posts (`What we're building`)**

The dashboard shows social-style posts below **Your Teams** (above the feedback inbox). All users can read; only **registered** users can react and comment. Only the **feedback admin** (`FEEDBACK_ADMIN_EMAIL`) can create, edit, or delete posts via the dashboard or `POST/PATCH/DELETE /api/feature-posts`.

**Posting rules for agents (do this every feature PR):**

1. **One “in progress” post at a time** — Do not publish the whole checklist. Only announce the feature you are actively building *right now*.
2. **When you start a feature** — Under the admin account, create (or ensure there is) a single post with `post_type: in_progress`, title/caption describing that checklist item, and an optional picture, and `checklist_ref` (e.g. `§3`). If a seed post already exists for the same item, update it instead of duplicating.
3. **When you finish that feature** — Add a **second** post with `post_type: completed` (“Shipped”) summarizing what landed. Then create a new **in progress** post for the *next* unchecked item only (not all remaining items).
4. **Example timeline:** §3 in progress → ship §3 (completed post) → §4 in progress → ship §4 → §5 in progress …
5. On first deploy with an empty `feature_posts` table, the server seeds the current in-progress post for the next checklist item (see `lib/feature-post-seed.js`). After that, agents maintain posts through the admin UI or API.

Posts support the same emoji reactions as team chat (`love`, `haha`, `fire`, etc.) and registered-user comments.

**Status key** (edit checkboxes as you work)

- `[ ]` Not started · `[~]` In progress · `[x]` Done

**Shared codebase map**

| Area | Paths |
|------|--------|
| API | `routes/*.js`, `middleware/auth.js`, `lib/*` |
| DB | `schema.sql` |
| UI | `public/dashboard.html`, `public/board.html`, `public/direct-chat.js`, `public/api.js` |
| Auth | `routes/auth.js`, `routes/profile.js`, `public/login.html`, `public/register.html` |

---

## 1. Transfer ownership & leave team

**Status:** `[x]` Done

### Goal

- Registered **non-guest** users can **transfer team ownership** to another registered member.
- Registered **members** can **leave** a team voluntarily.
- **Owners cannot leave** until they transfer ownership or delete the team (existing delete stays owner-only).

### Current state (fix these gaps)

- Only owner can remove members (`DELETE /api/teams/:id/members/:uid` in `routes/teams.js`).
- No leave-team endpoint; no ownership transfer.
- Guest-owned teams still block email invites (`owner_is_guest`); transfer must reject guest accounts as new owners.

### Schema / API

- [x] `POST /api/teams/:id/transfer-ownership` — body: `{ user_id }`; caller must be owner; target must be registered member of team, not guest.
- [x] `POST /api/teams/:id/leave` — caller must be `member` (not `owner`); removes `team_members` row; clears pending invites for that user on that team.
- [x] Activity log entries for transfer and leave (`activity_log` via existing `logActivity` in `routes/teams.js`).
- [x] Optional: notify transferred owner in UI (toast + activity).

### UI

- [x] `public/board.html` — Team settings: owner sees “Transfer ownership” (member picker); non-owner members see “Leave team” with confirm modal.
- [x] `public/dashboard.html` — After leave, redirect/update team list without stale cards.

### Acceptance criteria

- [x] Owner who tries `leave` gets clear 400/403 (“Transfer ownership or delete the team first”).
- [x] Guest users cannot transfer or receive ownership.
- [x] After transfer, old owner becomes `member`, new owner is `owner`; invite/settings permissions follow new owner.
- [x] Documented in `FEATURES.md`.

---

## 2. Invite by link & invite-before-register

**Status:** `[x]` Done

### Goal

- Owner generates a **shareable invite link** (tokenized).
- **Unregistered emails** can open link → register → land on team (auto-join or accept pending).
- Fix today’s limitation: invites require an existing `users` row (`routes/teams.js` `POST .../invite`).

### Current state (fix these gaps)

- Invites are `team_invites` keyed by `user_id` only; no link tokens; no post-registration redirect.
- Register flow (`routes/auth.js`, `public/register.html`) has no `?invite=` handling.

### Schema / API

- [x] New table e.g. `team_invite_links` (`id`, `team_id`, `token` unique, `created_by`, `expires_at`, `max_uses`, `use_count`, `revoked_at`).
- [x] `POST /api/teams/:id/invite-links` (owner, non-guest-owned team).
- [x] `DELETE /api/teams/:id/invite-links/:linkId` (revoke).
- [x] `GET /api/invite/:token` — public metadata (team name, avatar; no secrets).
- [x] `POST /api/invite/:token/accept` — authenticated; adds member or completes pending invite.
- [x] On register: if session/cookie stores pending `invite_token`, accept after user row created.
- [x] Rate-limit token validation; tokens are long random (e.g. 32+ bytes hex).

### UI

- [x] Board team panel: “Copy invite link” + expiry/uses (optional).
- [x] `public/register.html` + `public/login.html`: read `?invite=`, show team name, redirect to `/board/:teamId` after auth.

### Acceptance criteria

- [x] Guest-owned teams cannot create invite links (same rule as email invite).
- [x] Expired/revoked/max-used links fail with clear errors.
- [x] Existing email invite flow still works.
- [x] `FEATURES.md` updated.

---

## 3. File/image sharing in team chat & DMs

**Status:** `[x]` Done

### Goal

- Registered users can attach **images** (and optionally PDFs) to **team chat** and **DMs**.
- Strong **abuse limits** (size, count, rate, guest read-only).

### Current state (fix these gaps)

- Task attachments exist (`routes/tasks.js`, bucket `task-files`); chat/DM tables have text only (`team_chat_messages`, `dm_messages`).
- Reuse patterns: `multer`, `message-send-guard`, guest read-only preview on board (see task attachments).

### Schema / API

- [x] `chat_attachments` / `dm_attachments` or polymorphic `message_attachments` (`message_type`, `message_id`, `file_url`, `mime_type`, `file_size`, `uploaded_by`).
- [x] Storage bucket (e.g. `chat-files`) documented in `schema.sql`.
- [x] `POST` message with multipart or separate upload-then-link; max size (e.g. 5–10 MB), allowed MIME whitelist.
- [x] Per-user hourly upload cap; reuse/extend `lib/message-send-guard.js` or new `lib/upload-guard.js`.
- [x] Guests: `GET` only; no upload endpoints (403).

### UI

- [x] `public/board.html` — chat composer attach button; thumbnail + lightbox (reuse attachment preview modal).
- [x] `public/direct-chat.js` — same for DMs.
- [x] Show attachment in message bubble; soft-deleted messages hide or orphan per product decision (document choice).

### Acceptance criteria

- [x] Spam/upload limits return 429 with `retry_after_ms` where applicable (align with `public/api.js` cooldown UI).
- [x] Storage paths are not guessable; auth checked on download if not public bucket.
- [x] `FEATURES.md` lists limits (size, types, guest read-only).

---

## 4. Task checklists + auto-move to Done

**Status:** `[ ]` Not started

### Goal

- Each task can have a **checklist** (sub-items with check state).
- When **all items are checked**, task **status** moves to the team’s **Done** column slug (last column or column flagged `is_done` — decide and document).

### Current state

- No checklist tables; status is a single `tasks.status` slug (`schema.sql`, `routes/tasks.js`).

### Schema / API

- [ ] `task_checklist_items` (`id`, `task_id`, `title`, `is_done`, `position`, `created_at`).
- [ ] CRUD under `/api/tasks/:id/checklist` (members can edit; guests: read-only or no add — match task edit rules).
- [ ] On toggle: if all done → `PATCH` task `status` to done slug; log activity + optional system comment.
- [ ] Unchecking an item does not auto-move out of Done (unless spec’d otherwise — default: no auto-revert).

### UI

- [ ] `public/board.html` task modal — checklist section on Details tab; progress “2/5”.
- [ ] Board card optional mini progress bar.

### Acceptance criteria

- [ ] Done column respects custom kanban (`lib/team-columns.js`, `team_columns` table).
- [ ] Drag-and-drop task still works; checklist changes poll/sync like tasks.
- [ ] `FEATURES.md` updated.

---

## 5. Multiple assignees or role-based assignment

**Status:** `[ ]` Not started

### Goal

- Task can assign **multiple members** and/or a **team custom role** (`team_roles`).
- Tasks visually distinct on the board when **current user** is in assignees or member of assigned role (e.g. body/border color).

### Current state (fix these gaps)

- Single `tasks.assigned_to` UUID (`schema.sql`).
- Assignee dropdowns in `public/board.html`; `team_roles` used for display grouping only.

### Schema / API

- [ ] `task_assignees` (`task_id`, `user_id`) and/or `tasks.assigned_role_id` (nullable FK to `team_roles`).
- [ ] Migrate existing `assigned_to` into `task_assignees` for backward compatibility.
- [ ] `GET /api/teams/:id/tasks` includes assignees + role; PATCH accepts assignee list.
- [ ] Activity log describes multi-assign changes.

### UI

- [ ] Multi-select or chip UI for assignees; role dropdown (optional, owner-configurable?).
- [ ] `renderTaskCard` — if `currentUser` in assignees or in role member list → apply CSS class (e.g. `.task-card--assigned-to-me`).
- [ ] Filters (see §7) can use assignee data.

### Acceptance criteria

- [ ] Guest behavior unchanged (no assign edit if currently restricted).
- [ ] `@mentions` and notifications still coherent.
- [ ] `FEATURES.md` updated.

---

## 6. Board filters & dashboard “My tasks”

**Status:** `[ ]` Not started

### Goal

- On board: filter by **assignee**, **priority**, **due date**, **labels** (requires labels table if not bundled elsewhere).
- On dashboard: **My tasks** across all teams (assigned to me / my roles).

### Current state

- Full task list per team; no client filters; dashboard shows teams only (`public/dashboard.html`).

### Schema / API

- [ ] If labels not implemented: add `task_labels` / `labels` in this item or a prerequisite sub-task.
- [ ] `GET /api/me/tasks?assignee=me&priority=...&due=overdue` (registered only).
- [ ] Board can filter client-side first; server filter optional for scale.

### UI

- [ ] `public/board.html` — filter bar (chips/dropdowns); persist in `sessionStorage` per team.
- [ ] `public/dashboard.html` — “My tasks” section: grouped by team, link to task/board.

### Acceptance criteria

- [ ] Filters compose (assignee + priority + due).
- [ ] Guest sees My tasks only for teams they’re in, with guest edit limits.
- [ ] `FEATURES.md` updated.

---

## 7. List view & calendar view

**Status:** `[ ]` Not started

### Goal

- Besides Kanban: **list view** (sortable table) and **calendar view** (by `due_date`).
- View preference per team per user (localStorage or DB).

### Current state

- Kanban only in `public/board.html`; polling `GET /api/teams/:id/tasks`.

### UI / API

- [ ] View switcher: Board | List | Calendar (owner/member same access).
- [ ] List: columns title, status, priority, due, assignees; click opens task modal.
- [ ] Calendar: month/week; drag to change due date (optional — PATCH `due_date`).
- [ ] Reuse existing task modal and DnD status rules where applicable.

### Acceptance criteria

- [ ] Mobile layout usable; zoom controls don’t break calendar.
- [ ] `FEATURES.md` updated.

---

## 8. Archive vs hard delete

**Status:** `[ ]` Not started

### Goal

- **Archive** tasks (hidden from board, recoverable).
- **Keep hard delete**; delete control lets user choose **Archive** or **Delete permanently**.

### Current state (fix these gaps)

- `DELETE /api/tasks/:id` hard-deletes (`routes/tasks.js`); trash icon in `public/board.html` deletes immediately.

### Schema / API

- [ ] `tasks.archived_at` (nullable timestamptz) or `tasks.is_archived` boolean.
- [ ] `GET` team tasks excludes archived by default; `?include_archived=1` for owners or all members (decide).
- [ ] `POST /api/tasks/:id/archive` and `POST /api/tasks/:id/unarchive`.
- [ ] Keep `DELETE` for permanent removal (owner/member per current rules).

### UI

- [ ] Delete button → menu: Archive / Delete permanently (confirm for delete).
- [ ] Settings or board toggle: “Show archived” + restore action.

### Acceptance criteria

- [ ] Archived tasks don’t appear in default board/list/calendar.
- [ ] Activity log records archive/unarchive/delete separately.
- [ ] `FEATURES.md` updated.

---

## 9. Task templates & bulk actions

**Status:** `[ ]` Not started

### Goal

- **Templates** (per team): title, description, checklist, priority, default labels.
- **Bulk select** on board/list: move column, assign, archive, delete.

### Schema / API

- [ ] `task_templates` (`team_id`, `name`, `payload` JSONB).
- [ ] `POST /api/teams/:id/tasks/from-template/:templateId`.
- [ ] `POST /api/teams/:id/tasks/bulk` — body: `{ task_ids, action, ... }` with validation and activity logs.

### UI

- [ ] Template manager in team settings (owner).
- [ ] Checkbox on cards + bulk action bar.

### Acceptance criteria

- [ ] Bulk respects permissions (guest cannot delete/edit if restricted).
- [ ] `FEATURES.md` updated.

---

## 10. WIP limits & swimlanes (owner toggle)

**Status:** `[ ]` Not started

### Goal

- **WIP limit** per column (optional cap; warn or block drop).
- **Swimlanes** by assignee, priority, or custom role.
- **Default off**; owner enables in team settings.

### Current state

- `teams` has `separate_role_members`; columns in `team_columns` (`routes/columns.js`).

### Schema / API

- [ ] `team_columns.wip_limit` (nullable int); `teams.swimlane_mode` enum (`off`, `assignee`, `priority`, `role`).
- [ ] `PATCH /api/teams/:id/board-settings` (owner only).
- [ ] Server validates move when over WIP (or client-only warn — document choice).

### UI

- [ ] `public/board.html` — render lanes; column header shows `3/5` when WIP set.
- [ ] Settings panel toggles (owner).

### Acceptance criteria

- [ ] Default team behavior unchanged when toggles off.
- [ ] `FEATURES.md` updated.

---

## 11. Forgot password / reset flow

**Status:** `[ ]` Not started

### Goal

- User can request reset email and set a new password via Supabase Auth.

### Current state (fix these gaps)

- No forgot-password UI (`public/login.html`).
- Register uses `email_confirm: true` immediately (`routes/auth.js`); no reset routes.

### Implementation

- [ ] `public/forgot-password.html` + `public/reset-password.html` (or query on login).
- [ ] Use Supabase Auth `resetPasswordForEmail` / `updateUser` with redirect URL configured in Supabase dashboard.
- [ ] `GET /api/auth/config` documents redirect if needed.
- [ ] Do not expose whether email exists (generic success message).

### Acceptance criteria

- [ ] Works for email/password users; OAuth-only users see helpful message.
- [ ] `FEATURES.md` updated.

---

## 12. Email verification flow

**Status:** `[ ]` Not started

### Goal

- New registrations require **verified email** before full access (or grace period).

### Current state (fix these gaps)

- `createUser` sets `email_confirm: true` in `routes/auth.js` (skips verification).

### Implementation

- [ ] Set `email_confirm: false` (or remove override); send Supabase confirmation email.
- [ ] `public/auth-callback.html` / middleware: block or limit session until `email_confirmed_at` set.
- [ ] Resend verification endpoint with rate limit.
- [ ] UI banner on dashboard until verified.

### Acceptance criteria

- [ ] OAuth users treated per Supabase provider rules.
- [ ] Guest path unaffected.
- [ ] `FEATURES.md` updated.

---

## 13. Optional 2FA (default off)

**Status:** `[ ]` Not started

### Goal

- Registered users can enable **TOTP 2FA** (default off).

### Implementation

- [ ] Supabase Auth MFA APIs (enroll, challenge, verify).
- [ ] Profile UI in `public/dashboard.html`; challenge step on login when enabled.
- [ ] Backup codes or recovery flow documented.

### Acceptance criteria

- [ ] 2FA off by default for new and existing users.
- [ ] OAuth + 2FA interaction documented.
- [ ] `FEATURES.md` updated.

---

## 14. Delete account & export my data

**Status:** `[ ]` Not started

### Goal

- User can **export** JSON/CSV of their data and **delete account** (GDPR-style).

### Current state

- Profile update only (`routes/profile.js`); no export/delete.

### Implementation

- [ ] `GET /api/profile/export` — user, teams, tasks assigned/created, messages (bounded), feedback.
- [ ] `POST /api/profile/delete-account` — confirm password; delete/anonymize: reassign or null `created_by`, remove memberships, delete auth user, session destroy.
- [ ] Owner teams: block delete until transfer/delete team, or cascade delete team (document destructive choice).

### UI

- [ ] Profile danger zone in `public/dashboard.html`.

### Acceptance criteria

- [ ] Irreversible delete requires confirmation + password (if applicable).
- [ ] `FEATURES.md` updated.

---

## 15. Analytics (team + platform daily users)

**Status:** `[ ]` Not started

### Goal

- **Per team:** velocity, tasks completed/week, overdue count, member workload.
- **Dashboard (admin):** daily active users (DAU) for the app.

### Schema / API

- [ ] Aggregate from `tasks`, `activity_log`, `team_members` (date ranges, no PII in admin tiles).
- [ ] Optional `daily_active_users` rollup job or query distinct `presence` / session pings (`lib/presence.js`).
- [ ] `GET /api/teams/:id/analytics?from=&to=` (members); `GET /api/admin/analytics` (feedback admin only — tie to env email or role).

### UI

- [ ] Board or dashboard panel: charts (keep vanilla JS or minimal chart lib — justify in PR).
- [ ] Admin-only DAU on dashboard for `FEEDBACK_ADMIN_EMAIL` / env.

### Acceptance criteria

- [ ] Guests don’t see admin metrics.
- [ ] Performance acceptable on Render free tier (limit range, cache).
- [ ] `FEATURES.md` updated.

---

## 16. Export/import team board

**Status:** `[ ]` Not started

### Goal

- **Export** team/board to CSV and JSON.
- **Import** from Trello JSON and/or CSV (column mapping).

### Implementation

- [ ] `GET /api/teams/:id/export?format=json|csv` (member+).
- [ ] `POST /api/teams/:id/import` — multipart; parse; map columns; create tasks (owner only).
- [ ] Idempotency / duplicate handling documented.

### Acceptance criteria

- [ ] Large imports chunked or limited with clear errors.
- [ ] `FEATURES.md` updated.

---

## 17. Activity filters

**Status:** `[ ]` Not started

### Goal

- Activity panel: filter by **user**, **type**, **date range** (not only text search).

### Current state

- `GET /api/teams/:id/activity`; search in `public/board.html` activity panel is text-only.

### Implementation

- [ ] Query params on activity endpoint: `user_id`, `type`, `from`, `to`.
- [ ] UI filters above activity list; combine with existing search.

### Acceptance criteria

- [ ] Pagination or “load more” if result set grows.
- [ ] `FEATURES.md` updated.

---

## 18. Configurable feedback admin via env

**Status:** `[x]` Done

### Goal

- **Single source of truth:** `FEEDBACK_ADMIN_EMAIL` from environment, not hardcoded in client.

### Current state (fix these gaps)

- Server: `lib/constants.js` reads env but defaults to hardcoded email.
- Client: `public/dashboard.html` duplicates `FEEDBACK_ADMIN_EMAIL` constant (line ~1443).
- Docs: `CONTRIBUTING.md` says edit dashboard.html line — **wrong after fix**.

### Implementation

- [x] `.env.example` — `FEEDBACK_ADMIN_EMAIL=you@example.com`
- [x] `lib/constants.js` — `process.env.FEEDBACK_ADMIN_EMAIL || ''` (no personal email in repo).
- [x] `GET /api/me` (and profile responses via `toSessionUser`) return `is_feedback_admin: boolean` (never expose target email to others).
- [x] Remove client-side email string; use API flag for inbox visibility.
- [x] `lib/spam-guard-override.js` uses same env via `lib/feedback-admin.js`.
- [x] Update `CONTRIBUTING.md`, `README.md`, `FEATURES.md` — configure via `.env` only.

### Acceptance criteria

- [x] No hardcoded admin email in `public/` or committed defaults.
- [x] Inbox hidden when env unset.
- [x] Spam bypass only for that admin account.

---

## 19. Pinned messages in team chat

**Status:** `[ ]` Not started

### Goal

- **Multiple pinned** messages per team (list accessible in chat).
- **One highlighted pin** shown under the chat panel title (special slot).

### Schema / API

- [ ] `team_chat_pins` (`team_id`, `message_id`, `pinned_by`, `pinned_at`, `is_banner` boolean — at most one `is_banner` per team).
- [ ] `POST/DELETE /api/teams/:teamId/chat/:messageId/pin`; set banner pin.
- [ ] Permissions: owner or message author (decide — document).

### UI

- [ ] `public/board.html` — banner under “Team Chat” header; “Pinned” drawer/list; pin/unpin on message menu.

### Acceptance criteria

- [ ] Deleted messages auto-unpin or show “message unavailable”.
- [ ] `FEATURES.md` updated.

---

## 20. i18n (US default, PH, EU, JPN)

**Status:** `[ ]` Not started

### Goal

- UI strings and **date/number formatting** for locales: **en-US** (default), **fil-PH**, **en-EU** (or `de-DE`/`fr-FR` — pick one EU bundle), **ja-JP**.

### Implementation

- [ ] Lightweight dictionary in `public/i18n/` or `lib/i18n/` + `data-locale` on `<html>`.
- [ ] Profile or header locale selector; persist `localStorage` + optional `users.locale`.
- [ ] Wrap user-visible strings incrementally (dashboard, board, login); use `Intl.DateTimeFormat` for dates.
- [ ] Do not translate user-generated content (tasks, chat).

### Acceptance criteria

- [ ] Default en-US if missing keys.
- [ ] No breaking change to API field names (still English keys).
- [ ] `FEATURES.md` lists supported locales.

---

## Suggested implementation order

Dependencies are loose; recommended sequence for fewer conflicts:

1. **§18** Feedback admin env (small, unblocks ops)
2. **§1** Ownership transfer / leave
3. **§2** Invite links
4. **§8** Archive
5. **§4** Checklists
6. **§5** Multi-assignee → **§6** Filters → **§7** Views
7. **§3** Chat attachments
8. **§11–14** Auth/account features
9. **§9–10** Templates, bulk, WIP, swimlanes
10. **§15–17** Analytics, import/export, activity filters
11. **§19–20** Pins, i18n

---

## PR checklist (every agent)

- [ ] One feature section above per PR.
- [ ] `FEATURES.md` updated.
- [ ] `schema.sql` updated + migration note in PR description if production DB exists.
- [ ] **Roadmap posts:** completed post for this feature + new in-progress post for the next item only (see **Dashboard roadmap posts** above).
- [ ] Manual test steps in PR description.
- [ ] No unrelated refactors; match existing Express + vanilla JS patterns.
