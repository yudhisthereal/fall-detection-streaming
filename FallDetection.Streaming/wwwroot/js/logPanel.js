// logPanel.js - Generic logging panel for all categories

// ============================================
// LOGGING PANEL
// ============================================

const LogPanel = {
    maxEntries: 50,
    entries: [],
    isMinimized: true,

    add(message, type = 'info', category = 'Connection') {
        const timestamp = new Date().toLocaleTimeString();
        const entry = { timestamp, message, type, category };
false
        // Add to beginning of array
        this.entries.unshift(entry);

        // Keep only last maxEntries
        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(0, this.maxEntries);
        }

        // Update UI
        this.updateUI();

        // Also log to console
        const consoleMethod = type === 'error' ? console.error : type === 'warning' ? console.warn : console.log;
        consoleMethod(`[${category}] ${message}`);
    },

    updateUI() {
        const logContainer = document.getElementById('log-content');
        if (!logContainer) return;

        // Get current filter
        const filterSelect = document.getElementById('logCategoryFilter');
        const currentFilter = filterSelect ? filterSelect.value : 'all';

        // Clear existing content safely
        while (logContainer.firstChild) {
            logContainer.removeChild(logContainer.firstChild);
        }

        // Add entries using safe DOM methods
        this.entries.forEach(entry => {
            // Filter by category
            if (currentFilter !== 'all' && entry.category !== currentFilter) {
                return;
            }

            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${entry.type}`;
            logEntry.dataset.category = entry.category;

            const timeSpan = document.createElement('span');
            timeSpan.className = 'log-time';
            timeSpan.textContent = `[${entry.timestamp}]`;

            const msgDiv = document.createElement('div');
            msgDiv.className = 'log-message';
            msgDiv.textContent = entry.message;

            // Add category tag
            const categoryTag = document.createElement('span');
            categoryTag.className = 'log-category-tag';
            categoryTag.textContent = entry.category;

            const contentWrapper = document.createElement('div');
            contentWrapper.appendChild(msgDiv);
            contentWrapper.appendChild(categoryTag);

            logEntry.appendChild(timeSpan);
            logEntry.appendChild(contentWrapper);
            logContainer.appendChild(logEntry);
        });
    },

    clear() {
        const filterSelect = document.getElementById('logCategoryFilter');
        const currentFilter = filterSelect ? filterSelect.value : 'all';

        if (currentFilter === 'all') {
            // Clear all entries
            this.entries = [];
        } else {
            // Clear only entries matching the current filter
            this.entries = this.entries.filter(entry => entry.category !== currentFilter);
        }

        this.updateUI();
        console.log(`[LogPanel] Log cleared (filter: ${currentFilter})`);
    },

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        const panel = document.getElementById('log-panel');
        const btn = document.getElementById('minimizeLogBtn');

        if (this.isMinimized) {
            panel.classList.add('minimized');
            btn.textContent = '□';  // Maximize icon
            btn.title = 'Maximize';
        } else {
            panel.classList.remove('minimized');
            btn.textContent = '−';  // Minimize icon
            btn.title = 'Minimize';
        }
    }
};

// Global functions for UI handlers
window.clearLog = function() {
    LogPanel.clear();
};

window.toggleLogPanel = function() {
    LogPanel.toggleMinimize();
};

window.filterLog = function() {
    LogPanel.updateUI();
};

// Export
window.LogPanel = LogPanel;
