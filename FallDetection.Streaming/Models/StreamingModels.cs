using System.Text.Json;
using System.Text.Json.Serialization;

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

    public class AreaPolygon
    {
        [JsonPropertyName("area_type")]
        public string AreaType { get; set; } = "bed"; // "bed", "floor", "couch", "bench", "chair"

        [JsonPropertyName("coordinates")]
        public List<List<double>> Coordinates { get; set; } = new();

        [JsonPropertyName("name")]
        public string? Name { get; set; }
    }

    public class CameraState
    {
        public Dictionary<string, bool> ControlFlags { get; set; } = new();
        public Dictionary<string, int> ControlFlagsInt { get; set; } = new();

        [JsonPropertyName("max_sleep_duration")]
        public int MaxSleepDuration { get; set; }

        [JsonPropertyName("bedtime")]
        public string Bedtime { get; set; } = string.Empty;

        [JsonPropertyName("wakeup_time")]
        public string WakeupTime { get; set; } = string.Empty;

        [JsonPropertyName("timezone")]
        public string Timezone { get; set; } = "UTC"; // Default to UTC



        // New property that stores areas with type information
        public List<AreaPolygon> EditableAreas { get; set; } = new();

        public string? IpAddress { get; set; }
        public long LastSeen { get; set; }
        public long LastReport { get; set; }

        // Camera status properties reported by camera
        public bool IsRecording { get; set; }
        public bool RtmpConnected { get; set; }
        public string? CameraStatus { get; set; } // "online", "offline", etc.
        public long Timestamp { get; set; }

        // Registration state - true after camera is approved
        public bool IsRegistered { get; set; }

        // Last time an alert was sent for this camera (Unix timestamp)
        public long LastAlertTime { get; set; }

        // Background update tracking for set_background command
        // set_background=True stays true until camera sends background_updated
        public bool BackgroundUpdatePending { get; set; }
        public bool BackgroundUpdateAcknowledged { get; set; }

        // Pose tracking data - keyed by track_id
        // Stores keypoints, pose labels, and safety status per tracked person
        public Dictionary<int, TrackingData> TrackingData { get; set; } = new();
    }

    public class StreamCommand
    {
        public string Command { get; set; } = string.Empty;
        public object? Value { get; set; }
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

    public class StateReportRequest
    {
        [JsonPropertyName("camera_id")]
        public string CameraId { get; set; } = string.Empty;
        public long Timestamp { get; set; }
        public string Status { get; set; } = "online";
        public bool IsRecording { get; set; }
        public bool RtmpConnected { get; set; }
    }

    #region Pose Tracking Models

    /// <summary>
    /// Stores pose tracking data for a single track (person)
    /// </summary>
    public class TrackingData
    {
        [JsonPropertyName("track_id")]
        public int TrackId { get; set; }

        [JsonPropertyName("pose_label")]
        public string? PoseLabel { get; set; }

        [JsonPropertyName("safety_status")]
        public string? SafetyStatus { get; set; }

        [JsonPropertyName("safety_reason")]
        public string? SafetyReason { get; set; }

        [JsonPropertyName("keypoints")]
        public List<float>? Keypoints { get; set; }

        [JsonPropertyName("bbox")]
        public List<double>? Bbox { get; set; }

        [JsonPropertyName("timestamp")]
        public long Timestamp { get; set; }

        [JsonPropertyName("last_updated")]
        public long LastUpdated { get; set; }
    }

    /// <summary>
    /// Request model for pose-label endpoint
    /// </summary>
    public class PoseLabelRequest
    {
        [JsonPropertyName("camera_id")]
        public string CameraId { get; set; } = string.Empty;

        [JsonPropertyName("track_id")]
        public int TrackId { get; set; }

        [JsonPropertyName("pose_label")]
        public string PoseLabel { get; set; } = string.Empty;

        [JsonPropertyName("safety_status")]
        public string SafetyStatus { get; set; } = string.Empty;

        public double Timestamp { get; set; }
    }

    /// <summary>
    /// Request model for keypoints endpoint
    /// </summary>
    public class KeypointsRequest
    {
        [JsonPropertyName("camera_id")]
        public string CameraId { get; set; } = string.Empty;

        [JsonPropertyName("track_id")]
        public int TrackId { get; set; }

        public List<float> Keypoints { get; set; } = new();

        [JsonPropertyName("safety_status")]
        public string SafetyStatus { get; set; } = string.Empty;

        public double Timestamp { get; set; }

        public List<double>? Bbox { get; set; }

        [JsonPropertyName("pose_label")]
        public string PoseLabel { get; set; } = string.Empty;
    }

    /// <summary>
    /// Request model for tracks endpoint - replaces pose-label and keypoints endpoints
    /// </summary>
    public class TracksRequest
    {
        [JsonPropertyName("camera_id")]
        public string CameraId { get; set; } = string.Empty;

        public List<TrackItem> Tracks { get; set; } = new();

        public double Timestamp { get; set; }
    }

    /// <summary>
    /// Individual track item within a tracks request
    /// </summary>
    public class TrackItem
    {
        [JsonPropertyName("track_id")]
        public int TrackId { get; set; }

        [JsonPropertyName("keypoints")]
        public List<float> Keypoints { get; set; } = new();

        [JsonPropertyName("bbox")]
        public List<double>? Bbox { get; set; }

        [JsonPropertyName("pose_label")]
        public string PoseLabel { get; set; } = string.Empty;

        [JsonPropertyName("safety_status")]
        public string SafetyStatus { get; set; } = string.Empty;

        [JsonPropertyName("safety_reason")]
        public string SafetyReason { get; set; } = string.Empty;
    }

    #endregion
}

