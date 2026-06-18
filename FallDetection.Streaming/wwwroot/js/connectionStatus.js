// connectionStatus.js - Connection status management with debouncing

// ============================================
// CONNECTION STATUS DEBOUNCING
// ============================================

// Fetch timeout helper using AbortController
async function fetchWithTimeout(url, ms = 3500) {
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

    // Failure/no-ping tolerance for transient network issues
    DISCONNECT_GRACE_MS: 5000,
    statusFailuresByCamera: {},
    failureWindowStartByCamera: {},
    lastPingSeenAtByCamera: {},

    // Track previous connection state for detecting transitions
    previousConnectionState: null,

    getFailureCount(cameraId) {
        return this.statusFailuresByCamera[cameraId] || 0;
    },

    resetFailureState(cameraId) {
        delete this.statusFailuresByCamera[cameraId];
        delete this.failureWindowStartByCamera[cameraId];
    },

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
        this.updateConnectionStatusImmediate(cameraId, connected, ageSeconds, silent);

        // Global stream UI and stability only follow the currently selected camera
        if (cameraId !== AppState.currentCameraId) {
            this.statusUpdateInProgress = false;
            return;
        }

        if (connected && !AppState.isConnectionStable && !AppState.connectionStabilityTimer) {
            this.startConnectionStabilityCheck(cameraId, true);
        } else if (!connected && !silent) {
            if (AppState.connectionStabilityTimer) {
                clearTimeout(AppState.connectionStabilityTimer);
                AppState.connectionStabilityTimer = null;
            }
            AppState.isConnectionStable = false;
        } else if (silent && connected) {
            this.updateStreamStatusUI(true, AppState.isConnectionStable);
        }

        this.statusUpdateInProgress = false;
    },

    updateConnectionStatusImmediate(cameraId, connected, ageSeconds = null, silent = false) {
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
            const applyGlobalState = connected || !silent;

            if (applyGlobalState) {
                const previousState = this.previousConnectionState;
                if (previousState !== null && previousState !== connected) {
                    if (previousState === true && connected === false) {
                        const failureCount = this.getFailureCount(cameraId);
                        LogPanel.add(
                            `❌ DISCONNECTED: Camera ${cameraId} - ${failureCount} polling failures (age: ${ageSeconds}s since last ping)`,
                            'disconnect',
                            'Connection'
                        );
                    } else if (previousState === false && connected === true) {
                        const failureCount = this.getFailureCount(cameraId);
                        LogPanel.add(
                            `✅ RECONNECTED: Camera ${cameraId} - Connection restored after ${failureCount} failures`,
                            'reconnect',
                            'Connection'
                        );
                    }
                } else if (previousState === null && connected === true) {
                    const cameraInfo = AppState.availableCameras.find(cam => cam.camera_id === cameraId);
                    const cameraName = cameraInfo?.camera_name || cameraId;
                    LogPanel.add(
                        `✅ INITIALLY CONNECTED: ${cameraName} - Age: ${ageSeconds}s`,
                        'success',
                        'Connection'
                    );
                }

                this.previousConnectionState = connected;
                AppState.isConnected = connected;

                if (!connected) {
                    AppState.isConnectionStable = false;
                    AppState.wasDisconnected = true;

                    if (typeof StreamDisplay !== 'undefined' && StreamDisplay.clearForDisconnect) {
                        StreamDisplay.clearForDisconnect();
                    }
                }

                this.updateStreamStatusUI(connected, AppState.isConnectionStable);

                if (typeof UIControls !== 'undefined' && UIControls.updateFromFlags) {
                    UIControls.updateFromFlags({});
                }
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

        // Update UI to "connected" FIRST
        // This ensures the UI reflects the current connection state immediately
        if (shouldResetStability) {
            // Update UI to show "connected" state immediately (no "connecting" state)
            // console.log('[ConnectionStatus] Resetting stability - showing connected state');
            this.updateStreamStatusUI(true, false);
            // Reset stability flag when starting new check
            AppState.isConnectionStable = false;
        }

        // DON'T guard clause here - trust that the caller knows what they're doing
        // The guard clause was preventing recovery from disconnected state

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

                // If camera was disconnected, reinitialize stream for better recovery
                if (AppState.wasDisconnected) {
                    // console.log('[ConnectionStatus] Camera was disconnected, reinitializing stream...');
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
                    CommandManager.fetchCameraState(timerCameraId).then(state => {
                        if (state && typeof UIControls !== 'undefined' && UIControls.updateSleepDisplay) {
                            UIControls.updateSleepDisplay(state);
                        }
                    }).catch(err => console.error('[ConnectionStatus] Error fetching state on reconnect:', err));
                }

                // Fetch editable areas once when connection is stable
                if (typeof EditableAreasManager !== 'undefined' && EditableAreasManager.fetchAllAreas) {
                    console.log('[ConnectionStatus] Fetching editable areas for stable connection');
                    EditableAreasManager.fetchAllAreas().then(() => {
                        // Refresh overlay to show areas
                        if (typeof StreamDisplay !== 'undefined' && StreamDisplay.refreshOverlay) {
                            StreamDisplay.refreshOverlay();
                        }
                    });
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
        const statusElement = document.getElementById('streamStatus');
        if (!statusElement) {
            // console.log('[ConnectionStatus] WARNING: streamStatus element not found!');
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
        // LogPanel.add('[ConnectionStatus] checkCameraConnection called for ' + cameraId, 'info', 'Connection');
        try {
            // Request to Streaming Server for camera status with timeout
            const statusResponse = await fetchWithTimeout(STREAMING_HTTP_URL + '/api/stream/camera-status?camera_id=' + cameraId, 3500);
            // console.log('[ConnectionStatus] Status response for ' + cameraId + ': ' + statusResponse.status + ' ' + statusResponse.statusText);

            // Also sync pending registrations periodically
            const pendingResponse = await fetchWithTimeout(STREAMING_HTTP_URL + '/api/stream/pending', 3500);
            // console.log('[ConnectionStatus] Pending response: ' + pendingResponse.status + ' ' + pendingResponse.statusText);

            // SUCCESS: Reset failure counter and process normally
            // if (this.statusFailures > 0) {
            //     LogPanel.add(
            //         `Camera ${cameraId} - Camera state fetch succeeded after ${this.statusFailures} transient failures`,
            //         'success',
            //         'Connection'
            //     );
            // }
            this.resetFailureState(cameraId);

            if (statusResponse.ok) {
                const data = await statusResponse.json();
                // console.log('[ConnectionStatus] Camera ' + cameraId + ' status data:', data);

                const now = Date.now();
                const currentlyConnected = AppState.cameraConnectionStatus[cameraId]?.connected === true;
                const reportedConnected = data.connected === true;

                // Immediate reconnect on any successful ping signal
                if (reportedConnected) {
                    this.lastPingSeenAtByCamera[cameraId] = now;
                    const silentUpdate = AppState.isConnectionStable;
                    this.updateConnectionStatusDebounced(cameraId, true, data.age_seconds, silentUpdate);
                } else {
                    // Tolerate temporary no-ping periods while currently connected
                    const noPingMsFromServer = typeof data.age_seconds === 'number' && data.age_seconds >= 0
                        ? data.age_seconds * 1000
                        : null;
                    const lastPingSeenAt = this.lastPingSeenAtByCamera[cameraId] || 0;
                    const noPingMsFromLocal = lastPingSeenAt > 0 ? now - lastPingSeenAt : null;
                    const effectiveNoPingMs = noPingMsFromServer ?? noPingMsFromLocal ?? Number.POSITIVE_INFINITY;
                    const shouldRemainConnected = currentlyConnected && effectiveNoPingMs < this.DISCONNECT_GRACE_MS;

                    if (shouldRemainConnected) {
                        this.updateConnectionStatusDebounced(cameraId, true, data.age_seconds, true);
                    } else {
                        this.updateConnectionStatusDebounced(cameraId, false, data.age_seconds, false);
                    }
                }

                // Update pending registrations if available
                if (pendingResponse.ok) {
                    const pendingData = await pendingResponse.json();
                    AppState.pendingRegistrations = pendingData.pending || [];
                    if (typeof DOMHelpers !== 'undefined' && DOMHelpers.updatePendingButton) {
                        DOMHelpers.updatePendingButton(AppState.pendingRegistrations.length);
                    }
                    // console.log('[ConnectionStatus] Pending registrations: ' + AppState.pendingRegistrations.length);
                }
                return AppState.cameraConnectionStatus[cameraId]?.connected === true;
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
        this.statusFailuresByCamera[cameraId] = (this.statusFailuresByCamera[cameraId] || 0) + 1;
        if (!this.failureWindowStartByCamera[cameraId]) {
            this.failureWindowStartByCamera[cameraId] = Date.now();
        }
        const failureCount = this.statusFailuresByCamera[cameraId];
        const failureWindowMs = Date.now() - this.failureWindowStartByCamera[cameraId];

        const failureReason = httpStatus ? `HTTP ${httpStatus}` : errorMessage || 'Network/Timeout';
        console.warn(`[ConnectionStatus] Fetch failure ${failureCount} for ${cameraId}: ${failureReason} (${failureWindowMs}ms in failure window)`);

        // Log each failure with details
        LogPanel.add(
            `⚠️ Poll failure ${failureCount}: ${cameraId} - ${failureReason}`,
            'warning',
            'Connection'
        );

        const currentlyConnected = AppState.cameraConnectionStatus[cameraId]?.connected === true;

        // Only mark as disconnected after continuous failures exceed grace duration
        if (currentlyConnected && failureWindowMs >= this.DISCONNECT_GRACE_MS) {
            const disconnectReason = httpStatus
                ? `Server returned HTTP ${httpStatus} for ${failureCount} consecutive polls`
                : errorMessage?.includes('timeout')
                    ? `Server timed out for ${failureCount} consecutive polls`
                    : `Network errors for ${failureCount} consecutive polls`;

            LogPanel.add(
                `❌ DISCONNECTED: ${cameraId} - ${disconnectReason}`,
                'disconnect',
                'Connection'
            );

            console.error(`[ConnectionStatus] ${cameraId}: ${failureCount} consecutive failures over ${failureWindowMs}ms - marking DISCONNECTED`);
            this.updateConnectionStatusDebounced(cameraId, false, null, false);
        } else {
            // Keep last known status, don't update UI
            console.log(`[ConnectionStatus] ${cameraId}: Tolerating failure ${failureCount} (window ${failureWindowMs}ms/${this.DISCONNECT_GRACE_MS}ms) - keeping current status`);
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