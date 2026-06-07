/**
 * taskflow/members.js
 * Team members, roles, mentions, and message formatting.
 * Depends on: state.js, helpers.js
 */

const PRIORITY_CONFIG = {
  urgent: { label: '🔴 Urgent', color: 'text-red-400', bg: 'bg-red-500/10 text-red-400' },
  high:   { label: '🟠 High',   color: 'text-orange-400', bg: 'bg-orange-500/10 text-orange-400' },
  medium: { label: '🟡 Medium', color: 'text-yellow-400', bg: 'bg-yellow-500/10 text-yellow-400' },
  low:    { label: '🟢 Low',    color: 'text-green-400', bg: 'bg-green-500/10 text-green-400' },
};

const ROLE_PRESET_COLORS = ['#4f6ef7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
let editingTeamRoleId = null;
let draggingTeamRoleId = null;

function normalizeRoleHex(value) {
  const raw = String(value || '').trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash.toLowerCase() : null;
}

function getTeamMember(userId) {
  if (!userId || !teamData?.members) return null;
  return teamData.members.find((m) => String(m.id) === String(userId)) || null;
}

function memberDisplayColor(member) {
  if (!member || member.role === 'owner') return null;
  return member.custom_role?.color_hex || null;
}

function memberNameHtml(memberOrUser, userId, extraClass = '') {
  const member = memberOrUser?.role != null ? memberOrUser : getTeamMember(userId || memberOrUser?.id);
  const user = member || memberOrUser;
  if (!user?.username) return `<span class="${extraClass}">?</span>`;
  const crown = member?.role === 'owner' ? '👑 ' : '';
  const color = memberDisplayColor(member);
  const style = color ? ` style="color:${escHtml(color)}"` : '';
  const cls = ['font-medium', extraClass].filter(Boolean).join(' ');
  return `<span class="${cls}"${style}>${crown}${escHtml(user.username)}</span>`;
}

const GUEST_EMAIL = 'guest@taskflow.app';
const GUEST_PROTECTED_TEAM_ID = '6acdf622-2137-4339-a910-d1e9ec5eac7f';

function isGuestProtectedTeam() {
  return teamId === GUEST_PROTECTED_TEAM_ID;
}

function isGuestAuthor(userId) {
  const member = getTeamMember(userId);
  return (member?.email || '').toLowerCase() === GUEST_EMAIL;
}

function formatMessageBodyHtml(content) {
  return MessageFormat.formatMessageContentHtml(content, teamData, escHtml);
}

function formatCommentBodyHtml(comment) {
  const content = comment?.content;
  if (isGuestAuthor(comment?.user_id)) {
    const text = MessageFormat.applyTextEmojis(String(content ?? ''));
    return escHtml(text).replace(/\n/g, '<br>');
  }
  return formatMessageBodyHtml(content);
}

function messageMentionsCurrentUser(content) {
  return MessageFormat.messageMentionsUserId(content, currentUser?.id, teamData);
}

function showGuestMentionAlert() {
  showAlert('Guest accounts cannot use the mention feature.', 'Mentions unavailable');
}

function initGuestCommentMentionGuard() {
  const input = document.getElementById('commentInput');
  if (!input || input.dataset.guestMentionGuard) return;
  input.dataset.guestMentionGuard = '1';
  input.addEventListener('keydown', (e) => {
    if (!isGuest() || e.key !== '@' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    showGuestMentionAlert();
  });
  input.addEventListener('input', () => {
    if (!isGuest()) return;
    const caret = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1) return;
    const between = before.slice(at + 1);
    if (/\s/.test(between)) return;
    input.value = input.value.slice(0, at) + input.value.slice(caret);
    input.setSelectionRange(at, at);
    showGuestMentionAlert();
  });
}

function prepareOutgoingMessage(content) {
  return MessageFormat.applyTextEmojis(String(content || '').trim());
}

let openMentionRolePopover = null;
let mentionRolePress = null;
const MENTION_ROLE_LONG_PRESS_MS = 450;

function getMentionRoleMembers(el) {
  const ids = (el.dataset.mentionMembers || '').split(',').filter(Boolean);
  return (teamData?.members || []).filter((m) => ids.some((id) => String(id) === String(m.id)));
}

function closeMentionRolePopover() {
  openMentionRolePopover = null;
  const layer = document.getElementById('mentionFloatLayer');
  if (layer) layer.innerHTML = '';
}

function positionMentionFloat(floatEl, anchorEl) {
  if (!anchorEl) return;
  const layer = document.getElementById('mentionFloatLayer');
  floatEl.style.position = 'fixed';
  floatEl.style.visibility = 'hidden';
  floatEl.style.left = '0';
  floatEl.style.top = '0';
  layer.appendChild(floatEl);
  const anchor = anchorEl.getBoundingClientRect();
  const fh = floatEl.offsetHeight;
  const fw = floatEl.offsetWidth;
  let top = anchor.bottom + 6;
  let left = anchor.left;
  if (top + fh > window.innerHeight - 8) top = Math.max(8, anchor.top - fh - 6);
  if (left + fw > window.innerWidth - 8) left = window.innerWidth - fw - 8;
  if (left < 8) left = 8;
  floatEl.style.top = `${top}px`;
  floatEl.style.left = `${left}px`;
  floatEl.style.visibility = 'visible';
}

function showMentionRolePopover(anchorEl) {
  const members = getMentionRoleMembers(anchorEl);
  const roleName = anchorEl.textContent.replace(/^@/, '').trim();
  openMentionRolePopover = { anchor: anchorEl };
  const layer = document.getElementById('mentionFloatLayer');
  layer.innerHTML = '';
  const pop = document.createElement('div');
  pop.className = 'mention-role-popover rounded-xl bg-ink-700 border border-white/15 p-3 min-w-[10rem] max-w-[16rem] max-h-48 overflow-y-auto';
  pop.onclick = (e) => e.stopPropagation();
  pop.innerHTML = members.length
    ? `<p class="text-xs font-medium text-white mb-2">@${escHtml(roleName)} · ${members.length}</p>
       <ul class="space-y-2">${members.map((m) => `
         <li class="flex items-center gap-2">
           ${userAvatarHtml(m, 'w-6 h-6')}
           <span class="text-sm truncate">${memberNameHtml(m, m.id, 'text-sm')}</span>
         </li>`).join('')}</ul>`
    : `<p class="text-xs text-gray-400">@${escHtml(roleName)} — no members</p>`;
  positionMentionFloat(pop, anchorEl);
}

function clearMentionRolePress() {
  if (mentionRolePress?.timer) clearTimeout(mentionRolePress.timer);
  mentionRolePress = null;
}

function initMentionComposers() {
  if (isGuest()) return;
  const ctx = () => teamData;
  ['chatInput', 'commentInput', 'expenseCommentInput'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) MentionAutocomplete.attach(el, ctx);
  });
}

function attachMentionAutocompleteToEditTextarea(textarea) {
  if (!textarea || textarea.dataset.mentionAttached || isGuest()) return;
  textarea.dataset.mentionAttached = '1';
  MentionAutocomplete.attach(textarea, () => teamData);
}

function memberRoleLabelHtml(member) {
  if (!member || teamData?.separate_role_members) return '';
  if (member.role === 'owner') {
    return '<p class="text-[10px] uppercase tracking-wider text-brand-500 font-semibold mb-0.5">owner</p>';
  }
  if (member.custom_role) {
    const c = escHtml(member.custom_role.color_hex);
    const n = escHtml(member.custom_role.name);
    return `<p class="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style="color:${c}">${n}</p>`;
  }
  return '';
}

function sortMembersForDisplay(members) {
  const list = [...(members || [])].filter((m) => !m.pending);
  const owners = list.filter((m) => m.role === 'owner');
  const rest = list.filter((m) => m.role !== 'owner');
  const roles = teamData?.roles || [];
  const ordered = [...owners];
  for (const role of roles) {
    ordered.push(...rest.filter((m) => m.custom_role_id === role.id));
  }
  ordered.push(...rest.filter((m) => !m.custom_role_id));
  const pending = (members || []).filter((m) => m.pending);
  return [...ordered, ...pending];
}

function buildMemberDisplaySections(members) {
  const list = members || [];
  const pending = list.filter((m) => m.pending);
  const active = list.filter((m) => !m.pending);
  if (!teamData?.separate_role_members) {
    const sections = [{ title: null, titleColor: null, members: sortMembersForDisplay(active) }];
    if (pending.length) sections.push({ title: 'Pending', titleColor: '#f59e0b', members: pending });
    return sections;
  }
  const sections = [];
  const owners = active.filter((m) => m.role === 'owner');
  if (owners.length) sections.push({ title: 'Owner', titleColor: '#f59e0b', members: owners });
  for (const role of teamData.roles || []) {
    const ms = active.filter((m) => m.custom_role_id === role.id);
    if (ms.length) sections.push({ title: role.name, titleColor: role.color_hex, members: ms });
  }
  const unassigned = active.filter((m) => m.role !== 'owner' && !m.custom_role_id);
  if (unassigned.length) sections.push({ title: 'Members', titleColor: '#9ca3af', members: unassigned });
  if (pending.length) sections.push({ title: 'Pending', titleColor: '#f59e0b', members: pending });
  return sections;
}

function memberRowHtml(m, options = {}) {
  const { showAssign = false, showRemove = false, showPermissionRole = true } = options;
  const isPending = !!m.pending;
  const assignBlock = showAssign && !isPending && (teamData?.roles?.length || 0) > 0 && m.role !== 'owner'
    ? `<select class="assign-role-select mt-1 w-full bg-ink-700 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:border-brand-500" data-user-id="${m.id}">
        <option value="">No role</option>
        ${(teamData.roles || []).map((r) => `<option value="${r.id}" ${m.custom_role_id === r.id ? 'selected' : ''}>${escHtml(r.name)}</option>`).join('')}
      </select>`
    : '';
  const invitedByLine = isPending && m.invited_by_user?.username
    ? `<p class="text-xs text-amber-400/80 mt-0.5">Invited by ${escHtml(m.invited_by_user.username)}${m.invited_by_user.email ? ` (${escHtml(m.invited_by_user.email)})` : ''}</p>`
    : '';
  const permBadge = isPending
    ? `<span class="text-xs px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-400 bg-amber-500/10 shrink-0">pending</span>`
    : showPermissionRole && !m.custom_role && m.role !== 'owner'
      ? `<span class="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-400">${m.role}</span>`
      : showPermissionRole && m.role === 'owner'
        ? ''
        : '';
  const removeBtn = showRemove && !isPending && m.role !== 'owner'
    ? `<button type="button" class="remove-member-btn text-gray-500 hover:text-red-400 transition p-1.5 rounded-lg hover:bg-red-500/10" data-user-id="${m.id}" data-username="${escHtml(m.username)}" title="Remove member">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>`
    : showRemove && isPending
      ? `<button type="button" class="cancel-invite-btn text-gray-500 hover:text-red-400 transition p-1.5 rounded-lg hover:bg-red-500/10" data-user-id="${m.id}" data-username="${escHtml(m.username)}" title="Cancel invite">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>`
      : '';
  return `<div class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 ${isPending ? 'opacity-80' : ''}">
      ${memberAvatarHtml(m, 'w-8 h-8')}
      <div class="flex-1 min-w-0">
        ${isPending ? '' : memberRoleLabelHtml(m)}
        <p class="text-sm truncate">${memberNameHtml(m)}</p>
        <p class="text-xs text-gray-500 truncate">${escHtml(m.email)}</p>
        ${invitedByLine}
        ${assignBlock}
      </div>
      ${permBadge}
      ${removeBtn}
    </div>`;
}

function renderMemberSectionsHtml(members, rowOptions) {
  const sections = buildMemberDisplaySections(members);
  return sections.map((section, idx) => {
    const header = section.title
      ? `<p class="text-xs font-semibold uppercase tracking-wider mb-2 ${idx ? 'mt-4' : ''}" style="color:${escHtml(section.titleColor || '#9ca3af')}">${escHtml(section.title)}</p>`
      : '';
    const rows = section.members.map((m) => memberRowHtml(m, rowOptions)).join('');
    return `${header}${rows}`;
  }).join('');
}

function canAssignTeamRoles() {
  return teamData?.userRole === 'owner' && (teamData?.roles?.length || 0) > 0;
}

function membersWithPending(members) {
  const pending = (teamData?.pending_invites || []).map((p) => ({ ...p, pending: true }));
  return [...(members || []), ...pending];
}

function teamRoleStateSignature(data) {
  if (!data) return '';
  const roles = (data.roles || [])
    .map((r) => `${r.id}:${r.name}:${r.color_hex}:${r.sort_order}`)
    .join('|');
  const members = (data.members || [])
    .map((m) => `${m.id}:${m.role}:${m.custom_role_id || ''}`)
    .join('|');
  const pending = (data.pending_invites || [])
    .map((p) => `${p.id}:${p.invite_id || ''}`)
    .join('|');
  return `${data.separate_role_members ? 1 : 0}#${roles}#${members}#${pending}`;
}

let teamRoleStateSig = '';

function captureTeamRoleStateSig() {
  teamRoleStateSig = teamRoleStateSignature(teamData);
}

function applyCurrentUserTeamRoleUi() {
  if (!teamData) return;
  const isOwner = teamData.userRole === 'owner';
  document.getElementById('settingsNavBtn')?.classList.toggle('hidden', !isOwner);
  if (!isOwner && !document.getElementById('settingsPanel')?.classList.contains('hidden')) {
    closeSettingsPanelUi();
  }
  applyMembershipActionsUi();
}

function refreshTeamRoleVisuals() {
  if (!teamData) return;
  if (typeof renderMemberAvatars === 'function') renderMemberAvatars(teamData.members);
  if (typeof renderMemberList === 'function') renderMemberList(teamData.members);
  if (typeof populateAssigneeDropdowns === 'function') populateAssigneeDropdowns(teamData.members);
  applyCurrentUserTeamRoleUi();
  const rolesModal = document.getElementById('teamRolesModal');
  if (rolesModal && !rolesModal.classList.contains('hidden')) {
    syncSeparateRoleToggleUi();
    renderTeamRolesList();
  }
  if (typeof tasks !== 'undefined' && tasks?.length && typeof renderTaskflow === 'function') renderTaskflow();
  if (chatMessages.length && chatPanelOpen) renderChatMessages();
  if (typeof activeExpenseId !== 'undefined' && activeExpenseId && expenseComments?.length && typeof renderExpenseComments === 'function') {
    renderExpenseComments();
  }
  if (typeof activeTaskId !== 'undefined' && activeTaskId && !document.getElementById('taskModal')?.classList.contains('hidden')) {
    const task = tasks?.find((t) => t.id === activeTaskId);
    if (task?.creator) {
      document.getElementById('detailCreator').innerHTML = memberNameHtml(
        task.creator, task.creator.id, 'text-sm text-gray-300'
      );
    }
    const commentsEl = document.getElementById('commentsList');
    if (commentsEl && taskComments?.length && typeof renderComments === 'function') {
      renderComments();
    }
  }
}

async function pollTeamRoleState() {
  const r = await apiFetch(`/api/teams/${teamId}`);
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    if (isTeamAccessLostResponse(r.status, data)) showTeamGoneModal();
    return;
  }
  if (!data?.members) return;
  data.roles = data.roles || [];
  data.columns = data.columns || [];
  data.separate_role_members = !!data.separate_role_members;
  const prevColumns = typeof teamColumns !== 'undefined' ? teamColumns : [];
  const columnsChanged = typeof columnsStructureSig === 'function'
    && columnsStructureSig(data.columns) !== columnsStructureSig(prevColumns);
  const userRoleChanged = data.userRole != null && data.userRole !== teamData.userRole;
  const sig = teamRoleStateSignature(data);
  if (sig === teamRoleStateSig && !columnsChanged && !userRoleChanged) return;
  teamRoleStateSig = sig;
  if (data.userRole != null) teamData.userRole = data.userRole;
  teamData.members = data.members;
  teamData.roles = data.roles;
  teamData.separate_role_members = data.separate_role_members;
  teamData.pending_invites = data.pending_invites || [];
  if (data.member_count != null) teamData.member_count = data.member_count;
  if (data.owner_is_guest != null) teamData.owner_is_guest = data.owner_is_guest;
  if (columnsChanged && typeof teamColumns !== 'undefined') {
    teamColumns = data.columns;
    teamData.columns = data.columns;
    if (typeof renderKanbanBoard === 'function') renderKanbanBoard();
    if (typeof populateStatusDropdowns === 'function') populateStatusDropdowns();
    if (typeof renderTaskflow === 'function') renderTaskflow();
    const colModal = document.getElementById('columnMgmtModal');
    if (colModal && !colModal.classList.contains('hidden') && typeof renderColumnMgmtList === 'function') {
      renderColumnMgmtList();
    }
  }
  refreshTeamRoleVisuals();
  applyInviteSectionState();
  ensureTaskflowTasksRendered();
}

function syncSeparateRoleToggleUi(checkedOverride) {
  const on = checkedOverride !== undefined ? !!checkedOverride : !!teamData?.separate_role_members;
  const input = document.getElementById('separateRoleMembersToggle');
  const track = document.getElementById('separateRoleMembersTrack');
  const knob = document.getElementById('separateRoleMembersKnob');
  if (!input || !track || !knob) return;
  input.checked = on;
  track.classList.toggle('bg-brand-500', on);
  track.classList.toggle('bg-white/10', !on);
  knob.style.transform = on ? 'translateX(1.25rem)' : 'translateX(0)';
}

function showTeamRolesError(msg) {
  const el = document.getElementById('teamRolesError');
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function renderTeamRoleColorSwatches(activeHex) {
  const hex = normalizeRoleHex(activeHex) || ROLE_PRESET_COLORS[0];
  document.getElementById('teamRoleColorSwatches').innerHTML = ROLE_PRESET_COLORS.map((c) =>
    `<button type="button" class="role-color-swatch w-8 h-8 rounded-lg border border-white/10 ${c === hex ? 'selected' : ''}" style="background:${c}" data-hex="${c}" title="${c}"></button>`
  ).join('');
  document.getElementById('teamRoleColorPicker').value = hex;
  document.getElementById('teamRoleHexInput').value = hex;
}

function setTeamRoleFormColor(hex) {
  const normalized = normalizeRoleHex(hex);
  if (!normalized) return;
  renderTeamRoleColorSwatches(normalized);
}

function renderColumnColorSwatches(activeHex) {
  const hex = normalizeRoleHex(activeHex) || ROLE_PRESET_COLORS[0];
  document.getElementById('columnColorSwatches').innerHTML = ROLE_PRESET_COLORS.map((c) =>
    `<button type="button" class="role-color-swatch w-8 h-8 rounded-lg border border-white/10 ${c === hex ? 'selected' : ''}" style="background:${c}" data-hex="${c}" title="${c}"></button>`
  ).join('');
  document.getElementById('columnColorPicker').value = hex;
  document.getElementById('columnHexInput').value = hex;
}

function setColumnFormColor(hex) {
  const normalized = normalizeRoleHex(hex);
  if (!normalized) return;
  renderColumnColorSwatches(normalized);
}

function resetTeamRoleForm() {
  editingTeamRoleId = null;
  document.getElementById('teamRoleNameInput').value = '';
  document.getElementById('teamRoleFormTitle').textContent = 'Add role';
  document.getElementById('teamRoleSaveBtn').textContent = 'Add role';
  document.getElementById('teamRoleFormCancelBtn').classList.add('hidden');
  renderTeamRoleColorSwatches(ROLE_PRESET_COLORS[0]);
  showTeamRolesError('');
}

function showTeamRolesListLoading() {
  const listEl = document.getElementById('teamRolesList');
  const emptyEl = document.getElementById('teamRolesEmpty');
  if (!listEl) return;
  emptyEl?.classList.add('hidden');
  listEl.innerHTML = settingsMgmtListSkeletonHtml();
}

async function refreshTeamRolesList() {
  showTeamRolesListLoading();
  const r = await apiFetch(`/api/teams/${teamId}`);
  const data = await parseJsonResponse(r);
  if (r.ok && data) {
    data.roles = data.roles || [];
    teamData.roles = data.roles;
    if (data.separate_role_members != null) {
      teamData.separate_role_members = !!data.separate_role_members;
    }
    captureTeamRoleStateSig();
  }
  renderTeamRolesList();
}

function renderTeamRolesList() {
  const roles = teamData?.roles || [];
  const listEl = document.getElementById('teamRolesList');
  const emptyEl = document.getElementById('teamRolesEmpty');
  if (!roles.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  listEl.innerHTML = roles.map((r) => `
    <div class="team-role-row flex items-center gap-2 p-2.5 rounded-xl bg-ink-700/60 border border-white/10"
      draggable="true" data-role-id="${r.id}">
      <button type="button" class="role-drag-handle text-gray-500 hover:text-gray-300 p-1 cursor-grab" title="Drag to reorder" tabindex="-1">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 11-.001 4.001A2 2 0 017 2zm0 6a2 2 0 11-.001 4.001A2 2 0 017 8zm0 6a2 2 0 11-.001 4.001A2 2 0 017 14zm6-12a2 2 0 11-.001 4.001A2 2 0 0113 2zm0 6a2 2 0 11-.001 4.001A2 2 0 0113 8zm0 6a2 2 0 11-.001 4.001A2 2 0 0113 14z"/></svg>
      </button>
      <span class="w-4 h-4 rounded-md shrink-0 border border-white/10" style="background:${escHtml(r.color_hex)}"></span>
      <span class="flex-1 text-sm text-white truncate">${escHtml(r.name)}</span>
      <button type="button" class="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/10" onclick="editTeamRole('${r.id}')" title="Edit">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
      </button>
      <button type="button" class="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10" onclick="deleteTeamRole('${r.id}')" title="Delete">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>`).join('');
  bindTeamRoleDragRows();
}

function bindTeamRoleDragRows() {
  const rows = document.querySelectorAll('#teamRolesList .team-role-row');
  rows.forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      draggingTeamRoleId = row.dataset.roleId;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      draggingTeamRoleId = null;
      rows.forEach((r) => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggingTeamRoleId || row.dataset.roleId === draggingTeamRoleId) return;
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const targetId = row.dataset.roleId;
      if (!draggingTeamRoleId || targetId === draggingTeamRoleId) return;
      const ids = (teamData.roles || []).map((r) => r.id);
      const from = ids.indexOf(draggingTeamRoleId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      ids.splice(from, 1);
      ids.splice(to, 0, draggingTeamRoleId);
      showTeamRolesListLoading();
      const r = await apiFetch(`/api/teams/${teamId}/roles/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleIds: ids }),
      });
      const d = await r.json();
      if (!r.ok) {
        showTeamRolesError(d.error || 'Failed to reorder roles');
        renderTeamRolesList();
        return;
      }
      teamData.roles = d;
      renderTeamRolesList();
      captureTeamRoleStateSig();
      refreshTeamRoleVisuals();
    });
  });
}

async function openTeamRolesModal() {
  if (teamData?.userRole !== 'owner') return;
  showTeamRolesError('');
  syncSeparateRoleToggleUi();
  resetTeamRoleForm();
  resetTeamRoleAddDrawer();
  document.getElementById('teamRolesModal').classList.remove('hidden');
  pushTaskflowOverlay('teamRoles');
  await refreshTeamRolesList();
}

function closeTeamRolesModal() {
  document.getElementById('teamRolesModal').classList.add('hidden');
  resetTeamRoleForm();
  resetTeamRoleAddDrawer();
}

function showColumnMgmtError(msg) {
  const el = document.getElementById('columnMgmtError');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function resetColumnForm() {
  editingColumnId = null;
  document.getElementById('columnNameInput').value = '';
  renderColumnColorSwatches(ROLE_PRESET_COLORS[0]);
  document.getElementById('columnFormTitle').textContent = 'Add column';
  document.getElementById('columnSaveBtn').textContent = 'Add column';
  document.getElementById('columnFormCancelBtn').classList.add('hidden');
  showColumnMgmtError('');
}

function showColumnMgmtListLoading() {
  const listEl = document.getElementById('columnMgmtList');
  const emptyEl = document.getElementById('columnMgmtEmpty');
  if (!listEl) return;
  emptyEl?.classList.add('hidden');
  listEl.innerHTML = settingsMgmtListSkeletonHtml();
}

async function refreshColumnMgmtList() {
  showColumnMgmtListLoading();
  const r = await apiFetch(`/api/teams/${teamId}/columns`);
  const cols = await parseJsonResponse(r);
  if (r.ok && Array.isArray(cols)) {
    teamColumns = cols;
    teamData.columns = cols;
  }
  renderColumnMgmtList();
}

function renderColumnMgmtList() {
  const cols = getTeamColumns();
  const listEl = document.getElementById('columnMgmtList');
  const emptyEl = document.getElementById('columnMgmtEmpty');
  if (!cols.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  listEl.innerHTML = cols.map((c) => `
    <div class="column-mgmt-row flex items-center gap-2 p-2.5 rounded-xl bg-ink-700/60 border border-white/10"
      draggable="true" data-column-id="${c.id}">
      <button type="button" class="text-gray-500 hover:text-gray-300 p-1 cursor-grab" title="Drag to reorder" tabindex="-1">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 11-.001 4.001A2 2 0 017 2zm0 6a2 2 0 11-.001 4.001A2 2 0 017 8zm0 6a2 2 0 11-.001 4.001A2 2 0 017 14zm6-12a2 2 0 11-.001 4.001A2 2 0 0113 2zm0 6a2 2 0 11-.001 4.001A2 2 0 0113 8zm0 6a2 2 0 11-.001 4.001A2 2 0 0113 14z"/></svg>
      </button>
      <span class="w-4 h-4 rounded-md shrink-0 border border-white/10" style="background:${escHtml(c.color_hex)}"></span>
      <span class="flex-1 text-sm text-white truncate">${escHtml(c.name)}</span>
      <button type="button" class="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/10" onclick="editColumn('${c.id}')" title="Edit">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
      </button>
      <button type="button" class="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10" onclick="deleteColumn('${c.id}')" title="Delete">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>`).join('');
  bindColumnDragRows();
}

function bindColumnDragRows() {
  const rows = document.querySelectorAll('#columnMgmtList .column-mgmt-row');
  rows.forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      draggedColumnId = row.dataset.columnId;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      draggedColumnId = null;
      rows.forEach((r) => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedColumnId || row.dataset.columnId === draggedColumnId) return;
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const targetId = row.dataset.columnId;
      if (!draggedColumnId || targetId === draggedColumnId) return;
      const ids = getTeamColumns().map((c) => c.id);
      const from = ids.indexOf(draggedColumnId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      ids.splice(from, 1);
      ids.splice(to, 0, draggedColumnId);
      showColumnMgmtListLoading();
      const r = await apiFetch(`/api/teams/${teamId}/columns/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnIds: ids }),
      });
      const d = await parseJsonResponse(r);
      if (!r.ok) {
        showColumnMgmtError(d.error || 'Failed to reorder columns');
        renderColumnMgmtList();
        return;
      }
      teamColumns = d;
      teamData.columns = d;
      renderColumnMgmtList();
      renderKanbanBoard();
      populateStatusDropdowns();
      renderTaskflow();
    });
  });
}

async function openColumnMgmtModal() {
  if (teamData?.userRole !== 'owner') return;
  resetColumnForm();
  resetColumnAddDrawer();
  document.getElementById('columnMgmtModal').classList.remove('hidden');
  pushTaskflowOverlay('columnMgmt');
  await refreshColumnMgmtList();
}

function closeColumnMgmtModal() {
  document.getElementById('columnMgmtModal').classList.add('hidden');
  resetColumnForm();
  resetColumnAddDrawer();
}

function editColumn(columnId) {
  const col = getTeamColumns().find((c) => c.id === columnId);
  if (!col) return;
  editingColumnId = columnId;
  document.getElementById('columnNameInput').value = col.name;
  setColumnFormColor(col.color_hex || ROLE_PRESET_COLORS[0]);
  document.getElementById('columnFormTitle').textContent = 'Edit column';
  document.getElementById('columnSaveBtn').textContent = 'Save column';
  document.getElementById('columnFormCancelBtn').classList.remove('hidden');
  showColumnMgmtError('');
  setColumnAddDrawerOpen(true);
}

async function saveColumn() {
  const name = document.getElementById('columnNameInput').value.trim();
  const color = normalizeRoleHex(document.getElementById('columnHexInput').value) || ROLE_PRESET_COLORS[0];
  if (!name) {
    showColumnMgmtError('Column name is required');
    return;
  }
  const btn = document.getElementById('columnSaveBtn');
  btn.disabled = true;
  showColumnMgmtListLoading();
  const url = editingColumnId
    ? `/api/teams/${teamId}/columns/${editingColumnId}`
    : `/api/teams/${teamId}/columns`;
  const r = await apiFetch(url, {
    method: editingColumnId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color_hex: color }),
  });
  const d = await parseJsonResponse(r);
  btn.disabled = false;
  if (!r.ok) {
    showColumnMgmtError(d.error || 'Failed to save column');
    renderColumnMgmtList();
    return;
  }
  if (editingColumnId) {
    teamColumns = teamColumns.map((c) => (c.id === d.id ? d : c));
  } else {
    teamColumns = [...teamColumns, d];
  }
  teamData.columns = teamColumns;
  resetColumnForm();
  renderColumnMgmtList();
  renderKanbanBoard();
  populateStatusDropdowns();
  renderTaskflow();
}

function deleteColumn(columnId) {
  const col = getTeamColumns().find((c) => c.id === columnId);
  if (!col) return;
  if (getTeamColumns().length <= 2) {
    showAlert('Every team must keep at least two columns to organize work. These columns cannot be deleted.', 'Columns protected');
    return;
  }
  const others = getTeamColumns().filter((c) => c.id !== columnId);
  const moveTo = others[0];
  showConfirm({
    title: 'Delete column',
    message: `Delete "${col.name}"? Tasks in this column will move to "${moveTo.name}".`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => executeDeleteColumn(columnId, moveTo.slug),
  });
}

async function executeDeleteColumn(columnId, moveTasksTo) {
  showColumnMgmtListLoading();
  const r = await apiFetch(`/api/teams/${teamId}/columns/${columnId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ move_tasks_to: moveTasksTo }),
  });
  const d = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(d.error || 'Failed to delete column');
    renderColumnMgmtList();
    return;
  }
  teamColumns = teamColumns.filter((c) => c.id !== columnId);
  teamData.columns = teamColumns;
  await loadTasks();
  if (editingColumnId === columnId) resetColumnForm();
  renderColumnMgmtList();
  renderKanbanBoard();
  populateStatusDropdowns();
  renderTaskflow();
}

function editTeamRole(roleId) {
  const role = (teamData?.roles || []).find((r) => r.id === roleId);
  if (!role) return;
  editingTeamRoleId = roleId;
  document.getElementById('teamRoleNameInput').value = role.name;
  document.getElementById('teamRoleFormTitle').textContent = 'Edit role';
  document.getElementById('teamRoleSaveBtn').textContent = 'Save role';
  document.getElementById('teamRoleFormCancelBtn').classList.remove('hidden');
  renderTeamRoleColorSwatches(role.color_hex);
  showTeamRolesError('');
  setTeamRoleAddDrawerOpen(true);
}

async function saveTeamRole() {
  const name = document.getElementById('teamRoleNameInput').value.trim();
  const color = normalizeRoleHex(document.getElementById('teamRoleHexInput').value);
  if (!name) {
    showTeamRolesError('Role name is required');
    return;
  }
  if (!color) {
    showTeamRolesError('Enter a valid hex color like #4f6ef7');
    return;
  }
  const btn = document.getElementById('teamRoleSaveBtn');
  btn.disabled = true;
  showTeamRolesListLoading();
  const url = editingTeamRoleId
    ? `/api/teams/${teamId}/roles/${editingTeamRoleId}`
    : `/api/teams/${teamId}/roles`;
  const r = await apiFetch(url, {
    method: editingTeamRoleId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color_hex: color }),
  });
  const d = await r.json();
  btn.disabled = false;
  if (!r.ok) {
    showTeamRolesError(d.error || 'Failed to save role');
    renderTeamRolesList();
    return;
  }
  if (editingTeamRoleId) {
    teamData.roles = (teamData.roles || []).map((role) => role.id === d.id ? d : role);
    teamData.members = (teamData.members || []).map((m) =>
      m.custom_role_id === d.id ? { ...m, custom_role: d } : m
    );
  } else {
    teamData.roles = [...(teamData.roles || []), d];
  }
  resetTeamRoleForm();
  renderTeamRolesList();
  captureTeamRoleStateSig();
  refreshTeamRoleVisuals();
}

function deleteTeamRole(roleId) {
  const role = (teamData?.roles || []).find((r) => r.id === roleId);
  if (!role) return;
  showConfirm({
    title: 'Delete role',
    message: `Delete the "${role.name}" role? Members with this role will be unassigned.`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => executeDeleteTeamRole(roleId),
  });
}

async function executeDeleteTeamRole(roleId) {
  showTeamRolesListLoading();
  const r = await apiFetch(`/api/teams/${teamId}/roles/${roleId}`, { method: 'DELETE' });
  const d = await r.json();
  if (!r.ok) {
    showAlert(d.error || 'Failed to delete role');
    renderTeamRolesList();
    return;
  }
  teamData.roles = (teamData.roles || []).filter((role) => role.id !== roleId);
  teamData.members = (teamData.members || []).map((m) =>
    m.custom_role_id === roleId ? { ...m, custom_role_id: null, custom_role: null } : m
  );
  if (editingTeamRoleId === roleId) resetTeamRoleForm();
  renderTeamRolesList();
  captureTeamRoleStateSig();
  refreshTeamRoleVisuals();
}

async function onSeparateRoleMembersToggle(checked) {
  syncSeparateRoleToggleUi(checked);
  const r = await apiFetch(`/api/teams/${teamId}/role-display`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ separate_role_members: checked }),
  });
  const d = await r.json();
  if (!r.ok) {
    showTeamRolesError(d.error || 'Failed to update display setting');
    syncSeparateRoleToggleUi();
    return;
  }
  teamData.separate_role_members = d.separate_role_members;
  captureTeamRoleStateSig();
  refreshTeamRoleVisuals();
}

async function assignMemberCustomRole(userId, roleId) {
  const r = await apiFetch(`/api/teams/${teamId}/members/${userId}/custom-role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_role_id: roleId || null }),
  });
  const d = await r.json();
  if (!r.ok) {
    showAlert(d.error || 'Failed to assign role');
    return;
  }
  if (typeof loadTeam === 'function') await loadTeam();
  else if (typeof reloadWorkspace === 'function') await reloadWorkspace();
}