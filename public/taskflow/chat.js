/**
 * taskflow/chat.js
 * Team chat panel, messages, and reactions.
 * Depends on: state.js, helpers.js, members.js
 */

// Team Chat
function isMobileTaskflowLayout() {
  return TF_VIEWPORT.isMobile();
}

function setChatPanelOpenUi(open) {
  const mobile = isMobileTaskflowLayout();
  document.body.classList.toggle('chat-panel-mobile-open', open && mobile);
  document.getElementById('chatMobileBackdrop')?.classList.toggle('hidden', !open);
}

function setSidePanelMobileOpen(open) {
  document.body.classList.toggle('side-panel-mobile-open', open && isMobileTaskflowLayout());
}

function showChatMessagesLoading() {
  document.getElementById('chatMessagesList').innerHTML = messageListSkeletonHtml();
}

function openChatPanel() {
  closeTaskflowOverlayBeforeOpen('chat');
  closeAllSidePanels();
  chatPanelOpen = true;
  applyChatComposerState();
  document.getElementById('chatPanel').classList.remove('hidden');
  document.getElementById('chatFabWrap').classList.add('hidden');
  setChatPanelOpenUi(true);
  markChatRead();
  if (!chatReady) showChatMessagesLoading();
  else renderChatMessages();
  scrollChatToBottom();
  if (!isGuest()) setTimeout(() => document.getElementById('chatInput')?.focus(), 50);
  pushTaskflowOverlay('chat');
}

function closeChatPanelUi() {
  closeReactionFloats();
  dismissMessageComposer(
    document.getElementById('chatInput'),
    document.getElementById('chatSendBtn')
  );
  chatPanelOpen = false;
  document.getElementById('chatPanel').classList.add('hidden');
  document.getElementById('chatFabWrap').classList.remove('hidden');
  setChatPanelOpenUi(false);
  editingChatId = null;
  chatEditDraft = '';
  chatViewingOriginalId = null;
  chatBatch?.reset();
  const chatSearchEl = document.getElementById('chatMessageSearch');
  if (chatSearchEl) chatSearchEl.value = '';
  syncChatVersionFocusUi();
  updateChatUnreadBadge();
}
function closeChatPanel() {
  requestCloseTaskflowOverlay();
}

function toggleChatMessageVersion(messageId) {
  chatViewingOriginalId = chatViewingOriginalId === messageId ? null : messageId;
  renderChatMessages();
}

function syncChatVersionFocusUi() {
  const list = document.getElementById('chatMessagesList');
  const panel = document.getElementById('chatPanel');
  const viewing = !!chatViewingOriginalId;
  list?.classList.toggle('chat-viewing-original', viewing);
  panel?.classList.toggle('chat-viewing-original', viewing);
  if (!list || !viewing) return;
  list.querySelectorAll('[data-chat-msg-id]').forEach((el) => {
    el.classList.toggle('chat-msg-version-active', el.dataset.chatMsgId === chatViewingOriginalId);
  });
}

async function loadChatReadState() {
  const r = await apiFetch(`/api/teams/${teamId}/chat/read`);
  if (!r.ok) return;
  const data = await parseJsonResponse(r);
  if (data?.last_read_at) {
    const t = new Date(data.last_read_at).getTime();
    if (!Number.isNaN(t)) chatLastReadAt = t;
  }
}

function persistChatReadState() {
  clearTimeout(chatReadPersistTimer);
  chatReadPersistTimer = setTimeout(async () => {
    await apiFetch(`/api/teams/${teamId}/chat/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_read_at: new Date(chatLastReadAt).toISOString() }),
    });
  }, 300);
}

function markChatRead() {
  const latest = chatMessages.reduce((max, m) => {
    const t = new Date(m.created_at).getTime();
    return t > max ? t : max;
  }, 0);
  chatLastReadAt = Math.max(chatLastReadAt, latest, Date.now());
  updateChatUnreadBadge();
  persistChatReadState();
}

function updateChatUnreadBadge() {
  const badge = document.getElementById('chatUnreadBadge');
  if (chatPanelOpen) {
    badge.classList.add('hidden');
    return;
  }
  const unread = chatMessages.filter(m => {
    if (m.deleted_at) return false;
    if (String(m.user_id) === String(currentUser?.id)) return false;
    return new Date(m.created_at).getTime() > chatLastReadAt;
  }).length;
  if (unread > 0) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function formatChatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function scrollChatToBottom() {
  const list = document.getElementById('chatMessagesList');
  if (list) list.scrollTop = list.scrollHeight;
}

function renderChatMessageActions(msg) {
  if (isGuest() || String(msg.user_id) !== String(currentUser?.id) || msg.deleted_at) return '';
  if (editingChatId === msg.id) return '';
  return `<div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
      <button type="button" onclick="startEditChatMessage('${msg.id}')" class="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/10" title="Edit">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      </button>
      <button type="button" onclick="deleteChatMessage('${msg.id}')" class="text-gray-500 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10" title="Delete">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </div>`;
}

function renderChatMessageBody(msg) {
  const user = msg.user || { username: '?', avatar_color: '#4f6ef7' };
  const sentAt = formatChatDateTime(msg.created_at);

  if (msg._pendingSend) {
    const hasAttachment = !!msg._hasAttachment || !!(msg.attachments && msg.attachments.length);
    return `<div class="flex items-start gap-3 chat-msg-pending" data-chat-msg-id="${msg.id}">
      ${chatMessageAvatarHtml(user, msg.user_id)}
      <div class="flex-1 min-w-0">
        <div class="skeleton h-2.5 w-24 rounded mb-2"></div>
        ${messageBusyBodySkeletonHtml({ hasAttachment })}
      </div>
    </div>`;
  }

  const pendingOp = getPendingMessageOp('chat', msg.id);
  if (pendingOp === 'delete') {
    return `<div class="group flex items-start gap-3" data-chat-msg-id="${msg.id}">
      ${chatMessageAvatarHtml(user, msg.user_id)}
      <div class="flex-1 min-w-0">${messageDeleteBusySkeletonHtml()}</div>
    </div>`;
  }
  if (pendingOp === 'edit') {
    const hasAttachment = !!(msg.attachments && msg.attachments.length);
    return `<div class="group flex items-start gap-3" data-chat-msg-id="${msg.id}">
      ${chatMessageAvatarHtml(user, msg.user_id)}
      <div class="flex-1 min-w-0">${messageBusyBodySkeletonHtml({ hasAttachment })}</div>
    </div>`;
  }

  if (msg.deleted_at) {
    return `<div class="chat-msg-tombstone rounded-xl p-3" data-chat-msg-id="${msg.id}">
        <p class="text-xs text-gray-500 italic">Message deleted</p>
        <p class="text-xs text-gray-600 mt-1.5">${memberNameHtml(user, msg.user_id, 'text-xs inline')} · ${escHtml(sentAt)}</p>
      </div>`;
  }

  if (editingChatId === msg.id) {
    return `<div class="bg-ink-700/80 border border-brand-500/30 rounded-xl p-3 space-y-2" data-chat-edit-wrap="${msg.id}">
        <textarea id="chatEditInput-${msg.id}" rows="3" oninput="chatEditDraft=this.value"
          class="w-full bg-ink-700 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500 transition resize-none"></textarea>
        <div class="flex gap-2 justify-end">
          <button type="button" onclick="cancelEditChatMessage()" class="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/10 transition">Cancel</button>
          <button type="button" onclick="saveEditChatMessage('${msg.id}')" class="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition font-medium">Save</button>
        </div>
      </div>`;
  }

  const editedNote = msg.edited_at
    ? `<span class="text-gray-600"> · edited ${escHtml(formatChatDateTime(msg.edited_at))}</span>`
    : '';

  const hasOriginal = !!msg.edited_at;
  const showingOriginal = hasOriginal && chatViewingOriginalId === msg.id;
  const displayContent = showingOriginal ? msg.content_before_edit : msg.content;
  const versionToggle = hasOriginal
    ? `<button type="button" onclick="toggleChatMessageVersion('${msg.id}')"
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
        ${displayContent ? `<p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">${formatMessageBodyHtml(displayContent)}</p>` : ''}
        ${versionToggle}
      </div>`
    : (displayContent
      ? `<p class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-words">${formatMessageBodyHtml(displayContent)}</p>`
      : '');

  const attachmentsHtml = renderMessageAttachmentsHtml(msg.attachments);

  const mentionedYou = messageMentionsCurrentUser(displayContent);
  const mentionRowClass = mentionedYou ? ' msg-mentioned-you' : '';
  const versionActiveClass = showingOriginal ? ' chat-msg-version-active' : '';
  return `<div class="group flex items-start gap-3${versionActiveClass}${mentionRowClass}" data-chat-msg-id="${msg.id}">
      ${chatMessageAvatarHtml(user, msg.user_id)}
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2 mb-1">
          <div class="min-w-0">
            <span class="text-xs font-medium">${memberNameHtml(user, msg.user_id, 'text-xs')}</span>
            <p class="text-xs text-gray-600 mt-0.5">${escHtml(sentAt)}${editedNote}</p>
          </div>
          ${renderChatMessageActions(msg)}
        </div>
        ${bodyHtml}
        ${attachmentsHtml}
        ${renderReactionsBar('chat', msg.id, msg.reactions || [])}
      </div>
    </div>`;
}

function reactionSymbol(emoji) {
  return REACTION_EMOJIS[emoji] || emoji;
}

function reactionUsersTitle(reaction) {
  const names = (reaction.users || []).map((u) => u.username).join(', ');
  return `${reactionSymbol(reaction.emoji)} ${names || 'No one yet'}`;
}

function findReactionUsers(messageType, messageId, emoji) {
  let reactions = [];
  if (messageType === 'chat') {
    reactions = chatMessages.find((m) => m.id === messageId)?.reactions || [];
  } else if (messageType === 'expense_comment') {
    reactions = (typeof expenseComments !== 'undefined' ? expenseComments : [])
      .find((c) => c.id === messageId)?.reactions || [];
  } else {
    reactions = (typeof taskComments !== 'undefined' ? taskComments : [])
      .find((c) => c.id === messageId)?.reactions || [];
  }
  return reactions.find((r) => r.emoji === emoji)?.users || [];
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
  const layer = document.getElementById('reactionFloatLayer');
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
  const layer = document.getElementById('reactionFloatLayer');
  layer.innerHTML = '';

  if (openReactorsPopover) {
    const popSelector = `[data-reaction-pill][data-msg-type="${openReactorsPopover.messageType}"][data-msg-id="${openReactorsPopover.messageId}"][data-emoji="${openReactorsPopover.emoji}"]`;
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
             <span class="text-sm truncate">${memberNameHtml(u, u.id, 'text-sm')}</span>
           </li>`).join('')}</ul>`
      : `<p class="text-xs text-gray-400">${sym} — no reactions yet</p>`;
    positionReactionFloat(pop, anchor);
    }
  }

  if (openReactionPicker) {
    const pickerSelector = `[data-reaction-add][data-msg-type="${openReactionPicker.type}"][data-msg-id="${openReactionPicker.id}"]`;
    const anchor = resolveReactionAnchor(openReactionPicker.anchor, pickerSelector);
    if (!anchor) {
      openReactionPicker = null;
    } else {
    openReactionPicker.anchor = anchor;
    const { type: messageType, id: messageId } = openReactionPicker;
    const picker = document.createElement('div');
    picker.className = 'reaction-picker flex flex-wrap gap-0.5 p-2 rounded-xl bg-ink-700 border border-white/15 max-w-[240px]';
    picker.onclick = (e) => e.stopPropagation();
    picker.innerHTML = Object.entries(REACTION_EMOJIS).map(([key, sym]) =>
      `<button type="button" data-reaction-emoji="${key}"
        class="text-lg hover:scale-110 transition p-1 rounded-lg hover:bg-white/10" title="${key}">${sym}</button>`
    ).join('');
    picker.querySelectorAll('[data-reaction-emoji]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReaction(messageType, messageId, btn.dataset.reactionEmoji);
      });
    });
    positionReactionFloat(picker, anchor);
    }
  }
}

function renderReactionsBar(messageType, messageId, reactions) {
  const pills = (reactions || []).map((r) => {
    const mine = (r.users || []).some((u) => String(u.id) === String(currentUser?.id));
    return `<button type="button" data-reaction-pill data-msg-type="${messageType}" data-msg-id="${messageId}" data-emoji="${r.emoji}"
        title="Hold to see who reacted"
        class="reaction-pill inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 ${mine ? 'reaction-pill-active' : ''}">
        <span>${reactionSymbol(r.emoji)}</span>
        <span class="text-gray-400">${r.count}</span>
      </button>`;
  }).join('');
  const addBtn = isGuest() ? '' : `<button type="button" data-reaction-add data-msg-type="${messageType}" data-msg-id="${messageId}"
      onclick="event.stopPropagation(); openReactionPickerFor('${messageType}','${messageId}', this)"
      class="text-xs text-gray-500 hover:text-white px-1.5 py-0.5 rounded-full hover:bg-white/10 transition" title="Add reaction">+</button>`;
  return `<div class="flex flex-wrap items-center gap-1.5 mt-2">${pills}${addBtn}</div>`;
}

function openReactionPickerFor(messageType, messageId, anchorEl) {
  if (isGuest()) return;
  openReactorsPopover = null;
  if (openReactionPicker?.type === messageType && openReactionPicker?.id === messageId) {
    openReactionPicker = null;
  } else {
    openReactionPicker = { type: messageType, id: messageId, anchor: anchorEl };
  }
  syncReactionFloatUi();
}

function showReactorsPopover(pill) {
  const messageType = pill.dataset.msgType;
  const messageId = pill.dataset.msgId;
  const emoji = pill.dataset.emoji;
  openReactionPicker = null;
  openReactorsPopover = {
    messageType,
    messageId,
    emoji,
    users: findReactionUsers(messageType, messageId, emoji),
    anchor: pill,
  };
  syncReactionFloatUi();
}

function clearReactionPress() {
  if (reactionPress?.timer) clearTimeout(reactionPress.timer);
  reactionPress = null;
}

function onReactionPillPointerDown(e) {
  const pill = e.target.closest('[data-reaction-pill]');
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
}

function onReactionPillPointerMove(e) {
  if (!reactionPress) return;
  const moved = Math.hypot(e.clientX - reactionPress.startX, e.clientY - reactionPress.startY);
  if (moved > 12) clearReactionPress();
}

function onReactionPillPointerUp(e) {
  const pill = e.target.closest('[data-reaction-pill]');
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
  toggleReaction(pill.dataset.msgType, pill.dataset.msgId, pill.dataset.emoji);
}

async function toggleReaction(messageType, messageId, emoji) {
  if (isGuest()) return;
  closeReactionFloats();
  const r = await apiFetch('/api/reactions/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageType, messageId, emoji }),
  });
  const data = await parseJsonResponse(r);
  if (!r.ok) {
    showAlert(data.error || 'Failed to react');
    return;
  }
  if (messageType === 'chat') {
    const idx = chatMessages.findIndex((m) => m.id === messageId);
    if (idx !== -1) chatMessages[idx] = { ...chatMessages[idx], reactions: data.reactions || [] };
    renderChatMessages();
  } else if (messageType === 'expense_comment') {
    const idx = expenseComments.findIndex((c) => c.id === messageId);
    if (idx !== -1) expenseComments[idx] = { ...expenseComments[idx], reactions: data.reactions || [] };
    if (typeof renderExpenseComments === 'function') renderExpenseComments();
  } else {
    const idx = taskComments.findIndex((c) => c.id === messageId);
    if (idx !== -1) taskComments[idx] = { ...taskComments[idx], reactions: data.reactions || [] };
    if (typeof renderComments === 'function') renderComments();
  }
}

function captureChatEditDraft() {
  if (!editingChatId) return;
  const ta = document.getElementById(`chatEditInput-${editingChatId}`);
  if (ta) chatEditDraft = ta.value;
}

function renderChatMessages(batchScrollHint) {
  const list = document.getElementById('chatMessagesList');
  if (!list || !chatBatch) return;
  const scrollTop = list.scrollTop;
  const scrollHeight = list.scrollHeight;
  const atBottom = scrollHeight - list.clientHeight - scrollTop < 48;
  const emptyHtml = '<p class="text-sm text-gray-600 text-center py-8">No messages yet. Say hello to your team.</p>';
  const { scrollToTop } = chatBatch.renderList(
    list,
    chatMessages,
    renderChatMessageBody,
    emptyHtml,
  );
  syncChatVersionFocusUi();
  if (openReactionPicker || openReactorsPopover) syncReactionFloatUi();

  if (editingChatId) {
    const ta = document.getElementById(`chatEditInput-${editingChatId}`);
    if (ta) {
      ta.value = chatEditDraft;
      attachMentionAutocompleteToEditTextarea(ta);
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  } else if (batchScrollHint === 'older' || scrollToTop) {
    list.scrollTop = 0;
  } else if (!atBottom && chatBatch.isAtLatest()) {
    list.scrollTop = scrollTop;
  }
  syncMessageAttachmentsIn(list);
}

async function loadChat() {
  if (chatPanelOpen && !chatReady) showChatMessagesLoading();
  const r = await apiFetch(`/api/teams/${teamId}/chat`);
  if (!r.ok) return;
  const data = await parseJsonResponse(r);
  if (!Array.isArray(data)) return;
  const prevLen = chatMessages.length;
  const prevLastId = chatMessages[chatMessages.length - 1]?.id;
  chatMessages = data;
  chatReady = true;
  if (chatPanelOpen) {
    if (editingChatId) {
      captureChatEditDraft();
      const editingMsg = data.find(m => m.id === editingChatId);
      if (editingMsg && !editingMsg.deleted_at) {
        const idx = chatMessages.findIndex(m => m.id === editingChatId);
        if (idx !== -1) chatMessages[idx] = { ...editingMsg, content: chatEditDraft || editingMsg.content };
      }
    } else {
      renderChatMessages();
      if (chatBatch.isAtLatest() && (data.length > prevLen || data[data.length - 1]?.id !== prevLastId)) {
        scrollChatToBottom();
      }
    }
    markChatRead();
  } else {
    updateChatUnreadBadge();
  }
}

function startChatPolling() {
  chatPollInterval = setInterval(loadChat, CHAT_POLL_MS);
}

async function submitChatMessage() {
  if (isGuest()) return;
  const input = document.getElementById('chatInput');
  const btn = document.getElementById('chatSendBtn');
  const file = chatPendingFile;
  const textContent = prepareOutgoingMessage(input?.value);

  if (file) {
    const key = `team-chat:${teamId}`;
    if (messageSendInFlight.has(key) || sendCooldownTimers.has(key)) return;
    if (!textContent && !file) return;

    messageSendInFlight.add(key);
    if (input) { input.disabled = true; }
    if (btn) btn.disabled = true;

    const pendingId = `pending-${Date.now()}`;
    chatBatch.showLatestBatch();
    chatMessages.push({
      id: pendingId,
      _pendingSend: true,
      _hasAttachment: true,
      user_id: currentUser?.id,
      user: currentUser,
      created_at: new Date().toISOString(),
      content: textContent || '',
    });
    renderChatMessages();
    scrollChatToBottom();

    const form = new FormData();
    if (textContent) form.append('content', textContent);
    form.append('file', file);

    try {
      const r = await apiFetch(`/api/teams/${teamId}/chat`, { method: 'POST', body: form });
      const msg = await parseJsonResponse(r);
      if (!r.ok) {
        chatMessages = chatMessages.filter((m) => m.id !== pendingId);
        renderChatMessages();
        const limited = messageSendRateLimitResult(r.status, msg);
        if (limited) {
          applyMessageSendCooldown(key, {
            retryAfterMs: limited.rateLimit.retryAfterMs,
            error: limited.rateLimit.error,
            inputEl: input,
            sendBtnEl: btn,
            noticeEl: document.getElementById('chatSendCooldown'),
          });
          return;
        }
        showAlert(msg.error || 'Failed to send message');
        return;
      }
      const idx = chatMessages.findIndex((m) => m.id === pendingId);
      if (idx !== -1) chatMessages[idx] = msg;
      else chatMessages.push(msg);
      if (input) input.value = '';
      clearChatPendingFile();
      renderChatMessages();
      scrollChatToBottom();
      markChatRead();
    } catch {
      chatMessages = chatMessages.filter((m) => m.id !== pendingId);
      renderChatMessages();
    } finally {
      messageSendInFlight.delete(key);
      if (input && !sendCooldownTimers.has(key)) input.disabled = false;
      if (btn && !sendCooldownTimers.has(key)) btn.disabled = false;
    }
    return;
  }

  await submitMessageOnce(`team-chat:${teamId}`, {
    inputEl: input,
    sendBtnEl: btn,
    cooldownNoticeEl: document.getElementById('chatSendCooldown'),
    getContent: () => prepareOutgoingMessage(input?.value),
    onBeforeSend: (content) => {
      const pendingId = `pending-${Date.now()}`;
      chatBatch.showLatestBatch();
      chatMessages.push({
        id: pendingId,
        _pendingSend: true,
        user_id: currentUser?.id,
        user: currentUser,
        created_at: new Date().toISOString(),
        content,
      });
      renderChatMessages();
      scrollChatToBottom();
      return pendingId;
    },
    send: async (content, pendingId) => {
      const r = await apiFetch(`/api/teams/${teamId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const msg = await parseJsonResponse(r);
      if (!r.ok) {
        if (pendingId) chatMessages = chatMessages.filter((m) => m.id !== pendingId);
        renderChatMessages();
        const limited = messageSendRateLimitResult(r.status, msg);
        if (limited) return limited;
        showAlert(msg.error || 'Failed to send message');
        return false;
      }
      const idx = chatMessages.findIndex((m) => m.id === pendingId);
      if (idx !== -1) chatMessages[idx] = msg;
      else chatMessages.push(msg);
      renderChatMessages();
      scrollChatToBottom();
      markChatRead();
      return true;
    },
  });
}

function startEditChatMessage(messageId) {
  if (isGuest()) return;
  const msg = chatMessages.find(m => m.id === messageId);
  if (!msg || msg.deleted_at) return;
  editingChatId = messageId;
  chatEditDraft = msg.content;
  renderChatMessages();
}

function cancelEditChatMessage() {
  editingChatId = null;
  chatEditDraft = '';
  renderChatMessages();
}

async function saveEditChatMessage(messageId) {
  const textarea = document.getElementById(`chatEditInput-${messageId}`);
  const content = prepareOutgoingMessage(textarea?.value);
  if (!content) return;
  editingChatId = null;
  chatEditDraft = '';
  setPendingMessageOp('chat', messageId, 'edit');
  renderChatMessages();
  try {
    const r = await apiFetch(`/api/teams/${teamId}/chat/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const updated = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(updated.error || 'Failed to edit message');
      return;
    }
    const idx = chatMessages.findIndex(m => m.id === messageId);
    if (idx !== -1) chatMessages[idx] = updated;
    if (chatViewingOriginalId === messageId) chatViewingOriginalId = null;
  } finally {
    clearPendingMessageOp('chat', messageId);
    renderChatMessages();
  }
}

function deleteChatMessage(messageId) {
  if (isGuest()) return;
  showConfirm({
    title: 'Delete message',
    message: 'Delete this message? This cannot be undone.',
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => executeDeleteChatMessage(messageId),
  });
}

async function executeDeleteChatMessage(messageId) {
  if (editingChatId === messageId) {
    editingChatId = null;
    chatEditDraft = '';
  }
  setPendingMessageOp('chat', messageId, 'delete');
  renderChatMessages();
  try {
    const r = await apiFetch(`/api/teams/${teamId}/chat/${messageId}`, { method: 'DELETE' });
    const updated = await parseJsonResponse(r);
    if (!r.ok) {
      showAlert(updated.error || 'Failed to delete message');
      return;
    }
    const idx = chatMessages.findIndex(m => m.id === messageId);
    if (idx !== -1) chatMessages[idx] = updated;
    if (chatViewingOriginalId === messageId) chatViewingOriginalId = null;
  } finally {
    clearPendingMessageOp('chat', messageId);
    renderChatMessages();
  }
}

function showActivityLoading() {
  const list = document.getElementById('activityList');
  if (!list) return;
  list.innerHTML = activityListSkeletonHtml();
}
