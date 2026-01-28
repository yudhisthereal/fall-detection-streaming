// debugRenderer.js - Debug rendering module for separate canvas
// Renders skeletons and safe areas on a separate canvas NOT overlaid on any element
// This helps isolate whether the issue is rendering-related or data-related

const DebugRenderer = {
    canvas: null,
    ctx: null,
    isInitialized: false,
    isRefreshing: false, // Guard to prevent concurrent refresh calls
    refreshInterval: null,

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

        this.canvas = document.getElementById('debugCanvas');
        if (!this.canvas) {
            console.warn('[DebugRenderer] debugCanvas element not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.isInitialized = true;

        console.log('[DebugRenderer] Initialized with canvas size:', this.canvas.width, 'x', this.canvas.height);
    },

    isValidCoordinate(value) {
        return value !== null && value !== undefined && value >= 0;
    },

    // Draw background directly from streamVideo element to canvas
    drawBackground() {
        if (!this.ctx || !this.canvas) return;

        // Clear canvas first
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const imgElement = DOMElements.streamVideo;
        if (!imgElement || !imgElement.complete || imgElement.naturalWidth === 0) {
            // Fallback to dark background if stream video not available
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Draw info text overlay
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '14px monospace';
            this.ctx.fillText('DEBUG CANVAS - Background + Skeletons + Safe Areas (No video)', 10, 20);
            return false;
        }

        // Draw stream video directly to canvas (stretched to fill)
        this.ctx.drawImage(imgElement, 0, 0, this.canvas.width, this.canvas.height);

        // Draw info text overlay
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '14px monospace';
        this.ctx.fillText('DEBUG CANVAS - Background + Skeletons + Safe Areas', 10, 20);

        return true;
    },

    renderSkeletons(trackingData) {
        if (!trackingData || Object.keys(trackingData).length === 0) {
            this.ctx.fillStyle = '#ff6b6b';
            this.ctx.font = '16px monospace';
            this.ctx.fillText('No skeletons detected', 10, 45);
            return;
        }

        this.ctx.fillStyle = '#00ff00';
        this.ctx.font = '16px monospace';
        this.ctx.fillText(`Skeletons: ${Object.keys(trackingData).length}`, 10, 45);

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
                // this.ctx.fillText(data.pose_label, boxX + padding, boxY + padding);
                this.ctx.fillText("DEBUG LABEL", boxX + padding, boxY + padding);
            }
        }
    },

    renderSafeAreas(safeAreas) {
        // Respect the showSafeAreas flag from the checkbox
        const showSafeAreas = DOMElements.showSafeArea ? DOMElements.showSafeArea.checked : false;

        if (!showSafeAreas) {
            // Safe areas are hidden
            this.ctx.fillStyle = '#888';
            this.ctx.font = '14px monospace';
            this.ctx.fillText('Safe Areas: Hidden (toggle "Show Safe Areas" checkbox)', 10, 70);
            return;
        }

        if (!safeAreas || safeAreas.length === 0) {
            this.ctx.fillStyle = '#ff6b6b';
            this.ctx.font = '16px monospace';
            this.ctx.fillText('Safe Areas: 0 (no safe areas defined)', 10, 70);
            return;
        }

        this.ctx.fillStyle = '#4ecdc4';
        this.ctx.font = '16px monospace';
        this.ctx.fillText(`Safe Areas: ${safeAreas.length}`, 10, 70);

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

    async refresh() {
        // Guard against concurrent refresh calls
        if (this.isRefreshing) {
            console.debug('[DebugRenderer] Skipping refresh - previous refresh still in progress');
            return;
        }

        if (!this.isInitialized) {
            this.init();
        }

        if (!AppState.currentCameraId || !AppState.isConnected) {
            this.clear();
            return;
        }

        this.isRefreshing = true;

        try {
            // Draw background directly from streamVideo element
            this.drawBackground();

            // Fetch data
            const [trackingData, safeAreas] = await Promise.all([
                this.fetchTrackingData(),
                this.fetchSafeAreas()
            ]);

            // Render safe areas first (behind skeletons)
            if (safeAreas) {
                this.renderSafeAreas(safeAreas);
            }

            // Render skeletons on top
            if (trackingData) {
                this.renderSkeletons(trackingData);
            }

            // Draw timestamp
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            this.ctx.fillStyle = '#888';
            this.ctx.font = '12px monospace';
            this.ctx.fillText(`Last update: ${timestamp}`, this.canvas.width - 150, this.canvas.height - 10);
        } catch (error) {
            console.error('[DebugRenderer] Error during refresh:', error);
        } finally {
            this.isRefreshing = false;
        }
    },

    async fetchTrackingData() {
        if (!AppState.currentCameraId) {
            return {};
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/tracking-data?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const data = await response.json();
                const trackingData = data.tracking_data || {};
                const trackCount = Object.keys(trackingData).length;
                console.log(`[DebugRenderer] Fetched ${trackCount} tracks`);
                return trackingData;
            } else {
                console.warn(`[DebugRenderer] Fetch failed with HTTP ${response.status}`);
                return {};
            }
        } catch (error) {
            console.error('[DebugRenderer] Error fetching tracking data:', error);
            return {};
        }
    },

    async fetchSafeAreas() {
        if (!AppState.currentCameraId) {
            return [];
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/safe-areas?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const safeAreas = await response.json();
                console.log(`[DebugRenderer] Fetched ${safeAreas?.length || 0} safe areas`);
                return safeAreas || [];
            } else {
                console.warn(`[DebugRenderer] Safe areas fetch failed with HTTP ${response.status}`);
                return [];
            }
        } catch (error) {
            console.error('[DebugRenderer] Error fetching safe areas:', error);
            return [];
        }
    },

    start() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        this.init();
        this.refresh();

        // Refresh every 25ms (40 FPS) - for smooth skeleton rendering
        this.refreshInterval = setInterval(() => {
            this.refresh();
        }, 25);

        console.log('[DebugRenderer] Started - refreshing every 25ms');
    },

    stop() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        // Draw empty state
        this.drawBackground();
        console.log('[DebugRenderer] Stopped');
    },

    destroy() {
        this.stop();
        this.isRefreshing = false; // Reset guard
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        console.log('[DebugRenderer] Destroyed and cleaned up');
    }
};

// Export
window.DebugRenderer = DebugRenderer;
