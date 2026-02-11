using System.Text.Json;
using FallDetection.Streaming.Models;

namespace FallDetection.Streaming.Services
{
    public class SubscriptionManager
    {
        private readonly string _subscriptionsFilePath;
        private List<TelegramSubscription> _subscriptions = new();
        private readonly object _subscriptionsLock = new();

        public SubscriptionManager()
        {
            var dataDir = Path.Combine(Directory.GetCurrentDirectory(), "Data");
            _subscriptionsFilePath = Path.Combine(dataDir, "subscriptions.json");

            if (!Directory.Exists(dataDir))
            {
                Directory.CreateDirectory(dataDir);
            }

            LoadSubscriptions();
        }

        private void LoadSubscriptions()
        {
            lock (_subscriptionsLock)
            {
                try
                {
                    if (File.Exists(_subscriptionsFilePath))
                    {
                        var json = File.ReadAllText(_subscriptionsFilePath);
                        _subscriptions = JsonSerializer.Deserialize<List<TelegramSubscription>>(json) ?? new();
                        Console.WriteLine($"[SubscriptionManager] Loaded {_subscriptions.Count} subscriptions");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SubscriptionManager] Error loading subscriptions: {ex.Message}");
                    _subscriptions = new();
                }
            }
        }

        private void SaveSubscriptions()
        {
            lock (_subscriptionsLock)
            {
                try
                {
                    var json = JsonSerializer.Serialize(_subscriptions, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(_subscriptionsFilePath, json);
                    Console.WriteLine($"[SubscriptionManager] Saved {_subscriptions.Count} subscriptions");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SubscriptionManager] Error saving subscriptions: {ex.Message}");
                }
            }
        }

        public bool Subscribe(long chatId, string cameraId, NotificationLevel level = NotificationLevel.PotentiallyUnsafeAndFalls)
        {
            lock (_subscriptionsLock)
            {
                // Check if already subscribed
                var existing = _subscriptions.FirstOrDefault(s => s.ChatId == chatId && s.CameraId == cameraId);
                if (existing != null)
                {
                    return false; // Already subscribed
                }

                _subscriptions.Add(new TelegramSubscription
                {
                    ChatId = chatId,
                    CameraId = cameraId,
                    NotificationLevel = level,
                    SubscribedAt = DateTime.UtcNow
                });

                SaveSubscriptions();
                return true;
            }
        }

        public bool Unsubscribe(long chatId, string cameraId)
        {
            lock (_subscriptionsLock)
            {
                var subscription = _subscriptions.FirstOrDefault(s => s.ChatId == chatId && s.CameraId == cameraId);
                if (subscription == null)
                {
                    return false;
                }

                _subscriptions.Remove(subscription);
                SaveSubscriptions();
                return true;
            }
        }

        public bool UpdateNotificationLevel(long chatId, string cameraId, NotificationLevel level)
        {
            lock (_subscriptionsLock)
            {
                var subscription = _subscriptions.FirstOrDefault(s => s.ChatId == chatId && s.CameraId == cameraId);
                if (subscription == null)
                {
                    return false;
                }

                subscription.NotificationLevel = level;
                SaveSubscriptions();
                return true;
            }
        }

        public List<TelegramSubscription> GetSubscriptions(long chatId)
        {
            lock (_subscriptionsLock)
            {
                return _subscriptions.Where(s => s.ChatId == chatId).ToList();
            }
        }

        public List<TelegramSubscription> GetSubscriptionsForCamera(string cameraId)
        {
            lock (_subscriptionsLock)
            {
                return _subscriptions.Where(s => s.CameraId == cameraId).ToList();
            }
        }

        public List<TelegramSubscription> GetAllSubscriptions()
        {
            lock (_subscriptionsLock)
            {
                return _subscriptions.ToList();
            }
        }
    }
}
