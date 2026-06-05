/**
 * Google / GitHub sign-in via Supabase Auth (loaded on login & register pages).
 */
let supabaseAuthClient = null;

async function getSupabaseAuthClient() {
  if (supabaseAuthClient) return supabaseAuthClient;
  const r = await fetch('/api/auth/config');
  const cfg = await r.json();
  if (!r.ok || !cfg.supabaseUrl) {
    throw new Error(cfg.error || 'Authentication is not configured');
  }
  if (!window.supabase?.createClient) {
    throw new Error('Sign-in provider failed to load. Refresh the page.');
  }
  supabaseAuthClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return supabaseAuthClient;
}

async function signInWithProvider(provider) {
  if (typeof readStoredInviteToken === 'function') {
    const token = readStoredInviteToken();
    if (token) persistInviteToken(token);
  }
  const client = await getSupabaseAuthClient();
  const redirectTo = `${window.location.origin}/auth/callback`;
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  if (error) throw error;
}

function oauthStartError() {
  return 'Could not start sign-in. Check your connection and try again.';
}

async function signInWithGoogle() {
  try {
    await signInWithProvider('google');
  } catch {
    showError(oauthStartError());
  }
}

async function signInWithGitHub() {
  try {
    await signInWithProvider('github');
  } catch {
    showError(oauthStartError());
  }
}
