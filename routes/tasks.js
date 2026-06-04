const express = require('express');
const multer = require('multer');
const path = require('path');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { fetchReactionsForMessages, attachReactionsToItems } = require('../lib/reactions');
const { assertCanSendUserMessage } = require('../lib/message-send-guard');
const { canBypassSpamGuard } = require('../lib/spam-guard-override');
const { isGuestUser } = require('../lib/user');
const {
  ensureTeamColumns,
  getStatusLabels,
  validateTeamStatus,
  getTeamColumnSlugs,
} = require('../lib/team-columns');
const router = express.Router();

const TASK_FILES_BUCKET = 'task-files';
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_ATTACHMENT_MIME = new Set([
  ...IMAGE_MIME,
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});

const PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };

function requireRegistered(req, res, next) {
  if (isGuestUser(req.session.user)) {
    return res.status(403).json({ error: 'Guest accounts cannot upload attachments' });
  }
  next();
}

function attachmentUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File must be 10 MB or smaller' });
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
    'application/pdf': '.pdf',
    'text/plain': '.txt',
  };
  return map[mime] || '.bin';
}

async function deleteStoredTaskFiles(taskId) {
  const prefix = `tasks/${taskId}`;
  const { data: files } = await supabaseAdmin.storage.from(TASK_FILES_BUCKET).list(prefix);
  if (!files?.length) return;
  const paths = files.map((f) => `${prefix}/${f.name}`);
  await supabaseAdmin.storage.from(TASK_FILES_BUCKET).remove(paths);
}

async function isMember(teamId, userId) {
  const { data } = await supabaseAdmin
    .from('team_members').select('role').eq('team_id', teamId).eq('user_id', userId).single();
  return data;
}

async function logActivity(teamId, userId, type, description, taskId = null) {
  await supabaseAdmin.from('activity_log').insert({ team_id: teamId, user_id: userId, type, description, task_id: taskId });
}

async function logTaskSystemComment(taskId, userId, content) {
  const { data, error } = await supabaseAdmin
    .from('comments')
    .insert({ task_id: taskId, user_id: userId, content, is_system: true })
    .select('*, user:user_id(id, username, avatar_color, avatar_url)')
    .single();
  if (error) throw error;
  return data;
}

async function getMemberName(userId) {
  const { data } = await supabaseAdmin.from('users').select('username').eq('id', userId).single();
  return data?.username || 'Someone';
}

function formatDateLabel(value) {
  if (!value) return 'none';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function buildTaskChangeLogs(existing, updates, teamId, statusLabels) {
  const logs = [];
  const taskLabel = updates.title !== undefined ? updates.title : existing.title;
  const labels = statusLabels || {};

  if (updates.title !== undefined && updates.title !== existing.title) {
    logs.push(`renamed task from "${existing.title}" to "${updates.title}"`);
  }
  if (updates.description !== undefined && (updates.description || '') !== (existing.description || '')) {
    if (!existing.description && updates.description) {
      logs.push(`added a description to "${taskLabel}"`);
    } else if (existing.description && !updates.description) {
      logs.push(`removed the description from "${taskLabel}"`);
    } else {
      logs.push(`updated the description on "${taskLabel}"`);
    }
  }
  if (updates.status !== undefined && updates.status !== existing.status) {
    const from = labels[existing.status] || existing.status;
    const to = labels[updates.status] || updates.status;
    logs.push(`moved "${taskLabel}" from ${from} to ${to}`);
  }
  if (updates.cover_image_url !== undefined && (updates.cover_image_url || null) !== (existing.cover_image_url || null)) {
    if (updates.cover_image_url) {
      logs.push(`set a cover image on "${taskLabel}"`);
    } else {
      logs.push(`removed the cover image from "${taskLabel}"`);
    }
  }
  if (updates.priority !== undefined && updates.priority !== existing.priority) {
    const from = PRIORITY_LABELS[existing.priority] || existing.priority;
    const to = PRIORITY_LABELS[updates.priority] || updates.priority;
    logs.push(`changed priority on "${taskLabel}" from ${from} to ${to}`);
  }
  if (updates.due_date !== undefined && (updates.due_date || null) !== (existing.due_date || null)) {
    const from = formatDateLabel(existing.due_date);
    const to = formatDateLabel(updates.due_date);
    logs.push(`changed due date on "${taskLabel}" from ${from} to ${to}`);
  }
  if (updates.assigned_to !== undefined && (updates.assigned_to || null) !== (existing.assigned_to || null)) {
    if (!updates.assigned_to) {
      logs.push(`unassigned "${taskLabel}"`);
    } else {
      const name = await getMemberName(updates.assigned_to);
      if (!existing.assigned_to) {
        logs.push(`assigned "${taskLabel}" to ${name}`);
      } else {
        const prev = await getMemberName(existing.assigned_to);
        logs.push(`reassigned "${taskLabel}" from ${prev} to ${name}`);
      }
    }
  }

  return logs;
}

function applyTaskEditHistory(existing, updates) {
  const editMeta = {};
  if (updates.title !== undefined && updates.title !== existing.title) {
    editMeta.title_edited_at = new Date().toISOString();
    if (!existing.title_edited_at) editMeta.title_before_edit = existing.title;
  }
  if (updates.description !== undefined && (updates.description || '') !== (existing.description || '')) {
    editMeta.description_edited_at = new Date().toISOString();
    if (!existing.description_edited_at) editMeta.description_before_edit = existing.description || '';
  }
  return editMeta;
}

async function attachUnreadCommentCounts(tasks, userId) {
  if (!tasks?.length) return tasks || [];

  const taskIds = tasks.map((t) => t.id);
  const { data: readStates } = await supabaseAdmin
    .from('task_comment_read_state')
    .select('task_id, last_read_at')
    .eq('user_id', userId)
    .in('task_id', taskIds);

  const readMap = new Map(
    (readStates || []).map((r) => [r.task_id, new Date(r.last_read_at).getTime()])
  );

  const { data: comments } = await supabaseAdmin
    .from('comments')
    .select('task_id, user_id, created_at')
    .in('task_id', taskIds);

  const counts = new Map(taskIds.map((id) => [id, 0]));
  for (const c of comments || []) {
    if (String(c.user_id) === String(userId)) continue;
    const lastRead = readMap.get(c.task_id) || 0;
    if (new Date(c.created_at).getTime() > lastRead) {
      counts.set(c.task_id, (counts.get(c.task_id) || 0) + 1);
    }
  }

  return tasks.map((t) => ({ ...t, unread_comment_count: counts.get(t.id) || 0 }));
}

async function attachAttachmentCounts(tasks) {
  if (!tasks?.length) return tasks || [];
  const taskIds = tasks.map((t) => t.id);
  const { data: rows } = await supabaseAdmin
    .from('task_attachments')
    .select('task_id')
    .in('task_id', taskIds);

  const counts = new Map(taskIds.map((id) => [id, 0]));
  for (const row of rows || []) {
    counts.set(row.task_id, (counts.get(row.task_id) || 0) + 1);
  }
  return tasks.map((t) => ({ ...t, attachment_count: counts.get(t.id) || 0 }));
}

// GET /api/teams/:teamId/tasks
router.get('/api/teams/:teamId/tasks', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  const userId = req.session.user.id;
  if (!await isMember(teamId, userId)) return res.status(403).json({ error: 'Not a member' });

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('*, assignee:assigned_to(id, username, avatar_color, avatar_url), creator:created_by(id, username)')
    .eq('team_id', teamId)
    .order('position', { ascending: true });

  if (error) return sendError(res, 500, error, 'load');
  const withUnread = await attachUnreadCommentCounts(data || [], userId);
  const withAttachments = await attachAttachmentCounts(withUnread);
  res.json(withAttachments);
});

// POST /api/teams/:teamId/tasks
router.post('/api/teams/:teamId/tasks', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  const userId = req.session.user.id;
  if (!await isMember(teamId, userId)) return res.status(403).json({ error: 'Not a member' });

  const { title, description, status, priority, due_date, assigned_to } = req.body;

  const columns = await ensureTeamColumns(teamId);
  const defaultStatus = columns[0]?.slug || 'todo';
  const taskStatus = status || defaultStatus;
  if (!await validateTeamStatus(teamId, taskStatus)) {
    return res.status(400).json({ error: 'Invalid column' });
  }

  const { data: maxPos } = await supabaseAdmin
    .from('tasks').select('position').eq('team_id', teamId).eq('status', taskStatus)
    .order('position', { ascending: false }).limit(1).single();

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      team_id: teamId,
      title,
      description,
      status: taskStatus,
      priority: priority || 'medium',
      due_date: due_date || null,
      assigned_to: assigned_to || null,
      created_by: userId,
      position: (maxPos?.position || 0) + 1000
    })
    .select('*, assignee:assigned_to(id, username, avatar_color, avatar_url), creator:created_by(id, username)')
    .single();

  if (error) return sendError(res, 400, error, 'save');

  await logActivity(teamId, userId, 'task_created', `Created task "${title}"`, task.id);
  const actor = await getMemberName(userId);
  await logTaskSystemComment(task.id, userId, `${actor} created this task`);
  const [withCount] = await attachAttachmentCounts([task]);
  res.json(withCount);
});

// PUT /api/teams/:teamId/tasks/reorder — reorder tasks within a column
router.put('/api/teams/:teamId/tasks/reorder', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  const userId = req.session.user.id;
  const { status, taskIds } = req.body || {};

  if (!await isMember(teamId, userId)) return res.status(403).json({ error: 'Not a member' });
  if (!status || !await validateTeamStatus(teamId, status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (!Array.isArray(taskIds) || !taskIds.length) {
    return res.status(400).json({ error: 'taskIds must be a non-empty array' });
  }

  const { data: existing, error } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('team_id', teamId)
    .eq('status', status);

  if (error) return sendError(res, 500, error, 'load');

  const existingIds = new Set((existing || []).map((t) => t.id));
  if (taskIds.length !== existingIds.size || taskIds.some((id) => !existingIds.has(id))) {
    return res.status(400).json({ error: 'taskIds must include every task in this column' });
  }

  await Promise.all(
    taskIds.map((id, index) =>
      supabaseAdmin
        .from('tasks')
        .update({ position: (index + 1) * 1000, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('team_id', teamId)
    )
  );

  res.json({ success: true });
});

// PUT /api/teams/:teamId/tasks/layout — atomically set column membership and order
router.put('/api/teams/:teamId/tasks/layout', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  const userId = req.session.user.id;
  const { columns } = req.body || {};

  if (!await isMember(teamId, userId)) return res.status(403).json({ error: 'Not a member' });
  if (!columns || typeof columns !== 'object' || Array.isArray(columns)) {
    return res.status(400).json({ error: 'columns must be an object' });
  }

  const validSlugs = new Set(await getTeamColumnSlugs(teamId));
  const statusLabels = await getStatusLabels(teamId);
  const entries = Object.entries(columns).filter(([, ids]) => Array.isArray(ids) && ids.length);
  if (!entries.length) return res.status(400).json({ error: 'columns must include at least one non-empty column' });

  for (const [status] of entries) {
    if (!validSlugs.has(status)) return res.status(400).json({ error: 'Invalid status' });
  }

  const { data: allTasks, error: loadErr } = await supabaseAdmin
    .from('tasks')
    .select('id, status, title')
    .eq('team_id', teamId);

  if (loadErr) return sendError(res, 500, loadErr, 'load');

  const teamIds = new Set((allTasks || []).map((t) => t.id));
  const byId = new Map((allTasks || []).map((t) => [t.id, t]));
  const seen = new Set();
  const updates = [];

  for (const [status, taskIds] of entries) {
    for (let index = 0; index < taskIds.length; index++) {
      const id = taskIds[index];
      if (!teamIds.has(id)) return res.status(400).json({ error: 'Task not found' });
      if (seen.has(id)) return res.status(400).json({ error: 'Task appears in more than one column' });
      seen.add(id);
      updates.push({ id, status, position: (index + 1) * 1000 });
    }
  }

  const now = new Date().toISOString();
  const results = await Promise.all(
    updates.map(({ id, status, position }) =>
      supabaseAdmin
        .from('tasks')
        .update({ status, position, updated_at: now })
        .eq('id', id)
        .eq('team_id', teamId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed) return sendError(res, 500, failed.error, 'save');

  const actor = await getMemberName(userId);
  for (const { id, status } of updates) {
    const existing = byId.get(id);
    if (!existing || existing.status === status) continue;
    const from = statusLabels[existing.status] || existing.status;
    const to = statusLabels[status] || status;
    const line = `moved "${existing.title}" from ${from} to ${to}`;
    await logTaskSystemComment(id, userId, `${actor} ${line}`);
    await logActivity(teamId, userId, 'task_updated', `${actor} ${line}`, id);
  }

  res.json({ success: true });
});

// PATCH /api/tasks/:id
router.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const { data: existing } = await supabaseAdmin.from('tasks').select('*').eq('id', id).single();
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  if (!await isMember(existing.team_id, userId)) return res.status(403).json({ error: 'Not a member' });

  const allowed = ['title','description','status','priority','due_date','assigned_to','position','cover_image_url'];
  const updates = {};
  for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];

  if (updates.status !== undefined && !await validateTeamStatus(existing.team_id, updates.status)) {
    return res.status(400).json({ error: 'Invalid column' });
  }

  const editMeta = applyTaskEditHistory(existing, updates);
  const statusLabels = await getStatusLabels(existing.team_id);
  const changeLogs = await buildTaskChangeLogs(existing, updates, existing.team_id, statusLabels);

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .update({ ...updates, ...editMeta, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, assignee:assigned_to(id, username, avatar_color, avatar_url), creator:created_by(id, username)')
    .single();

  if (error) return sendError(res, 400, error, 'save');

  const actor = await getMemberName(userId);
  for (const line of changeLogs) {
    await logTaskSystemComment(id, userId, `${actor} ${line}`);
    await logActivity(existing.team_id, userId, 'task_updated', `${actor} ${line}`, id);
  }

  const [withCount] = await attachAttachmentCounts([task]);
  res.json(withCount);
});

// GET /api/tasks/:id/attachments
router.get('/api/tasks/:id/attachments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { data: task } = await supabaseAdmin.from('tasks').select('team_id').eq('id', id).single();
  if (!task || !await isMember(task.team_id, userId)) return res.status(403).json({ error: 'Forbidden' });

  const { data, error } = await supabaseAdmin
    .from('task_attachments')
    .select('*, uploader:uploaded_by(id, username)')
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  if (error) return sendError(res, 500, error, 'load');
  res.json(data || []);
});

// POST /api/tasks/:id/attachments
router.post(
  '/api/tasks/:id/attachments',
  requireAuth,
  requireRegistered,
  attachmentUpload,
  async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    if (!ALLOWED_ATTACHMENT_MIME.has(req.file.mimetype)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }

    const { data: task } = await supabaseAdmin.from('tasks').select('team_id, title').eq('id', id).single();
    if (!task || !await isMember(task.team_id, userId)) return res.status(403).json({ error: 'Forbidden' });

    const ext = path.extname(req.file.originalname).toLowerCase() || mimeToExt(req.file.mimetype);
    const safeName = `${Date.now()}${ext}`;
    const storagePath = `tasks/${id}/${safeName}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(TASK_FILES_BUCKET)
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (uploadErr) {
      return res.status(500).json({
        error: uploadErr.message || 'Upload failed. Ensure the task-files storage bucket exists.',
      });
    }

    const { data: urlData } = supabaseAdmin.storage.from(TASK_FILES_BUCKET).getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;
    const fileName = req.file.originalname || safeName;

    const { data: row, error } = await supabaseAdmin
      .from('task_attachments')
      .insert({
        task_id: id,
        file_url: fileUrl,
        file_name: fileName,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        uploaded_by: userId,
      })
      .select('*, uploader:uploaded_by(id, username)')
      .single();

    if (error) return sendError(res, 400, error, 'save');

    const setAsCover = req.body?.set_as_cover === 'true' || req.body?.set_as_cover === true;
    if (setAsCover && IMAGE_MIME.has(req.file.mimetype)) {
      await supabaseAdmin
        .from('tasks')
        .update({ cover_image_url: fileUrl, updated_at: new Date().toISOString() })
        .eq('id', id);
    }

    const actor = await getMemberName(userId);
    await logTaskSystemComment(id, userId, `${actor} attached "${fileName}"`);
    await logActivity(task.team_id, userId, 'task_updated', `${actor} attached a file to "${task.title}"`, id);

    res.json(row);
  }
);

// DELETE /api/tasks/:id/attachments/:attachmentId
router.delete('/api/tasks/:id/attachments/:attachmentId', requireAuth, requireRegistered, async (req, res) => {
  const { id, attachmentId } = req.params;
  const userId = req.session.user.id;

  const { data: task } = await supabaseAdmin.from('tasks').select('team_id, title, cover_image_url').eq('id', id).single();
  if (!task || !await isMember(task.team_id, userId)) return res.status(403).json({ error: 'Forbidden' });

  const { data: att } = await supabaseAdmin
    .from('task_attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('task_id', id)
    .single();

  if (!att) return res.status(404).json({ error: 'Attachment not found' });

  const prefix = `tasks/${id}/`;
  const fileName = att.file_url.split('/').pop();
  if (fileName) {
    await supabaseAdmin.storage.from(TASK_FILES_BUCKET).remove([`${prefix}${fileName}`]);
  }

  await supabaseAdmin.from('task_attachments').delete().eq('id', attachmentId);

  if (task.cover_image_url === att.file_url) {
    await supabaseAdmin
      .from('tasks')
      .update({ cover_image_url: null, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  res.json({ success: true });
});

// PATCH /api/tasks/:id/cover — set cover from attachment URL or upload
router.patch('/api/tasks/:id/cover', requireAuth, requireRegistered, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { cover_image_url, attachment_id } = req.body || {};

  const { data: existing } = await supabaseAdmin.from('tasks').select('*').eq('id', id).single();
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  if (!await isMember(existing.team_id, userId)) return res.status(403).json({ error: 'Not a member' });

  let coverUrl = cover_image_url === null || cover_image_url === '' ? null : cover_image_url;

  if (attachment_id) {
    const { data: att } = await supabaseAdmin
      .from('task_attachments')
      .select('file_url, mime_type')
      .eq('id', attachment_id)
      .eq('task_id', id)
      .single();
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    if (!IMAGE_MIME.has(att.mime_type)) {
      return res.status(400).json({ error: 'Only image attachments can be used as cover' });
    }
    coverUrl = att.file_url;
  }

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .update({ cover_image_url: coverUrl, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, assignee:assigned_to(id, username, avatar_color, avatar_url), creator:created_by(id, username)')
    .single();

  if (error) return sendError(res, 400, error, 'save');

  const statusLabels = await getStatusLabels(existing.team_id);
  const changeLogs = await buildTaskChangeLogs(
    existing,
    { cover_image_url: coverUrl },
    existing.team_id,
    statusLabels
  );
  const actor = await getMemberName(userId);
  for (const line of changeLogs) {
    await logTaskSystemComment(id, userId, `${actor} ${line}`);
    await logActivity(existing.team_id, userId, 'task_updated', `${actor} ${line}`, id);
  }

  const [withCount] = await attachAttachmentCounts([task]);
  res.json(withCount);
});

// DELETE /api/tasks/:id
router.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const { data: existing } = await supabaseAdmin.from('tasks').select('*').eq('id', id).single();
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  if (!await isMember(existing.team_id, userId)) return res.status(403).json({ error: 'Not a member' });

  await deleteStoredTaskFiles(id);
  await supabaseAdmin.from('tasks').delete().eq('id', id);
  await logActivity(existing.team_id, userId, 'task_deleted', `Deleted task "${existing.title}"`);
  res.json({ success: true });
});

// GET /api/tasks/:id/comments/read — last time this user read this task's comments
router.get('/api/tasks/:id/comments/read', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { data: task } = await supabaseAdmin.from('tasks').select('team_id').eq('id', id).single();
  if (!task || !await isMember(task.team_id, userId)) return res.status(403).json({ error: 'Forbidden' });

  const { data, error } = await supabaseAdmin
    .from('task_comment_read_state')
    .select('last_read_at')
    .eq('task_id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return sendError(res, 500, error, 'load');
  res.json({ last_read_at: data?.last_read_at || null });
});

// PUT /api/tasks/:id/comments/read — mark comments as read up to a timestamp
router.put('/api/tasks/:id/comments/read', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { data: task } = await supabaseAdmin.from('tasks').select('team_id').eq('id', id).single();
  if (!task || !await isMember(task.team_id, userId)) return res.status(403).json({ error: 'Forbidden' });

  let incoming = new Date();
  if (req.body?.last_read_at) {
    const parsed = new Date(req.body.last_read_at);
    if (!Number.isNaN(parsed.getTime())) incoming = parsed;
  }

  const { data: existing } = await supabaseAdmin
    .from('task_comment_read_state')
    .select('last_read_at')
    .eq('task_id', id)
    .eq('user_id', userId)
    .maybeSingle();

  const existingMs = existing?.last_read_at ? new Date(existing.last_read_at).getTime() : 0;
  const lastReadAt = new Date(Math.max(existingMs, incoming.getTime())).toISOString();

  const { data, error } = await supabaseAdmin
    .from('task_comment_read_state')
    .upsert({ task_id: id, user_id: userId, last_read_at: lastReadAt }, { onConflict: 'task_id,user_id' })
    .select('last_read_at')
    .single();

  if (error) return sendError(res, 500, error, 'save');
  res.json({ last_read_at: data.last_read_at });
});

// GET /api/tasks/:id/comments
router.get('/api/tasks/:id/comments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { data: task } = await supabaseAdmin.from('tasks').select('team_id').eq('id', id).single();
  if (!task || !await isMember(task.team_id, req.session.user.id)) return res.status(403).json({ error: 'Forbidden' });

  const { data } = await supabaseAdmin
    .from('comments')
    .select('*, user:user_id(id, username, avatar_color, avatar_url)')
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  const comments = data || [];
  const userComments = comments.filter((c) => !c.is_system);
  const reactionsMap = await fetchReactionsForMessages(
    'comment',
    userComments.map((c) => c.id)
  );
  const withReactions = attachReactionsToItems(comments, reactionsMap);
  res.json(withReactions);
});

// POST /api/tasks/:id/comments
router.post('/api/tasks/:id/comments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const raw = (req.body?.content || '').trim();
  if (!raw) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (raw.length > 4000) return res.status(400).json({ error: 'Comment is too long' });

  const { data: task } = await supabaseAdmin.from('tasks').select('team_id, title').eq('id', id).single();
  if (!task || !await isMember(task.team_id, userId)) return res.status(403).json({ error: 'Forbidden' });

  const guard = await assertCanSendUserMessage(supabaseAdmin, {
    table: 'comments',
    scopeColumn: 'task_id',
    scopeId: id,
    userId,
    content: raw,
    excludeSystem: true,
    skipSpamGuard: canBypassSpamGuard(req.session.user),
  });
  if (!guard.ok) {
    return res.status(guard.status).json({
      error: guard.error,
      retry_after_ms: guard.retry_after_ms,
    });
  }

  const { data: comment, error } = await supabaseAdmin
    .from('comments')
    .insert({ task_id: id, user_id: userId, content: guard.content })
    .select('*, user:user_id(id, username, avatar_color, avatar_url)')
    .single();

  if (error) return sendError(res, 400, error, 'save');

  await logActivity(task.team_id, userId, 'comment_added', `Commented on "${task.title}"`, id);
  res.json({ ...comment, reactions: [] });
});

// GET /api/teams/:teamId/activity
router.get('/api/teams/:teamId/activity', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  if (!await isMember(teamId, req.session.user.id)) return res.status(403).json({ error: 'Not a member' });

  const { data } = await supabaseAdmin
    .from('activity_log')
    .select('*, user:user_id(id, username, avatar_color, avatar_url)')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  res.json(data || []);
});

module.exports = router;
