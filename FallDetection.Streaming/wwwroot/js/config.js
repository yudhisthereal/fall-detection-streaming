// config.js - Configuration and constants

const STREAMING_HTTP_URL = window.location.origin;
const STREAMING_HTTP_HOST = "103.150.93.198";

// Valid commands whitelist for security
const VALID_COMMANDS = [
    'toggle_record', 'toggle_raw', 'auto_update_bg', 'set_background',
    'toggle_safe_areas_display', 'toggle_bed_areas_display', 'toggle_floor_areas_display',
    'toggle_safety_check', 'toggle_hme',
    'set_fall_algorithm', 'update_safe_areas', 'set_safety_check_method'
];

// Command value validators
const COMMAND_VALIDATORS = {
    'toggle_record': (v) => typeof v === 'boolean',
    'toggle_raw': (v) => typeof v === 'boolean',
    'auto_update_bg': (v) => typeof v === 'boolean',
    'set_background': (v) => typeof v === 'boolean',
    'toggle_safe_areas_display': (v) => typeof v === 'boolean',
    'toggle_bed_areas_display': (v) => typeof v === 'boolean',
    'toggle_floor_areas_display': (v) => typeof v === 'boolean',
    'toggle_safety_check': (v) => typeof v === 'boolean',
    'toggle_hme': (v) => typeof v === 'boolean',
    'set_fall_algorithm': (v) => typeof v === 'number' && v >= 1 && v <= 3,
    'update_safe_areas': (v) => Array.isArray(v)
};

// Stream settings
const REFRESH_INTERVAL_MS = 1;
const MAX_ERRORS = 5;
const CONNECTION_STABILITY_DELAY = 3000;
const CONNECTION_STATUS_DEBOUNCE = 1000;

