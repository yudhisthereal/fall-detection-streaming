// editableAreaEditor.js - Editable Area Editor functionality
// Supports multiple area types: safe areas, bed areas, floor areas, couch areas, bench areas, chair areas
// Supports tools: Pen (draw), Remove (click to delete)

const EditableAreaEditor = {
    // Track previous show_raw state for restore on popup close
    prevShowRaw: null,
    // Current area type being edited
    currentAreaType: 'bed',
    // Current active tool: 'pen' or 'remove'
    currentTool: 'pen',

    // Cache for loaded areas to compare against for changes
    initialAreas: [],

    async loadAreasForCamera(cameraId) {
        try {
            // Fetch all area types from server (will update cache)
            const { bedAreas, floorAreas, couchAreas, benchAreas, chairAreas } =
                await EditableAreasManager.fetchAllAreas();

            const editableAreas = [];

            // Convert to editable area format

            bedAreas.forEach((coords, index) => {
                editableAreas.push({
                    area_type: 'bed',
                    coordinates: coords,
                    name: `Bed Area ${index + 1}`
                });
            });

            floorAreas.forEach((coords, index) => {
                editableAreas.push({
                    area_type: 'floor',
                    coordinates: coords,
                    name: `Floor Area ${index + 1}`
                });
            });

            couchAreas.forEach((coords, index) => {
                editableAreas.push({
                    area_type: 'couch',
                    coordinates: coords,
                    name: `Couch Area ${index + 1}`
                });
            });

            benchAreas.forEach((coords, index) => {
                editableAreas.push({
                    area_type: 'bench',
                    coordinates: coords,
                    name: `Bench Area ${index + 1}`
                });
            });

            chairAreas.forEach((coords, index) => {
                editableAreas.push({
                    area_type: 'chair',
                    coordinates: coords,
                    name: `Chair Area ${index + 1}`
                });
            });

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
            NotificationSystem.show('Camera is disconnected. Cannot edit editable areas.', 'error');
            return;
        }

        try {
            // Load existing editable areas
            const loadedAreas = await EditableAreaEditor.loadAreasForCamera(AppState.currentCameraId);
            window.editableAreas = loadedAreas;

            // Deep copy for initial state comparison if needed later (simplified for now)
            EditableAreaEditor.initialAreas = JSON.parse(JSON.stringify(loadedAreas));

            // Reset UI State for fresh open
            // 1. Reset loading/status text
            if (DOMElements.saveStatus) DOMElements.saveStatus.textContent = '';
            const loadingDiv = document.getElementById('safeAreaLoading');
            if (loadingDiv) loadingDiv.style.display = 'none';
            const toolbar = document.getElementById('editableAreaToolbar');
            if (toolbar) toolbar.style.display = 'grid';

            // 2. Save current show_raw state
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
                DOMHelpers.showPopup(DOMElements.editAreasPopup);
                isEditing = true;

                // Set default tool to 'pen'
                EditableAreaEditor.setTool('pen');

                EditableAreaEditor.drawAreas();

                // Set initial area type from selector if available
                if (DOMElements.areaTypeSelector) {
                    EditableAreaEditor.currentAreaType = DOMElements.areaTypeSelector.value;
                }
            };
            backgroundImage.onerror = () => {
                NotificationSystem.show('Failed to load background image', 'error');
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
            NotificationSystem.show('Failed to open editable area editor: ' + error.message, 'error');

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

        DOMElements.editableAreaCanvas.width = originalImageWidth;
        DOMElements.editableAreaCanvas.height = originalImageHeight;

        canvasContext = DOMElements.editableAreaCanvas.getContext('2d');

        // Remove old listeners to prevent duplicates
        DOMElements.editableAreaCanvas.removeEventListener('click', EditableAreaEditor.handleCanvasClick);
        DOMElements.editableAreaCanvas.removeEventListener('mousemove', EditableAreaEditor.handleCanvasMouseMove);
        DOMElements.editableAreaCanvas.removeEventListener('contextmenu', EditableAreaEditor.handleCanvasRightClick);

        canvasContext = DOMElements.editableAreaCanvas.getContext('2d');

        DOMElements.editableAreaCanvas.addEventListener('click', EditableAreaEditor.handleCanvasClick);
        DOMElements.editableAreaCanvas.addEventListener('mousemove', EditableAreaEditor.handleCanvasMouseMove);
        DOMElements.editableAreaCanvas.addEventListener('contextmenu', EditableAreaEditor.handleCanvasRightClick);

        // Toolbar handlers
        if (DOMElements.toolPenBtn) DOMElements.toolPenBtn.onclick = () => EditableAreaEditor.setTool('pen');
        if (DOMElements.toolRemoveBtn) DOMElements.toolRemoveBtn.onclick = () => EditableAreaEditor.setTool('remove');
        if (DOMElements.toolClearBtn) DOMElements.toolClearBtn.onclick = () => EditableAreaEditor.clearAllPolygons();
        if (DOMElements.saveAreasBtn) DOMElements.saveAreasBtn.onclick = () => EditableAreaEditor.saveAreas();

        if (DOMElements.areaTypeSelector) {
            DOMElements.areaTypeSelector.onchange = (e) => {
                EditableAreaEditor.currentAreaType = e.target.value;
                console.log(`Area type changed to: ${EditableAreaEditor.currentAreaType}`);
                EditableAreaEditor.drawAreas(); // Redraw in case we want to highlight current type (future feature)
            };
        }
    },

    setTool(toolName) {
        EditableAreaEditor.currentTool = toolName;

        // Update UI
        if (DOMElements.toolPenBtn) {
            if (toolName === 'pen') DOMElements.toolPenBtn.classList.add('active');
            else DOMElements.toolPenBtn.classList.remove('active');

            // Highlight style for active button using inline style or class
            DOMElements.toolPenBtn.style.border = toolName === 'pen' ? '2px solid white' : 'none';
        }
        if (DOMElements.toolRemoveBtn) {
            if (toolName === 'remove') DOMElements.toolRemoveBtn.classList.add('active');
            else DOMElements.toolRemoveBtn.classList.remove('active');

            DOMElements.toolRemoveBtn.style.border = toolName === 'remove' ? '2px solid white' : 'none';
        }

        // Cursor style
        if (DOMElements.editableAreaCanvas) {
            DOMElements.editableAreaCanvas.style.cursor = toolName === 'remove' ? 'not-allowed' : 'crosshair';
        }

        console.log(`Tool selected: ${toolName}`);

        // Refresh view (e.g. to hide/show unfinished polygon based on tool)
        EditableAreaEditor.drawAreas();
    },

    getCanvasCoordinates(event) {
        const canvas = DOMElements.editableAreaCanvas;
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

        if (EditableAreaEditor.currentTool === 'pen') {
            // Pen Tool Logic
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

        } else if (EditableAreaEditor.currentTool === 'remove') {
            // Remove Tool Logic
            // Find if click is inside any polygon
            const clickedAreaIndex = window.editableAreas.findIndex(area =>
                EditableAreaEditor.isPointInPolygon([normalizedX, normalizedY], area.coordinates)
            );

            if (clickedAreaIndex !== -1) {
                const area = window.editableAreas[clickedAreaIndex];
                UIControls.showConfirm('Remove Area', `Remove ${area.name}?`, () => {
                    window.editableAreas.splice(clickedAreaIndex, 1);
                    EditableAreaEditor.drawAreas();
                });
            }
        }
    },

    // Ray-casting algorithm to check if point is in polygon
    isPointInPolygon(point, vs) {
        // point [x, y]
        // vs [[x1, y1], [x2, y2], ...]
        const x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i][0], yi = vs[i][1];
            const xj = vs[j][0], yj = vs[j][1];

            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    },

    handleCanvasMouseMove(event) {
        if (!isEditing) return;

        const { x, y } = EditableAreaEditor.getCanvasCoordinates(event);
        const normalizedX = x / originalImageWidth;
        const normalizedY = y / originalImageHeight;

        if (EditableAreaEditor.currentTool === 'pen' && currentPolygon.length > 0) {
            // Show preview line for pen tool
            EditableAreaEditor.drawAreas([...currentPolygon, [normalizedX, normalizedY]]);
        } else {
            // Just redraw for hover effects (if any)
            EditableAreaEditor.drawAreas(null, [normalizedX, normalizedY]);
        }
    },

    handleCanvasRightClick(event) {
        event.preventDefault();
        if (!isEditing) return;

        if (EditableAreaEditor.currentTool === 'pen' && currentPolygon.length > 0) {
            currentPolygon.pop();
            EditableAreaEditor.drawAreas();
        }
    },

    finishCurrentPolygon() {
        if (currentPolygon.length >= 3) {
            // Create area object with current area type
            const area = {
                area_type: EditableAreaEditor.currentAreaType,
                coordinates: [...currentPolygon],
                name: `${EditableAreaEditor.getAreaLabel(EditableAreaEditor.currentAreaType)} ${EditableAreaEditor.getAreaCount(EditableAreaEditor.currentAreaType) + 1}`
            };
            window.editableAreas.push(area);
            currentPolygon = [];
            EditableAreaEditor.drawAreas();
        }
    },

    getAreaLabel(areaType) {
        const labels = {
            'bed': 'Bed Area',
            'floor': 'Floor Area',
            'couch': 'Couch Area',
            'bench': 'Bench Area',
            'chair': 'Chair Area'
        };
        return labels[areaType] || 'Area';
    },

    getAreaCount(areaType) {
        return window.editableAreas.filter(a => a.area_type === areaType).length;
    },

    clearAllPolygons() {
        UIControls.showConfirm('Clear All', "Clear all editable areas?", () => {
            window.editableAreas = [];
            currentPolygon = [];
            EditableAreaEditor.drawAreas();
        });
    },

    drawAreas(tempPolygon = null, hoverPoint = null) {
        if (!canvasContext || !backgroundImage) return;

        canvasContext.clearRect(0, 0, originalImageWidth, originalImageHeight);
        canvasContext.drawImage(backgroundImage, 0, 0, originalImageWidth, originalImageHeight);

        // Draw all saved areas
        window.editableAreas.forEach((area, _) => {
            const color = EditableAreaEditor.getAreaColor(area.area_type);

            // If in remove tool and hovering, maybe highlight? 
            // For now just draw standard
            let isHovered = false;

            if (EditableAreaEditor.currentTool === 'remove' && hoverPoint) {
                isHovered = EditableAreaEditor.isPointInPolygon(hoverPoint, area.coordinates);
            }

            EditableAreaEditor.drawPolygon(area.coordinates, color, true, area.name, isHovered);
        });

        // Draw current polygon being created (only if Pen tool)
        if (EditableAreaEditor.currentTool === 'pen') {
            const polygonToDraw = tempPolygon || currentPolygon;
            if (polygonToDraw.length > 0) {
                const color = EditableAreaEditor.getAreaColor(EditableAreaEditor.currentAreaType);
                EditableAreaEditor.drawPolygon(polygonToDraw, color, false, null);
            }
        }
    },

    getAreaColor(areaType) {
        const colors = {
            'bed': { stroke: 'hsl(200, 70%, 50%)', fill: 'rgba(173, 216, 230, 0.65)' },     // Light blue
            'floor': { stroke: 'hsl(0, 0%, 50%)', fill: 'rgba(128, 128, 128, 0.65)' },      // Grey
            'couch': { stroke: 'hsl(30, 70%, 50%)', fill: 'rgba(255, 165, 0, 0.65)' },      // Orange
            'bench': { stroke: 'hsl(30, 50%, 40%)', fill: 'rgba(139, 90, 43, 0.65)' },      // Brown
            'chair': { stroke: 'hsl(270, 50%, 50%)', fill: 'rgba(147, 112, 219, 0.65)' }    // Purple
        };
        return colors[areaType] || colors['floor'];
    },

    drawPolygon(polygon, color, isComplete, label, isHovered = false) {
        if (polygon.length === 0) return;

        // color is now an object with stroke and fill properties
        const strokeColor = typeof color === 'object' ? color.stroke : color;
        const fillColor = typeof color === 'object' ? color.fill : null;

        canvasContext.strokeStyle = isHovered ? '#FF5722' : strokeColor; // Highlight on hover for remove tool
        canvasContext.lineWidth = isHovered ? 4 : 2;
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

            // Fill
            if (fillColor) {
                canvasContext.fillStyle = isHovered ? 'rgba(255, 87, 34, 0.4)' : fillColor;
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

    saveAreas() {
        if (currentPolygon.length >= 3) {
            UIControls.showConfirm('Unfinished Polygon', "You have an unfinished polygon. Do you want to include it?", () => {
                EditableAreaEditor.finishCurrentPolygon();
                this._performSaveAreas();
            }, () => {
                this._performSaveAreas();
            });
        } else {
            this._performSaveAreas();
        }
    },

    async _performSaveAreas() {
        // Show loading animation and hide toolbar
        const loadingDiv = document.getElementById('safeAreaLoading');
        const toolbar = document.getElementById('editableAreaToolbar');
        const loadingStatus = document.getElementById('safeAreaLoadingStatus');

        if (loadingDiv) loadingDiv.style.display = 'flex';
        // if (toolbar) toolbar.style.display = 'none'; // USER FEEDBACK: Keep toolbar visible or not? 
        // Logic: Usually hide to prevent edits while saving. 
        // But user issue 2 said buttons hidden next time. 
        // Let's hide it now, but make sure to SHOW it again on success/failure
        if (toolbar) toolbar.style.display = 'none';

        if (loadingStatus) loadingStatus.textContent = 'Saving...';

        // Log what we're about to save
        if (window.LogPanel) {
            const areasByType = {};
            window.editableAreas.forEach(area => {
                areasByType[area.area_type] = (areasByType[area.area_type] || 0) + 1;
            });
            const summary = Object.entries(areasByType).map(([type, count]) => `${count} ${type}`).join(', ');
            LogPanel.add(
                `Saving ${window.editableAreas.length} areas: ${summary}`,
                'info',
                'EditableAreas'
            );
        }

        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/editable-areas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    camera_id: AppState.currentCameraId,
                    editable_areas: window.editableAreas
                })
            });

            if (response.ok) {
                const result = await response.json();

                // Log success to panel
                if (window.LogPanel && result.saved_to_disk) {
                    LogPanel.add(
                        `Saved ${result.areas_count} areas to disk for ${result.camera_id}`,
                        'success',
                        'EditableAreas'
                    );
                }

                // Update loading status to success
                if (loadingStatus) {
                    loadingStatus.textContent = 'Saved successfully!';
                    loadingStatus.style.color = '#28a745';
                }

                CommandManager.sendCommand("update_editable_areas", window.editableAreas);

                // Log to panel
                if (window.LogPanel) {
                    const areaCount = window.editableAreas.length;
                    const totalPoints = window.editableAreas.reduce((sum, area) => sum + area.coordinates.length, 0);
                    LogPanel.add(
                        `✅ Editable areas saved: ${areaCount} areas, ${totalPoints} total points`,
                        'success',
                        'EditableAreas'
                    );
                }

                // Invalidate cache so fresh data is fetched
                if (window.EditableAreasManager) {
                    EditableAreasManager.invalidateCache();
                }

                // Refresh main display to show new areas
                if (window.StreamDisplay && window.StreamDisplay.manualRefresh) {
                    window.StreamDisplay.manualRefresh();
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
        // Unfinished polygon check
        if (currentPolygon.length > 0) {
            UIControls.showConfirm('Unfinished Polygon', "You have an unfinished polygon. It will be lost if you close. Continue?", () => {
                currentPolygon = []; // Clear it
                this._performHide();
            }); // If cancelled/no, do nothing
        } else {
            this._performHide();
        }
    },

    _performHide() {
        DOMHelpers.hidePopup(DOMElements.editAreasPopup);
        isEditing = false;

        // Restore show_raw to its previous state
        if (EditableAreaEditor.prevShowRaw === true) {
            console.log('Restoring show_raw to true');
            CommandManager.sendCommand("toggle_raw", true);
        }
        EditableAreaEditor.prevShowRaw = null;

        if (canvasContext && DOMElements.editableAreaCanvas) {
            DOMElements.editableAreaCanvas.removeEventListener('click', EditableAreaEditor.handleCanvasClick);
            DOMElements.editableAreaCanvas.removeEventListener('mousemove', EditableAreaEditor.handleCanvasMouseMove);
            DOMElements.editableAreaCanvas.removeEventListener('contextmenu', EditableAreaEditor.handleCanvasRightClick);
            canvasContext = null;
        }
    }
};

// Export
window.EditableAreaEditor = EditableAreaEditor;
