using Telegram.Bot;
using Telegram.Bot.Exceptions;
using Telegram.Bot.Polling;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;
using FallDetection.Streaming.Models;

namespace FallDetection.Streaming.Services
{
    public interface ITelegramBotService
    {
        Task SendAlert(string cameraId, string message, NotificationLevel severity);
        Task Start();
        Task Stop();
    }

    public class TelegramBotService : ITelegramBotService
    {
        private readonly TelegramBotClient _botClient;
        private readonly SubscriptionManager _subscriptionManager;
        private readonly ILogger<TelegramBotService> _logger;
        private readonly CancellationTokenSource _cts = new();
        private readonly Dictionary<long, UserConversationState> _conversationStates = new();
        private readonly object _stateLock = new();

        public TelegramBotService(IConfiguration configuration, SubscriptionManager subscriptionManager, ILogger<TelegramBotService> logger)
        {
            var botToken = configuration["Telegram:BotToken"] ?? throw new ArgumentNullException("Telegram:BotToken not configured");
            _botClient = new TelegramBotClient(botToken);
            _subscriptionManager = subscriptionManager;
            _logger = logger;
        }

        public async Task Start()
        {
            var receiverOptions = new ReceiverOptions
            {
                AllowedUpdates = Array.Empty<UpdateType>() // Receive all update types
            };

            _botClient.StartReceiving(
                updateHandler: HandleUpdateAsync,
                pollingErrorHandler: HandlePollingErrorAsync,
                receiverOptions: receiverOptions,
                cancellationToken: _cts.Token
            );

            var me = await _botClient.GetMeAsync();
            Console.WriteLine($"[TelegramBot] Started bot @{me.Username}");
        }

        public async Task Stop()
        {
            _cts.Cancel();
            await Task.CompletedTask;
        }

        private async Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken)
        {
            try
            {
                if (update.Message is { } message)
                {
                    await HandleMessageAsync(message, cancellationToken);
                }
                else if (update.CallbackQuery is { } callbackQuery)
                {
                    await HandleCallbackQueryAsync(callbackQuery, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TelegramBot] Error handling update: {ex.Message}");
            }
        }

        private async Task HandleMessageAsync(Message message, CancellationToken cancellationToken)
        {
            if (message.Text is not { } messageText)
                return;

            var chatId = message.Chat.Id;
            Console.WriteLine($"[TelegramBot] Received message from {chatId}: {messageText}");

            // Check if user is in a conversation flow
            UserConversationState? state = null;
            lock (_stateLock)
            {
                _conversationStates.TryGetValue(chatId, out state);
            }

            if (state != null && state.Step == ConversationStep.AwaitingCameraId)
            {
                await HandleCameraIdInput(chatId, messageText, state, cancellationToken);
                return;
            }

            // Handle commands
            if (messageText.StartsWith('/'))
            {
                var command = messageText.Split(' ')[0].ToLower();
                switch (command)
                {
                    case "/start":
                    case "/help":
                        await SendHelpMessage(chatId, cancellationToken);
                        break;
                    case "/sub":
                        await StartSubscriptionFlow(chatId, cancellationToken);
                        break;
                    case "/unsub":
                        await HandleUnsubscribeCommand(chatId, cancellationToken);
                        break;
                    case "/set_notif_level":
                        await HandleSetNotificationLevelCommand(chatId, cancellationToken);
                        break;
                    default:
                        await _botClient.SendTextMessageAsync(chatId, "Unknown command. Use /help to see available commands.", cancellationToken: cancellationToken);
                        break;
                }
            }
        }

        private async Task SendHelpMessage(long chatId, CancellationToken cancellationToken)
        {
            var helpText = @"🤖 *Fall Detection Bot Commands*

/sub - Subscribe to a camera
/unsub - Unsubscribe from a camera
/set_notif_level - Change notification level for subscribed cameras

*Notification Levels:*
• All - All alerts
• Potentially Unsafe + Falls - Default
• Falls Only - Critical alerts only";

            await _botClient.SendTextMessageAsync(
                chatId,
                helpText,
                parseMode: ParseMode.Markdown,
                cancellationToken: cancellationToken
            );
        }

        private async Task StartSubscriptionFlow(long chatId, CancellationToken cancellationToken)
        {
            lock (_stateLock)
            {
                _conversationStates[chatId] = new UserConversationState
                {
                    ChatId = chatId,
                    Step = ConversationStep.AwaitingCameraId,
                    RetryCount = 0
                };
            }

            await _botClient.SendTextMessageAsync(
                chatId,
                "📹 Please enter the Camera ID you wish to subscribe to (e.g., camera_0001):",
                cancellationToken: cancellationToken
            );
        }

        private async Task HandleCameraIdInput(long chatId, string cameraId, UserConversationState state, CancellationToken cancellationToken)
        {
            // Basic validation
            if (string.IsNullOrWhiteSpace(cameraId) || cameraId.Length < 3)
            {
                state.RetryCount++;
                if (state.RetryCount >= 3)
                {
                    await _botClient.SendTextMessageAsync(chatId, "❌ Too many invalid attempts. Please start over with /sub", cancellationToken: cancellationToken);
                    lock (_stateLock)
                    {
                        _conversationStates.Remove(chatId);
                    }
                    return;
                }

                await _botClient.SendTextMessageAsync(chatId, $"⚠️ Invalid Camera ID. Please try again ({3 - state.RetryCount} attempts remaining):", cancellationToken: cancellationToken);
                return;
            }

            // Subscribe
            var success = _subscriptionManager.Subscribe(chatId, cameraId.Trim());
            if (success)
            {
                await _botClient.SendTextMessageAsync(
                    chatId,
                    $"✅ Subscribed to {cameraId}!\n\n📊 Default notification level: Potentially Unsafe + Falls\n\nUse /set_notif_level to change.",
                    cancellationToken: cancellationToken
                );
            }
            else
            {
                await _botClient.SendTextMessageAsync(chatId, $"⚠️ Already subscribed to {cameraId}", cancellationToken: cancellationToken);
            }

            // Clear conversation state
            lock (_stateLock)
            {
                _conversationStates.Remove(chatId);
            }
        }

        private async Task HandleUnsubscribeCommand(long chatId, CancellationToken cancellationToken)
        {
            var subscriptions = _subscriptionManager.GetSubscriptions(chatId);
            if (subscriptions.Count == 0)
            {
                await _botClient.SendTextMessageAsync(chatId, "ℹ️ You have no active subscriptions.", cancellationToken: cancellationToken);
                return;
            }

            var buttons = subscriptions.Select(s => new[]
            {
                InlineKeyboardButton.WithCallbackData($"📹 {s.CameraId}", $"unsub:{s.CameraId}")
            }).ToList();

            var keyboard = new InlineKeyboardMarkup(buttons);
            await _botClient.SendTextMessageAsync(
                chatId,
                "Select a camera to unsubscribe from:",
                replyMarkup: keyboard,
                cancellationToken: cancellationToken
            );
        }

        private async Task HandleSetNotificationLevelCommand(long chatId, CancellationToken cancellationToken)
        {
            var subscriptions = _subscriptionManager.GetSubscriptions(chatId);
            if (subscriptions.Count == 0)
            {
                await _botClient.SendTextMessageAsync(chatId, "ℹ️ You have no active subscriptions. Use /sub to subscribe first.", cancellationToken: cancellationToken);
                return;
            }

            var buttons = subscriptions.Select(s => new[]
            {
                InlineKeyboardButton.WithCallbackData($"📹 {s.CameraId}", $"setlevel:{s.CameraId}")
            }).ToList();

            var keyboard = new InlineKeyboardMarkup(buttons);
            await _botClient.SendTextMessageAsync(
                chatId,
                "Select a camera to configure:",
                replyMarkup: keyboard,
                cancellationToken: cancellationToken
            );
        }

        private async Task HandleCallbackQueryAsync(CallbackQuery callbackQuery, CancellationToken cancellationToken)
        {
            var chatId = callbackQuery.Message!.Chat.Id;
            var data = callbackQuery.Data ?? "";

            if (data.StartsWith("unsub:"))
            {
                var cameraId = data.Substring(6);
                var success = _subscriptionManager.Unsubscribe(chatId, cameraId);
                await _botClient.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                await _botClient.SendTextMessageAsync(
                    chatId,
                    success ? $"✅ Unsubscribed from {cameraId}" : $"❌ Failed to unsubscribe from {cameraId}",
                    cancellationToken: cancellationToken
                );
            }
            else if (data.StartsWith("setlevel:"))
            {
                var cameraId = data.Substring(9);
                var buttons = new[]
                {
                    new[] { InlineKeyboardButton.WithCallbackData("All", $"level:{cameraId}:0") },
                    new[] { InlineKeyboardButton.WithCallbackData("Potentially Unsafe + Falls", $"level:{cameraId}:1") },
                    new[] { InlineKeyboardButton.WithCallbackData("Falls Only", $"level:{cameraId}:2") }
                };

                var keyboard = new InlineKeyboardMarkup(buttons);
                await _botClient.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                await _botClient.SendTextMessageAsync(
                    chatId,
                    $"Select notification level for {cameraId}:",
                    replyMarkup: keyboard,
                    cancellationToken: cancellationToken
                );
            }
            else if (data.StartsWith("level:"))
            {
                var parts = data.Split(':');
                var cameraId = parts[1];
                var level = (NotificationLevel)int.Parse(parts[2]);

                var success = _subscriptionManager.UpdateNotificationLevel(chatId, cameraId, level);
                await _botClient.AnswerCallbackQueryAsync(callbackQuery.Id, cancellationToken: cancellationToken);
                await _botClient.SendTextMessageAsync(
                    chatId,
                    success ? $"✅ Updated notification level for {cameraId} to {level}" : $"❌ Failed to update notification level",
                    cancellationToken: cancellationToken
                );
            }
        }

        private Task HandlePollingErrorAsync(ITelegramBotClient botClient, Exception exception, CancellationToken cancellationToken)
        {
            var errorMessage = exception switch
            {
                ApiRequestException apiRequestException => $"Telegram API Error:\n[{apiRequestException.ErrorCode}]\n{apiRequestException.Message}",
                _ => exception.ToString()
            };

            Console.WriteLine($"[TelegramBot] Error: {errorMessage}");
            return Task.CompletedTask;
        }

        public async Task SendAlert(string cameraId, string message, NotificationLevel severity)
        {
            var subscriptions = _subscriptionManager.GetSubscriptionsForCamera(cameraId);
            var eligibleSubscriptions = subscriptions
                .Where(subscription => severity >= subscription.NotificationLevel)
                .ToList();

            var alertEmoji = severity == NotificationLevel.FallsOnly ? "🚨" : "⚠️";

            _logger.LogInformation(
                "{Emoji} telegram | camera={CameraId} subs={SubscriberCount} eligible={EligibleSubscriberCount}",
                alertEmoji,
                cameraId,
                subscriptions.Count,
                eligibleSubscriptions.Count);

            if (eligibleSubscriptions.Count == 0)
            {
                _logger.LogInformation(
                    "{Emoji} telegram | camera={CameraId} delivered=no reason=no_eligible_subscribers",
                    alertEmoji,
                    cameraId);
                return;
            }

            var deliveredCount = 0;

            foreach (var subscription in eligibleSubscriptions)
            {
                try
                {
                    await _botClient.SendTextMessageAsync(
                        subscription.ChatId,
                        $"{alertEmoji} *Alert from {EscapeTelegramMarkdownV2(cameraId)}*\n\n{message}",
                        parseMode: ParseMode.MarkdownV2,
                        cancellationToken: _cts.Token
                    );

                    deliveredCount++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "{Emoji} telegram | camera={CameraId} chat={ChatId} delivered=no",
                        alertEmoji,
                        cameraId,
                        subscription.ChatId);
                }
            }

            _logger.LogInformation(
                "{Emoji} telegram | camera={CameraId} delivered={DeliveredCount}/{EligibleSubscriberCount}",
                alertEmoji,
                cameraId,
                deliveredCount,
                eligibleSubscriptions.Count);
        }

        private static string EscapeTelegramMarkdownV2(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            var escaped = value;
            foreach (var character in new[] { "\\", "_", "*", "[", "]", "(", ")", "~", "`", ">", "#", "+", "-", "=", "|", "{", "}", ".", "!" })
            {
                escaped = escaped.Replace(character, $"\\{character}");
            }

            return escaped;
        }
    }
}
