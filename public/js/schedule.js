/**
 * Support Desk App - Schedule Module
 * Handles schedule management and UI
 */

const Schedule = {
    /**
     * Initialize schedule module
     */
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.setupSocketListeners();
        this.fetchSchedules(); // Initial fetch
    },

    /**
     * Cache DOM elements
     */
    cacheDOM() {
        this.dom = {
            list: document.getElementById('scheduleList'),
            empty: document.getElementById('scheduleEmpty'),
            addModal: document.getElementById('scheduleAddModal'),
            closeAddBtn: document.getElementById('closeScheduleAdd'),
            addForm: {
                deskId: document.getElementById('scheduleAddDeskId'),
                deskInfo: document.getElementById('scheduleAddDeskInfo'),
                title: document.getElementById('scheduleAddTitle'),
                time: document.getElementById('scheduleAddTime'),
                memo: document.getElementById('scheduleAddMemo'),
                submit: document.getElementById('scheduleAddSubmit')
            }
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Modal close button
        if (this.dom.closeAddBtn) {
            this.dom.closeAddBtn.addEventListener('click', () => {
                this.closeAddModal();
            });
        }

        // Close modal on overlay click
        if (this.dom.addModal) {
            this.dom.addModal.addEventListener('click', (e) => {
                if (e.target === this.dom.addModal) {
                    this.closeAddModal();
                }
            });
        }

        // Submit new schedule
        if (this.dom.addForm.submit) {
            this.dom.addForm.submit.addEventListener('click', () => {
                this.handleAddSubmit();
            });
        }
    },

    /**
     * Setup socket listeners
     */
    setupSocketListeners() {
        if (!window.socket) return;

        socket.on('schedule:added', (schedule) => {
            State.addSchedule(schedule);
            this.render();
            Desk.render(); // Update desk cards (to show schedule indicators)

            // Show notification if configured
            /*
            if (Notification.permission === 'granted') {
                new Notification(`新しいスケジュール: ${schedule.operatorName || 'Desk ' + schedule.desk_number}`, {
                    body: `${schedule.scheduled_time} - ${schedule.title}`,
                    icon: '/favicon.ico'
                });
            }
            */
        });

        socket.on('schedule:deleted', (data) => {
            State.removeSchedule(data.scheduleId);
            this.render();
            Desk.render(); // Update desk cards
        });
    },

    /**
     * Fetch schedules from server
     */
    async fetchSchedules() {
        try {
            const response = await fetch('/api/schedules');
            if (response.ok) {
                const schedules = await response.json();
                State.setSchedules(schedules);
                this.render();
            }
        } catch (err) {
            console.error('Failed to fetch schedules:', err);
        }
    },

    /**
     * Open add schedule modal
     */
    openAddModal(deskId) {
        const desk = State.getDesks().find(d => d.id === deskId);
        if (!desk) return;

        this.dom.addForm.deskId.value = deskId;
        this.dom.addForm.deskInfo.textContent = `DESK ${desk.number} (${desk.operatorName || '未割当'}) へのスケジュール追加`;

        // Set default time to now + 30 mins, rounded to nearest 5 mins
        const now = new Date();
        now.setMinutes(now.getMinutes() + 30);
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(Math.ceil(now.getMinutes() / 5) * 5).padStart(2, '0');
        this.dom.addForm.time.value = `${hours}:${minutes}`;

        this.dom.addForm.title.value = '';
        this.dom.addForm.memo.value = '';

        this.dom.addModal.classList.add('active');
    },

    /**
     * Close add schedule modal
     */
    closeAddModal() {
        this.dom.addModal.classList.remove('active');
    },

    /**
     * Handle add schedule submit
     */
    handleAddSubmit() {
        const deskId = this.dom.addForm.deskId.value;
        const title = this.dom.addForm.title.value.trim();
        const time = this.dom.addForm.time.value;
        const memo = this.dom.addForm.memo.value.trim();

        if (!title || !time) {
            alert('タイトルと時間は必須です');
            return;
        }

        // Send to server
        socket.emit('schedule:add', {
            deskId,
            title,
            memo,
            scheduledTime: time // 'HH:mm' format
        });

        this.closeAddModal();
    },

    /**
     * Delete a schedule
     */
    deleteSchedule(id) {
        if (!confirm('このスケジュールを削除しますか？')) return;

        socket.emit('schedule:delete', { scheduleId: id });
    },

    /**
     * Render schedule list
     */
    render() {
        const schedules = State.getSchedules();

        if (schedules.length === 0) {
            this.dom.list.innerHTML = '';
            this.dom.empty.style.display = 'flex';
            return;
        }

        this.dom.empty.style.display = 'none';

        // Sort by time
        schedules.sort((a, b) => {
            return a.scheduled_time.localeCompare(b.scheduled_time);
        });

        this.dom.list.innerHTML = schedules.map(schedule => {
            const isPast = this.isPastSchedule(schedule.scheduled_time);

            return `
                <div class="schedule-item ${isPast ? 'past' : ''}">
                    <div class="schedule-time-col">
                        <span class="schedule-time">${schedule.scheduled_time}</span>
                    </div>
                    <div class="schedule-info-col">
                        <div class="schedule-desk">
                            <span class="desk-badge">DESK ${schedule.desk_number}</span>
                            <span class="operator-name">${schedule.operatorName || '未割当'}</span>
                        </div>
                        <div class="schedule-title">${Utils.escapeHtml(schedule.title)}</div>
                        ${schedule.memo ? `<div class="schedule-memo">${Utils.escapeHtml(schedule.memo)}</div>` : ''}
                    </div>
                    <div class="schedule-action-col">
                        <button class="btn-icon delete-schedule-btn" data-id="${schedule.id}" title="削除">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach delete handlers
        document.querySelectorAll('.delete-schedule-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                this.deleteSchedule(id);
            });
        });
    },

    /**
     * Check if schedule time is in the past (today)
     */
    isPastSchedule(timeStr) {
        const now = new Date();
        const [hours, minutes] = timeStr.split(':').map(Number);
        const scheduleTime = new Date();
        scheduleTime.setHours(hours, minutes, 0, 0);
        return scheduleTime < now;
    }
};
