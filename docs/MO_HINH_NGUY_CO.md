# Mô hình nguy cơ tài liệu

| Đường rò rỉ | Biện pháp hiện có | Giới hạn |
|---|---|---|
| Tải file gốc | API đại biểu chỉ trả ảnh trang; file gốc ở ngoài web root | Quản trị máy chủ có thể đọc thư mục dữ liệu |
| Gõ URL ảnh khi không có quyền | ACL kiểm tra trên từng request | Phiên hợp lệ bị chiếm dụng vẫn có quyền của tài khoản đó |
| Tài liệu hạn chế còn sau họp | ACL tự ngừng cho đại biểu/màn chiếu khi họp kết thúc | Thư ký/chủ trì tiếp tục được xem; bản sao lưu vẫn chứa dữ liệu |
| Thu hồi trong lúc đang xem | Socket.IO đóng tài liệu, request tiếp theo bị từ chối | Ảnh đã nhận hoặc chụp lại không thể thu hồi |
| Chụp màn hình / chụp thiết bị khác | Watermark người xem và audit hỗ trợ truy vết | Không thể ngăn chụp màn hình hay chụp bằng camera |
| Cache trình duyệt/proxy | Ảnh trang gửi `Cache-Control: no-store` | Không xóa được bản người dùng đã lưu thủ công |
| Nghe lén mạng | Triển khai nên dùng HTTPS nội bộ | Bản phát triển mặc định HTTP; chưa có chứng thư tự ký đóng gói |
| Truy cập trái quyền | Phiên, CSRF, ACL, giới hạn tần suất, audit | Cần kiểm thử cấu hình máy chủ và cập nhật dependency khi triển khai |
| Sao lưu bị lộ | Bản sao lưu lưu thành archive riêng | Người vận hành phải bảo vệ quyền truy cập và lưu trữ archive |

Watermark và audit là biện pháp truy vết, không phải DRM. Không đưa máy chủ vào mạng có đường ra Internet nếu chính sách đơn vị cấm; ứng dụng không cần dịch vụ đám mây.
