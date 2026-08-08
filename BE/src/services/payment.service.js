const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { Payment, Booking, Branch, SlotPack } = require('../models');
const notificationService = require('./notification.service');
const sseService = require('./sse.service');
const voucherService = require('./voucher.service');
const emailService = require('./email.service');
const loyaltyService = require('./loyalty.service');

const generateTransactionId = () => `TXN${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
const VALID_METHODS = ['cash', 'bank', 'vnpay', 'momo', 'wallet'];

// ── Helper: day bounds cố định theo múi giờ +07:00 ─────────────────────
const getDayBounds = (dateStr) => ({
  gte: new Date(`${dateStr}T00:00:00.000+07:00`),
  lte: new Date(`${dateStr}T23:59:59.999+07:00`),
});
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Helper: phạm vi chi nhánh cho manager ──────────────────────────────
// Manager chỉ được xem/xử lý thanh toán thuộc chi nhánh mình quản lý.
const getManagerBranch = async (userId) =>
  Branch.findOne({ managerId: userId, isDeleted: { $ne: true } });

const paymentVisibleToManager = async (payment, branch, session) => {
  if (!branch) return false;
  if (payment.bookingId) {
    const bookingId = payment.bookingId?._id || payment.bookingId;
    const booking = await Booking.findById(bookingId).select('branchId').session(session || null);
    return !!booking && String(booking.branchId) === String(branch._id);
  }
  if (payment.slotPackId) {
    const slotPackId = payment.slotPackId?._id || payment.slotPackId;
    const sp = await SlotPack.findById(slotPackId).select('branchId').session(session || null);
    return !!sp && String(sp.branchId) === String(branch._id);
  }
  return false;
};

// Trả về mảng điều kiện $or để lọc payment theo chi nhánh của manager.
const buildManagerBranchQuery = async (branch) => {
  if (!branch) return [{ bookingId: { $in: [] } }];
  const [bookingIds, slotPackIds] = await Promise.all([
    Booking.find({ branchId: branch._id, isDeleted: { $ne: true } }).distinct('_id'),
    SlotPack.find({ branchId: branch._id }).distinct('_id'),
  ]);
  const conds = [];
  if (bookingIds.length) conds.push({ bookingId: { $in: bookingIds } });
  if (slotPackIds.length) conds.push({ slotPackId: { $in: slotPackIds } });
  return conds.length ? conds : [{ bookingId: { $in: [] } }];
};

// Khi thanh toán 100% (paymentType = 'full') cho nhóm định kỳ, đánh dấu tất cả
// các buổi còn hiệu lực trong nhóm là đã thanh toán để khớp với tổng tiền đã thu.
const markRecurringSiblingsPaid = async (booking, paymentMethod, session) => {
  if (booking.bookingType !== 'recurring' || !booking.recurringGroupId) return;
  const siblings = await Booking.find({
    recurringGroupId: booking.recurringGroupId,
    _id: { $ne: booking._id },
    status: { $ne: 'cancelled' },
  }).session(session || null);
  for (const sib of siblings) {
    sib.paymentStatus = 'paid';
    sib.paidAt = new Date();
    sib.paymentMethod = paymentMethod;
    sib.depositPaid = true;
    sib.depositAmount = sib.finalPrice ?? sib.packagePrice ?? 0;
    await sib.save({ session });
  }
};

// Khi đóng cọc, hệ thống thu cọc gộp trên booking đầu tiên
// vì vậy vẫn cần đánh dấu các booking còn lại là đã đóng cọc.
const markRecurringSiblingsDepositPaid = async (booking, paymentMethod, session) => {
  if (booking.bookingType !== 'recurring' || !booking.recurringGroupId) return;
  const q = Booking.updateMany(
    {
      recurringGroupId: booking.recurringGroupId,
      _id: { $ne: booking._id },
      status: { $ne: 'cancelled' },
    },
    { paymentStatus: 'deposit_paid', depositPaidAt: new Date(), paymentMethod, depositPaid: true }
  );
  if (session) q.session(session);
  await q;
};

const generateQrDataUrl = async (transactionId, amount, method, paymentType) => {
  let content;
  if (method === 'bank') {
    const bankId = process.env.SEPAY_BANK_ID;
    const acc = process.env.SEPAY_BANK_ACCOUNT;
    const prefix = paymentType === 'full' ? 'THANH TOAN' : 'DAT COC';
    if (bankId && acc) {
      return `https://qr.sepay.vn/img?bank=${bankId}&acc=${acc}&amount=${amount}&des=${prefix} ${transactionId}`;
    }
    content = `AUTOWASH ${prefix}\nMã GD: ${transactionId}\nSố tiền: ${amount.toLocaleString('vi-VN')}đ`;
    return QRCode.toDataURL(content, { width: 300, margin: 1 });
  }
  return QRCode.toDataURL('Invalid format', { width: 300, margin: 1 });
};

// Hàm poll SePay transactions
const pollSepayTransaction = async (transactionId, amount) => {
  try {
    const apiKey = process.env.SEPAY_API_KEY;
    if (!apiKey) return false;
    // Tự động poll API của SePay để kiểm tra giao dịch (cho môi trường local/không có webhook)
    const res = await fetch('https://my.sepay.vn/userapi/transactions/list', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data && data.transactions && Array.isArray(data.transactions)) {
      // Tìm giao dịch có chứa mã transactionId và số tiền >= yêu cầu
      const match = data.transactions.find(tx => 
        tx.transaction_content?.includes(transactionId) && 
        Number(tx.amount_in) >= amount
      );
      return !!match;
    }
  } catch (err) {
    console.error('Error polling sepay:', err.message);
  }
  return false;
};

exports.createPayment = async (bookingId, requesterId, userRole, method, paymentType = 'full', overrideAmount) => {
  if (!VALID_METHODS.includes(method)) {
    throw Object.assign(new Error('Phương thức thanh toán không hợp lệ'), { statusCode: 400, code: 'INVALID_METHOD' });
  }
  if (!['deposit', 'remaining', 'full'].includes(paymentType)) {
    throw Object.assign(new Error('Loại thanh toán không hợp lệ'), { statusCode: 400, code: 'INVALID_PAYMENT_TYPE' });
  }

  const booking = await Booking.findById(bookingId).populate('packageId');
  if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  if (userRole === 'customer' && String(booking.userId) !== String(requesterId)) {
    throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  if (booking.status === 'cancelled') {
    throw Object.assign(new Error('Lịch hẹn đã bị hủy'), { statusCode: 400, code: 'BOOKING_CANCELLED' });
  }
  if (!booking.packageId) {
    throw Object.assign(new Error('Gói dịch vụ không tồn tại'), { statusCode: 400, code: 'PACKAGE_NOT_FOUND' });
  }
  if (booking.paymentStatus === 'paid') {
    throw Object.assign(new Error('Lịch hẹn đã được thanh toán'), { statusCode: 409, code: 'ALREADY_PAID' });
  }

  let fullPrice = booking.finalPrice ?? booking.packagePrice ?? booking.packageId?.price;

  // Trả hết (paymentType = 'full') cho nhóm định kỳ: thu tổng toàn bộ các buổi còn
  // hiệu lực trong nhóm, khớp với số tiền FE hiển thị (giá 1 buổi × số buổi).
  // Thanh toán lẻ ('remaining') vẫn chỉ tính riêng cho đơn hiện tại.
  if (paymentType === 'full' && booking.bookingType === 'recurring' && booking.recurringGroupId) {
    const siblings = await Booking.find({
      recurringGroupId: booking.recurringGroupId,
      status: { $ne: 'cancelled' },
    }).select('finalPrice packagePrice');
    const groupTotal = siblings.reduce((sum, b) => sum + (b.finalPrice ?? b.packagePrice ?? 0), 0);
    if (groupTotal > 0) fullPrice = groupTotal;
  }

  const deposit = booking.depositAmount || 0;

  let amount;
  let isDeposit = false;
  if (paymentType === 'deposit') {
    if (deposit <= 0 && !overrideAmount) throw Object.assign(new Error('Đơn này không yêu cầu đặt cọc'), { statusCode: 400, code: 'NO_DEPOSIT_REQUIRED' });
    if (booking.depositPaid) throw Object.assign(new Error('Đã đặt cọc trước đó'), { statusCode: 409, code: 'DEPOSIT_ALREADY_PAID' });
    amount = overrideAmount || deposit;
    isDeposit = true;
  } else {
    // Full: thu phần còn lại nếu đã cọc, ngược lại thu toàn bộ (đã bao gồm cả nhóm nếu recurring)
    amount = booking.depositPaid ? Math.max(0, fullPrice - deposit) : fullPrice;
  }

  const allowedStatuses = isDeposit
    ? ['pending', 'confirmed']
    : ['pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'awaiting_payment'];
  if (!allowedStatuses.includes(booking.status)) {
    throw Object.assign(new Error(`Không thể tạo thanh toán cho lịch hẹn ở trạng thái '${booking.status}'`), { statusCode: 400, code: 'INVALID_BOOKING_STATUS' });
  }

  const targetUserId = booking.userId;

  // Atomically create or get existing pending payment (prevents E11000 race on concurrent requests)
  let payment = await Payment.findOneAndUpdate(
    { bookingId, status: 'pending' },
    {
      $setOnInsert: {
        bookingId,
        userId: targetUserId,
        amount,
        method,
        paymentType,
        transactionId: generateTransactionId(),
        status: 'pending',
        packageName: booking.packageName || booking.packageId?.name || '',
        packagePrice: booking.packagePrice ?? booking.packageId?.price ?? 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Generate QR code for bank deposit if missing
  if (method === 'bank' && isDeposit && !payment.qrCode) {
    payment.qrCode = await generateQrDataUrl(payment.transactionId, amount, method, paymentType);
    await payment.save();
  }

  if (booking.voucherCode) {
    const VoucherUsage = mongoose.model('VoucherUsage');
    const existingUsage = await VoucherUsage.findOne({ bookingId, userId: targetUserId });
    if (!existingUsage) {
      await voucherService.reserveVoucher(booking.voucherCode, targetUserId, bookingId, booking.discountAmount || 0);
    }
  }

  // Cash or Wallet: auto-confirm ngay lập tức
  if (method === 'cash' || method === 'wallet') {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (method === 'wallet') {
          const user = await mongoose.model('User').findOneAndUpdate(
            { _id: targetUserId, walletBalance: { $gte: amount } },
            { $inc: { walletBalance: -amount } },
            { new: true, session }
          );
          if (!user) {
            throw Object.assign(new Error('Số dư ví không đủ để thanh toán'), { statusCode: 400, code: 'INSUFFICIENT_BALANCE' });
          }
          
          await mongoose.model('WalletTransaction').create([{
            userId: targetUserId,
            amount,
            type: 'debit',
            reason: `Thanh toán ${isDeposit ? 'tiền cọc' : 'đơn'} cho lịch hẹn`,
            bookingId: booking._id
          }], { session });
        }

        payment.status = 'paid';
        payment.paidAt = new Date();
        await payment.save({ session });

        if (isDeposit) {
          await Booking.findByIdAndUpdate(
            booking._id,
            { paymentStatus: 'deposit_paid', depositPaid: true, depositPaidAt: new Date(), paymentMethod: method },
            { session }
          );
          await markRecurringSiblingsDepositPaid(booking, method, session);
        } else {
          const updateData = { paymentStatus: 'paid', paidAt: new Date(), paymentMethod: method, depositPaid: true, depositAmount: booking.finalPrice };
          if (booking.status === 'awaiting_payment') {
            updateData.status = 'completed';
            updateData.checkOutTime = new Date();
          }
          await Booking.findByIdAndUpdate(
            booking._id,
            updateData,
            { session }
          );
          if (paymentType === 'full') {
            await markRecurringSiblingsPaid(booking, method, session);
          }
          // Award points here when payment completes the booking (bypasses updateBookingStatus)
          if (['awaiting_payment', 'completed'].includes(booking.status)) {
            const pointsBaseAmount = booking.bookingType === 'slot_pack_usage'
              ? (booking.packagePrice ?? booking.packageId?.price ?? 0) + (booking.selectedSubServices || []).reduce((sum, s) => sum + (s.price || 0), 0)
              : fullPrice;
            if ((pointsBaseAmount || 0) > 0) {
              const alreadyAwarded = await mongoose.model('PointHistory').findOne({ referenceId: bookingId, type: 'earned' }).session(session);
              if (!alreadyAwarded) {
                await loyaltyService.addPointsFromPayment(targetUserId, pointsBaseAmount, bookingId, session);
              }
            }
            // Spin wheel + no-show side effects (missing because this bypasses updateBookingStatus)
            await mongoose.model('User').findOneAndUpdate(
              { _id: targetUserId, noShowCount: { $gt: 0 } },
              { $inc: { noShowCount: -1 } },
              { session }
            ).catch(() => {});
            
            await mongoose.model('User').findByIdAndUpdate(targetUserId, { $inc: { spinCount: 1 } }, { session });
            await Booking.findByIdAndUpdate(booking._id, { $set: { spinEarned: true } }, { session }).catch(() => {});
            sseService.sendToUser(targetUserId, 'spin_added', { count: 1 });
          }
        }
      });
    } catch (err) {
      if (session.inTransaction()) { await session.abortTransaction(); }
      if (booking.voucherCode) { await voucherService.rollbackVoucher(booking.voucherCode, targetUserId, bookingId).catch(() => {}); }
      throw err;
    } finally {
      session.endSession();
    }

    const label = isDeposit ? 'tiền cọc' : 'phần còn lại';
    const methodLabel = method === 'wallet' ? 'Ví AutoWash' : 'tiền mặt';
    notificationService.send(booking.userId, 'Thanh toán thành công', `Đã thanh toán ${label} ${amount.toLocaleString('vi-VN')}đ bằng ${methodLabel}.`, 'payment_confirmed', { bookingId, paymentId: payment._id }).catch(() => {});
    notificationService.sendToAdminAndManager(booking.branchId, isDeposit ? 'Khách đã đặt cọc' : 'Thanh toán hoàn tất', `Khách hàng đã thanh toán ${label} ${amount.toLocaleString('vi-VN')}đ cho lịch hẹn.`, 'payment_confirmed', { bookingId, branchId: booking.branchId }).catch(() => {});
    sseService.broadcastToManagers(booking.branchId, 'payment_new', { paymentId: payment._id, bookingId: booking._id });
    return payment;
  }

  // Bank: tạo QR code (deposit hoặc full)
  if (method === 'bank') {
    payment.qrCode = await generateQrDataUrl(payment.transactionId, amount, method, paymentType);
  }
  // VNPay / MoMo: không cần QR, trả về payment record để FE gọi payment service tạo URL
  await payment.save();
  return payment;
};

exports.createSlotPackPayment = async (slotPackId, userId, method, amount, client = 'web') => {
  const slotPack = await mongoose.model('SlotPack').findById(slotPackId);
  if (!slotPack) throw Object.assign(new Error('Gói lượt không tồn tại'), { statusCode: 404, code: 'NOT_FOUND' });

  const existingPending = await Payment.findOne({ slotPackId, status: 'pending' });
  if (existingPending) {
    if (client && existingPending.client !== client) {
      existingPending.client = client;
      await existingPending.save();
    }
    return existingPending;
  }

  const transactionId = generateTransactionId();
  const payment = new Payment({
    slotPackId,
    userId,
    amount: amount || slotPack.finalPriceAfterVoucher || slotPack.finalPrice,
    method,
    paymentType: 'full',
    status: 'pending',
    transactionId,
    client,
    packageName: slotPack.packageName || '',
    packagePrice: slotPack.unitPrice ?? 0,
  });

  if (method === 'bank') {
    payment.qrCode = await generateQrDataUrl(transactionId, payment.amount, method, 'full');
  }

  try {
    await payment.save();
  } catch (err) {
    console.error('[createSlotPackPayment] save error:', {
      code: err.code,
      message: err.message,
      keyPattern: err.keyPattern,
      bookingIdInDoc: payment.bookingId,
      slotPackId: payment.slotPackId,
      method: payment.method,
      status: payment.status,
      toJSON: JSON.stringify(payment.toObject()),
    });
    throw err;
  }
  return payment;
};

exports.createProvisionalBankPayment = async (userId, amount, paymentType = 'deposit') => {
  const transactionId = generateTransactionId();
  const payment = new Payment({
    userId,
    amount,
    method: 'bank',
    paymentType,
    status: 'pending',
    transactionId,
  });
  payment.qrCode = await generateQrDataUrl(transactionId, amount, 'bank', paymentType);
  await payment.save();
  return payment;
};

exports.getPaymentBySlotPack = async (slotPackId) => {
  let payment = await Payment.findOne({ slotPackId })
    .populate('slotPackId', 'packCode finalPrice paymentStatus')
    .populate('userId', 'name email');

  if (!payment) throw Object.assign(new Error('Thanh toán không tồn tại'), { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });

  // Auto-poll SePay
  if (payment.status !== 'paid' && payment.method === 'bank') {
    const isPaid = await pollSepayTransaction(payment.transactionId, payment.amount);
    if (isPaid) {
      await exports.confirmPaymentCallback(payment.transactionId, 'SEPAY_POLLED', true);
      payment = await Payment.findOne({ slotPackId })
        .populate('slotPackId', 'packCode finalPrice paymentStatus')
        .populate('userId', 'name email');
    }
  }

  return payment;
};

exports.confirmPayment = async (transactionId, method, gatewayTransactionId, userRole, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const payment = await Payment.findOne({ transactionId }).session(session);
    if (!payment) {
      await session.abortTransaction();
      throw Object.assign(new Error('Thanh toán không tồn tại'), { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
    }
    if (payment.status === 'paid') {
      await session.commitTransaction();
      return payment;
    }
    if (userRole === 'manager') {
      const branch = await getManagerBranch(userId);
      if (!(await paymentVisibleToManager(payment, branch, session))) {
        await session.abortTransaction();
        throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
      }
    }

    if (!payment.bookingId && !payment.slotPackId) {
      payment.status = 'paid';
      payment.paidAt = new Date();
      payment.gatewayTransactionId = gatewayTransactionId || payment.gatewayTransactionId;
      await payment.save({ session });

      if (payment.paymentType === 'topup') {
        const user = await mongoose.model('User').findById(payment.userId).session(session);
        if (user) {
          user.walletBalance = (user.walletBalance || 0) + payment.amount;
          await user.save({ session });
          await mongoose.model('WalletTransaction').create([{
            userId: payment.userId,
            amount: payment.amount,
            type: 'credit',
            reason: 'Nạp tiền vào ví'
          }], { session });
          sseService.sendToUser(payment.userId, 'wallet_topup_success', { amount: payment.amount });
        }
      }
      await session.commitTransaction();
      return payment;
    }

    const booking = await Booking.findById(payment.bookingId).populate('packageId').session(session);
    if (!booking) {
      await session.abortTransaction();
      throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    }
    if (!VALID_METHODS.includes(method)) {
      await session.abortTransaction();
      throw Object.assign(new Error('Phương thức thanh toán không hợp lệ'), { statusCode: 400, code: 'INVALID_METHOD' });
    }
    if (booking.status === 'cancelled') {
      await session.abortTransaction();
      throw Object.assign(new Error('Không thể xác nhận thanh toán cho lịch hẹn đã hủy'), { statusCode: 400, code: 'BOOKING_CANCELLED' });
    }

    payment.status = 'paid';
    payment.paidAt = new Date();
    payment.gatewayTransactionId = gatewayTransactionId || payment.gatewayTransactionId;
    await payment.save({ session });

    if (payment.paymentType === 'deposit') {
      await Booking.findByIdAndUpdate(booking._id, { paymentStatus: 'deposit_paid', depositPaid: true, depositPaidAt: new Date(), paymentMethod: payment.method }).session(session);
      await markRecurringSiblingsDepositPaid(booking, payment.method, session);
    } else {
      const updateData = { paymentStatus: 'paid', paidAt: new Date(), paymentMethod: payment.method, depositPaid: true, depositAmount: booking.finalPrice };
      if (booking.status === 'awaiting_payment') {
        updateData.status = 'completed';
        updateData.checkOutTime = new Date();
      }
      await Booking.findByIdAndUpdate(booking._id, updateData).session(session);
      if (payment.paymentType === 'full') {
        await markRecurringSiblingsPaid(booking, payment.method, session);
      }
      // Award points here when payment completes the booking (bypasses updateBookingStatus)
      if (['awaiting_payment', 'completed'].includes(booking.status)) {
        const pointsBaseAmount = booking.bookingType === 'slot_pack_usage'
          ? (booking.packagePrice ?? booking.packageId?.price ?? 0) + (booking.selectedSubServices || []).reduce((sum, s) => sum + (s.price || 0), 0)
          : payment.amount;
        if ((pointsBaseAmount || 0) > 0) {
          const alreadyAwarded = await mongoose.model('PointHistory').findOne({ referenceId: booking._id, type: 'earned' }).session(session);
          if (!alreadyAwarded) {
            await loyaltyService.addPointsFromPayment(payment.userId, pointsBaseAmount, booking._id, session);
          }
        }
        await mongoose.model('User').findOneAndUpdate(
          { _id: payment.userId, noShowCount: { $gt: 0 } },
          { $inc: { noShowCount: -1 } },
          { session }
        ).catch(() => {});
        await mongoose.model('User').findByIdAndUpdate(payment.userId, { $inc: { spinCount: 1 } }, { session });
        await Booking.findByIdAndUpdate(booking._id, { $set: { spinEarned: true } }, { session }).catch(() => {});
        sseService.sendToUser(payment.userId, 'spin_added', { count: 1 });
      }
    }

    await session.commitTransaction();

    const label = payment.paymentType === 'deposit' ? 'tiền cọc' : 'thanh toán';
    notificationService.send(booking.userId, 'Thanh toán thành công', `${label} ${payment.amount.toLocaleString('vi-VN')}đ bằng ${payment.method.toUpperCase()} đã được xác nhận.`, 'payment_confirmed', { bookingId: booking._id, paymentId: payment._id }).catch(() => {});
    notificationService.sendToAdminAndManager(booking.branchId, `Thanh toán ${payment.method.toUpperCase()}`, `Khách hàng đã ${label} ${payment.amount.toLocaleString('vi-VN')}đ qua ${payment.method.toUpperCase()}.`, 'payment_confirmed', { bookingId: booking._id, branchId: booking.branchId }).catch(() => {});
    sseService.broadcastToManagers(booking.branchId, 'payment_new', { paymentId: payment._id, bookingId: booking._id });
    return payment;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

exports.countUnviewedPayments = async () => {
  const expiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await Payment.updateMany({ viewedAt: null, createdAt: { $lte: expiry } }, { viewedAt: expiry });
  return Payment.countDocuments({ viewedAt: null, status: 'paid' });
};
exports.confirmPaymentCallback = async (transactionId, gatewayTransactionId, success) => {
  const session = await mongoose.startSession();
  let paymentResult = null;
  let bookingResult = null;
  let slotPackResult = null;
  let isNewlyProcessed = false;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({ transactionId }).session(session);
      if (!payment) {
        throw Object.assign(new Error('Thanh toán không tồn tại'), { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
      }

      // Idempotency check: if already processed, return immediately
      if (payment.status === 'paid' || payment.status === 'failed') {
        paymentResult = payment;
        return; // Break out of withTransaction safely
      }

      if (payment.slotPackId) {
        // Xử lý thanh toán cho SlotPack
        const slotPack = await mongoose.model('SlotPack').findById(payment.slotPackId).session(session);
        if (!slotPack) {
          throw Object.assign(new Error('Gói lượt không tồn tại'), { statusCode: 404, code: 'NOT_FOUND' });
        }
        slotPackResult = slotPack;

        if (success) {
          payment.status = 'paid';
          payment.paidAt = new Date();
          payment.gatewayTransactionId = gatewayTransactionId || payment.gatewayTransactionId;
          await payment.save({ session });

          if (payment.method === 'wallet') {
            const user = await mongoose.model('User').findOneAndUpdate(
              { _id: payment.userId, walletBalance: { $gte: payment.amount } },
              { $inc: { walletBalance: -payment.amount } },
              { new: true, session }
            );
            if (!user) {
              throw Object.assign(new Error('Số dư ví không đủ để thanh toán'), { statusCode: 400, code: 'INSUFFICIENT_BALANCE' });
            }
            await mongoose.model('WalletTransaction').create([{
              userId: payment.userId,
              amount: payment.amount,
              type: 'debit',
              reason: 'Thanh toán gói lượt rửa xe',
            }], { session });
          }

          await mongoose.model('SlotPack').findByIdAndUpdate(slotPack._id, { paymentStatus: 'paid', paidAt: new Date() }).session(session);
          
          await loyaltyService.addPointsFromPayment(payment.userId, payment.amount, payment.slotPackId, session);
          // Removed spin wheel logic for slot pack purchase, user will earn it when they actually use the slot pack.
          isNewlyProcessed = true;
        } else {
          payment.status = 'failed';
          await payment.save({ session });
        }

        paymentResult = payment;
        return;
      }

      // Provisional payment (no bookingId, no slotPackId) — just mark as paid
      if (!payment.bookingId && !payment.slotPackId) {
        if (success) {
          payment.status = 'paid';
          payment.paidAt = new Date();
          payment.gatewayTransactionId = gatewayTransactionId || payment.gatewayTransactionId;
          await payment.save({ session });

          if (payment.paymentType === 'topup') {
            const user = await mongoose.model('User').findOneAndUpdate(
              { _id: payment.userId },
              { $inc: { walletBalance: payment.amount } },
              { new: true, session }
            );
            if (user) {
              await mongoose.model('WalletTransaction').create([{
                userId: payment.userId,
                amount: payment.amount,
                type: 'credit',
                reason: 'Nạp tiền vào ví',
              }], { session });
            }
          }
          isNewlyProcessed = true;
        } else {
          payment.status = 'failed';
          await payment.save({ session });
        }
        paymentResult = payment;
        return;
      }

      const booking = await Booking.findById(payment.bookingId).populate('packageId').session(session);
      if (!booking) {
        throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
      }
      bookingResult = booking;

      if (success) {
        payment.status = 'paid';
        payment.paidAt = new Date();
        payment.gatewayTransactionId = gatewayTransactionId || payment.gatewayTransactionId;
        await payment.save({ session });

        if (payment.paymentType === 'deposit') {
          await Booking.findByIdAndUpdate(booking._id, { paymentStatus: 'deposit_paid', depositPaid: true, depositPaidAt: new Date(), paymentMethod: payment.method }).session(session);
          await markRecurringSiblingsDepositPaid(booking, payment.method, session);
        } else {
          const updateData = { paymentStatus: 'paid', paidAt: new Date(), paymentMethod: payment.method, depositPaid: true, depositAmount: booking.finalPrice };
          if (booking.status === 'awaiting_payment') {
            updateData.status = 'completed';
            updateData.checkOutTime = new Date();
          }
          await Booking.findByIdAndUpdate(booking._id, updateData).session(session);
          if (payment.paymentType === 'full') {
            await markRecurringSiblingsPaid(booking, payment.method, session);
          }
          // Award points here when payment completes the booking (bypasses updateBookingStatus)
          if (['awaiting_payment', 'completed'].includes(booking.status)) {
            const pointsBaseAmount = booking.bookingType === 'slot_pack_usage'
              ? (booking.packagePrice ?? booking.packageId?.price ?? 0) + (booking.selectedSubServices || []).reduce((sum, s) => sum + (s.price || 0), 0)
              : payment.amount;
            if ((pointsBaseAmount || 0) > 0) {
              const alreadyAwarded = await mongoose.model('PointHistory').findOne({ referenceId: booking._id, type: 'earned' }).session(session);
              if (!alreadyAwarded) {
                await loyaltyService.addPointsFromPayment(payment.userId, pointsBaseAmount, booking._id, session);
              }
            }
            await mongoose.model('User').findOneAndUpdate(
              { _id: payment.userId, noShowCount: { $gt: 0 } },
              { $inc: { noShowCount: -1 } },
              { session }
            ).catch(() => {});
            // Re-add spin because booking.service.js won't trigger if it was unpaid when completed
await mongoose.model('User').findByIdAndUpdate(payment.userId, { $inc: { spinCount: 1 } }, { session });
            await Booking.findByIdAndUpdate(booking._id, { $set: { spinEarned: true } }, { session }).catch(() => {});
          }
        }
        isNewlyProcessed = true;
      } else {
        payment.status = 'failed';
        await payment.save({ session });

        if (booking.voucherCode) {
          await voucherService.rollbackVoucher(booking.voucherCode, payment.userId, booking._id, session);
        }
      }

      paymentResult = payment;
    });

    const payment = paymentResult;
    
    // --- Side Effects outside of transaction ---
    if (isNewlyProcessed && success && (payment.status === 'paid' || payment.status === 'failed')) {
      if (payment.slotPackId && slotPackResult) {
        sseService.sendToUser(payment.userId, 'slot_pack_paid', { slotPackId: payment.slotPackId, paymentId: payment._id });
        const user = await mongoose.model('User').findById(payment.userId);
        notificationService.send(payment.userId, 'Thanh toán gói lượt thành công', `Gói lượt ${slotPackResult.packCode} đã được kích hoạt.`, 'slot_pack_paid', { slotPackId: payment.slotPackId }).catch(() => {});
        if (user && user.email) {
          emailService.sendSlotPackConfirmationEmail(user.email, slotPackResult).catch(e => console.error('Lỗi gửi email gói lượt:', e));
        }
      } else if (!payment.bookingId && !payment.slotPackId) {
        if (payment.paymentType === 'topup') {
          sseService.sendToUser(payment.userId, 'wallet_topup_success', { amount: payment.amount });
          notificationService.send(payment.userId, 'Nạp tiền thành công', `Đã nạp ${payment.amount.toLocaleString('vi-VN')}đ vào ví AutoWash.`, 'wallet_topup_success', {}).catch(() => {});
        }
      } else if (payment.bookingId && bookingResult) {
        sseService.broadcastToManagers(bookingResult.branchId, 'payment_new', { paymentId: payment._id, bookingId: payment.bookingId });
        if (['awaiting_payment', 'completed'].includes(bookingResult.status)) {
          sseService.sendToUser(payment.userId, 'spin_added', { count: 1 });
        }
        const user = await mongoose.model('User').findById(payment.userId);
        if (user && user.email) {
          emailService.sendBookingConfirmationEmail(user.email, bookingResult).catch(e => console.error('Lỗi gửi email xác nhận đặt lịch:', e));
        }
      }
    }

    return payment;
  } catch (err) {
    throw err;
  } finally {
    session.endSession();
  }
};

exports.linkProvisionalPayment = async (transactionId, bookingId, paymentType = 'full') => {
  const payment = await Payment.findOne({ transactionId });
  if (!payment) throw Object.assign(new Error('Không tìm thấy thanh toán tạm tính'), { statusCode: 404, code: 'NOT_FOUND' });
  if (payment.bookingId) throw Object.assign(new Error('Thanh toán này đã được liên kết'), { statusCode: 400, code: 'ALREADY_LINKED' });

  const booking = await Booking.findById(bookingId);
  if (!booking) throw Object.assign(new Error('Không tìm thấy lịch hẹn'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });

  payment.bookingId = booking._id;
  payment.paymentType = paymentType;
  await payment.save();

  if (payment.status === 'paid') {
    if (paymentType === 'deposit') {
      await Booking.findByIdAndUpdate(booking._id, { paymentStatus: 'deposit_paid', depositPaid: true, depositPaidAt: new Date(), paymentMethod: payment.method });
    } else {
      const updateData = { paymentStatus: 'paid', paidAt: new Date(), paymentMethod: payment.method, depositPaid: true, depositAmount: booking.finalPrice };
      if (booking.status === 'awaiting_payment') {
        updateData.status = 'completed';
        updateData.checkOutTime = new Date();
      }
      await Booking.findByIdAndUpdate(booking._id, updateData);
    }
    sseService.broadcastToManagers(booking.branchId, 'payment_new', { paymentId: payment._id, bookingId: booking._id });
  }

  return payment;
};

exports.getPaymentByBooking = async (bookingId, userId, userRole) => {
  let payment = await Payment.findOne({ bookingId })
    .populate({ path: 'bookingId', populate: [{ path: 'branchId', select: 'name' }, { path: 'packageId', select: 'name price' }, { path: 'vehicleId', select: 'licensePlate brand model vehicleType' }], select: 'bookingDate startTime status userId branchId packageId finalPrice vehicleId bookingCode' })
    .populate('userId', 'name email phone');
  if (!payment) throw Object.assign(new Error('Thanh toán không tồn tại'), { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
  if (userRole === 'customer' && String(payment.userId?._id || payment.userId) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
  }

  // Tự động kiểm tra trên SePay nếu chưa thanh toán (để hỗ trợ local testing giống Flutter polling)
  if (payment.status !== 'paid' && payment.method === 'bank') {
    const isPaid = await pollSepayTransaction(payment.transactionId, payment.amount);
    if (isPaid) {
      await exports.confirmPaymentCallback(payment.transactionId, 'SEPAY_POLLED', true);
      // Load lại payment sau khi update
      payment = await Payment.findOne({ bookingId })
        .populate({ path: 'bookingId', populate: [{ path: 'branchId', select: 'name' }, { path: 'packageId', select: 'name price' }, { path: 'vehicleId', select: 'licensePlate brand model vehicleType' }], select: 'bookingDate startTime status userId branchId packageId finalPrice vehicleId bookingCode' })
        .populate('userId', 'name email phone');
    }
  }

  return payment;
};

exports.getPaymentById = async (id, userRole, userId) => {
  let payment = await Payment.findById(id)
    .populate({ path: 'bookingId', populate: [{ path: 'branchId', select: 'name' }, { path: 'packageId', select: 'name price' }, { path: 'vehicleId', select: 'licensePlate brand model vehicleType' }], select: 'bookingDate startTime status branchId packageId finalPrice vehicleId bookingCode' })
    .populate({ path: 'slotPackId', populate: [{ path: 'branchId', select: 'name' }, { path: 'packageId', select: 'name price' }], select: 'packCode totalSlots remainingSlots status branchId packageId' })
    .populate('userId', 'name email phone tier');
  if (!payment) throw Object.assign(new Error('Thanh toán không tồn tại'), { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });

  if (userRole === 'manager') {
    const branch = await getManagerBranch(userId);
    if (!(await paymentVisibleToManager(payment, branch))) {
      throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }

  // Auto-poll SePay if pending & bank method
  if (payment.status !== 'paid' && payment.method === 'bank') {
    const isPaid = await pollSepayTransaction(payment.transactionId, payment.amount);
    if (isPaid) {
      await exports.confirmPaymentCallback(payment.transactionId, 'SEPAY_POLLED', true);
      payment = await Payment.findById(id)
        .populate({ path: 'bookingId', populate: [{ path: 'branchId', select: 'name' }, { path: 'packageId', select: 'name price' }, { path: 'vehicleId', select: 'licensePlate brand model vehicleType' }], select: 'bookingDate startTime status branchId packageId finalPrice vehicleId bookingCode' })
        .populate({ path: 'slotPackId', populate: [{ path: 'branchId', select: 'name' }, { path: 'packageId', select: 'name price' }], select: 'packCode totalSlots remainingSlots status branchId packageId' })
        .populate('userId', 'name email phone tier');
    }
  }

  return payment;
};

exports.markPaymentViewed = async (id, userRole, userId) => {
  if (userRole === 'customer') {
    throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  const payment = await Payment.findById(id);
  if (!payment) throw Object.assign(new Error('Thanh toán không tồn tại'), { statusCode: 404, code: 'PAYMENT_NOT_FOUND' });
  if (userRole === 'manager') {
    const branch = await getManagerBranch(userId);
    if (!(await paymentVisibleToManager(payment, branch))) {
      throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }
  payment.viewedAt = new Date();
  await payment.save();
  return payment;
};

/* ─────────────────── Stats helpers ─────────────────── */
// Query thống kê 6 ô: scoping chi nhánh (manager) + bộ lọc method/ngày.
// Không áp dụng bộ lọc status vì các ô thống kê là phân rã theo trạng thái.
const buildStatsQuery = async (filters = {}, userRole, userId) => {
  const query = {};
  if (userRole === 'manager') {
    const branch = await getManagerBranch(userId);
    query.$or = await buildManagerBranchQuery(branch);
  }
  if (filters.method) query.method = filters.method;
  if (filters.dateFrom || filters.dateTo) {
    const dateQuery = {};
    if (filters.dateFrom) dateQuery.$gte = getDayBounds(filters.dateFrom).gte;
    if (filters.dateTo) dateQuery.$lte = getDayBounds(filters.dateTo).lte;
    if (Object.keys(dateQuery).length) query.createdAt = dateQuery;
  } else if (filters.today === 'true' || filters.today === true) {
    const today = getTodayStr();
    query.createdAt = { $gte: getDayBounds(today).gte, $lte: getDayBounds(today).lte };
  } else if (filters.date) {
    const d = getDayBounds(filters.date);
    query.createdAt = { $gte: d.gte, $lte: d.lte };
  }
  return query;
};

const runPaymentStats = async (query) => {
  const [rows] = await Payment.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        revenue: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
        paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        refunded: { $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] } },
      },
    },
  ]);
  return {
    revenue: rows?.revenue || 0,
    total: rows?.total || 0,
    paid: rows?.paid || 0,
    pending: rows?.pending || 0,
    failed: rows?.failed || 0,
    refunded: rows?.refunded || 0,
  };
};

exports.getAllPayments = async (filters = {}, userRole, userId) => {
  const query = {};
  if (userRole === 'customer') {
    query.userId = userId;
  } else {
    if (userRole === 'manager') {
      const branch = await getManagerBranch(userId);
      query.$or = await buildManagerBranchQuery(branch);
    }
    if (filters.userId) query.userId = filters.userId;
    if (filters.status) {
      query.status = filters.status;
    } else {
      query.status = { $ne: 'pending' };
    }
    if (filters.method) query.method = filters.method;
    if (filters.dateFrom || filters.dateTo) {
      const dateQuery = {};
      if (filters.dateFrom) dateQuery.$gte = getDayBounds(filters.dateFrom).gte;
      if (filters.dateTo) dateQuery.$lte = getDayBounds(filters.dateTo).lte;
      if (Object.keys(dateQuery).length) query.createdAt = dateQuery;
    } else if (filters.today === 'true' || filters.today === true) {
      const today = getTodayStr();
      query.createdAt = { $gte: getDayBounds(today).gte, $lte: getDayBounds(today).lte };
    } else if (filters.date) {
      const d = getDayBounds(filters.date);
      query.createdAt = { $gte: d.gte, $lte: d.lte };
    }
  }
  // Auto-mark payments older than 24h as viewed
  const expiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await Payment.updateMany({ viewedAt: null, createdAt: { $lte: expiry } }, { viewedAt: expiry });

  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Payment.find(query)
      .populate({ path: 'bookingId', populate: [{ path: 'branchId', select: 'name' }, { path: 'packageId', select: 'name price' }], select: 'bookingDate startTime status branchId packageId' })
      .populate({ path: 'slotPackId', populate: [{ path: 'branchId', select: 'name' }, { path: 'packageId', select: 'name price' }], select: 'packCode totalSlots remainingSlots status branchId packageId' })
      .populate('userId', 'name email phone tier')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(query),
  ]);

  let stats = null;
  if (filters.withStats === 'true' || filters.withStats === true) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0,0,0,0);
    
    // Revenue stats grouped by month
    const rawStats = await Payment.aggregate([
      { $match: { status: 'paid', createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    stats = rawStats.map(s => ({
      label: `Th${s._id.month}/${s._id.year.toString().slice(-2)}`,
      totalAmount: s.totalAmount
    }));
  }

  // Thống kê 6 ô theo cùng bộ lọc method/ngày (không lọc status) — gộp chung với list API
  let summaryStats = null;
  if (userRole !== 'customer') {
    const statsQuery = await buildStatsQuery(filters, userRole, userId);
    summaryStats = await runPaymentStats(statsQuery);
  }

  return {
    data: (filters.withStats === 'true' || filters.withStats === true) ? { payments: data, stats } : data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    },
    stats: summaryStats,
  };
};

exports.getMyPaymentHistory = async (userId, filters = {}) => {
  const query = { userId };
  
  if (filters.status && filters.status !== 'all') {
    query.status = filters.status;
  }
  
  if (filters.paymentType && filters.paymentType !== 'all') {
    query.paymentType = filters.paymentType;
  }
  
  if (filters.dateFrom || filters.dateTo) {
    const dateFilter = {};
    if (filters.dateFrom) dateFilter.$gte = getDayBounds(filters.dateFrom).gte;
    if (filters.dateTo) dateFilter.$lte = getDayBounds(filters.dateTo).lte;
    query.createdAt = { ...query.createdAt, ...dateFilter };
  }

  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 50)); // Default 50
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Payment.find(query)
      .populate({ path: 'bookingId', populate: [{ path: 'branchId', select: 'name' }, { path: 'packageId', select: 'name price' }, { path: 'vehicleId', select: 'licensePlate brand model vehicleType' }], select: 'bookingDate startTime status branchId packageId finalPrice vehicleId bookingCode' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Payment.countDocuments(query),
  ]);
  
  // If we also want stats (e.g. chart data for the last 6 months)
  let stats = null;
  if (filters.withStats) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0,0,0,0);
    const uid = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const rawStats = await Payment.aggregate([
      { $match: { userId: uid, status: 'paid', createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Format stats for charting
    const formattedStats = rawStats.map(s => ({
      label: `Th${s._id.month}/${s._id.year.toString().slice(-2)}`,
      totalAmount: s.totalAmount
    }));

    // Vehicle Stats
    const rawVehicleStats = await Payment.aggregate([
      { $match: { userId: uid, status: 'paid' } },
      {
        $lookup: {
          from: 'bookings',
          localField: 'bookingId',
          foreignField: '_id',
          as: 'booking',
        },
      },
      { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'vehicles',
          localField: 'booking.vehicleId',
          foreignField: '_id',
          as: 'vehicle',
        },
      },
      { $unwind: { path: '$vehicle', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            vehicleId: '$vehicle._id',
            licensePlate: '$vehicle.licensePlate',
            vehicleType: '$vehicle.vehicleType',
            brand: '$vehicle.brand'
          },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { "totalAmount": -1 } }
    ]);
    const vehicleStats = rawVehicleStats.map(s => ({
      vehicleId: s._id.vehicleId,
      licensePlate: s._id.licensePlate || 'Chưa cập nhật',
      vehicleType: s._id.vehicleType || 'unknown',
      brand: s._id.brand || '',
      totalAmount: s.totalAmount
    }));

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    
    const [currentRes, prevRes] = await Promise.all([
      Payment.aggregate([
        { $match: { userId: uid, status: 'paid', createdAt: { $gte: currentMonthStart } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]),
      Payment.aggregate([
        { $match: { userId: uid, status: 'paid', createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    stats = {
      months: formattedStats,
      vehicles: vehicleStats,
      currentMonthTotal: currentRes[0]?.total || 0,
      previousMonthTotal: prevRes[0]?.total || 0,
    };
  }

  return {
    data: filters.withStats ? { payments: data, stats } : data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    }
  };
};

exports.getBookingPaymentHistory = async (bookingId, userRole, userId) => {
  const booking = await Booking.findById(bookingId).select('userId branchId');
  if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  if (userRole === 'customer' && String(booking.userId) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  if (userRole === 'manager') {
    const branch = await getManagerBranch(userId);
    if (!branch || String(booking.branchId) !== String(branch._id)) {
      throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }
  return Payment.find({ bookingId, status: 'paid' }).sort({ paidAt: 1, createdAt: 1 });
};

exports.refundPayment = async (bookingId, userRole, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) {
      await session.abortTransaction();
      throw Object.assign(new Error('Booking not found'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    }

    if (userRole === 'manager') {
      const branch = await getManagerBranch(userId);
      if (!branch || String(booking.branchId) !== String(branch._id)) {
        await session.abortTransaction();
        throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
      }
    }

    // Tổng tất cả thanh toán đã thu của booking để hoàn đủ số tiền khách đã trả
    const paidPayments = await Payment.find({ bookingId, status: 'paid' }).session(session);
    if (!paidPayments.length) {
      await session.abortTransaction();
      throw Object.assign(new Error('Chỉ có thể hoàn tiền cho thanh toán đã được thanh toán'), { statusCode: 400, code: 'INVALID_REFUND' });
    }

    if (booking.status === 'in_progress') {
      await session.abortTransaction();
      throw Object.assign(new Error('Không thể hoàn tiền cho lịch hẹn đang thực hiện'), { statusCode: 400, code: 'BOOKING_IN_PROGRESS' });
    }

    const totalRefund = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    await Payment.updateMany(
      { bookingId, status: 'paid' },
      { status: 'refunded', refundedAt: new Date() },
      { session }
    );

    await Booking.findByIdAndUpdate(bookingId, { status: 'cancelled', paymentStatus: 'refunded' }).session(session);

    if (booking.voucherCode) {
      await voucherService.rollbackVoucher(booking.voucherCode, paidPayments[0].userId, bookingId, session);
    }

    // Tự động hoàn tiền vào Ví AutoWash của khách hàng
    const user = await mongoose.model('User').findById(paidPayments[0].userId).session(session);
    if (user) {
      user.walletBalance = (user.walletBalance || 0) + totalRefund;
      await user.save({ session });
      
      const shortBookingCode = String(bookingId).slice(-6).toUpperCase();
      await mongoose.model('WalletTransaction').create([{
        userId: user._id,
        amount: totalRefund,
        type: 'credit',
        reason: `Hoàn tiền cho đơn đặt lịch #${shortBookingCode}`,
        bookingId: booking._id
      }], { session });
    }

    await session.commitTransaction();

    notificationService.send(
      paidPayments[0].userId,
      'Hoàn tiền thành công',
      `Yêu cầu hoàn tiền ${totalRefund.toLocaleString('vi-VN')}đ đã được xử lý.`,
      'refund',
      { bookingId, paymentId: paidPayments[0]._id }
    ).catch(() => {});

    // Notify admin + manager
    notificationService.sendToAdminAndManager(
      booking.branchId,
      'Hoàn tiền',
      `Đã hoàn tiền ${totalRefund.toLocaleString('vi-VN')}đ cho khách hàng.`,
      'refund',
      { bookingId, branchId: booking.branchId }
    ).catch(() => {});

    return paidPayments[0];
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

exports.deletePaymentsByDateRange = async (dateFrom, dateTo) => {
  const from = getDayBounds(dateFrom).gte;
  const to = getDayBounds(dateTo).lte;
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw Object.assign(new Error('Ngày không hợp lệ'), { statusCode: 400 });
  }
  const result = await Payment.deleteMany({
    createdAt: { $gte: from, $lte: to },
  });
  return { deletedCount: result.deletedCount };
};

exports.deletePaymentById = async (id) => {
  const payment = await Payment.findByIdAndDelete(id);
  if (!payment) {
    throw Object.assign(new Error('Không tìm thấy thanh toán'), { statusCode: 404 });
  }
  return { deletedCount: 1 };
};

exports.deleteAllPayments = async () => {
  const result = await Payment.deleteMany({});
  return { deletedCount: result.deletedCount };
};

