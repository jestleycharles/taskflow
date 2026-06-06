/**
 * dashboard/init.js
 * -----------------
 * Shared utilities, shared mutable state, and the dashboard `init()` entry-
 * point that bootstraps everything after the page loads.
 *
 * Depends on: ALL other dashboard/* modules, plus the external scripts
 * already loaded before this file (api.js, avatar-utils.js, direct-chat.js,
 * message-format.js, rich-text-editor.js, etc.)
 *
 * Load order: this file must be the LAST dashboard script loaded.
 */

// ---------------------------------------------------------------------------
// Shared mutable state
// (declared on window so every module can read/write without imports)
// ---------------------------------------------------------------------------

window.currentUser = null;
window.avatarPresets = [];
window.selectedPresetId = null;
window.profileSaving = false;
window.createTeamDraft = {
  presetId: null,
  avatar_url: null,
  pendingFile: null,
};
window.createTeamSaving = false;
window.kanbanPresets = [];
window.teamsList = [];
window.teamInvitesList = [];
window.onlineTeamIds = new Set();
window.teamOnlinePollInterval = null;
window.TEAM_ONLINE_POLL_MS = 4000;
window.registeredFeaturesCache = null;
window.dashboardHistoryPopping = false;

// ---------------------------------------------------------------------------
// Utility: HTML-escape
// (declared here so every module loaded before init.js can also call it,
//  since most modules are concatenated/loaded after the DOM is ready)
// ---------------------------------------------------------------------------

window.escHtml = function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

// ---------------------------------------------------------------------------
// Navigation helpers (nav-user, logout, FAB position)
// ---------------------------------------------------------------------------

window.renderNavUser = function renderNavUser() {
  const isGuest = window.currentUser.is_guest;
  document.getElementById("profileBtn").classList.toggle("hidden", isGuest);
  document.getElementById("guestBadge").classList.toggle("hidden", !isGuest);

  if (isGuest) {
    applyAvatarToElement(
      document.getElementById("guestAvatarCircle"),
      window.currentUser,
    );
    document.getElementById("guestUsernameDisplay").textContent =
      window.currentUser.username;
    return;
  }

  applyAvatarToElement(
    document.getElementById("avatarCircle"),
    window.currentUser,
  );
  document.getElementById("usernameDisplay").textContent =
    window.currentUser.username;
};

window.updateFeedbackFabPosition = function updateFeedbackFabPosition() {
  const dmVisible = !document
    .getElementById("dmChatFabWrap")
    ?.classList.contains("hidden");
  document.body.classList.toggle("dashboard-has-dm-fab", dmVisible);
};

window.logout = async function logout() {
  setNavigatingAway(true);
  showNavigationLoading("Signing out…");
  DirectChat.leaveAppPresence?.();
  clearGuestDashboardNotice();
  await apiFetch("/api/auth/logout", { method: "POST" });
  window.location = "/login";
};

// ---------------------------------------------------------------------------
// Mobile history / back-button handling
// ---------------------------------------------------------------------------

window.pushDashboardOverlay = function pushDashboardOverlay(name) {
  if (!TF_VIEWPORT?.isMobile?.()) return;
  if (window.dashboardHistoryPopping) return;
  history.pushState({ tfDashOverlay: name, t: Date.now() }, "");
};

window.requestCloseDashboardOverlay = function requestCloseDashboardOverlay() {
  if (!TF_VIEWPORT?.isMobile?.()) return;
  if (getTopDashboardOverlay()) history.back();
};

window.addEventListener("popstate", () => {
  if (window.DirectChat?.handlePopState?.()) return;
  if (!window.dashboardHistoryPopping) resetTransientNavigationUi?.();
  if (!TF_VIEWPORT?.isMobile?.()) return;
  if (window.dashboardHistoryPopping) {
    window.dashboardHistoryPopping = false;
    return;
  }
  const overlay = getTopDashboardOverlay();
  if (overlay) closeDashboardOverlayUi(overlay);
});

// ---------------------------------------------------------------------------
// init()
// ---------------------------------------------------------------------------

async function init() {
  hideNavigationLoading();

  // Mount the rich-text editor used by the feature-posts admin modal
  RichTextEditor.mount("featurePostCaptionEditor", {
    hiddenInputId: "featurePostCaption",
    placeholder: "What are we building or what shipped?",
  });

  // Fetch the current user
  const r = await apiFetch("/api/me");
  const meData = await parseJsonResponse(r);

  if (!r.ok) {
    if (isApiUnauthorizedUpdate(r, meData)) return;
    if (r.status === 401) return (window.location = "/login");
    return;
  }

  window.currentUser = meData;
  if (window.currentUser.error) return;

  await loadFeedbackCaptchaConfig();
  renderNavUser();

  // Registered-only UI bits
  if (!window.currentUser.is_guest) {
    document.getElementById("joinByInviteLinkBtn")?.classList.remove("hidden");
    document.getElementById("profileBtn").onclick = openProfileModal;
    loadAvatarPresets();
    DirectChat.init(window.currentUser, { showConfirm, showAlert });
  }

  updateFeedbackFabPosition();
  applyGuestTeamAvatarUploadUi();

  // Kick off parallel data loads
  loadTeams();
  loadTeamInvites();
  loadFeaturePosts();

  if (isFeedbackAdmin()) {
    document.getElementById("feedbackAdminSection").classList.remove("hidden");
    loadAdminFeedback();
  }

  maybeShowGuestNotice();
}

init();
