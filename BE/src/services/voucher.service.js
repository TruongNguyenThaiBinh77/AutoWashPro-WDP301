const mongoose = require('mongoose');
const { Voucher, Package, VoucherUsage, User, PointHistory, Booking, SlotPack } = require('../models');
const sseService = require('./sse.service');

const generateCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'WASH';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

const applyVoucher = (voucher, amount) => {
  if (voucher.type === 'percentage') {
    const discount = Math.floor(amount * (voucher.value / 100));
    return voucher.maxDiscount > 0 ? Math.min(discount, voucher.maxDiscount) : discount;
  }
  return Math.min(voucher.value, amount);
};

exports.createVoucher = async (data) => {
  const userProvidedCode = !!data.code;
  let code = data.code || generateCode();
  let existing = await Voucher.findOne({ code: code.toUpperCase() });
  let attempts = 0;
  while (existing && !userProvidedCode && attempts < 5) {
    code = generateCode();
    existing = await Voucher.findOne({ code: code.toUpperCase() });
    attempts++;
  }
  if (existing) throw Object.assign(new Error('Voucher code already exists'), { statusCode: 409, code: 'DUPLICATE_CODE' });

  const payload = {
    ...data,
    code: code.toUpperCase(),
    remaining: data.quantity,
    createdBy: data.createdBy,
  };

  // Nếu có branchId → tự động giới hạn voucher chỉ dùng được ở chi nhánh đó
  if (data.branchId) {
    payload.branchId = data.branchId;
    payload.applicableToAllBranches = false;
    if (!data.applicableBranches || data.applicableBranches.length === 0) {
      payload.applicableBranches = [data.branchId];
    }
  }

  const voucher = new Voucher(payload);
  await voucher.save();
  sseService.broadcastToAll('vouchers_updated', { action: 'create' });
  return voucher;
};

exports.getAllVouchers = async (filters = {}, userRole, userId, userBranchId) => {
  const query = { isDeleted: { $ne: true } };
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.search) {
    query.$or = [
      { code: { $regex: filters.search, $options: 'i' } },
      { name: { $regex: filters.search, $options: 'i' } },
    ];
  }
  if (filters.startDate || filters.endDate) {
    query.startDate = {};
    if (filters.startDate) query.startDate.$gte = new Date(filters.startDate);
    if (filters.endDate) query.startDate.$lte = new Date(filters.endDate);
  }
  if (filters.endDateOnly) {
    query.endDate = { $gte: new Date(filters.endDateOnly) };
  }
  if (userRole === 'manager') {
    if (!userBranchId) {
      return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false } };
    }
    query.branchId = userBranchId;
  } else if (filters.branchId) {
    query.branchId = filters.branchId;
  }

  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    Voucher.find(query).populate('createdBy', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Voucher.countDocuments(query),
  ]);

  return {
    data,
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

exports.getVoucherById = async (id, userRole, userId, userBranchId) => {
  const voucher = await Voucher.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!voucher) throw Object.assign(new Error('Voucher not found'), { statusCode: 404, code: 'VOUCHER_NOT_FOUND' });
  if (userRole === 'manager') {
    const ownedByBranch = userBranchId && voucher.branchId && String(voucher.branchId) === String(userBranchId);
    const createdByUser = String(voucher.createdBy) === String(userId);
    if (!ownedByBranch && !createdByUser) {
      throw Object.assign(new Error('Not authorized'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }
  return voucher;
};

exports.getVoucherByCode = async (code, branchId) => {
  const query = { code: code.toUpperCase(), isDeleted: { $ne: true } };
  if (branchId) {
    query.$or = [{ applicableToAllBranches: true }, { applicableBranches: branchId }, { branchId }];
  }
  const voucher = await Voucher.findOne(query);
  if (!voucher) throw Object.assign(new Error('Voucher not found or not applicable'), { statusCode: 404, code: 'VOUCHER_NOT_FOUND' });
  return voucher;
};

exports.updateVoucher = async (id, updates, userRole, userId, userBranchId) => {
  const voucher = await Voucher.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!voucher) throw Object.assign(new Error('Voucher not found'), { statusCode: 404, code: 'VOUCHER_NOT_FOUND' });
  if (userRole === 'manager') {
    const ownedByBranch = userBranchId && voucher.branchId && String(voucher.branchId) === String(userBranchId);
    const createdByUser = String(voucher.createdBy) === String(userId);
    if (!ownedByBranch && !createdByUser) {
      throw Object.assign(new Error('Not authorized'), { statusCode: 403, code: 'FORBIDDEN' });
    }
    delete updates.branchId;
    delete updates.applicableToAllBranches;
  }
  const updated = await Voucher.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  sseService.broadcastToAll('vouchers_updated', { action: 'update' });
  return updated;
};

exports.deleteVoucher = async (id, userRole, userId, userBranchId) => {
  const voucher = await Voucher.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!voucher) throw Object.assign(new Error('Voucher not found'), { statusCode: 404, code: 'VOUCHER_NOT_FOUND' });
  if (userRole === 'manager') {
    const ownedByBranch = userBranchId && voucher.branchId && String(voucher.branchId) === String(userBranchId);
    const createdByUser = String(voucher.createdBy) === String(userId);
    if (!ownedByBranch && !createdByUser) {
      throw Object.assign(new Error('Not authorized'), { statusCode: 403, code: 'FORBIDDEN' });
    }
  }

  // Ràng buộc: Kiểm tra xem voucher đã được khách hàng đổi/sử dụng chưa
  const usedCount = await VoucherUsage.countDocuments({ voucherId: id });
  if (usedCount > 0) {
    const err = new Error(
      `Không thể xóa mã ưu đãi "${voucher.code}" vì đã có ${usedCount} lượt khách hàng đổi/sử dụng. Bạn vui lòng chuyển trạng thái voucher sang "Ngừng hoạt động" để ngưng tiếp nhận đặt mới mà vẫn bảo toàn dữ liệu.`
    );
    err.statusCode = 400;
    err.code = 'VOUCHER_IN_USE';
    throw err;
  }

  await Voucher.findByIdAndUpdate(id, { isDeleted: true, deletedAt: new Date() });
  sseService.broadcastToAll('vouchers_updated', { action: 'delete' });
  return voucher;
};

exports.validateVoucher = async (code, bookingData, userId) => {
  const voucher = await Voucher.findOne({ code: code.toUpperCase(), isDeleted: { $ne: true } });
  if (!voucher) throw Object.assign(new Error('Mã giảm giá không tồn tại'), { statusCode: 404, code: 'VOUCHER_NOT_FOUND' });
  if (voucher.status !== 'active') throw Object.assign(new Error('Mã giảm giá hiện đang bị khóa hoặc tạm ngưng'), { statusCode: 400, code: 'VOUCHER_INACTIVE' });
  if (voucher.isTemplate) throw Object.assign(new Error('Mẫu voucher không thể sử dụng trực tiếp'), { statusCode: 400, code: 'VOUCHER_IS_TEMPLATE' });

  // Kiểm tra gán cho user cụ thể
  if (voucher.assignedTo && String(voucher.assignedTo) !== String(userId)) {
    throw Object.assign(new Error('Mã voucher này chỉ dành riêng cho khách hàng được chỉ định'), { statusCode: 403, code: 'VOUCHER_ASSIGNED_TO_OTHER' });
  }

  const now = new Date();
  if (now < voucher.startDate) throw Object.assign(new Error('Mã giảm giá chưa đến ngày bắt đầu áp dụng'), { statusCode: 400, code: 'VOUCHER_NOT_ACTIVE' });
  if (now > voucher.endDate) throw Object.assign(new Error('Mã giảm giá đã hết hạn sử dụng'), { statusCode: 400, code: 'VOUCHER_EXPIRED' });
  if (voucher.remaining <= 0) throw Object.assign(new Error('Mã voucher này đã hết lượt sử dụng trong hệ thống'), { statusCode: 400, code: 'VOUCHER_EXHAUSTED' });

  if (userId && voucher.maxUsagePerUser > 0) {
    const usageCount = await VoucherUsage.countDocuments({ voucherId: voucher._id, userId });
    if (usageCount >= voucher.maxUsagePerUser) {
      throw Object.assign(new Error(`Bạn đã đạt giới hạn sử dụng voucher này tối đa ${voucher.maxUsagePerUser} lần`), { statusCode: 400, code: 'VOUCHER_MAX_USAGE' });
    }
  }

  // Kiểm tra hạng thành viên nếu voucher yêu cầu
  if (userId && voucher.applicableTiers && voucher.applicableTiers.length > 0) {
    const user = await User.findById(userId);
    if (!user || !voucher.applicableTiers.includes(user.tier)) {
      throw Object.assign(new Error(`Voucher này chỉ áp dụng cho hạng thành viên: ${voucher.applicableTiers.join(', ')}`), { statusCode: 403, code: 'VOUCHER_TIER_MISMATCH' });
    }
  }

  if (!voucher.applicableToAllPackages && voucher.applicablePackages.length > 0) {
    if (!voucher.applicablePackages.some((p) => String(p) === String(bookingData.packageId))) {
      throw Object.assign(new Error('Voucher không áp dụng cho gói dịch vụ này'), { statusCode: 400, code: 'VOUCHER_NOT_APPLICABLE' });
    }
  }
  if (!voucher.applicableToAllBranches && voucher.applicableBranches.length > 0) {
    if (!voucher.applicableBranches.some((b) => String(b) === String(bookingData.branchId))) {
      throw Object.assign(new Error('Voucher không áp dụng tại chi nhánh này'), { statusCode: 400, code: 'VOUCHER_NOT_APPLICABLE' });
    }
  }

  let amount = 0;
  if (bookingData.amount !== undefined) {
    amount = bookingData.amount;
  } else if (bookingData.packageId) {
    const pkg = await Package.findById(bookingData.packageId);
    if (pkg) amount = pkg.price;
  }

  if (amount < voucher.minOrder) {
    throw Object.assign(new Error(`Đơn hàng cần đạt tối thiểu ${voucher.minOrder.toLocaleString('vi-VN')}đ để áp dụng voucher`), { statusCode: 400, code: 'MIN_ORDER_NOT_MET' });
  }

  const discount = applyVoucher(voucher, amount);
  return {
    voucher,
    originalAmount: amount,
    discountAmount: discount,
    finalAmount: amount - discount,
    savings: discount,
  };
};

/**
 * Reserve voucher for a booking (atomic decrement).
 * If payment fails, call rollbackVoucher() to restore remaining count.
 * @param {Object} [parentSession] - Optional existing session from a parent transaction
 */
exports.reserveVoucher = async (code, userId, bookingId, discountAmount, parentSession) => {
  const ownSession = !parentSession;
  const session = parentSession || await mongoose.startSession();
  if (ownSession) session.startTransaction();

  try {
    // Kiểm tra đã reserve cho booking này chưa (idempotent)
    const existingForBooking = await VoucherUsage.findOne({ bookingId, userId }).session(session);
    if (existingForBooking) {
      // Đã reserve rồi, skip
      const voucher = await Voucher.findById(existingForBooking.voucherId).session(session);
      if (ownSession) await session.commitTransaction();
      return { voucher, usage: existingForBooking, alreadyReserved: true };
    }

    const Booking = mongoose.model('Booking');
    const booking = await Booking.findById(bookingId).session(session);
    let isAlreadyReservedForGroup = false;

    // Check if the voucher has already been reserved for another booking in the same recurring group
    if (booking && booking.bookingType === 'recurring' && booking.recurringGroupId) {
      const voucherDoc = await Voucher.findOne({ code: code.toUpperCase() }).session(session);
      if (voucherDoc) {
        const groupBookings = await Booking.find({ recurringGroupId: booking.recurringGroupId }).select('_id').session(session);
        const groupIds = groupBookings.map(b => b._id);
        const existingUsage = await VoucherUsage.findOne({ voucherId: voucherDoc._id, userId, bookingId: { $in: groupIds } }).session(session);
        if (existingUsage) {
          isAlreadyReservedForGroup = true;
        }
      }
    }

    let voucher;
    if (isAlreadyReservedForGroup) {
      // Just fetch the voucher without decrementing
      voucher = await Voucher.findOne({ code: code.toUpperCase() }).session(session);
      if (!voucher) throw Object.assign(new Error('Voucher not found'), { statusCode: 404, code: 'VOUCHER_NOT_FOUND' });
    } else {
      // Lock voucher and check all conditions atomically
      voucher = await Voucher.findOneAndUpdate(
        {
          code: code.toUpperCase(),
          remaining: { $gt: 0 },
          status: 'active',
          isDeleted: { $ne: true },
          startDate: { $lte: new Date() },
          endDate: { $gte: new Date() },
        },
        { $inc: { remaining: -1 } },
        { new: true, session }
      );

      if (!voucher) {
        const existing = await Voucher.findOne({ code: code.toUpperCase() }).session(session);
        if (!existing) throw Object.assign(new Error('Voucher not found'), { statusCode: 404, code: 'VOUCHER_NOT_FOUND' });
        if (existing.remaining <= 0) throw Object.assign(new Error('Voucher fully redeemed'), { statusCode: 400, code: 'VOUCHER_EXHAUSTED' });
        throw Object.assign(new Error('Voucher is inactive or expired'), { statusCode: 400, code: 'VOUCHER_INVALID' });
      }

      // Check per-user usage limit inside the same transaction
      if (voucher.maxUsagePerUser > 0) {
        const usageCount = await VoucherUsage.countDocuments({ voucherId: voucher._id, userId }).session(session);
        if (usageCount >= voucher.maxUsagePerUser) {
          // Rollback the decrement we just did
          await Voucher.findByIdAndUpdate(voucher._id, { $inc: { remaining: 1 } }, { session });
          throw Object.assign(new Error(`You have reached the maximum usage limit for this voucher (${voucher.maxUsagePerUser} time(s))`), { statusCode: 400, code: 'VOUCHER_MAX_USAGE' });
        }
      }
    }

    const usage = new VoucherUsage({
      voucherId: voucher._id,
      userId,
      bookingId,
      discountAmount,
    });
    await usage.save({ session });

    if (ownSession) await session.commitTransaction();
    return { voucher, usage };
  } catch (err) {
    if (ownSession) await session.abortTransaction();
    throw err;
  } finally {
    if (ownSession) session.endSession();
  }
};

/**
 * Rollback voucher reservation (restore remaining count).
 * Idempotent: safe to call multiple times — only restores if usage record exists.
 * @param {Object} [parentSession] - Optional existing session from a parent transaction
 */
exports.rollbackVoucher = async (code, userId, bookingId, parentSession) => {
  const ownSession = !parentSession;
  const session = parentSession || await mongoose.startSession();
  if (ownSession) session.startTransaction();

  try {
    const voucher = await Voucher.findOne({ code: code.toUpperCase() }).session(session);
    if (!voucher) {
      // Already rolled back or never reserved — safe to skip
      if (ownSession) await session.commitTransaction();
      return;
    }

    const usage = await VoucherUsage.findOne({ voucherId: voucher._id, userId, bookingId }).session(session);
    if (!usage) {
      if (ownSession) await session.commitTransaction();
      return;
    }

    await Voucher.findByIdAndUpdate(voucher._id, { $inc: { remaining: 1 } }, { session });

    await VoucherUsage.deleteOne({ _id: usage._id }).session(session);
    if (ownSession) await session.commitTransaction();
  } catch (err) {
    if (ownSession) await session.abortTransaction();
    throw err;
  } finally {
    if (ownSession) session.endSession();
  }
};

exports.getVoucherUsage = async (voucherId, filters = {}) => {
  const query = { voucherId };
  if (filters.dateFrom || filters.dateTo) {
    query.usedAt = {};
    if (filters.dateFrom) query.usedAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59, 999);
      query.usedAt.$lte = to;
    }
  }

  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    VoucherUsage.find(query)
      .populate('userId', 'name email phone tier')
      .populate('bookingId', 'bookingCode bookingDate startTime status')
      .sort({ usedAt: -1 })
      .skip(skip)
      .limit(limit),
    VoucherUsage.countDocuments(query),
  ]);

  return {
    data,
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

async function enrichReportBookings(data) {
  if (!Array.isArray(data) || !data.length) return data;
  const idSet = new Set();
  data.forEach((item) => item.vouchersUsed?.forEach((v) => (v.bookings || []).forEach((b) => idSet.add(String(b)))));
  const ids = [...idSet];
  if (!ids.length) return data;
  const [bookings, slotPacks] = await Promise.all([
    Booking.find({ _id: { $in: ids } }).select('bookingCode bookingType').lean(),
    SlotPack.find({ _id: { $in: ids } }).select('packCode').lean(),
  ]);
  const bookingMap = new Map(bookings.map((b) => [String(b._id), b]));
  const packMap = new Map(slotPacks.map((p) => [String(p._id), p]));
  // Map every slot pack id -> a representative slot_pack_usage booking code (if any)
  const packIds = [...packMap.keys()];
  const usageBookings = packIds.length
    ? await Booking.find({ slotPackId: { $in: packIds }, bookingType: 'slot_pack_usage' })
        .sort({ bookingDate: -1, createdAt: -1 })
        .select('slotPackId bookingCode')
        .lean()
    : [];
  const usageCodeByPack = new Map();
  usageBookings.forEach((ub) => {
    if (ub.slotPackId && !usageCodeByPack.has(String(ub.slotPackId))) {
      usageCodeByPack.set(String(ub.slotPackId), ub.bookingCode);
    }
  });
  data.forEach((item) => {
    item.vouchersUsed?.forEach((v) => {
      if (!Array.isArray(v.bookings)) return;
      v.bookings = v.bookings.map((b) => {
        const bid = String(b);
        if (bookingMap.has(bid)) {
          const bk = bookingMap.get(bid);
          return { id: bid, isSlotPack: false, code: bk.bookingCode, bookingType: bk.bookingType };
        }
        if (packMap.has(bid)) {
          const pk = packMap.get(bid);
          return { id: bid, isSlotPack: true, code: usageCodeByPack.get(bid) || pk.packCode, packCode: pk.packCode };
        }
        return { id: bid, isSlotPack: false, code: null };
      });
    });
  });
  return data;
}

exports.getVoucherUsageReport = async (filters = {}) => {
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

  const buildPipeline = (startDate, endDate) => {
    const matchStage = {};
    if (startDate && endDate) {
      matchStage.usedAt = { $gte: startDate, $lte: endDate };
    }
    return [
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id: { userId: '$userId', voucherId: '$voucherId' },
          count: { $sum: 1 },
          totalDiscount: { $sum: '$discountAmount' },
          bookings: { $push: '$bookingId' }
        }
      },
      {
        $lookup: {
          from: 'vouchers',
          localField: '_id.voucherId',
          foreignField: '_id',
          as: 'voucher'
        }
      },
      { $unwind: { path: '$voucher', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$_id.userId',
          totalUsedVouchers: { $sum: '$count' },
          totalDiscountAmount: { $sum: '$totalDiscount' },
          vouchersUsed: {
            $push: {
              voucherId: '$_id.voucherId',
              code: '$voucher.code',
              name: '$voucher.name',
              count: '$count',
              totalDiscount: '$totalDiscount',
              bookings: '$bookings'
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          'user.name': 1,
          'user.email': 1,
          'user.phone': 1,
          'user.tier': 1,
          totalUsedVouchers: 1,
          totalDiscountAmount: 1,
          vouchersUsed: 1
        }
      },
      { $sort: { totalUsedVouchers: -1 } }
    ];
  };

  const [data, prevData] = await Promise.all([
    VoucherUsage.aggregate(buildPipeline(startOfPeriod, endOfPeriod)),
    (startOfPrev && endOfPrev) ? VoucherUsage.aggregate(buildPipeline(startOfPrev, endOfPrev)) : Promise.resolve([])
  ]);

  await enrichReportBookings(data);

  const calcStats = (reportData) => {
    let totalDiscount = 0;
    let totalUsed = 0;
    reportData.forEach(item => {
      totalDiscount += item.totalDiscountAmount || 0;
      totalUsed += item.totalUsedVouchers || 0;
    });
    return { totalDiscount, totalUsed, uniqueUsers: reportData.length };
  };

  return {
    data,
    stats: calcStats(data),
    previousStats: calcStats(prevData)
  };
};

exports.getUserVouchers = async (userId, query = {}) => {
  const { page = 1, limit = 10, search, status, sort = 'newest' } = query;
  const now = new Date();

  const usageVouchers = await VoucherUsage.find({ userId })
    .populate('voucherId')
    .populate('bookingId', 'bookingDate startTime status')
    .sort({ usedAt: -1 });

  // Gộp các voucher được gán riêng cho user (trúng vòng quay / đổi điểm)
  const assignedVouchers = await Voucher.find({
    assignedTo: userId,
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .lean();

  const isUsable = (voucherId) => {
    if (!voucherId) return false;
    const v = voucherId.remaining !== undefined ? voucherId : (voucherId._doc || voucherId);
    return v.remaining > 0
      && v.status !== 'used'
      && v.status !== 'expired'
      && (!v.endDate || new Date(v.endDate) >= now);
  };

  const usageVoucherIds = new Set(
    usageVouchers
      .map((u) => (u.voucherId ? String(u.voucherId._id || u.voucherId) : null))
      .filter(Boolean)
  );

  const usableUsage = usageVouchers.filter((u) => isUsable(u.voucherId));

  const assignedExtras = assignedVouchers
    .filter((v) => !usageVoucherIds.has(String(v._id)))
    .filter(isUsable)
    .map((v) => ({
      _id: v._id,
      voucherId: v,
      usedAt: v.createdAt,
    }));

  let allList = [...assignedExtras, ...usableUsage];

  // Status filtering
  if (status === 'active') {
    allList = allList.filter(item => {
      const v = item.voucherId;
      return v && v.remaining > 0 && (!v.endDate || new Date(v.endDate) >= now);
    });
  } else if (status === 'expired') {
    allList = allList.filter(item => {
      const v = item.voucherId;
      return v && (v.status === 'expired' || (v.endDate && new Date(v.endDate) < now));
    });
  } else if (status === 'used') {
    allList = allList.filter(item => {
      const v = item.voucherId;
      return v && (v.status === 'used' || v.remaining <= 0);
    });
  }

  // Text search
  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    allList = allList.filter(item => {
      const v = item.voucherId;
      if (!v) return false;
      return (v.code && v.code.toLowerCase().includes(term)) ||
             (v.name && v.name.toLowerCase().includes(term)) ||
             (v.description && v.description.toLowerCase().includes(term));
    });
  }

  // Sorting
  if (sort === 'oldest') {
    allList.sort((a, b) => new Date(a.usedAt || 0) - new Date(b.usedAt || 0));
  } else if (sort === 'discount_desc') {
    allList.sort((a, b) => (b.voucherId?.discountValue || 0) - (a.voucherId?.discountValue || 0));
  } else if (sort === 'expiring_soon') {
    allList.sort((a, b) => {
      const dateA = a.voucherId?.endDate ? new Date(a.voucherId.endDate).getTime() : Infinity;
      const dateB = b.voucherId?.endDate ? new Date(b.voucherId.endDate).getTime() : Infinity;
      return dateA - dateB;
    });
  } else {
    allList.sort((a, b) => new Date(b.usedAt || 0) - new Date(a.usedAt || 0));
  }

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const total = allList.length;
  const skip = (pageNum - 1) * limitNum;
  const paginatedData = allList.slice(skip, skip + limitNum);

  return {
    data: paginatedData,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
      hasNextPage: pageNum * limitNum < total,
      hasPrevPage: pageNum > 1,
    },
  };
};

/**
 * Lấy tất cả voucher có thể dùng cho user hiện tại, phân loại 3 nhóm:
 *  - tier_exclusive: chỉ cho hạng của user (diamond/gold/silver)
 *  - public:        ai cũng dùng được (applicableTiers rỗng)
 *  - redeemable:    đổi điểm (isTemplate + requiredPoints > 0)
 */
exports.getAvailableVouchersForUser = async (userId, branchId, filters = {}) => {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  const now = new Date();
  const branchFilter = branchId
    ? { $or: [{ applicableToAllBranches: true }, { applicableBranches: branchId }, { branchId }] }
    : {};

  // BACKWARD COMPATIBILITY MODE for VoucherPicker.jsx (no type filter passed)
  if (!filters.type) {
    const allVouchers = await Voucher.find({
      status: 'active',
      isDeleted: { $ne: true },
      isTemplate: false,
      startDate: { $lte: now },
      endDate:   { $gte: now },
      ...branchFilter,
      $and: [
        { $or: [{ remaining: { $gt: 0 } }, { quantity: 0 }] },
        { $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }, { assignedTo: userId }] },
      ],
    }).lean();

    const templates = await Voucher.find({
      status: 'active',
      isDeleted: { $ne: true },
      isTemplate: true,
      requiredPoints: { $gt: 0 },
      remaining: { $gt: 0 },
      endDate: { $gte: now },
    }).lean();

    const tierExclusive = [];
    const publicVouchers = [];

    for (const v of allVouchers) {
      if (v.maxUsagePerUser > 0) {
        const usageCount = await VoucherUsage.countDocuments({ voucherId: v._id, userId });
        if (usageCount >= v.maxUsagePerUser) continue;
      }
      if (v.applicableTiers && v.applicableTiers.length > 0) {
        if (v.applicableTiers.includes(user.tier)) tierExclusive.push(v);
      } else {
        publicVouchers.push(v);
      }
    }

    return {
      user: {
        tier: user.tier,
        loyaltyPoints: user.loyaltyPoints,
        lifetimePoints: user.lifetimePoints,
      },
      tier_exclusive: tierExclusive,
      public: publicVouchers,
      redeemable: templates,
    };
  }

  // PAGINATED MODE for GiftStoreSection (type filter passed)
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 100));

  let query = {
    status: 'active',
    isDeleted: { $ne: true },
    startDate: { $lte: now },
    endDate: { $gte: now },
    ...branchFilter,
  };

  const type = filters.type; // 'all', 'mine', 'redeemable'
  if (type === 'redeemable') {
    query.isTemplate = true;
    query.requiredPoints = { $gt: 0 };
    query.remaining = { $gt: 0 };
  } else {
    query.isTemplate = false;
    query.$and = [
      { $or: [{ remaining: { $gt: 0 } }, { quantity: 0 }] },
      { $or: [{ assignedTo: null }, { assignedTo: { $exists: false } }, { assignedTo: userId }] },
    ];
  }

  const allMatching = await Voucher.find(query).lean();
  let filtered = [];

  for (const v of allMatching) {
    if (!v.isTemplate && v.maxUsagePerUser > 0) {
      const usageCount = await VoucherUsage.countDocuments({ voucherId: v._id, userId });
      if (usageCount >= v.maxUsagePerUser) continue;
    }

    if (type === 'mine') {
      const isMine = (v.applicableTiers && v.applicableTiers.includes(user.tier)) || String(v.assignedTo) === String(userId);
      if (isMine) filtered.push(v);
    } else if (type === 'all') {
      const isApplicable = !v.applicableTiers || v.applicableTiers.length === 0 || v.applicableTiers.includes(user.tier);
      if (isApplicable) filtered.push(v);
    } else if (type === 'redeemable') {
      filtered.push(v);
    }
  }

  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = filtered.length;
  const skip = (page - 1) * limit;
  const paginatedData = filtered.slice(skip, skip + limit);

  return {
    user: {
      tier: user.tier,
      loyaltyPoints: user.loyaltyPoints,
      lifetimePoints: user.lifetimePoints,
    },
    data: paginatedData,
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


/**
 * Đổi điểm lấy Voucher
 */
exports.redeemPointsForVoucher = async (templateId, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const template = await Voucher.findById(templateId).session(session);
    if (!template) throw Object.assign(new Error('Voucher template not found'), { statusCode: 404 });
    
    if (!template.isTemplate) {
      throw Object.assign(new Error('This is not a redeemable voucher template'), { statusCode: 400 });
    }
    
    if (template.requiredPoints <= 0) {
      throw Object.assign(new Error('This voucher does not require points to redeem'), { statusCode: 400 });
    }

    if (user.loyaltyPoints < template.requiredPoints) {
      throw Object.assign(new Error(`Not enough points. Required: ${template.requiredPoints}, Available: ${user.loyaltyPoints}`), { statusCode: 400, code: 'INSUFFICIENT_POINTS' });
    }

    if (template.applicableTiers && template.applicableTiers.length > 0 && !template.applicableTiers.includes(user.tier)) {
      throw Object.assign(new Error(`Your tier (${user.tier}) is not eligible for this voucher`), { statusCode: 403 });
    }

    if (template.remaining <= 0) {
      throw Object.assign(new Error('Voucher is out of stock'), { statusCode: 400 });
    }

    // Trừ số lượng template
    template.remaining -= 1;
    await template.save({ session });

    // Trừ điểm user
    user.loyaltyPoints -= template.requiredPoints;
    
    // Gia hạn điểm
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    user.pointsExpiresAt = sixMonthsLater;
    await user.save({ session });

    // Ghi log PointHistory
    await PointHistory.create([{
      userId,
      points: -template.requiredPoints,
      type: 'redeemed',
      description: `Đổi ${template.requiredPoints} điểm lấy voucher ${template.name}`,
      referenceId: template._id,
    }], { session });

    // Tạo Voucher thực tế cho User từ template
    const userVoucher = new Voucher({
      code: `RD${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      name: template.name,
      description: template.description,
      type: template.type,
      value: template.value,
      maxDiscount: template.maxDiscount,
      minOrder: template.minOrder,
      quantity: 1,
      remaining: 1,
      startDate: new Date(),
      endDate: template.endDate,
      applicablePackages: template.applicablePackages,
      applicableBranches: template.applicableBranches,
      applicableToAllPackages: template.applicableToAllPackages,
      applicableToAllBranches: template.applicableToAllBranches,
      status: 'active',
      isTemplate: false,
      assignedTo: userId,
      maxUsagePerUser: 1,
    });
    
    await userVoucher.save({ session });
    await session.commitTransaction();

    return userVoucher;
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

exports.getPublicVouchersByBranch = async (branchId) => {
  const now = new Date();
  const query = {
    status: 'active',
    isTemplate: { $ne: true },
    isDeleted: { $ne: true },
    startDate: { $lte: now },
    endDate: { $gte: now },
  };
  
  if (branchId) {
    query.$or = [
      { applicableToAllBranches: true },
      { applicableBranches: branchId },
      { branchId },
    ];
  }
  
  return Voucher.find(query).sort({ createdAt: -1 }).limit(20);
};
