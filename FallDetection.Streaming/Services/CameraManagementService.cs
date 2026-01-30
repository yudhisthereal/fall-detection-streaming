using System.Text.Json;
using FallDetection.Streaming.Models;

namespace FallDetection.Streaming.Services
{
    public class CameraManagementService
    {
        // Ping timeout: camera considered connected if ping received within this time
        private const int PingTimeoutSeconds = 10;

        // Stale cleanup timeout: remove ping entries older than this
        private const int StaleCleanupSeconds = 10;

        private readonly HttpClient _httpClient;
        private readonly Dictionary<string, CameraState> _cameraStates = new();
        private readonly object _cameraStatesLock = new();

        // Camera ping tracking for connection status
        private readonly Dictionary<string, long> _cameraPings = new();
        private readonly object _cameraPingsLock = new();
        
        // Camera Registry Storage
        private Dictionary<string, CameraRegistration> _cameraRegistry = new();
        private Dictionary<string, PendingRegistration> _pendingRegistrations = new();
        private int _cameraCounter = 0;
        private int _pendingCounter = 0;
        private readonly object _registryLock = new();
        
        private readonly string _registryFilePath;
        private readonly string _pendingRegistryFilePath;
        private readonly string _cameraStatesFilePath;
        
        // Analytics server URL for forwarding analytics data
        private readonly string _analyticsServerUrl = "http://103.127.136.213:5000";

        public CameraManagementService()
        {
            _httpClient = new HttpClient
            {
                Timeout = TimeSpan.FromSeconds(2)
            };
            
            // Setup file paths for persistent storage
            var dataDir = Path.Combine(Directory.GetCurrentDirectory(), "Data");
            _registryFilePath = Path.Combine(dataDir, "camera_registry.json");
            _pendingRegistryFilePath = Path.Combine(dataDir, "pending_cam_registrations.json");
            _cameraStatesFilePath = Path.Combine(dataDir, "camera_states.json");
            
            // Create Data directory if it doesn't exist
            if (!Directory.Exists(dataDir))
            {
                Directory.CreateDirectory(dataDir);
            }
            
            // Load existing registrations and camera states
            LoadCameraRegistry();
            LoadPendingRegistrations();
            LoadCameraStates();
        }

        #region Camera Registry Management
        
        private void LoadCameraRegistry()
        {
            try
            {
                if (File.Exists(_registryFilePath))
                {
                    var json = File.ReadAllText(_registryFilePath);
                    
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    
                    if (root.TryGetProperty("cameras", out var camerasElement))
                    {
                        _cameraRegistry = JsonSerializer.Deserialize<Dictionary<string, CameraRegistration>>(camerasElement.GetRawText()) ?? new();
                    }
                    
                    if (root.TryGetProperty("counter", out var counterElement))
                    {
                        if (counterElement.ValueKind == JsonValueKind.Number)
                        {
                            _cameraCounter = counterElement.GetInt32();
                        }
                        else
                        {
                            _cameraCounter = int.TryParse(counterElement.GetString(), out var parsed) ? parsed : 0;
                        }
                    }
                    
                    Console.WriteLine($"Loaded {_cameraRegistry.Count} cameras from registry, counter: {_cameraCounter}");
                }
                else
                {
                    _cameraRegistry = new();
                    _cameraCounter = 0;
                    Console.WriteLine("No camera registry found, starting fresh");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading camera registry: {ex.Message}");
                _cameraRegistry = new();
                _cameraCounter = 0;
            }
        }

        private void LoadPendingRegistrations()
        {
            try
            {
                if (File.Exists(_pendingRegistryFilePath))
                {
                    var json = File.ReadAllText(_pendingRegistryFilePath);
                    
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    
                    if (root.TryGetProperty("pending_registrations", out var pendingElement))
                    {
                        _pendingRegistrations = JsonSerializer.Deserialize<Dictionary<string, PendingRegistration>>(pendingElement.GetRawText()) ?? new();
                    }
                    
                    if (root.TryGetProperty("counter", out var counterElement))
                    {
                        if (counterElement.ValueKind == JsonValueKind.Number)
                        {
                            _pendingCounter = counterElement.GetInt32();
                        }
                        else
                        {
                            _pendingCounter = int.TryParse(counterElement.GetString(), out var parsed) ? parsed : 0;
                        }
                    }
                    
                    Console.WriteLine($"Loaded {_pendingRegistrations.Count} pending registrations, pending counter: {_pendingCounter}");
                }
                else
                {
                    _pendingRegistrations = new();
                    _pendingCounter = 0;
                    Console.WriteLine("No pending registrations file found, starting fresh");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading pending registrations: {ex.Message}");
                _pendingRegistrations = new();
                _pendingCounter = 0;
            }
        }

        private void SaveCameraRegistry()
        {
            lock (_registryLock)
            {
                try
                {
                    var data = new Dictionary<string, object>
                    {
                        ["cameras"] = _cameraRegistry,
                        ["counter"] = _cameraCounter,
                        ["last_updated"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                    };

                    var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(_registryFilePath, json);
                    Console.WriteLine($"Saved camera registry with {_cameraRegistry.Count} cameras, counter: {_cameraCounter}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error saving camera registry: {ex.Message}");
                }
            }
        }

        private void SavePendingRegistrations()
        {
            lock (_registryLock)
            {
                try
                {
                    var data = new Dictionary<string, object>
                    {
                        ["pending_registrations"] = _pendingRegistrations,
                        ["counter"] = _pendingCounter,
                        ["last_updated"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                    };

                    var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(_pendingRegistryFilePath, json);
                    Console.WriteLine($"Saved pending registrations with {_pendingRegistrations.Count} entries, counter: {_pendingCounter}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error saving pending registrations: {ex.Message}");
                }
            }
        }

        private string GetNextCameraId()
        {
            lock (_registryLock)
            {
                _cameraCounter++;
                return $"camera_{_cameraCounter:D4}";
            }
        }

        public object RegisterCamera(string ipAddress, string? cameraId = null)
        {
            lock (_registryLock)
            {
                // Check if camera with this IP already exists
                foreach (var (camId, camData) in _cameraRegistry)
                {
                    if (camData.IpAddress == ipAddress)
                    {
                        return new
                        {
                            camera_id = camId,
                            camera_name = camData.CameraName,
                            status = "registered"
                        };
                    }
                }

                // If camera_id provided and exists, return it
                if (!string.IsNullOrEmpty(cameraId) && _cameraRegistry.ContainsKey(cameraId))
                {
                    var camData = _cameraRegistry[cameraId];
                    return new
                    {
                        camera_id = cameraId,
                        camera_name = camData.CameraName,
                        status = "registered"
                    };
                }

                // Generate new camera ID if not provided
                var newCameraId = cameraId ?? GetNextCameraId();

                // Store as pending registration
                _pendingRegistrations[ipAddress] = new PendingRegistration
                {
                    CameraId = newCameraId,
                    IpAddress = ipAddress,
                    Timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    Status = "pending"
                };

                // Increment pending counter
                _pendingCounter++;

                // Save pending registrations to file
                SavePendingRegistrations();

                Console.WriteLine($"New camera registration pending from {ipAddress}, camera ID: {newCameraId}");

                return new
                {
                    camera_id = newCameraId,
                    status = "pending",
                    message = "Registration pending user approval"
                };
            }
        }

        public object ApproveCameraRegistration(string ipAddress, string cameraName)
        {
            lock (_registryLock)
            {
                if (!_pendingRegistrations.ContainsKey(ipAddress))
                {
                    return new { error = "No pending registration for this IP" };
                }

                var pendingData = _pendingRegistrations[ipAddress];
                var cameraId = pendingData.CameraId;

                // Add to registry
                _cameraRegistry[cameraId] = new CameraRegistration
                {
                    CameraId = cameraId,
                    CameraName = cameraName,
                    IpAddress = ipAddress,
                    FirstSeen = pendingData.Timestamp,
                    LastSeen = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    ApprovedBy = "user",
                    ApprovedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    Status = "registered"
                };

                // Remove from pending
                _pendingRegistrations.Remove(ipAddress);
                _pendingCounter--;

                // Save pending registrations and registry
                SavePendingRegistrations();
                SaveCameraRegistry();

                // Initialize camera state with default flags and set IsRegistered=true
                // This prevents the camera from updating its own control flags
                InitializeCameraState(cameraId);

                Console.WriteLine($"Camera registered: {cameraId} ({cameraName}) at {ipAddress}");

                return new
                {
                    camera_id = cameraId,
                    camera_name = cameraName,
                    status = "registered"
                };
            }
        }

        public object ForgetCamera(string cameraId)
        {
            lock (_registryLock)
            {
                if (_cameraRegistry.ContainsKey(cameraId))
                {
                    var cameraData = _cameraRegistry[cameraId];
                    _cameraRegistry.Remove(cameraId);
                    SaveCameraRegistry();

                    Console.WriteLine($"Camera {cameraId} ({cameraData.CameraName}) forgotten");

                    return new
                    {
                        status = "success",
                        message = $"Camera {cameraId} forgotten"
                    };
                }
                else
                {
                    return new { error = "Camera not found" };
                }
            }
        }

        public object GetPendingRegistrations()
        {
            lock (_registryLock)
            {
                var pendingList = _pendingRegistrations.Values.Select(reg => new
                {
                    ip_address = reg.IpAddress,
                    camera_id = reg.CameraId,
                    timestamp = reg.Timestamp,
                    age_seconds = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - reg.Timestamp
                }).ToList();

                return new
                {
                    pending = pendingList,
                    count = pendingList.Count
                };
            }
        }

        public object GetRegisteredCameras()
        {
            lock (_registryLock)
            {
                // Convert dictionary to array for JavaScript
                var cameraList = _cameraRegistry.Select(kvp => new
                {
                    camera_id = kvp.Key,
                    camera_name = kvp.Value.CameraName,
                    ip_address = kvp.Value.IpAddress,
                    first_seen = kvp.Value.FirstSeen,
                    last_seen = kvp.Value.LastSeen,
                    status = kvp.Value.Status,
                    approved_by = kvp.Value.ApprovedBy,
                    approved_at = kvp.Value.ApprovedAt
                }).ToList();

                return new
                {
                    cameras = cameraList,  // Now it's a List/Array
                    count = _cameraRegistry.Count,
                    counter = _cameraCounter
                };
            }
        }

        #endregion

        #region Camera Frame and State Management
        
        public Task<List<CameraInfo>> GetCameraListAsync()
        {
            var cameras = new List<CameraInfo>();
            var currentTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

            // Clean up stale cameras first
            CleanupStaleCameras(currentTime);

            foreach (var kvp in _cameraRegistry)
            {
                var cameraId = kvp.Key;
                var cameraData = kvp.Value;
                var lastPing = GetCameraLastPing(cameraId);
                var isConnected = lastPing > 0 && (currentTime - lastPing) <= PingTimeoutSeconds;

                cameras.Add(new CameraInfo
                {
                    CameraId = cameraId,
                    CameraName = cameraData.CameraName,
                    IpAddress = cameraData.IpAddress,
                    LastSeen = lastPing > 0 ? lastPing : cameraData.LastSeen,
                    Online = isConnected,
                    Status = isConnected ? "connected" : "disconnected",
                    AgeSeconds = lastPing > 0 ? currentTime - lastPing : currentTime - cameraData.LastSeen,
                    Registered = true,
                    Pending = false
                });
            }

            // Also include any cameras that have sent pings but are not in registry
            // Thread-safe access to _cameraPings
            List<KeyValuePair<string, long>> pingEntries;
            lock (_cameraPingsLock)
            {
                pingEntries = _cameraPings.ToList();
            }

            foreach (var kvp in pingEntries)
            {
                var cameraId = kvp.Key;
                var lastPing = kvp.Value;
                var isConnected = (currentTime - lastPing) <= PingTimeoutSeconds;

                // Skip if already added from registry
                if (_cameraRegistry.ContainsKey(cameraId))
                    continue;

                cameras.Add(new CameraInfo
                {
                    CameraId = cameraId,
                    CameraName = $"Camera {cameraId.Split('_').Last()}",
                    IpAddress = string.Empty,
                    LastSeen = lastPing,
                    Online = isConnected,
                    Status = isConnected ? "connected" : "disconnected",
                    AgeSeconds = currentTime - lastPing,
                    Registered = false,
                    Pending = true
                });
            }

            return Task.FromResult(cameras);
        }

        public void UpdateCameraPing(string cameraId)
        {
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            
            // Thread-safe update of ping timestamp
            lock (_cameraPingsLock)
            {
                _cameraPings[cameraId] = timestamp;
            }
            
            // Update last seen in registry if camera is registered
            lock (_registryLock)
            {
                if (_cameraRegistry.TryGetValue(cameraId, out var cameraRegistration))
                {
                    cameraRegistration.LastSeen = timestamp;
                }
            }
        }

        public long GetCameraLastPing(string cameraId)
        {
            lock (_cameraPingsLock)
            {
                return _cameraPings.TryGetValue(cameraId, out var timestamp) ? timestamp : 0;
            }
        }

        public bool IsCameraConnected(string cameraId)
        {
            var currentTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var lastPing = GetCameraLastPing(cameraId);
            var isConnected = lastPing > 0 && (currentTime - lastPing) <= PingTimeoutSeconds;

            // Log duration since last ping for current camera
            var duration = lastPing > 0 ? currentTime - lastPing : -1;
            Console.WriteLine($"[CameraManagementService] {cameraId}: LastPing={lastPing}, DurationSinceLastPing={duration}s, Connected={isConnected}");

            return isConnected;
        }

        /// <summary>
        /// Gets the connection status based on ping activity.
        /// Returns true if camera has sent a ping within the last PingTimeoutSeconds.
        /// </summary>

        public void CleanupStaleCameras(long? currentTime = null)
        {
            var now = currentTime ?? DateTimeOffset.UtcNow.ToUnixTimeSeconds();

            // Thread-safe removal of stale ping entries
            lock (_cameraPingsLock)
            {
                // Remove stale ping entries (older than StaleCleanupSeconds)
                var staleCameras = _cameraPings
                    .Where(kvp => (now - kvp.Value) > StaleCleanupSeconds)
                    .Select(kvp => kvp.Key)
                    .ToList();

                foreach (var cameraId in staleCameras)
                {
                    _cameraPings.Remove(cameraId);
                }
            }
        }

        /// <summary>
        /// Get camera state with copied dictionaries to prevent race conditions during JSON serialization
        /// </summary>
        public CameraState? GetCameraState(string cameraId)
        {
            lock (_cameraStatesLock)
            {
                if (_cameraStates.TryGetValue(cameraId, out var state))
                {
                    // Return a copy with copied dictionaries to prevent InvalidOperationException
                    // when other threads modify the collections during serialization
                    return new CameraState
                    {
                        ControlFlags = new Dictionary<string, bool>(state.ControlFlags),
                        ControlFlagsInt = new Dictionary<string, int>(state.ControlFlagsInt),
                        SafeAreas = new List<List<List<double>>>(state.SafeAreas),
                        IpAddress = state.IpAddress,
                        LastSeen = state.LastSeen,
                        LastReport = state.LastReport,
                        IsRecording = state.IsRecording,
                        RtmpConnected = state.RtmpConnected,
                        CameraStatus = state.CameraStatus,
                        Timestamp = state.Timestamp,
                        IsRegistered = state.IsRegistered,
                        BackgroundUpdatePending = state.BackgroundUpdatePending,
                        BackgroundUpdateAcknowledged = state.BackgroundUpdateAcknowledged,
                        // Note: TrackingData is NOT copied here for performance - use GetAllTrackingData() for thread-safe access
                        TrackingData = new Dictionary<int, TrackingData>()
                    };
                }

                // Initialize default state
                var defaultState = new CameraState
                {
                    ControlFlags = new Dictionary<string, bool>
                    {
                        ["record"] = false,
                        ["show_raw"] = false,
                        ["set_background"] = false,
                        ["auto_update_bg"] = false,
                        ["show_safe_area"] = false,
                        ["use_safety_check"] = false,
                        ["analytics_mode"] = true,
                        ["hme"] = false
                    },
                    ControlFlagsInt = new Dictionary<string, int>
                    {
                        ["fall_algorithm"] = 3
                    },
                    SafeAreas = new List<List<List<double>>>(),
                    LastSeen = 0,
                    TrackingData = new Dictionary<int, TrackingData>()
                };

                _cameraStates[cameraId] = defaultState;
                return defaultState;
            }
        }

        public void UpdateCameraState(string cameraId, CameraState state)
        {
            lock (_cameraStatesLock)
            {
                _cameraStates[cameraId] = state;
            }
        }

        #endregion

        #region Camera States Persistence

        private void LoadCameraStates()
        {
            try
            {
                if (File.Exists(_cameraStatesFilePath))
                {
                    var json = File.ReadAllText(_cameraStatesFilePath);
                    
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    
                    if (root.TryGetProperty("camera_states", out var statesElement))
                    {
                        lock (_cameraStatesLock)
                        {
                            var loadedStates = JsonSerializer.Deserialize<Dictionary<string, CameraState>>(statesElement.GetRawText()) ?? new();
                            foreach (var kvp in loadedStates)
                            {
                                _cameraStates[kvp.Key] = kvp.Value;
                            }
                        }
                    }
                    
                    Console.WriteLine($"Loaded {_cameraStates.Count} camera states from file");
                }
                else
                {
                    Console.WriteLine("No camera states file found, starting with empty states");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading camera states: {ex.Message}");
            }
        }

        private void SaveCameraStates()
        {
            lock (_cameraStatesLock)
            {
                try
                {
                    var data = new Dictionary<string, object>
                    {
                        ["camera_states"] = _cameraStates,
                        ["last_updated"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                    };

                    var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(_cameraStatesFilePath, json);
                    Console.WriteLine($"Saved camera states with {_cameraStates.Count} cameras");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error saving camera states: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// Initialize camera state with default control flags. Called when camera is approved.
        /// Sets IsRegistered=true to prevent camera from updating its own flags.
        /// </summary>
        public void InitializeCameraState(string cameraId)
        {
            lock (_cameraStatesLock)
            {
                var defaultState = new CameraState
                {
                    ControlFlags = new Dictionary<string, bool>
                    {
                        ["record"] = false,
                        ["show_raw"] = false,
                        ["set_background"] = false,
                        ["auto_update_bg"] = false,
                        ["show_safe_area"] = false,
                        ["use_safety_check"] = false,
                        ["analytics_mode"] = true,
                        ["hme"] = false
                    },
                    ControlFlagsInt = new Dictionary<string, int>
                    {
                        ["fall_algorithm"] = 3
                    },
                    SafeAreas = new List<List<List<double>>>(),
                    IsRegistered = true,
                    BackgroundUpdatePending = false,
                    BackgroundUpdateAcknowledged = false,
                    LastSeen = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                };

                _cameraStates[cameraId] = defaultState;
                SaveCameraStates();
                Console.WriteLine($"Initialized camera state for {cameraId} with IsRegistered=true");
            }
        }

        /// <summary>
        /// Get the pending background update status for a camera.
        /// Returns true if set_background=True was sent and not yet acknowledged.
        /// </summary>
        public bool GetPendingBackgroundUpdate(string cameraId)
        {
            lock (_cameraStatesLock)
            {
                if (_cameraStates.TryGetValue(cameraId, out var state))
                {
                    return state.BackgroundUpdatePending && !state.BackgroundUpdateAcknowledged;
                }
                return false;
            }
        }

        /// <summary>
        /// Acknowledge that the camera has updated its background.
        /// Called when camera sends background_updated command.
        /// </summary>
        public void AcknowledgeBackgroundUpdate(string cameraId)
        {
            lock (_cameraStatesLock)
            {
                if (_cameraStates.TryGetValue(cameraId, out var state))
                {
                    // Only acknowledge if there was a pending update
                    if (state.BackgroundUpdatePending)
                    {
                        state.BackgroundUpdateAcknowledged = true;
                        state.BackgroundUpdatePending = false;
                        state.ControlFlags["set_background"] = false;
                        _cameraStates[cameraId] = state;
                        SaveCameraStates();
                        Console.WriteLine($"Background update acknowledged for {cameraId}");
                    }
                }
            }
        }

        /// <summary>
        /// Set the background update as pending (called when web sends set_background=True).
        /// </summary>
        public void SetBackgroundUpdatePending(string cameraId)
        {
            lock (_cameraStatesLock)
            {
                if (_cameraStates.TryGetValue(cameraId, out var state))
                {
                    state.BackgroundUpdatePending = true;
                    state.BackgroundUpdateAcknowledged = false;
                    state.ControlFlags["set_background"] = true;
                    _cameraStates[cameraId] = state;
                    SaveCameraStates();
                    Console.WriteLine($"Background update pending for {cameraId}");
                }
            }
        }

        #endregion

        #region Pose Tracking Data Management

        /// <summary>
        /// Store pose label for a specific camera and track
        /// </summary>
        public void StorePoseLabel(string cameraId, int trackId, string poseLabel, string safetyStatus, double timestamp)
        {
            lock (_cameraStatesLock)
            {
                var state = GetCameraState(cameraId);
                if (state == null)
                {
                    Console.WriteLine($"Cannot store pose label: Camera {cameraId} not found");
                    return;
                }

                var currentTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

                if (!state.TrackingData.TryGetValue(trackId, out var trackingData))
                {
                    trackingData = new TrackingData
                    {
                        TrackId = trackId,
                        LastUpdated = currentTime
                    };
                    state.TrackingData[trackId] = trackingData;
                }

                trackingData.PoseLabel = poseLabel;
                trackingData.SafetyStatus = safetyStatus;
                trackingData.Timestamp = (long)timestamp;
                trackingData.LastUpdated = currentTime;

                UpdateCameraState(cameraId, state);
                SaveCameraStates();
                Console.WriteLine($"Stored pose label for camera {cameraId}, track {trackId}: {poseLabel}");
            }
        }

        /// <summary>
        /// Store tracks for a camera - replaces all existing tracking data to prevent zombie tracks
        /// </summary>
        public void StoreTracks(string cameraId, List<TrackItem> tracks, double timestamp)
        {
            lock (_cameraStatesLock)
            {
                var state = GetCameraState(cameraId);
                if (state == null)
                {
                    Console.WriteLine($"[StoreTracks] ERROR: Camera {cameraId} not found");
                    return;
                }

                var currentTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var beforeCount = state.TrackingData.Count;

                // LOG: Incoming tracks data with full details
                var tracksJson = JsonSerializer.Serialize(tracks, new JsonSerializerOptions { WriteIndented = true });
                // Console.WriteLine($"[StoreTracks] Camera {cameraId}: BEFORE={beforeCount} tracks, RECEIVED={tracks.Count} tracks, timestamp={timestamp}");
                // Console.WriteLine($"[StoreTracks] FULL INCOMING TRACKS DATA:\n{tracksJson}");

                // Clear all existing tracking data to prevent zombie tracks
                // Camera is the single source of truth - empty list means no people detected
                state.TrackingData.Clear();

                // Store only the tracks from the current request
                var storedTracks = new List<TrackingData>();
                foreach (var track in tracks)
                {
                    var trackingData = new TrackingData
                    {
                        TrackId = track.TrackId,
                        Keypoints = track.Keypoints,
                        Bbox = track.Bbox,
                        PoseLabel = track.PoseLabel,
                        SafetyStatus = track.SafetyStatus,
                        Timestamp = (long)timestamp,
                        LastUpdated = currentTime
                    };

                    state.TrackingData[track.TrackId] = trackingData;
                    storedTracks.Add(trackingData);
                }

                UpdateCameraState(cameraId, state);
                SaveCameraStates();

                // LOG: After storing with full stored data
                var storedTracksJson = JsonSerializer.Serialize(storedTracks, new JsonSerializerOptions { WriteIndented = true });
                // Console.WriteLine($"[StoreTracks] Camera {cameraId}: AFTER={state.TrackingData.Count} tracks (cleared and stored {tracks.Count} tracks)");
                // Console.WriteLine($"[StoreTracks] FULL STORED TRACKS DATA:\n{storedTracksJson}");
            }
        }

        /// <summary>
        /// Get tracking data for a specific camera and track
        /// Returns a copy to prevent race conditions
        /// </summary>
        public TrackingData? GetTrackingData(string cameraId, int trackId)
        {
            lock (_cameraStatesLock)
            {
                // Get the internal state directly (bypass GetCameraState to avoid extra copying)
                if (_cameraStates.TryGetValue(cameraId, out var state) &&
                    state.TrackingData.TryGetValue(trackId, out var trackingData))
                {
                    // Return a copy with copied collections
                    var trackingDataCopy = new TrackingData
                    {
                        TrackId = trackingData.TrackId,
                        Keypoints = trackingData.Keypoints != null ? new List<float>(trackingData.Keypoints) : null,
                        Bbox = trackingData.Bbox != null ? new List<double>(trackingData.Bbox) : null,
                        PoseLabel = trackingData.PoseLabel,
                        SafetyStatus = trackingData.SafetyStatus,
                        Timestamp = trackingData.Timestamp,
                        LastUpdated = trackingData.LastUpdated
                    };

                    // LOG: Full data being returned
                    var trackingDataJson = JsonSerializer.Serialize(trackingDataCopy, new JsonSerializerOptions { WriteIndented = true });
                    Console.WriteLine($"[GetTrackingData] Camera {cameraId}, TrackId {trackId}: FOUND - returning 1 track");
                    Console.WriteLine($"[GetTrackingData] FULL DATA BEING RETURNED:\n{trackingDataJson}");

                    return trackingDataCopy;
                }

                Console.WriteLine($"[GetTrackingData] Camera {cameraId}, TrackId {trackId}: NOT FOUND");
                return null;
            }
        }

        /// <summary>
        /// Get all tracking data for a camera
        /// Returns a copy to prevent race conditions during JSON serialization
        /// </summary>
        public Dictionary<int, TrackingData>? GetAllTrackingData(string cameraId)
        {
            lock (_cameraStatesLock)
            {
                // Get the internal state directly (bypass GetCameraState to avoid unnecessary copying)
                if (_cameraStates.TryGetValue(cameraId, out var state))
                {
                    var count = state.TrackingData.Count;
                    Console.WriteLine($"[GetAllTrackingData] Camera {cameraId}: returning {count} tracks");

                    // Create a copy for logging
                    var trackingDataCopy = new Dictionary<int, TrackingData>(state.TrackingData);

                    // LOG: Full data being returned
                    var trackingDataJson = JsonSerializer.Serialize(trackingDataCopy, new JsonSerializerOptions { WriteIndented = true });
                    // Console.WriteLine($"[GetAllTrackingData] Camera {cameraId}: FULL DATA BEING RETURNED ({count} tracks):\n{trackingDataJson}");

                    // Return a copy to prevent InvalidOperationException during serialization
                    // when StoreTracks modifies the collection concurrently
                    return trackingDataCopy;
                }

                Console.WriteLine($"[GetAllTrackingData] Camera {cameraId}: state not found");
                return null;
            }
        }

        #endregion

        #region Analytics Server Communication
        
        public async Task ForwardAnalyticsDataAsync(string cameraId, object analyticsData)
        {
            try
            {
                var content = new StringContent(JsonSerializer.Serialize(analyticsData), 
                    System.Text.Encoding.UTF8, "application/json");
                
                var response = await _httpClient.PostAsync($"{_analyticsServerUrl}/api/camera/analytics-data", content);
                
                if (response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"Analytics data forwarded to analytics server for camera {cameraId}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error forwarding analytics data: {ex.Message}");
            }
        }

        #endregion
    }
}