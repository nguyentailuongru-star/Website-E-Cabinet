# Cơ chế biểu quyết kín

Khi một thành viên gửi phiếu kín, trong cùng transaction máy chủ ghi `(poll_id, user_id)` vào `secret_vote_ledger` để chặn bỏ lần hai, đồng thời ghi một ballot với mã ngẫu nhiên, `poll_id` và `option_id`. Bảng ballot không có `user_id`, thời điểm hay khóa liên kết tới ledger. Nhật ký audit chỉ ghi `pollId` và `submitted: true`, không ghi phương án.

Transaction đảm bảo không phát sinh trạng thái chỉ có ledger hoặc chỉ có ballot. Khóa chính ghép `(poll_id,user_id)` ngăn hai request song song của cùng người; request sau nhận 409. Kết quả chỉ được trả sau khi chủ trì đóng và công bố.

Cơ chế giảm khả năng liên kết bằng dữ liệu ứng dụng, không bảo đảm ẩn danh trước quản trị viên có quyền truy cập toàn bộ máy chủ, bản sao bộ nhớ, log ngoài hệ thống hoặc quan sát thời gian mạng. Không dùng tính năng này cho bầu cử nhân sự trong Đảng hoặc quy trình cần kiểm chứng độc lập.
