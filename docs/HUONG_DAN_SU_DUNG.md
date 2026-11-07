# Hướng dẫn sử dụng

## Quản trị viên

Tạo tài khoản, phân vai trò, nhập danh sách CSV và xem nhật ký từ trang quản trị. Cấp mật khẩu ban đầu qua kênh nội bộ và yêu cầu người dùng đổi mật khẩu khi đăng nhập lần đầu.

## Thư ký

Tạo cuộc họp, chọn chủ trì/thư ký/đại biểu/màn chiếu, nhập chương trình. Trong cuộc họp, tải tài liệu, gán mức độ và thành viên được xem; cập nhật điểm danh; nhập kết luận trong phần biên bản, lưu rồi xuất PDF hoặc DOCX.

## Chủ trì

Mở cuộc họp, chọn tài liệu để trình chiếu, lật trang, điều khiển laser và mời người phát biểu. Tạo biểu quyết, mở và đóng phiếu, sau đó công bố kết quả. Biểu quyết chỉ dành cho nội dung thông thường, không dùng cho bầu cử nhân sự trong Đảng.

## Đại biểu

Mở cuộc họp được mời, điểm danh tự động, xem tài liệu được cấp quyền, ghi chú cá nhân, đăng ký phát biểu và bỏ một phiếu khi biểu quyết mở. Phiếu kín không hiện lựa chọn của từng người.

## Màn chiếu

Đăng nhập bằng tài khoản có vai trò màn chiếu và mở cuộc họp. Thiết bị chỉ hiển thị trạng thái trình chiếu, không có quyền điều khiển hoặc bỏ phiếu.

## Khởi chạy và dữ liệu

Trên máy đã cài dependencies, chạy `npm start`; mặc định truy cập cổng 3000 trong LAN. Tạo quản trị viên đầu tiên bằng `npm run create-admin`. Đặt `DATA_DIR` để chọn nơi lưu SQLite và tài liệu. Dùng `node scripts/backup.js` để tạo archive sao lưu; hãy lưu archive tại nơi được bảo vệ.

Ảnh giao diện mẫu chưa được chụp; hướng dẫn này mô tả các luồng thao tác bằng văn bản.
