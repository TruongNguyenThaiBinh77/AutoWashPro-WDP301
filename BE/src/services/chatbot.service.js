const { OpenAI } = require('openai');
const branchService = require('./branch.service');
const packageService = require('./package.service');
const bookingService = require('./booking.service');
const slotPackService = require('./slotPack.service');
const authService = require('./auth.service');
const { Vehicle, User, Branch, Booking, SlotPack, Package } = require('../models');
const FE_URL = (process.env.FE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const MOBILE_DEEPLINK = 'autowashpro';
const FE_PAGES = {
  booking: `${FE_URL}/booking`,
  history: `${FE_URL}/history`,
  payments: `${FE_URL}/payments`,
  profile: `${FE_URL}/profile`,
  vehicles: `${FE_URL}/profile?tab=vehicles`,
  wallet: `${FE_URL}/profile?tab=wallet`,
  benefits: `${FE_URL}/profile?tab=benefits`,
  packages: `${FE_URL}/packages`,
  gifts: `${FE_URL}/gifts`,
  map: `${FE_URL}/map`,
  notifications: `${FE_URL}/notifications`,
  slotPacks: `${FE_URL}/history?view=slot_packs`,
};
const BASE_INSTRUCTION = require('./chatbot/base.instruction');
const CUSTOMER_INSTRUCTION = require('./chatbot/customer.instruction');
const MANAGER_INSTRUCTION = require('./chatbot/manager.instruction');
const ADMIN_INSTRUCTION = require('./chatbot/admin.instruction');

// ─── Singleton OpenAI & Groq clients ────────────────────────────────────────────
let _openai = null;
let _modelName = null;
let _groqOpenai = null;
let _groqModelName = null;

function getOpenAIClient() {
  if (!_openai) {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GOOGLE_AI_KEY;
    if (apiKey) {
      _openai = new OpenAI({
        apiKey,
        baseURL: process.env.CHATBOT_BASE_URL || 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:5000',
          'X-Title': 'AutoWashPro',
        },
      });
      _modelName = process.env.CHATBOT_MODEL || 'google/gemini-2.5-flash';
    }
  }
  return { openai: _openai, modelName: _modelName };
}

function getGroqClient() {
  if (!_groqOpenai) {
    const apiKey = process.env.GROQ_API_KEY;
    _groqOpenai = new OpenAI({
      apiKey: apiKey || 'dummy-groq-key',
      baseURL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    });
    _groqModelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  }
  return { openai: _groqOpenai, modelName: _groqModelName };
}

async function createCompletionWithFallback(params) {
  const primary = getOpenAIClient();
  if (primary.openai && primary.modelName) {
    try {
      return await primary.openai.chat.completions.create({
        ...params,
        model: primary.modelName,
      });
    } catch (err) {
      console.warn(`[CHATBOT FALLBACK] Primary provider (${primary.modelName}) error: ${err.message}. Switching to Groq API...`);
    }
  }

  const groq = getGroqClient();
  console.log(`[CHATBOT] Using Groq AI (${groq.modelName})...`);
  return await groq.openai.chat.completions.create({
    ...params,
    model: groq.modelName,
  });
}

function getOpenAI() {
  const primary = getOpenAIClient();
  if (primary.openai) return primary;
  return getGroqClient();
}

// ─── System prompt composer ──────────────────────────────────────────────────────
async function composeSystemPrompt(role) {
  const roleInstruction = ROLE_INSTRUCTIONS[role] || CUSTOMER_INSTRUCTION;
  
  let dynamicContext = '';
  try {
    const loyaltyService = require('./loyalty.service');
    const configService = require('./config.service');
    const loyaltyConfig = await loyaltyService.getLoyaltyConfig();
    const depositRate = await configService.get('DEPOSIT_RATE', {}, 30);
    const vatRate = await configService.get('VAT_PERCENT', {}, 10);
    const slotDiscounts = await configService.get('SLOT_PACK_DISCOUNTS', {}, []);
    const vipSlotDiscounts = await configService.get('SLOT_PACK_VIP_BONUS_DISCOUNTS', {}, {});

    const tierInfo = (loyaltyConfig.tiers || []).map(t => 
      `  + ${t.name}: Điểm tối thiểu ${Number(t.minPoints || 0).toLocaleString('vi-VN')}đ, Nhân điểm x${t.multiplier}, Đặt trước tối đa ${t.advanceDays || 14} ngày, Quyền lợi: ${(t.benefits || []).join(', ')}`
    ).join('\n');

    const slotDiscInfo = (slotDiscounts || []).map(d => `Từ ${d.minSlots} slot: giảm ${d.discountPercent}%`).join('; ');
    const vipSlotInfo = Object.entries(vipSlotDiscounts || {}).map(([k, v]) => `${k}: +${v}%`).join(', ');

    dynamicContext = `
=== THÔNG TIN CẤU HÌNH THỜI GIAN THỰC CỦA HỆ THỐNG (ADMIN ĐÃ THIẾT LẬP) ===
- Tỉ lệ đặt cọc mặc định: ${depositRate}%
- Thuế VAT áp dụng: ${vatRate}%
- Tỷ lệ tích điểm: ${loyaltyConfig.baseEarningRate || 5} điểm cho mỗi 100.000đ thanh toán
- Thời hạn điểm thưởng: ${loyaltyConfig.pointExpirationMonths || 6} tháng
- Các hạng thành viên & quyền lợi thực tế:
${tierInfo}
- Chiết khấu số lượng Gói Lượt: ${slotDiscInfo || '5 slot: 5%, 10 slot: 10%, 20 slot: 15%'}
- Chiết khấu VIP mua Gói Lượt: ${vipSlotInfo || 'Vàng: +2%, Kim Cương/Ruby: +5%'}
========================================================================`;
  } catch (err) {
    console.warn('[Chatbot] Failed to load dynamic configs for prompt:', err.message);
  }

  return `${BASE_INSTRUCTION}\n\n${dynamicContext}\n\n${roleInstruction}`;
}

// ─── Session management ──────────────────────────────────────────────────────────
const SESSION_TIMEOUT = 30 * 60 * 1000;
const sessions = new Map();

function getSession(sessionId) {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.lastActivity > SESSION_TIMEOUT) sessions.delete(id);
  }
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { history: [], lastActivity: now });
  } else {
    sessions.get(sessionId).lastActivity = now;
  }
  return sessions.get(sessionId);
}

// ─── Tool declarations per role ──────────────────────────────────────────────────

const customerTools = [
  {
    type: 'function',
    function: {
      name: 'get_branches',
      description: 'Lấy danh sách tất cả chi nhánh AutoWashPro đang hoạt động',
      parameters: { type: 'object', properties: {}, required: [] },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_packages',
      description: 'Lấy danh sách gói dịch vụ rửa xe của một chi nhánh',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID của chi nhánh' },
        }, required: ['branchId'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Kiểm tra khung giờ còn trống tại chi nhánh vào một ngày cụ thể với gói dịch vụ đã chọn',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID chi nhánh' },
          packageId: { type: 'string', description: 'ID gói dịch vụ' },
          date: { type: 'string', description: 'Ngày kiểm tra định dạng YYYY-MM-DD' },
        }, required: ['branchId', 'packageId', 'date'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_user_vehicles',
      description: 'Lấy danh sách xe của người dùng đang đăng nhập để chọn xe khi đặt lịch',
      parameters: { type: 'object', properties: {}, required: [] },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_slot_packs',
      description: 'Lấy danh sách gói lượt (slot pack) của người dùng đang đăng nhập: số lượt còn lại, chi nhánh, hạn sử dụng',
      parameters: { type: 'object', properties: {}, required: [] },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_upcoming_bookings',
      description: 'Lấy danh sách lịch đặt của người dùng đang đăng nhập. Nếu không truyền date thì lấy từ hôm nay trở đi. Nếu truyền date thì chỉ lấy đúng ngày đó.',
      parameters: {
        type: 'object', properties: {
          date: { type: 'string', description: 'Ngày cần tra cứu (YYYY-MM-DD), để trống nếu muốn xem tất cả sắp tới' },
        }, required: [],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_booking',
      description: 'Tạo lịch đặt rửa xe cho người dùng sau khi đã xác nhận đầy đủ thông tin',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID chi nhánh' },
          packageId: { type: 'string', description: 'ID gói dịch vụ' },
          vehicleId: { type: 'string', description: 'ID xe của khách hàng' },
          bookingDate: { type: 'string', description: 'Ngày đặt lịch YYYY-MM-DD' },
          startTime: { type: 'string', description: 'Giờ bắt đầu HH:mm' },
          note: { type: 'string', description: 'Ghi chú tuỳ chọn' },
        }, required: ['branchId', 'packageId', 'vehicleId', 'bookingDate', 'startTime'],
      },
    }
  },
];

const managerTools = [
  {
    type: 'function',
    function: {
      name: 'get_branches',
      description: 'Lấy thông tin chi nhánh bạn đang quản lý',
      parameters: { type: 'object', properties: {}, required: [] },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_packages',
      description: 'Xem danh sách gói dịch vụ rửa xe tại chi nhánh của bạn',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID của chi nhánh' },
        }, required: ['branchId'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_branch_bookings',
      description: 'Xem danh sách đặt lịch tại chi nhánh, có thể lọc theo ngày và trạng thái. Nếu không truyền ngày thì mặc định hôm nay.',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID chi nhánh' },
          date: { type: 'string', description: 'Ngày cần xem (YYYY-MM-DD), mặc định hôm nay' },
          status: { type: 'string', description: 'Lọc theo trạng thái: pending, confirmed, checked_in, in_progress, completed, cancelled' },
        }, required: ['branchId'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard_stats',
      description: 'Xem thống kê hôm nay của chi nhánh: số booking, check-in, doanh thu',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID chi nhánh' },
        }, required: ['branchId'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_booking_status',
      description: 'Cập nhật trạng thái một booking: checked_in (khách đã đến), in_progress (đang rửa), completed (hoàn thành), cancelled (hủy)',
      parameters: {
        type: 'object', properties: {
          bookingId: { type: 'string', description: 'ID của booking cần cập nhật' },
          status: { type: 'string', description: 'Trạng thái mới: checked_in, in_progress, completed, cancelled' },
        }, required: ['bookingId', 'status'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_customer',
      description: 'Tìm kiếm khách hàng theo tên hoặc số điện thoại',
      parameters: {
        type: 'object', properties: {
          query: { type: 'string', description: 'Tên hoặc số điện thoại khách hàng' },
        }, required: ['query'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_branch_slot_packs',
      description: 'Xem danh sách gói lượt (slot pack) đang hoạt động tại chi nhánh',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID chi nhánh' },
        }, required: ['branchId'],
      },
    }
  },
];

const adminTools = [
  {
    type: 'function',
    function: {
      name: 'get_branches',
      description: 'Lấy danh sách tất cả chi nhánh. Có thể lọc theo trạng thái hoặc tìm kiếm.',
      parameters: {
        type: 'object', properties: {
          status: { type: 'string', description: 'Lọc: active, inactive' },
          search: { type: 'string', description: 'Tìm theo tên chi nhánh' },
        }, required: [],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_branch_details',
      description: 'Xem chi tiết một chi nhánh: thông tin, quản lý, số gói dịch vụ, booking hôm nay',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID chi nhánh' },
        }, required: ['branchId'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_packages',
      description: 'Xem gói dịch vụ của một chi nhánh',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID của chi nhánh' },
        }, required: ['branchId'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_stats',
      description: 'Xem thống kê toàn hệ thống: tổng booking, doanh thu, người dùng, chi nhánh',
      parameters: { type: 'object', properties: {}, required: [] },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_all_bookings',
      description: 'Xem tất cả đặt lịch trên toàn hệ thống. Có thể lọc theo ngày, chi nhánh, trạng thái.',
      parameters: {
        type: 'object', properties: {
          date: { type: 'string', description: 'Ngày cần xem (YYYY-MM-DD)' },
          branchId: { type: 'string', description: 'Lọc theo chi nhánh' },
          status: { type: 'string', description: 'Lọc theo trạng thái: pending, confirmed, checked_in, in_progress, completed, cancelled' },
        }, required: [],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_branch_bookings',
      description: 'Xem đặt lịch của một chi nhánh cụ thể theo ngày và trạng thái',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID chi nhánh' },
          date: { type: 'string', description: 'Ngày cần xem (YYYY-MM-DD), mặc định hôm nay' },
          status: { type: 'string', description: 'Lọc theo trạng thái' },
        }, required: ['branchId'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard_stats',
      description: 'Xem thống kê hôm nay của một chi nhánh',
      parameters: {
        type: 'object', properties: {
          branchId: { type: 'string', description: 'ID chi nhánh' },
        }, required: ['branchId'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_users',
      description: 'Tìm kiếm người dùng theo tên, email hoặc số điện thoại',
      parameters: {
        type: 'object', properties: {
          query: { type: 'string', description: 'Tên, email hoặc số điện thoại' },
        }, required: ['query'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_user_status',
      description: 'Kích hoạt / vô hiệu hóa / khóa tài khoản người dùng',
      parameters: {
        type: 'object', properties: {
          userId: { type: 'string', description: 'ID người dùng' },
          status: { type: 'string', description: 'Trạng thái mới: active, inactive, suspended' },
        }, required: ['userId', 'status'],
      },
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_customer',
      description: 'Tìm kiếm khách hàng theo tên hoặc số điện thoại',
      parameters: {
        type: 'object', properties: {
          query: { type: 'string', description: 'Tên hoặc số điện thoại' },
        }, required: ['query'],
      },
    }
  },
];

function getToolsForRole(role) {
  switch (role) {
    case 'admin': return adminTools;
    case 'manager': return managerTools;
    case 'customer': return customerTools;
    default: return customerTools;
  }
}

// ─── Tool executor (role-aware) ──────────────────────────────────────────────────

async function executeTool(name, args, userId, role) {
  const isCustomer = role === 'customer' || !role;
  const isManager = role === 'manager';
  const isAdmin = role === 'admin';

  switch (name) {
    // ── Shared: get_branches ──
    case 'get_branches': {
      if (isCustomer) {
        const result = await branchService.getAllBranches({ status: 'active' });
        const branches = result.data || result;
        return {
          pageUrls: FE_PAGES,
          branches: branches.map(b => ({
            id: String(b._id), name: b.name, address: b.address,
            phone: b.phone || '', openingTime: b.openingTime || '07:00', closingTime: b.closingTime || '20:00',
          })),
        };
      }
      if (isManager) {
        const result = await branchService.getAllBranches({}, { id: userId, role: 'manager' });
        const branches = result.data || result;
        return branches.map(b => ({
          id: String(b._id), name: b.name, address: b.address,
          phone: b.phone || '', openingTime: b.openingTime || '07:00', closingTime: b.closingTime || '20:00',
          status: b.status, managerName: b.managerId?.name || '',
        }));
      }
      // Admin
      const filter = {};
      if (args.status) filter.status = args.status;
      if (args.search) filter.search = args.search;
      const result = await branchService.getAllBranches(filter, { id: userId, role: 'admin' });
      const branches = result.data || result;
      return branches.map(b => ({
        id: String(b._id), name: b.name, address: b.address,
        phone: b.phone || '', status: b.status || 'active',
        openingTime: b.openingTime || '07:00', closingTime: b.closingTime || '20:00',
        managerName: b.managerId?.name || '', managerId: String(b.managerId?._id || ''),
      }));
    }

    // ── Shared: get_packages ──
    case 'get_packages': {
      const result = await packageService.getAllPackages({ branchId: args.branchId, status: 'active' });
      const pkgs = result.data || result;
      return pkgs.map(p => ({
        id: String(p._id), name: p.name, price: p.price, duration: p.duration, description: p.description || '',
      }));
    }

    // ── Customer-only tools ──
    case 'check_availability': {
      if (!isCustomer) return { error: 'Công cụ này chỉ dành cho khách hàng' };
      const slots = await bookingService.getAvailableSlots(args.branchId, args.date, args.packageId);
      const available = slots.filter(s => s.available);
      if (available.length === 0) return { message: 'Không còn khung giờ trống trong ngày này' };
      return available.map(s => ({ startTime: s.startTime, endTime: s.endTime, vipOnly: !!s.vipOnly }));
    }

    case 'get_user_vehicles': {
      if (!isCustomer) return { error: 'Công cụ này chỉ dành cho khách hàng' };
      if (!userId) return { error: 'Chưa đăng nhập' };
      const vehicles = await Vehicle.find({ userId });
      if (!vehicles.length) return { message: 'Bạn chưa có xe nào. Vui lòng thêm xe trong hồ sơ trước.' };
      return vehicles.map(v => ({
        id: String(v._id), licensePlate: v.licensePlate, vehicleType: v.vehicleType,
        brand: v.brand || '', color: v.color || '',
      }));
    }

    case 'create_booking': {
      if (!isCustomer) return { error: 'Công cụ này chỉ dành cho khách hàng' };
      if (!userId) return { error: 'Bạn cần đăng nhập để đặt lịch' };
      const booking = await bookingService.createBooking({ ...args, userId });
      return {
        success: true, bookingId: String(booking._id),
        startTime: booking.startTime, endTime: booking.endTime,
        date: new Date(booking.bookingDate).toLocaleDateString('vi-VN'),
        finalPrice: booking.finalPrice,
      };
    }

    // ── Manager/Admin: get_branch_bookings ──
    case 'get_branch_bookings': {
      if (isCustomer) return { error: 'Công cụ này chỉ dành cho quản lý và admin' };
      const STATUS_VI = {
        pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', checked_in: 'Đã check-in',
        in_progress: 'Đang thực hiện', completed: 'Đã hoàn thành', cancelled: 'Đã hủy',
      };
      const filters = {
        branchId: args.branchId,
        status: args.status || undefined,
        bookingDate: args.date || new Date().toISOString().split('T')[0],
        limit: '20',
      };
      const bookings = await bookingService.getAllBookings(filters, role, userId);
      const list = bookings?.bookings || bookings?.data || [];
      return list.map(b => ({
        id: String(b._id), customerName: b.userId?.name || '',
        phone: b.userId?.phone || '', licensePlate: b.vehicleId?.licensePlate || '',
        packageName: b.packageId?.name || '', startTime: b.startTime, endTime: b.endTime,
        status: STATUS_VI[b.status] || b.status, finalPrice: b.finalPrice, bookingDate: b.bookingDate,
      }));
    }

    // ── Manager/Admin: get_dashboard_stats ──
    case 'get_dashboard_stats': {
      if (isCustomer) return { error: 'Công cụ này chỉ dành cho quản lý và admin' };
      const today = new Date().toISOString().split('T')[0];
      const filters = { branchId: args.branchId, bookingDate: today, limit: '100' };
      const bookings = await bookingService.getAllBookings(filters, role, userId);
      const list = bookings?.bookings || bookings?.data || [];
      const total = list.length;
      const checkedIn = list.filter(b => b.status === 'checked_in').length;
      const inProgress = list.filter(b => b.status === 'in_progress').length;
      const completed = list.filter(b => b.status === 'completed').length;
      const pending = list.filter(b => b.status === 'pending' || b.status === 'confirmed').length;
      const revenue = list.filter(b => b.status === 'completed').reduce((sum, b) => sum + (b.finalPrice || 0), 0);
      return {
        date: today, totalBookings: total, checkedIn, inProgress, completed, pending,
        totalRevenue: revenue, branchId: args.branchId,
      };
    }

    // ── Manager/Admin: update_booking_status ──
    case 'update_booking_status': {
      if (isCustomer) return { error: 'Công cụ này chỉ dành cho quản lý và admin' };
      const branch = isManager ? await Branch.findOne({ managerId: userId }) : null;
      const branchId = isManager ? (branch?._id?.toString() || null) : null;
      const updated = await bookingService.updateBookingStatus(args.bookingId, args.status, {}, role, branchId);
      return {
        success: true, bookingId: String(updated._id),
        status: updated.status, message: `Đã cập nhật trạng thái thành: ${updated.status}`,
      };
    }

    // ── Manager/Admin: search_customer ──
    case 'search_customer': {
      if (isCustomer) return { error: 'Công cụ này chỉ dành cho quản lý và admin' };
      const re = new RegExp(args.query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const users = await User.find({
        $or: [{ name: re }, { phone: re }],
        role: 'customer',
        isDeleted: { $ne: true },
      }).limit(10).select('name email phone tier loyaltyPoints status');
      return users.map(u => ({
        id: String(u._id), name: u.name, email: u.email,
        phone: u.phone || '', tier: u.tier, loyaltyPoints: u.loyaltyPoints, status: u.status,
      }));
    }

    // ── Customer: get_my_upcoming_bookings ──
    case 'get_my_upcoming_bookings': {
      if (!isCustomer) return { error: 'Công cụ này chỉ dành cho khách hàng' };
      if (!userId) return { error: 'Chưa đăng nhập' };
      const today = new Date().toISOString().split('T')[0];
      const filters = {
        status: ['pending', 'confirmed'],
        limit: '10',
      };
      if (args.date) {
        filters.bookingDate = args.date;
      } else {
        filters.dateFrom = today;
      }
      const bookings = await bookingService.getAllBookings(filters, 'customer', userId);
      const list = bookings?.bookings || bookings?.data || [];
      const prefix = args.date ? 'ngày ' + new Date(args.date).toLocaleDateString('vi-VN') : 'sắp tới';
      if (!list.length) return { message: `Bạn không có lịch đặt ${prefix} nào.` };
      const STATUS_VI = {
        pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', checked_in: 'Đã check-in',
        in_progress: 'Đang thực hiện', completed: 'Đã hoàn thành', cancelled: 'Đã hủy',
      };
      return list.map(b => ({
        id: String(b._id),
        branchName: b.branchId?.name || '',
        packageName: b.packageName || b.packageId?.name || '',
        licensePlate: b.vehicleId?.licensePlate || '',
        bookingDate: b.bookingDate ? new Date(b.bookingDate).toLocaleDateString('vi-VN') : '',
        startTime: b.startTime,
        endTime: b.endTime,
        status: STATUS_VI[b.status] || b.status,
        finalPrice: b.finalPrice,
        bookingType: b.bookingType || 'single',
        historyUrl: `${FE_URL}/history?bookingId=${b._id}`,
        mobileDeepLink: `${MOBILE_DEEPLINK}://booking/${b._id}`,
      }));
    }

    // ── Customer: get_my_slot_packs ──
    case 'get_my_slot_packs': {
      if (!isCustomer) return { error: 'Công cụ này chỉ dành cho khách hàng' };
      if (!userId) return { error: 'Chưa đăng nhập' };
      const packs = await slotPackService.getMySlotPacks(userId);
      if (!packs || packs.length === 0) return { message: 'Bạn chưa có gói lượt nào.' };
      return packs.map(sp => ({
        id: String(sp._id), packCode: sp.packCode || '',
        branchName: sp.branchId?.name || '', branchAddress: sp.branchId?.address || '',
        packageName: sp.packageName || sp.packageId?.name || '', packagePrice: sp.unitPrice ?? sp.packageId?.price ?? 0,
        totalSlots: sp.totalSlots, remainingSlots: sp.remainingSlots || 0,
        usedSlots: (sp.totalSlots || 0) - (sp.remainingSlots || 0),
        status: sp.status, expiresAt: sp.expiresAt,
        createdAt: sp.createdAt,
      }));
    }

    // ── Manager/Admin: get_branch_slot_packs ──
    case 'get_branch_slot_packs': {
      if (isCustomer) return { error: 'Công cụ này chỉ dành cho quản lý và admin' };
      const slotPacks = await SlotPack.find({
        branchId: args.branchId,
        isDeleted: { $ne: true },
      }).populate('userId', 'name phone').sort({ createdAt: -1 }).limit(20);
      return slotPacks.map(sp => ({
        id: String(sp._id), customerName: sp.userId?.name || '',
        customerPhone: sp.userId?.phone || '', remainingSlots: sp.remainingSlots || 0,
        totalSlots: sp.totalSlots, status: sp.status, expiresAt: sp.expiresAt,
        packCode: sp.packCode || '',
      }));
    }

    // ── Admin-only tools ──
    case 'get_branch_details': {
      if (!isAdmin) return { error: 'Công cụ này chỉ dành cho admin' };
      const branch = await Branch.findById(args.branchId)
        .populate('managerId', 'name email phone');
      if (!branch) return { error: 'Chi nhánh không tồn tại' };
      const today = new Date().toISOString().split('T')[0];
      const bookingCount = await Booking.countDocuments({
        branchId: args.branchId,
        bookingDate: { $gte: new Date(today + 'T00:00:00.000Z'), $lte: new Date(today + 'T23:59:59.999Z') },
      });
      const packageCount = await Package.countDocuments({ branchId: args.branchId, isDeleted: { $ne: true } });
      return {
        id: String(branch._id), name: branch.name, address: branch.address,
        phone: branch.phone || '', status: branch.status,
        openingTime: branch.openingTime || '07:00', closingTime: branch.closingTime || '20:00',
        manager: branch.managerId ? { name: branch.managerId.name, email: branch.managerId.email, phone: branch.managerId.phone } : null,
        todayBookings: bookingCount, totalPackages: packageCount,
      };
    }

    case 'get_system_stats': {
      if (!isAdmin) return { error: 'Công cụ này chỉ dành cho admin' };
      const today = new Date().toISOString().split('T')[0];
      const [totalBranches, totalUsers, totalCustomers, totalManagers, totalAdmins, todayBookings, todayRevenue, totalBookings] = await Promise.all([
        Branch.countDocuments({ isDeleted: { $ne: true } }),
        User.countDocuments({ isDeleted: { $ne: true } }),
        User.countDocuments({ role: 'customer', isDeleted: { $ne: true } }),
        User.countDocuments({ role: 'manager', isDeleted: { $ne: true } }),
        User.countDocuments({ role: 'admin', isDeleted: { $ne: true } }),
        Booking.countDocuments({
          bookingDate: { $gte: new Date(today + 'T00:00:00.000Z'), $lte: new Date(today + 'T23:59:59.999Z') },
        }),
        Booking.aggregate([
          { $match: { bookingDate: { $gte: new Date(today + 'T00:00:00.000Z'), $lte: new Date(today + 'T23:59:59.999Z') }, status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$finalPrice' } } },
        ]),
        Booking.countDocuments({}),
      ]);
      return {
        totalBranches, totalUsers: { all: totalUsers, customers: totalCustomers, managers: totalManagers, admins: totalAdmins },
        todayBookings, todayRevenue: todayRevenue[0]?.total || 0, totalBookings,
        date: today,
      };
    }

    case 'get_all_bookings': {
      if (!isAdmin) return { error: 'Công cụ này chỉ dành cho admin' };
      const STATUS_VI = {
        pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', checked_in: 'Đã check-in',
        in_progress: 'Đang thực hiện', completed: 'Đã hoàn thành', cancelled: 'Đã hủy',
      };
      const filters = {
        status: args.status || undefined,
        branchId: args.branchId || undefined,
        bookingDate: args.date || undefined,
        limit: '20',
      };
      const bookings = await bookingService.getAllBookings(filters, role, userId);
      const list = bookings?.bookings || bookings?.data || [];
      return list.map(b => ({
        id: String(b._id), customerName: b.userId?.name || '', customerPhone: b.userId?.phone || '',
        branchName: b.branchId?.name || '', packageName: b.packageId?.name || '',
        licensePlate: b.vehicleId?.licensePlate || '',
        startTime: b.startTime, endTime: b.endTime,
        status: STATUS_VI[b.status] || b.status, finalPrice: b.finalPrice, bookingDate: b.bookingDate,
        bookingType: b.bookingType,
      }));
    }

    case 'search_users': {
      if (!isAdmin) return { error: 'Công cụ này chỉ dành cho admin' };
      const re = new RegExp(args.query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const users = await User.find({
        $or: [{ name: re }, { email: re }, { phone: re }],
        isDeleted: { $ne: true },
      }).limit(10).select('name email phone role status tier loyaltyPoints');
      return users.map(u => ({
        id: String(u._id), name: u.name, email: u.email,
        phone: u.phone || '', role: u.role, status: u.status,
        tier: u.tier, loyaltyPoints: u.loyaltyPoints,
      }));
    }

    case 'manage_user_status': {
      if (!isAdmin) return { error: 'Công cụ này chỉ dành cho admin' };
      const validStatuses = ['active', 'inactive', 'suspended'];
      if (!validStatuses.includes(args.status)) return { error: `Trạng thái không hợp lệ. Chấp nhận: ${validStatuses.join(', ')}` };
      const user = await User.findByIdAndUpdate(args.userId, { status: args.status }, { new: true });
      if (!user) return { error: 'Người dùng không tồn tại' };
      return { success: true, userId: String(user._id), name: user.name, status: user.status };
    }

    default:
      return { error: `Công cụ không tồn tại: ${name}` };
  }
}

// ─── Error classifier ──────────────────────────────────────────────────────────
function classifyError(err) {
  const raw = err?.message || '';
  const status = err?.status || err?.code || 0;
  if (status === 429 || raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('quota')) {
    if (raw.includes('prepayment') || raw.includes('credits are depleted') || raw.includes('billing')) {
      return Object.assign(new Error('Dịch vụ AI tạm thời không khả dụng do hết credit.'), { statusCode: 503 });
    }
    return Object.assign(new Error('Chatbot đang bận, vui lòng thử lại sau ít giây.'), { statusCode: 429 });
  }
  if (status === 402 || raw.includes('402') || raw.includes('credits') || raw.includes('Insufficient balance')) {
    return Object.assign(new Error('Tài khoản AI đã hết credit. Vui lòng nạp thêm.'), { statusCode: 402 });
  }
  if (status === 401 || status === 403 || raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
    return Object.assign(new Error('Cấu hình chatbot không hợp lệ. Vui lòng liên hệ quản trị viên.'), { statusCode: 503 });
  }
  if (raw.includes('NOT_FOUND') || raw.includes('not found')) {
    return Object.assign(new Error('Model AI không tồn tại hoặc chưa được kích hoạt.'), { statusCode: 503 });
  }
  console.error('[Chatbot] API error:', raw);
  return Object.assign(new Error('Chatbot gặp sự cố. Vui lòng thử lại sau.'), { statusCode: 503 });
}

// ─── Resolve tool calls (shared between chat & stream) ────────────────────────
async function resolveToolCalls(openai, modelName, session, userId, role) {
  const systemPrompt = await composeSystemPrompt(role);
  const tools = getToolsForRole(role);
  for (let i = 0; i < 5; i++) {
    const messages = [{ role: 'system', content: systemPrompt }, ...session.history];
    const response = await createCompletionWithFallback({
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 1024,
    });

    const responseMessage = response.choices?.[0]?.message;
    if (!responseMessage) return null;

    const toolCalls = responseMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      const replyText = (responseMessage.content || '').trim();
      session.history.push({ role: 'assistant', content: replyText });
      return { done: true, reply: replyText };
    }

    session.history.push(responseMessage);
    for (const toolCall of toolCalls) {
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch {}
      const result = await executeTool(toolCall.function.name, args, userId, role).catch(err => ({ error: err.message }));
      session.history.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content: JSON.stringify(result),
      });
    }
  }
  return null;
}

// ─── Standard (non-streaming) chat ───────────────────────────────────────────
exports.chat = async (sessionId, message, userId, role = 'customer') => {
  const { openai, modelName } = getOpenAI();
  const session = getSession(sessionId);

  const todayDate = new Date().toISOString().split('T')[0];
  const userText = session.history.length === 0
    ? `[Hôm nay: ${todayDate}][isLoggedIn: ${!!userId}][role: ${role}]\n${message}`
    : message;
  session.history.push({ role: 'user', content: userText });

  try {
    const result = await resolveToolCalls(openai, modelName, session, userId, role);
    return { reply: result?.reply || 'Xin lỗi, đã xảy ra lỗi xử lý. Vui lòng thử lại.' };
  } catch (err) {
    throw classifyError(err);
  }
};

// ─── Streaming chat (SSE) ─────────────────────────────────────────────────────
exports.streamChat = async (sessionId, message, userId, role, res) => {
  const { openai, modelName } = getOpenAI();
  const session = getSession(sessionId);
  const systemPrompt = await composeSystemPrompt(role);
  const tools = getToolsForRole(role);

  const todayDate = new Date().toISOString().split('T')[0];
  const userText = session.history.length === 0
    ? `[Hôm nay: ${todayDate}][isLoggedIn: ${!!userId}][role: ${role}]\n${message}`
    : message;
  session.history.push({ role: 'user', content: userText });

  const send = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  try {
    // Step 1: Resolve all tool calls synchronously (non-streaming)
    for (let i = 0; i < 5; i++) {
      const messages = [{ role: 'system', content: systemPrompt }, ...session.history];
      const response = await createCompletionWithFallback({
        messages,
        tools,
        tool_choice: 'auto',
        max_tokens: 1024,
      });

      const responseMessage = response.choices?.[0]?.message;
      if (!responseMessage) break;

      const toolCalls = responseMessage.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        break;
      }

      send({ type: 'thinking' });

      session.history.push(responseMessage);
      for (const toolCall of toolCalls) {
        let args = {};
        try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch {}
        const result = await executeTool(toolCall.function.name, args, userId, role).catch(err => ({ error: err.message }));
        session.history.push({
          role: 'tool', tool_call_id: toolCall.id,
          name: toolCall.function.name, content: JSON.stringify(result),
        });
      }
    }

    // Step 2: Stream the final text response
    const finalMessages = [{ role: 'system', content: systemPrompt }, ...session.history];
    let stream;
    try {
      const primary = getOpenAIClient();
      if (primary.openai && primary.modelName) {
        stream = await primary.openai.chat.completions.create({
          model: primary.modelName,
          messages: finalMessages,
          stream: true,
          max_tokens: 1024,
        });
      } else {
        throw new Error('Primary AI client not configured');
      }
    } catch (streamErr) {
      console.warn(`[CHATBOT FALLBACK Stream] Primary error (${streamErr.message}). Switching to Groq API...`);
      const groq = getGroqClient();
      stream = await groq.openai.chat.completions.create({
        model: groq.modelName,
        messages: finalMessages,
        stream: true,
        max_tokens: 1024,
      });
    }

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      if (delta) {
        fullText += delta;
        send({ type: 'token', token: delta });
      }
    }

    if (fullText) {
      session.history.push({ role: 'assistant', content: fullText });
    }

    send({ type: 'done' });
  } catch (err) {
    const classified = classifyError(err);
    send({ type: 'error', message: classified.message });
  } finally {
    res.end();
  }
};

exports.clearSession = (sessionId) => sessions.delete(sessionId);
