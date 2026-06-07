/**
 * taskflow/state.js
 * Shared mutable state and constants for the Kanban board page.
 * Load first.
 */

const teamId = window.location.pathname.split('/').pop();
let currentUser = null;
let teamData = null;
let tasks = [];
let teamColumns = [];
let taskAttachments = [];
let editingColumnId = null;
let draggedColumnId = null;
let addTaskShowColumnPicker = false;
let activeTaskId = null;
let draggedTaskId = null;
let dragOverTaskId = null;
let dragOverTaskPlacement = null;
let layoutPersistTimer = null;
let layoutPersistInFlight = false;
let layoutPersistQueued = false;
const LAYOUT_PERSIST_DELAY_MS = 350;
let addTaskStatus = 'todo';
let pollInterval = null;
let presenceInterval = null;
let onlinePollInterval = null;
let onlineUserIds = new Set();
let knownOnlineUserIds = new Set();
let presenceInitialized = false;
let presenceLeft = false;
const TOAST_AUTO_DISMISS_MS = 6000;
const ONLINE_POLL_MS = 4000;
let confirmCallback = null;
let avatarPresets = [];
let editTeamDraft = { presetId: null, avatar_url: null, pendingFile: null };
let teamFormSaving = false;
let chatMessages = [];
let chatReady = false;
let chatPanelOpen = false;
let chatLastReadAt = 0;
let chatReadPersistTimer = null;
let chatPollInterval = null;
let editingChatId = null;
let chatEditDraft = '';
let chatViewingOriginalId = null;
const CHAT_POLL_MS = 4000;
let editingTaskField = null;
let taskEditDraft = '';
let taskViewingOriginalField = null;
let taskComments = [];
let taskCommentsTabActive = false;
let commentUnreadBadgeLoading = false;
let taskCommentsLastReadAt = {};
let taskCommentReadPersistTimer = null;
let editingCommentId = null;
let commentEditDraft = '';
let commentViewingOriginalId = null;
let commentPendingFile = null;
let commentAttachPreviewUrl = null;
let openReactionPicker = null;
let openReactorsPopover = null;
let reactionPress = null;
const REACTION_LONG_PRESS_MS = 450;
let chatBatch = null;
let activityLogs = [];
let activityBatch = null;
let commentBatch = null;
let taskflowHistoryPopping = false;
const TASKFLOW_SIDEPANELS = new Set(['activity', 'team', 'settings', 'chat']);

function isTaskflowSidepanel(name) {
  return TASKFLOW_SIDEPANELS.has(name);
}
let taskModalClosing = false;
let taskSubmitSaving = false;
let attachmentUploadBusy = false;
let coverUploadBusy = false;
let chatPendingFile = null;
let chatAttachPreviewUrl = null;

const ICON_EYE = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>';
const ICON_TRASH = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>';
const ICON_IMAGE = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>';

const REACTION_EMOJIS = {
  love: '❤️', money: '🤑', ok: '👍', haha: '😂', sad: '😢', angry: '😠',
  fire: '🔥', clap: '👏', think: '🤔', party: '🎉', eyes: '👀', hundred: '💯',
};