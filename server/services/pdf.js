const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const sharp = require('sharp');
// Mỗi ảnh xử lý trên một luồng; song song hóa giữa các yêu cầu qua threadpool của libuv (xem server/index.js).
sharp.concurrency(Math.max(1, Number(process.env.SHARP_CONCURRENCY) || 1));

async function toPdf(buffer, extension) {
  if (extension === '.pdf') return { buffer, tempDir: null };
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'phonghop-convert-'));
  const input = path.join(tempDir, `source${extension}`);
  await fs.writeFile(input, buffer, { flag: 'wx' });
  const result = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, input], { timeout: 120000, windowsHide: true, encoding: 'utf8' });
  const output = path.join(tempDir, 'source.pdf');
  if (result.error?.code === 'ENOENT') {
    await fs.rm(tempDir, { recursive: true, force: true });
    const error = new Error('Máy chủ chưa cài LibreOffice; hiện chỉ nhận tệp PDF.'); error.status = 415; throw error;
  }
  if (result.status !== 0) { await fs.rm(tempDir, { recursive: true, force: true }); const error = new Error('Không chuyển được tệp Office sang PDF.'); error.status = 422; throw error; }
  return { buffer: await fs.readFile(output), tempDir };
}

async function renderPdf(buffer, outputDir) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
  let pdf;try{pdf=await task.promise;}catch{await task.destroy().catch(()=>{});const error=new Error('Tệp PDF không hợp lệ hoặc không đọc được.');error.status=422;throw error;}
  if (pdf.numPages < 1 || pdf.numPages > 500) { await pdf.destroy(); const error=new Error('PDF phải có từ 1 đến 500 trang.');error.status=422;throw error; }
  const pages = [];
  try {
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo), base = page.getViewport({ scale: 1 });if(!Number.isFinite(base.width)||!Number.isFinite(base.height)||base.width<=0||base.height<=0){const error=new Error('PDF có kích thước trang không hợp lệ.');error.status=422;throw error;}
      const scale = Math.min(1.6, 2000 / base.width, 2500 / base.height);
      const viewport = page.getViewport({ scale });
      // Dùng canvas factory của chính pdfjs: pdfjs-dist mang bản @napi-rs/canvas riêng; trộn canvas/DOMMatrix/Path2D
      // của hai bản native khác nhau trong một lần render gây Segmentation fault với PDF có ảnh (ví dụ bản scan).
      const { canvas, context } = pdf.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: context, canvas, viewport }).promise;
      const target = path.join(outputDir, `${pageNo}.webp`);
      await sharp(canvas.toBuffer('image/png')).webp({ quality: 82 }).toFile(target);
      pages.push({ pageNumber: pageNo, imagePath: target, width: canvas.width, height: canvas.height });
      page.cleanup();
    }
  } finally { await pdf.destroy(); }
  return pages;
}

function escapeXml(text) { return String(text).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])); }
/*
 * Watermark theo người xem. Lớp chữ (SVG → PNG) chỉ phụ thuộc nội dung nhãn và kích thước trang,
 * nên được dựng một lần rồi dùng lại (LRU); thời điểm trên nhãn làm tròn theo phút, còn nhật ký
 * audit vẫn ghi từng lượt xem chính xác. Nén WebP mức effort 1 nhanh hơn ~3 lần so với mặc định.
 */
const OVERLAY_MAX = Math.max(16, Number(process.env.WATERMARK_CACHE_SIZE) || 256);
const overlays = new Map();
function watermarkOverlay(label, width, height) {
  const key = `${width}x${height}|${label}`;
  let p = overlays.get(key);
  if (p) { overlays.delete(key); overlays.set(key, p); return p; }
  const safe = escapeXml(label), rows = [];
  // Mỗi hàng lặp lại nhãn đủ để phủ kín vùng xoay (≈3 lần chiều rộng trang). Trước đây mỗi hàng chỉ có
  // một nhãn bắt đầu ở x = −width nên với trang lớn, toàn bộ chữ nằm ngoài khung và watermark không hiện.
  const repeat = Math.ceil((width * 3) / Math.max(1, label.length * 11)) + 2;
  const line = Array(repeat).fill(safe).join('  ');
  for (let y = -height, i = 0; y < height * 2; y += 150, i++) rows.push(`<text x="${-width - (i % 2) * 180}" y="${y}">${line}</text>`);
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(-28 ${width/2} ${height/2})" fill="#b52222" fill-opacity="0.25" font-family="Arial,sans-serif" font-size="22" font-weight="600">${rows.join('')}</g></svg>`);
  p = sharp(svg).png({ compressionLevel: 1 }).toBuffer();
  overlays.set(key, p);
  p.catch(() => overlays.delete(key));
  if (overlays.size > OVERLAY_MAX) overlays.delete(overlays.keys().next().value);
  return p;
}
async function addWatermark(pagePath, outputPath, viewer, viewedAt, size) {
  let { width, height } = size || {};
  if (!width || !height) ({ width, height } = await sharp(pagePath).metadata());
  const label = `${viewer.full_name} · ${viewer.unit || 'Đơn vị chưa cập nhật'} · ${viewedAt}`;
  const overlay = await watermarkOverlay(label, width, height);
  await sharp(pagePath).composite([{ input: overlay }]).webp({ quality: 80, effort: 1 }).toFile(outputPath);
}
module.exports = { toPdf, renderPdf, addWatermark };
