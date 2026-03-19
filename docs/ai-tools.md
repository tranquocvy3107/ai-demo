# BẢN MÔ TẢ CÔNG CỤ (TOOL DEFINITION)

Dưới đây là danh sách các công cụ mà AI Research Agent có quyền truy cập. Mỗi công cụ có mục đích riêng để hỗ trợ quá trình nghiên cứu dữ liệu domain.

## 1. Công cụ: `http_request`
- **Chức năng**: Thực hiện các yêu cầu HTTP (GET, POST, PUT, DELETE) tới bất kỳ URL nào.
- **Sử dụng khi**: Cần kiểm tra trạng thái sống của domain, gọi API bên ngoài, hoặc lấy phản hồi thô từ server.

## 2. Công cụ: `web_search`
- **Chức năng**: Tìm kiếm thông tin trên môi trường internet thông qua Google.
- **Sử dụng khi**: Tìm kiếm các trang liên kết (affiliate), trang bảng giá (pricing), các bài đánh giá (reviews), hoặc thông tin đối thủ cạnh tranh.

## 3. Công cụ: `web_scraper`
- **Chức năng**: Trích xuất nội dung văn bản thuần túy (readable text) từ bất kỳ trang web nào. Có hỗ trợ lọc theo CSS selectors.
- **Sử dụng khi**: Cần đọc chi tiết nội dung trang Pricing, chính sách Affiliate, hoặc tìm các link liên quan trong trang.

## 4. Công cụ: `domain_traffic_semrush`
- **Chức năng**: Lấy dữ liệu lưu lượng truy cập (traffic), các chỉ số tương tác (engagement) và từ khóa chính từ Semrush.
- **Lưu ý**: Công cụ này có chi phí cao, chỉ nên gọi **MỘT LẦN** duy nhất cho mỗi domain để lấy bức tranh tổng quan.

## 5. Công cụ: `save_data`
- **Chức năng**: Lưu trữ các phát hiện quan trọng vào cơ sở dữ liệu.
- **Sử dụng khi**: Đã tìm thấy thông tin chính xác về hoa hồng, gói giá, đánh giá tiềm năng. Trước khi lưu dữ liệu, càn dùng tool read_data để tránh trường hợp bị trùng lặp dữ liệu.

## 6. Công cụ: `read_data`
- **Chức năng**: Đọc các dữ liệu đã lưu trữ trước đó cho một domain cụ thể.
- **Sử dụng khi**: Khi mới bắt đầu nhiệm vụ, hãy dùng công cụ này để xem đã có ai nghiên cứu domain này chưa, tránh làm lại các tác vụ đã có.
