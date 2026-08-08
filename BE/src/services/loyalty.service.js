const { User, PointHistory } = require('../models');
const notificationService = require('./notification.service');
const sseService = require('./sse.service');
const configService = require('./config.service');

const DEFAULT_TIERS = [
  {
    id: 'bronze',
    name: 'Đồng',
    minPoints: 0,
    multiplier: 1.0,
    advanceDays: 14,
    color: 'text-orange-600',
    bg: 'bg-orange-50 border-orange-200',
    icon: 'Circle',
    benefits: ['Tích lũy điểm thưởng từ mỗi hóa đơn', 'Nhận thông báo ưu đãi sớm nhất'],
  },
  {
    id: 'silver',
    name: 'Bạc',
    minPoints: 100000,
    multiplier: 1.2,
    advanceDays: 14,
    color: 'text-slate-600',
    bg: 'bg-slate-100 border-slate-300',
    icon: 'Medal',
    benefits: ['Tất cả ưu đãi của hạng Đồng', 'Hệ số nhân điểm x1.2', 'Ưu tiên rửa xe không cần chờ lâu'],
  },
  {
    id: 'gold',
    name: 'Vàng',
    minPoints: 500000,
    multiplier: 1.5,
    advanceDays: 30,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50 border-yellow-200',
    icon: 'Crown',
    benefits: ['Tất cả ưu đãi của hạng Bạc', 'Hệ số nhân điểm x1.5', 'Giảm 5% khi mua gói dịch vụ', 'Tặng 1 lần xịt gầm miễn phí mỗi tháng'],
  },
  {
    id: 'diamond',
    name: 'Kim cương',
    minPoints: 1000000,
    multiplier: 2.0,
    advanceDays: 60,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    icon: 'Diamond',
    benefits: ['Tất cả ưu đãi của hạng Vàng', 'Hệ số nhân điểm siêu tốc x2.0', 'Giảm 10% khi mua gói dịch vụ', 'Phục vụ phòng chờ VIP', 'Tặng 1 lượt rửa xe tiêu chuẩn miễn phí mỗi tháng'],
  },
];

const DEFAULT_CONFIG = {
  baseEarningRate: 5,
  pointExpirationMonths: 6,
  tiers: DEFAULT_TIERS,
};

let cachedConfig = null;

/**
 * Clear cached config (helpful for testing)
 */
exports.clearCache = () => {
  cachedConfig = null;
};

const PRESET_TIER_ICONS = {
  bronze: 'Circle',
  silver: 'Medal',
  gold: 'Crown',
  diamond: 'Diamond',
};

function normalizeTiers(tiers = []) {
  const defaultTierById = new Map(DEFAULT_TIERS.map((t) => [String(t.id).toLowerCase(), t]));
  return tiers.map((t) => {
    const tierObj = typeof t.toObject === 'function' ? t.toObject() : { ...t };
    const idLower = (tierObj.id || '').toLowerCase();
    if (!tierObj.icon || (tierObj.icon === 'Circle' && idLower !== 'bronze')) {
      tierObj.icon = PRESET_TIER_ICONS[idLower] || 'Star';
    }
    // Điền advanceDays từ default theo id nếu thiếu (dữ liệu cũ chưa có field này)
    const defaultTier = defaultTierById.get(idLower);
    if (!Number.isFinite(Number(tierObj.advanceDays)) && defaultTier) {
      tierObj.advanceDays = defaultTier.advanceDays;
    }
    return tierObj;
  });
}

/**
 * Lấy cấu hình điểm thưởng hiện tại từ SystemConfig
 */
exports.getLoyaltyConfig = async () => {
  try {
    const baseEarningRate = await configService.get('LOYALTY_BASE_EARNING_RATE', {}, DEFAULT_CONFIG.baseEarningRate);
    const pointExpirationMonths = await configService.get('LOYALTY_EXPIRATION_MONTHS', {}, DEFAULT_CONFIG.pointExpirationMonths);
    const rawTiers = await configService.get('LOYALTY_TIERS', {}, DEFAULT_CONFIG.tiers);
    
    return {
      baseEarningRate,
      pointExpirationMonths,
      tiers: normalizeTiers(rawTiers),
    };
  } catch (err) {
    return DEFAULT_CONFIG;
  }
};

/**
 * Cập nhật cấu hình điểm thưởng (Admin)
 * NOTE: Cần chuyển sang dùng API config.controller.js
 */
exports.updateLoyaltyConfig = async (data) => {
  if (data.baseEarningRate !== undefined) {
    await configService.set({ key: 'LOYALTY_BASE_EARNING_RATE', value: Number(data.baseEarningRate), type: 'number', category: 'loyalty', isPublic: true });
  }
  if (data.pointExpirationMonths !== undefined) {
    await configService.set({ key: 'LOYALTY_EXPIRATION_MONTHS', value: Number(data.pointExpirationMonths), type: 'number', category: 'loyalty', isPublic: true });
  }
  if (Array.isArray(data.tiers)) {
    const newTiers = data.tiers.map((t) => {
      const defaultTier = DEFAULT_TIERS.find((d) => String(d.id).toLowerCase() === String(t.id || '').toLowerCase());
      return {
        id: String(t.id || '').trim(),
        name: String(t.name || '').trim(),
        minPoints: Number(t.minPoints || 0),
        multiplier: Number(t.multiplier || 1.0),
        advanceDays: Number.isFinite(Number(t.advanceDays)) ? Number(t.advanceDays) : (defaultTier ? defaultTier.advanceDays : 14),
        color: t.color || '',
        bg: t.bg || '',
        border: t.border || '',
        colorTheme: t.colorTheme || t.id || 'bronze',
        icon: t.icon || 'Circle',
        benefits: Array.isArray(t.benefits) ? t.benefits.map((b) => String(b).trim()) : [],
      };
    });
    await configService.set({ key: 'LOYALTY_TIERS', value: newTiers, type: 'json', category: 'loyalty', isPublic: true });

    // Đồng bộ ADVANCE_BOOKING_LIMITS từ các hạng thực tế (giữ cho config cũ luôn khớp hạng mới từ FE)
    const advanceBookingLimits = {};
    for (const t of newTiers) {
      if (Number.isFinite(Number(t.advanceDays))) {
        advanceBookingLimits[t.id] = Number(t.advanceDays);
      }
    }
    await configService.set({ key: 'ADVANCE_BOOKING_LIMITS', value: advanceBookingLimits, type: 'json', category: 'booking', description: 'Giới hạn đặt trước tối đa theo hạng thành viên (đồng bộ tự động từ LOYALTY_TIERS)' });
  }
  return await exports.getLoyaltyConfig();
};

/**
 * Tính điểm dựa trên số tiền và hạng thành viên theo config động
 */
exports.calculatePoints = (amount, tier = 'bronze', config = DEFAULT_CONFIG) => {
  const rate = (config.baseEarningRate ?? 5) / 100;
  const tierObj = (config.tiers || DEFAULT_TIERS).find((t) => t.id === tier);
  const multiplier = tierObj ? tierObj.multiplier : 1.0;
  return Math.floor(amount * rate * multiplier);
};

/**
 * Xác định hạng dựa trên tổng điểm lifetimePoints và config động
 */
exports.determineTier = (lifetimePoints, config = DEFAULT_CONFIG) => {
  const tiers = [...(config.tiers || DEFAULT_TIERS)].sort((a, b) => b.minPoints - a.minPoints);
  for (const t of tiers) {
    if (lifetimePoints >= t.minPoints) {
      return t.id;
    }
  }
  return tiers[tiers.length - 1]?.id || 'bronze';
};

/**
 * Trả về danh sách hạng cấu hình cho client
 */
exports.getTierConfig = async () => {
  const config = await exports.getLoyaltyConfig();
  return config.tiers || DEFAULT_TIERS;
};

/**
 * Xử lý khi thanh toán thành công: cộng điểm, ghi log, thăng hạng
 */
exports.addPointsFromPayment = async (userId, amount, bookingId, session) => {
  const user = await User.findById(userId).session(session);
  if (!user) return null;

  const config = await exports.getLoyaltyConfig();
  const pointsEarned = exports.calculatePoints(amount, user.tier, config);
  if (pointsEarned <= 0) return null;

  user.loyaltyPoints += pointsEarned;
  user.lifetimePoints += pointsEarned;

  // Gia hạn điểm theo config (mặc định 6 tháng)
  const expMonths = config.pointExpirationMonths || 6;
  const expDate = new Date();
  expDate.setMonth(expDate.getMonth() + expMonths);
  user.pointsExpiresAt = expDate;

  // Kiểm tra thăng hạng
  const newTier = exports.determineTier(user.lifetimePoints, config);
  const tierChanged = user.tier !== newTier;
  if (tierChanged) {
    user.tier = newTier;

    const tierObj = (config.tiers || DEFAULT_TIERS).find((t) => t.id === newTier);
    const tierName = tierObj?.name || newTier;
    notificationService.send(
      userId,
      'Chúc mừng thăng hạng',
      `Bạn đã được thăng lên hạng ${tierName}. Khám phá ngay các ưu đãi mới!`,
      'tier_upgraded',
      { newTier }
    ).catch(() => {});
  }

  await user.save({ session });

  // Lấy thông tin booking & chi nhánh (nếu có)
  const { Booking } = require('../models');
  let bookingCode = '';
  let bookingType = 'single';
  let packageName = '';
  let packagePrice = 0;
  let subServices = [];
  let paymentMethod = '';
  let paymentStatus = 'paid';
  let branchId = null;
  let branchName = '';
  let branchAddress = '';
  let voucherCode = '';
  let discountAmount = 0;
  let includedSubServices = [];

  if (bookingId) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate('branchId', 'name address')
        .populate('packageId', 'name price subServices')
        .session(session);

      if (booking) {
        bookingCode = booking.bookingCode || '';
        bookingType = booking.bookingType || 'single';
        paymentMethod = booking.paymentMethod || '';
        paymentStatus = booking.paymentStatus || 'paid';
        voucherCode = booking.voucherCode || '';
        discountAmount = booking.discountAmount || 0;

        packageName = booking.packageName || booking.packageSnapshot?.name || booking.packageId?.name || '';
        packagePrice = booking.packagePrice ?? booking.packageSnapshot?.price ?? booking.packageId?.price ?? 0;

        if (Array.isArray(booking.includedSubServices) && booking.includedSubServices.length > 0) {
          includedSubServices = booking.includedSubServices.map((s) => ({
            name: typeof s === 'string' ? s : s.name,
            price: s.price || 0,
            duration: s.duration || 0,
          }));
        } else if (booking.packageSnapshot && Array.isArray(booking.packageSnapshot.subServices)) {
          includedSubServices = booking.packageSnapshot.subServices
            .filter((s) => s.isOptional === false)
            .map((s) => ({ name: typeof s === 'string' ? s : s.name, price: s.price || 0 }));
        } else if (booking.packageId && Array.isArray(booking.packageId.subServices)) {
          includedSubServices = booking.packageId.subServices
            .filter((s) => s.isOptional === false)
            .map((s) => ({ name: typeof s === 'string' ? s : s.name, price: s.price || 0 }));
        }

        if (Array.isArray(booking.selectedSubServices) && booking.selectedSubServices.length > 0) {
          subServices = booking.selectedSubServices.map((s) => ({
            name: typeof s === 'string' ? s : s?.name || '',
            price: typeof s === 'object' ? s?.price || 0 : 0,
            isOptional: s?.isOptional !== false,
          }));
        } else if (Array.isArray(booking.subServices)) {
          subServices = booking.subServices.map((s) => ({
            name: typeof s === 'string' ? s : s?.name || '',
            price: typeof s === 'object' ? s?.price || 0 : 0,
            isOptional: true,
          }));
        }

        if (booking.branchId) {
          branchId = booking.branchId._id || booking.branchId;
          branchName = booking.branchId.name || '';
          branchAddress = booking.branchId.address || '';
        }
      }
    } catch {}
  }

  const baseRate = config.baseEarningRate ?? 5;
  const tierObj = (config.tiers || DEFAULT_TIERS).find((t) => t.id === user.tier);
  const multiplier = tierObj ? tierObj.multiplier : 1.0;
  const tierName = tierObj ? tierObj.name : user.tier;
  const effectiveRate = Number((baseRate * multiplier).toFixed(2));

  const detailedDesc = bookingCode
    ? `Tích lũy +${pointsEarned.toLocaleString('vi-VN')} điểm từ hoàn thành đơn hàng ${bookingCode}`
    : `Tích lũy +${pointsEarned.toLocaleString('vi-VN')} điểm từ hoàn thành hóa đơn`;

  // Ghi log kèm snapshot bất biến
  await PointHistory.create([{
    userId,
    points: pointsEarned,
    type: 'earned',
    description: detailedDesc,
    referenceId: bookingId,
    snapshot: {
      orderAmount: amount,
      baseRate,
      tier: user.tier,
      tierName,
      multiplier,
      effectiveRate,
      bookingCode,
      bookingType,
      packageName,
      packagePrice,
      subServices,
      includedSubServices,
      voucherCode,
      discountAmount,
      paymentMethod,
      paymentStatus,
      branchId,
      branchName,
      branchAddress,
    },
  }], { session });

  // Real-time broadcasts
  notificationService.send(
    userId,
    'Tích điểm thành công',
    `Bạn vừa được cộng +${pointsEarned} điểm thưởng từ dịch vụ.`,
    'points_earned',
    { pointsEarned, bookingId, loyaltyPoints: user.loyaltyPoints, tier: user.tier }
  ).catch(() => {});

  const userIdStr = String(userId);
  sseService.sendToUser(userIdStr, 'points_updated', {
    pointsEarned,
    loyaltyPoints: user.loyaltyPoints,
    lifetimePoints: user.lifetimePoints,
    tier: user.tier,
    bookingId: String(bookingId),
  });
  sseService.sendToUser(userIdStr, 'my_bookings_updated', { bookingId: String(bookingId) });

  return { pointsEarned, newTier, tierChanged };
};

/**
 * Kiểm tra điểm hết hạn
 */
exports.checkAndExpirePoints = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return;

  if (user.loyaltyPoints > 0 && user.pointsExpiresAt && user.pointsExpiresAt < new Date()) {
    const expiredPoints = user.loyaltyPoints;
    user.loyaltyPoints = 0;
    await user.save();

    await PointHistory.create({
      userId,
      points: -expiredPoints,
      type: 'expired',
      description: `Điểm tích lũy đã hết hạn.`,
    });
  }
};

/**
 * Thu hồi điểm thưởng khi đơn hàng được hoàn tiền
 * @param {string} bookingId - ID của booking
 * @param {string} cancellationReason - Lý do hoàn tiền
 * @param {object} parentSession - Mongoose session để chạy trong transaction (optional)
 */
exports.deductPointsForCancelledBooking = async (bookingId, cancellationReason = '', parentSession = null) => {
  const exec = parentSession
    ? { query: (model, filter, opts) => model.findOne(filter, null, { ...opts, session: parentSession }), save: (doc) => doc.save({ session: parentSession }), create: (model, data) => model.create([data], { session: parentSession }) }
    : { query: (model, filter, opts) => model.findOne(filter, opts), save: (doc) => doc.save(), create: (model, data) => model.create([data]) };

  try {
    const PointHistoryModel = PointHistory;
    const earnedHistory = await exec.query(PointHistoryModel, {
      referenceId: bookingId,
      type: 'earned',
      isDeleted: { $ne: true },
    });

    if (!earnedHistory || earnedHistory.points <= 0) return null;

    const targetUser = await exec.query(User, { _id: earnedHistory.userId });
    if (!targetUser) return null;

    // Idempotency
    const alreadyDeducted = await exec.query(PointHistoryModel, {
      referenceId: bookingId,
      type: 'adjustment',
      points: { $lt: 0 },
      isDeleted: { $ne: true },
    });
    if (alreadyDeducted) return null;

    const pointsDeducted = earnedHistory.points;
    const newLoyaltyPoints = Math.max(0, (targetUser.loyaltyPoints || 0) - pointsDeducted);
    const newLifetimePoints = Math.max(0, (targetUser.lifetimePoints || 0) - pointsDeducted);

    targetUser.loyaltyPoints = newLoyaltyPoints;
    targetUser.lifetimePoints = newLifetimePoints;

    // Tính lại tier dựa trên lifetimePoints mới
    const config = await exports.getLoyaltyConfig();
    const newTier = exports.determineTier(newLifetimePoints, config);
    const tierChanged = targetUser.tier !== newTier;
    targetUser.tier = newTier;

    await exec.save(targetUser);

    const bookingCode = earnedHistory.snapshot?.bookingCode || '';
    const desc = bookingCode
      ? `Truy thu -${pointsDeducted.toLocaleString('vi-VN')} điểm thưởng do đơn hàng ${bookingCode} được hoàn tiền`
      : `Truy thu -${pointsDeducted.toLocaleString('vi-VN')} điểm thưởng do đơn hàng được hoàn tiền`;

    await exec.create(PointHistoryModel, {
      userId: targetUser._id,
      points: -pointsDeducted,
      type: 'adjustment',
      description: desc,
      referenceId: bookingId,
      snapshot: {
        ...earnedHistory.snapshot,
        cancellationReason,
      },
    });

    if (tierChanged) {
      const tierObj = (config.tiers || []).find((t) => t.id === newTier);
      const tierName = tierObj?.name || newTier;
      notificationService.send(
        targetUser._id,
        'Cập nhật hạng thành viên',
        `Do thu hồi điểm, hạng của bạn đã được điều chỉnh xuống ${tierName}.`,
        'tier_downgraded',
        { newTier }
      ).catch(() => {});
    }

    // Thông báo
    notificationService.send(
      targetUser._id,
      'Trừ điểm thưởng do hoàn tiền',
      `Đơn hàng ${bookingCode || ''} đã được hoàn tiền. Hệ thống đã thu hồi -${pointsDeducted.toLocaleString('vi-VN')} điểm thưởng tương ứng.`,
      'points_deducted',
      { pointsDeducted, bookingId, loyaltyPoints: targetUser.loyaltyPoints }
    ).catch(() => {});

    const userIdStr = String(targetUser._id);
    sseService.sendToUser(userIdStr, 'points_updated', {
      pointsDeducted,
      loyaltyPoints: targetUser.loyaltyPoints,
      bookingId: String(bookingId),
    });

    return true;
  } catch (err) {
    console.error('Lỗi khi thu hồi điểm thưởng do hoàn tiền:', err);
    if (!parentSession) return null;
    throw err;
  }
};
