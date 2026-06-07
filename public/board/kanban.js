/**
 * board/kanban.js
 * Drag-and-drop, column layout, and task card ordering.
 * Depends on: state.js, helpers.js, team-board.js
 */

// Drag & Drop
function dragOver(e) {
  e.preventDefault();
  e.currentTarget.closest('.kanban-col').classList.add('drag-over');
}
function dragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget))
    e.currentTarget.closest('.kanban-col')?.classList.remove('drag-over');
}

function updateColumnTaskCount(status) {
  const countEl = document.getElementById(`count-${status}`);
  if (countEl) countEl.textContent = getSortedColumnTasks(status).length;
}

function patchBoardLayoutDom(statuses) {
  const affected = statuses || getTeamColumns().map((c) => c.slug);
  affected.forEach((status) => {
    const zone = getColumnDropZone(status);
    if (!zone) return;
    updateColumnTaskCount(status);
    getSortedColumnTasks(status).forEach((task) => {
      let card = document.querySelector(`.task-card[data-id="${task.id}"]`);
      if (!card) card = createTaskCard(task);
      zone.appendChild(card);
    });
  });
  scheduleBoardZoomRemeasure();
}

function collectFullLayoutPayload() {
  const columns = {};
  getTeamColumns().forEach((col) => {
    const ids = getSortedColumnTasks(col.slug).map((t) => t.id);
    if (ids.length) columns[col.slug] = ids;
  });
  return columns;
}

function hasLayoutPersistPending() {
  return layoutPersistQueued || layoutPersistInFlight;
}

function scheduleLayoutPersist() {
  layoutPersistQueued = true;
  clearTimeout(layoutPersistTimer);
  layoutPersistTimer = setTimeout(() => { flushLayoutPersist(); }, LAYOUT_PERSIST_DELAY_MS);
}

async function flushLayoutPersist(isRetry = false) {
  clearTimeout(layoutPersistTimer);
  if (layoutPersistInFlight) return;
  if (!layoutPersistQueued && !isRetry) return;

  const columns = collectFullLayoutPayload();
  if (!Object.keys(columns).length) {
    layoutPersistQueued = false;
    return;
  }

  layoutPersistQueued = false;
  layoutPersistInFlight = true;
  let ok = false;
  try {
    const r = await apiFetch(`/api/teams/${teamId}/tasks/layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns }),
    });
    ok = r.ok;
    if (!ok) {
      const d = await r.json().catch(() => ({}));
      if (!isRetry) {
        await loadTasks();
        layoutPersistQueued = true;
        return flushLayoutPersist(true);
      }
      showAlert(d.error || 'Failed to save task order');
      await loadTasks();
      renderBoard();
    }
  } finally {
    layoutPersistInFlight = false;
    if (layoutPersistQueued) flushLayoutPersist();
  }
  return ok;
}

function applyColumnOrder(status, orderedIds) {
  orderedIds.forEach((id, index) => {
    const t = tasks.find((x) => x.id === id);
    if (t) {
      t.status = status;
      t.position = (index + 1) * 1000;
    }
  });
}

function reorderTasksInColumn(status, draggedId, targetId, placement) {
  const colTasks = getSortedColumnTasks(status);
  const from = colTasks.findIndex((t) => t.id === draggedId);
  let insertAt = colTasks.findIndex((t) => t.id === targetId);
  if (from < 0 || insertAt < 0 || from === insertAt) return;
  const [item] = colTasks.splice(from, 1);
  if (placement === 'bottom') insertAt += 1;
  if (from < insertAt) insertAt -= 1;
  colTasks.splice(insertAt, 0, item);
  const taskIds = colTasks.map((t) => t.id);
  applyColumnOrder(status, taskIds);
  patchBoardLayoutDom([status]);
  scheduleLayoutPersist();
}

function handleTaskCardDrop(targetTask, e) {
  const col = e.currentTarget.closest('.kanban-col');
  col?.classList.remove('drag-over');
  const status = col?.dataset.status;
  const draggedId = draggedTaskId;
  const placement = dragOverTaskPlacement
    || (e.clientY < e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2
      ? 'top' : 'bottom');
  clearTaskDragIndicators();
  if (!draggedId || !status || draggedId === targetTask.id) return;

  const task = tasks.find((t) => t.id === draggedId);
  if (!task) return;

  if (task.status === status) {
    reorderTasksInColumn(status, draggedId, targetTask.id, placement);
    return;
  }

  const oldStatus = task.status;
  const colTasks = getSortedColumnTasks(status).filter((t) => t.id !== draggedId);
  let insertAt = colTasks.findIndex((t) => t.id === targetTask.id);
  if (insertAt < 0) insertAt = colTasks.length;
  if (placement === 'bottom') insertAt += 1;
  colTasks.splice(insertAt, 0, task);
  const destIds = colTasks.map((t) => t.id);

  applyColumnOrder(status, destIds);
  patchBoardLayoutDom([status, oldStatus]);
  scheduleLayoutPersist();
  if (activeTaskId === draggedId) loadComments(activeTaskId);
}

function drop(e) {
  e.preventDefault();
  const col = e.currentTarget.closest('.kanban-col');
  col.classList.remove('drag-over');
  clearTaskDragIndicators();
  const newStatus = col.dataset.status;
  const draggedId = draggedTaskId;
  const task = tasks.find((t) => t.id === draggedId);
  if (!task) return;

  if (task.status === newStatus) {
    const colTasks = getSortedColumnTasks(newStatus);
    const from = colTasks.findIndex((t) => t.id === draggedId);
    if (from >= 0 && from < colTasks.length - 1) {
      const [item] = colTasks.splice(from, 1);
      colTasks.push(item);
      const taskIds = colTasks.map((t) => t.id);
      applyColumnOrder(newStatus, taskIds);
      patchBoardLayoutDom([newStatus]);
      scheduleLayoutPersist();
    }
    return;
  }

  const oldStatus = task.status;
  const colTasks = getSortedColumnTasks(newStatus).filter((t) => t.id !== draggedId);
  colTasks.push(task);
  const destIds = colTasks.map((t) => t.id);

  applyColumnOrder(newStatus, destIds);
  patchBoardLayoutDom([newStatus, oldStatus]);
  scheduleLayoutPersist();
  if (activeTaskId === draggedId) loadComments(activeTaskId);
}
