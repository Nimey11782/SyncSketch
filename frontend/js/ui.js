import { state, createStroke, addPoint, commitStroke, popStroke, clearStrokes, strokes } from './state.js';
import { canvas, resizeCanvas, renderLiveSegment, renderStroke, renderAllStrokes } from './canvas.js';
import { wsSend, ROOM_ID } from './network.js';
import { getCanvasPos } from './utils.js';

const elRoomIdDisplay = document.getElementById('room-id-display');
const elWsDot         = document.getElementById('ws-dot');
const elUserCount     = document.getElementById('user-count');
const elStatusWs      = document.getElementById('status-ws');
const elBtnCopyLink   = document.getElementById('btn-copy-link');
const elToolBtns      = document.querySelectorAll('.tool-btn');
const elColorPicker   = document.getElementById('color-picker');
const elColorSwatch   = document.getElementById('color-swatch');
const elPresets       = document.querySelectorAll('.preset-color');
const elBrushSize     = document.getElementById('brush-size');
const elBrushLabel    = document.getElementById('brush-size-label');
const elBtnUndo       = document.getElementById('btn-undo');
const elBtnClear      = document.getElementById('btn-clear');
const elModalOverlay  = document.getElementById('modal-overlay');
const elModalCancel   = document.getElementById('modal-cancel');
const elModalConfirm  = document.getElementById('modal-confirm');
const elStatusTool    = document.getElementById('status-tool');
const elStatusSize    = document.getElementById('status-size');
const elStatusStrokes = document.getElementById('status-strokes');
const elStatusCoords  = document.getElementById('status-coords');

const cursorRing = document.createElement('div');
cursorRing.id = 'cursor-ring';
document.body.appendChild(cursorRing);

function updateCursorRing(x, y) {
  const d = state.size;
  cursorRing.style.width  = `${d}px`;
  cursorRing.style.height = `${d}px`;
  cursorRing.style.left   = `${x}px`;
  cursorRing.style.top    = `${y}px`;
  cursorRing.style.borderColor = state.tool === 'eraser' ? 'rgba(200,0,0,.5)' : 'rgba(0,0,0,.35)';
}

export function updateStrokeCount() {
  const n = strokes.length;
  elStatusStrokes.textContent = `${n} ${n === 1 ? 'stroke' : 'strokes'}`;
}

export function setWsStatus(status) {
  const labels = { connecting: 'Connecting…', connected: 'Live', disconnected: 'Offline' };
  elWsDot.className    = `room-dot ${status}`;
  elStatusWs.className = status;
  elStatusWs.textContent = labels[status] ?? status;
}

export function updateUserCount(count) {
  elUserCount.textContent = count;
}

function setColor(hex) {
  state.color = hex;
  elColorSwatch.style.background = hex;
  elPresets.forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === hex);
  });
}

function undoLast() {
  const removed = popStroke();
  if (!removed) return;
  renderAllStrokes();
  updateStrokeCount();
  wsSend('undo', { id: removed.id });
}

function showModal() {
  elModalOverlay.hidden = false;
  elModalConfirm.focus();
}

function hideModal() {
  elModalOverlay.hidden = true;
}

export function setupUI() {
  elRoomIdDisplay.textContent = ROOM_ID;

  canvas.addEventListener('mouseleave', () => { cursorRing.style.display = 'none'; });
  canvas.addEventListener('mouseenter', () => { cursorRing.style.display = 'block'; });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    state.isDrawing = true;
    state.current   = createStroke(state.tool, state.color, state.size);
    const pos = getCanvasPos(canvas, e);
    addPoint(state.current, pos.x, pos.y);
  });

  let _lastProgressSend = 0;
  const PROGRESS_INTERVAL_MS = 50;

  canvas.addEventListener('mousemove', (e) => {
    const pos = getCanvasPos(canvas, e);
    updateCursorRing(e.clientX, e.clientY);
    elStatusCoords.textContent = `x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)}`;

    if (!state.isDrawing || !state.current) return;

    addPoint(state.current, pos.x, pos.y);
    renderLiveSegment(state.current);

    const now = Date.now();
    if (now - _lastProgressSend >= PROGRESS_INTERVAL_MS) {
      _lastProgressSend = now;
      wsSend('stroke_progress', {
        id:    state.current.id,
        tool:  state.current.tool,
        color: state.current.color,
        size:  state.current.size,
        point: pos,
      });
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (!state.isDrawing || !state.current) return;
    const pos = getCanvasPos(canvas, e);
    addPoint(state.current, pos.x, pos.y);

    if (state.current.points.length <= 2) {
      renderStroke(state.current);
    }

    const finishedStroke = state.current;
    commitStroke(finishedStroke);
    state.isDrawing = false;
    state.current   = null;

    updateStrokeCount();
    wsSend('stroke', { stroke: finishedStroke });
  });

  canvas.addEventListener('mouseleave', (e) => {
    if (!state.isDrawing || !state.current) return;
    commitStroke(state.current);
    state.isDrawing = false;
    state.current   = null;
    updateStrokeCount();
  });

  elToolBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (!tool) return;
      state.tool = tool;
      elToolBtns.forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      document.body.className = `tool-${tool}`;
      elStatusTool.textContent = tool.charAt(0).toUpperCase() + tool.slice(1);
    });
  });

  elColorPicker.addEventListener('input', (e) => setColor(e.target.value));
  elPresets.forEach(btn => {
    btn.addEventListener('click', () => {
      setColor(btn.dataset.color);
      elColorPicker.value = btn.dataset.color;
    });
  });

  elBrushSize.addEventListener('input', () => {
    const val = parseInt(elBrushSize.value, 10);
    state.size = val;
    elBrushLabel.textContent = `${val}px`;
    elBrushSize.setAttribute('aria-valuenow', val);
    elStatusSize.textContent = `${val}px`;
  });

  elBtnUndo.addEventListener('click', undoLast);
  elBtnClear.addEventListener('click', showModal);
  elModalCancel.addEventListener('click', hideModal);
  
  elModalConfirm.addEventListener('click', () => {
    clearStrokes();
    renderAllStrokes();
    updateStrokeCount();
    hideModal();
    wsSend('clear', {});
  });

  elModalOverlay.addEventListener('click', (e) => {
    if (e.target === elModalOverlay) hideModal();
  });

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'p' || e.key === 'P') {
      document.getElementById('tool-pencil').click();
    } else if (e.key === 'e' || e.key === 'E') {
      document.getElementById('tool-eraser').click();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undoLast();
    }
  });

  window.addEventListener('resize', resizeCanvas);

  elBtnCopyLink.addEventListener('click', async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      elBtnCopyLink.title = 'Copied!';
      setTimeout(() => { elBtnCopyLink.title = 'Copy invite link'; }, 2000);
    } catch {
      prompt('Copy this link to invite others:', url);
    }
  });
}

export function initInitialState() {
  document.body.classList.add('tool-pencil');
  resizeCanvas();
  elColorSwatch.style.background = state.color;
  elBrushLabel.textContent       = `${state.size}px`;
  elStatusTool.textContent       = 'Pencil';
  elStatusSize.textContent       = `${state.size}px`;
  updateStrokeCount();
  if (elPresets[0]) elPresets[0].classList.add('selected');
}
