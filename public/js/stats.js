/**
 * Support Desk App - Stats Module
 * Handles statistics reporting (aggregated on the server)
 */

const PERIOD_LABELS = {
    today: '本日',
    week: '今週（月曜から）',
    month: '今月'
};

const Stats = {
    // Ignore responses from older requests when the period changes quickly
    requestSeq: 0,

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

    getPeriod() {
        return document.getElementById('statsPeriod')?.value || 'today';
    },

    /**
     * Fetch stats from server and render
     */
    async render() {
        const period = this.getPeriod();
        const seq = ++this.requestSeq;

        try {
            const res = await fetch(`/api/stats?period=${encodeURIComponent(period)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (seq !== this.requestSeq) return;

            this.renderOverview(data.totals, data.period);
            this.renderTable(data.stats, data.statuses);
        } catch (err) {
            console.error('Error fetching stats:', err);
            if (seq !== this.requestSeq) return;
            this.renderError();
        }
    },

    /**
     * Render overview cards
     */
    renderOverview(totals, period) {
        const container = document.getElementById('statsOverview');
        if (!container) return;

        const label = PERIOD_LABELS[period] || PERIOD_LABELS.today;

        container.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-label">総通話回数</div>
        <div class="stat-card-value">${totals.totalCalls}</div>
        <div class="stat-card-sub">${label}の通話</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">総通話時間</div>
        <div class="stat-card-value">${Utils.formatDuration(totals.totalCallingTime)}</div>
        <div class="stat-card-sub">${label}の累計</div>
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
     * Render stats table (one duration column per status)
     */
    renderTable(stats, statuses) {
        const head = document.getElementById('statsTableHead');
        const tbody = document.getElementById('statsTableBody');
        if (!head || !tbody) return;

        head.innerHTML = `
      <th>オペレーター</th>
      <th>通話回数</th>
      <th>平均通話時間</th>
      ${statuses.map(s => `<th>${Utils.escapeHtml(s.name)}時間</th>`).join('')}
    `;

        tbody.innerHTML = stats.map(s => {
            const callingTime = s.durations.calling || 0;
            return `
      <tr>
        <td>${Utils.escapeHtml(s.operatorName)}</td>
        <td>${s.callCount}</td>
        <td>${s.callCount > 0 ? Utils.formatDuration(callingTime / s.callCount) : '-'}</td>
        ${statuses.map(status => `<td>${Utils.formatDuration(s.durations[status.id] || 0)}</td>`).join('')}
      </tr>
    `;
        }).join('');
    },

    /**
     * Render an error state when the server cannot be reached
     */
    renderError() {
        const overview = document.getElementById('statsOverview');
        const tbody = document.getElementById('statsTableBody');
        if (overview) overview.innerHTML = '';
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">統計を取得できませんでした</td></tr>';
        }
    },

    /**
     * Export stats to CSV via server
     */
    exportToCSV() {
        window.location.href = `/api/stats/export?period=${encodeURIComponent(this.getPeriod())}`;
    }
};

// Export for use in other modules
window.Stats = Stats;
