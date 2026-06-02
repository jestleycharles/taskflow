require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const taskRoutes = require('./routes/tasks');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

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
app.listen(PORT, () => console.log(`TaskFlow running on http://localhost:${PORT}`));
