const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const bcrypt=require('bcrypt');
const db=require('../server/db');
const {renderPdf}=require('../server/services/pdf');

const data=path.resolve(process.env.DATA_DIR||'data');
const userRows=[{key:'chair',username:'demo_chair',name:'Chủ trì mẫu',role:'chair'},
 {key:'secretary',username:'demo_secretary',name:'Thư ký mẫu',role:'secretary'},
 ...Array.from({length:50},(_,i)=>({key:`delegate${String(i+1).padStart(2,'0')}`,username:`demo_delegate_${String(i+1).padStart(2,'0')}`,name:`Đại biểu ${String(i+1).padStart(2,'0')}`,role:'delegate'}))];
const documents=[
 {title:'Chương trình hội nghị mẫu',text:'TÀI LIỆU DEMO\nChương trình hội nghị\n\n1. Khai mạc và thông qua chương trình.\n2. Báo cáo công tác.\n3. Thảo luận và kết luận.'},
 {title:'Báo cáo công tác mẫu',text:'TÀI LIỆU DEMO\nBáo cáo công tác\n\nĐây là nội dung giả lập để thử trình xem, watermark, phân quyền và đồng bộ trang.'},
 {title:'Tài liệu tham khảo mẫu',text:'TÀI LIỆU DEMO\nTài liệu tham khảo\n\nKhông chứa dữ liệu thật. Chỉ sử dụng trong môi trường thử nghiệm.'}
];
function samplePdf(text){
 const escape=s=>s.replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7e]/g,'?');
 const lines=text.split(/\r?\n/).slice(0,22),commands=['BT','/F1 17 Tf','72 740 Td'];
 lines.forEach((line,i)=>{if(i)commands.push('0 -28 Td');commands.push(`(${escape(line)}) Tj`);});commands.push('ET');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(commands.join(' '),'ascii')} >>\nstream\n${commands.join(' ')}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf,'ascii'));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(pdf,'ascii');pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(const pos of offsets.slice(1))pdf+=`${String(pos).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(pdf,'ascii');
}

async function main(){
 const usernames=userRows.map(x=>x.username);const placeholders=usernames.map(()=>'?').join(',');
 if(db.prepare(`SELECT 1 FROM users WHERE username IN (${placeholders}) LIMIT 1`).get(...usernames))throw new Error('Tài khoản demo đã tồn tại; không ghi đè dữ liệu.');
 if(require('node:fs').existsSync(path.join(data,'demo-credentials.csv')))throw new Error('Danh sách credentials demo đã tồn tại; không ghi đè.');
 const meetingId=crypto.randomUUID(),userIds=new Map(),passwords=new Map();
 for(const user of userRows){const id=crypto.randomUUID(),password=crypto.randomBytes(18).toString('base64url');userIds.set(user.key,id);passwords.set(user.username,password);}
 const meetingDir=path.join(data,'meetings',meetingId),originalsDir=path.join(meetingDir,'originals');await fs.mkdir(originalsDir,{recursive:true});
 const prepared=[];
 for(const doc of documents){const id=crypto.randomUUID(),buffer=samplePdf(`${doc.title}\n${doc.text}`),file=path.join(originalsDir,`${id}.pdf`),pageDir=path.join(meetingDir,'pages',id);await fs.mkdir(pageDir,{recursive:true});await fs.writeFile(file,buffer,{flag:'wx'});const pages=await renderPdf(buffer,pageDir);prepared.push({id,...doc,file,pages});}
 try{
  const hashes=await Promise.all(userRows.map(u=>bcrypt.hash(passwords.get(u.username),12)));
  const tx=db.transaction(()=>{
   const insertUser=db.prepare('INSERT INTO users(id,username,full_name,unit,title,password_hash,role,must_change_password) VALUES(?,?,?,?,?,?,?,1)');
   userRows.forEach((u,i)=>insertUser.run(userIds.get(u.key),u.username,u.name,'Đơn vị demo','',hashes[i],u.role));
   const adminId=process.env.ADMIN_USERNAME&&db.prepare('SELECT id FROM users WHERE username=?').get(process.env.ADMIN_USERNAME)?.id;
   db.prepare('INSERT INTO meetings(id,title,starts_at,location,status,created_by) VALUES(?,?,?,? ,\'scheduled\',?)').run(meetingId,'Hội nghị demo 50 đại biểu',new Date(Date.now()+3600000).toISOString(),'Phòng họp mẫu',adminId||userIds.get('secretary'));
   db.prepare('INSERT INTO meeting_state(meeting_id) VALUES(?)').run(meetingId);db.prepare('INSERT INTO meeting_minutes(meeting_id) VALUES(?)').run(meetingId);
   const part=db.prepare('INSERT INTO meeting_participants(meeting_id,user_id,meeting_role) VALUES(?,?,?)'),attendance=db.prepare('INSERT INTO attendance(meeting_id,user_id,status) VALUES(?,? ,\'absent\')');
   for(const u of userRows){part.run(meetingId,userIds.get(u.key),u.role);attendance.run(meetingId,userIds.get(u.key));}
   const agendaIds=[];for(const [i,title] of ['Khai mạc','Báo cáo công tác','Thảo luận'].entries()){const id=crypto.randomUUID();agendaIds.push(id);db.prepare('INSERT INTO agenda_items(id,meeting_id,title,position) VALUES(?,?,?,?)').run(id,meetingId,title,i);}
   for(const [i,d] of prepared.entries()){db.prepare('INSERT INTO documents(id,meeting_id,agenda_item_id,title,original_path,original_name,classification,audience,page_count,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?)').run(d.id,meetingId,agendaIds[i],d.title,d.file,path.basename(d.file),i===2?'restricted':'ordinary','all',d.pages.length,userIds.get('secretary'));const ins=db.prepare('INSERT INTO document_pages(document_id,page_number,image_path,width,height) VALUES(?,?,?,?,?)');for(const page of d.pages)ins.run(d.id,page.pageNumber,page.imagePath,page.width,page.height);}
  });tx();
 }catch(e){await fs.rm(meetingDir,{recursive:true,force:true});throw e;}
 const credPath=path.join(data,'demo-credentials.csv');const csv=['username,role,password',...userRows.map(u=>`${u.username},${u.role},${passwords.get(u.username)}`)].join('\n')+'\n';await fs.writeFile(credPath,csv,{encoding:'utf8',flag:'wx',mode:0o600});
 console.log(`Đã tạo cuộc họp demo (${userRows.length} tài khoản, ${prepared.length} PDF). ID: ${meetingId}`);console.log(`Danh sách mật khẩu demo lưu tại: ${credPath}`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.close());
