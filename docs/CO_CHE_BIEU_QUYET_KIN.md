# Cơ chế biểu quyết kín

## Thiết kế: tách ghi danh và lá phiếu theo thời gian ("niêm phong khi đóng")

Mã nguồn: [server/services/secret-ballot.js](../server/services/secret-ballot.js).

1. **Khi đại biểu bỏ phiếu**, máy chủ chỉ ghi `(poll_id, user_id)` vào `secret_vote_ledger`. Khóa chính ghép chặn bỏ phiếu hai lần, kể cả khi hai request đến song song: request sau nhận 409. Phương án được cộng vào **bộ đếm tổng hợp trong bộ nhớ**, `Map<optionId, count>`. Bộ đếm không chứa định danh và không giữ thứ tự từng phiếu. Nhật ký audit chỉ ghi `pollId` và `submitted: true`.
2. **Khi chủ trì đóng biểu quyết**, máy chủ sinh toàn bộ lá phiếu từ bộ đếm và xáo trộn chúng bằng CSPRNG (`crypto.randomInt`). Sau đó máy chủ ghi các lá phiếu vào `secret_ballots` trong **cùng một transaction** với lệnh đổi trạng thái. Bảng `secret_ballots` (`WITHOUT ROWID`, khóa là UUID ngẫu nhiên) không có `user_id`, thời điểm hay thứ tự chèn. Nếu số phiếu niêm phong khác số người đã ghi danh, hệ thống ghi audit `secret_ballot_mismatch`.
3. Kết quả chỉ được trả sau khi chủ trì đóng và công bố.

**Bất biến:** một biểu quyết kín đang mở không có lá phiếu nào trên đĩa.

## Điểm yếu của thiết kế cũ đã được khắc phục

Thiết kế cũ ghi ledger và ballot trong cùng một transaction, ngay tại thời điểm bỏ phiếu. Dù bảng ballot không có `user_id`, mỗi transaction để lại trong WAL hoặc journal của SQLite một cặp trang thay đổi: một người mới và một phiếu mới. Người có bản sao tệp cơ sở dữ liệu vì vậy ghép được "ai" với "chọn gì".

Thí nghiệm [bench/secret-linkage.js](../bench/secret-linkage.js) mô phỏng kẻ tấn công đọc WAL. Thí nghiệm tắt checkpoint tự động để WAL giữ mọi frame, là kịch bản xấu nhất. Kết quả với 50 cử tri và 5 lượt:

| Thiết kế | Liên kết chắc chắn | Độ chính xác của kẻ tấn công | Đoán theo đa số |
|---|---:|---:|---:|
| Cũ: ghi phiếu khi bỏ phiếu | 94,8% | 98,0% ± 1,4% | 50,0% |
| Mới: niêm phong khi đóng | 0% | 53,2% ± 8,7% | 53,2% |

Với thiết kế mới, kẻ tấn công không làm tốt hơn việc luôn đoán phương án đa số. Mọi lá phiếu xuất hiện trong một transaction duy nhất, nên tập ẩn danh là toàn bộ người đã bỏ phiếu.

## Đánh đổi và giới hạn

- **Khởi động lại khi biểu quyết đang mở:** bộ đếm trong bộ nhớ bị mất. Khi khởi động, máy chủ xóa ledger của các biểu quyết kín đang mở để đại biểu bỏ phiếu lại, và ghi audit `secret_poll_reset`. Thao tác này đổi một ít tính sẵn sàng lấy tính bí mật. Không nên khởi động lại máy chủ khi đang biểu quyết.
- **Ngoài phạm vi bảo vệ:**
  - kẻ tấn công đọc được bộ nhớ tiến trình trong lúc bỏ phiếu, vì có thể quan sát bộ đếm thay đổi theo thời gian;
  - kẻ tấn công quan sát lưu lượng mạng theo thời gian thực khi không dùng HTTPS;
  - kẻ tấn công sửa mã nguồn máy chủ;
  - log hoặc proxy bên ngoài hệ thống.
- **Kết quả theo nhóm nhỏ:** nếu tất cả cử tri chọn cùng một phương án, kết quả tự nó tiết lộ lựa chọn của từng người. Đây là giới hạn chung của mọi hình thức kiểm phiếu.
- Hệ thống không cung cấp khả năng kiểm chứng đầu-cuối (end-to-end verifiability). Cử tri không tự kiểm tra được lá phiếu của mình đã được đếm.
- **Không dùng tính năng này cho bầu cử nhân sự trong Đảng** hoặc cho quy trình cần kiểm chứng độc lập.

## Lưu ý vận hành

Tệp cơ sở dữ liệu (`data/*.sqlite`, `*-wal`, `*-shm`) và tài liệu họp không được đưa vào git. Các bản WAL đã commit trước khi sửa vẫn còn trong lịch sử git và có thể chứa phiếu kín ghi theo thiết kế cũ. Nếu repo đã được chia sẻ, cần xóa chúng khỏi lịch sử, ví dụ bằng `git filter-repo`.
