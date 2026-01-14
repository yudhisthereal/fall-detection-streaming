// streamController.js - HTTP JPEG streaming with auto-refresh

const StreamController = {
    // State management for robust streaming
    isRefreshing: false,
    consecutiveErrors: 0,
    baseRefreshInterval: REFRESH_INTERVAL_MS,
    maxBackoffInterval: 5000,
    currentBackoffInterval: REFRESH_INTERVAL_MS,
    
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
        const streamUrl = `${STREAMING_HTTP_URL}/api/stream/frame?camera_id=${AppState.currentCameraId}&t=${timestamp}`;
        
        const img = DOMElements.streamVideo;
        
        // Use onload for IMG elements (not onloadeddata which is for VIDEO)
        img.onload = () => {
            AppState.errorCount = 0;
            this.consecutiveErrors = 0;
            // Reset backoff on successful load
            this.currentBackoffInterval = this.baseRefreshInterval;
            this.isRefreshing = false;
            ConnectionStatus.updateConnectionStatusDebounced(AppState.currentCameraId, true);
            console.debug(`Frame loaded successfully for ${AppState.currentCameraId}`);
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
            ConnectionStatus.updateConnectionStatusDebounced(AppState.currentCameraId, false);
            
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
    }
};

// Export
window.StreamController = StreamController;

