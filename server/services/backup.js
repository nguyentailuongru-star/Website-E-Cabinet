'use strict';
/*
 * Sao lưu nhất quán: SQLite (API backup trực tuyến) + thư mục tài liệu, nén thành .tar.gz.
 * Dùng chung cho scripts/backup.js (chạy tay) và lịch sao lưu tự động trong máy chủ.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

async function runBackup(db, { dataDir, outDir }) {
  const data = path.resolve(dataDir), out = path.resolve(outDir);
  fs.mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const stage = path.join(out, `.phonghop-stage-${process.pid}-${Date.now()}`);
  if (!path.resolve(stage).startsWith(out + path.sep)) throw new Error('Thư mục staging nằm ngoài thư mục sao lưu.');
  fs.mkdirSync(stage);
  try {
    await db.backup(path.join(stage, 'phong-hop.sqlite'));
    const docs = path.join(data, 'meetings');
    if (fs.existsSync(docs)) await fs.promises.cp(docs, path.join(stage, 'meetings'), { recursive: true });
    const archive = path.join(out, `phong-hop-${stamp}.tar.gz`);
    // Chạy trong thư mục staging với đường dẫn tương đối: GNU tar (Git Bash) hiểu "C:\..." là máy chủ từ xa.
    await run('tar', ['-czf', path.relative(stage, archive), '.'], { cwd: stage });
    return archive;
  } finally {
    if (path.resolve(stage).startsWith(out + path.sep)) fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** Giữ lại `keep` bản sao lưu mới nhất, xóa các bản cũ hơn (chỉ các tệp phong-hop-*.tar.gz). */
function pruneBackups(outDir, keep) {
  const out = path.resolve(outDir);
  if (!fs.existsSync(out) || !(keep > 0)) return [];
  const files = fs.readdirSync(out).filter(f => /^phong-hop-.*\.tar\.gz$/.test(f)).sort().reverse();
  const removed = files.slice(keep);
  for (const f of removed) fs.rmSync(path.join(out, f), { force: true });
  return removed;
}

/** Lịch sao lưu tự động: BACKUP_INTERVAL_HOURS (0 = tắt), BACKUP_KEEP (mặc định 14). */
function scheduleBackups(db, { dataDir, outDir, intervalHours, keep, log = console }) {
  if (!(intervalHours > 0)) return null;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const archive = await runBackup(db, { dataDir, outDir });
      const removed = pruneBackups(outDir, keep);
      log.log(`[sao lưu] ${path.basename(archive)}${removed.length ? ` · xóa ${removed.length} bản cũ` : ''}`);
    } catch (e) { log.error('[sao lưu] Lỗi:', e.message); }
    finally { running = false; }
  };
  const timer = setInterval(tick, intervalHours * 3600 * 1000);
  timer.unref();
  return { timer, tick };
}

module.exports = { runBackup, pruneBackups, scheduleBackups };
