// skeletonDisplay.js - Skeleton rendering on canvas overlay for pose detection

const SkeletonDisplay = {
    canvas: null,
    ctx: null,
    isInitialized: false,
    animationFrameId: null,
    isPolling: false,
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
    
    // Initialize the canvas
    init() {
        if (this.isInitialized) return;
        
        this.canvas = document.getElementById('skeletonCanvas');
        if (!this.canvas) {
            console.warn('[SkeletonDisplay] skeletonCanvas element not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.isInitialized = true;
        
        // Canvas z-index is handled by CSS, no need to set here
        
        // Resize canvas to match video dimensions
        this.resizeCanvas();
        
        // Initialize static canvas for safe areas
        if (window.SafeAreaDisplay) {
            window.SafeAreaDisplay.init();
        }
        
        console.log('[SkeletonDisplay] Canvas initialized');
    },
    
    // Resize canvas to match video dimensions
    resizeCanvas() {
        const streamImg = document.getElementById('streamImg');
        if (!streamImg || !this.canvas) return;
        
        // Canvas z-index is handled by CSS, no need to set here
        
        // Use the displayed size of the video element
        const width = streamImg.clientWidth || 1200;
        const height = streamImg.clientHeight || 675;
        
        // Set canvas dimensions to match displayed size
        this.canvas.width = width;
        this.canvas.height = height;
        
        console.debug(`[SkeletonDisplay] Canvas resized to ${width}x${height}`);
        
        // Also resize the static canvas for safe areas
        if (window.SafeAreaDisplay) {
            window.SafeAreaDisplay.resizeCanvas();
        }
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
        
        if (newShowSafeAreas !== this.showSafeAreas || newShowSafeAreas) {
            this.showSafeAreas = newShowSafeAreas;
            console.log(`[SkeletonDisplay] show_safe_areas: ${this.showSafeAreas}`);
            
            // Use SafeAreaDisplay to render safe areas on the static canvas
            if (window.SafeAreaDisplay) {
                window.SafeAreaDisplay.update(this.showSafeAreas);
            }
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
    
    // Render all skeletons from tracking data
    render(trackingData) {
        this.clear();
        
        // Note: Safe areas are rendered on staticCanvas by SafeAreaDisplay
        // and do not need to be redrawn every frame
        
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
        
        // Log keypoints for debugging
        console.log(`[SkeletonDisplay] Track ${trackId} keypoints:`, keypoints);
        
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
            // Keypoint coordinate of -1 means the keypoint is invalid
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
    
    // Start real-time continuous polling for tracking data
    // Uses requestAnimationFrame pattern for immediate response without sleep delays
    startPolling() {
        if (this.isPolling) return;
        
        this.isPolling = true;
        
        // Start continuous polling loop
        this.pollLoop();
        
        console.log('[SkeletonDisplay] Started real-time continuous polling');
    },
    
    // Continuous polling loop using requestAnimationFrame for real-time updates
    // No sleep delays - polls immediately after data is received
    pollLoop() {
        if (!this.isPolling) return;
        
        // Poll for tracking data and camera state
        Promise.all([
            this.pollForTrackingData(),
            this.pollForCameraState()
        ]).then(() => {
            // Immediately request next frame - no delay
            this.animationFrameId = requestAnimationFrame(() => this.pollLoop());
        }).catch((error) => {
            console.error('[SkeletonDisplay] Polling error:', error);
            // On error, still continue polling but with a small delay to avoid spam
            this.animationFrameId = requestAnimationFrame(() => this.pollLoop());
        });
    },
    
    // Stop polling
    stopPolling() {
        this.isPolling = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.cameraState = {};
        this.trackTimestamps = {}; // Clear track timestamps when stopping
        console.log('[SkeletonDisplay] Stopped polling');
    },
    
    // Poll for tracking data from the server
    async pollForTrackingData() {
        if (!AppState.currentCameraId || !AppState.isConnected) {
            this.clear();
            return null;
        }
        
        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/tracks?camera_id=' + AppState.currentCameraId
            );
            
            if (response.ok) {
                const data = await response.json();
                // Always render, even if tracking_data is empty (empty object/dictionary)
                // The render method will clear the canvas when data is empty
                const trackingData = data.tracking_data || {};
                this.render(trackingData);
                return trackingData;
            } else {
                return null;
            }
        } catch (error) {
            console.error('[SkeletonDisplay] Error fetching tracking data:', error);
            return null;
        }
    },
    
    // Poll for camera state to get control flags
    async pollForCameraState() {
        if (!AppState.currentCameraId || !AppState.isConnected) {
            return null;
        }
        
        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/camera-state?camera_id=' + AppState.currentCameraId
            );
            
            if (response.ok) {
                const state = await response.json();
                this.updateCameraState(state);
                return state;
            } else {
                return null;
            }
        } catch (error) {
            console.error('[SkeletonDisplay] Error fetching camera state:', error);
            return null;
        }
    },
    
    // Update skeleton display for current camera
    update() {
        if (!this.isInitialized) {
            this.init();
        }
        this.startPolling();
    },
    
    // Cleanup
    destroy() {
        this.stopPolling();
        this.clear();
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        
        // Also cleanup SafeAreaDisplay
        if (window.SafeAreaDisplay) {
            window.SafeAreaDisplay.destroy();
        }
        
        console.log('[SkeletonDisplay] Destroyed');
    }
};

// Export for use in other modules
window.SkeletonDisplay = SkeletonDisplay;

