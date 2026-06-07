const { supabaseAdmin } = require('./supabase');

const EXPENSE_MODES = new Set(['solo', 'duo', 'group']);

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

module.exports = {
  EXPENSE_MODES,
  isExpenseTeam,
  normalizeExpenseMode,
  assertTeamMember,
  loadExpenseTeam,
  loadTeamMembers,
  loadTeamRoles,
  loadTeamPendingInvites,
  attachCustomRoles,
  logTaskSplitActivity,
};
