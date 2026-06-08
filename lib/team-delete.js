const { supabaseAdmin } = require('./supabase');
const { deleteStoredTeamFiles } = require('./storage-cleanup');
const { isStorageTeamAvatarUrl } = require('./user');

const AVATAR_BUCKET = 'avatars';

async function deleteStoredTeamAvatars(teamId) {
  const prefix = `teams/${teamId}`;
  const { data: files } = await supabaseAdmin.storage.from(AVATAR_BUCKET).list(prefix);
  if (!files?.length) return;
  const paths = files.map((f) => `${prefix}/${f.name}`);
  await supabaseAdmin.storage.from(AVATAR_BUCKET).remove(paths);
}

async function deleteTeamCompletely(teamId) {
  const { data: team } = await supabaseAdmin.from('teams').select('name, avatar_url').eq('id', teamId).single();
  if (!team) return false;

  const { data: teamTasks } = await supabaseAdmin.from('tasks').select('id').eq('team_id', teamId);
  const taskIds = (teamTasks || []).map((t) => t.id);

  const { data: chatMessages } = await supabaseAdmin
    .from('team_chat_messages')
    .select('id')
    .eq('team_id', teamId);
  const chatMessageIds = (chatMessages || []).map((m) => m.id);

  await deleteStoredTeamFiles(teamId, taskIds, chatMessageIds);

  if (taskIds.length) {
    await supabaseAdmin.from('comments').delete().in('task_id', taskIds);
    await supabaseAdmin.from('tasks').delete().eq('team_id', teamId);
  }

  await supabaseAdmin.from('activity_log').delete().eq('team_id', teamId);
  await supabaseAdmin.from('team_chat_messages').delete().eq('team_id', teamId);
  await supabaseAdmin.from('team_roles').delete().eq('team_id', teamId);
  await supabaseAdmin.from('team_invites').delete().eq('team_id', teamId);
  await supabaseAdmin.from('team_members').delete().eq('team_id', teamId);

  if (isStorageTeamAvatarUrl(team.avatar_url)) {
    await deleteStoredTeamAvatars(teamId);
  }

  const { error } = await supabaseAdmin.from('teams').delete().eq('id', teamId);
  if (error) throw error;
  return true;
}

module.exports = {
  deleteStoredTeamAvatars,
  deleteTeamCompletely,
};
