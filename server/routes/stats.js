/**
 * Support Desk App - Stats Routes
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

const PERIODS = ['today', 'week', 'month'];

/**
 * Helper: Get the period start (local midnight) for 'today' | 'week' | 'month'
 * Weeks start on Monday.
 */
function getPeriodStart(period, now = new Date()) {
    const today = db.startOfLocalDay(now);
    switch (period) {
        case 'week': {
            const daysSinceMonday = (today.getDay() + 6) % 7; // Sun=6, Mon=0
            return new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday);
        }
        case 'month':
            return new Date(today.getFullYear(), today.getMonth(), 1);
        default:
            return today;
    }
}

/**
 * Helper: Build stats for a period
 */
function buildStats(period) {
    const now = new Date();
    const periodStart = getPeriodStart(period, now);
    const statuses = db.statuses.getAll().map(s => ({ id: s.id, name: s.name, color: s.color }));
    const stats = db.stats.getSummary(periodStart, now);

    const totalCalls = stats.reduce((sum, s) => sum + s.callCount, 0);
    const totalCallingTime = stats.reduce((sum, s) => sum + (s.durations.calling || 0), 0);

    return {
        period,
        start: db.getLocalDateString(periodStart),
        end: db.getLocalDateString(now),
        statuses,
        stats,
        totals: {
            totalCalls,
            totalCallingTime,
            averageCallTime: totalCalls > 0 ? Math.round(totalCallingTime / totalCalls) : 0,
            activeOperators: stats.filter(s => s.callCount > 0).length
        }
    };
}

/**
 * GET /api/stats
 * Get statistics for the specified period
 */
router.get('/', (req, res) => {
    const period = PERIODS.includes(req.query.period) ? req.query.period : 'today';

    try {
        res.json(buildStats(period));
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
    const period = PERIODS.includes(req.query.period) ? req.query.period : 'today';

    try {
        const { start, statuses, stats } = buildStats(period);

        // Generate CSV (one duration column per status, including custom ones)
        const BOM = '﻿';
        const headers = ['オペレーター', '通話回数', '平均通話時間', ...statuses.map(s => neutralizeFormula(`${s.name}時間`))];
        const rows = stats.map(s => {
            const callingTime = s.durations.calling || 0;
            return [
                neutralizeFormula(s.operatorName),
                s.callCount,
                s.callCount > 0 ? formatDuration(callingTime / s.callCount) : '-',
                ...statuses.map(status => formatDuration(s.durations[status.id] || 0))
            ];
        });

        const csv = BOM + [headers, ...rows].map(r => r.map(toCsvField).join(',')).join('\r\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="support-desk-stats-${period}-${start}.csv"`);
        res.send(csv);
    } catch (err) {
        console.error('Error exporting stats:', err);
        res.status(500).json({ error: 'CSVエクスポートに失敗しました' });
    }
});

/**
 * Helper: Quote a CSV field
 */
function toCsvField(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * Helper: Prefix user-entered text starting with = + - @ with ' so spreadsheet
 * apps do not evaluate it as a formula
 */
function neutralizeFormula(text) {
    const value = String(text ?? '');
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
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
module.exports.getPeriodStart = getPeriodStart; // exposed for tests
