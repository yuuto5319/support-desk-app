/**
 * Support Desk App - Stats Routes
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * Helper: Get date range based on period
 */
function getDateRange(period) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    switch (period) {
        case 'week': {
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay() + 1);
            return { start: weekStart.toISOString().split('T')[0], end: todayStr };
        }
        case 'month': {
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            return { start: monthStart.toISOString().split('T')[0], end: todayStr };
        }
        default: // today
            return { start: todayStr, end: todayStr };
    }
}

/**
 * GET /api/stats
 * Get statistics for the specified period
 */
router.get('/', (req, res) => {
    const period = req.query.period || 'today';

    try {
        const { start, end } = getDateRange(period);
        const aggregated = db.stats.getAggregatedByOperator(start, end);
        const desks = db.desks.getAll();

        // Group by operator
        const statsByOperator = {};

        // Initialize with current desk data
        for (const desk of desks) {
            statsByOperator[desk.operator_name] = {
                operatorName: desk.operator_name,
                callCount: desk.call_count,
                totalCallingTime: 0,
                totalAvailableTime: 0,
                totalAfterworkTime: 0,
                totalBreakTime: 0,
                totalAwayTime: 0
            };
        }

        // Add aggregated data
        for (const record of aggregated) {
            if (!statsByOperator[record.operator_name]) continue;

            const statusKey = `total${capitalize(record.status_id)}Time`;
            if (statsByOperator[record.operator_name][statusKey] !== undefined) {
                statsByOperator[record.operator_name][statusKey] = record.total_duration || 0;
            }
        }

        const stats = Object.values(statsByOperator);
        const totals = {
            totalCalls: stats.reduce((sum, s) => sum + s.callCount, 0),
            totalCallingTime: stats.reduce((sum, s) => sum + s.totalCallingTime, 0),
            averageCallTime: 0,
            activeOperators: stats.filter(s => s.callCount > 0).length
        };

        if (totals.totalCalls > 0) {
            totals.averageCallTime = Math.round(totals.totalCallingTime / totals.totalCalls);
        }

        res.json({ stats, totals, period });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: '統計の取得に失敗しました' });
    }
});

/**
 * GET /api/stats/export
 * Export statistics as CSV
 */
router.get('/export', (req, res) => {
    const period = req.query.period || 'today';

    try {
        const { start, end } = getDateRange(period);
        const aggregated = db.stats.getAggregatedByOperator(start, end);
        const desks = db.desks.getAll();

        // Build data same as above
        const statsByOperator = {};
        for (const desk of desks) {
            statsByOperator[desk.operator_name] = {
                operatorName: desk.operator_name,
                callCount: desk.call_count,
                totalCallingTime: 0,
                totalAvailableTime: 0,
                totalAfterworkTime: 0,
                totalBreakTime: 0,
                totalAwayTime: 0
            };
        }

        for (const record of aggregated) {
            if (!statsByOperator[record.operator_name]) continue;
            const statusKey = `total${capitalize(record.status_id)}Time`;
            if (statsByOperator[record.operator_name][statusKey] !== undefined) {
                statsByOperator[record.operator_name][statusKey] = record.total_duration || 0;
            }
        }

        const stats = Object.values(statsByOperator);

        // Generate CSV
        const BOM = '\uFEFF';
        const headers = ['オペレーター', '通話回数', '通話時間', '平均通話時間', '受付可時間', '後処理時間', '休憩時間'];
        const rows = stats.map(s => [
            s.operatorName,
            s.callCount,
            formatDuration(s.totalCallingTime),
            s.callCount > 0 ? formatDuration(s.totalCallingTime / s.callCount) : '-',
            formatDuration(s.totalAvailableTime),
            formatDuration(s.totalAfterworkTime),
            formatDuration(s.totalBreakTime)
        ]);

        const csv = BOM + [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="support-desk-stats-${period}-${start}.csv"`);
        res.send(csv);
    } catch (err) {
        console.error('Error exporting stats:', err);
        res.status(500).json({ error: 'CSVエクスポートに失敗しました' });
    }
});

/**
 * Helper: Capitalize first letter
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Helper: Format duration
 */
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}時間${minutes % 60}分`;
    } else if (minutes > 0) {
        return `${minutes}分${seconds % 60}秒`;
    } else {
        return `${seconds}秒`;
    }
}

module.exports = router;
