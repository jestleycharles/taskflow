const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { isGuestUser } = require('../lib/user');
const {
  normalizeEmail,
  getBlockedEmails,
  addBlockedEmail,
  removeBlockedEmail,
  blockUser,
  unblockUserById,
  ignoreUser,
  unignoreUser,
  getDmSettings,
} = require('../lib/dm-blocks');

const router = express.Router();
const USER_PUBLIC_SELECT = 'id, username, email, avatar_color, avatar_url';

function rejectGuest(req, res) {
  if (isGuestUser(req.session.user)) {
    res.status(403).json({ error: 'Direct messages are only available for registered accounts' });
    return true;
  }
  return false;
}

async function findRegisteredUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select(USER_PUBLIC_SELECT)
    .eq('email', normalized)
    .maybeSingle();
  return data || null;
}

// GET /api/dm/settings
router.get('/api/dm/settings', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;
  try {
    const settings = await getDmSettings(req.session.user.id);
    res.json(settings);
  } catch (err) {
    return sendError(res, 500, err, 'load');
  }
});

// GET /api/dm/blocked-emails
router.get('/api/dm/blocked-emails', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;
  try {
    const emails = await getBlockedEmails(req.session.user.id);
    res.json({ emails });
  } catch (err) {
    return sendError(res, 500, err, 'load');
  }
});

// POST /api/dm/blocked-emails
router.post('/api/dm/blocked-emails', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Email is required' });
  if (email === normalizeEmail(req.session.user.email)) {
    return res.status(400).json({ error: 'You cannot block your own email' });
  }
  try {
    await addBlockedEmail(req.session.user.id, email);
    const emails = await getBlockedEmails(req.session.user.id);
    res.json({ emails });
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// DELETE /api/dm/blocked-emails
router.delete('/api/dm/blocked-emails', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;
  const email = normalizeEmail(req.body?.email || req.query?.email);
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    await removeBlockedEmail(req.session.user.id, email);
    const target = await findRegisteredUserByEmail(email);
    if (target) {
      await unblockUserById(req.session.user.id, target.id);
    }
    const emails = await getBlockedEmails(req.session.user.id);
    res.json({ emails });
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// POST /api/dm/users/:userId/block
router.post('/api/dm/users/:userId/block', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;
  const blockerId = req.session.user.id;
  const blockedUserId = req.params.userId;
  if (String(blockerId) === String(blockedUserId)) {
    return res.status(400).json({ error: 'You cannot block yourself' });
  }
  const { data: target } = await supabaseAdmin
    .from('users')
    .select(USER_PUBLIC_SELECT)
    .eq('id', blockedUserId)
    .maybeSingle();
  if (!target) return res.status(404).json({ error: 'User not found' });
  try {
    await blockUser(blockerId, blockedUserId, target.email);
    const settings = await getDmSettings(blockerId);
    res.json(settings);
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// DELETE /api/dm/users/:userId/block
router.delete('/api/dm/users/:userId/block', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;
  const blockerId = req.session.user.id;
  const blockedUserId = req.params.userId;
  const { data: target } = await supabaseAdmin
    .from('users')
    .select('email')
    .eq('id', blockedUserId)
    .maybeSingle();
  try {
    await unblockUserById(blockerId, blockedUserId);
    if (target?.email) await removeBlockedEmail(blockerId, target.email);
    const settings = await getDmSettings(blockerId);
    res.json(settings);
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// POST /api/dm/users/:userId/ignore
router.post('/api/dm/users/:userId/ignore', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;
  const userId = req.session.user.id;
  const ignoredUserId = req.params.userId;
  if (String(userId) === String(ignoredUserId)) {
    return res.status(400).json({ error: 'You cannot ignore yourself' });
  }
  try {
    await ignoreUser(userId, ignoredUserId);
    const settings = await getDmSettings(userId);
    res.json(settings);
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

// DELETE /api/dm/users/:userId/ignore
router.delete('/api/dm/users/:userId/ignore', requireAuth, async (req, res) => {
  if (rejectGuest(req, res)) return;
  const userId = req.session.user.id;
  const ignoredUserId = req.params.userId;
  try {
    await unignoreUser(userId, ignoredUserId);
    const settings = await getDmSettings(userId);
    res.json(settings);
  } catch (err) {
    return sendError(res, 500, err, 'save');
  }
});

module.exports = router;
