// streamController.js - HTTP JPEG streaming with Two-Pass Rendering
// Stream frames are loaded into hidden streamImg element
// Two-Pass rendering handles:
//   - Background canvas: Draws streamImg frame every 25ms (40 FPS)
//   - Overlay canvas: Draws skeletons/safe areas only when data changes

const StreamController = {
    // State management for robust streaming
    isRefreshing: false,
    consecutiveErrors: 0,
    baseRefreshInterval: REFRESH_INTERVAL_MS,
    backgroundRefreshInterval: 5000,  // 5000ms = 0.2Hz for background mode (show_raw = false)
    maxBackoffInterval: 5000,
    currentBackoffInterval: REFRESH_INTERVAL_MS,

    // HTTP JPEG streaming only - no WebRTC/RTMP
    initializeStream() {
        console.log("Starting HTTP JPEG stream with Two-Pass Rendering");
        this.checkShowRawFlag();
        this.startHTTPStream();
    },

    // Check show_raw flag from camera state
    async checkShowRawFlag() {
        if (!AppState.currentCameraId) return;

        try {
            const response = await fetch(
                `${STREAMING_HTTP_URL}/api/stream/camera-state?camera_id=${AppState.currentCameraId}`
            );
            if (response.ok) {
                const cameraState = await response.json();
                // Update stream display with camera state
                if (window.StreamDisplay && window.StreamDisplay.isInitialized) {
                    window.StreamDisplay.updateCameraState(cameraState);
                }
            }
        } catch (error) {
            console.error('[StreamController] Error checking show_raw flag:', error);
        }
    },

    startHTTPStream() {
        this.stopHTTPStream();

        // Verify we have an IMG element
        if (!DOMElements.streamImg) {
            console.error('Stream video element not found');
            return;
        }

        const elementTag = DOMElements.streamImg.tagName;
        if (elementTag !== 'IMG') {
            console.error(`Expected IMG element but found ${elementTag}. Please change <video> to <img> in HTML.`);
            return;
        }

        console.log(`Starting auto-refresh stream for ${AppState.currentCameraId}`);

        // Reset error state
        this.consecutiveErrors = 0;
        this.currentBackoffInterval = this.baseRefreshInterval;
        this.isRefreshing = false;

        // Start Two-Pass Rendering
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
        if (DOMElements.streamImg) {
            DOMElements.streamImg.src = '';
        }
        this.isRefreshing = false;

        // Stop Two-Pass Rendering
        this.cleanupStreamDisplay();
    },

    scheduledRefresh() {
        // Refresh the stream image
        // skip refresh if refresh in progress, or if camera is not connected
        if (!this.isRefreshing && AppState.cameraConnectionStatus[AppState.currentCameraId]?.connected) {
            this.refreshStreamImage();
        } else {
            console.debug('Skipping refresh - previous request still in progress');
        }
    },

    refreshStreamImage() {
        if (!DOMElements.streamImg) return;

        this.isRefreshing = true;

        const timestamp = Date.now();
        // Use background endpoint if show_raw is false, otherwise use frame endpoint
        const showRaw = window.StreamDisplay && window.StreamDisplay.cameraState?.show_raw === true;
        const endpoint = showRaw ? 'frame' : 'background';
        const streamUrl = `${STREAMING_HTTP_URL}/api/stream/${endpoint}?camera_id=${AppState.currentCameraId}&t=${timestamp}`;

        const img = DOMElements.streamImg;

        // IMPORTANT: Clear previous handlers to prevent memory leaks and cross-triggering
        img.onload = null;
        img.onerror = null;

        // Use onload for IMG elements
        img.onload = () => {
            AppState.errorCount = 0;
            this.consecutiveErrors = 0;

            // Set interval based on show_raw flag
            const targetInterval = showRaw ? this.baseRefreshInterval : this.backgroundRefreshInterval;

            // Only restart interval if it changed significantly
            if (Math.abs(this.currentBackoffInterval - targetInterval) > 10) {
                this.currentBackoffInterval = targetInterval;
                // Restart interval with new timing
                if (AppState.streamRefreshInterval) {
                    clearInterval(AppState.streamRefreshInterval);
                    AppState.streamRefreshInterval = setInterval(() => {
                        this.scheduledRefresh();
                    }, this.currentBackoffInterval);
                }
            }

            this.isRefreshing = false;
            console.debug(`${endpoint} loaded successfully for ${AppState.currentCameraId}`);

            // Note: streamBackgroundImg is NOT updated here to prevent periodic refreshes
            // It should only be updated by StreamDisplay in authorized cases:
            // 1. Initial connection, 2. Entering background mode, 3. When set_background completes

            // Log stream frame success (throttled to avoid spam - log every 50th frame)
            if (window.LogPanel && !this.frameSuccessCount) this.frameSuccessCount = 0;
            if (window.LogPanel && endpoint === 'background') {
                this.frameSuccessCount++;
                if (this.frameSuccessCount % 50 === 0) {
                    LogPanel.add(
                        `📹 Stream frames loading successfully (count: ${this.frameSuccessCount})`,
                        'info',
                        'StreamImg'
                    );
                }
            }

            // Note: Connection status is determined solely by pings from the camera
            // Frame loads do NOT affect connection status
            // The camera's ping endpoint (/api/stream/ping) is the single source of truth
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

    // Update refresh interval based on show_raw flag
    updateRefreshInterval() {
        const showRaw = window.StreamDisplay && window.StreamDisplay.cameraState?.show_raw === true;
        const targetInterval = showRaw ? this.baseRefreshInterval : this.backgroundRefreshInterval;

        if (this.currentBackoffInterval !== targetInterval && AppState.streamRefreshInterval) {
            this.currentBackoffInterval = targetInterval;
            clearInterval(AppState.streamRefreshInterval);
            AppState.streamRefreshInterval = setInterval(() => {
                this.scheduledRefresh();
            }, this.currentBackoffInterval);
            console.log(`[StreamController] Refresh interval changed to ${this.currentBackoffInterval}ms (${showRaw ? 'raw mode' : 'background mode @ 0.2Hz'})`);
        }
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

    // Initialize Two-Pass Rendering
    initializeStreamDisplay() {
        if (window.StreamDisplay) {
            window.StreamDisplay.start();
            console.log('[StreamController] Two-Pass rendering started');
        }
    },

    // Cleanup stream display
    cleanupStreamDisplay() {
        if (window.StreamDisplay) {
            window.StreamDisplay.stop();
            console.log('[StreamController] Two-Pass rendering stopped');
        }
    }
};

// Export
window.StreamController = StreamController;
