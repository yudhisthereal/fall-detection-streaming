// cameraManager.js - Camera management operations

const CameraManager = {
    // ============================================
    // PUBLIC API
    // ============================================
    
    async loadCameraList(showLoading = true) {
        try {
            if (showLoading && DOMElements.cameraInfoSpan) {
                DOMElements.cameraInfoSpan.textContent = 'Loading cameras...';
            }

            const camerasResponse = await fetch(`${STREAMING_HTTP_URL}/api/stream/cameras`);

            if (!camerasResponse.ok) {
                throw new Error(`HTTP ${camerasResponse.status}`);
            }

            const camerasData = await camerasResponse.json();
            
            // Update metadata only - NO connection status
            AppState.availableCameras = camerasData.cameras || [];
            
            // Update UI components
            this.updateCameraSelect(AppState.availableCameras);
            this.updateCameraInfoDisplay(camerasData);
            
            console.log(`[CameraManager] Synced ${AppState.availableCameras.length} cameras`);
            return true;
            
        } catch (error) {
            console.error('[CameraManager] Failed to sync camera data:', error);
            this.showErrorState('Connection error');
            return false;
        }
    },

    /**
     * Refresh dropdown status icons without rebuilding the entire select
     * Uses current connection state from AppState.cameraConnectionStatus
     */
    refreshCameraDropdownStatus() {
        if (!DOMElements.cameraSelect) return;

        if (this.isDropdownActive()) {
            console.debug('[CameraManager] Skipping status refresh - dropdown is active');
            return;
        }

        const currentValue = DOMElements.cameraSelect.value;
        
        // Update each option based on current connection status
        for (let option of DOMElements.cameraSelect.options) {
            if (this.isSkippableOption(option)) continue;
            
            const cameraId = option.value;
            const cameraInfo = this.findCamera(cameraId);
            if (!cameraInfo) continue;
            
            const isConnected = AppState.cameraConnectionStatus[cameraId]?.connected === true;
            const ageSeconds = AppState.cameraConnectionStatus[cameraId]?.ageSeconds || cameraInfo.age_seconds || 0;
            
            this.updateOptionDisplay(option, cameraInfo.camera_name, isConnected, ageSeconds);
        }
        
        // Restore selection
        if (currentValue) {
            DOMElements.cameraSelect.value = currentValue;
        }
    },

    async fetchAndUpdateSleepDisplay(cameraId) {
        try {
            if (!cameraId || cameraId === "camera_000") return;
            
            const state = await CommandManager.fetchCameraState(cameraId);
            if (state && window.UIControls) {
                UIControls.updateSleepDisplay(state);
                console.log(`[CameraManager] Updated sleep display for ${cameraId}`);
            }
        } catch (error) {
            console.error('[CameraManager] Failed to fetch sleep display:', error);
        }
    },

    async switchCamera(cameraId) {
        const cameraInfo = this.findCamera(cameraId);
        
        // Update state
        AppState.currentCameraId = cameraId;
        AppState.currentCameraName = cameraInfo?.camera_name || cameraId;
        AppState.currentCameraStatus = cameraInfo?.registered ? "registered" : "pending";
        
        // Log the switch
        this.logCameraSwitch(cameraInfo, cameraId);
        
        // Clean up old connection
        this.cleanupOldConnection();
        
        // Initialize new stream
        StreamController.stopHTTPStream();
        StreamController.initializeStream();
        
        // Reset connection stability
        AppState.isConnectionStable = false;
        AppState.wasDisconnected = false;
        
        // Update connection status (silent to avoid UI flicker)
        const onlineState = cameraInfo?.online || false;
        ConnectionStatus.updateConnectionStatusDebounced(cameraId, onlineState, null, true);
        
        // Notify other components
        if (window.StreamDisplay) {
            window.StreamDisplay.onCameraSwitched(cameraId);
        }

        this.fetchAndUpdateSleepDisplay(cameraId);
    },

    async getAvailableCameras() {
        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/cameras`);
            if (response.ok) {
                const data = await response.json();
                return data.cameras || [];
            }
        } catch (error) {
            console.error('[CameraManager] Failed to get available cameras:', error);
        }
        return [];
    },

    // ============================================
    // UI UPDATE METHODS
    // ============================================
    
    updateCameraSelect(cameras) {
        if (!DOMElements.cameraSelect) return;

        // Don't rebuild if dropdown is active (mobile menu is open)
        if (this.isDropdownActive()) {
            console.debug('[CameraManager] Skipping rebuild - dropdown is active');
            // Just refresh statuses instead
            this.refreshCameraDropdownStatus();
            return;
        }

        const previousCameraId = AppState.currentCameraId;
        const currentValue = DOMElements.cameraSelect.value;

        console.log(`[CameraManager] Updating dropdown. Previous: ${previousCameraId}, Current selection: ${currentValue}`);

        // Rebuild the select
        DOMElements.cameraSelect.innerHTML = '<option value="" disabled>Select a camera</option>';

        if (!cameras || cameras.length === 0) {
            this.addNoCamerasOption();
            this.handleNoCamerasAvailable(previousCameraId);
            return;
        }

        // Group cameras by registration status
        const { registered, unregistered } = this.groupCamerasByStatus(cameras);

        // Add optgroups
        this.addRegisteredCameras(registered);
        this.addUnregisteredCameras(unregistered);

        // Select the appropriate camera
        const selectedCamera = this.selectAppropriateCamera(
            cameras,
            currentValue,
            registered,
            unregistered
        );

        // Update state if camera changed
        if (selectedCamera) {
            this.updateCurrentCameraState(selectedCamera);
        }

        // Handle camera switching
        this.handleCameraSwitch(previousCameraId, selectedCamera?.camera_id);
    },

    /**
     * Check if dropdown is currently active (open on mobile or focused)
     */
    isDropdownActive() {
        if (!DOMElements.cameraSelect) return false;
        
        // Check if the select has focus (works for both desktop and mobile)
        if (document.activeElement === DOMElements.cameraSelect) {
            return true;
        }
        
        // For mobile: check if the select is in the process of opening
        // The actual open state is hard to detect, but we can use a flag
        if (DOMElements.cameraSelect.dataset.active === 'true') {
            return true;
        }
        
        return false;
    },

    updateCameraInfoDisplay(camerasData) {
        if (!DOMElements.cameraInfoSpan) return;
        
        const connectedCount = camerasData.connected_count || 0;
        const totalCount = camerasData.count || AppState.availableCameras.length;
        
        DOMElements.cameraInfoSpan.textContent = `${connectedCount}/${totalCount} camera(s) connected`;
        DOMElements.cameraInfoSpan.style.color = connectedCount > 0 ? '#4CAF50' : '#ff4444';
    },

    // ============================================
    // PRIVATE HELPER METHODS
    // ============================================
    
    findCamera(cameraId) {
        return AppState.availableCameras.find(cam => cam.camera_id === cameraId);
    },

    isSkippableOption(option) {
        return !option.value || option.value === "" || option.disabled;
    },

    updateOptionDisplay(option, cameraName, isConnected, ageSeconds) {
        const statusIcon = isConnected ? '✓' : '✗';
        const statusText = isConnected ? 'Connected' : 'Disconnected';
        const timeAgo = Math.round(ageSeconds);
        
        // Remove existing status icon
        const baseName = option.textContent.replace(/ [✓✗⚠️]$/, '');
        
        option.textContent = `${baseName || cameraName} ${statusIcon}`;
        option.title = `${statusText}, ${timeAgo}s ago`;
        option.style.color = isConnected ? '#4CAF50' : '#ff4444';
    },

    groupCamerasByStatus(cameras) {
        const registered = [];
        const unregistered = [];
        
        cameras.forEach(camera => {
            if (camera.registered) {
                registered.push(camera);
            } else {
                unregistered.push(camera);
            }
        });
        
        return { registered, unregistered };
    },

    addRegisteredCameras(registeredCameras) {
        if (registeredCameras.length === 0) return;
        
        const group = document.createElement('optgroup');
        group.label = "📹 Registered Cameras";
        
        registeredCameras.forEach(camera => {
            const option = this.createCameraOption(camera, true);
            group.appendChild(option);
        });
        
        DOMElements.cameraSelect.appendChild(group);
    },

    addUnregisteredCameras(unregisteredCameras) {
        if (unregisteredCameras.length === 0) return;
        
        const group = document.createElement('optgroup');
        group.label = "⏳ Pending Registration";
        
        unregisteredCameras.forEach(camera => {
            const option = this.createCameraOption(camera, false);
            group.appendChild(option);
        });
        
        DOMElements.cameraSelect.appendChild(group);
    },

    createCameraOption(camera, isRegistered) {
        const option = document.createElement('option');
        option.value = camera.camera_id;
        
        const isConnected = isRegistered && camera.online;
        const statusIcon = isRegistered ? (isConnected ? '✓' : '✗') : '⚠️';
        const statusText = isRegistered ? (isConnected ? 'Connected' : 'Disconnected') : 'Awaiting approval';
        const timeAgo = Math.round(camera.age_seconds || 0);
        
        option.textContent = `${camera.camera_name} ${statusIcon}`;
        option.title = `${statusText}, ${timeAgo}s ago`;
        option.style.color = isRegistered ? (isConnected ? '#4CAF50' : '#ff4444') : '#FF9800';
        
        if (!isRegistered) {
            option.disabled = true;
        }
        
        return option;
    },

    selectAppropriateCamera(cameras, currentValue, registered, unregistered) {
        // Try to keep current selection if still valid
        if (currentValue && cameras.some(cam => cam.camera_id === currentValue)) {
            DOMElements.cameraSelect.value = currentValue;
            return this.findCamera(currentValue);
        }
        
        // Prefer registered cameras
        if (registered.length > 0) {
            DOMElements.cameraSelect.value = registered[0].camera_id;
            return registered[0];
        }
        
        // Fallback to unregistered
        if (unregistered.length > 0) {
            DOMElements.cameraSelect.value = unregistered[0].camera_id;
            return unregistered[0];
        }
        
        return null;
    },

    updateCurrentCameraState(camera) {
        AppState.currentCameraId = camera.camera_id;
        AppState.currentCameraName = camera.camera_name || camera.camera_id;
        AppState.currentCameraStatus = camera.registered ? "registered" : "pending";
        this.fetchAndUpdateSleepDisplay(camera.camera_id);
    },

    handleCameraSwitch(previousCameraId, newCameraId) {
        if (!newCameraId || newCameraId === "camera_000") return;
        
        if (previousCameraId !== newCameraId) {
            console.log(`[CameraManager] Camera changed from ${previousCameraId} to ${newCameraId}. Starting stream.`);
            this.switchCamera(newCameraId);
        } else {
            console.log(`[CameraManager] Camera unchanged (${newCameraId}).`);
        }
    },

    addNoCamerasOption() {
        const option = document.createElement('option');
        option.value = "camera_000";
        option.textContent = "No cameras available";
        DOMElements.cameraSelect.appendChild(option);
        DOMElements.cameraSelect.value = "camera_000";
    },

    handleNoCamerasAvailable(previousCameraId) {
        if (previousCameraId && previousCameraId !== "camera_000") {
            console.log('[CameraManager] No cameras available. Stopping stream.');
            AppState.currentCameraId = "camera_000";
            AppState.currentCameraName = "No Camera";
            StreamController.stopHTTPStream();
        }
    },

    showErrorState(message) {
        if (DOMElements.cameraInfoSpan) {
            DOMElements.cameraInfoSpan.textContent = message;
            DOMElements.cameraInfoSpan.style.color = '#ff4444';
        }
    },

    logCameraSwitch(cameraInfo, cameraId) {
        if (!window.LogPanel) return;
        
        const connectionStatus = cameraInfo?.online ? 'Connected' : 'Disconnected';
        const cameraName = cameraInfo?.camera_name || cameraId;
        
        LogPanel.add(
            `📷 Switched to ${cameraName} (${connectionStatus})`,
            'info',
            'Connection'
        );
    },

    cleanupOldConnection() {
        // Reset WebRTC if present
        if (window.peerConnection) {
            window.peerConnection.close();
            window.peerConnection = null;
        }
    }
};

// Export
window.CameraManager = CameraManager;