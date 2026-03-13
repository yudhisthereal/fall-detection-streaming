// streamDisplay.js - Two-Pass Rendering Solution (NO FLICKER)
// Strategy: Static background img + Overlay canvas for overlays
// - Background img: Static, only updates when explicitly requested (set_background acknowledgment flow)
// - Overlay canvas: Refreshed ONLY when new overlay data arrives (NOT every frame)
// - Key insight: Background img is NEVER cleared, redrawn, or replaced except when explicitly requested
// This eliminates flicker because the background is immune to redraw, resize, or overlay updates

const StreamDisplay = {
    // Elements
    backgroundImg: null,
    overlayCanvas: null,
    overlayCtx: null,

    // State
    isInitialized: false,
    isRunning: false,
    trackingRefreshInterval: null,
    cameraStateRefreshInterval: null,
    backgroundAutoRefreshInterval: null,

    // Cached overlay data (only updated when new data arrives)
    cachedTrackingData: null,
    cachedSafeAreas: null,
    cachedBedAreas: null,
    cachedFloorAreas: null,
    cachedCouchAreas: null,
    cachedBenchAreas: null,
    cachedChairAreas: null,

    // Camera state for control flags
    cameraState: {},
    showBedAreas: false,
    showFloorAreas: false,
    showCouchAreas: false,
    showBenchAreas: false,
    showChairAreas: false,

    // Background state tracking
    currentBackgroundMode: false,  // true = background mode, false = raw mode
    backgroundUpdatePending: false,  // true when set_background command is in flight
    lastBackgroundTimestamp: 0,  // Track when background was last updated

    // COCO 17 keypoint indices
    KEYPOINT_NAMES: [
        'nose',        // 0
        'left_eye',    // 1
        'right_eye',   // 2
        'left_ear',    // 3
        'right_ear',   // 4
        'left_shoulder', // 5
        'right_shoulder', // 6
        'left_elbow',  // 7
        'right_elbow', // 8
        'left_wrist',  // 9
        'right_wrist', // 10
        'left_hip',    // 11
        'right_hip',   // 12
        'left_knee',   // 13
        'right_knee',  // 14
        'left_ankle',  // 15
        'right_ankle'  // 16
    ],

    // COCO skeleton connections (pair of keypoint indices)
    SKELETON_CONNECTIONS: [
        [0, 1],   // nose -> left_eye
        [0, 2],   // nose -> right_eye
        [1, 3],   // left_eye -> left_ear
        [2, 4],   // right_eye -> right_ear
        [5, 6],   // left_shoulder -> right_shoulder
        [5, 7],   // left_shoulder -> left_elbow
        [7, 9],   // left_elbow -> left_wrist
        [6, 8],   // right_shoulder -> right_elbow
        [8, 10],  // right_elbow -> right_wrist
        [5, 11],  // left_shoulder -> left_hip
        [6, 12],  // right_shoulder -> right_hip
        [11, 12], // left_hip -> right_hip
        [11, 13], // left_hip -> left_knee
        [13, 15], // left_knee -> left_ankle
        [12, 14], // right_hip -> right_knee
        [14, 16]  // right_knee -> right_ankle
    ],

    // Color palette for different tracks
    TRACK_COLORS: [
        { stroke: '#00FF00', fill: '#00FF00' },   // Green
        { stroke: '#FF6B6B', fill: '#FF6B6B' },   // Red
        { stroke: '#4ECDC4', fill: '#4ECDC4' },   // Cyan
        { stroke: '#FFE66D', fill: '#FFE66D' },   // Yellow
        { stroke: '#C44Dff', fill: '#C44Dff' },   // Purple
    ],

    // Color palette based on SafetyStatus
    SAFETY_STATUS_COLORS: {
        'fall': { stroke: '#FF0000', fill: '#FF0000' },      // Red
        'unsafe': { stroke: '#FFA500', fill: '#FFA500' },    // Orange
        'tracking': { stroke: '#00FF00', fill: '#00FF00' }   // Green
    },

    // Get color based on safety status, fallback to track-based color
    getColorForTrack(trackId, safetyStatus) {
        if (safetyStatus === 'fall') {
            return this.SAFETY_STATUS_COLORS['fall'];
        }
        if (safetyStatus === 'unsafe') {
            return this.SAFETY_STATUS_COLORS['unsafe'];
        }
        // Default to green for everything else (safe, tracking, or undefined)
        return this.SAFETY_STATUS_COLORS['tracking'];
    },

    init() {
        if (this.isInitialized) return;

        this.backgroundImg = document.getElementById('streamBackgroundImg');
        this.overlayCanvas = document.getElementById('overlayCanvas');

        if (!this.backgroundImg || !this.overlayCanvas) {
            console.warn('[StreamDisplay] Elements not found');
            return;
        }

        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.isInitialized = true;

        // Set placeholder image until real background is available
        this.setBackgroundPlaceholder();

        // Resize canvases to match display size
        this.resizeCanvases();

        console.log('[StreamDisplay] Static background img + overlay canvas initialized');
    },

    resizeCanvases() {
        // Get the container width
        const container = this.backgroundImg?.parentElement;
        if (!container) return;

        // Maintain 320:224 (10:7) aspect ratio
        // Calculate height based on width to maintain correct aspect ratio
        const width = container.clientWidth || 1280;
        const height = Math.round(width * 7 / 10); // 320:224 = 10:7 ratio

        // Resize overlay canvas only (background img is auto-sized by CSS)
        if (this.overlayCanvas) {
            this.overlayCanvas.width = width;
            this.overlayCanvas.height = height;
        }

        console.debug(`[StreamDisplay] Overlay canvas resized to ${width}x${height}`);
    },

    // Set placeholder image until real background is available
    setBackgroundPlaceholder() {
        if (!this.backgroundImg) return;

        // Use a data URI placeholder (black with text)
        const placeholder = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI2NzUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyMDAiIGhlaWdodD0iNjc1IiBmaWxsPSIjMDAwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZpbGw9IiMzMzMiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIyNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPldhaXRpbmcgZm9yIGJhY2tncm91bmQuLi48L3RleHQ+PC9zdmc+`;

        this.backgroundImg.src = placeholder;
        console.log('[StreamDisplay] Background placeholder set');
    },

    // Fetch background image and update it with retry logic
    async fetchBackgroundImage() {
        if (!AppState.currentCameraId) {
            console.warn('[StreamDisplay] No camera ID, cannot fetch background');
            return;
        }

        if (this.backgroundUpdatePending) {
            console.log('[StreamDisplay] Background update already in progress, skipping');
            return;
        }

        const timestamp = Date.now();
        const streamUrl = `${STREAMING_HTTP_URL}/api/stream/background?camera_id=${AppState.currentCameraId}&t=${timestamp}`;

        console.log('[StreamDisplay] Fetching background image from:', streamUrl);
        console.log('[StreamDisplay] Current backgroundImg.src:', this.backgroundImg?.src?.substring(0, 100) + '...');
        this.backgroundUpdatePending = true;

        // Preload the image to verify it loads before updating
        const tempImg = new Image();

        tempImg.onload = () => {
            console.log('[StreamDisplay] Background image loaded successfully, updating display');
            this.updateBackgroundImage(streamUrl);
        };

        tempImg.onerror = () => {
            console.error('[StreamDisplay] Failed to load background image, will retry...');
            this.backgroundUpdatePending = false;

            if (window.LogPanel) {
                LogPanel.add(
                    `❌ Failed to fetch background image, retrying...`,
                    'warning',
                    'BackgroundImg'
                );
            }

            // Retry after 2 seconds
            if (this.isRunning) {
                setTimeout(() => {
                    if (this.currentBackgroundMode) {
                        console.log('[StreamDisplay] Retrying background fetch...');
                        this.fetchBackgroundImage();
                    }
                }, 2000);
            }
        };

        tempImg.src = streamUrl;
    },

    // Update background image - ONLY called in authorized cases:
    // 1. Initial connection, once the first valid background frame is available
    // 2. Entering background mode
    // 3. When set_background === true completes its full server–camera–server acknowledgment flow
    updateBackgroundImage(imageSrc) {
        if (!this.backgroundImg || !imageSrc) {
            console.warn('[StreamDisplay] Cannot update background - element or source missing');
            return;
        }

        console.log('[StreamDisplay] Updating background image');

        // Only update background after image has fully loaded
        const tempImg = new Image();
        tempImg.onload = () => {
            this.backgroundImg.src = imageSrc;
            this.lastBackgroundTimestamp = Date.now();
            this.backgroundUpdatePending = false;
            console.log('[StreamDisplay] Background image updated successfully');

            // Log to panel
            if (window.LogPanel) {
                LogPanel.add(
                    `✅ Background image updated (timestamp: ${this.lastBackgroundTimestamp})`,
                    'success',
                    'BackgroundImg'
                );
            }
        };

        tempImg.onerror = () => {
            console.error('[StreamDisplay] Failed to load background image, keeping current image');
            this.backgroundUpdatePending = false;

            // Log error to panel
            if (window.LogPanel) {
                LogPanel.add(
                    `❌ Failed to load background image`,
                    'error',
                    'BackgroundImg'
                );
            }
        };

        tempImg.src = imageSrc;
    },

    isValidCoordinate(value) {
        return value !== null && value !== undefined && value >= 0;
    },

    // Clear overlay when disconnected for too long
    clearForDisconnect() {
        if (!this.overlayCtx || !this.overlayCanvas) return;

        // console.log('[StreamDisplay] Clearing overlay due to disconnection');
        this.cachedTrackingData = null;
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    },

    //OVERLAY PASS: Clear and redraw overlays ONLY when new data arrives
    // This is called ONLY when fetchTrackingData or fetchSafeAreas returns new data
    refreshOverlay() {
        if (!this.overlayCtx || !this.overlayCanvas) return;

        console.log('[StreamDisplay] Refreshing overlay - Cached tracking tracks:', Object.keys(this.cachedTrackingData || {}).length,
            '| Bed areas:', (EditableAreasManager.cache.bedAreas || []).length,
            '| Floor areas:', (EditableAreasManager.cache.floorAreas || []).length,
            '| Couch areas:', (EditableAreasManager.cache.couchAreas || []).length,
            '| Bench areas:', (EditableAreasManager.cache.benchAreas || []).length,
            '| Chair areas:', (EditableAreasManager.cache.chairAreas || []).length);

        // Clear overlay canvas BEFORE redrawing overlays
        // This is safe because we only call this when we have new data
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        // Render areas first (behind skeletons) - read directly from EditableAreasManager.cache
        if (this.showBedAreas && EditableAreasManager.cache.bedAreas && EditableAreasManager.cache.bedAreas.length > 0) {
            this.renderBedAreas(EditableAreasManager.cache.bedAreas);
        }
        if (this.showFloorAreas && EditableAreasManager.cache.floorAreas && EditableAreasManager.cache.floorAreas.length > 0) {
            this.renderFloorAreas(EditableAreasManager.cache.floorAreas);
        }
        if (this.showCouchAreas && EditableAreasManager.cache.couchAreas && EditableAreasManager.cache.couchAreas.length > 0) {
            this.renderCouchAreas(EditableAreasManager.cache.couchAreas);
        }
        if (this.showBenchAreas && EditableAreasManager.cache.benchAreas && EditableAreasManager.cache.benchAreas.length > 0) {
            this.renderBenchAreas(EditableAreasManager.cache.benchAreas);
        }
        if (this.showChairAreas && EditableAreasManager.cache.chairAreas && EditableAreasManager.cache.chairAreas.length > 0) {
            this.renderChairAreas(EditableAreasManager.cache.chairAreas);
        }

        // Render skeletons on top
        if (this.cachedTrackingData) {
            this.renderSkeletons(this.cachedTrackingData);
        }
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
        const color = this.getColorForTrack(trackId, data.safety_status);

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
            this.drawPoseLabel(data.pose_label, keypoints, trackId, scaleX, scaleY, data.safety_status);
        } else {
            this.drawPoseLabel("...", keypoints, trackId, scaleX, scaleY, data.safety_status);
        }
    },

    // Draw pose label above the skeleton
    drawPoseLabel(poseLabel, keypoints, trackId, scaleX = 1, scaleY = 1, safetyStatus = null) {
        if (!poseLabel || !this.overlayCtx) return;

        // Find the topmost keypoint (nose)
        const noseX = keypoints[0] * scaleX;
        const noseY = keypoints[1] * scaleY;

        // Skip if nose position is invalid
        if (!this.isValidCoordinate(noseX) || !this.isValidCoordinate(noseY)) {
            return;
        }

        // Calculate label position (above the nose, clamped to canvas bounds)
        const labelX = noseX;
        const labelY = Math.max(30, noseY - 20);

        // Get color based on safety status
        const baseColor = this.getColorForTrack(trackId, safetyStatus);

        // Set font and measure text width
        this.overlayCtx.font = 'bold 14px sans-serif';
        this.overlayCtx.textAlign = 'left';
        this.overlayCtx.textBaseline = 'top';
        const textWidth = this.overlayCtx.measureText(poseLabel).width;
        const textHeight = 20;
        const padding = 8;

        // Clamp x position to prevent overflow
        const canvasWidth = this.overlayCanvas.width;
        const canvasHeight = this.overlayCanvas.height;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = textHeight + padding * 2;

        // Calculate box position (centered above nose)
        let boxX = labelX - boxWidth / 2;
        let boxY = labelY - boxHeight - 5;

        // Clamp to canvas bounds
        boxX = Math.max(0, Math.min(boxX, canvasWidth - boxWidth));
        boxY = Math.max(0, Math.min(boxY, canvasHeight - boxHeight));

        // Draw rounded rectangle background (using path for compatibility)
        this.overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.overlayCtx.beginPath();
        const radius = 4;
        this.overlayCtx.moveTo(boxX + radius, boxY);
        this.overlayCtx.lineTo(boxX + boxWidth - radius, boxY);
        this.overlayCtx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
        this.overlayCtx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
        this.overlayCtx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
        this.overlayCtx.lineTo(boxX + radius, boxY + boxHeight);
        this.overlayCtx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
        this.overlayCtx.lineTo(boxX, boxY + radius);
        this.overlayCtx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
        this.overlayCtx.closePath();
        this.overlayCtx.fill();

        // Draw label border
        this.overlayCtx.strokeStyle = baseColor.stroke;
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        // Draw label text
        this.overlayCtx.fillStyle = '#FFFFFF';
        this.overlayCtx.textAlign = 'left';
        this.overlayCtx.textBaseline = 'top';
        this.overlayCtx.fillText(poseLabel, boxX + padding, boxY + padding);
    },


    renderBedAreas(bedAreas) {
        if (!bedAreas || bedAreas.length === 0) {
            return;
        }

        bedAreas.forEach((polygon, index) => {
            if (!polygon || polygon.length < 3) return;

            // Light blue stroke and fill
            const strokeColor = 'hsl(200, 70%, 50%)';
            const fillColor = 'rgba(173, 216, 230, 0.65)'; // 65% transparent light blue

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

            // Fill with 65% transparent color
            this.overlayCtx.fillStyle = fillColor;
            this.overlayCtx.fill();

            // Draw border
            this.overlayCtx.strokeStyle = strokeColor;
            this.overlayCtx.lineWidth = 2;
            this.overlayCtx.stroke();

            // Draw vertices
            points.forEach(point => {
                this.overlayCtx.beginPath();
                this.overlayCtx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                this.overlayCtx.fillStyle = strokeColor;
                this.overlayCtx.fill();
            });

            // Add label
            this.overlayCtx.font = '12px sans-serif';
            this.overlayCtx.fillStyle = strokeColor;
            this.overlayCtx.fillText(`Bed Area ${index + 1}`, points[0].x + 10, points[0].y + 20);
        });
    },

    renderFloorAreas(floorAreas) {
        if (!floorAreas || floorAreas.length === 0) {
            return;
        }

        floorAreas.forEach((polygon, index) => {
            if (!polygon || polygon.length < 3) return;

            // Grey stroke and fill
            const strokeColor = 'hsl(0, 0%, 50%)';
            const fillColor = 'rgba(128, 128, 128, 0.65)'; // 65% transparent grey

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

            // Fill with 65% transparent color
            this.overlayCtx.fillStyle = fillColor;
            this.overlayCtx.fill();

            // Draw border
            this.overlayCtx.strokeStyle = strokeColor;
            this.overlayCtx.lineWidth = 2;
            this.overlayCtx.stroke();

            // Draw vertices
            points.forEach(point => {
                this.overlayCtx.beginPath();
                this.overlayCtx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                this.overlayCtx.fillStyle = strokeColor;
                this.overlayCtx.fill();
            });

            // Add label
            this.overlayCtx.font = '12px sans-serif';
            this.overlayCtx.fillStyle = strokeColor;
            this.overlayCtx.fillText(`Floor Area ${index + 1}`, points[0].x + 10, points[0].y + 20);
        });
    },

    renderCouchAreas(couchAreas) {
        const strokeColor = 'hsl(30, 70%, 50%)';  // Orange
        const fillColor = 'rgba(255, 165, 0, 0.4)';  // Semi-transparent orange

        couchAreas.forEach((coordinates, index) => {
            const points = coordinates.map(([x, y]) => ({
                x: x * this.overlayCanvas.width,
                y: y * this.overlayCanvas.height
            }));

            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach(p => this.overlayCtx.lineTo(p.x, p.y));
            this.overlayCtx.closePath();

            this.overlayCtx.strokeStyle = strokeColor;
            this.overlayCtx.lineWidth = 3;
            this.overlayCtx.stroke();

            this.overlayCtx.fillStyle = fillColor;
            this.overlayCtx.fill();

            // Add label
            this.overlayCtx.font = '12px sans-serif';
            this.overlayCtx.fillStyle = strokeColor;
            this.overlayCtx.fillText(`Couch Area ${index + 1}`, points[0].x + 10, points[0].y + 20);
        });
    },

    renderBenchAreas(benchAreas) {
        const strokeColor = 'hsl(30, 50%, 40%)';  // Brown
        const fillColor = 'rgba(139, 90, 43, 0.4)';  // Semi-transparent brown

        benchAreas.forEach((coordinates, index) => {
            const points = coordinates.map(([x, y]) => ({
                x: x * this.overlayCanvas.width,
                y: y * this.overlayCanvas.height
            }));

            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach(p => this.overlayCtx.lineTo(p.x, p.y));
            this.overlayCtx.closePath();

            this.overlayCtx.strokeStyle = strokeColor;
            this.overlayCtx.lineWidth = 3;
            this.overlayCtx.stroke();

            this.overlayCtx.fillStyle = fillColor;
            this.overlayCtx.fill();

            // Add label
            this.overlayCtx.font = '12px sans-serif';
            this.overlayCtx.fillStyle = strokeColor;
            this.overlayCtx.fillText(`Bench Area ${index + 1}`, points[0].x + 10, points[0].y + 20);
        });
    },

    renderChairAreas(chairAreas) {
        const strokeColor = 'hsl(270, 50%, 50%)';  // Purple
        const fillColor = 'rgba(147, 112, 219, 0.4)';  // Semi-transparent purple

        chairAreas.forEach((coordinates, index) => {
            const points = coordinates.map(([x, y]) => ({
                x: x * this.overlayCanvas.width,
                y: y * this.overlayCanvas.height
            }));

            this.overlayCtx.beginPath();
            this.overlayCtx.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach(p => this.overlayCtx.lineTo(p.x, p.y));
            this.overlayCtx.closePath();

            this.overlayCtx.strokeStyle = strokeColor;
            this.overlayCtx.lineWidth = 3;
            this.overlayCtx.stroke();

            this.overlayCtx.fillStyle = fillColor;
            this.overlayCtx.fill();

            // Add label
            this.overlayCtx.font = '12px sans-serif';
            this.overlayCtx.fillStyle = strokeColor;
            this.overlayCtx.fillText(`Chair Area ${index + 1}`, points[0].x + 10, points[0].y + 20);
        });
    },

    // Toggle visibility between streamImg (raw) and streamBackgroundImg (background)
    toggleStreamVisibility(showRaw) {
        const streamImg = document.getElementById('streamImg');
        const streamBackgroundImg = document.getElementById('streamBackgroundImg');

        if (!streamImg || !streamBackgroundImg) {
            console.warn('[StreamDisplay] Stream elements not found');
            return;
        }

        if (showRaw) {
            // Show raw stream, hide background
            streamImg.style.display = 'block';
            streamBackgroundImg.style.display = 'none';
            console.log('[StreamDisplay] Showing raw stream (streamImg)');
        } else {
            // Show background, hide raw stream
            streamImg.style.display = 'none';
            streamBackgroundImg.style.display = 'block';
            console.log('[StreamDisplay] Showing background (streamBackgroundImg)');
        }
    },

    // Update camera state and control flags
    updateCameraState(state) {
        if (!state) return;

        // Replace entirely, don't merge - prevents accumulation
        const oldState = { ...this.cameraState };
        this.cameraState = { ...state };

        // Check if show_safe_areas is enabled
        const newShowSafeAreas = this.cameraState.show_safe_areas === true;
        const newShowBedAreas = this.cameraState.show_bed_areas === true;
        const newShowFloorAreas = this.cameraState.show_floor_areas === true;
        const newShowCouchAreas = this.cameraState.show_couch_areas === true;
        const newShowBenchAreas = this.cameraState.show_bench_areas === true;
        const newShowChairAreas = this.cameraState.show_chair_areas === true;

        if (newShowBedAreas !== this.showBedAreas) {
            this.showBedAreas = newShowBedAreas;
            console.log(`[StreamDisplay] show_bed_areas: ${this.showBedAreas}`);
            // Refresh overlay when showBedAreas flag changes
            this.refreshOverlay();
        }

        if (newShowFloorAreas !== this.showFloorAreas) {
            this.showFloorAreas = newShowFloorAreas;
            console.log(`[StreamDisplay] show_floor_areas: ${this.showFloorAreas}`);
            // Refresh overlay when showFloorAreas flag changes
            this.refreshOverlay();
        }

        if (newShowCouchAreas !== this.showCouchAreas) {
            this.showCouchAreas = newShowCouchAreas;
            console.log(`[StreamDisplay] show_couch_areas: ${this.showCouchAreas}`);
            // Refresh overlay when showCouchAreas flag changes
            this.refreshOverlay();
        }

        if (newShowBenchAreas !== this.showBenchAreas) {
            this.showBenchAreas = newShowBenchAreas;
            console.log(`[StreamDisplay] show_bench_areas: ${this.showBenchAreas}`);
            // Refresh overlay when showBenchAreas flag changes
            this.refreshOverlay();
        }

        if (newShowChairAreas !== this.showChairAreas) {
            this.showChairAreas = newShowChairAreas;
            console.log(`[StreamDisplay] show_chair_areas: ${this.showChairAreas}`);
            // Refresh overlay when showChairAreas flag changes
            this.refreshOverlay();
        }

        // Check if show_raw flag changed (background mode transition)
        const oldShowRaw = oldState.show_raw === true;
        const newShowRaw = this.cameraState.show_raw === true;

        if (oldShowRaw !== newShowRaw) {
            console.log(`[StreamDisplay] show_raw changed: ${oldShowRaw} -> ${newShowRaw}`);

            // Toggle stream visibility
            this.toggleStreamVisibility(newShowRaw);

            // Update stream controller refresh interval
            if (window.StreamController && window.StreamController.updateRefreshInterval) {
                window.StreamController.updateRefreshInterval();
            }

            // When entering background mode (show_raw: true -> false), update background image
            if (oldShowRaw === true && newShowRaw === false) {
                this.currentBackgroundMode = true;
                console.log('[StreamDisplay] Entering background mode - fetching background image');
                // Clear any pending flag to ensure we can fetch the new background
                this.backgroundUpdatePending = false;
                this.fetchBackgroundImage();
            }
            // When entering raw mode (show_raw: false -> true)
            else if (oldShowRaw === false && newShowRaw === true) {
                this.currentBackgroundMode = false;
                console.log('[StreamDisplay] Entering raw mode - background remains static');
            }
        }

        // Handle auto-update background interval
        // Only auto-update if:
        // 1. auto_update_bg flag is TRUE
        // 2. We are in Background Mode (show_raw is FALSE) - no need to update invisible background
        const isBackgroundMode = !newShowRaw;
        const isAutoUpdateEnabled = this.cameraState.auto_update_bg === true;
        const shouldAutoUpdate = isBackgroundMode && isAutoUpdateEnabled;

        if (shouldAutoUpdate && !this.backgroundAutoRefreshInterval) {
            console.log('[StreamDisplay] Auto-update background enabled - starting 10s interval');
            this.backgroundAutoRefreshInterval = setInterval(() => {
                console.log('[StreamDisplay] Auto-update background interval fired');
                this.fetchBackgroundImage();
            }, 10000);
        } else if (!shouldAutoUpdate && this.backgroundAutoRefreshInterval) {
            console.log('[StreamDisplay] Auto-update background disabled (or in raw mode) - stopping interval');
            clearInterval(this.backgroundAutoRefreshInterval);
            this.backgroundAutoRefreshInterval = null;
        }
    },

    async fetchTrackingData() {
        if (!AppState.currentCameraId) {
            console.warn('[StreamDisplay:fetchTrackingData] No camera ID set');
            return;
        } else if (!AppState.cameraConnectionStatus[AppState.currentCameraId]?.connected) {
            // console.log('[StreamDisplay:fetchTrackingData] Camera disconnected - skipping fetch & clearing overlay');
            this.clearForDisconnect();
            return;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/tracks?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const data = await response.json();
                const trackingData = data.tracking_data || {};

                // Only refresh overlay if data actually changed
                if (JSON.stringify(trackingData) !== JSON.stringify(this.cachedTrackingData)) {
                    const oldCount = Object.keys(this.cachedTrackingData || {}).length;
                    const newCount = Object.keys(trackingData).length;
                    this.cachedTrackingData = trackingData;
                    console.log(`[StreamDisplay:fetchTrackingData] Tracking data changed: ${oldCount} -> ${newCount} tracks`);
                    this.refreshOverlay(); // ONLY refresh overlay when data changes
                }
            }
        } catch (error) {
            console.error('[StreamDisplay:fetchTrackingData] Error fetching tracking data:', error);
            // On error, DO NOT clear overlay - cached data persists visually
        }
    },

    // Centralized fetch for all area types using EditableAreasManager
    // Sync areas from EditableAreasManager cache to streamDisplay cache
    // This is called periodically and when camera state changes

    // Fetch camera state to get control flags
    async fetchCameraState() {
        if (!AppState.currentCameraId) {
            console.warn('[StreamDisplay:fetchCameraState] No camera ID set');
            return null;
        }
        else if (!AppState.cameraConnectionStatus[AppState.currentCameraId]?.connected) {
            return;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/camera-state?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const state = await response.json();
                this.updateCameraState(state);
                return state;
            }
        } catch (error) {
            console.error('[StreamDisplay] Error fetching camera state:', error);
        }
        return null;
    },

    start() {
        if (this.isRunning) return;

        this.init();

        // Initialize with current data
        this.fetchTrackingData();
        this.fetchCameraState().then((state) => {
            // Set initial visibility based on show_raw flag
            const showRaw = state && state.show_raw === true;
            this.toggleStreamVisibility(showRaw);

            // Initial connection: fetch background if show_raw is false
            if (state && state.show_raw === false) {
                console.log('[StreamDisplay] Initial connection in background mode - fetching background');
                this.fetchBackgroundImage();
            }
        });

        // Tracking data: fetch frequently (10 FPS)
        // Overlay redraw still happens only when data actually changed
        this.trackingRefreshInterval = setInterval(() => {
            this.fetchTrackingData();
        }, 100);

        // Camera state: fetch at a lower rate to reduce control-plane load
        this.cameraStateRefreshInterval = setInterval(() => {
            this.fetchCameraState();
        }, 1000);

        this.isRunning = true;
        console.log('[StreamDisplay] Static background img + overlay canvas rendering started - tracking: 10 FPS, camera-state: 1 FPS (overlay redraw only on data change)');
    },

    stop() {
        if (!this.isRunning) return;

        if (this.trackingRefreshInterval) {
            clearInterval(this.trackingRefreshInterval);
            this.trackingRefreshInterval = null;
        }

        if (this.cameraStateRefreshInterval) {
            clearInterval(this.cameraStateRefreshInterval);
            this.cameraStateRefreshInterval = null;
        }

        // Clear overlay canvas only (NOT the background img)
        if (this.overlayCtx) {
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }

        // Reset cached data
        this.cachedTrackingData = null;
        this.cachedSafeAreas = null;
        this.cachedBedAreas = null;
        this.cachedFloorAreas = null;
        this.cachedCouchAreas = null;
        this.cachedBenchAreas = null;
        this.cachedChairAreas = null;

        this.isRunning = false;
        console.log('[StreamDisplay] Static background img + overlay canvas rendering stopped');
    },

    // Manual refresh trigger (for button click, etc.)
    async manualRefresh() {
        // Fetch all data and refresh overlay
        await Promise.all([
            this.fetchTrackingData(),
            this.fetchCameraState()
        ]);
        // Also fetch fresh areas from server
        await EditableAreasManager.fetchAllAreas();
        // Refresh overlay to show latest data
        this.refreshOverlay();
    },

    // Cleanup
    destroy() {
        this.stop();
        this.backgroundImg = null;
        this.overlayCanvas = null;
        this.overlayCtx = null;
        this.isInitialized = false;
        this.cachedTrackingData = null;
        this.cachedSafeAreas = null;
        this.cachedBedAreas = null;
        this.cachedFloorAreas = null;
        this.cachedCouchAreas = null;
        this.cachedBenchAreas = null;
        this.cachedChairAreas = null;
        this.cameraState = {};
        this.showBedAreas = false;
        this.showFloorAreas = false;
        this.showCouchAreas = false;
        this.showBenchAreas = false;
        this.showChairAreas = false;
        console.log('[StreamDisplay] Destroyed and cleaned up');
    }
};

// Export for use in other modules
window.StreamDisplay = StreamDisplay;
