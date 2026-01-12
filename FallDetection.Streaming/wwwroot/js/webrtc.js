// webrtc.js - WebRTC implementation for streaming

class WebRTCStreamer {
    constructor(videoElement, signalingServer) {
        this.videoElement = videoElement;
        this.signalingServer = signalingServer;
        this.peerConnection = null;
        this.dataChannel = null;
        this.cameraId = null;
        this.isConnected = false;
    }

    async initialize(cameraId) {
        this.cameraId = cameraId;
        
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

        this.peerConnection = new RTCPeerConnection(configuration);

        // Handle incoming tracks
        this.peerConnection.ontrack = (event) => {
            console.log('Received track from camera');
            if (this.videoElement.srcObject !== event.streams[0]) {
                this.videoElement.srcObject = event.streams[0];
            }
            this.isConnected = true;
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    cameraId: this.cameraId
                });
            }
        };

        // Create data channel for metadata
        this.dataChannel = this.peerConnection.createDataChannel('metadata');
        this.dataChannel.onopen = () => console.log('Data channel opened');
        this.dataChannel.onmessage = (event) => {
            console.log('Metadata received:', event.data);
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                console.log('WebRTC connected successfully');
                this.isConnected = true;
            } else if (this.peerConnection.connectionState === 'disconnected' ||
                       this.peerConnection.connectionState === 'failed' ||
                       this.peerConnection.connectionState === 'closed') {
                console.log('WebRTC disconnected');
                this.isConnected = false;
            }
        };

        // Create and send offer
        const offer = await this.peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });
        
        await this.peerConnection.setLocalDescription(offer);
        
        this.sendSignal({
            type: 'offer',
            sdp: offer.sdp,
            cameraId: this.cameraId
        });
    }

    async handleOffer(offerSdp) {
        if (!this.peerConnection) {
            console.error('Peer connection not initialized');
            return;
        }

        const offer = new RTCSessionDescription({
            type: 'offer',
            sdp: offerSdp
        });

        await this.peerConnection.setRemoteDescription(offer);
        
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        this.sendSignal({
            type: 'answer',
            sdp: answer.sdp,
            cameraId: this.cameraId
        });
    }

    async handleAnswer(answerSdp) {
        if (!this.peerConnection) return;
        
        const answer = new RTCSessionDescription({
            type: 'answer',
            sdp: answerSdp
        });
        
        await this.peerConnection.setRemoteDescription(answer);
    }

    async handleIceCandidate(candidate) {
        if (!this.peerConnection) return;
        
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error('Error adding ICE candidate:', err);
        }
    }

    sendSignal(signal) {
        // This should be implemented to send signals to the signaling server
        // For now, we'll use the global connection
        if (window.connection) {
            if (signal.type === 'offer') {
                window.connection.invoke('SendWebRtcOffer', {
                    cameraId: signal.cameraId,
                    sdp: signal.sdp,
                    type: signal.type
                });
            } else if (signal.type === 'answer') {
                window.connection.invoke('SendWebRtcAnswer', {
                    cameraId: signal.cameraId,
                    sdp: signal.sdp,
                    type: signal.type
                });
            } else if (signal.type === 'ice-candidate') {
                window.connection.invoke('SendIceCandidate', {
                    cameraId: signal.cameraId,
                    candidate: signal.candidate.candidate,
                    sdpMid: signal.candidate.sdpMid,
                    sdpMLineIndex: signal.candidate.sdpMLineIndex
                });
            }
        }
    }

    disconnect() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        if (this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
        this.isConnected = false;
    }
}

// RTMP fallback
function setupRTMPFallback(videoElement, cameraId) {
    // Note: RTMP requires Flash in browsers, which is deprecated
    // For modern browsers, we should use HLS or DASH
    // This is a placeholder implementation
    
    console.log('Setting up RTMP fallback for camera:', cameraId);
    
    // For HLS streaming (if SRS is configured for HLS)
    const hlsUrl = `http://103.150.93.198:8000/live/${cameraId}.m3u8`;
    
    if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoElement);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoElement.play();
        });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari, iOS)
        videoElement.src = hlsUrl;
        videoElement.addEventListener('loadedmetadata', () => {
            videoElement.play();
        });
    } else {
        console.error('HLS not supported in this browser');
        // Show error message to user
        videoElement.parentElement.innerHTML = `
            <div style="padding: 20px; text-align: center; color: white;">
                <h3>Stream Unavailable</h3>
                <p>Your browser does not support the required streaming technology.</p>
                <p>Please try Chrome, Firefox, or Safari.</p>
            </div>
        `;
    }
}

// Export for use in main script
window.WebRTCStreamer = WebRTCStreamer;
window.setupRTMPFallback = setupRTMPFallback;