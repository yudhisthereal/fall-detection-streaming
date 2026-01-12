// safeAreaEditor.js - Safe Area Editor functionality

const SafeAreaEditor = {
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

    async show() {
        if (!AppState.isConnected) {
            alert('Camera is disconnected. Cannot edit safe areas.');
            return;
        }
        
        try {
            await this.loadSafeAreasForCamera(AppState.currentCameraId);
            
            backgroundImage = new Image();
            backgroundImage.onload = () => {
                this.initializeCanvas();
                DOMHelpers.showPopup(DOMElements.safeAreaPopup);
                isEditing = true;
                this.drawSafeAreas();
            };
            backgroundImage.onerror = () => {
                alert('Failed to load background image');
            };
            
            // Get current frame for editing
            const timestamp = Date.now();
            backgroundImage.src = `${STREAMING_HTTP_URL}/api/stream/frame?camera_id=${AppState.currentCameraId}&t=${timestamp}`;
            
        } catch (error) {
            console.error('Error showing safe area editor:', error);
            alert('Failed to open safe area editor');
        }
    },

    initializeCanvas() {
        if (!backgroundImage) return;
        
        originalImageWidth = backgroundImage.width;
        originalImageHeight = backgroundImage.height;
        
        DOMElements.safeAreaCanvas.width = originalImageWidth;
        DOMElements.safeAreaCanvas.height = originalImageHeight;
        
        const maxWidth = 800;
        const maxHeight = 600;
        const scaleX = maxWidth / originalImageWidth;
        const scaleY = maxHeight / originalImageHeight;
        canvasScale = Math.min(scaleX, scaleY);
        
        DOMElements.safeAreaCanvas.style.width = (originalImageWidth * canvasScale) + 'px';
        DOMElements.safeAreaCanvas.style.height = (originalImageHeight * canvasScale) + 'px';
        
        canvasContext = DOMElements.safeAreaCanvas.getContext('2d');
        
        DOMElements.safeAreaCanvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        DOMElements.safeAreaCanvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        DOMElements.safeAreaCanvas.addEventListener('contextmenu', (e) => this.handleCanvasRightClick(e));
        
        if (DOMElements.newPolygonBtn) DOMElements.newPolygonBtn.onclick = () => this.startNewPolygon();
        if (DOMElements.clearAllBtn) DOMElements.clearAllBtn.onclick = () => this.clearAllPolygons();
        if (DOMElements.saveSafeAreasBtn) DOMElements.saveSafeAreasBtn.onclick = () => this.saveSafeAreas();
    },

    getCanvasCoordinates(event) {
        const rect = DOMElements.safeAreaCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        return {
            x: Math.floor(x / canvasScale),
            y: Math.floor(y / canvasScale)
        };
    },

    handleCanvasClick(event) {
        if (!isEditing) return;
        
        const { x, y } = this.getCanvasCoordinates(event);
        const normalizedX = x / originalImageWidth;
        const normalizedY = y / originalImageHeight;
        
        if (currentPolygon.length >= 3) {
            const firstPoint = currentPolygon[0];
            const distance = Math.sqrt(
                Math.pow(normalizedX - firstPoint[0], 2) + 
                Math.pow(normalizedY - firstPoint[1], 2)
            );
            
            if (distance < 0.05) {
                this.finishCurrentPolygon();
                return;
            }
        }
        
        currentPolygon.push([normalizedX, normalizedY]);
        this.drawSafeAreas();
    },

    handleCanvasMouseMove(event) {
        if (!isEditing || currentPolygon.length === 0) return;
        
        const { x, y } = this.getCanvasCoordinates(event);
        const normalizedX = x / originalImageWidth;
        const normalizedY = y / originalImageHeight;
        
        this.drawSafeAreas([...currentPolygon, [normalizedX, normalizedY]]);
    },

    handleCanvasRightClick(event) {
        event.preventDefault();
        if (!isEditing || currentPolygon.length === 0) return;
        
        currentPolygon.pop();
        this.drawSafeAreas();
    },

    startNewPolygon() {
        if (currentPolygon.length >= 3) {
            this.finishCurrentPolygon();
        }
        currentPolygon = [];
        this.drawSafeAreas();
    },

    finishCurrentPolygon() {
        if (currentPolygon.length >= 3) {
            safeAreas.push([...currentPolygon]);
            currentPolygon = [];
            this.drawSafeAreas();
        }
    },

    clearAllPolygons() {
        if (confirm("Clear all safe areas?")) {
            safeAreas = [];
            currentPolygon = [];
            this.drawSafeAreas();
        }
    },

    drawSafeAreas(tempPolygon = null) {
        if (!canvasContext || !backgroundImage) return;
        
        canvasContext.clearRect(0, 0, originalImageWidth, originalImageHeight);
        canvasContext.drawImage(backgroundImage, 0, 0, originalImageWidth, originalImageHeight);
        
        safeAreas.forEach((polygon, index) => {
            this.drawPolygon(polygon, `hsl(${index * 60}, 70%, 50%)`, true);
        });
        
        const polygonToDraw = tempPolygon || currentPolygon;
        if (polygonToDraw.length > 0) {
            this.drawPolygon(polygonToDraw, 'cyan', false);
        }
    },

    drawPolygon(polygon, color, isComplete) {
        if (polygon.length === 0) return;
        
        canvasContext.strokeStyle = color;
        canvasContext.fillStyle = color + '40';
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
            canvasContext.fill();
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
                
                setTimeout(() => {
                    this.hide();
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
        
        if (canvasContext) {
            DOMElements.safeAreaCanvas.removeEventListener('click', (e) => this.handleCanvasClick(e));
            DOMElements.safeAreaCanvas.removeEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
            DOMElements.safeAreaCanvas.removeEventListener('contextmenu', (e) => this.handleCanvasRightClick(e));
        }
    }
};

// Export
window.SafeAreaEditor = SafeAreaEditor;

