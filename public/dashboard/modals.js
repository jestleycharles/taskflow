/**
 * dashboard/modals.js
 * -------------------
 * Generic overlay helpers:
 *  - Confirm modal  (showConfirm / closeConfirmModal / runConfirmAction)
 *  - Alert modal    (showAlert / closeAlertModal)
 *  - Mobile back-button integration (pushDashboardOverlay, etc.)
 *
 * Depends on: state.js  (dashboardHistoryPopping, TF_VIEWPORT global)
 */

// ---------------------------------------------------------------------------
// Back-button / history helpers
// ---------------------------------------------------------------------------

/**
 * Returns the name of the top-most open overlay, or null.
 * Order matters: the list is from highest z-index to lowest.
 * @returns {string|null}
 */
window.getTopDashboardOverlay = function getTopDashboardOverlay() {
  const hidden = (id) =>
    document.getElementById(id)?.classList.contains("hidden");

  if (!hidden("confirmModal")) return "confirm";
  if (!hidden("alertModal")) return "alert";
  if (!hidden("inviteLinkModal")) return "inviteLink";
  if (!hidden("guestNoticeModal")) return "guestNotice";
  if (!hidden("feedbackModal")) return "feedback";
  if (!hidden("featurePostImageModal")) return "featurePostImage";
  if (!hidden("profileModal")) return "profile";
  if (!hidden("createModal")) return "createTeam";
  if (!hidden("dmBlockedEmailsModal")) return "dmBlockedEmails";
  if (!hidden("dmBlockedEmailStartModal")) return "dmBlockedEmailStart";
  return null;
};

/**
 * Push a history entry so the mobile back button closes the overlay.
 * Only active on mobile viewports.
 * @param {string} name  Overlay identifier (same strings used by getTopDashboardOverlay)
 */
window.pushDashboardOverlay = function pushDashboardOverlay(name) {
  if (!window.TF_VIEWPORT?.isMobile?.()) return;
  if (window.dashboardHistoryPopping) return;
  history.pushState({ tfDashOverlay: name, t: Date.now() }, "");
};

/** Triggers a history.back() which will fire the popstate → close logic. */
window.requestCloseDashboardOverlay = function requestCloseDashboardOverlay() {
  if (!window.TF_VIEWPORT?.isMobile?.()) return;
  if (getTopDashboardOverlay()) history.back();
};

/**
 * Calls the correct close function for a named overlay.
 * @param {string} overlay
 */
window.closeDashboardOverlayUi = async function closeDashboardOverlayUi(
  overlay,
) {
  switch (overlay) {
    case "confirm":
      closeConfirmModal();
      break;
    case "alert":
      closeAlertModal();
      break;
    case "inviteLink":
      closeInviteLinkModal();
      break;
    case "guestNotice":
      dismissGuestNotice();
      break;
    case "feedback":
      closeFeedbackModal();
      break;
    case "featurePostImage":
      closeFeaturePostImagePreview();
      break;
    case "profile":
      closeProfileModal();
      break;
    case "createTeam":
      closeCreateModal();
      break;
    case "dmBlockedEmails":
      window.closeBlockedEmailsModal?.({ syncHistory: false });
      break;
    case "dmBlockedEmailStart":
      window.closeBlockedEmailStartModal?.({ syncHistory: false });
      break;
  }
};

// ---------------------------------------------------------------------------
// Confirm modal
// ---------------------------------------------------------------------------

let confirmCallback = null;

/**
 * Show the generic confirm dialog.
 * @param {{ title: string, message: string, confirmLabel?: string, danger?: boolean, onConfirm: Function }} opts
 */
window.showConfirm = function showConfirm({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
}) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;

  const btn = document.getElementById("confirmActionBtn");
  btn.textContent = confirmLabel;
  btn.className = danger
    ? "flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-xl transition text-sm"
    : "flex-1 bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-xl transition text-sm";

  confirmCallback = onConfirm;
  document.getElementById("confirmModal").classList.remove("hidden");
  pushDashboardOverlay("confirm");
};

window.closeConfirmModal = function closeConfirmModal() {
  document.getElementById("confirmModal").classList.add("hidden");
  confirmCallback = null;
};

window.runConfirmAction = function runConfirmAction() {
  const cb = confirmCallback;
  closeConfirmModal();
  if (cb) cb();
};

// ---------------------------------------------------------------------------
// Alert modal
// ---------------------------------------------------------------------------

/**
 * Show a simple informational alert.
 * @param {string} message
 * @param {string} [title]
 */
window.showAlert = function showAlert(message, title = "Something went wrong") {
  document.getElementById("alertTitle").textContent = title;
  document.getElementById("alertMessage").textContent = message;
  document.getElementById("alertModal").classList.remove("hidden");
  pushDashboardOverlay("alert");
};

window.closeAlertModal = function closeAlertModal() {
  document.getElementById("alertModal").classList.add("hidden");
};

// ---------------------------------------------------------------------------
// Global popstate handler (mobile back button)
// ---------------------------------------------------------------------------

window.addEventListener("popstate", () => {
  if (window.DirectChat?.handlePopState?.()) return;
  if (!window.dashboardHistoryPopping) resetTransientNavigationUi?.();
  if (!window.TF_VIEWPORT?.isMobile?.()) return;

  if (window.dashboardHistoryPopping) {
    window.dashboardHistoryPopping = false;
    return;
  }

  const overlay = getTopDashboardOverlay();
  if (overlay) closeDashboardOverlayUi(overlay);
});
