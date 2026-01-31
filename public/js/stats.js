/**
 * Support Desk App - Stats Module
 * Handles statistics calculation and reporting
 */

const Stats = {
    /**
     * Initialize stats functionality
     */
    init() {
        this.setupEventHandlers();
        this.render();

        // Listen for state changes
        State.addListener(() => {
            if (document.getElementById('statsView').classList.contains('active')) {
                this.render();
            }
        });
    },

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        const periodSelect = document.getElementById('statsPeriod');
        const exportBtn = document.getElementById('exportCsv');

        if (periodSelect) {
            periodSelect.addEventListener('change', () => this.render());
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportToCSV());
        }
    },

    /**
     * Render stats view
     */
    async render() {
        await this.fetchAndRenderStats();
    },

    /**
     * Fetch stats from server and render
     */
    async fetchAndRenderStats() {
        const period = document.getElementById('statsPeriod')?.value || 'today';

        try {
            const res = await fetch(`/api/stats?period=${period}`);
            if (res.ok) {
                const data = await res.json();
                this.renderOverviewWithData(data.totals);
                this.renderTableWithData(data.stats);
            } else {
                // Fall back to local calculation
                this.renderOverview();
                this.renderTable();
            }
        } catch (err) {
            // Fall back to local calculation
            this.renderOverview();
            this.renderTable();
        }
    },

    /**
     * Calculate stats for all operators (fallback)
     */
    calculateStats() {
        const desks = State.getDesks();

        const stats = {};

        // Initialize stats for each operator
        desks.forEach(desk => {
            stats[desk.operatorName] = {
                operatorName: desk.operatorName,
                callCount: desk.callCount || 0,
                totalCallingTime: 0,
                totalAvailableTime: 0,
                totalAfterworkTime: 0,
                totalBreakTime: 0,
                totalAwayTime: 0
            };
        });

        return Object.values(stats);
    },

    /**
     * Calculate totals
     */
    calculateTotals(stats) {
        return {
            totalCalls: stats.reduce((sum, s) => sum + s.callCount, 0),
            totalCallingTime: stats.reduce((sum, s) => sum + s.totalCallingTime, 0),
            averageCallTime: stats.reduce((sum, s) => sum + s.callCount, 0) > 0
                ? stats.reduce((sum, s) => sum + s.totalCallingTime, 0) / stats.reduce((sum, s) => sum + s.callCount, 0)
                : 0,
            activeOperators: stats.filter(s => s.callCount > 0).length
        };
    },

    /**
     * Render overview cards with server data
     */
    renderOverviewWithData(totals) {
        const container = document.getElementById('statsOverview');
        if (!container) return;

        container.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-label">総通話回数</div>
        <div class="stat-card-value">${totals.totalCalls}</div>
        <div class="stat-card-sub">本日の通話</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">総通話時間</div>
        <div class="stat-card-value">${Utils.formatDuration(totals.totalCallingTime)}</div>
        <div class="stat-card-sub">累計</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">平均通話時間</div>
        <div class="stat-card-value">${Utils.formatDuration(totals.averageCallTime)}</div>
        <div class="stat-card-sub">1件あたり</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">稼働オペレーター</div>
        <div class="stat-card-value">${totals.activeOperators}</div>
        <div class="stat-card-sub">通話実績あり</div>
      </div>
    `;
    },

    /**
     * Render overview cards (fallback)
     */
    renderOverview() {
        const stats = this.calculateStats();
        const totals = this.calculateTotals(stats);
        this.renderOverviewWithData(totals);
    },

    /**
     * Render stats table with server data
     */
    renderTableWithData(stats) {
        const tbody = document.getElementById('statsTableBody');
        if (!tbody) return;

        tbody.innerHTML = stats.map(s => `
      <tr>
        <td>${s.operatorName}</td>
        <td>${s.callCount}</td>
        <td>${Utils.formatDuration(s.totalCallingTime)}</td>
        <td>${s.callCount > 0 ? Utils.formatDuration(s.totalCallingTime / s.callCount) : '-'}</td>
        <td>${Utils.formatDuration(s.totalAvailableTime)}</td>
        <td>${Utils.formatDuration(s.totalAfterworkTime)}</td>
        <td>${Utils.formatDuration(s.totalBreakTime)}</td>
      </tr>
    `).join('');
    },

    /**
     * Render stats table (fallback)
     */
    renderTable() {
        const stats = this.calculateStats();
        this.renderTableWithData(stats);
    },

    /**
     * Export stats to CSV via server
     */
    exportToCSV() {
        const period = document.getElementById('statsPeriod')?.value || 'today';

        // Download CSV from server
        window.location.href = `/api/stats/export?period=${period}`;
    },

    /**
     * Capitalize first letter
     */
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
};

// Export for use in other modules
window.Stats = Stats;
