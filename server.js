require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const taskRoutes = require('./routes/tasks');
const profileRoutes = require('./routes/profile');
const chatRoutes = require('./routes/chat');
const dmChatRoutes = require('./routes/dm-chat');
const dmSettingsRoutes = require('./routes/dm-settings');
const { router: reactionRoutes } = require('./routes/reactions');
const { supabaseAdmin } = require('./lib/supabase');
const { toSessionUser } = require('./lib/user');
const { requireAuth } = require('./middleware/auth');

const app = express();

// Render terminates TLS at the edge; without this, secure session cookies are never set.
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use(authRoutes);
app.use(teamRoutes);
app.use(taskRoutes);
app.use(profileRoutes);
app.use(chatRoutes);
app.use(dmChatRoutes);
app.use(dmSettingsRoutes);
app.use(reactionRoutes);

// Pages
app.get('/', (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile('dashboard.html', { root: './public' });
});

app.get('/board/:teamId', requireAuth, (req, res) => {
  res.sendFile('board.html', { root: './public' });
});

// API: current user (refreshed from DB for avatar_url etc.)
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
app.listen(PORT, () => console.log(`TaskFlow running on port ${PORT}`));
