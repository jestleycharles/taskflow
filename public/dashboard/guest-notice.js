/**
 * dashboard/guest-notice.js
 * -------------------------
 * Guest account notice modal: shown once per guest session to explain the
 * shared-account limitations and list registered-account features.
 *
 * Depends on: state.js, modals.js, api.js
 */

// ---------------------------------------------------------------------------
// Session storage helpers
// ---------------------------------------------------------------------------

const GUEST_NOTICE_KEY = "taskflow_guest_dashboard_notice_dismissed";

function hasGuestDashboardNoticeDismissed() {
  try {
    return sessionStorage.getItem(GUEST_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

function setGuestDashboardNoticeDismissed() {
  try {
    sessionStorage.setItem(GUEST_NOTICE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clearGuestDashboardNotice() {
  try {
    sessionStorage.removeItem(GUEST_NOTICE_KEY);
  } catch {
    /* ignore */
  }
}
// Expose so logout() in init.js can call it
window.clearGuestDashboardNotice = clearGuestDashboardNotice;

// ---------------------------------------------------------------------------
// Features list (parsed from /features.md)
// ---------------------------------------------------------------------------

/**
 * Parse the "Registration benefits" section of features.md into an array of
 * HTML strings suitable for use as <li> inner-html.
 * @param {string} text  Raw markdown text
 * @returns {string[]}
 */
function parseFeaturesMarkdown(text) {
  const raw = String(text || "");
  const sectionMatch = raw.match(
    /##\s*Registration benefits\s*\n([\s\S]*?)(?=\n##\s|\n---\s*$|$)/i,
  );
  const section = sectionMatch ? sectionMatch[1] : raw;

  return section
    .split("\n")
    .map(
      (line) =>
        line.match(/^\s*-\s+\*\*(.+?)\*\*\s*[—–-]\s*(.+)$/) ||
        line.match(/^\s*-\s+(.+)$/),
    )
    .filter(Boolean)
    .map((m) =>
      m[2]
        ? `<span class="text-white font-medium">${escHtml(m[1])}</span><span class="text-gray-400"> — ${escHtml(m[2])}</span>`
        : escHtml(m[1]),
    );
}

async function loadRegisteredFeatures() {
  if (window.registeredFeaturesCache) return window.registeredFeaturesCache;
  try {
    const r = await fetch("/features.md", { cache: "no-store" });
    if (!r.ok) return [];
    const text = await r.text();
    window.registeredFeaturesCache = parseFeaturesMarkdown(text);
    return window.registeredFeaturesCache;
  } catch {
    return [];
  }
}

async function renderGuestNoticeFeatures() {
  const list = document.getElementById("guestNoticeFeaturesList");
  const items = await loadRegisteredFeatures();

  if (!items.length) {
    list.innerHTML =
      '<li class="text-gray-500 list-none -ml-0">Sign up to unlock private workspaces and collaboration tools.</li>';
    return;
  }
  list.innerHTML = items.map((html) => `<li>${html}</li>`).join("");
}

// ---------------------------------------------------------------------------
// Notice modal
// ---------------------------------------------------------------------------

function applyGuestNoticeActions() {
  const isGuest = !!window.currentUser?.is_guest;
  const registerBtn = document.getElementById("guestNoticeRegisterBtn");
  const dismissBtn = document.querySelector(
    '#guestNoticeModal button[onclick="dismissGuestNotice()"]',
  );
  if (registerBtn) registerBtn.classList.toggle("hidden", isGuest);
  if (dismissBtn) dismissBtn.classList.toggle("w-full", isGuest);
}

window.maybeShowGuestNotice = async function maybeShowGuestNotice() {
  if (!window.currentUser?.is_guest || hasGuestDashboardNoticeDismissed())
    return;
  await renderGuestNoticeFeatures();
  resetGuestNoticeFeaturesDrawer();
  applyGuestNoticeActions();
  document.getElementById("guestNoticeModal").classList.remove("hidden");
};

window.dismissGuestNotice = function dismissGuestNotice() {
  setGuestDashboardNoticeDismissed();
  document.getElementById("guestNoticeModal").classList.add("hidden");
  resetGuestNoticeFeaturesDrawer();
};

// ---------------------------------------------------------------------------
// Collapsible "registered account features" drawer inside the notice
// ---------------------------------------------------------------------------

window.toggleGuestNoticeFeatures = function toggleGuestNoticeFeatures() {
  const content = document.getElementById("guestNoticeFeaturesContent");
  const btn = document.getElementById("guestNoticeFeaturesToggleBtn");
  const label = document.getElementById("guestNoticeFeaturesLabel");
  const chevron = document.getElementById("guestNoticeFeaturesChevron");
  if (!content || !btn) return;

  const open = content.classList.contains("hidden");
  content.classList.toggle("hidden", !open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn.classList.toggle("drawer-open", open);
  if (label)
    label.textContent = open ? "Hide features" : "Registered account features";
  if (chevron) chevron.style.transform = open ? "rotate(180deg)" : "";
};

function resetGuestNoticeFeaturesDrawer() {
  const content = document.getElementById("guestNoticeFeaturesContent");
  const btn = document.getElementById("guestNoticeFeaturesToggleBtn");
  const label = document.getElementById("guestNoticeFeaturesLabel");
  const chevron = document.getElementById("guestNoticeFeaturesChevron");

  if (content) content.classList.add("hidden");
  if (btn) {
    btn.setAttribute("aria-expanded", "false");
    btn.classList.remove("drawer-open");
  }
  if (label) label.textContent = "Registered account features";
  if (chevron) chevron.style.transform = "";
}
