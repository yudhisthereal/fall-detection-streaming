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
        
        // HTTP JPEG frame storage: cameraId -> latest frame data
        private readonly ConcurrentDictionary<string, byte[]> _cameraFrames = new();
        
        // Frame metadata: cameraId -> timestamp
        private readonly ConcurrentDictionary<string, long> _frameTimestamps = new();
        
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
        
        // HTTP JPEG frame methods
        public void StoreFrame(string cameraId, byte[] frameData)
        {
            _cameraFrames[cameraId] = frameData;
            _frameTimestamps[cameraId] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
        
        public byte[]? GetFrame(string cameraId)
        {
            return _cameraFrames.TryGetValue(cameraId, out var frame) ? frame : null;
        }
        
        public long? GetFrameTimestamp(string cameraId)
        {
            return _frameTimestamps.TryGetValue(cameraId, out var timestamp) ? timestamp : null;
        }
        
        public void CleanupStaleConnections()
        {
            // Clean up connections older than 5 minutes
            // This would need timestamp tracking for connections
        }
    }
}