// uiControls.js - UI Controls management

const UIControls = {
    updateFromFlags(flags) {
        if (!flags) return;

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



        const elements = [
            DOMElements.toggleRecord,
            DOMElements.toggleRaw,
            DOMElements.autoUpdateBg,
            DOMElements.showSafeArea,
            DOMElements.showBedAreas,
            DOMElements.showFloorAreas,
            DOMElements.useSafetyCheck,
            // DOMElements.toggleHME,
            DOMElements.fallAlgorithmSelect,
            DOMElements.safetyCheckMethod,
            DOMElements.setBackgroundBtn,
            DOMElements.editAreas
        ];

        elements.forEach(element => {
            if (element) {
                DOMHelpers.styleDisabled(element, !AppState.isConnected);
            }
        });
    },

    updateAlgorithmSelection(algorithmValue, updateCamera = true) {
        const algorithmStr = algorithmValue.toString();

        if (DOMElements.fallAlgorithmSelect) {
            DOMElements.fallAlgorithmSelect.value = algorithmStr;
        }

        const algorithmCards = document.querySelectorAll('.card');
        algorithmCards.forEach(card => {
            if (card.dataset.algorithm === algorithmStr) {
                card.dataset.active = 'true';
            } else {
                delete card.dataset.active;
            }
        });

        if (updateCamera && AppState.isConnected) {
            console.log(`Setting fall algorithm to: ${algorithmStr}`);
            CommandManager.sendCommand("set_fall_algorithm", parseInt(algorithmStr));
        }
    },

    setupControlHandlers() {
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

        // Show Safe Area
        if (DOMElements.showSafeArea) {
            DOMElements.showSafeArea.onchange = () => {
                CommandManager.sendCommand("toggle_safe_areas_display", DOMElements.showSafeArea.checked);

                // Log flag change
                if (window.LogPanel) {
                    LogPanel.add(
                        `🛡️ Show Safe Areas ${DOMElements.showSafeArea.checked ? 'ENABLED' : 'DISABLED'}`,
                        'info',
                        'Flags'
                    );
                }

                if (window.StreamDisplay && DOMElements.showSafeArea.checked) {
                    window.StreamDisplay.fetchSafeAreas();
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
                    window.StreamDisplay.fetchBedAreas();
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
                    window.StreamDisplay.fetchFloorAreas();
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
                    alert('No camera selected');
                    return;
                }

                try {
                    // Fetch current frame directly from server
                    const showRaw = window.StreamDisplay && window.StreamDisplay.cameraState?.show_raw === true;
                    const endpoint = showRaw ? 'frame' : 'background';
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
                        alert('Failed to load current frame. Please try again.');
                    };

                    tempImg.src = streamUrl;

                } catch (error) {
                    console.error('[Set Background] Error:', error);
                    alert('Failed to load current frame: ' + error.message);
                }
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

