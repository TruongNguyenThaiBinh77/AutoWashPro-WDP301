const mongoose = require('mongoose');
const { SlotPack, Package, Branch, Vehicle, User, Booking } = require('../models');
const voucherService = require('./voucher.service');
const notificationService = require('./notification.service');
const configService = require('./config.service');
const loyaltyService = require('./loyalty.service');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Tính % chiết khấu dựa theo số lượng slot từ SystemConfig */
async function getDiscountPercent(totalSlots) {
  const discounts = await configService.get('SLOT_PACK_DISCOUNTS', {}, [
    { minSlots: 20, discountPercent: 15 },
    { minSlots: 10, discountPercent: 10 },
    { minSlots: 5, discountPercent: 5 }
  ]);
  const sorted = Array.isArray(discounts) ? [...discounts].sort((a, b) => b.minSlots - a.minSlots) : [];
  const match = sorted.find(d => totalSlots >= d.minSlots);
  return match ? match.discountPercent : 0;
}

/** Sinh mã pack duy nhất: SP-XXXXXX */
function generatePackCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'SP-';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

/** Đảm bảo mã pack unique (thử lại tối đa 5 lần) */
async function generateUniquePackCode() {
  for (let i = 0; i < 5; i++) {
    const code = generatePackCode();
    const exists = await SlotPack.findOne({ packCode: code });
    if (!exists) return code;
  }
  throw new Error('Không thể tạo mã gói, vui lòng thử lại');
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Tạo gói slot mới.
 * Chiết khấu tự động theo số lượng, sau đó áp thêm voucher nếu có.
 */
exports.createSlotPack = async (data) => {
  const { userId, branchId, packageId, vehicleId, totalSlots, voucherCode, expiresAt } = data;
  const session = await mongoose.startSession();
  let slotPack;

  try {
    await session.withTransaction(async () => {
      // --- Validate entities ---
      const [pkg, user] = await Promise.all([
        Package.findById(packageId).session(session),
        User.findById(userId).session(session),
      ]);

      let branch = null;
      if (branchId) {
        branch = await Branch.findById(branchId).session(session);
        if (!branch) throw Object.assign(new Error('Chi nhánh không tồn tại'),   { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
        if (branch.status === 'inactive') throw Object.assign(new Error('Chi nhánh hiện không khả dụng'),   { statusCode: 400, code: 'BRANCH_UNAVAILABLE' });
      }

      let vehicle = null;
      if (vehicleId) {
        vehicle = await Vehicle.findById(vehicleId).session(session);
        if (!vehicle) throw Object.assign(new Error('Xe không tồn tại'), { statusCode: 404, code: 'VEHICLE_NOT_FOUND' });
        if (String(vehicle.userId) !== String(userId)) {
          throw Object.assign(new Error('Xe không thuộc về bạn'), { statusCode: 403, code: 'FORBIDDEN' });
        }
      }

      if (!pkg)    throw Object.assign(new Error('Gói dịch vụ không tồn tại'),  { statusCode: 404, code: 'PACKAGE_NOT_FOUND' });
      if (!user)   throw Object.assign(new Error('Người dùng không tồn tại'),     { statusCode: 404, code: 'USER_NOT_FOUND' });
      if (pkg.status === 'inactive')    throw Object.assign(new Error('Gói dịch vụ hiện không khả dụng'),  { statusCode: 400, code: 'PACKAGE_UNAVAILABLE' });
      if (pkg.branchId && branchId && String(pkg.branchId) !== String(branchId)) {
        throw Object.assign(new Error('Gói dịch vụ không thuộc chi nhánh này'), { statusCode: 400, code: 'PACKAGE_BRANCH_MISMATCH' });
      }

      const maxSlotQty = await configService.get('MAX_SLOT_PACK_QUANTITY', {}, 50);
      if (!Number.isInteger(totalSlots) || totalSlots < 1 || totalSlots > maxSlotQty) {
        throw Object.assign(new Error(`Số lượng gói phải từ 1 đến ${maxSlotQty}`), { statusCode: 400, code: 'INVALID_SLOTS' });
      }

      // --- Chiết khấu theo số lượng và hạng VIP ---
      const unitPrice = pkg.price;
      let discountPercent = await getDiscountPercent(totalSlots);
      const vipBonusMap = await configService.get('SLOT_PACK_VIP_BONUS_DISCOUNTS', {}, { gold: 2, diamond: 5, Ruby: 5 });
      if (vipBonusMap && vipBonusMap[user.tier]) {
        discountPercent += vipBonusMap[user.tier];
      }
      if (discountPercent > 100) discountPercent = 100;

      const grossTotal = unitPrice * totalSlots;
      const qtyDiscount = Math.floor(grossTotal * discountPercent / 100);
      let baseTotal = grossTotal - qtyDiscount; // sau chiết khấu số lượng + VIP

      // --- Priority dựa theo tier (Động theo cấu hình minPoints) ---
      const priority = await loyaltyService.getTierPriority(user.tier);

      // --- Voucher (áp trên baseTotal) ---
      let voucherDiscount = 0;
      let finalPriceAfterVoucher = baseTotal;
      let appliedVoucherCode = null;

      if (voucherCode) {
        const vResult = await voucherService.validateVoucher(voucherCode, { amount: baseTotal }, userId);
        voucherDiscount = vResult.discountAmount;
        finalPriceAfterVoucher = Math.max(0, baseTotal - voucherDiscount);
        appliedVoucherCode = voucherCode.trim().toUpperCase();
      }

      // --- Sinh mã pack ---
      const packCode = await generateUniquePackCode();

      // --- Tạo SlotPack ---
      slotPack = new SlotPack({
        userId, branchId, packageId, vehicleId,
        totalSlots,
        remainingSlots: totalSlots,
        usedSlots: 0,
        packageName: pkg.name,
        packageDuration: pkg.duration,
        unitPrice,
        discountPercent,
        discountAmount: qtyDiscount,
        finalPrice: baseTotal,
        voucherCode: appliedVoucherCode,
        voucherDiscount,
        finalPriceAfterVoucher,
        priority,
        packCode,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        status: 'active',
        paymentStatus: 'unpaid',
      });

      await slotPack.save({ session });

      // Reserve voucher nếu có
      if (appliedVoucherCode) {
        await voucherService.reserveVoucher(appliedVoucherCode, userId, slotPack._id, voucherDiscount, session);
      }
    });

    // Populate data for notification
    const pkg = await Package.findById(packageId);

    notificationService.send(
      data.userId,
      'Đã mua gói slot thành công',
      `Gói ${data.totalSlots} lần rửa xe ${pkg.name} — Mã: ${slotPack.packCode}. ${slotPack.discountPercent > 0 ? `Chiết khấu ${slotPack.discountPercent}% số lượng.` : ''}`,
      'slot_pack_created',
      { slotPackId: slotPack._id }
    ).catch(() => {});

    return slotPack;
  } catch (err) {
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Read ─────────────────────────────────────────────────────────────────────

exports.getMySlotPacks = async (userId, filters = {}) => {
  const query = { userId };
  if (filters.status) query.status = filters.status;
  if (filters.branchId) query.branchId = filters.branchId;

  return SlotPack.find(query)
    .populate('branchId',  'name address')
    .populate('packageId', 'name price duration subServices')
    .populate('vehicleId', 'licensePlate vehicleType brand color')
    .sort({ createdAt: -1 });
};

exports.getAllSlotPacks = async (filters = {}, userRole, userBranchId) => {
  const query = {};
  if (filters.userId)   query.userId   = filters.userId;
  if (filters.status)   query.status   = filters.status;
  if (userRole === 'manager' && userBranchId) {
    query.branchId = userBranchId;
  } else if (filters.branchId) {
    query.branchId = filters.branchId;
  }

  // ── Search by keyword (name, phone, packCode) ──
  if (filters.search && filters.search.trim()) {
    const keyword = filters.search.trim();
    const regex = new RegExp(keyword, 'i');

    // Find matching user IDs by name or phone
    const matchingUsers = await User.find({
      $or: [{ name: regex }, { phone: regex }],
    }).select('_id').lean();
    const userIds = matchingUsers.map(u => u._id);

    query.$or = [
      { packCode: regex },
      { userId: { $in: userIds } },
    ];
  }

  // ── Pagination ──
  const page  = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(filters.limit, 10) || 9));
  const skip  = (page - 1) * limit;

  const [data, total] = await Promise.all([
    SlotPack.find(query)
      .populate('userId',    'name email phone tier')
      .populate('branchId',  'name address')
      .populate('packageId', 'name price duration subServices')
      .populate('vehicleId', 'licensePlate vehicleType brand color')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SlotPack.countDocuments(query),
  ]);

  return { data, total, page, totalPages: Math.ceil(total / limit) };
};

exports.getSlotPackById = async (id, userId, userRole) => {
  const pack = await SlotPack.findById(id)
    .populate('userId',    'name email phone tier')
    .populate('branchId',  'name address')
    .populate('packageId', 'name price duration subServices')
    .populate('vehicleId', 'licensePlate vehicleType brand color');

  if (!pack) throw Object.assign(new Error('Gói lượt không tồn tại'), { statusCode: 404, code: 'SLOT_PACK_NOT_FOUND' });
  if (userRole === 'customer' && String(pack.userId._id || pack.userId) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  return pack;
};

exports.getSlotPackByCode = async (packCode, userRole, userBranchId) => {
  if (userRole !== 'admin' && userRole !== 'manager') {
    throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  const pack = await SlotPack.findOne({ packCode: packCode.toUpperCase() })
    .populate('userId',    'name email phone tier')
    .populate('branchId',  'name address')
    .populate('packageId', 'name price duration subServices')
    .populate('vehicleId', 'licensePlate vehicleType brand color');

  if (!pack) throw Object.assign(new Error('Gói lượt không tồn tại'), { statusCode: 404, code: 'SLOT_PACK_NOT_FOUND' });
  if (userRole === 'manager') {
    const packBranch = String(pack.branchId?._id || pack.branchId);
    if (!userBranchId || String(userBranchId) !== packBranch) {
      throw Object.assign(new Error('Gói lượt không thuộc chi nhánh của bạn'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }
  return pack;
};

// ─── Use Slot (Manager checkin) ───────────────────────────────────────────────

/**
 * Dùng 1 slot: giảm remainingSlots, tạo Booking record tham chiếu.
 * Chỉ manager/admin gọi được.
 */
exports.useSlot = async (packId, staffId, data = {}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Lock & decrement atomically
    const pack = await SlotPack.findOneAndUpdate(
      { _id: packId, status: 'active', remainingSlots: { $gt: 0 } },
      { $inc: { remainingSlots: -1, usedSlots: 1 } },
      { new: true, session }
    ).populate('packageId').populate('userId');

    if (!pack) {
      const existing = await SlotPack.findById(packId).session(session);
      if (!existing) throw Object.assign(new Error('Gói lượt không tồn tại'), { statusCode: 404, code: 'SLOT_PACK_NOT_FOUND' });
      if (existing.status !== 'active') throw Object.assign(new Error(`Gói lượt đang ở trạng thái ${existing.status}`), { statusCode: 400, code: 'SLOT_PACK_INACTIVE' });
      throw Object.assign(new Error('Gói lượt đã hết lượt'), { statusCode: 400, code: 'NO_SLOTS_REMAINING' });
    }

    // Kiểm tra hạn
    if (pack.expiresAt && new Date() > pack.expiresAt) {
      // Rollback
      await SlotPack.findByIdAndUpdate(packId, { $inc: { remainingSlots: 1, usedSlots: -1 } }, { session });
      throw Object.assign(new Error('Gói lượt đã hết hạn'), { statusCode: 400, code: 'SLOT_PACK_EXPIRED' });
    }

    // Nếu hết slot → đánh dấu exhausted
    if (pack.remainingSlots === 0) {
      await SlotPack.findByIdAndUpdate(packId, { status: 'exhausted' }, { session });
    }

    // Tính ngày và giờ dùng
    const now = new Date();
    const bookingDateStr = now.toISOString().split('T')[0];
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const startTime = `${h}:${m}`;
    const duration = pack.packageId?.duration || 30;
    const endMinutes = now.getHours() * 60 + now.getMinutes() + duration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

    // Tạo Booking record (slot_pack_usage)
    const booking = new Booking({
      userId:    pack.userId._id || pack.userId,
      branchId:  pack.branchId,
      packageId: pack.packageId._id || pack.packageId,
      vehicleId: pack.vehicleId,
      bookingDate: now,
      startTime,
      endTime,
      status: 'in_progress',
      bookingType: 'slot_pack_usage',
      slotPackId: pack._id,
      priority: pack.priority,
      finalPrice: 0, // đã thanh toán khi mua gói
      paymentStatus: 'paid',
      note: data.note || `Slot pack usage — ${pack.totalSlots - pack.remainingSlots}/${pack.totalSlots}`,
    });
    await booking.save({ session });

    await session.commitTransaction();

    notificationService.send(
      pack.userId._id || pack.userId,
      'Đã dùng 1 slot rửa xe',
      `Còn lại ${pack.remainingSlots} lần. Mã gói: ${pack.packCode}.`,
      'slot_used',
      { slotPackId: packId, bookingId: booking._id }
    ).catch(() => {});

    return { slotPack: pack, booking };
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

// ─── Cancel ───────────────────────────────────────────────────────────────────

exports.requestCancelOtp = async (packId, userId) => {
  const pack = await SlotPack.findById(packId);
  if (!pack) throw Object.assign(new Error('Gói lượt không tồn tại'), { statusCode: 404, code: 'SLOT_PACK_NOT_FOUND' });
  if (String(pack.userId) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền hủy gói lượt này'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  if (pack.status !== 'active') {
    throw Object.assign(new Error(`Không thể yêu cầu hủy gói lượt ở trạng thái ${pack.status}`), { statusCode: 400, code: 'INVALID_STATUS' });
  }

  const user = await User.findById(userId);
  if (!user || !user.email) {
    throw Object.assign(new Error('Tài khoản của bạn chưa có email. Vui lòng cập nhật email để nhận mã OTP!'), { statusCode: 400, code: 'EMAIL_REQUIRED' });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const bcrypt = require('bcryptjs');
  
  pack.cancelOtpToken = bcrypt.hashSync(otp, 12);
  pack.cancelOtpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
  await pack.save();

  console.log(`[CANCEL OTP SLOTPACK] User: ${user.email}, Pack: ${pack.packCode || pack._id}, OTP: ${otp}`);

  try {
    const emailService = require('./email.service');
    await emailService.sendCancellationOtpEmail(user.email, otp);
  } catch (e) {
    console.error('Lỗi gửi OTP hủy gói:', e);
    throw Object.assign(new Error(`Không thể gửi email OTP đến ${user.email}: ${e.message || 'Lỗi hệ thống email'}`), { statusCode: 500, code: 'EMAIL_FAILED' });
  }
  return true;
};

exports.cancelSlotPack = async (packId, userId, userRole, reason) => {
  const pack = await SlotPack.findById(packId);
  
  if (!pack) throw Object.assign(new Error('Gói lượt không tồn tại'), { statusCode: 404, code: 'SLOT_PACK_NOT_FOUND' });
  if (userRole === 'customer' && String(pack.userId) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  if (pack.status !== 'active') {
    throw Object.assign(new Error(`Không thể hủy gói lượt ở trạng thái ${pack.status}`), { statusCode: 400, code: 'INVALID_STATUS' });
  }

  // Calculate refund
  let refundStatus = 'none';
  let refundAmount = 0;
  
  const now = new Date();
  const createdDate = new Date(pack.createdAt);
  const daysSinceBought = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

  // Business Rule 1: <= 3 days and usedSlots == 0 -> Refund
  if (pack.paymentStatus === 'paid' && pack.usedSlots === 0 && daysSinceBought <= 3) {
    const Payment = mongoose.model('Payment');
    const payment = await Payment.findOne({ slotPackId: pack._id, status: 'paid' });
    if (payment) {
       refundAmount = payment.amount;
       refundStatus = 'completed';
       payment.status = 'refunded';
       payment.refundedAt = new Date();
       await payment.save();
       
       // Hoàn tiền trực tiếp vào ví người dùng
       const WalletTransaction = mongoose.model('WalletTransaction');
       await User.findByIdAndUpdate(pack.userId, { $inc: { walletBalance: refundAmount } });
       await WalletTransaction.create({
         userId: pack.userId,
         amount: refundAmount,
         type: 'credit',
         reason: `Hoàn tiền hủy gói lượt ${pack.packCode}`,
       });
    }
  }
  // Business Rule 2: usedSlots > 0 -> Cancelled, but NO Refund (refundAmount = 0).

  pack.status = 'cancelled';
  pack.refundStatus = refundStatus;
  pack.refundAmount = refundAmount;
  pack.cancelOtpToken = undefined;
  pack.cancelOtpExpires = undefined;
  await pack.save();

  // Send email and notification
  const user = await User.findById(pack.userId);
  if (user && user.email) {
    const emailService = require('./email.service');
    if (typeof emailService.sendCancellationSuccessEmail === 'function') {
      emailService.sendCancellationSuccessEmail(user.email, { type: 'slot_pack', code: pack.packCode }, refundAmount).catch(e => console.error('Lỗi gửi email hủy gói:', e));
    }
  }
  
  const notificationService = require('./notification.service');
  const resultMsg = refundAmount > 0 ? `Hủy gói lượt thành công. Số tiền ${refundAmount.toLocaleString('vi-VN')}đ đã được hoàn vào Ví AutoWash của bạn.` : `Gói lượt ${pack.packCode} đã được hủy. Không được hoàn tiền do gói đã được sử dụng.`;
  notificationService.send(pack.userId, 'Thông báo hủy gói lượt', resultMsg, 'slot_pack_cancelled').catch(() => {});

  // Rollback voucher nếu có và chưa dùng
  if (pack.voucherCode && pack.usedSlots === 0) {
    const voucherService = require('./voucher.service');
    await voucherService.rollbackVoucher(pack.voucherCode, userId, pack._id).catch(() => {});
  }
  return pack;
};

// ─── Usage History ────────────────────────────────────────────────────────────

/**
 * Lấy lịch sử sử dụng gói lượt (tất cả bookings có bookingType = slot_pack_usage).
 * Hỗ trợ phân页, tìm kiếm, lọc theo chi nhánh / gói slot cụ thể.
 */
exports.getUsageHistory = async (filters = {}, userRole, userBranchId) => {
  const query = { bookingType: 'slot_pack_usage' };

  if (filters.slotPackId) query.slotPackId = filters.slotPackId;
  if (filters.userId) query.userId = filters.userId;

  // Manager chỉ thấy chi nhánh mình
  if (userRole === 'manager' && userBranchId) {
    query.branchId = userBranchId;
  } else if (filters.branchId) {
    query.branchId = filters.branchId;
  }

  // Tìm kiếm theo tên / SĐT khách hàng
  if (filters.search && filters.search.trim()) {
    const keyword = filters.search.trim();
    const regex = new RegExp(keyword, 'i');
    const matchingUsers = await User.find({
      $or: [{ name: regex }, { phone: regex }],
    }).select('_id').lean();
    const userIds = matchingUsers.map(u => u._id);
    query.userId = { $in: userIds };
  }

  // Lọc theo ngày
  if (filters.date) {
    const start = new Date(filters.date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filters.date);
    end.setHours(23, 59, 59, 999);
    query.bookingDate = { $gte: start, $lte: end };
  }

  // Lọc theo trạng thái booking
  if (filters.status) query.status = filters.status;

  const page  = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(filters.limit, 10) || 15));
  const skip  = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Booking.find(query)
      .populate('userId',    'name email phone tier')
      .populate('branchId',  'name address')
      .populate('packageId', 'name price duration')
      .populate('vehicleId', 'licensePlate vehicleType brand')
      .populate('slotPackId', 'packCode totalSlots usedSlots remainingSlots')
      .sort({ bookingDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Booking.countDocuments(query),
  ]);

  return { data, total, page, totalPages: Math.ceil(total / limit) };
};

// ─── Preview chiết khấu (không lưu DB) ───────────────────────────────────────

exports.previewDiscount = (totalSlots, unitPrice) => {
  const discountPercent = getDiscountPercent(totalSlots);
  const gross = unitPrice * totalSlots;
  const discount = Math.floor(gross * discountPercent / 100);
  return {
    totalSlots,
    unitPrice,
    gross,
    discountPercent,
    discountAmount: discount,
    finalPrice: gross - discount,
    savings: discount,
  };
};
