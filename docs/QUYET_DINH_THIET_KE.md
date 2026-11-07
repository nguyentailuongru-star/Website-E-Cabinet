# Quyết định thiết kế

- Triển khai tuần tự theo các giai đoạn trong prompt. GĐ1 cung cấp đăng nhập, tài khoản và nhật ký; GĐ2 thêm cuộc họp, điểm danh và tài liệu.
- Vai trò toàn hệ thống gồm năm nhóm. Trong từng cuộc họp, tài khoản được gán vai trò chủ trì, thư ký, đại biểu hoặc màn chiếu; một người chỉ có một vai trò trong cùng cuộc họp.
- SQLite dùng migration có phiên bản; tệp gốc và ảnh trang nằm dưới `DATA_DIR/meetings`, tách khỏi thư mục web công khai.
- Máy chủ dùng PDF.js và canvas cục bộ để dựng PDF thành WebP. Tệp Office chỉ được chuyển khi LibreOffice có trên PATH; nếu thiếu, máy chủ từ chối và yêu cầu PDF.
- Chỉ phân phối ảnh trang đã đóng watermark. Endpoint trang không trả tệp gốc, kiểm tra ACL trên mỗi yêu cầu, đặt `Cache-Control: no-store` và ghi nhật ký kể cả khi xem ảnh thu nhỏ.
- Quyền tài liệu Hạn chế hết với đại biểu/màn chiếu khi chủ trì kết thúc cuộc họp. Chủ trì và thư ký giữ quyền; thu hồi thủ công của thư ký áp dụng cho tất cả.
- Watermark được tạo phía máy chủ, lặp chéo với tên, đơn vị và thời điểm. Ảnh đã watermark cache theo tài liệu, trang và người xem, làm mới tối đa sau một giây để timestamp còn mới.
- Socket.IO chỉ xác thực bằng phiên cookie máy chủ. Sự kiện xem tài liệu phải qua kiểm tra ACL; sự kiện thu hồi gửi đến trình xem đang tham gia, và kết thúc họp chỉ ngắt người không còn quyền.
- Trạng thái trình chiếu, trang hiện tại và người phát biểu được lưu trong SQLite để máy khách lấy lại sau khi kết nối lại. Chỉ chủ trì điều khiển tài liệu/trang/laser; hàng đợi phát biểu chỉ được sửa bởi chủ trì.
- Giới hạn phát biểu chạy ở máy chủ, được phục hồi sau khởi động lại từ dấu thời gian lưu trong CSDL; thiết bị trình chiếu chỉ hiển thị bộ đếm.
- Ghi chú trang lưu theo cặp người dùng/tài liệu, không trả ghi chú cho tài khoản khác; xuất ra tệp văn bản UTF-8.
- Hạn chế chuột phải, kéo ảnh và in không ngăn chụp màn hình/chụp bằng thiết bị khác. Watermark và audit log hỗ trợ truy vết, không phải DRM.
- Prompt ban đầu có chuỗi tiếng Việt bị lỗi mã hóa. Các quyết định và nội dung ứng dụng được lưu bằng UTF-8 chuẩn.

- Phi?u k?n d?ng b?ng ??nh danh voter ledger ??c l?p v?i b?ng ballot ch? ch?a m? ng?u nhi?n, poll v? l?a ch?n; audit ghi nh?n l?n b? phi?u nh?ng kh?ng ghi ph??ng ?n. Phi?u c?ng khai l?u danh t?nh v? l?a ch?n c?ng nhau. ??y l? bi?u quy?t n?i b? th?ng th??ng, kh?ng d?ng cho b?u c? nh?n s? trong ??ng.
- K?t qu? ch? hi?n th? sau khi ch? tr? c?ng b?. Bi?n b?n gh?p th?ng tin cu?c h?p, ?i?m danh, k?t qu? ?? c?ng b? v? l?ch s? ph?t bi?u v?i ph?n k?t lu?n do th? k? nh?p; c? xu?t PDF v? DOCX.

- Benchmark hi?n gi? l?p t?i ?a 100 socket tr?n m?t m?y v? ghi th?i gian t? s? ki?n tr?nh chi?u ??n khi t?i xong ?nh trang. N? ch?a m? ph?ng gi?i h?n b?ng th?ng th?t, m? h?t t?i li?u 50 trang, ghi phi?u b?ng nhi?u t?i kho?n ri?ng hay ?o t?i nguy?n ti?n tr?nh m?y ch?; kh?ng ???c di?n gi?i k?t qu? s? khai l? nghi?m thu hi?u n?ng.

- Giới hạn bắt tay Socket.IO có thể cấu hình qua `SOCKET_CONNECTIONS_PER_MINUTE`, mặc định 200 để 100 client benchmark cùng máy kết nối đồng thời; giới hạn cấu hình tối đa là 1000/IP/phút.
