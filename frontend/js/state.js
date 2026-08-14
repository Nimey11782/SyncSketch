import { generateId } from './utils.js';

/** @type {StrokeElement[]} — the single source of truth for canvas content */
export const strokes = [];

/**
 * Map of remote in-progress strokes: strokeId → StrokeElement.
 * Populated by stroke_progress messages, cleared when the full stroke arrives.
 */
export const remoteProgress = new Map();

/* ── Tool state ─────────────────────────────────────────────────── */
export const state = {
  tool:      'pencil',    // 'pencil' | 'eraser'
  color:     '#1a1a2e',
  size:      4,
  isDrawing: false,
  current:   null,        // StrokeElement being built right now
};

/**
 * Create a new (in-progress) StrokeElement.
 * @param {'pencil'|'eraser'} tool
 * @param {string} color
 * @param {number} size
 * @returns {StrokeElement}
 */
export function createStroke(tool, color, size) {
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
export function addPoint(stroke, x, y) {
  stroke.points.push({ x, y });
}

/** Commit a finished stroke to the shared store. */
export function commitStroke(stroke) {
  strokes.push(stroke);
}

/** Remove the most recent stroke (undo). Returns the removed stroke or null. */
export function popStroke() {
  return strokes.pop() ?? null;
}

/** Remove all strokes. */
export function clearStrokes() {
  strokes.length = 0;
}
