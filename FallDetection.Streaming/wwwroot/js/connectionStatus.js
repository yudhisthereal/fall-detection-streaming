// connectionStatus.js - Connection status management with per-camera isolation

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
    // Per-camera state isolation
    cameraStates: {},
    
    // Failure/no-ping tolerance for transient network issues
    DISCONNECT_GRACE_MS: 5000,

    getCameraState(cameraId) {
        if (!this.cameraStates[cameraId]) {
            this.cameraStates[cameraId] = {
                statusUpdateInProgress: false,
                pendingConnectionState: null,
                connectionStabilityTimer: null,
                isConnectionStable: false,
                previousConnectionState: null,
                statusFailures: 0,
                failureWindowStart: null,
                lastPingSeenAt: 0,
                wasDisconnected: false,
                pollInProgress: false,
                pollGeneration: 0,
            };
        }
        return this.cameraStates[cameraId];
    },

    getCurrentCameraState() {
        return this.getCameraState(AppState.currentCameraId);
    },

    // Getter for connection stability (derived from current camera)
    get isConnectionStable() {
        const state = this.getCurrentCameraState();
        return state.isConnectionStable;
    },

    resetFailureState(cameraId) {
        const state = this.getCameraState(cameraId);
        state.statusFailures = 0;
        state.failureWindowStart = null;
    },

    updateConnectionStatusDebounced(cameraId, connected, ageSeconds = null, silent = false) {
        const state = this.getCameraState(cameraId);

        if (state.statusUpdateInProgress) {
            state.pendingConnectionState = { cameraId, connected, ageSeconds, silent };
            setTimeout(() => {
                const pending = state.pendingConnectionState;
                if (pending) {
                    state.pendingConnectionState = null;
                    this.updateConnectionStatusDebounced(pending.cameraId, pending.connected, pending.ageSeconds, pending.silent);
                }
            }, 100);
            return;
        }

        state.statusUpdateInProgress = true;
        state.pendingConnectionState = null;

        this.updateConnectionStatusImmediate(cameraId, connected, ageSeconds, silent);

        if (cameraId !== AppState.currentCameraId) {
            state.statusUpdateInProgress = false;
            return;
        }

        if (connected && !state.isConnectionStable && !state.connectionStabilityTimer) {
            this.startConnectionStabilityCheck(cameraId, true);
        } else if (!connected && !silent) {
            if (state.connectionStabilityTimer) {
                clearTimeout(state.connectionStabilityTimer);
                state.connectionStabilityTimer = null;
            }
            state.isConnectionStable = false;
        } else if (silent && connected) {
            this.updateStreamStatusUI(true, state.isConnectionStable);
        }

        state.statusUpdateInProgress = false;
    },

    updateConnectionStatusImmediate(cameraId, connected, ageSeconds = null, silent = false) {
        const state = this.getCameraState(cameraId);

        AppState.cameraConnectionStatus[cameraId] = {
            connected: connected,
            lastUpdate: new Date(),
            ageSeconds: ageSeconds
        };

        if (cameraId === AppState.currentCameraId) {
            const applyGlobalState = connected || !silent;

            if (applyGlobalState) {
                const previousState = state.previousConnectionState;

                if (previousState !== null && previousState !== connected) {
                    if (previousState === true && connected === false) {
                        LogPanel.add(
                            `❌ DISCONNECTED: Camera ${cameraId} - ${state.statusFailures} polling failures (age: ${ageSeconds}s since last ping)`,
                            'disconnect',
                            'Connection'
                        );
                    } else if (previousState === false && connected === true) {
                        LogPanel.add(
                            `✅ RECONNECTED: Camera ${cameraId} - Connection restored after ${state.statusFailures} failures`,
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

                state.previousConnectionState = connected;
                
                AppState.isConnected = connected;

                if (!connected) {
                    state.isConnectionStable = false;
                    state.wasDisconnected = true;

                    if (typeof StreamDisplay !== 'undefined' && StreamDisplay.clearForDisconnect) {
                        StreamDisplay.clearForDisconnect();
                    }
                } else {
                    state.wasDisconnected = false;
                }

                this.updateStreamStatusUI(connected, state.isConnectionStable);

                if (typeof UIControls !== 'undefined' && UIControls.updateFromFlags) {
                    UIControls.updateFromFlags({});
                }
            }
        }

        this.updateCameraInfoDisplay();
        this.updateCameraDropdownStatus(cameraId, connected);
    },

    startConnectionStabilityCheck(cameraId, shouldResetStability = true) {
        const state = this.getCameraState(cameraId);

        if (state.connectionStabilityTimer) {
            clearTimeout(state.connectionStabilityTimer);
            state.connectionStabilityTimer = null;
        }

        if (shouldResetStability) {
            this.updateStreamStatusUI(true, false);
            state.isConnectionStable = false;
        }

        const timerCameraId = cameraId;

        state.connectionStabilityTimer = setTimeout(() => {
            const timerState = this.getCameraState(timerCameraId);
            timerState.connectionStabilityTimer = null;

            const statusAtFiring = AppState.cameraConnectionStatus[timerCameraId];
            if (statusAtFiring && !statusAtFiring.connected) {
                return;
            }

            const currentCameraConnected = AppState.cameraConnectionStatus[timerCameraId]?.connected;
            const isCurrentCamera = timerCameraId === AppState.currentCameraId;

            if (isCurrentCamera && currentCameraConnected) {
                timerState.isConnectionStable = true;
                
                AppState.isConnectionStable = true;

                if (timerState.wasDisconnected) {
                    timerState.wasDisconnected = false;

                    if (typeof StreamController !== 'undefined' && StreamController.initializeStream) {
                        StreamController.initializeStream();
                    }
                }

                if (typeof EditableAreasManager !== 'undefined' && EditableAreasManager.fetchAllAreas) {
                    EditableAreasManager.fetchAllAreas().then(() => {
                        if (typeof StreamDisplay !== 'undefined' && StreamDisplay.refreshOverlay) {
                            StreamDisplay.refreshOverlay();
                        }
                    });
                }

                this.updateStreamStatusUI(true, true);
            } else if (isCurrentCamera && !currentCameraConnected) {
                timerState.isConnectionStable = false;
                
                AppState.isConnectionStable = false;
                
                this.updateStreamStatusUI(false, false);
            }
        }, shouldResetStability ? CONNECTION_STABILITY_DELAY : 0);
    },

    updateStreamStatusUI(connected, stable) {
        const statusElement = document.getElementById('streamStatus');
        if (!statusElement) return;

        statusElement.classList.remove('connected', 'stable', 'connecting', 'disconnected');

        if (!connected) {
            statusElement.classList.add('disconnected');
            statusElement.textContent = 'Disconnected';
        } else {
            statusElement.classList.add('connected', 'stable');
            statusElement.textContent = 'Connected';
        }
    },

    isConnectionStatusStable() {
        return this.getCurrentCameraState().isConnectionStable;
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
        }
    },

    updateCameraDropdownStatus(cameraId, connected) {
        if (!DOMElements.cameraSelect) return;

        if (CameraManager.isDropdownActive()) {
            console.debug('[CameraManager] Skipping status refresh - dropdown is active');
            return;
        }

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
                break;
            }
        }
    },

    async checkCameraConnection(cameraId) {
        const state = this.getCameraState(cameraId);

        if (state.pollInProgress) {
            console.debug(`[ConnectionStatus] Skipping ${cameraId} - poll already in progress`);
            return AppState.cameraConnectionStatus[cameraId]?.connected === true;
        }
        
        state.pollInProgress = true;
        const pollGeneration = ++state.pollGeneration;

        try {
            const statusResponse = await fetchWithTimeout(STREAMING_HTTP_URL + '/api/stream/camera-status?camera_id=' + cameraId, 3500);

            if (pollGeneration !== state.pollGeneration) {
                console.debug(`[ConnectionStatus] Stale response for ${cameraId}, ignoring`);
                return AppState.cameraConnectionStatus[cameraId]?.connected === true;
            }

            this.resetFailureState(cameraId);

            if (statusResponse.ok) {
                const data = await statusResponse.json();

                const now = Date.now();
                const currentlyConnected = AppState.cameraConnectionStatus[cameraId]?.connected === true;
                const reportedConnected = data.connected === true;

                if (!reportedConnected) {
                    this.updateConnectionStatusDebounced(cameraId, false, data.age_seconds, false);
                    return false;
                }

                if (reportedConnected) {
                    state.lastPingSeenAt = now;
                    const silentUpdate = state.isConnectionStable;
                    this.updateConnectionStatusDebounced(cameraId, true, data.age_seconds, silentUpdate);
                } else {
                    const noPingMsFromServer = typeof data.age_seconds === 'number' && data.age_seconds >= 0
                        ? data.age_seconds * 1000
                        : null;
                    const lastPingSeenAt = state.lastPingSeenAt || 0;
                    const noPingMsFromLocal = lastPingSeenAt > 0 ? now - lastPingSeenAt : null;
                    const effectiveNoPingMs = noPingMsFromServer ?? noPingMsFromLocal ?? Number.POSITIVE_INFINITY;
                    
                    const graceMs = this.DISCONNECT_GRACE_MS;
                    
                    const shouldRemainConnected = currentlyConnected && effectiveNoPingMs < graceMs;

                    if (shouldRemainConnected) {
                        this.updateConnectionStatusDebounced(cameraId, true, data.age_seconds, true);
                    } else {
                        this.updateConnectionStatusDebounced(cameraId, false, data.age_seconds, false);
                    }
                }
                return AppState.cameraConnectionStatus[cameraId]?.connected === true;
            }

            this.handleFetchFailure(cameraId, statusResponse.status);
            return AppState.isConnected;
        } catch (error) {
            console.warn('[ConnectionStatus] Error checking connection for ' + cameraId + ':', error.message);
            this.handleFetchFailure(cameraId, null, error.message);
            return AppState.isConnected;
        } finally {
            state.pollInProgress = false;
        }
    },

    handleFetchFailure(cameraId, httpStatus = null, errorMessage = null) {
        const state = this.getCameraState(cameraId);
        state.statusFailures = (state.statusFailures || 0) + 1;
        if (!state.failureWindowStart) {
            state.failureWindowStart = Date.now();
        }
        const failureCount = state.statusFailures;
        const failureWindowMs = Date.now() - state.failureWindowStart;

        const failureReason = httpStatus ? `HTTP ${httpStatus}` : errorMessage || 'Network/Timeout';

        LogPanel.add(
            `⚠️ Poll failure ${failureCount}: ${cameraId} - ${failureReason}`,
            'warning',
            'Connection'
        );

        const currentlyConnected = AppState.cameraConnectionStatus[cameraId]?.connected === true;
        const requiredWindowMs = this.DISCONNECT_GRACE_MS;

        if (currentlyConnected && failureWindowMs >= requiredWindowMs) {
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

            this.updateConnectionStatusDebounced(cameraId, false, null, false);
        }
    },

    forceMarkStable(cameraId) {
        const state = this.getCameraState(cameraId);
        
        if (state.connectionStabilityTimer) {
            clearTimeout(state.connectionStabilityTimer);
            state.connectionStabilityTimer = null;
        }

        if (cameraId === AppState.currentCameraId) {
            state.isConnectionStable = true;
            AppState.isConnectionStable = true; // ✅ RESTORED
            this.updateStreamStatusUI(true, true);
        }
    },

    cancelStabilityCheck(cameraId) {
        const state = this.getCameraState(cameraId);
        if (state.connectionStabilityTimer) {
            clearTimeout(state.connectionStabilityTimer);
            state.connectionStabilityTimer = null;
        }
    },

    // Helper to switch camera context when user changes cameras
    switchToCamera(cameraId) {
        // This ensures UI reflects the state of the newly selected camera
        const state = this.getCameraState(cameraId);
        const isConnected = state.previousConnectionState === true;
        const isStable = state.isConnectionStable;
        
        AppState.isConnected = isConnected;
        AppState.isConnectionStable = isStable;
        
        this.updateStreamStatusUI(isConnected, isStable);
        
        if (isConnected && !isStable && !state.connectionStabilityTimer) {
            this.startConnectionStabilityCheck(cameraId, true);
        }
        
        return { isConnected, isStable };
    }
};

// Export
window.ConnectionStatus = ConnectionStatus;
window.fetchWithTimeout = fetchWithTimeout;