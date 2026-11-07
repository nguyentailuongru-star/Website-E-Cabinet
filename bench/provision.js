'use strict';
/*
 * Chuẩn bị dữ liệu cho phép đo đồng bộ trình chiếu.
 * CHẠY TRÊN MÁY CHỦ (cần quyền đọc/ghi DATA_DIR) trong khi máy chủ đang chạy.
 *
 *   node bench/provision.js --base http://127.0.0.1:3000 --delegates 200 [--pdf tai-lieu.pdf] [--pages 10]
 *   node bench/provision.js --cleanup
 *
 * Tạo: 1 chủ trì, 1 thư ký, N đại biểu (tiền tố bench_), phiên đăng nhập 12 giờ
 * ghi thẳng vào bảng sessions (tránh giới hạn tần suất đăng nhập), một cuộc họp
 * đang diễn ra và một tài liệu PDF. Kết quả ghi ra bench/fixture.json — tệp này
 * chứa cookie phiên, KHÔNG được chia sẻ và phải xóa (--cleanup) sau khi đo.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null).filter(Boolean));
const base = String(args.base || process.env.BENCH_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const nDelegates = Math.max(1, Math.min(1000, Number(args.delegates) || 200));
const fixtureFile = path.resolve(String(args.out || 'bench/fixture.json'));
const PREFIX = 'bench_';

const db = require('../server/db');
const auth = require('../server/auth');

function cleanup() {
  const users = db.prepare("SELECT id FROM users WHERE username LIKE 'bench\\_%' ESCAPE '\\'").all().map(u => u.id);
  db.transaction(() => {
    for (const id of users) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    db.prepare("UPDATE users SET active=0 WHERE username LIKE 'bench\\_%' ESCAPE '\\'").run();
    db.prepare("UPDATE meetings SET status='ended',ends_at=CURRENT_TIMESTAMP WHERE title LIKE '[BENCH]%' AND status!='ended'").run();
  })();
  fs.rmSync(fixtureFile, { force: true });
  console.log(`Đã vô hiệu hóa ${users.length} tài khoản bench, kết thúc các cuộc họp [BENCH] và xóa ${path.relative(process.cwd(), fixtureFile)}.`);
}

function ensureUser(username, fullName, role) {
  let u = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (!u) {
    u = { id: crypto.randomUUID() };
    // Mật khẩu ngẫu nhiên không bao giờ dùng tới; phiên được cấp trực tiếp.
    db.prepare('INSERT INTO users(id,username,full_name,unit,title,password_hash,role,must_change_password) VALUES(?,?,?,?,?,?,?,0)')
      .run(u.id, username, fullName, 'Bench', '', '$2b$04$' + crypto.randomBytes(40).toString('base64').slice(0, 53), role);
  } else {
    db.prepare('UPDATE users SET active=1,role=?,must_change_password=0 WHERE id=?').run(role, u.id);
  }
  const sid = crypto.randomBytes(32).toString('hex'), csrf = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions(id,user_id,csrf_token,expires_at) VALUES(?,?,?,?)').run(sid, u.id, csrf, new Date(Date.now() + 12 * 3600 * 1000).toISOString());
  return { id: u.id, username, cookie: `${auth.COOKIE}=${sid}`, csrf };
}

async function call(who, url, method = 'GET', body) {
  const headers = { cookie: who.cookie, 'x-csrf-token': who.csrf };
  if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  const r = await fetch(base + '/api' + url, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} → HTTP ${r.status}: ${data.error || ''}`);
  return data;
}

async function samplePdf(pages) {
  const { pdfFromText } = require('../server/services/minutes-export');
  // Mỗi trang A4 của dịch vụ xuất biên bản chứa khoảng 40 dòng chữ cỡ 25px; dùng 38 dòng ngắn để mỗi trang của tài liệu mẫu đúng một trang.
  const text = Array.from({ length: pages }, (_, p) => Array.from({ length: 38 }, (_, i) => `Trang ${p + 1} · dòng ${i + 1}: nội dung mẫu phục vụ đo hiệu năng đồng bộ trình chiếu.`).join('\n')).join('\n');
  return pdfFromText('TÀI LIỆU ĐO HIỆU NĂNG', text);
}

async function main() {
  if (args.cleanup) return cleanup();
  const health = await fetch(base + '/api/health').then(r => r.ok).catch(() => false);
  if (!health) throw new Error(`Không kết nối được máy chủ tại ${base}. Hãy chạy "npm start" trước.`);

  console.log(`Tạo ${nDelegates} đại biểu, chủ trì, thư ký và phiên đăng nhập…`);
  const tx = db.transaction(() => ({
    chair: ensureUser(PREFIX + 'chair', 'Bench Chủ trì', 'chair'),
    secretary: ensureUser(PREFIX + 'secretary', 'Bench Thư ký', 'secretary'),
    delegates: Array.from({ length: nDelegates }, (_, i) => ensureUser(`${PREFIX}d${String(i + 1).padStart(4, '0')}`, `Bench Đại biểu ${i + 1}`, 'delegate'))
  }));
  const { chair, secretary, delegates } = tx();

  console.log('Tạo cuộc họp và mở cuộc họp…');
  const meeting = await call(secretary, '/meetings', 'POST', {
    title: `[BENCH] Đo đồng bộ ${new Date().toISOString()}`, startsAt: new Date().toISOString(), location: 'Bench',
    chairUserId: chair.id, secretaryUserId: secretary.id, delegateIds: delegates.map(d => d.id), screenUserIds: [], agenda: []
  });
  await call(chair, `/meetings/${meeting.id}/start`, 'POST', {});

  const pdf = args.pdf ? fs.readFileSync(String(args.pdf)) : await samplePdf(Math.max(2, Number(args.pages) || 10));
  console.log(`Tải tài liệu (${(pdf.length / 1024).toFixed(0)} KB) và dựng ảnh trang…`);
  const form = new FormData();
  form.append('title', args.pdf ? path.basename(String(args.pdf)) : 'Tài liệu đo hiệu năng');
  form.append('classification', 'ordinary');
  form.append('audience', 'all');
  form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'bench.pdf');
  const doc = await call(secretary, `/meetings/${meeting.id}/documents`, 'POST', form);

  const fixture = {
    createdAt: new Date().toISOString(), base, meetingId: meeting.id, documentId: doc.id, pageCount: doc.pageCount,
    documentBytes: pdf.length, chair: { cookie: chair.cookie, csrf: chair.csrf },
    delegates: delegates.map(d => ({ username: d.username, cookie: d.cookie }))
  };
  fs.mkdirSync(path.dirname(fixtureFile), { recursive: true });
  fs.writeFileSync(fixtureFile, JSON.stringify(fixture, null, 1));
  console.log(`Xong: cuộc họp ${meeting.id}, tài liệu ${doc.pageCount} trang.\nĐã ghi ${path.relative(process.cwd(), fixtureFile)} (chứa cookie phiên — không chia sẻ; chạy --cleanup sau khi đo).`);
}

main().then(() => db.close(), e => { console.error('Lỗi:', e.message, e.cause ? '(' + (e.cause.code || e.cause.message) + ')' : ''); db.close(); process.exit(1); });
