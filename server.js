require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const PgSession = require('connect-pg-simple')(session);
const { createSessionPool } = require('./lib/pg-session-pool');

const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const taskRoutes = require('./routes/tasks');
const columnRoutes = require('./routes/columns');
const profileRoutes = require('./routes/profile');
const chatRoutes = require('./routes/chat');
const dmChatRoutes = require('./routes/dm-chat');
const dmSettingsRoutes = require('./routes/dm-settings');
const { router: reactionRoutes } = require('./routes/reactions');
const feedbackRoutes = require('./routes/feedback');
const inviteLinkRoutes = require('./routes/invite-links');
const featurePostRoutes = require('./routes/feature-posts');
const messageAttachmentRoutes = require('./routes/message-attachments');
const tasksplitRoutes = require('./routes/tasksplit');
const { ensureFeaturePostSeed } = require('./lib/feature-post-seed');
const { supabaseAdmin } = require('./lib/supabase');
const { toSessionUser } = require('./lib/user');
const { requireAuth } = require('./middleware/auth');

const app = express();

// ── Timing helper ────────────────────────────────────────────────────────────
const t0 = Date.now();
function elapsed() { return `+${Date.now() - t0}ms`; }
function log(label) { console.log(`[startup] ${elapsed().padEnd(8)} ${label}`); }
// ─────────────────────────────────────────────────────────────────────────────

log('imports resolved');

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Fix 2: lazy session pool — created once on first request, not at boot ────
let sessionPoolPromise = null;
function getSessionPool() {
  if (!sessionPoolPromise) {
    const sessionDbUrl = process.env.SESSION_DATABASE_URL || process.env.DATABASE_URL;
    sessionPoolPromise = createSessionPool(sessionDbUrl);
  }
  return sessionPoolPromise;
}

async function start() {
  log('start() called');

  // ── Fix 2: resolve pool lazily so it doesn't block server start ─────────
  const sessionPool = await getSessionPool();
  log('session pool ready');

  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionPool ? new PgSession({
      pool: sessionPool,
      tableName: 'session',
      createTableIfMissing: true,
    }) : undefined,
    cookie: {
      secure: 'auto',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));
  log('session middleware mounted');

  // Health check
  app.get('/health', async (req, res) => {
    const { error } = await supabaseAdmin
      .from('_health_ping')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    const dbOk = !error || error.code === 'PGRST205';

    if (!dbOk) {
      return res.status(503).json({
        status: 'degraded',
        db: 'error',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      status: 'ok',
      db: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Routes
  log('mounting routes…');
  app.use(authRoutes);
  app.use(teamRoutes);
  app.use(taskRoutes);
  app.use(columnRoutes);
  app.use(profileRoutes);
  app.use(chatRoutes);
  app.use(dmChatRoutes);
  app.use(dmSettingsRoutes);
  app.use(reactionRoutes);
  app.use(feedbackRoutes);
  app.use(inviteLinkRoutes);
  app.use(featurePostRoutes);
  app.use(messageAttachmentRoutes);
  app.use(tasksplitRoutes);
  log('all routes mounted');

  app.get('/features.md', (req, res) => {
    res.sendFile(path.join(__dirname, 'FEATURES.md'));
  });

  app.get('/favicon.ico', (req, res) => {
    res.redirect(301, '/favicon.svg');
  });

  // Pages
  app.get('/', (req, res) => {
    if (req.session?.user) return res.redirect('/dashboard');
    res.redirect('/login');
  });

  app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile('dashboard.html', { root: './public' });
  });

  app.get('/board/:teamId', requireAuth, (req, res) => {
    res.redirect(301, `/taskflow/${req.params.teamId}`);
  });

  app.get('/taskflow/:teamId', requireAuth, (req, res) => {
    res.sendFile('taskflow.html', { root: './public' });
  });

  app.get('/tasksplit/:teamId', requireAuth, (req, res) => {
    res.sendFile('tasksplit.html', { root: './public' });
  });

  // API: current user
  app.get('/api/me', requireAuth, async (req, res) => {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, email, avatar_color, avatar_url')
      .eq('id', req.session.user.id)
      .single();
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
    req.session.user = toSessionUser(user);
    res.json(req.session.user);
  });

  const PORT = process.env.PORT || 3000;

  // ── Fix 1: listen first, seed in background ──────────────────────────────
  app.listen(PORT, () => {
    log(`server listening on port ${PORT}`);
    console.log(`[startup] ── total startup time: ${Date.now() - t0}ms ──`);
    console.log(`TaskFlow running on port ${PORT}`);

    log('running ensureFeaturePostSeed in background…');
    ensureFeaturePostSeed()
      .then(() => log('ensureFeaturePostSeed done (background)'))
      .catch((err) => console.error('[startup] seed error:', err));
  });
}

start().catch((err) => {
  console.error(`[startup] FATAL ${elapsed()}`, err);
  process.exit(1);
});
