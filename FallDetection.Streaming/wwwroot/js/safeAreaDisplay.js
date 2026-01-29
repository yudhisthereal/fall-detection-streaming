// safeAreaDisplay.js - Static canvas overlay for safe areas rendering
// Safe areas are continuously re-rendered like skeletonCanvas

const SafeAreaDisplay = {
    canvas: null,
    ctx: null,
    isInitialized: false,
    showSafeAreas: false, // Track current state to only update on change
    animationFrameId: null,
    isPolling: false,
    cachedSafeAreas: null, // Cache safe areas to avoid fetching every frame
    
    // Initialize the static canvas for safe areas
    init() {
        if (this.isInitialized) return;
        
        this.canvas = document.getElementById('staticCanvas');
        if (!this.canvas) {
            console.warn('[SafeAreaDisplay] staticCanvas element not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.isInitialized = true;
        
        // Canvas z-index is handled by CSS, no need to set here
        
        // Resize canvas to match video dimensions
        this.resizeCanvas();
        
        console.log('[SafeAreaDisplay] Static canvas initialized');
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
        
        console.debug(`[SafeAreaDisplay] Static canvas resized to ${width}x${height}`);
    },
    
    // Clear the canvas
    clear() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    
    // Get the actual image source dimensions for proper coordinate mapping
    // This matches the approach used in safeAreaEditor.js
    getImageDimensions() {
        const streamImg = document.getElementById('streamImg');
        if (!streamImg) {
            return { width: this.canvas.width, height: this.canvas.height };
        }
        
        // Use naturalWidth/naturalHeight which are available on loaded images
        // Fallback to width/height attributes if natural dimensions are not set
        const width = streamImg.naturalWidth || streamImg.width || this.canvas.width;
        const height = streamImg.naturalHeight || streamImg.height || this.canvas.height;
        
        return { width, height };
    },
    
    // Render safe areas on the static canvas
    // Uses the same coordinate scaling approach as safeAreaEditor.js
    // Always re-renders (like skeletonCanvas) to ensure canvas stays visible
    render(safeAreas) {
        if (!this.ctx || !this.canvas) return;
        
        // Always clear and re-render (like skeletonCanvas does)
        this.clear();
        
        if (!safeAreas || safeAreas.length === 0) {
            return;
        }
        
        const ctx = this.ctx;
        
        // Get source image dimensions (like safeAreaEditor.js does)
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
            // This matches safeAreaEditor.js: normalized * sourceDimensions, then scale to canvas
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
    
    // Start real-time continuous polling for safe areas (like skeletonCanvas)
    startPolling() {
        if (this.isPolling) return;
        
        this.isPolling = true;
        
        // Start continuous polling loop
        this.pollLoop();
        
        console.log('[SafeAreaDisplay] Started real-time continuous polling');
    },
    
    // Continuous polling loop using requestAnimationFrame for real-time updates
    pollLoop() {
        if (!this.isPolling) return;
        
        // Poll for safe areas and render
        this.pollForSafeAreas().then(() => {
            // Immediately request next frame - no delay
            this.animationFrameId = requestAnimationFrame(() => this.pollLoop());
        }).catch((error) => {
            console.error('[SafeAreaDisplay] Polling error:', error);
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
        this.cachedSafeAreas = null;
        console.log('[SafeAreaDisplay] Stopped polling');
    },
    
    // Poll for safe areas from the server and render
    async pollForSafeAreas() {
        if (!AppState.currentCameraId || !AppState.isConnected) {
            this.clear();
            return null;
        }
        
        if (!this.showSafeAreas) {
            this.clear();
            return null;
        }
        
        try {
            const safeAreas = await this.fetchSafeAreas();
            // Always render, even if safe areas are empty
            this.render(safeAreas || []);
            this.cachedSafeAreas = safeAreas;
            return safeAreas;
        } catch (error) {
            console.error('[SafeAreaDisplay] Error polling safe areas:', error);
            // On error, still render with cached data or empty array
            this.render(this.cachedSafeAreas || []);
            return null;
        }
    },
    
    // Update and render safe areas (called when show_safe_area is toggled)
    // Only updates when showSafeAreas value changes (False to True or vice-versa)
    async update(showSafeAreas) {
        // Only update if the state has changed
        if (this.showSafeAreas === showSafeAreas) {
            return;
        }
        
        // Update state
        this.showSafeAreas = showSafeAreas;
        
        if (!this.isInitialized) {
            this.init();
        }
        
        if (!showSafeAreas) {
            this.stopPolling();
            this.clear();
            console.log('[SafeAreaDisplay] Safe areas hidden');
            return;
        }
        
        console.log('[SafeAreaDisplay] Safe areas enabled, starting continuous polling...');
        
        // Start continuous polling (like skeletonCanvas)
        this.startPolling();
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
                console.log(`[SafeAreaDisplay] Loaded ${safeAreas.length} safe areas for ${AppState.currentCameraId}`);
                return safeAreas;
            } else {
                return [];
            }
        } catch (error) {
            console.error('[SafeAreaDisplay] Error fetching safe areas:', error);
            return [];
        }
    },
    
    // Cleanup
    destroy() {
        this.stopPolling();
        this.clear();
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        this.cachedSafeAreas = null;
        console.log('[SafeAreaDisplay] Destroyed');
    }
};

// Export for use in other modules
window.SafeAreaDisplay = SafeAreaDisplay;

