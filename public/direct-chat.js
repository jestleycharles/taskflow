/**
 * Direct messages UI for dashboard (registered users only).
 * Expects: apiFetch, parseJsonResponse, userAvatarHtml, escHtml from page scripts.
 */
(function () {
  const DM_POLL_MS = 4000;
  const APP_PRESENCE_PING_MS = 15000;
  const DM_ONLINE_POLL_MS = 4000;
  const REACTION_LONG_PRESS_MS = 450;

  const REACTION_EMOJIS = {
    love: '❤️', money: '🤑', ok: '👍', haha: '😂', sad: '😢', angry: '😠',
    fire: '🔥', clap: '👏', think: '🤔', party: '🎉', eyes: '👀', hundred: '💯',
  };

  let currentUser = null;
  let enabled = false;
  let panelOpen = false;
  let view = 'list';
  let activeConversationId = null;
  let activeConversation = null;
  let conversations = [];
  let dmMessages = [];
  let dmLastReadAt = 0;
  let dmReadPersistTimer = null;
  let dmPollInterval = null;
  let convPollInterval = null;
  let editingDmId = null;
  let dmEditDraft = '';
  let dmViewingOriginalId = null;
  let openReactionPicker = null;
  let openReactorsPopover = null;
  let reactionPress = null;
  let newConvError = '';
  let conversationsLoaded = false;
  let eventsBound = false;
  let dmSettings = { blocked_emails: [], blocked_user_ids: [], ignored_user_ids: [] };
  let blockedEmailStartTarget = null;
  let headerAvatarMenuOpen = false;
  let dialogConfirmCallback = null;

  function ensureDialogModals() {
    if (document.getElementById('tfConfirmModal')) return;
    const overlayClass = 'modal-overlay absolute inset-0 bg-black/60';
    const wrap = (id, inner) => {
      const el = document.createElement('div');
      el.id = id;
      el.className = 'hidden fixed inset-0 z-[70] flex items-center justify-center px-4';
      el.innerHTML = inner;
      document.body.appendChild(el);
      return el;
    };
    wrap('tfConfirmModal', `
      <div class="${overlayClass}" data-tf-close-confirm></div>
      <div class="relative bg-ink-800 border border-white/15 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 id="tfConfirmTitle" class="text-base font-semibold text-white mb-2"></h2>
        <p id="tfConfirmMessage" class="text-sm text-gray-400 leading-relaxed mb-6"></p>
        <div class="flex gap-3">
          <button type="button" data-tf-close-confirm class="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 py-2.5 rounded-xl transition text-sm">Cancel</button>
          <button type="button" id="tfConfirmActionBtn" class="flex-1 text-white font-medium py-2.5 rounded-xl transition text-sm">Confirm</button>
        </div>
      </div>`);
    wrap('tfAlertModal', `
      <div class="${overlayClass}" data-tf-close-alert></div>
      <div class="relative bg-ink-800 border border-white/15 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 id="tfAlertTitle" class="text-base font-semibold text-white mb-2">Something went wrong</h2>
        <p id="tfAlertMessage" class="text-sm text-gray-400 leading-relaxed mb-6"></p>
        <button type="button" data-tf-close-alert class="w-full bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-xl transition text-sm">OK</button>
      </div>`);
    document.querySelectorAll('[data-tf-close-confirm]').forEach((el) => {
      el.addEventListener('click', closeBuiltinConfirm);
    });
    document.getElementById('tfConfirmActionBtn')?.addEventListener('click', runBuiltinConfirm);
    document.querySelectorAll('[data-tf-close-alert]').forEach((el) => {
      el.addEventListener('click', closeBuiltinAlert);
    });
  }

  function closeBuiltinConfirm() {
    document.getElementById('tfConfirmModal')?.classList.add('hidden');
    dialogConfirmCallback = null;
  }

  function runBuiltinConfirm() {
    const cb = dialogConfirmCallback;
    closeBuiltinConfirm();
    if (cb) cb();
  }

  function closeBuiltinAlert() {
    document.getElementById('tfAlertModal')?.classList.add('hidden');
  }

  function builtinShowConfirm({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
    ensureDialogModals();
    document.getElementById('tfConfirmTitle').textContent = title;
    document.getElementById('tfConfirmMessage').textContent = message;
    const btn = document.getElementById('tfConfirmActionBtn');
    btn.textContent = confirmLabel;
    btn.className = danger
      ? 'flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2.5 rounded-xl transition text-sm'
      : 'flex-1 bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 rounded-xl transition text-sm';
    dialogConfirmCallback = onConfirm;
    document.getElementById('tfConfirmModal').classList.remove('hidden');
  }

  function builtinShowAlert(message, title = 'Something went wrong') {
    ensureDialogModals();
    document.getElementById('tfAlertTitle').textContent = title;
    document.getElementById('tfAlertMessage').textContent = message;
    document.getElementById('tfAlertModal').classList.remove('hidden');
  }

  let showConfirm = builtinShowConfirm;
  let showAlert = builtinShowAlert;
  const dmReadByConv = new Map();
  let dmBatch = null;
  let dmSearchOpen = false;
  let dmOnlineUserIds = new Set();
  let appPresenceInterval = null;
  let dmOnlinePollInterval = null;
  let appPresenceLeft = false;
  let dmHistoryPopping = false;

  function pushDmHistory(name) {
    if (dmHistoryPopping) return;
    history.pushState({ tfDm: name, t: Date.now() }, '');
  }

  function dismissDmHistorySilent() {
    const dm = history.state?.tfDm;
    if (!dm) return;
    dmHistoryPopping = true;
    history.go(dm === 'thread' ? -2 : -1);
  }

  function requestDmBack() {
    if (!panelOpen) return;
    if (history.state?.tfDm) {
      history.back();
      return;
    }
    if (view === 'thread') goToListCore();
    else closePanelCore();
  }

  function handlePopState() {
    if (dmHistoryPopping) {
      dmHistoryPopping = false;
      return true;
    }
    if (!panelOpen) return false;
    const dm = history.state?.tfDm;
    if (view === 'thread' && dm === 'panel') {
      goToListCore();
      return true;
    }
    if (view === 'list' && !dm) {
      closePanelCore();
      return true;
    }
    return false;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function conversationTitle(conv) {
    if (!conv) return 'Messages';
    if (conv.is_self) return 'Note to self';
    const u = conv.other_user;
    return u ? u.username : 'Unknown';
  }

  function isDmUserOnline(userId) {
    return userId != null && dmOnlineUserIds.has(String(userId));
  }

  function dmAvatarWithPresenceHtml(user, sizeClass) {
    const online = isDmUserOnline(user?.id);
    return `<div class="relative shrink-0" title="${online ? 'Online' : 'Offline'}">
      ${userAvatarHtml(user, sizeClass)}
      ${online ? '<span class="online-dot absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-ink-800" title="Online"></span>' : ''}
    </div>`;
  }

  function dmParticipantIds() {
    const ids = new Set();
    for (const conv of visibleConversations()) {
      if (conv.is_self && currentUser?.id) ids.add(String(currentUser.id));
      else if (conv.other_user?.id) ids.add(String(conv.other_user.id));
    }
    return ids;
  }

  function dmOnlineStats() {
    const ids = dmParticipantIds();
    const total = ids.size;
    const online = [...ids].filter((id) => dmOnlineUserIds.has(id)).length;
    return { total, online };
  }

  function listViewTitle() {
    const { total, online } = dmOnlineStats();
    return total > 0 ? `Messages · ${online}/${total} online` : 'Messages';
  }

  function updateDmPresenceUi() {
    if (view === 'list') {
      $('dmChatHeaderTitle').textContent = listViewTitle();
      renderConversationList();
    } else {
      syncHeaderAvatar();
    }
  }

  async function pingAppPresence() {
    if (appPresenceLeft || !enabled) return;
    await apiFetch('/api/presence/app/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  }

  function stopAppPresence() {
    clearInterval(appPresenceInterval);
    clearInterval(dmOnlinePollInterval);
    appPresenceInterval = null;
    dmOnlinePollInterval = null;
  }

  function leaveAppPresence() {
    if (appPresenceLeft) return;
    appPresenceLeft = true;
    stopAppPresence();
    fetch('/api/presence/app/leave', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  }

  async function fetchDmOnlineUsers() {
    if (appPresenceLeft || !enabled) return;
    const r = await apiFetch('/api/dm/online');
    if (!r.ok) return;
    const ids = await parseJsonResponse(r);
    if (!Array.isArray(ids)) return;
    const next = new Set(ids.map(String));
    const changed = next.size !== dmOnlineUserIds.size
      || [...next].some((id) => !dmOnlineUserIds.has(id))
      || [...dmOnlineUserIds].some((id) => !next.has(id));
    dmOnlineUserIds = next;
    if (changed) updateDmPresenceUi();
  }

  function startAppPresence() {
    if (!enabled || appPresenceLeft) return;
    stopAppPresence();
    pingAppPresence();
    fetchDmOnlineUsers();
    appPresenceInterval = setInterval(pingAppPresence, APP_PRESENCE_PING_MS);
    dmOnlinePollInterval = setInterval(fetchDmOnlineUsers, DM_ONLINE_POLL_MS);
  }

  function normalizeEmailLocal(email) {
    return (email || '').trim().toLowerCase();
  }

  function isEmailBlockedLocal(email) {
    const n = normalizeEmailLocal(email);
    if (!n) return false;
    return dmSettings.blocked_emails.some((e) => normalizeEmailLocal(e) === n);
  }

  function isUserIgnoredLocal(userId) {
    if (!userId) return false;
    return dmSettings.ignored_user_ids.some((id) => String(id) === String(userId));
  }

  const DM_IGNORED_INDICATOR = ' 🔕';

  function conversationTitleWithIndicator(conv) {
    const title = conversationTitle(conv);
    if (!conv || conv.is_self) return title;
    if (isUserIgnoredLocal(conv.other_user?.id)) return title + DM_IGNORED_INDICATOR;
    return title;
  }

  function syncHeaderIgnoreMenuBtn() {
    const btn = $('dmChatHeaderIgnoreBtn');
    if (!btn) return;
    const other = activeConversation?.other_user;
    const ignored = !!(other?.id && isUserIgnoredLocal(other.id));
    btn.textContent = ignored ? 'Unignore' : 'Ignore';
    btn.className = ignored
      ? 'w-full text-left px-3 py-2 text-sm text-brand-400 hover:bg-white/10 transition'
      : 'w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10 transition';
  }

  function visibleConversations() {
    return conversations.filter((conv) => {
      if (conv.is_self) return true;
      const email = conv.other_user?.email;
      return !email || !isEmailBlockedLocal(email);
    });
  }

  function conversationSubtitle(conv) {
    if (!conv) return '';
    if (conv.is_self) return currentUser?.email || '';
    return conv.other_user?.email || '';
  }

  const dmMessageFormat = typeof window !== 'undefined' ? window.MessageFormat : null;

  function formatDmBodyHtml(content) {
    const text = dmMessageFormat
      ? dmMessageFormat.applyTextEmojis(String(content ?? ''))
      : String(content ?? '');
    return escHtml(text).replace(/\n/g, '<br>');
  }

  function prepareOutgoingDmMessage(content) {
    const trimmed = String(content || '').trim();
    return dmMessageFormat ? dmMessageFormat.applyTextEmojis(trimmed) : trimmed;
  }

  function previewText(conv) {
    const lm = conv.last_message;
    if (!lm) return 'No messages yet';
    if (lm.deleted) return 'Message deleted';
    const prefix = lm.is_mine ? 'You: ' : '';
    const raw = lm.content || '';
    const text = (dmMessageFormat ? dmMessageFormat.applyTextEmojis(raw) : raw).replace(/\s+/g, ' ').trim();
    const clipped = text.length > 60 ? `${text.slice(0, 60)}…` : text;
    return prefix + clipped;
  }

  function setPanelOpenUi(open) {
    document.body.classList.toggle('dm-panel-open', open);
    $('dmChatBackdrop')?.classList.toggle('hidden', !open);
    $('dmChatFabWrap')?.classList.toggle('hidden', open);
    window.updateFeedbackFabPosition?.();
  }

  function convUnreadCount(conv) {
    if (!conv) return 0;
    if (panelOpen && view === 'thread' && conv.id === activeConversationId) return 0;
    if (!conv.is_self && isUserIgnoredLocal(conv.other_user?.id)) return 0;
    return conv.unread_count || 0;
  }

  function totalUnread() {
    return conversations.reduce((sum, c) => sum + convUnreadCount(c), 0);
  }

  function updateUnreadBadge() {
    const badge = $('dmUnreadBadge');
    if (!badge || !enabled) return;
    if (panelOpen) {
      badge.classList.add('hidden');
      return;
    }
    const unread = totalUnread();
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function showFab() {
    $('dmChatFabWrap')?.classList.remove('hidden');
    window.updateFeedbackFabPosition?.();
  }

  function hideFab() {
    $('dmChatFabWrap')?.classList.add('hidden');
    window.updateFeedbackFabPosition?.();
  }

  function showConversationListLoading() {
    const list = $('dmConversationList');
    if (list) list.innerHTML = conversationListSkeletonHtml();
  }

  function showDmMessagesLoading() {
    const list = $('dmMessagesList');
    if (list) list.innerHTML = messageListSkeletonHtml();
  }

  function openPanel() {
    if (!enabled) return;
    panelOpen = true;
    view = activeConversationId ? 'thread' : 'list';
    $('dmChatPanel')?.classList.remove('hidden');
    setPanelOpenUi(true);
    syncView();
    pushDmHistory(view === 'thread' ? 'thread' : 'panel');
    if (view === 'thread' && activeConversationId) {
      showDmMessagesLoading();
      loadDmMessages().then(() => markDmRead());
    } else {
      loadConversations();
    }
    updateUnreadBadge();
  }

  async function closePanelCore() {
    await flushDmReadState();
    closeReactionFloats();
    dismissMessageComposer($('dmChatInput'), $('dmChatSendBtn'));
    resetDmMessageSearch();
    panelOpen = false;
    $('dmChatPanel')?.classList.add('hidden');
    setPanelOpenUi(false);
    editingDmId = null;
    dmEditDraft = '';
    dmViewingOriginalId = null;
    await loadConversations();
    updateUnreadBadge();
  }

  async function closePanel() {
    await closePanelCore();
    dismissDmHistorySilent();
  }

  async function goToListCore() {
    await flushDmReadState();
    dismissMessageComposer($('dmChatInput'), $('dmChatSendBtn'));
    view = 'list';
    activeConversationId = null;
    activeConversation = null;
    dmMessages = [];
    dmLastReadAt = 0;
    editingDmId = null;
    resetDmMessageSearch();
    syncView();
    if (!conversationsLoaded) showConversationListLoading();
    await loadConversations();
    updateUnreadBadge();
  }

  async function goToList() {
    await goToListCore();
    if (history.state?.tfDm === 'thread') {
      dmHistoryPopping = true;
      history.back();
    }
  }

  function closeHeaderAvatarMenu() {
    headerAvatarMenuOpen = false;
    $('dmChatHeaderAvatarMenu')?.classList.add('hidden');
    const btn = $('dmChatHeaderAvatarBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function syncHeaderAvatar() {
    const wrap = $('dmChatHeaderAvatarWrap');
    const avatarHost = $('dmChatHeaderAvatar');
    const btn = $('dmChatHeaderAvatarBtn');
    const inThread = view === 'thread' && activeConversationId;
    const isSelf = activeConversation?.is_self;
    const other = activeConversation?.other_user;
    closeHeaderAvatarMenu();

    if (!inThread) {
      wrap?.classList.add('hidden');
      return;
    }

    const displayUser = isSelf ? currentUser : other;
    if (!displayUser) {
      wrap?.classList.add('hidden');
      return;
    }

    wrap?.classList.remove('hidden');
    if (avatarHost) avatarHost.innerHTML = dmAvatarWithPresenceHtml(displayUser, 'w-9 h-9');
    if (btn) {
      btn.disabled = isSelf;
      btn.setAttribute('aria-label', isSelf ? 'You' : `Options for ${other?.username || 'user'}`);
      if (isSelf) btn.setAttribute('aria-expanded', 'false');
    }
    if (isSelf) {
      $('dmChatHeaderAvatarMenu')?.classList.add('hidden');
    } else {
      syncHeaderIgnoreMenuBtn();
    }
  }

  function resetDmMessageSearch() {
    dmSearchOpen = false;
    const searchEl = $('dmMessageSearch');
    if (searchEl) searchEl.value = '';
    dmBatch?.reset();
    $('dmMessageSearchWrap')?.classList.add('hidden');
    $('dmChatHeaderTitleWrap')?.classList.remove('hidden');
    $('dmMessageSearchBtn')?.classList.add('hidden');
    if (view === 'thread' && activeConversationId) {
      $('dmMessageSearchBtn')?.classList.remove('hidden');
    }
  }

  function openDmMessageSearch() {
    if (view !== 'thread' || !activeConversationId) return;
    dmSearchOpen = true;
    $('dmChatHeaderTitleWrap')?.classList.add('hidden');
    $('dmMessageSearchWrap')?.classList.remove('hidden');
    $('dmMessageSearchBtn')?.classList.add('hidden');
    const searchEl = $('dmMessageSearch');
    if (searchEl) {
      searchEl.focus();
      searchEl.select();
    }
  }

  function syncDmMessageSearchUi() {
    const inThread = view === 'thread' && activeConversationId;
    if (!inThread) {
      resetDmMessageSearch();
      return;
    }
    if (dmSearchOpen) {
      $('dmChatHeaderTitleWrap')?.classList.add('hidden');
      $('dmMessageSearchWrap')?.classList.remove('hidden');
      $('dmMessageSearchBtn')?.classList.add('hidden');
    } else {
      $('dmChatHeaderTitleWrap')?.classList.remove('hidden');
      $('dmMessageSearchWrap')?.classList.add('hidden');
      $('dmMessageSearchBtn')?.classList.remove('hidden');
    }
  }

  function syncView() {
    const inThread = view === 'thread' && activeConversationId;
    $('dmChatListView')?.classList.toggle('hidden', inThread);
    $('dmChatThreadView')?.classList.toggle('hidden', !inThread);
    $('dmChatBackBtn')?.classList.toggle('hidden', !inThread);
    $('dmBlockedEmailsBtn')?.classList.toggle('hidden', inThread);
    if (!inThread) resetDmMessageSearch();
    else syncDmMessageSearchUi();
    $('dmChatHeaderTitle').textContent = inThread ? conversationTitleWithIndicator(activeConversation) : listViewTitle();
    $('dmChatHeaderSubtitle')?.classList.toggle('hidden', !inThread);
    if (inThread) {
      $('dmChatHeaderSubtitle').textContent = conversationSubtitle(activeConversation);
    }
    $('dmNewConvForm')?.classList.toggle('hidden', inThread);
    syncHeaderAvatar();
  }

  async function loadDmSettings() {
    const r = await apiFetch('/api/dm/settings');
    if (!r.ok) return;
    const data = await parseJsonResponse(r);
    if (!data || typeof data !== 'object') return;
    dmSettings = {
      blocked_emails: Array.isArray(data.blocked_emails) ? data.blocked_emails : [],
      blocked_user_ids: Array.isArray(data.blocked_user_ids) ? data.blocked_user_ids : [],
      ignored_user_ids: Array.isArray(data.ignored_user_ids) ? data.ignored_user_ids : [],
    };
  }

  function applyDmSettings(data) {
    if (!data || typeof data !== 'object') return;
    dmSettings = {
      blocked_emails: Array.isArray(data.blocked_emails) ? data.blocked_emails : dmSettings.blocked_emails,
      blocked_user_ids: Array.isArray(data.blocked_user_ids) ? data.blocked_user_ids : dmSettings.blocked_user_ids,
      ignored_user_ids: Array.isArray(data.ignored_user_ids) ? data.ignored_user_ids : dmSettings.ignored_user_ids,
    };
    renderConversationList();
    updateUnreadBadge();
    renderBlockedEmailsList();
    syncHeaderIgnoreMenuBtn();
    if (view === 'thread' && activeConversation) {
      $('dmChatHeaderTitle').textContent = conversationTitleWithIndicator(activeConversation);
    }
  }

  function openBlockedEmailsModal() {
    renderBlockedEmailsList();
    $('dmBlockedEmailAddError')?.classList.add('hidden');
    $('dmBlockedEmailAddInput').value = '';
    $('dmBlockedEmailsModal')?.classList.remove('hidden');
    window.pushDashboardOverlay?.('dmBlockedEmails');
  }

  function closeBlockedEmailsModal() {
    $('dmBlockedEmailsModal')?.classList.add('hidden');
  }

  function renderBlockedEmailsList() {
    const list = $('dmBlockedEmailsList');
    if (!list) return;
    const emails = dmSettings.blocked_emails || [];
    if (!emails.length) {
      list.innerHTML = '<li class="text-center py-4 text-gray-600">No blocked emails yet.</li>';
      return;
    }
    list.innerHTML = emails.map((email) => `
      <li class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-ink-700/60 border border-white/10">
        <span class="text-gray-200 truncate">${escHtml(email)}</span>
        <button type="button" data-dm-unblock-email="${encodeURIComponent(email)}"
          class="text-xs text-brand-500 hover:text-brand-400 shrink-0 font-medium">Remove</button>
      </li>`).join('');
    list.querySelectorAll('[data-dm-unblock-email]').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeBlockedEmail(decodeURIComponent(btn.getAttribute('data-dm-unblock-email') || ''));
      });
    });
  }

  async function addBlockedEmailFromModal() {
    const input = $('dmBlockedEmailAddInput');
    const errEl = $('dmBlockedEmailAddError');
    const email = (input?.value || '').trim();
    errEl?.classList.add('hidden');
    if (!email) {
      if (errEl) {
        errEl.textContent = 'Enter an email address.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (normalizeEmailLocal(email) === normalizeEmailLocal(currentUser?.email)) {
      if (errEl) {
        errEl.textContent = 'You cannot block your own email.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    const btn = $('dmBlockedEmailAddBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Adding…';
    }
    const r = await apiFetch('/api/dm/blocked-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await parseJsonResponse(r);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Add';
    }
    if (!r.ok) {
      if (errEl) {
        errEl.textContent = data.error || 'Could not block email';
        errEl.classList.remove('hidden');
      }
      return;
    }
    dmSettings.blocked_emails = data.emails || [];
    input.value = '';
    if (activeConversation && !activeConversation.is_self && isEmailBlockedLocal(activeConversation.other_user?.email)) {
      await goToList();
    } else {
      renderConversationList();
      updateUnreadBadge();
    }
    renderBlockedEmailsList();
  }

  async function removeBlockedEmail(email) {
    const r = await apiFetch('/api/dm/blocked-emails', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(data.error || 'Could not unblock email');
      return;
    }
    dmSettings.blocked_emails = data.emails || [];
    await loadDmSettings();
    renderConversationList();
    updateUnreadBadge();
    renderBlockedEmailsList();
  }

  function showBlockedEmailStartModal(email) {
    blockedEmailStartTarget = normalizeEmailLocal(email);
    const msg = $('dmBlockedEmailStartMessage');
    if (msg) {
      msg.textContent = `${email} is in your block list. Unblock it to start a chat.`;
    }
    $('dmBlockedEmailStartModal')?.classList.remove('hidden');
    window.pushDashboardOverlay?.('dmBlockedEmailStart');
  }

  function closeBlockedEmailStartModal() {
    blockedEmailStartTarget = null;
    $('dmBlockedEmailStartModal')?.classList.add('hidden');
  }

  async function unblockEmailFromStartModal() {
    if (!blockedEmailStartTarget) return;
    const email = blockedEmailStartTarget;
    const btn = $('dmBlockedEmailUnblockBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Unblocking…';
    }
    await removeBlockedEmail(email);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Unblock';
    }
    closeBlockedEmailStartModal();
    $('dmNewConvEmail').value = email;
    await startNewConversation();
  }

  function toggleHeaderAvatarMenu() {
    if (!activeConversation || activeConversation.is_self) return;
    headerAvatarMenuOpen = !headerAvatarMenuOpen;
    if (headerAvatarMenuOpen) syncHeaderIgnoreMenuBtn();
    $('dmChatHeaderAvatarMenu')?.classList.toggle('hidden', !headerAvatarMenuOpen);
    const btn = $('dmChatHeaderAvatarBtn');
    if (btn) btn.setAttribute('aria-expanded', headerAvatarMenuOpen ? 'true' : 'false');
  }

  async function blockActiveUser() {
    const other = activeConversation?.other_user;
    if (!other?.id) return;
    closeHeaderAvatarMenu();
    const r = await apiFetch(`/api/dm/users/${other.id}/block`, { method: 'POST' });
    const data = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(data.error || 'Could not block user');
      return;
    }
    applyDmSettings(data);
    await goToList();
  }

  async function toggleIgnoreActiveUser() {
    const other = activeConversation?.other_user;
    if (!other?.id) return;
    closeHeaderAvatarMenu();
    const ignored = isUserIgnoredLocal(other.id);
    const r = await apiFetch(`/api/dm/users/${other.id}/ignore`, { method: ignored ? 'DELETE' : 'POST' });
    const data = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(data.error || (ignored ? 'Could not unignore user' : 'Could not ignore user'));
      return;
    }
    applyDmSettings(data);
    if (ignored) {
      showAlert(`${other.username || 'User'} is no longer ignored. New messages will count toward unread again.`, 'Unignored');
      await loadConversations();
    } else {
      showAlert(`${other.username || 'User'} is now ignored. New messages will not increase your unread count.`, 'Ignored');
    }
  }

  async function openConversation(conv) {
    if (activeConversationId && activeConversationId !== conv.id) {
      await flushDmReadState();
    }
    activeConversationId = conv.id;
    activeConversation = conv;
    view = 'thread';
    syncView();
    pushDmHistory('thread');
    dmLastReadAt = dmReadByConv.get(conv.id) || 0;
    dmMessages = [];
    resetDmMessageSearch();
    showDmMessagesLoading();
    await loadDmReadState();
    await loadDmMessages();
    await markDmRead();
    scrollDmToBottom();
    setTimeout(() => $('dmChatInput')?.focus(), 50);
  }

  async function loadConversations() {
    if (!conversationsLoaded && panelOpen && view === 'list') {
      showConversationListLoading();
    }
    const r = await apiFetch('/api/dm/conversations');
    if (!r.ok) return;
    const data = await parseJsonResponse(r);
    if (!Array.isArray(data)) return;
    conversations = data;
    conversationsLoaded = true;
    renderConversationList();
    updateUnreadBadge();
    if (view === 'list') $('dmChatHeaderTitle').textContent = listViewTitle();
    fetchDmOnlineUsers();
  }

  function renderConversationList() {
    const list = $('dmConversationList');
    if (!list) return;

    const visible = visibleConversations();
    const selfRow = visible.find((c) => c.is_self);
    const others = visible.filter((c) => !c.is_self);

    let html = '';
    if (!visible.length) {
      html = '<p class="text-sm text-gray-600 text-center py-6 px-4">No conversations yet. Start a new message below.</p>';
    } else {
      const renderRow = (conv) => {
        const title = conversationTitleWithIndicator(conv);
        const preview = previewText(conv);
        const time = conv.last_message_at
          ? new Date(conv.last_message_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : '';
        const unreadN = convUnreadCount(conv);
        const unread = unreadN > 0
          ? `<span class="shrink-0 min-w-[1.125rem] h-[1.125rem] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">${unreadN > 99 ? '99+' : unreadN}</span>`
          : '';
        const active = conv.id === activeConversationId ? ' bg-white/10 border-brand-500/30' : ' border-white/5 hover:bg-white/5';
        return `<button type="button" data-conv-id="${conv.id}"
            class="w-full text-left flex items-center gap-3 p-3 rounded-xl border transition${active}">
            ${dmAvatarWithPresenceHtml(conv.other_user, 'w-10 h-10')}
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium text-white truncate">${escHtml(title)}</span>
                <span class="text-[10px] text-gray-600 shrink-0">${escHtml(time)}</span>
              </div>
              <p class="text-xs text-gray-500 truncate mt-0.5">${escHtml(preview)}</p>
            </div>
            ${unread}
          </button>`;
      };

      if (selfRow) html += renderRow(selfRow);
      if (others.length) {
        if (selfRow) html += '<p class="text-xs text-gray-600 uppercase tracking-wider px-1 pt-2 pb-1">Others</p>';
        html += others.map(renderRow).join('');
      }
    }

    list.innerHTML = html;
    list.querySelectorAll('[data-conv-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const conv = conversations.find((c) => c.id === btn.dataset.convId);
        if (conv) openConversation(conv);
      });
    });
  }

  async function startNewConversation() {
    newConvError = '';
    $('dmNewConvError')?.classList.add('hidden');
    const email = ($('dmNewConvEmail')?.value || '').trim();
    if (email && isEmailBlockedLocal(email)) {
      showBlockedEmailStartModal(email);
      return;
    }
    const body = email ? { email } : {};
    const btn = $('dmNewConvBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Opening…';
    }
    const r = await apiFetch('/api/dm/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await parseJsonResponse(r);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Start chat';
    }
    if (!r.ok) {
      if (r.status === 409 && data.code === 'blocked_email') {
        showBlockedEmailStartModal(data.email || email);
        return;
      }
      newConvError = data.error || 'Could not start chat';
      const errEl = $('dmNewConvError');
      if (errEl) {
        errEl.textContent = newConvError;
        errEl.classList.remove('hidden');
      }
      return;
    }
    $('dmNewConvEmail').value = '';
    const idx = conversations.findIndex((c) => c.id === data.id);
    if (idx === -1) conversations.unshift(data);
    else conversations[idx] = { ...conversations[idx], ...data };
    await openConversation(data);
    loadConversations();
  }

  async function startSelfChat() {
    $('dmNewConvEmail').value = currentUser?.email || '';
    await startNewConversation();
  }

  async function loadDmReadState() {
    if (!activeConversationId) return;
    const cached = dmReadByConv.get(activeConversationId);
    if (cached) {
      dmLastReadAt = cached;
      return;
    }
    const r = await apiFetch(`/api/dm/conversations/${activeConversationId}/read`);
    if (!r.ok) return;
    const data = await parseJsonResponse(r);
    if (data?.last_read_at) {
      const t = new Date(data.last_read_at).getTime();
      if (!Number.isNaN(t)) {
        dmLastReadAt = t;
        dmReadByConv.set(activeConversationId, t);
      }
    }
  }

  async function flushDmReadState() {
    if (!activeConversationId || dmLastReadAt <= 0) return;
    clearTimeout(dmReadPersistTimer);
    dmReadPersistTimer = null;
    const lastReadAt = new Date(dmLastReadAt).toISOString();
    dmReadByConv.set(activeConversationId, dmLastReadAt);
    await apiFetch(`/api/dm/conversations/${activeConversationId}/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_read_at: lastReadAt }),
    });
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (conv) conv.unread_count = 0;
  }

  function scheduleDmReadPersist() {
    if (!activeConversationId) return;
    clearTimeout(dmReadPersistTimer);
    dmReadPersistTimer = setTimeout(() => flushDmReadState(), 300);
  }

  async function markDmRead() {
    const latest = dmMessages.reduce((max, m) => {
      if (m.deleted_at) return max;
      const t = new Date(m.created_at).getTime();
      return t > max ? t : max;
    }, 0);
    dmLastReadAt = Math.max(dmLastReadAt, latest, Date.now());
    dmReadByConv.set(activeConversationId, dmLastReadAt);
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (conv) conv.unread_count = 0;
    renderConversationList();
    updateUnreadBadge();
    scheduleDmReadPersist();
  }

  function scrollDmToBottom() {
    const list = $('dmMessagesList');
    if (list) list.scrollTop = list.scrollHeight;
  }

  function syncDmVersionFocusUi() {
    const list = $('dmMessagesList');
    const panel = $('dmChatThreadView');
    const viewing = !!dmViewingOriginalId;
    list?.classList.toggle('chat-viewing-original', viewing);
    panel?.classList.toggle('chat-viewing-original', viewing);
    if (!list || !viewing) return;
    list.querySelectorAll('[data-dm-msg-id]').forEach((el) => {
      el.classList.toggle('chat-msg-version-active', el.dataset.dmMsgId === dmViewingOriginalId);
    });
  }

  function renderDmMessageActions(msg) {
    if (String(msg.user_id) !== String(currentUser?.id) || msg.deleted_at) return '';
    if (editingDmId === msg.id) return '';
    return `<div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" data-dm-edit="${msg.id}" class="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/10" title="Edit">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </button>
        <button type="button" data-dm-delete="${msg.id}" class="text-gray-500 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10" title="Delete">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>`;
  }

  function reactionSymbol(emoji) {
    return REACTION_EMOJIS[emoji] || emoji;
  }

  function findDmReactionUsers(messageId, emoji) {
    const reactions = dmMessages.find((m) => m.id === messageId)?.reactions || [];
    return reactions.find((r) => r.emoji === emoji)?.users || [];
  }

  function renderReactionsBar(messageId, reactions) {
    const pills = (reactions || []).map((r) => {
      const mine = (r.users || []).some((u) => String(u.id) === String(currentUser?.id));
      return `<button type="button" data-reaction-pill data-msg-type="dm" data-msg-id="${messageId}" data-emoji="${r.emoji}"
          title="Hold to see who reacted"
          class="reaction-pill inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 ${mine ? 'reaction-pill-active' : ''}">
          <span>${reactionSymbol(r.emoji)}</span>
          <span class="text-gray-400">${r.count}</span>
        </button>`;
    }).join('');
    const addBtn = `<button type="button" data-reaction-add data-msg-type="dm" data-msg-id="${messageId}"
        class="text-xs text-gray-500 hover:text-white px-1.5 py-0.5 rounded-full hover:bg-white/10 transition" title="Add reaction">+</button>`;
    return `<div class="flex flex-wrap items-center gap-1.5 mt-2">${pills}${addBtn}</div>`;
  }

  function renderDmMessageBody(msg) {
    const user = msg.user || { username: '?', avatar_color: '#4f6ef7' };
    const sentAt = formatDateTime(msg.created_at);
    const fromOther = String(msg.user_id) !== String(currentUser?.id);
    const nameLabel = escHtml(user.username) + (fromOther && isUserIgnoredLocal(msg.user_id) ? DM_IGNORED_INDICATOR : '');

    if (msg.deleted_at) {
      return `<div class="chat-msg-tombstone rounded-xl p-3" data-dm-msg-id="${msg.id}">
          <p class="text-xs text-gray-500 italic">Message deleted</p>
          <p class="text-xs text-gray-600 mt-1.5">${nameLabel} · ${escHtml(sentAt)}</p>
        </div>`;
    }

    if (editingDmId === msg.id) {
      return `<div class="bg-ink-700/80 border border-brand-500/30 rounded-xl p-3 space-y-2" data-dm-edit-wrap="${msg.id}">
          <textarea id="dmEditInput-${msg.id}" rows="3"
            class="w-full bg-ink-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 transition resize-none"></textarea>
          <div class="flex gap-2 justify-end">
            <button type="button" data-dm-cancel-edit class="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition">Cancel</button>
            <button type="button" data-dm-save-edit="${msg.id}" class="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition font-medium">Save</button>
          </div>
        </div>`;
    }

    const editedNote = msg.edited_at
      ? `<span class="text-gray-600"> · edited ${escHtml(formatDateTime(msg.edited_at))}</span>`
      : '';

    const hasOriginal = msg.edited_at && msg.content_before_edit;
    const showingOriginal = hasOriginal && dmViewingOriginalId === msg.id;
    const displayContent = showingOriginal ? msg.content_before_edit : msg.content;
    const versionToggle = hasOriginal
      ? `<button type="button" data-dm-toggle-version="${msg.id}"
          class="text-xs text-brand-500 hover:text-brand-400 transition mt-1.5">
          ${showingOriginal ? 'Show new message' : 'Show original message'}
        </button>`
      : '';
    const editedLabel = msg.edited_at
      ? `<p class="text-xs text-gray-500 italic mb-1">${showingOriginal ? 'Original message' : 'Edited message'}</p>`
      : '';

    const bodyHtml = msg.edited_at
      ? `<div class="chat-msg-edited-card rounded-lg bg-ink-700/40 border border-white/5 px-3 py-2">
          ${editedLabel}
          <p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">${formatDmBodyHtml(displayContent)}</p>
          ${versionToggle}
        </div>`
      : `<p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">${formatDmBodyHtml(displayContent)}</p>`;

    const versionActiveClass = showingOriginal ? ' chat-msg-version-active' : '';
    return `<div class="group flex items-start gap-3${versionActiveClass}" data-dm-msg-id="${msg.id}">
        ${dmAvatarWithPresenceHtml(user, 'w-8 h-8')}
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2 mb-1">
            <div class="min-w-0">
              <span class="text-xs font-medium text-white">${nameLabel}</span>
              <p class="text-xs text-gray-600 mt-0.5">${escHtml(sentAt)}${editedNote}</p>
            </div>
            ${renderDmMessageActions(msg)}
          </div>
          ${bodyHtml}
          ${renderReactionsBar(msg.id, msg.reactions || [])}
        </div>
      </div>`;
  }

  function captureDmEditDraft() {
    if (!editingDmId) return;
    const ta = document.getElementById(`dmEditInput-${editingDmId}`);
    if (ta) dmEditDraft = ta.value;
  }

  function renderDmMessages(batchScrollHint) {
    const list = $('dmMessagesList');
    if (!list || !dmBatch) return;
    const scrollTop = list.scrollTop;
    const scrollHeight = list.scrollHeight;
    const atBottom = scrollHeight - list.clientHeight - scrollTop < 48;
    const emptyHtml = '<p class="text-sm text-gray-600 text-center py-8">No messages yet. Say hello.</p>';

    const { scrollToTop } = dmBatch.renderList(
      list,
      dmMessages,
      renderDmMessageBody,
      emptyHtml,
    );
    syncDmVersionFocusUi();
    if (openReactionPicker || openReactorsPopover) syncReactionFloatUi();

    if (editingDmId) {
      const ta = document.getElementById(`dmEditInput-${editingDmId}`);
      if (ta) {
        ta.value = dmEditDraft;
        ta.focus();
        const len = ta.value.length;
        ta.setSelectionRange(len, len);
      }
    } else if (batchScrollHint === 'older' || scrollToTop) {
      list.scrollTop = 0;
    } else if (!atBottom && dmBatch.isAtLatest()) {
      list.scrollTop = scrollTop;
    }
  }

  async function loadDmMessages() {
    if (!activeConversationId) return;
    if (view === 'thread' && panelOpen && !dmMessages.length && !editingDmId) {
      showDmMessagesLoading();
    }
    const r = await apiFetch(`/api/dm/conversations/${activeConversationId}/messages`);
    if (!r.ok) return;
    const data = await parseJsonResponse(r);
    if (!Array.isArray(data)) return;
    const prevLen = dmMessages.length;
    const prevLastId = dmMessages[dmMessages.length - 1]?.id;
    dmMessages = data;
    if (view === 'thread' && panelOpen) {
      if (editingDmId) {
        captureDmEditDraft();
        const editingMsg = data.find((m) => m.id === editingDmId);
        if (editingMsg && !editingMsg.deleted_at) {
          const idx = dmMessages.findIndex((m) => m.id === editingDmId);
          if (idx !== -1) dmMessages[idx] = { ...editingMsg, content: dmEditDraft || editingMsg.content };
        }
      } else {
        renderDmMessages();
        if (dmBatch.isAtLatest() && (data.length > prevLen || data[data.length - 1]?.id !== prevLastId)) {
          scrollDmToBottom();
        }
      }
      await markDmRead();
    }
  }

  async function submitDmMessage() {
    const conversationId = activeConversationId;
    if (!conversationId) return;
    const input = $('dmChatInput');
    const btn = $('dmChatSendBtn');
    await submitMessageOnce(`dm:${conversationId}`, {
      inputEl: input,
      sendBtnEl: btn,
      cooldownNoticeEl: $('dmSendCooldown'),
      getContent: () => prepareOutgoingDmMessage(input?.value),
      send: async (content) => {
        const r = await apiFetch(`/api/dm/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        const msg = await parseJsonResponse(r);
        if (!r.ok) {
          const limited = messageSendRateLimitResult(r.status, msg);
          if (limited) return limited;
          showAlert(msg.error || 'Failed to send message');
          return false;
        }
        dmBatch.showLatestBatch();
        dmMessages.push(msg);
        renderDmMessages();
        scrollDmToBottom();
        markDmRead();
        loadConversations();
        return true;
      },
    });
  }

  function startEditDm(messageId) {
    const msg = dmMessages.find((m) => m.id === messageId);
    if (!msg || msg.deleted_at) return;
    editingDmId = messageId;
    dmEditDraft = msg.content;
    renderDmMessages();
  }

  function cancelEditDm() {
    editingDmId = null;
    dmEditDraft = '';
    renderDmMessages();
  }

  async function saveEditDm(messageId) {
    const textarea = document.getElementById(`dmEditInput-${messageId}`);
    const content = prepareOutgoingDmMessage(textarea?.value);
    if (!content || !activeConversationId) return;
    const r = await apiFetch(`/api/dm/conversations/${activeConversationId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const updated = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(updated.error || 'Failed to edit message');
      return;
    }
    const idx = dmMessages.findIndex((m) => m.id === messageId);
    if (idx !== -1) dmMessages[idx] = updated;
    editingDmId = null;
    dmEditDraft = '';
    if (dmViewingOriginalId === messageId) dmViewingOriginalId = null;
    renderDmMessages();
  }

  function deleteDmMessage(messageId) {
    showConfirm({
      title: 'Delete message',
      message: 'Delete this message? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => executeDeleteDmMessage(messageId),
    });
  }

  async function executeDeleteDmMessage(messageId) {
    const r = await apiFetch(`/api/dm/conversations/${activeConversationId}/messages/${messageId}`, { method: 'DELETE' });
    const updated = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(updated.error || 'Failed to delete message');
      return;
    }
    const idx = dmMessages.findIndex((m) => m.id === messageId);
    if (idx !== -1) dmMessages[idx] = updated;
    if (editingDmId === messageId) {
      editingDmId = null;
      dmEditDraft = '';
    }
    if (dmViewingOriginalId === messageId) dmViewingOriginalId = null;
    renderDmMessages();
  }

  function closeReactionFloats() {
    openReactionPicker = null;
    openReactorsPopover = null;
    syncReactionFloatUi();
  }

  function resolveReactionAnchor(storedAnchor, selector) {
    if (storedAnchor?.isConnected) return storedAnchor;
    return document.querySelector(selector);
  }

  function positionReactionFloat(floatEl, anchorEl) {
    if (!anchorEl) return;
    const layer = $('dmReactionFloatLayer');
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

  function syncReactionFloatUi() {
    const layer = $('dmReactionFloatLayer');
    if (!layer) return;
    layer.innerHTML = '';

    if (openReactorsPopover) {
      const popSelector = `[data-reaction-pill][data-msg-type="dm"][data-msg-id="${openReactorsPopover.messageId}"][data-emoji="${openReactorsPopover.emoji}"]`;
      const anchor = resolveReactionAnchor(openReactorsPopover.anchor, popSelector);
      if (!anchor) {
        openReactorsPopover = null;
      } else {
        openReactorsPopover.anchor = anchor;
        const users = openReactorsPopover.users || [];
        const sym = reactionSymbol(openReactorsPopover.emoji);
        const pop = document.createElement('div');
        pop.className = 'reactors-popover rounded-xl bg-ink-700 border border-white/15 p-3 min-w-[10rem] max-w-[16rem] max-h-48 overflow-y-auto';
        pop.onclick = (e) => e.stopPropagation();
        pop.innerHTML = users.length
          ? `<p class="text-xs font-medium text-white mb-2">${sym} · ${users.length}</p>
             <ul class="space-y-2">${users.map((u) => `
               <li class="flex items-center gap-2">
                 ${userAvatarHtml(u, 'w-6 h-6')}
                 <span class="text-sm text-gray-200 truncate">${escHtml(u.username)}</span>
               </li>`).join('')}</ul>`
          : `<p class="text-xs text-gray-400">${sym} — no reactions yet</p>`;
        positionReactionFloat(pop, anchor);
      }
    }

    if (openReactionPicker) {
      const pickerSelector = `[data-reaction-add][data-msg-type="dm"][data-msg-id="${openReactionPicker.id}"]`;
      const anchor = resolveReactionAnchor(openReactionPicker.anchor, pickerSelector);
      if (!anchor) {
        openReactionPicker = null;
      } else {
        openReactionPicker.anchor = anchor;
        const { id: messageId } = openReactionPicker;
        const picker = document.createElement('div');
        picker.className = 'reaction-picker flex flex-wrap gap-0.5 p-2 rounded-xl bg-ink-700 border border-white/15 max-w-[240px]';
        picker.onclick = (e) => e.stopPropagation();
        picker.innerHTML = Object.entries(REACTION_EMOJIS).map(([key, sym]) =>
          `<button type="button" data-reaction-emoji="${key}"
            class="text-lg hover:scale-110 transition p-1 rounded-lg hover:bg-white/10" title="${key}">${sym}</button>`,
        ).join('');
        picker.querySelectorAll('[data-reaction-emoji]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleReaction(messageId, btn.dataset.reactionEmoji);
          });
        });
        positionReactionFloat(picker, anchor);
      }
    }
  }

  function openReactionPickerFor(messageId, anchorEl) {
    openReactorsPopover = null;
    if (openReactionPicker?.id === messageId) {
      openReactionPicker = null;
    } else {
      openReactionPicker = { id: messageId, anchor: anchorEl };
    }
    syncReactionFloatUi();
  }

  function showReactorsPopover(pill) {
    const messageId = pill.dataset.msgId;
    const emoji = pill.dataset.emoji;
    openReactionPicker = null;
    openReactorsPopover = {
      messageId,
      emoji,
      users: findDmReactionUsers(messageId, emoji),
      anchor: pill,
    };
    syncReactionFloatUi();
  }

  function clearReactionPress() {
    if (reactionPress?.timer) clearTimeout(reactionPress.timer);
    reactionPress = null;
  }

  async function toggleReaction(messageId, emoji) {
    closeReactionFloats();
    const r = await apiFetch('/api/reactions/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageType: 'dm', messageId, emoji }),
    });
    const data = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(data.error || 'Failed to react');
      return;
    }
    const idx = dmMessages.findIndex((m) => m.id === messageId);
    if (idx !== -1) dmMessages[idx] = { ...dmMessages[idx], reactions: data.reactions || [] };
    renderDmMessages();
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;

    const dmList = $('dmMessagesList');
    dmBatch = MessageBatch.create({
      getMessages: () => dmMessages,
      getSearchText: (m) => {
        const parts = [m.content || ''];
        if (m.content_before_edit) parts.push(m.content_before_edit);
        if (m.user?.username) parts.push(m.user.username);
        return parts.join(' ');
      },
      onBatchChange: (hint) => renderDmMessages(hint),
    });
    dmBatch.bindListEvents(dmList);

    $('dmChatFab')?.addEventListener('click', openPanel);
    $('dmChatCloseBtn')?.addEventListener('click', closePanel);
    $('dmChatBackdrop')?.addEventListener('click', closePanel);
    $('dmChatBackBtn')?.addEventListener('click', requestDmBack);
    $('dmNewConvBtn')?.addEventListener('click', startNewConversation);
    $('dmSelfChatBtn')?.addEventListener('click', startSelfChat);
    $('dmBlockedEmailsBtn')?.addEventListener('click', openBlockedEmailsModal);
    $('dmBlockedEmailAddBtn')?.addEventListener('click', addBlockedEmailFromModal);
    $('dmBlockedEmailUnblockBtn')?.addEventListener('click', unblockEmailFromStartModal);
    document.querySelectorAll('[data-dm-close-blocked-modal]').forEach((el) => {
      el.addEventListener('click', closeBlockedEmailsModal);
    });
    document.querySelectorAll('[data-dm-close-blocked-start-modal]').forEach((el) => {
      el.addEventListener('click', closeBlockedEmailStartModal);
    });
    $('dmChatHeaderAvatarBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHeaderAvatarMenu();
    });
    $('dmChatHeaderAvatarMenu')?.querySelector('[data-dm-header-action="block"]')
      ?.addEventListener('click', () => blockActiveUser());
    $('dmChatHeaderIgnoreBtn')?.addEventListener('click', () => toggleIgnoreActiveUser());
    $('dmChatSendBtn')?.addEventListener('click', submitDmMessage);
    $('dmMessageSearchBtn')?.addEventListener('click', openDmMessageSearch);
    $('dmMessageSearch')?.addEventListener('input', (e) => {
      dmBatch?.setSearchQuery(e.target.value);
      renderDmMessages();
    });
    $('dmChatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitDmMessage();
      }
    });

    $('dmMessagesList')?.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-dm-edit]');
      if (editBtn) return startEditDm(editBtn.dataset.dmEdit);
      const delBtn = e.target.closest('[data-dm-delete]');
      if (delBtn) return deleteDmMessage(delBtn.dataset.dmDelete);
      const saveBtn = e.target.closest('[data-dm-save-edit]');
      if (saveBtn) return saveEditDm(saveBtn.dataset.dmSaveEdit);
      if (e.target.closest('[data-dm-cancel-edit]')) return cancelEditDm();
      const toggleBtn = e.target.closest('[data-dm-toggle-version]');
      if (toggleBtn) {
        const id = toggleBtn.dataset.dmToggleVersion;
        dmViewingOriginalId = dmViewingOriginalId === id ? null : id;
        renderDmMessages();
        return;
      }
      const addBtn = e.target.closest('[data-reaction-add]');
      if (addBtn && addBtn.dataset.msgType === 'dm') {
        e.stopPropagation();
        openReactionPickerFor(addBtn.dataset.msgId, addBtn);
      }
    });

    document.addEventListener('pointerdown', (e) => {
      const pill = e.target.closest('#dmMessagesList [data-reaction-pill]');
      if (!pill || e.button !== 0) return;
      clearReactionPress();
      reactionPress = {
        pill,
        startX: e.clientX,
        startY: e.clientY,
        longFired: false,
        timer: setTimeout(() => {
          if (!reactionPress || reactionPress.pill !== pill) return;
          reactionPress.longFired = true;
          showReactorsPopover(pill);
        }, REACTION_LONG_PRESS_MS),
      };
    }, true);

    document.addEventListener('pointermove', (e) => {
      if (!reactionPress) return;
      const moved = Math.hypot(e.clientX - reactionPress.startX, e.clientY - reactionPress.startY);
      if (moved > 12) clearReactionPress();
    }, true);

    document.addEventListener('pointerup', (e) => {
      const pill = e.target.closest('#dmMessagesList [data-reaction-pill]');
      if (!reactionPress || !pill || reactionPress.pill !== pill) {
        clearReactionPress();
        return;
      }
      clearTimeout(reactionPress.timer);
      const moved = Math.hypot(e.clientX - reactionPress.startX, e.clientY - reactionPress.startY);
      const wasLong = reactionPress.longFired;
      clearReactionPress();
      if (wasLong) {
        e.preventDefault();
        return;
      }
      if (moved > 12) return;
      toggleReaction(pill.dataset.msgId, pill.dataset.emoji);
    }, true);

    document.addEventListener('click', (e) => {
      if (e.target.closest('#dmReactionFloatLayer') || e.target.closest('[data-reaction-add]') || e.target.closest('[data-reaction-pill]')) return;
      closeReactionFloats();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#dmChatHeaderAvatarWrap')) closeHeaderAvatarMenu();
    });
  }

  function startPolling() {
    clearInterval(dmPollInterval);
    clearInterval(convPollInterval);
    convPollInterval = setInterval(() => {
      if (!enabled) return;
      loadConversations();
    }, DM_POLL_MS);
    dmPollInterval = setInterval(() => {
      if (!enabled || view !== 'thread' || !panelOpen) return;
      loadDmMessages();
    }, DM_POLL_MS);
  }

  function stopPolling() {
    clearInterval(dmPollInterval);
    clearInterval(convPollInterval);
    dmPollInterval = null;
    convPollInterval = null;
  }

  function init(user, options = {}) {
    currentUser = user;
    if (options.showConfirm) showConfirm = options.showConfirm;
    if (options.showAlert) showAlert = options.showAlert;
    enabled = !!user && !user.is_guest;
    if (!enabled) {
      hideFab();
      stopPolling();
      stopAppPresence();
      return;
    }
    appPresenceLeft = false;
    showFab();
    bindEvents();
    loadDmSettings().then(() => {
      loadConversations();
    });
    startPolling();
    startAppPresence();
    updateUnreadBadge();
  }

  function onUserUpdated(user) {
    currentUser = user;
    enabled = !!user && !user.is_guest;
    if (!enabled) {
      closePanel();
      hideFab();
      stopPolling();
      leaveAppPresence();
    } else {
      appPresenceLeft = false;
      showFab();
      bindEvents();
      if (!convPollInterval) startPolling();
      startAppPresence();
      loadDmSettings().then(() => loadConversations());
    }
  }

  window.addEventListener('pagehide', leaveAppPresence);

  window.DirectChat = { init, onUserUpdated, openPanel, closePanel, leaveAppPresence, handlePopState };
})();
