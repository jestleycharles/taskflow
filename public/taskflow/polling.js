/**
 * taskflow/polling.js
 * Real-time task polling loop.
 * Depends on: state.js, helpers.js, team-taskflow.js, kanban.js, tasks.js
 */

// Real-time polling (5s); only re-builds the board when task fields change, not on every unread tick
function startPolling() {
  pollInterval = setInterval(async () => {
    await pollTeamRoleState();
    const r = await apiFetch(`/api/teams/${teamId}/tasks`);
    const newTasks = await parseJsonResponse(r);
    if (!r.ok) {
      if (isTeamAccessLostResponse(r.status, newTasks)) showTeamGoneModal();
      return;
    }
    if (!Array.isArray(newTasks)) return;
    const { merged, taskflowDirty } = mergePolledTasks(newTasks);
    const unreadOnlyChange = !taskflowDirty && merged.some((t, i) => {
      const prev = tasks.find((p) => p.id === t.id);
      return prev && (prev.unread_comment_count || 0) !== (t.unread_comment_count || 0);
    });
    if (taskflowDirty || unreadOnlyChange) {
      if (taskflowDirty && hasLayoutPersistPending()) {
        merged.forEach((t) => {
          const local = tasks.find((p) => p.id === t.id);
          if (local) local.unread_comment_count = t.unread_comment_count || 0;
          updateTaskCardUnreadBadge(t.id, t.unread_comment_count || 0);
        });
      } else {
        tasks = merged;
        if (taskflowDirty) {
          renderTaskflow();
          ensureTaskflowTasksRendered();
          if (activeTaskId && !editingTaskField) {
            const task = tasks.find(t => t.id === activeTaskId);
            if (task) {
              renderTaskTitleArea(task);
              renderTaskDescArea(task);
              const statusEl = document.getElementById('detailStatus');
              if (statusEl) statusEl.value = task.status;
            }
          }
        } else {
          merged.forEach((t) => updateTaskCardUnreadBadge(t.id, t.unread_comment_count || 0));
        }
      }
      if (document.getElementById('activityPanel').offsetParent !== null) loadActivity({ background: true });
    }
    if (activeTaskId && !document.getElementById('taskModal').classList.contains('hidden')) {
      loadComments(activeTaskId);
    }
    ensureTaskflowTasksRendered();
  }, 5000);
}
