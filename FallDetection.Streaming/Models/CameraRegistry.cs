using System.Text.Json.Serialization;

namespace FallDetection.Streaming.Models
{
    public class CameraRegistration
    {
        public string CameraId { get; set; } = string.Empty;
        public string CameraName { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
        public long FirstSeen { get; set; }
        public long LastSeen { get; set; }
        public string ApprovedBy { get; set; } = string.Empty;
        public long ApprovedAt { get; set; }
        public string Status { get; set; } = "registered";
    }

    public class PendingRegistration
    {
        public string CameraId { get; set; } = string.Empty;
        public string IpAddress { get; set; } = string.Empty;
        public long Timestamp { get; set; }
        public string Status { get; set; } = "pending";
    }

    public class RegisterCameraRequest
    {
        public string? CameraId { get; set; }
        public string IpAddress { get; set; } = string.Empty;
        public string? MacAddress { get; set; }
    }

    public class ApproveCameraRequest
    {
        public string IpAddress { get; set; } = string.Empty;
        public string CameraName { get; set; } = string.Empty;
    }

    public class ForgetCameraRequest
    {
        public string CameraId { get; set; } = string.Empty;
    }

    public class CameraRegistryResponse
    {
        public Dictionary<string, CameraRegistration> Cameras { get; set; } = new();
        public int Count { get; set; }
        public int Counter { get; set; }
    }

    public class PendingRegistrationsResponse
    {
        public List<PendingRegistration> Pending { get; set; } = new();
        public int Count { get; set; }
    }
}