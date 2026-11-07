const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
process.env.DATA_DIR=path.join(os.tmpdir(),`phonghop-voting-${crypto.randomUUID()}`);
const bcrypt=require('bcrypt');
const db=require('../server/db');
const app=require('../server');

test('GĐ4: phiếu kín, công bố kết quả, biên bản PDF/DOCX', {timeout:30000}, async t=>{
 const http=require('node:http'),ids={secretary:crypto.randomUUID(),chair:crypto.randomUUID(),delegate:crypto.randomUUID()},suffix=crypto.randomUUID();
 const server=http.createServer(app);server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.prepare('DELETE FROM users WHERE id IN (?,?,?)').run(...Object.values(ids));});
 const hash=await bcrypt.hash('Long-Temporary-Test-Password-2026',4),insert=db.prepare('INSERT INTO users(id,username,full_name,unit,password_hash,role,must_change_password) VALUES(?,?,?,?,?,?,0)');
 for(const [role,id] of Object.entries(ids))insert.run(id,`vote_${role}_${suffix}`,role,'Unit',hash,role==='delegate'?'delegate':role);
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function login(role){const r=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:`vote_${role}_${suffix}`,password:'Long-Temporary-Test-Password-2026'})});assert.equal(r.status,200);const d=await r.json();return{cookie:r.headers.get('set-cookie').split(';')[0],csrf:d.csrfToken};}
 const chair=await login('chair'),secretary=await login('secretary'),delegate=await login('delegate');
 async function call(path,s,method='GET',body){const headers={cookie:s.cookie,'x-csrf-token':s.csrf};if(body!==undefined)headers['content-type']='application/json';return fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});}
 const created=await call('/meetings',secretary,'POST',{title:'Test minutes',startsAt:new Date(Date.now()+60000).toISOString(),location:'Room',chairUserId:ids.chair,secretaryUserId:ids.secretary,delegateIds:[ids.delegate],agenda:[]});assert.equal(created.status,201);const meetingId=(await created.json()).id;
 const createdPoll=await call(`/meetings/${meetingId}/polls`,chair,'POST',{question:'Secret choice?',ballotType:'secret',options:['Yes','No']});assert.equal(createdPoll.status,201);const pollId=(await createdPoll.json()).id;
 const options=(await(await call(`/meetings/${meetingId}/polls`,delegate)).json())[0].options;
 assert.equal((await call(`/polls/${pollId}/open`,chair,'POST',{})).status,200);
 const concurrent=await Promise.all([call(`/polls/${pollId}/vote`,delegate,'POST',{optionId:options[0].id}),call(`/polls/${pollId}/vote`,delegate,'POST',{optionId:options[1].id})]);
 assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]);
 assert.deepEqual(db.prepare('PRAGMA table_info(secret_ballots)').all().map(x=>x.name).sort(),['id','option_id','poll_id']);
 const audit=db.prepare("SELECT details FROM audit_logs WHERE action='secret_vote_cast' ORDER BY rowid DESC LIMIT 1").get();assert.equal(JSON.parse(audit.details).optionId,undefined);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secret_ballots WHERE poll_id=?').get(pollId).n,0,'phiếu kín không được ghi xuống đĩa khi biểu quyết còn mở');
 assert.equal((await call(`/polls/${pollId}/results`,delegate)).status,409);
 assert.equal((await call(`/polls/${pollId}/close`,chair,'POST',{})).status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secret_ballots WHERE poll_id=?').get(pollId).n,1);assert.equal((await call(`/polls/${pollId}/publish`,chair,'POST',{})).status,200);
 assert.equal((await call(`/meetings/${meetingId}/minutes`,secretary,'PUT',{body:'Kết luận cuộc họp.'})).status,200);
 const pdf=await call(`/meetings/${meetingId}/minutes/export.pdf`,delegate);assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.ok((await pdf.arrayBuffer()).byteLength>500);
 const docx=await call(`/meetings/${meetingId}/minutes/export.docx`,delegate);assert.equal(docx.status,200);const bytes=Buffer.from(await docx.arrayBuffer());assert.equal(bytes.readUInt32LE(0),0x04034b50);assert.ok(bytes.includes(Buffer.from('word/document.xml')));
 db.prepare('DELETE FROM meetings WHERE id=?').run(meetingId);
});
