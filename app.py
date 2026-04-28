from flask import Flask, render_template, Response, request, jsonify, send_file
import cv2
import torch
import numpy as np
from shapely.geometry import Point, LineString, Polygon
from ultralytics import YOLO
from ultralytics.utils.plotting import colors
from collections import defaultdict
import json
import os
import time
from datetime import datetime
import base64
import queue
import threading

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'

# Global stats queue for SSE
stats_queue = queue.Queue()

class ObjectCounter:
    def __init__(self):
        self.model = None
        self.cap = None
        self.is_running = False
        self.conf = 0.25
        self.iou = 0.45
        self.frame_skip = 3
        self.selected_classes = []
        self.current_video_path = None
        
        # NEW: Detection mode flag
        self.detection_only = False
        
        # Counting attributes
        self.in_count = 0
        self.out_count = 0
        self.counted_ids = []
        self.classwise_count = defaultdict(lambda: {"IN": 0, "OUT": 0})
        self.track_history = defaultdict(list)
        self.region = []
        self.region_type = "line"
        
        # Region drawing
        self.drawing_points = []
        self.is_drawing = False
        self.drawing_frame = None
        self.frame_shape = None
        
        # Stats
        self.stats_file = "counting_statistics.json"
        self.session_stats = {
            "start_time": datetime.now().isoformat(),
            "total_frames": 0,
            "processed_frames": 0,
            "fps_history": []
        }
        
        # Current stats for SSE
        self.current_stats = {
            'in_count': 0,
            'out_count': 0,
            'fps': 0,
            'frame': 0,
            'classwise': {},
            'detection_count': {}  # NEW: for detection mode
        }
    
    def load_model(self, model_path):
        """Load YOLO model"""
        self.model = YOLO(model_path)
        return list(self.model.names.values())
    
    def initialize_region(self, frame_shape, region_config):
        """Initialize counting region"""
        h, w = frame_shape[:2]
        
        if region_config['type'] == 'horizontal':
            pos = int(h * region_config['position'] / 100)
            self.region = [(0, pos), (w, pos)]
        elif region_config['type'] == 'vertical':
            pos = int(w * region_config['position'] / 100)
            self.region = [(pos, 0), (pos, h)]
        elif region_config['type'] == 'custom':
            self.region = region_config.get('points', [])
        else:
            self.region = [(0, h//2), (w, h//2)]
        
        self.region_type = region_config['type']
    
    def count_objects(self, current_pos, track_id, prev_pos, cls):
        """Count objects crossing the region"""
        if prev_pos is None or track_id in self.counted_ids:
            return

        if len(self.region) == 2:
            line = LineString(self.region)
            track_line = LineString([prev_pos, current_pos])
            
            if line.intersects(track_line):
                # Vertical line (check horizontal movement)
                if abs(self.region[0][0] - self.region[1][0]) < abs(self.region[0][1] - self.region[1][1]):
                    if current_pos[0] > prev_pos[0]:
                        self.out_count += 1
                        self.classwise_count[self.model.names[cls]]["OUT"] += 1
                    else:
                        self.in_count += 1
                        self.classwise_count[self.model.names[cls]]["IN"] += 1
                # Horizontal line (check vertical movement)
                else:
                    if current_pos[1] > prev_pos[1]:
                        self.out_count += 1
                        self.classwise_count[self.model.names[cls]]["OUT"] += 1
                    else:
                        self.in_count += 1
                        self.classwise_count[self.model.names[cls]]["IN"] += 1
                self.counted_ids.append(track_id)
        
        elif len(self.region) > 2:
            polygon = Polygon(self.region)
            current_point = Point(current_pos)
            prev_point = Point(prev_pos)
            
            if polygon.contains(current_point) and not polygon.contains(prev_point):
                region_width = max(p[0] for p in self.region) - min(p[0] for p in self.region)
                region_height = max(p[1] for p in self.region) - min(p[1] for p in self.region)
                
                if (region_width < region_height and current_pos[0] > prev_pos[0]) or \
                   (region_width >= region_height and current_pos[1] > prev_pos[1]):
                    self.out_count += 1
                    self.classwise_count[self.model.names[cls]]["OUT"] += 1
                else:
                    self.in_count += 1
                    self.classwise_count[self.model.names[cls]]["IN"] += 1
                self.counted_ids.append(track_id)
    
    def save_statistics(self):
        """Save statistics to file"""
        stats_data = {
            "timestamp": datetime.now().isoformat(),
            "model_info": {
                "model_path": str(self.model.model_name) if self.model else "default",
                "class_names": self.model.names if self.model else {},
            },
            "total_counts": {
                "in": self.in_count,
                "out": self.out_count
            },
            "classwise_count": dict(self.classwise_count),
            "session_stats": {
                "total_frames": self.session_stats["total_frames"],
                "processed_frames": self.session_stats["processed_frames"],
                "avg_fps": np.mean(self.session_stats["fps_history"]) if self.session_stats["fps_history"] else 0,
            }
        }
        
        if os.path.exists(self.stats_file):
            with open(self.stats_file, 'r') as f:
                all_stats = json.load(f)
        else:
            all_stats = []
        
        all_stats.append(stats_data)
        
        if len(all_stats) > 1000:
            all_stats = all_stats[-1000:]
        
        with open(self.stats_file, 'w') as f:
            json.dump(all_stats, f, indent=2)
    
    def update_stats(self, fps, frame_count, detection_count=None):
        """Update current stats and push to queue"""
        self.current_stats = {
            'in_count': self.in_count,
            'out_count': self.out_count,
            'fps': fps,
            'frame': frame_count,
            'classwise': dict(self.classwise_count),
            'detection_count': detection_count or {}
        }
        
        try:
            stats_queue.put_nowait(self.current_stats.copy())
        except queue.Full:
            pass

counter = ObjectCounter()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/load_model', methods=['POST'])
def load_model():
    model_path = request.json.get('model_path', 'yolo11n.pt')
    try:
        classes = counter.load_model(model_path)
        return jsonify({'success': True, 'classes': classes})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/clear_stats', methods=['POST'])
def clear_stats():
    """Clear all statistics data"""
    try:
        counter.in_count = 0
        counter.out_count = 0
        counter.counted_ids = []
        counter.classwise_count = defaultdict(lambda: {"IN": 0, "OUT": 0})
        counter.track_history = defaultdict(list)
        counter.session_stats = {
            "start_time": datetime.now().isoformat(),
            "total_frames": 0,
            "processed_frames": 0,
            "fps_history": []
        }
        
        if os.path.exists(counter.stats_file):
            backup_file = f"counting_statistics_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(counter.stats_file, 'r') as f:
                data = f.read()
            with open(backup_file, 'w') as f:
                f.write(data)
            
            with open(counter.stats_file, 'w') as f:
                json.dump([], f)
        
        return jsonify({'success': True, 'message': 'Statistics cleared successfully. Backup created.'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/upload_model', methods=['POST'])
def upload_model():
    if 'model_file' not in request.files:
        return jsonify({'success': False, 'error': 'No file uploaded'})
    
    file = request.files['model_file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'})
    
    if file and file.filename.endswith('.pt'):
        filepath = os.path.join('uploads', file.filename)
        os.makedirs('uploads', exist_ok=True)
        file.save(filepath)
        
        try:
            classes = counter.load_model(filepath)
            return jsonify({'success': True, 'classes': classes, 'model_path': filepath})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)})
    else:
        return jsonify({'success': False, 'error': 'Invalid file format. Only .pt files allowed'})

@app.route('/api/get_frame_for_drawing', methods=['POST'])
def get_frame_for_drawing():
    """Get a frame from video for region drawing"""
    try:
        data = request.json
        video_source = data.get('source', 'webcam')
        video_path = data.get('video_path', '')
        rtsp_url = data.get('rtsp_url', '') # <-- Добавляем RTSP
        
        if video_source == 'webcam':
            cap_source = 0
        elif video_source == 'video':
            if not video_path or not os.path.exists(video_path):
                return jsonify({'success': False, 'error': 'No video file found'})
            cap_source = video_path
        elif video_source == 'rtsp':
            if not rtsp_url:
                return jsonify({'success': False, 'error': 'No RTSP URL provided'})
            cap_source = rtsp_url
        else:
            cap_source = 0
        
        cap = cv2.VideoCapture(cap_source)
        if not cap.isOpened():
            return jsonify({'success': False, 'error': 'Could not open video source'})
        
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            return jsonify({'success': False, 'error': 'Could not read frame'})
        
        counter.drawing_frame = frame.copy()
        counter.frame_shape = frame.shape
        
        _, buffer = cv2.imencode('.jpg', frame)
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return jsonify({
            'success': True,
            'frame': frame_base64,
            'width': frame.shape[1],
            'height': frame.shape[0]
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/test_rtsp', methods=['POST'])
def test_rtsp():
    """Test RTSP connection without starting counting"""
    try:
        data = request.json
        rtsp_url = data.get('url')
        
        if not rtsp_url:
            return jsonify({'success': False, 'error': 'No URL provided'})
            
        # Используем CAP_FFMPEG для надежной работы с RTSP
        cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
        
        if not cap.isOpened():
            return jsonify({'success': False, 'error': 'Не удалось подключиться к потоку'})
            
        ret, _ = cap.read()
        cap.release()
        
        if ret:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': 'Подключено, но нет видеосигнала'})
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/save_custom_region', methods=['POST'])
def save_custom_region():
    """Save custom drawn region"""
    try:
        data = request.json
        points = data.get('points', [])
        region_type = data.get('region_type', 'line')
        
        if len(points) < 2:
            return jsonify({'success': False, 'error': 'Need at least 2 points'})
        
        counter.region = [tuple(p) for p in points]
        counter.region_type = region_type
        
        return jsonify({'success': True, 'message': f'Region saved with {len(points)} points'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/start_counting', methods=['POST'])
def start_counting():
    data = request.json
    counter.conf = data.get('conf', 0.25)
    counter.iou = data.get('iou', 0.45)
    counter.frame_skip = data.get('frame_skip', 3)
    counter.selected_classes = data.get('selected_classes', [])
    counter.detection_only = data.get('detection_only', False)
    
    video_source = data.get('source', 'webcam')
    video_path = data.get('video_path', '')
    rtsp_url = data.get('rtsp_url', '')  # Читаем RTSP ссылку
    
    # === ВАЖНЫЙ БЛОК ВЫБОРА ИСТОЧНИКА ===
    if video_source == 'webcam':
        cap_source = 0
    elif video_source == 'video':
        if not video_path or not os.path.exists(video_path):
            return jsonify({'success': False, 'error': 'No video uploaded or file not found.'})
        cap_source = video_path
    elif video_source == 'rtsp':
        if not rtsp_url:
            return jsonify({'success': False, 'error': 'No RTSP URL provided.'})
        cap_source = rtsp_url
    else:
        cap_source = 0
    # ====================================
    
    counter.current_video_path = cap_source
    # Если это RTSP, желательно использовать CAP_FFMPEG
    if video_source == 'rtsp':
        counter.cap = cv2.VideoCapture(cap_source, cv2.CAP_FFMPEG)
    else:
        counter.cap = cv2.VideoCapture(cap_source)
    
    if not counter.cap.isOpened():
        return jsonify({'success': False, 'error': f'Could not open video source: {cap_source}.'})
    
    ret, frame = counter.cap.read()
    if not ret:
        counter.cap.release()
        return jsonify({'success': False, 'error': 'Video opened but cannot read frames.'})
    
    if not counter.detection_only:
        counter.initialize_region(frame.shape, data.get('region_config', {'type': 'horizontal', 'position': 50}))
    
    # Сбрасываем кадры только для локального видео (для RTSP это выдаст ошибку)
    if type(cap_source) == int or (type(cap_source) == str and not cap_source.startswith('rtsp')):
        counter.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    
    counter.is_running = True
    counter.in_count = 0
    counter.out_count = 0
    counter.counted_ids = []
    counter.classwise_count = defaultdict(lambda: {"IN": 0, "OUT": 0})
    counter.track_history = defaultdict(list)
    
    return jsonify({'success': True, 'message': f'Video loaded successfully from: {cap_source}'})

@app.route('/api/stop_counting', methods=['POST'])
def stop_counting():
    counter.is_running = False
    if counter.cap:
        counter.cap.release()
    if not counter.detection_only:
        counter.save_statistics()
    return jsonify({'success': True})

@app.route('/api/get_stats', methods=['GET'])
def get_stats():
    if os.path.exists(counter.stats_file):
        with open(counter.stats_file, 'r') as f:
            all_stats = json.load(f)
        return jsonify({'success': True, 'stats': all_stats[-1] if all_stats else {}, 'all_stats': all_stats[-50:]})
    return jsonify({'success': False, 'stats': {}})

@app.route('/api/current_stats', methods=['GET'])
def get_current_stats():
    """Get current stats via polling"""
    return jsonify(counter.current_stats)

@app.route('/stats_stream')
def stats_stream():
    """Server-Sent Events stream for real-time stats"""
    def generate():
        while True:
            try:
                stats = stats_queue.get(timeout=1)
                yield f"data: {json.dumps(stats)}\n\n"
            except queue.Empty:
                yield f": heartbeat\n\n"
    
    return Response(generate(), mimetype='text/event-stream')

def generate_frames():
    frame_count = 0
    process_count = 0
    
    while counter.is_running and counter.cap and counter.cap.isOpened():
        success, frame = counter.cap.read()
        if not success:
            break
        
        counter.session_stats["total_frames"] = frame_count
        
        if frame_count % (counter.frame_skip + 1) != 0:
            frame_count += 1
            continue
        
        start_time = time.time()
        
        class_indices = [i for i, name in counter.model.names.items() if name in counter.selected_classes]
        
        # NEW: Detection-only mode or tracking mode
        if counter.detection_only:
            results = counter.model(
                frame, conf=counter.conf, iou=counter.iou,
                classes=class_indices if class_indices else None
            )
        else:
            results = counter.model.track(
                frame, conf=counter.conf, iou=counter.iou,
                classes=class_indices if class_indices else None, persist=True
            )
        
        fps = 1 / (time.time() - start_time) if (time.time() - start_time) > 0 else 0
        counter.session_stats["fps_history"].append(fps)
        
        annotated = frame.copy()
        detection_count = defaultdict(int)  # NEW: count detections per class
        
        if results[0].boxes.id is not None or counter.detection_only:
            boxes = results[0].boxes.xyxy.cpu().numpy()
            clss = results[0].boxes.cls.cpu().numpy().astype(int)
            
            if counter.detection_only:
                # Detection-only mode: just draw boxes, no tracking
                for box, cls in zip(boxes, clss):
                    x1, y1, x2, y2 = box
                    color = colors(cls, True)
                    cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                    cv2.putText(annotated, f"{counter.model.names[cls]}",
                               (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                    detection_count[counter.model.names[cls]] += 1
            else:
                # Counting mode with tracking
                track_ids = results[0].boxes.id.cpu().numpy().astype(int)
                
                for box, track_id, cls in zip(boxes, track_ids, clss):
                    x1, y1, x2, y2 = box
                    centroid = (int((x1 + x2) / 2), int((y1 + y2) / 2))
                    
                    color = colors(cls, True)
                    cv2.rectangle(annotated, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                    cv2.putText(annotated, f"{counter.model.names[cls]}#{track_id}",
                               (int(x1), int(y1) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                    
                    counter.track_history[track_id].append(centroid)
                    if len(counter.track_history[track_id]) > 30:
                        counter.track_history[track_id].pop(0)
                    
                    prev_pos = counter.track_history[track_id][-2] if len(counter.track_history[track_id]) > 1 else None
                    counter.count_objects(centroid, track_id, prev_pos, cls)
        
        # Draw region only in counting mode
        if not counter.detection_only and len(counter.region) >= 2:
            region_points = [(int(p[0]), int(p[1])) for p in counter.region]
            pts = np.array(region_points, np.int32).reshape((-1, 1, 2))
            is_closed = len(counter.region) > 2
            
            cv2.polylines(annotated, [pts], is_closed, (104, 0, 123), 4)
            
            for i, pt in enumerate(region_points):
                color = (0, 0, 255) if i == 0 else (0, 255, 0)
                cv2.circle(annotated, pt, 8, color, -1)
                cv2.putText(annotated, str(i+1), (pt[0]+15, pt[1]-15), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Display stats
        y_offset = 30
        if counter.detection_only:
            # Show detection counts
            for cls_name, count in detection_count.items():
                text = f"{cls_name}: {count}"
                cv2.putText(annotated, text, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                y_offset += 30
        else:
            # Show counting stats
            for cls_name, counts in counter.classwise_count.items():
                if counts["IN"] != 0 or counts["OUT"] != 0:
                    text = f"{cls_name}: IN {counts['IN']} OUT {counts['OUT']}"
                    cv2.putText(annotated, text, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                    y_offset += 30
        
        # Mode indicator
        mode_text = "DETECTION MODE" if counter.detection_only else "COUNTING MODE"
        mode_color = (0, 255, 0) if counter.detection_only else (255, 255, 0)
        cv2.putText(annotated, mode_text, (annotated.shape[1] - 250, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, mode_color, 2)
        
        cv2.putText(annotated, f"Frame: {frame_count} | FPS: {fps:.1f}",
                   (10, annotated.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        
        # Update stats for SSE/polling
        counter.update_stats(fps, frame_count, dict(detection_count) if counter.detection_only else None)
        
        if not counter.detection_only and process_count % 30 == 0:
            counter.save_statistics()
        
        ret, buffer = cv2.imencode('.jpg', annotated)
        frame = buffer.tobytes()
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
        
        frame_count += 1
        process_count += 1

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/upload_video', methods=['POST'])
def upload_video():
    if 'video_file' not in request.files:
        return jsonify({'success': False, 'error': 'No file uploaded'})
    
    file = request.files['video_file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'})
    
    ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm'}
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'success': False, 'error': f'Invalid format. Supported: {", ".join(ALLOWED_EXTENSIONS)}'})
    
    filepath = os.path.join('uploads', 'uploaded_video.' + ext)
    os.makedirs('uploads', exist_ok=True)
    file.save(filepath)
    
    return jsonify({'success': True, 'video_path': filepath})

if __name__ == '__main__':
    import socket
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    
    print("=" * 50)
    print(f"Server starting...")
    print(f"Local access: http://localhost:5000")
    print(f"Network access: http://{local_ip}:5000")
    print("=" * 50)
    
    app.run(debug=False, host='0.0.0.0', port=9090, threaded=True)