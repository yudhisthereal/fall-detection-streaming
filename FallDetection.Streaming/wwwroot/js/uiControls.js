// uiControls.js - UI Controls management

const UIControls = {
    setupTimezoneControl: function () {
        if (DOMElements.timezoneSelect) {
            // Populate common timezones if empty
            if (DOMElements.timezoneSelect.options.length <= 1) {
                const timezones = [
                    "UTC", "Asia/Bangkok", "Asia/Jakarta", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney"
                ];
                try {
                    const allTimezones = Intl.supportedValuesOf('timeZone');
                    if (allTimezones && allTimezones.length > 0) {
                        timezones.length = 0;
                        timezones.push(...allTimezones);
                    }
                } catch (e) { console.warn("Intl.supportedValuesOf not supported, using defaults"); }

                DOMElements.timezoneSelect.innerHTML = '<option value="">Select a timezone...</option>';
                timezones.forEach(tz => {
                    const option = document.createElement('option');
                    option.value = tz;
                    option.textContent = tz;
                    DOMElements.timezoneSelect.appendChild(option);
                });
            }

            // Initialize Tom Select
            if (window.TomSelect && !this.tomSelect) {
                this.tomSelect = new TomSelect(DOMElements.timezoneSelect, {
                    create: false,
                    sortField: {
                        field: "text",
                        direction: "asc"
                    },
                    onChange: (value) => {
                        if (value && AppState.isConnected && AppState.currentCameraId) {
                            CommandManager.sendCommand('set_timezone', value);
                            this.updateClockDisplay();
                            // Fix: Blur the input after selection to release focus
                            if (this.tomSelect && this.tomSelect.control_input) {
                                this.tomSelect.blur();
                            }
                        }
                    },
                    // Fix: ensure blur on onItemAdd as well to be safe
                    onItemAdd: () => {
                        if (this.tomSelect) {
                            this.tomSelect.blur();
                        }
                    }
                });

                // Add keydown listener to the TomSelect control input for Enter key
                if (this.tomSelect.control_input) {
                    this.tomSelect.control_input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault(); // Prevent "new line"
                            if (this.tomSelect.dropdown_content.querySelector('.active')) {
                                // Provide time for selection to register
                                setTimeout(() => {
                                    this.tomSelect.blur();
                                }, 10);
                            }
                        }
                    });
                }
            } else if (!this.tomSelect) {
                DOMElements.timezoneSelect.onchange = () => {
                    const value = DOMElements.timezoneSelect.value;
                    if (value && AppState.isConnected && AppState.currentCameraId) {
                        CommandManager.sendCommand('set_timezone', value);
                        this.updateClockDisplay();
                    }
                };
            }
        }
        this.startClock();
    },

    startClock: function () {
        if (this.clockInterval) clearInterval(this.clockInterval);
        this.updateClockDisplay();
        this.clockInterval = setInterval(() => this.updateClockDisplay(), 1000);
    },

    updateClockDisplay: function () {
        if (!DOMElements.clockDisplay) return;

        if (!AppState.isConnected || !AppState.currentCameraId) {
            DOMElements.clockDisplay.style.display = 'none';
            return;
        }

        DOMElements.clockDisplay.style.display = 'inline-block';

        let timezone = 'UTC';
        if (this.tomSelect) {
            timezone = this.tomSelect.getValue();
        } else if (DOMElements.timezoneSelect) {
            timezone = DOMElements.timezoneSelect.value;
        }
        if (!timezone) timezone = 'UTC';

        try {
            const now = new Date();
            const timeString = new Intl.DateTimeFormat('en-GB', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).format(now);
            DOMElements.clockDisplay.textContent = timeString;
        } catch (e) {
            DOMElements.clockDisplay.textContent = "--:--";
        }
    },

    updateFromFlags(flags) {
        if (!flags) return;

        // Timezone
        if (typeof flags.timezone === 'string') {
            if (this.tomSelect) {
                this.tomSelect.setValue(flags.timezone, true);
            } else if (DOMElements.timezoneSelect) {
                DOMElements.timezoneSelect.value = flags.timezone;
            }
            this.updateClockDisplay();
        }

        if (typeof flags.record === 'boolean' && DOMElements.toggleRecord) {
            DOMElements.toggleRecord.checked = flags.record;
            DOMElements.toggleRecord.disabled = !AppState.isConnected;
        }
        if (typeof flags.show_raw === 'boolean' && DOMElements.toggleRaw) {
            DOMElements.toggleRaw.checked = flags.show_raw;
            DOMElements.toggleRaw.disabled = !AppState.isConnected;
        }
        if (typeof flags.auto_update_bg === 'boolean' && DOMElements.autoUpdateBg) {
            DOMElements.autoUpdateBg.checked = flags.auto_update_bg;
            DOMElements.autoUpdateBg.disabled = !AppState.isConnected;
        }
        if (typeof flags.show_safe_areas === 'boolean' && DOMElements.showSafeArea) {
            DOMElements.showSafeArea.checked = flags.show_safe_areas;
            DOMElements.showSafeArea.disabled = !AppState.isConnected;
        }
        if (typeof flags.show_bed_areas === 'boolean' && DOMElements.showBedAreas) {
            DOMElements.showBedAreas.checked = flags.show_bed_areas;
            DOMElements.showBedAreas.disabled = !AppState.isConnected;
        }
        if (typeof flags.show_floor_areas === 'boolean' && DOMElements.showFloorAreas) {
            DOMElements.showFloorAreas.checked = flags.show_floor_areas;
            DOMElements.showFloorAreas.disabled = !AppState.isConnected;
        }
        if (typeof flags.show_couch_areas === 'boolean' && DOMElements.showCouchAreas) {
            DOMElements.showCouchAreas.checked = flags.show_couch_areas;
            DOMElements.showCouchAreas.disabled = !AppState.isConnected;
        }
        if (typeof flags.show_bench_areas === 'boolean' && DOMElements.showBenchAreas) {
            DOMElements.showBenchAreas.checked = flags.show_bench_areas;
            DOMElements.showBenchAreas.disabled = !AppState.isConnected;
        }
        if (typeof flags.show_chair_areas === 'boolean' && DOMElements.showChairAreas) {
            DOMElements.showChairAreas.checked = flags.show_chair_areas;
            DOMElements.showChairAreas.disabled = !AppState.isConnected;
        }
        if (typeof flags.use_safety_check === 'boolean' && DOMElements.useSafetyCheck) {
            DOMElements.useSafetyCheck.checked = flags.use_safety_check;
            DOMElements.useSafetyCheck.disabled = !AppState.isConnected;
        }
        // if (typeof flags.hme === 'boolean' && DOMElements.toggleHME) {
        //     DOMElements.toggleHME.checked = flags.hme;
        //     DOMElements.toggleHME.disabled = !AppState.isConnected;
        // }
        if (typeof flags.fall_algorithm === 'number' && DOMElements.fallAlgorithmSelect) {
            DOMElements.fallAlgorithmSelect.value = flags.fall_algorithm;
            DOMElements.fallAlgorithmSelect.disabled = !AppState.isConnected;
        }

        if (typeof flags.check_method === 'number' && DOMElements.safetyCheckMethod) {
            DOMElements.safetyCheckMethod.value = flags.check_method;
            DOMElements.safetyCheckMethod.disabled = !AppState.isConnected;
        }

        if (DOMElements.editSleepBtn) {
            DOMElements.editSleepBtn.disabled = !AppState.isConnected;
        }

        const elements = [
            DOMElements.toggleRecord,
            DOMElements.toggleRaw,
            DOMElements.autoUpdateBg,
            DOMElements.showSafeArea,
            DOMElements.showBedAreas,
            DOMElements.showFloorAreas,
            DOMElements.showCouchAreas,
            DOMElements.showBenchAreas,
            DOMElements.showChairAreas,
            DOMElements.useSafetyCheck,
            // DOMElements.toggleHME,
            DOMElements.fallAlgorithmSelect,
            DOMElements.safetyCheckMethod,
            DOMElements.setBackgroundBtn,
            DOMElements.editAreas
        ];

    },

    getCurrentTimezone() {
        if (this.tomSelect) return this.tomSelect.getValue() || 'UTC';
        if (DOMElements.timezoneSelect) return DOMElements.timezoneSelect.value || 'UTC';
        return 'UTC';
    },

    updateSleepDisplay(state) {
        if (!state) return;

        const tz = this.getCurrentTimezone();
        const shortTz = tz.split('/').pop().replace(/_/g, ' '); // simple readable fallback

        if (DOMElements.displayMaxSleep) {
            const val = state.max_sleep_duration || 0;
            if (val === 0) {
                DOMElements.displayMaxSleep.textContent = "Disabled";
            } else {
                const hours = Math.floor(val / 60);
                const mins = val % 60;
                let timeStr = "";
                if (hours > 0) timeStr += `${hours}hr `;
                if (mins > 0 || hours === 0) timeStr += `${mins}min`;
                DOMElements.displayMaxSleep.textContent = timeStr.trim();
            }
        }

        if (DOMElements.displayBedtime) {
            DOMElements.displayBedtime.textContent = state.bedtime ? `${state.bedtime} ${shortTz}` : "--:--";
        }

        if (DOMElements.displayWakeup) {
            DOMElements.displayWakeup.textContent = state.wakeup_time ? `${state.wakeup_time} ${shortTz}` : "--:--";
        }

        const tolerance = state.tolerance || 30;
        let tolStr = "";
        if (tolerance >= 60) {
            const hrs = tolerance / 60;
            tolStr = `(± ${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)}hr)`;
        } else {
            tolStr = `(± ${tolerance}m)`;
        }

        if (DOMElements.displayBedtimeTolerance) {
            DOMElements.displayBedtimeTolerance.textContent = state.bedtime ? tolStr : "";
        }
        if (DOMElements.displayWakeupTolerance) {
            DOMElements.displayWakeupTolerance.textContent = state.wakeup_time ? tolStr : "";
        }

        // Update popup inputs
        if (DOMElements.sleepTolerance) {
            const standardOptions = ["30", "60", "90", "120", "180"];
            if (standardOptions.includes(tolerance.toString())) {
                DOMElements.sleepTolerance.value = tolerance.toString();
                if (DOMElements.customSleepTolerance) DOMElements.customSleepTolerance.style.display = 'none';
            } else {
                DOMElements.sleepTolerance.value = "custom";
                if (DOMElements.customSleepTolerance) {
                    DOMElements.customSleepTolerance.style.display = 'block';
                    DOMElements.customSleepTolerance.value = tolerance;
                }
            }
        }

        if (DOMElements.bedtime) {
            DOMElements.bedtime.value = state.bedtime || '';
        }
        if (DOMElements.wakeupTime) {
            DOMElements.wakeupTime.value = state.wakeup_time || '';
        }

        if (DOMElements.editSleepBtn) {
            DOMElements.editSleepBtn.disabled = !AppState.isConnected;
        }
    },

    updateAlgorithmSelection(algorithmValue, updateCamera = true) {
        const algorithmStr = algorithmValue.toString();

        if (DOMElements.fallAlgorithmSelect) {
            DOMElements.fallAlgorithmSelect.value = algorithmStr;
        }

        if (updateCamera && AppState.isConnected) {
            console.log(`Setting fall algorithm to: ${algorithmStr}`);
            CommandManager.sendCommand("set_fall_algorithm", parseInt(algorithmStr));
        }
    },

    showConfirm(title, message, onConfirm, onCancel = null) {
        if (!DOMElements.confirmPopup) {
            if (confirm(message)) {
                onConfirm();
            } else if (onCancel) {
                onCancel();
            }
            return;
        }

        if (DOMElements.confirmTitle) DOMElements.confirmTitle.textContent = title;
        if (DOMElements.confirmMessage) DOMElements.confirmMessage.innerHTML = message; // Use innerHTML for flexibility

        DOMHelpers.showPopup(DOMElements.confirmPopup);

        if (DOMElements.confirmYesBtn) {
            DOMElements.confirmYesBtn.onclick = () => {
                DOMHelpers.hidePopup(DOMElements.confirmPopup);
                onConfirm();
            };
        }

        if (DOMElements.confirmNoBtn) {
            DOMElements.confirmNoBtn.onclick = () => {
                DOMHelpers.hidePopup(DOMElements.confirmPopup);
                if (onCancel) onCancel();
            };
        }
    },

    setupControlHandlers() {
        this.setupTimezoneControl();
        // Toggle Record
        if (DOMElements.toggleRecord) {
            DOMElements.toggleRecord.onchange = () => {
                CommandManager.sendCommand("toggle_record", DOMElements.toggleRecord.checked);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `🎥 Record ${DOMElements.toggleRecord.checked ? 'STARTED' : 'STOPPED'}`,
                        'info',
                        'Flags'
                    );
                }
            };
        }

        // Toggle Raw
        if (DOMElements.toggleRaw) {
            DOMElements.toggleRaw.onchange = () => {
                const showRaw = DOMElements.toggleRaw.checked;
                CommandManager.sendCommand("toggle_raw", showRaw);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `🖼️ Show Raw ${showRaw ? 'ENABLED' : 'DISABLED'}`,
                        'info',
                        'Flags'
                    );
                }

                // Update stream display (background vs live)
                if (window.StreamController) {
                    window.StreamController.setShowBackground(!showRaw);
                }
            };
        }

        // Auto Update BG
        if (DOMElements.autoUpdateBg) {
            DOMElements.autoUpdateBg.onchange = () => {
                CommandManager.sendCommand("auto_update_bg", DOMElements.autoUpdateBg.checked);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `🔄 Auto-update BG ${DOMElements.autoUpdateBg.checked ? 'ENABLED' : 'DISABLED'}`,
                        'info',
                        'Flags'
                    );
                }
            };
        }

        // Show Bed Areas
        if (DOMElements.showBedAreas) {
            DOMElements.showBedAreas.onchange = () => {
                CommandManager.sendCommand("toggle_bed_areas_display", DOMElements.showBedAreas.checked);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `🛏️ Show Bed Areas ${DOMElements.showBedAreas.checked ? 'ENABLED' : 'DISABLED'}`,
                        'info',
                        'Flags'
                    );
                }

                if (window.StreamDisplay && DOMElements.showBedAreas.checked) {
                    window.StreamDisplay.refreshOverlay();
                }
            };
        }

        // Show Floor Areas
        if (DOMElements.showFloorAreas) {
            DOMElements.showFloorAreas.onchange = () => {
                CommandManager.sendCommand("toggle_floor_areas_display", DOMElements.showFloorAreas.checked);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `🏠 Show Floor Areas ${DOMElements.showFloorAreas.checked ? 'ENABLED' : 'DISABLED'}`,
                        'info',
                        'Flags'
                    );
                }

                if (window.StreamDisplay && DOMElements.showFloorAreas.checked) {
                    window.StreamDisplay.refreshOverlay();
                }
            };
        }

        // Show Couch Areas
        if (DOMElements.showCouchAreas) {
            DOMElements.showCouchAreas.onchange = () => {
                CommandManager.sendCommand("toggle_couch_areas_display", DOMElements.showCouchAreas.checked);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `🛋️ Show Couch Areas ${DOMElements.showCouchAreas.checked ? 'ENABLED' : 'DISABLED'}`,
                        'info',
                        'Flags'
                    );
                }

                if (window.StreamDisplay && DOMElements.showCouchAreas.checked) {
                    window.StreamDisplay.refreshOverlay();
                }
            };
        }

        // Show Bench Areas
        if (DOMElements.showBenchAreas) {
            DOMElements.showBenchAreas.onchange = () => {
                CommandManager.sendCommand("toggle_bench_areas_display", DOMElements.showBenchAreas.checked);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `🪑 Show Bench Areas ${DOMElements.showBenchAreas.checked ? 'ENABLED' : 'DISABLED'}`,
                        'info',
                        'Flags'
                    );
                }

                if (window.StreamDisplay && DOMElements.showBenchAreas.checked) {
                    window.StreamDisplay.refreshOverlay();
                }
            };
        }

        // Show Chair Areas
        if (DOMElements.showChairAreas) {
            DOMElements.showChairAreas.onchange = () => {
                CommandManager.sendCommand("toggle_chair_areas_display", DOMElements.showChairAreas.checked);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `💺 Show Chair Areas ${DOMElements.showChairAreas.checked ? 'ENABLED' : 'DISABLED'}`,
                        'info',
                        'Flags'
                    );
                }

                if (window.StreamDisplay && DOMElements.showChairAreas.checked) {
                    window.StreamDisplay.refreshOverlay();
                }
            };
        }

        // Use Safety Check
        if (DOMElements.useSafetyCheck) {
            DOMElements.useSafetyCheck.onchange = () => {
                CommandManager.sendCommand("toggle_safety_check", DOMElements.useSafetyCheck.checked);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `✅ Safety Check ${DOMElements.useSafetyCheck.checked ? 'ENABLED' : 'DISABLED'}`,
                        'info',
                        'Flags'
                    );
                }
            };
        }
        if (DOMElements.useSafetyCheck) {
            DOMElements.useSafetyCheck.onchange = () => {
                CommandManager.sendCommand("toggle_safety_check", DOMElements.useSafetyCheck.checked);
            };
        }

        // Safety Check Method Select
        if (DOMElements.safetyCheckMethod) {
            DOMElements.safetyCheckMethod.onchange = () => {
                const method = parseInt(DOMElements.safetyCheckMethod.value);
                CommandManager.sendCommand("set_safety_check_method", method);
            };
        }

        // Toggle HME
        // if (DOMElements.toggleHME) {
        //     DOMElements.toggleHME.onchange = () => {
        //         CommandManager.sendCommand("toggle_hme", DOMElements.toggleHME.checked);
        //     };
        // }

        // Fall Algorithm Select
        if (DOMElements.fallAlgorithmSelect) {
            DOMElements.fallAlgorithmSelect.onchange = () => {
                const algorithm = parseInt(DOMElements.fallAlgorithmSelect.value);
                CommandManager.sendCommand("set_fall_algorithm", algorithm);
            };
        }

        // Set Background Button
        if (DOMElements.setBackgroundBtn) {
            DOMElements.setBackgroundBtn.onclick = async () => {
                if (!DOMElements.preview || !DOMElements.popup) return;

                if (!AppState.currentCameraId) {
                    NotificationSystem.show('No camera selected', 'error');
                    return;
                }

                try {
                    // Check if Show Raw is enabled
                    const showRaw = window.StreamDisplay && window.StreamDisplay.cameraState?.show_raw === true;

                    if (!showRaw) {
                        NotificationSystem.show("Please enable 'Show Raw' first", "warning");
                        return; // EXIT EARLY - Do not show popup
                    }

                    // Fetch current frame directly from server
                    const endpoint = 'frame'; // Always 'frame' since we force showRaw=true check above
                    const timestamp = Date.now();
                    const streamUrl = `${STREAMING_HTTP_URL}/api/stream/${endpoint}?camera_id=${AppState.currentCameraId}&t=${timestamp}`;

                    console.log('[Set Background] Fetching frame from server:', streamUrl);

                    // Preload the image to ensure it loads before showing popup
                    const tempImg = new Image();

                    tempImg.onload = () => {
                        console.log('[Set Background] Frame loaded, showing preview');
                        DOMElements.preview.src = streamUrl;
                        DOMHelpers.showPopup(DOMElements.popup);
                    };

                    tempImg.onerror = () => {
                        console.error('[Set Background] Failed to load frame from server');
                        NotificationSystem.show('Failed to load current frame. Please try again.', 'error');
                    };

                    tempImg.src = streamUrl;

                } catch (error) {
                    console.error('[Set Background] Error:', error);
                    NotificationSystem.show('Failed to load current frame: ' + error.message, 'error');
                }
            };
        }

        // Edit Sleep Schedule Button
        if (DOMElements.editSleepBtn) {
            DOMElements.editSleepBtn.onclick = () => {
                if (!AppState.currentCameraId) {
                    NotificationSystem.show('No camera selected', 'warning');
                    return;
                }

                // Populate inputs with current displayed values (or from internal state if we had it directly)
                // Best to trust the inputs which we update when popup is closed
                DOMHelpers.showPopup(DOMElements.sleepConfigPopup);
            };
        }

        // Cancel Sleep Button
        if (DOMElements.cancelSleepBtn) {
            DOMElements.cancelSleepBtn.onclick = () => {
                DOMHelpers.hidePopup(DOMElements.sleepConfigPopup);
            };
        }
        // Toggle Custom Tolerance Input
        if (DOMElements.sleepTolerance && DOMElements.customSleepTolerance) {
            DOMElements.sleepTolerance.onchange = (e) => {
                if (e.target.value === "custom") {
                    DOMElements.customSleepTolerance.style.display = 'block';
                } else {
                    DOMElements.customSleepTolerance.style.display = 'none';
                }
            };
        }

        // Save Sleep Settings Button
        if (DOMElements.saveSleepBtn) {
            DOMElements.saveSleepBtn.onclick = () => {
                if (!AppState.currentCameraId) {
                    NotificationSystem.show('No camera selected', 'warning');
                    return;
                }

                const bedtime = DOMElements.bedtime.value || '';
                const wakeupTime = DOMElements.wakeupTime.value || '';

                let tolerance = 30;
                if (DOMElements.sleepTolerance) {
                    if (DOMElements.sleepTolerance.value === "custom") {
                        tolerance = parseInt(DOMElements.customSleepTolerance.value) || 0;
                    } else {
                        tolerance = parseInt(DOMElements.sleepTolerance.value) || 30;
                    }
                }

                // Compute local max sleep for instant UI update
                let maxSleepDuration = 0;
                if (bedtime && wakeupTime) {
                    try {
                        let bt = new Date(`1970-01-01T${bedtime}Z`);
                        let wt = new Date(`1970-01-01T${wakeupTime}Z`);
                        if (wt < bt) {
                            wt.setDate(wt.getDate() + 1);
                        }
                        const durationMins = (wt - bt) / 60000;
                        maxSleepDuration = durationMins + tolerance;
                    } catch (e) {
                        console.warn("Could not calculate local max sleep duration", e);
                    }
                }

                const sleepConfig = {
                    tolerance: tolerance,
                    max_sleep_duration: maxSleepDuration,
                    bedtime: bedtime,
                    wakeup_time: wakeupTime
                };

                CommandManager.sendCommand('set_sleep_config', sleepConfig);

                // Instantly update the display so it reflects the new user setting 
                // without waiting for the next explicit page load/camera fetch
                UIControls.updateSleepDisplay(sleepConfig);

                if (window.LogPanel) {
                    LogPanel.add(
                        `💤 Sleep settings updated: Tolerance=${tolerance}min, Bedtime=${bedtime || 'not set'}, Wake=${wakeupTime || 'not set'}`,
                        'info',
                        'Flags'
                    );
                }

                if (window.NotificationSystem) {
                    NotificationSystem.show('Sleep settings applied', 'success');
                }

                DOMHelpers.hidePopup(DOMElements.sleepConfigPopup);
            };
        }

        // Edit Safe Area Button
        if (DOMElements.editAreas) {
            DOMElements.editAreas.onclick = EditableAreaEditor.show.bind(EditableAreaEditor);
        }
    }
};

// Export
window.UIControls = UIControls;

