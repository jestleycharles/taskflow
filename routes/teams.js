const express = require('express');
const multer = require('multer');
const path = require('path');
const { supabaseAdmin } = require('../lib/supabase');
const { sendError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { ping, leave, getOnlineUserIds } = require('../lib/presence');
const {
  AVATAR_PRESETS,
  isGuestUser,
  isStorageTeamAvatarUrl,
  randomColor,
} = require('../lib/user');
const { getKanbanPreset } = require('../lib/kanban-presets');
const { seedTeamColumns, ensureTeamColumns } = require('../lib/team-columns');
const router = express.Router();

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES },
});

async function isTeamOwnerGuest(teamId) {
  const { data: team } = await supabaseAdmin.from('teams').select('created_by').eq('id', teamId).single();
  if (!team?.created_by) return false;
  const { data: owner } = await supabaseAdmin.from('users').select('email').eq('id', team.created_by).single();
  return isGuestUser(owner);
}

async function assertTeamMember(teamId, userId) {
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();
  return !!data;
}

function isTeamInvitesUnavailable(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('team_invites') &&
      (msg.includes('does not exist') ||
        msg.includes('schema cache') ||
        msg.includes('could not find') ||
        msg.includes('relation')))
  );
}

/** Pending invites for a team (no embedded users join — team_invites has two FKs to users). */
async function loadTeamPendingInvites(teamId) {
  const { data: rows, error } = await supabaseAdmin
    .from('team_invites')
    .select('id, user_id, invited_by, created_at')
    .eq('team_id', teamId);

  if (error) {
    if (isTeamInvitesUnavailable(error)) return [];
    throw error;
  }
  if (!rows?.length) return [];

  const userIds = [...new Set(rows.flatMap((r) => [r.user_id, r.invited_by].filter(Boolean)))];
  const { data: users, error: usersErr } = await supabaseAdmin
    .from('users')
    .select('id, username, email, avatar_color, avatar_url')
    .in('id', userIds);

  if (usersErr) throw usersErr;

  const userById = new Map((users || []).map((u) => [u.id, u]));
  return rows.map((row) => {
    const u = userById.get(row.user_id) || {};
    const inviter = row.invited_by ? userById.get(row.invited_by) : null;
    return {
      id: u.id || row.user_id,
      invite_id: row.id,
      username: u.username,
      email: u.email,
      avatar_color: u.avatar_color,
      avatar_url: u.avatar_url,
      invited_by: row.invited_by,
      invited_by_user: inviter
        ? { id: inviter.id, username: inviter.username, email: inviter.email }
        : null,
      pending: true,
    };
  });
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

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function normalizeHexColor(value) {
  const raw = String(value || '').trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return HEX_COLOR_RE.test(withHash) ? withHash.toLowerCase() : null;
}

async function loadTeamRoles(teamId) {
  const { data, error } = await supabaseAdmin
    .from('team_roles')
    .select('id, name, color_hex, sort_order')
    .eq('team_id', teamId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

function attachCustomRoles(members, roles) {
  const roleById = new Map(roles.map((r) => [r.id, r]));
  return members.map((m) => ({
    ...m,
    custom_role: m.custom_role_id ? roleById.get(m.custom_role_id) || null : null,
  }));
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

function buildTeamMemberCounts(allMembers) {
  const membersByTeam = new Map();
  for (const m of allMembers || []) {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
    membersByTeam.get(m.team_id).push(m.user_id);
  }
  const counts = new Map();
  for (const [teamId, memberIds] of membersByTeam) {
    counts.set(teamId, {
      member_count: memberIds.length,
      online_count: getOnlineUserIds(memberIds, teamId).length,
    });
  }
  return counts;
}

// GET /api/teams - list user's teams
router.get('/api/teams', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('role, teams(id, name, description, avatar_color, avatar_url, created_by, created_at)')
    .eq('user_id', userId);

  if (error) return sendError(res, 500, error, 'load');

  const teamIds = data.map((d) => d.teams.id);
  let statsByTeam = new Map();
  if (teamIds.length) {
    const { data: allMembers, error: membersErr } = await supabaseAdmin
      .from('team_members')
      .select('team_id, user_id')
      .in('team_id', teamIds);
    if (membersErr) return sendError(res, 500, membersErr, 'load');
    statsByTeam = buildTeamMemberCounts(allMembers);
  }

  const teams = data.map((d) => {
    const stats = statsByTeam.get(d.teams.id) || { member_count: 0, online_count: 0 };
    return { ...d.teams, role: d.role, ...stats };
  });
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
  const { name, description, avatar_url, kanban_preset } = req.body;
  const userId = req.session.user.id;

  const trimmedName = String(name || '').trim();
  if (!trimmedName) return res.status(400).json({ error: 'Team name is required' });

  const preset = getKanbanPreset(kanban_preset);

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

  try {
    await seedTeamColumns(team.id, preset.id);
  } catch (colErr) {
    await supabaseAdmin.from('teams').delete().eq('id', team.id);
    return sendError(res, 500, colErr, 'save');
  }

  await logActivity(team.id, userId, 'team_created', `Created team "${trimmedName}"`);
  res.json({ ...team, kanban_preset: preset.id });
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
    if (isGuestUser(req.session.user)) {
      return res.status(403).json({ error: 'Guest accounts cannot upload team images. Choose a preset or create a registered account.' });
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

  if (!membership) return res.status(403).json({ error: 'Not a member of this team' });

  const { data: team } = await supabaseAdmin.from('teams').select('*').eq('id', id).single();
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const ownerIsGuest = await isTeamOwnerGuest(id);

  const { data: members, error: membersErr } = await supabaseAdmin
    .from('team_members')
    .select('role, custom_role_id, users(id, username, email, avatar_color, avatar_url)')
    .eq('team_id', id);

  if (membersErr) return sendError(res, 500, membersErr, 'load');

  let roles = [];
  try {
    roles = await loadTeamRoles(id);
  } catch (rolesErr) {
    return sendError(res, 500, rolesErr, 'load');
  }

  let columns = [];
  try {
    columns = await ensureTeamColumns(id);
  } catch (colErr) {
    return sendError(res, 500, colErr, 'load');
  }

  const memberList = attachCustomRoles(
    (members || []).map((m) => ({ ...m.users, role: m.role, custom_role_id: m.custom_role_id })),
    roles
  );
  const memberIds = memberList.map((m) => m.id);
  ping(userId, id);

  let pending_invites = [];
  try {
    pending_invites = await loadTeamPendingInvites(id);
  } catch (invErr) {
    return sendError(res, 500, invErr, 'load');
  }

  res.json({
    ...team,
    members: memberList,
    pending_invites,
    roles,
    columns,
    separate_role_members: !!team.separate_role_members,
    userRole: membership.role,
    owner_is_guest: ownerIsGuest,
    member_count: memberList.length,
    online_count: getOnlineUserIds(memberIds, id).length,
  });
});

// GET /api/team-invites — pending invites for the current user
router.get('/api/team-invites', requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  const { data, error } = await supabaseAdmin
    .from('team_invites')
    .select('id, team_id, created_at, invited_by, teams(id, name, description, avatar_color, avatar_url)')
    .eq('user_id', userId);

  if (error) {
    if (isTeamInvitesUnavailable(error)) return res.json([]);
    return sendError(res, 500, error, 'load');
  }

  const inviterIds = [...new Set((data || []).map((r) => r.invited_by).filter(Boolean))];
  let inviterById = new Map();
  if (inviterIds.length) {
    const { data: inviters, error: inviterErr } = await supabaseAdmin
      .from('users')
      .select('id, username, email')
      .in('id', inviterIds);
    if (inviterErr) return sendError(res, 500, inviterErr, 'load');
    inviterById = new Map((inviters || []).map((u) => [u.id, u]));
  }

  const invites = (data || []).map((row) => ({
    id: row.id,
    team_id: row.team_id,
    team: row.teams,
    invited_by: row.invited_by
      ? inviterById.get(row.invited_by) || null
      : null,
  }));
  res.json(invites);
});

// POST /api/team-invites/:id/accept — accept a pending invite
router.post('/api/team-invites/:id/accept', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const { data: invite, error: fetchErr } = await supabaseAdmin
    .from('team_invites')
    .select('id, team_id, user_id, teams(name)')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !invite) return res.status(404).json({ error: 'Invite not found' });

  const { error: memberErr } = await supabaseAdmin
    .from('team_members')
    .insert({ team_id: invite.team_id, user_id: userId, role: 'member' });

  if (memberErr) return sendError(res, 400, memberErr, 'save');

  await supabaseAdmin.from('team_invites').delete().eq('id', id);

  const username = req.session.user.username || 'A user';
  await logActivity(invite.team_id, userId, 'member_joined', `${username} joined the team`);
  res.json({ success: true, team_id: invite.team_id });
});

// POST /api/team-invites/:id/decline — reject a pending invite
router.post('/api/team-invites/:id/decline', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  const { data: invite } = await supabaseAdmin
    .from('team_invites')
    .select('id, team_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  const { error } = await supabaseAdmin.from('team_invites').delete().eq('id', id);
  if (error) return sendError(res, 500, error, 'load');

  res.json({ success: true });
});

// POST /api/teams/:id/invite - invite by email (creates pending invite)
router.post('/api/teams/:id/invite', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  const userId = req.session.user.id;

  const { data: membership } = await supabaseAdmin
    .from('team_members').select('role').eq('team_id', id).eq('user_id', userId).single();
  if (!membership || membership.role !== 'owner')
    return res.status(403).json({ error: 'Only the team owner can invite' });

  if (await isTeamOwnerGuest(id)) {
    return res.status(403).json({
      error: 'Teams owned by a guest account cannot send invites. The owner needs a registered account.',
    });
  }

  const trimmedEmail = String(email || '').trim().toLowerCase();
  if (!trimmedEmail) return res.status(400).json({ error: 'Email is required' });
  if (isGuestUser({ email: trimmedEmail })) {
    return res.status(400).json({ error: 'Guest accounts cannot be invited to teams.' });
  }

  const { data: invitee } = await supabaseAdmin
    .from('users')
    .select('id, username, email, avatar_color, avatar_url')
    .eq('email', trimmedEmail)
    .single();
  if (!invitee) return res.status(404).json({ error: 'User not found' });
  if (isGuestUser(invitee)) {
    return res.status(400).json({ error: 'Guest accounts cannot be invited to teams.' });
  }

  if (invitee.id === userId) return res.status(400).json({ error: 'You cannot invite yourself' });

  const { data: existingMember } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', id)
    .eq('user_id', invitee.id)
    .single();
  if (existingMember) return res.status(400).json({ error: 'User is already a member' });

  const { data: existingInvite, error: existingInviteErr } = await supabaseAdmin
    .from('team_invites')
    .select('id')
    .eq('team_id', id)
    .eq('user_id', invitee.id)
    .maybeSingle();
  if (existingInviteErr) {
    if (isTeamInvitesUnavailable(existingInviteErr)) {
      return res.status(503).json({ error: 'Team invites are not set up yet. Run schema.sql in Supabase.' });
    }
    return sendError(res, 500, existingInviteErr, 'load');
  }
  if (existingInvite) return res.status(400).json({ error: 'Invitation already sent' });

  const { data: invite, error } = await supabaseAdmin
    .from('team_invites')
    .insert({ team_id: id, user_id: invitee.id, invited_by: userId })
    .select('id')
    .single();

  if (error) {
    if (isTeamInvitesUnavailable(error)) {
      return res.status(503).json({ error: 'Team invites are not set up yet. Run schema.sql in Supabase.' });
    }
    return sendError(res, 400, error, 'save');
  }

  await logActivity(id, userId, 'member_invited', `Invited ${invitee.username} to the team (pending)`);
  res.json({ success: true, user: invitee, invite_id: invite.id, pending: true });
});

// DELETE /api/teams/:id/invites/:uid — cancel a pending invite (owner only)
router.delete('/api/teams/:id/invites/:uid', requireAuth, async (req, res) => {
  const { id, uid } = req.params;
  const userId = req.session.user.id;

  const { data: membership } = await supabaseAdmin
    .from('team_members').select('role').eq('team_id', id).eq('user_id', userId).single();
  if (!membership || membership.role !== 'owner')
    return res.status(403).json({ error: 'Only the team owner can cancel invites' });

  const { data: invite, error: inviteErr } = await supabaseAdmin
    .from('team_invites')
    .select('id, user_id')
    .eq('team_id', id)
    .eq('user_id', uid)
    .single();

  if (inviteErr) {
    if (isTeamInvitesUnavailable(inviteErr)) {
      return res.status(503).json({ error: 'Team invites are not set up yet. Run schema.sql in Supabase.' });
    }
    return sendError(res, 500, inviteErr, 'load');
  }
  if (!invite) return res.status(404).json({ error: 'Pending invite not found' });

  const { error } = await supabaseAdmin
    .from('team_invites')
    .delete()
    .eq('team_id', id)
    .eq('user_id', uid);

  if (error) return sendError(res, 500, error, 'load');

  let username = 'A user';
  const { data: invitee } = await supabaseAdmin
    .from('users')
    .select('username')
    .eq('id', invite.user_id)
    .single();
  if (invitee?.username) username = invitee.username;
  await logActivity(id, userId, 'invite_cancelled', `Cancelled invite for ${username}`);
  res.json({ success: true });
});

// PATCH /api/teams/:id/role-display — separate members by role (owner only)
router.patch('/api/teams/:id/role-display', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { separate_role_members } = req.body || {};

  if (!await assertTeamOwner(id, userId)) {
    return res.status(403).json({ error: 'Only the team owner can change role display settings' });
  }

  if (typeof separate_role_members !== 'boolean') {
    return res.status(400).json({ error: 'separate_role_members must be a boolean' });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('teams')
    .update({ separate_role_members })
    .eq('id', id)
    .select('id, separate_role_members')
    .single();

  if (error) return sendError(res, 400, error, 'save');
  res.json(updated);
});

// POST /api/teams/:id/roles — create custom role (owner only)
router.post('/api/teams/:id/roles', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { name, color_hex } = req.body || {};

  if (!await assertTeamOwner(id, userId)) {
    return res.status(403).json({ error: 'Only the team owner can manage team roles' });
  }

  const trimmedName = String(name || '').trim();
  if (!trimmedName) return res.status(400).json({ error: 'Role name is required' });
  if (trimmedName.length > 48) return res.status(400).json({ error: 'Role name is too long' });

  const color = normalizeHexColor(color_hex);
  if (!color) return res.status(400).json({ error: 'Invalid color. Use a hex value like #4f6ef7' });

  const existing = await loadTeamRoles(id);
  const sort_order = existing.length ? Math.max(...existing.map((r) => r.sort_order)) + 1 : 0;

  const { data: role, error } = await supabaseAdmin
    .from('team_roles')
    .insert({ team_id: id, name: trimmedName, color_hex: color, sort_order })
    .select('id, name, color_hex, sort_order')
    .single();

  if (error) return sendError(res, 400, error, 'save');
  res.json(role);
});

// PATCH /api/teams/:id/roles/:roleId — update custom role (owner only)
router.patch('/api/teams/:id/roles/:roleId', requireAuth, async (req, res) => {
  const { id, roleId } = req.params;
  const userId = req.session.user.id;
  const { name, color_hex } = req.body || {};

  if (!await assertTeamOwner(id, userId)) {
    return res.status(403).json({ error: 'Only the team owner can manage team roles' });
  }

  const { data: existing } = await supabaseAdmin
    .from('team_roles')
    .select('id')
    .eq('id', roleId)
    .eq('team_id', id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Role not found' });

  const updates = {};
  if (name !== undefined) {
    const trimmedName = String(name).trim();
    if (!trimmedName) return res.status(400).json({ error: 'Role name is required' });
    if (trimmedName.length > 48) return res.status(400).json({ error: 'Role name is too long' });
    updates.name = trimmedName;
  }
  if (color_hex !== undefined) {
    const color = normalizeHexColor(color_hex);
    if (!color) return res.status(400).json({ error: 'Invalid color. Use a hex value like #4f6ef7' });
    updates.color_hex = color;
  }

  if (!Object.keys(updates).length) {
    const roles = await loadTeamRoles(id);
    const role = roles.find((r) => r.id === roleId);
    return res.json(role);
  }

  const { data: role, error } = await supabaseAdmin
    .from('team_roles')
    .update(updates)
    .eq('id', roleId)
    .eq('team_id', id)
    .select('id, name, color_hex, sort_order')
    .single();

  if (error) return sendError(res, 400, error, 'save');
  res.json(role);
});

// DELETE /api/teams/:id/roles/:roleId — delete custom role (owner only)
router.delete('/api/teams/:id/roles/:roleId', requireAuth, async (req, res) => {
  const { id, roleId } = req.params;
  const userId = req.session.user.id;

  if (!await assertTeamOwner(id, userId)) {
    return res.status(403).json({ error: 'Only the team owner can manage team roles' });
  }

  const { error } = await supabaseAdmin
    .from('team_roles')
    .delete()
    .eq('id', roleId)
    .eq('team_id', id);

  if (error) return sendError(res, 500, error, 'load');
  res.json({ success: true });
});

// PUT /api/teams/:id/roles/reorder — reorder role hierarchy (owner only)
router.put('/api/teams/:id/roles/reorder', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const { roleIds } = req.body || {};

  if (!await assertTeamOwner(id, userId)) {
    return res.status(403).json({ error: 'Only the team owner can manage team roles' });
  }

  if (!Array.isArray(roleIds) || !roleIds.length) {
    return res.status(400).json({ error: 'roleIds must be a non-empty array' });
  }

  const existing = await loadTeamRoles(id);
  const existingIds = new Set(existing.map((r) => r.id));
  if (roleIds.length !== existing.length || roleIds.some((rid) => !existingIds.has(rid))) {
    return res.status(400).json({ error: 'roleIds must include every role for this team' });
  }

  await Promise.all(
    roleIds.map((roleId, index) =>
      supabaseAdmin
        .from('team_roles')
        .update({ sort_order: index })
        .eq('id', roleId)
        .eq('team_id', id)
    )
  );

  const roles = await loadTeamRoles(id);
  res.json(roles);
});

// PATCH /api/teams/:id/members/:uid/custom-role — assign display role (owner only)
router.patch('/api/teams/:id/members/:uid/custom-role', requireAuth, async (req, res) => {
  const { id, uid } = req.params;
  const userId = req.session.user.id;
  const { custom_role_id } = req.body || {};

  if (!await assertTeamOwner(id, userId)) {
    return res.status(403).json({ error: 'Only the team owner can assign roles' });
  }

  const roles = await loadTeamRoles(id);
  if (!roles.length) {
    return res.status(400).json({ error: 'Create at least one role before assigning members' });
  }

  const { data: target } = await supabaseAdmin
    .from('team_members')
    .select('role, users(username)')
    .eq('team_id', id)
    .eq('user_id', uid)
    .single();

  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.role === 'owner') {
    return res.status(400).json({ error: 'The team owner cannot be assigned a custom role' });
  }

  let roleId = custom_role_id;
  if (roleId === null || roleId === '' || roleId === undefined) {
    roleId = null;
  } else if (!roles.some((r) => r.id === roleId)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const { error } = await supabaseAdmin
    .from('team_members')
    .update({ custom_role_id: roleId })
    .eq('team_id', id)
    .eq('user_id', uid);

  if (error) return sendError(res, 400, error, 'save');

  const username = target.users?.username || 'A member';
  const roleName = roleId ? roles.find((r) => r.id === roleId)?.name : 'none';
  await logActivity(id, userId, 'member_role_assigned', `Set ${username}'s display role to ${roleName}`);

  res.json({ success: true, custom_role_id: roleId });
});

async function clearUserTeamInvites(teamId, userId) {
  await supabaseAdmin.from('team_invites').delete().eq('team_id', teamId).eq('user_id', userId);
}

// POST /api/teams/:id/transfer-ownership — owner only; target must be registered member
router.post('/api/teams/:id/transfer-ownership', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;
  const targetUserId = String(req.body?.user_id || '').trim();

  if (isGuestUser(req.session.user)) {
    return res.status(403).json({ error: 'Guest accounts cannot transfer ownership' });
  }
  if (!targetUserId || targetUserId === userId) {
    return res.status(400).json({ error: 'Choose a registered team member to transfer ownership to' });
  }

  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', id)
    .eq('user_id', userId)
    .single();
  if (!membership || membership.role !== 'owner') {
    return res.status(403).json({ error: 'Only the team owner can transfer ownership' });
  }

  const { data: targetMember } = await supabaseAdmin
    .from('team_members')
    .select('role, users(id, username, email)')
    .eq('team_id', id)
    .eq('user_id', targetUserId)
    .single();
  if (!targetMember) return res.status(404).json({ error: 'Member not found' });
  if (targetMember.role === 'owner') {
    return res.status(400).json({ error: 'That user is already the owner' });
  }
  if (isGuestUser(targetMember.users)) {
    return res.status(400).json({ error: 'Ownership cannot be transferred to a guest account' });
  }

  const { error: demoteErr } = await supabaseAdmin
    .from('team_members')
    .update({ role: 'member' })
    .eq('team_id', id)
    .eq('user_id', userId);
  if (demoteErr) return sendError(res, 500, demoteErr, 'save');

  const { error: promoteErr } = await supabaseAdmin
    .from('team_members')
    .update({ role: 'owner' })
    .eq('team_id', id)
    .eq('user_id', targetUserId);
  if (promoteErr) {
    await supabaseAdmin
      .from('team_members')
      .update({ role: 'owner' })
      .eq('team_id', id)
      .eq('user_id', userId);
    return sendError(res, 500, promoteErr, 'save');
  }

  const { error: teamErr } = await supabaseAdmin
    .from('teams')
    .update({ created_by: targetUserId })
    .eq('id', id);
  if (teamErr) {
    await supabaseAdmin
      .from('team_members')
      .update({ role: 'owner' })
      .eq('team_id', id)
      .eq('user_id', userId);
    await supabaseAdmin
      .from('team_members')
      .update({ role: 'member' })
      .eq('team_id', id)
      .eq('user_id', targetUserId);
    return sendError(res, 500, teamErr, 'save');
  }

  const newUsername = targetMember.users?.username || 'A member';
  const oldUsername = req.session.user.username || 'The owner';
  await logActivity(id, userId, 'ownership_transferred', `Transferred ownership to ${newUsername}`);
  await logActivity(id, targetUserId, 'ownership_received', `${oldUsername} transferred ownership to you`);

  res.json({ success: true, new_owner_id: targetUserId });
});

// POST /api/teams/:id/leave — registered members only (not owner)
router.post('/api/teams/:id/leave', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.user.id;

  if (isGuestUser(req.session.user)) {
    return res.status(403).json({ error: 'Guest accounts cannot leave teams' });
  }

  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', id)
    .eq('user_id', userId)
    .single();
  if (!membership) return res.status(403).json({ error: 'Not a member of this team' });
  if (membership.role === 'owner') {
    return res.status(400).json({
      error: 'Transfer ownership or delete the team before leaving',
    });
  }

  const { error } = await supabaseAdmin
    .from('team_members')
    .delete()
    .eq('team_id', id)
    .eq('user_id', userId);
  if (error) return sendError(res, 500, error, 'save');

  await clearUserTeamInvites(id, userId);
  leave(userId, id);

  const username = req.session.user.username || 'A member';
  await logActivity(id, userId, 'member_left', `${username} left the team`);
  res.json({ success: true });
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
  await supabaseAdmin.from('team_roles').delete().eq('team_id', id);
  await supabaseAdmin.from('team_invites').delete().eq('team_id', id);
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
