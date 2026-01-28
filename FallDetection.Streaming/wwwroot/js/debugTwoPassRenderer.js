// debugTwoPassRenderer.js - Two-Pass Rendering Solution
// Strategy: Separate canvases for background and overlays
// - Background canvas: refreshed every frame with video frame
// - Overlay canvas: refreshed ONLY when new overlay data arrives (NOT every frame)
// - Key insight: Overlay canvas is NEVER cleared unless we have new data to draw
// This eliminates flicker because overlays persist visually during fetch latency

const DebugTwoPassRenderer = {
    // Canvas elements
    bgCanvas: null,
    bgCtx: null,
    overlayCanvas: null,
    overlayCtx: null,

    // State
    isInitialized: false,
    isRunning: false,
    backgroundRefreshInterval: null,
    overlayRefreshInterval: null,

    // Cached overlay data (only updated when new data arrives)
    cachedTrackingData: null,
    cachedSafeAreas: null,

    // Same color palette as StreamDisplay
    TRACK_COLORS: [
        { stroke: '#00FF00', fill: '#00FF00' },
        { stroke: '#FF6B6B', fill: '#FF6B6B' },
        { stroke: '#4ECDC4', fill: '#4ECDC4' },
        { stroke: '#FFE66D', fill: '#FFE66D' },
        { stroke: '#C44Dff', fill: '#C44Dff' },
    ],

    // COCO 17 keypoint indices
    KEYPOINT_NAMES: [
        'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
        'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
        'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
        'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
    ],

    // COCO skeleton connections
    SKELETON_CONNECTIONS: [
        [0, 1], [0, 2], [1, 3], [2, 4],
        [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
        [5, 11], [6, 12], [11, 12],
        [11, 13], [13, 15], [12, 14], [14, 16]
    ],

    init() {
        if (this.isInitialized) return;

        this.bgCanvas = document.getElementById('debugBgCanvas');
        this.overlayCanvas = document.getElementById('debugOverlayCanvas');

        if (!this.bgCanvas || !this.overlayCanvas) {
            console.warn('[DebugTwoPassRenderer] Canvas elements not found');
            return;
        }

        this.bgCtx = this.bgCanvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.isInitialized = true;

        console.log('[DebugTwoPassRenderer] Initialized - Background:', this.bgCanvas.width, 'x', this.bgCanvas.height, '| Overlay:', this.overlayCanvas.width, 'x', this.overlayCanvas.height);
    },

    isValidCoordinate(value) {
        return value !== null && value !== undefined && value >= 0;
    },

    // BACKGROUND PASS: Draw video frame every 25ms
    // This is the ONLY thing drawn on the background canvas
    refreshBackground() {
        if (!this.bgCtx || !this.bgCanvas) return;

        const imgElement = DOMElements.streamVideo;
        if (!imgElement || !imgElement.complete || imgElement.naturalWidth === 0) {
            // Fallback to dark background
            this.bgCtx.fillStyle = '#000';
            this.bgCtx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
            return;
        }

        // Draw video frame stretched to fill canvas
        this.bgCtx.drawImage(imgElement, 0, 0, this.bgCanvas.width, this.bgCanvas.height);
    },

    // OVERLAY PASS: Clear and redraw overlays ONLY when new data arrives
    // This is called ONLY when fetchTrackingData or fetchSafeAreas returns new data
    refreshOverlay() {
        if (!this.overlayCtx || !this.overlayCanvas) return;

        console.log('[DebugTwoPassRenderer] Refreshing overlay - Cached tracking tracks:', Object.keys(this.cachedTrackingData || {}).length, '| Cached safe areas:', (this.cachedSafeAreas || []).length);

        // Clear overlay canvas BEFORE redrawing overlays
        // This is safe because we only call this when we have new data
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        // Respect the showSafeAreas flag
        const showSafeAreas = DOMElements.showSafeArea ? DOMElements.showSafeArea.checked : false;

        // Render safe areas first (behind skeletons)
        if (showSafeAreas && this.cachedSafeAreas && this.cachedSafeAreas.length > 0) {
            this.renderSafeAreas(this.cachedSafeAreas);
        }

        // Render skeletons on top
        if (this.cachedTrackingData) {
            this.renderSkeletons(this.cachedTrackingData);
        }

        // Draw info text
        this.overlayCtx.fillStyle = '#fff';
        this.overlayCtx.font = '12px monospace';
        this.overlayCtx.fillText('Two-Pass: Bg refreshed every frame | Overlay only on new data', 10, 20);
        this.overlayCtx.fillText('No flicker: overlay persists during fetch latency', 10, 35);
    },

    renderSkeletons(trackingData) {
        if (!trackingData || Object.keys(trackingData).length === 0) {
            return;
        }

        // Server is the source of truth - render all tracks returned by server
        for (const [trackId, data] of Object.entries(trackingData)) {
            this.renderSkeleton(parseInt(trackId), data);
        }
    },

    renderSkeleton(trackId, data) {
        if (!this.overlayCtx || !data.keypoints || data.keypoints.length < 34) return;

        const keypoints = data.keypoints;
        const colorIndex = trackId % this.TRACK_COLORS.length;
        const color = this.TRACK_COLORS[colorIndex];

        // Keypoints are in 320x224 coordinate space, scale to canvas size
        const scaleX = this.overlayCanvas.width / 320;
        const scaleY = this.overlayCanvas.height / 224;

        // Draw skeleton connections
        this.overlayCtx.strokeStyle = color.stroke;
        this.overlayCtx.lineWidth = 3;
        this.overlayCtx.lineCap = 'round';

        for (const [startIdx, endIdx] of this.SKELETON_CONNECTIONS) {
            const startX = keypoints[startIdx * 2] * scaleX;
            const startY = keypoints[startIdx * 2 + 1] * scaleY;
            const endX = keypoints[endIdx * 2] * scaleX;
            const endY = keypoints[endIdx * 2 + 1] * scaleY;

            if (this.isValidCoordinate(startX) && this.isValidCoordinate(startY) &&
                this.isValidCoordinate(endX) && this.isValidCoordinate(endY)) {
                this.overlayCtx.beginPath();
                this.overlayCtx.moveTo(startX, startY);
                this.overlayCtx.lineTo(endX, endY);
                this.overlayCtx.stroke();
            }
        }

        // Draw keypoints
        for (let i = 0; i < 17; i++) {
            const x = keypoints[i * 2] * scaleX;
            const y = keypoints[i * 2 + 1] * scaleY;

            if (this.isValidCoordinate(x) && this.isValidCoordinate(y)) {
                this.overlayCtx.fillStyle = color.fill;
                this.overlayCtx.beginPath();
                this.overlayCtx.arc(x, y, 5, 0, Math.PI * 2);
                this.overlayCtx.fill();

                this.overlayCtx.strokeStyle = '#FFFFFF';
                this.overlayCtx.lineWidth = 1;
                this.overlayCtx.stroke();
            }
        }

        // Draw pose label
        if (data.pose_label) {
            const noseX = keypoints[0] * scaleX;
            const noseY = keypoints[1] * scaleY;

            if (this.isValidCoordinate(noseX) && this.isValidCoordinate(noseY)) {
                const labelX = noseX;
                const labelY = Math.max(30, noseY - 20);

                this.overlayCtx.font = 'bold 14px sans-serif';
                const textWidth = this.overlayCtx.measureText(data.pose_label).width;
                const padding = 8;
                const boxWidth = textWidth + padding * 2;
                const boxHeight = 20 + padding * 2;

                let boxX = labelX - boxWidth / 2;
                let boxY = labelY - boxHeight - 5;

                boxX = Math.max(0, Math.min(boxX, this.overlayCanvas.width - boxWidth));
                boxY = Math.max(0, Math.min(boxY, this.overlayCanvas.height - boxHeight));

                this.overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                this.overlayCtx.fillRect(boxX, boxY, boxWidth, boxHeight);

                this.overlayCtx.strokeStyle = color.stroke;
                this.overlayCtx.lineWidth = 2;
                this.overlayCtx.strokeRect(boxX, boxY, boxWidth, boxHeight);

                this.overlayCtx.fillStyle = '#FFFFFF';
                this.overlayCtx.fillText(data.pose_label, boxX + padding, boxY + padding);
            }
        }
    },

    renderSafeAreas(safeAreas) {
        if (!safeAreas || safeAreas.length === 0) {
            return;
        }

        safeAreas.forEach((polygon, index) => {
            if (!polygon || polygon.length < 3) return;

            const hue = (index * 60) % 360;
            const color = `hsl(${hue}, 70%, 50%)`;

            // Convert normalized coordinates to canvas coordinates
            const points = polygon.map(point => {
                const x = point[0] * this.overlayCanvas.width;
                const y = point[1] * this.overlayCanvas.height;
                return { x, y };
            });

            // Draw polygon
            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.overlayCtx.lineTo(points[i].x, points[i].y);
            }
            this.overlayCtx.closePath();

            this.overlayCtx.strokeStyle = color;
            this.overlayCtx.lineWidth = 2;
            this.overlayCtx.stroke();

            // Draw vertices
            points.forEach(point => {
                this.overlayCtx.beginPath();
                this.overlayCtx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                this.overlayCtx.fillStyle = color;
                this.overlayCtx.fill();
            });

            // Add label
            this.overlayCtx.font = '12px sans-serif';
            this.overlayCtx.fillStyle = color;
            this.overlayCtx.fillText(`Safe Area ${index + 1}`, points[0].x + 10, points[0].y + 20);
        });
    },

    // Fetch tracking data and refresh overlay ONLY if data changed
    async fetchTrackingData() {
        if (!AppState.currentCameraId) {
            return;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/tracking-data?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const data = await response.json();
                const trackingData = data.tracking_data || {};

                // Only refresh overlay if data actually changed
                if (JSON.stringify(trackingData) !== JSON.stringify(this.cachedTrackingData)) {
                    const oldCount = Object.keys(this.cachedTrackingData || {}).length;
                    const newCount = Object.keys(trackingData).length;
                    this.cachedTrackingData = trackingData;
                    console.log(`[DebugTwoPassRenderer] Tracking data changed: ${oldCount} -> ${newCount} tracks`);
                    this.refreshOverlay(); // ONLY refresh overlay when data changes
                }
            }
        } catch (error) {
            console.error('[DebugTwoPassRenderer] Error fetching tracking data:', error);
            // On error, DO NOT clear overlay - cached data persists visually
        }
    },

    // Fetch safe areas and refresh overlay ONLY if data changed
    async fetchSafeAreas() {
        if (!AppState.currentCameraId) {
            return;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/safe-areas?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const safeAreas = await response.json() || [];

                // Only refresh overlay if data actually changed
                if (JSON.stringify(safeAreas) !== JSON.stringify(this.cachedSafeAreas)) {
                    const oldCount = (this.cachedSafeAreas || []).length;
                    const newCount = safeAreas.length;
                    this.cachedSafeAreas = safeAreas;
                    console.log(`[DebugTwoPassRenderer] Safe areas changed: ${oldCount} -> ${newCount} areas`);
                    this.refreshOverlay(); // ONLY refresh overlay when data changes
                }
            }
        } catch (error) {
            console.error('[DebugTwoPassRenderer] Error fetching safe areas:', error);
            // On error, DO NOT clear overlay - cached data persists visually
        }
    },

    start() {
        if (this.isRunning) return;

        this.init();

        // Initialize with current data
        this.fetchTrackingData();
        this.fetchSafeAreas();

        // Background pass: Refresh every 25ms (40 FPS)
        // This ensures the video frame is always current
        this.backgroundRefreshInterval = setInterval(() => {
            this.refreshBackground();
        }, 25);

        // Overlay pass: Fetch and check for updates every 25ms (40 FPS)
        // BUT only redraw overlay if data actually changed
        this.overlayRefreshInterval = setInterval(() => {
            this.fetchTrackingData();
            this.fetchSafeAreas();
        }, 25);

        this.isRunning = true;
        console.log('[DebugTwoPassRenderer] Started - Background: 40 FPS | Overlay: Only on data change');
    },

    stop() {
        if (!this.isRunning) return;

        if (this.backgroundRefreshInterval) {
            clearInterval(this.backgroundRefreshInterval);
            this.backgroundRefreshInterval = null;
        }
        if (this.overlayRefreshInterval) {
            clearInterval(this.overlayRefreshInterval);
            this.overlayRefreshInterval = null;
        }

        // Clear both canvases
        if (this.bgCtx) {
            this.bgCtx.fillStyle = '#000';
            this.bgCtx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        }
        if (this.overlayCtx) {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }

        // Reset cached data
        this.cachedTrackingData = null;
        this.cachedSafeAreas = null;

        this.isRunning = false;
        console.log('[DebugTwoPassRenderer] Stopped');
    },

    destroy() {
        this.stop();
        this.bgCanvas = null;
        this.bgCtx = null;
        this.overlayCanvas = null;
        this.overlayCtx = null;
        this.isInitialized = false;
        console.log('[DebugTwoPassRenderer] Destroyed');
    }
};

// Export
window.DebugTwoPassRenderer = DebugTwoPassRenderer;
