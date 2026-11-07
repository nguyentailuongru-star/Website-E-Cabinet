'use strict';
/*
 * Tạo CA nội bộ của đơn vị và chứng thư HTTPS cho máy chủ phòng họp (cần openssl; Git for Windows có sẵn).
 *
 *   node scripts/create-cert.js --hosts 192.168.1.10,phonghop.local [--out certs] [--days 825]
 *
 * Kết quả trong thư mục --out:
 *   ca.crt      → cài vào "Trusted Root Certification Authorities" trên máy người dùng (một lần)
 *   ca.key      → GIỮ BÍ MẬT, cất ngoài máy chủ; chỉ dùng khi cấp lại chứng thư
 *   server.crt, server.key → đặt TLS_CERT, TLS_KEY trong .env
 * Nếu ca.key đã có sẵn thì dùng lại CA cũ (chỉ cấp lại chứng thư máy chủ).
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null).filter(Boolean));
const hosts = String(args.hosts || '').split(',').map(s => s.trim()).filter(Boolean);
if (!hosts.length) { console.error('Cần --hosts <IP hoặc tên máy, cách nhau bởi dấu phẩy>, ví dụ --hosts 192.168.1.10,phonghop.local'); process.exit(2); }
const out = path.resolve(String(args.out || 'certs'));
const days = String(Math.min(825, Math.max(1, Number(args.days) || 825)));
fs.mkdirSync(out, { recursive: true });
const f = n => path.join(out, n);
const ssl = (...a) => execFileSync('openssl', a, { stdio: ['ignore', 'ignore', 'inherit'] });

try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); }
catch { console.error('Không tìm thấy openssl. Trên Windows hãy chạy lệnh trong Git Bash hoặc cài OpenSSL.'); process.exit(1); }

if (!fs.existsSync(f('ca.key'))) {
  ssl('req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-nodes', '-days', '3650', '-keyout', f('ca.key'), '-out', f('ca.crt'), '-subj', '/CN=Phong hop khong giay - CA noi bo');
  console.log('Đã tạo CA nội bộ mới.');
}
const san = hosts.map(h => (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':') ? 'IP:' : 'DNS:') + h).join(',');
fs.writeFileSync(f('server.ext'), `basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`);
ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('server.key'), '-out', f('server.csr'), '-subj', `/CN=${hosts[0]}`);
ssl('x509', '-req', '-in', f('server.csr'), '-CA', f('ca.crt'), '-CAkey', f('ca.key'), '-CAcreateserial', '-out', f('server.crt'), '-days', days, '-sha256', '-extfile', f('server.ext'));
for (const t of ['server.csr', 'server.ext']) fs.rmSync(f(t), { force: true });
console.log(`Đã cấp chứng thư cho: ${hosts.join(', ')} (${days} ngày).
Thêm vào .env:
  TLS_CERT=${path.relative(process.cwd(), f('server.crt'))}
  TLS_KEY=${path.relative(process.cwd(), f('server.key'))}
Cài ${path.relative(process.cwd(), f('ca.crt'))} vào kho chứng thư tin cậy của các máy người dùng; cất ca.key ở nơi an toàn, ngoài máy chủ.`);
