// signalr.js - SignalR connection management

const SignalRManager = {
    connection: null,
    iceCandidatesQueue: [],  // Buffer for ICE candidates received before remote description
    remoteDescriptionSet: false,  // Flag to track if remote description is set

    async initialize() {
        try {
            this.connection = new signalR.HubConnectionBuilder()
                .withUrl(`${STREAMING_HTTP_URL}/streamHub`)
                .configureLogging(signalR.LogLevel.Information)
                .build();

            this.setupEventHandlers();
            await this.connection.start();
            console.log("SignalR connected");
            
            // Join the current camera stream
            if (AppState.currentCameraId) {
                await this.joinCameraStream(AppState.currentCameraId);
            }
            
            return true;
        } catch (err) {
            console.error("SignalR connection error:", err);
            setTimeout(() => this.initialize(), 5000);
            return false;
        }
    },

    setupEventHandlers() {
        this.connection.on("JoinedStream", (cameraId) => {
            console.log(`Joined stream for camera: ${cameraId}`);
        });

        this.connection.on("WebRtcOffer", async (offer) => {
            console.log("Received WebRTC offer from camera");
            await this.handleWebRtcOffer(offer);
        });

        this.connection.on("WebRtcAnswer", async (answer) => {
            console.log("Received WebRTC answer");
            await this.handleWebRtcAnswer(answer);
        });

        this.connection.on("IceCandidate", async (candidate) => {
            console.log("Received ICE candidate");
            await this.handleIceCandidate(candidate);
        });

        this.connection.on("FlagUpdate", (flags) => {
            // console.log("Received flag update from server:", flags);
            UIControls.updateFromFlags(flags);
        });
    },

    async joinCameraStream(cameraId) {
        if (this.connection) {
            try {
                await this.connection.invoke("JoinCameraStream", cameraId);
            } catch (err) {
                console.error("Failed to join camera stream:", err);
            }
        }
    },

    async leaveCameraStream(cameraId) {
        if (this.connection) {
            try {
                await this.connection.invoke("LeaveCameraStream", cameraId);
            } catch (err) {
                console.error("Failed to leave camera stream:", err);
            }
        }
    },

    async sendWebRtcOffer(offer) {
        if (this.connection) {
            await this.connection.invoke("SendWebRtcOffer", {
                cameraId: AppState.currentCameraId,
                sdp: offer.sdp,
                type: offer.type
            });
        }
    },

    async sendWebRtcAnswer(answer) {
        if (this.connection) {
            await this.connection.invoke("SendWebRtcAnswer", {
                cameraId: AppState.currentCameraId,
                sdp: answer.sdp,
                type: answer.type
            });
        }
    },

    async sendIceCandidate(candidate) {
        if (this.connection) {
            await this.connection.invoke("SendIceCandidate", {
                cameraId: AppState.currentCameraId,
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid,
                sdpMLineIndex: candidate.sdpMLineIndex
            });
        }
    },

    async updateFlags(flags) {
        if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke("UpdateFlags", AppState.currentCameraId, flags);
        }
    },

    async handleWebRtcOffer(offer) {
        if (window.peerConnection) {
            await window.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            this.remoteDescriptionSet = true;
            
            // Flush ICE candidates queue after setting remote description
            await this.flushIceCandidatesQueue();
            
            const answer = await window.peerConnection.createAnswer();
            await window.peerConnection.setLocalDescription(answer);
            
            this.sendWebRtcAnswer(answer);
        }
    },

    async handleWebRtcAnswer(answer) {
        if (!window.peerConnection) {
            console.error('No peer connection available to handle answer');
            return;
        }
        
        const state = window.peerConnection.connectionState;
        console.log('Peer connection state when handling answer:', state);
        
        // Only set remote description if we're not already in a stable state
        if (window.peerConnection.remoteDescription && window.peerConnection.remoteDescription.type) {
            console.log('Remote description already set, skipping...');
            return;
        }
        
        try {
            const remoteDesc = new RTCSessionDescription(answer);
            await window.peerConnection.setRemoteDescription(remoteDesc);
            this.remoteDescriptionSet = true;
            console.log('Remote description set successfully');
            
            // Flush the ICE candidates queue
            await this.flushIceCandidatesQueue();
        } catch (err) {
            console.error('Error setting remote description:', err);
            this.handleConnectionError(err);
        }
    },

    async handleIceCandidate(candidate) {
        if (!window.peerConnection) return;
        
        // Check if remote description is set
        if (window.peerConnection.remoteDescription && window.peerConnection.remoteDescription.type) {
            // Remote description is set, add ICE candidate immediately
            try {
                await window.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log("ICE candidate added successfully");
            } catch (err) {
                console.error("Error adding ICE candidate:", err);
            }
        } else {
            // Remote description not set yet, buffer the candidate
            console.log("Buffering ICE candidate (remoteDescription not set yet)");
            this.iceCandidatesQueue.push(candidate);
        }
    },

    async flushIceCandidatesQueue() {
        if (!window.peerConnection || this.iceCandidatesQueue.length === 0) return;
        
        console.log(`Flushing ${this.iceCandidatesQueue.length} buffered ICE candidates`);
        
        for (const candidate of this.iceCandidatesQueue) {
            try {
                await window.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.error("Error adding buffered ICE candidate:", err);
            }
        }
        
        // Clear the queue
        this.iceCandidatesQueue = [];
        this.remoteDescriptionSet = true;
        console.log("ICE candidates queue flushed");
    },

    handleConnectionError(err) {
        if (err.name === 'InvalidStateError') {
            console.log('Connection is in stable state, attempting recovery...');
            // The peer connection recovery is handled by the WebRTC module
        }
    },

    async disconnect() {
        if (this.connection) {
            try {
                await this.connection.stop();
            } catch (err) {
                console.error("Error stopping SignalR:", err);
            }
        }
        this.iceCandidatesQueue = [];
        this.remoteDescriptionSet = false;
    },

    getConnection() {
        return this.connection;
    },

    isConnected() {
        return this.connection && this.connection.state === signalR.HubConnectionState.Connected;
    }
};

// Export
window.SignalRManager = SignalRManager;

