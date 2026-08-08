const mongoose = require('mongoose');
const { SystemConfig } = require('../models');

// Load environment variables for DB connection if run standalone
require('dotenv').config({ path: __dirname + '/../../.env' });

const INITIAL_CONFIGS = [
  {
    key: 'ADVANCE_BOOKING_LIMITS',
    value: { bronze: 14, silver: 14, gold: 30, diamond: 60, Ruby: 60 },
    type: 'json',
    category: 'booking',
    isPublic: true,
    description: 'Giới hạn thời gian đặt lịch trước theo hạng thành viên (ngày)'
  },
  {
    key: 'WALK_IN_DEFAULT_PASSWORD',
    value: '{phone}',
    type: 'string',
    category: 'general',
    isPublic: false,
    description: 'Mật khẩu mặc định khi tạo tài khoản khách vãng lai (có thể dùng {phone} để lấy SĐT)'
  },
  {
    key: 'WALK_IN_DEFAULT_EMAIL_SUFFIX',
    value: '@khachvanglai.autowash.vn',
    type: 'string',
    category: 'general',
    isPublic: false,
    description: 'Đuôi email ảo khi tạo tài khoản khách vãng lai không có email'
  },
  {
    key: 'WALK_IN_PRIMARY_IDENTIFIER',
    value: 'email',
    type: 'string',
    category: 'general',
    isPublic: false,
    description: 'Ưu tiên lấy thông tin làm tài khoản khi khách vãng lai cung cấp cả hai (email/phone)'
  },
  {
    key: 'WALK_IN_SEND_CREDENTIALS',
    value: true,
    type: 'boolean',
    category: 'general',
    isPublic: false,
    description: 'Tự động gửi SMS/Email thông báo tài khoản & mật khẩu khi tạo khách vãng lai'
  },
  {
    key: 'CRON_BIRTHDAY_TIME',
    value: '08:00',
    type: 'string',
    category: 'general',
    isPublic: false,
    description: 'Giờ hệ thống chạy tự động phát voucher sinh nhật (VD: 08:00)'
  },
  {
    key: 'CRON_EXPIRE_TIME',
    value: '00:05',
    type: 'string',
    category: 'general',
    isPublic: false,
    description: 'Giờ hệ thống chạy dọn dẹp các gói lượt hết hạn (VD: 00:05)'
  },
  {
    key: 'DEPOSIT_RATE',
    value: 30,
    type: 'number',
    category: 'payment',
    isPublic: true,
    description: 'Tỉ lệ đặt cọc mặc định cho các dịch vụ rửa xe (30%)'
  },
  {
    key: 'VAT_PERCENT',
    value: 10,
    type: 'number',
    category: 'payment',
    isPublic: true,
    description: 'Tỉ lệ thuế VAT (%) áp dụng cho hóa đơn và in ấn'
  },
  {
    key: 'MIN_ADVANCE_BOOKING_MINUTES',
    value: 30,
    type: 'number',
    category: 'booking',
    isPublic: true,
    description: 'Thời gian tối thiểu đặt trước (phút) để chi nhánh chuẩn bị'
  },
  {
    key: 'DEFAULT_BRANCH_CAPACITY',
    value: 2,
    type: 'number',
    category: 'booking',
    isPublic: true,
    description: 'Sức chứa mặc định (số xe rửa cùng lúc) nếu chi nhánh không cấu hình'
  },
  {
    key: 'LATE_WARNING_OFFSET_MINUTES',
    value: 5,
    type: 'number',
    category: 'booking',
    isPublic: false,
    description: 'Thời gian gửi cảnh báo trước khi tự động hủy lịch (phút)'
  },
  {
    key: 'GRACE_EXTENSION_STEP_MINUTES',
    value: 5,
    type: 'number',
    category: 'booking',
    // Manager UI hiển thị số phút này trên nút gia hạn nên FE phải đọc được qua /configs/public
    isPublic: true,
    description: 'Số phút gia hạn thêm mỗi lần quản lý thao tác'
  },
  {
    key: 'MAX_GRACE_EXTENSION_MINUTES',
    value: 15,
    type: 'number',
    category: 'booking',
    // Manager UI dùng để ẩn nút khi đơn đã gia hạn tối đa nên FE phải đọc được
    isPublic: true,
    description: 'Tổng số phút tối đa quản lý có thể gia hạn chờ khách'
  },
  {
    key: 'AUTO_CANCEL_GRACE_MINUTES',
    value: 15,
    type: 'number',
    category: 'booking',
    isPublic: true,
    description: 'Thời gian chờ khách tự động hủy (phút kể từ giờ bắt đầu)'
  },
  {
    key: 'LATE_CANCEL_THRESHOLD_MINUTES',
    value: 60,
    type: 'number',
    category: 'payment',
    isPublic: true,
    description: 'Mốc thời gian hủy muộn bị phạt (phút trước giờ bắt đầu)'
  },
  {
    key: 'LATE_CANCEL_PENALTY_FULL_PERCENT',
    value: 30,
    type: 'number',
    category: 'payment',
    isPublic: true,
    description: 'Phần trăm phạt trên tổng tiền nếu hủy muộn (đã thanh toán full)'
  },
  {
    key: 'LATE_CANCEL_PENALTY_DEPOSIT_PERCENT',
    value: 100,
    type: 'number',
    category: 'payment',
    isPublic: true,
    description: 'Phần trăm phạt trên tiền cọc nếu hủy muộn (chỉ đặt cọc)'
  },
  {
    key: 'SYSTEM_CANCEL_BONUS_POINTS',
    value: 500,
    type: 'number',
    category: 'booking',
    isPublic: false,
    description: 'Số điểm đền bù khi hệ thống tự động hủy đơn gói lượt'
  },
  {
    key: 'MAX_SLOT_PACK_QUANTITY',
    value: 50,
    type: 'number',
    category: 'booking',
    isPublic: true,
    description: 'Số lượng slot tối đa khách hàng có thể mua trong một gói lượt'
  },
  {
    key: 'SLOT_PACK_REFUND_FEE_PERCENT',
    value: 10,
    type: 'number',
    category: 'payment',
    isPublic: true,
    description: 'Phần trăm phí quản lý khi khách yêu cầu hoàn tiền gói lượt chưa dùng hết (%)'
  },
  {
    key: 'SLOT_PACK_REFUND_MAX_DAYS',
    value: 30,
    type: 'number',
    category: 'payment',
    isPublic: true,
    description: 'Thời hạn tối đa được yêu cầu hoàn tiền gói lượt (ngày kể từ lúc mua)'
  },
  {
    key: 'NO_SHOW_STRIKE_LIMIT',
    value: 5,
    type: 'number',
    category: 'booking',
    isPublic: true,
    description: 'Số lần hủy/vắng mặt trong tháng tối đa trước khi bị yêu cầu cọc 100%'
  },
  {
    key: 'SLOT_PACK_DISCOUNTS',
    value: [
      { minSlots: 5, discountPercent: 5 },
      { minSlots: 10, discountPercent: 10 },
      { minSlots: 20, discountPercent: 15 }
    ],
    type: 'json',
    isPublic: true,
    description: 'Cấu hình chiết khấu khi mua số lượng lớn Gói Lượt'
  },
  {
    key: 'SLOT_PACK_VIP_BONUS_DISCOUNTS',
    value: { gold: 2, diamond: 5, Ruby: 5 },
    type: 'json',
    isPublic: true,
    description: 'Cấu hình chiết khấu cộng thêm khi VIP mua Gói Lượt'
  },
  {
    key: 'BIRTHDAY_VOUCHER_PERCENT',
    value: 20,
    type: 'number',
    isPublic: false,
    description: 'Phần trăm giảm giá của voucher sinh nhật'
  },
  {
    key: 'BIRTHDAY_VOUCHER_MAX_AMOUNT',
    value: 100000,
    type: 'number',
    isPublic: false,
    description: 'Số tiền giảm giá tối đa của voucher sinh nhật'
  },
  {
    key: 'BIRTHDAY_VOUCHER_VALIDITY_DAYS',
    value: 7,
    type: 'number',
    category: 'promotion',
    isPublic: false,
    description: 'Số ngày hiệu lực của voucher sinh nhật'
  },
  {
    key: 'LOYALTY_BASE_EARNING_RATE',
    value: 5,
    type: 'number',
    category: 'loyalty',
    isPublic: true,
    description: 'Tỷ lệ tích điểm cơ bản (vd: 5 điểm / 100k VND)'
  },
  {
    key: 'LOYALTY_EXPIRATION_MONTHS',
    value: 6,
    type: 'number',
    category: 'loyalty',
    isPublic: true,
    description: 'Số tháng điểm thưởng sẽ hết hạn'
  },
  {
    key: 'LOYALTY_TIERS',
    value: [
      {
        id: 'bronze',
        name: 'Đồng',
        minPoints: 0,
        multiplier: 1.0,
        color: 'text-orange-600',
        bg: 'bg-orange-50 border-orange-200',
        icon: 'Circle',
        benefits: ['Tích lũy điểm thưởng từ mỗi hóa đơn', 'Nhận thông báo ưu đãi sớm nhất']
      },
      {
        id: 'silver',
        name: 'Bạc',
        minPoints: 100000,
        multiplier: 1.2,
        color: 'text-slate-600',
        bg: 'bg-slate-100 border-slate-300',
        icon: 'Medal',
        benefits: ['Tất cả ưu đãi của hạng Đồng', 'Hệ số nhân điểm x1.2', 'Ưu tiên rửa xe không cần chờ lâu']
      },
      {
        id: 'gold',
        name: 'Vàng',
        minPoints: 500000,
        multiplier: 1.5,
        color: 'text-yellow-600',
        bg: 'bg-yellow-50 border-yellow-200',
        icon: 'Crown',
        benefits: ['Tất cả ưu đãi của hạng Bạc', 'Hệ số nhân điểm x1.5', 'Giảm 5% khi mua gói dịch vụ', 'Tặng 1 lần xịt gầm miễn phí mỗi tháng']
      },
      {
        id: 'diamond',
        name: 'Kim cương',
        minPoints: 1000000,
        multiplier: 2.0,
        color: 'text-blue-600',
        bg: 'bg-blue-50 border-blue-200',
        icon: 'Diamond',
        benefits: ['Tất cả ưu đãi của hạng Vàng', 'Hệ số nhân điểm siêu tốc x2.0', 'Giảm 10% khi mua gói dịch vụ', 'Phục vụ phòng chờ VIP', 'Tặng 1 lượt rửa xe tiêu chuẩn miễn phí mỗi tháng']
      }
    ],
    type: 'json',
    category: 'loyalty',
    isPublic: true,
    description: 'Cấu hình các hạng thành viên và quyền lợi'
  }
];

async function seedConfigs() {
  let isStandalone = false;
  
  // If no DB connection exists, connect (when running as standalone script)
  if (mongoose.connection.readyState === 0) {
    isStandalone = true;
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }

  try {
    console.log('--- Starting SystemConfig Seeding ---');
    let addedCount = 0;
    
    for (const conf of INITIAL_CONFIGS) {
      const existing = await SystemConfig.findOne({ key: conf.key, scope: 'global' });
      if (!existing) {
        await SystemConfig.create({
          ...conf,
          scope: 'global',
          version: 1,
          auditLog: [{
            oldValue: null,
            newValue: conf.value,
            reason: 'Khởi tạo cấu hình mặc định ban đầu'
          }]
        });
        console.log(`+ Created config: ${conf.key}`);
        addedCount++;
      } else {
        console.log(`~ Skipped existing config: ${conf.key}`);
      }
    }
    
    console.log(`--- Seeding completed. Added ${addedCount} new configs ---`);
  } catch (error) {
    console.error('Error seeding configs:', error);
  } finally {
    if (isStandalone) {
      await mongoose.disconnect();
      console.log('Database disconnected.');
    }
  }
}

// Automatically execute if run directly via Node.js
if (require.main === module) {
  seedConfigs().catch(console.error);
}

module.exports = { seedConfigs };
