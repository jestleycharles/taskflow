/**
 * Shared invite-link handling for login, register, and OAuth callback pages.
 */
const INVITE_STORAGE_KEY = 'taskflow_pending_invite';

function getInviteTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  return token && /^[a-f0-9]{64}$/i.test(token) ? token : null;
}

function persistInviteToken(token) {
  if (token) sessionStorage.setItem(INVITE_STORAGE_KEY, token);
}

function readStoredInviteToken() {
  const fromUrl = getInviteTokenFromUrl();
  if (fromUrl) {
    persistInviteToken(fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(INVITE_STORAGE_KEY);
}

function clearStoredInviteToken() {
  sessionStorage.removeItem(INVITE_STORAGE_KEY);
}

function authRedirectUrl(data) {
  if (data?.invite_team_id) {
    clearStoredInviteToken();
    return `/board/${data.invite_team_id}`;
  }
  return '/dashboard';
}

async function storePendingInviteOnServer(token) {
  const r = await apiFetch('/api/invite/pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return parseJsonResponse(r);
}

async function initInviteBanner({ bannerId, loginLinkId, registerLinkId } = {}) {
  const token = readStoredInviteToken();
  if (!token) return null;

  const banner = bannerId ? document.getElementById(bannerId) : null;
  if (banner) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
  }

  const r = await fetch(`/api/invite/${token}`);
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    if (banner) {
      banner.className = 'bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm rounded-lg px-4 py-3 mb-5';
      banner.textContent = data.error || 'This invite link is no longer valid.';
      banner.classList.remove('hidden');
    }
    clearStoredInviteToken();
    return null;
  }

  persistInviteToken(token);
  await storePendingInviteOnServer(token);

  if (banner) {
    const team = data.team || {};
    const name = team.name || 'a team';
    banner.className = 'bg-brand-500/10 border border-brand-500/30 text-brand-200 text-sm rounded-lg px-4 py-3 mb-5';
    banner.innerHTML = `You&rsquo;ve been invited to join <strong class="text-white">${escHtml(name)}</strong>. Sign in or create an account to join.`;
    banner.classList.remove('hidden');
  }

  const inviteQuery = `?invite=${encodeURIComponent(token)}`;
  if (loginLinkId) {
    const link = document.getElementById(loginLinkId);
    if (link) link.href = `/login${inviteQuery}`;
  }
  if (registerLinkId) {
    const link = document.getElementById(registerLinkId);
    if (link) link.href = `/register${inviteQuery}`;
  }

  return data;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
