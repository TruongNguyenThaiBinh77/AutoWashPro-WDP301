# Quy Định Chuẩn Quốc Tế Hóa (i18n Conventions) - AutoWashPro System

Tài liệu này định nghĩa các quy tắc bắt buộc về **i18n (Internationalization)** áp dụng cho toàn bộ dự án Frontend (React / Vite). Tất cả các AI Agent và lập trình viên khi viết mới, chỉnh sửa hoặc refactor code FE đều **phải tuân thủ nghiêm ngặt** các quy chuẩn bên dưới.

---

## 1. Cấu Trúc File & Namespace

- **Thư mục Locale**: `FE/src/i18n/locales/{vi,en}/`
- **File ngôn ngữ chính**: `common.json` (Default Namespace).
- **Quy tắc Namespace**:
  - Mặc định sử dụng **`common.json`** làm namespace chung cho toàn hệ thống.
  - Gọi hook: `const { t } = useTranslation();` (Không truyền namespace trừ khi làm việc trên module kế thừa có namespace riêng như `admin`, `landing`).
  - Phân nhóm key theo module trong `common.json` theo dạng lồng nhau (nested JSON object) hoặc dot-notation key.

---

## 2. Quy Tắc Đặt Tên Key (Key Naming Conventions)

1. **Cú pháp chính**: `<module>.<page_or_widget>.<field_or_action>` (dùng `camelCase`).
   - *Ví dụ trang Ví tiền*: `customer.wallet.balanceLabel`, `customer.wallet.topupSubmit`
   - *Ví dụ trang Lịch sử*: `customer.history.title`, `customer.history.filterStatus`
   - *Ví dụ trang Hồ sơ*: `customer.profile.addVehicleTitle`, `customer.profile.changePassword`

2. **Dịch Trạng thái / Map / Enum (Status & Enum Maps)**:
   - **KHÔNG** đặt chuỗi hiển thị trực tiếp trong hằng số Map.
   - **ĐÚNG**: Dùng `labelKey` chỉ tới key i18n.
   ```javascript
   // SAI
   const STATUS_MAP = { COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy' };

   // ĐÚNG
   const STATUS_MAP = {
     COMPLETED: { labelKey: 'customer.history.statusCompleted', color: 'green' },
     CANCELLED: { labelKey: 'customer.history.statusCancelled', color: 'red' }
   };
   // Khi render trong JSX:
   <span>{t(STATUS_MAP[status].labelKey)}</span>
   ```

3. **Xử lý Lỗi từ Backend (Error Handling)**:
   - Định nghĩa `ERROR_KEYS` map hoặc helper `translateError(msg, t)` nhận hàm `t` làm tham số.
   ```javascript
   export const translateError = (msg, t) => {
     if (!msg) return t('customer.wallet.unknownError');
     if (msg.includes('INSUFFICIENT_BALANCE')) return t('customer.wallet.insufficientBalance');
     return msg; // Fallback giữ nguyên nếu là message động
   };
   ```

---

## 3. Quy Tắc Viết Code Trong Component (JSX Rules)

1. **Import & Hook**:
   ```javascript
   import { useTranslation } from 'react-i18next';

   export default function MyComponent() {
     const { t } = useTranslation();
     // ...
   }
   ```

2. **Cấm Hardcode Chuỗi UI**:
   - Tất cả văn bản hiển thị cho người dùng (Title, Subtitle, Button, Placeholder, Toast message, Modal, Empty state, Filter label) **bắt buộc** phải dùng `t('key')`.

3. **Truyền Biến Động (Dynamic Interpolation)**:
   - Sử dụng `t('key', { varName })` với cú pháp `{{varName}}` trong file JSON.
   ```javascript
   // JSON: "greeting": "Xin chào {{name}}"
   // JSX:
   t('common.greeting', { name: user.name })
   ```

4. **Tránh Dùng `<Trans>` Khi Không Cần Thiết**:
   - Nếu chuỗi có định dạng đơn giản (ví dụ bold mã đơn hàng), hãy tách biến hoặc ghi chú plain text thay vì chèn HTML tags vào key JSON.

---

## 4. Những Trường Hợp KHÔNG Dịch (Exceptions)

1. **Đơn vị tiền tệ & Ký hiệu**: Ký hiệu `đ` hoặc `VND` trong hàm `formatCurrency`.
2. **Log hệ thống**: `console.log`, `console.error`, `console.warn` dành cho dev debugging.
3. **Định dạng Ngày/Giờ**: Các hàm native `toLocaleDateString('vi-VN')`, `formatDate`.
4. **Tên thuộc tính/Data API**: Payload gửi/nhận từ API, query parameters, route paths, classNames CSS.

---

## 5. Quy Tắc Đồng Bộ & Đảm Bảo Chất Lượng (Parity & Quality)

1. **Đồng bộ 1:1 (Parity Rule)**:
   - Bất kỳ key mới nào được thêm vào `vi/common.json` **bắt buộc phải có mặt** ở `en/common.json` và ngược lại.
   - Tuyệt đối không thêm key chỉ cho một ngôn ngữ.

2. **Mã hóa File**:
   - Bắt buộc dùng **UTF-8 (No BOM)** khi đọc/ghi file JSON ngôn ngữ.

3. **Kiểm tra Cú pháp (Syntax Verification)**:
   - Sau khi chỉnh sửa JSX, phải verify cú pháp bằng Babel parser hoặc build test:
   ```bash
   node -e "const p=require('@babel/parser');const fs=require('fs');p.parse(fs.readFileSync('src/path/to/File.jsx','utf8'),{sourceType:'module',plugins:['jsx']});console.log('OK')"
   ```

---

## 6. Bảng Tóm Tắt Dành Cho AI Agents

| Tình huống | Hành động bắt buộc |
| :--- | :--- |
| **Thêm UI text mới** | Khai báo key ở cả `vi/common.json` và `en/common.json`, dùng `t('key')` |
| **Sửa status / filter dropdown** | Chuyển label thành `labelKey`, render qua `t(item.labelKey)` |
| **Lỗi toast / alert** | Dùng `t('customer.module.errorKey')` hoặc `translateError(err, t)` |
| **Placeholder input** | Dùng `placeholder={t('customer.module.placeholderKey')}` |
| **Trang mới trong customer** | Đặt prefix key dạng `customer.<pageName>.<key>` |

---
*Tài liệu này là quy định chung. Mọi AI Agent tham gia phát triển dự án AutoWashPro đều phải tuân thủ để duy trì tính nhất quán hệ thống.*
