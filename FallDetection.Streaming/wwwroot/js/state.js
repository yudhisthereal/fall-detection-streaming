// state.js - Application state management

// Global camera state
const AppState = {
    currentCameraId: "camera_000",
    currentCameraName: "Camera 000",
    currentCameraStatus: "registered",
    isConnected: false,
    isConnectionStable: false,
    wasDisconnected: false,
    
    // Multi-camera state
    availableCameras: [],
    cameraConnectionStatus: {},
    
    // Pending registrations
    pendingRegistrations: [],
    selectedCameraId: null,
    selectedCameraIp: null,
    
    // Stream state
    streamRefreshInterval: null,
    errorCount: 0,
    
    // Timers
    connectionCheckTimer: null,
    connectionStabilityTimer: null,
    pendingConnectionUpdate: null,
    cameraStateTimer: null,
    cameraListTimer: null,
    cameraStatusTimer: null,
    flagSyncWorker: null,
    
    // Reset state
    resetCameraState() {
        this.currentCameraId = "camera_000";
        this.currentCameraName = "No Camera";
        this.currentCameraStatus = "pending";
        this.isConnected = false;
        this.isConnectionStable = false;
        this.wasDisconnected = false;
    },
    
    // Update camera info
    setCamera(cameraId, cameraName, registered = true) {
        this.currentCameraId = cameraId;
        this.currentCameraName = cameraName || cameraId;
        this.currentCameraStatus = registered ? "registered" : "pending";
    },
    
    // Clear all timers
    clearTimers() {
        if (this.connectionCheckTimer) clearTimeout(this.connectionCheckTimer);
        if (this.connectionStabilityTimer) clearTimeout(this.connectionStabilityTimer);
        if (this.pendingConnectionUpdate) clearTimeout(this.pendingConnectionUpdate);
        if (this.cameraStateTimer) clearTimeout(this.cameraStateTimer);
        if (this.cameraListTimer) clearInterval(this.cameraListTimer);
        if (this.cameraStatusTimer) clearInterval(this.cameraStatusTimer);
        if (this.flagSyncWorker) clearInterval(this.flagSyncWorker);
        if (this.streamRefreshInterval) clearInterval(this.streamRefreshInterval);
    }
};

// Export for use in other modules
window.AppState = AppState;

