// connectionStatus.js - Connection status management with debouncing

// ============================================
// CONNECTION STATUS DEBOUNCING
// ============================================

// Fetch timeout helper using AbortController
async function fetchWithTimeout(url, ms = 2000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ms);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${ms}ms`);
        }
        throw error;
    }
}

const ConnectionStatus = {
    // Lock to prevent conflicting status updates during rapid state changes
    statusUpdateInProgress: false,
    pendingConnectionState: null,

    // Failure tolerance for transient network issues
    statusFailures: 0,
    MAX_FAILURES: 5,

    // Track previous connection state for detecting transitions
    previousConnectionState: null,

    updateConnectionStatusDebounced(cameraId, connected, ageSeconds = null, silent = false) {
        // console.log('[ConnectionStatus] updateConnectionStatusDebounced: camera=' + cameraId + ', connected=' + connected + ', silent=' + silent + ', currentStable=' + AppState.isConnectionStable);
        
        // If a status update is already in progress, queue this update
        if (this.statusUpdateInProgress) {
            // console.log('[ConnectionStatus] Status update in progress, queuing update');
            this.pendingConnectionState = { cameraId, connected, ageSeconds, silent };
            
            // Set a timeout to process the pending update after a short delay
            setTimeout(() => {
                const pending = this.pendingConnectionState;
                if (pending) {
                    this.pendingConnectionState = null;
                    this.updateConnectionStatusDebounced(pending.cameraId, pending.connected, pending.ageSeconds, pending.silent);
                }
            }, 100);
            return;
        }
        
        // Mark that we're processing a status update
        this.statusUpdateInProgress = true;
        
        // Clear any pending update since we're processing now
        this.pendingConnectionState = null;
        
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
        
        // Release the lock
        this.statusUpdateInProgress = false;
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
            // Detect and log connection state transitions
            const previousState = this.previousConnectionState;
            if (previousState !== null && previousState !== connected) {
                if (previousState === true && connected === false) {
                    LogPanel.add(
                        `❌ DISCONNECTED: Camera ${cameraId} - ${this.statusFailures} consecutive polling failures (age: ${ageSeconds}s since last ping)`,
                        'disconnect',
                        'Connection'
                    );
                } else if (previousState === false && connected === true) {
                    LogPanel.add(
                        `✅ RECONNECTED: Camera ${cameraId} - Connection restored after ${this.statusFailures} failures`,
                        'reconnect',
                        'Connection'
                    );
                }
            } else if (previousState === null && connected === true) {
                // First time connecting - log initial connection
                const cameraInfo = AppState.availableCameras.find(cam => cam.camera_id === cameraId);
                const cameraName = cameraInfo?.camera_name || cameraId;
                LogPanel.add(
                    `✅ INITIALLY CONNECTED: ${cameraName} - Age: ${ageSeconds}s`,
                    'success',
                    'Connection'
                );
            }

            // Update previous state
            this.previousConnectionState = connected;

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
        
        // Double-check that we're still connected before starting the timer
        // This prevents starting a "connecting" timer when we're actually disconnected
        const currentStatus = AppState.cameraConnectionStatus[cameraId];
        if (currentStatus && !currentStatus.connected) {
            // console.log('[ConnectionStatus] Skipping stability check - camera is disconnected');
            return;
        }

        // Only update UI to "connected" if we're actually resetting stability
        if (shouldResetStability) {
            // Update UI to show "connected" state immediately (no "connecting" state)
            // console.log('[ConnectionStatus] Resetting stability - showing connected state');
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
            
            // Double-check connection status before updating UI
            // This prevents the timer from overriding a "Disconnected" status
            const statusAtFiring = AppState.cameraConnectionStatus[timerCameraId];
            if (statusAtFiring && !statusAtFiring.connected) {
                // console.log('[ConnectionStatus] Timer ignored - camera disconnected while waiting');
                return;
            }
            
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
        } else {
            statusElement.classList.add('connected', 'stable');
            statusElement.textContent = 'Connected';
            // console.log('[ConnectionStatus] UI updated to: Connected');
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
            // Request to Streaming Server for camera status with timeout
            const statusResponse = await fetchWithTimeout(STREAMING_HTTP_URL + '/api/stream/camera-status?camera_id=' + cameraId, 2000);
            // console.log('[ConnectionStatus] Status response for ' + cameraId + ': ' + statusResponse.status + ' ' + statusResponse.statusText);

            // Also sync pending registrations periodically
            const pendingResponse = await fetchWithTimeout(STREAMING_HTTP_URL + '/api/stream/pending', 2000);
            // console.log('[ConnectionStatus] Pending response: ' + pendingResponse.status + ' ' + pendingResponse.statusText);

            // SUCCESS: Reset failure counter and process normally
            if (this.statusFailures > 0) {
                LogPanel.add(
                    `✅ Recovered: Camera ${cameraId} - Connection restored after ${this.statusFailures} transient failures`,
                    'success',
                    'Connection'
                );
            }
            this.statusFailures = 0;

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

            // Non-OK response: treat as failure
            this.handleFetchFailure(cameraId, statusResponse.status);
            return AppState.isConnected; // Return last known state
        } catch (error) {
            // Network error or timeout: treat as failure
            console.warn('[ConnectionStatus] Error checking connection for ' + cameraId + ':', error.message);
            this.handleFetchFailure(cameraId, null, error.message);
            return AppState.isConnected; // Return last known state
        }
    },

    handleFetchFailure(cameraId, httpStatus = null, errorMessage = null) {
        this.statusFailures++;

        const failureReason = httpStatus ? `HTTP ${httpStatus}` : errorMessage || 'Network/Timeout';
        console.warn(`[ConnectionStatus] Fetch failure ${this.statusFailures}/${this.MAX_FAILURES} for ${cameraId}: ${failureReason}`);

        // Log each failure with details
        LogPanel.add(
            `⚠️ Poll failure ${this.statusFailures}/${this.MAX_FAILURES}: ${cameraId} - ${failureReason}`,
            'warning',
            'Connection'
        );

        // Only mark as disconnected after MAX_FAILURES consecutive failures
        if (this.statusFailures >= this.MAX_FAILURES) {
            const disconnectReason = httpStatus
                ? `Server returned HTTP ${httpStatus} for ${this.statusFailures} consecutive polls`
                : errorMessage?.includes('timeout')
                    ? `Server timed out for ${this.statusFailures} consecutive polls`
                    : `Network errors for ${this.statusFailures} consecutive polls`;

            LogPanel.add(
                `❌ DISCONNECTED: ${cameraId} - ${disconnectReason}`,
                'disconnect',
                'Connection'
            );

            console.error(`[ConnectionStatus] ${cameraId}: ${this.statusFailures} consecutive failures - marking DISCONNECTED`);
            this.updateConnectionStatusDebounced(cameraId, false, null, true);
            // Reset counter after marking disconnected
            this.statusFailures = 0;
        } else {
            // Keep last known status, don't update UI
            console.log(`[ConnectionStatus] ${cameraId}: Tolerating failure ${this.statusFailures}/${this.MAX_FAILURES} - keeping current status`);
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