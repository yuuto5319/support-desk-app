/**
 * Support Desk App - Settings Module
 * Handles settings management, status configuration, and operator assignment
 */

const Settings = {
    /**
     * Initialize settings functionality
     */
    init() {
        this.render();
        this.setupEventHandlers();

        // Listen for state changes
        State.addListener(() => {
            const view = document.getElementById('settingsView');
            if (!view.classList.contains('active')) return;

            // Don't wipe an input the user is editing; re-render once they leave it
            if (view.contains(document.activeElement) && document.activeElement.matches('input[type="text"]')) {
                this.pendingRender = true;
                return;
            }
            this.render();
        });

        // Apply updates that arrived while an input was being edited
        document.getElementById('settingsView').addEventListener('focusout', () => {
            if (!this.pendingRender) return;
            // Wait until focus has moved (and any 'change' handler has run)
            setTimeout(() => {
                const view = document.getElementById('settingsView');
                if (view.contains(document.activeElement) && document.activeElement.matches('input[type="text"]')) return;
                this.pendingRender = false;
                this.render();
            }, 0);
        });
    },

    /**
     * Render settings view
     */
    render() {
        this.renderDisplaySettings();
        this.renderStatusList();
        this.renderOperatorAssignment();
    },

    /**
     * Render display settings
     */
    renderDisplaySettings() {
        // 反転・通知の設定はローカル（各ユーザーのブラウザに保存）
        const localSettings = Desk.getLocalSettings();

        const flipVertical = document.getElementById('flipVertical');
        const flipHorizontal = document.getElementById('flipHorizontal');
        const enableNotifications = document.getElementById('enableNotifications');

        if (flipVertical) flipVertical.checked = localSettings.flipVertical || false;
        if (flipHorizontal) flipHorizontal.checked = localSettings.flipHorizontal || false;
        if (enableNotifications) enableNotifications.checked = localSettings.enableNotifications !== false;
    },

    /**
     * Render status list
     */
    renderStatusList() {
        const container = document.getElementById('statusList');
        if (!container) return;

        const statuses = State.getStatuses();

        container.innerHTML = statuses.map(status => {
            const statusId = Utils.escapeHtml(status.id);
            return `
      <div class="status-item" data-status-id="${statusId}">
        <input type="color"
               class="status-color-picker"
               value="${Utils.safeColor(status.color)}"
               data-status-id="${statusId}"
        />
        <input type="text"
               class="status-name-input"
               value="${Utils.escapeHtml(status.name)}"
               data-status-id="${statusId}"
               placeholder="ステータス名"
        />
        <button class="status-delete-btn" data-status-id="${statusId}" title="削除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;
        }).join('');

        // Setup handlers for each status
        this.setupStatusHandlers();
    },

    /**
     * Render operator assignment
     */
    renderOperatorAssignment() {
        const container = document.getElementById('operatorAssignment');
        if (!container) return;

        const desks = State.getDesks();

        container.innerHTML = `
      <div class="status-list">
        ${desks.map(desk => `
          <div class="status-item">
            <span class="desk-number" style="min-width: 60px; text-align: center;">DESK ${desk.number}</span>
            <input type="text" 
                   class="status-name-input operator-name-input" 
                   value="${Utils.escapeHtml(desk.operatorName)}"
                   data-desk-id="${Utils.escapeHtml(desk.id)}"
                   placeholder="オペレーター名"
            />
          </div>
        `).join('')}
      </div>
    `;

        // Setup handlers for operator name changes
        this.setupOperatorHandlers();
    },

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Display settings
        const flipVertical = document.getElementById('flipVertical');
        const flipHorizontal = document.getElementById('flipHorizontal');
        const enableNotifications = document.getElementById('enableNotifications');
        const addStatusBtn = document.getElementById('addStatusBtn');

        if (flipVertical) {
            flipVertical.addEventListener('change', (e) => {
                // ローカル設定として保存（各ユーザー固有）
                const localSettings = Desk.getLocalSettings();
                localSettings.flipVertical = e.target.checked;
                Desk.saveLocalSettings(localSettings);
            });
        }

        if (flipHorizontal) {
            flipHorizontal.addEventListener('change', (e) => {
                // ローカル設定として保存（各ユーザー固有）
                const localSettings = Desk.getLocalSettings();
                localSettings.flipHorizontal = e.target.checked;
                Desk.saveLocalSettings(localSettings);
            });
        }

        if (enableNotifications) {
            enableNotifications.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    const granted = await Utils.requestNotificationPermission();
                    if (!granted) {
                        e.target.checked = false;
                        alert('通知許可が必要です。ブラウザの設定から通知を許可してください。');
                        return;
                    }
                }
                // Notifications are per browser, so this is not sent to the server
                Desk.updateLocalSettings({ enableNotifications: e.target.checked });
            });
        }

        if (addStatusBtn) {
            addStatusBtn.addEventListener('click', () => this.addNewStatus());
        }
    },

    /**
     * Setup status handlers
     */
    setupStatusHandlers() {
        const colorPickers = document.querySelectorAll('.status-color-picker');
        const nameInputs = document.querySelectorAll('.status-name-input:not(.operator-name-input)');
        const deleteButtons = document.querySelectorAll('.status-delete-btn');

        colorPickers.forEach(picker => {
            picker.addEventListener('change', (e) => {
                this.updateStatus(e.target.dataset.statusId, { color: e.target.value });
            });
        });

        nameInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                this.updateStatus(e.target.dataset.statusId, { name: e.target.value });
            });
        });

        deleteButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const statusId = e.currentTarget.dataset.statusId;
                this.deleteStatus(statusId);
            });
        });
    },

    /**
     * Setup operator handlers
     */
    setupOperatorHandlers() {
        const inputs = document.querySelectorAll('.operator-name-input');

        inputs.forEach(input => {
            input.addEventListener('change', async (e) => {
                const deskId = e.target.dataset.deskId;
                const name = e.target.value.trim();
                if (name) {
                    // Update via Socket or API
                    if (State.socket?.connected) {
                        State.socket.emit('desk:updateOperator', { deskId, operatorName: name });
                    } else {
                        await fetch(`/api/desks/${deskId}/operator`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ operatorName: name })
                        });
                    }
                }
            });
        });
    },

    /**
     * Update a status
     */
    updateStatus(statusId, updates) {
        const statuses = State.getStatuses();
        const index = statuses.findIndex(s => s.id === statusId);
        if (index !== -1) {
            statuses[index] = { ...statuses[index], ...updates };
            State.updateStatuses(statuses);
        }
    },

    /**
     * Delete a status
     */
    deleteStatus(statusId) {
        const statuses = State.getStatuses();

        // Don't allow deleting if only one status remains
        if (statuses.length <= 1) {
            alert('最後のステータスは削除できません。');
            return;
        }

        // Don't allow deleting default statuses
        const defaultIds = ['available', 'calling', 'afterwork', 'break', 'away'];
        if (defaultIds.includes(statusId)) {
            alert('デフォルトのステータスは削除できません。');
            return;
        }

        State.deleteStatus(statusId);
        this.renderStatusList();
    },

    /**
     * Add new status
     */
    addNewStatus() {
        const statuses = State.getStatuses();
        const newStatus = {
            id: 'custom-' + Utils.generateId(),
            name: '新規ステータス',
            color: '#8b5cf6'
        };
        statuses.push(newStatus);
        State.updateStatuses(statuses);
        this.renderStatusList();
    }
};

// Export for use in other modules
window.Settings = Settings;
