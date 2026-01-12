// connectionStatus.js - Connection status management with debouncing

// ============================================
// CONNECTION STATUS DEBOUNCING
// ============================================

const ConnectionStatus = {
    updateConnectionStatusDebounced(cameraId, connected, ageSeconds = null) {
        // Clear any pending update
        if (AppState.pendingConnectionUpdate) {
            clearTimeout(AppState.pendingConnectionUpdate);
        }
        
        // Store the desired update
        AppState.pendingConnectionUpdate = setTimeout(() => {
            // Apply the update
            this.updateConnectionStatusImmediate(cameraId, connected, ageSeconds);
            
            // Start stability check if connected
            if (connected) {
                this.startConnectionStabilityCheck(cameraId);
            } else {
                AppState.isConnectionStable = false;
            }
            
            AppState.pendingConnectionUpdate = null;
        }, CONNECTION_STATUS_DEBOUNCE);
    },

    updateConnectionStatusImmediate(cameraId, connected, ageSeconds = null) {
        AppState.cameraConnectionStatus[cameraId] = {
            connected: connected,
            lastUpdate: new Date(),
            ageSeconds: ageSeconds
        };
        
        // Update current camera status
        if (cameraId === AppState.currentCameraId) {
            const statusText = connected ? 'Connected' : 'Disconnected';
            
            DOMHelpers.updateStatus(
                `${AppState.currentCameraName}: ${statusText}`,
                connected
            );
            
            AppState.isConnected = connected;
            
            // Update UI controls based on connection state
            UIControls.updateFromFlags({});
        }
        
        this.updateCameraInfoDisplay();
        this.updateCameraDropdownStatus(cameraId, connected);
    },

    startConnectionStabilityCheck(cameraId) {
        // Clear any existing stability check
        if (AppState.connectionStabilityTimer) {
            clearTimeout(AppState.connectionStabilityTimer);
        }
        
        // Wait and verify connection is still stable
        AppState.connectionStabilityTimer = setTimeout(() => {
            // Check if we're still connected to the same camera
            if (cameraId === AppState.currentCameraId && AppState.isConnected) {
                AppState.isConnectionStable = true;
                console.log(`Connection to ${cameraId} is now stable`);
                
                // Update status indicator to show stable connection
                DOMHelpers.updateStatus(
                    `${AppState.currentCameraName}: ✓ Connected`,
                    true
                );
                
                if (DOMElements.statusIndicator) {
                    DOMElements.statusIndicator.className = 'status-indicator connected stable';
                }
            }
            AppState.connectionStabilityTimer = null;
        }, CONNECTION_STABILITY_DELAY);
    },

    isConnectionStatusStable() {
        return AppState.isConnectionStable;
    },

    updateCameraInfoDisplay() {
        if (DOMElements.cameraInfoSpan) {
            const connectedCameras = AppState.availableCameras.filter(
                cam => AppState.cameraConnectionStatus[cam.camera_id]?.connected
            );
            const connectedCount = connectedCameras.length;
            const totalCount = AppState.availableCameras.length;
            
            DOMElements.cameraInfoSpan.textContent = `${connectedCount}/${totalCount} camera(s) connected`;
            DOMElements.cameraInfoSpan.style.color = connectedCount > 0 ? '#4CAF50' : '#ff4444';
        }
    },

    updateCameraDropdownStatus(cameraId, connected) {
        if (!DOMElements.cameraSelect) return;
        
        for (let option of DOMElements.cameraSelect.options) {
            if (option.value === cameraId) {
                const timeAgo = Math.round(AppState.cameraConnectionStatus[cameraId]?.ageSeconds || 0);
                const status = connected ? '✓' : '✗';
                const statusText = connected ? 'Connected' : 'Disconnected';
                
                const optionText = option.textContent;
                const baseName = optionText.replace(/ [✓✗⚠️]$/, '');
                option.textContent = `${baseName} ${status}`;
                option.title = `${statusText}, ${timeAgo}s ago`;
                option.style.color = connected ? '#4CAF50' : '#ff4444';
                break;
            }
        }
    },

    async checkCameraConnection(cameraId) {
        try {
            // Request to Streaming Server for camera status
            const statusResponse = await fetch(`${STREAMING_HTTP_URL}/api/stream/camera-status?camera_id=${cameraId}`);
            
            // Also sync pending registrations periodically
            const pendingResponse = await fetch(`${STREAMING_HTTP_URL}/api/stream/pending`);
            
            if (statusResponse.ok) {
                const data = await statusResponse.json();
                this.updateConnectionStatusImmediate(cameraId, data.connected, data.age_seconds);
                
                // Update pending registrations if available
                if (pendingResponse.ok) {
                    const pendingData = await pendingResponse.json();
                    AppState.pendingRegistrations = pendingData.pending || [];
                    DOMHelpers.updatePendingButton(AppState.pendingRegistrations.length);
                }
                
                return data.connected;
            }
            this.updateConnectionStatusDebounced(cameraId, false);
            return false;
        } catch (error) {
            console.error(`Error checking connection for ${cameraId}:`, error);
            this.updateConnectionStatusDebounced(cameraId, false);
            return false;
        }
    }
};

// Export
window.ConnectionStatus = ConnectionStatus;

