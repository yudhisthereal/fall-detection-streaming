// editableAreaEditor.js - Editable Area Editor functionality
// Supports multiple area types: safe areas, bed areas, floor areas

const EditableAreaEditor = {
    // Track previous show_raw state for restore on popup close
    prevShowRaw: null,
    // Current area type being edited
    currentAreaType: 'safe',

    async loadAreasForCamera(cameraId) {
        try {
            // Fetch all area types
            const [safeResponse, bedResponse, floorResponse] = await Promise.all([
                fetch(`${STREAMING_HTTP_URL}/api/stream/safe-areas?camera_id=${cameraId}`),
                fetch(`${STREAMING_HTTP_URL}/api/stream/bed-areas?camera_id=${cameraId}`),
                fetch(`${STREAMING_HTTP_URL}/api/stream/floor-areas?camera_id=${cameraId}`)
            ]);

            const editableAreas = [];

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

            console.log(`Loaded ${editableAreas.length} editable areas for ${cameraId}`);
            return editableAreas;
        } catch (error) {
            console.error(`Failed to load editable areas for ${cameraId}:`, error);
            return [];
        }
    },

    // Helper function to get dimensions from IMG element (not VIDEO)
    getImageDimensions(imgElement) {
        // Use naturalWidth/naturalHeight which are available on loaded images
        // Fallback to width/height attributes if natural dimensions are not set
        const width = imgElement.naturalWidth || imgElement.width || 320;
        const height = imgElement.naturalHeight || imgElement.height || 240;
        return { width, height };
    },

    // Helper to capture current frame from the stream IMG element
    captureCurrentFrame() {
        const imgElement = DOMElements.streamBackgroundImg;
        if (!imgElement) {
            throw new Error('Stream video element not found');
        }

        const { width, height } = EditableAreaEditor.getImageDimensions(imgElement);

        if (width === 0 || height === 0) {
            throw new Error('Stream image dimensions are zero - image may not be loaded');
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElement, 0, 0, width, height);

        return canvas.toDataURL('image/jpeg');
    },

    async show() {
        if (!AppState.isConnected) {
            alert('Camera is disconnected. Cannot edit editable areas.');
            return;
        }

        try {
            // Load existing editable areas
            const loadedAreas = await EditableAreaEditor.loadAreasForCamera(AppState.currentCameraId);
            window.safeAreas = loadedAreas;

            // Save current show_raw state
            EditableAreaEditor.prevShowRaw = DOMElements.toggleRaw ? DOMElements.toggleRaw.checked : false;

            // If show_raw is currently true, send command to set it to false
            if (EditableAreaEditor.prevShowRaw) {
                console.log('Temporarily disabling show_raw for editable area editing...');
                await CommandManager.sendCommand("toggle_raw", false);

                // Wait a bit for the frame to update with background visible
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Take snapshot from IMG element (not VIDEO)
            const frameDataUrl = EditableAreaEditor.captureCurrentFrame();

            backgroundImage = new Image();
            backgroundImage.onload = () => {
                EditableAreaEditor.initializeCanvas();
                DOMHelpers.showPopup(DOMElements.safeAreaPopup);
                isEditing = true;
                EditableAreaEditor.drawAreas();

                // Set initial area type selection
                EditableAreaEditor.updateAreaTypeSelector();
            };
            backgroundImage.onerror = () => {
                alert('Failed to load background image');
                // Restore show_raw on error
                if (EditableAreaEditor.prevShowRaw) {
                    CommandManager.sendCommand("toggle_raw", true);
                    EditableAreaEditor.prevShowRaw = null;
                }
            };

            // Set background from captured frame
            backgroundImage.src = frameDataUrl;

        } catch (error) {
            console.error('Error showing editable area editor:', error);
            alert('Failed to open editable area editor: ' + error.message);

            // Restore show_raw on error
            if (EditableAreaEditor.prevShowRaw !== null && EditableAreaEditor.prevShowRaw !== undefined) {
                CommandManager.sendCommand("toggle_raw", true);
                EditableAreaEditor.prevShowRaw = null;
            }
        }
    },

    initializeCanvas() {
        if (!backgroundImage) return;

        originalImageWidth = backgroundImage.width;
        originalImageHeight = backgroundImage.height;

        DOMElements.safeAreaCanvas.width = originalImageWidth;
        DOMElements.safeAreaCanvas.height = originalImageHeight;

        canvasContext = DOMElements.safeAreaCanvas.getContext('2d');

        DOMElements.safeAreaCanvas.addEventListener('click', (e) => EditableAreaEditor.handleCanvasClick(e));
        DOMElements.safeAreaCanvas.addEventListener('mousemove', (e) => EditableAreaEditor.handleCanvasMouseMove(e));
        DOMElements.safeAreaCanvas.addEventListener('contextmenu', (e) => EditableAreaEditor.handleCanvasRightClick(e));

        if (DOMElements.newPolygonBtn) DOMElements.newPolygonBtn.onclick = () => EditableAreaEditor.startNewPolygon();
        if (DOMElements.clearAllBtn) DOMElements.clearAllBtn.onclick = () => EditableAreaEditor.clearAllPolygons();
        if (DOMElements.saveSafeAreasBtn) DOMElements.saveSafeAreasBtn.onclick = () => EditableAreaEditor.saveAreas();
    },

    updateAreaTypeSelector() {
        // Check if area type selector already exists
        let selector = document.getElementById('areaTypeSelector');
        if (!selector) {
            // Create the area type selector
            const toolbar = document.getElementById('safeAreaToolbar');
            if (toolbar) {
                const label = document.createElement('label');
                label.textContent = 'Area Type:';
                label.style.fontSize = '0.9em';
                label.style.marginRight = '5px';

                selector = document.createElement('select');
                selector.id = 'areaTypeSelector';
                selector.style.padding = '5px';
                selector.style.marginRight = '10px';
                selector.style.borderRadius = '5px';
                selector.style.border = '2px solid var(--theme-primary)';

                const options = [
                    { value: 'safe', label: '🛡️ Safe Area' },
                    { value: 'bed', label: '🛏️ Bed Area' },
                    { value: 'floor', label: '🏠 Floor Area' }
                ];

                options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.label;
                    selector.appendChild(option);
                });

                selector.onchange = (e) => {
                    EditableAreaEditor.currentAreaType = e.target.value;
                    console.log(`Area type changed to: ${EditableAreaEditor.currentAreaType}`);
                };

                // Insert before the first button
                toolbar.insertBefore(label, toolbar.firstChild);
                toolbar.insertBefore(selector, toolbar.firstChild);
            }
        }
    },

    getCanvasCoordinates(event) {
        const canvas = DOMElements.safeAreaCanvas;
        const rect = canvas.getBoundingClientRect();

        // Mouse position inside displayed canvas
        const displayX = event.clientX - rect.left;
        const displayY = event.clientY - rect.top;

        // Scale from display size → internal canvas size
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: Math.floor(displayX * scaleX),
            y: Math.floor(displayY * scaleY)
        };
    },

    handleCanvasClick(event) {
        if (!isEditing) return;

        const { x, y } = EditableAreaEditor.getCanvasCoordinates(event);
        const normalizedX = x / originalImageWidth;
        const normalizedY = y / originalImageHeight;

        if (currentPolygon.length >= 3) {
            const firstPoint = currentPolygon[0];
            const distance = Math.sqrt(
                Math.pow(normalizedX - firstPoint[0], 2) +
                Math.pow(normalizedY - firstPoint[1], 2)
            );

            if (distance < 0.05) {
                EditableAreaEditor.finishCurrentPolygon();
                return;
            }
        }

        currentPolygon.push([normalizedX, normalizedY]);
        EditableAreaEditor.drawAreas();
    },

    handleCanvasMouseMove(event) {
        if (!isEditing || currentPolygon.length === 0) return;

        const { x, y } = EditableAreaEditor.getCanvasCoordinates(event);
        const normalizedX = x / originalImageWidth;
        const normalizedY = y / originalImageHeight;

        EditableAreaEditor.drawAreas([...currentPolygon, [normalizedX, normalizedY]]);
    },

    handleCanvasRightClick(event) {
        event.preventDefault();
        if (!isEditing || currentPolygon.length === 0) return;

        currentPolygon.pop();
        EditableAreaEditor.drawAreas();
    },

    startNewPolygon() {
        if (currentPolygon.length >= 3) {
            EditableAreaEditor.finishCurrentPolygon();
        }
        currentPolygon = [];
        EditableAreaEditor.drawAreas();
    },

    finishCurrentPolygon() {
        if (currentPolygon.length >= 3) {
            // Create area object with current area type
            const area = {
                area_type: EditableAreaEditor.currentAreaType,
                coordinates: [...currentPolygon],
                name: `${EditableAreaEditor.getAreaLabel(EditableAreaEditor.currentAreaType)} ${EditableAreaEditor.getAreaCount(EditableAreaEditor.currentAreaType) + 1}`
            };
            window.safeAreas.push(area);
            currentPolygon = [];
            EditableAreaEditor.drawAreas();
        }
    },

    getAreaLabel(areaType) {
        const labels = {
            'safe': 'Safe Area',
            'bed': 'Bed Area',
            'floor': 'Floor Area'
        };
        return labels[areaType] || 'Area';
    },

    getAreaCount(areaType) {
        return window.safeAreas.filter(a => a.area_type === areaType).length;
    },

    clearAllPolygons() {
        if (confirm("Clear all editable areas?")) {
            window.safeAreas = [];
            currentPolygon = [];
            EditableAreaEditor.drawAreas();
        }
    },

    drawAreas(tempPolygon = null) {
        if (!canvasContext || !backgroundImage) return;

        canvasContext.clearRect(0, 0, originalImageWidth, originalImageHeight);
        canvasContext.drawImage(backgroundImage, 0, 0, originalImageWidth, originalImageHeight);

        // Draw all saved areas
        window.safeAreas.forEach((area, index) => {
            const color = EditableAreaEditor.getAreaColor(area.area_type, index);
            EditableAreaEditor.drawPolygon(area.coordinates, color, true, area.name);
        });

        // Draw current polygon being created
        const polygonToDraw = tempPolygon || currentPolygon;
        if (polygonToDraw.length > 0) {
            const color = EditableAreaEditor.getAreaColor(EditableAreaEditor.currentAreaType, window.safeAreas.length);
            EditableAreaEditor.drawPolygon(polygonToDraw, color, false, null);
        }
    },

    getAreaColor(areaType, index) {
        const colors = {
            'safe': { stroke: 'hsl(120, 70%, 50%)', fill: 'rgba(144, 238, 144, 0.65)' },   // Light green
            'bed': { stroke: 'hsl(200, 70%, 50%)', fill: 'rgba(173, 216, 230, 0.65)' },     // Light blue
            'floor': { stroke: 'hsl(0, 0%, 50%)', fill: 'rgba(128, 128, 128, 0.65)' }       // Grey
        };
        return colors[areaType] || colors['safe'];
    },

    drawPolygon(polygon, color, isComplete, label) {
        if (polygon.length === 0) return;

        // color is now an object with stroke and fill properties
        const strokeColor = typeof color === 'object' ? color.stroke : color;
        const fillColor = typeof color === 'object' ? color.fill : null;

        canvasContext.strokeStyle = strokeColor;
        canvasContext.lineWidth = 2;
        canvasContext.setLineDash(isComplete ? [] : [5, 5]);

        const points = polygon.map(p => [
            p[0] * originalImageWidth,
            p[1] * originalImageHeight
        ]);

        canvasContext.beginPath();
        canvasContext.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            canvasContext.lineTo(points[i][0], points[i][1]);
        }

        if (isComplete && points.length >= 3) {
            canvasContext.closePath();

            // Fill with 65% transparent color
            if (fillColor) {
                canvasContext.fillStyle = fillColor;
                canvasContext.fill();
            }
        }

        canvasContext.stroke();
        canvasContext.setLineDash([]);

        points.forEach((point, index) => {
            canvasContext.fillStyle = strokeColor;
            canvasContext.beginPath();
            canvasContext.arc(point[0], point[1], 4, 0, Math.PI * 2);
            canvasContext.fill();

            if (index === 0 && !isComplete && polygon.length >= 3) {
                canvasContext.strokeStyle = 'yellow';
                canvasContext.lineWidth = 2;
                canvasContext.beginPath();
                canvasContext.arc(point[0], point[1], 8, 0, Math.PI * 2);
                canvasContext.stroke();
            }
        });

        // Draw label
        if (label && points.length > 0) {
            canvasContext.font = '12px sans-serif';
            canvasContext.fillStyle = strokeColor;
            canvasContext.fillText(label, points[0][0] + 10, points[0][1] + 20);
        }
    },

    async saveAreas() {
        if (currentPolygon.length >= 3) {
            const area = {
                area_type: EditableAreaEditor.currentAreaType,
                coordinates: [...currentPolygon],
                name: `${EditableAreaEditor.getAreaLabel(EditableAreaEditor.currentAreaType)} ${EditableAreaEditor.getAreaCount(EditableAreaEditor.currentAreaType) + 1}`
            };
            window.safeAreas.push(area);
            currentPolygon = [];
        }

        // Show loading animation and hide toolbar
        const loadingDiv = document.getElementById('safeAreaLoading');
        const toolbar = document.getElementById('safeAreaToolbar');
        const loadingStatus = document.getElementById('safeAreaLoadingStatus');

        if (loadingDiv) loadingDiv.style.display = 'flex';
        if (toolbar) toolbar.style.display = 'none';
        if (loadingStatus) loadingStatus.textContent = 'Saving...';

        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/safe-areas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    camera_id: AppState.currentCameraId,
                    editable_areas: window.safeAreas
                })
            });

            if (response.ok) {
                // Update loading status to success
                if (loadingStatus) {
                    loadingStatus.textContent = 'Saved successfully!';
                    loadingStatus.style.color = '#28a745';
                }

                CommandManager.sendCommand("update_safe_areas", window.safeAreas);

                // Log to panel
                if (window.LogPanel) {
                    const areaCount = window.safeAreas.length;
                    const totalPoints = window.safeAreas.reduce((sum, area) => sum + area.coordinates.length, 0);
                    LogPanel.add(
                        `✅ Editable areas saved: ${areaCount} areas, ${totalPoints} total points`,
                        'success',
                        'EditableAreas'
                    );
                }

                setTimeout(() => {
                    EditableAreaEditor.hide();
                }, 1000);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Save error:', error);

            // Show error in loading status
            if (loadingStatus) {
                loadingStatus.textContent = 'Save failed';
                loadingStatus.style.color = '#ff9800';
            }

            // Hide loading and show toolbar after a delay
            setTimeout(() => {
                if (loadingDiv) loadingDiv.style.display = 'none';
                if (toolbar) toolbar.style.display = 'grid';
            }, 2000);
        }
    },

    hide() {
        DOMHelpers.hidePopup(DOMElements.safeAreaPopup);
        isEditing = false;

        // Restore show_raw to its previous state
        if (EditableAreaEditor.prevShowRaw === true) {
            console.log('Restoring show_raw to true');
            CommandManager.sendCommand("toggle_raw", true);
        }
        EditableAreaEditor.prevShowRaw = null;

        if (canvasContext) {
            DOMElements.safeAreaCanvas.removeEventListener('click', (e) => EditableAreaEditor.handleCanvasClick(e));
            DOMElements.safeAreaCanvas.removeEventListener('mousemove', (e) => EditableAreaEditor.handleCanvasMouseMove(e));
            DOMElements.safeAreaCanvas.removeEventListener('contextmenu', (e) => EditableAreaEditor.handleCanvasRightClick(e));
        }
    }
};

// Export
window.EditableAreaEditor = EditableAreaEditor;
// Also export as SafeAreaEditor for backwards compatibility
window.SafeAreaEditor = EditableAreaEditor;
