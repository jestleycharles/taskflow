/**
 * dashboard/feedback-admin.js
 * ---------------------------
 * Admin-only feedback inbox: paginated list of user bug reports and
 * suggestions, with search and server-side pagination.
 *
 * Depends on: state.js, api.js
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

window.isFeedbackAdmin = function isFeedbackAdmin() {
  return !!window.currentUser?.is_feedback_admin;
};

function formatFeedbackDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso || "";
  }
}

function renderFeedbackAdminItem(row) {
  const isBug = row.category === "bug";
  const badge = isBug
    ? '<span class="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">Bug</span>'
    : '<span class="text-xs px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30">Feedback</span>';
  const who =
    escHtml(row.username || "Unknown") +
    (row.user_email
      ? ` <span class="text-gray-500">(${escHtml(row.user_email)})</span>`
      : "");

  return `<article class="bg-ink-800 border border-white/10 rounded-2xl p-4">
    <div class="flex flex-wrap items-center gap-2 mb-2">${badge}<span class="text-xs text-gray-500">${escHtml(formatFeedbackDate(row.created_at))}</span></div>
    <p class="text-xs text-gray-400 mb-2">${who}</p>
    <p class="text-sm text-gray-200 whitespace-pre-wrap break-words">${escHtml(row.message)}</p>
  </article>`;
}

function updateFeedbackAdminPager(payload) {
  const pager = document.getElementById("feedbackAdminPager");
  const meta = document.getElementById("feedbackAdminMeta");
  const prevBtn = document.getElementById("feedbackAdminPrevBtn");
  const nextBtn = document.getElementById("feedbackAdminNextBtn");
  const pageLabel = document.getElementById("feedbackAdminPageLabel");

  const showPager =
    payload.total > 0 &&
    (payload.hasPrev || payload.hasNext || payload.totalPages > 1);
  pager.classList.toggle("hidden", !showPager);
  prevBtn.disabled = !payload.hasPrev;
  nextBtn.disabled = !payload.hasNext;
  pageLabel.textContent = `Page ${payload.page} of ${payload.totalPages}`;

  const qNote = feedbackAdminQuery ? ` matching "${feedbackAdminQuery}"` : "";
  meta.classList.toggle("hidden", payload.total === 0);
  meta.textContent =
    payload.total === 0
      ? feedbackAdminQuery
        ? "No results for this search."
        : ""
      : `${payload.total} submission${payload.total === 1 ? "" : "s"}${qNote} - 20 per page`;
}

// ---------------------------------------------------------------------------
// Pagination state
// ---------------------------------------------------------------------------

let feedbackAdminPage = 1;
let feedbackAdminQuery = "";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

window.loadAdminFeedback = async function loadAdminFeedback() {
  if (!window.isFeedbackAdmin()) return;

  const list = document.getElementById("feedbackAdminList");
  list.innerHTML = '<p class="text-sm text-gray-500">Loading…</p>';

  const params = new URLSearchParams({ page: String(feedbackAdminPage) });
  if (feedbackAdminQuery) params.set("q", feedbackAdminQuery);

  const r = await apiFetch(`/api/feedback?${params}`);
  const payload = await parseJsonResponse(r);

  if (!r.ok) {
    document.getElementById("feedbackAdminPager").classList.add("hidden");
    document.getElementById("feedbackAdminMeta").classList.add("hidden");
    list.innerHTML = `<p class="text-sm text-red-400">${escHtml(payload?.error || "Could not load feedback")}</p>`;
    return;
  }

  const rows = payload.items || [];
  feedbackAdminPage = payload.page || 1;
  updateFeedbackAdminPager(payload);

  if (!rows.length) {
    list.innerHTML = `<p class="text-sm text-gray-500 text-center py-8">${feedbackAdminQuery ? "No matching submissions." : "No submissions yet."}</p>`;
    return;
  }
  list.innerHTML = rows.map(renderFeedbackAdminItem).join("");
};

window.searchAdminFeedback = function searchAdminFeedback(e) {
  e.preventDefault();
  feedbackAdminQuery = document
    .getElementById("feedbackAdminSearchInput")
    .value.trim();
  feedbackAdminPage = 1;
  document
    .getElementById("feedbackAdminSearchClearBtn")
    .classList.toggle("hidden", !feedbackAdminQuery);
  loadAdminFeedback();
};

window.clearAdminFeedbackSearch = function clearAdminFeedbackSearch() {
  feedbackAdminQuery = "";
  feedbackAdminPage = 1;
  document.getElementById("feedbackAdminSearchInput").value = "";
  document
    .getElementById("feedbackAdminSearchClearBtn")
    .classList.add("hidden");
  loadAdminFeedback();
};

window.feedbackAdminGoPage = function feedbackAdminGoPage(delta) {
  feedbackAdminPage = Math.max(1, feedbackAdminPage + delta);
  loadAdminFeedback();
};
