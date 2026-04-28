/**
 * RealtimeStats — управляет Server-Sent Events и fallback polling.
 * Изолирован от компонентов: подписчики получают данные через callback.
 */

import { getCurrentStats } from '../api/client.js';

let _eventSource  = null;
let _pollInterval = null;
let _onUpdate     = null;   // (data) => void

/**
 * Запускает поток статистики.
 * @param {function} onUpdate  callback с данными статистики
 */
export function startStream(onUpdate) {
  _onUpdate = onUpdate;
  _openSSE();
}

/** Останавливает SSE и polling */
export function stopStream() {
  _closeSSE();
  _stopPolling();
  _onUpdate = null;
}

// ─── Private ─────────────────────────────────────────────────────────────────

function _openSSE() {
  _closeSSE();
  _eventSource = new EventSource('/stats_stream');

  _eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      _onUpdate?.(data);
    } catch (err) {
      console.warn('[SSE] parse error', err);
    }
  };

  _eventSource.onerror = () => {
    console.warn('[SSE] connection lost — switching to polling');
    _closeSSE();
    _startPolling();
  };
}

function _closeSSE() {
  _eventSource?.close();
  _eventSource = null;
}

function _startPolling() {
  _stopPolling();
  _pollInterval = setInterval(async () => {
    try {
      const data = await getCurrentStats();
      _onUpdate?.(data);
    } catch (err) {
      console.error('[Polling] error', err);
    }
  }, 500);
}

function _stopPolling() {
  clearInterval(_pollInterval);
  _pollInterval = null;
}