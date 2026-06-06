const express = require('express');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { getAttachmentWithAccess } = require('../lib/message-attachments');

const router = express.Router();

// GET /api/message-attachments/:id — auth-checked redirect to file (members / DM participants)
router.get('/api/message-attachments/:id', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const result = await getAttachmentWithAccess(req.params.id, userId);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  res.redirect(302, result.attachment.file_url);
});

module.exports = router;
