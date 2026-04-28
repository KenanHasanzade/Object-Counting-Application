/**
 * ConfigPanel — левая панель настроек.
 * Отвечает: выбор модели, источник видео, sliders, режим операции, регионы.
 */

import * as api   from '../api/client.js';
import * as store from '../state/store.js';
// ⚠️ DrawingModal НЕ импортируется здесь — он подключается через main.js
// чтобы избежать циклической зависимости ConfigPanel ↔ DrawingModal

// ─── Init ────────────────────────────────────────────────────────────────────

export function init() {
  _bindSliders();
  _bindVideoSource();
  _bindModelSource();
  _bindRegionControls();
  _bindOperationMode();
  _bindRtspControls();
}

// ─── Public helpers (used by main.js) ────────────────────────────────────────

export function getRegionConfig() {
  const mode = _getMode();
  if (mode === 'detection') return { type: 'horizontal', position: 50 };

  const regionType = _el('regionType').value;
  if (regionType === 'custom') {
    const pts = store.get('drawingPoints');
    if (pts.length < 2) throw new Error('Сначала нарисуйте регион!');
    return { type: 'custom', points: pts };
  }
  return {
    type: regionType,
    position: parseInt(_el('linePosition').value),
  };
}

export function getDetectionConfig() {
  return {
    conf:             parseFloat(_el('confidence').value),
    iou:              parseFloat(_el('iou').value),
    frame_skip:       parseInt(_el('frameSkip').value),
    selected_classes: store.get('selectedClasses'),
    detection_only:   _getMode() === 'detection',
  };
}

export function getVideoConfig() {
  const source = _el('videoSource').value;
  return {
    source:     source,
    video_path: store.get('uploadedVideoPath'),
    rtsp_url:   source === 'rtsp' ? store.get('activeRtspUrl') : null
  };
}

export function displayClasses(classes) {
  const container = _el('classList');
  container.innerHTML = '';

  const initial = classes.slice(0, 3);
  store.set('selectedClasses', [...initial]);

  classes.forEach((cls) => {
    const div = document.createElement('div');
    div.className = 'form-check';
    div.innerHTML = `
      <input class="form-check-input" type="checkbox"
             value="${cls}" id="cls_${cls}"
             ${initial.includes(cls) ? 'checked' : ''}>
      <label class="form-check-label" for="cls_${cls}">${cls}</label>
    `;
    div.querySelector('input').addEventListener('change', (e) => {
      let selected = store.get('selectedClasses');
      if (e.target.checked) {
        selected = [...selected, cls];
      } else {
        selected = selected.filter((c) => c !== cls);
      }
      store.set('selectedClasses', selected);
    });
    container.appendChild(div);
  });
}

/**
 * Вызывается из main.js после инициализации DrawingModal,
 * чтобы избежать циклического импорта.
 * @param {function} handler
 */
export function setDrawRegionHandler(handler) {
  _el('drawRegionBtn').addEventListener('click', handler);
}

export function syncPointsList(points) {
  _updatePointsList(points);
}

// ─── Bindings ─────────────────────────────────────────────────────────────────

function _bindSliders() {
  const sliders = [
    ['confidence', 'confValue'],
    ['iou',        'iouValue'],
    ['frameSkip',  'skipValue'],
    ['linePosition','posValue'],
  ];
  sliders.forEach(([id, labelId]) => {
    _el(id).addEventListener('input', function () {
      _el(labelId).textContent = this.value;
    });
  });
}

function _bindVideoSource() {
  _el('videoSource').addEventListener('change', function () {
    const isVideo = this.value === 'video';
    const isRtsp = this.value === 'rtsp';

    // Переключаем блок загрузки видео
    _el('videoFile').style.display      = isVideo ? 'block' : 'none';
    _el('uploadVideoBtn').style.display = isVideo ? 'block' : 'none';
    
    // Переключаем блок RTSP
    _el('rtspSection').style.display    = isRtsp ? 'block' : 'none';

    // Очищаем статус, если переключились с видео на что-то другое
    if (!isVideo) _el('videoStatus').innerHTML = '';
  });

  _el('uploadVideoBtn').addEventListener('click', _handleVideoUpload);
}

function _bindRtspControls() {
  _el('rtspPassToggle').addEventListener('click', _handleRtspPassToggle);
  _el('rtspTestBtn').addEventListener('click', _handleRtspTest);
  _el('rtspAddBtn').addEventListener('click', _handleRtspAdd);
}

function _bindModelSource() {
  _el('modelSource').addEventListener('change', function () {
    const isCustom = this.value === 'custom';
    _el('pretrainedSection').style.display = isCustom ? 'none'  : 'block';
    _el('customSection').style.display     = isCustom ? 'block' : 'none';
  });

  _el('loadModelBtn').addEventListener('click', _handleLoadModel);
  _el('uploadModelBtn').addEventListener('click', _handleUploadModel);
}

function _bindRegionControls() {
  _el('regionType').addEventListener('change', function () {
    const isCustom = this.value === 'custom';
    _el('presetRegion').style.display  = isCustom ? 'none'  : 'block';
    _el('customRegion').style.display  = isCustom ? 'block' : 'none';
  });

  _el('clearPointsBtn').addEventListener('click', () => {
    store.set('drawingPoints', []);
    _updatePointsList([]);
  });

  _el('reverseDirectionBtn').addEventListener('click', _handleReverseDirection);
}

function _bindOperationMode() {
  _el('operationMode').addEventListener('change', _applyOperationMode);
  _applyOperationMode(); // init
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function _handleLoadModel() {
  const modelPath = _el('modelPath').value;
  const data = await api.loadModel(modelPath);
  if (data.success) {
    displayClasses(data.classes);
    alert('Модель загружена!');
  } else {
    alert('Ошибка загрузки модели: ' + data.error);
  }
}

async function _handleUploadModel() {
  const file = _el('customModelFile').files[0];
  if (!file) { alert('Выберите .pt файл'); return; }
  const data = await api.uploadModel(file);
  if (data.success) {
    displayClasses(data.classes);
    _el('modelPath').value = data.model_path;
    alert('Кастомная модель загружена!');
  } else {
    alert('Ошибка: ' + data.error);
  }
}

async function _handleVideoUpload() {
  const file = _el('videoFile').files[0];
  if (!file) { alert('Выберите видеофайл'); return; }

  const statusDiv = _el('videoStatus');
  statusDiv.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Загрузка...';

  const data = await api.uploadVideo(file).catch(() => null);
  if (data?.success) {
    store.set('uploadedVideoPath', data.video_path);
    statusDiv.innerHTML = '<div class="alert alert-success py-1 px-2 mt-2">Видео загружено!</div>';
  } else {
    statusDiv.innerHTML = `<div class="alert alert-danger py-1 px-2 mt-2">Ошибка: ${data?.error ?? 'неизвестна'}</div>`;
  }
}

function _handleReverseDirection() {
  const reversed = !store.get('directionReversed');
  store.set('directionReversed', reversed);
  
  const btn = _el('reverseDirectionBtn');
  btn.textContent = reversed ? '\u21a9 Direction: REVERSED' : '\ud83d\udd04 Reverse IN/OUT Direction';
  btn.classList.toggle('btn-danger',   reversed);
  btn.classList.toggle('btn-warning', !reversed);
}

function _handleRtspPassToggle() {
  const passInput = _el('rtspPass');
  if (passInput.type === 'password') {
    passInput.type = 'text';
    this.style.color = '#5fc9f3'; 
  } else {
    passInput.type = 'password';
    this.style.color = '';
  }
}

async function _handleRtspTest() {
  let url = _el('rtspUrl').value.trim();
  const user = _el('rtspUser').value.trim();
  const pass = _el('rtspPass').value.trim();
  const statusDiv = _el('rtspStatus');

  if (!url) {
    statusDiv.innerHTML = '<span style="color: #ff4d4d;">Введите URL потока!</span>';
    return;
  }

  // === МАГИЯ СКЛЕЙКИ URL С ПАРОЛЕМ ===
  if (user && pass) {
    if (url.startsWith('rtsp://')) {
      // Вставляем admin:Admin123@ сразу после rtsp://
      url = url.replace('rtsp://', `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`);
    } else {
      url = `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${url}`;
    }
  }

  statusDiv.innerHTML = '<div class="spinner-border spinner-border-sm" style="color: #5fc9f3;"></div> Проверка потока...';

  try {
    const response = await fetch('/api/test_rtsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url }) // Отправляем уже склеенный URL
    });
    
    const data = await response.json();
    
    if (data.success) {
      statusDiv.innerHTML = '<span style="color: #58fa58;">✓ Поток доступен!</span>';
    } else {
      statusDiv.innerHTML = `<span style="color: #ff4d4d;">Ошибка: ${data.error}</span>`;
    }
  } catch (error) {
    statusDiv.innerHTML = `<span style="color: #ff4d4d;">Ошибка сервера</span>`;
  }
}

function _handleRtspAdd() {
  const name = _el('rtspName').value.trim();
  let url = _el('rtspUrl').value.trim();
  const user = _el('rtspUser').value.trim();
  const pass = _el('rtspPass').value.trim();

  if (!name || !url) {
    alert('Название и URL обязательны для добавления камеры!');
    return;
  }

  // === СОБИРАЕМ URL ДЛЯ СОХРАНЕНИЯ ===
  if (user && pass) {
    if (url.startsWith('rtsp://')) {
      // encodeURIComponent нужен, если в пароле есть спецсимволы (например, @ или #)
      url = url.replace('rtsp://', `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`);
    } else {
      url = `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${url}`;
    }
  }

  const listContainer = _el('rtspCameraList');
  const itemsDiv = _el('rtspCameraItems');
  listContainer.style.display = 'block';

  const camDiv = document.createElement('div');
  camDiv.className = 'd-flex justify-content-between align-items-center mb-1 p-1';
  camDiv.style.background = 'rgba(95, 201, 243, 0.1)'; 
  camDiv.style.border = '1px solid #1e549f';
  camDiv.style.borderRadius = '4px';
  camDiv.style.cursor = 'pointer';

  camDiv.innerHTML = `
    <span class="text-truncate ms-1" style="font-size: 13px; color: #5fc9f3; max-width: 180px;" title="${url}">
      🎥 ${name}
    </span>
    <button class="btn btn-sm py-0 px-2 rtsp-delete-btn" style="color: #ff4d4d; border: none; font-weight: bold;">×</button>
  `;

  camDiv.querySelector('.rtsp-delete-btn').addEventListener('click', (e) => {
    e.stopPropagation(); 
    camDiv.remove();
    if (itemsDiv.children.length === 0) {
      listContainer.style.display = 'none';
    }
  });

  camDiv.addEventListener('click', () => {
    Array.from(itemsDiv.children).forEach(el => el.style.background = 'rgba(95, 201, 243, 0.1)');
    camDiv.style.background = 'rgba(95, 201, 243, 0.3)';
    
    // В store летит УЖЕ ГОТОВАЯ ссылка с паролем
    store.set('activeRtspUrl', url); 
    
    _el('rtspStatus').innerHTML = `<span style="color: #5fc9f3;">Выбрана камера: ${name}</span>`;
  });

  itemsDiv.appendChild(camDiv);

  // Очищаем форму
  _el('rtspName').value = '';
  _el('rtspUrl').value = '';
  _el('rtspUser').value = '';
  _el('rtspPass').value = '';
  _el('rtspStatus').innerHTML = '';
}

// ─── Operation Mode ──────────────────────────────────────────────────────────

function _applyOperationMode() {
  const isDetection = _getMode() === 'detection';
  store.set('isDetectionMode', isDetection);

  _el('countingRegionSection').style.display = isDetection ? 'none' : 'block';
  _el('modeDescription').textContent = isDetection
    ? 'Простое обнаружение объектов без подсчёта'
    : 'Подсчёт объектов, пересекающих линии/регионы';

  _el('startBtnText').textContent = isDetection ? 'Start Detection' : 'Start Counting';

  const badge = _el('modeBadge');
  badge.textContent  = isDetection ? 'DETECTION MODE' : 'COUNTING MODE';
  badge.className    = isDetection
    ? 'mode-badge mode-detection'
    : 'mode-badge mode-counting';

  _el('statsTitle').textContent = isDetection
    ? 'Detection Statistics'
    : 'Class-wise Detections';

  ['inCountCard','outCountCard','netCountCard'].forEach((id) => {
    _el(id).style.display = isDetection ? 'none' : 'block';
  });
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function _updatePointsList(points) {
  const el = _el('pointsList');
  if (!points.length) {
    el.innerHTML = '<small class="text-muted">Точки не выбраны</small>';
    return;
  }
  el.innerHTML = points
    .map((p, i) => `<div><strong>Точка ${i + 1}:</strong> (${p[0]}, ${p[1]})</div>`)
    .join('');
}

function _getMode() {
  return _el('operationMode').value;
}

function _el(id) {
  return document.getElementById(id);
}