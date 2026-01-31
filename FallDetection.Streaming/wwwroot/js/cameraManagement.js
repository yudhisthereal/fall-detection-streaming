// cameraManagement.js - Camera management popup functionality

const CameraManagement = {
    async showPopup() {
        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/registered`);
            if (response.ok) {
                const data = await response.json();
                const cameras = data.cameras || [];
                
                const listDiv = document.getElementById('managementList');
                listDiv.innerHTML = '<h3 style="margin-top: 0; color: var(--theme-primary);">Registered Cameras:</h3>';
                
                if (cameras.length === 0) {
                    listDiv.innerHTML += '<p style="text-align: center; color: #aaa; padding: 20px;">No registered cameras.</p>';
                } else {
                    cameras.forEach(camera => {
                        const camDiv = document.createElement('div');
                        camDiv.className = 'camera-item';
                        camDiv.style.cssText = 'background: var(--theme-surface-light); border: 1px solid var(--theme-border); border-radius: 8px; padding: 15px; margin: 10px 0;';
                        
                        const firstSeen = camera.first_seen ? new Date(camera.first_seen * 1000).toLocaleString() : 'Unknown';
                        const lastSeen = camera.last_seen ? new Date(camera.last_seen * 1000).toLocaleString() : 'Unknown';
                        
                        camDiv.innerHTML = `
                            <div class="cameraInfo">
                                <div class="camera-name">${camera.camera_name || camera.camera_id} (${camera.camera_id})</div>
                                <div class="camera-details">
                                    <span>📡 IP: ${camera.ip_address || 'Unknown'}</span>
                                    <span>⏰ First seen: ${firstSeen}</span>
                                    <span>🕐 Last seen: ${lastSeen}</span>
                                </div>
                            </div>
                            <button onclick="CameraManagement.forgetCamera('${camera.camera_id}')" class="forget-btn" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 8px 15px; font-size: 0.9em;">Forget</button>
                        `;
                        
                        listDiv.appendChild(camDiv);
                    });
                }
                
                if (DOMElements.managementPopup) {
                    DOMElements.managementPopup.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Failed to load registered cameras:', error);
            alert('Failed to load camera list');
        }
    },

    async forgetCamera(cameraId) {
        if (!confirm(`Are you sure you want to forget camera ${cameraId}? This cannot be undone.`)) {
            return;
        }
        
        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/forget`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    camera_id: cameraId
                })
            });
            
            if (response.ok) {
                alert(`✅ Camera ${cameraId} has been forgotten.`);
                
                await CameraManager.loadCameraList();
                
                // If current camera was forgotten, switch to another
                if (cameraId === AppState.currentCameraId) {
                    const cameras = await CameraManager.getAvailableCameras();
                    if (cameras.length > 0) {
                        AppState.currentCameraId = cameras[0].camera_id;
                        if (DOMElements.cameraSelect) {
                            DOMElements.cameraSelect.value = AppState.currentCameraId;
                        }
                        
                        const selectedCamera = cameras.find(cam => cam.camera_id === AppState.currentCameraId);
                        AppState.currentCameraName = selectedCamera?.camera_name || AppState.currentCameraId;
                        
                        CameraManager.switchCamera(AppState.currentCameraId);
                    } else {
                        AppState.currentCameraId = "camera_000";
                        AppState.currentCameraName = "No Camera";
                        if (DOMElements.cameraSelect) {
                            DOMElements.cameraSelect.value = "camera_000";
                        }
                    }
                }
                
                this.showPopup();
            } else {
                alert('❌ Failed to forget camera.');
            }
        } catch (error) {
            console.error('Forget camera error:', error);
            alert('❌ Error forgetting camera.');
        }
    },

    hidePopup() {
        if (DOMElements.managementPopup) {
            DOMElements.managementPopup.style.display = 'none';
        }
    }
};

// Export
window.CameraManagement = CameraManagement;

