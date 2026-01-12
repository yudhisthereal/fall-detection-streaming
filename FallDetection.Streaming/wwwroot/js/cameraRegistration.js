// cameraRegistration.js - Camera registration and management

const CameraRegistration = {
    async showPopup() {
        await CameraManager.loadPendingRegistrations();
        
        const popup = document.getElementById('registrationPopup');
        const listDiv = document.getElementById('registrationList');
        const formDiv = document.getElementById('registrationForm');
        
        listDiv.innerHTML = '<h3 style="margin-top: 0; color: var(--theme-primary);">⏳ Pending Camera Registrations:</h3>';
        
        if (AppState.pendingRegistrations.length === 0) {
            listDiv.innerHTML += '<p style="text-align: center; color: #aaa; padding: 20px;">No pending registrations.</p>';
        } else {
            AppState.pendingRegistrations.forEach(reg => {
                const regDiv = document.createElement('div');
                regDiv.className = 'registration-item';
                regDiv.style.cssText = 'background: var(--theme-surface-light); border: 1px solid var(--theme-border); border-radius: 8px; padding: 15px; margin: 10px 0; cursor: pointer; transition: all 0.2s;';
                regDiv.onmouseenter = () => regDiv.style.backgroundColor = 'rgba(var(--theme-primary-rgb, 74, 158, 255), 0.1)';
                regDiv.onmouseleave = () => regDiv.style.backgroundColor = 'var(--theme-surface-light)';
                regDiv.onclick = () => this.selectRegistration(reg.camera_id, reg.ip_address);
                
                const ageMinutes = Math.round(reg.age_seconds / 60);
                
                regDiv.innerHTML = `
                    <div style="font-weight: bold; color: white; margin-bottom: 5px;">📷 Camera ID: ${reg.camera_id || 'Generating...'}</div>
                    <div style="font-size: 14px; color: #ccc; margin-bottom: 3px;">📍 IP: ${reg.ip_address}</div>
                    <div style="font-size: 13px; color: #aaa;">⏰ Waiting: ${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''}</div>
                `;
                
                listDiv.appendChild(regDiv);
            });
        }
        
        formDiv.style.display = 'none';
        listDiv.style.display = 'block';
        if (popup) popup.style.display = 'block';
    },

    selectRegistration(cameraId, ip) {
        AppState.selectedCameraId = cameraId;
        AppState.selectedCameraIp = ip;
        
        const listDiv = document.getElementById('registrationList');
        const formDiv = document.getElementById('registrationForm');
        const ipSpan = document.getElementById('regCameraIP');
        const cameraIdSpan = document.getElementById('regCameraID');
        const nameInput = document.getElementById('cameraNameInput');
        
        if (ipSpan) ipSpan.textContent = ip;
        if (cameraIdSpan) cameraIdSpan.textContent = cameraId;
        
        const defaultName = `Camera ${cameraId ? cameraId.split('_').pop() : 'New'}`;
        if (nameInput) nameInput.value = defaultName;
        
        if (listDiv) listDiv.style.display = 'none';
        
        // Hide the registration close button when showing the form
        const closeBtn = document.getElementById('registrationCloseBtn');
        if (closeBtn) closeBtn.style.display = 'none';
        
        if (formDiv) formDiv.style.display = 'block';
    },

    async approveRegistration() {
        const nameInput = document.getElementById('cameraNameInput');
        const cameraName = nameInput ? nameInput.value.trim() : '';
        
        if (!cameraName) {
            alert('Please enter a camera name.');
            return;
        }
        
        if (!AppState.selectedCameraId || !AppState.selectedCameraIp) {
            alert('No camera selected.');
            return;
        }
        
        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    IpAddress: AppState.selectedCameraIp,
                    CameraName: cameraName
                })
            });
            
            if (response.ok) {
                // Remove from pending registrations
                AppState.pendingRegistrations = AppState.pendingRegistrations.filter(
                    reg => reg.camera_id !== AppState.selectedCameraId
                );
                DOMHelpers.updatePendingButton(AppState.pendingRegistrations.length);
                
                // Reload camera list
                await CameraManager.loadCameraList();
                
                this.hidePopup();
                
                alert(`✅ Camera registered as: ${cameraName}`);
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(`❌ Registration failed: ${errorData.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('❌ Registration error.');
        }
    },

    backToList() {
        const listDiv = document.getElementById('registrationList');
        const formDiv = document.getElementById('registrationForm');
        
        if (formDiv) formDiv.style.display = 'none';
        if (listDiv) listDiv.style.display = 'block';
        
        // Show the registration close button again when returning to list view
        const closeBtn = document.getElementById('registrationCloseBtn');
        if (closeBtn) closeBtn.style.display = 'block';
        
        const nameInput = document.getElementById('cameraNameInput');
        if (nameInput) nameInput.value = '';
        
        AppState.selectedCameraId = null;
        AppState.selectedCameraIp = null;
    },

    hidePopup() {
        const popup = document.getElementById('registrationPopup');
        if (popup) popup.style.display = 'none';
        AppState.selectedCameraId = null;
        AppState.selectedCameraIp = null;
    }
};

// Export
window.CameraRegistration = CameraRegistration;

