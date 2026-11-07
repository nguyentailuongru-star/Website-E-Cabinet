const path=require('node:path');
const db=require('../server/db');
const {runBackup,pruneBackups}=require('../server/services/backup');
const data=path.resolve(process.env.DATA_DIR||'data');
const out=path.resolve(process.env.BACKUP_DIR||'backups');
const keep=Number(process.env.BACKUP_KEEP)||0;
runBackup(db,{dataDir:data,outDir:out})
 .then(archive=>{console.log(`Đã tạo bản sao lưu: ${archive}`);const removed=pruneBackups(out,keep);if(removed.length)console.log(`Đã xóa ${removed.length} bản cũ (giữ ${keep}).`);})
 .catch(e=>{console.error(e.message);process.exitCode=1;})
 .finally(()=>db.close());
