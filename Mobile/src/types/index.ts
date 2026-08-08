/**
 * AutoWashPro TypeScript Types
 * All type definitions for the app
 */

// ============ User Types ============
export type UserTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: 'customer' | 'manager' | 'admin';
  status: 'active' | 'inactive' | 'suspended';
  loyaltyPoints: number;
  lifetimePoints: number;
  walletBalance: number;
  tier: UserTier;
  dateOfBirth?: string;
  branchId?: string;
  pointsExpiresAt?: string;
  noShowCount?: number;
  spinCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// ============ Vehicle Types ============
export type VehicleType = 'sedan' | 'suv' | 'pickup' | 'van';

export interface Vehicle {
  _id: string;
  userId: string;
  licensePlate: string;
  vehicleType: VehicleType;
  brand: string;
  model?: string;
  color: string;
  year?: number;
  imageUrl?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleRequest {
  licensePlate: string;
  vehicleType: VehicleType;
  brand: string;
  model?: string;
  color: string;
  year?: number;
  imageUrl?: string;
  isDefault?: boolean;
}

// ============ Branch Types ============
export interface Branch {
  _id: string;
  name: string;
  city?: string;
  address: string;
  phone?: string;
  email?: string;
  openingTime: string;
  closingTime: string;
  status: 'active' | 'inactive';
  image?: string;
  description?: string;
  location?: {
    type: 'Point';
    coordinates: [number, number];
  };
  managerId?: string;
  mapCoordinates?: {
    svgCx?: number;
    svgCy?: number;
  };
  createdAt: string;
  updatedAt: string;
}

// ============ Package Types ============
export type PackageCategory = 'external' | 'internal' | 'full';

export interface SubService {
  name: string;
  price: number;
  duration?: number;
  isOptional: boolean;
}

export interface Package {
  _id: string;
  name: string;
  description?: string;
  price: number;
  duration: number; // minutes
  image?: string;
  status: 'active' | 'inactive';
  category: PackageCategory;
  vehicleTypes: VehicleType[];
  subServices?: SubService[];
  branchId?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============ Booking Types ============
export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'in_progress' | 'awaiting_payment' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'paid' | 'refunded';

export interface Booking {
  _id: string;
  userId: string;
  branchId: string | Branch;
  packageId: string | Package;
  vehicleId: string | Vehicle;
  bookingDate: string;
  startTime: string;
  endTime?: string;
  // Human-readable code (vd: BK-2024-001234) — dùng cho UX.
  bookingCode?: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  note?: string;
  subServices?: SubService[];
  selectedSubServices?: (SubService | string)[];
  packageName?: string;
  packageDuration?: number;
  packagePrice?: number;
  voucherCode?: string;
  discountAmount?: number;
  // Giá gói gốc trước khi subService + voucher.
  basePrice?: number;
  // Phụ phí subService optional.
  extraPrice?: number;
  // Giá cuối sau khi cộng extraPrice - trừ discount.
  finalPrice: number;
  // finalPrice - discountAmount (nếu có subService + voucher cùng lúc).
  finalPriceAfterVoucher?: number;
  totalPrice?: number; // alias kept for legacy callers
  qrCode?: string;
  rating?: number;
  feedback?: string;
  feedbackAt?: string;
  reply?: string;
  managerReply?: string;
  managerReplyAt?: string;
  isRecurring?: boolean;
  recurringGroupId?: string;
  isRecurringFirst?: boolean;
  recurringPosition?: number;
  recurringTotal?: number;
  bookingType?: 'single' | 'recurring' | 'slot_pack_usage';
  confirmedAt?: string;
  cancelledAt?: string;
  cancelledBy?: 'customer' | 'admin' | 'manager' | 'system';
  cancellationReason?: string;
  rescheduleCount?: number;
  lateWarningSentAt?: string;
  suggestedSlotStartTime?: string;
  graceExtensionMinutes?: number;
  priority?: number;
  slotPackId?: string;
  paidAt?: string;
  depositPaidAt?: string;
  checkInTime?: string;
  checkOutTime?: string;
  serviceDuration?: number;
  staffId?: string;
  rebookedFromId?: string;
  // Số tiền cọc cần thu (30% × finalPrice). BE tự tính; FE hiển thị.
  depositAmount?: number;
  // Đã cọc hay chưa — guard để biết có cần chặn "Đặt lại" hay không.
  depositPaid?: boolean;
  // Phương thức thanh toán đã dùng (cash/momo/vnpay).
  paymentMethod?: PaymentMethod;
  // Legacy alias — tránh phá callers cũ (chỉ một số màn dùng).
  deposit?: number;
  // H-5: soft delete fields
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: 'admin' | 'system' | 'migration';
  // Refund tracking
  refundAmount?: number;
  refundStatus?: 'pending' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingRequest {
  branchId: string;
  packageId: string;
  vehicleId: string;
  bookingDate: string;
  startTime: string;
  note?: string;
  voucherCode?: string;
  subServices?: string[];
  selectedSubServices?: string[];
  slotPackId?: string;
  discountAmount?: number;
  finalPrice?: number;
}

export interface CreateRecurringBookingRequest {
  branchId: string;
  packageId: string;
  vehicleId: string;
  weekdays: number[]; // 0-6, Sunday = 0
  startTime: string; // HH:mm
  weeks: number; // 1-12
  note?: string;
  voucherCode?: string;
}

export interface RecurringBookingResult {
  recurringGroupId: string;
  totalCreated: number;
  totalFailed: number;
  created: Booking[];
  failed: { date: string; reason: string }[];
}

export interface RecurringConfig {
  weekdays: number[];
  startTime: string;
  weeks: number;
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  available: boolean;
  vipOnly?: boolean;
}

// ============ Payment Types ============
export type PaymentMethod = 'cash' | 'momo' | 'vnpay' | 'bank' | 'wallet' | 'sepay';
export type PaymentType = 'deposit' | 'remaining' | 'full';

export interface Payment {
  _id: string;
  bookingId: string | Booking;
  userId: string;
  amount: number;
  method: PaymentMethod;
  type: PaymentType;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  transactionId?: string;
  // Base64 data URL của QR code (cash/bank) — FE render bằng <Image>.
  qrCode?: string;
  // Gateway redirect URL (MoMo/VNPay) — FE dùng WebView/Linking.
  paymentUrl?: string;
  bankInfo?: {
    bankName?: string;
    bankId?: string;
    accountNumber?: string;
    accountHolder?: string;
    transferContent?: string;
  };
  paidAt?: string;
  refundedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentRequest {
  bookingId: string;
  paymentMethod: PaymentMethod;
  type?: PaymentType;
}

// Re-export SubService as a named type so other modules can reuse it
export type { SubService as SubServiceItem };

// ============ Stat / Public Types (extra) ============
export interface ChatSessionMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ChatHistoryItem {
  _id: string;
  userId?: string;
  sessionId: string;
  messages: ChatSessionMessage[];
  createdAt: string;
  updatedAt: string;
}

// ============ Voucher Types ============
export type VoucherType = 'percentage' | 'fixed';

export interface Voucher {
  _id: string;
  code: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed';
  value: number;
  maxDiscount?: number;
  minOrder?: number;
  quantity?: number;
  remaining?: number;
  startDate: string;
  endDate: string;
  applicablePackages?: string[];
  applicableBranches?: string[];
  applicableToAllPackages?: boolean;
  applicableToAllBranches?: boolean;
  status: 'active' | 'inactive';
  branchId?: string;
  maxUsagePerUser?: number;
  requiredPoints?: number;
  applicableTiers?: ('bronze' | 'silver' | 'gold' | 'diamond')[];
  isBirthdayVoucher?: boolean;
  isTemplate?: boolean;
  assignedTo?: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserVoucher extends Voucher {
  voucherId?: Voucher | string;
  isUsed?: boolean;
  usedAt?: string;
  bookingId?: string;
  discountAmount?: number;
}

export interface ValidateVoucherRequest {
  code: string;
  bookingData?: {
    packageId?: string;
    branchId?: string;
    amount?: number;
  };
}

export interface ReserveVoucherRequest {
  code: string;
  bookingId: string;
  discountAmount?: number;
}

// ============ Slot Pack Types ============
export interface SlotPack {
  _id: string;
  userId: string;
  branchId: string | Branch;
  packageId: string | Package;
  vehicleId: string | Vehicle;
  totalSlots: number;
  remainingSlots: number;
  usedSlots: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  finalPrice: number;
  voucherCode?: string;
  voucherDiscount?: number;
  finalPriceAfterVoucher?: number;
  priority: number;
  packCode: string;
  expiresAt?: string;
  status: 'pending' | 'active' | 'exhausted' | 'expired' | 'cancelled';
  paymentStatus: 'unpaid' | 'paid';
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSlotPackRequest {
  branchId: string;
  packageId: string;
  vehicleId: string;
  totalSlots: number;
  voucherCode?: string;
  expiresAt?: string;
}

// ============ Notification Types ============
export type NotificationType = 
  | 'booking_created'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_cancelled_system'
  | 'booking_completed'
  | 'booking_reminder'
  | 'booking_at_risk'
  | 'booking_grace_extended'
  | 'payment_received'
  | 'payment_confirmed'
  | 'payment_success'
  | 'refund'
  | 'voucher'
  | 'voucher_expiring'
  | 'points_earned'
  | 'promotion'
  | 'profile_updated'
  | 'vehicle_added'
  | 'wallet_transaction'
  | 'system';

export interface Notification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  data?: Record<string, any>;
  createdAt: string;
}

// ============ Public Types ============
export interface PublicStats {
  totalBookings: number;
  totalCustomers: number;
  totalBranches: number;
  averageRating: number;
}

export interface Gift {
  _id: string;
  id?: string;
  name: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'none';
  value: number;
  probability: number;
  color: string;
  status: 'active' | 'inactive';
  sortOrder: number;
}

export interface PointHistory {
  _id: string;
  userId: string;
  points: number;
  type: 'earned' | 'redeemed' | 'expired' | 'adjustment';
  description: string;
  referenceId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhysicalReward {
  _id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  pointCost: number;
  stock: number;
  requiredTier: UserTier;
  status: 'active' | 'inactive';
}

export interface Redemption {
  _id: string;
  rewardSnapshot: {
    name: string;
    imageUrl?: string;
    pointCost: number;
    requiredTier: UserTier;
  };
  code: string;
  pointsSpent: number;
  status: 'claimed' | 'sent' | 'received' | 'cancelled';
  createdAt: string;
}

export interface SlotProduct {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  slots: number;
  discount: number;
  originalPrice: number;
  finalPrice: number;
  status: 'active' | 'inactive';
}

export interface Testimonial {
  _id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  comment: string;
  reply?: string;
  bookingId?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// ============ API Response Types ============
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// ============ Error Types ============
export interface ApiError {
  message: string;
  errors?: Record<string, string>;
  code?: string;
}
