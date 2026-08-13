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

// Overlay canvas — remote users' live in-progress strokes are drawn here.
// It sits on top of #whiteboard but pointer-events: none (see CSS).
const overlay    = /** @type {HTMLCanvasElement} */ (document.getElementById('overlay'));
const overlayCtx = overlay.getContext('2d');

/**
 * Map of remote in-progress strokes: strokeId → StrokeElement.
 * Populated by stroke_progress messages, cleared when the full stroke arrives.
 */
const remoteProgress = new Map();

/**
 * Resize both canvases and re-render.
 * Must be called on load and every time the window resizes.
 */
function resizeCanvas() {
  const container = canvas.parentElement;
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width  = w;  canvas.height  = h;
  overlay.width = w;  overlay.height = h;
  renderAllStrokes();
  renderAllRemoteProgress();
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
 * Render a single StrokeElement onto the MAIN canvas.
 * @param {StrokeElement} stroke
 */
function renderStroke(stroke) {
  renderStrokeOnCtx(ctx, stroke);
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

/**
 * Render all remote in-progress strokes onto the overlay canvas from scratch.
 * Called after resize and when a remote stroke is removed from the map.
 */
function renderAllRemoteProgress() {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  remoteProgress.forEach(stroke => renderStrokeOnCtx(overlayCtx, stroke));
}

/**
 * Render a single StrokeElement onto any given context.
 * Shared by main canvas (committed) and overlay (live remote) rendering.
 * @param {CanvasRenderingContext2D} targetCtx
 * @param {StrokeElement} stroke
 */
function renderStrokeOnCtx(targetCtx, stroke) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  targetCtx.save();
  applyStrokeStyle(targetCtx, stroke);
  targetCtx.beginPath();

  if (pts.length === 1) {
    targetCtx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
    targetCtx.fill();
  } else {
    targetCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      targetCtx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    targetCtx.lineTo(last.x, last.y);
    targetCtx.stroke();
  }

  targetCtx.restore();
}

/* ═══════════════════════════════════════════════════════════════════
   [C] UI LAYER
   ═══════════════════════════════════════════════════════════════════ */

/* ─── DOM refs for new WS elements ─────────────────────────────── */
// (declared here so they are available to both [C] and [D] sections)
const elRoomIdDisplay = document.getElementById('room-id-display');
const elWsDot         = document.getElementById('ws-dot');
const elUserCount     = document.getElementById('user-count');
const elStatusWs      = document.getElementById('status-ws');
const elBtnCopyLink   = document.getElementById('btn-copy-link');

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

/* ── Throttle helper for stroke_progress ────────────────────────── */
let _lastProgressSend = 0;
const PROGRESS_INTERVAL_MS = 50;   // send at most 20 fps to server

canvas.addEventListener('mousemove', (e) => {
  const pos = getCanvasPos(e);

  // Always update cursor ring
  updateCursorRing(e.clientX, e.clientY);

  // Update status coords
  elStatusCoords.textContent = `x: ${Math.round(pos.x)}, y: ${Math.round(pos.y)}`;

  if (!state.isDrawing || !state.current) return;

  addPoint(state.current, pos.x, pos.y);
  renderLiveSegment(state.current);

  // Stream the latest point to all peers (throttled)
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

  // Ensure the last point is captured
  const pos = getCanvasPos(e);
  addPoint(state.current, pos.x, pos.y);

  // Handle single-tap (dot)
  if (state.current.points.length <= 2) {
    renderStroke(state.current);
  }

  // Capture reference before clearing state
  const finishedStroke = state.current;
  commitStroke(finishedStroke);
  state.isDrawing = false;
  state.current   = null;

  updateStrokeCount();

  // Send the completed stroke to all peers
  wsSend('stroke', { stroke: finishedStroke });
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
  renderAllStrokes();
  updateStrokeCount();
  wsSend('undo', { id: removed.id });
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
  wsSend('clear', {});
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


/* ═══════════════════════════════════════════════════════════════════
   [D] WEBSOCKET CLIENT
   ═══════════════════════════════════════════════════════════════════

   Responsibilities:
   • Read/generate the room ID from the URL query string
   • Connect to  ws://localhost:8000/ws/<room_id>
   • Handle inbound messages: init | stroke | undo | clear | user_count
   • Expose wsSend() for the UI layer to call
   • Auto-reconnect with exponential back-off
   ═══════════════════════════════════════════════════════════════════ */

const WS_URL = 'ws://localhost:8000';

/* ── Room ID ─────────────────────────────────────────────────────── */

/**
 * Read ?room=<id> from the URL, or generate a new short id and write
 * it back into the address bar so the URL is shareable immediately.
 */
function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  let id = params.get('room');
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);   // e.g. 'k3z9ab'
    params.set('room', id);
    // Replace current history entry so Back button still works
    window.history.replaceState({}, '', `?${params.toString()}`);
  }
  return id;
}

const ROOM_ID = getRoomId();
elRoomIdDisplay.textContent = ROOM_ID;

/* ── WS state ────────────────────────────────────────────────────── */
let _ws           = null;   // active WebSocket instance
let _reconnectMs  = 1000;   // current back-off delay
const MAX_BACKOFF = 16000;  // cap at 16 s

/** Update all connection-status UI in one place. */
function setWsStatus(status) {
  // status: 'connecting' | 'connected' | 'disconnected'
  const labels = { connecting: 'Connecting…', connected: 'Live', disconnected: 'Offline' };

  elWsDot.className    = `room-dot ${status}`;
  elStatusWs.className = status;
  elStatusWs.textContent = labels[status] ?? status;
}

/** Send a typed message if the socket is open. Silently drops if not. */
function wsSend(type, payload) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ type, payload }));
  }
}

/** Open a WebSocket connection to the room and set up all handlers. */
function wsConnect() {
  setWsStatus('connecting');

  const url = `${WS_URL}/ws/${ROOM_ID}`;
  _ws = new WebSocket(url);

  // ── Open ─────────────────────────────────────────────────────────
  _ws.addEventListener('open', () => {
    setWsStatus('connected');
    _reconnectMs = 1000;   // reset back-off on successful connect
    console.info(`[WS] Connected to room "${ROOM_ID}"`);
  });

  // ── Message ───────────────────────────────────────────────────────
  _ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.warn('[WS] Non-JSON message received:', event.data);
      return;
    }

    const { type, payload } = msg;

    switch (type) {

      // Full canvas state on join — replay all strokes from server
      case 'init': {
        clearStrokes();
        (payload.strokes ?? []).forEach(s => commitStroke(s));
        renderAllStrokes();
        updateStrokeCount();
        // Clear any orphaned remote progress (e.g. reconnect mid-session)
        remoteProgress.clear();
        renderAllRemoteProgress();
        break;
      }

      // Live point from a peer who is still drawing — render on overlay
      case 'stroke_progress': {
        const { id, tool, color, size, point } = payload;
        if (!id || !point) break;

        // Get or create the in-progress stroke object for this peer
        if (!remoteProgress.has(id)) {
          remoteProgress.set(id, { id, tool, color, size, points: [] });
        }
        const liveStroke = remoteProgress.get(id);
        const pts = liveStroke.points;
        pts.push(point);

        // Draw only the new segment (fast, incremental) on the overlay
        if (pts.length >= 2) {
          overlayCtx.save();
          applyStrokeStyle(overlayCtx, liveStroke);
          const p1 = pts[pts.length - 2];
          const p2 = pts[pts.length - 1];
          overlayCtx.beginPath();
          overlayCtx.moveTo(p1.x, p1.y);
          overlayCtx.lineTo(p2.x, p2.y);
          overlayCtx.stroke();
          overlayCtx.restore();
        }
        break;
      }

      // Another user finished a stroke — move from overlay to main canvas
      case 'stroke': {
        const stroke = payload.stroke;
        // Remove from overlay (if it was streamed live)
        remoteProgress.delete(stroke.id);
        renderAllRemoteProgress();   // clear that ghost from overlay
        // Commit to main canvas
        commitStroke(stroke);
        renderStroke(stroke);
        updateStrokeCount();
        break;
      }

      // Another user undid — remove by id and repaint
      case 'undo': {
        remoteProgress.delete(payload.id);   // clean overlay too if mid-stroke
        renderAllRemoteProgress();
        const idx = strokes.findIndex(s => s.id === payload.id);
        if (idx !== -1) {
          strokes.splice(idx, 1);
          renderAllStrokes();
          updateStrokeCount();
        }
        break;
      }

      // Another user cleared — wipe everything including overlay
      case 'clear': {
        clearStrokes();
        renderAllStrokes();
        remoteProgress.clear();
        renderAllRemoteProgress();
        updateStrokeCount();
        break;
      }

      // Server reports how many users are in the room
      case 'user_count': {
        elUserCount.textContent = payload.count ?? '?';
        break;
      }

      case 'error': {
        console.error('[WS] Server error:', payload.message);
        break;
      }

      default:
        console.warn('[WS] Unknown message type:', type);
    }
  });


  // ── Close / Error ─────────────────────────────────────────────────
  _ws.addEventListener('close', () => {
    setWsStatus('disconnected');
    console.warn(`[WS] Disconnected. Retrying in ${_reconnectMs / 1000}s…`);
    setTimeout(() => {
      _reconnectMs = Math.min(_reconnectMs * 2, MAX_BACKOFF);
      wsConnect();
    }, _reconnectMs);
  });

  _ws.addEventListener('error', () => {
    // 'error' is always followed by 'close', so we handle reconnect there
    setWsStatus('disconnected');
  });
}

/* ── Copy invite link ────────────────────────────────────────────── */
elBtnCopyLink.addEventListener('click', async () => {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    elBtnCopyLink.title = 'Copied!';
    setTimeout(() => { elBtnCopyLink.title = 'Copy invite link'; }, 2000);
  } catch {
    // Fallback for browsers that block clipboard without HTTPS
    prompt('Copy this link to invite others:', url);
  }
});


/* ── Initialise ─────────────────────────────────────────────────── */
(function init() {
  document.body.classList.add('tool-pencil');
  resizeCanvas();

  elColorSwatch.style.background = state.color;
  elBrushLabel.textContent       = `${state.size}px`;
  elStatusTool.textContent       = 'Pencil';
  elStatusSize.textContent       = `${state.size}px`;
  updateStrokeCount();

  if (elPresets[0]) elPresets[0].classList.add('selected');

  // Start WebSocket connection
  wsConnect();
})();
