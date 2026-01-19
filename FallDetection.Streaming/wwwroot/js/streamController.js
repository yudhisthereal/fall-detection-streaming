// streamController.js - HTTP JPEG streaming with auto-refresh

const StreamController = {
    // State management for robust streaming
    isRefreshing: false,
    consecutiveErrors: 0,
    baseRefreshInterval: REFRESH_INTERVAL_MS,
    maxBackoffInterval: 5000,
    currentBackoffInterval: REFRESH_INTERVAL_MS,
    
    // Background image state
    backgroundImageElement: null,
    isShowingBackground: false,
    
    // HTTP JPEG streaming only - no WebRTC/RTMP
    initializeStream() {
        console.log("Starting HTTP JPEG stream");
        this.startHTTPStream();
    },

    startHTTPStream() {
        this.stopHTTPStream();
        
        // Verify we have an IMG element, not a VIDEO element
        if (!DOMElements.streamVideo) {
            console.error('Stream video element not found');
            return;
        }
        
        const elementTag = DOMElements.streamVideo.tagName;
        if (elementTag !== 'IMG') {
            console.error(`Expected IMG element but found ${elementTag}. Please change <video> to <img> in HTML.`);
            return;
        }
        
        console.log(`Starting auto-refresh stream for ${AppState.currentCameraId}`);
        
        // Reset error state
        this.consecutiveErrors = 0;
        this.currentBackoffInterval = this.baseRefreshInterval;
        this.isRefreshing = false;
        
        // Initialize skeleton display
        this.initializeSkeletonDisplay();
        
        // Initial refresh
        this.refreshStreamImage();
        
        // Start periodic refresh with current backoff interval
        AppState.streamRefreshInterval = setInterval(() => this.scheduledRefresh(), this.currentBackoffInterval);
    },

    stopHTTPStream() {
        if (AppState.streamRefreshInterval) {
            clearInterval(AppState.streamRefreshInterval);
            AppState.streamRefreshInterval = null;
        }
        if (DOMElements.streamVideo) {
            DOMElements.streamVideo.src = '';
        }
        this.isRefreshing = false;
        
        // Cleanup skeleton display
        this.cleanupSkeletonDisplay();
    },

    scheduledRefresh() {
        // Only refresh if not already processing a request
        if (!this.isRefreshing) {
            this.refreshStreamImage();
        } else {
            console.log('Skipping refresh - previous request still in progress');
        }
    },

    refreshStreamImage() {
        if (!DOMElements.streamVideo) return;
        
        this.isRefreshing = true;
        
        const timestamp = Date.now();
        let streamUrl;
        
        // Check if we should show background or live frame
        if (this.isShowingBackground && this.backgroundImageElement) {
            // Use cached background image
            this.isRefreshing = false;
            return;
        } else {
            streamUrl = `${STREAMING_HTTP_URL}/api/stream/frame?camera_id=${AppState.currentCameraId}&t=${timestamp}`;
        }
        
        const img = DOMElements.streamVideo;
        
        // Use onload for IMG elements
        img.onload = () => {
            AppState.errorCount = 0;
            this.consecutiveErrors = 0;
            // Reset backoff on successful load
            this.currentBackoffInterval = this.baseRefreshInterval;
            this.isRefreshing = false;
            console.debug(`Frame loaded successfully for ${AppState.currentCameraId}`);
            
            // Note: Connection status is determined solely by pings from the camera
            // Frame loads do NOT affect connection status
            // The camera's ping endpoint (/api/stream/ping) is the single source of truth
            
            // Resize skeleton canvas to match new image dimensions
            if (window.SkeletonDisplay) {
                window.SkeletonDisplay.resizeCanvas();
            }
        };
        
        // Handle image load errors
        img.onerror = () => {
            this.consecutiveErrors++;
            AppState.errorCount++;
            this.isRefreshing = false;
            
            // Apply exponential backoff for errors
            this.currentBackoffInterval = Math.min(
                this.currentBackoffInterval * 2, 
                this.maxBackoffInterval
            );
            
            console.error(`Stream error for ${AppState.currentCameraId}: ${this.consecutiveErrors} consecutive errors`);
            
            // Note: Connection status is determined solely by pings from the camera
            // Frame errors do NOT affect connection status
            // The camera's ping endpoint (/api/stream/ping) is the single source of truth
            
            // Check if we need to recover
            if (AppState.errorCount >= MAX_ERRORS) {
                console.error('Too many stream errors, attempting recovery...');
                this.recoverStream();
            }
        };
        
        // Set the source to trigger load
        img.src = streamUrl;
    },

    recoverStream() {
        console.log('Attempting stream recovery...');
        
        // Reset error tracking
        AppState.errorCount = 0;
        this.consecutiveErrors = 0;
        this.currentBackoffInterval = this.baseRefreshInterval;
        
        // Clear current stream
        this.stopHTTPStream();
        
        // Brief delay before restarting
        setTimeout(() => {
            console.log('Restarting stream after recovery...');
            this.startHTTPStream();
        }, 1000);
    },
    
    // Manual refresh trigger (for button click, etc.)
    manualRefresh() {
        if (this.isRefreshing) {
            console.log('Manual refresh skipped - refresh in progress');
            return;
        }
        this.backgroundImageElement = null; // Clear cached background
        this.refreshStreamImage();
    },
    
    // Update refresh rate dynamically
    setRefreshRate(intervalMs) {
        this.baseRefreshInterval = intervalMs;
        this.currentBackoffInterval = intervalMs;
        
        // If running, restart with new interval
        if (AppState.streamRefreshInterval) {
            this.startHTTPStream();
        }
    },
    
    // Initialize skeleton display overlay
    initializeSkeletonDisplay() {
        if (window.SkeletonDisplay) {
            window.SkeletonDisplay.initialize();
        }
    },
    
    // Cleanup skeleton display
    cleanupSkeletonDisplay() {
        if (window.SkeletonDisplay) {
            window.SkeletonDisplay.destroy();
        }
    },
    
    // Set background display mode
    async setShowBackground(showBackground) {
        this.isShowingBackground = showBackground;
        
        if (showBackground && !this.backgroundImageElement) {
            // Load background image
            try {
                const timestamp = Date.now();
                const url = `${STREAMING_HTTP_URL}/api/stream/background?camera_id=${AppState.currentCameraId}&t=${timestamp}`;
                const response = await fetch(url);
                
                if (response.ok) {
                    const blob = await response.blob();
                    const img = new Image();
                    
                    img.onload = () => {
                        this.backgroundImageElement = img;
                        DOMElements.streamVideo.src = img.src;
                        
                        // Resize skeleton canvas to match background
                        if (window.SkeletonDisplay) {
                            window.SkeletonDisplay.resizeCanvas();
                        }
                    };
                    
                    img.src = URL.createObjectURL(blob);
                } else {
                    // Fallback to live stream
                    this.isShowingBackground = false;
                    this.manualRefresh();
                }
            } catch (error) {
                console.error("Failed to load background:", error);
                this.isShowingBackground = false;
                this.manualRefresh();
            }
        } else if (showBackground && this.backgroundImageElement) {
            // Use cached background
            DOMElements.streamVideo.src = this.backgroundImageElement.src;
        } else {
            // Show live stream
            this.manualRefresh();
        }
        
        // Update skeleton display
        if (window.SkeletonDisplay) {
            window.SkeletonDisplay.setShowRaw(!showBackground);
        }
    }
};

// Export
window.StreamController = StreamController;

