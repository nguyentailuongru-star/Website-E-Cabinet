'use strict';
/*
 * Thí nghiệm: tấn công pháp chứng (forensic) vào WAL của SQLite nhằm liên kết
 * "người bỏ phiếu" với "phương án" trong biểu quyết kín.
 *
 * Mô hình kẻ tấn công: có bản sao tệp phong-hop.sqlite và phong-hop.sqlite-wal
 * (quản trị máy chủ, bản sao lưu, ổ đĩa bị thu giữ…) sau khi biểu quyết đóng.
 * Kịch bản xấu nhất cho người bảo vệ: tắt checkpoint tự động để WAL giữ mọi frame.
 *
 * Kẻ tấn công duyệt WAL theo từng transaction (frame có commit-size ≠ 0), so sánh
 * mỗi trang với phiên bản trước của nó và đếm số lần xuất hiện mới của mã người
 * dùng và mã phương án. Transaction có đúng 1 người mới và 1 phiếu mới ⇒ liên kết
 * chắc chắn. Với người còn lại, kẻ tấn công đoán phương án phổ biến nhất trong
 * transaction chứa người đó (hoặc phương án đa số nếu transaction không có phiếu).
 *
 * So sánh:
 *   legacy : ghi ledger + ballot trong cùng transaction lúc bỏ phiếu (thiết kế cũ)
 *   sealed : ghi ledger lúc bỏ phiếu, niêm phong toàn bộ ballot khi đóng (thiết kế mới)
 *
 *   node bench/secret-linkage.js --voters 50 --trials 20
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null).filter(Boolean));
const SHARES = [0.5, 0.3, 0.2]; // phân bố lựa chọn của cử tri giả lập

/* =================== Tiến trình con: chạy một lượt biểu quyết rồi tấn công =================== */
function child(mode, nVoters) {
  const db = require('../server/db');
  const secretBallot = require('../server/services/secret-ballot');
  db.pragma('wal_autocheckpoint = 0');
  const uid = () => crypto.randomUUID();
  const admin = uid(), meeting = uid(), poll = uid(), options = SHARES.map(uid);
  const voters = Array.from({ length: nVoters }, uid);
  db.transaction(() => {
    db.prepare("INSERT INTO users(id,username,full_name,password_hash,role) VALUES(?,?,?,?,'admin')").run(admin, 'adm', 'Admin', 'x');
    db.prepare('INSERT INTO meetings(id,title,starts_at,created_by) VALUES(?,?,?,?)').run(meeting, 'M', new Date().toISOString(), admin);
    db.prepare("INSERT INTO polls(id,meeting_id,created_by,question,ballot_type,status) VALUES(?,?,?,?,'secret','open')").run(poll, meeting, admin, 'Q?');
    options.forEach((o, i) => db.prepare('INSERT INTO poll_options(id,poll_id,label,position) VALUES(?,?,?,?)').run(o, poll, 'O' + i, i));
    voters.forEach((v, i) => db.prepare("INSERT INTO users(id,username,full_name,password_hash,role) VALUES(?,?,?,?,'delegate')").run(v, 'u' + i, 'U' + i, 'x'));
  })();
  db.pragma('wal_checkpoint(TRUNCATE)'); // trạng thái ban đầu nằm trong tệp chính; WAL rỗng

  const truth = new Map();
  const audit = db.prepare("INSERT INTO audit_logs(user_id,username,action,details,ip_address) VALUES(?,?,'secret_vote_cast',?,'')");
  for (const v of voters) {
    const r = Math.random(); let k = 0, acc = SHARES[0]; while (r > acc && k < SHARES.length - 1) acc += SHARES[++k];
    const o = options[k]; truth.set(v, o);
    if (mode === 'legacy') {
      db.transaction(() => {
        db.prepare('INSERT INTO secret_vote_ledger(poll_id,user_id) VALUES(?,?)').run(poll, v);
        db.prepare('INSERT INTO secret_ballots(id,poll_id,option_id) VALUES(?,?,?)').run(uid(), poll, o);
      })();
    } else secretBallot.cast(poll, v, o);
    audit.run(v, 'u', JSON.stringify({ pollId: poll, submitted: true }));
  }
  if (mode === 'legacy') db.prepare("UPDATE polls SET status='closed' WHERE id=?").run(poll);
  else { db.transaction(() => { db.prepare("UPDATE polls SET status='closed' WHERE id=?").run(poll); secretBallot.seal(poll); })(); secretBallot.forget(poll); }

  const dir = path.resolve(process.env.DATA_DIR);
  const wal = fs.readFileSync(path.join(dir, 'phong-hop.sqlite-wal')), main = fs.readFileSync(path.join(dir, 'phong-hop.sqlite'));
  const result = attack(wal, main, voters, options, truth);
  db.close();
  return { mode, voters: nVoters, ...result };
}

function occ(buf, needle) { let n = 0, i = -1; while ((i = buf.indexOf(needle, i + 1)) !== -1) n++; return n; }

function attack(wal, main, voters, options, truth) {
  const pageSize = wal.readUInt32BE(8) || 4096;
  const salt1 = wal.readUInt32BE(16), salt2 = wal.readUInt32BE(20);
  const state = new Map(); // pgno -> phiên bản trang mới nhất
  const getPage = pgno => state.get(pgno) || (pgno * pageSize <= main.length ? main.subarray((pgno - 1) * pageSize, pgno * pageSize) : Buffer.alloc(pageSize));
  const vNeedles = voters.map(v => [v, Buffer.from(v)]), oNeedles = options.map(o => [o, Buffer.from(o)]);
  const txns = []; let frames = new Map();
  for (let off = 32; off + 24 + pageSize <= wal.length; off += 24 + pageSize) {
    if (wal.readUInt32BE(off + 8) !== salt1 || wal.readUInt32BE(off + 12) !== salt2) break;
    frames.set(wal.readUInt32BE(off), wal.subarray(off + 24, off + 24 + pageSize));
    if (wal.readUInt32BE(off + 4) !== 0) { txns.push(frames); frames = new Map(); }
  }
  const majority = options[0];
  const guess = new Map(); let certain = 0, txnsWithBallots = 0;
  for (const t of txns) {
    const newUsers = [], ballotDelta = new Map();
    for (const [v, nb] of vNeedles) { let d = 0; for (const [pg, page] of t) d += occ(page, nb) - occ(getPage(pg), nb); if (d > 0) newUsers.push(v); }
    for (const [o, nb] of oNeedles) { let d = 0; for (const [pg, page] of t) d += occ(page, nb) - occ(getPage(pg), nb); if (d > 0) ballotDelta.set(o, d); }
    for (const [pg, page] of t) state.set(pg, page);
    const k = [...ballotDelta.values()].reduce((s, x) => s + x, 0);
    if (k) txnsWithBallots++;
    const top = k ? [...ballotDelta].sort((a, b) => b[1] - a[1])[0][0] : null;
    if (newUsers.length === 1 && k === 1) { if (!guess.has(newUsers[0]) || guess.get(newUsers[0]).certain !== true) certain++; guess.set(newUsers[0], { o: top, certain: true }); }
    else for (const v of newUsers) if (!guess.get(v)?.certain) guess.set(v, { o: top || majority, certain: false });
  }
  let correct = 0;
  for (const v of voters) if ((guess.get(v)?.o || majority) === truth.get(v)) correct++;
  const counts = options.map(o => [...truth.values()].filter(x => x === o).length);
  return { transactions: txns.length, txnsWithBallots, certainLinks: certain, accuracy: correct / voters.length, baseline: Math.max(...counts) / voters.length, walBytes: wal.length };
}

/* =================== Tiến trình cha: lặp thí nghiệm, tổng hợp =================== */
function parent() {
  const nVoters = Math.max(2, Number(args.voters) || 50), trials = Math.max(1, Number(args.trials) || 20);
  const rows = [];
  for (const mode of ['legacy', 'sealed']) {
    for (let t = 1; t <= trials; t++) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-'));
      const r = spawnSync(process.execPath, [__filename, '--child', mode, '--voters', String(nVoters)], { env: { ...process.env, DATA_DIR: dir }, encoding: 'utf8' });
      fs.rmSync(dir, { recursive: true, force: true });
      if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
      const res = JSON.parse(r.stdout.trim().split('\n').pop());
      rows.push({ trial: t, ...res });
      process.stdout.write(`\r${mode} ${t}/${trials}   `);
    }
  }
  const agg = mode => {
    const xs = rows.filter(r => r.mode === mode), m = k => xs.reduce((s, r) => s + r[k], 0) / xs.length;
    const sd = k => { const mu = m(k); return Math.sqrt(xs.reduce((s, r) => s + (r[k] - mu) ** 2, 0) / Math.max(1, xs.length - 1)); };
    return { mode, trials: xs.length, certainLinkRate: m('certainLinks') / nVoters, accuracy: m('accuracy'), accuracySd: sd('accuracy'), baseline: m('baseline'), txnsWithBallots: m('txnsWithBallots') };
  };
  const summary = ['legacy', 'sealed'].map(agg);
  const outDir = path.resolve(String(args.out || 'bench/results'));
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const header = Object.keys(rows[0]);
  fs.writeFileSync(path.join(outDir, `secret-linkage-${stamp}.csv`), [header.join(','), ...rows.map(r => header.map(h => r[h]).join(','))].join('\n') + '\n');
  const pctf = x => (100 * x).toFixed(1) + '%';
  const md = [
    '# Tấn công liên kết phiếu kín qua WAL của SQLite', '',
    `- ${nVoters} cử tri/lượt, ${trials} lượt cho mỗi thiết kế; phân bố lựa chọn ${SHARES.map(pctf).join(' / ')}; checkpoint tự động bị tắt (kịch bản xấu nhất).`,
    '- "Đoán ngẫu nhiên có hiểu biết" = luôn đoán phương án đa số (giới hạn dưới mà kẻ tấn công đạt được mà không cần dữ liệu).', '',
    '| Thiết kế | Liên kết chắc chắn | Độ chính xác của kẻ tấn công (TB ± ĐLC) | Đoán theo đa số | Số transaction chứa phiếu |',
    '|---|---:|---:|---:|---:|',
    ...summary.map(s => `| ${s.mode === 'legacy' ? 'Cũ: ghi phiếu khi bỏ phiếu' : 'Mới: niêm phong khi đóng'} | ${pctf(s.certainLinkRate)} | ${pctf(s.accuracy)} ± ${pctf(s.accuracySd)} | ${pctf(s.baseline)} | ${s.txnsWithBallots.toFixed(1)} |`), ''
  ].join('\n');
  fs.writeFileSync(path.join(outDir, `secret-linkage-${stamp}.md`), md);
  console.log('\n\n' + md + `\nĐã lưu tại ${path.relative(process.cwd(), outDir)}`);
}

if (args.child) process.stdout.write(JSON.stringify(child(String(process.argv[process.argv.indexOf('--child') + 1]), Number(args.voters))) + '\n');
else parent();
