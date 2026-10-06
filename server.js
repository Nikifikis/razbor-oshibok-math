const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'teacher';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const COOKIE_NAME = 'razbor_session';
const SESSION_DAYS = 14;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'razbor.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, name_key)
  );
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    level INTEGER NOT NULL CHECK(level IN (2,3)),
    task_count INTEGER NOT NULL DEFAULT 4,
    due_date TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'not_started',
    correct_count INTEGER NOT NULL DEFAULT 0,
    attempts_count INTEGER NOT NULL DEFAULT 0,
    hints_used INTEGER NOT NULL DEFAULT 0,
    weak_skill TEXT,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assignment_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    task_index INTEGER NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL,
    correct INTEGER,
    hint_stage INTEGER NOT NULL DEFAULT 0,
    skill TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    ref_id INTEGER,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
  CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
  CREATE INDEX IF NOT EXISTS idx_progress_student ON progress(student_id);
  CREATE INDEX IF NOT EXISTS idx_progress_assignment ON progress(assignment_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_student_assignment ON attempts(student_id, assignment_id);
`);

const json = (res, status, data, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
};

const readJson = req => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 65536) reject(new Error('Слишком большой запрос'));
  });
  req.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Некорректный JSON')); }
  });
  req.on('error', reject);
});

const normalizeName = value => String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
const randomCode = (length = 6) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(length), b => alphabet[b % alphabet.length]).join('');
};
const hashSecret = value => {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(value), salt, 32).toString('hex');
  return `${salt}:${digest}`;
};
const verifySecret = (value, stored) => {
  try {
    const [salt, expected] = String(stored).split(':');
    const actual = crypto.scryptSync(String(value), salt, 32);
    return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
  } catch { return false; }
};

const parseCookies = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
  const i = x.indexOf('='); return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
}));
const sessionFor = req => {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = db.prepare('SELECT role, ref_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash);
  if (!row || row.expires_at < Date.now()) return null;
  if (row.role === 'teacher' && db.prepare('SELECT COUNT(*) n FROM teachers').get().n && !db.prepare('SELECT id FROM teachers WHERE id=? AND active=1').get(row.ref_id)) return null;
  return row;
};
const createSession = (res, role, refId = null) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const duration = role === 'student' ? 2 * 3600000 : SESSION_DAYS * 86400000;
  const expires = Date.now() + duration;
  db.prepare('INSERT INTO sessions(token_hash, role, ref_id, expires_at) VALUES(?,?,?,?)').run(tokenHash, role, refId, expires);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(duration / 1000)}`;
};
const requireRole = (req, res, role) => {
  const session = sessionFor(req);
  if (!session || session.role !== role) { json(res, 401, { error: 'Требуется вход' }); return null; }
  return session;
};

const loginAttempts = new Map();
const rateLimited = (req, scope = 'teacher', limit = 12) => {
  const ip = (req.socket.remoteAddress || 'unknown') + ':' + scope;
  const now = Date.now();
  const recent = (loginAttempts.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  recent.push(now); loginAttempts.set(ip, recent);
  return recent.length > limit;
};

const personalAccess = require('./personal-access')({ db, json, readJson, requireRole, sessionFor, createSession, hashSecret, normalizeName, randomCode, rateLimited });

async function handleApi(req, res, url) {
  if (await personalAccess(req, res, url)) return;
  if (req.method === 'POST' && url.pathname === '/api/teacher/login') {
    if (rateLimited(req)) return json(res, 429, { error: 'Слишком много попыток. Попробуйте позже.' });
    const body = await readJson(req);
    const configured = db.prepare('SELECT COUNT(*) n FROM teachers').get().n;
    const teacher = configured ? db.prepare('SELECT id,password_hash FROM teachers WHERE username=? AND active=1').get(String(body.username || '')) : null;
    const valid = configured ? teacher && verifySecret(body.password, teacher.password_hash) : ADMIN_PASSWORD_HASH && body.username === ADMIN_USERNAME && verifySecret(body.password, ADMIN_PASSWORD_HASH);
    if (!valid) return json(res, 401, { error: 'Неверный логин или пароль' });
    return json(res, 200, { ok: true }, { 'set-cookie': createSession(res, 'teacher', teacher?.id ?? null) });
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(token).digest('hex'));
    return json(res, 200, { ok: true }, { 'set-cookie': COOKIE_NAME + '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }
  if (req.method === 'POST' && url.pathname === '/api/classes') {
    if (!requireRole(req, res, 'teacher')) return;
    const body = await readJson(req), name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 50) return json(res, 400, { error: 'Введите название класса' });
    let code; do { code = randomCode(6); } while (db.prepare('SELECT 1 FROM classes WHERE code=?').get(code));
    const result = db.prepare('INSERT INTO classes(name,code) VALUES(?,?)').run(name, code);
    return json(res, 201, { id: Number(result.lastInsertRowid), name });
  }
  return json(res, 404, { error: 'Не найдено' });
}

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '/index.html') pathname = '/student.html';
  const publicFiles = new Set(['/student.html','/student.js','/student.css','/teacher.html','/teacher-personal.js']);
  if (!publicFiles.has(pathname)) return json(res, 404, { error: 'Страница недоступна' });
  const filePath = path.resolve(PUBLIC_DIR, '.' + pathname);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return json(res, 403, { error: 'Запрещено' });
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return json(res, 404, { error: 'Страница не найдена' });
    res.writeHead(200, { 'content-type': mime[path.extname(filePath)] || 'application/octet-stream', 'x-content-type-options':'nosniff', 'x-frame-options':'DENY', 'referrer-policy':'same-origin' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (process.env.NODE_ENV === 'production' && url.pathname.startsWith('/api/') && url.pathname !== '/api/health' && req.headers['x-forwarded-proto'] !== 'https') return json(res, 426, { error: 'Для входа и работы требуется HTTPS' });
    if (req.method === 'POST' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Недопустимый источник запроса' });
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'Сервис временно недоступен' });
  }
});

setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600000).unref();
if (require.main === module) server.listen(PORT, '0.0.0.0', () => console.log(`Razbor server listening on ${PORT}`));
module.exports = { server, db, hashSecret };
