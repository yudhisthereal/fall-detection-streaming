using Microsoft.AspNetCore.Mvc;
using FallDetection.Streaming.Services;
using System.Text.Json;

namespace FallDetection.Streaming.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class StreamController : ControllerBase
    {
        private readonly CameraManagementService _cameraService;
        private readonly ILogger<StreamController> _logger;

        public StreamController(CameraManagementService cameraService, ILogger<StreamController> logger)
        {
            _cameraService = cameraService;
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
        
        [HttpPost("upload-frame")]
        public async Task<IActionResult> UploadFrame([FromHeader(Name = "X-Camera-ID")] string cameraId)
        {
            try
            {
                using var memoryStream = new MemoryStream();
                await Request.Body.CopyToAsync(memoryStream);
                var frameData = memoryStream.ToArray();

                var sourceAddr = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                _cameraService.UpdateCameraFrame(cameraId, frameData, sourceAddr);

                _logger.LogDebug("Received frame from {CameraId} ({Size} bytes)", cameraId, frameData.Length);

                return Ok(new
                {
                    status = "success",
                    message = $"Frame received ({frameData.Length} bytes)",
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                    camera_id = cameraId
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Frame upload error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpGet("frame")]
        public IActionResult GetFrame([FromQuery] string camera_id)
        {
            try
            {
                // Validate camera_id parameter
                if (string.IsNullOrWhiteSpace(camera_id))
                {
                    _logger.LogWarning("GetFrame called with empty camera_id");
                    return BadRequest(new { status = "error", message = "Camera ID is required" });
                }
                
                // Validate camera_id format
                if (!System.Text.RegularExpressions.Regex.IsMatch(camera_id, @"^camera_\d{4}$"))
                {
                    _logger.LogWarning("GetFrame called with invalid camera_id format: {CameraId}", camera_id);
                    return BadRequest(new { status = "error", message = "Invalid camera ID format. Expected format: camera_XXXX" });
                }

                var frame = _cameraService.GetCameraFrame(camera_id);
                if (frame != null && frame.Length > 0)
                {
                    return File(frame, "image/jpeg");
                }
                
                // Camera exists but has no frame yet - return a placeholder
                _logger.LogDebug("No frame available for camera {CameraId}", camera_id);
                return StatusCode(204, new { status = "no_content", message = "No frame available yet for this camera" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get frame error for camera {CameraId}", camera_id);
                return StatusCode(500, new { status = "error", message = "Internal server error" });
            }
        }

        [HttpPost("command")]
        public IActionResult SendCommand([FromBody] StreamCommand command)
        {
            try
            {
                _logger.LogInformation("Command received: {Command}={Value} for {CameraId}", 
                    command.Command, command.Value, command.CameraId);

                // Update local camera state
                var cameraState = _cameraService.GetCameraState(command.CameraId);
                if (cameraState != null)
                {
                    // Update control flags
                    switch (command.Command)
                    {
                        case "toggle_record":
                            cameraState.ControlFlags["record"] = Convert.ToBoolean(command.Value);
                            break;
                        case "toggle_raw":
                            cameraState.ControlFlags["show_raw"] = Convert.ToBoolean(command.Value);
                            break;
                        case "auto_update_bg":
                            cameraState.ControlFlags["auto_update_bg"] = Convert.ToBoolean(command.Value);
                            break;
                        case "set_background":
                            cameraState.ControlFlags["set_background"] = Convert.ToBoolean(command.Value);
                            break;
                        case "toggle_safe_area_display":
                            cameraState.ControlFlags["show_safe_area"] = Convert.ToBoolean(command.Value);
                            break;
                        case "toggle_safety_check":
                            cameraState.ControlFlags["use_safety_check"] = Convert.ToBoolean(command.Value);
                            break;
                        case "toggle_hme":
                            cameraState.ControlFlags["hme"] = Convert.ToBoolean(command.Value);
                            break;
                        case "set_fall_algorithm":
                            var algorithm = Convert.ToInt32(command.Value);
                            if (algorithm >= 1 && algorithm <= 3)
                            {
                                cameraState.ControlFlagsInt["fall_algorithm"] = algorithm;
                            }
                            break;
                        case "update_safe_areas":
                            if (command.Value is JsonElement jsonElement)
                            {
                                // Parse safe areas from JSON
                                var safeAreas = JsonSerializer.Deserialize<List<List<List<double>>>>(jsonElement.GetRawText());
                                if (safeAreas != null)
                                {
                                    cameraState.SafeAreas = safeAreas;
                                }
                            }
                            break;
                    }
                    
                    _cameraService.UpdateCameraState(command.CameraId, cameraState);
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

                // Convert to camelCase for JavaScript compatibility
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
                    // Combine flags for response
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
                    response["_connected"] = state.Connected;
                    
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

        [HttpGet("camera-status")]
        public IActionResult GetCameraStatus([FromQuery] string camera_id)
        {
            try
            {
                var state = _cameraService.GetCameraState(camera_id);
                if (state != null)
                {
                    var isConnected = state.Connected;
                    var currentTime = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    var ageSeconds = currentTime - state.LastSeen;
                    
                    return Ok(new
                    {
                        camera_id = camera_id,
                        connected = isConnected,
                        age_seconds = ageSeconds,
                        last_seen = state.LastSeen
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
                    return Ok(state.SafeAreas);
                }

                return NotFound(new { error = "Camera not found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Get safe areas error");
                return StatusCode(500, new { status = "error", message = ex.Message });
            }
        }

        [HttpPost("safe-areas")]
        public IActionResult UpdateSafeAreas([FromBody] SafeAreasRequest request)
        {
            try
            {
                var state = _cameraService.GetCameraState(request.CameraId);
                if (state != null)
                {
                    if (request.SafeAreas != null)
                    {
                        state.SafeAreas = request.SafeAreas;    
                    } else
                    {
                        Console.WriteLine("SafeAreas is null");
                    }
                    _cameraService.UpdateCameraState(request.CameraId, state);
                    
                    return Ok(new
                    {
                        status = "success",
                        camera_id = request.CameraId,
                        safe_areas_count = request.SafeAreas?.Count ?? 0
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
        public List<List<List<double>>>? SafeAreas { get; set; }
    }

    #endregion
}