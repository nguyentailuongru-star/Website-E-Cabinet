'use strict';
/*
 * Đo độ trễ đồng bộ trình chiếu theo đúng kịch bản sử dụng:
 *   MỘT chủ trì lật trang  →  máy chủ phát sự kiện  →  N đại biểu nhận sự kiện và tải ảnh trang
 *   (ảnh được đóng watermark theo từng người xem).
 *
 * Chuẩn bị (trên máy chủ):   node bench/provision.js --delegates 200
 * Đo (trên máy khách LAN):   node bench/sync.js --base http://<ip-may-chu>:3000 --levels 10,25,50,100,200 --rounds 30
 *
 * Chỉ số cho mỗi lượt lật trang (t0 = ngay trước khi chủ trì gửi lệnh):
 *   state_ms  : thời gian tới khi đại biểu nhận sự kiện presentation:state
 *   image_ms  : thời gian tới khi đại biểu tải xong ảnh trang (trang hiển thị được)
 *   room_ms   : max(image_ms) của lượt — thời gian để CẢ PHÒNG thấy trang mới
 * Mọi mốc thời gian đo bằng một đồng hồ đơn điệu trong cùng tiến trình, nên không
 * cần đồng bộ đồng hồ giữa các máy.
 *
 * Kết quả: bench/results/run-<thời điểm>/
 *   raw.csv, rounds.csv, summary.csv, summary.md, env.json, latency.png, room-sync.png
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { io } = require('socket.io-client');

/* ---------------- Tham số ---------------- */
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null).filter(Boolean));
const fixture = JSON.parse(fs.readFileSync(path.resolve(String(args.fixture || 'bench/fixture.json')), 'utf8'));
const base = String(args.base || process.env.BENCH_URL || fixture.base).replace(/\/$/, '');
const levels = [...new Set(String(args.levels || '10,25,50,100,200').split(',').map(Number).filter(n => n > 0 && n <= fixture.delegates.length))].sort((a, b) => a - b);
const rounds = Math.max(1, Number(args.rounds) || 30);
const warmup = Math.max(0, Number(args.warmup ?? 3));
const gapMs = Math.max(0, Number(args.gap) || 1500);
const timeoutMs = Math.max(1000, Number(args.timeout) || 20000);
const withImage = !args['no-image'];
const outDir = path.resolve(String(args.out || 'bench/results'), 'run-' + new Date().toISOString().replace(/[:.]/g, '-'));
if (!levels.length) { console.error(`Không có mức client hợp lệ (fixture có ${fixture.delegates.length} đại biểu).`); process.exit(2); }

/* ---------------- Thống kê ---------------- */
const sorted = a => [...a].sort((x, y) => x - y);
const pct = (a, p) => { if (!a.length) return NaN; const s = sorted(a); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; };
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
function bootstrapCI(a, stat, iters = 2000) {
  if (a.length < 2) return [NaN, NaN];
  const est = [];
  for (let i = 0; i < iters; i++) { const s = Array.from(a, () => a[Math.floor(Math.random() * a.length)]); est.push(stat(s)); }
  return [pct(est, 0.025), pct(est, 0.975)];
}
const f1 = x => Number.isFinite(x) ? x.toFixed(1) : '';
const csvCell = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
const toCsv = (header, rows) => [header.join(','), ...rows.map(r => header.map(h => csvCell(r[h])).join(','))].join('\n') + '\n';

/* ---------------- Socket ---------------- */
function connect(cookie) {
  return new Promise((resolve, reject) => {
    const s = io(base, { extraHeaders: { cookie }, transports: ['websocket'], reconnection: false, timeout: timeoutMs, forceNew: true });
    const t = setTimeout(() => { s.close(); reject(new Error('connect timeout')); }, timeoutMs);
    s.once('connect', () => { clearTimeout(t); resolve(s); });
    s.once('connect_error', e => { clearTimeout(t); s.close(); reject(e); });
  });
}
function emitAck(s, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${event}: không có phản hồi`)), timeoutMs);
    s.emit(event, payload, r => { clearTimeout(t); r?.ok === false ? reject(new Error(`${event}: ${r.error}`)) : resolve(r); });
  });
}
async function inBatches(items, size, fn) { const out = []; for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn))); return out; }

/* ---------------- Một lượt lật trang ---------------- */
async function flip(chair, clients, page) {
  const t0 = performance.now();
  const waits = clients.map(c => new Promise(resolve => {
    const timer = setTimeout(() => { c.waiter = null; resolve({ ok: false, error: 'timeout' }); }, timeoutMs);
    c.waiter = async state => {
      if (state?.meetingId !== fixture.meetingId || state.documentId !== fixture.documentId || state.pageNumber !== page) return;
      c.waiter = null;
      const stateMs = performance.now() - t0;
      if (!withImage) { clearTimeout(timer); return resolve({ ok: true, stateMs }); }
      try {
        const r = await fetch(`${base}/api/documents/${fixture.documentId}/pages/${page}`, { headers: { cookie: c.cookie }, signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const bytes = (await r.arrayBuffer()).byteLength;
        clearTimeout(timer); resolve({ ok: true, stateMs, imageMs: performance.now() - t0, bytes });
      } catch (e) { clearTimeout(timer); resolve({ ok: false, stateMs, error: e.message }); }
    };
  }));
  let ackMs = NaN;
  try { await emitAck(chair, 'presentation:page', { meetingId: fixture.meetingId, pageNumber: page }); ackMs = performance.now() - t0; }
  catch (e) { for (const c of clients) c.waiter = null; return { ackMs, results: clients.map(() => ({ ok: false, error: e.message })) }; }
  return { ackMs, results: await Promise.all(waits) };
}

/* ---------------- Biểu đồ ---------------- */
function lineChart(file, { title, xLabel, yLabel, series }) {
  let createCanvas;
  try { ({ createCanvas } = require('@napi-rs/canvas')); } catch { return false; }
  const W = 1600, H = 1000, L = 150, R = 60, T = 150, B = 130;
  const c = createCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const pts = series.flatMap(s => s.points);
  const xs = [...new Set(pts.map(p => p.x))].sort((a, b) => a - b);
  const yMaxRaw = Math.max(1, ...pts.map(p => Number.isFinite(p.hi) ? p.hi : p.y).filter(Number.isFinite));
  const step = (() => { const raw = yMaxRaw / 6, mag = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(m => m * mag).find(v => v >= raw); })();
  const yMax = Math.ceil(yMaxRaw / step) * step, xMin = xs[0], xMax = xs.at(-1);
  const X = x => xs.length === 1 ? L + (W - L - R) / 2 : L + (x - xMin) / (xMax - xMin) * (W - L - R);
  const Y = y => H - B - y / yMax * (H - T - B);
  g.fillStyle = '#0b2a45'; g.font = 'bold 40px sans-serif'; g.fillText(title, L, 64);
  g.font = '26px sans-serif'; g.strokeStyle = '#e3e8ec'; g.lineWidth = 2; g.fillStyle = '#526577';
  for (let y = 0; y <= yMax + 1e-9; y += step) { g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(W - R, Y(y)); g.stroke(); g.textAlign = 'right'; g.fillText(String(+y.toFixed(2)), L - 16, Y(y) + 9); }
  g.textAlign = 'center'; for (const x of xs) g.fillText(String(x), X(x), H - B + 40);
  g.strokeStyle = '#8a9aa8'; g.beginPath(); g.moveTo(L, T - 10); g.lineTo(L, H - B); g.lineTo(W - R, H - B); g.stroke();
  g.fillStyle = '#1b2a38'; g.font = '28px sans-serif'; g.fillText(xLabel, (L + W - R) / 2, H - 40);
  g.save(); g.translate(48, (T + H - B) / 2); g.rotate(-Math.PI / 2); g.fillText(yLabel, 0, 0); g.restore();
  series.forEach((s, si) => {
    const p = s.points.filter(q => Number.isFinite(q.y));
    g.strokeStyle = s.color; g.fillStyle = s.color; g.lineWidth = 5; g.setLineDash(s.dash || []);
    g.beginPath(); p.forEach((q, i) => i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y))); g.stroke(); g.setLineDash([]);
    for (const q of p) {
      if (Number.isFinite(q.lo) && Number.isFinite(q.hi)) { g.lineWidth = 3; g.beginPath(); g.moveTo(X(q.x), Y(q.lo)); g.lineTo(X(q.x), Y(q.hi)); g.moveTo(X(q.x) - 12, Y(q.lo)); g.lineTo(X(q.x) + 12, Y(q.lo)); g.moveTo(X(q.x) - 12, Y(q.hi)); g.lineTo(X(q.x) + 12, Y(q.hi)); g.stroke(); }
      g.beginPath(); g.arc(X(q.x), Y(q.y), 9, 0, Math.PI * 2); g.fill();
    }
    const lx = L + 20 + si * 340, ly = T - 50;
    g.lineWidth = 5; g.setLineDash(s.dash || []); g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + 50, ly); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#1b2a38'; g.textAlign = 'left'; g.font = '26px sans-serif'; g.fillText(s.name, lx + 62, ly + 9);
  });
  fs.writeFileSync(file, c.toBuffer('image/png'));
  return true;
}

/* ---------------- Chạy ---------------- */
async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const raw = [], roundRows = [], summary = [];
  const healthT = performance.now(); const healthOk = await fetch(base + '/api/health').then(r => r.ok).catch(() => false);
  const rttMs = performance.now() - healthT;
  if (!healthOk) throw new Error(`Không kết nối được ${base}`);
  const env = {
    startedAt: new Date().toISOString(), base, levels, rounds, warmup, gapMs, timeoutMs, withImage,
    fixture: { meetingId: fixture.meetingId, documentId: fixture.documentId, pageCount: fixture.pageCount, documentBytes: fixture.documentBytes },
    client: { node: process.version, platform: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGB: +(os.totalmem() / 2 ** 30).toFixed(1) },
    healthRttMs: +rttMs.toFixed(2)
  };
  console.log(`Máy chủ: ${base} · mức client: ${levels.join(', ')} · ${rounds} lượt/mức (+${warmup} khởi động) · ảnh trang: ${withImage ? 'có' : 'không'}`);

  const chair = await connect(fixture.chair.cookie);
  await emitAck(chair, 'meeting:join', fixture.meetingId);
  await emitAck(chair, 'presentation:open', { meetingId: fixture.meetingId, documentId: fixture.documentId });
  let currentPage = 1;
  const nextPage = () => (currentPage = fixture.pageCount > 1 ? (currentPage % fixture.pageCount) + 1 : 1);

  // Giữ kết nối giữa các mức (mức tăng dần) và chỉ mở thêm phần thiếu: tổng số lần bắt tay = max(levels) + 1,
  // tránh vượt SOCKET_CONNECTIONS_PER_MINUTE của máy chủ.
  const pool = [];
  for (const n of levels) {
    pool.push(...await inBatches(fixture.delegates.slice(pool.length, n), 25, async d => {
      const s = await connect(d.cookie);
      const c = { socket: s, cookie: d.cookie, username: d.username, waiter: null };
      s.on('presentation:state', st => c.waiter?.(st));
      await emitAck(s, 'meeting:join', fixture.meetingId);
      return c;
    }));
    const clients = pool.slice(0, n);
    const lag = monitorEventLoopDelay({ resolution: 10 }); lag.enable();
    const startedAt = new Date().toISOString();
    const cpu0 = process.cpuUsage(), wall0 = performance.now();
    const roomMs = [], stateAll = [], imageAll = [], ackAll = []; let expected = 0, okCount = 0;

    for (let r = -warmup; r < rounds; r++) {
      const page = nextPage();
      const { ackMs, results } = await flip(chair, clients, page);
      if (r >= 0) {
        expected += results.length;
        const ok = results.filter(x => x.ok); okCount += ok.length;
        const st = ok.map(x => x.stateMs), im = ok.map(x => x.imageMs).filter(Number.isFinite);
        stateAll.push(...st); imageAll.push(...im); if (Number.isFinite(ackMs)) ackAll.push(ackMs);
        const room = ok.length === results.length ? Math.max(...(withImage ? im : st)) : NaN;
        if (Number.isFinite(room)) roomMs.push(room);
        results.forEach((x, i) => raw.push({ clients: n, round: r + 1, client: i + 1, page, state_ms: f1(x.stateMs), image_ms: f1(x.imageMs), bytes: x.bytes ?? '', ok: x.ok, error: x.error || '' }));
        roundRows.push({ clients: n, round: r + 1, page, received: ok.length, expected: results.length, chair_ack_ms: f1(ackMs), state_p50: f1(pct(st, .5)), state_p95: f1(pct(st, .95)), state_max: f1(Math.max(...st)), image_p50: f1(pct(im, .5)), image_p95: f1(pct(im, .95)), room_ms: f1(room) });
      }
      process.stdout.write(`\r  N=${String(n).padStart(4)}  lượt ${r < 0 ? 'khởi động' : `${r + 1}/${rounds}`}      `);
      await new Promise(res => setTimeout(res, gapMs));
    }
    lag.disable();
    const cpu = process.cpuUsage(cpu0), wall = performance.now() - wall0;
    const ci = bootstrapCI(roomMs, a => pct(a, .5));
    const row = {
      clients: n, started_at: startedAt, ended_at: new Date().toISOString(), rounds, samples: expected, success_rate: (100 * okCount / expected).toFixed(2),
      chair_ack_p50: f1(pct(ackAll, .5)),
      state_p50: f1(pct(stateAll, .5)), state_p95: f1(pct(stateAll, .95)), state_p99: f1(pct(stateAll, .99)), state_mean: f1(mean(stateAll)), state_sd: f1(sd(stateAll)),
      image_p50: f1(pct(imageAll, .5)), image_p95: f1(pct(imageAll, .95)), image_p99: f1(pct(imageAll, .99)), image_mean: f1(mean(imageAll)), image_sd: f1(sd(imageAll)),
      room_p50: f1(pct(roomMs, .5)), room_p50_ci_lo: f1(ci[0]), room_p50_ci_hi: f1(ci[1]), room_p95: f1(pct(roomMs, .95)), room_max: f1(Math.max(...roomMs)),
      bench_loop_lag_p99_ms: f1(lag.percentile(99) / 1e6), bench_cpu_pct: f1(100 * (cpu.user + cpu.system) / 1000 / wall)
    };
    summary.push(row);
    process.stdout.write(`\r  N=${String(n).padStart(4)}  thành công ${row.success_rate}% · sự kiện p50/p95 ${row.state_p50}/${row.state_p95} ms · ảnh p50/p95 ${row.image_p50}/${row.image_p95} ms · cả phòng p50 ${row.room_p50} ms [${row.room_p50_ci_lo}–${row.room_p50_ci_hi}]\n`);
    if (Number(row.bench_loop_lag_p99_ms) > 50) console.warn(`  ⚠ Độ trễ vòng lặp sự kiện của máy đo p99=${row.bench_loop_lag_p99_ms} ms: máy đo có thể là nút cổ chai — nên chia client ra nhiều máy.`);
    await new Promise(res => setTimeout(res, 2000));
  }
  for (const c of pool) c.socket.close();
  chair.close();
  env.finishedAt = new Date().toISOString();

  /* ---------------- Xuất kết quả ---------------- */
  fs.writeFileSync(path.join(outDir, 'raw.csv'), toCsv(['clients', 'round', 'client', 'page', 'state_ms', 'image_ms', 'bytes', 'ok', 'error'], raw));
  fs.writeFileSync(path.join(outDir, 'rounds.csv'), toCsv(Object.keys(roundRows[0]), roundRows));
  fs.writeFileSync(path.join(outDir, 'summary.csv'), toCsv(Object.keys(summary[0]), summary));
  fs.writeFileSync(path.join(outDir, 'env.json'), JSON.stringify(env, null, 2));
  const md = [
    `# Kết quả đo đồng bộ trình chiếu`, ``,
    `- Máy chủ: \`${base}\` (RTT /api/health: ${env.healthRttMs} ms)`,
    `- Máy đo: ${env.client.cpu} · ${env.client.cores} lõi · ${env.client.memGB} GB · ${env.client.platform} · Node ${env.client.node}`,
    `- Tài liệu: ${fixture.pageCount} trang · ${rounds} lượt lật trang mỗi mức (+${warmup} lượt khởi động bỏ qua) · nghỉ ${gapMs} ms giữa các lượt`,
    `- Thời gian tính từ lúc chủ trì gửi lệnh lật trang. "Cả phòng" = thời điểm đại biểu cuối cùng tải xong ảnh trang trong lượt; khoảng tin cậy 95% bằng bootstrap.`, ``,
    `| Số đại biểu | Thành công (%) | Sự kiện p50 / p95 (ms) | Ảnh trang p50 / p95 / p99 (ms) | Cả phòng trung vị [KTC 95%] (ms) | Cả phòng p95 (ms) |`,
    `|---:|---:|---:|---:|---:|---:|`,
    ...summary.map(r => `| ${r.clients} | ${r.success_rate} | ${r.state_p50} / ${r.state_p95} | ${r.image_p50} / ${r.image_p95} / ${r.image_p99} | ${r.room_p50} [${r.room_p50_ci_lo}–${r.room_p50_ci_hi}] | ${r.room_p95} |`), ``
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'summary.md'), md);
  const P = key => summary.map(r => ({ x: r.clients, y: Number(r[key]) }));
  lineChart(path.join(outDir, 'latency.png'), {
    title: 'Độ trễ đồng bộ trình chiếu theo số đại biểu', xLabel: 'Số đại biểu kết nối đồng thời', yLabel: 'Độ trễ (ms)',
    series: [
      { name: 'Sự kiện p50', color: '#1763a0', points: P('state_p50') },
      { name: 'Sự kiện p95', color: '#1763a0', dash: [14, 10], points: P('state_p95') },
      ...(withImage ? [{ name: 'Ảnh trang p50', color: '#c26a00', points: P('image_p50') }, { name: 'Ảnh trang p95', color: '#c26a00', dash: [14, 10], points: P('image_p95') }] : [])
    ]
  });
  lineChart(path.join(outDir, 'room-sync.png'), {
    title: 'Thời gian để cả phòng thấy trang mới', xLabel: 'Số đại biểu kết nối đồng thời', yLabel: 'Thời gian (ms)',
    series: [
      { name: 'Trung vị (KTC 95%)', color: '#0f7b6c', points: summary.map(r => ({ x: r.clients, y: Number(r.room_p50), lo: Number(r.room_p50_ci_lo), hi: Number(r.room_p50_ci_hi) })) },
      { name: 'p95', color: '#b42323', dash: [14, 10], points: P('room_p95') }
    ]
  });
  console.log(`\n${md}\nĐã lưu kết quả tại ${path.relative(process.cwd(), outDir)}`);
}

main().catch(e => { console.error('\nLỗi:', e.message); process.exit(1); });
