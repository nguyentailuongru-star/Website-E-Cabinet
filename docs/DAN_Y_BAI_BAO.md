# Dàn ý bài báo

> **Tên dự kiến:** Thiết kế và đánh giá hệ thống phòng họp không giấy vận hành ngoại tuyến cho cơ quan có yêu cầu bảo mật
>
> *(Tiếng Anh: Design and Evaluation of an Offline Paperless Meeting System for Security-Sensitive Organizations)*
>
> **Loại bài:** bài nghiên cứu ứng dụng có đánh giá thực nghiệm, khoảng 8–12 trang.
> **Nơi đăng gợi ý:** tạp chí khoa học của trường hoặc ngành, Hội nghị FAIR, @. Muốn đăng quốc tế thì cần mở rộng mục 5 và mục 6.

Ký hiệu: **[CÓ]** là đã có dữ liệu hoặc mã nguồn; **[CẦN]** là phải bổ sung trước khi nộp.

---

## Tóm tắt (150–250 từ)

- **Bối cảnh:** các cơ quan có yêu cầu bảo mật cần họp không giấy nhưng không được dùng dịch vụ đám mây hay kết nối Internet.
- **Đóng góp:**
  1. Kiến trúc chạy hoàn toàn trong mạng LAN cô lập.
  2. Bộ biện pháp hạn chế rò rỉ tài liệu xây dựng từ mô hình nguy cơ.
  3. Cơ chế biểu quyết kín "niêm phong khi đóng", chống tấn công pháp chứng vào nhật ký WAL.
  4. Đánh giá hiệu năng đồng bộ trình chiếu.
- **Kết quả chính (điền số liệu):**
  - Độ trễ sự kiện p95 ≈ … ms với … đại biểu.
  - Thời gian cả phòng thấy trang mới ≈ … ms.
  - Độ chính xác của tấn công liên kết phiếu giảm từ 98,0% về 53,2%, tức là bằng mức đoán theo đa số.
- **Từ khóa:** phòng họp không giấy, e-Cabinet, mạng nội bộ cô lập, bảo vệ tài liệu, biểu quyết kín, watermark, WebSocket.

## 1. Giới thiệu

- **Động lực:** chi phí in ấn, chủ trương chuyển đổi số, yêu cầu bảo mật tài liệu họp. **[CẦN]** Trích văn bản chủ trương, đề án chuyển đổi số liên quan.
- **Khoảng trống:** các giải pháp e-Cabinet phổ biến phụ thuộc đám mây hoặc Internet. Một số tổ chức không chấp nhận được điều đó. Ít công bố đánh giá định lượng về độ trễ đồng bộ và rò rỉ dữ liệu.
- **Câu hỏi nghiên cứu:**
  - RQ1: Kiến trúc offline đáp ứng độ trễ đồng bộ chấp nhận được với quy mô phòng họp thực tế (10–200 người) hay không?
  - RQ2: Những đường rò rỉ tài liệu nào có thể hạn chế ở tầng ứng dụng, và với chi phí hiệu năng bao nhiêu?
  - RQ3: Có thể bảo đảm tính không liên kết của phiếu kín trước kẻ tấn công có bản sao cơ sở dữ liệu hay không?
- **Đóng góp:** liệt kê 4 ý như trong phần Tóm tắt.
- Cấu trúc bài.

## 2. Tổng quan và nghiên cứu liên quan **[CẦN]**

Cần khảo sát 15–30 tài liệu, nhóm theo:

- **2.1 Hệ thống phòng họp không giấy và e-Cabinet:** sản phẩm thương mại trong và ngoài nước, các bài đã công bố. Lập bảng so sánh theo các tiêu chí: offline, kiểm soát tài liệu, biểu quyết kín, mã nguồn, đánh giá định lượng.
- **2.2 Bảo vệ tài liệu số:** DRM, watermark hiển thị và ẩn, render phía máy chủ (server-side rendering) thay cho gửi file gốc.
- **2.3 Biểu quyết điện tử:** tính bí mật, không liên kết (unlinkability), kiểm chứng đầu-cuối. Các hệ như Helios, mixnet, homomorphic tallying chỉ cần nêu để định vị bài. Bài này *không* nhằm cạnh tranh với e-voting mật mã.
- **2.4 Pháp chứng cơ sở dữ liệu:** khôi phục dữ liệu từ WAL, journal và trang tự do của SQLite. Đây là cơ sở của mô hình tấn công ở mục 5.3.

**Từ khóa tìm kiếm:** "paperless meeting system", "e-cabinet", "SQLite forensics WAL", "ballot secrecy unlinkability", "document leakage watermarking", "WebSocket latency evaluation".

> Không trích tài liệu khi chưa đọc bản gốc.

## 3. Yêu cầu và mô hình nguy cơ

- **3.1 Yêu cầu chức năng:**
  - vai trò (quản trị, chủ trì, thư ký, đại biểu, màn chiếu);
  - tài liệu, trình chiếu đồng bộ, phát biểu;
  - biểu quyết công khai và kín;
  - biên bản.

  **[CÓ]** [README](../README.md).
- **3.2 Yêu cầu phi chức năng:**
  - chạy offline;
  - triển khai trên một máy chủ phổ thông;
  - độ trễ cảm nhận dưới khoảng 1 s;
  - có nhật ký truy vết.
- **3.3 Mô hình nguy cơ:**
  - các tác nhân: đại biểu tò mò, đại biểu bị mất phiên, người có bản sao lưu hoặc ổ đĩa, người nghe lén LAN;
  - bảng đường rò rỉ, biện pháp và giới hạn. **[CÓ]** [MO_HINH_NGUY_CO.md](MO_HINH_NGUY_CO.md). **[CẦN]** Hệ thống hóa theo STRIDE.
- **3.4 Ngoài phạm vi:** chụp màn hình hoặc chụp bằng camera, quản trị viên máy chủ độc hại có quyền sửa mã nguồn.

## 4. Thiết kế hệ thống

- **4.1 Kiến trúc tổng thể:** Node.js/Express, Socket.IO, SQLite (WAL), pdf.js để render. **[CÓ]** [KIEN_TRUC.md](KIEN_TRUC.md). **Hình 1:** sơ đồ thành phần.
- **4.2 Quản lý phiên và phân quyền:**
  - cookie phiên phía máy chủ, CSRF, giới hạn tần suất;
  - ACL kiểm tra trên *từng* request và *từng* sự kiện socket;
  - thu hồi phiên khi đổi vai trò.
- **4.3 Phân phối tài liệu không lộ file gốc:**
  - chuyển sang PDF rồi render thành ảnh trang (WebP);
  - file gốc nằm ngoài web root;
  - watermark theo người xem và thời điểm;
  - `Cache-Control: no-store`;
  - thu hồi tài liệu tức thời qua socket;
  - ACL tự đóng khi kết thúc họp với tài liệu hạn chế.

  **Hình 2:** luồng yêu cầu một trang tài liệu.
- **4.4 Đồng bộ trình chiếu:** trạng thái trình chiếu do máy chủ giữ, phát theo phòng (room broadcast), tự khôi phục khi kết nối lại.
- **4.5 Biểu quyết kín "niêm phong khi đóng":** **[CÓ]** [CO_CHE_BIEU_QUYET_KIN.md](CO_CHE_BIEU_QUYET_KIN.md).
  - Mô tả hình thức:
    - lúc bỏ phiếu: L ← L ∪ {(p,u)}, T[o] ← T[o]+1 (T nằm trong bộ nhớ);
    - lúc đóng: B ← π(⋃ₒ {o}^T[o]) với π là hoán vị ngẫu nhiên; ghi B cùng lệnh đổi trạng thái trong một transaction.
  - Bất biến: biểu quyết đang mở thì không có ballot trên đĩa.
  - Đánh đổi về tính sẵn sàng khi khởi động lại.
  - **Hình 3:** so sánh dòng thời gian ghi đĩa của thiết kế cũ và mới.
- **4.6 Nhật ký kiểm toán (audit):** những gì được ghi, và những gì cố ý *không* ghi (phương án của phiếu kín).

## 5. Đánh giá

### 5.1 Môi trường thử nghiệm **[CẦN]**

- Cấu hình máy chủ (CPU, RAM, ổ đĩa, hệ điều hành).
- Mạng: LAN có dây 1 Gbps và Wi-Fi (chuẩn, số AP).
- Máy đo: nếu dùng nhiều hơn 1 máy thì nêu cách chia client.
- Tài liệu thử: số trang, độ phân giải, loại tài liệu (văn bản hay bản scan).
- **Bảng 1:** môi trường.

### 5.2 Hiệu năng đồng bộ trình chiếu (RQ1)

- **Phương pháp:**
  - một chủ trì lật trang, N đại biểu nhận sự kiện và tải ảnh trang;
  - N ∈ {10, 25, 50, 100, 200}, 30 lượt mỗi mức, có lượt khởi động;
  - đo bằng một đồng hồ đơn điệu trong cùng tiến trình.

  **[CÓ]** [bench/sync.js](../bench/sync.js).
- **Chỉ số:**
  - độ trễ sự kiện p50/p95/p99;
  - độ trễ ảnh trang;
  - thời gian để *cả phòng* thấy trang mới (max mỗi lượt), báo trung vị kèm khoảng tin cậy 95% bằng bootstrap;
  - tỷ lệ thành công.
- **Bảng 2 và Hình 4–5:** lấy trực tiếp từ `summary.md`, `latency.png`, `room-sync.png`.
- **Phát hiện sơ bộ** (loopback, một máy, chưa dùng để công bố):
  - sự kiện broadcast chỉ mất khoảng 2–6 ms;
  - thời gian tải ảnh tăng gần tuyến tính, khoảng 40 ms cho mỗi đại biểu, vì watermark được tạo lại cho mỗi request (bộ đệm watermark chỉ có hiệu lực 1 s);
  - từ đó cần đo cả trên LAN và trên Wi-Fi.
- **[CẦN] Thí nghiệm tối ưu (rất nên có):**
  - so sánh "watermark mỗi request" với "watermark lưu đệm theo (người, trang)" hoặc "render watermark trước khi lật trang";
  - báo cáo chi phí và lợi ích về bảo mật so với hiệu năng.

  Phần này biến một hạn chế thành một đóng góp.

### 5.3 Tính không liên kết của phiếu kín (RQ3)

- **Mô hình kẻ tấn công:**
  - có bản sao `*.sqlite` và `*.sqlite-wal` sau khi biểu quyết đóng;
  - checkpoint tự động bị tắt (xấu nhất cho người bảo vệ).
- **Thuật toán tấn công:**
  - duyệt WAL theo từng transaction;
  - so sánh phiên bản trang để tìm người mới và phiếu mới;
  - liên kết chắc chắn khi một transaction có 1 người mới và 1 phiếu mới; trường hợp còn lại đoán theo phân bố của transaction.

  **[CÓ]** [bench/secret-linkage.js](../bench/secret-linkage.js).
- **Kết quả sơ bộ** (50 cử tri, 5 lượt):

  | Thiết kế | Liên kết chắc chắn | Độ chính xác của kẻ tấn công |
  |---|---:|---:|
  | Thiết kế cũ | 94,8% | 98,0% |
  | Thiết kế mới | 0% | 53,2% (bằng mức đoán theo đa số) |

  **[CẦN]**
  - chạy 20+ lượt với N ∈ {10, 50, 100, 200};
  - thử nhiều phân bố lựa chọn, ví dụ 50/30/20 và 34/33/33;
  - báo trung bình ± độ lệch chuẩn;
  - kiểm định độ chính xác của thiết kế mới so với mức đoán theo đa số (t-test cặp hoặc Wilcoxon).
- **Bảng 3, Hình 6:** độ chính xác của kẻ tấn công theo N cho hai thiết kế.
- **Thảo luận:** kẻ tấn công đọc bộ nhớ nằm ngoài phạm vi. Ghi thêm trường hợp tất cả cử tri chọn giống nhau.

### 5.4 Đánh giá biện pháp chống rò rỉ tài liệu (RQ2) **[CẦN]**

- Bảng kịch bản kiểm thử, mỗi kịch bản có kết quả mong đợi và kết quả thực tế:
  - truy cập trái quyền bằng cách đổi URL hoặc ID;
  - dùng lại phiên đã thu hồi;
  - xem tài liệu hạn chế sau khi kết thúc họp;
  - tải file gốc;
  - kiểm tra header cache;
  - thu hồi trong lúc đang xem.

  Một phần đã có trong `tests/` (**[CÓ]**), cần gom lại thành bảng.
- Chi phí hiệu năng của watermark (lấy từ 5.2).
- Hạn chế vốn có: không chặn được chụp màn hình. Watermark chỉ phục vụ truy vết.

### 5.5 Đánh giá người dùng **[CẦN]**

- Thử nghiệm với 20–30 người (đại biểu, thư ký, chủ trì) trong 1–2 cuộc họp thật hoặc mô phỏng.
- Bảng hỏi SUS (10 câu, thang 5) và phỏng vấn ngắn.
- **Bảng 4:** điểm SUS theo vai trò.
- Nếu đã triển khai thật, thêm số cuộc họp, số trang tài liệu và lượng giấy tiết kiệm được.

## 6. Thảo luận

- Trả lời lần lượt RQ1–RQ3.
- **Bài học thiết kế:**
  - ghi đĩa làm lộ thông tin thời gian (bài học từ phiếu kín);
  - xung đột giữa bảo mật (watermark theo người xem) và hiệu năng;
  - sự cố hai bản native `@napi-rs/canvas` gây sập tiến trình khi render PDF dạng ảnh. Đây là bài học về rủi ro phụ thuộc native trong hệ thống offline.
- **Hạn chế:**
  - một máy chủ, chưa có tính sẵn sàng cao;
  - chưa có HTTPS đóng gói sẵn;
  - không kiểm chứng đầu-cuối được phiếu kín;
  - quy mô thử nghiệm người dùng nhỏ.
- **Hiệu lực của đánh giá (threats to validity):**
  - máy đo có thể trở thành nút cổ chai; đã theo dõi độ trễ vòng lặp sự kiện của máy đo;
  - đo trên loopback khác với đo trên LAN;
  - tài liệu tổng hợp khác với tài liệu thật.

## 7. Kết luận và hướng phát triển

- Tóm tắt đóng góp và số liệu chính.
- **Hướng phát triển:**
  - bộ đệm watermark;
  - HTTPS nội bộ với CA riêng;
  - kiểm phiếu bằng mã hóa đồng cấu (homomorphic) để bỏ tin cậy vào bộ nhớ máy chủ;
  - triển khai nhiều phòng họp.

## Tài liệu tham khảo **[CẦN]**

Khoảng 15–30 mục, theo chuẩn trích dẫn của nơi nộp.

---

## Danh sách việc cần làm trước khi nộp

1. [ ] Chạy `bench/sync.js` trên LAN và trên Wi-Fi thật: N = 10…200, 30 lượt; lưu toàn bộ thư mục `run-*`.
2. [ ] Thực hiện thí nghiệm bộ đệm watermark (mục 5.2) và đo lại trước/sau.
3. [ ] Chạy `bench/secret-linkage.js` với nhiều N và nhiều phân bố lựa chọn, 20+ lượt mỗi cấu hình.
4. [ ] Lập bảng kiểm thử rò rỉ tài liệu (mục 5.4).
5. [ ] Khảo sát SUS với người dùng thật.
6. [ ] Viết tổng quan và bảng so sánh (mục 2).
7. [ ] Vẽ Hình 1–3: kiến trúc, luồng tài liệu, dòng thời gian ghi phiếu.
8. [ ] Xóa dữ liệu thật khỏi lịch sử git trước khi công khai mã nguồn hoặc đính kèm repo vào bài.
