import { strokes, remoteProgress, commitStroke, clearStrokes } from './state.js';
import { renderAllStrokes, renderAllRemoteProgress, renderStroke, renderRemoteLiveSegment } from './canvas.js';
import { updateStrokeCount, setWsStatus, updateUserCount } from './ui.js';

const WS_URL = 'wss://syncsketch-17qk.onrender.com';
let _ws = null;
let _reconnectMs = 1000;
const MAX_BACKOFF = 16000;

export function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  let id = params.get('room');
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);
    params.set('room', id);
    window.history.replaceState({}, '', `?${params.toString()}`);
  }
  return id;
}

export const ROOM_ID = getRoomId();

export function wsSend(type, payload) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ type, payload }));
  }
}

export function wsConnect() {
  setWsStatus('connecting');
  const url = `${WS_URL}/ws/${ROOM_ID}`;
  _ws = new WebSocket(url);

  _ws.addEventListener('open', () => {
    setWsStatus('connected');
    _reconnectMs = 1000;
  });

  _ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    const { type, payload } = msg;

    switch (type) {
      case 'init':
        clearStrokes();
        (payload.strokes ?? []).forEach(s => commitStroke(s));
        renderAllStrokes();
        updateStrokeCount();
        remoteProgress.clear();
        renderAllRemoteProgress();
        break;
      case 'stroke_progress': {
        const { id, tool, color, size, point } = payload;
        if (!id || !point) break;
        if (!remoteProgress.has(id)) {
          remoteProgress.set(id, { id, tool, color, size, points: [] });
        }
        const liveStroke = remoteProgress.get(id);
        liveStroke.points.push(point);
        renderRemoteLiveSegment(liveStroke);
        break;
      }
      case 'stroke': {
        const stroke = payload.stroke;
        remoteProgress.delete(stroke.id);
        renderAllRemoteProgress();
        commitStroke(stroke);
        renderStroke(stroke);
        updateStrokeCount();
        break;
      }
      case 'undo': {
        remoteProgress.delete(payload.id);
        renderAllRemoteProgress();
        const idx = strokes.findIndex(s => s.id === payload.id);
        if (idx !== -1) {
          strokes.splice(idx, 1);
          renderAllStrokes();
          updateStrokeCount();
        }
        break;
      }
      case 'clear':
        clearStrokes();
        renderAllStrokes();
        remoteProgress.clear();
        renderAllRemoteProgress();
        updateStrokeCount();
        break;
      case 'user_count':
        updateUserCount(payload.count ?? '?');
        break;
      case 'error':
        console.error('[WS] Server error:', payload.message);
        break;
    }
  });

  _ws.addEventListener('close', () => {
    setWsStatus('disconnected');
    setTimeout(() => {
      _reconnectMs = Math.min(_reconnectMs * 2, MAX_BACKOFF);
      wsConnect();
    }, _reconnectMs);
  });

  _ws.addEventListener('error', () => {
    setWsStatus('disconnected');
  });
}
