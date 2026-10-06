// One-time provisioning. Never store plaintext passwords in the repository or DB.
const crypto = require('node:crypto');
const { db, hashSecret } = require('../server');
if (db.prepare('SELECT COUNT(*) n FROM teachers').get().n) throw new Error('Teacher accounts already exist; refusing to overwrite');
const accounts = Array.from({ length: 5 }, (_, i) => ({ username: `teacher${i + 1}`, password: crypto.randomBytes(15).toString('base64url') }));
db.exec('BEGIN IMMEDIATE');
try {
  for (const a of accounts) db.prepare('INSERT INTO teachers(username,password_hash) VALUES(?,?)').run(a.username, hashSecret(a.password));
  db.prepare("DELETE FROM sessions WHERE role='teacher'").run();
  db.exec('COMMIT');
} catch (e) { db.exec('ROLLBACK'); throw e; }
console.log(JSON.stringify(accounts));
db.close();
