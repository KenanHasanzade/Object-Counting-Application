/**
 * DrawingModal — компонент рисования регионов подсчёта на canvas.
 * Инкапсулирует весь DOM/canvas код, взаимодействует со store.
 */

import * as api   from '../api/client.js';
import * as store from '../state/store.js';

let _canvas    = null;
let _ctx       = null;
let _frameImage = null;
let _modal     = null;  // Bootstrap Modal instance

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * ИСПРАВЛЕНО: Теперь функция принимает параметры напрямую из main.js
 */
export async function openDrawingModal(source, videoPath, rtspUrl) {
  // Вызываем API, передавая все три параметра (включая RTSP ссылку)
  const data = await api.getFrameForDrawing(source, videoPath, rtspUrl);

  if (!data.success) { 
    alert('Ошибка получения кадра: ' + data.error); 
    return; 
  }

  store.set('originalWidth',  data.width);
  store.set('originalHeight', data.height);

  _canvas = document.getElementById('drawingCanvas');
  _ctx    = _canvas.getContext('2d');

  _frameImage = new Image();
  _frameImage.onload = () => {
    const W = 1020, H = 600;
    _canvas.width  = W;
    _canvas.height = H;
    store.set('scaleX', data.width  / W);
    store.set('scaleY', data.height / H);
    _redraw();
  };
  _frameImage.src = 'data:image/jpeg;base64,' + data.frame;

  _canvas.onclick = _handleCanvasClick;

  _modal = new bootstrap.Modal(document.getElementById('drawingModal'));
  _modal.show();
  _updateUI();
}

export function undoLastPoint() {
  const pts = store.get('drawingPoints');
  if (pts.length > 0) {
    store.set('drawingPoints', pts.slice(0, -1));
    _redraw();
    _updateUI();
  }
}

export function clearDrawing() {
  store.set('drawingPoints', []);
  _redraw();
  _updateUI();
}

export async function saveDrawnRegion() {
  const pts       = store.get('drawingPoints');
  const shapeType = document.getElementById('shapeType').value;

  if (shapeType === 'line' && pts.length !== 2) {
    alert('Для линии нужно ровно 2 точки.');
    return;
  }
  if (shapeType === 'polygon' && pts.length < 3) {
    alert('Для полигона нужно минимум 3 точки.');
    return;
  }

  const data = await api.saveCustomRegion(pts, shapeType);
  if (data.success) {
    alert('Регион сохранён!');
    _modal?.hide();
    _syncSidebarPointsList(pts);
  } else {
    alert('Ошибка: ' + data.error);
  }
}

// ─── Canvas drawing ──────────────────────────────────────────────────────────

function _handleCanvasClick(e) {
  const rect   = _canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;

  const x = Math.round(canvasX * store.get('scaleX'));
  const y = Math.round(canvasY * store.get('scaleY'));

  const shapeType = document.getElementById('shapeType').value;
  const pts       = store.get('drawingPoints');

  if (shapeType === 'line' && pts.length >= 2) {
    alert('Линия допускает только 2 точки. Очистите и начните заново.');
    return;
  }

  store.set('drawingPoints', [...pts, [x, y]]);
  _redraw();
  _updateUI();
}

function _redraw() {
  if (!_ctx || !_frameImage) return;

  const W = _canvas.width, H = _canvas.height;
  const sX = store.get('scaleX'), sY = store.get('scaleY');

  _ctx.clearRect(0, 0, W, H);
  _ctx.drawImage(_frameImage, 0, 0, W, H);

  const pts = store.get('drawingPoints');
  if (!pts.length) return;

  const disp = pts.map(([px, py]) => [px / sX, py / sY]);
  const shapeType = document.getElementById('shapeType')?.value ?? 'line';

  _ctx.strokeStyle = '#5fc9f3'; // Используем твой новый цвет из палитры
  _ctx.lineWidth   = 3;
  _ctx.beginPath();
  _ctx.moveTo(disp[0][0], disp[0][1]);
  disp.slice(1).forEach(([dx, dy]) => _ctx.lineTo(dx, dy));

  if (disp.length > 2 && shapeType === 'polygon') {
    _ctx.lineTo(disp[0][0], disp[0][1]);
    _ctx.fillStyle = 'rgba(95, 201, 243, 0.2)';
    _ctx.fill();
  }
  _ctx.stroke();

  disp.forEach(([dx, dy], i) => {
    _ctx.fillStyle = i === 0 ? '#ff4d4d' : '#5fc9f3';
    _ctx.beginPath();
    _ctx.arc(dx, dy, 8, 0, 2 * Math.PI);
    _ctx.fill();

    _ctx.fillStyle = 'rgba(255,255,255,0.6)';
    _ctx.beginPath();
    _ctx.arc(dx, dy, 4, 0, 2 * Math.PI);
    _ctx.fill();

    _ctx.fillStyle    = '#FFFFFF';
    _ctx.strokeStyle  = '#000000';
    _ctx.lineWidth    = 3;
    _ctx.font         = 'bold 14px Arial';
    _ctx.strokeText(String(i + 1), dx + 12, dy - 12);
    _ctx.fillText  (String(i + 1), dx + 12, dy - 12);
  });
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function _updateUI() {
  const pts       = store.get('drawingPoints');
  const shapeType = document.getElementById('shapeType')?.value ?? 'line';
  const count     = pts.length;

  document.getElementById('pointCount').textContent = count;

  let instructions = '';
  if (shapeType === 'line') {
    instructions = 'Для линии поставьте ровно 2 точки.';
    if (count === 2) instructions += ' <strong style="color:#5fc9f3">Готово к сохранению!</strong>';
  } else {
    instructions = 'Для полигона поставьте 3 и более точек.';
    if (count >= 3) instructions += ' <strong style="color:#5fc9f3">Готово к сохранению!</strong>';
  }
  document.getElementById('modalInstructions').innerHTML = instructions;

  const listEl = document.getElementById('modalPointsList');
  listEl.innerHTML = pts.length
    ? pts.map((p, i) => `<div><strong>Точка ${i+1}:</strong> (${p[0]}, ${p[1]})</div>`).join('')
    : '<small class="text-muted">Точки не добавлены</small>';
}

/** Обновляет список точек в левой панели */
function _syncSidebarPointsList(points) {
  const el = document.getElementById('pointsList');
  if (!el) return;
  el.innerHTML = points.length
    ? points.map((p, i) => `<div><strong>Точка ${i+1}:</strong> (${p[0]}, ${p[1]})</div>`).join('')
    : '<small class="text-muted">Точки не выбраны</small>';
}

// Вспомогательная функция _getVideoConfig удалена, так как данные теперь приходят параметрами