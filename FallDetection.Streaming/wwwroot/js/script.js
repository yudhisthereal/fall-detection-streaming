// script.js - COMPLETE Multi-Camera Analytics Dashboard with Camera Management
// Updated to use Streaming Server for ALL camera operations

// DOM Elements
const streamVideo = document.getElementById('streamVideo');
const toggleRecord = document.getElementById('toggleRecord');
const toggleRaw = document.getElementById('toggleRaw');
const autoUpdateBg = document.getElementById('autoUpdateBg');
const showSafeArea = document.getElementById('showSafeArea');
const useSafetyCheck = document.getElementById('useSafetyCheck');
const toggleHME = document.getElementById('toggleHME');
const setBackgroundBtn = document.getElementById('setBackgroundBtn');
const editSafeAreaBtn = document.getElementById('editSafeAreaBtn');
const fallAlgorithmSelect = document.getElementById('fallAlgorithmSelect');

// Camera selection
const cameraSelect = document.getElementById('cameraSelect');
const refreshCamerasBtn = document.getElementById('refreshCamerasBtn');
const cameraInfoSpan = document.getElementById('camera-info');
const pendingRegBtn = document.getElementById('pendingRegistrationsBtn');
const pendingRegCount = document.getElementById('pendingRegCount');
const manageCamerasBtn = document.getElementById('manageCamerasBtn');

// Popup elements
const popup = document.getElementById('popup');
const preview = document.getElementById('preview');
const safeAreaPopup = document.getElementById('safeAreaPopup');
const registrationPopup = document.getElementById('registrationPopup');
const managementPopup = document.getElementById('managementPopup');

// Safe Area Editor Elements
const safeAreaCanvas = document.getElementById('safeAreaCanvas');
const newPolygonBtn = document.getElementById('newPolygonBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const saveSafeAreasBtn = document.getElementById('saveSafeAreasBtn');
const saveStatus = document.getElementById('saveStatus');

// Safe Area Editor State
let safeAreas = [];
let currentPolygon = [];
let isEditing = false;
let canvasContext = null;
let backgroundImage = null;
let originalImageWidth = 0;
let originalImageHeight = 0;
let canvasScale = 1;

// Camera selection
let currentCameraId = "camera_000";
let currentCameraName = "Camera 000";
let currentCameraStatus = "unknown";

// Server URLs - ALL requests go to Streaming Server now
const STREAMING_HTTP_URL = window.location.origin;

// SignalR connection
let connection = null;

// WebRTC
let peerConnection = null;
let dataChannel = null;

// Connection state
let isConnected = false;
let cameraStateTimer = null;
let cameraListTimer = null;
let cameraStatusTimer = null;

// Multi-camera state
let availableCameras = [];
let cameraConnectionStatus = {};

// Status elements
let statusIndicator = document.getElementById('stream-status');

// Camera registration state
let pendingRegistrations = [];
let selectedCameraId = null;
let selectedCameraIp = null;

// Algorithm info panel state
let previousScrollPosition = 0;

// Stream state
let streamRefreshInterval = null;
const REFRESH_INTERVAL_MS = 200;
let errorCount = 0;
const MAX_ERRORS = 10;

// Flag sync worker simulation
let flagSyncWorker = null;

// ============================================
// POPUP FUNCTIONS
// ============================================

function confirmBackground() {
    if (typeof sendCommand === 'function') {
        sendCommand("set_background", true);
    }
    hidePopup();
}

function hidePopup() {
    const popup = document.getElementById('popup');
    if (popup) popup.style.display = "none";
}

function hideSafeAreaPopup() {
    const safeAreaPopup = document.getElementById('safeAreaPopup');
    if (safeAreaPopup) safeAreaPopup.style.display = "none";
}

function hideManagementPopup() {
    const popup = document.getElementById('managementPopup');
    if (popup) popup.style.display = "none";
}

function hideRegistrationPopup() {
    const popup = document.getElementById('registrationPopup');
    if (popup) popup.style.display = "none";
}

// ============================================
// SIGNALR CONNECTION
// ============================================

async function initializeSignalR() {
    try {
        connection = new signalR.HubConnectionBuilder()
            .withUrl(`${STREAMING_HTTP_URL}/streamHub`)
            .configureLogging(signalR.LogLevel.Information)
            .build();

        connection.on("JoinedStream", (cameraId) => {
            console.log(`Joined stream for camera: ${cameraId}`);
        });

        connection.on("WebRtcOffer", async (offer) => {
            console.log("Received WebRTC offer from camera");
            await handleWebRtcOffer(offer);
        });

        connection.on("WebRtcAnswer", async (answer) => {
            console.log("Received WebRTC answer");
            await handleWebRtcAnswer(answer);
        });

        connection.on("IceCandidate", async (candidate) => {
            console.log("Received ICE candidate");
            await handleIceCandidate(candidate);
        });

        connection.on("FlagUpdate", (flags) => {
            console.log("Received flag update from server:", flags);
            updateUIControls(flags);
        });

        await connection.start();
        console.log("SignalR connected");
        
        // Join the current camera stream
        if (currentCameraId) {
            await connection.invoke("JoinCameraStream", currentCameraId);
        }
    } catch (err) {
        console.error("SignalR connection error:", err);
        setTimeout(initializeSignalR, 5000);
    }
}

// ============================================
// FLAG SYNC WORKER
// ============================================

function startFlagSyncWorker() {
    flagSyncWorker = setInterval(async () => {
        if (currentCameraId && isConnected) {
            try {
                const flags = await fetchCameraState(currentCameraId);
                if (flags) {
                    updateUIControls(flags);
                    
                    // Send flag update via SignalR if connected
                    if (connection && connection.state === signalR.HubConnectionState.Connected) {
                        await connection.invoke("UpdateFlags", currentCameraId, flags);
                    }
                }
            } catch (error) {
                console.error("Flag sync error:", error);
            }
        }
    }, 500);
}

// ============================================
// WEBRTC FUNCTIONS
// ============================================

async function initializeWebRTC() {
    try {
        // Try WebRTC first
        await setupWebRTC();
    } catch (err) {
        console.error("WebRTC setup failed:", err);
        // Fallback to HTTP streaming
        setupHTTPStreamFallback();
    }
}

async function setupWebRTC() {
    if (!streamVideo) return;
    
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // Add TURN servers for better connectivity (uncomment and configure if you have TURN servers)
            // { urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'password' }
        ],
        iceCandidatePoolSize: 10
    };

    peerConnection = new RTCPeerConnection(configuration);
    
    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
        console.log("Received track");
        if (streamVideo.srcObject !== event.streams[0]) {
            streamVideo.srcObject = event.streams[0];
        }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && connection) {
            connection.invoke("SendIceCandidate", {
                cameraId: currentCameraId,
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex
            });
        }
    };

    // Create data channel for metadata
    dataChannel = peerConnection.createDataChannel('metadata');
    dataChannel.onopen = () => console.log("Data channel opened");
    dataChannel.onmessage = (event) => {
        console.log("Metadata:", event.data);
        // Parse pose data if sent via data channel
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'pose_analysis') {
                updatePoseDisplay(data.data);
            }
        } catch (e) {
            // Not JSON or other data
        }
    };
    
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            updateConnectionStatus(currentCameraId, true);
        } else if (peerConnection.connectionState === 'disconnected' ||
                   peerConnection.connectionState === 'failed' ||
                   peerConnection.connectionState === 'closed') {
            updateConnectionStatus(currentCameraId, false);
        }
    };

    // Create and send offer
    const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
    });
    
    await peerConnection.setLocalDescription(offer);
    
    if (connection) {
        await connection.invoke("SendWebRtcOffer", {
            cameraId: currentCameraId,
            sdp: offer.sdp,
            type: offer.type
        });
    }
}

async function handleWebRtcOffer(offer) {
    if (!peerConnection) return;
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    if (connection) {
        await connection.invoke("SendWebRtcAnswer", {
            cameraId: currentCameraId,
            sdp: answer.sdp,
            type: answer.type
        });
    }
}

async function handleWebRtcAnswer(answer) {
    if (!peerConnection) {
        console.error('No peer connection available to handle answer');
        return;
    }
    
    // Check connection state before setting remote description
    const state = peerConnection.connectionState;
    console.log('Peer connection state when handling answer:', state);
    
    // Only set remote description if we're not already in a stable state with remote description
    if (peerConnection.remoteDescription) {
        console.log('Remote description already set, skipping...');
        return;
    }
    
    try {
        const remoteDesc = new RTCSessionDescription(answer);
        await peerConnection.setRemoteDescription(remoteDesc);
        console.log('Remote description set successfully');
    } catch (err) {
        console.error('Error setting remote description:', err);
        // Try to recover by creating a new offer
        if (err.name === 'InvalidStateError') {
            console.log('Connection is in stable state, attempting recovery...');
            try {
                // Close existing peer connection and create new one
                peerConnection.close();
                await setupWebRTC();
            } catch (recoveryErr) {
                console.error('Recovery failed:', recoveryErr);
                // Fallback to HTTP streaming
                setupHTTPStreamFallback();
            }
        }
    }
}

async function handleIceCandidate(candidate) {
    if (!peerConnection) return;
    
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
        console.error("Error adding ICE candidate:", err);
    }
}

function setupHTTPStreamFallback() {
    if (!streamVideo) return;
    
    console.log("Using HTTP streaming fallback");
    startHTTPStream();
}

function startHTTPStream() {
    stopHTTPStream();
    
    if (streamVideo) {
        console.log(`Starting auto-refresh stream for ${currentCameraId}`);
        
        refreshStreamImage();
        streamRefreshInterval = setInterval(refreshStreamImage, REFRESH_INTERVAL_MS);
    }
}

function stopHTTPStream() {
    if (streamRefreshInterval) {
        clearInterval(streamRefreshInterval);
        streamRefreshInterval = null;
    }
    if (streamVideo) {
        streamVideo.src = '';
    }
}

function refreshStreamImage() {
    if (!streamVideo) return;
    
    const timestamp = Date.now();
    const streamUrl = `${STREAMING_HTTP_URL}/api/stream/frame?camera_id=${currentCameraId}&t=${timestamp}`;
    
    streamVideo.src = streamUrl;
    
    streamVideo.onloadeddata = function() {
        errorCount = 0;
        updateConnectionStatus(currentCameraId, true);
    };
    
    streamVideo.onerror = function() {
        errorCount++;
        console.error(`Stream error ${errorCount}/${MAX_ERRORS} for ${currentCameraId}`);
        updateConnectionStatus(currentCameraId, false);
        
        if (errorCount >= MAX_ERRORS) {
            console.error('Too many stream errors, trying to recover...');
            errorCount = 0;
            loadCameraList();
        }
    };
}

// ============================================
// POSE ANALYSIS DISPLAY
// ============================================

function updatePoseDisplay(poseData) {
    // Update UI with pose analysis data
    const poseDisplay = document.getElementById('poseDisplay');
    if (!poseDisplay) {
        // Create pose display if it doesn't exist
        const display = document.createElement('div');
        display.id = 'poseDisplay';
        display.style.cssText = 'position: absolute; top: 100px; left: 20px; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 5px;';
        document.body.appendChild(display);
    }
    
    const display = document.getElementById('poseDisplay');
    if (poseData && poseData.label) {
        display.innerHTML = `
            <div><strong>Activity:</strong> ${poseData.label}</div>
            ${poseData.torso_angle ? `<div><strong>Torso Angle:</strong> ${poseData.torso_angle.toFixed(1)}°</div>` : ''}
            ${poseData.thigh_uprightness ? `<div><strong>Thigh Uprightness:</strong> ${poseData.thigh_uprightness.toFixed(1)}°</div>` : ''}
            ${poseData.fall_detected ? `<div style="color: red;"><strong>FALL DETECTED!</strong></div>` : ''}
        `;
        display.style.display = 'block';
    } else {
        display.style.display = 'none';
    }
}

// ============================================
// CAMERA MANAGEMENT - ALL REQUESTS TO STREAMING SERVER
// ============================================

async function loadCameraList() {
    try {
        if (cameraInfoSpan) cameraInfoSpan.textContent = 'Loading cameras...';
        
        // Request to Streaming Server - load cameras
        const camerasResponse = await fetch(`${STREAMING_HTTP_URL}/api/stream/cameras`);
        
        // SIMULTANEOUSLY load pending registrations
        const pendingResponse = await fetch(`${STREAMING_HTTP_URL}/api/stream/pending`);
        
        if (camerasResponse.ok && pendingResponse.ok) {
            const camerasData = await camerasResponse.json();
            const pendingData = await pendingResponse.json();
            
            // Update available cameras
            availableCameras = camerasData.cameras || [];
            
            // CRITICAL: Update pending registrations
            pendingRegistrations = pendingData.pending || [];
            console.log(`Synced pending registrations: ${pendingRegistrations.length}`);
            
            updateCameraSelect(availableCameras);
            
            if (cameraInfoSpan) {
                const connectedCount = camerasData.connected_count || 0;
                cameraInfoSpan.textContent = `${connectedCount}/${camerasData.count} camera(s) connected`;
                cameraInfoSpan.style.color = connectedCount > 0 ? '#4CAF50' : '#ff4444';
            }
            
            // Update connection status for ALL cameras
            availableCameras.forEach(camera => {
                updateConnectionStatus(camera.camera_id, camera.online, camera.age_seconds);
            });
            
            // Update registration button status (NOW it has the latest data)
            updateRegistrationButton();
            
        } else {
            throw new Error(`HTTP error: cameras=${camerasResponse.status}, pending=${pendingResponse.status}`);
        }
    } catch (error) {
        console.error('Failed to load camera list:', error);
        if (cameraInfoSpan) {
            cameraInfoSpan.textContent = 'Connection error';
            cameraInfoSpan.style.color = '#ff4444';
        }
    }
}

function updateCameraSelect(cameras) {
    if (!cameraSelect) return;
    
    const currentValue = cameraSelect.value;
    const previousCameraId = currentCameraId;
    
    console.log(`Updating camera list. Previous camera: ${previousCameraId}, Current selection: ${currentValue}`);
    
    cameraSelect.innerHTML = '<option value="" disabled>Select a camera</option>';
    
    if (!cameras || cameras.length === 0) {
        const option = document.createElement('option');
        option.value = "camera_000";
        option.textContent = "No cameras available";
        cameraSelect.appendChild(option);
        cameraSelect.value = "camera_000";
        
        if (previousCameraId && previousCameraId !== "camera_000") {
            console.log(`No cameras available now, was on ${previousCameraId}. Stopping stream.`);
            currentCameraId = "camera_000";
            currentCameraName = "No Camera";
            stopHTTPStream();
        }
        return;
    }
    
    // Separate registered and unregistered cameras
    const registeredCameras = [];
    const unregisteredCameras = [];
    
    cameras.forEach(camera => {
        if (camera.registered) {
            registeredCameras.push(camera);
        } else {
            unregisteredCameras.push(camera);
        }
    });
    
    // Add registered cameras first
    if (registeredCameras.length > 0) {
        const group = document.createElement('optgroup');
        group.label = "📹 Registered Cameras";
        registeredCameras.forEach(camera => {
            const option = document.createElement('option');
            option.value = camera.camera_id;
            
            const timeAgo = Math.round(camera.age_seconds || 0);
            const status = camera.online ? '✓' : '✗';
            const statusText = camera.online ? 'Connected' : 'Disconnected';
            
            option.textContent = `${camera.camera_name} ${status}`;
            option.title = `${statusText}, ${timeAgo}s ago`;
            option.style.color = camera.online ? '#4CAF50' : '#ff4444';
            
            group.appendChild(option);
        });
        cameraSelect.appendChild(group);
    }
    
    // Add unregistered cameras
    if (unregisteredCameras.length > 0) {
        const group = document.createElement('optgroup');
        group.label = "⏳ Pending Registration";
        unregisteredCameras.forEach(camera => {
            const option = document.createElement('option');
            option.value = camera.camera_id;
            
            const timeAgo = Math.round(camera.age_seconds || 0);
            const status = camera.online ? '⚠️' : '✗';
            
            option.textContent = `${camera.camera_name} ${status}`;
            option.title = `Awaiting approval, ${timeAgo}s ago`;
            option.style.color = '#FF9800';
            option.disabled = true;
            
            group.appendChild(option);
        });
        cameraSelect.appendChild(group);
    }
    
    // Determine new camera ID
    let newCameraId = currentValue;
    let selectedCamera = null;
    
    if (currentValue && cameras.some(cam => cam.camera_id === currentValue)) {
        cameraSelect.value = currentValue;
        newCameraId = currentValue;
        selectedCamera = cameras.find(cam => cam.camera_id === currentValue);
    } else if (registeredCameras.length > 0) {
        cameraSelect.value = registeredCameras[0].camera_id;
        newCameraId = registeredCameras[0].camera_id;
        selectedCamera = registeredCameras[0];
    } else if (unregisteredCameras.length > 0) {
        cameraSelect.value = unregisteredCameras[0].camera_id;
        newCameraId = unregisteredCameras[0].camera_id;
        selectedCamera = unregisteredCameras[0];
    }
    
    // Update camera info
    if (selectedCamera) {
        currentCameraId = newCameraId;
        currentCameraName = selectedCamera.camera_name || selectedCamera.camera_id;
        currentCameraStatus = selectedCamera.registered ? "registered" : "pending";
        updateConnectionStatus(currentCameraId, selectedCamera.online, selectedCamera.age_seconds);
    }
    
    // Only start stream if camera actually changed
    if (previousCameraId !== newCameraId && newCameraId && newCameraId !== "camera_000") {
        console.log(`Camera changed from ${previousCameraId} to ${newCameraId}. Starting stream.`);
        switchCamera(newCameraId);
    } else if (newCameraId && newCameraId !== "camera_000") {
        console.log(`Camera unchanged (${newCameraId}).`);
    }
}

async function switchCamera(cameraId) {
    currentCameraId = cameraId;
    const cameraInfo = availableCameras.find(cam => cam.camera_id === cameraId);
    if (cameraInfo) {
        currentCameraName = cameraInfo.camera_name;
        currentCameraStatus = cameraInfo.registered ? "registered" : "pending";
    }
    
    // Update SignalR group
    if (connection) {
        try {
            await connection.invoke("LeaveCameraStream", currentCameraId);
            await connection.invoke("JoinCameraStream", cameraId);
        } catch (err) {
            console.error("SignalR group switch error:", err);
        }
    }
    
    // Reinitialize streaming for new camera
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    stopHTTPStream();
    
    // Try WebRTC first, fallback to HTTP
    try {
        await initializeWebRTC();
    } catch (err) {
        console.error("Failed to initialize WebRTC:", err);
        startHTTPStream();
    }
    
    await fetchCameraState(cameraId);
    updateConnectionStatus(cameraId, true);
}

// ============================================
// CONNECTION STATUS MANAGEMENT
// ============================================

function updateConnectionStatus(cameraId, connected, ageSeconds = null) {
    cameraConnectionStatus[cameraId] = {
        connected: connected,
        lastUpdate: new Date(),
        ageSeconds: ageSeconds
    };
    
    if (cameraId === currentCameraId) {
        const statusText = connected ? 'Connected' : 'Disconnected';
        
        if (statusIndicator) {
            statusIndicator.textContent = `${currentCameraName}: ${statusText}`;
            statusIndicator.className = '';
            if (connected) {
                statusIndicator.classList.add('connected');
            } else {
                statusIndicator.classList.add('disconnected');
            }
        }
        
        isConnected = connected;
        updateUIControls({});
    }
    
    updateCameraInfoDisplay();
    updateCameraDropdownStatus(cameraId, connected);
}

function updateCameraInfoDisplay() {
    if (cameraInfoSpan) {
        const connectedCameras = availableCameras.filter(cam => cameraConnectionStatus[cam.camera_id]?.connected);
        const connectedCount = connectedCameras.length;
        const totalCount = availableCameras.length;
        
        cameraInfoSpan.textContent = `${connectedCount}/${totalCount} camera(s) connected`;
        cameraInfoSpan.style.color = connectedCount > 0 ? '#4CAF50' : '#ff4444';
    }
}

function updateCameraDropdownStatus(cameraId, connected) {
    if (!cameraSelect) return;
    
    for (let option of cameraSelect.options) {
        if (option.value === cameraId) {
            const timeAgo = Math.round(cameraConnectionStatus[cameraId]?.ageSeconds || 0);
            const status = connected ? '✓' : '✗';
            const statusText = connected ? 'Connected' : 'Disconnected';
            
            const optionText = option.textContent;
            const baseName = optionText.replace(/ [✓✗⚠️]$/, '');
            option.textContent = `${baseName} ${status}`;
            option.title = `${statusText}, ${timeAgo}s ago`;
            option.style.color = connected ? '#4CAF50' : '#ff4444';
            break;
        }
    }
}

async function checkCameraConnection(cameraId) {
    try {
        // Request to Streaming Server for camera status
        const statusResponse = await fetch(`${STREAMING_HTTP_URL}/api/stream/camera-status?camera_id=${cameraId}`);
        
        // Also sync pending registrations periodically
        const pendingResponse = await fetch(`${STREAMING_HTTP_URL}/api/stream/pending`);
        
        if (statusResponse.ok) {
            const data = await statusResponse.json();
            updateConnectionStatus(cameraId, data.connected, data.age_seconds);
            
            // Update pending registrations if available
            if (pendingResponse.ok) {
                const pendingData = await pendingResponse.json();
                pendingRegistrations = pendingData.pending || [];
                updateRegistrationButton();
            }
            
            return data.connected;
        }
        updateConnectionStatus(cameraId, false);
        return false;
    } catch (error) {
        console.error(`Error checking connection for ${cameraId}:`, error);
        updateConnectionStatus(cameraId, false);
        return false;
    }
}

// ============================================
// CAMERA STATE & COMMANDS - ALL TO STREAMING SERVER
// ============================================

async function fetchCameraState(cameraId) {
    try {
        // Request to Streaming Server
        const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/camera-state?camera_id=${cameraId}`);
        if (response.ok) {
            const flags = await response.json();
            updateUIControls(flags);
            
            if (flags.fall_algorithm !== undefined) {
                updateAlgorithmSelection(flags.fall_algorithm, false);
            }
            
            if (flags._connected !== undefined) {
                updateConnectionStatus(cameraId, flags._connected);
            }
            
            return flags;
        }
    } catch (error) {
        console.error(`Failed to fetch state for ${cameraId}:`, error);
        updateConnectionStatus(cameraId, false);
    }
    return null;
}

function updateUIControls(flags) {
    if (!flags) return;
    
    if (typeof flags.record === 'boolean') {
        toggleRecord.checked = flags.record;
        toggleRecord.disabled = !isConnected;
    }
    if (typeof flags.show_raw === 'boolean') {
        toggleRaw.checked = flags.show_raw;
        toggleRaw.disabled = !isConnected;
    }
    if (typeof flags.auto_update_bg === 'boolean') {
        autoUpdateBg.checked = flags.auto_update_bg;
        autoUpdateBg.disabled = !isConnected;
    }
    if (typeof flags.show_safe_area === 'boolean') {
        showSafeArea.checked = flags.show_safe_area;
        showSafeArea.disabled = !isConnected;
    }
    if (typeof flags.use_safety_check === 'boolean') {
        useSafetyCheck.checked = flags.use_safety_check;
        useSafetyCheck.disabled = !isConnected;
    }
    if (typeof flags.hme === 'boolean') {
        toggleHME.checked = flags.hme;
        toggleHME.disabled = !isConnected;
    }
    if (typeof flags.fall_algorithm === 'number') {
        fallAlgorithmSelect.value = flags.fall_algorithm;
        fallAlgorithmSelect.disabled = !isConnected;
    }
    
    setBackgroundBtn.disabled = !isConnected;
    editSafeAreaBtn.disabled = !isConnected;
    
    const styleDisabled = (element, disabled) => {
        if (disabled) {
            element.style.opacity = '0.6';
            element.style.cursor = 'not-allowed';
        } else {
            element.style.opacity = '1';
            element.style.cursor = 'pointer';
        }
    };
    
    styleDisabled(toggleRecord, !isConnected);
    styleDisabled(toggleRaw, !isConnected);
    styleDisabled(autoUpdateBg, !isConnected);
    styleDisabled(showSafeArea, !isConnected);
    styleDisabled(useSafetyCheck, !isConnected);
    styleDisabled(toggleHME, !isConnected);
    styleDisabled(fallAlgorithmSelect, !isConnected);
    styleDisabled(setBackgroundBtn, !isConnected);
    styleDisabled(editSafeAreaBtn, !isConnected);
}

async function sendCommand(command, value = null) {
    if (!isConnected) {
        console.warn(`Cannot send command to disconnected camera: ${currentCameraId}`);
        alert('Camera is disconnected. Please connect a camera first.');
        return;
    }
    
    console.log(`Sending command to ${currentCameraId}: ${command}=${value}`);
    
    try {
        // Request to Streaming Server
        const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/command`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                camera_id: currentCameraId,
                command: command,
                value: value
            })
        });
        
        if (response.ok) {
            console.log(`Command sent successfully`);
        } else {
            console.error(`Command failed: HTTP ${response.status}`);
            updateConnectionStatus(currentCameraId, false);
        }
    } catch (error) {
        console.error('Command error:', error);
        updateConnectionStatus(currentCameraId, false);
    }
}

function updateAlgorithmSelection(algorithmValue, updateCamera = true) {
    const algorithmStr = algorithmValue.toString();
    
    if (fallAlgorithmSelect) {
        fallAlgorithmSelect.value = algorithmStr;
    }
    
    const algorithmCards = document.querySelectorAll('.card');
    algorithmCards.forEach(card => {
        if (card.dataset.algorithm === algorithmStr) {
            card.dataset.active = 'true';
        } else {
            delete card.dataset.active;
        }
    });
    
    if (updateCamera && isConnected && window.sendCommand) {
        console.log(`Setting fall algorithm to: ${algorithmStr}`);
        window.sendCommand("set_fall_algorithm", parseInt(algorithmStr));
    }
}

// ============================================
// SAFE AREA EDITOR
// ============================================

async function loadSafeAreasForCamera(cameraId) {
    try {
        // Request to Streaming Server
        const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/safe-areas?camera_id=${cameraId}`);
        if (response.ok) {
            safeAreas = await response.json();
            console.log(`Loaded ${safeAreas.length} safe areas for ${cameraId}`);
        }
    } catch (error) {
        console.error(`Failed to load safe areas for ${cameraId}:`, error);
        safeAreas = [];
    }
}

async function showSafeAreaEditor() {
    if (!isConnected) {
        alert('Camera is disconnected. Cannot edit safe areas.');
        return;
    }
    
    try {
        await loadSafeAreasForCamera(currentCameraId);
        
        backgroundImage = new Image();
        backgroundImage.onload = function() {
            initializeCanvas();
            safeAreaPopup.style.display = "block";
            isEditing = true;
            drawSafeAreas();
        };
        backgroundImage.onerror = function() {
            alert('Failed to load background image');
        };
        
        // Get current frame for editing from Streaming Server
        const timestamp = Date.now();
        backgroundImage.src = `${STREAMING_HTTP_URL}/api/stream/frame?camera_id=${currentCameraId}&t=${timestamp}`;
        
    } catch (error) {
        console.error('Error showing safe area editor:', error);
        alert('Failed to open safe area editor');
    }
}

function initializeCanvas() {
    if (!backgroundImage) return;
    
    originalImageWidth = backgroundImage.width;
    originalImageHeight = backgroundImage.height;
    
    safeAreaCanvas.width = originalImageWidth;
    safeAreaCanvas.height = originalImageHeight;
    
    const maxWidth = 800;
    const maxHeight = 600;
    const scaleX = maxWidth / originalImageWidth;
    const scaleY = maxHeight / originalImageHeight;
    canvasScale = Math.min(scaleX, scaleY);
    
    safeAreaCanvas.style.width = (originalImageWidth * canvasScale) + 'px';
    safeAreaCanvas.style.height = (originalImageHeight * canvasScale) + 'px';
    
    canvasContext = safeAreaCanvas.getContext('2d');
    
    safeAreaCanvas.addEventListener('click', handleCanvasClick);
    safeAreaCanvas.addEventListener('mousemove', handleCanvasMouseMove);
    safeAreaCanvas.addEventListener('contextmenu', handleCanvasRightClick);
    
    if (newPolygonBtn) newPolygonBtn.onclick = startNewPolygon;
    if (clearAllBtn) clearAllBtn.onclick = clearAllPolygons;
    if (saveSafeAreasBtn) saveSafeAreasBtn.onclick = saveSafeAreas;
}

function getCanvasCoordinates(event) {
    const rect = safeAreaCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    return {
        x: Math.floor(x / canvasScale),
        y: Math.floor(y / canvasScale)
    };
}

function handleCanvasClick(event) {
    if (!isEditing) return;
    
    const { x, y } = getCanvasCoordinates(event);
    const normalizedX = x / originalImageWidth;
    const normalizedY = y / originalImageHeight;
    
    if (currentPolygon.length >= 3) {
        const firstPoint = currentPolygon[0];
        const distance = Math.sqrt(
            Math.pow(normalizedX - firstPoint[0], 2) + 
            Math.pow(normalizedY - firstPoint[1], 2)
        );
        
        if (distance < 0.05) {
            finishCurrentPolygon();
            return;
        }
    }
    
    currentPolygon.push([normalizedX, normalizedY]);
    drawSafeAreas();
}

function handleCanvasMouseMove(event) {
    if (!isEditing || currentPolygon.length === 0) return;
    
    const { x, y } = getCanvasCoordinates(event);
    const normalizedX = x / originalImageWidth;
    const normalizedY = y / originalImageHeight;
    
    drawSafeAreas([...currentPolygon, [normalizedX, normalizedY]]);
}

function handleCanvasRightClick(event) {
    event.preventDefault();
    if (!isEditing || currentPolygon.length === 0) return;
    
    currentPolygon.pop();
    drawSafeAreas();
}

function startNewPolygon() {
    if (currentPolygon.length >= 3) {
        finishCurrentPolygon();
    }
    currentPolygon = [];
    drawSafeAreas();
}

function finishCurrentPolygon() {
    if (currentPolygon.length >= 3) {
        safeAreas.push([...currentPolygon]);
        currentPolygon = [];
        drawSafeAreas();
    }
}

function clearAllPolygons() {
    if (confirm("Clear all safe areas?")) {
        safeAreas = [];
        currentPolygon = [];
        drawSafeAreas();
    }
}

function drawSafeAreas(tempPolygon = null) {
    if (!canvasContext || !backgroundImage) return;
    
    canvasContext.clearRect(0, 0, originalImageWidth, originalImageHeight);
    canvasContext.drawImage(backgroundImage, 0, 0, originalImageWidth, originalImageHeight);
    
    safeAreas.forEach((polygon, index) => {
        drawPolygon(polygon, `hsl(${index * 60}, 70%, 50%)`, true);
    });
    
    const polygonToDraw = tempPolygon || currentPolygon;
    if (polygonToDraw.length > 0) {
        drawPolygon(polygonToDraw, 'cyan', false);
    }
}

function drawPolygon(polygon, color, isComplete) {
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
}

async function saveSafeAreas() {
    if (currentPolygon.length >= 3) {
        safeAreas.push([...currentPolygon]);
        currentPolygon = [];
    }
    
    if (saveStatus) {
        saveStatus.textContent = "Saving...";
        saveStatus.className = "status saving";
    }
    
    try {
        // Request to Streaming Server
        const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/safe-areas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                camera_id: currentCameraId,
                safe_areas: safeAreas
            })
        });
        
        if (response.ok) {
            if (saveStatus) {
                saveStatus.textContent = "Saved successfully!";
                saveStatus.className = "status success";
            }
            
            sendCommand("update_safe_areas", safeAreas);
            
            setTimeout(() => {
                hideSafeAreaPopup();
            }, 1000);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Save error:', error);
        if (saveStatus) {
            saveStatus.textContent = "Save failed";
            saveStatus.className = "status error";
        }
    }
}

function hideSafeAreaPopup() {
    safeAreaPopup.style.display = "none";
    isEditing = false;
    
    if (canvasContext) {
        safeAreaCanvas.removeEventListener('click', handleCanvasClick);
        safeAreaCanvas.removeEventListener('mousemove', handleCanvasMouseMove);
        safeAreaCanvas.removeEventListener('contextmenu', handleCanvasRightClick);
    }
}

// ============================================
// CAMERA REGISTRATION - ALL TO STREAMING SERVER
// ============================================

async function loadPendingRegistrations() {
    try {
        // Request to Streaming Server
        const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/pending`);
        if (response.ok) {
            const data = await response.json();
            pendingRegistrations = data.pending || [];
            console.log(`Loaded ${pendingRegistrations.length} pending registrations:`, pendingRegistrations);
            updateRegistrationButton();
            return pendingRegistrations;
        } else {
            console.error(`Failed to load pending registrations: HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Failed to load pending registrations:', error);
    }
    return [];
}

function updateRegistrationButton() {
    if (pendingRegistrations.length > 0) {
        pendingRegBtn.style.display = 'inline-block';
        pendingRegCount.textContent = pendingRegistrations.length;
        pendingRegBtn.classList.add('pulse');
    } else {
        pendingRegBtn.style.display = 'none';
        pendingRegBtn.classList.remove('pulse');
    }
}

async function showRegistrationPopup() {
    await loadPendingRegistrations();
    
    const popup = document.getElementById('registrationPopup');
    const listDiv = document.getElementById('registrationList');
    const formDiv = document.getElementById('registrationForm');
    
    listDiv.innerHTML = '<h3 style="margin-top: 0; color: var(--theme-primary);">⏳ Pending Camera Registrations:</h3>';
    
    if (pendingRegistrations.length === 0) {
        listDiv.innerHTML += '<p style="text-align: center; color: #aaa; padding: 20px;">No pending registrations.</p>';
    } else {
        pendingRegistrations.forEach(reg => {
            const regDiv = document.createElement('div');
            regDiv.className = 'registration-item';
            regDiv.style.cssText = 'background: var(--theme-surface-light); border: 1px solid var(--theme-border); border-radius: 8px; padding: 15px; margin: 10px 0; cursor: pointer; transition: all 0.2s;';
            regDiv.onmouseenter = () => regDiv.style.backgroundColor = 'rgba(var(--theme-primary-rgb, 74, 158, 255), 0.1)';
            regDiv.onmouseleave = () => regDiv.style.backgroundColor = 'var(--theme-surface-light)';
            regDiv.onclick = () => selectRegistration(reg.camera_id, reg.ip_address);
            
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
    popup.style.display = 'block';
}

async function syncAllCameraData() {
    try {
        console.log('Syncing all camera data...');
        
        // Load cameras and pending registrations together
        const [camerasResponse, pendingResponse] = await Promise.all([
            fetch(`${STREAMING_HTTP_URL}/api/stream/cameras`),
            fetch(`${STREAMING_HTTP_URL}/api/stream/pending`)
        ]);
        
        if (camerasResponse.ok && pendingResponse.ok) {
            const camerasData = await camerasResponse.json();
            const pendingData = await pendingResponse.json();
            
            // Update available cameras
            availableCameras = camerasData.cameras || [];
            
            // Update pending registrations
            pendingRegistrations = pendingData.pending || [];
            
            // Update UI
            updateCameraSelect(availableCameras);
            updateRegistrationButton();
            
            console.log(`Synced: ${availableCameras.length} cameras, ${pendingRegistrations.length} pending`);
            return true;
        }
    } catch (error) {
        console.error('Failed to sync camera data:', error);
    }
    return false;
}

function selectRegistration(cameraId, ip) {
    selectedCameraId = cameraId;
    selectedCameraIp = ip;
    
    const listDiv = document.getElementById('registrationList');
    const formDiv = document.getElementById('registrationForm');
    const ipSpan = document.getElementById('regCameraIP');
    const cameraIdSpan = document.getElementById('regCameraID');
    const nameInput = document.getElementById('cameraNameInput');
    
    ipSpan.textContent = ip;
    cameraIdSpan.textContent = cameraId;
    
    const defaultName = `Camera ${cameraId ? cameraId.split('_').pop() : 'New'}`;
    nameInput.value = defaultName;
    
    listDiv.style.display = 'none';
    
    // Hide the registration close button when showing the form
    const closeBtn = document.getElementById('registrationCloseBtn');
    if (closeBtn) {
        closeBtn.style.display = 'none';
    }
    
    formDiv.style.display = 'block';
}

async function approveRegistration() {
    const cameraName = document.getElementById('cameraNameInput').value.trim();
    
    if (!cameraName) {
        alert('Please enter a camera name.');
        return;
    }
    
    if (!selectedCameraId || !selectedCameraIp) {
        alert('No camera selected.');
        return;
    }
    
    try {
        // Request to Streaming Server
        const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                IpAddress: selectedCameraIp,
                CameraName: cameraName
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            
            pendingRegistrations = pendingRegistrations.filter(reg => reg.camera_id !== selectedCameraId);
            updateRegistrationButton();
            
            await loadPendingRegistrations();
            await loadCameraList();
            
            hideRegistrationPopup();
            
            alert(`✅ Camera registered as: ${cameraName}`);
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert(`❌ Registration failed: ${errorData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('❌ Registration error.');
    }
}

function hideRegistrationPopup() {
    const popup = document.getElementById('registrationPopup');
    popup.style.display = 'none';
    selectedCameraId = null;
    selectedCameraIp = null;
}

function backToRegistrationList() {
    const listDiv = document.getElementById('registrationList');
    const formDiv = document.getElementById('registrationForm');
    
    formDiv.style.display = 'none';
    listDiv.style.display = 'block';
    
    // Show the registration close button again when returning to list view
    const closeBtn = document.getElementById('registrationCloseBtn');
    if (closeBtn) {
        closeBtn.style.display = 'block';
    }
    
    document.getElementById('cameraNameInput').value = '';
    selectedCameraId = null;
    selectedCameraIp = null;
}

// ============================================
// CAMERA MANAGEMENT POPUP - ALL TO STREAMING SERVER
// ============================================

async function showManagementPopup() {
    try {
        // Request to Streaming Server
        const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/registered`);
        if (response.ok) {
            const data = await response.json();
            const cameras = data.cameras || []; // Now it's an array
            
            const listDiv = document.getElementById('managementList');
            listDiv.innerHTML = '<h3 style="margin-top: 0; color: var(--theme-primary);">Registered Cameras:</h3>';
            
            if (cameras.length === 0) {
                listDiv.innerHTML += '<p style="text-align: center; color: #aaa; padding: 20px;">No registered cameras.</p>';
            } else {
                cameras.forEach(camera => {
                    const camDiv = document.createElement('div');
                    camDiv.className = 'camera-item';
                    camDiv.style.cssText = 'background: var(--theme-surface-light); border: 1px solid var(--theme-border); border-radius: 8px; padding: 15px; margin: 10px 0;';
                    
                    const firstSeen = camera.first_seen ? new Date(camera.first_seen * 1000).toLocaleString() : 'Unknown';
                    const lastSeen = camera.last_seen ? new Date(camera.last_seen * 1000).toLocaleString() : 'Unknown';
                    
                    camDiv.innerHTML = `
                        <div class="camera-info">
                            <div class="camera-name">${camera.camera_name || camera.camera_id} (${camera.camera_id})</div>
                            <div class="camera-details">
                                <span>📡 IP: ${camera.ip_address || 'Unknown'}</span>
                                <span>⏰ First seen: ${firstSeen}</span>
                                <span>🕐 Last seen: ${lastSeen}</span>
                            </div>
                        </div>
                        <button onclick="forgetCamera('${camera.camera_id}')" class="forget-btn" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 8px 15px; font-size: 0.9em;">Forget</button>
                    `;
                    
                    listDiv.appendChild(camDiv);
                });
            }
            
            managementPopup.style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to load registered cameras:', error);
        alert('Failed to load camera list');
    }
}

async function forgetCamera(cameraId) {
    if (!confirm(`Are you sure you want to forget camera ${cameraId}? This cannot be undone.`)) {
        return;
    }
    
    try {
        // Request to Streaming Server
        const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/forget`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                camera_id: cameraId
            })
        });
        
        if (response.ok) {
            alert(`✅ Camera ${cameraId} has been forgotten.`);
            
            await loadCameraList();
            
            if (cameraId === currentCameraId) {
                const cameras = await getAvailableCameras();
                if (cameras.length > 0) {
                    currentCameraId = cameras[0].camera_id;
                    cameraSelect.value = currentCameraId;
                    
                    const selectedCamera = cameras.find(cam => cam.camera_id === currentCameraId);
                    currentCameraName = selectedCamera?.camera_name || currentCameraId;
                    
                    switchCamera(currentCameraId);
                } else {
                    currentCameraId = "camera_000";
                    currentCameraName = "No Camera";
                    cameraSelect.value = "camera_000";
                }
            }
            
            showManagementPopup();
        } else {
            alert('❌ Failed to forget camera.');
        }
    } catch (error) {
        console.error('Forget camera error:', error);
        alert('❌ Error forgetting camera.');
    }
}

async function getAvailableCameras() {
    try {
        const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/cameras`);
        if (response.ok) {
            const data = await response.json();
            return data.cameras || [];
        }
    } catch (error) {
        console.error('Failed to get available cameras:', error);
    }
    return [];
}

// ============================================
// EVENT HANDLERS - COMPLETE
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log(`Connected to streaming server: ${STREAMING_HTTP_URL}`);
    
    // Initialize SignalR
    initializeSignalR();
    
    // Start flag sync worker
    startFlagSyncWorker();
    
    // Camera selection
    cameraSelect.onchange = () => {
        currentCameraId = cameraSelect.value;
        const selectedOption = cameraSelect.options[cameraSelect.selectedIndex];
        
        if (selectedOption.disabled) {
            alert('This camera is awaiting registration approval. Please approve it first.');
            const previousCamera = availableCameras.find(cam => cam.camera_id === currentCameraId && cam.registered);
            if (previousCamera) {
                cameraSelect.value = previousCamera.camera_id;
            }
            return;
        }
        
        console.log(`Switched to camera: ${currentCameraId}`);
        
        const cameraInfo = availableCameras.find(cam => cam.camera_id === currentCameraId);
        updateConnectionStatus(currentCameraId, cameraInfo?.online || false);
        
        if (cameraInfo) {
            currentCameraName = cameraInfo.camera_name || cameraInfo.camera_id;
            currentCameraStatus = cameraInfo.registered ? "registered" : "pending";
        }
        
        switchCamera(currentCameraId);
        loadSafeAreasForCamera(currentCameraId);
    };
    
    // Set up refresh button
    refreshCamerasBtn.onclick = async () => {
        console.log("Manually refreshing camera list and status...");
        
        // Force refresh everything
        await loadCameraList(); // This now includes pending registrations sync
        
        if (currentCameraId) {
            await checkCameraConnection(currentCameraId); // This also syncs pending
            await fetchCameraState(currentCameraId);
        }
        
        console.log("Manual refresh completed");
    };
    
    // Control button handlers
    if (toggleRecord) {
        toggleRecord.onchange = () => {
            sendCommand("toggle_record", toggleRecord.checked);
        };
    }
    
    if (toggleRaw) {
        toggleRaw.onchange = () => {
            sendCommand("toggle_raw", toggleRaw.checked);
        };
    }
    
    if (autoUpdateBg) {
        autoUpdateBg.onchange = () => {
            sendCommand("auto_update_bg", autoUpdateBg.checked);
        };
    }
    
    if (showSafeArea) {
        showSafeArea.onchange = () => {
            sendCommand("toggle_safe_area_display", showSafeArea.checked);
        };
    }
    
    if (useSafetyCheck) {
        useSafetyCheck.onchange = () => {
            sendCommand("toggle_safety_check", useSafetyCheck.checked);
        };
    }
    
    if (toggleHME) {
        toggleHME.onchange = () => {
            sendCommand("toggle_hme", toggleHME.checked);
        };
    }
    
    if (setBackgroundBtn) {
        setBackgroundBtn.onclick = () => {
            if (preview && popup) {
                // Capture current frame from video
                const canvas = document.createElement('canvas');
                canvas.width = streamVideo.videoWidth;
                canvas.height = streamVideo.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(streamVideo, 0, 0);
                preview.src = canvas.toDataURL('image/jpeg');
                popup.style.display = "block";
            }
        };
    }
    
    if (editSafeAreaBtn) {
        editSafeAreaBtn.onclick = showSafeAreaEditor;
    }
    
    if (fallAlgorithmSelect) {
        fallAlgorithmSelect.onchange = () => {
            const algorithm = parseInt(fallAlgorithmSelect.value);
            sendCommand("set_fall_algorithm", algorithm);
        };
    }
    
    // Registration and management buttons
    pendingRegBtn.onclick = showRegistrationPopup;
    manageCamerasBtn.onclick = showManagementPopup;
    
    // Load initial data using sync
    syncAllCameraData().then(() => {
        console.log('Initial camera data synced');
        
        if (currentCameraId) {
            fetchCameraState(currentCameraId);
            loadSafeAreasForCamera(currentCameraId);
        }
    });
    
    cameraListTimer = setInterval(syncAllCameraData, 5000); // Every 15 seconds

    cameraStatusTimer = setInterval(() => {
        availableCameras.forEach(camera => {
            checkCameraConnection(camera.camera_id);
        });
        if (currentCameraId) {
            checkCameraConnection(currentCameraId);
        }
    }, 5000);
    
    window.addEventListener('beforeunload', () => {
        stopHTTPStream();
        if (flagSyncWorker) {
            clearInterval(flagSyncWorker);
        }
        if (cameraListTimer) {
            clearInterval(cameraListTimer);
        }
        if (cameraStatusTimer) {
            clearInterval(cameraStatusTimer);
        }
    });
});

// ============================================
// ALGORITHM INFO PANEL FUNCTIONS
// ============================================

function showAlgorithmInfo() {
    // Store current scroll position
    previousScrollPosition = window.scrollY || document.documentElement.scrollTop;
    
    const infoPanel = document.getElementById('algorithmInfo');
    const showBtn = document.getElementById('showInfoBtn');
    
    if (infoPanel) {
        infoPanel.style.display = 'block';
    }
    if (showBtn) {
        showBtn.style.display = 'none';
    }
    
    // Scroll to show the info panel
    setTimeout(() => {
        infoPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function hideAlgorithmInfo() {
    const infoPanel = document.getElementById('algorithmInfo');
    const showBtn = document.getElementById('showInfoBtn');
    
    if (infoPanel) {
        infoPanel.style.display = 'none';
    }
    if (showBtn) {
        showBtn.style.display = 'inline-block';
    }
    
    // Restore previous scroll position
    setTimeout(() => {
        window.scrollTo({
            top: previousScrollPosition,
            behavior: 'smooth'
        });
    }, 100);
}

// ============================================
// GLOBAL EXPORTS
// ============================================

window.confirmBackground = confirmBackground;
window.hidePopup = hidePopup;
window.hideSafeAreaPopup = hideSafeAreaPopup;
window.sendCommand = sendCommand;
window.loadCameraList = loadCameraList;
window.fetchCameraState = fetchCameraState;
window.showRegistrationPopup = showRegistrationPopup;
window.approveRegistration = approveRegistration;
window.backToRegistrationList = backToRegistrationList;
window.hideRegistrationPopup = hideRegistrationPopup;
window.showManagementPopup = showManagementPopup;
window.hideManagementPopup = hideManagementPopup;
window.forgetCamera = forgetCamera;
window.updateAlgorithmSelection = updateAlgorithmSelection;
window.showAlgorithmInfo = showAlgorithmInfo;
window.hideAlgorithmInfo = hideAlgorithmInfo;