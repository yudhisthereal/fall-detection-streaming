const PollingScheduler = {
    isRunning: false,
    shouldStop: false,
    POLL_INTERVAL_MS: 3000, // 3 seconds between rounds
    BATCH_SIZE: 5, // Process 5 cameras concurrently
    
    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.shouldStop = false;
        
        console.log('[PollingScheduler] Started');
        
        while (!this.shouldStop) {
            const startTime = Date.now();
            
            try {
                await this.pollAllCameras();
            } catch (error) {
                console.error('[PollingScheduler] Poll round failed:', error);
            }
            
            // Calculate sleep time
            const elapsed = Date.now() - startTime;
            const sleepTime = Math.max(0, this.POLL_INTERVAL_MS - elapsed);
            
            if (sleepTime > 0 && !this.shouldStop) {
                await new Promise(resolve => setTimeout(resolve, sleepTime));
            }
        }
        
        this.isRunning = false;
        console.log('[PollingScheduler] Stopped');
    },
    
    stop() {
        this.shouldStop = true;
    },
    
    async pollAllCameras() {
        const cameras = AppState.availableCameras.filter(cam => cam.registered);
        
        if (cameras.length === 0) {
            console.debug('[PollingScheduler] No registered cameras to poll');
            return;
        }
        
        // Process in batches to avoid browser connection limits
        for (let i = 0; i < cameras.length; i += this.BATCH_SIZE) {
            if (this.shouldStop) break;
            
            const batch = cameras.slice(i, i + this.BATCH_SIZE);
            
            await Promise.allSettled(
                batch.map(camera => 
                    ConnectionStatus.checkCameraConnection(camera.camera_id)
                )
            );
            
            // Small delay between batches
            if (i + this.BATCH_SIZE < cameras.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }
};

window.PollingScheduler = PollingScheduler;