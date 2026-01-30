// editableAreaDisplay.js - Canvas overlay for editable areas rendering
// Supports multiple area types: safe areas, bed areas, floor areas

const EditableAreaDisplay = {
    canvas: null,
    ctx: null,
    isInitialized: false,
    showSafeAreas: false,
    showBedAreas: false,
    showFloorAreas: false,
    animationFrameId: null,
    isPolling: false,
    cachedAreas: null, // Cache all editable areas to avoid fetching every frame

    // Area type colors and labels
    AREA_TYPE_CONFIG: {
        'safe': { strokeColor: 'hsl(120, 70%, 50%)', fillColor: 'rgba(144, 238, 144, 0.65)', label: 'Safe Area' },  // Light green fill
        'bed': { strokeColor: 'hsl(200, 70%, 50%)', fillColor: 'rgba(173, 216, 230, 0.65)', label: 'Bed Area' },    // Light blue fill
        'floor': { strokeColor: 'hsl(0, 0%, 50%)', fillColor: 'rgba(128, 128, 128, 0.65)', label: 'Floor Area' }    // Grey fill
    },

    // Initialize the static canvas for editable areas
    init() {
        if (this.isInitialized) return;

        this.canvas = document.getElementById('staticCanvas');
        if (!this.canvas) {
            console.warn('[EditableAreaDisplay] staticCanvas element not found');
            return;
        }

        this.ctx = this.canvas.getContext('2d');
        this.isInitialized = true;

        // Canvas z-index is handled by CSS, no need to set here

        // Resize canvas to match video dimensions
        this.resizeCanvas();

        console.log('[EditableAreaDisplay] Static canvas initialized');
    },

    // Resize canvas to match video dimensions
    resizeCanvas() {
        const streamImg = document.getElementById('streamImg');
        if (!streamImg || !this.canvas) return;

        // Canvas z-index is handled by CSS, no need to set here

        // Maintain 320:224 (10:7) aspect ratio
        // Calculate height based on width to maintain correct aspect ratio
        const width = streamImg.clientWidth || 1280;
        const height = Math.round(width * 7 / 10); // 320:224 = 10:7 ratio

        // Set canvas dimensions to match displayed size
        this.canvas.width = width;
        this.canvas.height = height;

        console.debug(`[EditableAreaDisplay] Static canvas resized to ${width}x${height}`);
    },

    // Clear the canvas
    clear() {
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },

    // Get the actual image source dimensions for proper coordinate mapping
    getImageDimensions() {
        const streamImg = document.getElementById('streamImg');
        if (!streamImg) {
            return { width: this.canvas.width, height: this.canvas.height };
        }

        // Use naturalWidth/naturalHeight which are available on loaded images
        // Fallback to width/height attributes if natural dimensions are not set
        const width = streamImg.naturalWidth || streamImg.width || this.canvas.width;
        const height = streamImg.naturalHeight || streamImg.height || this.canvas.height;

        return { width, height };
    },

    // Render editable areas on the static canvas
    // Filters areas based on show flags
    render(editableAreas) {
        if (!this.ctx || !this.canvas) return;

        // Always clear and re-render
        this.clear();

        if (!editableAreas || editableAreas.length === 0) {
            return;
        }

        const ctx = this.ctx;

        // Get source image dimensions
        const { width: sourceWidth, height: sourceHeight } = this.getImageDimensions();

        // Get canvas dimensions (displayed size)
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;

        // Calculate scale factors to map from source dimensions to canvas dimensions
        const scaleX = canvasWidth / sourceWidth;
        const scaleY = canvasHeight / sourceHeight;

        // Filter areas based on display flags
        const areasToRender = editableAreas.filter(area => {
            if (area.area_type === 'safe') return this.showSafeAreas;
            if (area.area_type === 'bed') return this.showBedAreas;
            if (area.area_type === 'floor') return this.showFloorAreas;
            return false;
        });

        if (areasToRender.length === 0) {
            return;
        }

        // Track counters for each area type for labeling
        const counters = { safe: 0, bed: 0, floor: 0 };

        areasToRender.forEach((area) => {
            if (!area.coordinates || area.coordinates.length < 3) return;

            const areaType = area.area_type || 'safe';
            const config = this.AREA_TYPE_CONFIG[areaType] || this.AREA_TYPE_CONFIG['safe'];
            counters[areaType]++;

            // Generate color based on area type
            const hue = config.color;
            const color = `hsl(${hue}, 70%, 50%)`;

            // Convert normalized coordinates to canvas coordinates
            const points = area.coordinates.map(point => {
                // First convert normalized (0-1) to source coordinates
                const sourceX = point[0] * sourceWidth;
                const sourceY = point[1] * sourceHeight;
                // Then scale to canvas coordinates
                const x = sourceX * scaleX;
                const y = sourceY * scaleY;
                return { x, y };
            });

            // Draw filled polygon with transparency
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();

            // Fill with 65% transparent color
            ctx.fillStyle = config.fillColor;
            ctx.fill();

            // Draw border
            ctx.strokeStyle = config.strokeColor;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw vertices
            points.forEach(point => {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            });

            // Add label
            const label = area.name || `${config.label} ${counters[areaType]}`;
            ctx.font = '12px sans-serif';
            ctx.fillStyle = config.strokeColor;
            ctx.fillText(label, points[0].x + 10, points[0].y + 20);
        });
    },

    // Start real-time continuous polling for editable areas
    startPolling() {
        if (this.isPolling) return;

        this.isPolling = true;

        // Start continuous polling loop
        this.pollLoop();

        console.log('[EditableAreaDisplay] Started real-time continuous polling');
    },

    // Continuous polling loop using requestAnimationFrame for real-time updates
    pollLoop() {
        if (!this.isPolling) return;

        // Poll for editable areas and render
        this.pollForAreas().then(() => {
            // Immediately request next frame - no delay
            this.animationFrameId = requestAnimationFrame(() => this.pollLoop());
        }).catch((error) => {
            console.error('[EditableAreaDisplay] Polling error:', error);
            // On error, still continue polling but with a small delay to avoid spam
            this.animationFrameId = requestAnimationFrame(() => this.pollLoop());
        });
    },

    // Stop polling
    stopPolling() {
        this.isPolling = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.cachedAreas = null;
        console.log('[EditableAreaDisplay] Stopped polling');
    },

    // Poll for editable areas from the server and render
    async pollForAreas() {
        if (!AppState.currentCameraId || !AppState.isConnected) {
            this.clear();
            return null;
        }

        // Check if any area type is enabled
        if (!this.showSafeAreas && !this.showBedAreas && !this.showFloorAreas) {
            this.clear();
            return null;
        }

        try {
            const editableAreas = await this.fetchAreas();
            // Always render, even if areas are empty
            this.render(editableAreas || []);
            this.cachedAreas = editableAreas;
            return editableAreas;
        } catch (error) {
            console.error('[EditableAreaDisplay] Error polling areas:', error);
            // On error, still render with cached data or empty array
            this.render(this.cachedAreas || []);
            return null;
        }
    },

    // Update display flags - called when checkboxes are toggled
    update() {
        if (!this.isInitialized) {
            this.init();
        }

        // Fetch current flags from camera state
        fetch(STREAMING_HTTP_URL + '/api/stream/camera-state?camera_id=' + AppState.currentCameraId)
            .then(response => response.json())
            .then(flags => {
                const anyEnabled = flags.show_safe_area || flags.show_bed_areas || flags.show_floor_areas;

                if (!anyEnabled) {
                    this.showSafeAreas = false;
                    this.showBedAreas = false;
                    this.showFloorAreas = false;
                    this.stopPolling();
                    this.clear();
                    console.log('[EditableAreaDisplay] All area types hidden');
                    return;
                }

                // Update display flags
                const changed = (
                    this.showSafeAreas !== flags.show_safe_area ||
                    this.showBedAreas !== flags.show_bed_areas ||
                    this.showFloorAreas !== flags.show_floor_areas
                );

                this.showSafeAreas = flags.show_safe_area || false;
                this.showBedAreas = flags.show_bed_areas || false;
                this.showFloorAreas = flags.show_floor_areas || false;

                if (changed && !this.isPolling) {
                    console.log('[EditableAreaDisplay] Area display enabled, starting continuous polling...');
                    this.startPolling();
                }
            })
            .catch(error => {
                console.error('[EditableAreaDisplay] Error updating display flags:', error);
            });
    },

    // Fetch all editable areas from server
    async fetchAreas() {
        if (!AppState.currentCameraId) {
            return [];
        }

        try {
            const response = await fetch(
                STREAMING_HTTP_URL + '/api/stream/camera-state?camera_id=' + AppState.currentCameraId
            );

            if (response.ok) {
                const state = await response.json();

                // Build editable areas array from separate endpoints
                const editableAreas = [];

                // Fetch safe areas if enabled
                if (this.showSafeAreas) {
                    const safeResponse = await fetch(
                        STREAMING_HTTP_URL + '/api/stream/safe-areas?camera_id=' + AppState.currentCameraId
                    );
                    if (safeResponse.ok) {
                        const safeAreas = await safeResponse.json();
                        safeAreas.forEach((coords, index) => {
                            editableAreas.push({
                                area_type: 'safe',
                                coordinates: coords,
                                name: `Safe Area ${index + 1}`
                            });
                        });
                    }
                }

                // Fetch bed areas if enabled
                if (this.showBedAreas) {
                    const bedResponse = await fetch(
                        STREAMING_HTTP_URL + '/api/stream/bed-areas?camera_id=' + AppState.currentCameraId
                    );
                    if (bedResponse.ok) {
                        const bedAreas = await bedResponse.json();
                        bedAreas.forEach((coords, index) => {
                            editableAreas.push({
                                area_type: 'bed',
                                coordinates: coords,
                                name: `Bed Area ${index + 1}`
                            });
                        });
                    }
                }

                // Fetch floor areas if enabled
                if (this.showFloorAreas) {
                    const floorResponse = await fetch(
                        STREAMING_HTTP_URL + '/api/stream/floor-areas?camera_id=' + AppState.currentCameraId
                    );
                    if (floorResponse.ok) {
                        const floorAreas = await floorResponse.json();
                        floorAreas.forEach((coords, index) => {
                            editableAreas.push({
                                area_type: 'floor',
                                coordinates: coords,
                                name: `Floor Area ${index + 1}`
                            });
                        });
                    }
                }

                console.log(`[EditableAreaDisplay] Loaded ${editableAreas.length} areas for ${AppState.currentCameraId}`);

                // Log successful fetch to panel
                if (window.LogPanel) {
                    LogPanel.add(
                        `✅ Fetched areas: ${editableAreas.length} total`,
                        'success',
                        'EditableAreas'
                    );
                }

                return editableAreas;
            } else {
                // Log non-OK response to panel
                if (window.LogPanel) {
                    LogPanel.add(
                        `⚠️ Fetch failed: HTTP ${response.status}`,
                        'error',
                        'EditableAreas'
                    );
                }
                return [];
            }
        } catch (error) {
            console.error('[EditableAreaDisplay] Error fetching areas:', error);

            // Log fetch error to panel
            if (window.LogPanel) {
                LogPanel.add(
                    `❌ Fetch error: ${error.message}`,
                    'error',
                    'EditableAreas'
                );
            }

            return [];
        }
    },

    // Cleanup
    destroy() {
        this.stopPolling();
        this.clear();
        this.canvas = null;
        this.ctx = null;
        this.isInitialized = false;
        this.cachedAreas = null;
        console.log('[EditableAreaDisplay] Destroyed');
    }
};

// Export for use in other modules
window.EditableAreaDisplay = EditableAreaDisplay;
