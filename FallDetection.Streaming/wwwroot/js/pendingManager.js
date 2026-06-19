const PendingManager = {
    pollInterval: null,
    POLL_INTERVAL_MS: 1000, // 1 seconds
    
    startPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        
        // Initial load
        this.loadPendingRegistrations();
        
        // Periodic polling
        this.pollInterval = setInterval(() => {
            this.loadPendingRegistrations();
        }, this.POLL_INTERVAL_MS);
        
        console.log(`[PendingManager] Started polling every ${this.POLL_INTERVAL_MS}ms`);
    },
    
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            console.log('[PendingManager] Stopped polling');
        }
    },
    
    async loadPendingRegistrations() {
        try {
            const response = await window.fetchWithTimeout(
                `${STREAMING_HTTP_URL}/api/stream/pending`,
                3000
            );
            
            if (response.ok) {
                const data = await response.json();
                AppState.pendingRegistrations = data.pending || [];
                
                // Only update UI, NOT connection status
                if (DOMHelpers.updatePendingButton) {
                    DOMHelpers.updatePendingButton(AppState.pendingRegistrations.length);
                }
                
                // Update camera dropdown to show registration status changes
                if (CameraManager.updateCameraSelect) {
                    // Refresh just the dropdown display without changing selection
                    CameraManager.refreshCameraDropdownStatus();
                }
                
                console.log(`[PendingManager] Updated: ${AppState.pendingRegistrations.length} pending`);
                return AppState.pendingRegistrations;
            }
        } catch (error) {
            console.warn('[PendingManager] Failed to load pending registrations:', error.message);
        }
        return [];
    }
};

window.PendingManager = PendingManager;