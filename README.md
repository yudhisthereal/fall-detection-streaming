# Privacy-Preserving Patient Monitoring System - Streaming Server

![.NET 8](https://img.shields.io/badge/.NET-8.0-purple)
![Architecture](https://img.shields.io/badge/Architecture-HTTP%20Polling-blue)
![License](https://img.shields.io/badge/License-Research%20Use-orange)

The **Streaming Server** is the central hub of the distributed patient monitoring system. Unlike traditional streaming servers that rely on RTSP/WebRTC, this system implements a **custom HTTP-based Two-Pass Rendering** architecture designed for low-latency, synchronization-critical overlay rendering.

## 🏗️ System Architecture

The system avoids complex streaming protocols (RTMP/WebRTC) in favor of a robust state-synchronization model where the server acts as a high-speed state cache.

```mermaid
graph TD
    subgraph Edge Device [MaixCAM]
        Cam[Camera Feed] -->|Capture| Process[AI Processing]
        Process -->|Pose/Fall| Logic[Safety Logic]
        Logic -->|HTTP POST| UploadFrame[Upload Frame]
        Logic -->|HTTP POST| UploadTracks[Upload Tracks]
        Logic -->|HTTP POST| ReportState[Report State]
    end

    subgraph Server [.NET 8 Core]
        API[API Controller]
        MemCache[In-Memory State Cache]
        API <--> MemCache
    end

    subgraph Client [Browser Dashboard]
        Video[Img Element] <--HTTP GET Polling--> API
        Canvas[Overlay Canvas] <--HTTP GET Polling--> API
        Controls[React/JS UI] -->|Command| API
    end

    UploadFrame -->|JPEG| API
    UploadTracks -->|JSON| API
    ReportState -->|JSON| API
```

### 1. Two-Pass Rendering Architecture (Web Client)

The web client (`streamDisplay.js` and `streamController.js`) implements a specialized rendering pipeline to ensure that skeleton overlays are always crisp and synchronous with the video feed, without "burning" them into the video stream on the server side.

#### Layering Stack
The visual output is composed of two absolute-positioned DOM elements stacked via Z-Index:

1.  **Bottom Layer (`z-index: 10`)**: `<img id="streamImg">`
    *   **Source**: `/api/stream/frame` (or `/api/stream/background` in privacy mode)
    *   **Scaling**: CSS `object-fit: contain` to preserve aspect ratio.
    *   **Update Strategy**: Replaced via JS at ~30-60 FPS.
2.  **Top Layer (`z-index: 20`)**: `<canvas id="overlayCanvas">`
    *   **Source**: `/api/stream/tracks` (JSON data)
    *   **Scaling**: Resolution match (320x224 internal) scaled to display size via CSS.
    *   **Update Strategy**: Redrawn only when new track data arrives (event-driven).

#### Coordinate System & Scaling
*   **Native Resolution**: The MaixCAM processes at **320x224**. All keypoints and bounding boxes stored in the backend are in this coordinate space [0-320, 0-224].
*   **Client Scaling**: The client measures the actual display width of the container and sets the `<canvas>` internal resolution (`width`/`height` attributes) to match the display size (e.g., 1280x896).
*   **Transformation**:
    ```javascript
    scaleX = canvas.width / 320;
    scaleY = canvas.height / 224;
    screenX = keypoint.x * scaleX;
    screenY = keypoint.y * scaleY;
    ```
    This ensures that overlays align perfectly regardless of the browser window size or device pixel ratio.

#### Flicker Prevention
To prevent "flicker" (blank frames between updates), the system uses a **Double Buffering**-like approach for the background image mode:
*   The background image (`streamBackgroundImg`) is static DOM element.
*   When a new background is fetched, it is preloaded in a detached `Image()` object.
*   Only after `onload` fires is the DOM element's `src` swapped.
*   This ensures the user never sees a broken image icon or a blank flash during updates.

### 2. HTTP JPEG Polling vs WebRTC

*   **WebRTC**: While offering lower latency, synchronizing metadata (skeletons) with specific video frames is complex and error-prone without specialized tracks.
*   **HTTP Polling**: By rapidly polling the HTTP endpoint, we achieve "good enough" latency (~100-200ms) with perfect logical separation.
    *   **Video**: Recursive `onload` trigger ensures max possible frame rate.
    *   **Data**: Periodic polling allows the UI to remain responsive even if video lags.

## 🚀 Installation & Dev

### 1. Manual Run (Recommended)
The system is now fully HTTP-based and requires no external streaming servers.

```bash
# Clone
git clone https://github.com/yudhisthereal/fall-detection-streaming.git
cd fall-detection-streaming

# Run setup (Installs .NET 8 SDK and Systemd service)
# This script has been updated to remove legacy SRS/Coturn dependencies.
sudo ./setup.sh

# During development, run with --build-only to apply the changes
sudo ./setup.sh --build-only

# Verify status
sudo systemctl status fall-detection-streaming
```

### 2. Manual Development Mode
If you prefer not to install system services:

```bash
cd FallDetection.Streaming
dotnet run --urls=http://0.0.0.0:8000
```

## 🔒 Security

-   **Volatile Memory**: Frames are held in RAM and strictly overwritten. No video is written to disk unless "Recording" is explicitly triggered (client-side implementation).
-   **Header Validation**: Uploads require `X-Camera-ID`.
-   **Input Sanitization**: All commands are validated against a whitelist in `StreamController.cs`.
