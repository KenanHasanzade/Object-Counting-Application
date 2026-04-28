/**
 * main.js — точка входа приложения.
 */

import * as ConfigPanel  from './components/ConfigPanel.js';
import * as VideoFeed    from './components/VideoFeed.js';
import * as DrawingModal from './components/DrawingModal.js';
import * as Dashboard    from './components/Dashboard.js';
import * as api          from './api/client.js';
import { startStream, stopStream } from './utils/realtimeStats.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  ConfigPanel.init();
  VideoFeed.init();
  Dashboard.init();

  /**
   * ИСПРАВЛЕНИЕ:
   * Вместо простой передачи функции DrawingModal.openDrawingModal, 
   * мы создаем анонимную функцию, которая перед открытием модалки 
   * забирает актуальный видео-конфиг из ConfigPanel.
   */
  ConfigPanel.setDrawRegionHandler(async () => {
    const videoConfig = ConfigPanel.getVideoConfig();
    
    // Теперь DrawingModal получит всё: source, video_path и rtsp_url
    await DrawingModal.openDrawingModal(
      videoConfig.source, 
      videoConfig.video_path, 
      videoConfig.rtsp_url
    );
  });

  _bindControlButtons();

  // Загрузить модель по умолчанию при старте
  api.loadModel('yolo11n.pt').then((data) => {
    if (data.success) ConfigPanel.displayClasses(data.classes);
  });

  // Expose modal helpers to inline onclick
  window.undoLastPoint    = DrawingModal.undoLastPoint;
  window.clearDrawing     = DrawingModal.clearDrawing;
  window.saveDrawnRegion  = DrawingModal.saveDrawnRegion;

  window.addEventListener('beforeunload', stopStream);
});

// ─── Control buttons ─────────────────────────────────────────────────────────

function _bindControlButtons() {
  document.getElementById('startBtn').addEventListener('click', _handleStart);
  document.getElementById('stopBtn').addEventListener('click',  _handleStop);
}

async function _handleStart() {
  const videoConfig = ConfigPanel.getVideoConfig();

  // Валидация для обычного видео
  if (videoConfig.source === 'video' && !videoConfig.video_path) {
    alert('Сначала загрузите видеофайл!');
    return;
  }
  
  // Валидация для RTSP (добавил для надежности)
  if (videoConfig.source === 'rtsp' && !videoConfig.rtsp_url) {
    alert('Сначала добавьте и выберите RTSP камеру в списке!');
    return;
  }

  let regionConfig;
  try {
    regionConfig = ConfigPanel.getRegionConfig();
  } catch (e) {
    alert(e.message);
    return;
  }

  // Здесь всё ок: благодаря деструктуризации (...videoConfig) 
  // в запрос улетят и source, и video_path, и rtsp_url
  const config = {
    ...videoConfig,
    ...ConfigPanel.getDetectionConfig(),
    region_config: regionConfig,
  };

  const data = await api.startCounting(config);
  if (data.success) {
    VideoFeed.showStream(api.VIDEO_FEED_URL());
    startStream((stats) => VideoFeed.updateStats(stats));
  } else {
    alert('Ошибка запуска: ' + data.error);
  }
}

async function _handleStop() {
  await api.stopCounting();
  VideoFeed.clearStream();
  stopStream();
}