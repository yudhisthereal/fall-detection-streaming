using Microsoft.AspNetCore.SignalR;
using FallDetection.Streaming.Models;
using FallDetection.Streaming.Services;

namespace FallDetection.Streaming.Hubs
{
    public class StreamHub : Hub
    {
        private readonly StreamingService _streamingService;
        private readonly CameraManagementService _cameraService;

        public StreamHub(StreamingService streamingService, CameraManagementService cameraService)
        {
            _streamingService = streamingService;
            _cameraService = cameraService;
        }

        public async Task JoinCameraStream(string cameraId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, cameraId);
            _streamingService.AddViewer(cameraId, Context.ConnectionId);
            
            await Clients.Caller.SendAsync("JoinedStream", cameraId);
            Console.WriteLine($"Client {Context.ConnectionId} joined camera stream {cameraId}");
        }

        public async Task LeaveCameraStream(string cameraId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, cameraId);
            _streamingService.RemoveViewer(Context.ConnectionId);
            
            Console.WriteLine($"Client {Context.ConnectionId} left camera stream {cameraId}");
        }

        public async Task SendWebRtcOffer(WebRtcOffer offer)
        {
            _streamingService.StoreWebRtcOffer(offer);
            
            // Forward to all viewers of this camera (except sender)
            await Clients.Group(offer.CameraId).SendAsync("WebRtcOffer", offer);
            Console.WriteLine($"WebRTC offer for camera {offer.CameraId} forwarded to viewers");
        }

        public async Task SendWebRtcAnswer(WebRtcAnswer answer)
        {
            _streamingService.StoreWebRtcAnswer(answer);
            
            // Forward to camera (would need camera connection tracking)
            await Clients.Group(answer.CameraId).SendAsync("WebRtcAnswer", answer);
            Console.WriteLine($"WebRTC answer for camera {answer.CameraId} forwarded");
        }

        public async Task SendIceCandidate(IceCandidate candidate)
        {
            await Clients.Group(candidate.CameraId).SendAsync("IceCandidate", candidate);
        }

        public async Task UpdateFlags(string cameraId, object flags)
        {
            // Broadcast flag updates to all viewers of this camera
            await Clients.Group(cameraId).SendAsync("FlagUpdate", flags);
            Console.WriteLine($"Flag update for camera {cameraId} broadcasted to viewers");
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _streamingService.RemoveViewer(Context.ConnectionId);
            await base.OnDisconnectedAsync(exception);
        }
    }
}