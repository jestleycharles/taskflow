/**
 * dashboard/profile.js
 * --------------------
 * User profile modal: avatar presets, custom avatar upload, username/email/
 * password update.
 *
 * Depends on: state.js, modals.js, api.js, avatar-utils.js
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the preset whose URL matches the user's current avatar_url.
 * @param {string|null} url
 * @returns {string|null} preset id
 */
window.matchPresetId = function matchPresetId(url) {
  if (!url) return null;
  const found = window.avatarPresets.find(
    (p) => p.url === url || url.endsWith(p.url),
  );
  return found?.id || null;
};

async function loadAvatarPresets() {
  const r = await apiFetch("/api/profile/avatars");
  if (r.ok) window.avatarPresets = await parseJsonResponse(r);
}

function renderAvatarPresetGrid() {
  const grid = document.getElementById("avatarPresetGrid");
  const activeId =
    window.selectedPresetId || matchPresetId(window.currentUser?.avatar_url);

  grid.innerHTML = window.avatarPresets
    .map(
      (p) => `
      <button type="button" onclick="selectAvatarPreset('${p.id}')"
        class="avatar-preset-btn w-10 h-10 rounded-full overflow-hidden p-0 border border-white/10 ${activeId === p.id ? "selected" : ""}"
        title="${escHtml(p.label)}">
        <img src="${escHtml(p.url)}" alt="" class="w-full h-full object-cover" />
      </button>`,
    )
    .join("");
}

function updateProfileAvatarPreview() {
  applyAvatarToElement(
    document.getElementById("profileAvatarPreview"),
    window.currentUser,
  );
}

// ---------------------------------------------------------------------------
// Error / success banners inside the modal
// ---------------------------------------------------------------------------

function hideProfileMessages() {
  document.getElementById("profileError").classList.add("hidden");
  document.getElementById("profileSuccess").classList.add("hidden");
}

function showProfileError(msg) {
  const el = document.getElementById("profileError");
  el.textContent = msg;
  el.classList.remove("hidden");
  document.getElementById("profileSuccess").classList.add("hidden");
}

function showProfileSuccess(msg) {
  const el = document.getElementById("profileSuccess");
  el.textContent = msg;
  el.classList.remove("hidden");
  document.getElementById("profileError").classList.add("hidden");
}

// ---------------------------------------------------------------------------
// Public: open / close
// ---------------------------------------------------------------------------

window.openProfileModal = async function openProfileModal() {
  if (window.currentUser?.is_guest) return;

  hideProfileMessages();
  document.getElementById("profileUsername").value =
    window.currentUser.username;
  document.getElementById("profileEmail").value = window.currentUser.email;
  document.getElementById("profileCurrentPassword").value = "";
  document.getElementById("profileNewPassword").value = "";
  document.getElementById("avatarUploadStatus").classList.add("hidden");

  window.selectedPresetId = matchPresetId(window.currentUser.avatar_url);
  if (!window.avatarPresets.length) await loadAvatarPresets();
  renderAvatarPresetGrid();
  updateProfileAvatarPreview();

  document.getElementById("profileModal").classList.remove("hidden");
  pushDashboardOverlay("profile");
  setTimeout(() => document.getElementById("profileUsername").focus(), 50);
};

window.closeProfileModal = function closeProfileModal() {
  document.getElementById("profileModal").classList.add("hidden");
  hideProfileMessages();
};

// ---------------------------------------------------------------------------
// Avatar preset selection
// ---------------------------------------------------------------------------

window.selectAvatarPreset = async function selectAvatarPreset(presetId) {
  hideProfileMessages();
  const status = document.getElementById("avatarUploadStatus");
  status.textContent = "Saving avatar…";
  status.classList.remove("hidden");

  const r = await apiFetch("/api/profile/avatar/preset", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preset: presetId }),
  });
  const d = await parseJsonResponse(r);
  status.classList.add("hidden");

  if (d.error) return showProfileError(d.error);

  window.currentUser = d.user;
  window.selectedPresetId = presetId;
  renderNavUser();
  window.DirectChat?.onUserUpdated(window.currentUser);
  renderAvatarPresetGrid();
  updateProfileAvatarPreview();
  showProfileSuccess("Avatar updated.");
};

// ---------------------------------------------------------------------------
// Custom avatar upload
// ---------------------------------------------------------------------------

document
  .getElementById("avatarFileInput")
  ?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    hideProfileMessages();
    const status = document.getElementById("avatarUploadStatus");
    status.textContent = "Uploading…";
    status.classList.remove("hidden");

    const form = new FormData();
    form.append("avatar", file);

    const r = await apiFetch("/api/profile/avatar/upload", {
      method: "POST",
      body: form,
    });
    const d = await parseJsonResponse(r);
    status.classList.add("hidden");

    if (d.error) return showProfileError(d.error);

    window.currentUser = d.user;
    window.selectedPresetId = null;
    renderNavUser();
    window.DirectChat?.onUserUpdated(window.currentUser);
    renderAvatarPresetGrid();
    updateProfileAvatarPreview();
    showProfileSuccess("Custom avatar uploaded.");
  });

// ---------------------------------------------------------------------------
// Save profile (username / email / password)
// ---------------------------------------------------------------------------

window.saveProfile = async function saveProfile() {
  if (window.profileSaving || window.currentUser?.is_guest) return;

  hideProfileMessages();

  const username = document.getElementById("profileUsername").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  const current_password = document.getElementById(
    "profileCurrentPassword",
  ).value;
  const new_password = document.getElementById("profileNewPassword").value;

  const btn = document.getElementById("profileSaveBtn");
  window.profileSaving = true;
  btn.disabled = true;
  btn.textContent = "Saving…";

  const body = { username, email };
  if (new_password) {
    if (new_password.length < 8) {
      window.profileSaving = false;
      btn.disabled = false;
      btn.textContent = "Save changes";
      return showProfileError("New password must be at least 8 characters");
    }
    body.current_password = current_password;
    body.new_password = new_password;
  }

  const r = await apiFetch("/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await parseJsonResponse(r);

  window.profileSaving = false;
  btn.disabled = false;
  btn.textContent = "Save changes";

  if (d.error) return showProfileError(d.error);

  window.currentUser = d.user;
  renderNavUser();
  window.DirectChat?.onUserUpdated(window.currentUser);
  document.getElementById("profileCurrentPassword").value = "";
  document.getElementById("profileNewPassword").value = "";
  showProfileSuccess("Profile saved.");
  setTimeout(closeProfileModal, 1200);
};

// ---------------------------------------------------------------------------
// Expose loadAvatarPresets so init.js can pre-warm it
// ---------------------------------------------------------------------------

window.loadAvatarPresets = loadAvatarPresets;
