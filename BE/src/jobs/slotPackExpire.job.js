const cron = require('node-cron');
const { SlotPack } = require('../models');
const notificationService = require('../services/notification.service');

const configService = require('../services/config.service');

/**
 * Quét các gói lượt đã quá hạn (expiresAt < now) và cập nhật thành expired.
 * Chạy lúc 00:05 mỗi ngày (hoặc theo cấu hình CRON_EXPIRE_TIME).
 */
async function startSlotPackExpireJob() {
  const timeStr = await configService.get('CRON_EXPIRE_TIME', {}, '00:05');
  const [hour, minute] = timeStr.split(':');
  const cronExpr = `${minute || 5} ${hour || 0} * * *`;

  cron.schedule(cronExpr, async () => {
    try {
      const now = new Date();
      // Tìm các gói còn hạn nhưng đã qua ngày expiresAt
      const expiredPacks = await SlotPack.find({
        status: 'active',
        expiresAt: { $lt: now, $ne: null }
      });

      if (expiredPacks.length > 0) {
        let count = 0;
        for (const pack of expiredPacks) {
          pack.status = 'expired';
          await pack.save();
          count++;

          // Thông báo cho user
          notificationService.send(
            pack.userId,
            'Gói lượt hết hạn',
            `Gói lượt ${pack.packCode} của bạn đã hết hạn. Các lượt chưa sử dụng đã bị vô hiệu hóa theo chính sách.`,
            'slot_pack_expired'
          ).catch(e => console.error('Lỗi thông báo hết hạn gói lượt:', e));
        }
        console.log(`[SlotPackExpireJob] Đã cập nhật ${count} gói lượt thành expired.`);
      }
    } catch (err) {
      console.error('[SlotPackExpireJob] Lỗi quét gói lượt hết hạn:', err.message);
    }
  });

  console.log(`[SlotPackExpireJob] Started — quét gói lượt hết hạn lúc ${timeStr} mỗi ngày`);
}

module.exports = { startSlotPackExpireJob };
