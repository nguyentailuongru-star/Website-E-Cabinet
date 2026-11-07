const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
process.env.DATA_DIR=path.join(os.tmpdir(),`phonghop-admin-users-${crypto.randomUUID()}`);
const bcrypt=require('bcrypt');
const db=require('../server/db');
const app=require('../server');

test('admin đặt lại mật khẩu và không thể tự khóa chính mình', {timeout:20000}, async t=>{
 const http=require('node:http'),server=http.createServer(app);server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
 const adminId=crypto.randomUUID(),password='Admin-Users-Test-Password-2026';
 db.prepare('INSERT INTO users(id,username,full_name,password_hash,role,must_change_password) VALUES(?,?,?,?,?,0)').run(adminId,'users_admin','Users Admin',await bcrypt.hash(password,4),'admin');
 const base=`http://127.0.0.1:${server.address().port}/api`;
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'users_admin',password})});assert.equal(login.status,200);
 const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
 const call=(url,method='GET',body)=>fetch(base+url,{method,headers:{cookie,'x-csrf-token':session.csrfToken,...(body!==undefined?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});

 const self=await call(`/admin/users/${adminId}`,'PATCH',{active:false});assert.equal(self.status,409);
 const selfRole=await call(`/admin/users/${adminId}`,'PATCH',{role:'delegate'});assert.equal(selfRole.status,409);
 const selfName=await call(`/admin/users/${adminId}`,'PATCH',{fullName:'Users Admin 2',role:'admin'});assert.equal(selfName.status,200);

 const created=await (await call('/admin/users','POST',{username:'reset_me',fullName:'Reset Me',role:'delegate'})).json();
 db.prepare("UPDATE users SET must_change_password=0,locked_until=? WHERE id=?").run(new Date(Date.now()+600000).toISOString(),created.id);
 const reset=await call(`/admin/users/${created.id}/reset-password`,'POST',{});assert.equal(reset.status,200);
 const r=await reset.json();assert.equal(r.username,'reset_me');assert.ok(r.password.length>=12);assert.notEqual(r.password,created.password);
 const row=db.prepare('SELECT must_change_password,locked_until FROM users WHERE id=?').get(created.id);assert.equal(row.must_change_password,1);assert.equal(row.locked_until,null);
 const relog=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'reset_me',password:r.password})});assert.equal(relog.status,200);

 const list=await (await call('/admin/users')).json();const me=list.find(u=>u.id===adminId);assert.ok(me.lastLoginAt);assert.ok('lockedUntil' in me);
 assert.equal((await call('/admin/users/missing/reset-password','POST',{})).status,404);
});
