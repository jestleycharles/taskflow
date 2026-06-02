require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const taskRoutes = require('./routes/tasks');
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

// API: current user
app.get('/api/me', requireAuth, (req, res) => {
  res.json(req.session.user);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TaskFlow running on port ${PORT}`));
