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

  // Load the existing database. If it cannot be read, stop instead of starting
  // with an empty one: saving would overwrite the file and lose all data.
  if (fs.existsSync(dbPath)) {
    try {
      db = new SQL.Database(fs.readFileSync(dbPath));
      // sql.js opens any bytes without checking them, so verify the file before using it
      const check = db.exec('PRAGMA quick_check');
      const result = check[0]?.values[0]?.[0];
      if (result !== 'ok') throw new Error(`integrity check failed: ${result}`);
    } catch (err) {
      throw new Error(
        `データベースファイルを読み込めませんでした: ${dbPath}\n` +
        `  (${err.message})\n` +
        '  バックアップからこのファイルを復元してから、もう一度起動してください。\n' +
        '  データを破棄して最初から始める場合は、このファイルを別の場所へ移動してから起動してください。'
      );
    }
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  initializeTables();
  seedInitialData();
  saveDatabase();

  return db;
}

/**
 * Save database to file.
 * Writes a temporary file and renames it over the database, so a crash or power loss
 * during the write leaves the previous file intact instead of a truncated one.
 */
function saveDatabase() {
  if (db) {
    const buffer = Buffer.from(db.export());
    const tmpPath = `${dbPath}.tmp`;
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeFileSync(fd, buffer);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, dbPath);
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
  // Stats and today's call counts filter by end_time (also created for existing databases)
  db.run('CREATE INDEX IF NOT EXISTS idx_stats_history_end_time ON stats_history(end_time)');
  db.run('CREATE INDEX IF NOT EXISTS idx_stats_history_status_end ON stats_history(status_id, end_time)');

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
      scheduled_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add scheduled_date to schedules tables created before it existed
  const scheduleColumns = queryAll('PRAGMA table_info(schedules)').map(c => c.name);
  if (!scheduleColumns.includes('scheduled_date')) {
    db.run('ALTER TABLE schedules ADD COLUMN scheduled_date TEXT');
    // Backfill from created_at (UTC 'YYYY-MM-DD HH:MM:SS') converted to the server's local date,
    // so schedules registered today survive the first deleteOld()
    const rows = queryAll('SELECT id, created_at FROM schedules');
    for (const row of rows) {
      const created = new Date(`${String(row.created_at).replace(' ', 'T')}Z`);
      if (!isNaN(created)) {
        db.run('UPDATE schedules SET scheduled_date = ? WHERE id = ?', [getLocalDateString(created), row.id]);
      }
    }
    console.log(`Migrated schedules: added scheduled_date (${rows.length} rows backfilled)`);
  }

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
      // Desks left on a deleted status would have no valid status, so move them back to 'available'.
      // Done in one transaction so a failure cannot leave the change half-applied.
      try {
        db.run('BEGIN');
        const desksInStatus = queryAll('SELECT * FROM desks WHERE status_id = ?', [id]);
        const now = new Date();
        for (const desk of desksInStatus) {
          applyStatusChange(desk, 'available', now);
        }
        db.run('DELETE FROM statuses WHERE id = ?', [id]);
        db.run('COMMIT');
      } catch (err) {
        console.error('Status delete error:', err.message);
        try { db.run('ROLLBACK'); } catch { /* no open transaction */ }
        return false;
      }
      saveDatabase();
      return true;
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
    /**
     * Desks in the shape the frontend uses. callCount is today's count:
     * calls that overlap today (completed ones in history + an ongoing call).
     */
    getAllForClient: () => {
      const todayStartIso = startOfLocalDay(new Date()).toISOString();
      const counts = {};
      for (const row of queryAll(`
        SELECT desk_id, COUNT(*) as count FROM stats_history
        WHERE status_id = 'calling' AND end_time > ?
        GROUP BY desk_id
      `, [todayStartIso])) {
        counts[row.desk_id] = row.count;
      }

      return dbOperations.desks.getAll().map(d => {
        const statusStartTime = new Date(d.status_start_time).getTime();
        const ongoingCall = d.status_id === 'calling' ? 1 : 0;
        return {
          id: d.id,
          number: d.number,
          operatorName: d.operator_name,
          status: d.status_id,
          statusName: d.status_name,
          statusColor: d.status_color,
          statusStartTime,
          callCount: (counts[d.id] || 0) + ongoingCall,
          memo: d.memo || ''
        };
      });
    },
    getById: (id) => {
      return queryOne('SELECT * FROM desks WHERE id = ?', [id]);
    },
    updateStatus: (id, statusId) => {
      const desk = queryOne('SELECT * FROM desks WHERE id = ?', [id]);
      if (!desk) return null;

      try {
        applyStatusChange(desk, statusId, new Date());
      } catch (err) {
        console.error('Status update error:', err.message);
        return false;
      }
      saveDatabase();
      return true;
    },
    updateMemo: (id, memo) => {
      const now = new Date().toISOString();
      return runQuery('UPDATE desks SET memo = ?, updated_at = ? WHERE id = ?', [memo, now, id]);
    },
    updateOperator: (id, operatorName) => {
      const desk = queryOne('SELECT * FROM desks WHERE id = ?', [id]);
      if (!desk) return null;
      if (desk.operator_name === operatorName) return true;

      // Close the current status interval under the previous operator's name,
      // then continue the same status under the new name from now
      const now = new Date();
      const nowIso = now.toISOString();
      try {
        db.run('BEGIN');
        recordHistory(desk, now);
        db.run('UPDATE desks SET operator_name = ?, status_start_time = ?, updated_at = ? WHERE id = ?',
          [operatorName, nowIso, nowIso, id]);
        db.run('COMMIT');
      } catch (err) {
        console.error('Operator update error:', err.message);
        try { db.run('ROLLBACK'); } catch { /* no open transaction */ }
        return false;
      }
      saveDatabase();
      return true;
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
    /**
     * Per-operator summary for [periodStart, now].
     * Every interval (completed ones in stats_history and each desk's current status)
     * contributes only the part that overlaps the period, based on its UTC start/end
     * times (the `date` column is not used, so older rows stored with UTC dates are fine).
     * A call is counted in a period if it overlaps it.
     * Returns [{ operatorName, callCount, durations: { statusId: ms } }]
     */
    getSummary: (periodStart, now = new Date()) => {
      const summary = new Map();
      const entry = (name) => {
        if (!summary.has(name)) summary.set(name, { operatorName: name, callCount: 0, durations: {} });
        return summary.get(name);
      };
      const periodStartMs = periodStart.getTime();
      const add = (name, statusId, startMs, endMs) => {
        const overlap = Math.min(endMs, now.getTime()) - Math.max(startMs, periodStartMs);
        if (!(overlap > 0)) return;
        const e = entry(name);
        e.durations[statusId] = (e.durations[statusId] || 0) + overlap;
        if (statusId === 'calling') e.callCount += 1;
      };

      // Current operators first (in desk order), even with no activity yet
      const desks = dbOperations.desks.getAll();
      for (const desk of desks) entry(desk.operator_name);

      const rows = queryAll(`
        SELECT operator_name, status_id, start_time, end_time
        FROM stats_history
        WHERE end_time > ?
      `, [periodStart.toISOString()]);
      for (const row of rows) {
        add(row.operator_name, row.status_id,
          new Date(row.start_time).getTime(), new Date(row.end_time).getTime());
      }

      // Ongoing statuses
      for (const desk of desks) {
        add(desk.operator_name, desk.status_id, new Date(desk.status_start_time).getTime(), now.getTime());
      }

      return [...summary.values()];
    },

    /**
     * Status ids that appear in history since periodStart (includes deleted statuses)
     */
    getStatusIdsSince: (periodStart) => {
      return queryAll('SELECT DISTINCT status_id FROM stats_history WHERE end_time > ?',
        [periodStart.toISOString()]).map(r => r.status_id);
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
    // scheduled_time is 'HH:MM' only, so the day is kept in scheduled_date
    // (server local date, not UTC)
    getToday: () => {
      return queryAll(`
        SELECT s.*, d.number as desk_number, d.operator_name
        FROM schedules s
        LEFT JOIN desks d ON s.desk_id = d.id
        WHERE s.scheduled_date = ?
        ORDER BY s.scheduled_time ASC
      `, [getLocalDateString()]);
    },
    getByDesk: (deskId) => {
      return queryAll(`
        SELECT * FROM schedules
        WHERE desk_id = ? AND scheduled_date = ?
        ORDER BY scheduled_time ASC
      `, [deskId, getLocalDateString()]);
    },
    add: (deskId, title, memo, scheduledTime) => {
      try {
        db.run(
          'INSERT INTO schedules (desk_id, title, memo, scheduled_time, scheduled_date) VALUES (?, ?, ?, ?, ?)',
          [deskId, title, memo || '', scheduledTime, getLocalDateString()]
        );
        // Read the new id before saveDatabase(): db.export() reopens the
        // connection and resets last_insert_rowid() to 0
        const lastId = queryOne('SELECT last_insert_rowid() as id');
        saveDatabase();
        if (!lastId) return null;
        return queryOne(`
          SELECT s.*, d.number as desk_number, d.operator_name
          FROM schedules s
          LEFT JOIN desks d ON s.desk_id = d.id
          WHERE s.id = ?
        `, [lastId.id]);
      } catch (err) {
        console.error('Schedule add error:', err.message);
        return null;
      }
    },
    delete: (id) => {
      return runQuery('DELETE FROM schedules WHERE id = ?', [id]);
    },
    deleteOld: () => {
      // Delete schedules older than today (rows without a date predate scheduled_date)
      return runQuery('DELETE FROM schedules WHERE scheduled_date IS NULL OR scheduled_date < ?',
        [getLocalDateString()]);
    }
  }
};

/**
 * Record the desk's current status in history and switch it to statusId.
 * Does not save; callers save (or commit) once.
 */
function applyStatusChange(desk, statusId, now) {
  const nowIso = now.toISOString();

  if (desk.status_id !== statusId) {
    recordHistory(desk, now);
  }

  db.run('UPDATE desks SET status_id = ?, status_start_time = ?, updated_at = ? WHERE id = ?',
    [statusId, nowIso, nowIso, desk.id]);
}

/**
 * Write the desk's current status interval (status_start_time .. now) to stats_history.
 * Does not save.
 */
function recordHistory(desk, now) {
  const duration = now.getTime() - new Date(desk.status_start_time).getTime();
  db.run(`INSERT INTO stats_history (desk_id, operator_name, status_id, start_time, end_time, duration, date)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [desk.id, desk.operator_name, desk.status_id, desk.status_start_time, now.toISOString(), duration,
      getLocalDateString(now)]);
}

/**
 * Local midnight of the given date
 */
function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Get today's date as YYYY-MM-DD in the server's local timezone
 */
function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Built-in statuses that cannot be deleted
const DEFAULT_STATUS_IDS = ['available', 'calling', 'afterwork', 'break', 'away'];

module.exports = {
  initDatabase, saveDatabase, DEFAULT_STATUS_IDS, getLocalDateString, startOfLocalDay, ...dbOperations
};
