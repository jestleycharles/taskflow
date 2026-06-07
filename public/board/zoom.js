/**
 * board/zoom.js
 * Board zoom and pan controls.
 * Depends on: state.js, helpers.js, kanban.js
 */

const BOARD_ZOOM_MIN = 100;
const BOARD_ZOOM_MAX = 500;
const BOARD_ZOOM_STEP = 10;
let boardZoomPct = BOARD_ZOOM_MIN;
let boardZoomBaseW = 0;
let boardZoomBaseH = 0;
let boardZoomRemeasureRaf = null;

function clampBoardZoom(pct) {
  const n = Math.round(Number(pct) / BOARD_ZOOM_STEP) * BOARD_ZOOM_STEP;
  return Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, n));
}

/** 100% = normal size; higher % = zoomed out (smaller scale, more board visible). */
function boardZoomScale() {
  return 100 / boardZoomPct;
}

function updateBoardZoomUi() {
  const pctBtn = document.getElementById('boardZoomPct');
  const slider = document.getElementById('boardZoomSlider');
  const zoomIn = document.getElementById('boardZoomIn');
  const zoomOut = document.getElementById('boardZoomOut');
  if (pctBtn) pctBtn.textContent = `${boardZoomPct}%`;
  if (slider) slider.value = String(boardZoomPct);
  if (zoomIn) zoomIn.disabled = boardZoomPct <= BOARD_ZOOM_MIN;
  if (zoomOut) zoomOut.disabled = boardZoomPct >= BOARD_ZOOM_MAX;
}

function applyBoardZoomLayout(focalX, focalY) {
  const container = document.getElementById('boardContainer');
  const scaler = document.getElementById('boardZoomScaler');
  const inner = document.getElementById('boardZoomInner');
  if (!container || !scaler || !inner) return;

  const scale = boardZoomScale();
  const prevScale = Number(inner.dataset.zoomScale || '1') || 1;
  const hasFocal = focalX != null && focalY != null;
  const fx = hasFocal ? focalX : container.clientWidth / 2;
  const fy = hasFocal ? focalY : container.clientHeight / 2;
  const contentX = (container.scrollLeft + fx) / prevScale;
  const contentY = (container.scrollTop + fy) / prevScale;

  inner.style.transform = `scale(${scale})`;
  inner.dataset.zoomScale = String(scale);
  scaler.style.width = boardZoomBaseW ? `${boardZoomBaseW * scale}px` : '';
  scaler.style.height = boardZoomBaseH ? `${boardZoomBaseH * scale}px` : '';

  container.scrollLeft = Math.max(0, contentX * scale - fx);
  container.scrollTop = Math.max(0, contentY * scale - fy);
  updateBoardZoomUi();
}

function remeasureBoardZoomBase() {
  const inner = document.getElementById('boardZoomInner');
  const board = document.getElementById('kanbanBoard');
  if (!inner || !board) return;
  const prevTransform = inner.style.transform;
  inner.style.transform = 'none';
  boardZoomBaseW = inner.offsetWidth;
  boardZoomBaseH = inner.offsetHeight;
  inner.style.transform = prevTransform;
  applyBoardZoomLayout();
}

function scheduleBoardZoomRemeasure() {
  if (boardZoomRemeasureRaf) cancelAnimationFrame(boardZoomRemeasureRaf);
  boardZoomRemeasureRaf = requestAnimationFrame(() => {
    boardZoomRemeasureRaf = null;
    remeasureBoardZoomBase();
  });
}

function setBoardZoom(pct, focalX, focalY) {
  boardZoomPct = clampBoardZoom(pct);
  applyBoardZoomLayout(focalX, focalY);
}

function changeBoardZoom(delta, focalX, focalY) {
  setBoardZoom(boardZoomPct + delta, focalX, focalY);
}

function promptBoardZoomLevel() {
  showZoomLevelModal();
}

function showZoomLevelModal() {
  const modal = document.getElementById('zoomLevelModal');
  const input = document.getElementById('zoomLevelInput');
  if (!modal || !input) return;
  input.value = String(boardZoomPct);
  modal.classList.remove('hidden');
  if (TF_VIEWPORT.isMobile()) pushBoardOverlay('zoomLevel');
  setTimeout(() => input.focus(), 50);
}

function applyZoomLevelFromModal() {
  const input = document.getElementById('zoomLevelInput');
  if (!input) return;
  const parsed = parseInt(String(input.value).replace(/%/g, '').trim(), 10);
  if (!Number.isFinite(parsed)) return;
  setBoardZoom(parsed);
  closeZoomLevelModal();
}

function closeZoomLevelModal() {
  document.getElementById('zoomLevelModal')?.classList.add('hidden');
}

function preventBrowserPinchZoom() {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  });
}

function initBoardZoom() {
  const container = document.getElementById('boardContainer');
  const mobileMq = window.matchMedia(TF_VIEWPORT.MOBILE_MQ);
  if (!container) return;

  preventBrowserPinchZoom();

  document.getElementById('boardZoomIn')?.addEventListener('click', () => {
    changeBoardZoom(-BOARD_ZOOM_STEP);
  });
  document.getElementById('boardZoomOut')?.addEventListener('click', () => {
    changeBoardZoom(BOARD_ZOOM_STEP);
  });
  document.getElementById('boardZoomPct')?.addEventListener('click', promptBoardZoomLevel);
  document.getElementById('boardZoomSlider')?.addEventListener('input', (e) => {
    setBoardZoom(Number(e.target.value));
  });

  function boardZoomWheelDelta(deltaY) {
    return deltaY < 0 ? -BOARD_ZOOM_STEP : BOARD_ZOOM_STEP;
  }

  function onBoardZoomWheel(e, focalX, focalY) {
    if (mobileMq.matches) return;
    e.preventDefault();
    changeBoardZoom(boardZoomWheelDelta(e.deltaY), focalX, focalY);
  }

  document.getElementById('boardZoomWrap')?.addEventListener('wheel', (e) => {
    onBoardZoomWheel(e);
  }, { passive: false });

  container.addEventListener('wheel', (e) => {
    if (mobileMq.matches) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.target.closest('.task-card, button, input, textarea, select, a, label, #boardZoomWrap')) return;
    const rect = container.getBoundingClientRect();
    onBoardZoomWheel(e, e.clientX - rect.left, e.clientY - rect.top);
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
    if (!e.target.closest('.board-pan-surface, #boardContainer, #kanbanBoard')) return;
    const rect = container.getBoundingClientRect();
    const center = pinchCenter(e.touches, rect);
    pinch = {
      startDist: pinchDistance(e.touches),
      startPct: boardZoomPct,
      focalX: center.x,
      focalY: center.y,
    };
    container.classList.add('board-zoom-pinching');
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const center = pinchCenter(e.touches, rect);
    const dist = pinchDistance(e.touches);
    const ratio = dist / pinch.startDist;
    setBoardZoom(pinch.startPct / ratio, center.x, center.y);
  }, { passive: false });

  function endPinch() {
    if (!pinch) return;
    pinch = null;
    container.classList.remove('board-zoom-pinching');
  }

  container.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) endPinch();
  });
  container.addEventListener('touchcancel', endPinch);

  const board = document.getElementById('kanbanBoard');
  if (board && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => scheduleBoardZoomRemeasure());
    ro.observe(board);
  }

  window.addEventListener('resize', () => scheduleBoardZoomRemeasure());
  updateBoardZoomUi();
  scheduleBoardZoomRemeasure();
}

function initBoardPan() {
  const el = document.getElementById('boardContainer');
  if (!el) return;
  const PAN_THRESHOLD = 4;
  const desktopMq = window.matchMedia(TF_VIEWPORT.DESKTOP_MQ);
  let pan = null;

  function isBoardPanTarget(target) {
    if (!target?.closest) return false;
    if (target.closest('.task-card, button, input, textarea, select, a, label')) return false;
    return !!target.closest('.board-pan-surface, #boardContainer');
  }

  function stopPan() {
    if (!pan) return;
    el.classList.remove('board-panning');
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
      el.classList.add('board-panning');
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