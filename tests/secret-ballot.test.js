const test=require('node:test');
const assert=require('node:assert/strict');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
process.env.DATA_DIR=path.join(os.tmpdir(),`phonghop-secret-${crypto.randomUUID()}`);
const db=require('../server/db');
const secretBallot=require('../server/services/secret-ballot');

function fixture(nVoters){
 const admin=crypto.randomUUID(),meeting=crypto.randomUUID(),poll=crypto.randomUUID(),opts=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
 db.prepare("INSERT INTO users(id,username,full_name,password_hash,role) VALUES(?,?,?,?,'admin')").run(admin,'a'+admin.slice(0,8),'Admin','x');
 db.prepare('INSERT INTO meetings(id,title,starts_at,created_by) VALUES(?,?,?,?)').run(meeting,'M',new Date().toISOString(),admin);
 db.prepare("INSERT INTO polls(id,meeting_id,created_by,question,ballot_type,status) VALUES(?,?,?,?,'secret','open')").run(poll,meeting,admin,'Q?');
 opts.forEach((o,i)=>db.prepare('INSERT INTO poll_options(id,poll_id,label,position) VALUES(?,?,?,?)').run(o,poll,'O'+i,i));
 const voters=Array.from({length:nVoters},(_,i)=>{const id=crypto.randomUUID();db.prepare("INSERT INTO users(id,username,full_name,password_hash,role) VALUES(?,?,?,?,'delegate')").run(id,'v'+id.slice(0,12),'V'+i,'x');return id;});
 return {poll,opts,voters};
}
test.after(()=>db.close());

test('phiếu kín chỉ được niêm phong khi đóng, kiểm phiếu chính xác', ()=>{
 const {poll,opts,voters}=fixture(30);
 const expected=new Map();
 voters.forEach((v,i)=>{const o=opts[i%3===0?0:i%3];secretBallot.cast(poll,v,o);expected.set(o,(expected.get(o)||0)+1);});
 assert.throws(()=>secretBallot.cast(poll,voters[0],opts[1]),e=>e.code.startsWith('SQLITE_CONSTRAINT'));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secret_ballots WHERE poll_id=?').get(poll).n,0);
 const r=db.transaction(()=>{db.prepare("UPDATE polls SET status='closed' WHERE id=?").run(poll);return secretBallot.seal(poll);})();secretBallot.forget(poll);
 assert.deepEqual(r,{sealed:30,ledger:30});
 const counts=new Map(db.prepare('SELECT option_id AS o,COUNT(*) AS n FROM secret_ballots WHERE poll_id=? GROUP BY option_id').all(poll).map(x=>[x.o,x.n]));
 assert.deepEqual(counts,expected);
 assert.equal(secretBallot._tallies.has(poll),false);
});

test('khởi động lại khi biểu quyết kín đang mở: đặt lại ledger để bỏ phiếu lại', ()=>{
 const {poll,opts,voters}=fixture(5);
 for(const v of voters)secretBallot.cast(poll,v,opts[0]);
 secretBallot._tallies.clear(); // mô phỏng tiến trình dừng: bộ đếm trong RAM mất
 const reset=secretBallot.resetOpenPollsAfterRestart();
 assert.deepEqual(reset.find(x=>x.pollId===poll),{pollId:poll,voters:5});
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM secret_vote_ledger WHERE poll_id=?').get(poll).n,0);
 assert.match(db.prepare("SELECT details FROM audit_logs WHERE action='secret_poll_reset' ORDER BY id DESC LIMIT 1").get().details,new RegExp(poll));
 secretBallot.cast(poll,voters[0],opts[1]); // bỏ phiếu lại được
});
