/**
 * TaskSplit page state.
 */

const teamId = window.location.pathname.split('/').pop();
let currentUser = null;
let workspaceData = null;
let teamData = null;
let expenses = [];
let balances = null;
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

function isTaskflowSidepanel(name) {
  return TASKFLOW_SIDEPANELS.has(name);
}

const REACTION_EMOJIS = {
  love: '❤️', money: '🤑', ok: '👍', haha: '😂', sad: '😢', angry: '😠',
  fire: '🔥', clap: '👏', think: '🤔', party: '🎉', eyes: '👀', hundred: '💯',
};
