const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { fetchReactionsForMessages, attachReactionsToItems } = require('../lib/reactions');
const router = express.Router();

const STATUS_LABELS = { todo: 'To Do', doing: 'Doing', done: 'Done' };
const PRIORITY_LABELS = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };

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

async function buildTaskChangeLogs(existing, updates, teamId) {
  const logs = [];
  const taskLabel = updates.title !== undefined ? updates.title : existing.title;

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
    const from = STATUS_LABELS[existing.status] || existing.status;
    const to = STATUS_LABELS[updates.status] || updates.status;
    logs.push(`moved "${taskLabel}" from ${from} to ${to}`);
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

// GET /api/teams/:teamId/tasks
router.get('/api/teams/:teamId/tasks', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  if (!await isMember(teamId, req.session.user.id)) return res.status(403).json({ error: 'Not a member' });

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('*, assignee:assigned_to(id, username, avatar_color, avatar_url), creator:created_by(id, username)')
    .eq('team_id', teamId)
    .order('position', { ascending: true });

  if (error) return sendError(res, 500, error, 'load');
  res.json(data);
});

// POST /api/teams/:teamId/tasks
router.post('/api/teams/:teamId/tasks', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  const userId = req.session.user.id;
  if (!await isMember(teamId, userId)) return res.status(403).json({ error: 'Not a member' });

  const { title, description, status, priority, due_date, assigned_to } = req.body;

  const { data: maxPos } = await supabaseAdmin
    .from('tasks').select('position').eq('team_id', teamId).eq('status', status || 'todo')
    .order('position', { ascending: false }).limit(1).single();

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      team_id: teamId,
      title,
      description,
      status: status || 'todo',
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
  res.json(task);
});

// PATCH /api/tasks/:id
router.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const { data: existing } = await supabaseAdmin.from('tasks').select('*').eq('id', id).single();
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  if (!await isMember(existing.team_id, userId)) return res.status(403).json({ error: 'Not a member' });

  const allowed = ['title','description','status','priority','due_date','assigned_to','position'];
  const updates = {};
  for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];

  const editMeta = applyTaskEditHistory(existing, updates);
  const changeLogs = await buildTaskChangeLogs(existing, updates, existing.team_id);

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

  res.json(task);
});

// DELETE /api/tasks/:id
router.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const { data: existing } = await supabaseAdmin.from('tasks').select('*').eq('id', id).single();
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  if (!await isMember(existing.team_id, userId)) return res.status(403).json({ error: 'Not a member' });

  await supabaseAdmin.from('tasks').delete().eq('id', id);
  await logActivity(existing.team_id, userId, 'task_deleted', `Deleted task "${existing.title}"`);
  res.json({ success: true });
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
  const { content } = req.body;

  const { data: task } = await supabaseAdmin.from('tasks').select('team_id, title').eq('id', id).single();
  if (!task || !await isMember(task.team_id, userId)) return res.status(403).json({ error: 'Forbidden' });

  const { data: comment, error } = await supabaseAdmin
    .from('comments')
    .insert({ task_id: id, user_id: userId, content })
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
    .order('created_at', { ascending: false })
    .limit(50);

  res.json(data || []);
});

module.exports = router;
