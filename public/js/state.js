/**
 * Support Desk App - State Management (Server-connected version)
 * Handles application state with Server API and Socket.io sync
 */

const State = {
    // Socket.io connection
    socket: null,

    // Auth token
    token: null,
    user: null,

    // Cached data
    desks: [],
    statuses: [],
    schedules: [],
    settings: {},

    // Callback functions for state changes
    listeners: [],

    // Whether the socket has connected at least once / initial data has been loaded
    hasConnected: false,
    dataLoaded: false,

    /**
     * Initialize state management
     */
    async init() {
        // Load token from localStorage
        this.token = localStorage.getItem('support-desk-token');
        const userJson = localStorage.getItem('support-desk-user');
        if (userJson) {
            try {
                this.user = JSON.parse(userJson);
            } catch (e) {
                this.user = null;
            }
        }

        // Initialize Socket.io connection
        this.initSocket();

        // Load initial data
        await this.loadInitialData();
    },

    /**
     * Initialize Socket.io connection
     */
    initSocket() {
        // The client script is served by this server, so it is missing only when
        // the server could not be reached while the page was loading
        if (typeof io === 'undefined') {
            this.setConnectionStatus(false, 'サーバーに接続できません。サーバーが起動しているか確認し、ページを再読み込みしてください。');
            return;
        }
        this.connectSocket();
    },

    /**
     * Show or hide the "not connected" banner
     */
    setConnectionStatus(connected, message) {
        const banner = document.getElementById('connectionBanner');
        if (!banner) return;
        if (connected) {
            banner.hidden = true;
        } else {
            banner.textContent = message || 'サーバーとの接続が切れています。再接続しています…（表示が最新ではない可能性があります）';
            banner.hidden = false;
        }
    },

    /**
     * Reload everything from the server (after a reconnect or when the date changes)
     */
    async reload() {
        await this.loadInitialData();
        if (window.Schedule) Schedule.fetchSchedules();
    },

    /**
     * Connect to Socket.io server
     */
    connectSocket() {
        this.socket = io({
            auth: {
                token: this.token
            }
        });

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.setConnectionStatus(true);
            // Updates broadcast while disconnected (or a server restart) were missed,
            // so fetch the current state again
            if (this.hasConnected || !this.dataLoaded) {
                this.reload();
            }
            this.hasConnected = true;
        });

        this.socket.on('connect_error', () => {
            this.setConnectionStatus(false);
        });

        this.socket.on('desks:updated', (desks) => {
            this.desks = desks;
            this.notifyListeners();
        });

        this.socket.on('statuses:updated', (statuses) => {
            this.statuses = statuses;
            this.notifyListeners();
        });

        this.socket.on('settings:updated', (updates) => {
            this.settings = { ...this.settings, ...updates };
            this.notifyListeners();
        });

        // Every client (including the sender) is notified once via this broadcast
        this.socket.on('memo:updated', (data) => {
            if (Desk.getLocalSettings().enableNotifications) {
                const desk = this.desks.find(d => d.id === data.deskId);
                if (desk) {
                    Utils.sendNotification(
                        `${desk.operatorName} へのメモ`,
                        data.memo,
                        '📝'
                    );
                }
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.setConnectionStatus(false);
        });
    },

    /**
     * Load desks, statuses and settings from the server.
     * If the server cannot be reached, the previous data is kept and a banner is shown
     * (made-up data would look like real desk statuses).
     */
    async loadInitialData() {
        try {
            const [desksRes, statusesRes, settingsRes] = await Promise.all([
                fetch('/api/desks'),
                fetch('/api/settings/statuses'),
                fetch('/api/settings')
            ]);
            if (!desksRes.ok || !statusesRes.ok || !settingsRes.ok) {
                throw new Error('Failed to load data from server');
            }

            this.desks = await desksRes.json();
            this.statuses = await statusesRes.json();
            this.settings = await settingsRes.json();
            this.dataLoaded = true;
            if (this.socket?.connected) this.setConnectionStatus(true);

            this.notifyListeners();
        } catch (err) {
            console.error('Error loading initial data:', err);
            this.setConnectionStatus(false);
        }
    },

    /**
     * Login
     */
    async login(username, password) {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'ログインに失敗しました');
        }

        const data = await res.json();
        this.token = data.token;
        this.user = data.user;

        localStorage.setItem('support-desk-token', data.token);
        localStorage.setItem('support-desk-user', JSON.stringify(data.user));

        // Reconnect socket with new token
        if (this.socket) {
            this.socket.auth = { token: this.token };
            this.socket.connect();
        }

        return data.user;
    },

    /**
     * Logout
     */
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('support-desk-token');
        localStorage.removeItem('support-desk-user');

        if (this.socket) {
            this.socket.disconnect();
        }
    },

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return !!this.token;
    },

    /**
     * Check if user is admin
     */
    isAdmin() {
        return this.user?.role === 'admin';
    },

    /**
     * Get all desks
     */
    getDesks() {
        return this.desks;
    },

    /**
     * Get a specific desk
     */
    getDesk(deskId) {
        return this.desks.find(d => d.id === deskId);
    },

    /**
     * Update a desk status
     */
    async updateDesk(deskId, updates) {
        if (updates.status) {
            // Update via socket for real-time sync
            if (this.socket?.connected) {
                this.socket.emit('desk:changeStatus', { deskId, statusId: updates.status });
            } else {
                // Fall back to API call
                await fetch(`/api/desks/${deskId}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ statusId: updates.status })
                });
            }
        }

        // Update local state optimistically
        const index = this.desks.findIndex(d => d.id === deskId);
        if (index !== -1) {
            if (updates.status && updates.status !== this.desks[index].status) {
                updates.statusStartTime = Date.now();
                if (updates.status === 'calling') {
                    updates.callCount = (this.desks[index].callCount || 0) + 1;
                }
            }
            this.desks[index] = { ...this.desks[index], ...updates };
            this.notifyListeners();
        }
    },

    /**
     * Update desk memo
     */
    async updateMemo(deskId, memo) {
        if (this.socket?.connected) {
            this.socket.emit('desk:updateMemo', { deskId, memo });
        } else {
            await fetch(`/api/desks/${deskId}/memo`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memo })
            });
        }

        // Update local state
        const index = this.desks.findIndex(d => d.id === deskId);
        if (index !== -1) {
            this.desks[index].memo = memo;
            this.notifyListeners();
        }
    },

    /**
     * Get memo history for a desk
     */
    async getMemoHistory(deskId) {
        try {
            const res = await fetch(`/api/desks/${deskId}/memo-history`);
            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.error('Error fetching memo history:', err);
        }
        return [];
    },

    /**
     * Get all statuses
     */
    getStatuses() {
        return this.statuses;
    },

    /**
     * Update statuses
     */
    async updateStatuses(statuses) {
        if (this.socket?.connected) {
            this.socket.emit('statuses:update', { statuses });
        } else {
            await fetch('/api/settings/statuses', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ statuses })
            });
        }

        this.statuses = statuses;
        this.notifyListeners();
    },

    /**
     * Delete a custom status (desks on it are moved back to 'available' by the server)
     */
    async deleteStatus(statusId) {
        if (this.socket?.connected) {
            this.socket.emit('status:delete', { statusId });
        } else {
            await fetch(`/api/settings/statuses/${encodeURIComponent(statusId)}`, {
                method: 'DELETE'
            });
        }

        this.statuses = this.statuses.filter(s => s.id !== statusId);
        this.notifyListeners();
    },

    /**
     * Get settings
     */
    getSettings() {
        return this.settings;
    },

    /**
     * Update settings
     */
    async updateSettings(updates) {
        if (this.socket?.connected) {
            for (const [key, value] of Object.entries(updates)) {
                this.socket.emit('settings:update', { key, value });
            }
        } else {
            await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
        }

        this.settings = { ...this.settings, ...updates };
        this.notifyListeners();
    },

    // --- Schedule Methods ---
    getSchedules() {
        return this.schedules;
    },

    setSchedules(schedules) {
        this.schedules = schedules;
    },

    addSchedule(schedule) {
        this.schedules.push(schedule);
    },

    removeSchedule(id) {
        this.schedules = this.schedules.filter(s => s.id !== id);
    },
    // ------------------------

    /**
     * Add listener for state changes
     */
    addListener(callback) {
        this.listeners.push(callback);
    },

    /**
     * Remove listener
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    },

    /**
     * Notify all listeners of state change
     */
    notifyListeners() {
        this.listeners.forEach(callback => callback());
    }
};

// Export for use in other modules
window.State = State;
