/**
 * Support Desk App - Main Application
 * Entry point and initialization
 */

const App = {
    // Update interval for status times
    updateInterval: null,

    /**
     * Initialize the application
     */
    async init() {
        // Initialize state management (async - loads from server)
        await State.init();

        // Initialize modules
        Memo.init();
        Desk.init();
        Stats.init();
        Settings.init();

        // Setup navigation
        this.setupNavigation();

        // Setup theme toggle
        this.setupThemeToggle();

        // Apply saved theme
        this.applyTheme();

        // Start status time updates
        this.startStatusTimeUpdates();

        // Request notification permission
        Utils.requestNotificationPermission();

        console.log('Support Desk Monitor initialized (connected to server)');
    },

    /**
     * Setup navigation between views
     */
    setupNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');

        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const viewName = btn.dataset.view;
                this.switchView(viewName);

                // Update active state
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    },

    /**
     * Switch between views
     */
    switchView(viewName) {
        const views = document.querySelectorAll('.view');
        views.forEach(view => view.classList.remove('active'));

        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.classList.add('active');

            // Refresh view-specific content
            if (viewName === 'stats') {
                Stats.render();
            } else if (viewName === 'settings') {
                Settings.render();
            } else if (viewName === 'dashboard') {
                Desk.render();
            }
        }
    },

    /**
     * Setup theme toggle
     */
    setupThemeToggle() {
        const toggle = document.getElementById('themeToggle');

        if (toggle) {
            toggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

                document.documentElement.setAttribute('data-theme', newTheme);
                State.updateSettings({ theme: newTheme });

                this.updateThemeIcon(newTheme);
            });
        }
    },

    /**
     * Apply saved theme
     */
    applyTheme() {
        const settings = State.getSettings();
        const theme = settings.theme || 'light';

        document.documentElement.setAttribute('data-theme', theme);
        this.updateThemeIcon(theme);
    },

    /**
     * Update theme toggle icon
     */
    updateThemeIcon(theme) {
        const toggle = document.getElementById('themeToggle');
        if (!toggle) return;

        const sunIcon = toggle.querySelector('.sun-icon');
        const moonIcon = toggle.querySelector('.moon-icon');

        if (theme === 'dark') {
            sunIcon?.classList.add('hidden');
            moonIcon?.classList.remove('hidden');
        } else {
            sunIcon?.classList.remove('hidden');
            moonIcon?.classList.add('hidden');
        }
    },

    /**
     * Start periodic updates for status times
     */
    startStatusTimeUpdates() {
        // Update every second
        this.updateInterval = setInterval(() => {
            Desk.updateStatusTimes();
        }, 1000);
    },

    /**
     * Stop status time updates
     */
    stopStatusTimeUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for use in other modules
window.App = App;
