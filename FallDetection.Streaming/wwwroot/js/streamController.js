// streamController.js - Stream control (HTTP fallback, WebRTC integration)

const StreamController = {
    async initializeWebRTC() {
        try {
            // Try WebRTC first
            await this.setupWebRTC();
        } catch (err) {
            console.error("WebRTC setup failed:", err);
            // Fallback to HTTP streaming
            this.setupHTTPStreamFallback();
        }
    },

    async setupWebRTC() {
        if (!DOMElements.streamVideo) return;
        
        // Use the WebRTCStreamer from webrtc.js
        if (window.WebRTCStreamer) {
            window.webrtcStreamer = new WebRTCStreamer(DOMElements.streamVideo, STREAMING_HTTP_URL);
            await window.webrtcStreamer.initialize(AppState.currentCameraId);
            
            // Listen for connection state changes
            window.webrtcStreamer.peerConnection.onconnectionstatechange = () => {
                console.log('WebRTC Connection state:', window.webrtcStreamer.peerConnection.connectionState);
                if (window.webrtcStreamer.peerConnection.connectionState === 'connected') {
                    ConnectionStatus.updateConnectionStatusDebounced(AppState.currentCameraId, true);
                } else if (window.webrtcStreamer.peerConnection.connectionState === 'disconnected' ||
                           window.webrtcStreamer.peerConnection.connectionState === 'failed' ||
                           window.webrtcStreamer.peerConnection.connectionState === 'closed') {
                    ConnectionStatus.updateConnectionStatusDebounced(AppState.currentCameraId, false);
                }
            };
        }
    },

    setupHTTPStreamFallback() {
        if (!DOMElements.streamVideo) return;
        
        console.log("Using HTTP streaming fallback");
        this.startHTTPStream();
    },

    startHTTPStream() {
        this.stopHTTPStream();
        
        if (DOMElements.streamVideo) {
            console.log(`Starting auto-refresh stream for ${AppState.currentCameraId}`);
            
            this.refreshStreamImage();
            AppState.streamRefreshInterval = setInterval(() => this.refreshStreamImage(), REFRESH_INTERVAL_MS);
        }
    },

    stopHTTPStream() {
        if (AppState.streamRefreshInterval) {
            clearInterval(AppState.streamRefreshInterval);
            AppState.streamRefreshInterval = null;
        }
        if (DOMElements.streamVideo) {
            DOMElements.streamVideo.src = '';
        }
    },

    refreshStreamImage() {
        if (!DOMElements.streamVideo) return;
        
        const timestamp = Date.now();
        const streamUrl = `${STREAMING_HTTP_URL}/api/stream/frame?camera_id=${AppState.currentCameraId}&t=${timestamp}`;
        
        DOMElements.streamVideo.src = streamUrl;
        
        DOMElements.streamVideo.onloadeddata = function() {
            AppState.errorCount = 0;
            ConnectionStatus.updateConnectionStatusDebounced(AppState.currentCameraId, true);
        };
        
        DOMElements.streamVideo.onerror = function() {
            AppState.errorCount++;
            console.error(`Stream error ${AppState.errorCount}/${MAX_ERRORS} for ${AppState.currentCameraId}`);
            ConnectionStatus.updateConnectionStatusDebounced(AppState.currentCameraId, false);
            
            if (AppState.errorCount >= MAX_ERRORS) {
                console.error('Too many stream errors, trying to recover...');
                AppState.errorCount = 0;
                CameraManager.loadCameraList();
            }
        };
    }
};

// Export
window.StreamController = StreamController;

