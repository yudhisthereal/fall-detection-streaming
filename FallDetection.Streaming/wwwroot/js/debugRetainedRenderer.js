// debugRetainedRenderer.js - Last-Known Overlay Retention Solution
// Strategy: Single canvas with cached state
// - Cache last valid tracking data and safe areas
// - Always redraw from cached data (even if fetch fails or is delayed)
// - Key insight: Missing/delayed fetch results NEVER erase overlays
// This eliminates flicker because the last known overlay state is always visible

const DebugRetainedRenderer = {
    canvas: null,
    ctx: null,
    isInitialized: false,
    isRunning: false,
    refreshInterval: null,

    // Cached state - ALWAYS render from this cache
    // Cache is ONLY updated when fetch succeeds, never cleared on error
    lastTrackingData: null,
    lastSafeAreas: null,
    lastBackgroundImage: null,

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

        this.canvas = document.getElementById('debugRetainedCanvas');
        if (!this.canvas) {
            console.warn('[DebugRetainedRenderer] debugRetainedCanvas element not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.isInitialized = true;

        console.log('[DebugRetainedRenderer] Initialized with canvas size:', this.canvas.width, 'x', this.canvas.height);
    },

    isValidCoordinate(value) {
        return value !== null && value !== undefined && value >= 0;
    },

    // ALWAYS render from cached state - even if cache is null/empty
    // This ensures overlays persist during fetch latency
    renderFromCache() {
        if (!this.ctx || !this.canvas) return;

        console.log('[DebugRetainedRenderer] Rendering from cache - Tracking tracks:', Object.keys(this.lastTrackingData || {}).length, '| Safe areas:', (this.lastSafeAreas || []).length);

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw background (video frame)
        const imgElement = DOMElements.streamVideo;
        if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
            this.ctx.drawImage(imgElement, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Respect the showSafeAreas flag
        const showSafeAreas = DOMElements.showSafeArea ? DOMElements.showSafeArea.checked : false;

        // Render safe areas from CACHE (even if fetch fails)
        if (showSafeAreas && this.lastSafeAreas && this.lastSafeAreas.length > 0) {
            this.renderSafeAreas(this.lastSafeAreas);
        }

        // Render skeletons from CACHE (even if fetch fails)
        if (this.lastTrackingData) {
            this.renderSkeletons(this.lastTrackingData);
        }

        // Draw info text
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px monospace';
        this.ctx.fillText('Retained Mode: Always renders from cached state', 10, 20);
        this.ctx.fillText('No flicker: overlays persist even during fetch failures', 10, 35);

        // Draw timestamp
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        this.ctx.fillStyle = '#888';
        this.ctx.font = '12px monospace';
        this.ctx.fillText(`Last update: ${timestamp}`, this.canvas.width - 150, this.canvas.height - 10);
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
        if (!this.ctx || !data.keypoints || data.keypoints.length < 34) return;

        const keypoints = data.keypoints;
        const colorIndex = trackId % this.TRACK_COLORS.length;
        const color = this.TRACK_COLORS[colorIndex];

        // Keypoints are in 320x224 coordinate space, scale to canvas size
        const scaleX = this.canvas.width / 320;
        const scaleY = this.canvas.height / 224;

        // Draw skeleton connections
        this.ctx.strokeStyle = color.stroke;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';

        for (const [startIdx, endIdx] of this.SKELETON_CONNECTIONS) {
            const startX = keypoints[startIdx * 2] * scaleX;
            const startY = keypoints[startIdx * 2 + 1] * scaleY;
            const endX = keypoints[endIdx * 2] * scaleX;
            const endY = keypoints[endIdx * 2 + 1] * scaleY;

            if (this.isValidCoordinate(startX) && this.isValidCoordinate(startY) &&
                this.isValidCoordinate(endX) && this.isValidCoordinate(endY)) {
                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
            }
        }

        // Draw keypoints
        for (let i = 0; i < 17; i++) {
            const x = keypoints[i * 2] * scaleX;
            const y = keypoints[i * 2 + 1] * scaleY;

            if (this.isValidCoordinate(x) && this.isValidCoordinate(y)) {
                this.ctx.fillStyle = color.fill;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 5, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        }

        // Draw pose label
        if (data.pose_label) {
            const noseX = keypoints[0] * scaleX;
            const noseY = keypoints[1] * scaleY;

            if (this.isValidCoordinate(noseX) && this.isValidCoordinate(noseY)) {
                const labelX = noseX;
                const labelY = Math.max(30, noseY - 20);

                this.ctx.font = 'bold 14px sans-serif';
                const textWidth = this.ctx.measureText(data.pose_label).width;
                const padding = 8;
                const boxWidth = textWidth + padding * 2;
                const boxHeight = 20 + padding * 2;

                let boxX = labelX - boxWidth / 2;
                let boxY = labelY - boxHeight - 5;

                boxX = Math.max(0, Math.min(boxX, this.canvas.width - boxWidth));
                boxY = Math.max(0, Math.min(boxY, this.canvas.height - boxHeight));

                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

                this.ctx.strokeStyle = color.stroke;
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.fillText("DEBUG LABEL", boxX + padding, boxY + padding);
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
                const x = point[0] * this.canvas.width;
                const y = point[1] * this.canvas.height;
                return { x, y };
            });

            // Draw polygon
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.closePath();

            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Draw vertices
            points.forEach(point => {
                this.ctx.beginPath();
                this.ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                this.ctx.fillStyle = color;
                this.ctx.fill();
            });

            // Add label
            this.ctx.font = '12px sans-serif';
            this.ctx.fillStyle = color;
            this.ctx.fillText(`Safe Area ${index + 1}`, points[0].x + 10, points[0].y + 20);
        });
    },

    // Fetch tracking data and UPDATE CACHE (even if fetch fails, old cache persists)
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

                // Update cache ONLY when fetch succeeds
                // Old cache persists if fetch fails
                const oldCount = Object.keys(this.lastTrackingData || {}).length;
                const newCount = Object.keys(trackingData).length;
                this.lastTrackingData = trackingData;
                console.log(`[DebugRetainedRenderer] Updated tracking cache: ${oldCount} -> ${newCount} tracks`);
            }
            // If fetch fails, we do NOT clear the cache - old data persists
        } catch (error) {
            console.error('[DebugRetainedRenderer] Error fetching tracking data (using cached data):', error);
            // On error, DO NOT clear cache - last known data persists visually
        }
    },

    // Fetch safe areas and UPDATE CACHE (even if fetch fails, old cache persists)
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

                // Update cache ONLY when fetch succeeds
                // Old cache persists if fetch fails
                const oldCount = (this.lastSafeAreas || []).length;
                const newCount = safeAreas.length;
                this.lastSafeAreas = safeAreas;
                console.log(`[DebugRetainedRenderer] Updated safe areas cache: ${oldCount} -> ${newCount} areas`);
            }
            // If fetch fails, we do NOT clear the cache - old data persists
        } catch (error) {
            console.error('[DebugRetainedRenderer] Error fetching safe areas (using cached data):', error);
            // On error, DO NOT clear cache - last known data persists visually
        }
    },

    async refresh() {
        if (!this.isInitialized) {
            this.init();
        }

        if (!AppState.currentCameraId || !AppState.isConnected) {
            this.renderFromCache();
            return;
        }

        try {
            // Fetch data (updates cache on success, preserves cache on failure)
            await Promise.all([
                this.fetchTrackingData(),
                this.fetchSafeAreas()
            ]);

            // ALWAYS render from cache (even if fetch failed)
            this.renderFromCache();
        } catch (error) {
            console.error('[DebugRetainedRenderer] Error during refresh:', error);
            // On error, still render from cache
            this.renderFromCache();
        }
    },

    start() {
        if (this.isRunning) return;

        this.init();

        // Initial render
        this.refresh();

        // Refresh every 25ms (40 FPS)
        // We always fetch and always render from cache
        // Fetch failures don't erase overlays because we render from cache
        this.refreshInterval = setInterval(() => {
            this.refresh();
        }, 25);

        this.isRunning = true;
        console.log('[DebugRetainedRenderer] Started - 40 FPS with retained state');
    },

    stop() {
        if (!this.isRunning) return;

        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        // Clear canvas
        if (this.ctx) {
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // Reset cached data
        this.lastTrackingData = null;
        this.lastSafeAreas = null;

        this.isRunning = false;
        console.log('[DebugRetainedRenderer] Stopped');
    },

    destroy() {
        this.stop();
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        console.log('[DebugRetainedRenderer] Destroyed');
    }
};

// Export
window.DebugRetainedRenderer = DebugRetainedRenderer;
