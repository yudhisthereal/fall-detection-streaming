/**
 * notification.js
 * A lightweight, dependency-free floating notification system (toast).
 * Features:
 * - Dynamic style injection (no external CSS needed)
 * - Corner floating notifications
 * - Auto-dismiss with progress bar animation
 * - Queueing support (stacking)
 */

const NotificationSystem = {
    containerId: 'notification-container',
    styleId: 'notification-styles',

    // Initialize the system (inject styles and container)
    init() {
        if (!document.getElementById(this.styleId)) {
            this.injectStyles();
        }
        if (!document.getElementById(this.containerId)) {
            this.createContainer();
        }
    },

    // Inject CSS styles dynamically
    injectStyles() {
        const css = `
            #${this.containerId} {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none; /* Allow clicks to pass through container */
            }

            .notification-toast {
                background: rgba(30, 30, 30, 0.95);
                color: #fff;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                min-width: 250px;
                max-width: 400px;
                display: flex;
                flex-direction: column;
                pointer-events: auto; /* Re-enable clicks on toasts */
                transform: translateX(100%);
                animation: slideIn 0.3s forwards;
                border-left: 4px solid #3498db; /* Default info color */
                overflow: hidden;
                position: relative;
            }

            .notification-toast.warning {
                border-left-color: #f39c12;
            }

            .notification-toast.error {
                border-left-color: #e74c3c;
            }

            .notification-toast.success {
                border-left-color: #2ecc71;
            }

            .notification-message {
                margin-bottom: 5px;
                line-height: 1.4;
            }

            .notification-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background: rgba(255, 255, 255, 0.3);
                width: 100%;
                animation: progress linear forwards;
            }

            @keyframes slideIn {
                to { transform: translateX(0); }
            }

            @keyframes slideOut {
                to { transform: translateX(120%); opacity: 0; }
            }

            @keyframes progress {
                from { width: 100%; }
                to { width: 0%; }
            }
        `;
        const style = document.createElement('style');
        style.id = this.styleId;
        style.textContent = css;
        document.head.appendChild(style);
    },

    // Create the container element
    createContainer() {
        const container = document.createElement('div');
        container.id = this.containerId;
        document.body.appendChild(container);
    },

    /**
     * Show a notification
     * @param {string} message - The message to display
     * @param {string} type - 'info', 'warning', 'error', 'success'
     * @param {number} duration - Duration in ms (default 3000)
     */
    show(message, type = 'info', duration = 3000) {
        this.init(); // Ensure initialized

        const container = document.getElementById(this.containerId);

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `notification-toast ${type}`;

        // Message
        const msgDiv = document.createElement('div');
        msgDiv.className = 'notification-message';
        msgDiv.textContent = message;
        toast.appendChild(msgDiv);

        // Progress bar
        const progressDiv = document.createElement('div');
        progressDiv.className = 'notification-progress';
        progressDiv.style.animationDuration = `${duration}ms`;
        toast.appendChild(progressDiv);

        container.appendChild(toast);

        // Remove after duration
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s forwards';
            toast.addEventListener('animationend', () => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            });
        }, duration);
    }
};

// Export to window
window.NotificationSystem = NotificationSystem;
