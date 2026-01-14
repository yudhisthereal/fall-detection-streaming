// webrtc.js - WebRTC implementation for SRS streaming

class SrsWebRTCStreamer {
    constructor(videoElement, srsHost) {
        this.videoElement = videoElement;
        this.srsHost = srsHost; // e.g. 103.150.93.198
        this.peerConnection = null;
        this.cameraId = null;
        this.isConnected = false;
    }

    async connect(cameraId) {
        this.cameraId = cameraId;

        const iceServers = [
            {
                urls: "turn:103.150.93.198:3478?transport=udp",
                username: "biofyntnuturn",
                credential: "3Fyx4ENB6AQZhvmo"
            }
        ];

        this.peerConnection = new RTCPeerConnection({
            iceServers,
            iceCandidatePoolSize: 10
        });

        // Receive video
        this.peerConnection.ontrack = (event) => {
            if (this.videoElement.srcObject !== event.streams[0]) {
                this.videoElement.srcObject = event.streams[0];
            }
            this.isConnected = true;
            console.log("[SRS] Track received");
        };

        // ICE state monitoring
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log("[SRS] ICE state:", this.peerConnection.iceConnectionState);

            if (["failed", "disconnected"].includes(this.peerConnection.iceConnectionState)) {
                console.warn("[SRS] ICE failed, restarting ICE");
                this.peerConnection.restartIce();
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log("[SRS] Connection state:", this.peerConnection.connectionState);
            this.isConnected = this.peerConnection.connectionState === "connected";
        };

        // Create SDP offer
        const offer = await this.peerConnection.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: false
        });

        await this.peerConnection.setLocalDescription(offer);

        // Send offer to SRS
        const response = await fetch(`http://${this.srsHost}:1985/rtc/v1/play/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api: `http://${this.srsHost}:1985/rtc/v1/play/`,
                streamurl: `webrtc://${this.srsHost}/live/${this.cameraId}`,
                sdp: offer.sdp
            })
        });

        const result = await response.json();

        if (result.code !== 0) {
            throw new Error("SRS WebRTC play failed: " + JSON.stringify(result));
        }

        // Apply SRS answer
        await this.peerConnection.setRemoteDescription({
            type: "answer",
            sdp: result.sdp
        });

        console.log("[SRS] WebRTC connected");
    }

    disconnect() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(t => t.stop());
            this.videoElement.srcObject = null;
        }

        this.isConnected = false;
        console.log("[SRS] WebRTC disconnected");
    }
}

// RTMP/HLS fallback
function setupRTMPFallback(videoElement, cameraId) {
    console.log('Setting up HLS fallback for camera:', cameraId);
    
    // For HLS streaming (if SRS is configured for HLS)
    const hlsUrl = `http://${window.SRS_HOST || '103.150.93.198'}:8000/live/${cameraId}.m3u8`;
    
    if (Hls && Hls.isSupported()) {
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
window.SrsWebRTCStreamer = SrsWebRTCStreamer;
window.setupRTMPFallback = setupRTMPFallback;
