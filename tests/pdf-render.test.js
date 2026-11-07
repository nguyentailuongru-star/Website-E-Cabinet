const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const sharp=require('sharp');
const {pdfFromText}=require('../server/services/minutes-export');
const {renderPdf}=require('../server/services/pdf');

// Hồi quy: PDF chứa ảnh JPEG (bản scan, biên bản do hệ thống xuất) từng làm tiến trình Node bị Segmentation fault.
test('dựng ảnh trang cho PDF dạng ảnh không làm sập tiến trình', {timeout:60000}, async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'phonghop-render-'));
 try{
  const pdf=await pdfFromText('KIỂM THỬ',Array.from({length:60},(_,i)=>`Dòng ${i+1}`).join('\n'));
  const pages=await renderPdf(pdf,out);
  assert.equal(pages.length,2);
  const stats=await sharp(fs.readFileSync(pages[0].imagePath)).stats();
  assert.ok(stats.channels[0].min<128,'trang phải có nội dung, không trắng trơn');
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
