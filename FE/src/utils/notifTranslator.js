/**
 * Utility giúp chuyển đổi các thông báo / tin nhắn trả về từ BE (bằng Tiếng Việt)
 * sang Tiếng Anh tự động khi FE đang ở chế độ ngôn ngữ EN, và ngược lại.
 */

// Bảng tra cứu mẫu tin nhắn thông báo theo TYPE
const NOTIF_TYPE_TRANSLATIONS = {
  booking_created: {
    vi: { title: 'Đặt lịch thành công', message: 'Lịch hẹn của bạn đã được ghi nhận thành công.' },
    en: { title: 'Booking Created', message: 'Your booking has been successfully created.' },
  },
  booking_confirmed: {
    vi: { title: 'Đã xác nhận lịch hẹn', message: 'Lịch rửa xe của bạn đã được xác nhận.' },
    en: { title: 'Booking Confirmed', message: 'Your car wash appointment has been confirmed.' },
  },
  booking_cancelled: {
    vi: { title: 'Đã hủy lịch hẹn', message: 'Lịch hẹn của bạn đã bị hủy.' },
    en: { title: 'Booking Cancelled', message: 'Your booking appointment has been cancelled.' },
  },
  booking_completed: {
    vi: { title: 'Hoàn thành dịch vụ', message: 'Cảm ơn bạn đã sử dụng dịch vụ của AutoWashPro!' },
    en: { title: 'Service Completed', message: 'Thank you for using AutoWashPro services!' },
  },
  booking_reminder: {
    vi: { title: 'Nhắc nhở lịch hẹn', message: 'Bạn có lịch hẹn rửa xe sắp tới.' },
    en: { title: 'Booking Reminder', message: 'You have an upcoming car wash appointment.' },
  },
  payment_received: {
    vi: { title: 'Đã nhận thanh toán', message: 'Hệ thống đã nhận được thanh toán của bạn.' },
    en: { title: 'Payment Received', message: 'We have received your payment.' },
  },
  payment_confirmed: {
    vi: { title: 'Thanh toán thành công', message: 'Giao dịch thanh toán của bạn đã hoàn tất.' },
    en: { title: 'Payment Successful', message: 'Your payment transaction has completed.' },
  },
  profile_updated: {
    vi: { title: 'Cập nhật thông tin', message: 'Thông tin cá nhân của bạn đã được cập nhật thành công.' },
    en: { title: 'Profile Updated', message: 'Your personal profile has been updated successfully.' },
  },
  points_earned: {
    vi: { title: 'Tích điểm thành công', message: 'Bạn đã nhận được điểm thưởng mới.' },
    en: { title: 'Points Earned', message: 'You have earned new reward points.' },
  },
  voucher: {
    vi: { title: 'Ưu đãi mới', message: 'Bạn đã nhận được một mã ưu đãi mới.' },
    en: { title: 'New Voucher Received', message: 'You have received a new discount voucher.' },
  },
  system: {
    vi: { title: 'Thông báo hệ thống', message: 'Thông báo từ ban quản trị.' },
    en: { title: 'System Notification', message: 'Notification from administration.' },
  },
};

// Bảng tra cứu trực tiếp các chuỗi Tiếng Việt thông dụng sang Tiếng Anh
const EXACT_STRING_MAP = {
  // Tiêu đề thông báo
  'Cập nhật thông tin': 'Profile Updated',
  'Đặt lịch thành công': 'Booking Successful',
  'Thanh toán thành công': 'Payment Successful',
  'Đăng ký thành công': 'Registration Successful',
  'Đăng nhập thành công': 'Login Successful',
  'Đổi mật khẩu thành công': 'Password Changed Successfully',
  'Xác thực OTP thành công': 'OTP Verified Successfully',
  'Đặt lại mật khẩu thành công': 'Password Reset Successfully',
  'Đã làm mới token': 'Token Refreshed',
  'Đã xóa người dùng': 'User Deleted',
  'Tạo người dùng thành công': 'User Created Successfully',
  'Thông tin cá nhân của bạn đã được cập nhật thành công.': 'Your personal profile has been updated successfully.',
  'OTP đã được gửi đến email': 'OTP has been sent to your email',
  'Email không hợp lệ': 'Invalid email address',
  'Mật khẩu phải có ít nhất 6 ký tự': 'Password must be at least 6 characters',
  'Vui lòng nhập email hoặc số điện thoại': 'Please enter email or phone number',
  'Vui lòng nhập mật khẩu': 'Please enter password',
  'Mã OTP phải có 6 chữ số': 'OTP code must be 6 digits',
  'Biển số xe là bắt buộc': 'License plate is required',
  'Loại xe không hợp lệ': 'Invalid vehicle type',
  'Hãng xe là bắt buộc': 'Brand is required',
  'Màu xe là bắt buộc': 'Color is required',
  'Dữ liệu không hợp lệ': 'Invalid data provided',
  'Quá nhiều yêu cầu. Vui lòng thử lại sau.': 'Too many requests. Please try again later.',
  'Email already registered': 'This email is already registered',
  'Invalid email or password': 'Invalid email or password',
  'Account is suspended': 'Your account has been suspended',

  // Admin & Manager Header titles & metadata
  'Giám sát tổng quan': 'Overview Monitoring',
  'Theo dõi hoạt động hệ thống rửa xe theo thời gian thực.': 'Monitor car wash system activities in real-time.',
  'Tổng quan chi nhánh': 'Branch Overview',
  'Theo dõi hoạt động hôm nay và các chỉ số quan trọng.': 'Track today\'s activities and key performance indicators.',
  'Quản lý chi nhánh': 'Branch Management',
  'Xem, thêm, sửa và quản lý trạng thái các chi nhánh rửa xe.': 'View, add, edit, and manage car wash branch statuses.',
  'Quản lý người dùng': 'User Directory',
  'Quản lý tài khoản khách hàng, nhân viên và phân quyền.': 'Manage customer accounts, staff members, and access roles.',
  'Đánh giá của khách hàng': 'Customer Reviews',
  'Xem và phản hồi phản hồi từ khách hàng sau mỗi lượt rửa.': 'View and respond to customer reviews after each car wash.',
  'Đánh giá từ khách hàng': 'Customer Feedback',
  'Phản hồi và đánh giá chất lượng dịch vụ của chi nhánh.': 'Feedback and ratings on branch service quality.',
  'Khuyến mãi & Quà tặng': 'Promotions & Gifts',
  'Cấu hình chương trình tích điểm và đổi quà.': 'Configure point accumulation and reward redemption programs.',
  'Hoạt động gần đây': 'Recent System Activity',
  'Dòng thời gian các sự kiện đặt lịch, hoàn thành, hủy và đánh giá.': 'Timeline of booking events, completions, cancellations, and reviews.',
  'Quản lý đặt lịch': 'Bookings Management',
  'Xem và quản lý toàn bộ đặt lịch trên tất cả chi nhánh.': 'View and manage all booking appointments across all branches.',
  'Lịch theo ngày': 'Daily Schedule Timeline',
  'Xem toàn bộ slot trong ngày dạng timeline — ai đặt giờ nào, còn trống không.': 'View all slots today on timeline view — who booked when, slot availability.',
  'Cấu hình Quy tắc Nghiệp vụ': 'Business Rules Configuration',
  'Quản lý tập trung tất cả các quy tắc nghiệp vụ, chính sách booking, và điểm thưởng.': 'Centralized management of business rules, booking policies, and rewards.',
  'Quản lý Chính sách & Dịch vụ Động': 'Dynamic Policies & Services',
  'Tạo, sửa, xóa và quản lý nội dung hiển thị ở Landing Footer và trang Điều khoản dịch vụ.': 'Create, edit, delete, and manage Landing page footer and Terms of Service content.',
  'Xem Chính sách & Điều khoản': 'View Policies & Terms',
  'Quy định & Chính sách Hệ thống': 'System Rules & Policies',
  'Tra cứu các quy định đặt lịch, bảo hiểm xe, hủy đơn và hoàn tiền ở chế độ chỉ xem.': 'Read-only lookup for booking rules, vehicle insurance, cancellations, and refunds.',
  'Quản lý thanh toán': 'Payments Management',
  'Xem và quản lý toàn bộ giao dịch thanh toán và yêu cầu hoàn tiền trên hệ thống.': 'View and manage all payment transactions and refund requests.',
  'Quản lý thanh toán — Yêu cầu hoàn tiền': 'Refund Requests Management',
  'Xem xét và duyệt các yêu cầu hoàn tiền do khách hàng gửi trên toàn hệ thống.': 'Review and approve customer refund requests across the system.',
  'Chi tiết Yêu cầu hoàn tiền': 'Refund Request Details',
  'Chi tiết thanh toán': 'Payment Transaction Details',
  'Gói lượt': 'Slot Packs',
  'Quản lý tất cả gói lượt trên toàn hệ thống.': 'Manage all car wash slot packs across the system.',
  'Quản lý gói lượt rửa xe đã mua và tra cứu theo mã.': 'Manage purchased slot packs and lookup by code.',
  'Hồ sơ': 'Profile & Settings',
  'Hồ sơ cá nhân': 'My Personal Profile',
  'Thông tin tài khoản quản trị viên.': 'Administrator account settings and profile information.',
  'Thông tin tài khoản quản lý chi nhánh.': 'Branch manager account settings and profile information.',
  'Chi nhánh của tôi': 'My Branch',
  'Xem và chỉnh sửa thông tin chi nhánh bạn phụ trách.': 'View and edit information for the branch you manage.',
  'Quản lý khách hàng': 'Customer Directory',
  'Danh sách khách hàng đã sử dụng dịch vụ tại chi nhánh.': 'List of customers who have used services at your branch.',
  'Báo cáo doanh thu': 'Revenue Analytics',
  'Thống kê doanh thu theo thời gian, dịch vụ và khách hàng.': 'Revenue statistics by timeframe, service type, and customer.',
  'Gói dịch vụ': 'Service Packages',
  'Tạo và quản lý gói dịch vụ rửa xe tại chi nhánh.': 'Create and manage car wash service packages at your branch.',
  'Chi tiết Giao dịch Điểm thưởng': 'Reward Points Transaction Details',
  // Admin & Manager UI Tabs & Table Columns
  'Cấu hình điểm thưởng': 'Reward Points Config',
  'Lịch sử điểm thưởng': 'Points History',
  'Điểm tích lũy': 'Accumulated Points',
  'Danh sách Voucher': 'Voucher List',
  'Quà tặng vật lý': 'Physical Gifts',
  'Trao quà': 'Distribute Gifts',
  'Quản lý Vòng Quay': 'Lucky Wheel Management',
  'Báo cáo sử dụng': 'Usage Analytics Report',
  'Tất cả trạng thái': 'All Statuses',
  'Tìm theo mã đổi thưởng hoặc tên quà...': 'Search by redemption code or gift name...',
  'Khách hàng': 'Customer',
  'Quà tặng': 'Gift Item',
  'Ngày đổi': 'Redeemed Date',
  'Trạng thái': 'Status',
  'Chi nhánh / Người gửi': 'Branch / Sender',
  'Đã gửi quà cho khách': 'Mark Sent to Customer',
  'Chờ gửi quà': 'Pending Delivery',
  'Khách đã nhận': 'Received by Customer',
  'Bạc': 'Silver',
  'Vàng': 'Gold',
  'Kim Cương': 'Diamond',
  'Kim cương': 'Diamond',
  'điểm': 'pts',
  'Vai trò: admin': 'Role: Admin',
  'Vai trò: manager': 'Role: Manager',
  'Quản trị viên': 'Administrator',
  'Quản lý': 'Branch Manager',

  // Customer Profile Page UI strings
  'CÀI ĐẶT & QUẢN LÝ TÀI KHOẢN': 'ACCOUNT SETTINGS & MANAGEMENT',
  'Thông tin cá nhân': 'Personal Information',
  'Thành viên': 'Member',
  'Ví của tôi': 'My Wallet',
  'Lịch sử đặt xe': 'Car Wash History',
  'Lịch sử thanh toán': 'Payment History',
  'Thông báo': 'Notifications',
  'Kho quà & Tích điểm': 'Rewards & Points',
  'Đăng xuất': 'Sign Out',
  '📅 Lịch tháng': '📅 Monthly View',
  '🔄 Đặt lịch định kỳ': '🔄 Recurring Bookings',
  '📋 Đặt lịch thường': '📋 Standard Bookings',
  '🎫 Gói lượt': '🎫 Slot Packs',

  // Color & Tier Badges
  'Xanh dương': 'Blue',
  'Xanh': 'Blue',
  'đỏ': 'Red',
  'Đỏ': 'Red',
  'Trắng': 'White',
  'Đen': 'Black',
  'Xám': 'Grey',
  'Xanh lá': 'Green',

  'ĐIỂM THƯỞNG': 'REWARD POINTS',
  'Dùng để đổi Voucher & quà ưu đãi': 'Use to redeem vouchers & gifts',
  'XE ĐÃ ĐĂNG KÝ': 'REGISTERED VEHICLES',
  'Phương tiện lưu trong tài khoản': 'Vehicles saved in your account',
  'LƯỢT QUAY MAY MẮN': 'LUCKY WHEEL SPINS',
  'Lượt quay may mắn nhận quà': 'Available spins to win gifts',
  'TIẾN TRÌNH LÊN HẠNG VÀNG': 'GOLD TIER PROGRESS',
  'TIẾN TRÌNH LÊN HẠNG BẠC': 'SILVER TIER PROGRESS',
  'TIẾN TRÌNH LÊN HẠNG KIM CƯƠNG': 'DIAMOND TIER PROGRESS',
  'Cập nhật họ tên, sđt và ảnh đại diện': 'Update full name, phone, and avatar',
  'Chỉnh sửa': 'Edit',
  'HỌ VÀ TÊN': 'FULL NAME',
  'SỐ ĐIỆN THOẠI': 'PHONE NUMBER',
  'EMAIL (KHÔNG THỂ THAY ĐỔI)': 'EMAIL (CANNOT BE CHANGED)',
  'Đổi mật khẩu': 'Change Password',
  'Cập nhật mật khẩu bảo vệ tài khoản': 'Update security password',
  'MẬT KHẨU': 'PASSWORD',
  'Đã bảo vệ': 'Protected',
  'XÁC THỰC TÀI KHOẢN': 'ACCOUNT VERIFICATION',
  'Đã liên kết với email': 'Linked with email',
  'Phương tiện của tôi': 'My Vehicles',
  'Danh sách các xe dùng để đặt lịch dịch vụ rửa xe': 'List of vehicles used for booking car wash services',
  '+ Thêm xe mới': '+ Add New Vehicle',
  'Thêm xe mới': 'Add New Vehicle',
  'Cập nhật xe': 'Update Vehicle',
  'Xóa xe': 'Delete Vehicle',
  'Chỉnh sửa hồ sơ': 'Edit Profile',
  'Họ và tên': 'Full Name',
  'Số điện thoại': 'Phone Number',
  'Lưu thay đổi': 'Save Changes',
  'Mật khẩu hiện tại': 'Current Password',
  'Mật khẩu mới': 'New Password',
  'Xác nhận mật khẩu mới': 'Confirm New Password',
  'Biển số xe': 'License Plate',
  'Loại xe': 'Vehicle Type',
  'Hãng xe': 'Vehicle Brand',
  'Mẫu xe': 'Vehicle Model',
  'Màu xe': 'Vehicle Color',
  'Năm sản xuất': 'Manufacture Year',
  'Đặt làm xe mặc định': 'Set as default vehicle',

  // Landing Page UI strings
  'Hệ thống đặt lịch thông minh': 'Smart Booking System',
  'Chăm sóc xế yêu': 'Car Care',
  'một cách': 'in a',
  'chuyên nghiệp': 'Professional Way',
  'Hệ thống đặt lịch rửa xe trực tuyến nhanh chóng. Trải nghiệm dịch vụ vệ sinh và chăm sóc xe hơi đẳng cấp nhất tại AutoWash Pro.': 'Fast online car wash booking system. Experience premium automotive cleaning and care at AutoWash Pro.',
  'Bắt đầu đặt lịch ngay': 'Start Booking Now',
  'Cuộn để khám phá': 'Scroll to Explore',
  'LƯỢT RỬA': 'CAR WASHES',
  'HÀI LÒNG': 'SATISFACTION',
  'CHI NHÁNH': 'BRANCHES',
  'Tất cả gói lượt': 'All Slot Packs',
  'Gói lượt của tôi': 'My Slot Packs',
  'Lịch hẹn sắp tới': 'Upcoming Appointments',
  'Lịch hẹn đã hoàn thành': 'Completed Appointments',
  'Mã đặt lịch': 'Booking Code',
  'Dịch vụ đặt': 'Booked Service',
  'Ngày rửa xe': 'Car Wash Date',
  'Giờ rửa xe': 'Car Wash Time',
  'Chi nhánh rửa xe': 'Branch Location',
  'Phương tiện rửa': 'Wash Vehicle',
  'Tổng chi phí': 'Total Amount',
  'Chi tiết lịch hẹn': 'Booking Details',
  'Hủy lịch hẹn': 'Cancel Appointment',
  'Đặt lại dịch vụ': 'Book Again',
  'Không có lịch hẹn nào': 'No appointments found',
  'Nạp tiền vào ví': 'Top Up Wallet',
  'Số dư khả dụng': 'Available Balance',
  'Lịch sử nạp/rút tiền': 'Deposit/Withdrawal History',
  'Phương thức thanh toán': 'Payment Method',
  'Thanh toán qua VNPAY': 'Pay via VNPAY',
  'Thanh toán qua chuyển khoản': 'Pay via Bank Transfer',
  'Mã giao dịch': 'Transaction ID',
  'Nạp tiền thành công': 'Top Up Successful',
  'Nạp tiền thất bại': 'Top Up Failed',
  'Kho quà ưu đãi': 'Rewards Store',
  'Đổi quà ngay': 'Redeem Gift Now',
  'Đã hết hàng': 'Out of Stock',
  'Đủ điều kiện đổi': 'Eligible for Redemption',
  'Chưa đủ điểm': 'Insufficient Points',
  'Vòng quay may mắn': 'Lucky Wheel',
  'Quay ngay': 'Spin Now',
  'Lượt quay còn lại': 'Spins Remaining',
  'Chúc mừng!': 'Congratulations!',
  'Bạn đã nhận được': 'You have received',
  'Đánh dấu đã đọc': 'Mark as read',
  'Đánh dấu tất cả đã đọc': 'Mark all as read',
  'Không có thông báo nào': 'No notifications',
  'Xem tất cả': 'View All',
  'Đóng': 'Close',
  'Hủy': 'Cancel',
  'Xác nhận': 'Confirm',
  'Lưu': 'Save',
  'Thử lại': 'Retry',
  'Đang tải...': 'Loading...',
};

/**
 * Dịch một đoạn văn bản ngắn từ tiếng Việt sang tiếng Anh nếu lang === 'en'
 */
export function translateText(text, lang = 'vi') {
  if (!text) return '';
  if (lang === 'vi') return text;
  return EXACT_STRING_MAP[text] || text;
}

/**
 * Dịch tiêu đề & nội dung notification dựa theo loại (type) hoặc bảng tra cứu chuỗi.
 * @param {Object} notif - Đối tượng thông báo từ BE ({ type, title, message, ... })
 * @param {string} lang - 'vi' | 'en'
 * @returns {{ title: string, message: string }}
 */
export function translateNotification(notif, lang = 'vi') {
  if (!notif) return { title: '', message: '' };

  if (lang === 'vi') {
    return {
      title: notif.title || '',
      message: notif.message || '',
    };
  }

  // Nếu chọn EN
  const typeMatch = NOTIF_TYPE_TRANSLATIONS[notif.type];
  if (typeMatch && typeMatch.en) {
    return {
      title: typeMatch.en.title,
      message: notif.message && EXACT_STRING_MAP[notif.message] 
        ? EXACT_STRING_MAP[notif.message] 
        : typeMatch.en.message,
    };
  }

  // Nếu không trùng type, tra cứu chuỗi trực tiếp
  const translatedTitle = EXACT_STRING_MAP[notif.title] || notif.title;
  const translatedMsg = EXACT_STRING_MAP[notif.message] || notif.message;

  return {
    title: translatedTitle,
    message: translatedMsg,
  };
}

/**
 * Dịch tin nhắn phản hồi API từ BE sang ngôn ngữ hiện tại.
 * @param {string} msg 
 * @param {string} lang 
 */
export function translateApiMessage(msg, lang = 'vi') {
  if (!msg) return '';
  if (lang === 'vi') return msg;
  return EXACT_STRING_MAP[msg] || msg;
}
