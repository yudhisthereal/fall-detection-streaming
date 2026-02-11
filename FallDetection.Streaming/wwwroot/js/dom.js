// dom.js - DOM Elements and utilities

// DOM Elements cache
const DOMElements = {
    // Video/Stream elements
    streamImg: document.getElementById('streamImg'),
    streamBackgroundImg: document.getElementById('streamBackgroundImg'),

    // Toggle controls
    toggleRecord: document.getElementById('toggleRecord'),
    toggleRaw: document.getElementById('toggleRaw'),
    autoUpdateBg: document.getElementById('autoUpdateBg'),
    showBedAreas: document.getElementById('showBedAreas'),
    showFloorAreas: document.getElementById('showFloorAreas'),
    showCouchAreas: document.getElementById('showCouchAreas'),
    showBenchAreas: document.getElementById('showBenchAreas'),
    showChairAreas: document.getElementById('showChairAreas'),
    useSafetyCheck: document.getElementById('useSafetyCheck'),
    safetyCheckMethod: document.getElementById('safetyCheckMethod'),
    // toggleHME: document.getElementById('toggleHME'),
    fallAlgorithmSelect: document.getElementById('fallAlgorithmSelect'),

    // Buttons
    setBackgroundBtn: document.getElementById('setBackgroundBtn'),
    editAreas: document.getElementById('editAreas'),
    refreshCamerasBtn: document.getElementById('refreshCamerasBtn'),
    pendingRegBtn: document.getElementById('pendingRegistrationsBtn'),
    pendingRegCount: document.getElementById('pendingRegCount'),
    manageCamerasBtn: document.getElementById('manageCamerasBtn'),

    // Sleep settings
    timezoneSelect: document.getElementById('timezoneSelect'),
    clockDisplay: document.getElementById('clockDisplay'),
    maxSleepDuration: document.getElementById('maxSleepDuration'),
    bedtime: document.getElementById('bedtime'),
    wakeupTime: document.getElementById('wakeupTime'),
    applySleepSettings: document.getElementById('applySleepSettings'),

    // Camera selection
    cameraSelect: document.getElementById('cameraSelect'),
    cameraInfoSpan: document.getElementById('cameraInfo'),

    // Status indicator
    statusIndicator: document.getElementById('streamStatus'),

    // Popups
    popup: document.getElementById('popup'),
    preview: document.getElementById('preview'),
    editAreasPopup: document.getElementById('editAreasPopup'),
    registrationPopup: document.getElementById('registrationPopup'),
    managementPopup: document.getElementById('managementPopup'),
    confirmPopup: document.getElementById('confirmPopup'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmYesBtn: document.getElementById('confirmYesBtn'),
    confirmNoBtn: document.getElementById('confirmNoBtn'),

    // Safe Area Editor Elements
    editableAreaCanvas: document.getElementById('editableAreaCanvas'),
    areaTypeSelector: document.getElementById('areaTypeSelector'),
    toolPenBtn: document.getElementById('toolPenBtn'),
    toolRemoveBtn: document.getElementById('toolRemoveBtn'),
    toolClearBtn: document.getElementById('toolClearBtn'),
    saveAreasBtn: document.getElementById('saveAreasBtn'),
    saveStatus: document.getElementById('saveStatus'),


};

// Safe Area Editor State
let editableAreas = [];
let currentPolygon = [];
let isEditing = false;
let canvasContext = null;
let backgroundImage = null;
let originalImageWidth = 0;
let originalImageHeight = 0;
let canvasScale = 1;

// DOM helper functions
const DOMHelpers = {
    // Apply disabled styling
    styleDisabled(element, disabled) {
        element.disabled = disabled;
    },

    // Show/hide popup
    showPopup(popupElement) {
        if (popupElement) popupElement.style.display = "block";
    },

    hidePopup(popupElement) {
        if (popupElement) popupElement.style.display = "none";
    },

    // Update button with count
    updatePendingButton(count) {
        if (DOMElements.pendingRegBtn) {
            if (count > 0) {
                DOMElements.pendingRegBtn.style.display = 'inline-block';
                DOMElements.pendingRegCount.textContent = count;
                DOMElements.pendingRegBtn.classList.add('pulse');
            } else {
                DOMElements.pendingRegBtn.style.display = 'none';
                DOMElements.pendingRegBtn.classList.remove('pulse');
            }
        }
    },
};

// Export
window.DOMElements = DOMElements;
window.DOMHelpers = DOMHelpers;
window.editableAreas = editableAreas;
window.currentPolygon = currentPolygon;

