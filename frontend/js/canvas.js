import { strokes, remoteProgress } from './state.js';

export const canvas  = /** @type {HTMLCanvasElement} */ (document.getElementById('whiteboard'));
export const ctx     = canvas.getContext('2d');

// Overlay canvas — remote users' live in-progress strokes are drawn here.
// It sits on top of #whiteboard but pointer-events: none (see CSS).
export const overlay    = /** @type {HTMLCanvasElement} */ (document.getElementById('overlay'));
export const overlayCtx = overlay.getContext('2d');

/**
 * Resize both canvases and re-render.
 * Must be called on load and every time the window resizes.
 */
export function resizeCanvas() {
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
export function renderAllStrokes() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  strokes.forEach(renderStroke);
}

/**
 * Render a single StrokeElement onto the MAIN canvas.
 * @param {StrokeElement} stroke
 */
export function renderStroke(stroke) {
  renderStrokeOnCtx(ctx, stroke);
}

/**
 * Draw a stroke that is still in progress (live preview).
 * We only draw the last segment, not the whole path, for performance.
 * @param {StrokeElement} stroke
 */
export function renderLiveSegment(stroke) {
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
 * @param {CanvasRenderingContext2D} targetCtx
 * @param {StrokeElement} stroke
 */
export function applyStrokeStyle(targetCtx, stroke) {
  if (stroke.tool === 'eraser') {
    targetCtx.globalCompositeOperation = 'destination-out';
    targetCtx.strokeStyle = 'rgba(0,0,0,1)';
    targetCtx.fillStyle   = 'rgba(0,0,0,1)';
  } else {
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.strokeStyle = stroke.color;
    targetCtx.fillStyle   = stroke.color;
  }
  targetCtx.lineWidth   = stroke.size;
  targetCtx.lineCap     = 'round';
  targetCtx.lineJoin    = 'round';
}

/**
 * Render all remote in-progress strokes onto the overlay canvas from scratch.
 * Called after resize and when a remote stroke is removed from the map.
 */
export function renderAllRemoteProgress() {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  remoteProgress.forEach(stroke => renderStrokeOnCtx(overlayCtx, stroke));
}

/**
 * Draw a live segment of a remote stroke (fast, incremental) on the overlay.
 * @param {StrokeElement} liveStroke 
 */
export function renderRemoteLiveSegment(liveStroke) {
  const pts = liveStroke.points;
  if (pts.length < 2) return;
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

/**
 * Render a single StrokeElement onto any given context.
 * Shared by main canvas (committed) and overlay (live remote) rendering.
 * @param {CanvasRenderingContext2D} targetCtx
 * @param {StrokeElement} stroke
 */
export function renderStrokeOnCtx(targetCtx, stroke) {
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
