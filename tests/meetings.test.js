const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const crypto=require('node:crypto');
const { once }=require('node:events');
const bcrypt=require('bcrypt');
const socketClient=require('socket.io-client').io;
process.env.DATA_DIR=path.join(os.tmpdir(),`phonghop-g2-tests-${crypto.randomUUID()}`);
process.env.LOCALAPPDATA=path.join(process.env.DATA_DIR,'local-cache');
process.env.XDG_CACHE_HOME=path.join(process.env.DATA_DIR,'xdg-cache');
fs.mkdirSync(path.join(process.env.LOCALAPPDATA,'fontconfig','cache'),{recursive:true});
fs.mkdirSync(path.join(process.env.XDG_CACHE_HOME,'fontconfig'),{recursive:true});
const db=require('../server/db');
const app=require('../server');

function twoPagePdf(){
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
  '<< /Length 44 >>\nstream\nBT /F1 22 Tf 72 720 Td (Test page one) Tj ET\nendstream',
  '<< /Length 44 >>\nstream\nBT /F1 22 Tf 72 720 Td (Test page two) Tj ET\nendstream',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
 ];let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(const n of offsets.slice(1))pdf+=`${String(n).padStart(10,'0')} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(pdf,'ascii');
}
function waitEvent(emitter,event,timeout=5000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Hết thời gian chờ sự kiện ${event}.`)),timeout);once(emitter,event).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});}
function emitAck(client,event,...args){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Sự kiện ${event} không phản hồi.`)),3000);client.emit(event,...args,result=>{clearTimeout(timer);resolve(result);});});}

test('GĐ2–GĐ3: tài liệu an toàn, trình chiếu đồng bộ, phát biểu và kết nối lại',{timeout:30000},async t=>{
 const suffix=crypto.randomUUID(),ids={admin:crypto.randomUUID(),chair:crypto.randomUUID(),secretary:crypto.randomUUID(),allowed:crypto.randomUUID(),denied:crypto.randomUUID()};let meetingId=null;
 const server=require('node:http').createServer(app),io=app.attachSockets(server);server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;let allowedSocket,chairSocket,deniedSocket;
 t.after(async()=>{allowedSocket?.disconnect();chairSocket?.disconnect();deniedSocket?.disconnect();server.closeAllConnections();await new Promise(resolve=>io.close(resolve));if(meetingId)db.prepare('DELETE FROM meetings WHERE id=?').run(meetingId);db.prepare('DELETE FROM users WHERE id IN (?,?,?,?,?)').run(...Object.values(ids));});
 const hash=await bcrypt.hash('Long-Temporary-Test-Password-2026',4);const insert=db.prepare('INSERT INTO users(id,username,full_name,unit,password_hash,role,must_change_password) VALUES(?,?,?,?,?,?,0)');
 for(const [role,userId] of Object.entries(ids)){const accountRole=role==='allowed'||role==='denied'?'delegate':role;insert.run(userId,`g2_${role}_${suffix}`,`Nguoi ${role}`,'Don vi kiem thu',hash,accountRole);}
 async function login(role){const response=await fetch(`${base}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:`g2_${role}_${suffix}`,password:'Long-Temporary-Test-Password-2026'})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];const body=await response.json();return{cookie,csrf:body.csrfToken};}
 const secretary=await login('secretary'),chair=await login('chair'),allowed=await login('allowed'),denied=await login('denied');
 async function call(url,session,method='GET',body,headers={}){const h={cookie:session.cookie,...headers};if(session.csrf)h['x-csrf-token']=session.csrf;if(body&&!(body instanceof FormData))h['content-type']='application/json';return fetch(`${base}${url}`,{method,headers:h,body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});}
 const create=await call('/meetings',secretary,'POST',{title:'Hop kiem thu GĐ2',startsAt:new Date(Date.now()+3600000).toISOString(),location:'Phong A',chairUserId:ids.chair,secretaryUserId:ids.secretary,delegateIds:[ids.allowed,ids.denied],agenda:['Kiem tra tai lieu']});assert.equal(create.status,201,await create.clone().text());meetingId=(await create.json()).id;assert.ok(meetingId);
 const joined=await call(`/meetings/${meetingId}/join`,allowed,'POST',{});assert.equal(joined.status,200);const attendance=await call(`/meetings/${meetingId}/attendance`,secretary);assert.equal(attendance.status,200);assert.equal((await attendance.json()).find(x=>x.userId===ids.allowed).status,'present');
 const agenda=(await (await call(`/meetings/${meetingId}`,secretary)).json()).agenda[0];const form=new FormData();form.append('title','Tai lieu han che');form.append('classification','restricted');form.append('audience','selected');form.append('userIds',JSON.stringify([ids.allowed]));form.append('agendaItemId',agenda.id);form.append('file',new Blob([twoPagePdf()],{type:'application/pdf'}),'kiem-thu.pdf');
 const uploaded=await call(`/meetings/${meetingId}/documents`,secretary,'POST',form);assert.equal(uploaded.status,201,await uploaded.clone().text());const documentId=(await uploaded.json()).id;
 assert.equal((await call(`/meetings/${meetingId}/start`,chair,'POST',{})).status,200);const origin=base.replace(/\/api$/,'');allowedSocket=socketClient(origin,{extraHeaders:{cookie:allowed.cookie}});chairSocket=socketClient(origin,{extraHeaders:{cookie:chair.cookie}});await Promise.all([waitEvent(allowedSocket,'connect'),waitEvent(chairSocket,'connect')]);
 assert.equal((await emitAck(allowedSocket,'meeting:join',meetingId)).ok,true);assert.equal((await emitAck(chairSocket,'meeting:join',meetingId)).ok,true);
 assert.equal((await emitAck(allowedSocket,'presentation:open',{meetingId,documentId})).ok,false);
 assert.equal((await emitAck(allowedSocket,'presentation:laser',{meetingId,x:.5,y:.5})).ok,false);
 const subscribe=client=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Socket không xác nhận quyền xem.')),3000);client.emit('document:subscribe',documentId,result=>{clearTimeout(timer);if(result?.ok)resolve();else reject(new Error('Socket từ chối quyền xem.'));});});await Promise.all([subscribe(allowedSocket),subscribe(chairSocket)]);
 const opened=waitEvent(allowedSocket,'presentation:state');assert.equal((await emitAck(chairSocket,'presentation:open',{meetingId,documentId})).ok,true);assert.equal((await opened)[0].documentId,documentId);
 const nextPage=waitEvent(allowedSocket,'presentation:state');assert.equal((await emitAck(chairSocket,'presentation:page',{meetingId,pageNumber:2})).ok,true);assert.equal((await nextPage)[0].pageNumber,2);
 const laser=waitEvent(allowedSocket,'presentation:laser');assert.equal((await emitAck(chairSocket,'presentation:laser',{meetingId,x:.4,y:.6})).ok,true);assert.deepEqual((await laser)[0],{meetingId,documentId,x:.4,y:.6});
 const queueNotice=waitEvent(chairSocket,'speech:queue');assert.equal((await emitAck(allowedSocket,'speech:request',meetingId)).ok,true);assert.equal((await queueNotice)[0].queue[0].userId,ids.allowed);
 const speakerNotice=waitEvent(allowedSocket,'presentation:state');assert.equal((await emitAck(chairSocket,'speech:invite',{meetingId,userId:ids.allowed,durationSeconds:60})).ok,true);assert.equal((await speakerNotice)[0].speaker.userId,ids.allowed);
 allowedSocket.disconnect();allowedSocket=socketClient(origin,{extraHeaders:{cookie:allowed.cookie}});await waitEvent(allowedSocket,'connect');const restored=waitEvent(allowedSocket,'presentation:state');assert.equal((await emitAck(allowedSocket,'meeting:join',meetingId)).ok,true);const recovered=(await restored)[0];assert.equal(recovered.documentId,documentId);assert.equal(recovered.pageNumber,2);assert.equal(recovered.speaker.userId,ids.allowed);await subscribe(allowedSocket);
 assert.equal((await emitAck(chairSocket,'speech:finish',meetingId)).ok,true);deniedSocket=socketClient(origin,{extraHeaders:{cookie:denied.cookie}});await waitEvent(deniedSocket,'connect');assert.equal((await emitAck(deniedSocket,'meeting:join',meetingId)).ok,true);const timerQueue=waitEvent(chairSocket,'speech:queue');assert.equal((await emitAck(deniedSocket,'speech:request',meetingId)).ok,true);await timerQueue;const timedSpeaker=waitEvent(deniedSocket,'presentation:state');assert.equal((await emitAck(chairSocket,'speech:invite',{meetingId,userId:ids.denied,durationSeconds:3})).ok,true);assert.equal((await timedSpeaker)[0].speaker.userId,ids.denied);const timerEnd=waitEvent(deniedSocket,'presentation:state',5000);assert.equal((await timerEnd)[0].speaker,null);
 let page=await call(`/documents/${documentId}/pages/1`,allowed);assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-store');assert.match(page.headers.get('content-type'),/image\/webp/);assert.ok((await page.arrayBuffer()).byteLength>100);
 const thumbnail=await call(`/documents/${documentId}/pages/1?thumb=1`,allowed);assert.equal(thumbnail.status,200);assert.equal(thumbnail.headers.get('cache-control'),'no-store');
 assert.equal((await call(`/documents/${documentId}`,denied)).status,404);assert.equal((await call(`/documents/${documentId}/pages/1`,denied)).status,404);assert.equal((await call(`/documents/${documentId}/original`,allowed)).status,404);
 assert.ok(db.prepare("SELECT 1 FROM audit_logs WHERE user_id=? AND action='document_page_viewed' AND details LIKE ?").get(ids.allowed,`%${documentId}%`));
 const note=await call(`/documents/${documentId}/notes/1`,allowed,'PUT',{note:'Ghi chu rieng'});assert.equal(note.status,200);assert.equal((await call(`/documents/${documentId}/notes`,denied)).status,404);
 const deniedNotice=waitEvent(allowedSocket,'document:access_revoked');assert.equal((await call(`/meetings/${meetingId}/end`,chair,'POST',{})).status,200);await deniedNotice;assert.equal((await call(`/documents/${documentId}`,allowed)).status,404);assert.equal((await call(`/documents/${documentId}`,chair)).status,200);assert.equal(chairSocket.connected,true);
 const revokeNotice=waitEvent(chairSocket,'document:access_revoked');assert.equal((await call(`/meetings/${meetingId}/documents/${documentId}/revoke`,secretary,'POST',{})).status,200);await revokeNotice;assert.equal((await call(`/documents/${documentId}`,chair)).status,404);
});
