/**
 * dashboard/teams.js
 * ------------------
 * Teams grid (load, render, navigate), team-online presence polling, and the
 * "Create Team" modal (avatar, kanban preset, name, description).
 *
 * Depends on: state.js, modals.js, api.js, avatar-utils.js
 */

// ---------------------------------------------------------------------------
// Skeleton HTML constants (used while data loads)
// ---------------------------------------------------------------------------

const TEAM_CARD_BODY_SKELETON_HTML = `
  <div class="flex items-start justify-between mb-4">
    <div class="skeleton w-11 h-11 rounded-xl"></div>
    <div class="skeleton w-14 h-5 rounded-full"></div>
  </div>
  <div class="skeleton w-2/3 h-4 mb-1"></div>
  <div class="skeleton w-full h-3 mb-1"></div>
  <div class="skeleton w-4/5 h-3 mb-4"></div>
  <div class="flex items-center justify-between">
    <div class="flex flex-col gap-0.5">
      <div class="skeleton w-20 h-3"></div>
      <div class="skeleton w-24 h-3"></div>
    </div>
    <div class="skeleton w-4 h-4 rounded"></div>
  </div>`;

const TEAMS_GRID_SKELETON_HTML = [0, 1, 2]
  .map(
    () =>
      `<div class="skeleton-card bg-ink-800 border border-white/10 rounded-2xl p-5">${TEAM_CARD_BODY_SKELETON_HTML}</div>`,
  )
  .join("");

// ---------------------------------------------------------------------------
// Online presence
// ---------------------------------------------------------------------------

function isTeamOnline(teamId) {
  return window.onlineTeamIds.has(String(teamId));
}

function teamAvatarWithPresenceHtml(team) {
  const online = isTeamOnline(team.id);
  return `<div class="relative shrink-0" title="${online ? "Someone is online" : escHtml(team.name)}">
    ${teamAvatarHtml(team, "w-11 h-11 text-sm")}
    ${online ? '<span class="online-dot absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-ink-800" title="Someone is online"></span>' : ""}
  </div>`;
}

async function fetchTeamOnlineStatus() {
  const r = await apiFetch("/api/teams/online");
  if (!r.ok) return;
  const ids = await parseJsonResponse(r);
  if (!Array.isArray(ids)) return;

  const next = new Set(ids.map(String));
  const changed =
    next.size !== window.onlineTeamIds.size ||
    [...next].some((id) => !window.onlineTeamIds.has(id)) ||
    [...window.onlineTeamIds].some((id) => !next.has(id));

  window.onlineTeamIds = next;
  if (changed && window.teamsList.length) updateTeamOnlineIndicators();
}

function updateTeamOnlineIndicators() {
  document.querySelectorAll(".team-card[data-team-id]").forEach((card) => {
    const teamId = card.dataset.teamId;
    const team = window.teamsList.find((t) => String(t.id) === String(teamId));
    if (!team) return;
    const avatarWrap = card.querySelector(".relative.shrink-0");
    if (!avatarWrap) return;
    avatarWrap.outerHTML = teamAvatarWithPresenceHtml(team);
  });
}

function stopTeamOnlinePoll() {
  clearInterval(window.teamOnlinePollInterval);
  window.teamOnlinePollInterval = null;
}

function startTeamOnlinePoll() {
  stopTeamOnlinePoll();
  if (!window.teamsList.length) return;
  fetchTeamOnlineStatus();
  window.teamOnlinePollInterval = setInterval(
    fetchTeamOnlineStatus,
    window.TEAM_ONLINE_POLL_MS,
  );
}

window.stopTeamOnlinePoll = stopTeamOnlinePoll;

// ---------------------------------------------------------------------------
// Teams grid rendering
// ---------------------------------------------------------------------------

/** Replace the grid with skeletons while a fresh load is in progress. */
window.showTeamsLoading = function showTeamsLoading() {
  stopTeamOnlinePoll();
  document.getElementById("teamsGrid").innerHTML = TEAMS_GRID_SKELETON_HTML;
};

/**
 * Navigate to a team board, showing a loading skeleton on the card first.
 * @param {string} teamId
 * @param {HTMLElement|null} cardEl
 */
window.beginOpeningTeam = function beginOpeningTeam(teamId, cardEl) {
  const team = window.teamsList.find((t) => String(t.id) === String(teamId));
  const isTaskSplit = team?.workspace_type === "expense";

  if (isTaskSplit && window.currentUser?.is_guest) {
    showAlert(
      "TaskSplit is available for registered accounts only.",
      "Registered account required",
    );
    return;
  }

  const dest = isTaskSplit ? `/tasksplit/${teamId}` : `/taskflow/${teamId}`;

  const grid = document.getElementById("teamsGrid");
  if (cardEl) {
    cardEl.classList.remove(
      "hover:border-white/20",
      "hover:bg-ink-700",
      "cursor-pointer",
    );
    cardEl.classList.add("pointer-events-none");
    cardEl.innerHTML = TEAM_CARD_BODY_SKELETON_HTML;
  }
  grid?.querySelectorAll(".team-card[data-team-id]").forEach((c) => {
    if (c !== cardEl) c.classList.add("pointer-events-none", "opacity-60");
  });
  setNavigatingAway(true);
  window.location = dest;
};

function isTaskSplitTeam(team) {
  return team?.workspace_type === "expense";
}

function teamTypeBadgeHtml(team) {
  if (isTaskSplitTeam(team)) {
    return `<span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">TaskSplit</span>`;
  }
  return `<span class="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/30 shrink-0">TaskFlow</span>`;
}

function teamCardTitleHtml(team) {
  const modeIcon =
    isTaskSplitTeam(team) && team.expense_mode
      ? taskSplitModeIconHtml(team.expense_mode)
      : "";
  return `<div class="flex items-center gap-1.5 mb-1 min-w-0">
    ${modeIcon}
    <h3 class="text-white font-semibold truncate">${escHtml(team.name)}</h3>
    ${teamTypeBadgeHtml(team)}
  </div>`;
}

function renderTeamsGrid() {
  const grid = document.getElementById("teamsGrid");
  grid.innerHTML = "";

  if (!window.teamsList.length) {
    stopTeamOnlinePoll();
    grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div class="w-16 h-16 bg-ink-800 border border-white/10 rounded-2xl flex items-center justify-center mb-4">
        <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <p class="text-gray-300 font-medium mb-1">No teams yet</p>
      <p class="text-gray-500 text-sm mb-5">Create your first team to get started.</p>
      <button onclick="openCreateModal('task')" class="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition">Create a team</button>
    </div>`;
    return;
  }

  window.teamsList.forEach((team, i) => {
    const card = document.createElement("div");
    card.className =
      "team-card bg-ink-800 border border-white/10 hover:border-white/20 rounded-2xl p-5 cursor-pointer transition-all hover:bg-ink-700 fade-up";
    card.style.animationDelay = `${i * 0.07}s`;
    card.dataset.teamId = team.id;
    card.onclick = () => beginOpeningTeam(team.id, card);
    card.innerHTML = `
      <div class="flex items-start justify-between mb-4">
        ${teamAvatarWithPresenceHtml(team)}
        <span class="text-xs px-2.5 py-1 rounded-full border ${team.role === "owner" ? "border-brand-500/40 text-brand-500 bg-brand-500/10" : "border-white/10 text-gray-400 bg-white/5"}">${team.role}</span>
      </div>
      ${teamCardTitleHtml(team)}
      <p class="text-gray-500 text-sm mb-4 line-clamp-2">${escHtml(team.description || "No description")}</p>
      <div class="flex items-center justify-between">
        <div class="flex flex-col gap-0.5">
          <span class="text-gray-600 text-xs">${new Date(team.created_at).toLocaleDateString()}</span>
          <span class="text-gray-500 text-xs" title="Members online">${memberStatsWithDotHtml(team.online_count ?? 0, team.member_count ?? 0)}</span>
        </div>
        <svg class="arrow w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>`;
    grid.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Load teams from API
// ---------------------------------------------------------------------------

window.loadTeams = async function loadTeams() {
  const r = await apiFetch("/api/teams");
  if (!r.ok) return;
  const teams = await parseJsonResponse(r);
  if (!Array.isArray(teams)) return;

  window.teamsList = teams.filter(
    (team) =>
      !window.currentUser?.is_guest || team.workspace_type !== "expense",
  );
  await fetchTeamOnlineStatus();
  renderTeamsGrid();
  startTeamOnlinePoll();
};

// Expose for page-restore after bfcache
window.tfResetPageNavigationUi = () => {
  if (window.teamsList.length) {
    renderTeamsGrid();
    updateTeamOnlineIndicators();
  }
};

window.addEventListener("pagehide", stopTeamOnlinePoll);

// ---------------------------------------------------------------------------
// Create Team modal
// ---------------------------------------------------------------------------

function resetCreateTeamDraft() {
  const defaultPreset = window.avatarPresets[0];
  window.createTeamDraft = {
    workspaceType: "task",
    presetId: defaultPreset?.id || null,
    avatar_url: defaultPreset?.url || null,
    pendingFile: null,
  };
}

function syncCreateTeamTypeUi() {
  const type =
    document.getElementById("teamWorkspaceType")?.value ||
    window.createTeamDraft?.workspaceType ||
    "task";
  const isExpense = type === "expense";

  document.getElementById("createTeamKanbanSection")?.classList.toggle(
    "hidden",
    isExpense,
  );
  document
    .getElementById("createTeamExpenseModeSection")
    ?.classList.toggle("hidden", !isExpense);

  const titleEl = document.getElementById("createModalTitle");
  const subtitleEl = document.getElementById("createModalSubtitle");
  const btn = document.getElementById("createTeamBtn");
  const nameInput = document.getElementById("teamName");

  if (titleEl) {
    titleEl.textContent = isExpense ? "New TaskSplit team" : "New TaskFlow team";
  }
  if (subtitleEl) {
    subtitleEl.textContent = isExpense
      ? "Track shared expenses with equal splits, running balances, and settle up."
      : "Set your team name, board type, and optional avatar.";
  }
  if (btn) {
    btn.textContent = "Create team";
    btn.className = isExpense
      ? "flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-xl transition text-sm"
      : "flex-1 bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-xl transition text-sm";
  }
  if (nameInput) {
    nameInput.placeholder = isExpense ? "e.g. Trip to Japan" : "e.g. Engineering";
  }

  updateCreateTeamPreview();
}

window.applyGuestTaskSplitUi = function applyGuestTaskSplitUi() {
  const guest = !!window.currentUser?.is_guest;
  document.getElementById("newTaskSplitBtn")?.classList.toggle("hidden", guest);
};

function renderCreateTeamAvatarPresetGrid() {
  const grid = document.getElementById("createTeamAvatarPresetGrid");
  const activeId = window.createTeamDraft.pendingFile
    ? null
    : window.createTeamDraft.presetId;

  grid.innerHTML = window.avatarPresets
    .map(
      (p) => `
      <button type="button" onclick="selectCreateTeamPreset('${p.id}')"
        class="avatar-preset-btn w-10 h-10 rounded-xl overflow-hidden p-0 border border-white/10 ${activeId === p.id ? "selected" : ""}"
        title="${escHtml(p.label)}">
        <img src="${escHtml(p.url)}" alt="" class="w-full h-full object-cover" />
      </button>`,
    )
    .join("");
}

function updateCreateTeamPreview() {
  const el = document.getElementById("createTeamAvatarPreview");
  const name = document.getElementById("teamName").value.trim() || "Team";

  if (window.createTeamDraft.pendingFile) {
    el.innerHTML = "";
    el.style.background = "";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(window.createTeamDraft.pendingFile);
    img.alt = "";
    img.className = "w-full h-full object-cover";
    el.appendChild(img);
    return;
  }

  applyTeamAvatarToElement(el, {
    name,
    avatar_color:
      window.createTeamDraft.workspaceType === "expense" ? "#10b981" : "#4f6ef7",
    avatar_url: window.createTeamDraft.avatar_url,
  });
}

async function loadKanbanPresets() {
  if (window.kanbanPresets.length) return;
  const r = await apiFetch("/api/kanban-presets");
  const data = await parseJsonResponse(r);
  if (r.ok && Array.isArray(data)) window.kanbanPresets = data;
}

function renderKanbanPresetSelect() {
  const sel = document.getElementById("teamKanbanPreset");
  if (!sel || !window.kanbanPresets.length) return;

  sel.innerHTML = window.kanbanPresets
    .map(
      (p) =>
        `<option value="${p.id}">${p.name} (${p.column_count} columns)</option>`,
    )
    .join("");

  updateKanbanPresetDescription();
}

window.updateKanbanPresetDescription =
  function updateKanbanPresetDescription() {
    const sel = document.getElementById("teamKanbanPreset");
    const desc = document.getElementById("teamKanbanPresetDesc");
    if (!sel || !desc) return;

    const preset = window.kanbanPresets.find((p) => p.id === sel.value);
    if (!preset) {
      desc.textContent = "";
      return;
    }

    const cols = (preset.columns || []).map((c) => c.name).join(" → ");
    desc.textContent = preset.description + (cols ? ` · ${cols}` : "");
  };

window.toggleCreateTeamOptional = function toggleCreateTeamOptional() {
  const content = document.getElementById("createTeamOptionalContent");
  const btn = document.getElementById("createTeamOptionalToggleBtn");
  const label = document.getElementById("createTeamOptionalLabel");
  const chevron = document.getElementById("createTeamOptionalChevron");
  if (!content) return;

  const open = content.classList.contains("hidden");
  content.classList.toggle("hidden", !open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn.classList.toggle("drawer-open", open);
  if (label) label.textContent = open ? "Fewer options" : "More options";
  if (chevron) chevron.style.transform = open ? "rotate(180deg)" : "";
};

function resetCreateTeamOptionalDrawer() {
  const content = document.getElementById("createTeamOptionalContent");
  const btn = document.getElementById("createTeamOptionalToggleBtn");
  const label = document.getElementById("createTeamOptionalLabel");
  const chevron = document.getElementById("createTeamOptionalChevron");

  if (content) content.classList.add("hidden");
  if (btn) {
    btn.setAttribute("aria-expanded", "false");
    btn.classList.remove("drawer-open");
  }
  if (label) label.textContent = "More options";
  if (chevron) chevron.style.transform = "";
}

/** Show/hide the custom-upload label for guests (guests can only use presets). */
window.applyGuestTeamAvatarUploadUi = function applyGuestTeamAvatarUploadUi() {
  const guest = !!window.currentUser?.is_guest;
  const label = document.getElementById("createTeamAvatarUploadLabel");
  const note = document.getElementById("createTeamAvatarUploadGuestNote");
  const input = document.getElementById("createTeamAvatarFile");
  const hint = document.querySelector(
    "#createModal .flex.items-center.gap-4.mb-4 .text-sm.text-gray-300",
  );
  if (label) label.classList.toggle("hidden", guest);
  if (note) note.classList.toggle("hidden", !guest);
  if (input && guest) input.value = "";
  if (hint)
    hint.textContent = guest
      ? "Choose a preset avatar"
      : "Choose a preset or upload your own";
};

window.openCreateModal = async function openCreateModal(workspaceType = "task") {
  if (workspaceType === "expense" && window.currentUser?.is_guest) {
    showAlert(
      "TaskSplit is available for registered accounts only.",
      "Registered account required",
    );
    return;
  }

  document.getElementById("modalError").classList.add("hidden");
  document.getElementById("teamName").value = "";
  document.getElementById("teamDesc").value = "";
  document.getElementById("createTeamAvatarFile").value = "";
  document.getElementById("teamExpenseMode").value = "solo";

  if (!window.avatarPresets.length) await window.loadAvatarPresets();
  resetCreateTeamDraft();
  window.createTeamDraft.workspaceType = workspaceType;
  document.getElementById("teamWorkspaceType").value = workspaceType;

  if (workspaceType === "task") {
    await loadKanbanPresets();
    renderKanbanPresetSelect();
  }

  renderCreateTeamAvatarPresetGrid();
  syncCreateTeamTypeUi();
  applyGuestTeamAvatarUploadUi();
  resetCreateTeamOptionalDrawer();

  document.getElementById("createModal").classList.remove("hidden");
  pushDashboardOverlay("createTeam");
  setTimeout(() => document.getElementById("teamName").focus(), 50);
};

window.closeCreateModal = function closeCreateModal() {
  document.getElementById("createModal").classList.add("hidden");
  document.getElementById("teamName").value = "";
  document.getElementById("teamDesc").value = "";
  document.getElementById("modalError").classList.add("hidden");
  resetCreateTeamOptionalDrawer();
};

window.selectCreateTeamPreset = function selectCreateTeamPreset(presetId) {
  const preset = window.avatarPresets.find((p) => p.id === presetId);
  if (!preset) return;
  window.createTeamDraft.presetId = presetId;
  window.createTeamDraft.avatar_url = preset.url;
  window.createTeamDraft.pendingFile = null;
  renderCreateTeamAvatarPresetGrid();
  updateCreateTeamPreview();
};

function setCreateTeamBtnLoading(loading, label) {
  const btn = document.getElementById("createTeamBtn");
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
    btn.disabled = true;
    btn.classList.add(
      "btn-loading",
      "inline-flex",
      "items-center",
      "justify-center",
      "gap-2",
    );
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${label || "Creating…"}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove(
      "btn-loading",
      "inline-flex",
      "items-center",
      "justify-center",
      "gap-2",
    );
    btn.textContent = btn.dataset.origText || "Create team";
    delete btn.dataset.origText;
  }
}

window.createTeam = async function createTeam() {
  if (window.createTeamSaving) return;

  const name = document.getElementById("teamName").value.trim();
  if (!name) {
    const el = document.getElementById("modalError");
    el.textContent = "Team name is required";
    el.classList.remove("hidden");
    return;
  }

  if (window.currentUser?.is_guest) {
    showConfirm({
      title: "Guest teams expire in 1 day",
      message:
        "Teams you create as a guest are automatically deleted after 24 hours. The default demo team is kept. Create a free registered account to keep your own teams permanently.",
      confirmLabel: "Create team anyway",
      onConfirm: () => executeCreateTeam(),
    });
    return;
  }

  await executeCreateTeam();
};

async function executeCreateTeam() {
  if (window.createTeamSaving) return;

  const name = document.getElementById("teamName").value.trim();
  if (!name) return;

  const desc = document.getElementById("teamDesc").value.trim();
  const workspaceType =
    document.getElementById("teamWorkspaceType")?.value || "task";
  const isExpense = workspaceType === "expense";
  const body = { name, description: desc };

  if (isExpense) {
    body.workspace_type = "expense";
    body.expense_mode =
      document.getElementById("teamExpenseMode")?.value || "solo";
  } else {
    body.kanban_preset =
      document.getElementById("teamKanbanPreset")?.value || "classic";
  }

  if (
    !window.createTeamDraft.pendingFile &&
    window.createTeamDraft.avatar_url
  ) {
    body.avatar_url = window.createTeamDraft.avatar_url;
  }

  window.createTeamSaving = true;
  setCreateTeamBtnLoading(true, "Creating…");

  const r = await apiFetch("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await parseJsonResponse(r);

  if (d.error) {
    window.createTeamSaving = false;
    setCreateTeamBtnLoading(false);
    const el = document.getElementById("modalError");
    el.textContent = d.error;
    el.classList.remove("hidden");
    return;
  }

  // Optional: upload a custom avatar file
  if (window.createTeamDraft.pendingFile && !window.currentUser?.is_guest) {
    setCreateTeamBtnLoading(true, "Uploading avatar…");
    const form = new FormData();
    form.append("avatar", window.createTeamDraft.pendingFile);

    const upR = await apiFetch(`/api/teams/${d.id}/avatar/upload`, {
      method: "POST",
      body: form,
    });
    const upD = await parseJsonResponse(upR);

    if (!upR.ok) {
      window.createTeamSaving = false;
      setCreateTeamBtnLoading(false);
      const el = document.getElementById("modalError");
      el.textContent = upD.error || "Team created but avatar upload failed";
      el.classList.remove("hidden");
      closeCreateModal();
      showTeamsLoading();
      await loadTeams();
      return;
    }
  }

  window.createTeamSaving = false;
  setCreateTeamBtnLoading(false);
  closeCreateModal();
  setNavigatingAway(true);
  window.location = isExpense ? `/tasksplit/${d.id}` : `/taskflow/${d.id}`;
}

// ---------------------------------------------------------------------------
// DOM event wiring for the create-modal inputs
// ---------------------------------------------------------------------------

document
  .getElementById("createTeamAvatarFile")
  ?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    window.createTeamDraft.pendingFile = file;
    window.createTeamDraft.presetId = null;
    renderCreateTeamAvatarPresetGrid();
    updateCreateTeamPreview();
  });

document.getElementById("teamName")?.addEventListener("input", () => {
  if (!document.getElementById("createModal").classList.contains("hidden")) {
    updateCreateTeamPreview();
  }
});

document
  .getElementById("teamKanbanPreset")
  ?.addEventListener("change", updateKanbanPresetDescription);
