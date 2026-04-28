/**
 * Store — единственный источник правды для runtime-состояния приложения.
 * Компоненты читают и пишут состояние только через этот модуль.
 * Готов к замене на Redux/Zustand при миграции на React.
 */

const _state = {
  selectedClasses:   [],
  uploadedVideoPath: '',
  drawingPoints:     [],
  isDetectionMode:   true,
  directionReversed: false,
  scaleX:            1,
  scaleY:            1,
  originalWidth:     0,
  originalHeight:    0,
};

/** Подписчики на изменения ключей */
const _listeners = {};

/**
 * Читает значение из store.
 * @param {string} key
 */
export function get(key) {
  return _state[key];
}

/**
 * Записывает значение в store и уведомляет подписчиков.
 * @param {string} key
 * @param {*} value
 */
export function set(key, value) {
  _state[key] = value;
  (_listeners[key] || []).forEach((cb) => cb(value));
}

/**
 * Подписка на изменение ключа.
 * @param {string} key
 * @param {function} callback
 * @returns {function} unsubscribe
 */
export function subscribe(key, callback) {
  if (!_listeners[key]) _listeners[key] = [];
  _listeners[key].push(callback);
  return () => {
    _listeners[key] = _listeners[key].filter((cb) => cb !== callback);
  };
}

/** Snapshot всего состояния (для debug/devtools) */
export function snapshot() {
  return { ..._state };
}