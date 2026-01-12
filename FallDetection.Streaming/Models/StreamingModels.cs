namespace FallDetection.Streaming.Models
{
    public class CameraInfo
    {
        public string CameraId { get; set; } = string.Empty;
        public string CameraName { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
        public long LastSeen { get; set; }
        public bool Online { get; set; }
        public string Status { get; set; } = "disconnected";
        public long AgeSeconds { get; set; }
        public bool Registered { get; set; }
        public bool Pending { get; set; }
    }

    public class CameraState
    {
        public Dictionary<string, bool> ControlFlags { get; set; } = new();
        public Dictionary<string, int> ControlFlagsInt { get; set; } = new(); // Added this line
        public List<List<List<double>>> SafeAreas { get; set; } = new();
        public string? IpAddress { get; set; }
        public long LastSeen { get; set; }
        public long LastReport { get; set; }
        public bool Connected { get; set; }
    }

    public class StreamCommand
    {
        public string Command { get; set; } = string.Empty;
        public object? Value { get; set; }
        public string CameraId { get; set; } = string.Empty;
    }

    public class FrameUploadRequest
    {
        public byte[] FrameData { get; set; } = Array.Empty<byte>();
        public string CameraId { get; set; } = string.Empty;
    }

    public class CameraRegistrationRequest
    {
        public string? CameraId { get; set; }
        public string IpAddress { get; set; } = string.Empty;
    }

    public class WebRtcOffer
    {
        public string CameraId { get; set; } = string.Empty;
        public string Sdp { get; set; } = string.Empty;
        public string Type { get; set; } = "offer";
    }

    public class WebRtcAnswer
    {
        public string CameraId { get; set; } = string.Empty;
        public string Sdp { get; set; } = string.Empty;
        public string Type { get; set; } = "answer";
    }

    public class IceCandidate
    {
        public string CameraId { get; set; } = string.Empty;
        public string Candidate { get; set; } = string.Empty;
        public string SdpMid { get; set; } = string.Empty;
        public int SdpMLineIndex { get; set; }
    }
}