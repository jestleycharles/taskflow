const { supabaseAdmin } = require('./supabase');
const { randomColor } = require('./user');

function deriveUsername(authUser, fallbackUsername) {
  const meta = authUser.user_metadata || {};
  if (fallbackUsername) return String(fallbackUsername).trim();
  if (meta.username) return String(meta.username).trim();
  if (meta.full_name) return String(meta.full_name).trim().slice(0, 32);
  if (meta.name) return String(meta.name).trim().slice(0, 32);
  const email = authUser.email || '';
  const local = email.split('@')[0] || 'user';
  return local.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'user';
}

async function uniqueUsername(base) {
  let candidate = base.slice(0, 32) || 'user';
  const { data: clash } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('username', candidate)
    .maybeSingle();
  if (!clash) return candidate;

  for (let i = 2; i < 1000; i++) {
    const next = `${base.slice(0, 28)}_${i}`;
    const { data: again } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('username', next)
      .maybeSingle();
    if (!again) return next;
  }
  return `user_${Date.now().toString(36)}`;
}

/**
 * Ensures a row in public.users exists for a Supabase Auth user.
 * Links legacy accounts by email (sets auth_id) without changing the app user id.
 */
async function ensureAppUser(authUser, options = {}) {
  const email = (authUser.email || '').trim().toLowerCase();
  const authId = authUser.id;

  const { data: byAuthId } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_id', authId)
    .maybeSingle();

  if (byAuthId) return byAuthId;

  const { data: byId } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', authId)
    .maybeSingle();

  if (byId) {
    if (!byId.auth_id) {
      await supabaseAdmin.from('users').update({ auth_id: authId }).eq('id', byId.id);
    }
    return byId;
  }

  if (email) {
    const { data: byEmail } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (byEmail) {
      if (!byEmail.auth_id) {
        await supabaseAdmin.from('users').update({ auth_id: authId }).eq('id', byEmail.id);
      }
      return { ...byEmail, auth_id: byEmail.auth_id || authId };
    }
  }

  const baseUsername = deriveUsername(authUser, options.username);
  const username = await uniqueUsername(baseUsername);

  const { data: created, error } = await supabaseAdmin
    .from('users')
    .insert({
      id: authId,
      auth_id: authId,
      username,
      email: email || `${authId}@users.local`,
      password_hash: null,
      avatar_color: randomColor(),
    })
    .select()
    .single();

  if (error) throw error;
  return created;
}

module.exports = { ensureAppUser, deriveUsername, uniqueUsername };
