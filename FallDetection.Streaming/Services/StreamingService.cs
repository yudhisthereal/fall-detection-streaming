using System.Collections.Concurrent;
using FallDetection.Streaming.Models;

namespace FallDetection.Streaming.Services
{
    public class StreamingService
    {
        // Active streams: cameraId -> list of viewer connection IDs
        private readonly ConcurrentDictionary<string, List<string>> _activeStreams = new();
        
        // Viewer connections: connectionId -> cameraId
        private readonly ConcurrentDictionary<string, string> _viewerConnections = new();
        
        // WebRTC offers/answers
        private readonly ConcurrentDictionary<string, WebRtcOffer> _pendingOffers = new();
        private readonly ConcurrentDictionary<string, WebRtcAnswer> _pendingAnswers = new();
        
        public void AddViewer(string cameraId, string connectionId)
        {
            _viewerConnections[connectionId] = cameraId;
            _activeStreams.AddOrUpdate(cameraId,
                new List<string> { connectionId },
                (key, existingList) =>
                {
                    existingList.Add(connectionId);
                    return existingList;
                });
        }
        
        public void RemoveViewer(string connectionId)
        {
            if (_viewerConnections.TryRemove(connectionId, out var cameraId))
            {
                _activeStreams.AddOrUpdate(cameraId,
                    new List<string>(),
                    (key, existingList) =>
                    {
                        existingList.Remove(connectionId);
                        return existingList;
                    });
            }
        }
        
        public List<string> GetViewersForCamera(string cameraId)
        {
            return _activeStreams.TryGetValue(cameraId, out var viewers) 
                ? viewers 
                : new List<string>();
        }
        
        public void StoreWebRtcOffer(WebRtcOffer offer)
        {
            _pendingOffers[offer.CameraId] = offer;
        }
        
        public WebRtcOffer? GetWebRtcOffer(string cameraId)
        {
            return _pendingOffers.TryGetValue(cameraId, out var offer) ? offer : null;
        }
        
        public void StoreWebRtcAnswer(WebRtcAnswer answer)
        {
            _pendingAnswers[answer.CameraId] = answer;
        }
        
        public WebRtcAnswer? GetWebRtcAnswer(string cameraId)
        {
            return _pendingAnswers.TryGetValue(cameraId, out var answer) ? answer : null;
        }
        
        public void CleanupStaleConnections()
        {
            // Clean up connections older than 5 minutes
            // This would need timestamp tracking for connections
        }
    }
}