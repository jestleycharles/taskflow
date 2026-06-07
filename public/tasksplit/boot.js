/**
 * TaskSplit page bootstrap.
 */

function applyTeamHeader() {
  const team = workspaceData?.team;
  if (!team) return;

  document.title = `TaskSplit — ${team.name}`;
  document.getElementById('teamName').textContent = team.name;
  document.getElementById('expenseModeBadge').textContent = expenseModeLabel(team.expense_mode);

  const navAvatar = document.getElementById('teamNavAvatar');
  applyTeamAvatarToElement(navAvatar, team);

  const members = workspaceData.members || [];
  const container = document.getElementById('memberAvatars');
  container.innerHTML = members
    .slice(0, 4)
    .map((m) => userAvatarHtml(m, 'w-7 h-7 pointer-events-none'))
    .join('');
}

async function loadWorkspace() {
  const r = await apiFetch(`/api/teams/${teamId}/tasksplit`);
  const data = await parseJsonResponse(r);

  if (!r.ok) {
    if (r.status === 400) {
      window.location = `/board/${teamId}`;
      return false;
    }
    if (r.status === 403 || r.status === 404) {
      window.location = '/dashboard';
      return false;
    }
    showAlert(data.error || 'Failed to load workspace');
    return false;
  }

  workspaceData = data;
  balances = data.balances;
  applyTeamHeader();
  renderBalances();
  applyTasksplitInviteUi();
  return true;
}

async function refreshAll() {
  await loadWorkspace();
  await loadExpenses();
  await loadBalances();
  if (!document.getElementById('activityPanel').classList.contains('hidden')) {
    await loadActivity();
  }
}

function startPolling() {
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    await loadExpenses();
    await loadBalances();
    if (!document.getElementById('activityPanel').classList.contains('hidden')) {
      await loadActivity();
    }
  }, POLL_MS);
}

async function init() {
  showNavigationLoading('Loading TaskSplit…');
  try {
    const meR = await apiFetch('/api/me');
    const meData = await parseJsonResponse(meR);
    if (!meR.ok) {
      if (meR.status === 401) {
        window.location = '/login';
        return;
      }
      return;
    }
    currentUser = meData;
    if (currentUser.is_guest) {
      window.location = '/dashboard';
      return;
    }

    const ok = await loadWorkspace();
    if (!ok) return;

    await loadExpenses();
    startPolling();
  } finally {
    hideNavigationLoading();
  }
}

init();
