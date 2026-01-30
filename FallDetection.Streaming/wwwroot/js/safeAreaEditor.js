// safeAreaEditor.js - Safe Area Editor functionality

const SafeAreaEditor = {
    // Track previous show_raw state for restore on popup close
    prevShowRaw: null,

    async loadSafeAreasForCamera(cameraId) {
        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/safe-areas?camera_id=${cameraId}`);
            if (response.ok) {
                safeAreas = await response.json();
                console.log(`Loaded ${safeAreas.length} safe areas for ${cameraId}`);
            }
        } catch (error) {
            console.error(`Failed to load safe areas for ${cameraId}:`, error);
            safeAreas = [];
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

        const { width, height } = SafeAreaEditor.getImageDimensions(imgElement);

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
            alert('Camera is disconnected. Cannot edit safe areas.');
            return;
        }

        try {
            // Load existing safe areas
            await SafeAreaEditor.loadSafeAreasForCamera(AppState.currentCameraId);

            // Save current show_raw state
            SafeAreaEditor.prevShowRaw = DOMElements.toggleRaw ? DOMElements.toggleRaw.checked : false;

            // If show_raw is currently true, send command to set it to false
            if (SafeAreaEditor.prevShowRaw) {
                console.log('Temporarily disabling show_raw for safe area editing...');
                await CommandManager.sendCommand("toggle_raw", false);

                // Wait a bit for the frame to update with background visible
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Take snapshot from IMG element (not VIDEO)
            const frameDataUrl = SafeAreaEditor.captureCurrentFrame();

            backgroundImage = new Image();
            backgroundImage.onload = () => {
                SafeAreaEditor.initializeCanvas();
                DOMHelpers.showPopup(DOMElements.safeAreaPopup);
                isEditing = true;
                SafeAreaEditor.drawSafeAreas();
            };
            backgroundImage.onerror = () => {
                alert('Failed to load background image');
                // Restore show_raw on error
                if (SafeAreaEditor.prevShowRaw) {
                    CommandManager.sendCommand("toggle_raw", true);
                    SafeAreaEditor.prevShowRaw = null;
                }
            };

            // Set background from captured frame
            backgroundImage.src = frameDataUrl;

        } catch (error) {
            console.error('Error showing safe area editor:', error);
            alert('Failed to open safe area editor: ' + error.message);

            // Restore show_raw on error
            if (SafeAreaEditor.prevShowRaw !== null && SafeAreaEditor.prevShowRaw !== undefined) {
                CommandManager.sendCommand("toggle_raw", true);
                SafeAreaEditor.prevShowRaw = null;
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
        
        DOMElements.safeAreaCanvas.addEventListener('click', (e) => SafeAreaEditor.handleCanvasClick(e));
        DOMElements.safeAreaCanvas.addEventListener('mousemove', (e) => SafeAreaEditor.handleCanvasMouseMove(e));
        DOMElements.safeAreaCanvas.addEventListener('contextmenu', (e) => SafeAreaEditor.handleCanvasRightClick(e));
        
        if (DOMElements.newPolygonBtn) DOMElements.newPolygonBtn.onclick = () => SafeAreaEditor.startNewPolygon();
        if (DOMElements.clearAllBtn) DOMElements.clearAllBtn.onclick = () => SafeAreaEditor.clearAllPolygons();
        if (DOMElements.saveSafeAreasBtn) DOMElements.saveSafeAreasBtn.onclick = () => SafeAreaEditor.saveSafeAreas();
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
        
        const { x, y } = SafeAreaEditor.getCanvasCoordinates(event);
        const normalizedX = x / originalImageWidth;
        const normalizedY = y / originalImageHeight;
        
        if (currentPolygon.length >= 3) {
            const firstPoint = currentPolygon[0];
            const distance = Math.sqrt(
                Math.pow(normalizedX - firstPoint[0], 2) + 
                Math.pow(normalizedY - firstPoint[1], 2)
            );
            
            if (distance < 0.05) {
                SafeAreaEditor.finishCurrentPolygon();
                return;
            }
        }
        
        currentPolygon.push([normalizedX, normalizedY]);
        SafeAreaEditor.drawSafeAreas();
    },

    handleCanvasMouseMove(event) {
        if (!isEditing || currentPolygon.length === 0) return;
        
        const { x, y } = SafeAreaEditor.getCanvasCoordinates(event);
        const normalizedX = x / originalImageWidth;
        const normalizedY = y / originalImageHeight;
        
        SafeAreaEditor.drawSafeAreas([...currentPolygon, [normalizedX, normalizedY]]);
    },

    handleCanvasRightClick(event) {
        event.preventDefault();
        if (!isEditing || currentPolygon.length === 0) return;
        
        currentPolygon.pop();
        SafeAreaEditor.drawSafeAreas();
    },

    startNewPolygon() {
        if (currentPolygon.length >= 3) {
            SafeAreaEditor.finishCurrentPolygon();
        }
        currentPolygon = [];
        SafeAreaEditor.drawSafeAreas();
    },

    finishCurrentPolygon() {
        if (currentPolygon.length >= 3) {
            safeAreas.push([...currentPolygon]);
            currentPolygon = [];
            SafeAreaEditor.drawSafeAreas();
        }
    },

    clearAllPolygons() {
        if (confirm("Clear all safe areas?")) {
            safeAreas = [];
            currentPolygon = [];
            SafeAreaEditor.drawSafeAreas();
        }
    },

    drawSafeAreas(tempPolygon = null) {
        if (!canvasContext || !backgroundImage) return;
        
        canvasContext.clearRect(0, 0, originalImageWidth, originalImageHeight);
        canvasContext.drawImage(backgroundImage, 0, 0, originalImageWidth, originalImageHeight);
        
        safeAreas.forEach((polygon, index) => {
            SafeAreaEditor.drawPolygon(polygon, `hsl(${index * 60}, 70%, 50%)`, true);
        });
        
        const polygonToDraw = tempPolygon || currentPolygon;
        if (polygonToDraw.length > 0) {
            SafeAreaEditor.drawPolygon(polygonToDraw, 'cyan', false);
        }
    },

    drawPolygon(polygon, color, isComplete) {
        if (polygon.length === 0) return;
        
        canvasContext.strokeStyle = color;
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
            // REMOVED: canvasContext.fill();
        }
        
        canvasContext.stroke();
        canvasContext.setLineDash([]);
        
        points.forEach((point, index) => {
            canvasContext.fillStyle = color;
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
    },

    async saveSafeAreas() {
        if (currentPolygon.length >= 3) {
            safeAreas.push([...currentPolygon]);
            currentPolygon = [];
        }
        
        if (DOMElements.saveStatus) {
            DOMElements.saveStatus.textContent = "Saving...";
            DOMElements.saveStatus.className = "status saving";
        }
        
        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/safe-areas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    camera_id: AppState.currentCameraId,
                    safe_areas: safeAreas
                })
            });
            
            if (response.ok) {
                if (DOMElements.saveStatus) {
                    DOMElements.saveStatus.textContent = "Saved successfully!";
                    DOMElements.saveStatus.className = "status success";
                }

                CommandManager.sendCommand("update_safe_areas", safeAreas);

                // Log to panel
                if (window.LogPanel) {
                    const areaCount = safeAreas.length;
                    const totalPoints = safeAreas.reduce((sum, area) => sum + area.length, 0);
                    LogPanel.add(
                        `✅ Safe areas saved: ${areaCount} areas, ${totalPoints} total points`,
                        'success',
                        'SafeAreas'
                    );
                }

                setTimeout(() => {
                    SafeAreaEditor.hide();
                }, 1000);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Save error:', error);
            if (DOMElements.saveStatus) {
                DOMElements.saveStatus.textContent = "Save failed";
                DOMElements.saveStatus.className = "status error";
            }
        }
    },

    hide() {
        DOMHelpers.hidePopup(DOMElements.safeAreaPopup);
        isEditing = false;

        // Restore show_raw to its previous state
        if (SafeAreaEditor.prevShowRaw === true) {
            console.log('Restoring show_raw to true');
            CommandManager.sendCommand("toggle_raw", true);
        }
        SafeAreaEditor.prevShowRaw = null;

        if (canvasContext) {
            DOMElements.safeAreaCanvas.removeEventListener('click', (e) => SafeAreaEditor.handleCanvasClick(e));
            DOMElements.safeAreaCanvas.removeEventListener('mousemove', (e) => SafeAreaEditor.handleCanvasMouseMove(e));
            DOMElements.safeAreaCanvas.removeEventListener('contextmenu', (e) => SafeAreaEditor.handleCanvasRightClick(e));
        }
    }
};

// Export
window.SafeAreaEditor = SafeAreaEditor;