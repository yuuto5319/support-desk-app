/**
 * Support Desk App - Settings Routes
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * GET /api/settings
 * Get all settings
 */
router.get('/', (req, res) => {
    try {
        const settings = {
            theme: db.settings.get('theme') || 'light',
            flipVertical: db.settings.get('flipVertical') || false,
            flipHorizontal: db.settings.get('flipHorizontal') || false,
            enableNotifications: db.settings.get('enableNotifications') !== false
        };
        res.json(settings);
    } catch (err) {
        console.error('Error fetching settings:', err);
        res.status(500).json({ error: '設定の取得に失敗しました' });
    }
});

/**
 * PATCH /api/settings
 * Update settings
 */
router.patch('/', (req, res) => {
    const updates = req.body;

    try {
        for (const [key, value] of Object.entries(updates)) {
            db.settings.set(key, value);
        }

        // Broadcast to all clients
        const io = req.app.get('io');
        io.to('desks').emit('settings:updated', updates);

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: '設定の更新に失敗しました' });
    }
});

/**
 * GET /api/settings/statuses
 * Get all status definitions
 */
router.get('/statuses', (req, res) => {
    try {
        const statuses = db.statuses.getAll();
        res.json(statuses.map(s => ({
            id: s.id,
            name: s.name,
            color: s.color
        })));
    } catch (err) {
        console.error('Error fetching statuses:', err);
        res.status(500).json({ error: 'ステータスの取得に失敗しました' });
    }
});

/**
 * PUT /api/settings/statuses
 * Update status definitions
 */
router.put('/statuses', (req, res) => {
    const { statuses } = req.body;

    if (!Array.isArray(statuses)) {
        return res.status(400).json({ error: 'ステータスの配列が必要です' });
    }

    try {
        for (const status of statuses) {
            const existing = db.statuses.getAll().find(s => s.id === status.id);
            if (existing) {
                db.statuses.update(status.id, status.name, status.color);
            } else {
                db.statuses.create(status.id, status.name, status.color);
            }
        }

        const allStatuses = db.statuses.getAll();

        // Broadcast to all clients
        const io = req.app.get('io');
        io.to('desks').emit('statuses:updated', allStatuses.map(s => ({
            id: s.id,
            name: s.name,
            color: s.color
        })));

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating statuses:', err);
        res.status(500).json({ error: 'ステータスの更新に失敗しました' });
    }
});

/**
 * DELETE /api/settings/statuses/:id
 * Delete a custom status
 */
router.delete('/statuses/:id', (req, res) => {
    const statusId = req.params.id;

    // Don't allow deleting default statuses
    const defaultIds = ['available', 'calling', 'afterwork', 'break', 'away'];
    if (defaultIds.includes(statusId)) {
        return res.status(400).json({ error: 'デフォルトのステータスは削除できません' });
    }

    try {
        db.statuses.delete(statusId);

        const allStatuses = db.statuses.getAll();

        // Broadcast to all clients
        const io = req.app.get('io');
        io.to('desks').emit('statuses:updated', allStatuses.map(s => ({
            id: s.id,
            name: s.name,
            color: s.color
        })));

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting status:', err);
        res.status(500).json({ error: 'ステータスの削除に失敗しました' });
    }
});

module.exports = router;
