/**
 * Support Desk App - Main Server
 * Express + Socket.io server
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

// Import database
const db = require('./db');

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'support-desk-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Make io accessible to routes
app.set('io', io);
app.set('jwt_secret', JWT_SECRET);

// Socket.io authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.userId;
            socket.username = decoded.username;
            socket.role = decoded.role;
        } catch (err) {
            // Allow connection but mark as unauthenticated
            socket.userId = null;
        }
    }
    next();
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id} (user: ${socket.username || 'anonymous'})`);

    // Join a room for authenticated users
    if (socket.userId) {
        socket.join('authenticated');
    }

    // Join the main room
    socket.join('desks');

    // Handle desk status change
    socket.on('desk:changeStatus', (data) => {
        const { deskId, statusId } = data;

        // Update database
        db.desks.updateStatus(deskId, statusId);

        // Get updated desk data
        const desks = db.desks.getAll();

        // Broadcast to all clients
        io.to('desks').emit('desks:updated', desks);
    });

    // Handle memo update
    socket.on('desk:updateMemo', (data) => {
        const { deskId, memo } = data;

        // Update database
        db.desks.updateMemo(deskId, memo);

        // Save to history
        if (memo) {
            db.memoHistory.add(deskId, memo, socket.username);
        }

        // Get updated desk data
        const desks = db.desks.getAll();

        // Broadcast to all clients
        io.to('desks').emit('desks:updated', desks);
        io.to('desks').emit('memo:updated', { deskId, memo, updatedBy: socket.username });
    });

    // Handle operator update
    socket.on('desk:updateOperator', (data) => {
        const { deskId, operatorName } = data;

        db.desks.updateOperator(deskId, operatorName);

        const desks = db.desks.getAll();
        io.to('desks').emit('desks:updated', desks);
    });

    // Handle settings update
    socket.on('settings:update', (data) => {
        const { key, value } = data;

        db.settings.set(key, value);

        io.to('desks').emit('settings:updated', { key, value });
    });

    // Handle status configuration update
    socket.on('statuses:update', (data) => {
        const { statuses } = data;

        // Update each status
        for (const status of statuses) {
            if (status.id.startsWith('custom-')) {
                // Check if exists
                const existing = db.statuses.getAll().find(s => s.id === status.id);
                if (!existing) {
                    db.statuses.create(status.id, status.name, status.color);
                } else {
                    db.statuses.update(status.id, status.name, status.color);
                }
            } else {
                db.statuses.update(status.id, status.name, status.color);
            }
        }

        const allStatuses = db.statuses.getAll();
        io.to('desks').emit('statuses:updated', allStatuses);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// Start server after database is ready
async function startServer() {
    // Initialize database
    await db.initDatabase();

    // Import routes (after db is ready)
    const authRoutes = require('./routes/auth');
    const desksRoutes = require('./routes/desks');
    const statsRoutes = require('./routes/stats');
    const settingsRoutes = require('./routes/settings');

    // API Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/desks', desksRoutes);
    app.use('/api/stats', statsRoutes);
    app.use('/api/settings', settingsRoutes);

    // Health check endpoint
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Serve index.html for all other routes (SPA support)
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    // Start server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════╗
║  Support Desk Monitor Server                       ║
║────────────────────────────────────────────────────║
║  Local:    http://localhost:${PORT}                   ║
║────────────────────────────────────────────────────║
║  Default Credentials:                              ║
║    Admin: admin / admin123                         ║
║    User:  user  / user123                          ║
╚════════════════════════════════════════════════════╝
    `);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

module.exports = { app, server, io };

