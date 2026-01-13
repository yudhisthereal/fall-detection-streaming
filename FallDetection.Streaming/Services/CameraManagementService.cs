using System.Text.Json;
using FallDetection.Streaming.Models;

namespace FallDetection.Streaming.Services
{
    public class CameraManagementService
    {
        private readonly HttpClient _httpClient;
        private readonly Dictionary<string, CameraState> _cameraStates = new();
        private readonly object _cameraStatesLock = new();
        
        // Camera ping tracking for connection status (1 second timeout)
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
            
            // Create Data directory if it doesn't exist
            if (!Directory.Exists(dataDir))
            {
                Directory.CreateDirectory(dataDir);
            }
            
            // Load existing registrations
            LoadCameraRegistry();
            LoadPendingRegistrations();
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
            var pingTimeoutSeconds = 1;

            // Clean up stale cameras first (mark as disconnected after 1 second of no ping)
            CleanupStaleCameras(currentTime);

            foreach (var kvp in _cameraRegistry)
            {
                var cameraId = kvp.Key;
                var cameraData = kvp.Value;
                var lastPing = GetCameraLastPing(cameraId);
                var isConnected = lastPing > 0 && (currentTime - lastPing) <= pingTimeoutSeconds;

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
                var isConnected = (currentTime - lastPing) <= pingTimeoutSeconds;

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
            return lastPing > 0 && (currentTime - lastPing) <= 1;
        }

        /// <summary>
        /// Gets the connection status based on ping activity.
        /// Returns true if camera has sent a ping within the last 1 second.
        /// </summary>
        public bool GetIsConnected(string cameraId)
        {
            return IsCameraConnected(cameraId);
        }

        public void CleanupStaleCameras(long? currentTime = null)
        {
            var now = currentTime ?? DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var pingTimeoutSeconds = 5;

            // Thread-safe removal of stale ping entries
            lock (_cameraPingsLock)
            {
                // Remove or mark stale ping entries (older than 5 seconds)
                var staleCameras = _cameraPings
                    .Where(kvp => (now - kvp.Value) > pingTimeoutSeconds)
                    .Select(kvp => kvp.Key)
                    .ToList();

                foreach (var cameraId in staleCameras)
                {
                    _cameraPings.Remove(cameraId);
                }
            }
        }

        public CameraState? GetCameraState(string cameraId)
        {
            lock (_cameraStatesLock)
            {
                if (_cameraStates.TryGetValue(cameraId, out var state))
                {
                    return state;
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
                    LastSeen = 0
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