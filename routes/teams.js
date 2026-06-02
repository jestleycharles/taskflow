const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const { ping, getOnlineUserIds } = require('../lib/presence');
const router = express.Router();

// POST /api/presence/ping — heartbeat while viewing a board (guests included)
router.post('/api/presence/ping', requireAuth, (req, res) => {
  ping(req.session.user.id);
  res.json({ ok: true });
});

// GET /api/teams/:id/online — user ids of members currently on this board
router.get('/api/teams/:id/online', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', id)
    .eq('user_id', userId)
    .single();

  if (!membership) return res.status(403).json({ error: 'Not a member' });

  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', id);

  const memberIds = (members || []).map((m) => m.user_id);
  ping(userId);
  res.json(getOnlineUserIds(memberIds));
});

// GET /api/teams - list user's teams
router.get('/api/teams', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('role, teams(id, name, description, created_by, created_at)')
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  const teams = data.map(d => ({ ...d.teams, role: d.role }));
  res.json(teams);
});

// POST /api/teams - create team
router.post('/api/teams', requireAuth, async (req, res) => {
  const { name, description } = req.body;
  const userId = req.session.user.id;

  const { data: team, error } = await supabaseAdmin
    .from('teams')
    .insert({ name, description, created_by: userId })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin.from('team_members').insert({ team_id: team.id, user_id: userId, role: 'owner' });

  await logActivity(team.id, userId, 'team_created', `Created team "${name}"`);
  res.json(team);
});

// GET /api/teams/:id - get team details + members
router.get('/api/teams/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', id)
    .eq('user_id', userId)
    .single();

  if (!membership) return res.status(403).json({ error: 'Not a member' });

  const { data: team } = await supabaseAdmin.from('teams').select('*').eq('id', id).single();
  const { data: members } = await supabaseAdmin
    .from('team_members')
    .select('role, users(id, username, email, avatar_color)')
    .eq('team_id', id);

  res.json({ ...team, members: members.map(m => ({ ...m.users, role: m.role })), userRole: membership.role });
});

// POST /api/teams/:id/invite - invite by email
router.post('/api/teams/:id/invite', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  const userId = req.session.user.id;

  const { data: membership } = await supabaseAdmin
    .from('team_members').select('role').eq('team_id', id).eq('user_id', userId).single();
  if (!membership || !['owner','admin'].includes(membership.role))
    return res.status(403).json({ error: 'Only owners/admins can invite' });

  const { data: invitee } = await supabaseAdmin.from('users').select('id, username').eq('email', email).single();
  if (!invitee) return res.status(404).json({ error: 'User not found' });

  const { error } = await supabaseAdmin
    .from('team_members')
    .insert({ team_id: id, user_id: invitee.id, role: 'member' });

  if (error) return res.status(400).json({ error: 'User already in team' });

  await logActivity(id, userId, 'member_invited', `Invited ${invitee.username} to the team`);
  res.json({ success: true, user: invitee });
});

// DELETE /api/teams/:id/members/:uid — owner only
router.delete('/api/teams/:id/members/:uid', requireAuth, async (req, res) => {
  const { id, uid } = req.params;
  const userId = req.session.user.id;

  const { data: membership } = await supabaseAdmin
    .from('team_members').select('role').eq('team_id', id).eq('user_id', userId).single();
  if (!membership || membership.role !== 'owner')
    return res.status(403).json({ error: 'Only the team owner can remove members' });

  if (uid === userId)
    return res.status(400).json({ error: 'You cannot remove yourself. Delete the team instead.' });

  const { data: target } = await supabaseAdmin
    .from('team_members').select('role, users(username)')
    .eq('team_id', id).eq('user_id', uid).single();
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.role === 'owner')
    return res.status(400).json({ error: 'Cannot remove the team owner' });

  const { error } = await supabaseAdmin
    .from('team_members').delete().eq('team_id', id).eq('user_id', uid);
  if (error) return res.status(500).json({ error: error.message });

  const username = target.users?.username || 'A member';
  await logActivity(id, userId, 'member_removed', `Removed ${username} from the team`);
  res.json({ success: true });
});

// DELETE /api/teams/:id — owner only
router.delete('/api/teams/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const { data: membership } = await supabaseAdmin
    .from('team_members').select('role').eq('team_id', id).eq('user_id', userId).single();
  if (!membership || membership.role !== 'owner')
    return res.status(403).json({ error: 'Only the team owner can delete this team' });

  const { data: team } = await supabaseAdmin.from('teams').select('name').eq('id', id).single();
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const { data: teamTasks } = await supabaseAdmin.from('tasks').select('id').eq('team_id', id);
  const taskIds = (teamTasks || []).map(t => t.id);
  if (taskIds.length) {
    await supabaseAdmin.from('comments').delete().in('task_id', taskIds);
    await supabaseAdmin.from('tasks').delete().eq('team_id', id);
  }

  await supabaseAdmin.from('activity_log').delete().eq('team_id', id);
  await supabaseAdmin.from('team_members').delete().eq('team_id', id);

  const { error } = await supabaseAdmin.from('teams').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});

async function logActivity(teamId, userId, type, description) {
  await supabaseAdmin.from('activity_log').insert({ team_id: teamId, user_id: userId, type, description });
}

module.exports = router;
