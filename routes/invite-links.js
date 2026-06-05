const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { checkInviteTokenRateLimit } = require('../lib/invite-token-guard');
const {
  validateTokenFormat,
  getInvitePublicMeta,
  acceptInviteLink,
} = require('../lib/invite-links');

const router = express.Router();

// GET /api/invite/:token — public team metadata for invite link
router.get('/api/invite/:token', async (req, res) => {
  const rate = checkInviteTokenRateLimit(req);
  if (!rate.ok) {
    return res.status(429).json({
      error: 'Too many requests. Try again shortly.',
      retry_after_ms: rate.retry_after_ms,
    });
  }

  try {
    const result = await getInvitePublicMeta(req.params.token);
    return res.status(result.status).json(
      result.status === 200
        ? {
            team: result.team,
            expires_at: result.expires_at,
            uses_remaining: result.uses_remaining,
          }
        : { error: result.error }
    );
  } catch (err) {
    console.error('[invite-links] GET meta', err);
    return res.status(500).json({ error: 'Could not load invite' });
  }
});

// POST /api/invite/pending — store token in session before register/login
router.post('/api/invite/pending', async (req, res) => {
  const rate = checkInviteTokenRateLimit(req);
  if (!rate.ok) {
    return res.status(429).json({
      error: 'Too many requests. Try again shortly.',
      retry_after_ms: rate.retry_after_ms,
    });
  }

  const token = String(req.body?.token || '').trim();
  if (!validateTokenFormat(token)) {
    return res.status(400).json({ error: 'Invalid invite link' });
  }

  try {
    const result = await getInvitePublicMeta(token);
    if (result.status !== 200) {
      return res.status(result.status).json({ error: result.error });
    }

    req.session.pending_invite_token = token;
    res.json({ success: true, team: result.team });
  } catch (err) {
    console.error('[invite-links] pending', err);
    res.status(500).json({ error: 'Could not save invite' });
  }
});

// POST /api/invite/:token/accept — authenticated user joins team
router.post('/api/invite/:token/accept', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const username = req.session.user.username;

  try {
    const result = await acceptInviteLink({
      token: req.params.token,
      userId,
      username,
    });

    if (result.success) {
      delete req.session.pending_invite_token;
      return res.json({ success: true, team_id: result.team_id });
    }

    return res.status(result.status).json({
      error: result.error,
      ...(result.team_id ? { team_id: result.team_id } : {}),
    });
  } catch (err) {
    console.error('[invite-links] accept', err);
    res.status(500).json({ error: 'Could not accept invite' });
  }
});

module.exports = router;
