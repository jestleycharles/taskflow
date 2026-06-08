const { supabaseAdmin } = require('./supabase');

const EXPENSE_MODES = new Set(['solo', 'duo', 'group']);
const DUO_MAX_MEMBERS = 2;

function isExpenseTeam(team) {
  return team?.workspace_type === 'expense';
}

function normalizeExpenseMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  return EXPENSE_MODES.has(m) ? m : null;
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

async function loadExpenseTeam(teamId, userId) {
  const { data: membership } = await supabaseAdmin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();

  if (!membership) return { status: 403, error: 'Not a member of this workspace' };

  const { data: team, error } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single();

  if (error || !team) return { status: 404, error: 'Workspace not found' };
  if (!isExpenseTeam(team)) return { status: 400, error: 'This workspace is not a TaskSplit expense workspace' };

  return { status: 200, team, role: membership.role };
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

function isTeamInvitesUnavailable(error) {
  return error?.code === '42P01' || String(error?.message || '').includes('team_invites');
}

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
      username: u.username || 'Pending user',
      email: u.email || '',
      avatar_color: u.avatar_color,
      avatar_url: u.avatar_url,
      invited_by_user: inviter,
    };
  });
}

async function loadTeamMembers(teamId) {
  const { data: members, error } = await supabaseAdmin
    .from('team_members')
    .select('role, custom_role_id, users(id, username, email, avatar_color, avatar_url)')
    .eq('team_id', teamId);

  if (error) throw error;

  const roles = await loadTeamRoles(teamId);
  const list = (members || []).map((m) => ({
    id: m.users.id,
    username: m.users.username,
    email: m.users.email,
    avatar_color: m.users.avatar_color,
    avatar_url: m.users.avatar_url,
    role: m.role,
    custom_role_id: m.custom_role_id,
  }));

  return attachCustomRoles(list, roles);
}

async function logTaskSplitActivity(teamId, userId, type, description) {
  await supabaseAdmin.from('activity_log').insert({
    team_id: teamId,
    user_id: userId,
    type,
    description,
  });
}

function canModifyExpense(expense, userId, role) {
  if (!expense || !userId) return false;
  if (role === 'owner') return true;
  return String(expense.created_by) === String(userId);
}

async function countTeamMemberSlots(teamId) {
  const { count: memberCount, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);

  if (memberErr) throw memberErr;

  let pendingCount = 0;
  const { count, error: pendingErr } = await supabaseAdmin
    .from('team_invites')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);

  if (pendingErr) {
    if (!isTeamInvitesUnavailable(pendingErr)) throw pendingErr;
  } else {
    pendingCount = count || 0;
  }

  const members = memberCount || 0;
  return { members, pending: pendingCount, total: members + pendingCount };
}

/** Returns an error message when duo capacity would be exceeded, else null. */
function duoCapacityError(team, slots, extraSlots = 1) {
  if (team?.expense_mode !== 'duo') return null;
  if ((slots?.total ?? 0) + extraSlots > DUO_MAX_MEMBERS) {
    return 'Duo workspaces are limited to 2 members. Remove a member or cancel a pending invite first.';
  }
  return null;
}

async function assertDuoCapacity(team, teamId, extraSlots = 1) {
  if (team?.expense_mode !== 'duo') return null;
  const slots = await countTeamMemberSlots(teamId);
  return duoCapacityError(team, slots, extraSlots);
}

function ensurePayerInParticipants(payerId, participantIds) {
  const ids = [...new Set((participantIds || []).map(String))];
  const payer = String(payerId);
  if (!ids.includes(payer)) ids.push(payer);
  return ids;
}

module.exports = {
  EXPENSE_MODES,
  DUO_MAX_MEMBERS,
  isExpenseTeam,
  normalizeExpenseMode,
  assertTeamMember,
  loadExpenseTeam,
  loadTeamMembers,
  loadTeamRoles,
  loadTeamPendingInvites,
  attachCustomRoles,
  logTaskSplitActivity,
  canModifyExpense,
  countTeamMemberSlots,
  duoCapacityError,
  assertDuoCapacity,
  ensurePayerInParticipants,
};
