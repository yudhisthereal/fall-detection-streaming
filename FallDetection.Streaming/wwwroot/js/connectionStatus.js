// connectionStatus.js - Connection status management with debouncing

// ============================================
// CONNECTION STATUS DEBOUNCING
// ============================================

const ConnectionStatus = {
    updateConnectionStatusDebounced(cameraId, connected, ageSeconds = null, silent = false) {
        // console.log('[ConnectionStatus] updateConnectionStatusDebounced: camera=' + cameraId + ', connected=' + connected + ', silent=' + silent + ', currentStable=' + AppState.isConnectionStable);
        
        // Clear any pending update
        if (AppState.pendingConnectionUpdate) {
            // console.log('[ConnectionStatus] Clearing pending connection update');
            clearTimeout(AppState.pendingConnectionUpdate);
        }
        
        // Apply the update immediately
        this.updateConnectionStatusImmediate(cameraId, connected, ageSeconds);
        
        // Check if we need to start the stability timer:
        // Only start if: connected, not stable, and NOT already in stability check
        if (connected && !AppState.isConnectionStable && !AppState.connectionStabilityTimer) {
            // console.log('[ConnectionStatus] Starting stability check: connected=true, stable=false, timer=null');
            this.startConnectionStabilityCheck(cameraId, true);
        } else if (connected && AppState.connectionStabilityTimer) {
            // console.log('[ConnectionStatus] Skipping stability start: timer already running (ID: ' + AppState.connectionStabilityTimer + ')');
            // Timer is already running - don't restart it
        } else if (connected && AppState.isConnectionStable) {
            // Already stable and connected - don't reset stability or show "connecting"
            // console.log('[ConnectionStatus] Already stable - no action needed');
        } else if (!connected) {
            // Disconnected - update UI to show disconnected state
            // console.log('[ConnectionStatus] Disconnected - updating UI to disconnected');
            
            // Clear stability timer if disconnected
            if (AppState.connectionStabilityTimer) {
                // console.log('[ConnectionStatus] Clearing stability timer on disconnect');
                clearTimeout(AppState.connectionStabilityTimer);
                AppState.connectionStabilityTimer = null;
            }
            
            this.updateStreamStatusUI(false, false);
            // Reset stability when disconnected
            AppState.isConnectionStable = false;
        } else if (silent) {
            // Silent update while connected - just ensure UI shows connected
            // console.log('[ConnectionStatus] Silent update while connected');
            this.updateStreamStatusUI(true, AppState.isConnectionStable);
        } else {
            // console.log('[ConnectionStatus] No action taken: connected=' + connected + ', stable=' + AppState.isConnectionStable);
        }
        
        // Set pending update to null (no debounce needed anymore since we apply immediately)
        AppState.pendingConnectionUpdate = null;
    },

    updateConnectionStatusImmediate(cameraId, connected, ageSeconds = null) {
        // console.log('[ConnectionStatus] updateConnectionStatusImmediate: camera=' + cameraId + ', connected=' + connected + ', age=' + ageSeconds);
        
        AppState.cameraConnectionStatus[cameraId] = {
            connected: connected,
            lastUpdate: new Date(),
            ageSeconds: ageSeconds
        };
        
        // Log current camera state
        // console.log('[ConnectionStatus] Current camera: ' + AppState.currentCameraId + ', isCurrent=' + (cameraId === AppState.currentCameraId));
        
        // Update current camera status
        if (cameraId === AppState.currentCameraId) {
            AppState.isConnected = connected;
            
            // Only update stability if we're disconnecting
            if (!connected) {
                AppState.isConnectionStable = false;
                AppState.wasDisconnected = true;
                // console.log('[ConnectionStatus] Disconnected - setting isConnectionStable=false');
            } else if (connected) {
                // Clear wasDisconnected flag when connected (will be checked in stability check)
            }
            
            // Update stream status UI with unified status display
            this.updateStreamStatusUI(connected, AppState.isConnectionStable);
            
            // Update UI controls based on connection state
            if (typeof UIControls !== 'undefined' && UIControls.updateFromFlags) {
                UIControls.updateFromFlags({});
            }
        } else {
            // console.log('[ConnectionStatus] Not current camera (' + cameraId + ' vs ' + AppState.currentCameraId + ')');
        }
        
        this.updateCameraInfoDisplay();
        this.updateCameraDropdownStatus(cameraId, connected);
    },

    startConnectionStabilityCheck(cameraId, shouldResetStability = true) {
        // console.log('[ConnectionStatus] startConnectionStabilityCheck: camera=' + cameraId + ', shouldResetStability=' + shouldResetStability);
        // console.log('[ConnectionStatus] Current stability timer: ' + (AppState.connectionStabilityTimer ? 'EXISTS' : 'null'));
        
        // Clear any existing stability check
        if (AppState.connectionStabilityTimer) {
            // console.log('[ConnectionStatus] Clearing existing stability timer');
            clearTimeout(AppState.connectionStabilityTimer);
            AppState.connectionStabilityTimer = null;
        }
        
        // Only update UI to "connecting" if we're actually resetting stability
        if (shouldResetStability) {
            // Update UI to show "connecting" state (connected but not yet stable)
            // console.log('[ConnectionStatus] Resetting stability - showing connecting state');
            this.updateStreamStatusUI(true, false);
            // Reset stability flag when starting new check
            AppState.isConnectionStable = false;
        }
        
        // console.log('[ConnectionStatus] Setting new stability timer for ' + CONNECTION_STABILITY_DELAY + 'ms');
        
        // Store camera ID for timer callback
        const timerCameraId = cameraId;
        
        // Wait and verify connection is still stable
        AppState.connectionStabilityTimer = setTimeout(() => {
            // console.log('[ConnectionStatus] Stability timer fired for camera ' + timerCameraId);
            
            // Clear the timer first
            AppState.connectionStabilityTimer = null;
            
            // Check if we're still connected to the same camera
            // Get current connection status from AppState instead of relying on parameter
            const currentCameraConnected = AppState.cameraConnectionStatus[timerCameraId]?.connected;
            const isCurrentCamera = timerCameraId === AppState.currentCameraId;
            
            // console.log('[ConnectionStatus] Timer check: timerCameraId=' + timerCameraId + ', currentCameraId=' + AppState.currentCameraId + ', isCurrentCamera=' + isCurrentCamera);
            // console.log('[ConnectionStatus] Timer check: currentCameraConnected=' + currentCameraConnected);
            
            if (isCurrentCamera && currentCameraConnected) {
                AppState.isConnectionStable = true;
                // console.log('[ConnectionStatus] SUCCESS: Connection to ' + timerCameraId + ' is now stable');
                
                // If camera was disconnected, reinitialize WebRTC for better stream recovery
                if (AppState.wasDisconnected) {
                    // console.log('[ConnectionStatus] Camera was disconnected, reinitializing WebRTC...');
                    AppState.wasDisconnected = false;
                    
                // Reinitialize stream for better recovery
                    if (typeof StreamController !== 'undefined' && StreamController.initializeStream) {
                        // console.log('[ConnectionStatus] Calling StreamController.initializeStream()');
                        StreamController.initializeStream();
                    }
                }
                
                // Fetch camera state once when connection is stable
                if (typeof CommandManager !== 'undefined' && CommandManager.fetchCameraState) {
                    // console.log('[ConnectionStatus] Fetching camera state for stable connection');
                    CommandManager.fetchCameraState(timerCameraId);
                }
                
                // Update UI to show stable connection (green)
                this.updateStreamStatusUI(true, true);
            } else if (isCurrentCamera && !currentCameraConnected) {
                // Camera disconnected during stability check
                AppState.isConnectionStable = false;
                // console.log('[ConnectionStatus] FAILED: Connection to ' + timerCameraId + ' lost during stability check');
                // console.log('[ConnectionStatus] Expected connection but got: connected=' + currentCameraConnected);
                this.updateStreamStatusUI(false, false);
            } else if (!isCurrentCamera) {
                // console.log('[ConnectionStatus] IGNORED: Timer fired for non-current camera ' + timerCameraId + ', current is ' + AppState.currentCameraId);
                // If not current camera, do nothing - stability is per current camera
            } else {
                // console.log('[ConnectionStatus] UNKNOWN STATE: isCurrentCamera=' + isCurrentCamera + ', currentCameraConnected=' + currentCameraConnected);
            }
        }, shouldResetStability ? CONNECTION_STABILITY_DELAY : 0);
        
        // console.log('[ConnectionStatus] New timer ID: ' + AppState.connectionStabilityTimer);
    },

    updateStreamStatusUI(connected, stable) {
        const statusElement = document.getElementById('stream-status');
        if (!statusElement) {
            // console.log('[ConnectionStatus] WARNING: stream-status element not found!');
            return;
        }
        
        // console.log('[ConnectionStatus] updateStreamStatusUI: connected=' + connected + ', stable=' + stable);
        
        // Remove all state classes
        statusElement.classList.remove('connected', 'stable', 'connecting', 'disconnected');
        
        if (!connected) {
            statusElement.classList.add('disconnected');
            statusElement.textContent = 'Disconnected';
            // console.log('[ConnectionStatus] UI updated to: Disconnected');
        } else if (stable) {
            statusElement.classList.add('connected', 'stable');
            statusElement.textContent = 'Connected Stable';
            // console.log('[ConnectionStatus] UI updated to: Connected Stable');
        } else {
            statusElement.classList.add('connected', 'connecting');
            statusElement.textContent = 'Connecting...';
            // console.log('[ConnectionStatus] UI updated to: Connecting...');
        }
    },

    isConnectionStatusStable() {
        // console.log('[ConnectionStatus] isConnectionStatusStable() called: ' + AppState.isConnectionStable);
        return AppState.isConnectionStable;
    },

    updateCameraInfoDisplay() {
        if (DOMElements.cameraInfoSpan) {
            const connectedCameras = AppState.availableCameras.filter(
                cam => AppState.cameraConnectionStatus[cam.camera_id]?.connected
            );
            const connectedCount = connectedCameras.length;
            const totalCount = AppState.availableCameras.length;
            
            DOMElements.cameraInfoSpan.textContent = connectedCount + '/' + totalCount + ' camera(s) connected';
            DOMElements.cameraInfoSpan.style.color = connectedCount > 0 ? '#4CAF50' : '#ff4444';
            
            // console.log('[ConnectionStatus] Camera info updated: ' + connectedCount + '/' + totalCount + ' connected');
        }
    },

    updateCameraDropdownStatus(cameraId, connected) {
        if (!DOMElements.cameraSelect) {
            // console.log('[ConnectionStatus] WARNING: cameraSelect element not found!');
            return;
        }
        
        // console.log('[ConnectionStatus] updateCameraDropdownStatus: camera=' + cameraId + ', connected=' + connected);
        
        for (let option of DOMElements.cameraSelect.options) {
            if (option.value === cameraId) {
                const timeAgo = Math.round(AppState.cameraConnectionStatus[cameraId]?.ageSeconds || 0);
                const status = connected ? '✓' : '✗';
                const statusText = connected ? 'Connected' : 'Disconnected';
                
                const optionText = option.textContent;
                const baseName = optionText.replace(/ [✓✗⚠️]$/, '');
                option.textContent = baseName + ' ' + status;
                option.title = statusText + ', ' + timeAgo + 's ago';
                option.style.color = connected ? '#4CAF50' : '#ff4444';
                // console.log('[ConnectionStatus] Dropdown updated for ' + cameraId + ': ' + status);
                break;
            }
        }
    },

    async checkCameraConnection(cameraId) {
        // console.log('[ConnectionStatus] checkCameraConnection called for ' + cameraId);
        try {
            // Request to Streaming Server for camera status
            const statusResponse = await fetch(STREAMING_HTTP_URL + '/api/stream/camera-status?camera_id=' + cameraId);
            // console.log('[ConnectionStatus] Status response for ' + cameraId + ': ' + statusResponse.status + ' ' + statusResponse.statusText);
            
            // Also sync pending registrations periodically
            const pendingResponse = await fetch(STREAMING_HTTP_URL + '/api/stream/pending');
            // console.log('[ConnectionStatus] Pending response: ' + pendingResponse.status + ' ' + pendingResponse.statusText);
            
            if (statusResponse.ok) {
                const data = await statusResponse.json();
                // console.log('[ConnectionStatus] Camera ' + cameraId + ' status data:', data);
                
                // If camera is already stable, update silently to avoid restarting timer
                const silentUpdate = AppState.isConnectionStable && data.connected;
                this.updateConnectionStatusDebounced(cameraId, data.connected, data.age_seconds, silentUpdate);
                
                // Update pending registrations if available
                if (pendingResponse.ok) {
                    const pendingData = await pendingResponse.json();
                    AppState.pendingRegistrations = pendingData.pending || [];
                    if (typeof DOMHelpers !== 'undefined' && DOMHelpers.updatePendingButton) {
                        DOMHelpers.updatePendingButton(AppState.pendingRegistrations.length);
                    }
                    // console.log('[ConnectionStatus] Pending registrations: ' + AppState.pendingRegistrations.length);
                }
                
                return data.connected;
            }
            // console.log('[ConnectionStatus] Status response not OK, marking as disconnected');
            this.updateConnectionStatusDebounced(cameraId, false);
            return false;
        } catch (error) {
            console.error('[ConnectionStatus] Error checking connection for ' + cameraId + ':', error);
            this.updateConnectionStatusDebounced(cameraId, false);
            return false;
        }
    },
    
    // New method: Force mark connection as stable (for manual override if needed)
    forceMarkStable(cameraId) {
        // console.log('[ConnectionStatus] forceMarkStable called for ' + cameraId);
        if (AppState.connectionStabilityTimer) {
            clearTimeout(AppState.connectionStabilityTimer);
            AppState.connectionStabilityTimer = null;
        }
        
        if (cameraId === AppState.currentCameraId) {
            AppState.isConnectionStable = true;
            this.updateStreamStatusUI(true, true);
            // console.log('[ConnectionStatus] Connection manually marked as stable for ' + cameraId);
        }
    },
    
    // New method: Cancel stability check
    cancelStabilityCheck() {
        if (AppState.connectionStabilityTimer) {
            // console.log('[ConnectionStatus] Cancelling stability timer ID: ' + AppState.connectionStabilityTimer);
            clearTimeout(AppState.connectionStabilityTimer);
            AppState.connectionStabilityTimer = null;
        }
    }
};

// Export
window.ConnectionStatus = ConnectionStatus;

// Log initial state
// // console.log('[ConnectionStatus] Module loaded. CONNECTION_STABILITY_DELAY=' + CONNECTION_STABILITY_DELAY);