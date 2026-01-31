/**
 * Support Desk App - Schedules API Routes
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

// Get today's schedules
router.get('/', (req, res) => {
    try {
        // Clean up old schedules first
        db.schedules.deleteOld();

        const schedules = db.schedules.getToday();
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get schedules' });
    }
});

// Get schedules for a specific desk
router.get('/desk/:deskId', (req, res) => {
    try {
        const schedules = db.schedules.getByDesk(req.params.deskId);
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get desk schedules' });
    }
});

// Add a new schedule
router.post('/', (req, res) => {
    try {
        const { deskId, title, memo, scheduledTime } = req.body;

        if (!deskId || !title || !scheduledTime) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const schedule = db.schedules.add(deskId, title, memo, scheduledTime);

        if (schedule) {
            // Broadcast via Socket.io
            const io = req.app.get('io');
            io.to('desks').emit('schedule:added', schedule);

            res.json(schedule);
        } else {
            res.status(500).json({ error: 'Failed to add schedule' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to add schedule' });
    }
});

// Delete a schedule
router.delete('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        db.schedules.delete(id);

        // Broadcast via Socket.io
        const io = req.app.get('io');
        io.to('desks').emit('schedule:deleted', { scheduleId: id });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

module.exports = router;
