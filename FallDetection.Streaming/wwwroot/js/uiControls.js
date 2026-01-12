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
        if (typeof flags.show_safe_area === 'boolean' && DOMElements.showSafeArea) {
            DOMElements.showSafeArea.checked = flags.show_safe_area;
            DOMElements.showSafeArea.disabled = !AppState.isConnected;
        }
        if (typeof flags.use_safety_check === 'boolean' && DOMElements.useSafetyCheck) {
            DOMElements.useSafetyCheck.checked = flags.use_safety_check;
            DOMElements.useSafetyCheck.disabled = !AppState.isConnected;
        }
        if (typeof flags.hme === 'boolean' && DOMElements.toggleHME) {
            DOMElements.toggleHME.checked = flags.hme;
            DOMElements.toggleHME.disabled = !AppState.isConnected;
        }
        if (typeof flags.fall_algorithm === 'number' && DOMElements.fallAlgorithmSelect) {
            DOMElements.fallAlgorithmSelect.value = flags.fall_algorithm;
            DOMElements.fallAlgorithmSelect.disabled = !AppState.isConnected;
        }
        
        if (DOMElements.setBackgroundBtn) {
            DOMElements.setBackgroundBtn.disabled = !AppState.isConnected;
        }
        if (DOMElements.editSafeAreaBtn) {
            DOMElements.editSafeAreaBtn.disabled = !AppState.isConnected;
        }
        
        const elements = [
            DOMElements.toggleRecord,
            DOMElements.toggleRaw,
            DOMElements.autoUpdateBg,
            DOMElements.showSafeArea,
            DOMElements.useSafetyCheck,
            DOMElements.toggleHME,
            DOMElements.fallAlgorithmSelect,
            DOMElements.setBackgroundBtn,
            DOMElements.editSafeAreaBtn
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
            };
        }
        
        // Toggle Raw
        if (DOMElements.toggleRaw) {
            DOMElements.toggleRaw.onchange = () => {
                CommandManager.sendCommand("toggle_raw", DOMElements.toggleRaw.checked);
            };
        }
        
        // Auto Update BG
        if (DOMElements.autoUpdateBg) {
            DOMElements.autoUpdateBg.onchange = () => {
                CommandManager.sendCommand("auto_update_bg", DOMElements.autoUpdateBg.checked);
            };
        }
        
        // Show Safe Area
        if (DOMElements.showSafeArea) {
            DOMElements.showSafeArea.onchange = () => {
                CommandManager.sendCommand("toggle_safe_area_display", DOMElements.showSafeArea.checked);
            };
        }
        
        // Use Safety Check
        if (DOMElements.useSafetyCheck) {
            DOMElements.useSafetyCheck.onchange = () => {
                CommandManager.sendCommand("toggle_safety_check", DOMElements.useSafetyCheck.checked);
            };
        }
        
        // Toggle HME
        if (DOMElements.toggleHME) {
            DOMElements.toggleHME.onchange = () => {
                CommandManager.sendCommand("toggle_hme", DOMElements.toggleHME.checked);
            };
        }
        
        // Fall Algorithm Select
        if (DOMElements.fallAlgorithmSelect) {
            DOMElements.fallAlgorithmSelect.onchange = () => {
                const algorithm = parseInt(DOMElements.fallAlgorithmSelect.value);
                CommandManager.sendCommand("set_fall_algorithm", algorithm);
            };
        }
        
        // Set Background Button
        if (DOMElements.setBackgroundBtn) {
            DOMElements.setBackgroundBtn.onclick = () => {
                if (DOMElements.preview && DOMElements.popup) {
                    const canvas = document.createElement('canvas');
                    canvas.width = DOMElements.streamVideo.videoWidth;
                    canvas.height = DOMElements.streamVideo.videoHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(DOMElements.streamVideo, 0, 0);
                    DOMElements.preview.src = canvas.toDataURL('image/jpeg');
                    DOMHelpers.showPopup(DOMElements.popup);
                }
            };
        }
        
        // Edit Safe Area Button
        if (DOMElements.editSafeAreaBtn) {
            DOMElements.editSafeAreaBtn.onclick = SafeAreaEditor.show;
        }
    }
};

// Export
window.UIControls = UIControls;

