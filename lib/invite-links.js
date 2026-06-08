const crypto = require('crypto');
const { supabaseAdmin } = require('./supabase');
const { isGuestUser } = require('./user');
const { getOnlineUserIds } = require('./presence');
const { assertDuoCapacity } = require('./tasksplit-team');

const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 7;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function isInviteLinksUnavailable(error) {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.code || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('team_invite_links') &&
      (msg.includes('does not exist') ||
        msg.includes('schema cache') ||
        msg.includes('could not find') ||
        msg.includes('relation')))
  );
}

function generateInviteToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

function validateTokenFormat(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

function defaultExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + DEFAULT_EXPIRY_DAYS);
  return d.toISOString();
}

function linkValidationError(link) {
  if (!link) return { status: 404, error: 'Invite link not found' };
  if (link.revoked_at) return { status: 410, error: 'This invite link has been revoked' };
  if (link.expires_at && new Date(link.expires_at) <= new Date()) {
    return { status: 410, error: 'This invite link has expired' };
  }
  if (link.max_uses != null && link.use_count >= link.max_uses) {
    return { status: 410, error: 'This invite link has reached its use limit' };
  }
  return null;
}

async function isTeamOwnerGuest(teamId) {
  const { data: team } = await supabaseAdmin.from('teams').select('created_by').eq('id', teamId).single();
  if (!team?.created_by) return false;
  const { data: owner } = await supabaseAdmin.from('users').select('email').eq('id', team.created_by).single();
  return isGuestUser(owner);
}

async function fetchLinkByToken(token) {
  const { data, error } = await supabaseAdmin
    .from('team_invite_links')
    .select('id, team_id, token, created_by, expires_at, max_uses, use_count, revoked_at, created_at')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    if (isInviteLinksUnavailable(error)) return { unavailable: true };
    throw error;
  }
  return { link: data };
}

async function fetchTeamPublicMeta(teamId) {
  const { data: team } = await supabaseAdmin
    .from('teams')
    .select('id, name, description, avatar_color, avatar_url, created_at, created_by')
    .eq('id', teamId)
    .single();
  if (!team) return null;

  const { data: owner } = await supabaseAdmin
    .from('users')
    .select('id, username')
    .eq('id', team.created_by)
    .single();

  // Online/user counts are best-effort (presence is in-memory per server instance).
  const { data: memberRows, error: membersErr } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId);

  if (membersErr) throw membersErr;

  const memberIds = (memberRows || []).map((r) => r.user_id);
  const onlineIds = getOnlineUserIds(memberIds, teamId);

  return {
    id: team.id,
    name: team.name,
    description: team.description,
    avatar_color: team.avatar_color,
    avatar_url: team.avatar_url,
    created_at: team.created_at,
    owner: owner
      ? { id: owner.id, username: owner.username }
      : { id: team.created_by, username: null },
    member_count: memberIds.length,
    online_count: onlineIds.length,
  };
}

async function getInvitePublicMeta(token) {
  if (!validateTokenFormat(token)) {
    return { status: 400, error: 'Invalid invite link' };
  }

  const { link, unavailable } = await fetchLinkByToken(token);
  if (unavailable) {
    return { status: 503, error: 'Invite links are not set up yet. Run schema.sql in Supabase.' };
  }

  const validationErr = linkValidationError(link);
  if (validationErr) return validationErr;

  if (await isTeamOwnerGuest(link.team_id)) {
    return { status: 403, error: 'This team cannot accept new members via invite link' };
  }

  const team = await fetchTeamPublicMeta(link.team_id);
  if (!team) return { status: 404, error: 'Team not found' };

  return {
    status: 200,
    team: {
      id: team.id,
      name: team.name,
      description: team.description,
      avatar_color: team.avatar_color,
      avatar_url: team.avatar_url,
      created_at: team.created_at,
      owner: team.owner,
      member_count: team.member_count,
      online_count: team.online_count,
    },
    expires_at: link.expires_at,
    uses_remaining:
      link.max_uses != null ? Math.max(0, link.max_uses - link.use_count) : null,
  };
}

async function logInviteActivity(teamId, userId, type, description) {
  await supabaseAdmin.from('activity_log').insert({
    team_id: teamId,
    user_id: userId,
    type,
    description,
  });
}

async function acceptInviteLink({ token, userId, username }) {
  if (!validateTokenFormat(token)) {
    return { status: 400, error: 'Invalid invite link' };
  }

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, email, username')
    .eq('id', userId)
    .single();

  if (!user || isGuestUser(user)) {
    return { status: 403, error: 'Register an account to join this team' };
  }

  const { link, unavailable } = await fetchLinkByToken(token);
  if (unavailable) {
    return { status: 503, error: 'Invite links are not set up yet. Run schema.sql in Supabase.' };
  }

  const validationErr = linkValidationError(link);
  if (validationErr) return validationErr;

  if (await isTeamOwnerGuest(link.team_id)) {
    return { status: 403, error: 'This team cannot accept new members via invite link' };
  }

  const { data: existingMember } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('team_id', link.team_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMember) {
    return { status: 400, error: 'You are already a member of this team', team_id: link.team_id };
  }

  const { data: inviteTeam } = await supabaseAdmin
    .from('teams')
    .select('workspace_type, expense_mode')
    .eq('id', link.team_id)
    .single();

  if (inviteTeam?.workspace_type === 'expense') {
    const capErr = await assertDuoCapacity(inviteTeam, link.team_id, 1);
    if (capErr) return { status: 400, error: capErr };
  }

  const { error: memberErr } = await supabaseAdmin
    .from('team_members')
    .insert({ team_id: link.team_id, user_id: userId, role: 'member' });

  if (memberErr) return { status: 400, error: memberErr.message || 'Could not join team' };

  await supabaseAdmin
    .from('team_invites')
    .delete()
    .eq('team_id', link.team_id)
    .eq('user_id', userId);

  const { error: useErr } = await supabaseAdmin
    .from('team_invite_links')
    .update({ use_count: (link.use_count || 0) + 1 })
    .eq('id', link.id);

  if (useErr && !isInviteLinksUnavailable(useErr)) throw useErr;

  const displayName = username || user.username || 'A user';
  await logInviteActivity(link.team_id, userId, 'member_joined', `${displayName} joined the team via invite link`);

  return { status: 200, success: true, team_id: link.team_id };
}

async function tryAcceptPendingInvite(session, userId, username) {
  const token = session?.pending_invite_token;
  if (!token) return null;

  delete session.pending_invite_token;
  const result = await acceptInviteLink({ token, userId, username });
  if (result.success) return { team_id: result.team_id };
  return null;
}

async function createInviteLink(teamId, createdBy, { max_uses = null, expires_at = null } = {}) {
  const token = generateInviteToken();
  const row = {
    team_id: teamId,
    token,
    created_by: createdBy,
    expires_at: expires_at || defaultExpiresAt(),
    max_uses,
    use_count: 0,
  };

  const { data, error } = await supabaseAdmin
    .from('team_invite_links')
    .insert(row)
    .select('id, team_id, token, expires_at, max_uses, use_count, created_at')
    .single();

  if (error) {
    if (isInviteLinksUnavailable(error)) {
      return { status: 503, error: 'Invite links are not set up yet. Run schema.sql in Supabase.' };
    }
    return { status: 400, error: error.message || 'Could not create invite link' };
  }

  return { status: 200, link: data };
}

async function listTeamInviteLinks(teamId) {
  const { data, error } = await supabaseAdmin
    .from('team_invite_links')
    .select('id, token, expires_at, max_uses, use_count, revoked_at, created_at')
    .eq('team_id', teamId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    if (isInviteLinksUnavailable(error)) return [];
    throw error;
  }
  return data || [];
}

async function revokeInviteLink(teamId, linkId) {
  const { data: link } = await supabaseAdmin
    .from('team_invite_links')
    .select('id')
    .eq('id', linkId)
    .eq('team_id', teamId)
    .is('revoked_at', null)
    .maybeSingle();

  if (!link) return { status: 404, error: 'Invite link not found' };

  const { error } = await supabaseAdmin
    .from('team_invite_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId);

  if (error) return { status: 500, error: error.message || 'Could not revoke link' };
  return { status: 200, success: true };
}

function buildInviteUrl(req, token) {
  const host = req.get('host');
  const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${proto}://${host}/register?invite=${token}`;
}

module.exports = {
  isInviteLinksUnavailable,
  validateTokenFormat,
  getInvitePublicMeta,
  acceptInviteLink,
  tryAcceptPendingInvite,
  createInviteLink,
  listTeamInviteLinks,
  revokeInviteLink,
  buildInviteUrl,
  linkValidationError,
  fetchLinkByToken,
};
