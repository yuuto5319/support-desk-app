/**
 * Support Desk App - Desks Routes
 */

const express = require('express');
const db = require('../db');
const { isNonEmptyString, isValidMemo } = require('../validate');

const router = express.Router();

/**
 * Broadcast the latest desk list to all clients
 */
function broadcastDesks(req) {
    req.app.get('io').to('desks').emit('desks:updated', db.desks.getAllForClient());
}

/**
 * GET /api/desks
 * Get all desks with status info
 */
router.get('/', (req, res) => {
    try {
        res.json(db.desks.getAllForClient());
    } catch (err) {
        console.error('Error fetching desks:', err);
        res.status(500).json({ error: 'デスク情報の取得に失敗しました' });
    }
});

/**
 * GET /api/desks/:id
 * Get a specific desk
 */
router.get('/:id', (req, res) => {
    try {
        const desk = db.desks.getById(req.params.id);
        if (!desk) {
            return res.status(404).json({ error: 'デスクが見つかりません' });
        }
        res.json(desk);
    } catch (err) {
        console.error('Error fetching desk:', err);
        res.status(500).json({ error: 'デスク情報の取得に失敗しました' });
    }
});

/**
 * PATCH /api/desks/:id/status
 * Update desk status
 */
router.patch('/:id/status', (req, res) => {
    const { statusId } = req.body;

    if (!isNonEmptyString(statusId)) {
        return res.status(400).json({ error: 'ステータスIDが必要です' });
    }

    try {
        if (!db.statuses.getAll().some(s => s.id === statusId)) {
            return res.status(400).json({ error: 'ステータスが存在しません' });
        }
        const result = db.desks.updateStatus(req.params.id, statusId);
        if (result === null) {
            return res.status(404).json({ error: 'デスクが見つかりません' });
        }
        if (!result) {
            return res.status(500).json({ error: 'ステータスの更新に失敗しました' });
        }

        broadcastDesks(req);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating desk status:', err);
        res.status(500).json({ error: 'ステータスの更新に失敗しました' });
    }
});

/**
 * PATCH /api/desks/:id/memo
 * Update desk memo
 */
router.patch('/:id/memo', (req, res) => {
    const { memo } = req.body;

    if (memo !== undefined && memo !== null && !isValidMemo(memo)) {
        return res.status(400).json({ error: 'メモの形式が正しくありません' });
    }

    try {
        if (!db.desks.getById(req.params.id)) {
            return res.status(404).json({ error: 'デスクが見つかりません' });
        }
        db.desks.updateMemo(req.params.id, memo || '');

        if (memo) {
            db.memoHistory.add(req.params.id, memo);
        }

        broadcastDesks(req);
        req.app.get('io').to('desks').emit('memo:updated', { deskId: req.params.id, memo });

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating memo:', err);
        res.status(500).json({ error: 'メモの更新に失敗しました' });
    }
});

/**
 * GET /api/desks/:id/memo-history
 * Get memo history for a desk
 */
router.get('/:id/memo-history', (req, res) => {
    try {
        const history = db.memoHistory.getByDesk(req.params.id);
        res.json(history.map(h => ({
            id: h.id,
            content: h.content,
            createdBy: h.created_by,
            // created_at is SQLite CURRENT_TIMESTAMP (UTC without a zone suffix)
            timestamp: new Date(`${String(h.created_at).replace(' ', 'T')}Z`).getTime()
        })));
    } catch (err) {
        console.error('Error fetching memo history:', err);
        res.status(500).json({ error: 'メモ履歴の取得に失敗しました' });
    }
});

/**
 * PATCH /api/desks/:id/operator
 * Update desk operator name
 */
router.patch('/:id/operator', (req, res) => {
    const { operatorName } = req.body;

    if (!isNonEmptyString(operatorName, 50)) {
        return res.status(400).json({ error: 'オペレーター名が必要です' });
    }

    try {
        if (!db.desks.getById(req.params.id)) {
            return res.status(404).json({ error: 'デスクが見つかりません' });
        }
        db.desks.updateOperator(req.params.id, operatorName.trim());

        broadcastDesks(req);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating operator:', err);
        res.status(500).json({ error: 'オペレーター名の更新に失敗しました' });
    }
});

module.exports = router;
