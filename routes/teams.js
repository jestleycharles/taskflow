const express = require('express');
const multer = require('multer');
const path = require('path');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { ping, leave, getOnlineUserIds } = require('../lib/presence');
const {
  AVATAR_PRESETS,
  isStorageTeamAvatarUrl,
  randomColor,
} = require('../lib/user');
const router = express.Router();

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES },
});

async function assertTeamMember(teamId, userId) {
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();
  return !!data;
}

async function assertTeamOwner(teamId, userId) {
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();
  return data?.role === 'owner';
}

async function deleteStoredTeamAvatars(teamId) {
  const prefix = `teams/${teamId}`;
  const { data: files } = await supabaseAdmin.storage.from(AVATAR_BUCKET).list(prefix);
  if (!files?.length) return;
  const paths = files.map((f) => `${prefix}/${f.name}`);
  await supabaseAdmin.storage.from(AVATAR_BUCKET).remove(paths);
}

function resolvePresetUrl(avatarUrl) {
  if (!avatarUrl) return null;
  const match = AVATAR_PRESETS.find((p) => p.url === avatarUrl || avatarUrl.endsWith(p.url));
  return match?.url || null;
}

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

function mimeToExt(mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[mime] || '.jpg';
}

// POST /api/presence/ping — heartbeat while viewing a board (guests included)
router.post('/api/presence/ping', requireAuth, async (req, res) => {
  const { teamId } = req.body || {};
  if (!teamId) return res.status(400).json({ error: 'teamId required' });
  if (!await assertTeamMember(teamId, req.session.user.id))
    return res.status(403).json({ error: 'Not a member' });
  ping(req.session.user.id, teamId);
  res.json({ ok: true });
});

// POST /api/presence/leave — user left board, closed tab, or logged out
router.post('/api/presence/leave', requireAuth, async (req, res) => {
  const { teamId } = req.body || {};
  if (!teamId) return res.status(400).json({ error: 'teamId required' });
  if (!await assertTeamMember(teamId, req.session.user.id))
    return res.status(403).json({ error: 'Not a member' });
  leave(req.session.user.id, teamId);
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
  ping(userId, id);
  res.json(getOnlineUserIds(memberIds, id));
});

// GET /api/teams - list user's teams
router.get('/api/teams', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('role, teams(id, name, description, avatar_color, avatar_url, created_by, created_at)')
    .eq('user_id', userId);

  if (error) return sendError(res, 500, error, 'load');
  const teams = data.map(d => ({ ...d.teams, role: d.role }));
  res.json(teams);
});

// GET /api/teams/online — team ids where at least one member is on the board
router.get('/api/teams/online', requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  const { data: memberships, error: memErr } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId);

  if (memErr) return sendError(res, 500, memErr, 'load');

  const teamIds = (memberships || []).map((m) => m.team_id);
  if (!teamIds.length) return res.json([]);

  const { data: allMembers, error: membersErr } = await supabaseAdmin
    .from('team_members')
    .select('team_id, user_id')
    .in('team_id', teamIds);

  if (membersErr) return sendError(res, 500, membersErr, 'load');

  const membersByTeam = new Map();
  for (const m of allMembers || []) {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
    membersByTeam.get(m.team_id).push(m.user_id);
  }

  const onlineTeamIds = teamIds.filter((tid) =>
    getOnlineUserIds(membersByTeam.get(tid) || [], tid).length > 0
  );

  res.json(onlineTeamIds);
});

// POST /api/teams - create team
router.post('/api/teams', requireAuth, async (req, res) => {
  const { name, description, avatar_url } = req.body;
  const userId = req.session.user.id;

  const trimmedName = String(name || '').trim();
  if (!trimmedName) return res.status(400).json({ error: 'Team name is required' });

  let presetUrl = null;
  if (avatar_url) {
    presetUrl = resolvePresetUrl(avatar_url);
    if (!presetUrl) return res.status(400).json({ error: 'Invalid avatar preset' });
  }

  const { data: team, error } = await supabaseAdmin
    .from('teams')
    .insert({
      name: trimmedName,
      description: description?.trim() || null,
      created_by: userId,
      avatar_color: randomColor(),
      avatar_url: presetUrl,
    })
    .select()
    .single();

  if (error) return sendError(res, 400, error, 'save');

  await supabaseAdmin.from('team_members').insert({ team_id: team.id, user_id: userId, role: 'owner' });

  await logActivity(team.id, userId, 'team_created', `Created team "${trimmedName}"`);
  res.json(team);
});

// PATCH /api/teams/:id — update name & description (owner only)
router.patch('/api/teams/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { name, description } = req.body || {};

  if (!await assertTeamOwner(id, userId)) {
    return res.status(403).json({ error: 'Only the team owner can edit team details' });
  }

  const { data: team, error: fetchErr } = await supabaseAdmin.from('teams').select('*').eq('id', id).single();
  if (fetchErr || !team) return res.status(404).json({ error: 'Team not found' });

  const updates = {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: 'Team name is required' });
    updates.name = trimmed;
  }

  if (description !== undefined) {
    updates.description = String(description).trim() || null;
  }

  if (!Object.keys(updates).length) {
    return res.json(team);
  }

  const { data: updated, error } = await supabaseAdmin
    .from('teams')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return sendError(res, 400, error, 'save');

  const label = updates.name || team.name;
  await logActivity(id, userId, 'team_updated', `Updated team "${label}"`);
  res.json(updated);
});

// PUT /api/teams/:id/avatar/preset — owner only
router.put('/api/teams/:id/avatar/preset', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { preset } = req.body || {};

  if (!await assertTeamOwner(id, userId)) {
    return res.status(403).json({ error: 'Only the team owner can change the team avatar' });
  }

  const match = AVATAR_PRESETS.find((p) => p.id === preset);
  if (!match) return res.status(400).json({ error: 'Invalid avatar preset' });

  const { data: team } = await supabaseAdmin.from('teams').select('avatar_url').eq('id', id).single();
  if (!team) return res.status(404).json({ error: 'Team not found' });

  if (isStorageTeamAvatarUrl(team.avatar_url)) {
    await deleteStoredTeamAvatars(id);
  }

  const { data: updated, error } = await supabaseAdmin
    .from('teams')
    .update({ avatar_url: match.url })
    .eq('id', id)
    .select()
    .single();

  if (error) return sendError(res, 400, error, 'save');
  res.json({ team: updated });
});

// POST /api/teams/:id/avatar/upload — owner only
router.post(
  '/api/teams/:id/avatar/upload',
  requireAuth,
  avatarUpload,
  async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    if (!await assertTeamOwner(id, userId)) {
      return res.status(403).json({ error: 'Only the team owner can change the team avatar' });
    }

    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    if (!ALLOWED_MIME.has(req.file.mimetype)) {
      return res.status(400).json({ error: 'Image must be JPEG, PNG, WebP, or GIF' });
    }

    const { data: team } = await supabaseAdmin.from('teams').select('avatar_url').eq('id', id).single();
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const ext = path.extname(req.file.originalname).toLowerCase() || mimeToExt(req.file.mimetype);
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : mimeToExt(req.file.mimetype);
    const storagePath = `teams/${id}/${Date.now()}${safeExt}`;

    await deleteStoredTeamAvatars(id);

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (uploadErr) return sendError(res, 500, uploadErr, 'upload');

    const { data: urlData } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
    const avatarUrl = urlData.publicUrl;

    const { data: updated, error: dbErr } = await supabaseAdmin
      .from('teams')
      .update({ avatar_url: avatarUrl })
      .eq('id', id)
      .select()
      .single();

    if (dbErr) return sendError(res, 400, dbErr, 'save');
    res.json({ team: updated });
  }
);

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
    .select('role, users(id, username, email, avatar_color, avatar_url)')
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
  if (error) return sendError(res, 500, error, 'load');

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

  const { data: team } = await supabaseAdmin.from('teams').select('name, avatar_url').eq('id', id).single();
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const { data: teamTasks } = await supabaseAdmin.from('tasks').select('id').eq('team_id', id);
  const taskIds = (teamTasks || []).map(t => t.id);
  if (taskIds.length) {
    await supabaseAdmin.from('comments').delete().in('task_id', taskIds);
    await supabaseAdmin.from('tasks').delete().eq('team_id', id);
  }

  await supabaseAdmin.from('activity_log').delete().eq('team_id', id);
  await supabaseAdmin.from('team_chat_messages').delete().eq('team_id', id);
  await supabaseAdmin.from('team_members').delete().eq('team_id', id);

  if (isStorageTeamAvatarUrl(team.avatar_url)) {
    await deleteStoredTeamAvatars(id);
  }

  const { error } = await supabaseAdmin.from('teams').delete().eq('id', id);
  if (error) return sendError(res, 500, error, 'load');

  res.json({ success: true });
});

async function logActivity(teamId, userId, type, description) {
  await supabaseAdmin.from('activity_log').insert({ team_id: teamId, user_id: userId, type, description });
}

module.exports = router;
