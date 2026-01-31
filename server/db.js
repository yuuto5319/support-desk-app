/**
 * Support Desk App - Database Module
 * SQLite database setup and operations using sql.js (WebAssembly-based)
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Database file path
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'support-desk.db');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

/**
 * Initialize database
 */
async function initDatabase() {
  const SQL = await initSqlJs();

  // Try to load existing database
  try {
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
      console.log('Loaded existing database');
    } else {
      db = new SQL.Database();
      console.log('Created new database');
    }
  } catch (err) {
    console.error('Error loading database, creating new one:', err.message);
    db = new SQL.Database();
  }

  initializeTables();
  seedInitialData();
  saveDatabase();

  return db;
}

/**
 * Save database to file
 */
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

/**
 * Initialize database tables
 */
function initializeTables() {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Statuses table
  db.run(`
    CREATE TABLE IF NOT EXISTS statuses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Desks table
  db.run(`
    CREATE TABLE IF NOT EXISTS desks (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL,
      operator_name TEXT,
      status_id TEXT DEFAULT 'available',
      status_start_time TEXT DEFAULT CURRENT_TIMESTAMP,
      call_count INTEGER DEFAULT 0,
      memo TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Memo history table
  db.run(`
    CREATE TABLE IF NOT EXISTS memo_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      desk_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Stats history table
  db.run(`
    CREATE TABLE IF NOT EXISTS stats_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      desk_id TEXT NOT NULL,
      operator_name TEXT,
      status_id TEXT,
      start_time TEXT,
      end_time TEXT,
      duration INTEGER,
      date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Schedules table
  db.run(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      desk_id TEXT NOT NULL,
      title TEXT NOT NULL,
      memo TEXT DEFAULT '',
      scheduled_time TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database tables initialized');
}

/**
 * Seed initial data
 */
function seedInitialData() {
  // Check if data already exists
  const result = db.exec('SELECT COUNT(*) as count FROM statuses');
  const statusCount = result.length > 0 ? result[0].values[0][0] : 0;

  if (statusCount > 0) {
    console.log('Database already seeded');
    return;
  }

  // Insert default statuses
  const defaultStatuses = [
    { id: 'available', name: '受付可', color: '#22c55e', sort_order: 1 },
    { id: 'calling', name: '通話中', color: '#ef4444', sort_order: 2 },
    { id: 'afterwork', name: '後処理', color: '#f59e0b', sort_order: 3 },
    { id: 'break', name: '休憩', color: '#3b82f6', sort_order: 4 },
    { id: 'away', name: '離席', color: '#6b7280', sort_order: 5 }
  ];

  for (const status of defaultStatuses) {
    db.run('INSERT INTO statuses (id, name, color, sort_order) VALUES (?, ?, ?, ?)',
      [status.id, status.name, status.color, status.sort_order]);
  }

  // Insert default operators and desks
  const defaultOperators = [
    '山田 太郎', '佐藤 花子', '鈴木 一郎', '田中 美咲',
    '高橋 健太', '伊藤 さくら', '渡辺 龍也', '中村 愛',
    '小林 翔太', '加藤 真由', '吉田 大輝', '山本 結衣'
  ];

  const now = new Date().toISOString();
  for (let i = 0; i < defaultOperators.length; i++) {
    db.run('INSERT INTO desks (id, number, operator_name, status_id, status_start_time) VALUES (?, ?, ?, ?, ?)',
      [`desk-${i + 1}`, i + 1, defaultOperators[i], 'available', now]);
  }

  // Create default admin user
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
    ['admin', adminPassword, '管理者', 'admin']);

  // Create default user
  const userPassword = bcrypt.hashSync('user123', 10);
  db.run('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
    ['user', userPassword, '一般ユーザー', 'user']);

  console.log('Database seeded with initial data');
}

// Helper function to run query and return all rows
function queryAll(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (err) {
    console.error('Query error:', err.message);
    return [];
  }
}

// Helper function to run query and return first row
function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper function to run update/insert
function runQuery(sql, params = []) {
  try {
    db.run(sql, params);
    saveDatabase();
    return true;
  } catch (err) {
    console.error('Run error:', err.message);
    return false;
  }
}

// Database operations
const dbOperations = {
  // User operations
  users: {
    findByUsername: (username) => {
      return queryOne('SELECT * FROM users WHERE username = ?', [username]);
    },
    findById: (id) => {
      return queryOne('SELECT id, username, display_name, role, created_at FROM users WHERE id = ?', [id]);
    },
    create: (username, password, displayName, role = 'user') => {
      const passwordHash = bcrypt.hashSync(password, 10);
      runQuery('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
        [username, passwordHash, displayName, role]);
    },
    verifyPassword: (user, password) => {
      return bcrypt.compareSync(password, user.password_hash);
    }
  },

  // Status operations
  statuses: {
    getAll: () => {
      return queryAll('SELECT * FROM statuses ORDER BY sort_order');
    },
    update: (id, name, color) => {
      return runQuery('UPDATE statuses SET name = ?, color = ? WHERE id = ?', [name, color, id]);
    },
    create: (id, name, color) => {
      const result = queryOne('SELECT MAX(sort_order) as max FROM statuses');
      const maxOrder = result?.max || 0;
      return runQuery('INSERT INTO statuses (id, name, color, sort_order) VALUES (?, ?, ?, ?)',
        [id, name, color, maxOrder + 1]);
    },
    delete: (id) => {
      return runQuery('DELETE FROM statuses WHERE id = ?', [id]);
    }
  },

  // Desk operations
  desks: {
    getAll: () => {
      return queryAll(`
        SELECT d.*, s.name as status_name, s.color as status_color
        FROM desks d
        LEFT JOIN statuses s ON d.status_id = s.id
        ORDER BY d.number
      `);
    },
    getById: (id) => {
      return queryOne('SELECT * FROM desks WHERE id = ?', [id]);
    },
    updateStatus: (id, statusId) => {
      const desk = queryOne('SELECT * FROM desks WHERE id = ?', [id]);
      if (!desk) return null;

      const now = new Date().toISOString();

      // Record previous status in history
      if (desk.status_id !== statusId) {
        const duration = Date.now() - new Date(desk.status_start_time).getTime();
        const today = new Date().toISOString().split('T')[0];
        runQuery(`INSERT INTO stats_history (desk_id, operator_name, status_id, start_time, end_time, duration, date)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, desk.operator_name, desk.status_id, desk.status_start_time, now, duration, today]);

        // Increment call count if changing to 'calling'
        if (statusId === 'calling') {
          runQuery('UPDATE desks SET call_count = call_count + 1 WHERE id = ?', [id]);
        }
      }

      // Update desk status
      return runQuery('UPDATE desks SET status_id = ?, status_start_time = ?, updated_at = ? WHERE id = ?',
        [statusId, now, now, id]);
    },
    updateMemo: (id, memo) => {
      const now = new Date().toISOString();
      return runQuery('UPDATE desks SET memo = ?, updated_at = ? WHERE id = ?', [memo, now, id]);
    },
    updateOperator: (id, operatorName) => {
      const now = new Date().toISOString();
      return runQuery('UPDATE desks SET operator_name = ?, updated_at = ? WHERE id = ?', [operatorName, now, id]);
    },
    resetCallCount: () => {
      return runQuery('UPDATE desks SET call_count = 0');
    }
  },

  // Memo history operations
  memoHistory: {
    add: (deskId, content, createdBy = null) => {
      return runQuery('INSERT INTO memo_history (desk_id, content, created_by) VALUES (?, ?, ?)',
        [deskId, content, createdBy]);
    },
    getByDesk: (deskId, limit = 50) => {
      return queryAll('SELECT * FROM memo_history WHERE desk_id = ? ORDER BY created_at DESC LIMIT ?',
        [deskId, limit]);
    }
  },

  // Stats operations
  stats: {
    getByPeriod: (startDate, endDate) => {
      return queryAll('SELECT * FROM stats_history WHERE date >= ? AND date <= ? ORDER BY created_at DESC',
        [startDate, endDate]);
    },
    getAggregatedByOperator: (startDate, endDate) => {
      return queryAll(`
        SELECT 
          operator_name,
          status_id,
          SUM(duration) as total_duration,
          COUNT(*) as count
        FROM stats_history 
        WHERE date >= ? AND date <= ?
        GROUP BY operator_name, status_id
      `, [startDate, endDate]);
    }
  },

  // Settings operations
  settings: {
    get: (key) => {
      const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
      if (row) {
        try {
          return JSON.parse(row.value);
        } catch {
          return row.value;
        }
      }
      return null;
    },
    set: (key, value) => {
      const jsonValue = JSON.stringify(value);
      const now = new Date().toISOString();
      // Try update first
      const existing = queryOne('SELECT key FROM settings WHERE key = ?', [key]);
      if (existing) {
        return runQuery('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [jsonValue, now, key]);
      } else {
        return runQuery('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, jsonValue, now]);
      }
    }
  },

  // Schedule operations
  schedules: {
    getToday: () => {
      const today = new Date().toISOString().split('T')[0];
      return queryAll(`
        SELECT s.*, d.number as desk_number, d.operator_name
        FROM schedules s
        LEFT JOIN desks d ON s.desk_id = d.id
        WHERE DATE(s.scheduled_time) = ?
        ORDER BY s.scheduled_time ASC
      `, [today]);
    },
    getByDesk: (deskId) => {
      const today = new Date().toISOString().split('T')[0];
      return queryAll(`
        SELECT * FROM schedules
        WHERE desk_id = ? AND DATE(scheduled_time) = ?
        ORDER BY scheduled_time ASC
      `, [deskId, today]);
    },
    add: (deskId, title, memo, scheduledTime) => {
      const result = runQuery(
        'INSERT INTO schedules (desk_id, title, memo, scheduled_time) VALUES (?, ?, ?, ?)',
        [deskId, title, memo || '', scheduledTime]
      );
      if (result) {
        // Get the inserted schedule with desk info
        const lastId = queryOne('SELECT last_insert_rowid() as id');
        if (lastId) {
          return queryOne(`
            SELECT s.*, d.number as desk_number, d.operator_name
            FROM schedules s
            LEFT JOIN desks d ON s.desk_id = d.id
            WHERE s.id = ?
          `, [lastId.id]);
        }
      }
      return null;
    },
    delete: (id) => {
      return runQuery('DELETE FROM schedules WHERE id = ?', [id]);
    },
    deleteOld: () => {
      // Delete schedules older than today
      const today = new Date().toISOString().split('T')[0];
      return runQuery('DELETE FROM schedules WHERE DATE(scheduled_time) < ?', [today]);
    }
  }
};

module.exports = { initDatabase, saveDatabase, ...dbOperations };
