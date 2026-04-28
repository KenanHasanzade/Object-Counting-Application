/**
 * API Client — единственное место для всех HTTP-запросов к Flask backend.
 * При смене URL или добавлении auth — меняем только здесь.
 */

const BASE = '';  // Flask serve на том же origin

async function post(url, body) {
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function postForm(url, formData) {
  const res = await fetch(BASE + url, { method: 'POST', body: formData });
  return res.json();
}

async function get(url) {
  const res = await fetch(BASE + url);
  return res.json();
}

// ─── Model ──────────────────────────────────────────────────────────────────

export const loadModel = (modelPath) =>
  post('/api/load_model', { model_path: modelPath });

export const uploadModel = (file) => {
  const fd = new FormData();
  fd.append('model_file', file);
  return postForm('/api/upload_model', fd);
};

// ─── Video ──────────────────────────────────────────────────────────────────

export const uploadVideo = (file) => {
  const fd = new FormData();
  fd.append('video_file', file);
  return postForm('/api/upload_video', fd);
};

// ─── Detection / Counting ───────────────────────────────────────────────────

export const startCounting = (config) =>
  post('/api/start_counting', config);

export const stopCounting = () =>
  fetch(BASE + '/api/stop_counting', { method: 'POST' });

// ─── Frame for drawing ──────────────────────────────────────────────────────

export async function getFrameForDrawing(source, video_path, rtsp_url) {
  const response = await fetch('/api/get_frame_for_drawing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      source: source, 
      video_path: video_path,
      rtsp_url: rtsp_url // <-- Добавили передачу ссылки на бэкенд
    })
  });
  return response.json();
}
export const saveCustomRegion = (points, regionType) =>
  post('/api/save_custom_region', { points, region_type: regionType });

// ─── Stats ──────────────────────────────────────────────────────────────────

export const getCurrentStats = () => get('/api/current_stats');

export const getDashboardStats = () => get('/api/get_stats');

export const clearStats = () =>
  post('/api/clear_stats', {});

export const VIDEO_FEED_URL = () => `/video_feed?t=${Date.now()}`;