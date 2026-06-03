const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase, supabaseAdmin } = require('../lib/supabase');
const { redirectIfAuth } = require('../middleware/auth');
const { toSessionUser, randomColor } = require('../lib/user');
const { ensureAppUser } = require('../lib/auth-user');
const { MIN_PASSWORD_LENGTH } = require('../lib/constants');
const { formatAuthError, sendError } = require('../lib/errors');
const router = express.Router();

// GET /api/auth/config — public Supabase keys for client OAuth
router.get('/api/auth/config', (req, res) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: 'Authentication is not configured' });
  }
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// GET /login
router.get('/login', redirectIfAuth, (req, res) => {
  res.sendFile('login.html', { root: './public' });
});

// GET /register
router.get('/register', redirectIfAuth, (req, res) => {
  res.sendFile('register.html', { root: './public' });
});

// GET /auth/callback — OAuth redirect target
router.get('/auth/callback', redirectIfAuth, (req, res) => {
  res.sendFile('auth-callback.html', { root: './public' });
});

// POST /api/auth/register
router.post('/api/auth/register', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (username.length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  }
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (existingUser) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });

  if (authError) return sendError(res, 400, authError, 'auth');

  const authUser = authData.user;
  const { data: appUser, error: dbError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authUser.id,
      auth_id: authUser.id,
      username,
      email,
      password_hash: null,
      avatar_color: randomColor(),
    })
    .select()
    .single();

  if (dbError) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    return sendError(res, 400, dbError, 'save');
  }

  req.session.user = toSessionUser(appUser);
  res.json({ success: true });
});

// POST /api/auth/login
router.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (!authError && authData?.user) {
    try {
      const appUser = await ensureAppUser(authData.user);
      req.session.user = toSessionUser(appUser);
      return res.json({ success: true });
    } catch (err) {
      return sendError(res, 500, err, 'save');
    }
  }

  // Legacy accounts created before Supabase Auth (bcrypt-only)
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (!user?.password_hash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  req.session.user = toSessionUser(user);
  res.json({ success: true });
});

// POST /api/auth/oauth — exchange Supabase session for app session
router.post('/api/auth/oauth', async (req, res) => {
  const access_token = req.body?.access_token;
  const refresh_token = req.body?.refresh_token;

  if (!access_token) {
    return res.status(400).json({ error: 'Sign-in session expired. Please try again' });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(access_token);
  if (userError || !userData?.user) {
    return sendError(res, 401, userError || { message: 'invalid' }, 'auth');
  }

  try {
    const appUser = await ensureAppUser(userData.user);
    req.session.user = toSessionUser(appUser);
    res.json({ success: true });
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// POST /api/auth/guest
router.post('/api/auth/guest', async (req, res) => {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', 'guest@taskflow.app')
    .single();

  if (!user) return res.status(500).json({ error: 'Guest account not available' });

  req.session.user = toSessionUser(user);
  res.json({ success: true });
});

// POST /api/auth/logout
router.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

module.exports = router;
