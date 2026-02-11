// editableAreasManager.js - Centralized manager for editable area operations
// Provides abstraction for fetching and managing safe areas, bed areas, and floor areas

const EditableAreasManager = {
    // Cache for area data to avoid redundant fetches
    cache: {
        safeAreas: null,
        bedAreas: null,
        floorAreas: null,
        couchAreas: null,
        benchAreas: null,
        chairAreas: null,
        cameraState: null,
        lastFetch: {
            safeAreas: 0,
            bedAreas: 0,
            floorAreas: 0,
            couchAreas: 0,
            benchAreas: 0,
            chairAreas: 0,
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
                } catch (_) { }

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

            if (window.LogPanel) {
                LogPanel.add(`Safe areas: ${JSON.stringify(safeAreas)}`, 'info', 'EditableAreas');
            }
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

                if (window.LogPanel) {
                    LogPanel.add(`Bed areas: ${JSON.stringify(bedAreas)}`, 'info', 'EditableAreas');
                }
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

                if (window.LogPanel) {
                    LogPanel.add(`Floor areas: ${JSON.stringify(floorAreas)}`, 'info', 'EditableAreas');
                }
                return floorAreas;
            }

            return this.cache.floorAreas || [];
        } catch (error) {
            console.error('[EditableAreasManager] Error fetching floor areas:', error);
            return this.cache.floorAreas || [];
        }
    },

    // Fetch couch areas for current camera
    async fetchCouchAreas(useCache = true) {

        if (!AppState.currentCameraId) {
            console.warn('[EditableAreasManager] No camera ID set');
            return [];
        }

        // Check connection status
        if (!this.isCameraConnected()) {
            return this.cache.couchAreas || [];
        }

        // Return cached data if valid
        if (useCache && this.cache.couchAreas && this.isCacheValid(this.cache.lastFetch.couchAreas)) {
            return this.cache.couchAreas;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/couch-areas?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const couchAreas = await response.json() || [];
                this.cache.couchAreas = couchAreas;
                this.cache.lastFetch.couchAreas = Date.now();

                if (window.LogPanel) {
                    LogPanel.add(`Couch areas: ${JSON.stringify(couchAreas)}`, 'info', 'EditableAreas');
                }
                return couchAreas;
            }

            return this.cache.couchAreas || [];
        } catch (error) {
            console.error('[EditableAreasManager] Error fetching couch areas:', error);
            return this.cache.couchAreas || [];
        }
    },

    // Fetch bench areas for current camera
    async fetchBenchAreas(useCache = true) {
        if (!AppState.currentCameraId) {
            console.warn('[EditableAreasManager] No camera ID set');
            return [];
        }

        // Check connection status
        if (!this.isCameraConnected()) {
            return this.cache.benchAreas || [];
        }

        // Return cached data if valid
        if (useCache && this.cache.benchAreas && this.isCacheValid(this.cache.lastFetch.benchAreas)) {
            return this.cache.benchAreas;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/bench-areas?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const benchAreas = await response.json() || [];
                this.cache.benchAreas = benchAreas;
                this.cache.lastFetch.benchAreas = Date.now();

                if (window.LogPanel) {
                    LogPanel.add(`Bench areas: ${JSON.stringify(benchAreas)}`, 'info', 'EditableAreas');
                }
                return benchAreas;
            }

            return this.cache.benchAreas || [];
        } catch (error) {
            console.error('[EditableAreasManager] Error fetching bench areas:', error);
            return this.cache.benchAreas || [];
        }
    },

    // Fetch chair areas for current camera
    async fetchChairAreas(useCache = true) {
        if (!AppState.currentCameraId) {
            console.warn('[EditableAreasManager] No camera ID set');
            return [];
        }

        // Check connection status
        if (!this.isCameraConnected()) {
            return this.cache.chairAreas || [];
        }

        // Return cached data if valid
        if (useCache && this.cache.chairAreas && this.isCacheValid(this.cache.lastFetch.chairAreas)) {
            return this.cache.chairAreas;
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/chair-areas?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const chairAreas = await response.json() || [];
                this.cache.chairAreas = chairAreas;
                this.cache.lastFetch.chairAreas = Date.now();

                if (window.LogPanel) {
                    LogPanel.add(`Chair areas: ${JSON.stringify(chairAreas)}`, 'info', 'EditableAreas');
                }
                return chairAreas;
            }

            return this.cache.chairAreas || [];
        } catch (error) {
            console.error('[EditableAreasManager] Error fetching chair areas:', error);
            return this.cache.chairAreas || [];
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

    // Fetch all areas from server and update cache
    // Always fetches all 6 area types regardless of display settings
    async fetchAllAreas() {
        if (!AppState.currentCameraId || !this.isCameraConnected()) {
            return [];
        }

        try {
            // Fetch all area types in parallel
            const [safeAreas, bedAreas, floorAreas, couchAreas, benchAreas, chairAreas] = await Promise.all([
                this.fetchSafeAreas(false),  // force fresh fetch
                this.fetchBedAreas(false),
                this.fetchFloorAreas(false),
                this.fetchCouchAreas(false),
                this.fetchBenchAreas(false),
                this.fetchChairAreas(false)
            ]);

            // Cache is already updated by individual fetch methods
            return {
                safeAreas,
                bedAreas,
                floorAreas,
                couchAreas,
                benchAreas,
                chairAreas
            };
        } catch (error) {
            console.error('[EditableAreasManager] Error in fetchAllAreas:', error);
            return {
                safeAreas: [],
                bedAreas: [],
                floorAreas: [],
                couchAreas: [],
                benchAreas: [],
                chairAreas: []
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
        if (areaType === 'couch' || areaType === null) {
            this.cache.couchAreas = null;
            this.cache.lastFetch.couchAreas = 0;
        }
        if (areaType === 'bench' || areaType === null) {
            this.cache.benchAreas = null;
            this.cache.lastFetch.benchAreas = 0;
        }
        if (areaType === 'chair' || areaType === null) {
            this.cache.chairAreas = null;
            this.cache.lastFetch.chairAreas = 0;
        }
        if (areaType === null) {
            this.cache.cameraState = null;
            this.cache.lastFetch.cameraState = 0;
        }
    },

    // Clear all cache (call on camera switch or disconnect)
    clearCache() {
        this.cache = {
            safeAreas: null,
            bedAreas: null,
            floorAreas: null,
            couchAreas: null,
            benchAreas: null,
            chairAreas: null,
            cameraState: null,
            lastFetch: {
                safeAreas: 0,
                bedAreas: 0,
                floorAreas: 0,
                couchAreas: 0,
                benchAreas: 0,
                chairAreas: 0,
                cameraState: 0
            }
        };
    }
};

// Export for use in other modules
window.EditableAreasManager = EditableAreasManager;
