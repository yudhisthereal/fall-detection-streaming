// editableAreasManager.js - Centralized manager for editable area operations
// Provides abstraction for fetching and managing safe areas, bed areas, and floor areas

const EditableAreasManager = {
    // Cache for area data to avoid redundant fetches
    cache: {
        safeAreas: null,
        bedAreas: null,
        floorAreas: null,
        cameraState: null,
        lastFetch: {
            safeAreas: 0,
            bedAreas: 0,
            floorAreas: 0,
            cameraState: 0
        }
    },

    // Cache TTL in milliseconds (5 seconds)
    CACHE_TTL: 5000,

    // Check if cached data is still valid
    isCacheValid(lastFetchTime) {
        return Date.now() - lastFetchTime < this.CACHE_TTL;
    },

    // Check if camera is connected before fetching
    isCameraConnected() {
        return AppState.cameraConnectionStatus[AppState.currentCameraId]?.connected;
    },

    // Fetch safe areas for current camera
    async fetchSafeAreas(useCache = true) {
        if (!AppState.currentCameraId) {
            console.warn('[EditableAreasManager] No camera ID set');
            return [];
        }

        // Check connection status
        if (!this.isCameraConnected()) {
            return this.cache.safeAreas || [];
        }

        // Return cached data if valid
        if (useCache && this.cache.safeAreas && this.isCacheValid(this.cache.lastFetch.safeAreas)) {
            return this.cache.safeAreas;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/safe-areas?camera_id=' + AppState.currentCameraId
            );

            if (!response.ok) {
                let bodyText = "";
                try {
                    bodyText = await response.text();
                } catch (_) {}

                console.error('[EditableAreasManager] Safe areas request failed', {
                    status: response.status,
                    statusText: response.statusText,
                    body: bodyText
                });
                return this.cache.safeAreas || [];
            }

            const safeAreas = await response.json() || [];
            this.cache.safeAreas = safeAreas;
            this.cache.lastFetch.safeAreas = Date.now();

            console.log(`[EditableAreasManager] Fetched ${safeAreas.length} safe areas`);
            return safeAreas;
        } catch (error) {
            console.error('[EditableAreasManager] Error fetching safe areas:', error);
            return this.cache.safeAreas || [];
        }
    },

    // Fetch bed areas for current camera
    async fetchBedAreas(useCache = true) {
        if (!AppState.currentCameraId) {
            console.warn('[EditableAreasManager] No camera ID set');
            return [];
        }

        // Check connection status
        if (!this.isCameraConnected()) {
            return this.cache.bedAreas || [];
        }

        // Return cached data if valid
        if (useCache && this.cache.bedAreas && this.isCacheValid(this.cache.lastFetch.bedAreas)) {
            return this.cache.bedAreas;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/bed-areas?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const bedAreas = await response.json() || [];
                this.cache.bedAreas = bedAreas;
                this.cache.lastFetch.bedAreas = Date.now();

                console.log(`[EditableAreasManager] Fetched ${bedAreas.length} bed areas`);
                return bedAreas;
            }

            return this.cache.bedAreas || [];
        } catch (error) {
            console.error('[EditableAreasManager] Error fetching bed areas:', error);
            return this.cache.bedAreas || [];
        }
    },

    // Fetch floor areas for current camera
    async fetchFloorAreas(useCache = true) {
        if (!AppState.currentCameraId) {
            console.warn('[EditableAreasManager] No camera ID set');
            return [];
        }

        // Check connection status
        if (!this.isCameraConnected()) {
            return this.cache.floorAreas || [];
        }

        // Return cached data if valid
        if (useCache && this.cache.floorAreas && this.isCacheValid(this.cache.lastFetch.floorAreas)) {
            return this.cache.floorAreas;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/floor-areas?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const floorAreas = await response.json() || [];
                this.cache.floorAreas = floorAreas;
                this.cache.lastFetch.floorAreas = Date.now();

                console.log(`[EditableAreasManager] Fetched ${floorAreas.length} floor areas`);
                return floorAreas;
            }

            return this.cache.floorAreas || [];
        } catch (error) {
            console.error('[EditableAreasManager] Error fetching floor areas:', error);
            return this.cache.floorAreas || [];
        }
    },

    // Fetch camera state (flags for showing areas)
    async fetchCameraState(useCache = true) {
        if (!AppState.currentCameraId) {
            console.warn('[EditableAreasManager] No camera ID set');
            return null;
        }

        // Check connection status
        if (!this.isCameraConnected()) {
            return this.cache.cameraState;
        }

        // Return cached data if valid
        if (useCache && this.cache.cameraState && this.isCacheValid(this.cache.lastFetch.cameraState)) {
            return this.cache.cameraState;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/camera-state?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const state = await response.json();
                this.cache.cameraState = state;
                this.cache.lastFetch.cameraState = Date.now();
                return state;
            }

            return this.cache.cameraState;
        } catch (error) {
            console.error('[EditableAreasManager] Error fetching camera state:', error);
            return this.cache.cameraState;
        }
    },

    // Fetch all areas (for editable area display)
    // Returns array of { area_type, coordinates, name }
    async fetchAllAreas(showSafeAreas, showBedAreas, showFloorAreas) {
        if (!AppState.currentCameraId || !this.isCameraConnected()) {
            return [];
        }

        const editableAreas = [];

        // Fetch safe areas if enabled
        if (showSafeAreas) {
            const safeAreas = await this.fetchSafeAreas(true);
            safeAreas.forEach((coords, index) => {
                editableAreas.push({
                    area_type: 'safe',
                    coordinates: coords,
                    name: `Safe Area ${index + 1}`
                });
            });
        }

        // Fetch bed areas if enabled
        if (showBedAreas) {
            const bedAreas = await this.fetchBedAreas(true);
            bedAreas.forEach((coords, index) => {
                editableAreas.push({
                    area_type: 'bed',
                    coordinates: coords,
                    name: `Bed Area ${index + 1}`
                });
            });
        }

        // Fetch floor areas if enabled
        if (showFloorAreas) {
            const floorAreas = await this.fetchFloorAreas(true);
            floorAreas.forEach((coords, index) => {
                editableAreas.push({
                    area_type: 'floor',
                    coordinates: coords,
                    name: `Floor Area ${index + 1}`
                });
            });
        }

        console.log(`[EditableAreasManager] Loaded ${editableAreas.length} total areas`);
        return editableAreas;
    },

    // Fetch all area types in parallel (for stream display)
    async fetchAllAreaTypes() {
        if (!AppState.currentCameraId) {
            console.warn('[EditableAreasManager] No camera ID set');
            return { safeAreas: [], bedAreas: [], floorAreas: [] };
        }

        // Check connection status
        if (!this.isCameraConnected()) {
            return {
                safeAreas: this.cache.safeAreas || [],
                bedAreas: this.cache.bedAreas || [],
                floorAreas: this.cache.floorAreas || []
            };
        }

        try {
            const [safeAreas, bedAreas, floorAreas] = await Promise.all([
                this.fetchSafeAreas(true),
                this.fetchBedAreas(true),
                this.fetchFloorAreas(true)
            ]);

            return { safeAreas, bedAreas, floorAreas };
        } catch (error) {
            console.error('[EditableAreasManager] Error fetching area types:', error);
            return {
                safeAreas: this.cache.safeAreas || [],
                bedAreas: this.cache.bedAreas || [],
                floorAreas: this.cache.floorAreas || []
            };
        }
    },

    // Invalidate cache (call after saving/deleting areas)
    invalidateCache(areaType = null) {
        if (areaType === 'safe' || areaType === null) {
            this.cache.safeAreas = null;
            this.cache.lastFetch.safeAreas = 0;
        }
        if (areaType === 'bed' || areaType === null) {
            this.cache.bedAreas = null;
            this.cache.lastFetch.bedAreas = 0;
        }
        if (areaType === 'floor' || areaType === null) {
            this.cache.floorAreas = null;
            this.cache.lastFetch.floorAreas = 0;
        }
        if (areaType === null) {
            this.cache.cameraState = null;
            this.cache.lastFetch.cameraState = 0;
        }
        console.log(`[EditableAreasManager] Cache invalidated${areaType ? ` for ${areaType}` : ''}`);
    },

    // Clear all cache (call on camera switch or disconnect)
    clearCache() {
        this.cache = {
            safeAreas: null,
            bedAreas: null,
            floorAreas: null,
            cameraState: null,
            lastFetch: {
                safeAreas: 0,
                bedAreas: 0,
                floorAreas: 0,
                cameraState: 0
            }
        };
        console.log('[EditableAreasManager] All cache cleared');
    }
};

// Export for use in other modules
window.EditableAreasManager = EditableAreasManager;
