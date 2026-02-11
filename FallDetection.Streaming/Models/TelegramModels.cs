using System.Text.Json.Serialization;

namespace FallDetection.Streaming.Models
{
    public class TelegramSubscription
    {
        [JsonPropertyName("chat_id")]
        public long ChatId { get; set; }

        [JsonPropertyName("camera_id")]
        public string CameraId { get; set; } = string.Empty;

        [JsonPropertyName("notification_level")]
        public NotificationLevel NotificationLevel { get; set; } = NotificationLevel.PotentiallyUnsafeAndFalls;

        [JsonPropertyName("subscribed_at")]
        public DateTime SubscribedAt { get; set; } = DateTime.UtcNow;
    }

    public enum NotificationLevel
    {
        All = 0,
        PotentiallyUnsafeAndFalls = 1,
        FallsOnly = 2
    }

    public class UserConversationState
    {
        public long ChatId { get; set; }
        public ConversationStep Step { get; set; } = ConversationStep.None;
        public int RetryCount { get; set; }
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }

    public enum ConversationStep
    {
        None,
        AwaitingCameraId,
        AwaitingNotificationLevel
    }
}
