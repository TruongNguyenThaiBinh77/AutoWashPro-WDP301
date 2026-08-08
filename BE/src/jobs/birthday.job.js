const cron = require('node-cron');
const { User, Voucher } = require('../models');
const notificationService = require('../services/notification.service');
const configService = require('../services/config.service');

/**
 * Run every day based on CRON_BIRTHDAY_TIME config.
 * Find users whose birthday is today and who don't already have a birthday voucher this year.
 * Create a personal voucher valid for 7 days.
 */
async function startBirthdayJob() {
  const timeStr = await configService.get('CRON_BIRTHDAY_TIME', {}, '08:00');
  const [hour, minute] = timeStr.split(':');
  const cronExpr = `${minute || 0} ${hour || 8} * * *`;

  cron.schedule(cronExpr, async () => {
    try {
      const now = new Date();
      const month = now.getMonth() + 1; // 1-12
      const day = now.getDate();

      // Find all customers with dateOfBirth matching today's month+day
      const users = await User.find({
        role: 'customer',
        status: 'active',
        $expr: {
          $and: [
            { $eq: [{ $month: '$dateOfBirth' }, month] },
            { $eq: [{ $dayOfMonth: '$dateOfBirth' }, day] },
          ],
        },
      });

      // Lấy config
      const percent = await configService.get('BIRTHDAY_VOUCHER_PERCENT', {}, 20);
      const maxDiscount = await configService.get('BIRTHDAY_VOUCHER_MAX_AMOUNT', {}, 100000);
      const validityDays = await configService.get('BIRTHDAY_VOUCHER_VALIDITY_DAYS', {}, 7);

      for (const user of users) {
        const thisYear = now.getFullYear();
        const existingCode = `BD${thisYear}${String(user._id).slice(-6).toUpperCase()}`;

        // Skip if already created this year
        const exists = await Voucher.findOne({ code: existingCode });
        if (exists) continue;

        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + validityDays);

        await Voucher.create({
          code: existingCode,
          name: `Voucher sinh nhật ${user.name}`,
          description: `Quà sinh nhật dành riêng cho ${user.name} — giảm ${percent}% tối đa ${maxDiscount.toLocaleString('vi-VN')}đ.`,
          type: 'percentage',
          value: percent,
          maxDiscount: maxDiscount,
          minOrder: 0,
          quantity: 1,
          remaining: 1,
          startDate: now,
          endDate,
          applicableToAllPackages: true,
          applicableToAllBranches: true,
          status: 'active',
          maxUsagePerUser: 1,
          isBirthdayVoucher: true,
          assignedTo: user._id,
        });

        await notificationService.send(
          user._id,
          'Chúc mừng sinh nhật! 🎂',
          `AutoWash Pro gửi tặng bạn voucher giảm ${percent}% nhân dịp sinh nhật. Mã: ${existingCode} (hiệu lực ${validityDays} ngày).`,
          'voucher',
          { code: existingCode }
        );
      }
    } catch (err) {
      console.error('[BirthdayJob]', err.message);
    }
  });

  console.log(`[BirthdayJob] Started — runs daily at ${timeStr}`);
}

module.exports = { startBirthdayJob };
