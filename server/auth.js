const crypto = require('node:crypto');
const db = require('./db');
const SESSION_MS = 30 * 60 * 1000;
const COOKIE = 'phonghop_session';
const ROLES = ['admin', 'chair', 'secretary', 'delegate', 'screen'];
const parseCookies = (header = '') => Object.fromEntries(header.split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const i=part.indexOf('=');try{return [part.slice(0,i),decodeURIComponent(part.slice(i+1))];}catch{return [part.slice(0,i),''];}}).filter(([k])=>k));
function getSession(token){if(!token)return null;const row=db.prepare(`SELECT s.*,u.id AS id,u.username,u.full_name,u.unit,u.title,u.role,u.active,u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?`).get(token);return row&&row.active&&Date.parse(row.expires_at)>Date.now()?row:null;}

function session(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return next();
  const row = getSession(token);
  if (!row) {
    if (token) db.prepare('DELETE FROM sessions WHERE id=?').run(token);
    res.clearCookie(COOKIE); return next();
  }
  req.user = row; req.sessionToken = token;
  db.prepare('UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP, expires_at=? WHERE id=?').run(new Date(Date.now()+SESSION_MS).toISOString(), token);
  next();
}
function requireAuth(req,res,next){ if(!req.user) return res.status(401).json({error:'Vui lòng đăng nhập.'}); next(); }
function requireRole(...roles){ return (req,res,next)=> { if(!req.user) return res.status(401).json({error:'Vui lòng đăng nhập.'}); if(!roles.includes(req.user.role)) return res.status(403).json({error:'Bạn không có quyền thực hiện thao tác này.'}); next(); }; }
function csrf(req,res,next){ if(['GET','HEAD','OPTIONS'].includes(req.method)) return next(); if(!req.user || req.get('x-csrf-token') !== req.user.csrf_token) return res.status(403).json({error:'Mã bảo vệ không hợp lệ.'}); next(); }
function setSession(user,req,res){ const id=crypto.randomBytes(32).toString('hex'), csrfToken=crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO sessions(id,user_id,csrf_token,expires_at) VALUES(?,?,?,?)').run(id,user.id,csrfToken,new Date(Date.now()+SESSION_MS).toISOString()); res.cookie(COOKIE,id,{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',maxAge:SESSION_MS,path:'/'}); return csrfToken; }
module.exports={session,requireAuth,requireRole,csrf,setSession,getSession,parseCookies,ROLES,COOKIE};
