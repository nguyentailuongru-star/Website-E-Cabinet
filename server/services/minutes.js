const db=require('../db');
function pollCounts(poll){const table=poll.ballot_type==='secret'?'secret_ballots':'public_votes';return db.prepare(`SELECT option_id AS optionId,COUNT(*) AS count FROM ${table} WHERE poll_id=? GROUP BY option_id`).all(poll.id);}
function compose(meetingId){
 const meeting=db.prepare('SELECT * FROM meetings WHERE id=?').get(meetingId);if(!meeting)return null;
 const participants=db.prepare(`SELECT u.full_name AS fullName,u.unit,p.meeting_role AS role,a.status FROM meeting_participants p JOIN users u ON u.id=p.user_id LEFT JOIN attendance a ON a.meeting_id=p.meeting_id AND a.user_id=p.user_id WHERE p.meeting_id=? ORDER BY p.meeting_role,u.full_name`).all(meetingId);
 const minutes=db.prepare('SELECT body FROM meeting_minutes WHERE meeting_id=?').get(meetingId);
 const polls=db.prepare("SELECT * FROM polls WHERE meeting_id=? AND results_published=1 ORDER BY created_at,id").all(meetingId).map(p=>{const counts=new Map(pollCounts(p).map(x=>[x.optionId,x.count]));return{question:p.question,ballotType:p.ballot_type,options:db.prepare('SELECT id,label FROM poll_options WHERE poll_id=? ORDER BY position,id').all(p.id).map(o=>({...o,count:counts.get(o.id)||0}))};});
 const speakers=db.prepare(`SELECT u.full_name AS fullName,u.unit,h.started_at AS startedAt,h.ended_at AS endedAt,h.duration_seconds AS durationSeconds FROM speech_history h JOIN users u ON u.id=h.user_id WHERE h.meeting_id=? ORDER BY h.started_at,h.id`).all(meetingId);
 const present=participants.filter(p=>p.status==='present').length;
 const lines=[`# ${meeting.title}`,`## Thời gian: ${new Date(meeting.starts_at).toLocaleString('vi-VN')}`,`## Địa điểm: ${meeting.location||'Chưa ghi'}`,'','## Thành phần'];
 for(const p of participants)lines.push(`- ${p.fullName} (${p.role})${p.unit?` · ${p.unit}`:''}`);
 lines.push('','## Điểm danh',`- Có mặt: ${present}/${participants.length}`,`- Vắng có lý do: ${participants.filter(p=>p.status==='absent_excused').length}`,`- Vắng: ${participants.filter(p=>p.status==='absent').length}`,'','## Kết quả biểu quyết');
 if(!polls.length)lines.push('- Chưa có kết quả được công bố.');for(const poll of polls){lines.push(`### ${poll.question} (${poll.ballotType==='secret'?'kín':'công khai'})`);const total=poll.options.reduce((n,o)=>n+o.count,0);for(const option of poll.options)lines.push(`- ${option.label}: ${option.count}${total?` (${(option.count*100/total).toFixed(1)}%)`:''}`);}
 lines.push('','## Đại biểu phát biểu');if(!speakers.length)lines.push('- Chưa có lượt phát biểu.');for(const s of speakers)lines.push(`- ${s.fullName}${s.unit?` · ${s.unit}`:''}: ${s.startedAt}${s.endedAt?` – kết thúc ${s.endedAt}`:''}${s.durationSeconds?` · giới hạn ${s.durationSeconds} giây`:''}`);
 lines.push('','## Nội dung và kết luận thư ký',minutes?.body?.trim()||'[Thư ký chưa nhập nội dung.]');
 return{meeting,body:minutes?.body||'',participants,present,polls,speakers,preview:lines.join('\n')};
}
module.exports={compose};
