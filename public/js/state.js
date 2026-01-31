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
        // Load Socket.io client from CDN if not available
        if (typeof io === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.4/socket.io.min.js';
            script.onload = () => this.connectSocket();
            document.head.appendChild(script);
        } else {
            this.connectSocket();
        }
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

        this.socket.on('memo:updated', (data) => {
            const settings = this.getSettings();
            if (settings.enableNotifications) {
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
        });
    },

    /**
     * Load initial data from server
     */
    async loadInitialData() {
        try {
            // Load desks
            const desksRes = await fetch('/api/desks');
            if (desksRes.ok) {
                this.desks = await desksRes.json();
            }

            // Load statuses
            const statusesRes = await fetch('/api/settings/statuses');
            if (statusesRes.ok) {
                this.statuses = await statusesRes.json();
            }

            // Load settings
            const settingsRes = await fetch('/api/settings');
            if (settingsRes.ok) {
                this.settings = await settingsRes.json();
            }

            this.notifyListeners();
        } catch (err) {
            console.error('Error loading initial data:', err);
            // Fall back to local data if server unavailable
            this.initializeFallbackData();
        }
    },

    /**
     * Initialize fallback data (when server is unavailable)
     */
    initializeFallbackData() {
        if (this.desks.length === 0) {
            const defaultOperators = [
                '山田 太郎', '佐藤 花子', '鈴木 一郎', '田中 美咲',
                '高橋 健太', '伊藤 さくら', '渡辺 龍也', '中村 愛',
                '小林 翔太', '加藤 真由', '吉田 大輝', '山本 結衣'
            ];

            this.desks = defaultOperators.map((name, i) => ({
                id: `desk-${i + 1}`,
                number: i + 1,
                operatorName: name,
                status: 'available',
                statusStartTime: Date.now(),
                callCount: 0,
                memo: ''
            }));
        }

        if (this.statuses.length === 0) {
            this.statuses = [
                { id: 'available', name: '受付可', color: '#22c55e' },
                { id: 'calling', name: '通話中', color: '#ef4444' },
                { id: 'afterwork', name: '後処理', color: '#f59e0b' },
                { id: 'break', name: '休憩', color: '#3b82f6' },
                { id: 'away', name: '離席', color: '#6b7280' }
            ];
        }

        if (Object.keys(this.settings).length === 0) {
            this.settings = {
                theme: 'light',
                flipVertical: false,
                flipHorizontal: false,
                enableNotifications: true
            };
        }

        this.schedules = [];
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
