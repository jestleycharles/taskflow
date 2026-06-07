/**
 * dashboard/tasksplit.js
 * Create TaskSplit expense workspace modal.
 */

function resetCreateTaskSplitDraft() {
  const defaultPreset = window.avatarPresets[0];
  window.createTaskSplitDraft = {
    presetId: defaultPreset?.id || null,
    avatar_url: defaultPreset?.url || null,
    pendingFile: null,
  };
}

function renderCreateTaskSplitAvatarGrid() {
  const grid = document.getElementById("createTaskSplitAvatarGrid");
  if (!grid) return;
  const activeId = window.createTaskSplitDraft.pendingFile
    ? null
    : window.createTaskSplitDraft.presetId;

  grid.innerHTML = window.avatarPresets
    .map(
      (p) => `
      <button type="button" onclick="selectCreateTaskSplitPreset('${p.id}')"
        class="avatar-preset-btn w-10 h-10 rounded-xl overflow-hidden p-0 border border-white/10 ${activeId === p.id ? "selected" : ""}"
        title="${escHtml(p.label)}">
        <img src="${escHtml(p.url)}" alt="" class="w-full h-full object-cover" />
      </button>`,
    )
    .join("");
}

function updateCreateTaskSplitPreview() {
  const el = document.getElementById("createTaskSplitAvatarPreview");
  const name =
    document.getElementById("taskSplitName")?.value.trim() || "TaskSplit";

  if (window.createTaskSplitDraft.pendingFile) {
    el.innerHTML = "";
    el.style.background = "";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(window.createTaskSplitDraft.pendingFile);
    img.alt = "";
    img.className = "w-full h-full object-cover";
    el.appendChild(img);
    return;
  }

  applyTeamAvatarToElement(el, {
    name,
    avatar_color: "#10b981",
    avatar_url: window.createTaskSplitDraft.avatar_url,
  });
}

window.openCreateTaskSplitModal = async function openCreateTaskSplitModal() {
  document.getElementById("taskSplitModalError")?.classList.add("hidden");
  document.getElementById("taskSplitName").value = "";
  document.getElementById("taskSplitDesc").value = "";
  document.getElementById("createTaskSplitAvatarFile").value = "";
  document.getElementById("taskSplitMode").value = "solo";

  if (!window.avatarPresets.length) await window.loadAvatarPresets();
  resetCreateTaskSplitDraft();
  renderCreateTaskSplitAvatarGrid();
  updateCreateTaskSplitPreview();
  applyGuestTaskSplitAvatarUi();

  document.getElementById("createTaskSplitModal").classList.remove("hidden");
  pushDashboardOverlay("createTaskSplit");
  setTimeout(() => document.getElementById("taskSplitName").focus(), 50);
};

window.closeCreateTaskSplitModal = function closeCreateTaskSplitModal() {
  document.getElementById("createTaskSplitModal").classList.add("hidden");
};

window.selectCreateTaskSplitPreset = function selectCreateTaskSplitPreset(
  presetId,
) {
  const preset = window.avatarPresets.find((p) => p.id === presetId);
  if (!preset) return;
  window.createTaskSplitDraft.presetId = presetId;
  window.createTaskSplitDraft.avatar_url = preset.url;
  window.createTaskSplitDraft.pendingFile = null;
  renderCreateTaskSplitAvatarGrid();
  updateCreateTaskSplitPreview();
};

function applyGuestTaskSplitAvatarUi() {
  const guest = !!window.currentUser?.is_guest;
  const label = document.getElementById("createTaskSplitAvatarUploadLabel");
  const note = document.getElementById("createTaskSplitAvatarGuestNote");
  const input = document.getElementById("createTaskSplitAvatarFile");
  if (label) label.classList.toggle("hidden", guest);
  if (note) note.classList.toggle("hidden", !guest);
  if (input && guest) input.value = "";
}

function setCreateTaskSplitBtnLoading(loading, label) {
  const btn = document.getElementById("createTaskSplitBtn");
  if (!btn) return;
  if (loading) {
    if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
    btn.disabled = true;
    btn.classList.add("btn-loading", "inline-flex", "items-center", "justify-center", "gap-2");
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${label || "Creating…"}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove("btn-loading", "inline-flex", "items-center", "justify-center", "gap-2");
    btn.textContent = btn.dataset.origText || "Create TaskSplit";
    delete btn.dataset.origText;
  }
}

window.createTaskSplit = async function createTaskSplit() {
  if (window.createTaskSplitSaving) return;

  const name = document.getElementById("taskSplitName").value.trim();
  const errEl = document.getElementById("taskSplitModalError");
  if (!name) {
    errEl.textContent = "Workspace name is required";
    errEl.classList.remove("hidden");
    return;
  }

  const desc = document.getElementById("taskSplitDesc").value.trim();
  const expenseMode = document.getElementById("taskSplitMode").value;
  const body = {
    name,
    description: desc,
    workspace_type: "expense",
    expense_mode: expenseMode,
  };

  if (
    !window.createTaskSplitDraft.pendingFile &&
    window.createTaskSplitDraft.avatar_url
  ) {
    body.avatar_url = window.createTaskSplitDraft.avatar_url;
  }

  window.createTaskSplitSaving = true;
  setCreateTaskSplitBtnLoading(true, "Creating…");

  const r = await apiFetch("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await parseJsonResponse(r);

  if (d.error) {
    window.createTaskSplitSaving = false;
    setCreateTaskSplitBtnLoading(false);
    errEl.textContent = d.error;
    errEl.classList.remove("hidden");
    return;
  }

  if (window.createTaskSplitDraft.pendingFile && !window.currentUser?.is_guest) {
    setCreateTaskSplitBtnLoading(true, "Uploading avatar…");
    const form = new FormData();
    form.append("avatar", window.createTaskSplitDraft.pendingFile);
    const upR = await apiFetch(`/api/teams/${d.id}/avatar/upload`, {
      method: "POST",
      body: form,
    });
    const upD = await parseJsonResponse(upR);
    if (!upR.ok) {
      window.createTaskSplitSaving = false;
      setCreateTaskSplitBtnLoading(false);
      errEl.textContent = upD.error || "Created but avatar upload failed";
      errEl.classList.remove("hidden");
      closeCreateTaskSplitModal();
      showTeamsLoading();
      await loadTeams();
      return;
    }
  }

  window.createTaskSplitSaving = false;
  setCreateTaskSplitBtnLoading(false);
  closeCreateTaskSplitModal();
  setNavigatingAway(true);
  window.location = `/tasksplit/${d.id}`;
};

document.getElementById("createTaskSplitAvatarFile")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  window.createTaskSplitDraft.pendingFile = file;
  window.createTaskSplitDraft.presetId = null;
  renderCreateTaskSplitAvatarGrid();
  updateCreateTaskSplitPreview();
});

document.getElementById("taskSplitName")?.addEventListener("input", () => {
  if (!document.getElementById("createTaskSplitModal").classList.contains("hidden")) {
    updateCreateTaskSplitPreview();
  }
});
