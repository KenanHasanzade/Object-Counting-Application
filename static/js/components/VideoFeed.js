/**
 * VideoFeed — компонент видеопотока и live-статистики.
 * Отвечает: отображение стрима, обновление FPS/IN/OUT/classwise.
 */

import * as store from '../state/store.js';

// ─── Init ────────────────────────────────────────────────────────────────────

export function init() {
  // ничего не нужно при старте
}

// ─── Public ──────────────────────────────────────────────────────────────────

export function showStream(url) {
  _el('videoFeed').src = url;
}

export function clearStream() {
  _el('videoFeed').src = '';
}

/**
 * Обновляет всю live-статистику на основе данных от SSE/polling.
 * @param {{ fps, in_count, out_count, classwise, detection_count }} data
 */
export function updateStats(data) {
  _el('fps').textContent = (data.fps ?? 0).toFixed(1);

  if (store.get('isDetectionMode')) {
    _renderDetectionStats(data.detection_count ?? {});
  } else {
    _renderCountingStats(data);
  }
}

/** Сбрасывает счётчики на ноль (после clear stats) */
export function resetCounters() {
  _el('inCount').textContent  = '0';
  _el('outCount').textContent = '0';
  _el('netCount').textContent = '0';
  _el('classwiseStats').innerHTML = '';
}

// ─── Private ─────────────────────────────────────────────────────────────────

function _renderDetectionStats(detectionCount) {
  const div = _el('classwiseStats');
  div.innerHTML = '';
  Object.entries(detectionCount).forEach(([cls, count]) => {
    div.innerHTML += `
      <span class="badge bg-success me-2 mb-2" style="font-size:16px;">
        ${cls}: ${count}
      </span>`;
  });
}

function _renderCountingStats(data) {
  let inVal  = data.in_count  ?? 0;
  let outVal = data.out_count ?? 0;

  // Уважаем флаг реверса при каждом рендере —
  // иначе SSE-поток перезаписывает ручной swap каждые 500ms
  if (store.get('directionReversed')) {
    [inVal, outVal] = [outVal, inVal];
  }

  _el('inCount').textContent  = inVal;
  _el('outCount').textContent = outVal;
  _el('netCount').textContent = inVal - outVal;

  const div = _el('classwiseStats');
  div.innerHTML = '';
  Object.entries(data.classwise ?? {}).forEach(([cls, counts]) => {
    const displayIn  = store.get('directionReversed') ? counts.OUT : counts.IN;
    const displayOut = store.get('directionReversed') ? counts.IN  : counts.OUT;
    div.innerHTML += `
      <span class="badge bg-primary me-2 mb-2">
        ${cls}: IN ${displayIn} | OUT ${displayOut}
      </span>`;
  });
}

function _el(id) {
  return document.getElementById(id);
}