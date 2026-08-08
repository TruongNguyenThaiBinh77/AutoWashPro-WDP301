const { body, param, query } = require('express-validator');

const authValidators = {
  register: [
    body('name').optional().trim().isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('Email không hợp lệ').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
    body('phone').optional().trim(),
  ],
  login: [
    body('identifier').trim().notEmpty().withMessage('Vui lòng nhập email hoặc số điện thoại'),
    body('password').notEmpty().withMessage('Vui lòng nhập mật khẩu'),
  ],
  googleLogin: [
    body('idToken').trim().notEmpty().withMessage('Bắt buộc có Google ID token'),
  ],
  changePassword: [
    body('currentPassword').notEmpty().withMessage('Vui lòng nhập mật khẩu hiện tại'),
    body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự'),
  ],
  forgotPassword: [
    body('email').trim().isEmail().withMessage('Email không hợp lệ').normalizeEmail(),
  ],
  verifyOtp: [
    body('email').trim().isEmail().withMessage('Email không hợp lệ').normalizeEmail(),
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('Mã OTP phải có 6 chữ số'),
  ],
  resetPassword: [
    body('email').trim().isEmail().withMessage('Email không hợp lệ').normalizeEmail(),
    body('otp').trim().isLength({ min: 6, max: 6 }).withMessage('Mã OTP phải có 6 chữ số'),
    body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới phải có ít nhất 6 ký tự'),
  ],
  createUser: [
    body('name').trim().notEmpty().withMessage('Vui lòng nhập họ tên').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('Email không hợp lệ').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
    body('phone').optional().trim(),
    body('role').notEmpty().withMessage('Vai trò là bắt buộc').isIn(['admin', 'manager']),
    body('branchId').optional().isMongoId().withMessage('ID chi nhánh không hợp lệ'),
  ],
  updateUser: [
    param('id').isMongoId().withMessage('ID người dùng không hợp lệ'),
    body('name').optional().trim().isLength({ max: 100 }),
    body('phone').optional().trim(),
    body('role').optional().isIn(['admin', 'manager']),
    body('status').optional().isIn(['active', 'inactive', 'suspended']),
  ],
};

const vehicleValidators = {
  create: [
    body('licensePlate').trim().notEmpty().withMessage('Biển số xe là bắt buộc').isLength({ max: 20 }),
    body('vehicleType').isIn(['sedan', 'suv', 'pickup', 'van']).withMessage('Loại xe không hợp lệ'),
    body('brand').trim().notEmpty().withMessage('Hãng xe là bắt buộc').isLength({ max: 50 }),
    body('model').optional().trim().isLength({ max: 50 }),
    body('color').trim().notEmpty().withMessage('Màu xe là bắt buộc').isLength({ max: 30 }),
    body('year').optional().isInt({ min: 1900, max: new Date().getFullYear() }).withMessage(`Năm sản xuất không được lớn hơn năm hiện tại (${new Date().getFullYear()})`),
    body('isDefault').optional().isBoolean(),
  ],
  update: [
    param('id').isMongoId().withMessage('ID xe không hợp lệ'),
    body('licensePlate').optional().trim().isLength({ max: 20 }),
    body('vehicleType').optional().isIn(['sedan', 'suv', 'pickup', 'van']),
    body('brand').optional().trim(),
    body('color').optional().trim(),
    body('year').optional().isInt({ min: 1900, max: new Date().getFullYear() }).withMessage(`Năm sản xuất không được lớn hơn năm hiện tại (${new Date().getFullYear()})`),
    body('isDefault').optional().isBoolean(),
  ],
};

const branchValidators = {
  create: [
    body('name').trim().notEmpty().withMessage('Tên chi nhánh là bắt buộc').isLength({ max: 200 }),
    body('address').trim().notEmpty().withMessage('Địa chỉ là bắt buộc').isLength({ max: 500 }),
    body('phone').optional().trim().isLength({ max: 20 }),
    body('email').optional().trim().isEmail().withMessage('Email không hợp lệ').normalizeEmail(),
    body('openingTime').optional().trim(),
    body('closingTime').optional().trim(),
    body('status').optional().isIn(['active', 'inactive']),
    body('image').optional().trim(),
    body('location.coordinates').optional().isArray().withMessage('Tọa độ phải là mảng [longitude, latitude]'),
  ],
  update: [
    param('id').isMongoId().withMessage('ID chi nhánh không hợp lệ'),
    body('name').optional().trim().isLength({ max: 200 }),
    body('address').optional().trim().isLength({ max: 500 }),
    body('phone').optional().trim().isLength({ max: 20 }),
    body('email').optional().trim().isEmail().normalizeEmail(),
    body('openingTime').optional().trim(),
    body('closingTime').optional().trim(),
    body('status').optional().isIn(['active', 'inactive']),
    body('image').optional().trim(),
    body('location.coordinates').optional().isArray(),
    body('scheduleConfig').optional().isObject(),
  ],
  updateStatus: [
    param('id').isMongoId().withMessage('ID chi nhánh không hợp lệ'),
    body('status').notEmpty().withMessage('Trạng thái là bắt buộc').isIn(['active', 'inactive']),
  ],
};

const packageValidators = {
  create: [
    body('name').trim().notEmpty().withMessage('Tên gói dịch vụ là bắt buộc').isLength({ max: 200 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('price').isFloat({ min: 0 }).withMessage('Giá phải là số dương'),
    body('duration').isInt({ min: 1 }).withMessage('Thời gian tối thiểu là 1 phút'),
    body('image').optional().trim(),
    body('branchId').optional().isMongoId().withMessage('ID chi nhánh không hợp lệ'),
    body('status').optional().isIn(['active', 'inactive']),
    body('category').optional().isIn(['external', 'internal', 'full']),
    body('vehicleTypes').optional().isArray(),
  ],
  update: [
    param('id').isMongoId().withMessage('ID gói dịch vụ không hợp lệ'),
    body('name').optional().trim().isLength({ max: 200 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('price').optional().isFloat({ min: 0 }),
    body('duration').optional().isInt({ min: 1 }),
    body('image').optional().trim(),
    body('branchId').optional().isMongoId().withMessage('ID chi nhánh không hợp lệ'),
    body('status').optional().isIn(['active', 'inactive']),
    body('category').optional().isIn(['external', 'internal', 'full']),
    body('vehicleTypes').optional().isArray(),
  ],
};

const bookingValidators = {
  create: [
    body('branchId').isMongoId().withMessage('ID chi nhánh không hợp lệ'),
    body('packageId').isMongoId().withMessage('ID gói dịch vụ không hợp lệ'),
    body('vehicleId').isMongoId().withMessage('ID xe không hợp lệ'),
    body('bookingDate').isISO8601().withMessage('Định dạng ngày không hợp lệ'),
    body('startTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Định dạng giờ không hợp lệ (HH:mm)'),
    body('note').optional().trim().isLength({ max: 500 }),
    body('voucherCode').optional().trim().isLength({ max: 50 }),
    body('discountAmount').optional().isFloat({ min: 0 }),
    body('finalPrice').optional().isFloat({ min: 0 }),
  ],
  update: [
    param('id').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
    body('bookingDate').optional().isISO8601(),
    body('startTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('note').optional().trim().isLength({ max: 500 }),
    body('packageId').optional().isMongoId().withMessage('ID gói dịch vụ không hợp lệ'),
  ],
  updateStatus: [
    param('id').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
    body('status').notEmpty().withMessage('Trạng thái là bắt buộc').isIn(['pending', 'confirmed', 'checked_in', 'in_progress', 'awaiting_payment', 'completed', 'cancelled']),
  ],
  updateSubServices: [
    param('id').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
    body('subServices').isArray().withMessage('Dịch vụ phụ phải là một mảng'),
    body('subServices.*').isString(),
  ],
  slots: [
    query('branchId').isString().notEmpty().withMessage('ID chi nhánh không hợp lệ'),
    query('date').isISO8601().withMessage('Định dạng ngày không hợp lệ'),
    query('packageId').optional().isString().withMessage('ID gói dịch vụ không hợp lệ'),
  ],
  cancel: [
    param('id').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
    body('cancellationReason').optional().trim().isLength({ max: 500 }),
    body('otp').optional().trim().isLength({ max: 10 }),
  ],
  getByBookingId: [
    param('bookingId').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
  ],
};

const paymentValidators = {
  create: [
    body('bookingId').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
    body('method').notEmpty().withMessage('Phương thức thanh toán là bắt buộc').isIn(['cash', 'bank', 'vnpay', 'momo', 'wallet']),
  ],
  confirm: [
    body('transactionId').trim().notEmpty().withMessage('Mã giao dịch là bắt buộc'),
    body('method').trim().notEmpty().withMessage('Phương thức thanh toán là bắt buộc').isIn(['cash', 'bank', 'vnpay', 'momo', 'wallet']),
    body('gatewayTransactionId').optional().trim(),
  ],
  refund: [
    body('bookingId').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
  ],
  callback: [
    body('transactionId').trim().notEmpty().withMessage('Mã giao dịch là bắt buộc'),
    body('gatewayTransactionId').optional().trim(),
    body('success').isBoolean().withMessage('Trạng thái thành công là bắt buộc'),
  ],
};

const refundRequestValidators = {
  create: [
    body('bookingId').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
    body('reason').trim().notEmpty().withMessage('Lý do là bắt buộc').isLength({ max: 500 }),
  ],
  review: [
    param('id').isMongoId().withMessage('ID yêu cầu hoàn tiền không hợp lệ'),
    body('decision').notEmpty().withMessage('Quyết định là bắt buộc').isIn(['approved', 'rejected']),
    body('reviewNote').optional().trim().isLength({ max: 500 }),
  ],
  getById: [
    param('id').isMongoId().withMessage('ID yêu cầu hoàn tiền không hợp lệ'),
  ],
};

const voucherValidators = {
  create: [
    body('name').trim().notEmpty().withMessage('Vui lòng nhập họ tên').isLength({ max: 200 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('type').notEmpty().withMessage('Loại là bắt buộc').isIn(['percentage', 'fixed']),
    body('value').isFloat({ min: 0 }).withMessage('Giá trị phải là số dương'),
    body('maxDiscount').optional().isFloat({ min: 0 }),
    body('minOrder').optional().isFloat({ min: 0 }),
    body('quantity').isInt({ min: 0 }).withMessage('Số lượng tối thiểu là 0'),
    body('maxUsagePerUser').optional().isInt({ min: 1 }),
    body('startDate').isISO8601().withMessage('Ngày bắt đầu không hợp lệ'),
    body('endDate').isISO8601().withMessage('Ngày kết thúc không hợp lệ'),
    body('applicablePackages').optional().isArray(),
    body('applicableBranches').optional().isArray(),
    body('applicableToAllPackages').optional().isBoolean(),
    body('applicableToAllBranches').optional().isBoolean(),
    body('status').optional().isIn(['active', 'inactive']),
  ],
  update: [
    param('id').isMongoId().withMessage('ID mã giảm giá không hợp lệ'),
    body('name').optional().trim().isLength({ max: 200 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('type').optional().isIn(['percentage', 'fixed']),
    body('value').optional().isFloat({ min: 0 }),
    body('maxDiscount').optional().isFloat({ min: 0 }),
    body('minOrder').optional().isFloat({ min: 0 }),
    body('quantity').optional().isInt({ min: 0 }),
    body('maxUsagePerUser').optional().isInt({ min: 1 }),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('status').optional().isIn(['active', 'inactive']),
  ],
  validate: [
    body('code').trim().notEmpty().withMessage('Mã giảm giá là bắt buộc'),
    body('bookingData').isObject().withMessage('Dữ liệu đặt lịch là bắt buộc'),
  ],
  redeem: [
    body('code').trim().notEmpty().withMessage('Mã giảm giá là bắt buộc'),
    body('bookingId').optional().isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
    body('discountAmount').optional().isFloat({ min: 0 }),
  ],
  reserve: [
    body('code').trim().notEmpty().withMessage('Mã giảm giá là bắt buộc'),
    body('bookingId').isMongoId().withMessage('ID đặt lịch là bắt buộc'),
    body('discountAmount').optional().isFloat({ min: 0 }),
  ],
  rollback: [
    body('code').trim().notEmpty().withMessage('Mã giảm giá là bắt buộc'),
    body('bookingId').isMongoId().withMessage('ID đặt lịch là bắt buộc'),
  ],
};

const checkinValidators = {
  checkIn: [
    body('bookingId').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
  ],
  updateStatus: [
    param('bookingId').isMongoId().withMessage('ID lịch hẹn không hợp lệ'),
    body('status').notEmpty().withMessage('Trạng thái là bắt buộc').isIn(['in_progress', 'awaiting_payment', 'completed']),
    body('note').optional().trim().isLength({ max: 500 }),
    body('rating').optional().isInt({ min: 1, max: 5 }),
    body('feedback').optional().trim().isLength({ max: 1000 }),
  ],
};

const notificationValidators = {
  markRead: [
    param('id').isMongoId().withMessage('ID thông báo không hợp lệ'),
  ],
};

const configValidators = {
  getPublic: [
    query('branchId').optional().isMongoId().withMessage('Branch ID không hợp lệ')
  ],
  getAll: [
    query('scope').optional().isIn(['global', 'branch', 'package']).withMessage('Scope không hợp lệ'),
    query('isPublic').optional().isBoolean().withMessage('isPublic phải là boolean'),
    query('category').optional().isString()
  ],
  update: [
    body('key').trim().notEmpty().withMessage('Key không được để trống'),
    body('value').exists().withMessage('Value không được để trống'),
    body('type').notEmpty().isIn(['number', 'string', 'boolean', 'json']).withMessage('Type không hợp lệ'),
    body('category').optional().isString(),
    body('scope').optional().isIn(['global', 'branch', 'package']).withMessage('Scope không hợp lệ'),
    body('referenceId').optional().isMongoId().withMessage('Reference ID không hợp lệ'),
    body('isPublic').optional().isBoolean().withMessage('isPublic phải là boolean'),
    body('description').optional().isString(),
    body('reason').optional().isString().withMessage('Lý do phải là chuỗi')
  ],
  rollback: [
    body('key').trim().notEmpty().withMessage('Key không được để trống'),
    body('version').isInt({ min: 1 }).withMessage('Version phải là số nguyên dương'),
    body('scope').optional().isIn(['global', 'branch', 'package']).withMessage('Scope không hợp lệ'),
    body('referenceId').optional().isMongoId().withMessage('Reference ID không hợp lệ')
  ]
};

module.exports = { authValidators, vehicleValidators, branchValidators, packageValidators, bookingValidators, paymentValidators, refundRequestValidators, voucherValidators, checkinValidators, notificationValidators, configValidators };
