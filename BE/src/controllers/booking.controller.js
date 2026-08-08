const bookingService = require('../services/booking.service');
const paymentService = require('../services/payment.service');
const vnpayService = require('../services/vnpay.service');
const sseService = require('../services/sse.service');
const { catchAsync, success } = require('../utils/helpers');
const QRCode = require('qrcode');

exports.createBooking = catchAsync(async (req, res) => {
  const booking = await bookingService.createBooking({ ...req.body, userId: req.userId });
  sseService.broadcastToAll('slots_updated');
  sseService.sendToUser(booking.userId?._id || booking.userId || req.userId, 'my_bookings_updated', {});
  
  const emailService = require('../services/email.service');
  const User = require('../models/user.schema');
  const user = await User.findById(req.userId);
  if (user && user.email) {
    emailService.sendBookingConfirmationEmail(user.email, booking).catch(e => console.error('Lỗi gửi email xác nhận đặt lịch:', e));
  }

  success(res, booking, 'Đặt lịch thành công', 201);
});

exports.createWalkInBooking = catchAsync(async (req, res) => {
  const { name, phone, email, licensePlate, packageId, branchId } = req.body;
  const User = require('../models/user.schema');
  const Vehicle = require('../models/vehicle.schema');

  let targetUserId = null;
  let identifier = email || phone;

  if (!identifier) {
    throw Object.assign(new Error('Vui lòng cung cấp ít nhất Email hoặc Số điện thoại'), { statusCode: 400 });
  }

  // 1. Tìm hoặc tạo User
  const query = identifier.includes('@')
    ? { email: identifier.toLowerCase().trim() }
    : { phone: identifier.trim() };
    
  let user = await User.findOne(query);
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const newEmail = email || `${phone}@khachvanglai.autowash.vn`;
    const newPhone = phone || undefined;
    const newPassword = phone || 'Khach@123'; // Mật khẩu mặc định

    user = new User({
      name: name || 'Khách vãng lai',
      email: newEmail,
      phone: newPhone,
      password: newPassword,
    });
    await user.save();
  }
  targetUserId = user._id;

  // 2. Tìm hoặc tạo Xe
  const normalizedPlate = licensePlate.replace(/\s+/g, '').toUpperCase();
  let vehicle = await Vehicle.findOne({ userId: targetUserId, licensePlate: normalizedPlate });
  
  if (!vehicle) {
    vehicle = new Vehicle({
      userId: targetUserId,
      licensePlate: normalizedPlate,
      vehicleType: 'sedan',
      brand: 'Khác',
      color: 'Khác',
    });
    await vehicle.save();
  }

  // 3. Tạo Đơn đặt lịch
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');

  const bookingData = {
    ...req.body,
    userId: targetUserId,
    vehicleId: vehicle._id,
    bookingDate: req.body.bookingDate || now.toISOString().split('T')[0],
    startTime: req.body.startTime || `${h}:${m}`,
    note: req.body.note || (phone ? `Khách vãng lai - SĐT: ${phone}` : 'Khách vãng lai'),
    isWalkIn: true,
    isNewCustomerWalkIn: isNewUser,
    status: 'checked_in'
  };
  
  const booking = await bookingService.createBooking(bookingData);

  sseService.broadcastToAll('slots_updated');
  sseService.sendToUser(targetUserId, 'my_bookings_updated', {});
  
  const targetBranchId = booking.branchId?._id || booking.branchId;
  if (targetBranchId) sseService.broadcastToManagers(targetBranchId, 'customer_checked_in_via_qr', { bookingId: booking._id });
  sseService.broadcastToAll('customer_checked_in_via_qr', { bookingId: booking._id });

  let msg = 'Tạo đơn vãng lai thành công';
  if (booking.status === 'confirmed') {
    msg = `Tạo đơn thành công. Tuy nhiên hiện tại đang đầy, khách được xếp vào khung giờ trống gần nhất: ${booking.startTime}`;
  } else {
    msg = 'Tạo đơn và Check-in khách vãng lai thành công';
  }

  success(res, booking, msg, 201);
});

exports.checkRecurringConflicts = catchAsync(async (req, res) => {
  const result = await bookingService.checkRecurringConflicts({ ...req.body, userId: req.userId });
  success(res, result, 'Kiểm tra trùng lịch hoàn tất');
});

exports.createRecurringBooking = catchAsync(async (req, res) => {
  const result = await bookingService.createRecurringBooking({ ...req.body, userId: req.userId });
  sseService.broadcastToAll('slots_updated');
  sseService.sendToUser(req.userId, 'my_bookings_updated', {});
  
  if (result.created && result.created.length > 0) {
    const emailService = require('../services/email.service');
    const User = require('../models/user.schema');
    const user = await User.findById(req.userId);
    if (user && user.email) {
      emailService.sendBookingConfirmationEmail(user.email, result.created[0]).catch(e => console.error('Lỗi gửi email xác nhận đặt lịch định kỳ:', e));
    }
  }

  success(res, result, `Recurring booking created: ${result.totalCreated} bookings`, 201);
});

exports.getRecurringCancelPreview = catchAsync(async (req, res) => {
  const result = await bookingService.getRecurringCancelPreview(req.params.groupId, req.userId);
  success(res, result, 'Đã tính toán phí hủy nhóm định kỳ');
});

exports.requestRecurringCancelOtp = catchAsync(async (req, res) => {
  const Booking = require('../models/booking.schema');
  const User = require('../models/user.schema');
  
  const bookings = await Booking.find({ recurringGroupId: req.params.groupId, status: { $in: ['pending', 'confirmed'] } });
  if (bookings.length === 0) {
    throw Object.assign(new Error('Không tìm thấy lịch nào trong nhóm này'), { statusCode: 404 });
  }
  if (String(bookings[0].userId) !== String(req.userId)) {
    throw Object.assign(new Error('Không có quyền yêu cầu OTP'), { statusCode: 403 });
  }

  const user = await User.findById(req.userId);
  if (!user || !user.email) {
    throw Object.assign(new Error('Tài khoản của bạn chưa có email. Vui lòng cập nhật email để nhận mã OTP!'), { statusCode: 400 });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const bcrypt = require('bcryptjs');
  
  const firstBooking = bookings[0];
  firstBooking.cancelOtpToken = bcrypt.hashSync(otp, 12);
  firstBooking.cancelOtpExpires = Date.now() + 5 * 60 * 1000;
  await firstBooking.save();

  const emailService = require('../services/email.service');
  await emailService.sendCancelOtpEmail(user.email, otp, user.fullName || 'Khách hàng');
  
  success(res, null, 'Mã OTP đã được gửi đến email của bạn');
});

exports.cancelRecurringGroup = catchAsync(async (req, res) => {
  if (req.user.role === 'customer') {
    const Booking = require('../models/booking.schema');
    const bookings = await Booking.find({ recurringGroupId: req.params.groupId, status: { $in: ['pending', 'confirmed'] } });
    
    if (bookings.length === 0) {
      throw Object.assign(new Error('Không tìm thấy lịch nào trong nhóm này'), { statusCode: 404 });
    }
    
    const otp = req.body.otp;
    if (!otp) {
      throw Object.assign(new Error('Vui lòng nhập mã OTP để xác nhận hủy'), { statusCode: 400 });
    }
    
    const firstBooking = bookings[0];
    if (!firstBooking.cancelOtpToken || !firstBooking.cancelOtpExpires || Date.now() > firstBooking.cancelOtpExpires) {
      throw Object.assign(new Error('Mã OTP đã hết hạn hoặc chưa được yêu cầu'), { statusCode: 400 });
    }
    
    const bcrypt = require('bcryptjs');
    const isMatch = bcrypt.compareSync(otp, firstBooking.cancelOtpToken);
    if (!isMatch) {
      throw Object.assign(new Error('Mã OTP không chính xác'), { statusCode: 400 });
    }
    
    firstBooking.cancelOtpToken = undefined;
    firstBooking.cancelOtpExpires = undefined;
    await firstBooking.save();
  }

  const result = await bookingService.cancelRecurringGroup(req.params.groupId, req.userId, req.user.role);
  sseService.broadcastToAll('slots_updated');
  sseService.sendToUser(req.userId, 'my_bookings_updated', {});
  success(res, result, `Cancelled ${result.cancelled} bookings in recurring group`);
});

exports.getAllBookings = catchAsync(async (req, res) => {
  const bookings = await bookingService.getAllBookings(req.query, req.user.role, req.userId);
  success(res, bookings, 'Đã lấy danh sách đặt lịch');
});

exports.getMyBookings = catchAsync(async (req, res) => {
  const result = await bookingService.getAllBookings(req.query, 'customer', req.userId);
  success(res, result, 'Đã lấy danh sách đặt lịch của tôi');
});

exports.getBookingsByUser = catchAsync(async (req, res) => {
  const { period } = req.query;
  let startDate;
  if (period === 'today') {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'month') {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const bookings = await bookingService.getBookingsByUser(req.params.userId, startDate);
  success(res, bookings, 'Đã lấy danh sách đặt lịch của khách hàng');
});

exports.getBookingsByVehicle = catchAsync(async (req, res) => {
  const { period } = req.query;
  let startDate;
  if (period === 'today') {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === 'month') {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const bookings = await bookingService.getBookingsByVehicle(req.params.vehicleId, startDate);
  success(res, bookings, 'Đã lấy danh sách đặt lịch của xe');
});

exports.getBookingById = catchAsync(async (req, res) => {
  const booking = await bookingService.getBookingById(req.params.id, req.user.role, req.userId, req.user.branchId);
  success(res, booking, 'Đã lấy thông tin đặt lịch');
});

exports.updateBooking = catchAsync(async (req, res) => {
  const booking = await bookingService.updateBooking(req.params.id, req.body, req.user.role, req.userId);
  sseService.broadcastToAll('slots_updated');
  if (booking && booking.userId) sseService.sendToUser(booking.userId?._id || booking.userId, 'my_bookings_updated', {});
  success(res, booking, 'Cập nhật lịch hẹn thành công');
});

exports.updateWalkInInfo = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, licensePlate, vehicleType, brand, color } = req.body;
  
  const booking = await require('../models/booking.schema').findById(id).populate('userId').populate('vehicleId');
  if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404 });
  
  if (req.user.role === 'manager' && booking.branchId.toString() !== req.user.branchId.toString()) {
    throw Object.assign(new Error('Không có quyền'), { statusCode: 403 });
  }

  if (booking.userId) {
    if (name) booking.userId.name = name;
    if (phone) booking.userId.phone = phone;
    if (email) booking.userId.email = email;
    await booking.userId.save();
  }

  if (booking.vehicleId) {
    if (licensePlate) booking.vehicleId.licensePlate = licensePlate;
    if (vehicleType) booking.vehicleId.vehicleType = vehicleType;
    if (brand) booking.vehicleId.brand = brand;
    if (color) booking.vehicleId.color = color;
    await booking.vehicleId.save();
  }

  if (licensePlate && booking.vehiclePlate !== licensePlate) {
    booking.vehiclePlate = licensePlate;
    await booking.save();
  }

  const updatedBooking = await require('../models/booking.schema').findById(id)
    .populate('userId', 'name email phone tier')
    .populate('vehicleId', 'licensePlate vehicleType brand color');

  success(res, updatedBooking, 'Cập nhật thông tin khách hàng & xe thành công');
});

exports.updateBookingStatus = catchAsync(async (req, res) => {
  const updateData = { ...req.body };
  if (req.body.status === 'checked_in') {
    updateData.staffId = req.userId;
  }
  const booking = await bookingService.updateBookingStatus(req.params.id, req.body.status, updateData, req.user.role, req.user.branchId, req.userId);
  sseService.broadcastToAll('slots_updated');
  if (booking && booking.userId) sseService.sendToUser(booking.userId?._id || booking.userId, 'my_bookings_updated', {});
  if (req.body.status === 'checked_in' && booking) {
    const targetBranchId = booking.branchId?._id || booking.branchId;
    if (targetBranchId) sseService.broadcastToManagers(targetBranchId, 'customer_checked_in_via_qr', { bookingId: booking._id });
    sseService.broadcastToAll('customer_checked_in_via_qr', { bookingId: booking._id });
  }
  success(res, booking, 'Cập nhật trạng thái đặt lịch thành công');
});

exports.requestCheckin = catchAsync(async (req, res) => {
  const { branchId } = req.body;
  const Booking = require('../models/booking.schema');
  const booking = await Booking.findById(req.params.id)
    .populate('userId', 'name fullName phone email avatar')
    .populate('vehicleId')
    .populate('packageId')
    .populate('branchId');

  if (!booking) {
    throw Object.assign(new Error('Đơn hàng không tồn tại'), { statusCode: 404 });
  }

  if (branchId && booking.branchId && String(booking.branchId._id || booking.branchId) !== String(branchId)) {
    throw Object.assign(new Error('Mã QR không thuộc chi nhánh của đơn hàng này!'), { statusCode: 400 });
  }

  const targetBranchId = String(booking.branchId?._id || booking.branchId);

  sseService.broadcastToManagers(targetBranchId, 'customer_checkin_request', {
    bookingId: booking._id,
    booking,
    branchId: targetBranchId,
  });
  sseService.broadcastToAll('customer_checkin_request', {
    bookingId: booking._id,
    booking,
    branchId: targetBranchId,
  });

  success(res, { bookingId: booking._id }, 'Đã gửi yêu cầu check-in tới Quản lý');
});

exports.rejectCheckin = catchAsync(async (req, res) => {
  const Booking = require('../models/booking.schema');
  const booking = await Booking.findById(req.params.id);
  if (booking && booking.userId) {
    sseService.sendToUser(String(booking.userId?._id || booking.userId), 'checkin_rejected', {
      bookingId: booking._id,
      reason: req.body.reason || 'Quản lý từ chối / hủy yêu cầu check-in',
    });
  }
  sseService.broadcastToAll('checkin_rejected', { bookingId: req.params.id });
  success(res, null, 'Đã từ chối yêu cầu check-in');
});

exports.customerScanCheckin = catchAsync(async (req, res) => {
  const { branchId } = req.body;
  if (!branchId) throw Object.assign(new Error('Thiếu thông tin branchId từ mã QR'), { statusCode: 400 });

  const Booking = require('../models/booking.schema');
  const existingBooking = await Booking.findById(req.params.id);
  if (!existingBooking) throw Object.assign(new Error('Đơn hàng không tồn tại'), { statusCode: 404 });
  
  if (existingBooking.branchId.toString() !== branchId) {
     throw Object.assign(new Error('Mã QR không thuộc chi nhánh của đơn hàng này!'), { statusCode: 400 });
  }

  // Manager updates are normally staffId=req.userId, but here it's customer
  const updateData = { staffId: null, checkinMethod: 'qr_scan_customer' }; 

  // bookingService.updateBookingStatus handles validation
  const booking = await bookingService.updateBookingStatus(
    req.params.id, 
    'checked_in', 
    updateData, 
    'customer', // role: customer checking themselves in
    null, // userBranchId not needed for customer
    req.userId
  );

  sseService.broadcastToAll('slots_updated');
  if (booking && booking.userId) sseService.sendToUser(booking.userId?._id || booking.userId, 'my_bookings_updated', {});
  
  // Broadcast to managers of the branch that a customer checked in
  sseService.broadcastToManagers(booking.branchId, 'customer_checked_in_via_qr', { bookingId: booking._id });

  success(res, booking, 'Quét mã Check-in thành công');
});

exports.updateSubServices = catchAsync(async (req, res) => {
  const booking = await bookingService.updateSubServices(req.params.id, req.body.subServices, req.user.role, req.user.branchId, req.userId);
  sseService.broadcastToAll('slots_updated');
  if (booking && booking.userId) sseService.sendToUser(booking.userId?._id || booking.userId, 'my_bookings_updated', {});
  success(res, booking, 'Cập nhật dịch vụ phụ thành công');
});

exports.extendGracePeriod = catchAsync(async (req, res) => {
  const booking = await bookingService.extendGracePeriod(req.params.id, req.user.role, req.user.branchId);
  success(res, booking, 'Đã gia hạn thời gian check-in cho đơn');
});

exports.getCancelPreview = catchAsync(async (req, res) => {
  const preview = await bookingService.getCancelPreview(req.params.id, req.userId);
  success(res, preview, 'Xem trước hủy lịch');
});

exports.requestCancelOtp = catchAsync(async (req, res) => {
  const emailService = require('../services/email.service');
  const Booking = require('../models/booking.schema');
  
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404 });
  if (String(booking.userId) !== String(req.userId)) {
    throw Object.assign(new Error('Không có quyền hủy lịch hẹn này'), { statusCode: 403 });
  }
  if (['in_progress', 'completed', 'cancelled'].includes(booking.status)) {
    throw Object.assign(new Error('Không thể yêu cầu OTP hủy lúc này'), { statusCode: 400 });
  }

  // Need user email
  const User = require('../models/user.schema');
  const user = await User.findById(req.userId);
  if (!user || !user.email) {
    throw Object.assign(new Error('Tài khoản của bạn chưa có email. Vui lòng cập nhật email để nhận mã OTP!'), { statusCode: 400 });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const bcrypt = require('bcryptjs');
  
  booking.cancelOtpToken = bcrypt.hashSync(otp, 12);
  booking.cancelOtpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
  await booking.save();

  console.log(`[CANCEL OTP BOOKING] User: ${user.email}, Booking: ${booking.bookingCode || booking._id}, OTP: ${otp}`);

  try {
    await emailService.sendCancellationOtpEmail(user.email, otp);
  } catch (e) {
    console.error('Lỗi gửi OTP hủy đơn:', e);
    throw Object.assign(new Error(`Không thể gửi email OTP đến ${user.email}: ${e.message || 'Lỗi hệ thống email'}`), { statusCode: 500 });
  }

  success(res, null, `Mã OTP đã được gửi thành công đến email ${user.email}`);
});

exports.cancelBooking = catchAsync(async (req, res) => {
  const reason = req.body.cancellationReason || req.body.reason || 'Khách hàng yêu cầu hủy đơn';
  
  if (req.user.role === 'customer') {
    const Booking = require('../models/booking.schema');
    const bookingDoc = await Booking.findById(req.params.id);
    if (!bookingDoc) {
      throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404 });
    }
    
    const otp = req.body.otp;
    if (!otp) {
      throw Object.assign(new Error('Vui lòng nhập mã OTP để xác nhận hủy'), { statusCode: 400 });
    }
    
    if (!bookingDoc.cancelOtpToken || !bookingDoc.cancelOtpExpires || Date.now() > bookingDoc.cancelOtpExpires) {
      throw Object.assign(new Error('Mã OTP đã hết hạn hoặc chưa được yêu cầu'), { statusCode: 400 });
    }
    
    const bcrypt = require('bcryptjs');
    const isMatch = bcrypt.compareSync(otp, bookingDoc.cancelOtpToken);
    if (!isMatch) {
      throw Object.assign(new Error('Mã OTP không chính xác'), { statusCode: 400 });
    }
    
    bookingDoc.cancelOtpToken = undefined;
    bookingDoc.cancelOtpExpires = undefined;
    await bookingDoc.save();
  }

  const booking = await bookingService.cancelBooking(req.params.id, req.userId, req.user.role, reason);

  sseService.broadcastToAll('slots_updated');
  if (booking && booking.userId) sseService.sendToUser(booking.userId?._id || booking.userId, 'my_bookings_updated', {});
  success(res, booking, 'Hủy lịch thành công');
});
exports.deleteBooking = catchAsync(async (req, res) => {
  await bookingService.deleteBooking(req.params.id, req.user.role);
  sseService.broadcastToAll('slots_updated');
  success(res, null, 'Đã xóa đặt lịch');
});

exports.refundComplete = catchAsync(async (req, res) => {
  const Booking = require('../models/booking.schema');
  const booking = await Booking.findById(req.params.id);
  
  if (!booking) {
    throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404 });
  }
  if (booking.refundStatus !== 'pending') {
    throw Object.assign(new Error('Lịch hẹn này không chờ hoàn tiền'), { statusCode: 400 });
  }
  
  booking.refundStatus = 'completed';
  await booking.save();
  
  success(res, booking, 'Đã xác nhận hoàn tiền thành công');
});

exports.deleteBookingsByDateRange = catchAsync(async (req, res) => {
  const { dateFrom, dateTo, all } = req.query;
  let result;
  if (all === 'true') {
    result = await bookingService.deleteAllBookings();
  } else {
    if (!dateFrom || !dateTo) {
      throw Object.assign(new Error('Vui lòng cung cấp dateFrom và dateTo'), { statusCode: 400 });
    }
    result = await bookingService.deleteBookingsByDateRange(dateFrom, dateTo);
  }
  sseService.broadcastToAll('slots_updated');
  success(res, result, `Đã xóa ${result.deletedCount} đặt lịch`);
});

exports.getAvailableSlots = catchAsync(async (req, res) => {
  const { branchId, date, packageId } = req.query;
  console.log('--- GET SLOTS CALLED ---', req.query);
  const slots = await bookingService.getAvailableSlots(branchId, date, packageId);
  console.log('--- SLOTS RETURNED ---', slots.length);
  success(res, slots, 'Đã lấy danh sách khung giờ trống');
});

exports.linkProvisionalPayment = catchAsync(async (req, res) => {
  const { transactionId, bookingId, paymentType } = req.body;
  const payment = await paymentService.linkProvisionalPayment(transactionId, bookingId, paymentType);
  success(res, payment, 'Liên kết thanh toán tạm tính thành công');
});

exports.createPayment = catchAsync(async (req, res) => {
  const { bookingId, method, paymentType, amount } = req.body;
  const payment = await paymentService.createPayment(bookingId, req.userId, req.user.role, method, paymentType || 'full', amount);
  
  const result = payment.toObject ? payment.toObject() : { ...payment };
  
  if (method === 'bank') {
    result.bankInfo = {
      bankName: process.env.SEPAY_BANK_NAME || 'Ngân hàng TMCP Quân đội (MB)',
      bankId: process.env.SEPAY_BANK_ID || 'MB',
      accountNumber: process.env.SEPAY_BANK_ACCOUNT || '',
      accountHolder: process.env.SEPAY_ACCOUNT_NAME || 'CONG TY CO PHAN AUTO WASH PRO',
      transferContent: `${paymentType === 'full' ? 'THANH TOAN' : 'DAT COC'} ${payment.transactionId}`,
    };
  }
  
  success(res, result, 'Tạo thanh toán thành công', 201);
});

exports.confirmBookings = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const result = await bookingService.confirmBookings(ids, req.user.role, req.userId);
  const parts = [`Đã xác nhận ${result.confirmed} đơn`];
  if (result.skippedCount > 0) {
    parts.push(`${result.skippedCount} đơn bị bỏ qua vì chưa đặt cọc`);
  }
  success(res, result, parts.join(' — '));
});

exports.confirmPayment = catchAsync(async (req, res) => {
  const { transactionId, method, gatewayTransactionId } = req.body;
  const payment = await paymentService.confirmPayment(transactionId, method, gatewayTransactionId, req.user.role, req.userId);
  success(res, payment, 'Xác nhận thanh toán thành công');
});

exports.getPaymentByBooking = catchAsync(async (req, res) => {
  const payment = await paymentService.getPaymentByBooking(req.params.bookingId, req.userId, req.user.role);
  success(res, payment, 'Đã lấy thông tin thanh toán');
});

exports.getBookingPaymentHistory = catchAsync(async (req, res) => {
  const payments = await paymentService.getBookingPaymentHistory(req.params.bookingId, req.user.role, req.userId);
  success(res, payments, 'Đã lấy lịch sử thanh toán');
});

exports.getPaymentById = catchAsync(async (req, res) => {
  const payment = await paymentService.getPaymentById(req.params.id, req.user.role, req.userId);
  if (!payment) throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
  
  const result = payment.toObject ? payment.toObject() : { ...payment };
  if (result.method === 'bank') {
    result.bankInfo = {
      bankName: process.env.SEPAY_BANK_NAME || 'Ngân hàng TMCP Quân đội (MB)',
      bankId: process.env.SEPAY_BANK_ID || 'MB',
      accountNumber: process.env.SEPAY_BANK_ACCOUNT || '',
      accountHolder: process.env.SEPAY_ACCOUNT_NAME || 'CONG TY CO PHAN AUTO WASH PRO',
      transferContent: `${result.paymentType === 'full' ? 'THANH TOAN' : 'DAT COC'} ${result.transactionId}`,
    };
  }
  
  success(res, result, 'Đã lấy thông tin thanh toán');
});

exports.getAllPayments = catchAsync(async (req, res) => {
  const result = await paymentService.getAllPayments(req.query, req.user.role, req.userId);
  success(res, result, 'Đã lấy danh sách thanh toán');
});

exports.getMyPayments = catchAsync(async (req, res) => {
  const result = await paymentService.getMyPaymentHistory(req.userId, req.query);
  success(res, result.data, 'Đã lấy danh sách thanh toán của tôi', 200, result.pagination);
});

exports.markPaymentViewed = catchAsync(async (req, res) => {
  const payment = await paymentService.markPaymentViewed(req.params.id, req.user.role, req.userId);
  success(res, payment, 'Đánh dấu thanh toán đã xem');
});

exports.countUnviewedPayments = catchAsync(async (req, res) => {
  const count = await paymentService.countUnviewedPayments();
  success(res, { count }, 'Số lượng thanh toán chưa xem');
});

exports.refundPayment = catchAsync(async (req, res) => {
  const { bookingId } = req.body;
  const payment = await paymentService.refundPayment(bookingId, req.user.role, req.userId);
  success(res, payment, 'Đã hoàn tiền');
});

exports.deletePaymentsByDateRange = catchAsync(async (req, res) => {
  const { dateFrom, dateTo, all } = req.query;
  let result;
  if (all === 'true') {
    result = await paymentService.deleteAllPayments();
  } else {
    if (!dateFrom || !dateTo) {
      throw Object.assign(new Error('Vui lòng cung cấp dateFrom và dateTo'), { statusCode: 400 });
    }
    result = await paymentService.deletePaymentsByDateRange(dateFrom, dateTo);
  }
  success(res, result, `Đã xóa ${result.deletedCount} giao dịch`);
});

exports.deletePaymentById = catchAsync(async (req, res) => {
  const result = await paymentService.deletePaymentById(req.params.id);
  success(res, result, 'Đã xóa giao dịch');
});


exports.getFeedbacks = catchAsync(async (req, res) => {
  const feedbacks = await bookingService.getFeedbacks(req.user, req.query);
  success(res, feedbacks, 'Đã lấy danh sách đánh giá');
});

exports.getCustomers = catchAsync(async (req, res) => {
  const customers = await bookingService.getCustomers(req.user, req.query);
  success(res, customers, 'Đã lấy danh sách khách hàng');
});

exports.submitFeedback = catchAsync(async (req, res) => {
  const { rating, feedback } = req.body;
  const booking = await bookingService.submitFeedback(req.params.id, req.userId, { rating, feedback });
  success(res, booking, 'Gửi đánh giá thành công');
});

exports.replyToFeedback = catchAsync(async (req, res) => {
  const booking = await bookingService.replyToFeedback(req.params.id, req.userId, req.body.reply);
  success(res, booking, 'Gửi phản hồi thành công');
});

exports.deleteSingleFeedback = catchAsync(async (req, res) => {
  const result = await bookingService.deleteSingleFeedback(req.params.id);
  sseService.broadcastToAll('feedback_new');
  success(res, result, 'Đã xóa đánh giá thành công');
});

exports.deleteFeedbacksByDateRange = catchAsync(async (req, res) => {
  const { dateFrom, dateTo, all } = req.query;
  const result = await bookingService.deleteFeedbacksByDateRange(dateFrom, dateTo, all === 'true');
  sseService.broadcastToAll('feedback_new');
  success(res, result, `Đã xóa ${result.deletedCount} đánh giá`);
});

exports.rebookBooking = catchAsync(async (req, res) => {
  const { bookingDate, startTime, selectedSubServices, voucherCode } = req.body;
  const booking = await bookingService.rebookBooking(req.params.id, req.userId, req.user.role, { bookingDate, startTime, selectedSubServices, voucherCode });
  success(res, booking, 'Đặt lại lịch thành công', 201);
});

exports.getBookingQR = catchAsync(async (req, res) => {
  const booking = await bookingService.getBookingById(req.params.id, req.user.role, req.userId, req.user.branchId);
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
  // QR payload: JSON with bookingId + branchId for cross-validation
  const payload = JSON.stringify({ bookingId: String(booking._id), branchId: String(booking.branchId?._id || booking.branchId) });
  const dataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: 300 });
  success(res, { qrDataUrl: dataUrl, bookingId: booking._id }, 'QR generated');
});

exports.sepayWebhook = catchAsync(async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^(Apikey|Bearer)\s+/i, '').trim();
  if (process.env.SEPAY_API_KEY && token !== process.env.SEPAY_API_KEY) {
    return res.status(401).json({ success: false, message: 'Mã API Key không hợp lệ' });
  }

  const { content, referenceCode, transferType } = req.body;
  
  // Chỉ xử lý giao dịch nhận tiền
  if (transferType !== 'in') {
    return res.json({ success: true, message: 'Đã bỏ qua giao dịch tiền ra' });
  }

  // Tìm mã giao dịch trong nội dung (ví dụ: TXN123456ABC)
  // content có thể là "WASHPRO TXN123456ABC"
  const match = content ? content.match(/TXN\d+[A-Z0-9]+/) : null;
  if (!match) {
    return res.json({ success: true, message: 'Không tìm thấy mã giao dịch trong nội dung chuyển khoản' });
  }

  const transactionId = match[0];
  
  try {
    const payment = await paymentService.confirmPaymentCallback(transactionId, referenceCode || 'SEPAY', true);
    success(res, payment, 'Xử lý webhook SePay thành công');
  } catch (err) {
    // Trả về 200 để SePay không gửi lại webhook nếu giao dịch đã được xử lý hoặc không hợp lệ
    console.error('SePay Webhook error:', err.message);
    res.json({ success: true, message: err.message });
  }
});

exports.simulatePayment = catchAsync(async (req, res) => {
  const { transactionId, gatewayTransactionId } = req.body;
  const payment = await paymentService.confirmPaymentCallback(transactionId, gatewayTransactionId || 'SIMULATED', true);
  success(res, payment, 'Mô phỏng thanh toán thành công');
});

exports.createVnpayProvisional = catchAsync(async (req, res) => {
  const { amount, paymentType } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Số tiền thanh toán không hợp lệ' });
  }
  const ipAddr = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

  const paymentService = require('../services/payment.service');
  const Payment = require('../models/payment.schema');

  const transactionId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  const client = req.body.client || 'web';
  const payment = new Payment({
    userId: req.userId,
    amount,
    method: 'vnpay',
    paymentType: paymentType || 'full',
    status: 'pending',
    transactionId,
    client,
  });
  await payment.save();

  const baseReturnUrl = process.env.VNPAY_RETURN_URL;
  const targetReturnUrl = baseReturnUrl || undefined;

  const vnpayUrl = vnpayService.createPaymentUrl({
    amount,
    ipAddr,
    txnRef: transactionId,
    returnUrl: targetReturnUrl,
  });

  success(res, { paymentUrl: vnpayUrl, transactionId, payment }, 'Đã tạo URL thanh toán VNPay tạm tính');
});

exports.createBankProvisional = catchAsync(async (req, res) => {
  const { amount, paymentType } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Số tiền thanh toán không hợp lệ' });
  }
  const paymentService = require('../services/payment.service');
  const payment = await paymentService.createProvisionalBankPayment(req.userId, amount, paymentType || 'deposit');
  
  const result = payment.toObject ? payment.toObject() : { ...payment };
  result.bankInfo = {
    bankName: process.env.SEPAY_BANK_NAME || 'Ngân hàng TMCP Quân đội (MB)',
    bankId: process.env.SEPAY_BANK_ID || 'MB',
    accountNumber: process.env.SEPAY_BANK_ACCOUNT || '',
    accountHolder: process.env.SEPAY_ACCOUNT_NAME || 'CONG TY CO PHAN AUTO WASH PRO',
    transferContent: `${paymentType === 'topup' ? 'NAP VI' : paymentType === 'full' ? 'THANH TOAN' : 'DAT COC'} ${payment.transactionId}`,
  };
  
  success(res, result, 'Tạo thanh toán tạm tính ngân hàng thành công');
});

exports.vnpayCallback = catchAsync(async (req, res) => {
  const { transactionId, gatewayTransactionId, status: paymentStatus } = req.body;
  if (!transactionId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin mã giao dịch' });
  }
  const isSuccess = paymentStatus !== 'failed';
  const payment = await paymentService.confirmPaymentCallback(transactionId, gatewayTransactionId || 'VNPAY', isSuccess);
  success(res, payment, isSuccess ? 'Thanh toán VNPay đã được xác nhận' : 'Thanh toán VNPay thất bại');
});

exports.createVnpayPayment = catchAsync(async (req, res) => {
  const { bookingId, paymentType, amount, returnUrl } = req.body;
  const ipAddr = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

  // Tạo payment record trước
  const payment = await paymentService.createPayment(bookingId, req.userId, req.user.role, 'vnpay', paymentType || 'deposit', amount);
  const client = req.body.client || 'web';

  // Lưu client type vào payment record
  const Payment = require('../models/payment.schema');
  await Payment.findByIdAndUpdate(payment._id, { client });

  const baseReturnUrl = process.env.VNPAY_RETURN_URL;
  const targetReturnUrl = baseReturnUrl || undefined;

  const vnpayUrl = vnpayService.createPaymentUrl({
    amount: payment.amount,
    ipAddr,
    txnRef: payment.transactionId,
    returnUrl: targetReturnUrl,
  });

  success(res, { paymentUrl: vnpayUrl, transactionId: payment.transactionId, payment }, 'VNPay URL created');
});

const sendMobileRedirect = (res, deepLink) => {
  console.log('VNPay Return → Mobile redirect HTML to:', deepLink);
  return res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Đang chuyển hướng về ứng dụng...</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
        .card { text-align: center; background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 90%; width: 360px; }
        .icon { width: 56px; height: 56px; background: #dcfce7; color: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem auto; font-size: 28px; font-weight: bold; }
        .btn { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background-color: #1E88E5; color: white; text-decoration: none; border-radius: 0.5rem; font-weight: 600; width: 100%; box-sizing: border-box; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✓</div>
        <h2 style="margin: 0 0 0.5rem 0; font-size: 20px;">Thanh toán hoàn tất</h2>
        <p style="color: #64748b; font-size: 14px; margin: 0;">Đang mở ứng dụng AutoWash Pro...</p>
        <a href="${deepLink}" class="btn">Mở lại ứng dụng</a>
      </div>
      <script>
        window.location.href = "${deepLink}";
        setTimeout(function() {
          window.location.replace("${deepLink}");
        }, 300);
      </script>
    </body>
    </html>
  `);
};

exports.handleVnpayReturn = catchAsync(async (req, res) => {
  console.log('=== VNPay Return Called ===');
  console.log('VNPay Return query:', JSON.stringify(req.query));
  const result = vnpayService.verifyReturnUrl(req.query);

  const feUrl = process.env.NODE_ENV === 'production' ? (process.env.FE_URL || 'http://localhost:5173') : 'http://localhost:5173';
  const resultJson = JSON.stringify(result);
  const encoded = encodeURIComponent(resultJson);

  const txnRef = result.data?.txnRef || req.query.vnp_TxnRef;

  // Lookup payment record → determine client type & bookingId
  let isMobile = false;
  let mobileBookingId = '';
  let isTopup = false;
  let isSlotPack = false;

  if (txnRef) {
    try {
      const Payment = require('../models/payment.schema');
      const paymentRecord = await Payment.findOne({ transactionId: txnRef });
      if (paymentRecord) {
        isMobile = paymentRecord.client === 'mobile';
        mobileBookingId = paymentRecord.bookingId ? String(paymentRecord.bookingId) : '';
        isTopup = paymentRecord.paymentType === 'topup';
        isSlotPack = !!paymentRecord.slotPackId;
        console.log('VNPay Return payment lookup:', {
          txnRef,
          client: paymentRecord.client,
          isMobile,
          mobileBookingId,
          isTopup,
          isSlotPack,
          paymentType: paymentRecord.paymentType,
          status: paymentRecord.status,
        });
      } else {
        console.log('VNPay Return: no payment found for txnRef:', txnRef);
      }
    } catch (e) {
      console.error('Error looking up payment:', e.message);
    }
  }

  let mobileDeepLink = `autowashpro://payment/checkout?bookingId=${encodeURIComponent(mobileBookingId)}&vnpay_result=${encoded}`;
  if (isSlotPack) {
    mobileDeepLink = `autowashpro://slot-packs?vnpay_result=${encoded}`;
  } else if (isTopup) {
    mobileDeepLink = `autowashpro://wallet?vnpay_result=${encoded}`;
  }

  if (result.success) {
    try {
      const payment = await paymentService.confirmPaymentCallback(txnRef, result.data.transactionNo || 'VNPAY', true);
      console.log('VNPay Return confirmPaymentCallback result:', { paymentId: payment?._id, status: payment?.status, bookingId: payment?.bookingId });
      if (isMobile) {
        return sendMobileRedirect(res, mobileDeepLink);
      }
      if (isTopup) {
        return res.redirect(302, `${feUrl}/profile?tab=wallet&vnpay_result=${encoded}`);
      }
      // Provisional & slot pack đều redirect về / (App routing handles dispatch)
      if (payment && (!payment.bookingId || payment.slotPackId)) {
        return res.redirect(302, `${feUrl}/?vnpay_result=${encoded}`);
      }
      // Pay remaining cho booking đã tồn tại → redirect về history
      if (payment && payment.bookingId) {
        return res.redirect(302, `${feUrl}/history?vnpay_result=${encoded}`);
      }
    } catch (err) {
      console.error('VNPay Return confirmPayment error:', err.message);
    }
  } else {
    console.log('VNPay Return: signature verification failed:', result.message);
  }

  if (isMobile) {
    return sendMobileRedirect(res, mobileDeepLink);
  }
  if (isTopup) {
    return res.redirect(302, `${feUrl}/profile?tab=wallet&vnpay_result=${encoded}`);
  }
  return res.redirect(302, `${feUrl}/history?vnpay_result=${encoded}`);
});

exports.handleVnpayIPN = catchAsync(async (req, res) => {
  console.log('=== VNPay IPN Called ===');
  const result = vnpayService.verifyReturnUrl(req.query);

  if (result.success) {
    const txnRef = result.data.txnRef;
    try {
      await paymentService.confirmPaymentCallback(txnRef, result.data.transactionNo || 'VNPAY', true);
    } catch (err) {
      console.error('IPN confirm error:', err.message);
    }
    return res.json({ RspCode: '00', Message: 'Confirm Success' });
  }

  return res.json({ RspCode: '97', Message: 'Invalid signature' });
});
