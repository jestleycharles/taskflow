const express = require('express');
const path = require('path');
const multer = require('multer');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { isFeedbackAdmin } = require('../lib/feedback-admin');
const { isGuestUser } = require('../lib/user');
const {
  fetchReactionsForMessages,
  attachReactionsToItems,
} = require('../lib/reactions');
const { deleteStoredPostImages } = require('../lib/storage-cleanup');
const { stripHtml, sanitizeRichTextHtml } = require('../lib/rich-text');

const router = express.Router();

const POST_IMAGE_BUCKET = 'feature-posts';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TITLE_LEN = 200;
const MAX_CAPTION_LEN = 5000;
const MAX_COMMENT_LEN = 2000;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

const POST_SELECT =
  'id, title, caption, image_url, post_type, created_at, updated_at, author:created_by(id, username, avatar_color, avatar_url)';

function requirePostAdmin(req, res, next) {
  if (!isFeedbackAdmin(req.session.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function requireRegistered(req, res, next) {
  if (isGuestUser(req.session.user)) {
    return res.status(403).json({ error: 'Guest accounts cannot comment on roadmap posts' });
  }
  next();
}

function imageUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Image must be 5 MB or smaller' });
      }
      return sendError(res, 400, err, 'save');
    }
    next();
  });
}

function mimeToExt(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[mime] || '.jpg';
}

async function uploadPostImage(postId, file) {
  const ext = path.extname(file.originalname).toLowerCase() || mimeToExt(file.mimetype);
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)
    ? ext
    : mimeToExt(file.mimetype);
  const storagePath = `posts/${postId}/${Date.now()}${safeExt}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(POST_IMAGE_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });

  if (uploadErr) {
    throw new Error(uploadErr.message || 'Image upload failed');
  }

  const { data: urlData } = supabaseAdmin.storage.from(POST_IMAGE_BUCKET).getPublicUrl(storagePath);
  return urlData.publicUrl;
}

function parsePostFields(body) {
  const title = String(body?.title || '').trim();
  const caption = sanitizeRichTextHtml(String(body?.caption || '').trim());
  const postType = body?.post_type === 'completed' ? 'completed' : 'in_progress';
  const imageUrl = String(body?.image_url || '').trim() || null;
  return { title, caption, postType, imageUrl };
}

function validatePostFields({ title, caption }) {
  const captionLen = stripHtml(caption).length;
  if (title.length < 3) return 'Title must be at least 3 characters';
  if (title.length > MAX_TITLE_LEN) return `Title must be ${MAX_TITLE_LEN} characters or fewer`;
  if (captionLen < 10) return 'Caption must be at least 10 characters';
  if (captionLen > MAX_CAPTION_LEN) return `Caption must be ${MAX_CAPTION_LEN} characters or fewer`;
  return null;
}

async function fetchPostById(id) {
  const { data, error } = await supabaseAdmin
    .from('feature_posts')
    .select(POST_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function attachReactionsAndCounts(posts) {
  const ids = posts.map((p) => p.id);
  const reactionsMap = await fetchReactionsForMessages('feature_post', ids);

  const { data: commentRows } = await supabaseAdmin
    .from('feature_post_comments')
    .select('post_id')
    .in('post_id', ids);

  const commentCounts = new Map();
  for (const row of commentRows || []) {
    commentCounts.set(row.post_id, (commentCounts.get(row.post_id) || 0) + 1);
  }

  return posts.map((post) => ({
    ...post,
    reactions: reactionsMap.get(post.id) || [],
    comment_count: commentCounts.get(post.id) || 0,
  }));
}

// GET /api/feature-posts — roadmap feed (all signed-in users)
router.get('/api/feature-posts', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('feature_posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false });

  if (error) return sendError(res, 500, error, 'load');

  const posts = await attachReactionsAndCounts(data || []);
  res.json({ posts, is_admin: isFeedbackAdmin(req.session.user) });
});

// POST /api/feature-posts — create post (feedback admin only)
router.post(
  '/api/feature-posts',
  requireAuth,
  requirePostAdmin,
  imageUpload,
  async (req, res) => {
    const fields = parsePostFields(req.body);
    const validationError = validatePostFields(fields);
    if (validationError) return res.status(400).json({ error: validationError });

    const { data: inserted, error } = await supabaseAdmin
      .from('feature_posts')
      .insert({
        title: fields.title,
        caption: fields.caption,
        post_type: fields.postType,
        image_url: fields.imageUrl,
        created_by: req.session.user.id,
      })
      .select('id')
      .single();

    if (error) return sendError(res, 500, error, 'save');

    let imageUrl = fields.imageUrl;
    if (req.file) {
      if (!ALLOWED_IMAGE_MIME.has(req.file.mimetype)) {
        await supabaseAdmin.from('feature_posts').delete().eq('id', inserted.id);
        return res.status(400).json({ error: 'Image must be JPEG, PNG, WebP, or GIF' });
      }
      try {
        imageUrl = await uploadPostImage(inserted.id, req.file);
      } catch (uploadErr) {
        await supabaseAdmin.from('feature_posts').delete().eq('id', inserted.id);
        return res.status(500).json({ error: uploadErr.message });
      }
      await supabaseAdmin.from('feature_posts').update({ image_url: imageUrl }).eq('id', inserted.id);
    }

    const post = await fetchPostById(inserted.id);
    const [withMeta] = await attachReactionsAndCounts([post]);
    res.json(withMeta);
  }
);

// PATCH /api/feature-posts/:id — update post (feedback admin only)
router.patch(
  '/api/feature-posts/:id',
  requireAuth,
  requirePostAdmin,
  imageUpload,
  async (req, res) => {
    const { id } = req.params;
    const existing = await fetchPostById(id);
    if (!existing) return res.status(404).json({ error: 'Post not found' });

    const fields = parsePostFields({
      title: req.body?.title ?? existing.title,
      caption: req.body?.caption ?? existing.caption,
      post_type: req.body?.post_type ?? existing.post_type,
      image_url: req.body?.image_url ?? existing.image_url,
    });
    const validationError = validatePostFields(fields);
    if (validationError) return res.status(400).json({ error: validationError });

    let imageUrl = fields.imageUrl;
    if (req.file) {
      if (!ALLOWED_IMAGE_MIME.has(req.file.mimetype)) {
        return res.status(400).json({ error: 'Image must be JPEG, PNG, WebP, or GIF' });
      }
      try {
        imageUrl = await uploadPostImage(id, req.file);
      } catch (uploadErr) {
        return res.status(500).json({ error: uploadErr.message });
      }
    }

    const { error } = await supabaseAdmin
      .from('feature_posts')
      .update({
        title: fields.title,
        caption: fields.caption,
        post_type: fields.postType,
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) return sendError(res, 500, error, 'save');

    if (req.file) {
      await deleteStoredPostImages(id, imageUrl);
    }

    const post = await fetchPostById(id);
    const [withMeta] = await attachReactionsAndCounts([post]);
    res.json(withMeta);
  }
);

// DELETE /api/feature-posts/:id — delete post (feedback admin only)
router.delete('/api/feature-posts/:id', requireAuth, requirePostAdmin, async (req, res) => {
  const { id } = req.params;
  const existing = await fetchPostById(id);
  if (!existing) return res.status(404).json({ error: 'Post not found' });

  const { error } = await supabaseAdmin.from('feature_posts').delete().eq('id', id);
  if (error) return sendError(res, 500, error, 'save');

  await deleteStoredPostImages(id);
  res.json({ success: true });
});

// GET /api/feature-posts/:id/comments
router.get('/api/feature-posts/:id/comments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const post = await fetchPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { data, error } = await supabaseAdmin
    .from('feature_post_comments')
    .select('id, post_id, content, created_at, user:user_id(id, username, avatar_color, avatar_url)')
    .eq('post_id', id)
    .order('created_at', { ascending: true });

  if (error) return sendError(res, 500, error, 'load');
  res.json(data || []);
});

// POST /api/feature-posts/:id/comments — registered users only
router.post('/api/feature-posts/:id/comments', requireAuth, requireRegistered, async (req, res) => {
  const { id } = req.params;
  const post = await fetchPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const content = String(req.body?.content || '').trim();
  if (content.length < 1) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (content.length > MAX_COMMENT_LEN) {
    return res.status(400).json({ error: `Comment must be ${MAX_COMMENT_LEN} characters or fewer` });
  }

  const { data: comment, error } = await supabaseAdmin
    .from('feature_post_comments')
    .insert({
      post_id: id,
      user_id: req.session.user.id,
      content,
    })
    .select('id, post_id, content, created_at, user:user_id(id, username, avatar_color, avatar_url)')
    .single();

  if (error) return sendError(res, 500, error, 'save');
  res.json(comment);
});

module.exports = router;
