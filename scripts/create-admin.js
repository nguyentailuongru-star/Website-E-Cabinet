const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const db = require('../server/db');

(async()=>{
  const username=process.env.ADMIN_USERNAME, password=process.env.ADMIN_PASSWORD, fullName=process.env.ADMIN_FULL_NAME||'Quản trị viên hệ thống';
  if(!username||!password||password.length<12){console.error('Đặt ADMIN_USERNAME và ADMIN_PASSWORD (ít nhất 12 ký tự) trước khi chạy.');process.exitCode=1;return;}
  const exists=db.prepare('SELECT 1 FROM users WHERE username=?').get(username);
  if(exists){console.error('Tên đăng nhập đã tồn tại.');process.exitCode=1;return;}
  db.prepare("INSERT INTO users(id,username,full_name,password_hash,role,must_change_password) VALUES(?,?,?,?, 'admin',0)").run(crypto.randomUUID(),username,fullName,await bcrypt.hash(password,12));
  console.log('Đã tạo tài khoản quản trị viên.');
})().catch(err=>{console.error(err.message);process.exitCode=1;});
