const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
process.env.DATA_DIR=path.join(os.tmpdir(),`phonghop-admin-onboard-${crypto.randomUUID()}`);
const bcrypt=require('bcrypt');
const db=require('../server/db');
const app=require('../server');

test('admin có thể tạo chủ trì, thư ký rồi lập cuộc họp', {timeout:15000}, async t=>{
 const http=require('node:http'),server=http.createServer(app);server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();});
 const adminId=crypto.randomUUID(),password='Admin-Onboarding-Test-Password-2026';
 db.prepare('INSERT INTO users(id,username,full_name,password_hash,role,must_change_password) VALUES(?,?,?,?,?,0)').run(adminId,'setup_admin','Setup Admin',await bcrypt.hash(password,4),'admin');
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'setup_admin',password})});assert.equal(login.status,200);const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
 async function call(url,method='GET',body){const headers={cookie,'x-csrf-token':session.csrfToken};if(body!==undefined)headers['content-type']='application/json';return fetch(base+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});}
 const chairResponse=await call('/admin/users','POST',{username:'setup_chair',fullName:'Test Chair',role:'chair'}),secretaryResponse=await call('/admin/users','POST',{username:'setup_secretary',fullName:'Test Secretary',role:'secretary'});assert.equal(chairResponse.status,201);assert.equal(secretaryResponse.status,201);const chair=await chairResponse.json(),secretary=await secretaryResponse.json();assert.ok(chair.password.length>=12);assert.ok(secretary.password.length>=12);
 const created=await call('/meetings','POST',{title:'Admin onboarding test',startsAt:new Date(Date.now()+3600000).toISOString(),chairUserId:chair.id,secretaryUserId:secretary.id,delegateIds:[],screenUserIds:[],agenda:[]});assert.equal(created.status,201,await created.clone().text());
});
