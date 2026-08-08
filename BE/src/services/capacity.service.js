const mongoose = require('mongoose');
const configService = require('./config.service');

// Utility to parse HH:mm to minutes
const parseTime = (timeStr) => {
  if (!timeStr) return null;
  const [hh, mm] = timeStr.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  return hh * 60 + mm;
};

const isSlotOverlap = (s1, e1, s2, e2) => !(e1 <= s2 || s1 >= e2);

const getDayBounds = (dateStr) => ({
  gte: new Date(`${dateStr}T00:00:00.000+07:00`),
  lte: new Date(`${dateStr}T23:59:59.999+07:00`),
});

const ACTIVE_SLOT_STATUSES = ['pending', 'confirmed', 'checked_in', 'in_progress'];

/**
 * Kiểm tra và bảo đảm sức chứa cho một branch trước khi tạo booking.
 * Cơ chế:
 * 1. Sử dụng Pessimistic Lock (khóa Document) trên Branch bằng findByIdAndUpdate.
 * 2. Đếm số lượng booking trùng giờ để xác minh.
 * Nếu dùng `session.withTransaction`, thao tác này sẽ an toàn trước concurrency (Race Condition).
 */
exports.checkCapacity = async ({ branch, bookingStr, startTime, endTime, userId, userTier, strictLastSlot = false }, session) => {
  if (!session) {
    throw new Error('checkCapacity requires a MongoDB session');
  }

  const Branch = mongoose.model('Branch');
  const Booking = mongoose.model('Booking');
  const branchId = branch._id;
  const capacity = branch.capacity || (await configService.get('DEFAULT_BRANCH_CAPACITY', { branchId }, 2));

  // 1. Pessimistic Lock trên Branch
  await Branch.findByIdAndUpdate(branchId, { $set: { _lastBookingLock: new Date() } }, { session });

  // 1.5 Kiểm tra cấu hình lịch của chi nhánh (ngày nghỉ, khóa khung giờ)
  if (branch.scheduleConfig) {
    if (branch.scheduleConfig.daysOff && branch.scheduleConfig.daysOff.includes(bookingStr)) {
      return { hasConflict: true, conflictReason: 'BRANCH_OFF', conflictingBookings: [] };
    }
    if (branch.scheduleConfig.blockedSlots && branch.scheduleConfig.blockedSlots.length > 0) {
      const ns = parseTime(startTime);
      const ne = parseTime(endTime);
      const isBlocked = branch.scheduleConfig.blockedSlots.some(bs => {
        if (bs.date !== bookingStr) return false;
        const bStart = parseTime(bs.startTime);
        const bEnd = parseTime(bs.endTime);
        return bStart !== null && bEnd !== null && isSlotOverlap(ns, ne, bStart, bEnd);
      });
      if (isBlocked) {
        return { hasConflict: true, conflictReason: 'SLOT_BLOCKED', conflictingBookings: [] };
      }
    }
  }

  // 2. Query booking đang hoạt động trong ngày
  const { gte, lte } = getDayBounds(bookingStr);
  const conflicting = await Booking.find({
    branchId,
    bookingDate: { $gte: gte, $lte: lte },
    status: { $in: ACTIVE_SLOT_STATUSES },
  }).select('startTime endTime priority').session(session);

  // 3. Tính toán Overlap
  const newStart = parseTime(startTime);
  const newEnd = parseTime(endTime);
  const overlappingBookings = conflicting.filter((b) => {
    const bs = parseTime(b.startTime);
    const be = parseTime(b.endTime);
    return bs !== null && be !== null && isSlotOverlap(newStart, newEnd, bs, be);
  });
  const overlappingCount = overlappingBookings.length;

  let hasConflict = false;
  let conflictReason = null;
  console.log(`[checkCapacity] conflicting=${conflicting.length}, overlappingCount=${overlappingCount}, capacity=${capacity}`);

  if (overlappingCount >= capacity) {
    hasConflict = true;
    conflictReason = 'SLOT_FULL';
  } else {
    const VIP_TIERS = ['gold', 'diamond', 'Ruby'];
    const hasVipInSlot = overlappingBookings.some(b => (b.priority || 1) >= 3);
    const isLastSlot = capacity > 1 && overlappingCount >= capacity - 1;
    const isVipUser = VIP_TIERS.includes(userTier);

    // strictLastSlot: áp dụng cho luồng định kỳ — buổi đang giữ chỗ cuối thì tính là conflict
    // cho mọi khách không phải VIP, đồng bộ với checkRecurringConflicts (màn xác nhận đặt lịch).
    if (isLastSlot && !isVipUser && (strictLastSlot || hasVipInSlot)) {
      hasConflict = true;
      conflictReason = 'SLOT_FULL_VIP';
    }
  }

  return { hasConflict, conflictReason, conflictingBookings: conflicting };
};
