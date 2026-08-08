const mongoose = require('mongoose');
const crypto = require('crypto');
const { Booking, Package, Branch, Vehicle, Payment, User, SlotPack, PointHistory } = require('../models');
const notificationService = require('./notification.service');
const voucherService = require('./voucher.service');
const loyaltyService = require('./loyalty.service');
const sseService = require('./sse.service');
const configService = require('./config.service');

const VALID_STATUSES = ['pending', 'confirmed', 'checked_in', 'in_progress', 'awaiting_payment', 'completed', 'cancelled'];

// Luồng: pending → (manager xác nhận) confirmed → (khách đến) checked_in → in_progress → awaiting_payment/completed
const VALID_TRANSITIONS = {
  pending: ['confirmed', 'checked_in', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['in_progress', 'cancelled'],
  in_progress: ['awaiting_payment', 'completed', 'cancelled'],
  awaiting_payment: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// Tỉ lệ đặt cọc — luôn 30% (đã bỏ logic strike penalty)


// Gửi cảnh báo "sắp bị hủy" trước khi hết hạn grace period bao nhiêu phút.
//
// CHANGE: tăng từ 2 → 5 phút để khách có đủ thời gian nhận thông báo trên mobile
// (push notification có thể bị delay) và kịp phản ứng. Grace hiện tại = 15 phút
// (xem autoCancel.job.js), nên khách có:
//   - 0-10 phút sau startTime: bình thường
//   - 10-15 phút (warning window 5p): nhận cảnh báo
//   - 15+ phút: tự động cancel
//
// Nếu grace sau này đổi, nhớ điều chỉnh offset < graceMinutes.
const LATE_WARNING_OFFSET_MINUTES = 5;

// Mỗi lần quản lý gia hạn thêm cho 1 booking sắp bị auto-cancel, và tổng tối đa được gia hạn
const GRACE_EXTENSION_STEP_MINUTES = 5;
const MAX_GRACE_EXTENSION_MINUTES = 15;

// Các trạng thái còn "giữ slot" — dùng để kiểm tra trùng khung giờ
const ACTIVE_SLOT_STATUSES = ['pending', 'confirmed', 'checked_in', 'in_progress', 'awaiting_payment'];

const getDepositRate = async (user) => await configService.get('DEPOSIT_RATE', {}, 30);

const enforceAdvanceBookingLimit = async (userTier, bookingStr, todayStr) => {
  // Ưu tiên advanceDays trong từng tier (cấu hình ở tab "Hạng thành viên & Điểm")
  let maxAdvanceDays = null;
  try {
    const loyaltyConfig = await loyaltyService.getLoyaltyConfig();
    const tierObj = (loyaltyConfig.tiers || []).find((t) => String(t.id) === String(userTier));
    if (tierObj && Number.isFinite(Number(tierObj.advanceDays)) && Number(tierObj.advanceDays) >= 0) {
      maxAdvanceDays = Number(tierObj.advanceDays);
    }
  } catch (err) {
    maxAdvanceDays = null;
  }

  // Fallback: config ADVANCE_BOOKING_LIMITS cũ (dữ liệu cũ chưa có advanceDays trong tier)
  if (maxAdvanceDays === null) {
    const ADVANCE_BOOKING_DAYS = await configService.get('ADVANCE_BOOKING_LIMITS', {}, { bronze: 14, silver: 14, gold: 30, diamond: 60, Ruby: 60 });
    maxAdvanceDays = (ADVANCE_BOOKING_DAYS && ADVANCE_BOOKING_DAYS[userTier]) ? ADVANCE_BOOKING_DAYS[userTier] : 14;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysAhead = Math.floor(
    (new Date(bookingStr + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / msPerDay
  );
  if (daysAhead > maxAdvanceDays) {
    throw Object.assign(
      new Error(`Hạng thành viên của bạn chỉ được đặt trước tối đa ${maxAdvanceDays} ngày. Nâng hạng lên Gold để đặt trước 30 ngày hoặc Diamond để đặt trước 60 ngày.`),
      { statusCode: 400, code: 'ADVANCE_BOOKING_LIMIT', maxAdvanceDays }
    );
  }
};




const parseTime = (t) => {
  if (!t || typeof t !== 'string') return null;
  const parts = t.split(':');
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

const getBookingStartDateTime = (bookingDate, startTime) => {
  if (!bookingDate || !startTime) return new Date();
  let dateStr = '';
  if (bookingDate instanceof Date) {
    dateStr = bookingDate.toISOString().slice(0, 10);
  } else if (typeof bookingDate === 'string') {
    dateStr = bookingDate.slice(0, 10);
  } else {
    dateStr = new Date(bookingDate).toISOString().slice(0, 10);
  }
  const timeStr = String(startTime).trim();
  return new Date(`${dateStr}T${timeStr}:00.000+07:00`);
};

const isSlotOverlap = (s1, e1, s2, e2) => !(e1 <= s2 || s1 >= e2);

const buildSlots = (packageDuration, openTime = '07:00', closeTime = '20:00', scheduleConfig = null) => {
  const slots = [];
  
  if (scheduleConfig && (scheduleConfig.morning || scheduleConfig.afternoon)) {
    const { morning, afternoon } = scheduleConfig;
    const interval = scheduleConfig.slotInterval || 30;
    
    if (morning && morning.start && morning.end) {
      const mOpen = parseTime(morning.start);
      const mClose = parseTime(morning.end);
      if (mOpen !== null && mClose !== null) {
        for (let current = mOpen; current + packageDuration <= mClose; current += interval) {
          const start = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
          const endH = Math.floor((current + packageDuration) / 60);
          const endM = (current + packageDuration) % 60;
          const end = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
          slots.push({ startTime: start, endTime: end });
        }
      }
    }
    
    if (afternoon && afternoon.start && afternoon.end) {
      const aOpen = parseTime(afternoon.start);
      const aClose = parseTime(afternoon.end);
      if (aOpen !== null && aClose !== null) {
        for (let current = aOpen; current + packageDuration <= aClose; current += interval) {
          const start = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
          const endH = Math.floor((current + packageDuration) / 60);
          const endM = (current + packageDuration) % 60;
          const end = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
          slots.push({ startTime: start, endTime: end });
        }
      }
    }
    
    return slots;
  }

  const interval = (scheduleConfig && scheduleConfig.slotInterval) ? scheduleConfig.slotInterval : 30;
  const open = parseTime(openTime);
  const close = parseTime(closeTime);
  if (open === null || close === null) return [];
  for (let current = open; current + packageDuration <= close; current += interval) {
    const start = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
    const endH = Math.floor((current + packageDuration) / 60);
    const endM = (current + packageDuration) % 60;
    const end = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    slots.push({ startTime: start, endTime: end });
  }
  return slots;
};

const computeEndTime = (startTime, duration) => {
  const total = parseTime(startTime) + duration;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

function generateBookingCode() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `AW-${dateStr}-${rand}`;
}

const getDayBounds = (dateStr) => ({
  gte: new Date(`${dateStr}T00:00:00.000+07:00`),
  lte: new Date(`${dateStr}T23:59:59.999+07:00`),
});

/**
 * Sức chứa hiệu lực của chi nhánh: ưu tiên cấu hình riêng của branch,
 * nếu không có thì lấy DEFAULT_BRANCH_CAPACITY từ cấu hình hệ thống.
 */
const resolveBranchCapacity = async (branch) =>
  branch.capacity || (await configService.get('DEFAULT_BRANCH_CAPACITY', { branchId: branch._id }, 2));

/**
 * Tìm slot trống gần nhất (cùng ngày, cùng chi nhánh) sau mốc afterMinutes, dùng để gợi ý
 * đổi giờ cho khách khi booking sắp/đã bị auto-cancel thay vì chỉ hủy suông.
 */
const findNearestAvailableSlot = async ({ branchId, bookingDateStr, duration, afterMinutes, excludeBookingId }) => {
  const branch = await Branch.findById(branchId);
  if (!branch) return null;

  const { gte, lte } = getDayBounds(bookingDateStr);
  const existing = await Booking.find({
    _id: { $ne: excludeBookingId },
    branchId,
    bookingDate: { $gte: gte, $lte: lte },
    status: { $in: ACTIVE_SLOT_STATUSES },
  }).select('startTime endTime');

  const capacity = await resolveBranchCapacity(branch);
  const slots = buildSlots(duration, branch.openingTime || '07:00', branch.closingTime || '20:00', branch.scheduleConfig);

  for (const slot of slots) {
    const sns = parseTime(slot.startTime);
    if (sns === null || sns <= afterMinutes) continue;
    const sne = parseTime(slot.endTime);
    const overlappingCount = existing.filter((b) => {
      const bs = parseTime(b.startTime);
      const be = parseTime(b.endTime);
      return bs !== null && be !== null && isSlotOverlap(sns, sne, bs, be);
    }).length;
    if (overlappingCount < capacity) return slot;
  }
  return null;
};

exports.createBooking = async (data) => {
  const session = await mongoose.startSession();
  let resultBooking;
  try {
    await session.withTransaction(async () => {
    const { branchId, packageId, vehicleId, userId, bookingDate, startTime, note, voucherCode, discountAmount, finalPrice, selectedSubServices, slotPackId } = data;

    const [pkg, branch, vehicle, user] = await Promise.all([
      Package.findOne({ _id: packageId, isDeleted: { $ne: true } }).session(session),
      Branch.findById(branchId).session(session),
      Vehicle.findById(vehicleId).session(session),
      User.findById(userId).session(session),
    ]);

    if (!pkg) throw Object.assign(new Error('Gói dịch vụ không tồn tại'), { statusCode: 404, code: 'PACKAGE_NOT_FOUND' });
    if (pkg.status === 'inactive') throw Object.assign(new Error('Gói dịch vụ hiện không khả dụng'), { statusCode: 400, code: 'PACKAGE_UNAVAILABLE' });
    if (pkg.branchId && String(pkg.branchId) !== String(branchId)) {
      throw Object.assign(new Error('Gói dịch vụ không thuộc chi nhánh này'), { statusCode: 400, code: 'PACKAGE_BRANCH_MISMATCH' });
    }
    if (!branch) throw Object.assign(new Error('Chi nhánh không tồn tại'), { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
    if (branch.status === 'inactive') throw Object.assign(new Error('Chi nhánh hiện không khả dụng'), { statusCode: 400, code: 'BRANCH_UNAVAILABLE' });
    if (!vehicle) throw Object.assign(new Error('Xe không tồn tại'), { statusCode: 404, code: 'VEHICLE_NOT_FOUND' });
    if (String(vehicle.userId) !== String(userId)) {
      throw Object.assign(new Error('Xe không thuộc về bạn'), { statusCode: 403, code: 'FORBIDDEN' });
    }

    // Verify subServices and calculate total extra duration & price
    let extraDuration = 0;
    let extraPrice = 0;
    const validSubServices = [];
    if (selectedSubServices && Array.isArray(selectedSubServices) && pkg.subServices) {
      for (const serviceName of selectedSubServices) {
        const sub = pkg.subServices.find(s => s.name === serviceName);
        if (sub && sub.isOptional !== false) {
          extraDuration += sub.duration || 0;
          extraPrice += sub.price || 0;
          validSubServices.push({ name: sub.name, price: sub.price, duration: sub.duration, isOptional: sub.isOptional });
        }
      }
    }

    const totalDuration = pkg.duration + extraDuration;
    const endTime = computeEndTime(startTime, totalDuration);
    const endMinutes = parseTime(endTime);
    const closeMinutes = parseTime(branch.closingTime || '20:00');

    if (endMinutes > closeMinutes) {
      throw Object.assign(new Error('Giờ kết thúc vượt quá giờ đóng cửa của chi nhánh'), { statusCode: 400, code: 'OUTSIDE_HOURS' });
    }

    const bd = bookingDate instanceof Date ? bookingDate : new Date(bookingDate);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const bookingStr = bd.toISOString().split('T')[0];
    if (bookingStr < todayStr) {
      throw Object.assign(new Error('Ngày đặt không thể là ngày trong quá khứ'), { statusCode: 400, code: 'INVALID_DATE' });
    }
    if (bookingStr === todayStr) {
      const minAdvance = await configService.get('MIN_ADVANCE_BOOKING_MINUTES', {}, 30);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = parseTime(startTime);
      if (startMinutes !== null && startMinutes <= currentMinutes + minAdvance) {
        if (!data.isWalkIn) {
          throw Object.assign(new Error(`Đặt lịch phải trước ít nhất ${minAdvance} phút`), { statusCode: 400, code: 'INVALID_TIME' });
        }
      }
    }

    // ── Kiểm tra giới hạn đặt trước theo tier ──
    await enforceAdvanceBookingLimit(user.tier, bookingStr, todayStr);

    const capacityService = require('./capacity.service');
    const capacityResult = await capacityService.checkCapacity({
      branch,
      bookingStr,
      startTime,
      endTime,
      userId,
      userTier: user.tier,
    }, session);

    let finalStartTime = startTime;
    let finalEndTime = endTime;

    if (capacityResult.hasConflict) {
      if (data.isWalkIn) {
        const suggested = await findNearestAvailableSlot({
          branchId,
          bookingDateStr: bookingStr,
          duration: totalDuration,
          afterMinutes: parseTime(startTime) || (now.getHours() * 60 + now.getMinutes()),
        });
        if (suggested) {
          finalStartTime = suggested.startTime;
          finalEndTime = suggested.endTime;
        } else {
          throw Object.assign(new Error('Hôm nay chi nhánh đã kín lịch, không còn slot trống.'), { statusCode: 409, code: 'SLOT_FULL' });
        }
      } else {
        if (capacityResult.conflictReason === 'SLOT_FULL_VIP') {
          throw Object.assign(
            new Error('Khung giờ này đang có thành viên VIP giữ chỗ cuối. Vui lòng chọn khung giờ khác hoặc nâng hạng lên Gold/Diamond.'),
            { statusCode: 403, code: 'SLOT_VIP_ONLY' }
          );
        }
        throw Object.assign(new Error('Khung giờ đã đầy'), { statusCode: 409, code: 'SLOT_FULL' });
      }
    }

    let computedDiscountAmount = 0;
    let computedFinalPrice = pkg.price + extraPrice;

    if (voucherCode) {
      // Pass the computedBasePrice to voucher validation if needed, assuming voucher validation accepts amount
      const voucherResult = await voucherService.validateVoucher(voucherCode, { packageId, branchId, amount: computedFinalPrice }, userId);
      computedDiscountAmount = voucherResult.discountAmount || voucherResult.savings || 0;
      computedFinalPrice = voucherResult.finalAmount || Math.max(0, computedFinalPrice - computedDiscountAmount);
    }

    let bookingType = 'single';
    let paymentStatus = 'unpaid';

    if (slotPackId) {
      const pack = await SlotPack.findOneAndUpdate(
        { _id: slotPackId, userId, status: 'active', remainingSlots: { $gt: 0 } },
        { $inc: { remainingSlots: -1, usedSlots: 1 } },
        { new: true, session }
      );
      if (!pack) throw Object.assign(new Error('Gói lượt không tồn tại hoặc đã hết lượt'), { statusCode: 400, code: 'SLOT_PACK_INVALID' });

      // H-1 SAFETY: thay vì manual rollback rải rác 3 chỗ (dễ sót), dùng try/finally
      // để đảm bảo mọi nhánh throw đều hoàn slot. Lưu ý: vì transactions bị no-op
      // khi patch dev active (BE/src/config/db.js), nên cần rollback thủ công.
      let slotPackDecremented = true;
      try {
        if (pack.expiresAt && new Date() > pack.expiresAt) {
          throw Object.assign(new Error('Gói lượt đã hết hạn'), { statusCode: 400, code: 'SLOT_PACK_EXPIRED' });
        }

        if (pack.branchId && String(pack.branchId) !== String(branchId)) {
          throw Object.assign(new Error('Gói lượt không áp dụng cho chi nhánh này'), { statusCode: 400, code: 'SLOT_PACK_BRANCH_MISMATCH' });
        }

        if (pack.vehicleId && String(pack.vehicleId) !== String(vehicleId)) {
          throw Object.assign(new Error('Gói lượt không áp dụng cho xe này'), { statusCode: 400, code: 'SLOT_PACK_VEHICLE_MISMATCH' });
        }

        if (pack.remainingSlots === 0) {
          await SlotPack.findByIdAndUpdate(pack._id, { status: 'exhausted' }, { session });
        }

        computedDiscountAmount = 0;
        computedFinalPrice = extraPrice;
        bookingType = 'slot_pack_usage';
        paymentStatus = extraPrice > 0 ? 'unpaid' : 'paid';
      } catch (validationErr) {
        // Rollback decrement vì validation fail sau khi đã $inc.
        // Log lỗi để vận hành phát hiện nếu rollback cũng fail (DB lúc đó thực sự chết).
        await SlotPack.findByIdAndUpdate(
          pack._id,
          { $inc: { remainingSlots: 1, usedSlots: -1 } },
          { session },
        ).catch((rollbackErr) => {
          console.error(
            `[createBooking] CRITICAL: slot pack rollback failed for ${pack._id}:`,
            rollbackErr.message,
            '— manual fix required.',
          );
        });
        throw validationErr;
      }
    }

    const _dr = await getDepositRate(user);
    console.log('DEBUG deposit:', {computedFinalPrice, _dr, user_tier: user?.tier, dr_func: getDepositRate.toString()});

    // Đặt cọc cho đơn lẻ (gói lượt đã trả trước toàn bộ → không cọc).
    const depositAmount = bookingType === 'slot_pack_usage'
      ? 0
      : Math.round((computedFinalPrice * (await getDepositRate(user)) / 100) / 1000) * 1000;

    const packageSubServicesSnapshot = Array.isArray(pkg.subServices)
      ? pkg.subServices.map(s => ({
          name: typeof s === 'string' ? s : s.name,
          price: s.price || 0,
          duration: s.duration || 0,
          isOptional: s.isOptional !== false,
        }))
      : [];
    const includedSubServicesSnapshot = packageSubServicesSnapshot.filter(s => !s.isOptional);
    const currentVatPercent = await configService.get('VAT_PERCENT', {}, 10);

    const booking = new Booking({
      userId, branchId, packageId, vehicleId,
      bookingDate: bd, startTime: finalStartTime, endTime: finalEndTime, note,
      status: (data.isWalkIn && finalStartTime !== startTime) ? 'confirmed' : (data.status || 'pending'),
      isWalkIn: data.isWalkIn || false,
      isNewCustomerWalkIn: data.isNewCustomerWalkIn || false,
      bookingCode: generateBookingCode(),
      voucherCode: voucherCode || undefined,
      discountAmount: computedDiscountAmount,
      finalPrice: computedFinalPrice,
      vatPercent: currentVatPercent,
      depositAmount,
      selectedSubServices: validSubServices,
      includedSubServices: includedSubServicesSnapshot,
      packageSnapshot: {
        name: pkg.name,
        price: pkg.price,
        duration: pkg.duration,
        description: pkg.description,
        subServices: packageSubServicesSnapshot,
      },
      slotPackId: slotPackId || undefined,
      bookingType,
      paymentStatus,
      packageName: pkg.name,
      packageDuration: pkg.duration,
      packagePrice: pkg.price,
      branchName: branch.name,
      branchAddress: branch.address,
      branchPhone: branch.phone,
      branchSnapshot: {
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
      },
    });

    await booking.save({ session });

    // Reserve voucher khi tạo booking (trừ remaining + tạo VoucherUsage)
    if (voucherCode && computedDiscountAmount > 0) {
      await voucherService.reserveVoucher(voucherCode, userId, booking._id, computedDiscountAmount, session);
    }
    
    resultBooking = booking;
    }); // End of withTransaction

    // ---------- NOTIFICATIONS (Post-transaction) ----------
    // Gửi thông báo SAU KHI transaction đã commit thành công
    // để tránh bị gửi trùng lặp nếu withTransaction tự động retry.
    notificationService.send(
      data.userId,
      'Đặt lịch thành công',
      `Bạn đã đặt lịch rửa xe ${resultBooking.packageName} vào lúc ${resultBooking.startTime} ngày ${resultBooking.bookingDate.toLocaleDateString('vi-VN')}.`,
      'booking_created',
      { bookingId: resultBooking._id }
    ).catch(() => {});

    notificationService.sendToAdminAndManager(
      data.branchId,
      'Đặt lịch mới',
      `Khách hàng vừa đặt lịch ${resultBooking.packageName} lúc ${resultBooking.startTime} ngày ${resultBooking.bookingDate.toLocaleDateString('vi-VN')}.`,
      'booking_created',
      { bookingId: resultBooking._id, branchId: data.branchId }
    ).catch(() => {});

    sseService.broadcastToManagers(data.branchId, 'booking_new', {
      bookingId: resultBooking._id,
      branchId: data.branchId,
      packageName: resultBooking.packageName,
      startTime: resultBooking.startTime,
    });
    sseService.sendToUser(String(data.userId), 'my_bookings_updated', { bookingId: resultBooking._id });

    return resultBooking;
  } catch (err) {
    throw err;
  } finally {
    session.endSession();
  }
};

exports.getAllBookings = async (filters = {}, userRole, userId) => {
  const query = {};
  // H-5: mặc định ẩn booking đã soft-delete. Admin có thể truyền ?includeDeleted=true
  // để audit / khôi phục.
  if (filters.includeDeleted !== 'true' && filters.includeDeleted !== true) {
    query.isDeleted = { $ne: true };
  }
  if (userRole === 'customer') {
    query.userId = userId;
  } else if (userRole === 'manager') {
    const branch = await Branch.findOne({ managerId: userId });
    if (!branch) return { bookings: [], total: 0, page: 1, totalPages: 0 };
    query.branchId = branch._id;
    if (filters.userId) query.userId = filters.userId;
  } else {
    if (filters.userId) query.userId = filters.userId;
    if (filters.branchId) query.branchId = filters.branchId;
  }
  if (filters.status) query.status = filters.status;
  if (filters.bookingType) query.bookingType = filters.bookingType;
  if (filters.recurringGroupId) query.recurringGroupId = filters.recurringGroupId;
  if (filters.vehicleId) query.vehicleId = filters.vehicleId;

  // date range (dateFrom/dateTo) or single bookingDate
  if (filters.dateFrom || filters.dateTo) {
    query.bookingDate = {};
    if (filters.dateFrom) query.bookingDate.$gte = getDayBounds(filters.dateFrom).gte;
    if (filters.dateTo)   query.bookingDate.$lte = getDayBounds(filters.dateTo).lte;
  } else if (filters.bookingDate) {
    const dateStr = filters.bookingDate instanceof Date
      ? filters.bookingDate.toISOString().split('T')[0]
      : filters.bookingDate;
    const { gte, lte } = getDayBounds(dateStr);
    query.bookingDate = { $gte: gte, $lte: lte };
  }

  // search: match by customer name/phone, license plate, or booking code
  if (filters.search && filters.search.trim()) {
    const searchStr = filters.search.trim();
    const re = new RegExp(searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [matchedUsers, matchedVehicles] = await Promise.all([
      User.find({ $or: [{ name: re }, { phone: re }] }, '_id'),
      Vehicle.find({ licensePlate: re }, 'userId'),
    ]);
    const ids = new Set([
      ...matchedUsers.map(u => String(u._id)),
      ...matchedVehicles.map(v => String(v.userId)),
    ]);
    
    const searchOrClauses = [];
    if (ids.size > 0) {
      searchOrClauses.push({ userId: { $in: [...ids].map(id => new mongoose.Types.ObjectId(id)) } });
    }
    searchOrClauses.push({ bookingCode: re });
    if (mongoose.Types.ObjectId.isValid(searchStr) && String(new mongoose.Types.ObjectId(searchStr)) === searchStr) {
      searchOrClauses.push({ _id: new mongoose.Types.ObjectId(searchStr) });
    }
    
    if (query.$or) {
      query.$and = query.$and || [];
      query.$and.push({ $or: query.$or });
      query.$and.push({ $or: searchOrClauses });
      delete query.$or;
    } else {
      query.$or = searchOrClauses;
    }
  }

  // keyword: search package name OR branch name
  if (filters.keyword && filters.keyword.trim()) {
    const re = new RegExp(filters.keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const [matchedPackages, matchedBranches] = await Promise.all([
      Package.find({ name: re }, '_id'),
      Branch.find({ name: re }, '_id'),
    ]);
    const orClauses = [];
    if (matchedPackages.length > 0) orClauses.push({ packageId: { $in: matchedPackages.map(p => p._id) } });
    if (matchedBranches.length > 0) orClauses.push({ branchId: { $in: matchedBranches.map(b => b._id) } });
    if (orClauses.length === 0) return { bookings: [], total: 0, page: 1, totalPages: 0 };
    if (query.$or) query.$or = [...query.$or, ...orClauses];
    else query.$or = orClauses;
  }

  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 10));
  const skip = (page - 1) * limit;

  let sortObj = { createdAt: -1 };
  if (filters.sort) {
    if (filters.sort === '-createdAt' || filters.sort === 'newest') sortObj = { createdAt: -1 };
    else if (filters.sort === 'createdAt' || filters.sort === 'oldest') sortObj = { createdAt: 1 };
    else if (filters.sort === 'booking_asc' || filters.sort === 'bookingDate' || filters.sort === 'time_asc') sortObj = { bookingDate: 1, startTime: 1 };
    else if (filters.sort === 'booking_desc' || filters.sort === '-bookingDate' || filters.sort === 'time_desc') sortObj = { bookingDate: -1, startTime: -1 };
    else if (filters.sort === 'price_desc' || filters.sort === '-finalPrice') sortObj = { finalPrice: -1 };
    else if (filters.sort === 'price_asc' || filters.sort === 'finalPrice') sortObj = { finalPrice: 1 };
    else if (filters.sort === 'priority_desc' || filters.sort === '-priority') sortObj = { priority: -1, createdAt: -1 };
  }

  if (filters.groupByRecurring === 'true') {
    const pipeline = [
      { $match: query },
      { $sort: sortObj },
      {
        $group: {
          _id: { $ifNull: ["$recurringGroupId", "$_id"] },
          doc: { $first: "$$ROOT" },
          groupCount: { $sum: 1 },
          totalFinalPrice: { $sum: "$finalPrice" },
          totalDepositAmount: { $sum: "$depositAmount" }
        }
      },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              "$doc",
              {
                isGroup: { $cond: [{ $eq: [{ $type: "$doc.recurringGroupId" }, "missing"] }, false, true] },
                groupCount: "$groupCount",
                groupTotalPrice: "$totalFinalPrice",
                groupTotalDeposit: "$totalDepositAmount"
              }
            ]
          }
        }
      },
      { $sort: sortObj },
      { $skip: skip },
      { $limit: limit }
    ];

    const countPipeline = [
      { $match: query },
      { $group: { _id: { $ifNull: ["$recurringGroupId", "$_id"] } } },
      { $count: "total" }
    ];

    const [aggResults, countResult] = await Promise.all([
      Booking.aggregate(pipeline),
      Booking.aggregate(countPipeline)
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;

    await Booking.populate(aggResults, [
      { path: 'userId', select: 'name email phone tier walletBalance' },
      { path: 'branchId', select: 'name address' },
      { path: 'packageId', select: 'name price duration' },
      { path: 'vehicleId', select: 'licensePlate vehicleType brand color' }
    ]);

    return {
      bookings: aggResults,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate('userId', 'name email phone tier walletBalance')
      .populate('branchId', 'name address')
      .populate('packageId', 'name price duration subServices')
      .populate('vehicleId', 'licensePlate vehicleType brand color')
      .sort(sortObj)
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(query),
  ]);

  return {
    bookings,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
};

exports.getBookingsByUser = async (userId, startDate) => {
  const query = {
    userId,
    paymentStatus: 'paid',
    isDeleted: { $ne: true },
  };
  if (startDate) {
    query.createdAt = { $gte: new Date(startDate) };
  }
  return Booking.find(query)
    .select('bookingCode status bookingDate startTime finalPrice packageId')
    .populate('packageId', 'name price duration')
    .sort({ createdAt: -1 })
    .limit(50);
};

exports.getBookingsByVehicle = async (vehicleId, startDate, endDate) => {
  const query = {
    vehicleId,
    paymentStatus: 'paid',
    isDeleted: { $ne: true },
  };
  if (startDate) {
    query.createdAt = { $gte: new Date(startDate) };
  }
  console.log(`[getBookingsByVehicle] vehicleId=${vehicleId} startDate=${startDate} query=`, JSON.stringify(query));
  return Booking.find(query)
    .select('bookingCode status bookingDate startTime finalPrice packageId')
    .populate('packageId', 'name price duration')
    .sort({ createdAt: -1 })
    .limit(50);
};

exports.getBookingById = async (id, userRole, userId, userBranchId) => {
  const isObjectId = mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
  let booking = isObjectId
    ? await Booking.findById(id)
        .populate('userId', 'name email phone tier walletBalance')
        .populate('branchId', 'name address phone')
        .populate('packageId', 'name price duration subServices')
        .populate('vehicleId', 'licensePlate vehicleType brand color')
        .populate('slotPackId', 'packCode packageName totalSlots usedSlots remainingSlots status')
    : null;

  // id có thể là recurringGroupId (UUID) khi mở chi tiết từ danh sách đã gộp lịch định kỳ
  if (!booking) {
    booking = await Booking.findOne({ recurringGroupId: String(id) })
      .populate('userId', 'name email phone tier walletBalance')
      .populate('branchId', 'name address phone')
.populate('packageId', 'name price duration subServices')
      .populate('vehicleId', 'licensePlate vehicleType brand color')
      .populate('slotPackId', 'packCode packageName totalSlots usedSlots remainingSlots status')
}
  if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  // H-5: nếu booking đã soft-delete, customer/manager không truy cập được, admin thì có (?includeDeleted=true qua getAllBookings)
  if (booking.isDeleted && userRole !== 'admin') {
    throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  }
  if (userRole === 'customer' && String(booking.userId._id || booking.userId) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  if (userRole === 'manager') {
    const bookingBranch = String(booking.branchId?._id || booking.branchId);
    if (!userBranchId || String(userBranchId) !== bookingBranch) {
      throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }

  return attachRewardInfo(booking);
};

// Gắn thông tin phần thưởng (điểm tích lũy + vòng quay) vào booking để UI hiển thị ngay
// — kể cả trước khi side-effect cộng điểm / tặng spin chạy xong.
async function attachRewardInfo(booking) {
  // Chuyển doc Mongoose sang plain object NGAY tư đȗu để các field động (pointsEarned/expectedPoints/expectedSpin)
  // không bị Mongoose toObject()/toJSON() bỏ sót khi controller res.json(booking).
  const result = booking.toObject ? booking.toObject() : { ...booking };
  try {
    // Điểm thực tế đã cộng cho booking này (awarded on completion)
    const earnedPoints = await PointHistory.aggregate([
      { $match: { referenceId: booking._id, type: 'earned', isDeleted: { $ne: true } } },
      { $group: { _id: null, total: { $sum: '$points' } } },
    ]);
    result.pointsEarned = earnedPoints[0]?.total || 0;

    // Ước lượng phần thưởng khách sẽ nhận khi hoàn thành đơn (điểm + vòng quay)
    const isSlotPack = booking.bookingType === 'slot_pack_usage';
    const pointsBaseAmount = isSlotPack
      ? (booking.packagePrice ?? booking.packageId?.price ?? 0) + (booking.selectedSubServices || []).reduce((sum, s) => sum + (s.price || 0), 0)
      : (booking.finalPrice || 0);
    const isFullyPaid = booking.paymentStatus === 'paid' || isSlotPack;

    if (pointsBaseAmount > 0) {
      const loyaltyConfig = await loyaltyService.getLoyaltyConfig();
      const userTier = booking.userId?.tier || 'bronze';
      result.expectedPoints = loyaltyService.calculatePoints(pointsBaseAmount, userTier, loyaltyConfig) || 0;
    } else {
      result.expectedPoints = 0;
    }
    result.expectedSpin = !!isFullyPaid;
  } catch (e) {
    result.pointsEarned = result.pointsEarned || 0;
    result.expectedPoints = 0;
    result.expectedSpin = false;
  }
  return result;
}

exports.updateBooking = async (id, updates, userRole, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const booking = await Booking.findById(id).session(session);
    if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    if (userRole === 'customer' && String(booking.userId) !== String(userId)) {
      throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
    }
    if (booking.status === 'completed' || booking.status === 'cancelled') {
      throw Object.assign(new Error('Không thể cập nhật lịch hẹn đã hoàn thành hoặc đã hủy'), { statusCode: 400, code: 'INVALID_STATUS' });
    }
    // Khách hàng chỉ được tự đổi giờ/ngày (vd: theo gợi ý khi sắp bị auto-cancel), không đổi chi nhánh/gói
    if (userRole === 'customer' && (updates.branchId !== undefined || updates.packageId !== undefined)) {
      throw Object.assign(new Error('Không thể đổi chi nhánh hoặc gói dịch vụ'), { statusCode: 400, code: 'FORBIDDEN_FIELD' });
    }

    const allowedFields = ['bookingDate', 'startTime', 'note', 'packageId', 'branchId'];
    const filtered = {};
    allowedFields.forEach((k) => { if (updates[k] !== undefined) filtered[k] = updates[k]; });

    const isRescheduled = filtered.bookingDate || filtered.startTime || filtered.packageId || updates.branchId;

    if (filtered.startTime || filtered.packageId || updates.branchId) {
      const pkgId = filtered.packageId || booking.packageId;
      const pkg = await Package.findById(pkgId).session(session);
      if (!pkg) throw Object.assign(new Error('Gói dịch vụ không tồn tại'), { statusCode: 404, code: 'PACKAGE_NOT_FOUND' });
      const bid = String(filtered.branchId || booking.branchId);
      if (pkg.branchId && String(pkg.branchId) !== bid) {
        throw Object.assign(new Error('Gói dịch vụ không thuộc chi nhánh này'), { statusCode: 400, code: 'PACKAGE_BRANCH_MISMATCH' });
      }

      const startT = filtered.startTime || booking.startTime;
      const endTime = computeEndTime(startT, pkg.duration);
      filtered.endTime = endTime;

      const dateObj = filtered.bookingDate ? new Date(filtered.bookingDate) : booking.bookingDate;
      const dateStr = dateObj.toISOString().split('T')[0];
      const { gte, lte } = getDayBounds(dateStr);

      const conflicting = await Booking.find({
        _id: { $ne: booking._id },
        branchId: bid,
        bookingDate: { $gte: gte, $lte: lte },
        status: { $in: ACTIVE_SLOT_STATUSES },
      }).session(session);

      const newStart = parseTime(startT);
      const newEnd = parseTime(endTime);
      const hasConflict = conflicting.some((b) => {
        const bs = parseTime(b.startTime);
        const be = parseTime(b.endTime);
        return bs !== null && be !== null && isSlotOverlap(newStart, newEnd, bs, be);
      });
      if (hasConflict) {
        throw Object.assign(new Error('Khung giờ không khả dụng'), { statusCode: 409, code: 'SLOT_UNAVAILABLE' });
      }
    }

    Object.assign(booking, filtered);
    if (isRescheduled) {
      booking.rescheduleCount = (booking.rescheduleCount || 0) + 1;
      // Đổi giờ = tính lại hạn auto-cancel từ đầu cho khung giờ mới
      booking.lateWarningSentAt = undefined;
      booking.suggestedSlotStartTime = undefined;
      booking.graceExtensionMinutes = 0;
    }
    await booking.save({ session });

    await session.commitTransaction();
    return booking;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

exports.updateBookingStatus = async (id, status, updateData = {}, userRole, userBranchId, userId) => {
  if (!VALID_STATUSES.includes(status)) {
    throw Object.assign(new Error('Trạng thái không hợp lệ'), { statusCode: 400, code: 'INVALID_STATUS' });
  }

  const currentBooking = await Booking.findById(id);
  if (!currentBooking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });

  if (userRole === 'customer') {
    if (String(currentBooking.userId) !== String(userId)) {
      throw Object.assign(new Error('Bạn không có quyền thực hiện thao tác trên lịch hẹn này'), { statusCode: 403, code: 'FORBIDDEN' });
    }
    if (status !== 'checked_in') {
      throw Object.assign(new Error('Khách hàng chỉ có thể tự thực hiện Check-in tại quầy'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }

  if (userRole === 'manager') {
    if (!userBranchId || String(userBranchId) !== String(currentBooking.branchId)) {
      throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }

  const allowed = VALID_TRANSITIONS[currentBooking.status] || [];
  if (!allowed.includes(status)) {
    throw Object.assign(new Error(`Không thể chuyển từ '${currentBooking.status}' sang '${status}'`), { statusCode: 400, code: 'INVALID_TRANSITION' });
  }

  // Chốt chặn cọc: nếu chuyển sang 'confirmed' mà booking yêu cầu cọc
  // (depositAmount > 0) mà chưa cọc thì từ chối. Áp dụng cho single booking.
  // Recurring: chỉ buổi đầu (`isRecurringFirst`) mới có depositAmount > 0; các
  // buổi sau trong nhóm đã được cọc gộp ở buổi đầu nên cho confirm bình thường.
  // Đồng thời áp dụng khi chuyển trực tiếp từ 'pending' sang 'checked_in'.
  if (status === 'confirmed' || (status === 'checked_in' && currentBooking.status === 'pending')) {
    const requiresDeposit = (currentBooking.depositAmount || 0) > 0;
    const isPaid = currentBooking.depositPaid ||
      ['deposit_paid', 'paid'].includes(currentBooking.paymentStatus);
    if (requiresDeposit && !isPaid) {
      throw Object.assign(
        new Error('Chưa đặt cọc — không thể xác nhận / check-in lịch hẹn'),
        { statusCode: 400, code: 'DEPOSIT_REQUIRED' },
      );
    }
  }

  // Chốt chặn awaiting_payment: chỉ cho phép khi booking còn dư nợ thực tế
  // (outstanding > 0), bao gồm trường hợp slot pack có dịch vụ thêm chưa thanh toán.
  if (status === 'awaiting_payment') {
    const alreadyPaid = currentBooking.paymentStatus === 'paid';
    const paidAmount = currentBooking.depositPaid ? (currentBooking.depositAmount || 0) : 0;
    const outstanding = (currentBooking.finalPrice || currentBooking.totalAmount || 0) - paidAmount;
    if (alreadyPaid || outstanding <= 0) {
      throw Object.assign(
        new Error(
          alreadyPaid
            ? 'Lịch hẹn đã thanh toán đủ — không thể chờ thanh toán phần còn lại'
            : 'Lịch hẹn không có dư nợ — chuyển thẳng sang "Hoàn thành"',
        ),
        { statusCode: 400, code: 'NO_REMAINING_BALANCE' },
      );
    }
  }

  const update = { status };
  if (status === 'confirmed') update.confirmedAt = new Date();
  if (status === 'checked_in') {
    update.checkInTime = new Date();
    if (!currentBooking.confirmedAt) {
      update.confirmedAt = new Date();
    }
    // H-3 SAFETY: xóa các cờ warning / grace khi manager xác nhận hoặc check-in.
    // Tránh trường hợp cron tick kế tiếp xét lại booking đã check-in và cancel nhầm.
    update.lateWarningSentAt = undefined;
    update.suggestedSlotStartTime = undefined;
    update.graceExtensionMinutes = 0;
    if (updateData.staffId) update.staffId = updateData.staffId;
  }
  // H-3: tương tự cho 'awaiting_payment' và 'completed' — booking đã qua checkpoint
  // này thì cron auto-cancel không nên xét nữa. Set null grace marker để idempotent.
  if (status === 'in_progress' || status === 'awaiting_payment' || status === 'completed') {
    update.lateWarningSentAt = undefined;
    update.graceExtensionMinutes = 0;
  }
  if (status === 'cancelled') update.cancelledAt = new Date();
  if (status === 'awaiting_payment') {
    update.checkOutTime = new Date();
  }
  if (status === 'completed') {
    // Chốt chặn: không cho nhảy từ "Chờ thanh toán" → "Hoàn thành" nếu còn dư nợ
    if (currentBooking.status === 'awaiting_payment' && currentBooking.paymentStatus !== 'paid') {
      const outstanding = (currentBooking.finalPrice || currentBooking.totalAmount || 0) - (currentBooking.depositPaid ? (currentBooking.depositAmount || 0) : 0);
      if (outstanding > 0) {
        throw Object.assign(new Error('Không thể chuyển sang "Hoàn thành" khi còn dư nợ — vui lòng thu tiền trước'), { statusCode: 400, code: 'OUTSTANDING_BALANCE' });
      }
    }
    if (currentBooking.status !== 'awaiting_payment') update.checkOutTime = new Date();
    if (currentBooking.paymentStatus === 'unpaid') {
      update.paymentStatus = 'pending';
    }
    if (updateData.rating) update.rating = updateData.rating;
    if (updateData.feedback) update.feedback = updateData.feedback;
  }
  if (updateData.note) update.note = updateData.note;

  const booking = await Booking.findOneAndUpdate(
    { _id: id, status: currentBooking.status },
    update,
    { new: true }
  ).populate('userId', 'name email phone tier')
   .populate('branchId', 'name address phone')
   .populate('packageId', 'name price duration subServices')
   .populate('vehicleId', 'licensePlate vehicleType brand color');
  if (!booking) {
    throw Object.assign(new Error('Booking status was changed by another request'), { statusCode: 409, code: 'CONCURRENT_MODIFICATION' });
  }

  // Notify customer when their booking is confirmed by the branch
  if (status === 'confirmed') {
    notificationService.send(
      booking.userId?._id || currentBooking.userId,
      'Lịch hẹn đã được xác nhận',
      `Lịch rửa xe ${booking.packageId?.name || ''} lúc ${booking.startTime} ngày ${new Date(booking.bookingDate).toLocaleDateString('vi-VN')} đã được xác nhận. Vui lòng đến đúng giờ để check-in.`,
      'booking_confirmed',
      { bookingId: id }
    ).catch(() => {});
  }

  if (status === 'checked_in') {
    const sseService = require('./sse.service');
    sseService.broadcastToAll('customer_checked_in_via_qr', {
      bookingId: id,
      bookingCode: booking.bookingCode,
      branchId: String(booking.branchId?._id || booking.branchId),
      status: 'checked_in',
    });
    notificationService.send(
      booking.userId?._id || currentBooking.userId,
      'Check-in thành công',
      `Bạn đã check-in thành công cho xe ${booking.vehicleId?.licensePlate || ''} tại ${booking.branchName || booking.branchId?.name || 'Chi nhánh'}.`,
      'booking_checked_in',
      { bookingId: id }
    ).catch(() => {});
  }

  // Post-completion side effects (async, non-blocking)
  if (status === 'awaiting_payment') {
    setImmediate(async () => {
      try {
        const plate = booking.vehicleId?.licensePlate || '';
        await notificationService.send(
          booking.userId?._id || currentBooking.userId,
          'Xe đã rửa xong',
          `Xe ${plate} đã rửa xong. Vui lòng thanh toán phần còn lại để hoàn tất.`,
          'booking_awaiting_payment',
          { bookingId: id }
        );
      } catch { /* silent */ }
    });
  }

  if (status === 'completed') {
    setImmediate(async () => {
      try {
        const plate = booking.vehicleId?.licensePlate || '';
        const branch = booking.branchId?.name || 'chi nhánh';

        // Increment Package booking count
        if (booking.packageId) {
          const pkgId = typeof booking.packageId === 'object' ? booking.packageId._id : booking.packageId;
          const PackageModel = mongoose.model('Package');
          await PackageModel.findByIdAndUpdate(pkgId, { $inc: { bookingCount: 1 } }).catch(() => {});
        }

        // Award loyalty points when booking is completed (points removed from payment flow)
        let pointsEarned = 0;
        const pointsBaseAmount = currentBooking.bookingType === 'slot_pack_usage'
          ? (currentBooking.packagePrice ?? booking.packageId?.price ?? 0) + (currentBooking.selectedSubServices || []).reduce((sum, s) => sum + (s.price || 0), 0)
          : currentBooking.finalPrice || 0;
        if ((pointsBaseAmount || 0) > 0) {
          const alreadyAwarded = await PointHistory.findOne({ referenceId: currentBooking._id, type: 'earned' });
          if (!alreadyAwarded) {
            const result = await loyaltyService.addPointsFromPayment(currentBooking.userId, pointsBaseAmount, currentBooking._id, null);
            if (result) pointsEarned = result.pointsEarned || 0;
          }
        }

        // Hoàn thành đúng hẹn = "chuộc lại" 1 strike no-show trước đó (nếu có)
        // Đồng thời tặng 1 lượt quay vòng quay may mắn nếu đã thanh toán đủ
        const isFullyPaid = currentBooking.paymentStatus === 'paid' || currentBooking.bookingType === 'slot_pack_usage';
        if (isFullyPaid) {
          await User.findOneAndUpdate(
            { _id: currentBooking.userId },
            { 
              $inc: { spinCount: 1 },
            }
          ).catch(() => {});
          await Booking.updateOne({ _id: currentBooking._id }, { $set: { spinEarned: true } }).catch(() => {});
          sseService.sendToUser(currentBooking.userId, 'spin_added', { count: 1 });
        }

        // Thông báo manager/admin refresh chi tiết đơn để điểm + spin mới nhất hiển thị ngay
        sseService.broadcastToManagers(
          currentBooking.branchId?._id || currentBooking.branchId,
          'slots_updated',
          { bookingId: currentBooking._id }
        );

        // Notify customer — include points earned and spin info
        const extras = [];
        if (pointsEarned > 0) extras.push(`Bạn được cộng +${pointsEarned.toLocaleString('vi-VN')} điểm thưởng`);
        if (isFullyPaid) extras.push('nhận được 1 vòng quay may mắn');
        const extrasText = extras.length > 0 ? ` ${extras.join(' và ')}. Hãy vào trang Quà Tặng (gifts) để quay nhé!` : '';
        await notificationService.send(
          booking.userId?._id || currentBooking.userId,
          'Dịch vụ đã hoàn thành',
          `Xe ${plate} đã hoàn thành tại ${branch}.${extrasText}`,
          'booking_completed',
          { bookingId: id, pointsEarned }
        );
        // Notify admin + manager
        await notificationService.sendToAdminAndManager(
          booking.branchId?._id || booking.branchId,
          'Dịch vụ hoàn thành',
          `Xe ${plate} đã hoàn thành tại ${branch}.`,
          'booking_completed',
          { bookingId: id }
        );
        
        await User.findOneAndUpdate(
          { _id: currentBooking.userId, noShowCount: { $gt: 0 } },
          { $inc: { noShowCount: -1 } }
        ).catch(() => {});
      } catch (err) { console.error('[completed side-effects]', err); /* silent */ }
    });
  }

  return attachRewardInfo(booking);
};

exports.updateSubServices = async (id, subServiceNames, userRole, userBranchId, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const booking = await Booking.findById(id).session(session);
    if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    
    if (userRole === 'manager') {
      if (!userBranchId || String(userBranchId) !== String(booking.branchId)) {
        throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
      }
    } else if (userRole === 'customer') {
      if (!userId || String(userId) !== String(booking.userId)) {
        throw Object.assign(new Error('Không có quyền cập nhật lịch hẹn này'), { statusCode: 403, code: 'FORBIDDEN' });
      }
    }
    
    if (booking.status === 'completed' || booking.status === 'cancelled') {
      throw Object.assign(new Error('Không thể cập nhật lịch hẹn đã hoàn thành hoặc đã hủy'), { statusCode: 400, code: 'INVALID_STATUS' });
    }

    const pkg = await Package.findById(booking.packageId).session(session);
    if (!pkg) throw Object.assign(new Error('Gói dịch vụ không tồn tại'), { statusCode: 404 });

    const packages = await Package.find({ isDeleted: false }).session(session);
    const validSubServices = [];
    let addedDuration = 0;
    let addedPrice = 0;

    const uniqueNames = [...new Set(subServiceNames)];

    for (const name of uniqueNames) {
      let found = false;
      
      // 1. First check if this subservice belongs to the booked package (pkg)
      const pkgSub = pkg.subServices?.find(s => s.name === name);
      if (pkgSub) {
        const isOpt = pkgSub.isOptional !== false;
        validSubServices.push({
          name: pkgSub.name,
          price: pkgSub.price,
          duration: pkgSub.duration,
          isOptional: isOpt
        });
        // ONLY add duration and price if it is an OPTIONAL EXTRA service!
        // Included services (isOptional === false) are already in pkg.duration & pkg.price.
        if (isOpt) {
          addedDuration += pkgSub.duration || 0;
          addedPrice += pkgSub.price || 0;
        }
        found = true;
      }

      // 2. If not in booked package, check if it exists in current booking's selectedSubServices
      if (!found) {
        const existingSub = booking.selectedSubServices?.find(s => s.name === name);
        if (existingSub) {
          const isOpt = existingSub.isOptional !== false;
          validSubServices.push({
            name: existingSub.name,
            price: existingSub.price,
            duration: existingSub.duration,
            isOptional: isOpt
          });
          if (isOpt) {
            addedDuration += existingSub.duration || 0;
            addedPrice += existingSub.price || 0;
          }
          found = true;
        }
      }

      // 3. If still not found, search across all packages for an optional extra subservice
      if (!found) {
        let maxPriceSub = null;
        for (const p of packages) {
          const sub = p.subServices?.find(s => s.name === name);
          if (sub) {
            if (!maxPriceSub || (sub.price || 0) > (maxPriceSub.price || 0)) {
              maxPriceSub = sub;
            }
          }
        }
        
        if (maxPriceSub) {
          const isOpt = maxPriceSub.isOptional !== false;
          validSubServices.push({
            name: maxPriceSub.name,
            price: maxPriceSub.price,
            duration: maxPriceSub.duration,
            isOptional: isOpt
          });
          if (isOpt) {
            addedDuration += maxPriceSub.duration || 0;
            addedPrice += maxPriceSub.price || 0;
          }
          found = true;
        }
      }

      if (!found) {
        throw Object.assign(new Error(`Dịch vụ phụ không tồn tại: ${name}`), { statusCode: 404 });
      }
    }

    const totalDuration = pkg.duration + addedDuration;
    const endTime = computeEndTime(booking.startTime, totalDuration);
    
    const branch = await Branch.findById(booking.branchId).session(session);
    const closeMinutes = parseTime(branch?.closingTime || '20:00');
    if (parseTime(endTime) > closeMinutes) {
      throw Object.assign(new Error('Thêm dịch vụ vượt quá giờ đóng cửa của chi nhánh'), { statusCode: 400 });
    }

    booking.selectedSubServices = validSubServices;
    booking.endTime = endTime;
    // Dùng giá gói snapshot tại thời điểm đặt để không nhảy giá khi admin chỉnh sửa giữa chừng
    const basePrice = booking.bookingType === 'slot_pack_usage' ? 0 : (booking.packagePrice ?? pkg.price);
    const newFinalPrice = Math.max(0, basePrice + addedPrice - (booking.discountAmount || 0));

    // Determine actual total amount paid so far by the customer
    let actualPaid = 0;
    if (booking.paymentStatus === 'paid') {
      actualPaid = Math.max(booking.finalPrice || 0, booking.depositAmount || 0);
    } else if (booking.paymentStatus === 'deposit_paid' || booking.depositPaid) {
      actualPaid = booking.depositAmount || 0;
    }

    let refundAmount = 0;

    if (actualPaid > 0) {
      if (newFinalPrice <= actualPaid) {
        refundAmount = actualPaid - newFinalPrice;

        booking.paymentStatus = 'paid';
        booking.depositAmount = newFinalPrice;
        booking.depositPaid = true;
      } else {
        booking.paymentStatus = 'deposit_paid';
        booking.depositAmount = actualPaid;
        booking.depositPaid = true;
      }
    }

    booking.finalPrice = newFinalPrice;
    
    // Process wallet refund if customer overpaid (canceled paid optional subservices)
    if (refundAmount > 0 && booking.userId) {
      const WalletTx = mongoose.model('WalletTransaction');
      const user = await mongoose.model('User').findById(booking.userId).session(session);
      if (user) {
        // H-4 IDEMPOTENCY: chống double-credit khi updateSubServices bị retry.
        // Ground truth: tìm WalletTransaction 'credit' với reason match pattern
        // "Hoàn tiền hủy dịch vụ chọn thêm #<bookingCode>" cho booking này.
        const reasonPattern = new RegExp(
          `#${(booking.bookingCode || String(id)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        );
        const existingRefund = await WalletTx.findOne({
          bookingId: booking._id,
          type: 'credit',
          reason: { $regex: reasonPattern },
        }).session(session);

        if (existingRefund) {
          console.warn(
            `[updateSubServices] Idempotency: refund already exists for booking ${booking._id} (txn ${existingRefund._id}). Skip double-credit.`,
          );
        } else {
          user.walletBalance = (user.walletBalance || 0) + refundAmount;
          await user.save({ session });

          await WalletTx.create([{
            userId: user._id,
            amount: refundAmount,
            type: 'credit',
            reason: `Hoàn tiền hủy dịch vụ chọn thêm #${booking.bookingCode || id}`,
            bookingId: booking._id,
          }], { session });

          sseService.sendToUser(user._id, 'wallet_updated', { walletBalance: user.walletBalance });
        }
      }
    }

    await booking.save({ session });
    await session.commitTransaction();

    const updated = await Booking.findById(booking._id)
      .populate('userId', 'name email phone tier walletBalance')
      .populate('branchId', 'name address phone')
      .populate('packageId', 'name price duration subServices')
      .populate('vehicleId', 'licensePlate vehicleType brand color');

    const result = updated ? updated.toObject() : booking.toObject();
    result.refundAmount = refundAmount;
    return result;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Xác nhận hàng loạt các đơn đang 'pending' → 'confirmed'.
 * Nếu truyền ids → chỉ xác nhận các id đó; nếu không → xác nhận tất cả pending trong phạm vi.
 * Manager chỉ xác nhận đơn thuộc chi nhánh mình.
 */
exports.confirmBookings = async (ids, userRole, userId) => {
  const query = { status: 'pending' };

  if (userRole === 'manager') {
    const branch = await Branch.findOne({ managerId: userId });
  if (!branch) throw Object.assign(new Error('Chi nhánh không tồn tại'), { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
    query.branchId = branch._id;
  }

  if (Array.isArray(ids) && ids.length > 0) {
    query._id = { $in: ids.map((i) => new mongoose.Types.ObjectId(i)) };
  }

  const pending = await Booking.find(query)
    .populate('packageId', 'name price duration subServices')
    .populate('userId', 'name');

  if (pending.length === 0) {
    return { confirmed: 0, total: 0, bookings: [], skipped: [] };
  }

  // Gate: chỉ confirm những booking đã cọc (hoặc không yêu cầu cọc).
  // - slot_pack_usage: depositAmount = 0 → cho confirm luôn.
  // - depositAmount > 0 mà depositPaid = false (paymentStatus = 'unpaid') → bỏ qua,
  //   trả về `skipped` để manager biết phải đòi khách cọc trước.
  // - Recurring: chỉ check booking đầu (`isRecurringFirst`); các buổi sau
  //   depositAmount = 0 nhưng vẫn thuộc nhóm đã cọc rồi.
  const PAID_STATUSES = ['deposit_paid', 'paid'];
  const confirmable = [];
  const skipped = [];
  for (const b of pending) {
    const requiresDeposit = (b.depositAmount || 0) > 0;
    const isPaid = b.depositPaid || PAID_STATUSES.includes(b.paymentStatus);
    if (!requiresDeposit || isPaid) {
      confirmable.push(b);
    } else {
      skipped.push({
        bookingId: b._id,
        reason: 'Chưa đặt cọc — không thể xác nhận',
        depositAmount: b.depositAmount,
      });
    }
  }

  const now = new Date();
  const results = await Promise.allSettled(
    confirmable.map((b) =>
      Booking.findOneAndUpdate(
        { _id: b._id, status: 'pending' },
        { status: 'confirmed', confirmedAt: now },
        { new: true }
      )
    )
  );

  const confirmed = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);

  // Log bookings that were skipped due to concurrent status change (race condition)
  const raceSkipped = results
    .filter((r) => r.status === 'fulfilled' && !r.value)
    .map((_, i) => confirmable[i]?._id);
  if (raceSkipped.length > 0) {
    console.warn('[confirmBookings] Race condition: bookings no longer pending at update time:', raceSkipped);
  }

  // Thông báo cho từng khách (non-blocking)
  for (const b of confirmable) {
    notificationService.send(
      b.userId?._id || b.userId,
      'Lịch hẹn đã được xác nhận',
      `Lịch rửa xe ${b.packageId?.name || ''} lúc ${b.startTime} ngày ${new Date(b.bookingDate).toLocaleDateString('vi-VN')} đã được xác nhận.`,
      'booking_confirmed',
      { bookingId: b._id }
    ).catch(() => {});
  }

  return {
    confirmed: confirmed.length,
    total: pending.length,
    bookings: confirmed,
    skipped,
    skippedCount: skipped.length,
  };
};
// ─── Cancel Preview (tính trước số tiền hoàn/phạt) ────────────────────────
exports.getCancelPreview = async (id, userId) => {
  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404 });
  if (String(booking.userId) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền'), { statusCode: 403 });
  }

  const now = new Date();
  const bookingDateTime = getBookingStartDateTime(booking.bookingDate, booking.startTime);
  const minutesBefore = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60);
  const lateCancelThreshold = await configService.get('LATE_CANCEL_THRESHOLD_MINUTES', {}, 60);
  const isLateCancel = minutesBefore <= lateCancelThreshold;

  let totalPaid = 0;
  let refundAmount = 0;
  let penaltyAmount = 0;
  let penaltyPercent = 0;
  let policy = '';

  if (booking.bookingType === 'recurring') {
    // Lịch định kỳ: hoàn đúng theo từng buổi (không phải cả lịch)
    let groupDepositAmount = 0;
    let recurringTotal = booking.recurringTotal || 1;
    const firstBooking = booking.isRecurringFirst
      ? booking
      : await Booking.findOne({ recurringGroupId: booking.recurringGroupId, isRecurringFirst: true });
    if (firstBooking) {
      groupDepositAmount = firstBooking.depositAmount;
      recurringTotal = firstBooking.recurringTotal || 1;
    }
    const depositShare = Math.round(groupDepositAmount / recurringTotal);
    const sessionPaidAmount = booking.paymentStatus === 'paid' ? (booking.depositAmount ?? booking.finalPrice ?? 0) : 0;

    if (sessionPaidAmount > 0) {
      totalPaid = sessionPaidAmount;
      if (isLateCancel) {
        // Đã thanh toán đủ buổi này → mất % theo SystemConfig
        penaltyPercent = await configService.get('LATE_CANCEL_PENALTY_FULL_PERCENT', {}, 30);
        penaltyAmount = Math.round(sessionPaidAmount * penaltyPercent / 100);
        refundAmount = sessionPaidAmount - penaltyAmount;
        policy = `Hủy trong vòng ${Math.round(lateCancelThreshold)} phút trước giờ hẹn: mất ${penaltyPercent}% (${penaltyAmount.toLocaleString('vi-VN')}₫). Hoàn lại ${refundAmount.toLocaleString('vi-VN')}₫ vào ví.`;
      } else {
        // Hủy sớm → hoàn 100% giá buổi này
        refundAmount = sessionPaidAmount;
        penaltyAmount = 0;
        policy = `Hoàn lại 100% (${sessionPaidAmount.toLocaleString('vi-VN')}₫) vào ví.`;
      }
    } else if (['paid', 'deposit_paid'].includes(booking.paymentStatus)) {
      // Chỉ đặt cọc cả lịch → hoàn theo phần cọc của buổi này
      totalPaid = depositShare;
      if (isLateCancel) {
        const depositPenalty = await configService.get('LATE_CANCEL_PENALTY_DEPOSIT_PERCENT', {}, 100);
        penaltyAmount = Math.round(depositShare * depositPenalty / 100);
        refundAmount = Math.max(0, depositShare - penaltyAmount);
        policy = `Hủy trong vòng ${Math.round(lateCancelThreshold)} phút trước giờ hẹn: mất ${depositPenalty}% tiền cọc (${penaltyAmount.toLocaleString('vi-VN')}₫).`;
      } else {
        // Hủy sớm → hoàn 100% phần cọc buổi này
        refundAmount = depositShare;
        penaltyAmount = 0;
        policy = `Hoàn lại 100% (${depositShare.toLocaleString('vi-VN')}₫) vào ví.`;
      }
    }
  } else if (['paid', 'deposit_paid'].includes(booking.paymentStatus)) {
    const paidPayment = await Payment.findOne({ bookingId: id, status: 'paid' });
    if (paidPayment) {
      totalPaid = paidPayment.amount;
      const deposit = booking.depositAmount || 0;

      if (isLateCancel) {
        if (booking.paymentStatus === 'paid') {
          // Thanh toán full → mất % theo SystemConfig
          penaltyPercent = await configService.get('LATE_CANCEL_PENALTY_FULL_PERCENT', {}, 30);
          penaltyAmount = Math.round(totalPaid * penaltyPercent / 100);
          refundAmount = totalPaid - penaltyAmount;
          policy = `Hủy trong vòng ${Math.round(lateCancelThreshold)} phút trước giờ hẹn: mất ${penaltyPercent}% (${penaltyAmount.toLocaleString('vi-VN')}₫). Hoàn lại ${refundAmount.toLocaleString('vi-VN')}₫ vào ví.`;
        } else {
          // Chỉ đặt cọc → mất hết tiền cọc theo SystemConfig
          const depositPenalty = await configService.get('LATE_CANCEL_PENALTY_DEPOSIT_PERCENT', {}, 100);
          penaltyAmount = Math.round(totalPaid * depositPenalty / 100);
          refundAmount = Math.max(0, totalPaid - penaltyAmount);
          policy = `Hủy trong vòng ${Math.round(lateCancelThreshold)} phút trước giờ hẹn: mất ${depositPenalty}% tiền cọc (${penaltyAmount.toLocaleString('vi-VN')}₫).`;
        }
      } else {
        // Hủy sớm → hoàn 100%
        refundAmount = totalPaid;
        penaltyAmount = 0;
        policy = `Hoàn lại 100% (${totalPaid.toLocaleString('vi-VN')}₫) vào ví.`;
      }
    }
  }

  // Preview cho gói lượt
  let slotPackRefundInfo = null;
  if (booking.bookingType === 'slot_pack_usage') {
    const hoursBefore = minutesBefore / 60;
    const thresholdHours = Math.round(lateCancelThreshold / 60);
    if (hoursBefore >= lateCancelThreshold / 60) {
      slotPackRefundInfo = `Hủy lịch hẹn sớm (trước ${thresholdHours}h) sẽ được hoàn lại 1 lượt vào gói.`;
    } else {
      slotPackRefundInfo = `Hủy lịch hẹn sát giờ (dưới ${thresholdHours}h) hoặc không đến, bạn sẽ bị MẤT 1 lượt trong gói theo chính sách.`;
    }
    policy = slotPackRefundInfo;
  }

  return {
    bookingId: id,
    bookingDate: booking.bookingDate,
    startTime: booking.startTime,
    paymentStatus: booking.paymentStatus,
    totalPaid,
    refundAmount,
    penaltyAmount,
    penaltyPercent,
    isLateCancel,
    minutesBefore: Math.max(0, Math.round(minutesBefore)),
    policy,
    slotPackRefundInfo,
  };
};

exports.cancelBooking = async (id, userId, userRole, cancellationReason) => {
  if (!cancellationReason || !cancellationReason.trim()) {
    throw Object.assign(new Error('Vui lòng nhập lý do hủy đơn'), { statusCode: 400, code: 'MISSING_REASON' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const booking = await Booking.findById(id).session(session);
    if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    if (userRole !== 'admin' && userRole !== 'manager' && String(booking.userId) !== String(userId)) {
      throw Object.assign(new Error('Không có quyền hủy lịch hẹn này'), { statusCode: 403, code: 'FORBIDDEN' });
    }
    if (booking.status === 'completed') {
      throw Object.assign(new Error('Không thể hủy lịch hẹn đã hoàn thành'), { statusCode: 400, code: 'INVALID_STATUS' });
    }
    if (booking.status === 'cancelled') {
      throw Object.assign(new Error('Lịch hẹn đã được hủy trước đó'), { statusCode: 400, code: 'ALREADY_CANCELLED' });
    }
    if (booking.status === 'in_progress') {
      throw Object.assign(new Error('Không thể hủy lịch hẹn đang thực hiện'), { statusCode: 400, code: 'IN_PROGRESS' });
    }

    const now = new Date();
    const bookingDateTime = getBookingStartDateTime(booking.bookingDate, booking.startTime);

    const cancelledBy = userRole === 'customer' ? 'customer' : userRole === 'admin' ? 'admin' : 'manager';

    const updated = await Booking.findOneAndUpdate(
      { _id: id, status: booking.status },
      {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy,
        cancellationReason: cancellationReason || undefined,
      },
      { new: true, session }
    );
    if (!updated) {
    throw Object.assign(new Error('Lịch hẹn đã được thay đổi bởi yêu cầu khác'), { statusCode: 409, code: 'CONCURRENT_MODIFICATION' });
    }

    if (booking.voucherCode) {
      await voucherService.rollbackVoucher(booking.voucherCode, booking.userId, id, session).catch(() => {});
    }

    const minutesBefore = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60);

    // Xử lý gói lượt (Slot Pack)
    if (booking.bookingType === 'slot_pack_usage' && booking.slotPackId) {
      const hoursBefore = minutesBefore / 60;
      let shouldRefundSlot = false;
      const lateCancelThreshold = await configService.get('LATE_CANCEL_THRESHOLD_MINUTES', {}, 60);
      const systemCancelBonus = await configService.get('SYSTEM_CANCEL_BONUS_POINTS', {}, 500);
      
      if (cancelledBy === 'customer') {
        // Hủy sớm >= threshold -> hoàn 1 lượt. Sát giờ < threshold -> mất lượt.
        if (hoursBefore >= lateCancelThreshold / 60) {
          shouldRefundSlot = true;
        }
      } else {
        // Cửa hàng/Hệ thống hủy -> Luôn hoàn 1 lượt và tặng điểm đền bù
        shouldRefundSlot = true;
        
        // Tặng điểm đền bù theo SystemConfig
        const User = mongoose.model('User');
        const PointHistory = mongoose.model('PointHistory');
        await User.findByIdAndUpdate(booking.userId, { $inc: { loyaltyPoints: systemCancelBonus, lifetimePoints: systemCancelBonus } }, { session }).catch(() => {});
        await PointHistory.create([{
          userId: booking.userId,
          points: systemCancelBonus,
          type: 'earned',
          description: 'Hệ thống hủy lịch hẹn - Tặng điểm đền bù',
          bookingId: booking._id
        }], { session }).catch(() => {});
        
        // Gửi thông báo
        notificationService.send(
          booking.userId,
          'Hệ thống hủy lịch hẹn',
          'Lịch hẹn bằng gói lượt của bạn đã bị cửa hàng hủy. Bạn được hoàn lại 1 lượt vào gói và nhận 500 điểm đền bù.',
          'booking_cancelled_system',
          { bookingId: booking._id }
        ).catch(() => {});
      }
      
      if (shouldRefundSlot) {
        await SlotPack.findByIdAndUpdate(
          booking.slotPackId,
          { $inc: { remainingSlots: 1, usedSlots: -1 } },
          { session }
        ).catch(() => {});
      }
    }

    // ── Chính sách hoàn tiền ──
    let refundAmount = 0;
    let refundStatus = 'none';
    const lateCancelThreshold = await configService.get('LATE_CANCEL_THRESHOLD_MINUTES', {}, 60);
    const isLateCancel = minutesBefore <= lateCancelThreshold;

    if (booking.bookingType === 'recurring') {
      let groupDepositAmount = 0;
      let recurringTotal = booking.recurringTotal || 1;
      const firstBooking = booking.isRecurringFirst 
          ? booking 
          : await Booking.findOne({ recurringGroupId: booking.recurringGroupId, isRecurringFirst: true }).session(session);
      
      if (firstBooking) {
        groupDepositAmount = firstBooking.depositAmount;
        recurringTotal = firstBooking.recurringTotal || 1;
      }
      const depositShare = Math.round(groupDepositAmount / recurringTotal);

      // Nếu buổi này đã thanh toán đủ (nhóm trả hết 100% hoặc thanh toán lẻ từng buổi),
      // hoàn theo đúng giá của buổi đó thay vì chia theo cọc.
      const sessionPaidAmount = booking.paymentStatus === 'paid' ? (booking.depositAmount ?? booking.finalPrice ?? 0) : 0;

      if (sessionPaidAmount > 0) {
        if (cancelledBy !== 'customer') {
          refundAmount = sessionPaidAmount;
        } else if (isLateCancel) {
          const penaltyPercent = await configService.get('LATE_CANCEL_PENALTY_FULL_PERCENT', {}, 30);
          refundAmount = Math.round(sessionPaidAmount * Math.max(0, (100 - penaltyPercent) / 100));
        } else {
          refundAmount = sessionPaidAmount;
        }
      } else if (cancelledBy !== 'customer') {
        refundAmount = depositShare;
      } else if (!isLateCancel) {
        refundAmount = depositShare;
      }

      if (booking.isRecurringFirst) {
        const nextBooking = await Booking.findOne({
          recurringGroupId: booking.recurringGroupId,
          status: { $in: ['pending', 'confirmed'] },
          _id: { $ne: id }
        }).sort({ recurringPosition: 1 }).session(session);

        if (nextBooking) {
          // Idempotency: chỉ promote nextBooking nếu chưa được set thành "first".
          // Tránh trường hợp cancel 2 lần liên tiếp (request retry / rollback) ghi đè
          // depositAmount nhiều lần.
          if (!nextBooking.isRecurringFirst) {
            nextBooking.isRecurringFirst = true;
            if (sessionPaidAmount <= 0) {
              nextBooking.depositAmount = Math.max(0, groupDepositAmount - depositShare);
            }
            nextBooking.paymentStatus = booking.paymentStatus;
            await nextBooking.save({ session });
          }

          // Chỉ rebook payment khi payment hiện đang trỏ về booking bị cancel
          // (chính là `id`). Tránh đè payment của booking khác (recursive case).
          const payment = await Payment.findOne({ bookingId: id }).session(session);
          if (payment && String(payment.bookingId) === String(id)) {
            payment.bookingId = nextBooking._id;
            await payment.save({ session });
          }
        } else {
          if (refundAmount > 0) {
            const payment = await Payment.findOne({ bookingId: id, status: 'paid' }).session(session);
            if (payment) {
              payment.status = 'refunded';
              payment.refundedAt = new Date();
              await payment.save({ session });
            }
          }
        }
      } else if (sessionPaidAmount <= 0) {
        if (firstBooking && firstBooking._id.toString() !== id) {
          firstBooking.depositAmount = Math.max(0, firstBooking.depositAmount - depositShare);
          await firstBooking.save({ session });
        }
      }

    } else if (['paid', 'deposit_paid'].includes(booking.paymentStatus)) {
      const paidPayment = await Payment.findOne({ bookingId: id, status: 'paid' }).session(session);
      
      if (paidPayment) {
        const totalPaid = paidPayment.amount;

        if (isLateCancel) {
          if (booking.paymentStatus === 'paid') {
            const penaltyPercent = await configService.get('LATE_CANCEL_PENALTY_FULL_PERCENT', {}, 30);
            const refundRate = Math.max(0, (100 - penaltyPercent) / 100);
            refundAmount = Math.round(totalPaid * refundRate);
          } else {
            const depositPenalty = await configService.get('LATE_CANCEL_PENALTY_DEPOSIT_PERCENT', {}, 100);
            const refundRate = Math.max(0, (100 - depositPenalty) / 100);
            refundAmount = Math.round(totalPaid * refundRate);
          }
        } else {
          refundAmount = totalPaid;
        }

        paidPayment.status = 'refunded';
        paidPayment.refundedAt = new Date();
        await paidPayment.save({ session });
      }
    }

    // Hoàn tiền vào ví ngay lập tức
    //
    // H-4 IDEMPOTENCY: kiểm tra trước khi cộng wallet để chống double-credit.
    // Guard dựa trên:
    //   1. Booking.refundStatus đã 'completed' → đã hoàn rồi, skip
    //   2. Tồn tại WalletTransaction với cùng bookingId + type='credit' + reason match
    //
    // Lý do cần 2 guard: booking.refundStatus có thể đã bị reset do bug hoặc admin
    // override; WalletTransaction là audit trail bất biến nên làm ground truth.
    if (refundAmount > 0) {
      refundStatus = 'completed';
      const WalletTx = mongoose.model('WalletTransaction');
      const user = await mongoose.model('User').findById(booking.userId).session(session);
      if (user) {
        // Check WalletTransaction đã tồn tại với reason khớp pattern cho booking này.
        const reasonPattern = new RegExp(`#${(booking.bookingCode || String(id)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        const existingRefund = await WalletTx.findOne({
          bookingId: booking._id,
          type: 'credit',
          reason: { $regex: reasonPattern },
        }).session(session);

        if (existingRefund) {
          // Đã hoàn tiền trước đó — skip cộng wallet, chỉ log warning.
          console.warn(
            `[cancelBooking] Idempotency: refund already exists for booking ${booking._id} (txn ${existingRefund._id}). Skip double-credit.`,
          );
        } else {
          user.walletBalance = (user.walletBalance || 0) + refundAmount;
          await user.save({ session });

          let refundReason = `Hoàn tiền hủy lịch hẹn #${booking.bookingCode || id}`;
          if (cancelledBy === 'customer' && isLateCancel) {
            const originalPaid = booking.paymentStatus === 'paid'
              ? (booking.finalPrice || booking.totalPrice || refundAmount)
              : (booking.depositAmount || refundAmount);
            const deducted = originalPaid - refundAmount;
            if (deducted > 0) {
              refundReason += ` (Khấu trừ phí phạt hủy muộn: -${deducted.toLocaleString('vi-VN')}₫)`;
            }
          }

          await WalletTx.create([{
            userId: user._id,
            amount: refundAmount,
            type: 'credit',
            reason: refundReason,
            bookingId: booking._id,
          }], { session });
        }
      }
    }

    await Booking.findByIdAndUpdate(
      id,
      { 
        paymentStatus: refundAmount > 0 ? 'refunded' : booking.paymentStatus,
        refundStatus,
        refundAmount
      },
      { new: true, session }
    );

    // Gửi email thông báo hủy thành công kèm số tiền hoàn
    const user = await mongoose.model('User').findById(booking.userId).session(session);
    if (user && user.email) {
      const emailService = require('./email.service');
      emailService.sendCancellationSuccessEmail(user.email, { type: booking.bookingType, code: booking.bookingCode || booking.recurringGroupId || '' }, refundAmount).catch(e => console.error('Lỗi gửi email hủy đơn:', e));
    }

    // KHÔNG thu hồi điểm ở đây — chỉ thu hồi khi manager duyệt yêu cầu hoàn tiền (refundRequest)

    await session.commitTransaction();

    notificationService.send(
      booking.userId,
      'Lịch hẹn đã bị hủy',
      `Lịch hẹn rửa xe vào lúc ${booking.startTime} ngày ${new Date(booking.bookingDate).toLocaleDateString('vi-VN')} đã bị hủy${cancellationReason ? `. Lý do: ${cancellationReason}` : ''}.${refundAmount > 0 ? ` Hoàn ${refundAmount.toLocaleString('vi-VN')}₫ vào ví.` : ''}`,
      'booking_cancelled',
      { bookingId: id }
    ).catch(() => {});

    // Notify admin + manager
    notificationService.sendToAdminAndManager(
      booking.branchId,
      'Lịch hẹn bị hủy',
      `Lịch hẹn lúc ${booking.startTime} ngày ${new Date(booking.bookingDate).toLocaleDateString('vi-VN')} đã bị hủy.`,
      'booking_cancelled',
      { bookingId: id, branchId: booking.branchId }
    ).catch(() => {});

    const result = typeof updated.toObject === 'function' ? updated.toObject() : { ...updated };
    if (refundAmount > 0) result.refundAmount = refundAmount;
    return result;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Tự động hủy các đơn quá hạn mà khách không đến (no-show).
 * Đơn vẫn ở 'pending' hoặc 'confirmed' (chưa check-in) và đã quá giờ bắt đầu + graceMinutes
 * (+ graceExtensionMinutes nếu quản lý đã gia hạn thủ công cho đơn đó).
 *
 * Trước khi hủy thật sự, gửi 1 lần cảnh báo "sắp bị hủy" ở mốc
 * (deadline - LATE_WARNING_OFFSET_MINUTES) kèm gợi ý khung giờ trống gần nhất trong ngày,
 * để khách có cơ hội check-in hoặc chủ động đổi giờ thay vì bị hủy đột ngột.
 *
 * Khi hủy thật, cộng 1 "strike" no-show cho khách (User.noShowCount) — ảnh hưởng tỉ lệ
 * đặt cọc của lần đặt tiếp theo (xem getDepositRate).
 *
 * Được gọi định kỳ bởi cron job.
 */
exports.autoCancelNoShows = async (graceMinutes = 30) => {
  const now = new Date();
  // Chỉ xét các đơn của hôm nay & trước đó để giảm tải
  const candidates = await Booking.find({
    status: { $in: ['pending', 'confirmed'] },
    bookingDate: { $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
  })
    .select('startTime endTime bookingDate status voucherCode userId branchId packageId lateWarningSentAt graceExtensionMinutes cancelledAt')
    .populate('packageId', 'duration');

  let cancelledCount = 0;
  let warnedCount = 0;

  for (const b of candidates) {
    const startMin = parseTime(b.startTime);
    const endMin = parseTime(b.endTime);
    if (startMin === null) continue;

    // Timezone safe logic
    const bTimeVN = new Date(b.bookingDate.getTime() + 7 * 3600 * 1000);
    const bDateStr = bTimeVN.toISOString().split('T')[0];
    const hh = Math.floor(startMin / 60);
    const mm = startMin % 60;
    const startDateTime = new Date(`${bDateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+07:00`);

    const effectiveGrace = graceMinutes + (b.graceExtensionMinutes || 0);
    const deadline = new Date(startDateTime.getTime() + effectiveGrace * 60 * 1000);
    const warningOffset = await configService.get('LATE_WARNING_OFFSET_MINUTES', {}, 5);
    const warnAt = new Date(deadline.getTime() - warningOffset * 60 * 1000);
    const graceConfig = await configService.get('AUTO_CANCEL_GRACE_MINUTES', {}, 15);

    if (now < warnAt) continue; // còn sớm, chưa cần quan tâm đơn này

    const bookingDateStr = bDateStr;
    const duration = b.packageId?.duration || (endMin !== null ? endMin - startMin : 30);

    if (now < deadline) {
      // Trong cửa sổ cảnh báo — gửi 1 lần duy nhất
      if (b.lateWarningSentAt) continue;

      const suggested = await findNearestAvailableSlot({
        branchId: b.branchId,
        bookingDateStr,
        duration,
        afterMinutes: endMin !== null ? endMin : startMin,
        excludeBookingId: b._id,
      }).catch(() => null);

      await Booking.updateOne(
        { _id: b._id, status: b.status },
        { lateWarningSentAt: now, suggestedSlotStartTime: suggested?.startTime || undefined }
      );

      const minutesLeft = Math.max(1, Math.round((deadline - now) / 60000));
      notificationService.send(
        b.userId,
        'Lịch hẹn sắp bị hủy tự động',
        `Bạn chưa check-in cho lịch hẹn lúc ${b.startTime}. Còn khoảng ${minutesLeft} phút trước khi hệ thống tự hủy đơn.`
          + (suggested ? ` Bạn cũng có thể đổi sang khung giờ ${suggested.startTime} còn trống hôm nay.` : ''),
        'booking_at_risk',
        { bookingId: b._id, minutesLeft, suggestedSlotStartTime: suggested?.startTime }
      ).catch(() => {});

      warnedCount += 1;
      continue;
    }

    // Đã quá hạn (kể cả phần gia hạn nếu có) — hủy thật sự
    const updated = await Booking.findOneAndUpdate(
      { _id: b._id, status: b.status },
      {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: 'system',
        cancellationReason: `Tự động hủy: khách không đến sau ${effectiveGrace} phút kể từ giờ hẹn`,
      },
      { new: true }
    );
    // Idempotency: nếu không match (cron tick trước đã cancel) thì skip — không ghi nhận
    // double-cancel và không gửi notification / rollback voucher lần thứ 2.
    if (!updated) continue;
    cancelledCount += 1;

    if (b.voucherCode) {
      await voucherService.rollbackVoucher(b.voucherCode, b.userId, b._id).catch(() => {});
    }

    // Strike no-show — khách bị hủy tự động nhiều lần sẽ phải cọc 100% cho lần đặt sau
    await User.findByIdAndUpdate(b.userId, { $inc: { noShowCount: 1 } }).catch(() => {});

    const suggested = await findNearestAvailableSlot({
      branchId: b.branchId,
      bookingDateStr,
      duration,
      afterMinutes: startMin,
      excludeBookingId: b._id,
    }).catch(() => null);

    notificationService.send(
      b.userId,
      'Lịch hẹn đã bị hủy tự động',
      `Lịch hẹn lúc ${b.startTime} đã bị hủy tự động do bạn đến muộn quá ${graceConfig} phút (quy định hệ thống). Tiền cọc (nếu có) sẽ không được hoàn lại.`
        + (suggested ? ` Bạn có thể đặt lại vào khung giờ ${suggested.startTime} còn trống hôm nay.` : ''),
      'booking_cancelled',
      { bookingId: b._id, suggestedSlotStartTime: suggested?.startTime }
    ).catch(() => {});

    notificationService.sendToAdminAndManager(
      b.branchId,
      'Đơn bị hủy tự động (no-show)',
      `Một lịch hẹn lúc ${b.startTime} đã bị hệ thống tự hủy do khách không đến sau ${graceConfig} phút.`,
      'booking_cancelled',
      { bookingId: b._id, branchId: b.branchId }
    ).catch(() => {});
  }

  return { cancelled: cancelledCount, warned: warnedCount, checked: candidates.length };
};

/**
 * Quản lý/admin gia hạn thêm grace period cho 1 đơn cụ thể đang sắp bị auto-cancel
 * (vd: khách đã báo trễ hoặc đang trên đường tới). Mỗi lần gia hạn +GRACE_EXTENSION_STEP_MINUTES,
 * tối đa MAX_GRACE_EXTENSION_MINUTES cho 1 đơn. Reset cờ cảnh báo để có thể cảnh báo lại
 * nếu khách vẫn chưa check-in sau khi gia hạn.
 */
exports.extendGracePeriod = async (id, userRole, userBranchId) => {
  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });

  if (userRole === 'manager') {
    if (!userBranchId || String(userBranchId) !== String(booking.branchId)) {
      throw Object.assign(new Error('Không có quyền truy cập'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }
  if (!['pending', 'confirmed'].includes(booking.status)) {
    throw Object.assign(new Error('Chỉ có thể gia hạn đơn đang chờ hoặc đã xác nhận'), { statusCode: 400, code: 'INVALID_STATUS' });
  }
  const maxGrace = await configService.get('MAX_GRACE_EXTENSION_MINUTES', {}, 15);
  const stepGrace = await configService.get('GRACE_EXTENSION_STEP_MINUTES', {}, 5);

  if ((booking.graceExtensionMinutes || 0) >= maxGrace) {
    throw Object.assign(new Error(`Đơn này đã được gia hạn tối đa ${maxGrace} phút`), { statusCode: 400, code: 'GRACE_LIMIT_REACHED' });
  }

  const updated = await Booking.findByIdAndUpdate(
    id,
    {
      $inc: { graceExtensionMinutes: stepGrace },
      $unset: { lateWarningSentAt: '' },
    },
    { new: true }
  );

  notificationService.send(
    booking.userId,
    'Lịch hẹn của bạn đã được gia hạn',
    `Nhân viên đã gia hạn thêm ${stepGrace} phút cho lịch hẹn lúc ${booking.startTime}. Vui lòng đến check-in sớm nhất có thể.`,
    'booking_grace_extended',
    { bookingId: id, graceExtensionMinutes: updated.graceExtensionMinutes }
  ).catch(() => {});

  return updated;
};

exports.deleteBooking = async (id, userRole) => {
  if (userRole !== 'admin') {
    throw Object.assign(new Error('Chỉ admin mới có thể xóa lịch hẹn'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Lịch hẹn không tồn tại'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  // H-5 SAFETY: thay vì findByIdAndDelete (không thể khôi phục), dùng soft delete.
  // - isDeleted + deletedAt + deletedBy để audit.
  // - Không xóa thật, chỉ ẩn khỏi list queries.
  // - Admin có thể query bao gồm cả isDeleted nếu cần khôi phục.
  await Booking.findByIdAndUpdate(id, {
    isDeleted: true,
    deletedAt: new Date(),
    status: 'cancelled', // cũng set cancelled để UI hiển thị đúng
    cancelledBy: 'admin',
    cancellationReason: `[ADMIN-SOFT-DELETE] ${booking.cancellationReason || ''}`.slice(0, 500),
  });
  return { ...booking.toObject(), isDeleted: true, deletedAt: new Date() };
};

exports.deleteBookingsByDateRange = async (dateFrom, dateTo) => {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  to.setHours(23, 59, 59, 999);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw Object.assign(new Error('Ngày không hợp lệ'), { statusCode: 400 });
  }
  // H-5 SAFETY: soft delete thay vì hard delete. Tránh mất dữ liệu do click nhầm.
  const result = await Booking.updateMany(
    { bookingDate: { $gte: from, $lte: to }, isDeleted: { $ne: true } },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        status: 'cancelled',
        cancelledBy: 'admin',
        cancellationReason: '[ADMIN-BULK-SOFT-DELETE]',
      },
    },
  );
  return { deletedCount: result.modifiedCount, softDeleted: true };
};

exports.deleteAllBookings = async () => {
  // H-5 SAFETY: hard delete ALL bookings bị cấm bởi default. Chỉ cho phép soft delete.
  // Nếu cần hard delete thật sự (GDPR / cleanup), phải tạo script riêng có audit log.
  const result = await Booking.updateMany(
    { isDeleted: { $ne: true } },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        status: 'cancelled',
        cancelledBy: 'admin',
        cancellationReason: '[ADMIN-ALL-SOFT-DELETE]',
      },
    },
  );
  return { deletedCount: result.modifiedCount, softDeleted: true, note: 'Hard delete disabled for safety. Use a dedicated migration script if truly needed.' };
};

exports.getAvailableSlots = async (branchId, date, packageId) => {
  const [branch, pkg] = await Promise.all([
    Branch.findById(branchId),
    Package.findById(packageId),
  ]);
  if (!branch) throw Object.assign(new Error('Branch not found'), { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
  const duration = pkg ? pkg.duration : 30;

  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
  
  if (branch.scheduleConfig?.daysOff?.includes(dateStr)) {
    return [];
  }

  const { gte, lte } = getDayBounds(dateStr);
  const existing = await Booking.find({
    branchId,
    bookingDate: { $gte: gte, $lte: lte },
    status: { $in: ACTIVE_SLOT_STATUSES },
  }).select('startTime endTime priority');

  const slots = buildSlots(duration, branch.openingTime || '07:00', branch.closingTime || '20:00', branch.scheduleConfig);
  const capacity = await resolveBranchCapacity(branch);
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  return slots.map((s) => {
    const overlappingBookings = existing.filter((b) => {
      const bs = parseTime(b.startTime);
      const be = parseTime(b.endTime);
      const ns = parseTime(s.startTime);
      const ne = parseTime(s.endTime);
      return bs !== null && be !== null && ns !== null && ne !== null && isSlotOverlap(ns, ne, bs, be);
    });
    const overlappingCount = overlappingBookings.length;
    // vipBooked: có khách VIP (priority >= 3) đang giữ chỗ trong slot này không
    const vipBooked = overlappingBookings.some(b => (b.priority || 1) >= 3);

    let available = overlappingCount < capacity;
    // vipOnly = true KHI VÀ CHỈ KHI:
    //   1. Slot gần đầy (còn đúng 1 chỗ)
    //   2. VÀ đang có VIP thực sự giữ chỗ trong slot đó
    // → Không giữ chỗ vô nghĩa khi không có VIP nào đặt → tránh mất doanh thu
    let vipOnly = capacity > 1 && overlappingCount >= capacity - 1 && overlappingCount < capacity && vipBooked;

    if (dateStr === todayStr) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const slotStartMinutes = parseTime(s.startTime);
      if (slotStartMinutes !== null && slotStartMinutes <= currentMinutes + 30) {
        // Quá muộn để đặt (cần ít nhất 30 phút chuẩn bị)
        available = false;
        vipOnly = false;
      } else if (slotStartMinutes !== null && slotStartMinutes - currentMinutes <= 30 * 2) {
        // Anti-waste: Còn ≤ 60 phút mà chỗ cuối chưa có VIP nào đặt → mở cho tất cả
        if (!vipBooked) vipOnly = false;
      }
    }
    
    // Check blocked slots
    const ns = parseTime(s.startTime);
    const ne = parseTime(s.endTime);
    let reason = null;
    const isBlocked = branch.scheduleConfig?.blockedSlots?.some(bs => {
      if (bs.date !== dateStr) return false;
      const bStart = parseTime(bs.startTime);
      const bEnd = parseTime(bs.endTime);
      if (bStart !== null && bEnd !== null && isSlotOverlap(ns, ne, bStart, bEnd)) {
        reason = bs.reason || 'Chi nhánh tạm nghỉ giờ này';
        return true;
      }
      return false;
    });

    if (isBlocked) {
      available = false;
      vipOnly = false;
    }

    return { ...s, available, vipOnly, vipBooked, reason };
  });
};

// ─── Tier → Priority mapping ─────────────────────────────────────────────────
const TIER_PRIORITY = { bronze: 1, silver: 2, gold: 3, diamond: 4, Ruby: 5 };

// ─── Recurring Booking ────────────────────────────────────────────────────────

/**
 * Tạo hàng loạt booking theo lịch định kỳ.
 *
 * data {
 *   userId, branchId, packageId, vehicleId,
 *   weekdays: [0-6],   // 0=CN, 1=T2, ..., 6=T7
 *   startTime: 'HH:mm',
 *   weeks: number,      // số tuần lặp lại (1-12)
 *   note, voucherCode
 * }
 *
 * Trả về { created: Booking[], failed: { date, reason }[] }
 */
exports.createRecurringBooking = async (data) => {
  const {
    userId, branchId, packageId, vehicleId,
    weekdays, startTime, weeks,
    note, voucherCode, selectedSubServices,
  } = data;

  // --- Validate base entities (ngoài transaction — chỉ đọc) ---
  const [pkg, branch, vehicle, user] = await Promise.all([
    Package.findOne({ _id: packageId, isDeleted: { $ne: true } }),
    Branch.findById(branchId),
    Vehicle.findById(vehicleId),
    User.findById(userId),
  ]);

  if (!pkg)    throw Object.assign(new Error('Package not found'),  { statusCode: 404, code: 'PACKAGE_NOT_FOUND' });
  if (!branch) throw Object.assign(new Error('Branch not found'),   { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
  if (!vehicle) throw Object.assign(new Error('Vehicle not found'), { statusCode: 404, code: 'VEHICLE_NOT_FOUND' });
  if (pkg.status === 'inactive')    throw Object.assign(new Error('Package unavailable'),  { statusCode: 400, code: 'PACKAGE_UNAVAILABLE' });
  if (branch.status === 'inactive') throw Object.assign(new Error('Branch unavailable'),   { statusCode: 400, code: 'BRANCH_UNAVAILABLE' });
  if (pkg.branchId && String(pkg.branchId) !== String(branchId)) {
    throw Object.assign(new Error('Package does not belong to this branch'), { statusCode: 400, code: 'PACKAGE_BRANCH_MISMATCH' });
  }
  if (String(vehicle.userId) !== String(userId)) {
    throw Object.assign(new Error('Vehicle does not belong to this user'), { statusCode: 403, code: 'FORBIDDEN' });
  }

  // --- Validate weekdays & weeks ---
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    throw Object.assign(new Error('At least one weekday must be selected'), { statusCode: 400, code: 'INVALID_WEEKDAYS' });
  }
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
    throw Object.assign(new Error('Weeks must be between 1 and 52'), { statusCode: 400, code: 'INVALID_WEEKS' });
  }

  // --- Sub-services ---
  let extraDuration = 0;
  let extraPrice = 0;
  const validSubServices = [];
  const packageSubServicesSnapshot = Array.isArray(pkg.subServices)
    ? pkg.subServices.map(s => ({
        name: s.name,
        price: s.price || 0,
        duration: s.duration || 0,
        isOptional: s.isOptional !== false,
      }))
    : [];
  const includedSubServicesSnapshot = packageSubServicesSnapshot.filter(s => !s.isOptional);

  if (selectedSubServices && Array.isArray(selectedSubServices) && pkg.subServices) {
    for (const serviceName of selectedSubServices) {
      const sub = pkg.subServices.find(s => s.name === serviceName);
      if (sub && sub.isOptional !== false) {
        extraDuration += sub.duration || 0;
        extraPrice += sub.price || 0;
        validSubServices.push({ name: sub.name, price: sub.price, duration: sub.duration, isOptional: sub.isOptional });
      }
    }
  }

  // --- Validate time ---
  const totalDuration = pkg.duration + extraDuration;
  const endTime = computeEndTime(startTime, totalDuration);
  const endMinutes = parseTime(endTime);
  const closeMinutes = parseTime(branch.closingTime || '20:00');
  if (endMinutes > closeMinutes) {
    throw Object.assign(new Error('Giờ kết thúc vượt quá giờ đóng cửa của chi nhánh'), { statusCode: 400, code: 'OUTSIDE_HOURS' });
  }

  // --- Priority ---
  const priority = TIER_PRIORITY[user?.tier] || 1;

  // --- Validate voucher (1 lần, áp cho toàn bộ series) ---
  let computedDiscountAmount = 0;
  let computedFinalPrice = pkg.price + extraPrice;
  if (voucherCode) {
    const vResult = await voucherService.validateVoucher(voucherCode, { packageId, branchId, amount: computedFinalPrice }, userId);
    computedDiscountAmount = vResult.discountAmount || vResult.savings || 0;
    computedFinalPrice = vResult.finalAmount || Math.max(0, computedFinalPrice - computedDiscountAmount);
  }

  // --- Build danh sách các ngày cần tạo booking ---
  const recurringGroupId = crypto.randomUUID();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDates = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + w * 7 + d);
      if (weekdays.includes(candidate.getDay())) {
        if (candidate >= today) {
          targetDates.push(new Date(candidate));
        }
      }
    }
  }

  if (targetDates.length === 0) {
      throw Object.assign(new Error('No valid dates to book for the selected weekdays and weeks'), { statusCode: 400, code: 'NO_DATES' });
    }

  // ── Đặt cọc cho cả nhóm định kỳ ──
  // Tính cọc cho TỪNG buổi (chia đều thay vì gộp hết vào buổi đầu)
  // để khi thanh toán phần còn lại, mỗi buổi được tính riêng rẽ.
  const depositPerSession = Math.round((computedFinalPrice * await getDepositRate(user) / 100) / 1000) * 1000;

  // --- Tạo booking lần lượt, bỏ qua ngày conflict ---
  const created = [];
  const failed  = [];

  const currentVatPercent = await configService.get('VAT_PERCENT', {}, 10);

  for (let bookingIdx = 0; bookingIdx < targetDates.length; bookingIdx++) {
    const bookingDate = targetDates[bookingIdx];
    const isFirstInGroup = bookingIdx === 0;
    const session = await mongoose.startSession();
    let savedBooking;
    try {
      await session.withTransaction(async () => {
      const bookingStr = bookingDate.toLocaleDateString('en-CA');

      // Check if it's today and time has passed
      const todayStr = new Date().toLocaleDateString('en-CA');
      if (bookingStr === todayStr) {
        const minAdvance = await configService.get('MIN_ADVANCE_BOOKING_MINUTES', {}, 30);
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = parseTime(startTime);
        if (startMinutes !== null && startMinutes <= currentMinutes + minAdvance) {
          throw new Error(`Thời gian đặt lịch phải cách hiện tại ít nhất ${minAdvance} phút`);
        }
      }

      const capacityService = require('./capacity.service');
      const capacityResult = await capacityService.checkCapacity({
        branch,
        bookingStr,
        startTime,
        endTime,
        userId,
        userTier: user.tier,
        strictLastSlot: true,
      }, session);
      
      const { hasConflict, conflictingBookings: conflicting } = capacityResult;
      const ns = parseTime(startTime);

      let finalStartTime = startTime;
      let finalEndTime = endTime;
      let finalNote = note || '';

      if (hasConflict) {
        // Không tự động đổi giờ. Buổi bị trùng slot sẽ được BỎ QUA (đưa vào failed)
        // để đồng bộ với danh sách "buổi hợp lệ" mà khách thấy ở màn xác nhận đặt lịch.
        throw new Error('Slot bị trùng lịch — buổi này được bỏ qua');
      }

      const booking = new Booking({
        userId, branchId, packageId, vehicleId,
        bookingDate, startTime: finalStartTime, endTime: finalEndTime,
        note: finalNote,
        bookingCode: generateBookingCode(),
        bookingType: 'recurring',
        recurringGroupId,
        priority,
        vatPercent: currentVatPercent,
        // Buổi đầu chịu toàn bộ cọc của cả nhóm; các buổi sau = 0.
        // Manager đối soát booking đầu là đủ biết đã thu cọc.
        isRecurringFirst: isFirstInGroup,
        recurringPosition: bookingIdx + 1,
        recurringTotal: targetDates.length,
        voucherCode: voucherCode ? voucherCode.trim().toUpperCase() : undefined,
        discountAmount: computedDiscountAmount,
        finalPrice: computedFinalPrice,
        depositAmount: depositPerSession,
        selectedSubServices: validSubServices,
        includedSubServices: includedSubServicesSnapshot,
        packageSnapshot: {
          name: pkg.name,
          price: pkg.price,
          duration: pkg.duration,
          description: pkg.description,
          subServices: packageSubServicesSnapshot,
        },
        packageName: pkg.name,
        packageDuration: pkg.duration,
        packagePrice: pkg.price,
        branchName: branch.name,
        branchAddress: branch.address,
        branchPhone: branch.phone,
        branchSnapshot: {
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
        },
      });
      await booking.save({ session });
      savedBooking = booking;
      }); // End withTransaction
      created.push(savedBooking);
    } catch (err) {
      const bookingStr = bookingDate.toLocaleDateString('en-CA');
      failed.push({ date: bookingStr, reason: err.message || 'Lỗi không xác định' });
    } finally {
      session.endSession();
    }
  }

  if (created.length === 0) {
    const reason = failed.length > 0 ? failed[0].reason : 'Tất cả khung giờ đã bị đặt.';
    throw Object.assign(
      new Error(`Không thể tạo bất kỳ booking nào. Lý do: ${reason}`),
      { statusCode: 409, code: 'ALL_SLOTS_TAKEN', failed }
    );
  }

  // Một số buổi dự kiến có thể bị bỏ qua do xung đột slot. Cập nhật lại
  // recurringTotal cho TOÀN BỘ buổi trong nhóm về ĐÚNG số buổi đã tạo thành công,
  // để mọi nơi hiển thị "Số buổi" (history, detail, manager) khớp thực tế.
  if (created.length > 0) {
    for (let ri = 0; ri < created.length; ri++) {
      created[ri].recurringPosition = ri + 1;
      created[ri].recurringTotal = created.length;
    }
    await Booking.bulkWrite(
      created.map((b, ri) => ({
        updateOne: {
          filter: { _id: b._id },
          update: { $set: { recurringPosition: ri + 1, recurringTotal: created.length } },
        },
      }))
    );
  }

  // Thông báo tổng kết
  notificationService.send(
    userId,
    'Đặt lịch định kỳ thành công',
    `Đã tạo ${created.length} lịch hẹn định kỳ cho ${pkg.name}.${failed.length > 0 ? ` ${failed.length} ngày bị bỏ qua do xung đột slot.` : ''}`,
    'recurring_booking_created',
    { recurringGroupId, count: created.length }
  ).catch(() => {});

  // Notify admin + manager
  notificationService.sendToAdminAndManager(
    branchId,
    'Đặt lịch định kỳ mới',
    `${user.name || 'Khách hàng'} vừa tạo ${created.length} lịch định kỳ cho ${pkg.name}.`,
    'booking_created',
    { recurringGroupId, count: created.length, branchId }
  ).catch(() => {});

  return { created, failed, recurringGroupId, totalCreated: created.length, totalFailed: failed.length };
};

/**
 * Kiểm tra xung đột lịch trước khi tạo recurring booking.
 * Nhận params giống createRecurringBooking, trả về mảng { date, conflict, reason }.
 */
exports.checkRecurringConflicts = async (data) => {
  const {
    userId, branchId, packageId, vehicleId,
    weekdays, startTime, weeks,
    selectedSubServices,
  } = data;

  const [pkg, branch, vehicle, user] = await Promise.all([
    Package.findOne({ _id: packageId, isDeleted: { $ne: true } }),
    Branch.findById(branchId),
    Vehicle.findById(vehicleId),
    User.findById(userId),
  ]);
  if (!pkg)    throw Object.assign(new Error('Package not found'),  { statusCode: 404, code: 'PACKAGE_NOT_FOUND' });
  if (!branch) throw Object.assign(new Error('Branch not found'),   { statusCode: 404, code: 'BRANCH_NOT_FOUND' });
  if (!vehicle) throw Object.assign(new Error('Vehicle not found'), { statusCode: 404, code: 'VEHICLE_NOT_FOUND' });
  if (pkg.branchId && String(pkg.branchId) !== String(branchId)) {
    throw Object.assign(new Error('Package does not belong to this branch'), { statusCode: 400, code: 'PACKAGE_BRANCH_MISMATCH' });
  }
  if (String(vehicle.userId) !== String(userId)) {
    throw Object.assign(new Error('Vehicle does not belong to this user'), { statusCode: 403, code: 'FORBIDDEN' });
  }

  let extraDuration = 0;
  if (selectedSubServices && Array.isArray(selectedSubServices) && pkg.subServices) {
    for (const name of selectedSubServices) {
      const sub = pkg.subServices.find(s => s.name === name);
      if (sub) extraDuration += sub.duration || 0;
    }
  }
  const totalDuration = pkg.duration + extraDuration;
  const endTime = computeEndTime(startTime, totalDuration);
  const endMinutes = parseTime(endTime);
  const closeMinutes = parseTime(branch.closingTime || '20:00');
  if (endMinutes > closeMinutes) {
    throw Object.assign(new Error('Giờ kết thúc vượt quá giờ đóng cửa của chi nhánh'), { statusCode: 400, code: 'OUTSIDE_HOURS' });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDates = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + w * 7 + d);
      if (weekdays.includes(candidate.getDay())) {
        if (candidate >= today) {
          targetDates.push(new Date(candidate));
        }
      }
    }
  }

  const results = [];
  const todayStr = new Date().toLocaleDateString('en-CA');

  for (const bookingDate of targetDates) {
    const bookingStr = bookingDate.toLocaleDateString('en-CA');
    let reason = null;
    let conflict = false;

    if (bookingStr === todayStr) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = parseTime(startTime);
      if (startMinutes !== null && startMinutes <= currentMinutes + 30) {
        results.push({ date: bookingStr, conflict: true, reason: 'Thời gian đặt lịch phải cách hiện tại ít nhất 30 phút' });
        continue;
      }
    }

    const { gte, lte } = getDayBounds(bookingStr);
    const conflicting = await Booking.find({
      branchId,
      bookingDate: { $gte: gte, $lte: lte },
      status: { $in: ACTIVE_SLOT_STATUSES },
    });

    const ns = parseTime(startTime);
    const ne = parseTime(endTime);
    const capacity = await resolveBranchCapacity(branch);
    const overlappingCount = conflicting.filter((b) => {
      const bs = parseTime(b.startTime);
      const be = parseTime(b.endTime);
      return bs !== null && be !== null && isSlotOverlap(ns, ne, bs, be);
    }).length;

    if (overlappingCount >= capacity) conflict = true;
    if (capacity > 1 && overlappingCount >= capacity - 1 && user.tier !== 'gold' && user.tier !== 'diamond') conflict = true;

    if (conflict) {
      const slots = buildSlots(totalDuration, branch.openingTime || '07:00', branch.closingTime || '20:00');
      let hasAlternative = false;
      for (const slot of slots) {
        const sns = parseTime(slot.startTime);
        const sne = parseTime(slot.endTime);
        if (bookingStr === todayStr) {
          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          if (sns <= currentMinutes + 30) continue;
        }
        const slotOverlapCount = conflicting.filter((b) => {
          const bs = parseTime(b.startTime);
          const be = parseTime(b.endTime);
          return bs !== null && be !== null && isSlotOverlap(sns, sne, bs, be);
        }).length;
        let isConflicting = false;
        if (slotOverlapCount >= capacity) isConflicting = true;
        if (capacity > 1 && slotOverlapCount >= capacity - 1 && user.tier !== 'gold' && user.tier !== 'diamond') isConflicting = true;
        if (!isConflicting) { hasAlternative = true; break; }
      }
      reason = hasAlternative ? 'Slot bị trùng — có giờ thay thế' : 'Slot không còn trống — không có giờ thay thế';
    }

    results.push({ date: bookingStr, conflict, reason });
  }

  return results;
};

/**
 * Hủy toàn bộ booking trong 1 nhóm định kỳ (recurringGroupId).
 * Chỉ hủy những booking đang pending.
 */
exports.getRecurringCancelPreview = async (recurringGroupId, userId) => {
  const bookings = await Booking.find({
    recurringGroupId,
    status: { $in: ['pending', 'confirmed'] },
  });

  if (bookings.length === 0) {
    throw Object.assign(new Error('Không tìm thấy lịch nào trong nhóm này'), { statusCode: 404 });
  }

  if (String(bookings[0].userId) !== String(userId)) {
    throw Object.assign(new Error('Không có quyền hủy nhóm định kỳ này'), { statusCode: 403 });
  }

  const firstBooking = await Booking.findOne({ recurringGroupId, isRecurringFirst: true });
  const recurringTotal = firstBooking ? (firstBooking.recurringTotal || 1) : 1;
  const groupDepositAmount = firstBooking ? firstBooking.depositAmount : 0;
  const depositShare = Math.round(groupDepositAmount / recurringTotal);

  let totalRefundAmount = 0;
  let totalPenaltyAmount = 0;
  const now = new Date();

  for (const b of bookings) {
    const bookingDateTime = getBookingStartDateTime(b.bookingDate, b.startTime);
    const minutesBefore = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60);
    const lateCancelThreshold = await configService.get('LATE_CANCEL_THRESHOLD_MINUTES', {}, 60);
    const isLateCancel = minutesBefore <= lateCancelThreshold;

    const sessionPaidAmount = b.paymentStatus === 'paid' ? (b.depositAmount ?? b.finalPrice ?? 0) : 0;
    let refundAmountForThisBooking = 0;
    let penaltyForThisBooking = 0;

    if (sessionPaidAmount > 0) {
      if (isLateCancel) {
        const penaltyPercent = await configService.get('LATE_CANCEL_PENALTY_FULL_PERCENT', {}, 30);
        penaltyForThisBooking = Math.round(sessionPaidAmount * penaltyPercent / 100);
        refundAmountForThisBooking = Math.max(0, sessionPaidAmount - penaltyForThisBooking);
      } else {
        refundAmountForThisBooking = sessionPaidAmount;
      }
    } else {
      if (isLateCancel) {
        const depositPenalty = await configService.get('LATE_CANCEL_PENALTY_DEPOSIT_PERCENT', {}, 100);
        penaltyForThisBooking = Math.round(depositShare * depositPenalty / 100);
        refundAmountForThisBooking = Math.max(0, depositShare - penaltyForThisBooking);
      } else {
        refundAmountForThisBooking = depositShare;
      }
    }

    totalRefundAmount += refundAmountForThisBooking;
    totalPenaltyAmount += penaltyForThisBooking;
  }

  return {
    totalRefundAmount,
    totalPenaltyAmount,
    pendingCount: bookings.length
  };
};

exports.cancelRecurringGroup = async (recurringGroupId, userId, userRole) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const bookings = await Booking.find({
      recurringGroupId,
      status: { $in: ['pending', 'confirmed'] },
    }).session(session);

    if (bookings.length === 0) {
      throw Object.assign(new Error('No pending bookings found for this recurring group'), { statusCode: 404, code: 'NOT_FOUND' });
    }

    if (userRole === 'customer' && String(bookings[0].userId) !== String(userId)) {
      throw Object.assign(new Error('Not authorized'), { statusCode: 403, code: 'FORBIDDEN' });
    }

    const firstBooking = await Booking.findOne({ recurringGroupId, isRecurringFirst: true }).session(session);
    const recurringTotal = firstBooking ? (firstBooking.recurringTotal || 1) : 1;
    const groupDepositAmount = firstBooking ? firstBooking.depositAmount : 0;
    const depositShare = Math.round(groupDepositAmount / recurringTotal);

    let totalRefundAmount = 0;
    const now = new Date();
    const cancelledBy = userRole === 'customer' ? 'customer' : userRole === 'admin' ? 'admin' : 'manager';

    const results = [];
    for (const b of bookings) {
      const bookingDateTime = getBookingStartDateTime(b.bookingDate, b.startTime);
      const minutesBefore = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60);
      const lateCancelThreshold = await configService.get('LATE_CANCEL_THRESHOLD_MINUTES', {}, 60);
      const isLateCancel = minutesBefore <= lateCancelThreshold;

      // Nếu buổi đã thanh toán đủ (nhóm trả hết 100%) → hoàn đúng giá buổi đó.
      // Nếu chỉ đóng cọc → hoàn theo phần cọc của buổi (depositShare).
      const sessionPaidAmount = b.paymentStatus === 'paid' ? (b.depositAmount ?? b.finalPrice ?? 0) : 0;

      let refundAmountForThisBooking = 0;
      if (sessionPaidAmount > 0) {
        if (cancelledBy !== 'customer') {
          refundAmountForThisBooking = sessionPaidAmount;
        } else if (isLateCancel) {
          const penaltyPercent = await configService.get('LATE_CANCEL_PENALTY_FULL_PERCENT', {}, 30);
          refundAmountForThisBooking = Math.round(sessionPaidAmount * Math.max(0, (100 - penaltyPercent) / 100));
        } else {
          refundAmountForThisBooking = sessionPaidAmount;
        }
      } else if (cancelledBy !== 'customer') {
        refundAmountForThisBooking = depositShare;
      } else if (isLateCancel) {
        const depositPenalty = await configService.get('LATE_CANCEL_PENALTY_DEPOSIT_PERCENT', {}, 100);
        refundAmountForThisBooking = Math.round(depositShare * Math.max(0, (100 - depositPenalty) / 100));
      } else {
        refundAmountForThisBooking = depositShare;
      }

      totalRefundAmount += refundAmountForThisBooking;

      const updated = await Booking.findOneAndUpdate(
        { _id: b._id, status: { $in: ['pending', 'confirmed'] } },
        { 
          status: 'cancelled', 
          cancelledAt: new Date(), 
          cancelledBy,
          refundAmount: refundAmountForThisBooking,
          paymentStatus: refundAmountForThisBooking > 0 ? 'refunded' : b.paymentStatus
        },
        { new: true, session }
      );
      if (updated) results.push(updated);
    }

    if (firstBooking) {
       firstBooking.depositAmount = 0;
       await firstBooking.save({ session });
    }
    
    if (firstBooking) {
      const payment = await mongoose.model('Payment').findOne({ bookingId: firstBooking._id, status: 'paid' }).session(session);
      if (payment) {
          payment.status = 'refunded';
          payment.refundedAt = new Date();
          await payment.save({ session });
      }
    }

    if (totalRefundAmount > 0) {
      const user = await mongoose.model('User').findById(bookings[0].userId).session(session);
      if (user) {
        // H-4 IDEMPOTENCY: chống double-credit khi cancelRecurringGroup bị retry.
        const WalletTx = mongoose.model('WalletTransaction');
        const reasonPattern = new RegExp(`#${(recurringGroupId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        const existingRefund = await WalletTx.findOne({
          bookingId: bookings[0]._id,
          type: 'credit',
          reason: { $regex: reasonPattern },
        }).session(session);

        if (existingRefund) {
          console.warn(
            `[cancelRecurringGroup] Idempotency: refund already exists for group ${recurringGroupId} (txn ${existingRefund._id}). Skip double-credit.`,
          );
        } else {
          user.walletBalance = (user.walletBalance || 0) + totalRefundAmount;
          await user.save({ session });

          await WalletTx.create([{
            userId: user._id,
            amount: totalRefundAmount,
            type: 'credit',
            reason: `Hoàn tiền hủy nhóm lịch định kỳ #${recurringGroupId}`,
            bookingId: bookings[0]._id,
          }], { session });
        }
      }
    }

    await session.commitTransaction();
    return { cancelled: results.length, total: bookings.length, totalRefundAmount };
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

exports.getFeedbacks = async (user, filters = {}) => {
  const query = {
    status: 'completed',
    $or: [{ rating: { $exists: true, $ne: null } }, { feedback: { $exists: true, $ne: '' } }],
  };

  if (user.role === 'manager') {
    const branch = await Branch.findOne({ managerId: user.id });
    if (!branch) return { feedbacks: [], total: 0, page: 1, totalPages: 0, stats: null, previousStats: null };
    query.branchId = branch._id;
  }

  const now = new Date();
  let startOfPeriod = null;
  let endOfPeriod = null;
  let startOfPrev = null;
  let endOfPrev = null;

  if (filters.period === 'today') {
    startOfPeriod = new Date(now.setHours(0, 0, 0, 0));
    endOfPeriod = new Date(now.setHours(23, 59, 59, 999));
    startOfPrev = new Date(startOfPeriod); startOfPrev.setDate(startOfPrev.getDate() - 1);
    endOfPrev = new Date(endOfPeriod); endOfPrev.setDate(endOfPrev.getDate() - 1);
  } else if (filters.period === 'month') {
    startOfPeriod = new Date(now.getFullYear(), now.getMonth(), 1);
    endOfPeriod = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    startOfPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endOfPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  }

  // Date Range Filtering & Validation
  const startDateStr = filters.startDate || filters.dateFrom;
  const endDateStr = filters.endDate || filters.dateTo;

  if (startDateStr && endDateStr) {
    const fromDate = new Date(startDateStr);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date(endDateStr);
    toDate.setHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      throw Object.assign(new Error('Ngày bắt đầu không được vượt quá ngày kết thúc'), {
        statusCode: 400,
        code: 'INVALID_DATE_RANGE',
      });
    }

    startOfPeriod = fromDate;
    endOfPeriod = toDate;
  }

  const listQuery = { ...query };
  const prevQuery = { ...query };

  // Customer Name Search Filter
  if (filters.search && filters.search.trim()) {
    const searchRegex = new RegExp(filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchedUsers = await User.find({ name: searchRegex }).select('_id');
    const userIds = matchedUsers.map(u => u._id);
    listQuery.userId = { $in: userIds };
  }

  if (startOfPeriod && endOfPeriod) {
    listQuery.$or = [
      { feedbackAt: { $gte: startOfPeriod, $lte: endOfPeriod } },
      { createdAt: { $gte: startOfPeriod, $lte: endOfPeriod } },
    ];
    if (startOfPrev && endOfPrev) {
      prevQuery.$or = [
        { feedbackAt: { $gte: startOfPrev, $lte: endOfPrev } },
        { createdAt: { $gte: startOfPrev, $lte: endOfPrev } },
      ];
    }
  }

  if (filters.rating) {
    const r = parseInt(filters.rating);
    listQuery.rating = r <= 2 ? { $lte: 2 } : r;
  }
  if (filters.replied === 'true')  listQuery.managerReply = { $exists: true, $ne: '' };
  if (filters.replied === 'false') listQuery.$and = [...(listQuery.$and || []), { $or: [{ managerReply: { $exists: false } }, { managerReply: '' }] }];

  const page  = Math.max(1, parseInt(filters.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 9));
  const skip  = (page - 1) * limit;

  const buildStatsPipeline = (matchStage) => [
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        ratingSum: { $sum: { $ifNull: ['$rating', 0] } },
        ratingCount: { $sum: { $cond: [{ $ifNull: ['$rating', false] }, 1, 0] } },
        repliedCount: { $sum: { $cond: [{ $ifNull: ['$managerReply', false] }, 1, 0] } }
      }
    }
  ];

  const [feedbacks, total, statsResult, prevStatsResult] = await Promise.all([
    Booking.find(listQuery)
      .populate('userId', 'name email phone avatar tier')
      .populate('packageId', 'name price duration subServices')
      .populate('branchId', 'name')
      .sort({ feedbackAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(listQuery),
    Booking.aggregate(buildStatsPipeline(listQuery)),
    (startOfPrev && endOfPrev) ? Booking.aggregate(buildStatsPipeline(prevQuery)) : Promise.resolve([])
  ]);

  const stats = statsResult[0] || { total: 0, ratingSum: 0, ratingCount: 0, repliedCount: 0 };
  const previousStats = prevStatsResult[0] || { total: 0, ratingSum: 0, ratingCount: 0, repliedCount: 0 };

  return { 
    feedbacks, 
    total, 
    page, 
    totalPages: Math.ceil(total / limit),
    stats: {
      total: stats.total,
      avgRating: stats.ratingCount > 0 ? (stats.ratingSum / stats.ratingCount).toFixed(1) : '—',
      repliedCount: stats.repliedCount
    },
    previousStats: {
      total: previousStats.total,
      avgRating: previousStats.ratingCount > 0 ? (previousStats.ratingSum / previousStats.ratingCount).toFixed(1) : '—',
      repliedCount: previousStats.repliedCount
    }
  };
};

// ─── Submit / update feedback (customer, on completed booking) ───────────────
exports.submitFeedback = async (bookingId, userId, { rating, feedback }) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  if (String(booking.userId) !== String(userId)) {
    throw Object.assign(new Error('Not authorized'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  if (booking.status !== 'completed') {
    throw Object.assign(new Error('Chỉ có thể đánh giá booking đã hoàn thành'), { statusCode: 400, code: 'INVALID_STATUS' });
  }

  const update = { feedbackAt: new Date() };
  if (rating !== undefined) {
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) throw Object.assign(new Error('Rating must be 1-5'), { statusCode: 400 });
    update.rating = r;
  }
  if (feedback !== undefined) {
    update.feedback = String(feedback).trim().slice(0, 1000);
  }
  if (!update.rating && !update.feedback) {
    throw Object.assign(new Error('Cần nhập rating hoặc feedback'), { statusCode: 400 });
  }

  const updatedBooking = await Booking.findByIdAndUpdate(bookingId, update, { new: true })
    .populate('userId', 'name email phone tier')
    .populate('packageId', 'name price duration subServices')
    .populate('branchId', 'name')
    .populate('vehicleId', 'licensePlate vehicleType brand');

  // Notify manager (and admin) about the new feedback
  sseService.broadcastToManagers(booking.branchId, 'feedback_new', { bookingId: updatedBooking._id });

  // Send thank you notification to user
  notificationService.send(
    userId,
    'Cảm ơn bạn đã đánh giá',
    `Đánh giá ${update.rating ? update.rating + ' sao' : ''} của bạn đã được ghi nhận. Cảm ơn bạn đã giúp AutoWash cải thiện dịch vụ!`,
    'feedback_submitted',
    { bookingId: updatedBooking._id }
  ).catch(() => {});

  return updatedBooking;
};

// ─── Manager reply to feedback ────────────────────────────────────────────────
exports.replyToFeedback = async (bookingId, managerId, reply) => {
  const booking = await Booking.findById(bookingId).populate('branchId');
  if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });
  if (!booking.feedback && !booking.rating) {
    throw Object.assign(new Error('Booking chưa có đánh giá để phản hồi'), { statusCode: 400 });
  }

  // Ensure manager belongs to the same branch
  const branch = await Branch.findOne({ managerId });
  if (branch && String(branch._id) !== String(booking.branchId._id || booking.branchId)) {
    throw Object.assign(new Error('Bạn không phụ trách chi nhánh này'), { statusCode: 403, code: 'FORBIDDEN' });
  }

  const updated = await Booking.findByIdAndUpdate(
    bookingId,
    { managerReply: String(reply).trim().slice(0, 1000), managerReplyAt: new Date() },
    { new: true }
  ).populate('userId', 'name email phone tier')
   .populate('packageId', 'name price duration subServices')
   .populate('branchId', 'name');

  notificationService.send(
    booking.userId,
    'Chi nhánh đã phản hồi đánh giá của bạn',
    `Quản lý ${updated.branchId?.name || 'chi nhánh'} đã trả lời đánh giá của bạn: "${reply.slice(0, 80)}${reply.length > 80 ? '…' : ''}"`,
    'system',
    { bookingId }
  ).catch(() => {});

  return updated;
};

// ─── Rebook: clone a booking with new date/time ───────────────────────────────
exports.rebookBooking = async (bookingId, userId, userRole, { bookingDate, startTime, selectedSubServices, voucherCode }) => {
  const src = await Booking.findById(bookingId)
    .populate('branchId');
  if (!src) throw Object.assign(new Error('Booking not found'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' });

  // Authorization: customer can only rebook own, manager/admin can rebook any
  if (userRole === 'customer' && String(src.userId) !== String(userId)) {
    throw Object.assign(new Error('Not authorized'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  if (!['completed', 'cancelled'].includes(src.status)) {
    throw Object.assign(new Error('Chỉ có thể đặt lại đơn đã hoàn thành hoặc đã hủy'), { statusCode: 400 });
  }

  const branch = src.branchId;
  if (!branch || branch.status === 'inactive') throw Object.assign(new Error('Chi nhánh không còn hoạt động'), { statusCode: 400 });

  // Luôn lấy dữ liệu gói mới nhất (giá, tên, thời lượng hiện tại)
  let pkg = null;
  try {
    pkg = await Package.findById(src.packageId);
  } catch (_) { /* ignore lookup failure */ }
  let pkgDuration = pkg?.duration || src.packageDuration || 30;
  let pkgName = pkg?.name || src.packageName || 'Gói dịch vụ';
  // Use passed sub-services or fall back to original booking's selection
  const effectiveSubServices = selectedSubServices || src.selectedSubServices || [];
  const totalDuration = pkgDuration + effectiveSubServices.reduce((s, ss) => s + (ss.duration || 0), 0);
  const endTime = computeEndTime(startTime, totalDuration);

  // Check slot conflict
  const bookingDateObj = new Date(bookingDate);
  const { gte, lte } = getDayBounds(bookingDate instanceof Date ? bookingDate.toISOString().split('T')[0] : bookingDate);
  const startMins = parseTime(startTime);
  const endMins = parseTime(endTime);
  const conflicts = await Booking.find({
    branchId: src.branchId,
    bookingDate: { $gte: gte, $lte: lte },
    status: { $in: ACTIVE_SLOT_STATUSES },
  }).select('startTime endTime');
  const hasConflict = conflicts.some(c => isSlotOverlap(startMins, endMins, parseTime(c.startTime), parseTime(c.endTime)));
  if (hasConflict) throw Object.assign(new Error('Khung giờ này đã được đặt'), { statusCode: 409, code: 'SLOT_TAKEN' });

  // Get user for priority
  const user = await User.findById(src.userId);
  const priority = TIER_PRIORITY[user?.tier] || 1;

  // ── Price re-computation ─────────────────────────────────────────────
  // Base: package price (fallback to src.finalPrice)
  const pkgPrice = pkg?.price || src.finalPrice || 0;
  // Add optional sub-service prices (only those with price > 0, i.e. not bundled-in)
  const optionalSubPrice = effectiveSubServices
    .filter(ss => ss.price > 0)
    .reduce((s, ss) => s + (ss.price || 0), 0);
  let computedFinalPrice = pkgPrice + optionalSubPrice;
  let computedDiscount = 0;
  let validatedVoucherCode = undefined;
  // Validate voucher if provided
  if (voucherCode && String(voucherCode).trim()) {
    try {
      const Voucher = require('../models/voucher.schema');
      const v = await Voucher.findOne({ code: String(voucherCode).trim().toUpperCase() });
      if (v && v.status === 'active') {
        const now = new Date();
        if ((!v.startDate || v.startDate <= now) && (!v.endDate || v.endDate >= now)) {
          if (v.usageLimit === undefined || v.usedCount < v.usageLimit) {
            validatedVoucherCode = v.code;
            computedDiscount = v.type === 'percentage'
              ? Math.min(Math.round(computedFinalPrice * v.value / 100), v.maxDiscount || Infinity)
              : v.value;
          }
        }
      }
    } catch (_) { /* voucher validation failed silently */ }
  }
  computedFinalPrice = Math.max(0, computedFinalPrice - computedDiscount);
  const currentVatPercent = await configService.get('VAT_PERCENT', {}, 10);

  const newBooking = await Booking.create({
    userId: src.userId,
    branchId: src.branchId,
    packageId: src.packageId,
    packageName: pkgName,
    packageDuration: pkgDuration,
    packagePrice: pkgPrice,
    vehicleId: src.vehicleId,
    bookingDate: bookingDateObj,
    startTime,
    endTime,
    bookingCode: generateBookingCode(),
    bookingType: src.bookingType === 'recurring' ? 'single' : src.bookingType,
    selectedSubServices: effectiveSubServices,
    note: src.note,
    priority,
    rebookedFromId: src._id,
    finalPrice: computedFinalPrice,
    discountAmount: computedDiscount,
    vatPercent: currentVatPercent,
    depositAmount: src.bookingType === 'slot_pack_usage'
      ? 0
      : Math.round(((computedFinalPrice || 0) * (await getDepositRate(user)) / 100) / 1000) * 1000,
    voucherCode: validatedVoucherCode,
    paymentStatus: 'unpaid',
  });

  notificationService.send(
    src.userId,
    'Đặt lại lịch thành công',
    `Lịch hẹn mới của bạn: ${pkgName} vào lúc ${startTime} ngày ${bookingDateObj.toLocaleDateString('vi-VN')}.`,
    'booking_created',
    { bookingId: newBooking._id }
  ).catch(() => {});

  // Notify admin + manager
  notificationService.sendToAdminAndManager(
    src.branchId?._id || src.branchId,
    'Đặt lại lịch mới',
    `${src.userId?.name || 'Khách hàng'} vừa đặt lại lịch ${pkgName} lúc ${startTime}.`,
    'booking_created',
    { bookingId: newBooking._id, branchId: src.branchId?._id || src.branchId }
  ).catch(() => {});

  return Booking.findById(newBooking._id)
    .populate('userId', 'name email phone tier')
    .populate('packageId', 'name price duration subServices')
    .populate('branchId', 'name address')
    .populate('vehicleId', 'licensePlate vehicleType brand color');
};

exports.getCustomers = async (user, filters = {}) => {
  const match = { status: 'completed' };

  if (user.role === 'manager') {
    const branch = await Branch.findOne({ managerId: user.id });
    if (!branch) return { customers: [], total: 0, page: 1, totalPages: 0 };
    match.branchId = branch._id;
  }

  const page  = Math.max(1, parseInt(filters.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 20));
  const skip  = (page - 1) * limit;

  const postMatch = [];
  if (filters.tier)   postMatch.push({ $match: { 'user.tier': filters.tier } });
  if (filters.search && filters.search.trim()) {
    const re = new RegExp(filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    postMatch.push({ $match: { $or: [{ 'user.name': re }, { 'user.phone': re }, { 'user.email': re }] } });
  }

  const pipeline = [
    { $match: match },
    { $group: { _id: '$userId', totalBookings: { $sum: 1 }, totalSpent: { $sum: '$finalPrice' }, lastBookingDate: { $max: '$bookingDate' } } },
    { $lookup: { from: 'users',    localField: '_id', foreignField: '_id',    as: 'user' } },
    { $unwind: '$user' },
    { $lookup: { from: 'vehicles', localField: '_id', foreignField: 'userId', as: 'vehicles' } },
    ...postMatch,
    { $sort: { lastBookingDate: -1 } },
    { $facet: {
      data:  [{ $skip: skip }, { $limit: limit }],
      count: [{ $count: 'total' }],
    }},
  ];

  const [result] = await Booking.aggregate(pipeline);
  const customers = result?.data  || [];
  const total     = result?.count?.[0]?.total || 0;
  return { customers, total, page, totalPages: Math.ceil(total / limit) };
};

exports.getPublicTestimonials = async () => {
  const testimonials = await Booking.find({
    status: 'completed',
    rating: { $gte: 4 },
    feedback: { $exists: true, $ne: '' },
  })
    .populate('userId', 'name')
    .populate('branchId', 'name city')
    .sort({ feedbackAt: -1 })
    .limit(20)
    .lean();

  return testimonials.map(t => ({
    name: t.userId?.name || 'Khách hàng',
    role: '',
    content: t.feedback || '',
    rating: t.rating || 5,
    location: t.branchId?.name || '',
  }));
};

exports.deleteSingleFeedback = async (bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw Object.assign(new Error('Booking không tồn tại'), { statusCode: 404 });
  
  await Booking.findByIdAndUpdate(bookingId, {
    $unset: { rating: "", feedback: "", feedbackAt: "", managerReply: "", managerReplyAt: "" }
  });
  return { success: true, message: 'Đã xóa đánh giá thành công' };
};

exports.deleteFeedbacksByDateRange = async (dateFrom, dateTo, all = false) => {
  let filter = { rating: { $exists: true } };

  if (!all) {
    if (!dateFrom || !dateTo) {
      throw Object.assign(new Error('Vui lòng chọn đầy đủ từ ngày và đến ngày'), { statusCode: 400 });
    }
    const fromDate = new Date(dateFrom);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date(dateTo);
    toDate.setHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      throw Object.assign(new Error('Ngày bắt đầu không được vượt quá ngày kết thúc'), { statusCode: 400 });
    }

    filter.$or = [
      { feedbackAt: { $gte: fromDate, $lte: toDate } },
      { createdAt: { $gte: fromDate, $lte: toDate } }
    ];
  }

  const result = await Booking.updateMany(filter, {
    $unset: { rating: "", feedback: "", feedbackAt: "", managerReply: "", managerReplyAt: "" }
  });

  return { deletedCount: result.modifiedCount || 0 };
};
