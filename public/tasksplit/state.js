/**
 * TaskSplit page state.
 */

const teamId = window.location.pathname.split('/').pop();
let currentUser = null;
let workspaceData = null;
let teamData = null;
let expenses = [];
let balances = null;
let settlements = [];
let activityLogs = [];
let pollInterval = null;
let confirmCallback = null;
const POLL_MS = 5000;

// Shared with taskflow chat / presence / settings modules
let presenceInterval = null;
let onlinePollInterval = null;
let onlineUserIds = new Set();
let knownOnlineUserIds = new Set();
let presenceInitialized = false;
let presenceLeft = false;
const TOAST_AUTO_DISMISS_MS = 6000;
const ONLINE_POLL_MS = 4000;
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
let chatBatch = null;
let activityBatch = null;
let openReactionPicker = null;
let openReactorsPopover = null;
let reactionPress = null;
const REACTION_LONG_PRESS_MS = 450;
let taskflowHistoryPopping = false;
const TASKFLOW_SIDEPANELS = new Set(['activity', 'team', 'settings', 'chat', 'balance']);
let chatPendingFile = null;
let chatAttachPreviewUrl = null;

// Expense detail comments
let activeExpenseId = null;
let expenseDetailTab = 'details';
let expenseComments = [];
let expenseCommentsReady = false;
let expenseCommentBatch = null;
let editingExpenseCommentId = null;
let expenseCommentEditDraft = '';
let expenseCommentViewingOriginalId = null;
let expenseCommentPendingFile = null;
let expenseCommentAttachPreviewUrl = null;
let editingExpenseField = null;
let expenseEditDraft = '';
let editingExpenseId = null;
let settleTargetUserId = null;
let settleMaxAmount = 0;

function isTaskflowSidepanel(name) {
  return TASKFLOW_SIDEPANELS.has(name);
}

const REACTION_EMOJIS = {
  love: '❤️', money: '🤑', ok: '👍', haha: '😂', sad: '😢', angry: '😠',
  fire: '🔥', clap: '👏', think: '🤔', party: '🎉', eyes: '👀', hundred: '💯',
};

const ICON_IMAGE = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>';
