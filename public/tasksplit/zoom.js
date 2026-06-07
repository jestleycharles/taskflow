/**
 * taskflow/zoom.js
 * Board zoom and pan controls.
 * Depends on: state.js, helpers.js, kanban.js
 */

const TASKFLOW_ZOOM_MIN = 100;
const TASKFLOW_ZOOM_MAX = 500;
const TASKFLOW_ZOOM_STEP = 10;
let taskflowZoomPct = TASKFLOW_ZOOM_MIN;
let taskflowZoomBaseW = 0;
let taskflowZoomBaseH = 0;
let taskflowZoomRemeasureRaf = null;

function clampTaskflowZoom(pct) {
  const n = Math.round(Number(pct) / TASKFLOW_ZOOM_STEP) * TASKFLOW_ZOOM_STEP;
  return Math.min(TASKFLOW_ZOOM_MAX, Math.max(TASKFLOW_ZOOM_MIN, n));
}

/** 100% = normal size; higher % = zoomed out (smaller scale, more board visible). */
function taskflowZoomScale() {
  return 100 / taskflowZoomPct;
}

function updateTaskflowZoomUi() {
  const pctBtn = document.getElementById('taskflowZoomPct');
  const slider = document.getElementById('taskflowZoomSlider');
  const zoomIn = document.getElementById('taskflowZoomIn');
  const zoomOut = document.getElementById('taskflowZoomOut');
  if (pctBtn) pctBtn.textContent = `${taskflowZoomPct}%`;
  if (slider) slider.value = String(taskflowZoomPct);
  if (zoomIn) zoomIn.disabled = taskflowZoomPct <= TASKFLOW_ZOOM_MIN;
  if (zoomOut) zoomOut.disabled = taskflowZoomPct >= TASKFLOW_ZOOM_MAX;
}

function applyTaskflowZoomLayout(focalX, focalY) {
  const container = document.getElementById('expensesContainer');
  const scaler = document.getElementById('taskflowZoomScaler');
  const inner = document.getElementById('taskflowZoomInner');
  if (!container || !scaler || !inner) return;

  const scale = taskflowZoomScale();
  const prevScale = Number(inner.dataset.zoomScale || '1') || 1;
  const hasFocal = focalX != null && focalY != null;
  const fx = hasFocal ? focalX : container.clientWidth / 2;
  const fy = hasFocal ? focalY : container.clientHeight / 2;
  const contentX = (container.scrollLeft + fx) / prevScale;
  const contentY = (container.scrollTop + fy) / prevScale;

  inner.style.transform = `scale(${scale})`;
  inner.dataset.zoomScale = String(scale);
  scaler.style.width = taskflowZoomBaseW ? `${taskflowZoomBaseW * scale}px` : '';
  scaler.style.height = taskflowZoomBaseH ? `${taskflowZoomBaseH * scale}px` : '';

  container.scrollLeft = Math.max(0, contentX * scale - fx);
  container.scrollTop = Math.max(0, contentY * scale - fy);
  updateTaskflowZoomUi();
}

function remeasureTaskflowZoomBase() {
  const inner = document.getElementById('taskflowZoomInner');
  const board = document.getElementById('expensesZoomRoot');
  if (!inner || !board) return;
  const prevTransform = inner.style.transform;
  inner.style.transform = 'none';
  taskflowZoomBaseW = inner.offsetWidth;
  taskflowZoomBaseH = inner.offsetHeight;
  inner.style.transform = prevTransform;
  applyTaskflowZoomLayout();
}

function scheduleTaskflowZoomRemeasure() {
  if (taskflowZoomRemeasureRaf) cancelAnimationFrame(taskflowZoomRemeasureRaf);
  taskflowZoomRemeasureRaf = requestAnimationFrame(() => {
    taskflowZoomRemeasureRaf = null;
    remeasureTaskflowZoomBase();
  });
}

function setTaskflowZoom(pct, focalX, focalY) {
  taskflowZoomPct = clampTaskflowZoom(pct);
  applyTaskflowZoomLayout(focalX, focalY);
}

function changeTaskflowZoom(delta, focalX, focalY) {
  setTaskflowZoom(taskflowZoomPct + delta, focalX, focalY);
}

function promptTaskflowZoomLevel() {
  showZoomLevelModal();
}

function showZoomLevelModal() {
  const modal = document.getElementById('zoomLevelModal');
  const input = document.getElementById('zoomLevelInput');
  if (!modal || !input) return;
  input.value = String(taskflowZoomPct);
  modal.classList.remove('hidden');
  if (TF_VIEWPORT.isMobile()) pushTaskflowOverlay('zoomLevel');
  setTimeout(() => input.focus(), 50);
}

function applyZoomLevelFromModal() {
  const input = document.getElementById('zoomLevelInput');
  if (!input) return;
  const parsed = parseInt(String(input.value).replace(/%/g, '').trim(), 10);
  if (!Number.isFinite(parsed)) return;
  setTaskflowZoom(parsed);
  closeZoomLevelModal();
}

function closeZoomLevelModal() {
  document.getElementById('zoomLevelModal')?.classList.add('hidden');
  if (typeof dismissTaskflowOverlayHistory === 'function') dismissTaskflowOverlayHistory('zoomLevel');
}

function preventBrowserPinchZoom() {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  });
}

function initTaskflowZoom() {
  const container = document.getElementById('expensesContainer');
  const mobileMq = window.matchMedia(TF_VIEWPORT.MOBILE_MQ);
  if (!container) return;

  preventBrowserPinchZoom();

  document.getElementById('taskflowZoomIn')?.addEventListener('click', () => {
    changeTaskflowZoom(-TASKFLOW_ZOOM_STEP);
  });
  document.getElementById('taskflowZoomOut')?.addEventListener('click', () => {
    changeTaskflowZoom(TASKFLOW_ZOOM_STEP);
  });
  document.getElementById('taskflowZoomPct')?.addEventListener('click', promptTaskflowZoomLevel);
  document.getElementById('taskflowZoomSlider')?.addEventListener('input', (e) => {
    setTaskflowZoom(Number(e.target.value));
  });

  function taskflowZoomWheelDelta(deltaY) {
    return deltaY < 0 ? -TASKFLOW_ZOOM_STEP : TASKFLOW_ZOOM_STEP;
  }

  function onTaskflowZoomWheel(e, focalX, focalY) {
    if (mobileMq.matches) return;
    e.preventDefault();
    changeTaskflowZoom(taskflowZoomWheelDelta(e.deltaY), focalX, focalY);
  }

  document.getElementById('taskflowZoomWrap')?.addEventListener('wheel', (e) => {
    onTaskflowZoomWheel(e);
  }, { passive: false });

  container.addEventListener('wheel', (e) => {
    if (mobileMq.matches) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.target.closest('.task-card, .expense-card, button, input, textarea, select, a, label, #taskflowZoomWrap')) return;
    const rect = container.getBoundingClientRect();
    onTaskflowZoomWheel(e, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  let pinch = null;

  function pinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function pinchCenter(touches, rect) {
    const cx = (touches[0].clientX + touches[1].clientX) / 2;
    const cy = (touches[0].clientY + touches[1].clientY) / 2;
    return { x: cx - rect.left, y: cy - rect.top };
  }

  container.addEventListener('touchstart', (e) => {
    if (!mobileMq.matches || e.touches.length !== 2) return;
    if (!e.target.closest('.taskflow-pan-surface, #expensesContainer, #expensesZoomRoot')) return;
    const rect = container.getBoundingClientRect();
    const center = pinchCenter(e.touches, rect);
    pinch = {
      startDist: pinchDistance(e.touches),
      startPct: taskflowZoomPct,
      focalX: center.x,
      focalY: center.y,
    };
    container.classList.add('taskflow-zoom-pinching');
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const center = pinchCenter(e.touches, rect);
    const dist = pinchDistance(e.touches);
    const ratio = dist / pinch.startDist;
    setTaskflowZoom(pinch.startPct / ratio, center.x, center.y);
  }, { passive: false });

  function endPinch() {
    if (!pinch) return;
    pinch = null;
    container.classList.remove('taskflow-zoom-pinching');
  }

  container.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) endPinch();
  });
  container.addEventListener('touchcancel', endPinch);

  const board = document.getElementById('expensesZoomRoot');
  if (board && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => scheduleTaskflowZoomRemeasure());
    ro.observe(board);
  }

  window.addEventListener('resize', () => scheduleTaskflowZoomRemeasure());
  updateTaskflowZoomUi();
  scheduleTaskflowZoomRemeasure();
}

function initTaskflowPan() {
  const el = document.getElementById('expensesContainer');
  if (!el) return;
  const PAN_THRESHOLD = 4;
  const desktopMq = window.matchMedia(TF_VIEWPORT.DESKTOP_MQ);
  let pan = null;

  function isBoardPanTarget(target) {
    if (!target?.closest) return false;
    if (target.closest('.task-card, .expense-card, button, input, textarea, select, a, label')) return false;
    return !!target.closest('.taskflow-pan-surface, #expensesContainer');
  }

  function stopPan() {
    if (!pan) return;
    el.classList.remove('taskflow-panning');
    document.removeEventListener('pointermove', onPanMove);
    document.removeEventListener('pointerup', onPanEnd);
    document.removeEventListener('pointercancel', onPanEnd);
    pan = null;
  }

  function onPanMove(e) {
    if (!pan || e.pointerId !== pan.pointerId) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    if (pan.pending) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      if (!desktopMq.matches && Math.abs(dx) <= Math.abs(dy)) {
        stopPan();
        return;
      }
      pan.pending = false;
      el.classList.add('taskflow-panning');
    }
    e.preventDefault();
    el.scrollLeft = pan.scrollLeft - dx;
    el.scrollTop = pan.scrollTop - dy;
  }

  function onPanEnd(e) {
    if (!pan || (e.pointerId != null && e.pointerId !== pan.pointerId)) return;
    stopPan();
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (!isBoardPanTarget(e.target)) return;
    pan = {
      pending: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      pointerId: e.pointerId,
    };
    document.addEventListener('pointermove', onPanMove, { passive: false });
    document.addEventListener('pointerup', onPanEnd);
    document.addEventListener('pointercancel', onPanEnd);
  }, true);
}