using Microsoft.AspNetCore.Mvc;
using FallDetection.Streaming.Services;
using FallDetection.Streaming.Models;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace FallDetection.Streaming.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class StreamController : ControllerBase
    {
        private readonly CameraManagementService _cameraService;
        private readonly StreamingService _streamingService;
        private readonly ILogger<StreamController> _logger;

        public StreamController(CameraManagementService cameraService, StreamingService streamingService, ILogger<StreamController> logger)
        {
            _cameraService = cameraService;
            _streamingService = streamingService;
            _logger = logger;
        }

        #region Camera Management Endpoints (Moved from Analytics Server)

        [HttpPost("register")]
        public IActionResult RegisterCamera([FromQuery] string? camera_id)
        {
            var ipAddress = HttpContext.Connection.RemoteIpAddress?.MapToIPv4()?.ToString() ?? string.Empty;
            _logger.LogInformation($"Register request from IP: {ipAddress}");

            if (string.IsNullOrEmpty(ipAddress))
            {
                return BadRequest(new { error = "Could not determine IP address" });
            }

            var result = _cameraService.RegisterCamera(ipAddress, camera_id);
            return Ok(result);
        }

        [HttpPost("approve")]
        public IActionResult ApproveCamera([FromBody] ApproveCameraRequest request)
        {
            _logger.LogInformation($"Approve request for IP: {request.IpAddress}, Name: {request.CameraName}");
            _logger.LogInformation($"raw request body: {request}");
            var result = _cameraService.ApproveCameraRegistration(request.IpAddress, request.CameraName);
            return Ok(result);
        }

        [HttpPost("forget")]
        public IActionResult ForgetCamera([FromBody] ForgetCameraRequest request)
        {
            _logger.LogInformation($"Forget request for Camera ID: {request.CameraId}");
            var result = _cameraService.ForgetCamera(request.CameraId);
            return Ok(result);
        }

        [HttpGet("pending")]
        public IActionResult GetPendingRegistrations()
        {
            var result = _cameraService.GetPendingRegistrations();
            return Ok(result);
        }

        [HttpGet("registered")]
        public IActionResult GetRegisteredCameras()
        {
            var result = _cameraService.GetRegisteredCameras();
            return Ok(result);
        }

        #endregion

        #region Streaming Endpoints

        [HttpPost("ping")]
        public IActionResult Ping([FromQuery] string camera_id)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(camera_id))
                {
                    _logger.LogWarning("Ping called with empty camera_id");
                    return BadRequest(new { status = "error", message = "Camera ID is required" });
                }

                if (!System.Text.RegularExpressions.Regex.IsMatch(camera_id, @"^camera_\d{4}$"))
                {
                    _logger.LogWarning("Ping called with invalid camera_id format: {CameraId}", camera_id);
                    return BadRequest(new { status = "error", message = "Invalid camera ID format. Expected format: camera_XXXX" });
                }

                _cameraService.UpdateCameraPing(camera_id);

                _logger.LogDebug("Ping received from {CameraId}", camera_id);

                return Ok(new
                {
                    status = "success",
                    message = "Ping received",
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    camera_id = camera_id
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Ping error for camera {CameraId}", camera_id);
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpPost("report-state")]
        public IActionResult ReportCameraState([FromBody] StateReportRequest report)
        {
            try
            {
                _logger.LogDebug("State report received from {CameraId}: Recording={IsRecording}, RTMP={RtmpConnected}, Status={Status}",
                    report.CameraId, report.IsRecording, report.RtmpConnected, report.Status);

                // Get or create camera state
                var cameraState = _cameraService.GetCameraState(report.CameraId);
                if (cameraState == null)
                {
                    // Camera doesn't exist yet, create a new state
                    // Control flags and safe areas will be initialized by the server (not from camera)
                    cameraState = new CameraState
                    {
                        LastSeen = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                        LastReport = report.Timestamp,
                        CameraStatus = report.Status,
                        IsRecording = report.IsRecording,
                        RtmpConnected = report.RtmpConnected,
                        // Note: Control flags and safe areas are NOT initialized from camera report
                        // They are managed by the server as the single source of truth
                    };

                    _cameraService.UpdateCameraState(report.CameraId, cameraState);
                    _logger.LogInformation("Created new camera state for {CameraId}", report.CameraId);
                }
                else
                {
                    // Update ONLY timestamp and status - NOT control flags or safe areas
                    // Camera is NOT allowed to update its own control flags or safe areas
                    // Those are managed exclusively by the server and web interface
                    cameraState.LastSeen = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    cameraState.LastReport = report.Timestamp;
                    cameraState.CameraStatus = report.Status;
                    cameraState.IsRecording = report.IsRecording;
                    cameraState.RtmpConnected = report.RtmpConnected;

                    _cameraService.UpdateCameraState(report.CameraId, cameraState);
                    _logger.LogDebug("Updated camera state for {CameraId} (timestamp/status only)", report.CameraId);
                }

                return Ok(new
                {
                    status = "success",
                    message = "State report received",
                    camera_id = report.CameraId,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "State report error for camera {CameraId}", report?.CameraId);
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        private bool SafeConvertToBool(object? value)
        {
            if (value == null)
                return false;

            if (value is bool boolValue)
                return boolValue;

            if (value is JsonElement jsonElement)
            {
                return jsonElement.ValueKind switch
                {
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Number => jsonElement.GetDouble() != 0,
                    JsonValueKind.String => bool.TryParse(jsonElement.GetString(), out var result) ? result : false,
                    _ => false
                };
            }

            if (value is string stringValue)
            {
                return bool.TryParse(stringValue, out var result) && result;
            }

            return false;
        }

        private int SafeConvertToInt(object? value)
        {
            if (value == null)
                return 0;

            if (value is int intValue)
                return intValue;

            if (value is long longValue)
                return (int)longValue;

            if (value is JsonElement jsonElement)
            {
                return jsonElement.ValueKind switch
                {
                    JsonValueKind.Number => jsonElement.GetInt32(),
                    JsonValueKind.String => int.TryParse(jsonElement.GetString(), out var result) ? result : 0,
                    _ => 0
                };
            }

            if (value is string stringValue)
            {
                return int.TryParse(stringValue, out var result) ? result : 0;
            }

            return 0;
        }

        [HttpPost("command")]
        public IActionResult SendCommand([FromBody] StreamCommand command)
        {
            try
            {
                // Validate CameraId is provided
                if (string.IsNullOrWhiteSpace(command.CameraId))
                {
                    _logger.LogWarning("Command received with empty CameraId: {Command}", command.Command);
                    return BadRequest(new { status = "error", message = "CameraId is required" });
                }

                _logger.LogInformation("Command received: {Command}={Value} for {CameraId}",
                    command.Command, command.Value, command.CameraId);

                var cameraState = _cameraService.GetCameraState(command.CameraId);
                if (cameraState != null)
                {
                    switch (command.Command)
                    {
                        case "toggle_record":
                            cameraState.ControlFlags["record"] = SafeConvertToBool(command.Value);
                            _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            break;
                        case "toggle_raw":
                            cameraState.ControlFlags["show_raw"] = SafeConvertToBool(command.Value);
                            _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            break;
                        case "auto_update_bg":
                            cameraState.ControlFlags["auto_update_bg"] = SafeConvertToBool(command.Value);
                            _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            break;
                        case "set_background":
                            // Use SetBackgroundUpdatePending to track the update
                            if (SafeConvertToBool(command.Value))
                            {
                                _cameraService.SetBackgroundUpdatePending(command.CameraId);
                            }
                            else
                            {
                                cameraState.ControlFlags["set_background"] = false;
                                _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            }
                            break;
                        case "background_updated":
                            // Camera acknowledges that it has updated the background
                            _cameraService.AcknowledgeBackgroundUpdate(command.CameraId);
                            break;
                        case "toggle_safe_areas_display":
                            cameraState.ControlFlags["show_safe_areas"] = SafeConvertToBool(command.Value);
                            _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            break;
                        case "toggle_bed_areas_display":
                            cameraState.ControlFlags["show_bed_areas"] = SafeConvertToBool(command.Value);
                            _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            break;
                        case "toggle_floor_areas_display":
                            cameraState.ControlFlags["show_floor_areas"] = SafeConvertToBool(command.Value);
                            _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            break;
                        case "toggle_safety_check":
                            cameraState.ControlFlags["use_safety_check"] = SafeConvertToBool(command.Value);
                            _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            break;
                        case "toggle_hme":
                            cameraState.ControlFlags["hme"] = SafeConvertToBool(command.Value);
                            _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            break;
                        case "set_fall_algorithm":
                            var algorithm = SafeConvertToInt(command.Value);
                            if (algorithm >= 1 && algorithm <= 3)
                            {
                                cameraState.ControlFlagsInt["fall_algorithm"] = algorithm;
                                _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            }
                            break;
                        case "set_safety_check_method":
                            var method = SafeConvertToInt(command.Value);
                            if (method >= 1 && method <= 5)
                            {
                                cameraState.ControlFlagsInt["check_method"] = method;
                                _cameraService.UpdateCameraState(command.CameraId, cameraState);
                            }
                            break;
                        case "update_safe_areas":
                            if (command.Value is JsonElement jsonElement)
                            {
                                var editableAreas = JsonSerializer.Deserialize<List<AreaPolygon>>(jsonElement.GetRawText());
                                if (editableAreas != null)
                                {
                                    cameraState.EditableAreas = editableAreas;
                                    _cameraService.UpdateCameraState(command.CameraId, cameraState);
                                }
                            }
                            break;
                    }
                }

                return Ok(new
                {
                    status = "success",
                    command = command.Command,
                    value = command.Value,
                    camera_id = command.CameraId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Command error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("cameras")]
        public async Task<IActionResult> GetCameras()
        {
            try
            {
                var cameras = await _cameraService.GetCameraListAsync();
                var connectedCount = cameras.Count(c => c.Online);

                var cameraList = cameras.Select(c => new
                {
                    camera_id = c.CameraId,
                    camera_name = c.CameraName,
                    ip_address = c.IpAddress,
                    last_seen = c.LastSeen,
                    online = c.Online,
                    status = c.Status,
                    age_seconds = c.AgeSeconds,
                    registered = c.Registered,
                    pending = c.Pending
                }).ToList();

                return Ok(new
                {
                    cameras = cameraList,
                    count = cameras.Count,
                    connected_count = connectedCount,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get cameras error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("camera-state")]
        public IActionResult GetCameraState([FromQuery] string camera_id)
        {
            try
            {
                var state = _cameraService.GetCameraState(camera_id);
                if (state != null)
                {
                    var response = new Dictionary<string, object>();

                    foreach (var flag in state.ControlFlags)
                    {
                        response[flag.Key] = flag.Value;
                    }
                    foreach (var flag in state.ControlFlagsInt)
                    {
                        response[flag.Key] = flag.Value;
                    }

                    // Add connection status
                    response["_connected"] = _cameraService.IsCameraConnected(camera_id);
                    response["_camera_status"] = state.CameraStatus ?? "null";
                    response["_is_recording"] = state.IsRecording;
                    response["_rtmp_connected"] = state.RtmpConnected;
                    response["_last_report"] = state.LastReport;
                    response["_last_seen"] = state.LastSeen;

                    // Add background update tracking
                    response["_background_update_pending"] = state.BackgroundUpdatePending;
                    response["_background_update_acknowledged"] = state.BackgroundUpdateAcknowledged;
                    response["_is_registered"] = state.IsRegistered;

                    return Ok(response);
                }

                return NotFound(new { error = "Camera not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get camera state error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("is-background-updating")]
        public IActionResult IsBackgroundUpdating([FromQuery] string camera_id)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(camera_id))
                {
                    return BadRequest(new { error = "Camera ID is required" });
                }

                var state = _cameraService.GetCameraState(camera_id);
                if (state != null)
                {
                    return Ok(new
                    {
                        background_update_pending = state.BackgroundUpdatePending,
                        background_update_acknowledged = state.BackgroundUpdateAcknowledged
                    });
                }

                return NotFound(new { error = "Camera not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Is background updating error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("camera-status")]
        public IActionResult GetCameraStatus([FromQuery] string camera_id)
        {
            try
            {
                var state = _cameraService.GetCameraState(camera_id);
                if (state != null)
                {
                    var currentTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    var ageSeconds = currentTime - state.LastSeen;

                    return Ok(new
                    {
                        camera_id = camera_id,
                        connected = _cameraService.IsCameraConnected(camera_id),
                        camera_status = state.CameraStatus,
                        is_recording = state.IsRecording,
                        rtmp_connected = state.RtmpConnected,
                        age_seconds = ageSeconds,
                        last_seen = state.LastSeen,
                        last_report = state.LastReport
                    });
                }

                return NotFound(new { error = "Camera not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get camera status error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("safe-areas")]
        public IActionResult GetSafeAreas([FromQuery] string camera_id)
        {
            try
            {
                var state = _cameraService.GetCameraState(camera_id);
                if (state != null)
                {
                    // Return only safe areas for backwards compatibility
                    var safeAreas = state.EditableAreas
                        .Where(a => a.AreaType == "safe")
                        .Select(a => a.Coordinates)
                        .ToList();
                    return Ok(safeAreas);
                }

                return NotFound(new { error = "Camera not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get safe areas error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("bed-areas")]
        public IActionResult GetBedAreas([FromQuery] string camera_id)
        {
            try
            {
                var state = _cameraService.GetCameraState(camera_id);
                if (state != null)
                {
                    var bedAreas = state.EditableAreas
                        .Where(a => a.AreaType == "bed")
                        .Select(a => a.Coordinates)
                        .ToList();
                    return Ok(bedAreas);
                }

                return NotFound(new { error = "Camera not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get bed areas error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("floor-areas")]
        public IActionResult GetFloorAreas([FromQuery] string camera_id)
        {
            try
            {
                var state = _cameraService.GetCameraState(camera_id);
                if (state != null)
                {
                    var floorAreas = state.EditableAreas
                        .Where(a => a.AreaType == "floor")
                        .Select(a => a.Coordinates)
                        .ToList();
                    return Ok(floorAreas);
                }

                return NotFound(new { error = "Camera not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get floor areas error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        #endregion

        #region Pose Tracking Endpoints

        [HttpPost("tracks")]
        public IActionResult StoreTracks([FromBody] TracksRequest request)
        {
            try
            {
                // Validate required fields
                if (string.IsNullOrWhiteSpace(request.CameraId))
                {
                    return BadRequest(new { status = "error", message = "CameraId is required" });
                }

                if (request.Tracks == null)
                {
                    return BadRequest(new { status = "error", message = "Tracks array is required (can be empty list)" });
                }

                // LOG: Full incoming request data
                var incomingDataJson = JsonSerializer.Serialize(request, new JsonSerializerOptions { WriteIndented = true });
                _logger.LogInformation("[POST /api/stream/tracks] RECEIVED REQUEST for CameraId={CameraId}, Timestamp={Timestamp}, TracksCount={TracksCount}\nFULL REQUEST DATA:\n{FullData}",
                    request.CameraId,
                    request.Timestamp,
                    request.Tracks.Count,
                    incomingDataJson);

                // Validate and filter tracks
                var validTracks = new List<TrackItem>();
                var errors = new List<string>();

                // Allow empty lists - they will clear all existing tracks
                if (request.Tracks.Count > 0)
                {
                    foreach (var track in request.Tracks)
                    {
                        // Validate track
                        if (track.TrackId <= 0)
                        {
                            errors.Add($"Invalid track_id: {track.TrackId}");
                            continue;
                        }

                        if (track.Keypoints == null || track.Keypoints.Count == 0)
                        {
                            errors.Add($"Track {track.TrackId} has empty keypoints");
                            continue;
                        }

                        validTracks.Add(track);
                    }
                }

                // LOG: After validation
                _logger.LogInformation("[POST /api/stream/tracks] CameraId={CameraId}: Validation complete - Valid={ValidCount}, Invalid={InvalidCount}",
                    request.CameraId,
                    validTracks.Count,
                    errors.Count);

                // Store all tracks at once - this replaces all existing tracking data to prevent zombie tracks
                // Empty list will clear all existing tracks
                _cameraService.StoreTracks(request.CameraId, validTracks, request.Timestamp);

                var processedTracks = validTracks.Select(t => new
                {
                    track_id = t.TrackId,
                    keypoints_count = t.Keypoints.Count,
                    pose_label = t.PoseLabel,
                    safety_status = t.SafetyStatus
                }).ToList();

                // LOG: Response data
                var responseJson = JsonSerializer.Serialize(new
                {
                    status = "success",
                    message = "Tracks stored",
                    camera_id = request.CameraId,
                    tracks_processed = processedTracks.Count,
                    total_tracks = request.Tracks.Count,
                    errors = errors.Count > 0 ? errors : null,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                }, new JsonSerializerOptions { WriteIndented = true });

                _logger.LogInformation("[POST /api/stream/tracks] CameraId={CameraId}: RESPONSE - Processed={ProcessedCount}, Total={TotalCount}\nFULL RESPONSE DATA:\n{FullResponse}",
                    request.CameraId,
                    processedTracks.Count,
                    request.Tracks.Count,
                    responseJson);

                return Ok(new
                {
                    status = "success",
                    message = "Tracks stored",
                    camera_id = request.CameraId,
                    tracks_processed = processedTracks.Count,
                    total_tracks = request.Tracks.Count,
                    errors = errors.Count > 0 ? errors : null,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[POST /api/stream/tracks] Tracks storage error for camera {CameraId}", request?.CameraId);
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("tracks")]
        public IActionResult GetTrackingData([FromQuery] string camera_id, [FromQuery] int? track_id)
        {
            try
            {
                // LOG: Incoming GET request
                // _logger.LogInformation("[GET /api/stream/tracks] RECEIVED REQUEST for CameraId={CameraId}, TrackId={TrackId}",
                //     camera_id,
                //     track_id.HasValue ? track_id.Value.ToString() : "null (getting all tracks)");

                if (string.IsNullOrWhiteSpace(camera_id))
                {
                    _logger.LogWarning("[GET /api/stream/tracks] Request with empty camera_id");
                    return BadRequest(new { status = "error", message = "CameraId is required" });
                }

                if (track_id.HasValue && track_id.Value > 0)
                {
                    // Get specific track data
                    var trackingData = _cameraService.GetTrackingData(camera_id, track_id.Value);
                    if (trackingData != null)
                    {
                        var responseJson = JsonSerializer.Serialize(new
                        {
                            camera_id = camera_id,
                            track_id = track_id.Value,
                            tracking_data = trackingData
                        }, new JsonSerializerOptions { WriteIndented = true });

                        // _logger.LogInformation("[GET /api/stream/tracks] CameraId={CameraId}, TrackId={TrackId}: Returning 1 track\nFULL RESPONSE DATA:\n{FullResponse}",
                        //     camera_id,
                        //     track_id.Value,
                        //     responseJson);

                        return Ok(new
                        {
                            camera_id = camera_id,
                            track_id = track_id.Value,
                            tracking_data = trackingData
                        });
                    }

                    _logger.LogWarning("[GET /api/stream/tracks] CameraId={CameraId}, TrackId={TrackId}: Tracking data not found",
                        camera_id,
                        track_id.Value);
                    return NotFound(new { error = "Tracking data not found for specified camera and track" });
                }
                else
                {
                    // Get all tracking data for camera
                    var allTrackingData = _cameraService.GetAllTrackingData(camera_id);
                    // Always return tracking data, even if empty (empty dictionary)
                    var trackingData = allTrackingData ?? new Dictionary<int, TrackingData>();

                    var responseJson = JsonSerializer.Serialize(new
                    {
                        camera_id = camera_id,
                        tracking_data = trackingData,
                        track_count = trackingData.Count
                    }, new JsonSerializerOptions { WriteIndented = true });

                    // _logger.LogInformation("[GET /api/stream/tracks] CameraId={CameraId}: Returning {TrackCount} tracks\nFULL RESPONSE DATA:\n{FullResponse}",
                    //     camera_id,
                    //     trackingData.Count,
                    //     responseJson);

                    return Ok(new
                    {
                        camera_id = camera_id,
                        tracking_data = trackingData,
                        track_count = trackingData.Count
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[GET /api/stream/tracks] Get tracking data error for camera {CameraId}", camera_id);
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        #endregion

        #region Safe Areas Endpoints

        [HttpPost("safe-areas")]
        public IActionResult UpdateSafeAreas([FromBody] SafeAreasRequest request)
        {
            try
            {
                var state = _cameraService.GetCameraState(request.CameraId);
                if (state != null)
                {
                    if (request.EditableAreas != null)
                    {
                        state.EditableAreas = request.EditableAreas;
                    }
                    else
                    {
                        Console.WriteLine("EditableAreas is null");
                    }
                    _cameraService.UpdateCameraState(request.CameraId, state);

                    return Ok(new
                    {
                        status = "success",
                        camera_id = request.CameraId,
                        areas_count = request.EditableAreas?.Count ?? 0
                    });
                }

                return NotFound(new { error = "Camera not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Update safe areas error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        #endregion

        #region HTTP JPEG Streaming Endpoints

        [HttpPost("upload-frame")]
        public async Task<IActionResult> UploadFrame()
        {
            try
            {
                // Get camera ID from header
                var cameraId = Request.Headers["X-Camera-ID"].ToString();

                if (string.IsNullOrWhiteSpace(cameraId))
                {
                    _logger.LogWarning("Frame upload received without X-Camera-ID header");
                    return BadRequest(new { status = "error", message = "X-Camera-ID header is required" });
                }

                // Validate camera ID format
                if (!System.Text.RegularExpressions.Regex.IsMatch(cameraId, @"^camera_\d{4}$"))
                {
                    _logger.LogWarning("Frame upload with invalid camera_id format: {CameraId}", cameraId);
                    return BadRequest(new { status = "error", message = "Invalid camera ID format. Expected format: camera_XXXX" });
                }

                // Read the frame data from request body
                using var memoryStream = new MemoryStream();
                await Request.Body.CopyToAsync(memoryStream);
                var frameData = memoryStream.ToArray();

                if (frameData.Length == 0)
                {
                    _logger.LogWarning("Empty frame received from {CameraId}", cameraId);
                    return BadRequest(new { status = "error", message = "Frame data is empty" });
                }

                // Validate it's a JPEG (starts with FFD8)
                if (frameData.Length < 2 || frameData[0] != 0xFF || frameData[1] != 0xD8)
                {
                    _logger.LogWarning("Invalid frame format from {CameraId} - not a JPEG", cameraId);
                    return BadRequest(new { status = "error", message = "Frame must be JPEG format (FFD8)" });
                }

                // Store the frame
                _streamingService.StoreFrame(cameraId, frameData);

                _logger.LogDebug("Frame stored for {CameraId}, size: {Size} bytes", cameraId, frameData.Length);

                return Ok(new
                {
                    status = "success",
                    camera_id = cameraId,
                    size = frameData.Length,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Frame upload error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpPost("upload-bg")]
        public async Task<IActionResult> UploadBackground()
        {
            try
            {
                // Get camera ID from header
                var cameraId = Request.Headers["X-Camera-ID"].ToString();

                if (string.IsNullOrWhiteSpace(cameraId))
                {
                    _logger.LogWarning("Background upload received without X-Camera-ID header");
                    return BadRequest(new { status = "error", message = "X-Camera-ID header is required" });
                }

                // Validate camera ID format
                if (!System.Text.RegularExpressions.Regex.IsMatch(cameraId, @"^camera_\d{4}$"))
                {
                    _logger.LogWarning("Background upload with invalid camera_id format: {CameraId}", cameraId);
                    return BadRequest(new { status = "error", message = "Invalid camera ID format. Expected format: camera_XXXX" });
                }

                // Read the background data from request body
                using var memoryStream = new MemoryStream();
                await Request.Body.CopyToAsync(memoryStream);
                var backgroundData = memoryStream.ToArray();

                if (backgroundData.Length == 0)
                {
                    _logger.LogWarning("Empty background received from {CameraId}", cameraId);
                    return BadRequest(new { status = "error", message = "Background data is empty" });
                }

                // Validate it's a JPEG (starts with FFD8)
                if (backgroundData.Length < 2 || backgroundData[0] != 0xFF || backgroundData[1] != 0xD8)
                {
                    _logger.LogWarning("Invalid background format from {CameraId} - not a JPEG", cameraId);
                    return BadRequest(new { status = "error", message = "Background must be JPEG format (FFD8)" });
                }

                // Store the background in memory and filesystem
                _streamingService.StoreBackground(cameraId, backgroundData);

                _logger.LogDebug("Background stored for {CameraId}, size: {Size} bytes", cameraId, backgroundData.Length);

                return Ok(new
                {
                    status = "success",
                    camera_id = cameraId,
                    size = backgroundData.Length,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background upload error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("frame")]
        public IActionResult GetFrame([FromQuery] string camera_id)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(camera_id))
                {
                    _logger.LogWarning("Frame request received without camera_id query parameter");
                    return BadRequest(new { status = "error", message = "camera_id query parameter is required" });
                }

                // Validate camera ID format
                if (!System.Text.RegularExpressions.Regex.IsMatch(camera_id, @"^camera_\d{4}$"))
                {
                    _logger.LogWarning("Frame request with invalid camera_id format: {CameraId}", camera_id);
                    return BadRequest(new { status = "error", message = "Invalid camera ID format. Expected format: camera_XXXX" });
                }

                var frameData = _streamingService.GetFrame(camera_id);
                var frameTimestamp = _streamingService.GetFrameTimestamp(camera_id);

                if (frameData == null || frameData.Length == 0)
                {
                    _logger.LogDebug("No frame available for {CameraId}", camera_id);
                    return NotFound(new { status = "error", message = "No frame available for this camera" });
                }

                // Return the JPEG image with proper caching headers
                Response.Headers.Append("Cache-Control", "no-cache, no-store, must-revalidate");
                Response.Headers.Append("Pragma", "no-cache");
                Response.Headers.Append("Expires", "0");
                Response.Headers.Append("X-Camera-ID", camera_id);
                Response.Headers.Append("X-Frame-Timestamp", frameTimestamp?.ToString() ?? "0");

                return File(frameData, "image/jpeg");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Frame retrieval error for camera {CameraId}", camera_id);
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("background")]
        public IActionResult GetBackground([FromQuery] string camera_id)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(camera_id))
                {
                    _logger.LogWarning("Background request received without camera_id query parameter");
                    return BadRequest(new { status = "error", message = "camera_id query parameter is required" });
                }

                // Validate camera ID format
                if (!System.Text.RegularExpressions.Regex.IsMatch(camera_id, @"^camera_\d{4}$"))
                {
                    _logger.LogWarning("Background request with invalid camera_id format: {CameraId}", camera_id);
                    return BadRequest(new { status = "error", message = "Invalid camera ID format. Expected format: camera_XXXX" });
                }

                var backgroundData = _streamingService.GetBackground(camera_id);
                var backgroundTimestamp = _streamingService.GetBackgroundTimestamp(camera_id);

                if (backgroundData == null || backgroundData.Length == 0)
                {
                    _logger.LogDebug("No background available for {CameraId}", camera_id);
                    return NotFound(new { status = "error", message = "No background available for this camera" });
                }

                // Return the JPEG image with proper caching headers
                Response.Headers.Append("Cache-Control", "no-cache, no-store, must-revalidate");
                Response.Headers.Append("Pragma", "no-cache");
                Response.Headers.Append("Expires", "0");
                Response.Headers.Append("X-Camera-ID", camera_id);
                Response.Headers.Append("X-Background-Timestamp", backgroundTimestamp?.ToString() ?? "0");

                return File(backgroundData, "image/jpeg");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background retrieval error for camera {CameraId}", camera_id);
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }


        #endregion
    }

    #region Request Models

    public class StreamCommand
    {
        public string CameraId { get; set; } = string.Empty;
        public string Command { get; set; } = string.Empty;
        public object? Value { get; set; }
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

    public class SafeAreasRequest
    {
        public string CameraId { get; set; } = string.Empty;
        public List<AreaPolygon>? EditableAreas { get; set; }

        // For backwards compatibility, also accept the old format
        [JsonPropertyName("safe_areas")]
        public List<List<List<double>>>? SafeAreas
        {
            set => EditableAreas = value?.Select(coords => new AreaPolygon { AreaType = "safe", Coordinates = coords }).ToList();
        }
    }

    public class StateReportRequest
    {
        [JsonPropertyName("camera_id")]
        public string CameraId { get; set; } = string.Empty;
        public long Timestamp { get; set; }
        public string Status { get; set; } = "online";
        public bool IsRecording { get; set; }
        public bool RtmpConnected { get; set; }
    }

    #endregion
}