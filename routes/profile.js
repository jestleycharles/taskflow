const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { supabase, supabaseAdmin } = require('../lib/supabase');
const { MIN_PASSWORD_LENGTH } = require('../lib/constants');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const {
  AVATAR_PRESETS,
  isGuestUser,
  toSessionUser,
  isStorageAvatarUrl,
} = require('../lib/user');

const router = express.Router();
const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES },
});

function requireRegistered(req, res, next) {
  if (isGuestUser(req.session.user)) {
    return res.status(403).json({ error: 'Guest accounts cannot edit profile' });
  }
  next();
}

async function deleteStoredAvatars(userId) {
  const { data: files } = await supabaseAdmin.storage.from(AVATAR_BUCKET).list(String(userId));
  if (!files?.length) return;
  const paths = files.map((f) => `${userId}/${f.name}`);
  await supabaseAdmin.storage.from(AVATAR_BUCKET).remove(paths);
}

async function refreshSessionUser(req) {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, username, email, avatar_color, avatar_url')
    .eq('id', req.session.user.id)
    .single();
  if (error || !user) return null;
  req.session.user = toSessionUser(user);
  return req.session.user;
}

// GET /api/profile/avatars — preset list
router.get('/api/profile/avatars', requireAuth, (req, res) => {
  res.json(AVATAR_PRESETS);
});

// PATCH /api/profile — username, email, password
router.patch('/api/profile', requireAuth, requireRegistered, async (req, res) => {
  const userId = req.session.user.id;
  const { username, email, current_password, new_password } = req.body || {};

  const { data: user, error: fetchErr } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (fetchErr || !user) return res.status(404).json({ error: 'User not found' });

  const updates = {};

  if (username !== undefined) {
    const trimmed = String(username).trim();
    if (!trimmed || trimmed.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }
    if (trimmed !== user.username) {
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', trimmed)
        .neq('id', userId)
        .maybeSingle();
      if (existing) return res.status(400).json({ error: 'Username already taken' });
      updates.username = trimmed;
    }
  }

  if (email !== undefined) {
    const trimmed = String(email).trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    if (trimmed !== user.email) {
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', trimmed)
        .neq('id', userId)
        .maybeSingle();
      if (existing) return res.status(400).json({ error: 'Email already in use' });
      updates.email = trimmed;
    }
  }

  if (new_password) {
    if (String(new_password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const hasLegacyPassword = !!user.password_hash;
    const targetAuthId = user.auth_id || user.id;

    if (user.auth_id || !hasLegacyPassword) {
      let needsCurrent = hasLegacyPassword;
      if (user.auth_id && !needsCurrent) {
        const { data: authRow } = await supabaseAdmin.auth.admin.getUserById(user.auth_id);
        const providers = (authRow?.user?.identities || []).map((i) => i.provider);
        needsCurrent = providers.includes('email');
      }

      if (needsCurrent) {
        if (!current_password) {
          return res.status(400).json({ error: 'Current password required to set a new password' });
        }
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: current_password,
        });
        if (signInErr) return res.status(400).json({ error: 'Current password is incorrect' });
      }

      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(targetAuthId, {
        password: new_password,
      });
      if (pwErr) return sendError(res, 400, pwErr, 'auth');
      if (hasLegacyPassword) updates.password_hash = null;
    } else {
      if (!current_password) {
        return res.status(400).json({ error: 'Current password required to set a new password' });
      }
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
      updates.password_hash = await bcrypt.hash(new_password, 10);
    }
  }

  if (!Object.keys(updates).length) {
    const sessionUser = await refreshSessionUser(req);
    return res.json({ user: sessionUser });
  }

  const { error: updateErr } = await supabaseAdmin.from('users').update(updates).eq('id', userId);
  if (updateErr) return sendError(res, 400, updateErr, 'save');

  const sessionUser = await refreshSessionUser(req);
  res.json({ user: sessionUser });
});

// PUT /api/profile/avatar/preset
router.put('/api/profile/avatar/preset', requireAuth, requireRegistered, async (req, res) => {
  const { preset } = req.body || {};
  const match = AVATAR_PRESETS.find((p) => p.id === preset);
  if (!match) return res.status(400).json({ error: 'Invalid avatar preset' });

  const userId = req.session.user.id;
  const currentUrl = req.session.user.avatar_url;

  if (isStorageAvatarUrl(currentUrl)) {
    await deleteStoredAvatars(userId);
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ avatar_url: match.url })
    .eq('id', userId);

  if (error) return sendError(res, 400, error, 'save');

  const sessionUser = await refreshSessionUser(req);
  res.json({ user: sessionUser });
});

function avatarUpload(req, res, next) {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image must be 2 MB or smaller' });
      }
      return sendError(res, 400, err, 'save');
    }
    next();
  });
}

// POST /api/profile/avatar/upload
router.post(
  '/api/profile/avatar/upload',
  requireAuth,
  requireRegistered,
  avatarUpload,
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    if (!ALLOWED_MIME.has(req.file.mimetype)) {
      return res.status(400).json({ error: 'Image must be JPEG, PNG, WebP, or GIF' });
    }

    const userId = req.session.user.id;
    const ext = path.extname(req.file.originalname).toLowerCase() || mimeToExt(req.file.mimetype);
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : mimeToExt(req.file.mimetype);
    const storagePath = `${userId}/${Date.now()}${safeExt}`;

    await deleteStoredAvatars(userId);

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadErr) {
      return res.status(500).json({
        error: uploadErr.message || 'Upload failed. Ensure the avatars storage bucket exists.',
      });
    }

    const { data: urlData } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
    const avatarUrl = urlData.publicUrl;

    const { error: dbErr } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', userId);

    if (dbErr) return sendError(res, 400, dbErr, 'save');

    const sessionUser = await refreshSessionUser(req);
    res.json({ user: sessionUser });
  }
);

function mimeToExt(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[mime] || '.jpg';
}

module.exports = router;
