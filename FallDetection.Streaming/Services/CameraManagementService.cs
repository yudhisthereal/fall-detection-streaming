using System.Text.Json;
using FallDetection.Streaming.Models;

namespace FallDetection.Streaming.Services
{
    public class CameraManagementService
    {
        private readonly HttpClient _httpClient;
        private readonly Dictionary<string, CameraState> _cameraStates = new();
        private readonly Dictionary<string, byte[]> _cameraFrames = new();
        private readonly Dictionary<string, (DateTime timestamp, string sourceAddr, long lastUpload)> _frameInfo = new();
        private readonly object _frameLock = new();
        
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

            lock (_frameLock)
            {
                foreach (var (cameraId, info) in _frameInfo)
                {
                    var isConnected = (currentTime - info.lastUpload) < 30;
                    
                    // Check if camera is registered
                    bool isRegistered = false;
                    lock (_registryLock)
                    {
                        isRegistered = _cameraRegistry.ContainsKey(cameraId);
                    }
                    
                    // If camera has sent frames but is not in registered list, it's pending
                    bool isPending = !isRegistered;
                    
                    cameras.Add(new CameraInfo
                    {
                        CameraId = cameraId,
                        CameraName = _cameraRegistry.TryGetValue(cameraId, out var reg) ? reg.CameraName : $"Camera {cameraId.Split('_').Last()}",
                        IpAddress = info.sourceAddr,
                        LastSeen = info.lastUpload,
                        Online = isConnected,
                        Status = isConnected ? "connected" : "disconnected",
                        AgeSeconds = currentTime - info.lastUpload,
                        Registered = isRegistered,
                        Pending = isPending
                    });
                }
            }

            return Task.FromResult(cameras);
        }

        public void UpdateCameraFrame(string cameraId, byte[] frameData, string sourceAddr)
        {
            lock (_frameLock)
            {
                _cameraFrames[cameraId] = frameData;
                _frameInfo[cameraId] = (DateTime.UtcNow, sourceAddr, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
                
                // Update last seen in registry if camera is registered
                lock (_registryLock)
                {
                    if (_cameraRegistry.TryGetValue(cameraId, out var cameraRegistration))
                    {
                        cameraRegistration.LastSeen = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    }
                }
            }
        }

        public byte[]? GetCameraFrame(string cameraId)
        {
            lock (_frameLock)
            {
                if (_cameraFrames.TryGetValue(cameraId, out var frame))
                {
                    return frame;
                }
                return null;
            }
        }

        public CameraState? GetCameraState(string cameraId)
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
                    ["use_safety_check"] = true,
                    ["analytics_mode"] = true,
                    ["hme"] = false
                },
                ControlFlagsInt = new Dictionary<string, int>
                {
                    ["fall_algorithm"] = 3
                },
                SafeAreas = new List<List<List<double>>>(),
                Connected = false,
                LastSeen = 0
            };

            _cameraStates[cameraId] = defaultState;
            return defaultState;
        }

        public void UpdateCameraState(string cameraId, CameraState state)
        {
            _cameraStates[cameraId] = state;
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