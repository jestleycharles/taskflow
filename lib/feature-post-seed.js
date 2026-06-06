const { supabaseAdmin } = require('./supabase');
const { FEEDBACK_ADMIN_EMAIL } = require('./constants');

const SEED_POST = {
  title: 'Task checklists + auto-move to Done',
  caption:
    'Next up: sub-task checklists on each task card. Check off items one by one — when every item is done, the task moves to your team\'s Done column automatically.',
  image_url: null,
  post_type: 'in_progress',
  checklist_ref: '§4',
};

async function findFeedbackAdminUserId() {
  if (!FEEDBACK_ADMIN_EMAIL) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select('id')
    .ilike('email', FEEDBACK_ADMIN_EMAIL)
    .maybeSingle();
  return data?.id || null;
}

/** Insert the first roadmap post when the table is empty (admin account required). */
async function ensureFeaturePostSeed() {
  const { count, error: countError } = await supabaseAdmin
    .from('feature_posts')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    if (countError.code === 'PGRST205') return;
    console.warn('feature-post seed: count failed', countError.message);
    return;
  }
  if ((count ?? 0) > 0) return;

  const adminId = await findFeedbackAdminUserId();
  if (!adminId) {
    console.warn('feature-post seed: skipped (no FEEDBACK_ADMIN_EMAIL user in DB)');
    return;
  }

  const { error } = await supabaseAdmin.from('feature_posts').insert({
    ...SEED_POST,
    created_by: adminId,
  });

  if (error) {
    console.warn('feature-post seed: insert failed', error.message);
    return;
  }
  console.log('feature-post seed: created initial in-progress post (§4)');
}

module.exports = { ensureFeaturePostSeed, SEED_POST };
