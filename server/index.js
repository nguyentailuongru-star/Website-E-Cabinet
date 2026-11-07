// Threadpool của libuv (mặc định 4 luồng) là nơi sharp/bcrypt chạy; đặt theo số nhân vật lý ước lượng.
process.env.UV_THREADPOOL_SIZE ||= String(Math.min(32, Math.max(4, Math.ceil(require('node:os').cpus().length / 2))));
const express = require('express');
const http = require('node:http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const auth = require('./auth');
const meetingRoutes = require('./routes/meetings');
const { attachRealtime } = require('./realtime');

const cspDirectives=helmet.contentSecurityPolicy.getDefaultDirectives();cspDirectives['connect-src']=["'self'",'ws:','wss:'];
const app=express(); app.disable('x-powered-by'); app.use(helmet({contentSecurityPolicy:{directives:cspDirectives}})); app.use(express.json({limit:'1mb'})); app.use(auth.session);
const apiLimit=Math.max(60,Math.min(100000,Number(process.env.API_REQUESTS_PER_MINUTE)||600));app.use('/api',rateLimit({windowMs:60*1000,limit:apiLimit,standardHeaders:true,legacyHeaders:false,message:{error:'Bạn thao tác quá nhanh. Vui lòng thử lại sau.'}}));
const loginLimit=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false,message:{error:'Bạn thao tác quá nhanh. Vui lòng thử lại sau.'}});
function audit(req,action,details={}){db.prepare('INSERT INTO audit_logs(user_id,username,action,details,ip_address) VALUES(?,?,?,?,?)').run(req.user?.id||null,req.user?.username||'',action,JSON.stringify(details),req.ip||'');}
app.get('/api/health',(req,res)=>res.json({status:'ok'}));
app.get('/api/me',(req,res)=>req.user?res.json({user:{id:req.user.id,username:req.user.username,fullName:req.user.full_name,unit:req.user.unit,title:req.user.title,role:req.user.role,mustChangePassword:!!req.user.must_change_password},csrfToken:req.user.csrf_token}):res.status(401).json({error:'Vui lòng đăng nhập.'}));
app.post('/api/auth/login',loginLimit,async(req,res)=>{
 const username=String(req.body?.username||'').trim(), password=String(req.body?.password||'');
 const user=db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(username);
 if(!user||!user.active){audit(req,'login_failed',{username}); return res.status(401).json({error:'Tên đăng nhập hoặc mật khẩu không đúng.'});}
 if(user.locked_until&&Date.parse(user.locked_until)>Date.now())return res.status(423).json({error:'Tài khoản tạm khóa do đăng nhập sai nhiều lần.'});
 if(!await bcrypt.compare(password,user.password_hash)){
   const attempts=user.failed_attempts+1, lock=attempts>=5?new Date(Date.now()+15*60*1000).toISOString():null;
   db.prepare('UPDATE users SET failed_attempts=?,locked_until=? WHERE id=?').run(lock?0:attempts,lock,user.id); audit(req,'login_failed',{username}); return res.status(lock?423:401).json({error:lock?'Tài khoản đã bị khóa 15 phút.':'Tên đăng nhập hoặc mật khẩu không đúng.'});
 }
 db.prepare('UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=?').run(user.id); const csrfToken=auth.setSession(user,req,res); req.user=user; audit(req,'login'); res.json({user:{id:user.id,username:user.username,fullName:user.full_name,unit:user.unit,title:user.title,role:user.role,mustChangePassword:!!user.must_change_password},csrfToken});
});
app.post('/api/auth/logout',auth.requireAuth,auth.csrf,(req,res)=>{audit(req,'logout');db.prepare('DELETE FROM sessions WHERE id=?').run(req.sessionToken);req.app.get('io')?.in(`user:${req.user.id}`).disconnectSockets(true);res.clearCookie(auth.COOKIE);res.json({ok:true});});
app.post('/api/auth/password',auth.requireAuth,auth.csrf,async(req,res)=>{const p=String(req.body?.password||'');if(p.length<12)return res.status(400).json({error:'Mật khẩu phải có ít nhất 12 ký tự.'});db.prepare('UPDATE users SET password_hash=?,must_change_password=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(await bcrypt.hash(p,12),req.user.id);audit(req,'password_changed');res.json({ok:true});});
app.get('/api/admin/users',auth.requireRole('admin'),(req,res)=>res.json(db.prepare("SELECT u.id,u.username,u.full_name AS fullName,u.unit,u.title,u.role,u.active,u.must_change_password AS mustChangePassword,u.locked_until AS lockedUntil,u.created_at AS createdAt,(SELECT MAX(a.created_at) FROM audit_logs a WHERE a.user_id=u.id AND a.action='login') AS lastLoginAt FROM users u ORDER BY u.full_name").all()));
app.post('/api/admin/users',auth.requireRole('admin'),auth.csrf,async(req,res)=>{
 const {username,fullName,unit='',title='',role='delegate'}=req.body||{}; if(!username||!fullName||!auth.ROLES.includes(role))return res.status(400).json({error:'Thông tin tài khoản không hợp lệ.'});
 const password=crypto.randomBytes(12).toString('base64url'); try{const id=crypto.randomUUID();db.prepare('INSERT INTO users(id,username,full_name,unit,title,password_hash,role) VALUES(?,?,?,?,?,?,?)').run(id,String(username).trim(),String(fullName).trim(),String(unit),String(title),await bcrypt.hash(password,12),role);audit(req,'user_created',{username,role});res.status(201).json({id,username,password});}catch(e){if(e.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({error:'Tên đăng nhập đã tồn tại.'});throw e;}
});
app.patch('/api/admin/users/:id',auth.requireRole('admin'),auth.csrf,(req,res)=>{const {active,role,fullName,unit,title}=req.body||{};if(role!==undefined&&!auth.ROLES.includes(role))return res.status(400).json({error:'Vai trò không hợp lệ.'});const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);if(!u)return res.status(404).json({error:'Không tìm thấy tài khoản.'});if(u.id===req.user.id&&(active===false||(role!==undefined&&role!==u.role)))return res.status(409).json({error:'Không thể tự khóa hoặc tự thay đổi vai trò của chính mình.'});db.prepare('UPDATE users SET active=COALESCE(?,active),role=COALESCE(?,role),full_name=COALESCE(?,full_name),unit=COALESCE(?,unit),title=COALESCE(?,title),updated_at=CURRENT_TIMESTAMP WHERE id=?').run(active===undefined?null:active?1:0,role||null,fullName||null,unit===undefined?null:unit,title===undefined?null:title,u.id);if(active===false||(role!==undefined&&role!==u.role)){db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);req.app.get('io')?.in(`user:${u.id}`).disconnectSockets(true);}audit(req,'user_updated',{username:u.username});res.json({ok:true});});
app.post('/api/admin/users/:id/reset-password',auth.requireRole('admin'),auth.csrf,async(req,res)=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);if(!u)return res.status(404).json({error:'Không tìm thấy tài khoản.'});const password=crypto.randomBytes(12).toString('base64url');db.prepare('UPDATE users SET password_hash=?,must_change_password=1,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(await bcrypt.hash(password,12),u.id);if(u.id!==req.user.id){db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);req.app.get('io')?.in(`user:${u.id}`).disconnectSockets(true);}audit(req,'user_password_reset',{username:u.username});res.json({username:u.username,password});});
app.post('/api/admin/users/import-csv',auth.requireRole('admin'),auth.csrf,async(req,res)=>{
 const csv=String(req.body?.csv||'');if(csv.length>2_000_000)return res.status(413).json({error:'Tệp CSV vượt quá dung lượng cho phép.'});const rows=parseCsv(csv);if(!rows.length)return res.status(400).json({error:'CSV không có dữ liệu.'});const headers=rows.shift().map(x=>x.trim().toLowerCase());const idx=['full_name','unit','title','username'].map(k=>headers.indexOf(k));if(idx.some(x=>x<0))return res.status(400).json({error:'CSV cần các cột: full_name,unit,title,username.'});
 const insert=db.prepare('INSERT INTO users(id,username,full_name,unit,title,password_hash,role) VALUES(?,?,?,?,?,?,?)'), created=[];const tx=db.transaction(items=>{for(const r of items){const vals=idx.map(i=>r[i]||'');if(!vals[0]||!vals[3])continue;const password=crypto.randomBytes(12).toString('base64url'),id=crypto.randomUUID();insert.run(id,vals[3],vals[0],vals[1],vals[2],bcrypt.hashSync(password,12),'delegate');created.push({username:vals[3],password});}});try{tx(rows);}catch(e){return res.status(409).json({error:'Có tên đăng nhập trùng hoặc dòng CSV không hợp lệ; chưa nhập tài khoản nào.'});}audit(req,'users_imported',{count:created.length});res.json({created});
});
app.get('/api/admin/audit',auth.requireRole('admin'),(req,res)=>{const limit=Math.min(Math.max(Number(req.query.limit)||100,1),500);res.json(db.prepare('SELECT id,username,action,details,ip_address AS ipAddress,created_at AS createdAt FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit));});
app.use('/api',meetingRoutes);
app.get('/',(req,res)=>res.sendFile(path.resolve('public/index.html'))); app.use('/assets',express.static(path.resolve('public'),{index:false}));
app.use((err,req,res,next)=>{console.error(err);const status=err.name==='MulterError'?413:(err.status||500);const message=status===413?'T\u1ec7p v\u01b0\u1ee3t qu\u00e1 gi\u1edbi h\u1ea1n 50 MB.':(status<500?err.message:'\u0110\u00e3 x\u1ea3y ra l\u1ed7i h\u1ec7 th\u1ed1ng.');res.status(status).json({error:message});});
function parseCsv(input){const out=[];let row=[],cell='',quoted=false;for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'){row.push(cell.replace(/\r$/,''));out.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell.replace(/\r$/,''));out.push(row);}return out;}
const port=Number(process.env.PORT)||3000;
// HTTPS nội bộ: đặt TLS_CERT và TLS_KEY (tạo bằng scripts/create-cert.js). Khi bật TLS, cookie phiên luôn có cờ Secure.
const tls=process.env.TLS_CERT&&process.env.TLS_KEY?{cert:fs.readFileSync(path.resolve(process.env.TLS_CERT)),key:fs.readFileSync(path.resolve(process.env.TLS_KEY))}:null;
if(tls)process.env.COOKIE_SECURE='true';
const server=tls?require('node:https').createServer(tls,app):http.createServer(app);const io=attachRealtime(server,app);
if(require.main===module){
 server.listen(port,'0.0.0.0',()=>console.log(`Phòng họp đang chạy tại ${tls?'https':'http'}://0.0.0.0:${port}`));
 require('./services/backup').scheduleBackups(db,{dataDir:process.env.DATA_DIR||'data',outDir:process.env.BACKUP_DIR||'backups',intervalHours:Number(process.env.BACKUP_INTERVAL_HOURS)||0,keep:Number(process.env.BACKUP_KEEP)||14});
}
module.exports=app; module.exports.attachSockets=(target)=>attachRealtime(target,app);module.exports.io=io;
