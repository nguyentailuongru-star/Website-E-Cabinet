# YÊU CẦU XÂY DỰNG DỰ ÁN: HỆ THỐNG PHÒNG HỌP KHÔNG GIẤY TỜ TRÊN MẠNG LAN ĐỘC LẬP

## 0. Vai trò và cách làm việc

Bạn là kỹ sư phần mềm full-stack. Hãy xây dựng trọn vẹn dự án dưới đây, **làm theo từng giai đoạn (mục 7)**. Hết mỗi giai đoạn: chạy thử, viết test cho phần vừa làm, cập nhật README, rồi mới sang giai đoạn sau. Không bỏ qua tiêu chí nghiệm thu.

- Ngôn ngữ giao diện, thông báo lỗi, tài liệu: **tiếng Việt có dấu**.
- Comment trong code: tiếng Việt hoặc tiếng Anh đều được, nhưng ngắn gọn.
- Khi một yêu cầu chưa rõ: chọn phương án đơn giản, an toàn nhất, ghi lại quyết định đó trong `docs/QUYET_DINH_THIET_KE.md`, rồi làm tiếp (không dừng lại hỏi).
- Không thêm tính năng ngoài phạm vi. Không dùng dịch vụ đám mây, không gọi API bên ngoài.

## 1. Bối cảnh

Hệ thống phục vụ các cuộc họp, hội nghị nội bộ tại Học viện Phòng cháy, chữa cháy và Cứu nạn, cứu hộ (đơn vị thuộc Bộ Công an). Yêu cầu bắt buộc:

- **Chạy hoàn toàn trên mạng LAN độc lập, không có Internet.** Máy chủ và máy đầu cuối không có đường ra Internet.
- **Không dùng CDN.** Mọi thư viện JS/CSS/font phải nằm trong dự án (vendor cục bộ).
- Máy đầu cuối: máy tính bảng hoặc laptop của đơn vị, dùng trình duyệt (Chrome/Edge/Safari), **không cài ứng dụng**.
- Quy mô: một phiên họp tối đa 100 đại biểu; máy chủ là một PC/laptop thông thường (Windows hoặc Ubuntu, 8 GB RAM).
- Dự án sẽ là cơ sở cho một bài báo khoa học, nên **cần có công cụ đo kiểm hiệu năng** và **tài liệu kiến trúc** (mục 6).

## 2. Công nghệ

- Backend: **Node.js 22 LTS + Express + Socket.io**.
- CSDL: **SQLite** (thư viện `better-sqlite3`).
- Frontend: HTML/CSS/JavaScript thuần (không cần framework build), responsive cho máy tính bảng.
- Xử lý tài liệu:
  - PDF → ảnh từng trang: dùng `pdftoppm` (poppler-utils) nếu có trên máy; nếu không có thì dùng `pdfjs-dist` + `@napi-rs/canvas`. Viết lớp trừu tượng để đổi được bộ chuyển đổi.
  - DOCX/XLSX/PPTX → PDF: gọi LibreOffice headless (`soffice --headless --convert-to pdf`) nếu máy có; không có thì chỉ nhận PDF và báo rõ cho người dùng.
  - Xử lý ảnh, đóng watermark: `sharp`.
- Mật khẩu: `bcrypt`. Phiên đăng nhập: cookie `httpOnly`, `SameSite=Strict`.
- Test: `node:test` hoặc `vitest`.
- **Cài đặt offline:** có script đóng gói toàn bộ `node_modules` (kể cả binary của sharp/better-sqlite3 cho Windows x64 và Linux x64) để mang sang máy chủ không có Internet.

## 3. Vai trò người dùng

| Vai trò | Quyền chính |
|---|---|
| Quản trị viên | Quản lý tài khoản (thêm, sửa, khóa, nhập từ CSV), cấu hình hệ thống, xem nhật ký |
| Chủ trì | Mở/kết thúc phiên họp, điều khiển trình chiếu, mời phát biểu, mở/đóng biểu quyết |
| Thư ký | Tạo cuộc họp, gửi giấy mời, tải tài liệu và phân quyền, soạn kết luận/biên bản |
| Đại biểu | Xem tài liệu được giao, ghi chú cá nhân, đăng ký phát biểu, biểu quyết |
| Màn chiếu | Tài khoản đặc biệt chỉ để hiển thị lên máy chiếu/TV (chỉ xem) |

Một người có thể giữ vai trò khác nhau ở các cuộc họp khác nhau (vai trò gắn với từng cuộc họp, trừ quản trị viên).

## 4. Chức năng

### 4.1. Cuộc họp, giấy mời, điểm danh
- Tạo cuộc họp: tên, thời gian, địa điểm, chủ trì, thư ký, danh sách đại biểu, chương trình (danh sách mục, có thứ tự).
- Đại biểu thấy cuộc họp của mình trên trang chủ (sắp diễn ra, đang diễn ra, đã kết thúc).
- Điểm danh tự động khi đại biểu vào phòng họp trực tuyến; thư ký sửa tay được (có mặt, vắng có lý do, vắng). Màn chiếu hiển thị sĩ số.

### 4.2. Tài liệu và bảo mật tài liệu (phần quan trọng nhất)
- Thư ký tải tài liệu lên, gắn vào mục chương trình, chọn **ai được xem** (tất cả hoặc danh sách cụ thể), gắn nhãn mức độ (Thường / Hạn chế).
- Máy chủ chuyển tài liệu thành **ảnh từng trang** (WebP). **File gốc không bao giờ được gửi xuống máy đầu cuối**, và không có endpoint nào trả file gốc cho vai trò khác quản trị/thư ký.
- **Watermark động:** mỗi ảnh trang trả về có in chìm họ tên, đơn vị của người xem và thời điểm xem (lặp chéo trang, độ mờ vừa phải). Đóng ở phía máy chủ, cache theo (tài liệu, trang, người xem).
- Trình xem: lật trang, phóng to, thu nhỏ, mục lục trang thu nhỏ. Hạn chế lưu ảnh: chặn chuột phải, chặn kéo thả, CSS `@media print` ẩn nội dung. Ghi rõ trong tài liệu rằng đây chỉ là biện pháp gây khó, **không** chống được chụp màn hình; biện pháp chính là watermark và nhật ký.
- **Thu hồi:** khi cuộc họp kết thúc, tài liệu nhãn "Hạn chế" tự động không xem được nữa (trừ thư ký, chủ trì). Thư ký cũng thu hồi tay được bất cứ lúc nào; máy đang xem phải bị đóng tài liệu ngay qua Socket.io.
- Ảnh trang gửi với header `Cache-Control: no-store`.
- **Ghi chú cá nhân** theo từng trang, chỉ chủ nhân xem được, xuất ra được dưới dạng văn bản.

### 4.3. Đồng bộ trình chiếu
- Chủ trì mở một tài liệu và lật trang; **màn chiếu** và các đại biểu đang bật chế độ "Theo chủ trì" chuyển theo ngay. Đại biểu tắt chế độ này để xem tự do, bật lại thì nhảy về trang chủ trì đang chiếu.
- Chủ trì có thể chỉ con trỏ laser (chấm đỏ) trên trang, đồng bộ tới màn chiếu.
- Mục tiêu độ trễ đồng bộ: trung vị < 150 ms, p95 < 500 ms với 100 máy trên WiFi nội bộ.

### 4.4. Đăng ký phát biểu
- Đại biểu bấm "Đăng ký phát biểu", vào hàng đợi; hủy được.
- Chủ trì thấy hàng đợi theo thứ tự, bấm "Mời phát biểu" thì màn chiếu hiện tên người đang phát biểu và đồng hồ đếm thời gian (có giới hạn tùy chọn).

### 4.5. Biểu quyết (chỉ nội dung thông thường)
- **Không dùng cho bầu cử nhân sự trong Đảng.** Ghi dòng cảnh báo này trong giao diện tạo biểu quyết và trong README.
- Chủ trì tạo nội dung biểu quyết: câu hỏi, các phương án (mặc định Đồng ý / Không đồng ý / Ý kiến khác), chọn **công khai** (lưu ai chọn gì) hoặc **kín** (không lưu liên kết người – lựa chọn).
- Biểu quyết kín: bảng `luot_bieu_quyet` (ai đã bỏ, để chống bỏ hai lần) tách riêng với bảng `phieu` (lựa chọn, không có user_id, thứ tự ghi ngẫu nhiên hóa / không lưu thời điểm chính xác). Mô tả cơ chế này trong tài liệu kiến trúc.
- Mỗi người một phiếu; đóng biểu quyết thì không bỏ thêm được. Màn chiếu hiện kết quả (số lượng, tỷ lệ, biểu đồ cột) ngay khi chủ trì công bố.

### 4.6. Kết luận và biên bản
- Thư ký soạn kết luận/biên bản ngay trên hệ thống (trình soạn văn bản đơn giản), tự chèn: thành phần, sĩ số, kết quả biểu quyết, danh sách người phát biểu.
- Xuất **PDF** và **DOCX**.

### 4.7. Nhật ký (audit log)
- Ghi mọi sự kiện: đăng nhập/đăng xuất, xem tài liệu (ai, trang nào, lúc nào, từ IP nào), tải lên, thu hồi, biểu quyết (với biểu quyết kín chỉ ghi "đã bỏ phiếu", không ghi lựa chọn).
- Quản trị viên lọc, xem và xuất CSV.

### 4.8. Quản trị
- Nhập tài khoản từ CSV (họ tên, đơn vị, chức vụ, tên đăng nhập); tự sinh mật khẩu ban đầu và in danh sách; bắt đổi mật khẩu ở lần đăng nhập đầu.
- Khóa tài khoản sau 5 lần sai mật khẩu trong 15 phút.
- Tự đăng xuất sau 30 phút không thao tác (cấu hình được).
- Sao lưu CSDL và thư mục tài liệu bằng một nút (file nén có ngày giờ).

## 5. Yêu cầu phi chức năng
- **Bảo mật:** chống CSRF, kiểm tra quyền ở **mọi** API và sự kiện Socket.io (không tin client), giới hạn tần suất request, kiểm tra loại và kích thước file tải lên, tên file lưu bằng UUID. Hỗ trợ HTTPS với chứng chỉ tự ký (có script tạo chứng chỉ và hướng dẫn cài lên máy đầu cuối).
- **Ổn định:** máy đầu cuối mất WiFi rồi có lại thì tự kết nối lại và về đúng trạng thái (trang đang chiếu, biểu quyết đang mở).
- **Giao diện:** dùng tốt trên máy tính bảng 10 inch cả ngang lẫn dọc; chữ đủ to cho người lớn tuổi; nút bấm lớn.
- **Cài đặt:** chạy bằng một lệnh (`npm start` hoặc file `start.bat` / `start.sh`); có hướng dẫn cài làm dịch vụ chạy nền trên Windows và Ubuntu.

## 6. Phục vụ bài báo khoa học
1. **Công cụ đo kiểm** `bench/`:
   - Giả lập N đại biểu (`socket.io-client`), N = 10, 30, 50, 100, chạy được trên một máy hoặc nhiều máy.
   - Đo: (a) độ trễ đồng bộ trang, từ lúc chủ trì lật trang đến lúc client nhận sự kiện **và** tải xong ảnh trang; (b) thời gian mở tài liệu 50 trang; (c) thời gian ghi nhận và tổng hợp biểu quyết; (d) CPU, RAM máy chủ.
   - Hỗ trợ giả lập mạng chậm (giới hạn băng thông/độ trễ ở phía client giả lập).
   - Xuất kết quả CSV (trung vị, p95, max, số lỗi) và script vẽ biểu đồ PNG.
2. **Tài liệu** `docs/`:
   - `KIEN_TRUC.md`: sơ đồ kiến trúc (Mermaid), luồng xử lý tài liệu, mô hình dữ liệu.
   - `MO_HINH_NGUY_CO.md`: bảng các đường rò rỉ tài liệu (tải file, chụp màn hình, chụp bằng thiết bị khác, tài liệu sót sau họp, nghe lén mạng, truy cập trái quyền…) và biện pháp tương ứng trong hệ thống, nêu rõ cái gì **không** chống được.
   - `CO_CHE_BIEU_QUYET_KIN.md`: giải thích cách vừa ẩn danh vừa chống bỏ phiếu hai lần, và giới hạn của cơ chế.
   - `HUONG_DAN_SU_DUNG.md` cho từng vai trò, có ảnh chụp màn hình.
3. **Dữ liệu mẫu:** script tạo một cuộc họp mẫu với 50 đại biểu và vài tài liệu PDF mẫu để demo và đo kiểm.

## 7. Các giai đoạn và tiêu chí nghiệm thu

**GĐ1 – Nền tảng:** khung dự án, CSDL và migration, đăng nhập, phân quyền, quản lý tài khoản, nhập CSV, nhật ký cơ bản.
- Nghiệm thu: đăng nhập theo 5 vai trò; gọi API trái quyền trả 403; test tự động pass.

**GĐ2 – Cuộc họp và tài liệu:** tạo cuộc họp, chương trình, giấy mời, điểm danh; tải lên và chuyển PDF thành ảnh; trình xem; watermark; phân quyền xem; thu hồi.
- Nghiệm thu: đại biểu không được giao không xem được (kể cả khi gõ thẳng URL ảnh); không có cách nào lấy được file gốc từ tài khoản đại biểu; thu hồi làm tài liệu đóng ngay trên máy đang mở; mỗi ảnh có watermark đúng tên người xem.

**GĐ3 – Phòng họp thời gian thực:** đồng bộ trang, chế độ "Theo chủ trì", con trỏ laser, màn chiếu, đăng ký phát biểu, tự kết nối lại.
- Nghiệm thu: mở 3 trình duyệt (chủ trì, đại biểu, màn chiếu) và lật trang thì đồng bộ đúng; rút mạng một máy rồi cắm lại thì máy đó về đúng trang.

**GĐ4 – Biểu quyết, kết luận:** biểu quyết công khai/kín, hiển thị kết quả, soạn và xuất biên bản PDF/DOCX.
- Nghiệm thu: không bỏ phiếu hai lần được (thử cả gửi request trùng song song); với biểu quyết kín, kiểm tra CSDL không thể suy ra ai chọn gì.

**GĐ5 – Đo kiểm, tài liệu, đóng gói:** công cụ `bench/`, toàn bộ tài liệu mục 6, gói cài đặt offline, script sao lưu.
- Nghiệm thu: chạy bench với 100 client giả lập ra file CSV và biểu đồ; cài được trên máy sạch không có Internet bằng gói đã đóng.

## 8. Cấu trúc thư mục gợi ý
```
phong-hop-khong-giay/
├── server/        # Express, Socket.io, routes, services, db
├── public/        # giao diện (html, css, js, vendor/)
├── data/          # sqlite, tài liệu đã chuyển đổi (không commit)
├── bench/         # công cụ đo kiểm
├── scripts/       # tạo dữ liệu mẫu, chứng chỉ, đóng gói offline, sao lưu
├── docs/
├── tests/
└── README.md
```

## 9. Bàn giao cuối cùng
- Mã nguồn đầy đủ, chạy được, test pass.
- `README.md`: cài đặt (có và không có Internet), cấu hình, chạy, sao lưu, xử lý sự cố thường gặp.
- Bảng tóm tắt kết quả đo kiểm thực tế trên máy của bạn (ghi rõ cấu hình máy và điều kiện đo, ghi rõ là đo giả lập).
- Danh sách hạn chế còn tồn tại và hướng phát triển (chữ ký số, tích hợp giải pháp cơ yếu, chia sẻ màn hình).

Bắt đầu từ Giai đoạn 1.
