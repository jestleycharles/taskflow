const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

async function isMember(teamId, userId) {
  const { data } = await supabaseAdmin
    .from('team_members').select('role').eq('team_id', teamId).eq('user_id', userId).single();
  return data;
}

async function logActivity(teamId, userId, type, description, taskId = null) {
  await supabaseAdmin.from('activity_log').insert({ team_id: teamId, user_id: userId, type, description, task_id: taskId });
}

// GET /api/teams/:teamId/tasks
router.get('/api/teams/:teamId/tasks', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  if (!await isMember(teamId, req.session.user.id)) return res.status(403).json({ error: 'Not a member' });

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('*, assignee:assigned_to(id, username, avatar_color), creator:created_by(id, username)')
    .eq('team_id', teamId)
    .order('position', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
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
    .select('*, assignee:assigned_to(id, username, avatar_color), creator:created_by(id, username)')
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logActivity(teamId, userId, 'task_created', `Created task "${title}"`, task.id);
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

  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, assignee:assigned_to(id, username, avatar_color), creator:created_by(id, username)')
    .single();

  if (error) return res.status(400).json({ error: error.message });

  if (updates.status && updates.status !== existing.status) {
    const labels = { todo: 'To Do', doing: 'Doing', done: 'Done' };
    await logActivity(existing.team_id, userId, 'task_moved',
      `Moved "${existing.title}" to ${labels[updates.status]}`, id);
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
    .select('*, user:user_id(id, username, avatar_color)')
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  res.json(data || []);
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
    .select('*, user:user_id(id, username, avatar_color)')
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await logActivity(task.team_id, userId, 'comment_added', `Commented on "${task.title}"`, id);
  res.json(comment);
});

// GET /api/teams/:teamId/activity
router.get('/api/teams/:teamId/activity', requireAuth, async (req, res) => {
  const { teamId } = req.params;
  if (!await isMember(teamId, req.session.user.id)) return res.status(403).json({ error: 'Not a member' });

  const { data } = await supabaseAdmin
    .from('activity_log')
    .select('*, user:user_id(id, username, avatar_color)')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(50);

  res.json(data || []);
});

module.exports = router;
