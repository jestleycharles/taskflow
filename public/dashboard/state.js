/**
 * dashboard/state.js
 * ------------------
 * Shared mutable state and tiny utility helpers used across all dashboard
 * modules.  Import-order matters: this file must be loaded before any other
 * dashboard module.
 */

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

/** @type {object|null} The signed-in user object returned by /api/me */
window.currentUser = null;

/** @type {Array<{id,url,label}>} Avatar preset list fetched from the API */
window.avatarPresets = [];

/** @type {string|null} Currently selected preset id in the profile modal */
window.selectedPresetId = null;

/** @type {boolean} Prevents double-submitting the profile save form */
window.profileSaving = false;

/** Draft state for the "Create team" modal */
window.createTeamDraft = {
  presetId: null,
  avatar_url: null,
  pendingFile: null,
};

/** @type {boolean} Prevents double-submitting the create-team form */
window.createTeamSaving = false;

/** @type {Array} Kanban board type presets fetched from the API */
window.kanbanPresets = [];

/** @type {Array} Teams belonging to the current user */
window.teamsList = [];

/** @type {Array} Pending team invites for the current user */
window.teamInvitesList = [];

/** Key prefix used to hint whether the user has pending invites */
window.TEAM_INVITES_HINT_KEY = "taskflow_dashboard_team_invites";

/** Set of team ids that currently have someone online */
window.onlineTeamIds = new Set();

/** setInterval handle for the team-online polling loop */
window.teamOnlinePollInterval = null;

/** How often (ms) to poll online presence per team */
window.TEAM_ONLINE_POLL_MS = 4000;

/** Cache for the /features.md parsed feature list */
window.registeredFeaturesCache = null;

// History-navigation guard used by the popstate handler
window.dashboardHistoryPopping = false;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string so it is safe to embed in HTML attribute or text content.
 * @param {*} str
 * @returns {string}
 */
window.escHtml = function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};
