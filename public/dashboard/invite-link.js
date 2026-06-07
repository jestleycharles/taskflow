/**
 * dashboard/invite-link.js
 * ------------------------
 * "Join via invite link" modal: input, auto-preview, and join flow.
 *
 * Depends on: state.js, modals.js, api.js (apiFetch, parseJsonResponse),
 *             avatar-utils.js (teamAvatarHtml)
 */

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let invitePreviewToken = null;
let invitePreviewData = null;
let invitePreviewFetching = false;
let inviteAutoPreviewTimer = null;
let inviteAutoPreviewLastToken = null;

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function showInviteLinkModalError(msg) {
  const el = document.getElementById("inviteLinkModalError");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function resetInviteLinkPreviewUi() {
  invitePreviewToken = null;
  invitePreviewData = null;
  inviteAutoPreviewLastToken = null;
  invitePreviewFetching = false;

  document.getElementById("inviteLinkModalError").classList.add("hidden");
  document.getElementById("inviteLinkPreview").classList.add("hidden");
  document.getElementById("inviteLinkPreviewLoading").classList.add("hidden");
  document.getElementById("inviteLinkPreviewUsage")?.classList.add("hidden");
  document.getElementById("inviteLinkInputWrap")?.classList.remove("hidden");

  const joinBtn = document.getElementById("inviteLinkJoinBtn");
  if (joinBtn) {
    joinBtn.classList.add("hidden");
    joinBtn.disabled = false;
    joinBtn.textContent = "Join team";
  }
}

function showInviteLinkPreviewLoading() {
  document.getElementById("inviteLinkModalError").classList.add("hidden");
  document.getElementById("inviteLinkPreview").classList.add("hidden");
  document
    .getElementById("inviteLinkPreviewLoading")
    .classList.remove("hidden");
  document.getElementById("inviteLinkInputWrap")?.classList.remove("hidden");
  document.getElementById("inviteLinkJoinBtn")?.classList.add("hidden");
}

function showInviteLinkPreviewReady() {
  document.getElementById("inviteLinkPreviewLoading").classList.add("hidden");
  document.getElementById("inviteLinkPreview").classList.remove("hidden");
  document.getElementById("inviteLinkInputWrap")?.classList.add("hidden");

  const joinBtn = document.getElementById("inviteLinkJoinBtn");
  if (joinBtn) {
    joinBtn.classList.remove("hidden");
    joinBtn.disabled = false;
  }
}

function renderInvitePreview(preview) {
  const team = preview?.team || {};

  document.getElementById("inviteLinkPreviewAvatar").innerHTML = teamAvatarHtml(
    team,
    "w-11 h-11 text-sm",
  );

  document.getElementById("inviteLinkPreviewName").textContent =
    team.name || "Team";
  document.getElementById("inviteLinkPreviewDesc").textContent =
    team.description || "No description";

  const createdAt = team.created_at
    ? new Date(team.created_at).toLocaleDateString()
    : null;
  document.getElementById("inviteLinkPreviewCreated").textContent = createdAt
    ? `Created ${createdAt}`
    : "";

  const online = team.online_count ?? 0;
  const memberCount = team.member_count ?? 0;
  document.getElementById("inviteLinkPreviewCounts").textContent =
    `${online}/${memberCount} online`;

  document.getElementById("inviteLinkPreviewOwner").textContent =
    `Owner: ${team.owner?.username || "Unknown"}`;

  const expiry = preview?.expires_at
    ? new Date(preview.expires_at).toLocaleDateString()
    : null;
  const usesRemaining = preview?.uses_remaining;
  const usageEl = document.getElementById("inviteLinkPreviewUsage");
  if (usageEl) {
    usageEl.classList.remove("hidden");
    const parts = [];
    if (expiry) parts.push(`Expires ${expiry}`);
    if (usesRemaining != null) parts.push(`${usesRemaining} uses remaining`);
    usageEl.textContent = parts.join(" · ");
  }
}

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

/**
 * Pull a 64-char hex invite token out of a raw string (URL, bare token, etc.)
 * @param {string} input
 * @returns {string|null}
 */
function extractInviteToken(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // Bare 64-char hex token
  if (/^[a-f0-9]{64}$/i.test(raw)) return raw.toLowerCase();

  // Query-string fragment like "invite=<token>"
  const m = raw.match(/(?:^|[?&])invite=([a-f0-9]{64})/i);
  if (m) return m[1].toLowerCase();

  // Full URL
  try {
    const u = new URL(raw);
    const token = u.searchParams.get("invite");
    if (token && /^[a-f0-9]{64}$/i.test(token)) return token.toLowerCase();
  } catch {
    // Not a URL — that is fine.
  }

  return null;
}

/**
 * Build a full invite URL from a bare token.
 * @param {string} token
 * @returns {string|null}
 */
function buildInviteUrlFromToken(token) {
  if (!token) return null;
  try {
    return `${window.location.origin}/register?invite=${token}`;
  } catch {
    return `/register?invite=${token}`;
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function previewInviteLink() {
  const input = document.getElementById("inviteLinkInput").value;
  const token = extractInviteToken(input);
  if (!token) return showInviteLinkModalError("Paste a valid invite link.");
  if (invitePreviewFetching) return;
  if (invitePreviewToken === token) {
    showInviteLinkPreviewReady();
    return;
  }

  invitePreviewFetching = true;
  showInviteLinkPreviewLoading();

  try {
    const r = await apiFetch(`/api/invite/${token}`);
    const d = await parseJsonResponse(r);

    if (!r.ok) {
      resetInviteLinkPreviewUi();
      return showInviteLinkModalError(d.error || "Could not load invite.");
    }

    invitePreviewToken = token;
    invitePreviewData = d;
    renderInvitePreview(d);
    showInviteLinkPreviewReady();
  } finally {
    invitePreviewFetching = false;
  }
}

// ---------------------------------------------------------------------------
// Auto-preview (debounced on input)
// ---------------------------------------------------------------------------

function scheduleInviteAutoPreview() {
  const inputEl = document.getElementById("inviteLinkInput");
  if (!inputEl) return;

  clearTimeout(inviteAutoPreviewTimer);
  document.getElementById("inviteLinkModalError").classList.add("hidden");

  const token = extractInviteToken(inputEl.value);
  if (!token) {
    resetInviteLinkPreviewUi();
    return;
  }

  // If the token changed, hide the old preview immediately
  if (token !== inviteAutoPreviewLastToken) {
    invitePreviewToken = null;
    invitePreviewData = null;
    document.getElementById("inviteLinkPreview").classList.add("hidden");
    document.getElementById("inviteLinkPreviewLoading").classList.add("hidden");
    document.getElementById("inviteLinkInputWrap")?.classList.remove("hidden");
    document.getElementById("inviteLinkJoinBtn")?.classList.add("hidden");
  }

  // Normalize the input to the full URL form
  const normalized = buildInviteUrlFromToken(token);
  if (normalized && inputEl.value.trim() !== normalized) {
    inputEl.value = normalized;
  }

  inviteAutoPreviewTimer = setTimeout(async () => {
    const token2 = extractInviteToken(inputEl.value);
    if (!token2) {
      resetInviteLinkPreviewUi();
      return;
    }
    if (token2 === inviteAutoPreviewLastToken && invitePreviewToken === token2)
      return;
    inviteAutoPreviewLastToken = token2;
    try {
      await previewInviteLink();
    } catch {
      resetInviteLinkPreviewUi();
    }
  }, 350);
}

// ---------------------------------------------------------------------------
// Public: open / close / join
// ---------------------------------------------------------------------------

window.openInviteLinkModal = function openInviteLinkModal() {
  if (window.currentUser?.is_guest) {
    return showAlert(
      "Invite links require a registered account.",
      "Sign in required",
    );
  }

  clearTimeout(inviteAutoPreviewTimer);
  document.getElementById("inviteLinkInput").value = "";
  resetInviteLinkPreviewUi();
  document.getElementById("inviteLinkModal").classList.remove("hidden");
  pushDashboardOverlay("inviteLink");

  const input = document.getElementById("inviteLinkInput");
  if (input) {
    input.oninput = () => scheduleInviteAutoPreview();
    input.onpaste = () => setTimeout(scheduleInviteAutoPreview, 0);
  }

  setTimeout(() => document.getElementById("inviteLinkInput")?.focus(), 50);
};

window.closeInviteLinkModal = function closeInviteLinkModal() {
  clearTimeout(inviteAutoPreviewTimer);
  resetInviteLinkPreviewUi();
  document.getElementById("inviteLinkModal").classList.add("hidden");
};

window.changeInviteLink = function changeInviteLink() {
  clearTimeout(inviteAutoPreviewTimer);
  resetInviteLinkPreviewUi();
  const input = document.getElementById("inviteLinkInput");
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 50);
  }
};

window.joinByInviteLink = async function joinByInviteLink() {
  const token =
    invitePreviewToken ||
    extractInviteToken(document.getElementById("inviteLinkInput").value);

  if (!token) return showInviteLinkModalError("Paste a valid invite link.");

  // Make sure we have a valid preview first
  if (!invitePreviewToken || invitePreviewToken !== token) {
    await previewInviteLink();
    if (!invitePreviewToken || invitePreviewToken !== token) return;
  }

  const btn = document.getElementById("inviteLinkJoinBtn");
  btn.disabled = true;
  btn.textContent = "Joining…";
  document.getElementById("inviteLinkModalError").classList.add("hidden");

  const r = await apiFetch(`/api/invite/${token}/accept`, { method: "POST" });
  const d = await parseJsonResponse(r);

  btn.disabled = false;
  btn.textContent = "Join team";

  if (!r.ok) return showInviteLinkModalError(d.error || "Could not join team.");

  if (d.team_id) {
    setNavigatingAway(true);
    window.location = `/taskflow/${d.team_id}`;
  }
};
