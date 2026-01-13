// dom.js - DOM Elements and utilities

// DOM Elements cache
const DOMElements = {
    // Video element
    streamVideo: document.getElementById('streamVideo'),
    
    // Toggle controls
    toggleRecord: document.getElementById('toggleRecord'),
    toggleRaw: document.getElementById('toggleRaw'),
    autoUpdateBg: document.getElementById('autoUpdateBg'),
    showSafeArea: document.getElementById('showSafeArea'),
    useSafetyCheck: document.getElementById('useSafetyCheck'),
    toggleHME: document.getElementById('toggleHME'),
    fallAlgorithmSelect: document.getElementById('fallAlgorithmSelect'),
    
    // Buttons
    setBackgroundBtn: document.getElementById('setBackgroundBtn'),
    editSafeAreaBtn: document.getElementById('editSafeAreaBtn'),
    refreshCamerasBtn: document.getElementById('refreshCamerasBtn'),
    pendingRegBtn: document.getElementById('pendingRegistrationsBtn'),
    pendingRegCount: document.getElementById('pendingRegCount'),
    manageCamerasBtn: document.getElementById('manageCamerasBtn'),
    
    // Camera selection
    cameraSelect: document.getElementById('cameraSelect'),
    cameraInfoSpan: document.getElementById('camera-info'),
    
    // Status indicator
    statusIndicator: document.getElementById('stream-status'),
    
    // Popups
    popup: document.getElementById('popup'),
    preview: document.getElementById('preview'),
    safeAreaPopup: document.getElementById('safeAreaPopup'),
    registrationPopup: document.getElementById('registrationPopup'),
    managementPopup: document.getElementById('managementPopup'),
    
    // Safe Area Editor Elements
    safeAreaCanvas: document.getElementById('safeAreaCanvas'),
    newPolygonBtn: document.getElementById('newPolygonBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    saveSafeAreasBtn: document.getElementById('saveSafeAreasBtn'),
    saveStatus: document.getElementById('saveStatus'),
    
    // Algorithm Info Panel
    algorithmInfo: document.getElementById('algorithmInfo'),
    showInfoBtn: document.getElementById('showInfoBtn')
};

// Safe Area Editor State
let safeAreas = [];
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
        if (disabled) {
            element.style.opacity = '0.6';
            element.style.cursor = 'not-allowed';
        } else {
            element.style.opacity = '1';
            element.style.cursor = 'pointer';
        }
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
window.safeAreas = safeAreas;
window.currentPolygon = currentPolygon;

