const { supabaseAdmin } = require('./supabase');
const { GUEST_EMAIL, isGuestProtectedTeamId } = require('./user');
const { deleteTeamCompletely } = require('./team-delete');

const GUEST_TEAM_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let guestUserIdCache = null;

async function getGuestUserId() {
  if (guestUserIdCache) return guestUserIdCache;
  const { data } = await supabaseAdmin.from('users').select('id').eq('email', GUEST_EMAIL).single();
  guestUserIdCache = data?.id || null;
  return guestUserIdCache;
}

async function purgeExpiredGuestTeams() {
  const guestId = await getGuestUserId();
  if (!guestId) return { deleted: 0 };

  const cutoff = new Date(Date.now() - GUEST_TEAM_TTL_MS).toISOString();
  const { data: teams, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('created_by', guestId)
    .lt('created_at', cutoff);

  if (error) {
    console.error('[guest-team-cleanup] query error:', error.message || error);
    return { deleted: 0, error };
  }

  let deleted = 0;
  for (const team of teams || []) {
    if (isGuestProtectedTeamId(team.id)) continue;
    try {
      const ok = await deleteTeamCompletely(team.id);
      if (ok) deleted += 1;
    } catch (err) {
      console.error(`[guest-team-cleanup] failed to delete team ${team.id}:`, err);
    }
  }

  if (deleted) {
    console.log(`[guest-team-cleanup] purged ${deleted} expired guest team(s)`);
  }
  return { deleted };
}

function scheduleGuestTeamCleanup() {
  const run = () => {
    purgeExpiredGuestTeams().catch((err) => {
      console.error('[guest-team-cleanup] scheduled run failed:', err);
    });
  };
  run();
  return setInterval(run, CLEANUP_INTERVAL_MS);
}

module.exports = {
  GUEST_TEAM_TTL_MS,
  purgeExpiredGuestTeams,
  scheduleGuestTeamCleanup,
};
