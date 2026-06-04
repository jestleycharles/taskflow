# Contributing to TaskFlow

Thank you for your interest in TaskFlow. This project welcomes bug fixes, documentation improvements, and feature contributions from the community.

## Before you start

1. Read the [README](README.md) for setup and architecture.
2. Review [FEATURES.md](FEATURES.md) for guest vs registered behavior and team owner/member permissions.
3. Run `schema.sql` in your Supabase project if you are setting up a fresh database.

## Development setup

```bash
git clone <your-fork-url>
cd taskflow
npm install
cp .env.example .env
# Fill in Supabase URL, anon key, service role key, and SESSION_SECRET
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Project API URL |
| `SUPABASE_ANON_KEY` | OAuth in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database access (keep secret) |
| `SESSION_SECRET` | Express session signing |
| `TURNSTILE_*` | Optional; guest feedback captcha in production |

### Database

- Apply [schema.sql](schema.sql) in the Supabase SQL Editor.
- Create a public Storage bucket named **`avatars`** for profile and team images.
- Enable Auth providers you need (Email, Google, GitHub).
- Ensure the guest user exists (`guest@taskflow.app`) — `schema.sql` seeds this row.

## Project layout

| Path | Role |
|------|------|
| `server.js` | Express app, static files, sessions |
| `routes/` | REST API handlers |
| `lib/` | Supabase client, guards, presence, shared logic |
| `middleware/auth.js` | Session authentication |
| `public/` | HTML/CSS/JS frontend (do not remove) |

## How to contribute

### Reporting bugs

- Search existing issues first.
- Include steps to reproduce, expected vs actual behavior, and browser/OS if relevant.
- Screenshots or console/network errors help.

### Suggesting features

- Open an issue describing the problem you want to solve and who benefits (guest, member, owner).
- Check [FEATURES.md](FEATURES.md) so the suggestion does not duplicate existing behavior.

### Pull requests

1. Fork the repository and create a branch from `main` (or the default branch).
2. Keep changes focused — one logical change per PR when possible.
3. Match existing code style (CommonJS, Express patterns, vanilla JS in `public/`).
4. Test locally: login, guest flow, create team, board CRUD, chat/DM if your change touches them.
5. Update [FEATURES.md](FEATURES.md) if user-visible behavior or permissions change.
6. Update [schema.sql](schema.sql) if you add or change database tables or columns.
7. Open a PR with a clear title and description of **what** and **why**.

### Code guidelines

- Prefer extending existing helpers in `lib/` over duplicating logic in routes.
- Permission checks belong on the server (`routes/`), not only in the UI.
- Guest restrictions: use `isGuestUser()` from `lib/user.js` on the API; mirror in HTML/JS where needed.
- Avoid committing secrets (`.env`, service role keys, session secrets).
- Comments only for non-obvious business rules; let code stay readable.

### Documentation

- User-facing behavior → [FEATURES.md](FEATURES.md)
- Setup and overview → [README.md](README.md)
- Database → [schema.sql](schema.sql)

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE), the same license as the project.

## Questions

Open a GitHub issue for questions that are not security-sensitive. Do not post production credentials or service role keys in issues or PRs.
