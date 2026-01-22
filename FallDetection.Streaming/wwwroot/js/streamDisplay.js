// streamDisplay.js - Unified canvas overlay for skeletons and safe areas
// Renders both skeletons and safe areas on a single canvas
// Only refreshes after streamVideo refreshes (not continuously polling)

const StreamDisplay = {
    canvas: null,
    ctx: null,
    isInitialized: false,
    showSafeAreas: false,
    
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
    
    // Camera state for control flags
    cameraState: {},
    
    // Track lifetime management - tracks expire after 1 second without updates
    trackTimestamps: {}, // Map of trackId -> last update timestamp
    trackLifetimeMs: 1000, // 1 second lifetime
    
    // Cached data
    cachedTrackingData: {},
    cachedSafeAreas: null,
    
    // Initialize the canvas
    init() {
        if (this.isInitialized) return;
        
        this.canvas = document.getElementById('streamCanvas');
        if (!this.canvas) {
            console.warn('[StreamDisplay] streamCanvas element not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.isInitialized = true;
        
        // Resize canvas to match video dimensions
        this.resizeCanvas();
        
        console.log('[StreamDisplay] Unified canvas initialized');
    },
    
    // Resize canvas to match video dimensions
    resizeCanvas() {
        const streamVideo = document.getElementById('streamVideo');
        if (!streamVideo || !this.canvas) return;
        
        // Use the displayed size of the video element
        const width = streamVideo.clientWidth || 1200;
        const height = streamVideo.clientHeight || 675;
        
        // Set canvas dimensions to match displayed size
        this.canvas.width = width;
        this.canvas.height = height;
        
        console.debug(`[StreamDisplay] Canvas resized to ${width}x${height}`);
    },
    
    // Clear the canvas
    clear() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    
    // Update camera state and control flags
    updateCameraState(state) {
        this.cameraState = state || {};
        // Check if show_safe_areas is enabled
        const newShowSafeAreas = this.cameraState.show_safe_area === true;
        
        if (newShowSafeAreas !== this.showSafeAreas) {
            this.showSafeAreas = newShowSafeAreas;
            console.log(`[StreamDisplay] show_safe_areas: ${this.showSafeAreas}`);
        }
    },
    
    // Filter out expired tracks (tracks that haven't been updated in the last 1 second)
    filterExpiredTracks(trackingData) {
        if (!trackingData || Object.keys(trackingData).length === 0) {
            return {};
        }
        
        const now = Date.now();
        const filteredData = {};
        const activeTrackIds = new Set();
        
        // Process current tracking data and mark active tracks
        for (const [trackId, data] of Object.entries(trackingData)) {
            const trackIdNum = parseInt(trackId);
            const lastUpdate = this.trackTimestamps[trackIdNum];
            
            // If track exists and is still within lifetime, keep it
            if (lastUpdate && (now - lastUpdate) < this.trackLifetimeMs) {
                filteredData[trackId] = data;
                activeTrackIds.add(trackIdNum);
            } else if (!lastUpdate) {
                // New track - add it
                filteredData[trackId] = data;
                activeTrackIds.add(trackIdNum);
            }
            // Otherwise, track is expired - don't include it
        }
        
        // Clean up expired tracks from timestamps
        for (const trackId in this.trackTimestamps) {
            if (!activeTrackIds.has(parseInt(trackId))) {
                delete this.trackTimestamps[trackId];
            }
        }
        
        return filteredData;
    },
    
    // Update track timestamps for currently active tracks
    updateTrackTimestamps(trackingData) {
        if (!trackingData || Object.keys(trackingData).length === 0) {
            return;
        }
        
        const now = Date.now();
        
        // Update timestamps for all tracks in current data
        for (const trackId of Object.keys(trackingData)) {
            const trackIdNum = parseInt(trackId);
            this.trackTimestamps[trackIdNum] = now;
        }
    },
    
    // Get the actual image source dimensions for proper coordinate mapping
    getImageDimensions() {
        const streamVideo = document.getElementById('streamVideo');
        if (!streamVideo) {
            return { width: this.canvas.width, height: this.canvas.height };
        }
        
        // Use naturalWidth/naturalHeight which are available on loaded images
        // Fallback to width/height attributes if natural dimensions are not set
        const width = streamVideo.naturalWidth || streamVideo.width || this.canvas.width;
        const height = streamVideo.naturalHeight || streamVideo.height || this.canvas.height;
        
        return { width, height };
    },
    
    // Render safe areas on the canvas
    renderSafeAreas(safeAreas) {
        if (!this.ctx || !this.canvas || !safeAreas || safeAreas.length === 0) {
            return;
        }
        
        const ctx = this.ctx;
        
        // Get source image dimensions
        const { width: sourceWidth, height: sourceHeight } = this.getImageDimensions();
        
        // Get canvas dimensions (displayed size)
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // Calculate scale factors to map from source dimensions to canvas dimensions
        const scaleX = canvasWidth / sourceWidth;
        const scaleY = canvasHeight / sourceHeight;
        
        safeAreas.forEach((polygon, index) => {
            if (!polygon || polygon.length < 3) return;
            
            // Generate a color for this safe area (hsl with different hue)
            const hue = (index * 60) % 360;
            const color = `hsl(${hue}, 70%, 50%)`;
            
            // Convert normalized coordinates to canvas coordinates
            const points = polygon.map(point => {
                // First convert normalized (0-1) to source coordinates
                const sourceX = point[0] * sourceWidth;
                const sourceY = point[1] * sourceHeight;
                // Then scale to canvas coordinates
                const x = sourceX * scaleX;
                const y = sourceY * scaleY;
                return { x, y };
            });
            
            // Draw filled polygon with transparency
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();
            
            // Draw border
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw vertices
            points.forEach(point => {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            });
            
            // Add label
            ctx.font = '12px sans-serif';
            ctx.fillStyle = color;
            ctx.fillText(`Safe Area ${index + 1}`, points[0].x + 10, points[0].y + 20);
        });
    },
    
    // Render all skeletons from tracking data
    renderSkeletons(trackingData) {
        if (!trackingData || Object.keys(trackingData).length === 0) {
            return;
        }
        
        // Update timestamps for current tracks
        this.updateTrackTimestamps(trackingData);
        
        // Filter out expired tracks
        const activeTrackingData = this.filterExpiredTracks(trackingData);
        
        if (Object.keys(activeTrackingData).length === 0) {
            return;
        }
        
        // Render each tracked person
        for (const [trackId, data] of Object.entries(activeTrackingData)) {
            this.renderSkeleton(parseInt(trackId), data);
        }
    },
    
    // Check if keypoint coordinate is valid (not -1)
    isValidCoordinate(value) {
        return value !== null && value !== undefined && value >= 0;
    },
    
    // Render a single skeleton
    renderSkeleton(trackId, data) {
        if (!this.ctx || !data.keypoints || data.keypoints.length < 34) return;
        
        const keypoints = data.keypoints;
        const colorIndex = trackId % this.TRACK_COLORS.length;
        const color = this.TRACK_COLORS[colorIndex];
        
        // Keypoints are in 320x224 coordinate space, scale to canvas size
        const scaleX = this.canvas.width / 320;
        const scaleY = this.canvas.height / 224;
        
        // Draw skeleton connections (limbs)
        this.ctx.strokeStyle = color.stroke;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        
        for (const [startIdx, endIdx] of this.SKELETON_CONNECTIONS) {
            const startX = keypoints[startIdx * 2] * scaleX;
            const startY = keypoints[startIdx * 2 + 1] * scaleY;
            const endX = keypoints[endIdx * 2] * scaleX;
            const endY = keypoints[endIdx * 2 + 1] * scaleY;
            
            // Only draw if both points are valid (not -1)
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
            
            // Only draw if coordinate is valid (not -1)
            if (this.isValidCoordinate(x) && this.isValidCoordinate(y)) {
                // Draw point
                this.ctx.fillStyle = color.fill;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 5, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Draw outline
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        }
        
        // Draw pose label above the skeleton
        if (data.pose_label) {
            this.drawPoseLabel(data.pose_label, keypoints, trackId, scaleX, scaleY);
        }
    },
    
    // Draw pose label above the skeleton
    drawPoseLabel(poseLabel, keypoints, trackId, scaleX = 1, scaleY = 1) {
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
        
        // Get color based on track
        const colorIndex = trackId % this.TRACK_COLORS.length;
        const baseColor = this.TRACK_COLORS[colorIndex];
        
        // Measure text width
        this.ctx.font = 'bold 14px sans-serif';
        const textWidth = this.ctx.measureText(poseLabel).width;
        
        // Clamp x position to prevent overflow
        const canvasWidth = this.canvas.width;
        const clampedX = Math.max(textWidth / 2 + 10, Math.min(labelX, canvasWidth - textWidth / 2 - 10));
        
        // Draw label background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.beginPath();
        this.ctx.roundRect(clampedX - textWidth / 2 - 10, labelY - 20, textWidth + 20, 24, 4);
        this.ctx.fill();
        
        // Draw label border
        this.ctx.strokeStyle = baseColor.stroke;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw label text
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(poseLabel, clampedX, labelY - 8);
    },
    
    // Refresh display - fetches and renders both skeletons and safe areas
    // Called after streamVideo refreshes
    async refresh() {
        if (!this.isInitialized) {
            this.init();
        }
        
        if (!AppState.currentCameraId || !AppState.isConnected) {
            this.clear();
            return;
        }
        
        // Clear canvas first
        this.clear();
        
        // Fetch tracking data and safe areas in parallel
        const [trackingData, safeAreas, cameraState] = await Promise.all([
            this.fetchTrackingData(),
            this.showSafeAreas ? this.fetchSafeAreas() : Promise.resolve(null),
            this.fetchCameraState()
        ]);
        
        // Update camera state (which may update showSafeAreas flag)
        if (cameraState) {
            this.updateCameraState(cameraState);
        }
        
        // Render safe areas first (so they appear behind skeletons)
        if (this.showSafeAreas && safeAreas) {
            this.renderSafeAreas(safeAreas);
            this.cachedSafeAreas = safeAreas;
        }
        
        // Render skeletons on top
        if (trackingData) {
            this.renderSkeletons(trackingData);
            this.cachedTrackingData = trackingData;
        }
    },
    
    // Fetch tracking data from server
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
                return data.tracking_data || {};
            } else {
                return this.cachedTrackingData || {};
            }
        } catch (error) {
            console.error('[StreamDisplay] Error fetching tracking data:', error);
            return this.cachedTrackingData || {};
        }
    },
    
    // Fetch safe areas from server
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
                return safeAreas || [];
            } else {
                return this.cachedSafeAreas || [];
            }
        } catch (error) {
            console.error('[StreamDisplay] Error fetching safe areas:', error);
            return this.cachedSafeAreas || [];
        }
    },
    
    // Fetch camera state to get control flags
    async fetchCameraState() {
        if (!AppState.currentCameraId) {
            return null;
        }
        
        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/camera-state?camera_id=' + AppState.currentCameraId
            );
            
            if (response.ok) {
                return await response.json();
            } else {
                return null;
            }
        } catch (error) {
            console.error('[StreamDisplay] Error fetching camera state:', error);
            return null;
        }
    },
    
    // Cleanup
    destroy() {
        this.clear();
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        this.cachedTrackingData = {};
        this.cachedSafeAreas = null;
        this.cameraState = {};
        this.trackTimestamps = {};
        console.log('[StreamDisplay] Destroyed');
    }
};

// Export for use in other modules
window.StreamDisplay = StreamDisplay;
