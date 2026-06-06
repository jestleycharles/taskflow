/**
 * dashboard/team-invites.js
 * -------------------------
 * Team invite cards shown at the top of the dashboard — loading, rendering,
 * accepting, and declining pending invites.
 *
 * Depends on: state.js, modals.js, api.js, avatar-utils.js, teams.js
 */

// ---------------------------------------------------------------------------
// Session-storage hint (avoids a flash of empty space on cold loads)
// ---------------------------------------------------------------------------

const TEAM_INVITES_HINT_KEY = "taskflow_dashboard_team_invites";

function teamInvitesHintStorageKey() {
  return window.currentUser?.id
    ? `${TEAM_INVITES_HINT_KEY}:${window.currentUser.id}`
    : null;
}

function hasKnownTeamInvites() {
  const key = teamInvitesHintStorageKey();
  if (!key) return false;
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setKnownTeamInvites(hasInvites) {
  const key = teamInvitesHintStorageKey();
  if (!key) return;
  try {
    if (hasInvites) sessionStorage.setItem(key, "1");
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Skeleton HTML shown while the invite list loads
// ---------------------------------------------------------------------------

const TEAM_INVITE_CARD_SKELETON_HTML = `
  <div class="bg-ink-800 border border-amber-500/20 rounded-2xl p-5">
    <div class="flex items-start gap-3 mb-4">
      <div class="skeleton w-11 h-11 rounded-xl shrink-0"></div>
      <div class="flex-1 min-w-0 space-y-2">
        <div class="skeleton h-4 w-2/5 rounded"></div>
        <div class="skeleton h-3 w-full rounded"></div>
        <div class="skeleton h-3 w-4/5 rounded"></div>
      </div>
    </div>
    <div class="flex gap-2">
      <div class="skeleton flex-1 h-9 rounded-xl"></div>
      <div class="skeleton flex-1 h-9 rounded-xl"></div>
    </div>
  </div>`;

// ---------------------------------------------------------------------------
// Section visibility helpers
// ---------------------------------------------------------------------------

window.showTeamInvitesLoading = function showTeamInvitesLoading() {
  const section = document.getElementById("teamInvitesSection");
  const grid = document.getElementById("teamInvitesGrid");
  const countEl = document.getElementById("teamInvitesCount");
  if (!section || !grid || !countEl) return;

  section.classList.remove("hidden");
  countEl.innerHTML =
    '<span class="inline-block skeleton w-5 h-4 rounded align-middle"></span>';
  grid.innerHTML = TEAM_INVITE_CARD_SKELETON_HTML;
};

function hideTeamInvitesSection() {
  const section = document.getElementById("teamInvitesSection");
  const grid = document.getElementById("teamInvitesGrid");
  section?.classList.add("hidden");
  if (grid) grid.innerHTML = "";
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderTeamInvitesSection() {
  const section = document.getElementById("teamInvitesSection");
  const grid = document.getElementById("teamInvitesGrid");
  const countEl = document.getElementById("teamInvitesCount");

  if (!window.teamInvitesList.length) {
    hideTeamInvitesSection();
    return;
  }

  section.classList.remove("hidden");
  countEl.textContent = window.teamInvitesList.length;

  grid.innerHTML = window.teamInvitesList
    .map((invite, i) => {
      const team = invite.team || {};
      const inviter = invite.invited_by;
      const invitedByLine = inviter?.username
        ? `<p class="text-xs text-amber-400/90 mt-2">Invited by ${escHtml(inviter.username)}${inviter.email ? ` (${escHtml(inviter.email)})` : ""}</p>`
        : "";

      return `<div class="invite-card bg-ink-800 border border-amber-500/20 rounded-2xl p-5 fade-up" style="animation-delay:${i * 0.07}s">
        <div class="flex items-start gap-3 mb-4">
          ${teamAvatarHtml(team, "w-11 h-11 text-sm")}
          <div class="flex-1 min-w-0">
            <h3 class="text-white font-semibold truncate">${escHtml(team.name || "Team")}</h3>
            <p class="text-gray-500 text-sm line-clamp-3 mt-1">${escHtml(team.description || "No description")}</p>
            ${invitedByLine}
          </div>
        </div>
        <div class="flex gap-2">
          <button type="button" onclick="acceptTeamInvite('${invite.id}')"
            class="flex-1 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium py-2 rounded-xl transition">
            Accept
          </button>
          <button type="button" onclick="declineTeamInvite('${invite.id}')"
            class="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium py-2 rounded-xl transition">
            Decline
          </button>
        </div>
      </div>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

window.loadTeamInvites = async function loadTeamInvites() {
  if (!window.currentUser?.is_guest && hasKnownTeamInvites()) {
    showTeamInvitesLoading();
  }

  const r = await apiFetch("/api/team-invites");
  if (!r.ok) {
    hideTeamInvitesSection();
    return;
  }

  const invites = await parseJsonResponse(r);
  if (!Array.isArray(invites)) {
    hideTeamInvitesSection();
    return;
  }

  window.teamInvitesList = invites;
  setKnownTeamInvites(window.teamInvitesList.length > 0);
  renderTeamInvitesSection();
};

window.acceptTeamInvite = async function acceptTeamInvite(inviteId) {
  const card = document
    .querySelector(
      `.invite-card button[onclick="acceptTeamInvite('${inviteId}')"]`,
    )
    ?.closest(".invite-card");

  if (card)
    card.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
    });

  const r = await apiFetch(`/api/team-invites/${inviteId}/accept`, {
    method: "POST",
  });
  const d = await parseJsonResponse(r);

  if (!r.ok) {
    if (card)
      card.querySelectorAll("button").forEach((b) => {
        b.disabled = false;
      });
    return showAlert(d.error || "Failed to accept invite");
  }

  await loadTeamInvites();
  showTeamsLoading();
  await window.loadTeams();
};

window.declineTeamInvite = async function declineTeamInvite(inviteId) {
  const card = document
    .querySelector(
      `.invite-card button[onclick="declineTeamInvite('${inviteId}')"]`,
    )
    ?.closest(".invite-card");

  if (card)
    card.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
    });

  const r = await apiFetch(`/api/team-invites/${inviteId}/decline`, {
    method: "POST",
  });
  const d = await parseJsonResponse(r);

  if (!r.ok) {
    if (card)
      card.querySelectorAll("button").forEach((b) => {
        b.disabled = false;
      });
    return showAlert(d.error || "Failed to decline invite");
  }

  await loadTeamInvites();
};
