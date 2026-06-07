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

async function loadTeamMembers(teamId) {
  const { data: members, error } = await supabaseAdmin
    .from('team_members')
    .select('role, users(id, username, email, avatar_color, avatar_url)')
    .eq('team_id', teamId);

  if (error) throw error;

  return (members || []).map((m) => ({
    id: m.users.id,
    username: m.users.username,
    email: m.users.email,
    avatar_color: m.users.avatar_color,
    avatar_url: m.users.avatar_url,
    role: m.role,
  }));
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
  logTaskSplitActivity,
};
