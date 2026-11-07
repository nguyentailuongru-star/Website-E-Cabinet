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

// Hồi quy: watermark từng không hiện trên ảnh trang kích thước thật (chữ nằm ngoài khung).
test('watermark phủ trang kích thước thật', {timeout:60000}, async()=>{
 const {addWatermark}=require('../server/services/pdf');
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'phonghop-wm-'));
 try{
  const page=path.join(out,'page.png'),marked=path.join(out,'marked.webp');
  await sharp({create:{width:952,height:1348,channels:3,background:'#ffffff'}}).png().toFile(page);
  await addWatermark(page,marked,{full_name:'Nguyễn Văn An',unit:'Phòng Đào tạo'},'21:50 07/11/2026',{width:952,height:1348});
  const {data}=await sharp(fs.readFileSync(marked)).removeAlpha().raw().toBuffer({resolveWithObject:true});
  // Đếm điểm ảnh ngả đỏ ở từng phần tư trang: watermark phải phủ cả trang, không chỉ một góc.
  const quad=[0,0,0,0];for(let i=0;i<data.length;i+=3){if(data[i]-data[i+1]>20){const p=i/3,x=p%952,y=Math.floor(p/952);quad[(x<476?0:1)+(y<674?0:2)]++;}}
  for(const n of quad)assert.ok(n>2000,`mỗi phần tư trang phải có watermark (${quad.join(', ')})`);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
