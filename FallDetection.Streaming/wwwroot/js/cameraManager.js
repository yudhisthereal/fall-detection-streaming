// cameraManager.js - Camera management operations

const CameraManager = {
    async syncAllCameraData(showLoading = true) {
        try {
            if (showLoading && DOMElements.cameraInfoSpan) {
                DOMElements.cameraInfoSpan.textContent = 'Loading cameras...';
            }
            
            // Load cameras and pending registrations simultaneously
            const [camerasResponse, pendingResponse] = await Promise.all([
                fetch(`${STREAMING_HTTP_URL}/api/stream/cameras`),
                fetch(`${STREAMING_HTTP_URL}/api/stream/pending`)
            ]);
            
            if (camerasResponse.ok && pendingResponse.ok) {
                const camerasData = await camerasResponse.json();
                const pendingData = await pendingResponse.json();
                
                // Update available cameras
                AppState.availableCameras = camerasData.cameras || [];
                
                // Update pending registrations
                AppState.pendingRegistrations = pendingData.pending || [];
                console.log(`Synced pending registrations: ${AppState.pendingRegistrations.length}`);
                
                this.updateCameraSelect(AppState.availableCameras);
                
                if (DOMElements.cameraInfoSpan) {
                    const connectedCount = camerasData.connected_count || 0;
                    DOMElements.cameraInfoSpan.textContent = `${connectedCount}/${camerasData.count} camera(s) connected`;
                    DOMElements.cameraInfoSpan.style.color = connectedCount > 0 ? '#4CAF50' : '#ff4444';
                }
                
                // Update connection status for all cameras
                AppState.availableCameras.forEach(camera => {
                    ConnectionStatus.updateConnectionStatusDebounced(
                        camera.camera_id, 
                        camera.online, 
                        camera.age_seconds
                    );
                });
                
                // Update registration button
                DOMHelpers.updatePendingButton(AppState.pendingRegistrations.length);
                
                console.log(`Synced: ${AppState.availableCameras.length} cameras, ${AppState.pendingRegistrations.length} pending`);
                return true;
            } else {
                throw new Error(`HTTP error: cameras=${camerasResponse.status}, pending=${pendingResponse.status}`);
            }
        } catch (error) {
            console.error('Failed to sync camera data:', error);
            if (DOMElements.cameraInfoSpan) {
                DOMElements.cameraInfoSpan.textContent = 'Connection error';
                DOMElements.cameraInfoSpan.style.color = '#ff4444';
            }
            return false;
        }
    },

    // Alias for backward compatibility (optional)
    async loadCameraList() {
        return this.syncAllCameraData(true);
    },

    async loadPendingRegistrations() {
        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/pending`);
            if (response.ok) {
                const data = await response.json();
                AppState.pendingRegistrations = data.pending || [];
                console.log(`Loaded ${AppState.pendingRegistrations.length} pending registrations:`, AppState.pendingRegistrations);
                DOMHelpers.updatePendingButton(AppState.pendingRegistrations.length);
                return AppState.pendingRegistrations;
            } else {
                console.error(`Failed to load pending registrations: HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Failed to load pending registrations:', error);
        }
        return [];
    },

    updateCameraSelect(cameras) {
        if (!DOMElements.cameraSelect) return;
        
        const currentValue = DOMElements.cameraSelect.value;
        const previousCameraId = AppState.currentCameraId;
        
        console.log(`Updating camera list. Previous camera: ${previousCameraId}, Current selection: ${currentValue}`);
        
        DOMElements.cameraSelect.innerHTML = '<option value="" disabled>Select a camera</option>';
        
        if (!cameras || cameras.length === 0) {
            const option = document.createElement('option');
            option.value = "camera_000";
            option.textContent = "No cameras available";
            DOMElements.cameraSelect.appendChild(option);
            DOMElements.cameraSelect.value = "camera_000";
            
            if (previousCameraId && previousCameraId !== "camera_000") {
                console.log(`No cameras available now, was on ${previousCameraId}. Stopping stream.`);
                AppState.currentCameraId = "camera_000";
                AppState.currentCameraName = "No Camera";
                StreamController.stopHTTPStream();
            }
            return;
        }
        
        // Separate registered and unregistered cameras
        const registeredCameras = [];
        const unregisteredCameras = [];
        
        cameras.forEach(camera => {
            if (camera.registered) {
                registeredCameras.push(camera);
            } else {
                unregisteredCameras.push(camera);
            }
        });
        
        // Add registered cameras first
        if (registeredCameras.length > 0) {
            const group = document.createElement('optgroup');
            group.label = "📹 Registered Cameras";
            registeredCameras.forEach(camera => {
                const option = document.createElement('option');
                option.value = camera.camera_id;
                
                const timeAgo = Math.round(camera.age_seconds || 0);
                const status = camera.online ? '✓' : '✗';
                const statusText = camera.online ? 'Connected' : 'Disconnected';
                
                option.textContent = `${camera.camera_name} ${status}`;
                option.title = `${statusText}, ${timeAgo}s ago`;
                option.style.color = camera.online ? '#4CAF50' : '#ff4444';
                
                group.appendChild(option);
            });
            DOMElements.cameraSelect.appendChild(group);
        }
        
        // Add unregistered cameras
        if (unregisteredCameras.length > 0) {
            const group = document.createElement('optgroup');
            group.label = "⏳ Pending Registration";
            unregisteredCameras.forEach(camera => {
                const option = document.createElement('option');
                option.value = camera.camera_id;
                
                const timeAgo = Math.round(camera.age_seconds || 0);
                const status = camera.online ? '⚠️' : '✗';
                
                option.textContent = `${camera.camera_name} ${status}`;
                option.title = `Awaiting approval, ${timeAgo}s ago`;
                option.style.color = '#FF9800';
                option.disabled = true;
                
                group.appendChild(option);
            });
            DOMElements.cameraSelect.appendChild(group);
        }
        
        // Determine new camera ID
        let newCameraId = currentValue;
        let selectedCamera = null;
        
        if (currentValue && cameras.some(cam => cam.camera_id === currentValue)) {
            DOMElements.cameraSelect.value = currentValue;
            newCameraId = currentValue;
            selectedCamera = cameras.find(cam => cam.camera_id === currentValue);
        } else if (registeredCameras.length > 0) {
            DOMElements.cameraSelect.value = registeredCameras[0].camera_id;
            newCameraId = registeredCameras[0].camera_id;
            selectedCamera = registeredCameras[0];
        } else if (unregisteredCameras.length > 0) {
            DOMElements.cameraSelect.value = unregisteredCameras[0].camera_id;
            newCameraId = unregisteredCameras[0].camera_id;
            selectedCamera = unregisteredCameras[0];
        }
        
        // Update camera info
        if (selectedCamera) {
            AppState.currentCameraId = newCameraId;
            AppState.currentCameraName = selectedCamera.camera_name || selectedCamera.camera_id;
            AppState.currentCameraStatus = selectedCamera.registered ? "registered" : "pending";
            ConnectionStatus.updateConnectionStatusDebounced(
                AppState.currentCameraId, 
                selectedCamera.online, 
                selectedCamera.age_seconds
            );
        }
        
        // Only start stream if camera actually changed
        if (previousCameraId !== newCameraId && newCameraId && newCameraId !== "camera_000") {
            console.log(`Camera changed from ${previousCameraId} to ${newCameraId}. Starting stream.`);
            this.switchCamera(newCameraId);
        } else if (newCameraId && newCameraId !== "camera_000") {
            console.log(`Camera unchanged (${newCameraId}).`);
        }
    },

    async switchCamera(cameraId) {
        AppState.currentCameraId = cameraId;
        const cameraInfo = AppState.availableCameras.find(cam => cam.camera_id === cameraId);
        if (cameraInfo) {
            AppState.currentCameraName = cameraInfo.camera_name || cameraInfo.camera_id;
            AppState.currentCameraStatus = cameraInfo.registered ? "registered" : "pending";
        }
        
        // Update SignalR group
        if (SignalRManager.connection) {
            try {
                await SignalRManager.leaveCameraStream(AppState.currentCameraId);
                await SignalRManager.joinCameraStream(cameraId);
            } catch (err) {
                console.error("SignalR group switch error:", err);
            }
        }
        
        // Reset WebRTC for new camera
        if (window.peerConnection) {
            window.peerConnection.close();
            window.peerConnection = null;
        }
        
        // Clear ICE candidates queue for new camera
        SignalRManager.iceCandidatesQueue = [];
        
        StreamController.stopHTTPStream();
        
        // Try WebRTC first, fallback to HTTP
        try {
            await StreamController.initializeWebRTC();
        } catch (err) {
            console.error("Failed to initialize WebRTC:", err);
            StreamController.startHTTPStream();
        }
        
        // Reset connection stability for new camera
        AppState.isConnectionStable = false;
        ConnectionStatus.updateConnectionStatusDebounced(cameraId, true);
    },

    async getAvailableCameras() {
        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/cameras`);
            if (response.ok) {
                const data = await response.json();
                return data.cameras || [];
            }
        } catch (error) {
            console.error('Failed to get available cameras:', error);
        }
        return [];
    }
};

// Export
window.CameraManager = CameraManager;