const mongoose = require('mongoose');
const { Reward, Redemption, User, PointHistory } = require('../models');

const POINT_EXPIRY_MONTHS = 6;

// Thứ bậc hạng thành viên (chỉ số càng cao càng có nhiều quyền lợi)
const TIER_RANK = { bronze: 0, silver: 1, gold: 2, diamond: 3 };

const generateCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'RDT';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

exports.getAllRewards = async (query = {}) => {
  const { page = 1, limit = 10, search, status } = query;
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Reward.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(Number(limit)),
    Reward.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
};

exports.getPublicRewards = async () => {
  return Reward.find({ status: 'active' }).sort({ sortOrder: 1, createdAt: -1 });
};

exports.getRewardById = async (id) => {
  const reward = await Reward.findById(id);
  if (!reward) throw Object.assign(new Error('Reward not found'), { statusCode: 404 });
  return reward;
};

exports.createReward = async (data) => {
  const reward = await Reward.create(data);
  return reward;
};

exports.updateReward = async (id, data) => {
  const reward = await Reward.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!reward) throw Object.assign(new Error('Reward not found'), { statusCode: 404 });
  return reward;
};

exports.deleteReward = async (id) => {
  const reward = await Reward.findByIdAndDelete(id);
  if (!reward) throw Object.assign(new Error('Reward not found'), { statusCode: 404 });
};

exports.getUserRewards = async (userId, query = {}) => {
  const { page = 1, limit = 10, search, status, startDate, endDate, sort = 'newest' } = query;
  const filter = { user: userId };

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (search && search.trim()) {
    const term = search.trim();
    filter.$or = [
      { code: { $regex: term, $options: 'i' } },
      { 'rewardSnapshot.name': { $regex: term, $options: 'i' } },
    ];
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filter.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  let sortOption = { createdAt: -1 };
  if (sort === 'oldest') sortOption = { createdAt: 1 };
  else if (sort === 'points_desc') sortOption = { pointsSpent: -1, createdAt: -1 };
  else if (sort === 'points_asc') sortOption = { pointsSpent: 1, createdAt: -1 };

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;

  const [data, total] = await Promise.all([
    Redemption.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .populate('reward', 'name imageUrl'),
    Redemption.countDocuments(filter),
  ]);

  return {
    data,
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
 * Lấy danh sách lượt đổi thưởng (admin/manager) kèm lọc & phân trang
 */
exports.getRedemptions = async (query = {}) => {
  const { page = 1, limit = 10, search, status, branchId } = query;
  const filter = {};
  if (status) filter.status = status;
  if (branchId) filter.branchId = branchId;
  if (search) {
    filter.$or = [
      { code: { $regex: search, $options: 'i' } },
      { 'rewardSnapshot.name': { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Redemption.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('user', 'name email phone tier')
      .populate('sentBy', 'name email')
      .populate('branchId', 'name address'),
    Redemption.countDocuments(filter),
  ]);

  return {
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
};

async function applySnapshots(redemption, sentBy, branchId) {
  const targetBranchId = branchId || redemption.branchId;
  const targetUserId = sentBy || redemption.sentBy;

  if (targetBranchId && (!redemption.branchSnapshot || !redemption.branchSnapshot.name)) {
    try {
      const Branch = require('../models/branch.schema');
      const bDoc = await Branch.findById(targetBranchId);
      if (bDoc) {
        redemption.branchSnapshot = {
          id: String(bDoc._id),
          name: bDoc.name,
          code: bDoc.code || '',
        };
      }
    } catch {}
  }

  if (targetUserId && (!redemption.sentBySnapshot || !redemption.sentBySnapshot.name)) {
    try {
      const User = require('../models/user.schema');
      const uDoc = await User.findById(targetUserId);
      if (uDoc) {
        redemption.sentBySnapshot = {
          id: String(uDoc._id),
          name: uDoc.fullName || uDoc.name || 'Quản lý',
          phone: uDoc.phone || '',
          email: uDoc.email || '',
          role: uDoc.role || '',
        };
      }
    } catch {}
  }
}

/**
 * Nhân viên/manager xác nhận đã gửi quà cho khách
 */
exports.markRedemptionSent = async (redemptionId, { sentBy, branchId }) => {
  const redemption = await Redemption.findById(redemptionId);
  if (!redemption) throw Object.assign(new Error('Redemption not found'), { statusCode: 404 });
  if (redemption.status === 'cancelled') {
    throw Object.assign(new Error('Lượt đổi thưởng đã bị hủy'), { statusCode: 400 });
  }
  if (redemption.status === 'sent') {
    return redemption;
  }
  redemption.status = 'sent';
  redemption.sentAt = new Date();
  if (sentBy) redemption.sentBy = sentBy;
  if (branchId) redemption.branchId = branchId;
  await applySnapshots(redemption, sentBy, branchId);
  await redemption.save();
  return redemption;
};

/**
 * Manager/admin nhập mã đổi thưởng của khách để xác nhận đã nhận quà.
 * Cho phép trực tiếp từ 'claimed' -> 'received' (bỏ bước "đã gửi quà").
 */
exports.markRedemptionReceived = async (redemptionId, { code, sentBy, branchId }) => {
  const entered = String(code || '').trim().toUpperCase();
  let redemption;
  if (redemptionId && redemptionId !== 'by-code' && mongoose.Types.ObjectId.isValid(redemptionId)) {
    redemption = await Redemption.findById(redemptionId);
  }
  if (!redemption && entered) {
    redemption = await Redemption.findOne({ code: entered });
  }

  if (!redemption) throw Object.assign(new Error('Mã đổi thưởng không tồn tại trong hệ thống. Vui lòng kiểm tra lại!'), { statusCode: 404 });
  if (redemption.status === 'cancelled') {
    throw Object.assign(new Error('Lượt đổi thưởng này đã bị hủy'), { statusCode: 400 });
  }
  if (redemption.status === 'received') {
    throw Object.assign(new Error('Quà tặng này đã được khách hàng nhận trước đó rồi!'), { statusCode: 400 });
  }
  if (entered && entered !== redemption.code) {
    throw Object.assign(new Error('Mã đổi thưởng không khớp. Vui lòng kiểm tra lại!'), { statusCode: 400 });
  }
  redemption.status = 'received';
  redemption.receivedAt = new Date();
  if (sentBy && !redemption.sentBy) redemption.sentBy = sentBy;
  if (branchId && !redemption.branchId) redemption.branchId = branchId;
  if (!redemption.sentAt) redemption.sentAt = new Date();
  await applySnapshots(redemption, sentBy, branchId);
  await redemption.save();
  return redemption;
};

/**
 * Đổi điểm lấy phần thưởng
 */
exports.redeemReward = async (rewardId, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const reward = await Reward.findById(rewardId).session(session);
    if (!reward) throw Object.assign(new Error('Reward not found'), { statusCode: 404 });

    if (reward.status !== 'active') {
      throw Object.assign(new Error('Reward is not available'), { statusCode: 400 });
    }

    if (reward.stock <= 0) {
      throw Object.assign(new Error('Reward is out of stock'), { statusCode: 400, code: 'OUT_OF_STOCK' });
    }

    // Kiểm tra hạng thành viên tối thiểu
    const userTierRank = TIER_RANK[user.tier] ?? 0;
    const requiredTier = reward.requiredTier || 'bronze';
    if (userTierRank < (TIER_RANK[requiredTier] ?? 0)) {
      throw Object.assign(
        new Error(`Phần thưởng này yêu cầu hạng ${requiredTier} trở lên`),
        { statusCode: 403, code: 'INSUFFICIENT_TIER', requiredTier }
      );
    }

    if (user.loyaltyPoints < reward.pointCost) {
      throw Object.assign(new Error(`Not enough points. Required: ${reward.pointCost}, Available: ${user.loyaltyPoints}`), { statusCode: 400, code: 'INSUFFICIENT_POINTS' });
    }

    // Trừ số lượng tồn kho
    reward.stock -= 1;
    await reward.save({ session });

    // Trừ điểm user + gia hạn
    user.loyaltyPoints -= reward.pointCost;
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + POINT_EXPIRY_MONTHS);
    user.pointsExpiresAt = expiry;
    await user.save({ session });

    // Sinh mã đổi thưởng duy nhất
    let code = generateCode();
    let attempts = 0;
    while ((await Redemption.findOne({ code }).session(session)) && attempts < 10) {
      code = generateCode();
      attempts += 1;
    }

    const redemption = new Redemption({
      user: userId,
      reward: reward._id,
      rewardSnapshot: {
        name: reward.name,
        imageUrl: reward.imageUrl,
        pointCost: reward.pointCost,
        requiredTier: reward.requiredTier || 'bronze',
      },
      code,
      pointsSpent: reward.pointCost,
      status: 'claimed',
    });
    await redemption.save({ session });

    // Ghi log PointHistory
    await PointHistory.create([{
      userId,
      points: -reward.pointCost,
      type: 'redeemed',
      description: `Đổi ${reward.pointCost} điểm lấy ${reward.name}`,
      referenceId: reward._id,
    }], { session });

    await session.commitTransaction();
    return { redemption, remainingPoints: user.loyaltyPoints };
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
 * Hủy lượt đổi quà (manager / admin)
 */
exports.cancelRedemption = async (redemptionId, userId, reason = '') => {
  const redemption = await Redemption.findById(redemptionId);
  if (!redemption) throw Object.assign(new Error('Không tìm thấy đơn đổi quà'), { statusCode: 404 });
  if (redemption.status === 'cancelled') {
    throw Object.assign(new Error('Lượt đổi quà này đã bị hủy từ trước'), { statusCode: 400 });
  }

  redemption.status = 'cancelled';
  redemption.cancelledAt = new Date();
  if (reason) {
    redemption.cancelReason = String(reason).trim();
  }
  await redemption.save();

  // Hoàn lại điểm cho khách hàng nếu có
  if (redemption.pointsSpent > 0 && redemption.user) {
    try {
      const userDoc = await User.findById(redemption.user);
      if (userDoc) {
        userDoc.loyaltyPoints = (userDoc.loyaltyPoints || 0) + redemption.pointsSpent;
        await userDoc.save();

        await PointHistory.create({
          userId: redemption.user,
          points: redemption.pointsSpent,
          type: 'earned',
          description: `Hoàn điểm do hủy đơn đổi quà ${redemption.code}${reason ? ` (Lý do: ${reason})` : ''}`,
          referenceId: redemption._id,
        });
      }
    } catch (e) {
      console.error('Error refunding points on redemption cancel:', e);
    }
  }

  return redemption;
};

/**
 * Xóa 1 lượt đổi quà (Admin only)
 */
exports.deleteRedemption = async (redemptionId) => {
  const redemption = await Redemption.findByIdAndDelete(redemptionId);
  if (!redemption) throw Object.assign(new Error('Không tìm thấy lượt đổi quà để xóa'), { statusCode: 404 });
  return redemption;
};

/**
 * Xóa lượt đổi quà hàng loạt hoặc từ ngày đến ngày (Admin only)
 */
exports.bulkDeleteRedemptions = async ({ fromDate, toDate, deleteAll }) => {
  if (deleteAll) {
    const result = await Redemption.deleteMany({});
    return { deletedCount: result.deletedCount };
  }

  if (!fromDate || !toDate) {
    throw Object.assign(new Error('Vui lòng cung cấp khoảng thời gian từ ngày và đến ngày hợp lệ'), { statusCode: 400 });
  }

  const start = new Date(fromDate);
  const end = new Date(toDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw Object.assign(new Error('Ngày tháng không đúng định dạng'), { statusCode: 400 });
  }

  if (start > end) {
    throw Object.assign(new Error('Thời gian Từ ngày phải nhỏ hơn hoặc bằng Đến ngày!'), { statusCode: 400 });
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const filter = {
    createdAt: { $gte: start, $lte: end },
  };

  const result = await Redemption.deleteMany(filter);
  return { deletedCount: result.deletedCount, fromDate: start, toDate: end };
};