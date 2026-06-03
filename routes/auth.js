const express = require('express');
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../lib/supabase');
const { redirectIfAuth } = require('../middleware/auth');
const { toSessionUser } = require('../lib/user');
const router = express.Router();

// GET /login
router.get('/login', redirectIfAuth, (req, res) => {
  res.sendFile('login.html', { root: './public' });
});

// GET /register
router.get('/register', redirectIfAuth, (req, res) => {
  res.sendFile('register.html', { root: './public' });
});

// POST /api/auth/register
router.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });

  const hashed = await bcrypt.hash(password, 10);
  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({ username, email, password_hash: hashed, avatar_color: randomColor() })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  req.session.user = toSessionUser(data);
  res.json({ success: true });
});

// POST /api/auth/login
router.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'All fields required' });

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.user = toSessionUser(user);
  res.json({ success: true });
});

// POST /api/auth/guest
router.post('/api/auth/guest', async (req, res) => {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', 'guest@taskflow.app')
    .single();

  if (!user) return res.status(500).json({ error: 'Guest account not found' });

  req.session.user = toSessionUser(user);
  res.json({ success: true });
});

// POST /api/auth/logout
router.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

function randomColor() {
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
  return colors[Math.floor(Math.random() * colors.length)];
}

module.exports = router;
