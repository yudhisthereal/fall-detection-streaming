// commandManager.js - Command sending and validation

const CommandManager = {
    // Validate command before sending
    validateCommand(command, value) {
        // Check if command is valid string
        if (typeof command !== 'string') {
            return { valid: false, error: 'Command must be a string' };
        }

        // Normalize command (trim whitespace)
        const normalizedCommand = command.trim().toLowerCase();

        // Check for empty/blank command
        if (!normalizedCommand || normalizedCommand === '' || normalizedCommand === 'null' || normalizedCommand === 'undefined') {
            return { valid: false, error: 'Command cannot be empty or null' };
        }

        // Check if command is in whitelist
        if (!VALID_COMMANDS.includes(normalizedCommand)) {
            if (window.LogPanel) LogPanel.add(`Invalid command rejected: ${command}`, 'warning', 'Flags');
            return { valid: false, error: `Unknown command: ${command}` };
        }

        // Validate command value
        if (COMMAND_VALIDATORS[normalizedCommand]) {
            if (!COMMAND_VALIDATORS[normalizedCommand](value)) {
                return { valid: false, error: `Invalid value for command ${command}: ${value}` };
            }
        }

        return { valid: true, command: normalizedCommand };
    },

    async sendCommand(command, value = null) {
        const cameraId = AppState.currentCameraId;

        // Validate camera ID
        if (!cameraId || cameraId === 'camera_000' || cameraId.startsWith('camera_999')) {
            if (window.LogPanel) LogPanel.add('Cannot send command: No valid camera selected', 'warning', 'Flags');
            return;
        }

        // Check if connected and stable
        if (!AppState.isConnected || !ConnectionStatus.isConnectionStatusStable()) {
            if (window.LogPanel) LogPanel.add(`Cannot send command to disconnected/unstable camera: ${cameraId}`, 'warning', 'Flags');
            return;
        }

        // Validate command
        const validation = this.validateCommand(command, value);
        if (!validation.valid) {
            if (window.LogPanel) LogPanel.add(`Command validation failed: ${validation.error}`, 'warning', 'Flags');
            return;
        }

        const validCommand = validation.command;

        console.log(`Sending command to ${cameraId}: ${validCommand}=${value}`);

        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/command`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // use CamelCase as expected by ASP.NET
                body: JSON.stringify({
                    CameraId: cameraId,
                    Command: validCommand,
                    Value: value
                })
            });

            if (response.ok) {
                console.log(`Command sent successfully`);

                // Log successful command to panel
                if (window.LogPanel) {
                    LogPanel.add(
                        `✅ Command sent: ${command} = ${JSON.stringify(value)}`,
                        'info',
                        'Flags'
                    );
                }
            } else {
                console.error(`Command failed: HTTP ${response.status}`);

                // Log failed command to panel
                if (window.LogPanel) {
                    LogPanel.add(
                        `❌ Command failed: ${command} - HTTP ${response.status}`,
                        'error',
                        'Flags'
                    );
                }
            }
        } catch (error) {
            console.error('Command error:', error);
        }
    },

    async fetchCameraState(cameraId, silent = false) {
        try {
            const response = await fetch(`${STREAMING_HTTP_URL}/api/stream/camera-state?camera_id=${cameraId}`);
            if (response.ok) {
                const flags = await response.json();
                UIControls.updateFromFlags(flags);

                if (flags.fall_algorithm !== undefined) {
                    UIControls.updateAlgorithmSelection(flags.fall_algorithm, false);
                }

                if (flags._connected !== undefined) {
                    // Use silent mode to avoid resetting stability when just refreshing state
                    ConnectionStatus.updateConnectionStatusDebounced(cameraId, flags._connected, null, silent);
                }

                // Update StreamDisplay camera state (which will check show_raw flag)
                if (window.StreamDisplay) {
                    window.StreamDisplay.updateCameraState(flags);
                }

                return flags;
            }
        } catch (error) {
            console.error(`Failed to fetch state for ${cameraId}:`, error);
            ConnectionStatus.updateConnectionStatusDebounced(cameraId, false, null, silent);
        }
        return null;
    }
};

// Export
window.CommandManager = CommandManager;

