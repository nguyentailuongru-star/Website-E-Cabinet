const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const dir=path.join(os.tmpdir(),`phonghop-backup-${crypto.randomUUID()}`);
process.env.DATA_DIR=path.join(dir,'data');
const db=require('../server/db');
const {runBackup,pruneBackups}=require('../server/services/backup');

test('sao lưu tạo tệp .tar.gz và chỉ giữ số bản cấu hình', {timeout:30000}, async t=>{
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
 fs.mkdirSync(path.join(process.env.DATA_DIR,'meetings','m1'),{recursive:true});fs.writeFileSync(path.join(process.env.DATA_DIR,'meetings','m1','a.txt'),'x');
 const out=path.join(dir,'bk');
 for(let i=0;i<3;i++){const a=await runBackup(db,{dataDir:process.env.DATA_DIR,outDir:out});assert.ok(fs.statSync(a).size>0);await new Promise(r=>setTimeout(r,5));}
 assert.equal(pruneBackups(out,2).length,1);
 assert.equal(fs.readdirSync(out).filter(f=>f.endsWith('.tar.gz')).length,2);
 assert.equal(fs.readdirSync(out).some(f=>f.startsWith('.phonghop-stage')),false);
});
