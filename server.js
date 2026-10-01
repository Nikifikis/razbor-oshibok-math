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
  return row;
};
const createSession = (res, role, refId = null) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = Date.now() + SESSION_DAYS * 86400000;
  db.prepare('INSERT INTO sessions(token_hash, role, ref_id, expires_at) VALUES(?,?,?,?)').run(tokenHash, role, refId, expires);
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
};
const requireRole = (req, res, role) => {
  const session = sessionFor(req);
  if (!session || session.role !== role) { json(res, 401, { error: 'Требуется вход' }); return null; }
  return session;
};

const loginAttempts = new Map();
const rateLimited = req => {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (loginAttempts.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  recent.push(now); loginAttempts.set(ip, recent);
  return recent.length > 12;
};

function teacherOverview() {
  const classes = db.prepare('SELECT id, name, code, created_at FROM classes ORDER BY created_at DESC').all();
  const studentQuery = db.prepare(`SELECT s.id, s.display_name, s.active,
    COUNT(DISTINCT p.assignment_id) works,
    SUM(CASE WHEN p.status='completed' THEN 1 ELSE 0 END) completed,
    COALESCE(SUM(p.attempts_count),0) attempts,
    COALESCE(SUM(p.hints_used),0) hints,
    MAX(p.weak_skill) weak_skill,
    MAX(p.updated_at) last_activity
    FROM students s LEFT JOIN progress p ON p.student_id=s.id
    WHERE s.class_id=? GROUP BY s.id ORDER BY s.display_name COLLATE NOCASE`);
  const assignmentQuery = db.prepare(`SELECT a.*,
    COUNT(p.id) started,
    SUM(CASE WHEN p.status='completed' THEN 1 ELSE 0 END) completed
    FROM assignments a LEFT JOIN progress p ON p.assignment_id=a.id AND p.status!='not_started'
    WHERE a.class_id=? GROUP BY a.id ORDER BY a.created_at DESC`);
  return classes.map(c => ({ ...c, students: studentQuery.all(c.id), assignments: assignmentQuery.all(c.id) }));
}

async function handleApi(req, res, url) {
  const method = req.method;
  if (method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true });

  if (method === 'POST' && url.pathname === '/api/teacher/login') {
    if (rateLimited(req)) return json(res, 429, { error: 'Слишком много попыток. Попробуйте позже.' });
    const body = await readJson(req);
    if (!ADMIN_PASSWORD_HASH || body.username !== ADMIN_USERNAME || !verifySecret(body.password, ADMIN_PASSWORD_HASH)) return json(res, 401, { error: 'Неверный логин или пароль' });
    return json(res, 200, { ok: true }, { 'set-cookie': createSession(res, 'teacher') });
  }
  if (method === 'POST' && url.pathname === '/api/logout') {
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(token).digest('hex'));
    return json(res, 200, { ok: true }, { 'set-cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }
  if (method === 'GET' && url.pathname === '/api/teacher/overview') {
    if (!requireRole(req, res, 'teacher')) return;
    return json(res, 200, { classes: teacherOverview() });
  }
  if (method === 'POST' && url.pathname === '/api/classes') {
    if (!requireRole(req, res, 'teacher')) return;
    const body = await readJson(req), name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 50) return json(res, 400, { error: 'Введите название класса' });
    let code; do { code = randomCode(6); } while (db.prepare('SELECT 1 FROM classes WHERE code=?').get(code));
    const result = db.prepare('INSERT INTO classes(name,code) VALUES(?,?)').run(name, code);
    return json(res, 201, { id: Number(result.lastInsertRowid), name, code });
  }
  if (method === 'POST' && url.pathname === '/api/students') {
    if (!requireRole(req, res, 'teacher')) return;
    const body = await readJson(req), classId = Number(body.classId), name = String(body.name || '').trim();
    const parent = db.prepare('SELECT id FROM classes WHERE id=?').get(classId);
    if (!parent || name.length < 2 || name.length > 80) return json(res, 400, { error: 'Проверьте класс и имя ученика' });
    const pin = /^\d{4,8}$/.test(String(body.pin || '')) ? String(body.pin) : String(crypto.randomInt(1000, 10000));
    try {
      const result = db.prepare('INSERT INTO students(class_id,display_name,name_key,pin_hash) VALUES(?,?,?,?)').run(classId, name, normalizeName(name), hashSecret(pin));
      return json(res, 201, { id: Number(result.lastInsertRowid), name, pin });
    } catch { return json(res, 409, { error: 'Ученик с таким именем уже есть в классе' }); }
  }
  if (method === 'POST' && url.pathname === '/api/assignments') {
    if (!requireRole(req, res, 'teacher')) return;
    const body = await readJson(req), classId = Number(body.classId), level = Number(body.level), taskCount = Math.max(1, Math.min(20, Number(body.taskCount) || 4));
    const title = String(body.title || '').trim(), topic = String(body.topic || 'numeric');
    if (!db.prepare('SELECT 1 FROM classes WHERE id=?').get(classId) || title.length < 3 || !['numeric','model','linear'].includes(topic) || ![2,3].includes(level)) return json(res, 400, { error: 'Проверьте параметры работы' });
    const result = db.prepare('INSERT INTO assignments(class_id,title,topic,level,task_count,due_date) VALUES(?,?,?,?,?,?)').run(classId,title,topic,level,taskCount,body.dueDate || null);
    return json(res, 201, { id: Number(result.lastInsertRowid) });
  }
  if (method === 'POST' && url.pathname === '/api/student/login') {
    if (rateLimited(req)) return json(res, 429, { error: 'Слишком много попыток. Попробуйте позже.' });
    const body = await readJson(req), code = String(body.classCode || '').trim().toUpperCase(), nameKey = normalizeName(body.name);
    const student = db.prepare(`SELECT s.id, s.pin_hash FROM students s JOIN classes c ON c.id=s.class_id WHERE c.code=? AND s.name_key=? AND s.active=1`).get(code, nameKey);
    if (!student || !verifySecret(body.pin, student.pin_hash)) return json(res, 401, { error: 'Не удалось найти ученика или PIN неверный' });
    return json(res, 200, { ok: true }, { 'set-cookie': createSession(res, 'student', student.id) });
  }
  if (method === 'GET' && url.pathname === '/api/student/me') {
    const session = requireRole(req, res, 'student'); if (!session) return;
    const student = db.prepare(`SELECT s.id,s.display_name,c.name class_name,c.code class_code,c.id class_id FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=?`).get(session.ref_id);
    const assignments = db.prepare(`SELECT a.id,a.title,a.topic,a.level,a.task_count,a.due_date,
      COALESCE(p.status,'not_started') status,COALESCE(p.correct_count,0) correct_count,COALESCE(p.hints_used,0) hints_used
      FROM assignments a LEFT JOIN progress p ON p.assignment_id=a.id AND p.student_id=?
      WHERE a.class_id=? ORDER BY a.created_at DESC`).all(session.ref_id, student.class_id);
    return json(res, 200, { student, assignments });
  }
  if (method === 'POST' && url.pathname === '/api/student/progress') {
    const session = requireRole(req, res, 'student'); if (!session) return;
    const body = await readJson(req), assignmentId = Number(body.assignmentId), taskIndex = Math.max(0, Number(body.taskIndex) || 0);
    const assignment = db.prepare(`SELECT a.* FROM assignments a JOIN students s ON s.class_id=a.class_id WHERE a.id=? AND s.id=?`).get(assignmentId, session.ref_id);
    if (!assignment) return json(res, 403, { error: 'Работа недоступна' });
    db.prepare(`INSERT INTO progress(assignment_id,student_id,status,started_at) VALUES(?,?,'in_progress',CURRENT_TIMESTAMP)
      ON CONFLICT(assignment_id,student_id) DO NOTHING`).run(assignmentId, session.ref_id);
    const event = ['start','answer','hint'].includes(body.event) ? body.event : 'start';
    const correct = event === 'answer' ? (body.correct ? 1 : 0) : null;
    const hintStage = Math.max(0, Math.min(3, Number(body.hintStage) || 0));
    db.prepare('INSERT INTO attempts(assignment_id,student_id,task_index,event_type,correct,hint_stage,skill) VALUES(?,?,?,?,?,?,?)').run(assignmentId,session.ref_id,taskIndex,event,correct,hintStage,String(body.skill || '').slice(0,120) || null);
    if (event === 'hint') db.prepare(`UPDATE progress SET hints_used=hints_used+1,status=CASE WHEN ?=3 THEN 'needs_help' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE assignment_id=? AND student_id=?`).run(hintStage,assignmentId,session.ref_id);
    if (event === 'answer') {
      const current = db.prepare('SELECT * FROM progress WHERE assignment_id=? AND student_id=?').get(assignmentId,session.ref_id);
      const correctCount = Math.min(assignment.task_count, current.correct_count + (correct ? 1 : 0));
      const wrongCount = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE assignment_id=? AND student_id=? AND correct=0`).get(assignmentId,session.ref_id).n;
      const completed = correctCount >= assignment.task_count;
      const status = completed ? 'completed' : (!correct && (wrongCount >= 2 || hintStage >= 3) ? 'needs_help' : 'in_progress');
      db.prepare(`UPDATE progress SET correct_count=?,attempts_count=attempts_count+1,status=?,weak_skill=CASE WHEN ?=0 THEN ? ELSE weak_skill END,completed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE assignment_id=? AND student_id=?`).run(correctCount,status,correct,String(body.skill || '').slice(0,120) || null,completed ? 1 : 0,assignmentId,session.ref_id);
    }
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Не найдено' });
}

const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
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
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, 500, { error: 'Сервис временно недоступен' });
  }
});

setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600000).unref();
server.listen(PORT, '0.0.0.0', () => console.log(`Razbor server listening on ${PORT}`));
