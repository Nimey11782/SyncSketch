'use strict';

/** building the data model first , creating the stroke objects storing every imp info about a 
 * stroke when stroke is completed then will store it in global stroke aarray hmm to provide functionalites 
 * like undo resize ... */

/** @type {StrokeElement[]} — the single source of truth for canvas content */
const strokes = [];

/**
 * Create a new (in-progress) StrokeElement.
 * @param {'pencil'|'eraser'} tool
 * @param {string} color
 * @param {number} size
 * @returns {StrokeElement}
 */
function createStroke(tool, color, size) {
  return {
    id:     generateId(),
    tool,
    color,
    size,
    points: [],
  };
}

/**
 * Append a point to a stroke.
 * @param {StrokeElement} stroke
 * @param {number} x
 * @param {number} y
 */
function addPoint(stroke, x, y) {
  stroke.points.push({ x, y });
}

/** Commit a finished stroke to the shared store. */
function commitStroke(stroke) {
  strokes.push(stroke);
}

/** Remove the most recent stroke (undo). Returns the removed stroke or null. */
function popStroke() {
  return strokes.pop() ?? null;
}

/** Remove all strokes. */
function clearStrokes() {
  strokes.length = 0;
}

/** Lightweight unique-id (no dependency needed for Phase 1). */
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}


/* ═══════════════════════════════════════════════════════════════════
   [B] DRAW ENGINE
   ═══════════════════════════════════════════════════════════════════ */

const canvas  = /** @type {HTMLCanvasElement} */ (document.getElementById('whiteboard'));
const ctx     = canvas.getContext('2d');

/**
 * Resize the canvas backing store to match its CSS display size.
 * Must be called on load and every time the window resizes.
 */
function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width  = container.clientWidth;
  canvas.height = container.clientHeight;
  renderAllStrokes();
}

/**
 * Render every committed stroke onto the canvas from scratch.
 * Called after resize or undo.
 */
function renderAllStrokes() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach(renderStroke);
}

/**
 * Render a single StrokeElement.
 * @param {StrokeElement} stroke
 */
function renderStroke(stroke) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  applyStrokeStyle(ctx, stroke);

  ctx.beginPath();

  if (pts.length === 1) {
    // Single tap → draw a dot
    ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Smooth curve through points using quadratic bezier
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    // Draw to the last point
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw a stroke that is still in progress (live preview).
 * We only draw the last segment, not the whole path, for performance.
 * @param {StrokeElement} stroke
 */
function renderLiveSegment(stroke) {
  const pts = stroke.points;
  if (pts.length < 2) return;

  ctx.save();
  applyStrokeStyle(ctx, stroke);

  const len = pts.length;
  const p1  = pts[len - 2];
  const p2  = pts[len - 1];

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  ctx.restore();
}

/**
 * Configure canvas context for a given stroke.
 * @param {CanvasRenderingContext2D} ctx
 * @param {StrokeElement} stroke
 */
function applyStrokeStyle(ctx, stroke) {
  if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle   = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle   = stroke.color;
  }
  ctx.lineWidth   = stroke.size;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
}


/* ═══════════════════════════════════════════════════════════════════
   [C] UI LAYER
   ═══════════════════════════════════════════════════════════════════ */

/* ── Tool state ─────────────────────────────────────────────────── */
const state = {
  tool:      'pencil',    // 'pencil' | 'eraser'
  color:     '#1a1a2e',
  size:      4,
  isDrawing: false,
  current:   null,        // StrokeElement being built right now
};

/* ── DOM refs ───────────────────────────────────────────────────── */
const elToolBtns     = document.querySelectorAll('.tool-btn');
const elColorPicker  = document.getElementById('color-picker');
const elColorSwatch  = document.getElementById('color-swatch');
const elPresets      = document.querySelectorAll('.preset-color');
const elBrushSize    = document.getElementById('brush-size');
const elBrushLabel   = document.getElementById('brush-size-label');
const elBtnUndo      = document.getElementById('btn-undo');
const elBtnClear     = document.getElementById('btn-clear');
const elModalOverlay = document.getElementById('modal-overlay');
const elModalCancel  = document.getElementById('modal-cancel');
const elModalConfirm = document.getElementById('modal-confirm');

// Status bar
const elStatusTool    = document.getElementById('status-tool');
const elStatusSize    = document.getElementById('status-size');
const elStatusStrokes = document.getElementById('status-strokes');
const elStatusCoords  = document.getElementById('status-coords');

/* ── Cursor ring ────────────────────────────────────────────────── */
const cursorRing = document.createElement('div');
cursorRing.id = 'cursor-ring';
document.body.appendChild(cursorRing);

function updateCursorRing(x, y) {
  const d = state.size;
  cursorRing.style.width  = `${d}px`;
  cursorRing.style.height = `${d}px`;
  cursorRing.style.left   = `${x}px`;
  cursorRing.style.top    = `${y}px`;
  cursorRing.style.borderColor =
    state.tool === 'eraser' ? 'rgba(200,0,0,.5)' : 'rgba(0,0,0,.35)';
}

canvas.addEventListener('mouseleave', () => {
  cursorRing.style.display = 'none';
});
canvas.addEventListener('mouseenter', () => {
  cursorRing.style.display = 'block';
});

/* ── Canvas-coordinate helper ───────────────────────────────────── */
/**
 * Get canvas-local (x, y) from a MouseEvent.
 * Uses getBoundingClientRect so it works even if the canvas has CSS transforms.
 * @param {MouseEvent} e
 * @returns {{ x: number, y: number }}
 */
function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

/* ── Drawing event handlers ─────────────────────────────────────── */
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;   // left button only

  state.isDrawing = true;
  state.current   = createStroke(state.tool, state.color, state.size);

  const pos = getCanvasPos(e);
  addPoint(state.current, pos.x, pos.y);
});

canvas.addEventListener('mousemove', (e) => {
  const pos = getCanvasPos(e);

  // Always update cursor ring
  updateCursorRing(e.clientX, e.clientY);

  // Update status coords
  elStatusCoords.textContent = `x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)}`;

  if (!state.isDrawing || !state.current) return;

  addPoint(state.current, pos.x, pos.y);
  renderLiveSegment(state.current);
});

canvas.addEventListener('mouseup', (e) => {
  if (!state.isDrawing || !state.current) return;

  // Ensure the last point is captured
  const pos = getCanvasPos(e);
  addPoint(state.current, pos.x, pos.y);

  // Handle single-tap (dot)
  if (state.current.points.length <= 2) {
    renderStroke(state.current);
  }

  commitStroke(state.current);
  state.isDrawing = false;
  state.current   = null;

  updateStrokeCount();

  /*
   * PHASE 2 HOOK — when WebSockets are added, send the completed stroke here:
   *
   *   ws.send(JSON.stringify({ type: 'stroke', payload: stroke }));
   *
   * The payload is already a clean, serialisable plain object.
   */
});

// If the mouse leaves the canvas mid-stroke, finish the stroke
canvas.addEventListener('mouseleave', (e) => {
  if (!state.isDrawing || !state.current) return;

  commitStroke(state.current);
  state.isDrawing = false;
  state.current   = null;
  updateStrokeCount();
});

/* ── Tool selection ─────────────────────────────────────────────── */
elToolBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    if (!tool) return;

    state.tool = tool;

    // Update active state on buttons
    elToolBtns.forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });

    // Update body class for CSS cursor rules
    document.body.className = `tool-${tool}`;

    // Update status bar
    elStatusTool.textContent = tool.charAt(0).toUpperCase() + tool.slice(1);
  });
});

/* ── Color picker ───────────────────────────────────────────────── */
elColorPicker.addEventListener('input', (e) => {
  setColor(e.target.value);
});

elPresets.forEach((btn) => {
  btn.addEventListener('click', () => {
    setColor(btn.dataset.color);
    elColorPicker.value = btn.dataset.color;
  });
});

/**
 * Set the active color and update all related UI.
 * @param {string} hex
 */
function setColor(hex) {
  state.color = hex;
  elColorSwatch.style.background = hex;

  // Mark matching preset as selected
  elPresets.forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.color === hex);
  });
}

/* ── Brush size ─────────────────────────────────────────────────── */
elBrushSize.addEventListener('input', () => {
  const val = parseInt(elBrushSize.value, 10);
  state.size = val;
  elBrushLabel.textContent    = `${val}px`;
  elBrushSize.setAttribute('aria-valuenow', val);
  elStatusSize.textContent    = `${val}px`;
});

/* ── Undo ───────────────────────────────────────────────────────── */
elBtnUndo.addEventListener('click', undoLast);

function undoLast() {
  const removed = popStroke();
  if (!removed) return;
  renderAllStrokes();       // repaint canvas from updated strokes[]
  updateStrokeCount();

  /*
   * PHASE 2 HOOK — broadcast undo:
   *   ws.send(JSON.stringify({ type: 'undo', payload: { id: removed.id } }));
   */
}

/* ── Clear canvas ───────────────────────────────────────────────── */
elBtnClear.addEventListener('click', () => {
  showModal();
});

elModalCancel.addEventListener('click', hideModal);
elModalConfirm.addEventListener('click', () => {
  clearStrokes();
  renderAllStrokes();
  updateStrokeCount();
  hideModal();

  /*
   * PHASE 2 HOOK — broadcast clear:
   *   ws.send(JSON.stringify({ type: 'clear' }));
   */
});

elModalOverlay.addEventListener('click', (e) => {
  if (e.target === elModalOverlay) hideModal();
});

function showModal() {
  elModalOverlay.hidden = false;
  elModalConfirm.focus();
}

function hideModal() {
  elModalOverlay.hidden = true;
}

/* ── Status bar helper ──────────────────────────────────────────── */
function updateStrokeCount() {
  const n = strokes.length;
  elStatusStrokes.textContent = `${n} ${n === 1 ? 'stroke' : 'strokes'}`;
}

/* ── Keyboard shortcuts ─────────────────────────────────────────── */
document.addEventListener('keydown', (e) => {
  // Ignore shortcuts when focus is inside an input or button
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

/* ── Window resize ──────────────────────────────────────────────── */
window.addEventListener('resize', resizeCanvas);

/* ── Initialise ─────────────────────────────────────────────────── */
(function init() {
  // Set initial cursor class
  document.body.classList.add('tool-pencil');

  // Size canvas to fill its container
  resizeCanvas();

  // Sync UI to initial state values
  elColorSwatch.style.background = state.color;
  elBrushLabel.textContent       = `${state.size}px`;
  elStatusTool.textContent       = 'Pencil';
  elStatusSize.textContent       = `${state.size}px`;
  updateStrokeCount();

  // Mark the first preset as selected (matches default color)
  if (elPresets[0]) elPresets[0].classList.add('selected');
})();
