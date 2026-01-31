/**
 * Support Desk App - Desks Routes
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * GET /api/desks
 * Get all desks with status info
 */
router.get('/', (req, res) => {
    try {
        const desks = db.desks.getAll();

        // Transform to match frontend format
        const formattedDesks = desks.map(desk => ({
            id: desk.id,
            number: desk.number,
            operatorName: desk.operator_name,
            status: desk.status_id,
            statusName: desk.status_name,
            statusColor: desk.status_color,
            statusStartTime: new Date(desk.status_start_time).getTime(),
            callCount: desk.call_count,
            memo: desk.memo || ''
        }));

        res.json(formattedDesks);
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

    if (!statusId) {
        return res.status(400).json({ error: 'ステータスIDが必要です' });
    }

    try {
        db.desks.updateStatus(req.params.id, statusId);

        const desks = db.desks.getAll();
        const io = req.app.get('io');
        io.to('desks').emit('desks:updated', desks.map(d => ({
            id: d.id,
            number: d.number,
            operatorName: d.operator_name,
            status: d.status_id,
            statusStartTime: new Date(d.status_start_time).getTime(),
            callCount: d.call_count,
            memo: d.memo || ''
        })));

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

    try {
        db.desks.updateMemo(req.params.id, memo || '');

        if (memo) {
            db.memoHistory.add(req.params.id, memo);
        }

        const desks = db.desks.getAll();
        const io = req.app.get('io');
        io.to('desks').emit('desks:updated', desks.map(d => ({
            id: d.id,
            number: d.number,
            operatorName: d.operator_name,
            status: d.status_id,
            statusStartTime: new Date(d.status_start_time).getTime(),
            callCount: d.call_count,
            memo: d.memo || ''
        })));
        io.to('desks').emit('memo:updated', { deskId: req.params.id, memo });

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
            timestamp: new Date(h.created_at).getTime()
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

    if (!operatorName) {
        return res.status(400).json({ error: 'オペレーター名が必要です' });
    }

    try {
        db.desks.updateOperator(req.params.id, operatorName);

        const desks = db.desks.getAll();
        const io = req.app.get('io');
        io.to('desks').emit('desks:updated', desks.map(d => ({
            id: d.id,
            number: d.number,
            operatorName: d.operator_name,
            status: d.status_id,
            statusStartTime: new Date(d.status_start_time).getTime(),
            callCount: d.call_count,
            memo: d.memo || ''
        })));

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating operator:', err);
        res.status(500).json({ error: 'オペレーター名の更新に失敗しました' });
    }
});

module.exports = router;
