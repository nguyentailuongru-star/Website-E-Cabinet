# Phòng họp không giấy

Ứng dụng họp nội bộ cho mạng LAN độc lập. **Giai đoạn 1, 2 và 3 đã triển khai:** tài khoản, cuộc họp, điểm danh, tài liệu có kiểm soát truy cập, trình chiếu đồng bộ, laser, đăng ký phát biểu và tự khôi phục trạng thái qua Socket.IO.

## Yêu cầu và khởi chạy

- Node.js 20 trở lên.
- Cài thư viện trên máy có kho npm: `npm install`.
- Khởi tạo hoặc cập nhật SQLite: `npm run migrate` (cũng tự chạy khi máy chủ khởi động).
- Tạo quản trị viên đầu tiên bằng `ADMIN_USERNAME`, `ADMIN_PASSWORD` (ít nhất 12 ký tự), tùy chọn `ADMIN_FULL_NAME`, rồi chạy `npm run create-admin`.
- Chạy `npm start`; mở `http://localhost:3000` hoặc địa chỉ LAN của máy chủ.
- Chạy test: `npm test`.

Không đưa máy chủ lên mạng công cộng. Khi dùng HTTPS, đặt `COOKIE_SECURE=true` và kết thúc TLS tại proxy HTTPS nội bộ.

## Giai đoạn 1: tài khoản và kiểm soát truy cập

Năm vai trò tài khoản là quản trị viên (`admin`), chủ trì (`chair`), thư ký (`secretary`), đại biểu (`delegate`) và màn chiếu (`screen`). Vai trò trong cuộc họp được gán riêng cho từng cuộc họp. Tài khoản mới cần đổi mật khẩu ban đầu; mật khẩu tối thiểu 12 ký tự. Tài khoản khóa 15 phút sau 5 lần đăng nhập sai trong 15 phút. Phiên không hoạt động hết hạn sau 30 phút.

## Giai đoạn 2: cuộc họp và tài liệu

- Quản trị viên hoặc thư ký tạo cuộc họp, chọn chủ trì/thư ký, đại biểu, màn chiếu và danh sách chương trình.
- Khi đại biểu mở phòng họp, máy chủ ghi nhận điểm danh. Thư ký có thể sửa trạng thái có mặt, vắng có lý do hoặc vắng.
- Thư ký tải PDF, DOCX, XLSX hoặc PPTX lên, gắn mục chương trình, chọn tất cả thành viên hoặc danh sách người xem và nhãn Thông thường/Hạn chế.
- PDF được chuyển thành ảnh WebP phía máy chủ. Tệp gốc và trang được lưu dưới `data/meetings/`, ngoài thư mục public. Không có endpoint tải tệp gốc. Mọi yêu cầu trang kiểm tra quyền, trả `Cache-Control: no-store`, đóng watermark tên/đơn vị/thời điểm và ghi nhật ký xem.
- Máy chủ giới hạn tệp 50 MB và PDF tối đa 500 trang. Khi LibreOffice chưa cài, DOCX/XLSX/PPTX bị từ chối rõ ràng; PDF vẫn được xử lý bằng PDF.js và canvas cục bộ.
- Tài liệu Hạn chế tự mất quyền xem cho đại biểu/màn chiếu khi chủ trì kết thúc cuộc họp. Chủ trì và thư ký vẫn xem được. Thư ký có thể thu hồi bất kỳ lúc nào; Socket.IO thông báo tức thời cho trình xem đang mở.
- Ghi chú theo trang chỉ chủ tài khoản xem được và có thể xuất thành văn bản. Hạn chế chuột phải/kéo và ẩn khi in chỉ gây khó lưu bản sao; không ngăn chụp màn hình hoặc chụp bằng thiết bị khác. Watermark và nhật ký là biện pháp truy vết chính.

### API chính GĐ2

- `GET /api/meetings`, `POST /api/meetings`, `GET /api/meetings/:id`.
- `POST /api/meetings/:id/join`, `/start`, `/end`; xem/sửa điểm danh qua `/attendance`.
- `GET/POST /api/meetings/:id/documents`; thư ký thu hồi qua `/documents/:documentId/revoke`.
- `GET /api/documents/:id`, `GET /api/documents/:id/pages/:page` (thêm `?thumb=1` cho ảnh thu nhỏ).
- Ghi chú: `GET/PUT /api/documents/:id/notes`, `GET /api/documents/:id/notes/export`.

Các thao tác ghi cần cookie phiên và `X-CSRF-Token` lấy từ đăng nhập hoặc `GET /api/me`. Socket.IO xác thực phiên và chỉ cho vào phòng tài liệu sau khi máy chủ kiểm tra quyền xem. Tài khoản không được phép nhận lỗi 404 khi truy cập tài liệu/trang để không tiết lộ tài liệu đang tồn tại.

## Giai đoạn 3: phòng họp thời gian thực

- Sau khi chủ trì mở cuộc họp, nút **Chiếu** chia sẻ tài liệu/trang hiện tại tới thành viên đang bật chế độ **Theo chủ trì**. Đại biểu có thể chuyển sang xem tự do; màn chiếu luôn theo chủ trì.
- Chủ trì có con trỏ laser đồng bộ; các máy lưu vị trí trang hiện tại và nhận lại trạng thái khi kết nối lại.
- Đại biểu đã điểm danh có thể đăng ký/rời hàng đợi phát biểu. Chủ trì mời lần lượt, chọn giới hạn thời lượng tối đa 60 phút; giao diện đếm ngược và máy chủ tự kết thúc lượt khi hết giờ.
- Sự kiện Socket.IO kiểm tra phiên, tư cách thành viên, vai trò và tài liệu tại máy chủ. Đo độ trễ với 100 thiết bị Wi-Fi thực chưa thực hiện; phần này thuộc bench GĐ5.

## Dữ liệu và triển khai offline

SQLite mặc định ở `data/phong-hop.sqlite`; có thể đổi thư mục bằng `DATA_DIR`. Tệp tải lên không được đưa vào web root. Giữ thư mục dữ liệu trên máy chủ được bảo vệ và sao lưu định kỳ.

Máy LAN không Internet cần gói Node.js và `node_modules` đã cài sẵn đúng hệ điều hành/kiến trúc; `better-sqlite3`, `sharp` và canvas có mã native. Script đóng gói hiện chỉ tạo gói cho cùng hệ điều hành/kiến trúc với máy đóng gói.

## Phạm vi tiếp theo và cảnh báo

GĐ4 đã có biểu quyết công khai/phiếu kín, công bố kết quả và biên bản cuộc họp xuất PDF/DOCX. Phiếu kín lưu sổ xác nhận người đã bỏ phiếu riêng khỏi bảng lựa chọn; hệ thống không cung cấp liên kết giữa danh tính và lựa chọn. Các chức năng biểu quyết **không dùng cho bầu cử nhân sự trong Đảng**. GĐ5 đã có bản đầu của benchmark, tài liệu kiến trúc/nguy cơ/hướng dẫn, sao lưu và đóng gói cùng nền tảng; còn thiếu một số phép đo và nghiệm thu cài offline.

Xem [quyết định thiết kế](docs/QUYET_DINH_THIET_KE.md). Giai đoạn hiện tại chưa có chia sẻ màn hình, chống chụp màn hình hay chứng thư số.

## Công cụ vận hành và benchmark

- Sao chép `.env.example` thành `.env` để cấu hình `PORT`, `DATA_DIR` và cookie. Tệp `.env` bị Git ignore. Tài khoản khởi tạo đọc `ADMIN_USERNAME`/`ADMIN_PASSWORD`; tạo tài khoản một lần bằng `npm run create-admin`. Không đưa `.env` vào gói chia sẻ.
- Sao lưu SQLite nhất quán cùng thư mục tài liệu: `node scripts/backup.js`; đặt `DATA_DIR` và `BACKUP_DIR` để chọn vị trí.
- Tạo cuộc họp demo với 50 đại biểu và 3 PDF giả lập: `npm run seed-demo`. Mật khẩu được sinh riêng và ghi vào `DATA_DIR/demo-credentials.csv`; giữ tệp này an toàn. Chạy trong `DATA_DIR` riêng để không trộn dữ liệu demo với dữ liệu thật.
- Đóng gói dùng trong môi trường offline trên **cùng hệ điều hành và kiến trúc**: PowerShell `./scripts/package-offline.ps1 -OutputDirectory <thư_mục_nhận>`. Gói mang theo `node_modules` của máy đóng gói; không phải gói đa nền tảng.
- Cấu hình `SOCKET_CONNECTIONS_PER_MINUTE` trong `.env` giới hạn số lần bắt tay Socket.IO từ một địa chỉ IP; mặc định 200 để đủ chạy kiểm thử 100 client cùng máy.
- Benchmark Socket.IO đồng bộ lật trang và tải ảnh: đặt `BENCH_URL`, `BENCH_COOKIE`, `BENCH_MEETING_ID`, `BENCH_DOCUMENT_ID`, tùy chọn `BENCH_CLIENTS=10|30|50|100`, rồi chạy `node bench/sync.js`. Kết quả CSV và biểu đồ PNG ghi vào `bench/results` (có thể đổi bằng `BENCH_OUT`). Dùng một tài khoản chủ trì đã mở tài liệu và cuộc họp đang hoạt động.

Tài liệu GĐ5: [kiến trúc](docs/KIEN_TRUC.md), [mô hình nguy cơ](docs/MO_HINH_NGUY_CO.md), [cơ chế phiếu kín](docs/CO_CHE_BIEU_QUYET_KIN.md), [hướng dẫn sử dụng](docs/HUONG_DAN_SU_DUNG.md). Một lượt thử 100 socket trên cùng máy Windows đạt 100/100, median 4.154 s, p95 4.169 s, max 4.177 s; số đo tính từ lệnh lật trang tới khi tải ảnh xong, gồm tạo watermark. CSV và PNG mẫu nằm trong `bench/results`. Đây chưa phải phép đo Wi-Fi thật; chưa đo đủ kịch bản 50 trang, xử lý phiếu ở 100 tài khoản duy nhất hay tài nguyên toàn máy chủ. Chưa có nghiệm thu cài trên máy sạch không Internet và hướng dẫn chưa có ảnh chụp giao diện.
