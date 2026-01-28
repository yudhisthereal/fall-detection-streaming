// script.js - Main application entry point
// Modularized version of the original monolithic script

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log(`Connected to streaming server: ${STREAMING_HTTP_URL}`);
    
    // Initialize all modules
    initializeApplication();
});

async function initializeApplication() {
    // Initialize SignalR
    await SignalRManager.initialize();
    
    // Start flag sync worker
    startFlagSyncWorker();
    
    // Setup UI control handlers
    UIControls.setupControlHandlers();
    
    // Setup camera selection handler
    if (DOMElements.cameraSelect) {
        DOMElements.cameraSelect.onchange = () => {
            const cameraId = DOMElements.cameraSelect.value;
            const selectedOption = DOMElements.cameraSelect.options[DOMElements.cameraSelect.selectedIndex];
            
            if (selectedOption.disabled) {
                alert('This camera is awaiting registration approval. Please approve it first.');
                const previousCamera = AppState.availableCameras.find(
                    cam => cam.camera_id === cameraId && cam.registered
                );
                if (previousCamera && DOMElements.cameraSelect) {
                    DOMElements.cameraSelect.value = previousCamera.camera_id;
                }
                return;
            }
            
            console.log(`Switched to camera: ${AppState.currentCameraId}`);
            
            const cameraInfo = AppState.availableCameras.find(cam => cam.camera_id === cameraId);
            ConnectionStatus.updateConnectionStatusDebounced(
                cameraId, 
                cameraInfo?.online || false
            );
            
            if (cameraInfo) {
                AppState.currentCameraName = cameraInfo.camera_name || cameraInfo.camera_id;
                AppState.currentCameraStatus = cameraInfo.registered ? "registered" : "pending";
            }
            
            CameraManager.switchCamera(cameraId);
            SafeAreaEditor.loadSafeAreasForCamera(cameraId);
        };
    }
    
    // Setup refresh button
    if (DOMElements.refreshCamerasBtn) {
        DOMElements.refreshCamerasBtn.onclick = async () => {
            console.log("Manually refreshing camera list and status...");
            
            // Force refresh everything
            await CameraManager.loadCameraList();
            
            if (AppState.currentCameraId) {
                await ConnectionStatus.checkCameraConnection(AppState.currentCameraId);
                await CommandManager.fetchCameraState(AppState.currentCameraId);
            }
            
            console.log("Manual refresh completed");
        };
    }
    
    // Setup registration and management buttons
    if (DOMElements.pendingRegBtn) {
        DOMElements.pendingRegBtn.onclick = () => CameraRegistration.showPopup();
    }
    if (DOMElements.manageCamerasBtn) {
        DOMElements.manageCamerasBtn.onclick = () => CameraManagement.showPopup();
    }
    
    // Load initial data
    await CameraManager.syncAllCameraData();
    console.log('Initial camera data synced');
    
    if (AppState.currentCameraId) {
        CommandManager.fetchCameraState(AppState.currentCameraId);
        SafeAreaEditor.loadSafeAreasForCamera(AppState.currentCameraId);
    }
    
    // Start periodic sync timers
    startPeriodicSync();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
}

// ============================================
// FLAG SYNC WORKER
// ============================================

function startFlagSyncWorker() {
    // Use recursive setTimeout instead of setInterval to prevent stacking requests
    // This ensures each request completes before the next one starts
    async function flagSyncLoop() {
        if (AppState.currentCameraId && AppState.isConnected) {
            try {
                const flags = await CommandManager.fetchCameraState(AppState.currentCameraId);
                if (flags) {
                    // Send flag update via SignalR if connected
                    if (SignalRManager.isConnected()) {
                        await SignalRManager.updateFlags(flags);
                    }
                }
            } catch (error) {
                console.error("Flag sync error:", error);
            }
        }
        // Schedule next sync after current one completes
        AppState.flagSyncWorker = setTimeout(flagSyncLoop, 500);
    }

    // Start the loop
    AppState.flagSyncWorker = setTimeout(flagSyncLoop, 500);
}

// ============================================
// PERIODIC SYNC
// ============================================

function startPeriodicSync() {
    // Sync camera list every 15 seconds
    AppState.cameraListTimer = setInterval(() => {
        CameraManager.syncAllCameraData();
    }, 15000);
    
    // Check camera connections every 5 seconds
    AppState.cameraStatusTimer = setInterval(() => {
        AppState.availableCameras.forEach(camera => {
            ConnectionStatus.checkCameraConnection(camera.camera_id);
        });
        if (AppState.currentCameraId) {
            ConnectionStatus.checkCameraConnection(AppState.currentCameraId);
        }
    }, 5000);
}

// ============================================
// CLEANUP
// ============================================

function cleanup() {
    // Stop all timers
    AppState.clearTimers();
    
    // Stop HTTP stream
    StreamController.stopHTTPStream();
    
    // Disconnect WebRTC
    if (window.webrtcStreamer) {
        window.webrtcStreamer.disconnect();
    }
    
    // Disconnect SignalR
    SignalRManager.disconnect();
}

// ============================================
// GLOBAL EXPORTS
// ============================================

// Popup functions
window.confirmBackground = function() {
    CommandManager.sendCommand("set_background", true);
    DOMHelpers.hidePopup(DOMElements.popup);
};

window.hidePopup = function() {
    DOMHelpers.hidePopup(DOMElements.popup);
};

window.hideSafeAreaPopup = function() {
    SafeAreaEditor.hide();
};

window.hideManagementPopup = function() {
    CameraManagement.hidePopup();
};

window.hideRegistrationPopup = function() {
    CameraRegistration.hidePopup();
};

// Camera registration functions
window.approveRegistration = function() {
    CameraRegistration.approveRegistration();
};

window.backToRegistrationList = function() {
    CameraRegistration.backToList();
};

// Camera management functions
window.forgetCamera = function(cameraId) {
    CameraManagement.forgetCamera(cameraId);
};

// Algorithm info functions
window.showAlgorithmInfo = function() {
    AlgorithmInfo.show();
};

window.hideAlgorithmInfo = function() {
    AlgorithmInfo.hide();
};

// Utility functions
window.updateAlgorithmSelection = function(algorithmValue, updateCamera) {
    UIControls.updateAlgorithmSelection(algorithmValue, updateCamera);
};

// Legacy global functions for compatibility
window.sendCommand = function(command, value) {
    CommandManager.sendCommand(command, value);
};

window.loadCameraList = function() {
    return CameraManager.loadCameraList();
};

window.fetchCameraState = function(cameraId) {
    return CommandManager.fetchCameraState(cameraId);
};

window.validateCommand = function(command, value) {
    return CommandManager.validateCommand(command, value);
};

