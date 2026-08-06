# Cây thư mục & chức năng — Frontend (FE)

> Tài liệu mô tả toàn bộ cây thư mục `src/` của frontend AutoWashPro (React + Vite + Tailwind + i18next).
> Bản cập nhật: 2026-08-06

---

## Tổng quan kiến trúc

- **Router**: `react-router-dom` — 3 nhánh route chính:
  - `/admin/*` → `routes/AdminRoutes.jsx` (quản trị toàn hệ thống)
  - `/manager/*` → `routes/ManagerRoutes.jsx` (quản lý chi nhánh)
  - `/*` → `App.jsx` (landing + trang khách hàng, routing thủ công bằng `useLocation`)
- **UI**: Tailwind CSS + `@phosphor-icons/react` + `lucide-react` + `framer-motion` + `recharts` (chart) + `maplibre-gl`/`leaflet` (bản đồ).
- **Real-time**: Socket.IO qua hook `useSSE` (gói `socket.io-client`).
- **Đa ngôn ngữ**: `i18next` (vi/en), storage key `app_language`.
- **State toàn cục**: `ConfigProvider` (hook `useSystemConfig`) tải config hệ thống từ `/configs/public` cho cả app.
- **Entry point**: `src/main.jsx`.

---

## Cây thư mục đầy đủ

```
src/
├── App.jsx                      # Entry chính cho nhánh public (landing + customer)
├── main.jsx                     # Root render: BrowserRouter, AdminRoutes, ManagerRoutes, ChatBot, Toaster
├── i18n.js                      # (Legacy) cấu hình i18next cũ dùng locales/*.json phẳng
├── index.css                    # Tailwind directives + base styles
├── styles.css                   # Style bổ sung toàn cục
├── overrides.css                # Override CSS (component shadcn/ui-style)
│
├── components/                  # ─── TOÀN BỘ UI COMPONENT ───
│   ├── AuthScreen.jsx           # Màn đăng nhập/đăng ký/quên mật khẩu (OTP, Google Login)
│   ├── ChatBot.jsx              # Widget chatbot AI nổi (gọi /chat/message, render Markdown)
│   ├── VoucherPicker.jsx        # Component chọn voucher khi đặt lịch, tính giảm giá theo đơn
│   │
│   ├── admin/                   # ─── TRANG QUẢN TRỊ ADMIN ───
│   │   ├── AdminLayout.jsx      # Layout chung admin (shell + header + menu meta)
│   │   ├── AdminOverview.jsx    # Giám sát tổng quan (chart doanh thu/booking/chi nhánh)
│   │   ├── AdminBookings.jsx    # Danh sách đặt lịch toàn hệ thống + lọc/đổi trạng thái
│   │   ├── AdminBookingDetail.jsx # Chi tiết 1 booking (thông tin, dịch vụ, thanh toán)
│   │   ├── AdminPayments.jsx    # Quản lý giao dịch thanh toán (VNPay, ví, chuyển khoản)
│   │   ├── AdminPaymentsPage.jsx # Container tab: Thanh toán / Yêu cầu hoàn tiền
│   │   ├── PaymentDetailPage.jsx # Chi tiết 1 giao dịch + thao tác xác nhận/hoàn tiền
│   │   ├── paymentShared.jsx    # Component/chức năng dùng chung cho trang thanh toán
│   │   ├── BranchManagement.jsx # CRUD chi nhánh, quản lý trạng thái
│   │   ├── UserManagement.jsx   # Quản lý người dùng, tạo admin/manager, khoá/xoá
│   │   ├── AdminReviews.jsx     # Xem & phản hồi đánh giá khách hàng
│   │   ├── AdminRewards.jsx     # Hub Khuyến mãi & Quà tặng: 5 tab (config, voucher, quà vật lý, vòng quay, báo cáo)
│   │   ├── AdminRewardsConfig.jsx  # Cấu hình tích điểm & hạng thành viên (tỷ lệ, mốc hạng)
│   │   ├── AdminRewardsManagement.jsx # Quản lý voucher & quà vật lý + trao quà (export RedemptionsTab)
│   │   ├── AdminSlotPacks.jsx   # Quản lý gói lượt (slot pack) toàn hệ thống
│   │   ├── AdminPolicies.jsx    # CRUD chính sách/dịch vụ hiển thị Landing Footer & Điều khoản
│   │   ├── AdminSystemConfig.jsx # Cấu hình quy tắc nghiệp vụ tập trung
│   │   ├── AdminPointHistoryDetail.jsx # Chi tiết giao dịch điểm thưởng của khách
│   │   ├── AdminActivity.jsx    # Dòng thời gian hoạt động (đặt/huỷ/hoàn thành/đánh giá)
│   │   ├── AdminProfile.jsx     # Hồ sơ quản trị viên
│   │   ├── FeaturePlaceholder.jsx # Trang placeholder cho tính năng chưa triển khai
│   │   └── config-tabs/         # ── Tab con cho AdminSystemConfig ──
│   │       ├── LoyaltyConfigTab.jsx       # Tab cấu hình loyalty (tỷ lệ/hạng/điểm)
│   │       └── SystemConfigGeneric.jsx    # Trình chỉnh sửa config generic (key-value)
│   │
│   ├── customer/                # ─── KHU VỰC KHÁCH HÀNG (sau đăng nhập) ───
│   │   ├── CustomerQRScanner.jsx # Scanner mã QR (check-in/dịch vụ bằng camera)
│   │   ├── layout/
│   │   │   └── CustomerLayout.jsx # Layout khách: navbar + tab điều hướng profile/ví/lịch sử...
│   │   ├── pages/
│   │   │   ├── CustomerProfilePage.jsx      # Hồ sơ, xe đăng ký, đổi mật khẩu, xác thực
│   │   │   ├── CustomerWalletPage.jsx       # Ví điểm: số dư, nạp/rút, lịch sử giao dịch
│   │   │   ├── CustomerWalletDetailPage.jsx # Chi tiết 1 giao dịch ví (nạp/chi/hoàn)
│   │   │   ├── CustomerHistoryPage.jsx      # Lịch sử đặt xe (lịch tháng, định kỳ, gói lượt)
│   │   │   ├── CustomerBookingDetail.jsx    # Chi tiết 1 booking của khách
│   │   │   ├── CustomerPaymentHistoryPage.jsx # Lịch sử thanh toán
│   │   │   ├── CustomerPaymentDetailPage.jsx  # Chi tiết 1 giao dịch thanh toán
│   │   │   ├── CustomerNotificationsPage.jsx # Trung tâm thông báo
│   │   │   └── CustomerRewardsPage.jsx      # Trang điểm thưởng & kho quà (điểm, lịch sử)
│   │   ├── pages/history/
│   │   │   ├── CustomerBookingDetail.jsx    # (định tuyến riêng) chi tiết booking từ /history/:id
│   │   │   └── CustomerHistoryPage.jsx      # (định tuyến riêng) wrapper lịch sử
│   │   ├── pages/rewards/
│   │   │   ├── CustomerPointHistoryDetail.jsx # Chi tiết giao dịch điểm của khách
│   │   │   └── CustomerRewardsPage.jsx        # Wrapper điểm thưởng & kho quà
│   │   └── pages/wallet/
│   │       ├── CustomerWalletPage.jsx        # Wrapper ví điểm
│   │       └── CustomerWalletDetailPage.jsx  # Wrapper chi tiết giao dịch ví
│   │
│   │   ├── widgets/             # ── Widget tái sử dụng khu vực khách ──
│   │   │   ├── BookingsHistory.jsx       # Danh sách booking (sắp tới/đã hoàn thành)
│   │   │   ├── CustomerWallet.jsx        # Widget ví: nạp tiền, lịch sử, filter
│   │   │   ├── LoyaltyGifts.jsx          # Widget đổi quà/voucher bằng điểm (tab đổi & kho quà)
│   │   │   ├── QuickBookModal.jsx        # Modal đặt lịch nhanh (M-4 orphan — chưa được import)
│   │   │   ├── RecurringBookingFlow.jsx  # Flow đặt lịch định kỳ (chọn ngày, voucher, thanh toán)
│   │   │   └── SlotPackFlow.jsx          # Flow mua & dùng gói lượt (chiết khấu theo số lượng)
│   │
│   ├── landing/                 # ─── LANDING PAGE (công khai) ───
│   │   ├── layout/
│   │   │   ├── Navbar.jsx       # Thanh điều hướng chính (đăng nhập/đăng xuất, menu)
│   │   │   └── Footer.jsx       # Footer + liên kết chính sách/điều khoản (render từ API policies)
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx  # Trang chủ (hero, how-it-works, testimonials, branch carousel, CTA, map)
│   │   │   ├── BookingPage.jsx  # Trang đặt lịch (gói dịch vụ, chọn slot, voucher, thanh toán)
│   │   │   ├── PackagesPage.jsx # Trang gói dịch vụ & giá
│   │   │   ├── GiftStorePage.jsx# Trang kho quà (wrapper GiftStoreSection)
│   │   │   ├── MapPage.jsx      # Trang bản đồ chi nhánh
│   │   │   ├── BranchDetailPage.jsx # Chi tiết 1 chi nhánh
│   │   │   ├── AboutPage.jsx    # Giới thiệu
│   │   │   └── PolicyPage.jsx   # Trang điều khoản/chính sách (render từ API)
│   │   ├── sections/            # ── Từng khối của trang chủ ──
│   │   │   ├── HeroSection.jsx          # Hero + số liệu thống kê + CTA
│   │   │   ├── HowItWorksSection.jsx    # 3 bước hoạt động
│   │   │   ├── TestimonialsSection.jsx  # Đánh giá khách hàng (từ API)
│   │   │   ├── BranchCarouselSection.jsx# Carousel chi nhánh
│   │   │   ├── PackagesSection.jsx      # Gói dịch vụ & giá
│   │   │   ├── CTASection.jsx           # Kêu gọi hành động cuối trang
│   │   │   ├── MapSection.jsx           # Bản đồ + danh sách chi nhánh
│   │   │   └── GiftStoreSection.jsx     # Kho quà: vòng quay may mắn, đổi voucher, đổi quà vật lý
│   │   └── widgets/
│   │       ├── BookingWidget.jsx    # Form đặt lịch chính (xe, gói, slot, voucher, VNPay)
│   │       ├── CustomLuckyWheel.jsx # Vòng quay may mắn (SVG/canvas, animate, gọi /gifts/spin)
│   │       ├── DirectionsMap.jsx    # Bản đồ chỉ đường (Leaflet + OSRM routing)
│   │       └── VideoBackground.jsx  # Canvas hiệu ứng nước/rửa xe nền Hero
│   │
│   ├── layout/                  # ── Layout dùng chung cho Admin & Manager ──
│   │   ├── DashboardShell.jsx   # Shell: sidebar + header + content
│   │   └── DashboardSidebar.jsx # Sidebar tái sử dụng (collapsible, badge, đăng xuất)
│   │
│   ├── manager/                 # ─── QUẢN LÝ CHI NHÁNH ───
│   │   ├── ManagerLayout.jsx    # Layout chung manager (shell + menu meta)
│   │   ├── ManagerOverview.jsx  # Tổng quan chi nhánh (chỉ số ngày, doanh thu, booking)
│   │   ├── ManagerBookings.jsx  # Danh sách booking của chi nhánh
│   │   ├── ManagerBookingDetail.jsx # Chi tiết booking
│   │   ├── ManagerSchedule.jsx  # Lịch theo ngày dạng timeline (slot còn trống/đặt)
│   │   ├── ManagerQuickCheckin.jsx # Check-in nhanh (tìm booking theo mã/QR)
│   │   ├── ManagerQRScanner.jsx # Scanner QR nhận diện khách/booking
│   │   ├── ManagerGenericQRDisplay.jsx # Hiển thị QR chung (check-in/slot pack)
│   │   ├── ManagerCheckInConfirmModal.jsx # Modal xác nhận check-in
│   │   ├── ManagerBranch.jsx    # Thông tin & chỉnh sửa chi nhánh của mình
│   │   ├── ManagerCustomers.jsx # Danh sách khách hàng đã dùng dịch vụ
│   │   ├── ManagerPackages.jsx  # CRUD gói dịch vụ tại chi nhánh
│   │   ├── ManagerPromotions.jsx# Quản lý voucher & khuyến mãi chi nhánh
│   │   ├── ManagerRevenue.jsx   # Báo cáo doanh thu (theo ngày/dịch vụ/khách)
│   │   ├── ManagerFeedbacks.jsx # Đánh giá & phản hồi tại chi nhánh
│   │   ├── ManagerPayments.jsx  # Thanh toán tại chi nhánh
│   │   ├── ManagerSlotPacks.jsx # Gói lượt tại chi nhánh + tra cứu theo mã
│   │   ├── ManagerPolicies.jsx  # Xem chính sách (chỉ đọc)
│   │   ├── ManagerSystemConfig.jsx # Xem cấu hình quy tắc nghiệp vụ (chỉ đọc)
│   │   └── ManagerProfile.jsx   # Hồ sơ quản lý
│   │
│   ├── services/
│   │   └── userService.js       # Service gọi API /auth/users (CRUD user cho admin)
│   │
│   ├── shared/                  # ── Dùng chung Admin + Manager ──
│   │   ├── LanguageSwitcher.jsx # Nút đổi ngôn ngữ vi/en
│   │   ├── RefundRequests.jsx   # Danh sách yêu cầu hoàn tiền + duyệt/từ chối
│   │   └── RefundDetailPage.jsx # Chi tiết yêu cầu hoàn tiền
│   │
│   └── ui/                      # ── UI primitives (tự viết, kiểu shadcn) ──
│       ├── badge.jsx            # Badge nhãn
│       ├── button.jsx           # Button (variants, sizes)
│       ├── card.jsx             # Card
│       ├── ConfirmDialog.jsx    # Modal xác nhận (danger/success)
│       ├── input.jsx            # Input
│       ├── label.jsx            # Label form
│       ├── map.jsx              # Bản đồ MapLibre GL (context + component)
│       ├── NotificationBell.jsx # Chuông thông báo real-time (dropdown, đánh dấu đã đọc)
│       ├── separator.jsx        # Đường phân cách
│       └── TierBadge.jsx        # Badge hạng thành viên + bảng màu/icon hạng
│
├── config/                      # ─── CẤU HÌNH MENU ───
│   ├── adminMenu.js             # Brand, menu items, page meta cho Admin
│   └── managerMenu.js           # Brand, menu items, page meta cho Manager
│
├── hooks/                       # ─── HOOKS ───
│   ├── useSSE.js                # Hook kết nối Socket.IO: subscribe event, debounce sync, tự ngắt khi hết listener
│   └── useSystemConfig.jsx      # ContextProvider tải config hệ thống + nghe real-time `config_updated`
│
├── i18n/                        # ─── ĐA NGÔN NGỮ (module chuẩn) ───
│   ├── index.js                 # Khởi tạo i18next (defaultNS=common)
│   ├── resources.js             # Gom tất cả namespace vi/en (common, auth, booking, ...)
│   └── locales/
│       ├── en/                  # 16 file JSON tiếng Anh (common, auth, booking, invoice, wallet,
│       │                        #   customer, manager, admin, loyalty, promotion, notification,
│       │                        #   landing, profile, validation, error)
│       └── vi/                  # 16 file JSON tiếng Việt (cùng cấu trúc)
│
├── lib/                         # ─── THƯ VIỆN NỘI BỘ ───
│   ├── authStorage.js           # Quản lý token (localStorage), đọc API error, fetch profile, base URL
│   ├── chatbotService.js        # Gọi API chatbot /chat/message + quản lý session chat
│   ├── confirm.jsx              # confirmDialog() promise — thay window.confirm
│   ├── toast.js                 # showToast() bọc react-hot-toast (success/error/loading)
│   └── utils.js                 # cn() — clsx + tailwind-merge
│
├── locales/                     # (LEGACY) en.json / vi.json phẳng — dùng bởi i18n.js cũ
│
├── routes/                      # ─── ROUTER ───
│   ├── AdminRoutes.jsx          # Route /admin/*: xác thực role admin + khai báo tất cả trang admin
│   └── ManagerRoutes.jsx        # Route /manager/*: xác thực role manager + khai báo tất cả trang manager
│
└── utils/                       # ─── UTILITIES ───
    ├── notifTranslator.js       # Dịch thông báo/tin nhắn BE (vi→en) theo type + bảng tra cứu chuỗi
    └── socketEvents.js          # Hằng số tên sự kiện Socket.IO dùng chung
```

---

## Ghi chú kiến trúc quan trọng

### 1. Routing thủ công ở `App.jsx`
`App.jsx` không dùng `<Routes>` mà dùng `location.pathname` + `if` để render từng trang (landing/customer). Các route `/admin/*` và `/manager/*` được tách riêng trong `main.jsx` → `AdminRoutes`/`ManagerRoutes`.

### 2. Định tuyến `vnpay_result`
Khi VNPay trả về, `App.jsx` đọc `?vnpay_result=`:
- Booking thường → chuyển tới `/booking?vpnp_result=...`
- Rebook (sessionStorage `aw_rebookVnpayDraft`) → chuyển tới `/history?rebook_vnpay=true`

### 3. Real-time (Socket.IO)
- `hooks/useSSE.js` quản lý một socket singleton, subscribe theo event, tự disconnect khi không còn listener.
- `SYNC_EVENTS` gồm: `slots_updated, vouchers_updated, my_bookings_updated, feedback_new, booking_new, my_vehicles_updated, config_updated, branch_sort_order_updated`.
- `utils/socketEvents.js` chứa hằng số tên sự kiện dùng chung toàn app.

### 4. Cấu hình toàn cục
`ConfigProvider` (`useSystemConfig.jsx`) tải `/configs/public` khi app khởi động và lắng nghe `config_updated` để cập nhật real-time. Mọi component dùng `useSystemConfig()` để đọc business rules (ví dụ: BookingWidget, RecurringBookingFlow, SlotPackFlow).

### 5. Xác thực & phiên
`lib/authStorage.js` lưu `aw_accessToken` / `aw_refreshToken` trong localStorage. `AdminRoutes`/`ManagerRoutes` tự xác thực role khi vào `/admin` hoặc `/manager`, redirect về `/` nếu sai quyền.

### 6. i18n
- Module chuẩn tại `src/i18n/` (16 namespace × 2 ngôn ngữ).
- `src/i18n.js` + `src/locales/*.json` là bản legacy (dùng chung file JSON phẳng).
- `utils/notifTranslator.js` dịch thông báo BE trả về (vốn viết tiếng Việt) sang tiếng Anh khi người dùng chọn EN.

### 7. Orphan / legacy đáng chú ý
- `components/customer/widgets/QuickBookModal.jsx`: được đánh dấu **M-4 orphan** — không còn file nào import, có thể xoá sau khi chắc chắn không dùng.
- `src/i18n.js` + `src/locales/`: legacy, không dùng bởi module `src/i18n/`.

---

## Luồng nhánh chính

1. **Landing (public)**: `/` → `LandingPage` (hero → how it works → testimonials → branch carousel → CTA → map), `/packages`, `/gifts` (đổi quà), `/map`, `/about`, `/policies`.
2. **Đặt lịch**: `/booking` → `BookingPage` → `BookingWidget` (chọn xe/gói/slot/voucher → thanh toán VNPay/ví). Hỗ trợ lịch định kỳ (`RecurringBookingFlow`) và gói lượt (`SlotPackFlow`).
3. **Khách hàng (đã đăng nhập)**: `/profile`, `/wallet`, `/history`, `/payments`, `/notifications`, `/rewards` — tất cả bọc trong `CustomerLayout`.
4. **Admin**: `/admin/*` → `AdminRoutes` → `AdminLayout` (sidebar từ `config/adminMenu.js`) + từng trang quản trị.
5. **Manager**: `/manager/*` → `ManagerRoutes` → `ManagerLayout` (sidebar từ `config/managerMenu.js`) + từng trang chi nhánh.
```
