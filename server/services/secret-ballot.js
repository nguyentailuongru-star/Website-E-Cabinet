'use strict';
/*
 * Biểu quyết kín — tách ghi danh khỏi lá phiếu theo thời gian ("niêm phong khi đóng").
 *
 * Vấn đề của cách cũ: ledger (poll, user) và ballot (poll, option) được ghi trong
 * CÙNG một transaction tại thời điểm bỏ phiếu. Dù bảng ballot không có user_id,
 * thứ tự commit trong WAL/journal của SQLite, thời điểm ghi trang và nhật ký audit
 * vẫn cho phép ghép "ai" với "chọn gì".
 *
 * Cách mới:
 *  1. Khi bỏ phiếu: chỉ ghi ledger xuống đĩa (để chặn bỏ phiếu hai lần, bền vững).
 *     Phương án được cộng vào bộ đếm tổng hợp trong RAM: Map<optionId, count>.
 *     Bộ đếm không chứa định danh, không giữ thứ tự từng phiếu.
 *  2. Khi đóng biểu quyết: sinh toàn bộ lá phiếu từ bộ đếm, xáo trộn bằng CSPRNG,
 *     ghi trong MỘT transaction cùng lệnh đổi trạng thái. Tập ẩn danh = mọi người
 *     đã bỏ phiếu; trên đĩa không còn quan hệ thời gian giữa ledger và ballot.
 *  3. Bất biến: biểu quyết kín đang mở không có ballot nào trên đĩa. Nếu tiến trình
 *     dừng khi biểu quyết đang mở, bộ đếm trong RAM mất; khi khởi động lại, ledger
 *     của các biểu quyết đang mở được xóa để đại biểu bỏ phiếu lại (ghi audit).
 *
 * Ngoài phạm vi: kẻ tấn công đọc được bộ nhớ tiến trình trong lúc bỏ phiếu,
 * quan sát lưu lượng mạng theo thời gian thực, hoặc sửa mã nguồn máy chủ.
 */
const crypto = require('node:crypto');
const db = require('../db');

const tallies = new Map(); // pollId -> Map<optionId, count>

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ghi danh và cộng phiếu. Ném lỗi SQLITE_CONSTRAINT nếu người dùng đã bỏ phiếu. */
function cast(pollId, userId, optionId) {
  db.prepare('INSERT INTO secret_vote_ledger(poll_id,user_id) VALUES(?,?)').run(pollId, userId);
  let t = tallies.get(pollId);
  if (!t) { t = new Map(); tallies.set(pollId, t); }
  t.set(optionId, (t.get(optionId) || 0) + 1);
}

/** Gọi BÊN TRONG transaction đóng biểu quyết. Trả về số phiếu niêm phong và số người đã ghi danh. */
function seal(pollId) {
  const t = tallies.get(pollId) || new Map();
  const ballots = shuffle([...t].flatMap(([optionId, count]) => Array(count).fill(optionId)));
  const insert = db.prepare('INSERT INTO secret_ballots(id,poll_id,option_id) VALUES(?,?,?)');
  for (const optionId of ballots) insert.run(crypto.randomUUID(), pollId, optionId);
  const ledger = db.prepare('SELECT COUNT(*) AS n FROM secret_vote_ledger WHERE poll_id=?').get(pollId).n;
  return { sealed: ballots.length, ledger };
}

/** Gọi SAU khi transaction đóng biểu quyết commit thành công. */
function forget(pollId) { tallies.delete(pollId); }

/** Khôi phục bất biến sau khi khởi động: biểu quyết kín đang mở không có ballot và chưa ai ghi danh. */
function resetOpenPollsAfterRestart() {
  const open = db.prepare("SELECT id FROM polls WHERE status='open' AND ballot_type='secret'").all();
  if (!open.length) return [];
  const delLedger = db.prepare('DELETE FROM secret_vote_ledger WHERE poll_id=?');
  const delBallots = db.prepare('DELETE FROM secret_ballots WHERE poll_id=?');
  const log = db.prepare("INSERT INTO audit_logs(user_id,username,action,details,ip_address) VALUES(NULL,'system','secret_poll_reset',?,'')");
  const reset = [];
  db.transaction(() => {
    for (const { id } of open) {
      const voters = delLedger.run(id).changes;
      delBallots.run(id);
      if (voters) { reset.push({ pollId: id, voters }); log.run(JSON.stringify({ pollId: id, voters, reason: 'server_restart' })); }
    }
  })();
  return reset;
}

module.exports = { cast, seal, forget, resetOpenPollsAfterRestart, _tallies: tallies };
