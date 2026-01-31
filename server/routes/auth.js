/**
 * Support Desk App - Auth Routes
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

/**
 * POST /api/auth/login
 * Login and get JWT token
 */
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください' });
    }

    const user = db.users.findByUsername(username);
    if (!user) {
        return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
    }

    if (!db.users.verifyPassword(user, password)) {
        return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
    }

    const JWT_SECRET = req.app.get('jwt_secret');
    const token = jwt.sign(
        {
            userId: user.id,
            username: user.username,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            role: user.role
        }
    });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '認証が必要です' });
    }

    const token = authHeader.substring(7);
    const JWT_SECRET = req.app.get('jwt_secret');

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.users.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({ error: 'ユーザーが見つかりません' });
        }

        res.json({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            role: user.role
        });
    } catch (err) {
        return res.status(401).json({ error: 'トークンが無効です' });
    }
});

/**
 * POST /api/auth/logout
 * Logout (client should discard token)
 */
router.post('/logout', (req, res) => {
    res.json({ message: 'ログアウトしました' });
});

module.exports = router;
