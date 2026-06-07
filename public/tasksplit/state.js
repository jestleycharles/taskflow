/**
 * TaskSplit page state.
 */

const teamId = window.location.pathname.split('/').pop();
let currentUser = null;
let workspaceData = null;
let expenses = [];
let balances = null;
let activityLogs = [];
let pollInterval = null;
let confirmCallback = null;
const POLL_MS = 5000;
