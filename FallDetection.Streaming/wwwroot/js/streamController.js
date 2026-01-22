// streamController.js - HTTP JPEG streaming with auto-refresh

const StreamController = {
    // State management for robust streaming
    isRefreshing: false,
    consecutiveErrors: 0,
    baseRefreshInterval: REFRESH_INTERVAL_MS,
    maxBackoffInterval: 5000,
    currentBackoffInterval: REFRESH_INTERVAL_MS,
    
    // Background image state
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
        
        // Initialize unified stream display
        this.initializeStreamDisplay();
        
        // Initial refresh
        this.refreshStreamImage();
        
        // Start periodic refresh with current backoff interval
        AppState.streamRefreshInterval = setInterval(() => {
            this.scheduledRefresh();
        }, this.currentBackoffInterval);
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
        
        // Cleanup stream display
        this.cleanupStreamDisplay();
    },

    scheduledRefresh() {
        // Always refresh - if showing background, it will use background endpoint
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
        // Use background endpoint if showing background, otherwise use frame endpoint
        const endpoint = this.isShowingBackground ? 'background' : 'frame';
        const streamUrl = `${STREAMING_HTTP_URL}/api/stream/${endpoint}?camera_id=${AppState.currentCameraId}&t=${timestamp}`;
        
        const img = DOMElements.streamVideo;
        
        // IMPORTANT: Clear previous handlers to prevent memory leaks and cross-triggering
        img.onload = null;
        img.onerror = null;
        
        // Use onload for IMG elements
        img.onload = () => {
            AppState.errorCount = 0;
            this.consecutiveErrors = 0;
            // Reset backoff on successful load
            this.currentBackoffInterval = this.baseRefreshInterval;
            this.isRefreshing = false;
            console.debug(`${this.isShowingBackground ? 'Background' : 'Frame'} loaded successfully for ${AppState.currentCameraId}`);
            
            // Note: Connection status is determined solely by pings from the camera
            // Frame loads do NOT affect connection status
            // The camera's ping endpoint (/api/stream/ping) is the single source of truth
            
            // Refresh stream canvas after image load (fetches and renders skeletons + safe areas)
            this.rerenderStreamCanvas();
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
    
    // Re-render stream canvas after streamVideo updates
    // This refreshes both skeletons and safe areas on the unified canvas
    rerenderStreamCanvas() {
        if (window.StreamDisplay && window.StreamDisplay.isInitialized) {
            // Resize canvas to match new image dimensions
            window.StreamDisplay.resizeCanvas();
            // Refresh display (fetches and renders skeletons + safe areas)
            window.StreamDisplay.refresh();
        }
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
    
    // Initialize unified stream display overlay
    initializeStreamDisplay() {
        if (window.StreamDisplay) {
            window.StreamDisplay.init();
            // Display will refresh after streamVideo refreshes (not continuously polling)
        }
    },
    
    // Cleanup stream display
    cleanupStreamDisplay() {
        if (window.StreamDisplay) {
            window.StreamDisplay.clear();
        }
    },
    
    // Set background display mode
    setShowBackground(showBackground) {
        this.isShowingBackground = showBackground;
        console.log(`[StreamController] Background mode: ${showBackground ? 'ON' : 'OFF'}`);
        // The next refresh will automatically use the correct endpoint
        if (!this.isRefreshing) {
            this.refreshStreamImage();
        }
    }
};

// Export
window.StreamController = StreamController;

