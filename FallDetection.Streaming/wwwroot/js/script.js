// script.js - Main application entry point
// Modularized version of the original monolithic script

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    console.log(`Connected to streaming server: ${STREAMING_HTTP_URL}`);

    // Initialize all modules
    initializeApplication();
});

async function initializeApplication() {
    // Initialize SignalR
    // await SignalRManager.initialize();

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
                NotificationSystem.show('This camera is awaiting registration approval. Please approve it first.', 'warning');
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
            EditableAreaEditor.loadAreasForCamera(cameraId);
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
    await CameraManager.loadCameraList();
    console.log('Initial camera data synced');

    if (AppState.currentCameraId) {
        CommandManager.fetchCameraState(AppState.currentCameraId);
        EditableAreaEditor.loadAreasForCamera(AppState.currentCameraId);
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
    // Fire an initial explicit fetch to populate sleep settings and static state
    if (AppState.currentCameraId && AppState.isConnected) {
        CommandManager.fetchCameraState(AppState.currentCameraId).then(initialState => {
            if (initialState) UIControls.updateSleepDisplay(initialState);
        }).catch(err => console.error("Initial state fetch error:", err));
    }

    // Use recursive setTimeout instead of setInterval to prevent stacking requests
    // This ensures each request completes before the next one starts
    async function flagSyncLoop() {
        if (AppState.currentCameraId && AppState.isConnected) {
            try {
                const flags = await CommandManager.fetchCameraState(AppState.currentCameraId);
                if (flags) {
                    // Send flag update via SignalR if connected
                    // if (SignalRManager.isConnected()) {
                    //     await SignalRManager.updateFlags(flags);
                    // }
                    console.log("SIGNALR REMOVED");
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
    const CONNECTION_POLL_INTERVAL_MS = 1000;

    // Log that connection monitoring is starting
    if (window.LogPanel) {
        LogPanel.add(
            `🔄 Starting connection monitoring - Polling every ${CONNECTION_POLL_INTERVAL_MS}ms (disconnect grace: ${Math.round(ConnectionStatus.DISCONNECT_GRACE_MS / 1000)}s continuous no ping)`,
            'info',
            'Connection'
        );
    } else {
        console.log(`🔄 Starting connection monitoring - Polling every ${CONNECTION_POLL_INTERVAL_MS}ms (disconnect grace: ${Math.round(ConnectionStatus.DISCONNECT_GRACE_MS / 1000)}s continuous no ping)`)
    }

    // Sync camera list every 5 seconds
    AppState.cameraListTimer = setInterval(() => {
        CameraManager.loadCameraList();
    }, 5000);

    // Check camera connections at a moderate rate to tolerate slower networks
    AppState.cameraStatusTimer = setInterval(() => {
        AppState.availableCameras.forEach(camera => {
            ConnectionStatus.checkCameraConnection(camera.camera_id);
        });
    }, CONNECTION_POLL_INTERVAL_MS);
}

// ============================================
// CLEANUP
// ============================================

function cleanup() {
    // Stop all timers
    AppState.clearTimers();

    // Stop HTTP stream
    StreamController.stopHTTPStream();

    // Disconnect SignalR
    // SignalRManager.disconnect();
}

// ============================================
// GLOBAL EXPORTS
// ============================================

// Popup functions
window.confirmBackground = function () {
    const popupTitle = document.getElementById('popupTitle');
    const popupLoading = document.getElementById('popupLoading');
    const popupButtons = document.getElementById('popupButtons');
    const popupStatus = document.getElementById('popupStatus');

    // Record timestamp before sending command
    const startTime = Date.now();

    // Set the pending flag before sending command
    if (window.StreamDisplay) {
        window.StreamDisplay.backgroundUpdatePending = true;
    }

    // Send the command
    CommandManager.sendCommand("set_background", true);

    // Show loading state
    if (popupLoading) popupLoading.style.display = 'flex';
    if (popupButtons) popupButtons.style.display = 'none';
    if (popupTitle) popupTitle.textContent = 'Setting background...';

    // Set a timeout for the operation (15 seconds)
    const TIMEOUT_MS = 15000;
    const POLL_INTERVAL_MS = 250;
    const START_POLL_DELAY_MS = 250;

    // Start polling after initial delay
    setTimeout(() => {
        console.log('[confirmBackground] Starting to poll for background update completion');

        // Poll for background update completion
        const checkInterval = setInterval(async () => {
            const elapsed = Date.now() - startTime;

            if (elapsed >= TIMEOUT_MS) {
                // Timeout
                clearInterval(checkInterval);
                console.error('[confirmBackground] Timeout waiting for background update');
                if (popupStatus) {
                    popupStatus.textContent = 'Timeout - please try again';
                    popupStatus.style.color = '#ff9800';
                }

                setTimeout(() => {
                    DOMHelpers.hidePopup(DOMElements.popup);
                    resetBackgroundPopup();
                }, 2000);
                return;
            }

            try {
                // Check if background update is still pending on server
                const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/is-background-updating?camera_id=${AppState.currentCameraId}`);

                if (response.ok) {
                    const data = await response.json();
                    const isUpdating = data.background_update_pending === true;
                    const isAcknowledged = data.background_update_acknowledged === true;

                    console.log(`[confirmBackground] Server status - updating: ${isUpdating}, acknowledged: ${isAcknowledged}`);

                    // If not updating and acknowledged, the background is ready
                    if (!isUpdating && isAcknowledged) {
                        clearInterval(checkInterval);
                        console.log('[confirmBackground] Background update complete, fetching new background');

                        // Fetch the new background
                        if (window.StreamDisplay && window.StreamDisplay.fetchBackgroundImage) {
                            await window.StreamDisplay.fetchBackgroundImage(true, true);

                            // Success!
                            if (popupStatus) {
                                popupStatus.textContent = 'Background set successfully!';
                                popupStatus.style.color = '#28a745';
                            }

                            setTimeout(() => {
                                DOMHelpers.hidePopup(DOMElements.popup);
                                resetBackgroundPopup();
                            }, 1000);
                        }
                    }
                } else {
                    console.warn('[confirmBackground] Failed to check background update status');
                }
            } catch (error) {
                console.error('[confirmBackground] Error checking background update status:', error);
            }
        }, POLL_INTERVAL_MS);

        // Store interval for cleanup if popup is closed manually
        DOMElements.popup._checkInterval = checkInterval;
    }, START_POLL_DELAY_MS);
};

// Reset popup to initial state
function resetBackgroundPopup() {
    const popupTitle = document.getElementById('popupTitle');
    const popupLoading = document.getElementById('popupLoading');
    const popupButtons = document.getElementById('popupButtons');
    const popupStatus = document.getElementById('popupStatus');

    if (popupTitle) popupTitle.textContent = 'Set this frame as background?';
    if (popupLoading) {
        popupLoading.style.display = 'none';
        if (popupStatus) {
            popupStatus.textContent = 'Setting background...';
            popupStatus.style.color = '';
        }
    }
    if (popupButtons) popupButtons.style.display = 'block';
    if (DOMElements.popup._checkInterval) {
        clearInterval(DOMElements.popup._checkInterval);
        DOMElements.popup._checkInterval = null;
    }
};

window.hidePopup = function () {
    // Clear any pending check interval
    if (DOMElements.popup._checkInterval) {
        clearInterval(DOMElements.popup._checkInterval);
        DOMElements.popup._checkInterval = null;
    }
    // Reset popup state and hide
    resetBackgroundPopup();
    DOMHelpers.hidePopup(DOMElements.popup);
};

window.hideSafeAreaPopup = function () {
    EditableAreaEditor.hide();
};

window.hideManagementPopup = function () {
    CameraManagement.hidePopup();
};

window.hideRegistrationPopup = function () {
    CameraRegistration.hidePopup();
};

// Camera registration functions
window.approveRegistration = function () {
    CameraRegistration.approveRegistration();
};

window.backToRegistrationList = function () {
    CameraRegistration.backToList();
};

// Camera management functions
window.forgetCamera = function (cameraId) {
    CameraManagement.forgetCamera(cameraId);
};



// Utility functions
window.updateAlgorithmSelection = function (algorithmValue, updateCamera) {
    UIControls.updateAlgorithmSelection(algorithmValue, updateCamera);
};

// Legacy global functions for compatibility
window.sendCommand = function (command, value) {
    CommandManager.sendCommand(command, value);
};

window.loadCameraList = function () {
    return CameraManager.loadCameraList();
};

window.fetchCameraState = function (cameraId) {
    return CommandManager.fetchCameraState(cameraId);
};

window.validateCommand = function (command, value) {
    return CommandManager.validateCommand(command, value);
};

