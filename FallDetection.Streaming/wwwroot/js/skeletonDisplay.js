// skeletonDisplay.js - Skeleton rendering and pose display overlay

const SkeletonDisplay = {
    // Canvas and context
    canvas: null,
    ctx: null,
    
    // Parent element reference
    parentElement: null,
    
    // Background image cache
    backgroundImage: null,
    backgroundImageTimestamp: null,
    
    // Current tracking data
    trackingData: null,
    showRaw: true,
    
    // Skeleton configuration
    JOINT_RADIUS: 5,
    LINE_WIDTH: 2,
    
    // COCO keypoint connections for skeleton
    SKELETON_CONNECTIONS: [
        [0, 1],   // nose - left_eye
        [0, 2],   // nose - right_eye
        [1, 3],   // left_eye - left_ear
        [2, 4],   // right_eye - right_ear
        [5, 6],   // left_shoulder - right_shoulder
        [5, 7],   // left_shoulder - left_elbow
        [7, 9],   // left_elbow - left_wrist
        [6, 8],   // right_shoulder - right_elbow
        [8, 10],  // right_elbow - right_wrist
        [5, 11],  // left_shoulder - left_hip
        [6, 12],  // right_shoulder - right_hip
        [11, 12], // left_hip - right_hip
        [11, 13], // left_hip - left_knee
        [13, 15], // left_knee - left_ankle
        [12, 14], // right_hip - right_knee
        [14, 16]  // right_knee - right_ankle
    ],
    
    // Keypoint names for reference
    KEYPOINT_NAMES: [
        'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
        'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
        'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
        'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
    ],
    
    // Initialize the canvas overlay
    initialize() {
        console.log("Initializing skeleton display...");
        
        // Find the stream video element
        this.parentElement = DOMElements.streamVideo;
        if (!this.parentElement) {
            console.error("Stream video element not found");
            return;
        }
        
        // Create canvas element
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'skeletonCanvas';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10;
        `;
        
        // Get context
        this.ctx = this.canvas.getContext('2d');
        
        // Insert canvas after the video/image element
        const container = this.parentElement.parentElement;
        if (container) {
            container.insertBefore(this.canvas, this.parentElement.nextSibling);
        } else {
            document.body.appendChild(this.canvas);
        }
        
        // Set initial canvas size
        this.resizeCanvas();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Handle element load (for IMG elements)
        this.parentElement.addEventListener('load', () => this.resizeCanvas());
        this.parentElement.addEventListener('loadeddata', () => this.resizeCanvas());
        
        // Start tracking data polling
        this.startTrackingDataPoll();
        
        console.log("Skeleton display initialized");
    },
    
    // Resize canvas to match parent element
    resizeCanvas() {
        if (!this.canvas || !this.parentElement) return;
        
        const rect = this.parentElement.getBoundingClientRect();
        const naturalWidth = this.parentElement.naturalWidth || this.parentElement.videoWidth || rect.width;
        const naturalHeight = this.parentElement.naturalHeight || this.parentElement.videoHeight || rect.height;
        
        // Set canvas resolution (use natural dimensions for clarity)
        this.canvas.width = naturalWidth;
        this.canvas.height = naturalHeight;
        
        console.log(`Canvas resized to ${this.canvas.width}x${this.canvas.height}`);
        
        // Redraw if we have tracking data
        if (this.trackingData) {
            this.render();
        }
    },
    
    // Start polling for tracking data
    startTrackingDataPoll() {
        // Poll every 100ms for tracking data
        AppState.skeletonPollInterval = setInterval(async () => {
            if (!AppState.currentCameraId) return;
            
            try {
                const response = await fetch(
                    `${STREAMING_HTTP_URL}/api/stream/tracking-data?camera_id=${AppState.currentCameraId}`
                );
                
                if (response.ok) {
                    const data = await response.json();
                    this.trackingData = data.tracking_data;
                    this.render();
                }
            } catch (error) {
                // Silently ignore errors - tracking data may not be available yet
            }
        }, 100);
    },
    
    // Update show_raw flag
    setShowRaw(showRaw) {
        this.showRaw = showRaw;
        this.backgroundImage = null; // Clear cached background
        this.render();
    },
    
    // Render everything
    render() {
        if (!this.ctx || !this.canvas) return;
        
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // If not showing raw and we have tracking data, ensure background is displayed
        if (!this.showRaw && this.trackingData) {
            this.renderBackground();
        }
        
        // Render skeletons for all tracked people
        if (this.trackingData) {
            for (const [trackId, data] of Object.entries(this.trackingData)) {
                this.renderSkeleton(data, trackId);
            }
        }
    },
    
    // Render background image
    async renderBackground() {
        if (!AppState.currentCameraId) return;
        
        // Check if we have a valid cached background
        const timestamp = Date.now();
        
        if (this.backgroundImage) {
            // Render cached background
            this.ctx.drawImage(this.backgroundImage, 0, 0);
            return;
        }
        
        // Fetch background image
        try {
            const url = `${STREAMING_HTTP_URL}/api/stream/background?camera_id=${AppState.currentCameraId}&t=${timestamp}`;
            const response = await fetch(url);
            
            if (response.ok) {
                const blob = await response.blob();
                const img = new Image();
                
                img.onload = () => {
                    this.backgroundImage = img;
                    this.backgroundImageTimestamp = timestamp;
                    this.ctx.drawImage(img, 0, 0);
                };
                
                img.onerror = () => {
                    console.debug("Background image not available yet");
                };
                
                img.src = URL.createObjectURL(blob);
            }
        } catch (error) {
            console.debug("Failed to load background:", error.message);
        }
    },
    
    // Render a single skeleton
    renderSkeleton(data, trackId) {
        if (!data.keypoints || !Array.isArray(data.keypoints)) return;
        
        const ctx = this.ctx;
        const keypoints = data.keypoints;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Parse keypoints into x,y pairs
        const points = [];
        for (let i = 0; i < keypoints.length; i += 2) {
            points.push({
                x: keypoints[i],
                y: keypoints[i + 1],
                valid: keypoints[i] >= 0 && keypoints[i + 1] >= 0
            });
        }
        
        // Determine colors based on safety status
        const safetyStatus = data.safety_status || 'unknown';
        const colors = this.getColorsForStatus(safetyStatus);
        
        // Draw skeleton connections
        ctx.strokeStyle = colors.skeleton;
        ctx.lineWidth = this.LINE_WIDTH;
        
        for (const [i, j] of this.SKELETON_CONNECTIONS) {
            if (points[i] && points[j] && points[i].valid && points[j].valid) {
                ctx.beginPath();
                ctx.moveTo(points[i].x, points[i].y);
                ctx.lineTo(points[j].x, points[j].y);
                ctx.stroke();
            }
        }
        
        // Draw joints
        for (let i = 0; i < points.length; i++) {
            if (points[i].valid) {
                ctx.beginPath();
                ctx.arc(points[i].x, points[i].y, this.JOINT_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = colors.joint;
                ctx.fill();
            }
        }
        
        // Render pose label
        if (data.pose_label) {
            this.renderPoseLabel(data.pose_label, points, colors, width, height);
        }
    },
    
    // Render pose label with boundary clamping
    renderPoseLabel(label, points, colors, canvasWidth, canvasHeight) {
        const ctx = this.ctx;
        
        // Calculate label position (above the head - use nose or first valid upper body point)
        let labelX = canvasWidth / 2;
        let labelY = canvasHeight - 30; // Default bottom position
        
        // Find the head position (nose or first visible point)
        let headFound = false;
        for (const point of points) {
            if (point.valid && point.y < canvasHeight * 0.5) {
                labelX = point.x;
                labelY = point.y - 25; // Position above head
                headFound = true;
                break;
            }
        }
        
        // If no head found, use bounding box from tracking data if available
        if (!headFound && this.trackingData) {
            // Fallback to center top
            labelX = canvasWidth / 2;
            labelY = 30;
        }
        
        // Measure text
        ctx.font = 'bold 14px Arial';
        const textMetrics = ctx.measureText(label);
        const padding = 8;
        const labelWidth = textMetrics.width + padding * 2;
        const labelHeight = 24;
        
        // Clamp label position to canvas boundaries
        // X position
        if (labelX < labelWidth / 2) {
            labelX = labelWidth / 2;
        } else if (labelX > canvasWidth - labelWidth / 2) {
            labelX = canvasWidth - labelWidth / 2;
        }
        
        // Y position (ensure label is fully visible)
        if (labelY < labelHeight) {
            labelY = labelHeight;
        } else if (labelY > canvasHeight - 5) {
            labelY = canvasHeight - 5;
        }
        
        // Draw label background
        ctx.fillStyle = colors.labelBg;
        ctx.beginPath();
        ctx.roundRect(
            labelX - labelWidth / 2,
            labelY - labelHeight + 4,
            labelWidth,
            labelHeight,
            4
        );
        ctx.fill();
        
        // Draw label border
        ctx.strokeStyle = colors.labelBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Draw label text
        ctx.fillStyle = colors.labelText;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelX, labelY - labelHeight / 2 + 2);
    },
    
    // Get colors based on safety status
    getColorsForStatus(safetyStatus) {
        switch (safetyStatus.toLowerCase()) {
            case 'safe':
                return {
                    skeleton: '#00FF00',  // Green
                    joint: '#00FF00',
                    labelBg: 'rgba(0, 255, 0, 0.8)',
                    labelBorder: '#00FF00',
                    labelText: '#000000'
                };
            case 'warning':
                return {
                    skeleton: '#FFFF00',  // Yellow
                    joint: '#FFFF00',
                    labelBg: 'rgba(255, 255, 0, 0.8)',
                    labelBorder: '#FFFF00',
                    labelText: '#000000'
                };
            case 'unsafe':
            case 'fall_detected':
                return {
                    skeleton: '#FF0000',  // Red
                    joint: '#FF0000',
                    labelBg: 'rgba(255, 0, 0, 0.8)',
                    labelBorder: '#FF0000',
                    labelText: '#FFFFFF'
                };
            default: // 'tracking', 'unknown'
                return {
                    skeleton: '#00FFFF',  // Cyan
                    joint: '#00FFFF',
                    labelBg: 'rgba(0, 255, 255, 0.8)',
                    labelBorder: '#00FFFF',
                    labelText: '#000000'
                };
        }
    },
    
    // Clear the canvas
    clear() {
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.trackingData = null;
    },
    
    // Cleanup
    destroy() {
        // Stop polling
        if (AppState.skeletonPollInterval) {
            clearInterval(AppState.skeletonPollInterval);
            AppState.skeletonPollInterval = null;
        }
        
        // Remove canvas
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        this.canvas = null;
        this.ctx = null;
        this.trackingData = null;
        this.backgroundImage = null;
    }
};

// Export
window.SkeletonDisplay = SkeletonDisplay;

