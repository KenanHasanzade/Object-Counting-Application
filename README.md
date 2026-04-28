# Object Counting & Detection Application (Flask + YOLO)

![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.0+-000000?style=flat&logo=flask&logoColor=white)
![YOLO](https://img.shields.io/badge/Ultralytics-YOLOv8/v11/v12-blue?style=flat)
![OpenCV](https://img.shields.io/badge/OpenCV-4.x-green?style=flat&logo=opencv)

An intelligent web-based system for real-time video stream monitoring. This application allows users to detect objects, track their movement, and count crossings over predefined lines or custom regions (Region of Interest).

## 🚀 Key Features

* **Dual Operation Modes**:
    * `Detection Mode`: Simple object detection with real-time class-wise counting in the frame.
    * `Counting Mode`: Advanced Object Tracking with directional counting (`IN` and `OUT`).
* **Multi-Source Support**:
    * Local video files (MP4, AVI, MOV, etc.).
    * Webcams.
    * **RTSP Streams** (IP Camera support via FFMPEG integration).
* **Flexible Region Configuration**:
    * Standard horizontal and vertical lines.
    * **Custom Polygons**: Draw complex counting zones directly in the browser.
* **Analytics & Statistics**:
    * Real-time data updates via **SSE (Server-Sent Events)**.
    * Automated statistics logging to JSON.
    * Statistics clearing with automated backup functionality.

---

## 🛠 Tech Stack

* **Backend**: Flask (Python)
* **AI Core**: Ultralytics YOLO (Supports v8, v11, and v12 models)
* **Computer Vision**: OpenCV
* **Geometry Logic**: Shapely (For precise polygon/line intersection calculations)
* **Frontend**: JavaScript (SSE for streaming, Canvas API for interactive region drawing)

---

## 📦 Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/KenanHasanzade/Object-Counting-Application.git
cd Object-Counting-Application
```

### 2. Install dependencies
It is highly recommended to use a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Run the application
```bash
python app.py
```
The server will start at: `http://localhost:9090` (or your local IP for network access).

---

## 🖥 API Reference

The system exposes a RESTful API for external control:

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/api/load_model` | Loads a specific YOLO model weight file (`.pt`) |
| `POST` | `/api/start_counting` | Initializes processing with custom parameters (conf, iou, source) |
| `POST` | `/api/save_custom_region` | Saves coordinates for the custom counting zone |
| `GET`  | `/stats_stream` | SSE stream for real-time statistical data |

---

## 📂 Project Structure

```text
├── app.py                # Main Flask server and ObjectCounter logic
├── uploads/              # Directory for uploaded videos and models
├── static/
│   ├── css/              # UI Styles
│   └── js/               # Frontend logic and React/Vanilla JS components
├── templates/
│   └── index.html        # Main dashboard interface
├── counting_statistics.json # Persistent statistics storage
└── requirements.txt      # Python dependencies
```

---

## 🛡 Security & Best Practices

* **File Size**: Large files (models and videos) are excluded via `.gitignore` to stay within GitHub's 100MB limit.
* **Performance**: For edge devices like NVIDIA Jetson, use `frame_skip` and "Nano" (e.g., `yolo11n.pt`) models to maintain high FPS.
* **Auth**: The current version uses a development secret key. Update `app.config['SECRET_KEY']` for production use.

## 📝 License

This project is licensed under the MIT License.

---
**Developer**: [Kanan Hasanzade](https://github.com/KenanHasanzade)  
**Status**: v0.5-base (MVP)

---
