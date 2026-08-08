import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Copy, Check, Sun, Sunset, X, AlertCircle, Clock } from 'lucide-react';
import { showToast } from '@/lib/toast';
import useSSE from '@/hooks/useSSE';
import CustomerPagination from '@/components/ui/CustomerPagination';
import CustomerBookingDetail from './CustomerBookingDetail.jsx';
import QuickBookModal from '../../widgets/QuickBookModal.jsx';
import VoucherPicker from '../../../VoucherPicker.jsx';
import { useSystemConfig } from '@/hooks/useSystemConfig';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const STATUS_MAP = {
  pending:          { label: 'Chờ xử lý',   cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  confirmed:        { label: 'Đã xác nhận', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  checked_in:       { label: 'Đã check-in', cls: 'bg-sky-50 text-sky-600 border-sky-200' },
  in_progress:      { label: 'Đang rửa',    cls: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  awaiting_payment: { label: 'Chờ thanh toán', cls: 'bg-orange-50 text-orange-600 border-orange-200' },
  completed:        { label: 'Hoàn thành',  cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  cancelled:        { label: 'Đã hủy',      cls: 'bg-red-50 text-red-500 border-red-200' },
  paid:             { label: 'Đã thanh toán', cls: 'bg-green-50 text-green-600 border-green-200' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'awaiting_payment', label: 'Chờ thanh toán' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
];

const DAYS_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS_VN = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

function formatCurrency(v) { return `${new Intl.NumberFormat('vi-VN').format(v || 0)}đ`; }
function formatDate(d) { return new Date(d).toLocaleDateString('vi-VN'); }
function formatDateTime(d) { return new Date(d).toLocaleDateString('vi-VN') + ' ' + new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }

function isSameDay(d1, d2) {
  const a = new Date(d1), b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y, m) { return new Date(y, m, 1).getDay(); }
function localDateKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const RATING_LABELS = {
    1: '😞 Chưa hài lòng',
    2: '😐 Cần cải thiện',
    3: '🙂 Bình thường',
    4: '😊 Tốt & Hài lòng',
    5: '🌟 Xuất sắc & Tuyệt vời!',
  };
  const activeRating = hover || value;

  return (
    <div className="flex flex-col items-center gap-2 my-2">
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center text-2xl transition-all duration-150 transform hover:scale-110 active:scale-95 cursor-pointer ${
              s <= activeRating
                ? 'text-amber-400 bg-amber-50 shadow-xs border border-amber-200'
                : 'text-slate-300 bg-slate-50 hover:bg-slate-100 hover:text-amber-300 border border-slate-100'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <div className="h-6 flex items-center justify-center">
        {activeRating > 0 ? (
          <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-200/80 animate-in fade-in zoom-in-95 duration-100">
            {RATING_LABELS[activeRating]}
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-400">Chọn mức độ hài lòng của bạn</span>
        )}
      </div>
    </div>
  );
}

const PACK_STATUS_MAP = {
  active: { label: 'Còn hiệu lực', color: '#10b981', bg: '#ecfdf5' },
  exhausted: { label: 'Đã dùng hết', color: '#6b7280', bg: '#f9fafb' },
  expired: { label: 'Hết hạn', color: '#ef4444', bg: '#fef2f2' },
  cancelled: { label: 'Đã hủy', color: '#94a3b8', bg: '#f1f5f9' },
};

function SlotMeter({ total, remaining }) {
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const color = pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>Còn lại</span>
        <span className="font-bold">{remaining}/{total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PackCard({ pack, onQuickBook, onCancelPack, apiBase, token }) {
  const st = PACK_STATUS_MAP[pack.status] || { label: pack.status, color: '#6b7280', bg: '#f9fafb' };
  const pkg = pack.packageId;
  const branch = pack.branchId;
  const canQuickBook = pack.status === 'active' && pack.remainingSlots > 0 && pack.paymentStatus === 'paid';
  const canCancel = pack.status === 'active';

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!showHistory || !pack._id || !token) return;
    setHistoryLoading(true);
    fetch(`${apiBase}/slot-packs/${pack._id}/usage-history`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(payload => {
        const data = payload?.data || payload;
        setHistory(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error('Lỗi khi fetch lịch sử gói lượt:', err);
        setHistory([]);
      })
      .finally(() => setHistoryLoading(false));
  }, [showHistory, pack._id, apiBase, token]);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 transition-all hover:shadow-md ${pack.status !== 'active' ? 'opacity-60' : ''}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="font-mono text-xs font-bold text-slate-900 tracking-wider">{pack.packCode}</div>
          <div className="text-sm font-bold text-slate-900 mt-1">{pkg?.name || 'Gói dịch vụ'}</div>
          <div className="text-xs text-slate-400 mt-0.5">📍 {branch?.name || 'Áp dụng toàn hệ thống'}</div>
        </div>
        <div className="flex items-center gap-2">
          {pack.discountPercent > 0 && (
            <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
              -{pack.discountPercent}%
            </span>
          )}
          <span className="text-[11px] font-bold rounded-full px-2.5 py-0.5" style={{ color: st.color, background: st.bg }}>
            {st.label}
          </span>
        </div>
      </div>
      <SlotMeter total={pack.totalSlots} remaining={pack.remainingSlots} />
      <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
        {[
          { label: 'Giá gói', value: formatCurrency(pack.finalPriceAfterVoucher ?? pack.finalPrice) },
          { label: 'Đã dùng', value: `${pack.usedSlots} lần` },
          { label: 'Hết hạn', value: pack.expiresAt ? new Date(pack.expiresAt).toLocaleDateString('vi-VN') : '—' },
          { label: 'Thanh toán', value: pack.paymentStatus === 'paid' ? '✓ Đã TT' : '⏳ Chờ TT', highlight: pack.paymentStatus === 'paid' },
        ].map(r => (
          <div key={r.label}>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{r.label}</div>
            <div className={`text-xs font-bold mt-0.5 ${r.highlight ? 'text-emerald-600' : 'text-slate-900'}`}>{r.value}</div>
          </div>
        ))}
      </div>
      {pack.voucherCode && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
          🏷 {pack.voucherCode} — tiết kiệm thêm {formatCurrency(pack.voucherDiscount)}
        </div>
      )}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <div>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <Clock size={12} />
            Lịch sử
          </button>
        </div>
        <div className="flex items-center gap-2">
          {canQuickBook && onQuickBook && (
            <button
              type="button"
              onClick={() => onQuickBook(pack)}
              className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              ⚡ Đặt lịch nhanh
            </button>
          )}
          {canCancel && onCancelPack && (
            <button
              type="button"
              onClick={() => onCancelPack(pack)}
              className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold transition-colors"
            >
              Hủy gói
            </button>
          )}
        </div>
      </div>

      {/* Usage History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-[10006] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl relative border border-slate-100 text-slate-900 text-left"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Clock size={16} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Lịch sử sử dụng gói lượt</h3>
                <p className="text-[11px] text-slate-400 font-mono">Mã: {pack.packCode}</p>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-3 pr-1">
              {historyLoading ? (
                <div className="text-center py-10 text-xs text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw size={20} className="animate-spin text-emerald-600" />
                  Đang tải lịch sử...
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400">
                  Gói lượt này chưa được sử dụng lần nào.
                </div>
              ) : (
                history.map((h, idx) => {
                  const bDate = new Date(h.bookingDate).toLocaleDateString('vi-VN');
                  const statusCls = 
                    h.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                    h.status === 'cancelled' ? 'bg-red-50 text-red-500 border-red-200' :
                    h.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                    'bg-blue-50 text-blue-600 border-blue-200';
                  const statusLabel = 
                    h.status === 'completed' ? 'Hoàn thành' :
                    h.status === 'cancelled' ? 'Đã hủy' :
                    h.status === 'pending' ? 'Chờ xử lý' :
                    'Đã xác nhận';
                  
                  return (
                    <div key={h._id || idx} className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex flex-col gap-1.5 text-xs text-slate-700">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">{bDate} - {h.startTime}</span>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusCls}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-slate-500 flex justify-between">
                        <span>Chi nhánh:</span>
                        <span className="font-semibold text-slate-700">{h.branchId?.name}</span>
                      </div>
                      <div className="text-slate-500 flex justify-between">
                        <span>Xe:</span>
                        <span className="font-semibold text-slate-700">
                          {h.vehicleId?.brand} {h.vehicleId?.model} ({h.vehicleId?.licensePlate})
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="w-full mt-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerHistoryPage({ onBack, apiBase, token, vehicles: userVehicles = [], user, onUserUpdate }) {
  const configs = useSystemConfig();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const limit = 10;

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('-createdAt'); // Mới nhất default
  const viewModeFromUrl = searchParams.get('view');
  const [viewMode, setViewMode] = useState(viewModeFromUrl || 'list');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [slotPacks, setSlotPacks] = useState([]);
  const [slotPacksLoading, setSlotPacksLoading] = useState(false);

  // Sync viewMode with URL ?view= param
  useEffect(() => {
    const viewFromUrl = searchParams.get('view');
    if (viewFromUrl && ['calendar', 'week', 'list', 'slot_packs'].includes(viewFromUrl)) {
      setViewMode(viewFromUrl);
    }
  }, [searchParams]);

  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailBooking, setDetailBooking] = useState(null);
  const [childBookingDetailId, setChildBookingDetailId] = useState(null);

  const [viewedBookingIds, setViewedBookingIds] = useState(() => {
    try {
      const saved = localStorage.getItem('autowash_viewed_bookings');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markBookingAsViewed = useCallback((id) => {
    if (!id) return;
    const strId = String(id);
    setViewedBookingIds(prev => {
      if (prev.has(strId)) return prev;
      const updated = new Set(prev).add(strId);
      try {
        localStorage.setItem('autowash_viewed_bookings', JSON.stringify(Array.from(updated)));
      } catch {}
      return updated;
    });
  }, []);

  const handleOpenViewBooking = useCallback((b) => {
    if (!b) return;
    if (b._id) markBookingAsViewed(b._id);
    if (b.id) markBookingAsViewed(b.id);
    if (b.recurringGroupId) markBookingAsViewed(b.recurringGroupId);
    navigate(`/history/${b._id || b.id}`);
  }, [markBookingAsViewed, navigate]);

  const handleOpenDetailBooking = useCallback((b) => {
    if (!b) return;
    if (b._id) markBookingAsViewed(b._id);
    if (b.id) markBookingAsViewed(b.id);
    if (b.recurringGroupId) markBookingAsViewed(b.recurringGroupId);
    setDetailBooking(b);
  }, [markBookingAsViewed]);

  const checkIsNew = useCallback((b) => {
    if (!b) return false;
    const bId = String(b._id || b.id || '');
    const gId = b.recurringGroupId ? String(b.recurringGroupId) : null;
    
    // 1. Người dùng đã mở xem chi tiết / xem hóa đơn / click card => không còn là MỚI
    if (viewedBookingIds.has(bId) || (gId && viewedBookingIds.has(gId))) {
      return false;
    }
    
    // 2. Thanh toán thành công (100% paid) => không còn là MỚI
    if (b.paymentStatus === 'paid') {
      return false;
    }

    // 3. Nếu đã qua ngày (ngày hẹn hoặc ngày tạo trước ngày hôm nay) => không còn là MỚI
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    if (b.bookingDate) {
      const bDate = new Date(b.bookingDate);
      bDate.setHours(0, 0, 0, 0);
      if (bDate < startOfToday) return false;
    }

    if (b.createdAt) {
      const cDate = new Date(b.createdAt);
      cDate.setHours(0, 0, 0, 0);
      if (cDate < startOfToday) return false;
    }

    // 4. Nếu tạo trong ngày hôm nay và chưa xem/thanh toán => Hiển thị MỚI
    if (b.createdAt) {
      const diffMs = new Date() - new Date(b.createdAt);
      return diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000;
    }

    return false;
  }, [viewedBookingIds]);

  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0,0,0,0); return d;
  });

  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(now.getFullYear());

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [rebookLoading, setRebookLoading] = useState(false);
  
  // Pay Remaining Modal
  const [payRemainingTarget, setPayRemainingTarget] = useState(null);
  const [payRemainingMethod, setPayRemainingMethod] = useState('vnpay');
  const [payRemainingLoading, setPayRemainingLoading] = useState(false);
  const [payRemainingBankQR, setPayRemainingBankQR] = useState(null);
  const [qrPollCount, setQrPollCount] = useState(0);

  // Cancel confirm modal
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelConfirmError, setCancelConfirmError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelStep, setCancelStep] = useState(1);
  const [cancelOtp, setCancelOtp] = useState('');
  const [cancelPreview, setCancelPreview] = useState(null);

  // Cancel recurring confirm modal
  const [showCancelRecurringConfirm, setShowCancelRecurringConfirm] = useState(false);
  const [cancelRecurringTarget, setCancelRecurringTarget] = useState(null);

  // Recurring group modal
  const [showRecurringGroupModal, setShowRecurringGroupModal] = useState(false);
  const [recurringGroupTarget, setRecurringGroupTarget] = useState(null);
  const [recurringGroupBookings, setRecurringGroupBookings] = useState([]);
  const [recurringGroupLoading, setRecurringGroupLoading] = useState(false);

  // Rebook modal
  const [showRebookModal, setShowRebookModal] = useState(false);
  const [rebookTarget, setRebookTarget] = useState(null);
  const [rebookDate, setRebookDate] = useState('');
  const [rebookTime, setRebookTime] = useState('');
  const [rebookFormError, setRebookFormError] = useState('');
  const [rebookSlots, setRebookSlots] = useState([]);
  const [rebookSlotsLoading, setRebookSlotsLoading] = useState(false);
  const [rebookDepositMethod, setRebookDepositMethod] = useState('bank');
  const [rebookPaymentMode, setRebookPaymentMode] = useState('deposit'); // 'deposit' | 'full'
  const [rebookDraft, setRebookDraft] = useState(null);
  const [rebookDepositPayment, setRebookDepositPayment] = useState(null);
  const [rebookQrStep, setRebookQrStep] = useState('form'); // 'form' | 'qr' | 'success'
  const [rebookQrLoading, setRebookQrLoading] = useState(false);
  const [rebookVnpayLoading, setRebookVnpayLoading] = useState(false);
  const rebookPollRef = useRef(null);
  const [rebookSubServices, setRebookSubServices] = useState([]);
  const [rebookAvailableSubServices, setRebookAvailableSubServices] = useState([]);
  const [rebookAppliedVoucher, setRebookAppliedVoucher] = useState(null);
  const [rebookVoucherCode, setRebookVoucherCode] = useState('');
  const [rebookVoucherDiscount, setRebookVoucherDiscount] = useState(0);
  const [showRebookVoucherModal, setShowRebookVoucherModal] = useState(false);

  // Refund modal
  const [refunds, setRefunds] = useState([]);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [pointHistories, setPointHistories] = useState([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase || API_BASE}/loyalty/my-history?limit=100`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(payload => {
        const list = Array.isArray(payload?.data) ? payload.data : (payload?.items || []);
        setPointHistories(list);
      })
      .catch(() => setPointHistories([]));
  }, [apiBase, token]);

  // Quick book modal
  const [showQuickBookModal, setShowQuickBookModal] = useState(false);
  const [quickBookPack, setQuickBookPack] = useState(null);
  const [packToCancel, setPackToCancel] = useState(null);
  const [quickBookPrefill, setQuickBookPrefill] = useState(null); // from a booking item
  const [qbVehicleId, setQbVehicleId] = useState('');
  const [qbDate, setQbDate] = useState('');
  const [qbSlots, setQbSlots] = useState([]);
  const [qbSlotsLoading, setQbSlotsLoading] = useState(false);
  const [qbTime, setQbTime] = useState('');
  const [qbSubmitting, setQbSubmitting] = useState(false);
  const [qbError, setQbError] = useState('');
  const [branches, setBranches] = useState([]);
  const [cancelPackLoading, setCancelPackLoading] = useState(null);
  const [qbBranchId, setQbBranchId] = useState('');
  const [qbVoucherCode, setQbVoucherCode] = useState('');
  const [qbVoucherDiscount, setQbVoucherDiscount] = useState(0);
  const [qbApplyingVoucher, setQbApplyingVoucher] = useState(false);
  const [qbAvailableVouchers, setQbAvailableVouchers] = useState([]);
  const [qbVouchersLoading, setQbVouchersLoading] = useState(false);
  const [qbQrStep, setQbQrStep] = useState('form'); // 'form' | 'qr' | 'vnpay_redirect'
  const [qbDepositPayment, setQbDepositPayment] = useState(null);
  const [qbDraft, setQbDraft] = useState(null);
  const [qbQrPollCount, setQbQrPollCount] = useState(0);
  const [qbQrLoading, setQbQrLoading] = useState(false);
  const [qbBookingResult, setQbBookingResult] = useState(null);
  const qbPollRef = useRef(null);

  // Cleanup poll khi modal đóng
  useEffect(() => {
    if (!showQuickBookModal) {
      if (qbPollRef.current) clearInterval(qbPollRef.current);
    }
  }, [showQuickBookModal]);


  // Cleanup rebook poll khi modal đóng
  useEffect(() => {
    if (!showRebookModal) {
      if (rebookPollRef.current) clearInterval(rebookPollRef.current);
    }
  }, [showRebookModal]);

  const debounceRef = useRef(null);

  function computeVoucherDiscount(voucher, orderAmount) {
    if (!voucher || !orderAmount) return 0;
    if (voucher.type === 'percentage') {
      const d = Math.floor(orderAmount * voucher.value / 100);
      return voucher.maxDiscount > 0 ? Math.min(d, voucher.maxDiscount) : d;
    }
    return Math.min(voucher.value || 0, orderAmount);
  }

  function showToastMsg(message, type = 'success') {
    showToast(message, type);
  }

  const doFetch = useCallback((kw, st, tp, df, dt, pg, so, gbr) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', pg);
    params.set('limit', limit);
    if (kw.trim()) params.set('keyword', kw.trim());
    if (st) params.set('status', st);
    if (tp) params.set('bookingType', tp);
    if (df) params.set('dateFrom', df);
    if (dt) params.set('dateTo', dt);
    if (so) params.set('sort', so);
    if (gbr) params.set('groupByRecurring', 'true');

    const url = `${apiBase || API_BASE}/bookings/my?${params.toString()}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(payload => {
        const result = payload?.data || payload;
        setBookings(Array.isArray(result) ? result : (result?.bookings || []));
        setPagination(result?.pagination || null);
      })
      .catch(e => { console.error(e); setBookings([]); })
      .finally(() => setLoading(false));
  }, [apiBase, token, limit]);

  // Xử lý VNPay return cho thanh toán phần còn lại
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vnpayResult = params.get('vnpay_result');
    if (!vnpayResult) return;
    const url2 = new URL(window.location);
    url2.searchParams.delete('vnpay_result');
    window.history.replaceState({}, '', url2);
    try {
      const parsed = JSON.parse(decodeURIComponent(vnpayResult));
      const success = parsed?.success !== false && parsed?.data?.responseCode === '00';
      if (success) {
        showToastMsg('Thanh toán VNPay thành công!');
        doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
      } else {
        showToastMsg(parsed?.message || 'Thanh toán VNPay thất bại', 'error');
      }
    } catch (e) {
      console.error('Parse vnpay_result error:', e);
    }
  }, []);

  const fetchSlotPacks = useCallback(() => {
    if (!token) return;
    setSlotPacksLoading(true);
    fetch(`${apiBase || API_BASE}/slot-packs/my?limit=100`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(payload => {
        const data = payload?.data || payload;
        setSlotPacks(Array.isArray(data) ? data : (data?.packs || []));
      })
      .catch(err => {
        console.error('Lỗi khi fetch gói lượt', err);
        setSlotPacks([]);
      })
      .finally(() => setSlotPacksLoading(false));
  }, [apiBase, token]);

  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase || API_BASE}/refund-requests/my`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(payload => {
        const list = Array.isArray(payload?.data?.data)
          ? payload.data.data
          : (Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []));
        setRefunds(list);
      })
      .catch(() => setRefunds([]));
  }, [apiBase, token]);

  const findRefundRequest = (bId) => {
    const list = Array.isArray(refunds) ? refunds : [];
    return list.find(r => String(r.bookingId?._id || r.bookingId) === String(bId));
  };
  const isRefundExpired = (b) => {
    if (b.status !== 'completed') return true;
    const ts = b.updatedAt;
    if (!ts) return true;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return true;
    return (Date.now() - d.getTime()) > 24 * 60 * 60 * 1000;
  };
  const openRefundRequest = (b) => { setRefundTarget(b); setRefundReason(''); setShowRefundModal(true); };
  const submitRefundRequest = async () => {
    if (!refundReason.trim()) return showToastMsg('Vui lòng nhập lý do hoàn tiền', 'error');
    setRefundLoading(true);
    try {
      const res = await fetch(`${apiBase || API_BASE}/refund-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: refundTarget._id || refundTarget.id, reason: refundReason })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || 'Lỗi hệ thống');
      showToastMsg('Gửi yêu cầu hoàn tiền thành công');
      setRefunds(prev => [...prev, payload.data]);
      setShowRefundModal(false);
    } catch (err) {
      showToastMsg(err.message, 'error');
    } finally {
      setRefundLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetch(`${apiBase || API_BASE}/branches`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setBranches(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [apiBase, token]);



  useEffect(() => {
    if (viewMode === 'slot_packs') {
      fetchSlotPacks();
    }
  }, [viewMode, fetchSlotPacks]);

  useEffect(() => {
    if (!token) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const gbr = (viewMode === 'list' || viewMode === 'week');
    debounceRef.current = setTimeout(() => {
      doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, gbr);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, viewMode, token, doFetch]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bId = params.get('bookingId');
    if (bId && token) {
      navigate(`/history/${bId}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [token, navigate]);

  const loadRecurringGroup = useCallback(async () => {
    if (!recurringGroupTarget?.recurringGroupId) return;
    setRecurringGroupLoading(true);
    try {
      const res = await fetch(`${apiBase || API_BASE}/bookings/my?recurringGroupId=${recurringGroupTarget.recurringGroupId}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const payload = await res.json();
        const result = payload?.data || payload;
        setRecurringGroupBookings(Array.isArray(result) ? result : (result?.bookings || []));
      }
    } catch (e) {
      console.error(e);
      setRecurringGroupBookings([]);
    } finally {
      setRecurringGroupLoading(false);
    }
  }, [recurringGroupTarget, token, apiBase]);

  useEffect(() => {
    if (showRecurringGroupModal && recurringGroupTarget) {
      loadRecurringGroup();
    }
  }, [showRecurringGroupModal, recurringGroupTarget, loadRecurringGroup]);

  const [refreshSignal, setRefreshSignal] = useState(0);

  const handleSSEUpdate = useCallback(() => {
    const gbr = (viewMode === 'list' || viewMode === 'week');
    doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, gbr);
    setRefreshSignal(s => s + 1);
  }, [doFetch, keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, viewMode]);

  useSSE(token, 'notification', handleSSEUpdate);
  useSSE(token, 'my_bookings_updated', handleSSEUpdate);
  useSSE(token, 'booking_new', handleSSEUpdate);
  useSSE(token, 'booking_update', handleSSEUpdate);
  useSSE(token, 'points_updated', handleSSEUpdate);
  useSSE(token, 'refund_request_updated', handleSSEUpdate);

  useEffect(() => {
    if (refreshSignal > 0 && showRecurringGroupModal && recurringGroupTarget) {
      loadRecurringGroup();
    }
  }, [refreshSignal]);

  function resetFilters() { setKeyword(''); setStatusFilter(''); setTypeFilter(''); setDateFrom(''); setDateTo(''); setSort('-createdAt'); setPage(1); }
  function onFilterChange(setter, value) { setter(value); setPage(1); }

  const refreshUserProfile = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase || API_BASE}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const payload = await res.json();
        const freshUser = payload?.data || payload;
        if (freshUser && typeof onUserUpdate === 'function') {
          onUserUpdate(freshUser);
        }
      }
    } catch (err) {
      console.error('Failed to refresh user profile:', err);
    }
  };

  const handleDateFromChange = (val) => {
    if (dateTo && val && val > dateTo) {
      showToast('Ngày bắt đầu không được lớn hơn ngày kết thúc', 'error');
      setDateFrom(val);
      setDateTo(val);
      setPage(1);
      return;
    }
    onFilterChange(setDateFrom, val);
  };

  const handleDateToChange = (val) => {
    if (dateFrom && val && val < dateFrom) {
      showToast('Ngày kết thúc không được nhỏ hơn ngày bắt đầu', 'error');
      setDateFrom(val);
      setDateTo(val);
      setPage(1);
      return;
    }
    onFilterChange(setDateTo, val);
  };
  function openReview(b) { setReviewTarget(b); setRating(b.rating || 0); setFeedbackText(b.feedback || ''); setShowReviewModal(true); }

  useEffect(() => {
    if (detailBooking) {
      const bInList = bookings.find(b => b._id === detailBooking._id || b.id === detailBooking._id);
      if (bInList) {
        setDetailBooking(bInList);
        return;
      }
      const bInGroup = recurringGroupBookings.find(b => b._id === detailBooking._id || b.id === detailBooking._id);
      if (bInGroup) {
        setDetailBooking(bInGroup);
        return;
      }
    }
  }, [bookings, recurringGroupBookings]);


  async function handleSubmitReview(e) {
    e.preventDefault();
    if (!reviewTarget || rating === 0) return;
    setSubmitting(true);
    try {
      const bId = reviewTarget._id || reviewTarget.id;
      const res = await fetch(`${apiBase || API_BASE}/bookings/${bId}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, feedback: feedbackText.trim() || undefined }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Gửi đánh giá thất bại'); }
      const payload = await res.json();
      const updated = payload?.data || payload;
      setBookings(prev => prev.map(b => ((b._id || b.id) === bId ? { ...b, ...updated } : b)));
      setShowReviewModal(false); setReviewTarget(null);
      showToastMsg('Đánh giá thành công!');
    } catch (e) { showToastMsg(e.message, 'error'); } finally { setSubmitting(false); }
  }
  const handlePayRemaining = (b) => {
    setPayRemainingTarget(b);
    setPayRemainingMethod('vnpay');
    setPayRemainingBankQR(null);
  };

  const confirmPayRemaining = async () => {
    if (!payRemainingTarget) return;
    try {
      setPayRemainingLoading(true);
      const bId = payRemainingTarget._id || payRemainingTarget.id;
      
      if (payRemainingMethod === 'wallet') {
        const res = await fetch(`${apiBase || API_BASE}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingId: bId, method: 'wallet', paymentType: 'remaining' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Thanh toán bằng ví thất bại');
        showToastMsg('Thanh toán thành công');
        setPayRemainingTarget(null);
        doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
      } else if (payRemainingMethod === 'bank') {
        const res = await fetch(`${apiBase || API_BASE}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingId: bId, method: 'bank', paymentType: 'remaining' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Tạo mã QR thanh toán thất bại');
        setPayRemainingBankQR(data?.data || data);
        setQrPollCount(0);
      } else {
        const res = await fetch(`${apiBase || API_BASE}/payments/vnpay-create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingId: bId, paymentType: 'remaining', origin: window.location.origin }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Khởi tạo thanh toán thất bại');
        
        if (data?.data?.paymentUrl || data?.data?.url) {
          window.location.href = data?.data?.paymentUrl || data?.data?.url;
        } else {
          showToastMsg('Khởi tạo thanh toán thành công');
          setPayRemainingTarget(null);
          doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
        }
      }
    } catch (err) {
      showToastMsg(err.message, 'error');
    } finally {
      setPayRemainingLoading(false);
    }
  };

  const checkPayRemainingBankStatus = useCallback(async () => {
    if (!payRemainingBankQR) return;
    try {
      const pid = payRemainingBankQR._id || payRemainingBankQR.id;
      const res = await fetch(`${apiBase || API_BASE}/payments/${pid}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const p = data?.data || data;
      if (p?.status === 'paid') {
        showToastMsg('Thanh toán chuyển khoản thành công', 'success');
        setPayRemainingBankQR(null);
        setPayRemainingTarget(null);
        doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
      } else {
        setQrPollCount(c => c + 1);
      }
    } catch (e) {}
  }, [payRemainingBankQR, token, apiBase, doFetch, keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, viewMode]);

  useEffect(() => {
    if (!payRemainingBankQR) return;
    const timer = setInterval(checkPayRemainingBankStatus, 5000);
    return () => clearInterval(timer);
  }, [payRemainingBankQR, checkPayRemainingBankStatus]);

  async function handleCancel(b) {
    setCancelTarget(b);
    setCancelConfirmError('');
    setCancelReason('');
    setCancelStep(1);
    setCancelOtp('');
    setCancelPreview(null);
    setShowCancelConfirm(true);
    // Fetch cancel preview
    try {
      const bId = b._id || b.id;
      const res = await fetch(`${apiBase || API_BASE}/bookings/${bId}/cancel-preview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const payload = await res.json();
        setCancelPreview(payload?.data || null);
      }
    } catch (e) { /* ignore preview errors */ }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      setCancelConfirmError('Vui lòng nhập lý do hủy đơn');
      return;
    }
    setCancelLoading(true);
    setCancelConfirmError('');
    try {
      const bId = cancelTarget._id || cancelTarget.id;
      const res = await fetch(`${apiBase || API_BASE}/bookings/${bId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cancellationReason: cancelReason.trim() }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Không thể hủy đơn'); }
      const cancelPayload = await res.json().catch(() => ({}));
      
      const refundAmount = cancelPayload?.data?.refundAmount || 0;
      if (refundAmount > 0 && onUserUpdate) {
        onUserUpdate({ walletBalance: (user?.walletBalance || 0) + refundAmount });
      }
      showToastMsg(refundAmount > 0 ? `Đã hủy đơn thành công, hoàn ${refundAmount.toLocaleString('vi-VN')}đ vào ví` : 'Đã hủy đơn thành công');
      setShowCancelConfirm(false); setCancelTarget(null); setCancelReason(''); setCancelOtp(''); setCancelStep(1); setCancelPreview(null);
      refreshUserProfile();
      doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
      if (showRecurringGroupModal) loadRecurringGroup();
    } catch (e) { setCancelConfirmError(e.message); }
    finally { setCancelLoading(false); }
  }

  async function handleShowQR(b) {
    setQrLoading(true); setShowQR(true); setQrData('');
    try {
      const bId = b._id || b.id;
      const res = await fetch(`${apiBase || API_BASE}/bookings/${bId}/qr`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Không thể tạo mã QR');
      const payload = await res.json();
      setQrData(payload?.data?.qrDataUrl || payload?.qr || '');
    } catch (e) { showToastMsg(e.message, 'error'); setShowQR(false); }
    finally { setQrLoading(false); }
  }

  function handleRebook(b) {
    navigate('/booking', { state: { rebookData: b } });
  }

  async function submitRebook() {
    if (!rebookTarget) return;
    setRebookFormError('');
    setRebookQrStep('form');
    setRebookDraft(null);
    setRebookDepositPayment(null);
    if (rebookPollRef.current) clearInterval(rebookPollRef.current);
    if (!rebookDate) { setRebookFormError('Vui lòng chọn ngày'); return; }
    if (!rebookTime) { setRebookFormError('Vui lòng chọn giờ'); return; }
    const selected = new Date(rebookDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selected < today) { setRebookFormError('Ngày phải từ hôm nay trở đi'); return; }

    // Validate slot availability
    if (rebookSlots.length > 0) {
      const slotTimes = rebookSlots.map(s => s.startTime || s.time || s);
      if (!slotTimes.includes(rebookTime)) {
        setRebookFormError('Khung giờ này không có sẵn. Vui lòng chọn giờ từ danh sách.');
        return;
      }
    }

    setRebookLoading(true);
    try {
      const bId = rebookTarget._id || rebookTarget.id;
      const res = await fetch(`${apiBase || API_BASE}/bookings/${bId}/rebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingDate: rebookDate, startTime: rebookTime, voucherCode: rebookVoucherCode || undefined }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Đặt lại thất bại'); }
      const payload = await res.json();
      const newBooking = payload?.data || payload;
      const depositAmt = newBooking.depositAmount || 0;

      // Lưu draft để sau payment mới tạo booking
      setRebookDraft({
        bookingId: rebookTarget._id || rebookTarget.id,
        bookingDate: rebookDate,
        startTime: rebookTime,
        amount,
        paymentMode: rebookPaymentMode,
        selectedSubServices: rebookSubServices,
        voucherCode: vCode,
      });

      if (amount <= 0) {
        // Miễn phí → tạo rebook ngay
        const bId = rebookTarget._id || rebookTarget.id;
        const res = await fetch(`${apiBase || API_BASE}/bookings/${bId}/rebook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingDate: rebookDate, startTime: rebookTime, selectedSubServices: rebookSubServices, voucherCode: vCode }),
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Đặt lại thất bại'); }
        showToastMsg('Đặt lại thành công!');
        setShowRebookModal(false); setRebookTarget(null);
        doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
        if (showRecurringGroupModal) loadRecurringGroup();
        return;
      }

      if (rebookDepositMethod === 'vnpay') {
        // VNPay provisional (chưa tạo booking — poll chờ thanh toán rồi mới rebook)
        setRebookVnpayLoading(true);
        try {
          const vnpRes = await fetch(`${apiBase || API_BASE}/bookings/vnpay-provisional`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              amount,
              bankCode: '',
              bookingId: rebookTarget._id || rebookTarget.id,
              bookingDate: rebookDate,
              startTime: rebookTime,
              packageId: rebookTarget.packageId?._id || rebookTarget.packageId?.id || rebookTarget.packageId,
              branchId: rebookTarget.branchId?._id || rebookTarget.branchId?.id || rebookTarget.branchId,
              vehicleId: rebookTarget.vehicleId?._id || rebookTarget.vehicleId?.id || rebookTarget.vehicleId,
              selectedSubServices: rebookSubServices,
              voucherCode: rebookAppliedVoucher?.code || undefined,
            }),
          });
          const vnpData = await vnpRes.json();
          if (!vnpRes.ok) throw new Error(vnpData.message || 'Tạo thanh toán VNPay thất bại');
          const vnpUrl = vnpData?.data?.paymentUrl || vnpData?.paymentUrl || vnpData?.url;
          if (vnpUrl) {
            // Lưu draft vào sessionStorage để xử lý sau khi VNPay redirect về
            const paymentData = vnpData?.data?.payment || vnpData?.data;
            sessionStorage.setItem('aw_rebookVnpayDraft', JSON.stringify({
              rebookTargetId: rebookTarget._id || rebookTarget.id,
              bookingDate: rebookDate,
              startTime: rebookTime,
              selectedSubServices: rebookSubServices,
              voucherCode: rebookAppliedVoucher?.code || null,
              paymentMode: rebookPaymentMode,
              depositPayment: { _id: paymentData._id || paymentData.id, ...paymentData },
              draft: { bookingId: rebookTarget._id || rebookTarget.id, bookingDate: rebookDate, startTime: rebookTime, amount, paymentMode: rebookPaymentMode, selectedSubServices: rebookSubServices, voucherCode: rebookAppliedVoucher?.code || undefined },
            }));
            window.location.href = vnpUrl;
          } else {
            setRebookFormError('Không nhận được đường dẫn thanh toán VNPay');
          }
        } catch (e) {
          setRebookFormError(e.message);
        } finally {
          setRebookVnpayLoading(false);
        }
      } else {
        // Bank provisional (chưa tạo booking — giống BookingWidget)
        setRebookQrLoading(true);
        try {
          const payRes = await fetch(`${apiBase || API_BASE}/payments/bank-provisional`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ amount, paymentType: rebookPaymentMode }),
          });
          const payData = await payRes.json();
          if (!payRes.ok) throw new Error(payData.message || 'Tạo thanh toán thất bại');
          const payment = payData?.data || payData;
          setRebookDepositPayment(payment);
          setRebookQrStep('qr');
        } catch (e) {
          setRebookFormError(e.message);
        } finally {
          setRebookQrLoading(false);
        }
      }
    } catch (e) { setRebookFormError(e.message); }
    finally { setRebookLoading(false); }
  }

  // Xử lý VNPay return cho rebook (sau khi redirect từ tab hiện tại)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('rebook_vnpay') === 'true') {
      const draftStr = sessionStorage.getItem('aw_rebookVnpayDraft');
      const resultStr = sessionStorage.getItem('aw_rebookVnpayResult');
      sessionStorage.removeItem('aw_rebookVnpayDraft');
      sessionStorage.removeItem('aw_rebookVnpayResult');
      const url2 = new URL(window.location);
      url2.searchParams.delete('rebook_vnpay');
      window.history.replaceState({}, '', url2);
      if (draftStr && resultStr) {
        try {
          const draft = JSON.parse(draftStr);
          const parsed = JSON.parse(decodeURIComponent(resultStr));
          const success = parsed?.success !== false && parsed?.data?.responseCode === '00';
          if (success && draft.draft) {
            // Payment confirmed by BE — tạo rebook ngay
            executeRebookAfterPayment(draft.draft);
          } else {
            // Trả về form để user thấy lỗi
            setRebookTarget({ _id: draft.rebookTargetId });
            setRebookDate(draft.bookingDate || '');
            setRebookTime(draft.startTime || '');
            setRebookSubServices(draft.selectedSubServices || []);
            setRebookAppliedVoucher(draft.voucherCode ? { code: draft.voucherCode } : null);
            setRebookFormError(parsed?.message || 'Thanh toán VNPay thất bại hoặc bị hủy');
            setShowRebookModal(true);
          }
        } catch (e2) {
          console.error('Parse rebook vnpay result error:', e2);
        }
      }
    }
  }, []);

  // Poll rebook provisional payment → khi paid thì tạo rebook
  useEffect(() => {
    if (rebookQrStep !== 'qr' || !rebookDepositPayment) return;
      rebookPollRef.current = setInterval(async () => {
      try {
        const pid = rebookDepositPayment._id || rebookDepositPayment.id;
        if (!pid) return;
        const res = await fetch(`${apiBase || API_BASE}/payments/${pid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const p = data?.data || data;
        if (p?.status === 'paid') {
          clearInterval(rebookPollRef.current);
          await executeRebookAfterPayment();
        }
      } catch (pollErr) {
        console.error('Poll payment error:', pollErr);
        if (!rebookFormError) setRebookFormError('Lỗi kiểm tra thanh toán. Vui lòng thử lại.');
      }
    }, 10000);
    return () => { if (rebookPollRef.current) clearInterval(rebookPollRef.current); };
  }, [rebookQrStep, rebookDepositPayment, rebookDraft, apiBase, token]);

  // Tạo rebook sau khi thanh toán thành công
  async function executeRebookAfterPayment(draftOverride) {
    const d = draftOverride || rebookDraft;
    if (!d) return;
    setRebookQrLoading(true);
    try {
      const res = await fetch(`${apiBase || API_BASE}/bookings/${d.bookingId}/rebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingDate: d.bookingDate, startTime: d.startTime, selectedSubServices: d.selectedSubServices, voucherCode: d.voucherCode }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Đặt lại thất bại'); }
      showToastMsg('Đặt lại thành công!');
      setShowRebookModal(false); setRebookTarget(null);
      doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
      if (showRecurringGroupModal) loadRecurringGroup();
    } catch (e) {
      setRebookFormError(e.message);
    } finally {
      setRebookQrLoading(false);
    }
  }

  // Simulate rebook payment → simulate + execute rebook
  async function simulateRebookPayment() {
    if (!rebookDepositPayment || !rebookDraft) return;
    setRebookQrLoading(true);
    try {
      await fetch(`${apiBase || API_BASE}/payments/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transactionId: rebookDepositPayment.transactionId,
          gatewayTransactionId: `SIM${Date.now()}`,
        }),
      });
      await executeRebookAfterPayment();
    } catch (e) {
      setRebookFormError(e.message);
    } finally {
      setRebookQrLoading(false);
    }
  }

  /* ── Quick book: mở modal từ slot pack hoặc từ booking ── */
  function openQuickBookFromPack(pack) {
    setQuickBookPack(pack);
    setQuickBookPrefill(null);
    setQbBranchId('');
    setQbVehicleId('');
    setQbDate('');
    setQbSlots([]);
    setQbTime('');
    setQbError('');
    setQbVoucherCode('');
    setQbVoucherDiscount(0);
    setQbDraft(null);
    setQbDepositPayment(null);
    setQbQrStep('form');
    if (qbPollRef.current) clearInterval(qbPollRef.current);
    setShowQuickBookModal(true);
  }

  function openQuickBookFromBooking(b) {
    handleRebook(b);
  }

  // Fetch slots khi chọn ngày trong quick book
  useEffect(() => {
    if (!qbDate) { setQbSlots([]); setQbTime(''); return; }
    // Ưu tiên branch từ pack → prefill → qbBranchId (khi pack không khóa chi nhánh)
    const branchId = quickBookPack?.branchId?._id || quickBookPack?.branchId?.id
      || qbBranchId
      || quickBookPrefill?.branchId?._id || quickBookPrefill?.branchId?.id;
    const pkgId = quickBookPack?.packageId?._id || quickBookPack?.packageId?.id || quickBookPrefill?.packageId?._id || quickBookPrefill?.packageId?.id;
    if (!branchId || !pkgId) return;
    setQbSlotsLoading(true);
    setQbTime('');
    fetch(`${apiBase || API_BASE}/bookings/slots?branchId=${branchId}&date=${qbDate}&packageId=${pkgId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(payload => {
        const data = payload?.data || payload;
        setQbSlots(Array.isArray(data) ? data : []);
      })
      .catch(() => setQbSlots([]))
      .finally(() => setQbSlotsLoading(false));
  }, [qbDate, quickBookPack, quickBookPrefill, apiBase, token]);

  // Fetch slots khi chọn ngày trong rebook
  useEffect(() => {
    if (!rebookDate || !rebookTarget) { setRebookSlots([]); return; }
    const branchId = rebookTarget.branchId?._id || rebookTarget.branchId?.id || rebookTarget.branchId;
    const pkgId = rebookTarget.packageId?._id || rebookTarget.packageId?.id || rebookTarget.packageId;
    if (!branchId) { setRebookSlots([]); return; }
    setRebookSlotsLoading(true);
    let url = `${apiBase || API_BASE}/bookings/slots?branchId=${branchId}&date=${rebookDate}`;
    if (pkgId) url += `&packageId=${pkgId}`;
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(payload => {
        const data = payload?.data || payload;
        setRebookSlots(Array.isArray(data) ? data : []);
      })
      .catch(() => setRebookSlots([]))
      .finally(() => setRebookSlotsLoading(false));
  }, [rebookDate, rebookTarget, apiBase, token]);

  function getQbBasePrice() {
    const pkg = quickBookPack?.packageId || quickBookPrefill?.packageId;
    return pkg?.price || pkg?.totalPrice || 0;
  }

  function getQbDeposit() {
    const base = getQbBasePrice();
    const discounted = Math.max(0, base - qbVoucherDiscount);
    if (quickBookPack) return 0; // slot pack → đã thanh toán 100%
    return Math.round((discounted * (configs?.DEPOSIT_RATE ?? 0) / 100) / 1000) * 1000;
  }

  async function applyQbVoucher() {
    if (!qbVoucherCode.trim()) { setQbError('Nhập mã voucher'); return; }
    const branchId = quickBookPack?.branchId?._id || quickBookPack?.branchId?.id
      || qbBranchId
      || quickBookPrefill?.branchId?._id || quickBookPrefill?.branchId?.id;
    const base = getQbBasePrice();
    setQbApplyingVoucher(true);
    setQbError('');
    try {
      const res = await fetch(`${apiBase || API_BASE}/vouchers/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: qbVoucherCode.trim(), branchId, amount: base, packageId: quickBookPack?.packageId?._id || quickBookPack?.packageId?.id || quickBookPrefill?.packageId?._id || quickBookPrefill?.packageId?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Mã không hợp lệ');
      const discount = data?.data?.savings || data?.data?.discountAmount || 0;
      setQbVoucherDiscount(discount);
      showToastMsg(`Áp dụng voucher giảm ${discount.toLocaleString('vi-VN')}đ`);
    } catch (e) {
      setQbVoucherDiscount(0);
      setQbError(e.message);
    } finally {
      setQbApplyingVoucher(false);
    }
  }

  // Fetch available vouchers khi modal mở cho rebook
  useEffect(() => {
    if (!showQuickBookModal || quickBookPack) return;
    const branchId = quickBookPrefill?.branchId?._id || quickBookPrefill?.branchId?.id;
    if (!branchId) return;
    setQbVouchersLoading(true);
    fetch(`${apiBase || API_BASE}/vouchers/available?branchId=${branchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(payload => {
        const data = payload?.data || payload;
        setQbAvailableVouchers(Array.isArray(data) ? data : []);
      })
      .catch(() => setQbAvailableVouchers([]))
      .finally(() => setQbVouchersLoading(false));
  }, [showQuickBookModal, quickBookPack, quickBookPrefill, apiBase, token]);

  async function confirmQuickBook() {
    if (quickBookPack && quickBookPack.remainingSlots <= 0) {
      setQbError('Gói lượt này đã hết lượt sử dụng');
      return;
    }
    if (!qbDate) { setQbError('Vui lòng chọn ngày'); return; }
    if (!qbTime) { setQbError('Vui lòng chọn khung giờ'); return; }
    const branchId = quickBookPack?.branchId?._id || quickBookPack?.branchId?.id
      || qbBranchId
      || quickBookPrefill?.branchId?._id || quickBookPrefill?.branchId?.id;
    const pkgId = quickBookPack?.packageId?._id || quickBookPack?.packageId?.id || quickBookPrefill?.packageId?._id || quickBookPrefill?.packageId?.id;
    if (!branchId) { setQbError('Vui lòng chọn chi nhánh'); return; }
    const packBranchId = quickBookPack?.branchId?._id || quickBookPack?.branchId?.id;
    if (packBranchId && packBranchId !== branchId) {
      setQbError('Chi nhánh không khớp với gói lượt. Vui lòng chọn đúng chi nhánh của gói.');
      return;
    }
    const vehicleId = qbVehicleId || quickBookPrefill?.vehicleId?._id || quickBookPrefill?.vehicleId?.id;
    if (!vehicleId) { setQbError('Vui lòng chọn xe'); return; }

    if (quickBookPack) {
      // Gói slot → đã thanh toán 100% → tạo booking ngay
      setQbSubmitting(true);
      setQbError('');
      try {
        const res = await fetch(`${apiBase || API_BASE}/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            branchId, packageId: pkgId, vehicleId,
            bookingDate: qbDate, startTime: qbTime,
            slotPackId: quickBookPack._id || quickBookPack.id,
            selectedSubServices: [], note: '',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Đặt lịch thất bại');
        showToastMsg('Đã đặt lịch từ gói lượt!');
        setShowQuickBookModal(false);
        fetchSlotPacks();
        doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
      } catch (e) {
        setQbError(e.message);
      } finally {
        setQbSubmitting(false);
      }
      return;
    }

    // Không dùng gói → lưu draft, tạo provisional payment trước
    const deposit = getQbDeposit();
    if (deposit <= 0) {
      // Miễn phí → tạo booking ngay
      setQbSubmitting(true);
      setQbError('');
      try {
        const res = await fetch(`${apiBase || API_BASE}/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            branchId, packageId: pkgId, vehicleId,
            bookingDate: qbDate, startTime: qbTime,
            voucherCode: qbVoucherCode.trim() || undefined,
            selectedSubServices: [], note: '',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Đặt lịch thất bại');
        showToastMsg('Đặt lịch thành công!');
        setShowQuickBookModal(false);
        doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
      } catch (e) {
        setQbError(e.message);
      } finally {
        setQbSubmitting(false);
      }
      return;
    }

    // Có cọc → lưu draft, chuyển sang bước thanh toán
    setQbDraft({ branchId, packageId: pkgId, vehicleId, deposit });
    setQbError('');
    const api = apiBase || API_BASE;
    setQbQrLoading(true);
    try {
      const payRes = await fetch(`${api}/payments/bank-provisional`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: deposit, paymentType: 'deposit' }),
      });
      const payData = await payRes.json();
      if (!payRes.ok) throw new Error(payData.message || 'Tạo thanh toán thất bại');
      setQbDepositPayment(payData?.data || payData);
      setQbQrStep('qr');
      setQbQrPollCount(0);
    } catch (e) {
      setQbError(e.message);
    } finally {
      setQbQrLoading(false);
    }
  }

  // Poll payment status every 10s
  useEffect(() => {
    if (qbQrStep !== 'qr' || !qbDepositPayment) return;
    qbPollRef.current = setInterval(async () => {
      try {
        const payment = qbDepositPayment;
        const pid = payment._id || payment.id;
        const res = await fetch(`${apiBase || API_BASE}/payments/${pid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const p = data?.data || data;
        if (p?.status === 'paid') {
          clearInterval(qbPollRef.current);
          await createBookingAfterQbPayment();
        }
        setQbQrPollCount(c => c + 1);
      } catch {}
    }, 10000);
    return () => { if (qbPollRef.current) clearInterval(qbPollRef.current); };
  }, [qbQrStep, qbDepositPayment, apiBase, token]);

  async function createBookingAfterQbPayment() {
    if (!qbDraft) return;
    const d = qbDraft;
    setQbSubmitting(true);
    setQbError('');
    try {
      const branchId = d.branchId;
      const packageId = d.packageId;
      const res = await fetch(`${apiBase || API_BASE}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          branchId, packageId, vehicleId: d.vehicleId,
          bookingDate: qbDate, startTime: qbTime,
          voucherCode: qbVoucherCode.trim() || undefined,
          selectedSubServices: [], note: '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Tạo booking thất bại');
      const bk = data?.data || data;
      // Tạo payment record cho booking
      const payRes = await fetch(`${apiBase || API_BASE}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: bk._id || bk.id, method: 'bank', paymentType: 'deposit', amount: d.deposit }),
      });
      const payData = await payRes.json();
      if (!payRes.ok) throw new Error(payData.message || 'Tạo payment thất bại');
      // Simulate confirm
      await fetch(`${apiBase || API_BASE}/payments/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transactionId: payData?.data?.transactionId,
          gatewayTransactionId: `SIM${Date.now()}`,
        }),
      });
      // Store booking result and show success step
      const bkName = quickBookPack?.packageId?.name || quickBookPrefill?.packageName || quickBookPrefill?.packageId?.name || '';
      const bkBranchName = quickBookPack?.branchId?.name || quickBookPrefill?.branchName || quickBookPrefill?.branchId?.name || '';
      const vehicleLabel = userVehicles.find(v => (v._id || v.id) === d.vehicleId);
      const basePriceVal = getQbBasePrice();
      const depositVal = getQbDeposit();
      setQbBookingResult({
        bookingCode: bk.bookingCode || bk.code || `#${String(bk._id || bk.id).slice(-6)}`,
        branch: { name: bkBranchName },
        vehicle: vehicleLabel ? { licensePlate: vehicleLabel.licensePlate || vehicleLabel.name } : null,
        pkg: { name: bkName },
        date: qbDate,
        time: qbTime,
        total: basePriceVal,
        discount: qbVoucherDiscount,
        depositAmount: depositVal,
        depositPaid: true,
        paymentMode: 'deposit',
      });
      setQbQrStep('success');
      doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
    } catch (e) {
      setQbError(e.message);
    } finally {
      setQbSubmitting(false);
    }
  }

  // Simulate/Nút "Đã chuyển khoản" cho demo
  async function simulateQbPayment() {
    if (!qbDepositPayment) return;
    setQbQrLoading(true);
    setQbError('');
    try {
      // Gọi simulate trước → cập nhật trạng thái payment thành paid
      const simRes = await fetch(`${apiBase || API_BASE}/payments/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transactionId: qbDepositPayment.transactionId,
          gatewayTransactionId: `SIM${Date.now()}`,
        }),
      });
      if (!simRes.ok) throw new Error('Xác nhận thanh toán thất bại');
      await createBookingAfterQbPayment();
    } catch (e) {
      setQbError(e.message);
    } finally {
      setQbQrLoading(false);
    }
  }

  // Auto-select first vehicle cho quick book
  useEffect(() => {
    if (!showQuickBookModal) return;
    if (quickBookPrefill?.vehicleId?._id || quickBookPrefill?.vehicleId?.id) return;
    if (!qbVehicleId && userVehicles.length > 0) {
      setQbVehicleId(userVehicles[0]._id || userVehicles[0].id);
    }
  }, [showQuickBookModal, quickBookPrefill, userVehicles, qbVehicleId]);

  async function handleCancelPackConfirm() {
    if (!packToCancel) return;
    const packId = packToCancel._id || packToCancel.id;
    if (!packId) return;
    setCancelPackLoading(packId);
    try {
      const res = await fetch(`${apiBase || API_BASE}/slot-packs/${packId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Hủy thất bại'); }
      showToastMsg('Đã hủy gói lượt');
      setPackToCancel(null);
      fetchSlotPacks();
    } catch (e) {
      showToastMsg(e.message, 'error');
    } finally {
      setCancelPackLoading(null);
    }
  }



  const handleRemoveSubService = async (b, subName) => {
    try {
      const bId = b._id || b.id;
      const updatedSubs = (b.selectedSubServices || []).filter(s => s.name !== subName).map(s => s.name || s);
      const res = await fetch(`${apiBase || API_BASE}/bookings/${bId}/sub-services`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subServices: updatedSubs })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Lỗi khi xóa dịch vụ');
      }
      showToast('Đã xóa dịch vụ thành công!', 'success');
      doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week')); // refresh
      if (detailBooking && (detailBooking._id === bId || detailBooking.id === bId)) {
         setDetailBooking(null);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };






  async function handleCancelRecurring(b) {
    if (!b.recurringGroupId) return;
    setCancelRecurringTarget(b);
    setShowCancelRecurringConfirm(true);
  }

  async function confirmCancelRecurring() {
    if (!cancelRecurringTarget?.recurringGroupId) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`${apiBase || API_BASE}/bookings/recurring/${cancelRecurringTarget.recurringGroupId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Hủy thất bại'); }
      showToastMsg('Đã hủy toàn bộ lịch định kỳ');
      setShowCancelRecurringConfirm(false); setCancelRecurringTarget(null);
      setShowRecurringGroupModal(false);
      refreshUserProfile();
      doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, (viewMode === 'list' || viewMode === 'week'));
    } catch (e) { showToastMsg(e.message, 'error'); }
    finally { setCancelLoading(false); }
  }

  /* ── calendar helpers ── */
  const bookingsByDate = useMemo(() => {
    const map = {};
    bookings.forEach(b => {
                    if (viewMode === 'week' && !b.isGroup) return;
      const key = localDateKey(b.bookingDate);
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [bookings]);

  const selectedDateBookings = useMemo(() => {
    if (!selectedDate) return [];
    return bookingsByDate[localDateKey(selectedDate)] || [];
  }, [selectedDate, bookingsByDate]);

  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const days = [];
    const prevDays = getDaysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({ date: new Date(y, m, prevDays - i), cur: false });
    }
    for (let d = 1; d <= daysInMonth; d++) days.push({ date: new Date(viewYear, viewMonth, d), cur: true });
    const rem = 42 - days.length;
    for (let d = 1; d <= rem; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({ date: new Date(y, m, d), cur: false });
    }
    return days;
  }, [viewYear, viewMonth]);

  function prevM() { setViewMonth(m => m === 0 ? 11 : m - 1); setViewYear(y => viewMonth === 0 ? y - 1 : y); setSelectedDate(null); }
  function nextM() { setViewMonth(m => m === 11 ? 0 : m + 1); setViewYear(y => viewMonth === 11 ? y + 1 : y); setSelectedDate(null); }
  function goToday() { const d = new Date(); d.setHours(0, 0, 0, 0); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()); setSelectedDate(new Date(d)); }

  const stats = useMemo(() => {
    const s = { total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    bookings.forEach(b => {
                    if (viewMode === 'week' && !b.isGroup) return; 
      const count = b.isGroup ? (b.groupCount || 1) : 1;
      s.total += count;
      if (s[b.status] !== undefined) s[b.status] += count; 
    });
    return s;
  }, [bookings]);

  const hasActiveFilters = Boolean(keyword || statusFilter || typeFilter || dateFrom || dateTo || (sort && sort !== '-createdAt'));

  return (
    <div className="space-y-6">
      {toast.show && (
        <div className="awp-toast-container">
          <div className={`awp-toast-message ${toast.type === 'error' ? 'awp-toast-error' : 'awp-toast-success'}`}>{toast.message}</div>
        </div>
      )}

      <main className="w-full space-y-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { id: 'pending', label: 'Chờ xử lý', value: stats.pending, color: '#f59e0b', bg: '#fffbeb', icon: '⏳' },
            { id: 'confirmed', label: 'Đã xác nhận', value: stats.confirmed, color: '#3b82f6', bg: '#eff6ff', icon: '✅' },
            { id: 'completed', label: 'Hoàn thành', value: stats.completed, color: '#10b981', bg: '#ecfdf5', icon: '🎉' },
            { id: 'cancelled', label: 'Đã hủy', value: stats.cancelled, color: '#6b7280', bg: '#f9fafb', icon: '❌' },
          ].map(s => {
            const isActive = statusFilter === s.id;
            return (
              <div
                key={s.label}
                onClick={() => onFilterChange(setStatusFilter, isActive ? '' : s.id)}
                className={`flex items-center gap-4 rounded-xl border bg-white px-4 py-4 cursor-pointer transition-all ${
                  isActive
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm bg-emerald-50/10'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: s.bg }}>
                  {s.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-bold text-slate-800">{s.value}</p>
                  <p className={`truncate text-xs font-medium ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── CALENDAR VIEW ── */}
        {viewMode === 'calendar' && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* cal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ background: 'linear-gradient(135deg,#e0f2fe,#ecfdf5)' }}>
              <button onClick={prevM} className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold" style={{ background: '#fff', color: '#0ea5e9', border: '1px solid #bae6fd', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>‹</button>
              <div className="text-center">
                <div className="text-lg font-extrabold tracking-tight" style={{ color: '#0f172a' }}>{MONTHS_VN[viewMonth]} {viewYear}</div>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <button onClick={goToday} className="px-3 py-0.5 rounded-full text-[11px] font-semibold border-none cursor-pointer" style={{ background: '#dcfce7', color: '#16a34a' }}>Hôm nay</button>
                  <button onClick={() => { setPickerYear(viewYear); setShowMonthPicker(true); }}
                    className="w-6 h-6 rounded-md flex items-center justify-center border-none cursor-pointer transition-colors"
                    style={{ background: '#f0f9ff', color: '#0284c7' }}
                    title="Chọn tháng">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </button>
                </div>
              </div>
              <button onClick={nextM} className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold" style={{ background: '#fff', color: '#0ea5e9', border: '1px solid #bae6fd', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>›</button>
            </div>

            {/* dow */}
            <div className="grid grid-cols-7 border-b border-slate-100">
              {DAYS_VN.map((d, i) => (
                <div key={d} className="py-2.5 text-center text-[11px] font-bold uppercase tracking-wider" style={{ color: i === 0 ? '#ef4444' : '#64748b' }}>{d}</div>
              ))}
            </div>

            {/* grid */}
            <div className="grid grid-cols-7">
              {calendarDays.map((day, idx) => {
                const key = localDateKey(day.date);
                const dayBks = bookingsByDate[key] || [];
                const isToday = isSameDay(day.date, new Date());
                const isSelected = selectedDate && isSameDay(day.date, selectedDate);
                return (
                  <div key={idx} onClick={() => setSelectedDate(day.date)}
                    className="min-h-[68px] p-1.5 cursor-pointer relative transition-colors"
                    style={{
                      borderRight: (idx % 7) < 6 ? '1px solid #f1f5f9' : 'none',
                      borderBottom: idx < 35 ? '1px solid #f1f5f9' : 'none',
                      background: isSelected ? '#eff6ff' : isToday ? '#fefce8' : day.cur ? '#fff' : '#f8fafc',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = day.cur ? '#fff' : '#f8fafc'; }}>
                    <div className="w-7 h-7 flex items-center justify-center rounded-lg text-[13px] font-semibold"
                      style={{
                        background: isToday ? '#0ea5e9' : isSelected ? '#e0f2fe' : 'transparent',
                        color: isToday ? '#fff' : isSelected ? '#0284c7' : day.cur ? '#334155' : '#cbd5e1',
                      }}>
                      {day.date.getDate()}
                    </div>
                    {dayBks.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                        {dayBks.slice(0, 3).map((b, i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full" style={{
                            background: b.status === 'completed' ? '#10b981' : b.status === 'cancelled' ? '#94a3b8' : b.status === 'pending' ? '#f59e0b' : '#3b82f6',
                          }} />
                        ))}
                        {dayBks.length > 3 && <span className="text-[8px] text-slate-400 font-bold">+{dayBks.length - 3}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* selected date detail */}
            {selectedDate && (
              <div className="border-t-2 border-slate-200 bg-slate-50" style={{ maxHeight: 360, overflow: 'auto' }}>
                <div className="sticky top-0 z-10 px-5 py-3 border-b border-slate-200 flex items-center justify-between" style={{ background: '#f0fdf4' }}>
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      {selectedDate.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {selectedDateBookings.length > 0 ? `${selectedDateBookings.length} lịch đặt` : 'Không có lịch'}
                    </div>
                  </div>
                  <button onClick={() => setSelectedDate(null)} className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 text-sm">✕</button>
                </div>

                {selectedDateBookings.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-sm">
                    <div className="text-3xl mb-2">📭</div>Không có lịch đặt
                  </div>
                ) : (
                  <div className="p-4 space-y-2.5">
                    {selectedDateBookings.map(b => {
                      const bId = b._id || b.id;
                      const st = STATUS_MAP[b.status] || { label: b.status, cls: 'bg-slate-50 text-slate-500 border-slate-200' };
                      const canReview = b.status === 'completed';
                      const hasReview = b.rating || b.feedback;
                      return (
                        <div key={bId} onClick={() => handleOpenViewBooking(b)} className="bg-white rounded-xl p-4 border border-slate-200 cursor-pointer transition-all hover:border-blue-400 hover:shadow-sm">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-slate-800">{b.packageName || b.packageSnapshot?.name || b.packageId?.name || 'Dịch vụ'}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{b.branchName || b.branchSnapshot?.name || b.branchId?.name || '—'} · {b.startTime || ''}</div>
                            </div>
                            <StatusBadge status={b.status} />
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              {b.vehicleId && <span>🚗 {b.vehicleId.licensePlate || ''}</span>}
                              {b.recurringGroupId && <span className="text-indigo-500">Định kỳ</span>}
                              {b.selectedSubServices && b.selectedSubServices.length > 0 && b.selectedSubServices.filter(s => s.isOptional !== false).map((sub, idx) => (
                                <div key={idx} onClick={(e) => { e.stopPropagation(); handleRemoveSubService(b, sub.name); }} className="group inline-flex items-center gap-1 cursor-pointer transition-colors hover:text-red-600">
                                  <span className="text-indigo-500 font-bold group-hover:hidden">+</span>
                                  <span className="text-red-500 font-bold hidden group-hover:inline">-</span>
                                  <span className="text-indigo-500 group-hover:text-red-600">{sub.name}</span>
                                </div>
                              ))}
                              {hasReview && <span className="text-amber-500">{'★'.repeat(b.rating || 0)}{'☆'.repeat(5 - (b.rating || 0))}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-emerald-600">{formatCurrency(b.finalPrice)}</span>
                              {(b.paymentStatus === 'paid' || (b.depositAmount > 0 && b.depositAmount >= (b.finalPrice || 0))) ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200">
                                  Đã thanh toán 100%
                                </span>
                              ) : b.depositAmount > 0 ? (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${b.depositPaid || b.paymentStatus === 'deposit_paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                  {b.depositPaid || b.paymentStatus === 'deposit_paid' ? `Đã cọc ${formatCurrency(b.depositAmount)}` : `Cọc ${formatCurrency(b.depositAmount)}`}
                                </span>
                              ) : null}
                              {canReview && (
                                <button onClick={(e) => { e.stopPropagation(); openReview(b); }}
                                  className="text-amber-500 hover:text-amber-600 text-[11px] font-semibold border-none bg-transparent cursor-pointer">
                                  {hasReview ? '✏️' : '⭐'}
                                </button>
                              )}
                            </div>
                          </div>
                          {(b.status === 'pending' || b.status === 'confirmed') && (
                            <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                              <button onClick={(e) => { e.stopPropagation(); handleShowQR(b); }}
                                className="text-[11px] font-semibold text-sky-600 hover:text-sky-500 border-none bg-transparent cursor-pointer">
                                📱 QR
                              </button>
                              {b.recurringGroupId && (
                                <button onClick={(e) => { e.stopPropagation(); handleCancelRecurring(b); }}
                                  disabled={cancelLoading}
                                  className="text-[11px] font-semibold text-red-500 hover:text-red-400 border-none bg-transparent cursor-pointer disabled:opacity-50">
                                  Hủy định kỳ
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleCancel(b); }}
                                disabled={cancelLoading}
                                className="text-[11px] font-semibold text-red-500 hover:text-red-400 border-none bg-transparent cursor-pointer disabled:opacity-50">
                                Hủy đơn
                              </button>
                            </div>
                          )}
                          {b.status === 'completed' && (
                            <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                              <button onClick={(e) => { e.stopPropagation(); handleRebook(b); }}
                                disabled={rebookLoading}
                                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 border-none bg-transparent cursor-pointer disabled:opacity-50">
                                Đặt lại
                              </button>
                              {b.status === 'completed' && ['paid', 'deposit_paid'].includes(b.paymentStatus) && !isRefundExpired(b) && (() => {
                                const existing = findRefundRequest(b._id || b.id);
                                if (existing?.status === 'pending') return <span className="text-[11px] font-semibold text-amber-600">⏳ Chờ hoàn tiền</span>;
                                return (
                                  <button onClick={(e) => { e.stopPropagation(); openRefundRequest(b); }}
                                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-500 border-none bg-transparent cursor-pointer">
                                    Yêu cầu hoàn tiền
                                  </button>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── WEEK VIEW ── */}
        {(viewMode === 'list' || viewMode === 'week') && (
          <>
            {/* Filter Bar Panel */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              {/* Row 1: Search + Status + Date range */}
              <div className="flex flex-col gap-3">
                {/* Search Input */}
                <div className="relative w-full">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={keyword}
                    onChange={e => onFilterChange(setKeyword, e.target.value)}
                    placeholder="Tìm theo gói dịch vụ, tên chi nhánh..."
                    className="w-full h-9 rounded-xl border border-slate-200 pl-10 pr-9 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50"
                  />
                  {keyword && (
                    <button
                      onClick={() => onFilterChange(setKeyword, '')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Status + Date range on same row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trạng thái</label>
                    <select
                      value={statusFilter}
                      onChange={e => onFilterChange(setStatusFilter, e.target.value)}
                      className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                    >
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Khoảng ngày hẹn</label>
                    <div className="flex items-center gap-1.5">
                      <input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => handleDateFromChange(e.target.value)}
                        className="flex-1 min-w-0 h-9 rounded-xl border border-slate-200 px-2 text-[11px] font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer" />
                      <span className="text-slate-300 text-[10px] font-bold shrink-0">đến</span>
                      <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => handleDateToChange(e.target.value)}
                        className="flex-1 min-w-0 h-9 rounded-xl border border-slate-200 px-2 text-[11px] font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced filter toggle + clear */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors"
                >
                  <svg className={`w-3.5 h-3.5 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  {showAdvancedFilters ? 'Ẩn bộ lọc nâng cao' : 'Lọc nâng cao'}
                </button>
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="px-3 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 text-[11px] font-bold transition-colors flex items-center gap-1"
                  >
                    ✕ Xóa bộ lọc
                  </button>
                )}
              </div>

              {/* Advanced filters: Type + Sort */}
              {showAdvancedFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  {viewMode !== 'week' && <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loại lịch</label>
                    <select
                      value={typeFilter}
                      onChange={e => onFilterChange(setTypeFilter, e.target.value)}
                      className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="">Tất cả loại lịch</option>
                      <option value="single">Lịch thường</option>
                      <option value="recurring">Lịch định kỳ</option>
                    </select>
                  </div>}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sắp xếp</label>
                    <select
                      value={sort}
                      onChange={e => onFilterChange(setSort, e.target.value)}
                      className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="-createdAt">Mới nhất (Ngày tạo)</option>
                      <option value="createdAt">Cũ nhất</option>
                      <option value="-bookingDate">Gần đây nhất (Ngày hẹn)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* list */}
            {loading ? (
              <div className="text-center py-20 text-slate-400 text-sm">Đang tải lịch sử...</div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                </div>
                <p className="text-slate-500 font-medium">Chưa có lịch đặt nào</p>
                <button onClick={onBack} className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors">Quay lại trang chủ</button>
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const upcoming = [];
                  const past = [];
                  const today = new Date();
                  today.setHours(0,0,0,0);
                  
                  bookings.forEach(b => {
                    if (viewMode === 'week' && !b.isGroup) return;
                    const bDate = new Date(b.bookingDate);
                    bDate.setHours(0,0,0,0);
                    if (bDate >= today) upcoming.push(b);
                    else past.push(b);
                  });
                  
                  upcoming.sort((a, b) => new Date(b.createdAt || b._id) - new Date(a.createdAt || a._id));
                  past.sort((a, b) => new Date(b.createdAt || b._id) - new Date(a.createdAt || a._id));
                  
                  const renderBookingCard = (b) => {
                    const bId = b._id || b.id;
                    const canReview = b.status === 'completed';
                    const hasReview = b.rating || b.feedback;
                    const isNewB = checkIsNew(b);
                    
                    return (
                      <div key={bId} onClick={() => handleOpenViewBooking(b)} className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer relative overflow-hidden group">
                        {/* Status color bar */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                          b.status === 'completed' ? 'bg-emerald-500' :
                          b.status === 'pending' ? 'bg-amber-400' :
                          b.status === 'confirmed' ? 'bg-blue-500' :
                          b.status === 'cancelled' ? 'bg-slate-300' : 'bg-slate-200'
                        }`} />
                        
                        <div className="flex items-start justify-between gap-4 pl-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">{b.packageName || b.packageSnapshot?.name || b.packageId?.name || 'Dịch vụ'}</span>
                              <StatusBadge status={b.status} />
                              {isNewB && (
                                <span className="px-2 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider shadow-sm animate-pulse">MỚI</span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500 font-medium">{b.branchName || b.branchSnapshot?.name || b.branchId?.name || ''}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-black text-slate-900">{formatCurrency(b.finalPrice)}</p>
                            {(b.paymentStatus === 'paid' || (b.depositAmount > 0 && b.depositAmount >= (b.finalPrice || 0))) ? (
                              <span className="inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-emerald-50 text-emerald-600 border-emerald-200">
                                Đã thanh toán 100%
                              </span>
                            ) : b.depositAmount > 0 ? (
                              <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${b.depositPaid || b.paymentStatus === 'deposit_paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                                {b.depositPaid || b.paymentStatus === 'deposit_paid' ? `Đã cọc ${formatCurrency(b.depositAmount)}` : `Cần cọc ${formatCurrency(b.depositAmount)}`}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {/* Row 1: Vehicle & Schedule Details */}
                        <div className="mt-3 pl-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600 pb-2.5 border-b border-slate-100">
                          {b.vehicleId && <span className="flex items-center gap-1.5"><svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 13v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" /></svg><span className="bg-slate-900 text-white font-mono font-bold text-xs px-2.5 py-0.5 rounded tracking-wider shadow-2xs">{b.vehicleId.licensePlate || ''}</span></span>}
                          {b.bookingDate && <span className="flex items-center gap-1.5"><svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg><span className="font-semibold text-slate-800">{formatDate(b.bookingDate)}</span></span>}
                          {b.startTime && <span className="flex items-center gap-1.5"><svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg><span className="font-semibold text-slate-800">{b.startTime}{b.endTime ? ` - ${b.endTime}` : ''}</span></span>}
                          {b.bookingCode ? <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80">#{b.bookingCode}</span> : b.recurringGroupId && b.isGroup ? <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80">#{String(b.recurringGroupId).slice(-6).toUpperCase()}</span> : null}
                          {b.recurringGroupId && <span className="text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200/80 flex items-center gap-1"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.5" /></svg>Định kỳ</span>}
                          {b.status !== 'completed' && b.status !== 'cancelled' && b.status !== 'refunded' && b.paymentStatus !== 'refunded' && ((b.finalPrice || 0) > 0) && (
                            <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80">
                              🎁 Dự kiến +{Math.floor(((b.finalPrice || 0) * 5) / 100).toLocaleString('vi-VN')} điểm
                            </span>
                          )}
                        </div>

                        {/* Review rating */}
                        {hasReview && (
                          <div className="mt-3 pl-3 text-amber-500 font-medium font-bold text-xs pt-1">
                            {'★'.repeat(b.rating || 0)}{'☆'.repeat(5 - (b.rating || 0))}
                          </div>
                        )}
                          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100 pl-3">
                            <button onClick={(e) => { e.stopPropagation(); handleOpenViewBooking(b); }}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-all cursor-pointer">
                              Xem chi tiết
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleOpenDetailBooking(b); }}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200/80 transition-all cursor-pointer">
                              Xem hóa đơn
                            </button>
                            {b.status !== 'cancelled' && b.paymentStatus !== 'paid' && (
                              <button onClick={(e) => { e.stopPropagation(); handlePayRemaining(b); }}
                                disabled={cancelLoading}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-500/20 transition-all shadow-xs cursor-pointer disabled:opacity-50">
                                Thanh toán ngay
                              </button>
                            )}
                            {(b.status === 'pending' || b.status === 'confirmed') && (
                              <button onClick={(e) => { e.stopPropagation(); handleShowQR(b); }}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-all shadow-xs cursor-pointer">
                                Xem QR
                              </button>
                            )}
                            {(b.status === 'pending' || b.status === 'confirmed') && b.recurringGroupId && (
                              <button onClick={(e) => { e.stopPropagation(); handleCancelRecurring(b); }}
                                disabled={cancelLoading}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-all cursor-pointer disabled:opacity-50">
                                Hủy định kỳ
                              </button>
                            )}
                            {(b.status === 'pending' || b.status === 'confirmed') && (
                              <button onClick={(e) => { e.stopPropagation(); handleCancel(b); }}
                                disabled={cancelLoading}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-red-600 bg-red-50/80 hover:bg-red-100 border border-red-200/80 transition-all cursor-pointer disabled:opacity-50">
                                Hủy đơn
                              </button>
                            )}
                            {b.status === 'completed' && (
                              <>
                                {!(b.status === 'refunded' || b.paymentStatus === 'refunded') && (
                                  <button onClick={(e) => {
                                    e.stopPropagation();
                                    const ph = (pointHistories || []).find(p => String(p.referenceId?._id || p.referenceId) === String(b._id || b.id));
                                    if (ph) {
                                      navigate(`/rewards/history/${ph._id}?tab=reward`);
                                    } else {
                                      navigate('/rewards?tab=history');
                                    }
                                  }}
                                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all cursor-pointer">
                                    🏆 Xem điểm thưởng
                                  </button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); handleRebook(b); }}
                                  disabled={rebookLoading}
                                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all disabled:opacity-50">
                                  Đặt lại
                                </button>
                                {['paid', 'deposit_paid'].includes(b.paymentStatus) && !isRefundExpired(b) && (() => {
                                  const existing = findRefundRequest(b._id || b.id);
                                  if (existing?.status === 'pending') {
                                    return (
                                      <div className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 cursor-default" onClick={e => e.stopPropagation()}>
                                        ⏳ Đang chờ hoàn tiền
                                      </div>
                                    );
                                  }
                                  return (
                                    <button onClick={(e) => { e.stopPropagation(); openRefundRequest(b); }}
                                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all">
                                      Yêu cầu hoàn tiền
                                    </button>
                                  );
                                })()}
                              </>
                            )}
                            {canReview && !hasReview && (
                              <button onClick={(e) => { e.stopPropagation(); openReview(b); }}
                                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1.5">
                                ⭐ Đánh giá
                              </button>
                            )}
                            {hasReview && (
                              <button onClick={(e) => { e.stopPropagation(); openReview(b); }}
                                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors flex items-center gap-1.5">
                                ✏️ {b.feedback ? 'Xem đánh giá' : 'Sửa đánh giá'}
                              </button>
                            )}
                          </div>

                            {/* NEW: Timeline Accordion for recurring groups */}
                            {b.isGroup && (
                              <>
                                <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-slate-100 pl-3">
                                   <div className="flex items-center gap-3 flex-1">
                                      <button onClick={(e) => {
                                          e.stopPropagation();
                                          markBookingAsViewed(bId || b.recurringGroupId);
                                          const isExpanded = recurringGroupTarget && (recurringGroupTarget._id === bId || recurringGroupTarget.id === bId) && showRecurringGroupModal;
                                          if (isExpanded) {
                                            setShowRecurringGroupModal(false);
                                          } else {
                                            setRecurringGroupTarget(b);
                                            setShowRecurringGroupModal(true);
                                          }
                                      }} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center gap-1.5">
                                        <span>{(recurringGroupTarget && (recurringGroupTarget._id === bId || recurringGroupTarget.id === bId) && showRecurringGroupModal) ? 'Đóng danh sách' : 'Xem danh sách buổi'}</span>
                                        <svg className={`w-3.5 h-3.5 transition-transform ${(recurringGroupTarget && (recurringGroupTarget._id === bId || recurringGroupTarget.id === bId) && showRecurringGroupModal) ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                                      </button>
                                   </div>
                                </div>
                                {(recurringGroupTarget && (recurringGroupTarget._id === bId || recurringGroupTarget.id === bId) && showRecurringGroupModal) && (
                                  <div className="mt-4 pt-4 border-t border-slate-100 pl-3 pr-3 cursor-default" onClick={e => e.stopPropagation()}>
                                    {recurringGroupLoading ? (
                                      <div className="py-6 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                                        <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                                        Đang tải dữ liệu các buổi...
                                      </div>
                                    ) : recurringGroupBookings.length === 0 ? (
                                      <div className="py-6 text-center text-slate-400 text-sm">Không có dữ liệu</div>
                                    ) : (
                                      <div className="relative border-l-2 border-indigo-100 ml-3 pl-6 space-y-6 pb-2">
                                        {recurringGroupBookings.map((rb, idx) => {
                                          const rbId = rb._id || rb.id;
                                          const isDone = rb.status === 'completed';
                                          const isCancelled = rb.status === 'cancelled';
                                          return (
                                            <div key={rbId} className="relative">
                                              <div className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${isDone ? 'bg-emerald-500' : isCancelled ? 'bg-slate-300' : 'bg-indigo-400'}`} />
                                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 hover:bg-white hover:border-indigo-200 transition-colors group/item">
                                                <div>
                                                  <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-bold text-slate-500">Buổi {idx + 1}</span>
                                                    <span className="font-semibold text-slate-800 text-sm">{formatDate(rb.bookingDate)} · {rb.startTime}</span>
                                                  </div>
                                                  <StatusBadge status={rb.status} />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <button onClick={() => setChildBookingDetailId(rbId)}
                                                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-indigo-700 bg-indigo-100/50 hover:bg-indigo-100 transition-colors whitespace-nowrap">
                                                    Chi tiết
                                                  </button>
                                                  {(rb.status === 'pending' || rb.status === 'confirmed') && (
                                                    <>
                                                      <button onClick={() => handleShowQR(rb)}
                                                        className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-sky-700 bg-sky-100/50 hover:bg-sky-100 transition-colors whitespace-nowrap">
                                                        Xem QR
                                                      </button>
                                                      <button onClick={() => handleCancel(rb)} disabled={cancelLoading}
                                                        className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors whitespace-nowrap">
                                                        Hủy
                                                      </button>
                                                    </>
                                                  )}
                                                  {rb.status === 'completed' && (
                                                    <button onClick={() => openReview(rb)}
                                                      className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-amber-700 bg-amber-100/50 hover:bg-amber-100 transition-colors whitespace-nowrap">
                                                      Đánh giá
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                      </div>
                    );

                  };


                  return (
                    <>
                      {upcoming.length > 0 && (
                        <div>
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>Sắp tới
                          </h3>
                          <div className="space-y-4">
                            {upcoming.map(renderBookingCard)}
                          </div>
                        </div>
                      )}
                      {past.length > 0 && (
                        <div className={upcoming.length > 0 ? "pt-4 border-t border-slate-200" : ""}>
                          <h3 className="text-sm font-black text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>Đã qua
                          </h3>
                          <div className="space-y-4">
                            {past.map(renderBookingCard)}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Pagination Controls */}
            <CustomerPagination
              pagination={pagination}
              page={page}
              limit={limit}
              setPage={setPage}
              itemName="lịch hẹn"
            />
          </>
        )}

        {/* ── SLOT PACKS VIEW ── */}
        {viewMode === 'slot_packs' && (
          <div className="space-y-6">
            {slotPacksLoading ? (
              <div className="text-center py-20 text-slate-400 text-sm">Đang tải lịch sử gói lượt...</div>
            ) : slotPacks.filter(p => p.status !== 'cancelled' && p.status !== 'exhausted' && p.remainingSlots > 0).length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                </div>
                <p className="text-slate-500 font-medium">Bạn chưa mua gói lượt nào</p>
                <button onClick={() => navigate('/booking?tab=slot_pack')} className="mt-4 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors cursor-pointer">Mua ngay</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {slotPacks.filter(p => p.status !== 'cancelled' && p.status !== 'exhausted' && p.remainingSlots > 0).map(p => (
                  <PackCard
                    key={p._id}
                    pack={p}
                    onQuickBook={setQuickBookPack}
                    onCancelPack={setPackToCancel}
                    apiBase={apiBase || API_BASE}
                    token={token}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── DETAIL MODAL (RECEIPT TEMPLATE) ── */}
      {detailBooking && (() => {
        const vatRate = detailBooking?.vatPercent ?? configs?.VAT_PERCENT ?? 10;
        const displayTotal = detailBooking.isGroup ? (detailBooking.groupTotalPrice || 0) : (detailBooking.totalAmount || detailBooking.finalPrice || 0);
        const displayDeposit = detailBooking.isGroup ? (detailBooking.groupTotalDeposit || 0) : (detailBooking.depositAmount || 0);
        const displayId = detailBooking.isGroup ? (detailBooking.recurringGroupId || detailBooking._id) : detailBooking._id;
        const displayInvoiceNumber = String(displayId).slice(-8).toUpperCase();
        
        return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          onClick={() => setDetailBooking(null)}>
          <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] font-sans text-slate-900 relative" onClick={e => e.stopPropagation()}>
            
            {/* Close Button Absolute */}
            <button onClick={() => setDetailBooking(null)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            {/* Receipt Body */}
            <div className="px-10 py-12 overflow-y-auto flex-1 selection:bg-slate-200">
              
              {/* Header */}
              <div className="flex justify-between items-start mb-12">
                <div>
                  <h2 className="text-3xl font-bold mb-6 text-black tracking-tight">Biên lai</h2>
                  <div className="grid grid-cols-[140px_1fr] gap-y-1 text-[13px]">
                    <div className="font-semibold text-black">Mã hóa đơn</div>
                    <div className="text-black">AWP-{displayInvoiceNumber}</div>
                    <div className="font-semibold text-black">Mã biên lai</div>
                    <div className="text-black">{displayId}</div>
                    <div className="font-semibold text-black">Ngày thanh toán</div>
                    <div className="text-black">{formatDateTime(detailBooking.updatedAt || detailBooking.bookingDate)}</div>
                  </div>
                </div>
                <div>
                  {/* LOGO */}
                  <div className="text-4xl font-black tracking-tighter select-none">
                    AW<span className="text-slate-400">P</span>
                  </div>
                </div>
              </div>

              {/* Addresses */}
              <div className="grid grid-cols-2 gap-8 mb-12 text-[13px] leading-relaxed">
                <div>
                  <div className="font-semibold text-black mb-1">AutoWash Pro</div>
                  <div className="text-black">
                    {detailBooking.branchName || detailBooking.branchId?.name || 'Chi nhánh trung tâm'}<br/>
                    {detailBooking.branchId?.address || '123 Đường Rửa Xe'}<br/>
                    Hồ Chí Minh, Việt Nam<br/>
                    support@autowashpro.com
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-black mb-1">Khách hàng</div>
                  <div className="text-black">
                    {detailBooking.userId?.name || 'Khách hàng'} {detailBooking.userId?.phone || ''}<br/>
                    Biển số xe: {detailBooking.vehiclePlate || detailBooking.vehicleId?.licensePlate || 'Chưa cập nhật'}<br/>
                    Email: {detailBooking.userId?.email || ''}
                  </div>
                </div>
              </div>

              {/* Big Payment Status */}
              <div className="mb-10">
                <h3 className="text-2xl font-bold text-black mb-3">
                  {formatCurrency(displayTotal)} {detailBooking.paymentStatus === 'paid' ? `đã thanh toán vào ${formatDate(detailBooking.updatedAt || detailBooking.bookingDate)}` : `cần thanh toán vào ${formatDate(detailBooking.bookingDate)}`}
                </h3>
                <p className="text-[13px] text-black max-w-xl leading-relaxed">
                  Cảm ơn quý khách đã sử dụng dịch vụ của AutoWash Pro.<br/>
                  Quý khách có thể thanh toán bằng tiền mặt, chuyển khoản hoặc sử dụng thẻ thành viên.<br/>
                  --------------------------------<br/>
                  ĐỊA CHỈ THANH TOÁN:<br/>
                  AutoWash Pro<br/>
                  Hồ Chí Minh, Việt Nam
                </p>
                <p className="text-[13px] text-black mt-4">
                  Giá đã bao gồm {vatRate}% VAT.
                </p>
              </div>

              {/* Table */}
              <div className="mb-14">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="py-2 text-left font-normal text-black w-1/2">Mô tả</th>
                      <th className="py-2 text-right font-normal text-black">SL</th>
                      <th className="py-2 text-right font-normal text-black">Đơn giá</th>
                      <th className="py-2 text-right font-normal text-black">Thuế</th>
                      <th className="py-2 text-right font-normal text-black">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="py-3 text-left align-top">
                        <div className="font-normal text-black">{detailBooking.packageName || detailBooking.packageId?.name || 'Dịch vụ rửa xe'}</div>
                        {!detailBooking.isGroup && <div className="text-black">{formatDate(detailBooking.bookingDate)} • {detailBooking.startTime || '—'}</div>}
                        {detailBooking.isGroup && (
                          <div className="mt-2 space-y-1">
                            {recurringGroupLoading ? (
                              <div className="text-slate-500 text-xs italic">Đang tải chi tiết buổi...</div>
                            ) : (
                              recurringGroupBookings.map((rb, idx) => (
                                <div key={idx} className="text-slate-600 text-xs flex gap-2 items-center">
                                  <span>Buổi {idx + 1}: {formatDate(rb.bookingDate)} • {rb.startTime}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100">{STATUS_MAP[rb.status]?.label || rb.status}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-right text-black align-top">{detailBooking.isGroup ? detailBooking.groupCount : 1}</td>
                      <td className="py-3 text-right text-black align-top">
                        {detailBooking.bookingType === 'slot_pack_usage' ? (
                          <span className="line-through text-slate-400 mr-2">{formatCurrency(detailBooking.packagePrice || detailBooking.packageId?.price || 0)}</span>
                        ) : null}
                        {formatCurrency(detailBooking.bookingType === 'slot_pack_usage' ? 0 : (detailBooking.packagePrice || detailBooking.packageId?.price || detailBooking.finalPrice || detailBooking.totalAmount))}
                      </td>
                      <td className="py-3 text-right text-black align-top">{vatRate}%</td>
                      <td className="py-3 text-right text-black align-top">{formatCurrency(detailBooking.bookingType === 'slot_pack_usage' ? 0 : (detailBooking.packagePrice || detailBooking.packageId?.price || detailBooking.finalPrice || detailBooking.totalAmount))}</td>
                    </tr>
                    
                    {/* Included services rows */}
                    {(() => {
                      const included = Array.isArray(detailBooking.includedSubServices) && detailBooking.includedSubServices.length > 0
                        ? detailBooking.includedSubServices
                        : (Array.isArray(detailBooking.packageSnapshot?.subServices)
                            ? detailBooking.packageSnapshot.subServices.filter(s => s.isOptional === false)
                            : (Array.isArray(detailBooking.packageId?.subServices) ? detailBooking.packageId.subServices.filter(s => s.isOptional === false) : []));
                      return included.map((sub, i) => (
                        <tr key={`inc-${i}`} className="border-b border-slate-100/60">
                          <td colSpan={5} className="py-2 text-left text-emerald-600 pl-4 text-[13px] font-medium">
                            • {sub.name} <span className="text-[11px] text-emerald-500 font-normal">(có sẵn)</span>
                          </td>
                        </tr>
                      ));
                    })()}

                    {/* Sub-services rows */}
                    {detailBooking.selectedSubServices && detailBooking.selectedSubServices.filter(s => s.isOptional !== false).map((sub, i) => (
                      <tr key={`sub-${i}`} className="border-b border-slate-100">
                        <td className="py-2 text-left text-black pl-4 text-indigo-600">+ {sub.name} <span className="text-[10px] text-indigo-400 font-normal">(thêm)</span></td>
                        <td className="py-2 text-right text-black">1</td>
                        <td className="py-2 text-right text-black">{formatCurrency(sub.price)}</td>
                        <td className="py-2 text-right text-black">{vatRate}%</td>
                        <td className="py-2 text-right text-black">{formatCurrency(sub.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Summary */}
                <div className="flex justify-end mt-6">
                  <div className="w-[300px] text-[13px]">
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-black">Tạm tính</span>
                      <span className="text-black">{formatCurrency(displayTotal + (detailBooking.discountAmount || 0))}</span>
                    </div>
                    {detailBooking.voucherCode && (
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-emerald-600 font-medium">Voucher ({detailBooking.voucherCode})</span>
                        <span className="text-emerald-600 font-medium">-{formatCurrency(detailBooking.discountAmount || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-black">Tổng tiền (chưa VAT)</span>
                      <span className="text-black">{formatCurrency(Math.round((displayTotal) * (1 - vatRate / 100)))}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-black">Thuế VAT ({vatRate}%)</span>
                      <span className="text-black">{formatCurrency(Math.round((displayTotal) * (vatRate / 100)))}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="font-normal text-black">Tổng cộng</span>
                      <span className="font-normal text-black">{formatCurrency(displayTotal)}</span>
                    </div>
                    {detailBooking.paymentStatus === 'deposit_paid' && (
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="font-normal text-black">Đã đặt cọc</span>
                        <span className="font-normal text-black">-{formatCurrency(displayDeposit || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1.5 border-b border-black">
                      <span className="font-bold text-black">Số tiền {detailBooking.paymentStatus === 'paid' ? 'đã thanh toán' : 'cần thanh toán'}</span>
                      <span className="font-bold text-black">
                        {detailBooking.paymentStatus === 'paid' 
                          ? formatCurrency(displayTotal)
                          : detailBooking.paymentStatus === 'deposit_paid'
                            ? formatCurrency(Math.max(0, (displayTotal || 0) - (displayDeposit || 0)))
                            : formatCurrency(displayTotal)
                        }
                      </span>
                    </div>
                    </div>
                  </div>
                </div>

              {/* Payment History */}
              <div>
                <h3 className="text-xl font-bold text-black mb-4">Lịch sử thanh toán</h3>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="py-2 text-left font-normal text-black">Phương thức</th>
                      <th className="py-2 text-left font-normal text-black">Ngày</th>
                      <th className="py-2 text-left font-normal text-black">Mã đơn</th>
                      <th className="py-2 text-right font-normal text-black">Số tiền</th>
                      <th className="py-2 text-right font-normal text-black">Mã biên lai</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="py-3 text-left text-black">
                        {detailBooking.paymentStatus === 'paid' ? 'Chuyển khoản' : (detailBooking.paymentStatus === 'deposit_paid' ? 'Đặt cọc' : 'Chưa thanh toán')}
                      </td>
                      <td className="py-3 text-left text-black">{formatDate(detailBooking.updatedAt || detailBooking.bookingDate)}</td>
                      <td className="py-3 text-left font-mono font-bold text-emerald-700">#{detailBooking.bookingCode || ''}</td>
                      <td className="py-3 text-right text-black">
                        {detailBooking.paymentStatus === 'paid' 
                          ? formatCurrency(displayTotal) 
                          : (detailBooking.paymentStatus === 'deposit_paid' ? formatCurrency(displayDeposit) : '0đ')}
                      </td>
                      <td className="py-3 text-right text-black">AWP-{displayInvoiceNumber}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Status Badge & Feedback for Service Info */}
              <div className="mt-12 flex items-center justify-between border-t border-slate-200 pt-8">
                <div className="flex items-center gap-4">
                  <span className="text-[13px] font-semibold text-black">Trạng thái:</span>
                  <StatusBadge status={detailBooking.status} />
                </div>
                {detailBooking.feedback && (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-black">Rating:</span>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map((s) => (
                        <span key={s} className={`text-base leading-none ${s <= (detailBooking.rating || 0) ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {detailBooking.feedback && (
                <div className="mt-2 text-[13px] text-slate-600 italic">"{detailBooking.feedback}"</div>
              )}
              {detailBooking.managerNote && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-[12px] font-semibold text-amber-800 mb-1">Ghi chú từ quản lý:</div>
                  <div className="text-[13px] text-amber-900">{detailBooking.managerNote}</div>
                </div>
              )}

            </div>

            {/* Footer Actions (Sticky) */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-3">
              {(!detailBooking.isGroup && (detailBooking.status === 'pending' || detailBooking.status === 'confirmed')) && (
                <>
                  <button onClick={() => { setDetailBooking(null); handleCancel(detailBooking); }} disabled={cancelLoading}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-red-200 bg-white text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 text-center">
                    Hủy đơn
                  </button>
                  <button onClick={() => { setDetailBooking(null); handleShowQR(detailBooking); }}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-black text-white text-sm font-semibold hover:bg-slate-800 transition-colors text-center">
                    Mã QR
                  </button>
                </>
              )}
              {(detailBooking.isGroup && recurringGroupBookings.some(b => b.status === 'pending' || b.status === 'confirmed')) && (
                <>
                  <button onClick={() => { setDetailBooking(null); handleCancelRecurring(detailBooking); }} disabled={cancelLoading}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-red-200 bg-white text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 text-center">
                    Hủy lịch trình định kỳ
                  </button>
                  <button onClick={() => { setDetailBooking(null); handleShowQR(detailBooking); }}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-black text-white text-sm font-semibold hover:bg-slate-800 transition-colors text-center">
                    Mã QR
                  </button>
                </>
              )}
              {detailBooking.status === 'completed' && (
                <>
                  <button onClick={() => { setDetailBooking(null); handleRebook(detailBooking); }} disabled={rebookLoading}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-black text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 text-center">
                    Đặt lại
                  </button>
                  {detailBooking.status === 'completed' && ['paid', 'deposit_paid'].includes(detailBooking.paymentStatus) && !isRefundExpired(detailBooking) && (() => {
                    const existing = findRefundRequest(detailBooking._id || detailBooking.id);
                    if (existing?.status === 'pending') {
                      return (
                        <div className="flex-1 px-4 py-2.5 rounded-lg bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-200 text-center cursor-default">
                          Đang chờ hoàn tiền
                        </div>
                      );
                    }
                    return (
                      <button onClick={() => { setDetailBooking(null); openRefundRequest(detailBooking); }}
                        className="flex-1 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold hover:bg-rose-100 transition-colors text-center">
                        Yêu cầu hoàn tiền
                      </button>
                    );
                  })()}
                  {!detailBooking.isGroup && detailBooking.status === 'completed' && (
                    <button onClick={() => { setDetailBooking(null); openReview(detailBooking); }}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors text-center ${detailBooking.rating ? 'border border-slate-300 bg-white text-black hover:bg-slate-50' : 'bg-black text-white hover:bg-slate-800'}`}>
                      {detailBooking.rating ? 'Sửa đánh giá' : 'Đánh giá'}
                    </button>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
        );
      })()}



      {/* ── REVIEW MODAL ── */}
      {showReviewModal && reviewTarget && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => { setShowReviewModal(false); setReviewTarget(null); }}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl relative border border-slate-100 animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { setShowReviewModal(false); setReviewTarget(null); }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition-all cursor-pointer"
            >
              ✕
            </button>

            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-white flex items-center justify-center text-2xl mb-3 shadow-md shadow-amber-500/20">
              ⭐
            </div>

            <h3 className="text-xl font-black text-slate-900 mb-0.5">Đánh giá dịch vụ</h3>
            <p className="text-xs font-medium text-slate-500 mb-4">
              {reviewTarget.packageId?.name || 'Dịch vụ'} · {reviewTarget.branchId?.name || 'Chi nhánh'}
            </p>

            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 text-center">
                <label className="text-xs font-bold text-slate-700 block mb-1 uppercase tracking-wider">Chất lượng dịch vụ</label>
                <StarRating value={rating} onChange={setRating} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Nhận xét của bạn (không bắt buộc)</label>
                <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                  rows={3} maxLength={1000} placeholder="Chia sẻ trải nghiệm sử dụng dịch vụ của bạn tại AutoWash Pro..."
                  className="w-full rounded-2xl border border-slate-200 p-3.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 resize-none transition-all placeholder:text-slate-400" />
                <p className="text-[10px] font-medium text-slate-400 mt-1 text-right">{feedbackText.length}/1000</p>
              </div>

              {reviewTarget.managerReply && (
                <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-3.5 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[11px] mb-1 uppercase tracking-wider">
                    <span>💬</span> Phản hồi từ chi nhánh
                  </div>
                  <p className="text-emerald-900 italic font-medium leading-relaxed">"{reviewTarget.managerReply}"</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowReviewModal(false); setReviewTarget(null); }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer">
                  Hủy
                </button>
                <button type="submit" disabled={submitting || rating === 0}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white text-xs font-bold transition-all shadow-md shadow-amber-500/20 disabled:opacity-40 disabled:shadow-none cursor-pointer">
                  {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CANCEL CONFIRM MODAL ── */}
      {/* ── PAY REMAINING MODAL ── */}
      {payRemainingTarget && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !payRemainingLoading && setPayRemainingTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden relative" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Thanh toán phần còn lại</h3>
                <p className="text-xs text-slate-500 mt-1">Chọn phương thức thanh toán</p>
              </div>
              <button onClick={() => !payRemainingLoading && setPayRemainingTarget(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300">
                ✕
              </button>
            </div>
            
            <div className="p-5 space-y-3">
              <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${payRemainingMethod === 'vnpay' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold">VN</div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">Thanh toán qua VNPAY</div>
                    <div className="text-xs text-slate-500">Thẻ ATM / QR Code / VNPAY</div>
                  </div>
                </div>
                <input type="radio" name="payRemainingMethod" value="vnpay" checked={payRemainingMethod === 'vnpay'} onChange={() => setPayRemainingMethod('vnpay')} className="hidden" />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${payRemainingMethod === 'vnpay' ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
                  {payRemainingMethod === 'vnpay' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </label>

              <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${payRemainingMethod === 'bank' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">🏦</div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">Ngân hàng (SePay)</div>
                    <div className="text-xs text-slate-500">Chuyển khoản QR code tự động</div>
                  </div>
                </div>
                <input type="radio" name="payRemainingMethod" value="bank" checked={payRemainingMethod === 'bank'} onChange={() => setPayRemainingMethod('bank')} className="hidden" />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${payRemainingMethod === 'bank' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                  {payRemainingMethod === 'bank' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </label>

              <label className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-colors ${payRemainingMethod === 'wallet' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">💳</div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">Thanh toán từ Ví</div>
                    <div className="text-xs text-slate-500">Số dư ví của bạn: <span className="font-bold text-emerald-600">{user?.walletBalance ? formatCurrency(user.walletBalance) : '0đ'}</span></div>
                  </div>
                </div>
                <input type="radio" name="payRemainingMethod" value="wallet" checked={payRemainingMethod === 'wallet'} onChange={() => setPayRemainingMethod('wallet')} className="hidden" />
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${payRemainingMethod === 'wallet' ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                  {payRemainingMethod === 'wallet' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </label>
            </div>
            
            <div className="p-5 border-t border-slate-100 bg-slate-50">
              <button 
                onClick={confirmPayRemaining}
                disabled={payRemainingLoading}
                className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
              >
                {payRemainingLoading ? 'Đang xử lý...' : (payRemainingMethod === 'bank' ? 'Tạo mã QR' : 'Xác nhận thanh toán ngay')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Remaining Bank QR Modal */}
      <AnimatePresence>
        {payRemainingBankQR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPayRemainingBankQR(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100/80"
              onClick={e => e.stopPropagation()}
            >
              <div className="pt-4 pb-2 text-center px-6">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-1 bg-emerald-50 border-2 border-emerald-100">
                  <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M12 12a3 3 0 100-6 3 3 0 000 6z" /><path d="M2 12v4h20v-4" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800">Chuyển khoản ngân hàng</h3>
                <p className="text-slate-400 text-[11px] mt-0.5">Quét mã QR hoặc chuyển khoản thủ công</p>
              </div>

              {payRemainingBankQR.qrCode && (
                <div className="px-6 pb-1 flex justify-center">
                  <div className="bg-white rounded-xl border-2 border-slate-100 p-2.5 shadow-sm">
                    <img src={payRemainingBankQR.qrCode} alt="QR code" className="w-32 h-32" />
                  </div>
                </div>
              )}

              <div className="px-5 py-1 space-y-2">
                <div className="bg-slate-50 rounded-xl p-2 text-center">
                  <div className="text-xs text-slate-400 mb-1">Số tiền cần chuyển</div>
                  <div className="text-2xl font-black text-emerald-600">{formatCurrency(payRemainingBankQR.amount || 0)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Thanh toán phần còn lại
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-semibold">Ngân hàng</span>
                    <span className="text-xs font-bold text-slate-700">{payRemainingBankQR.bankInfo?.bankName || 'Ngân hàng TMCP Quân đội (MB)'}</span>
                  </div>
                  <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-semibold">Số tài khoản</span>
                    <span className="text-xs font-bold text-slate-700 font-mono tracking-wider">{payRemainingBankQR.bankInfo?.accountNumber || '6200320046868'}</span>
                  </div>
                  <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-semibold">Chủ tài khoản</span>
                    <span className="text-xs font-bold text-slate-700">{payRemainingBankQR.bankInfo?.accountHolder || 'CONG TY CO PHAN AUTO WASH PRO'}</span>
                  </div>
                  <div className="px-3 py-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-slate-400 font-semibold">Nội dung CK</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(payRemainingBankQR.bankInfo?.transferContent || `THANH TOAN ${payRemainingBankQR.transactionId}`);
                          alert('Đã copy nội dung CK!');
                        }}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-wider"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="text-sm font-bold text-slate-700 font-mono bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center tracking-wider">
                      {payRemainingBankQR.bankInfo?.transferContent || `THANH TOAN ${payRemainingBankQR.transactionId}`}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-semibold">Mã giao dịch</span>
                  <span className="text-xs font-bold text-slate-700 font-mono">{payRemainingBankQR.transactionId}</span>
                </div>
                <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 pt-0.5">
                  <RefreshCw className={`w-3 h-3 ${qrPollCount % 2 === 0 ? 'animate-spin' : ''}`} />
                  Đang kiểm tra thanh toán...
                </div>
              </div>

              <div className="p-3 bg-slate-50 border-t border-slate-100">
                <button type="button" onClick={() => setPayRemainingBankQR(null)}
                  className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                  Hủy / Đóng
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CANCEL CONFIRM MODAL ── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => { if (!cancelLoading) { setShowCancelConfirm(false); setCancelTarget(null); setCancelConfirmError(''); setCancelReason(''); setCancelOtp(''); setCancelStep(1); setCancelPreview(null); } }}>
          <div className="bg-white rounded-[1.5rem] w-full max-w-sm p-8 shadow-xl text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Xác nhận hủy lịch hẹn</h3>
            <p className="text-sm text-slate-500 mb-6">
              Bạn có chắc chắn muốn hủy đơn hàng này? Vui lòng nhập lý do hủy bên dưới.
            </p>
            
            <div className="text-left mb-6">
              {/* ── Cảnh báo hoàn tiền / phạt ── */}
              {cancelPreview && cancelPreview.totalPaid > 0 && (
                <div className={`mb-4 px-4 py-3 rounded-xl text-sm border ${
                  cancelPreview.isLateCancel
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                  {cancelPreview.isLateCancel ? (
                    <>
                      <div className="flex items-center gap-1.5 font-bold mb-1">⚠️ Hủy sát giờ hẹn ({cancelPreview.minutesBefore} phút trước)</div>
                      {cancelPreview.penaltyAmount > 0 && (
                        <div className="text-red-600 font-semibold">Phí phạt: -{cancelPreview.penaltyAmount.toLocaleString('vi-VN')}₫ ({cancelPreview.penaltyPercent}%)</div>
                      )}
                      {cancelPreview.refundAmount > 0 ? (
                        <div className="text-emerald-700 font-semibold">Hoàn lại vào ví: {cancelPreview.refundAmount.toLocaleString('vi-VN')}₫</div>
                      ) : (
                        <div className="text-red-600 font-semibold">Mất toàn bộ tiền cọc — không hoàn lại.</div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 font-bold">✅ Hoàn lại 100% ({cancelPreview.totalPaid.toLocaleString('vi-VN')}₫) vào ví</div>
                  )}
                </div>
              )}
              <label className="text-xs font-medium text-slate-500 block mb-1.5">Lý do hủy <span className="text-red-500">*</span></label>
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                rows={3} maxLength={500} placeholder="Nhập lý do hủy đơn..."
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 resize-none" />
            </div>
            
            {cancelConfirmError && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm">{cancelConfirmError}</div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setShowCancelConfirm(false); setCancelTarget(null); setCancelConfirmError(''); setCancelReason(''); setCancelOtp(''); setCancelStep(1); setCancelPreview(null); }}
                disabled={cancelLoading}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                Không, giữ lại
              </button>
              <button onClick={confirmCancel} disabled={cancelLoading}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-colors disabled:opacity-50">
                {cancelLoading ? 'Đang xử lý...' : 'Xác nhận hủy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CANCEL RECURRING CONFIRM MODAL ── */}
      {showCancelRecurringConfirm && (
        <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => { if (!cancelLoading) { setShowCancelRecurringConfirm(false); setCancelRecurringTarget(null); } }}>
          <div className="bg-white rounded-[1.5rem] w-full max-w-sm p-8 shadow-xl text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-4">🔄</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Hủy lịch định kỳ</h3>
            <p className="text-sm text-slate-500 mb-6">Tất cả các buổi trong loạt định kỳ này sẽ bị hủy. Hành động này không thể hoàn tác.</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowCancelRecurringConfirm(false); setCancelRecurringTarget(null); }}
                disabled={cancelLoading}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                Giữ lại
              </button>
              <button onClick={confirmCancelRecurring} disabled={cancelLoading}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-400 transition-colors disabled:opacity-50">
                {cancelLoading ? 'Đang hủy...' : 'Hủy tất cả'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RECURRING GROUP MODAL ── */}
      {showRecurringGroupModal && (
        <div className="fixed inset-0 z-[9900] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          onClick={() => { setShowRecurringGroupModal(false); setRecurringGroupTarget(null); setRecurringGroupBookings([]); }}>
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Chi tiết lịch định kỳ</h3>
                <p className="text-sm text-slate-500 mt-0.5">{recurringGroupTarget?.packageId?.name || recurringGroupTarget?.packageName || 'Gói dịch vụ'}</p>
              </div>
              <button onClick={() => { setShowRecurringGroupModal(false); setRecurringGroupTarget(null); setRecurringGroupBookings([]); }} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex flex-wrap gap-4 items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-indigo-900">Tổng cộng {recurringGroupTarget?.groupCount} buổi</div>
                  <div className="text-xs text-indigo-700 mt-1">Tổng tiền: {formatCurrency(recurringGroupTarget?.groupTotalPrice)}</div>
                </div>
                {recurringGroupBookings.some(b => b.status === 'pending' || b.status === 'confirmed') && (
                  <button onClick={() => handleCancelRecurring(recurringGroupTarget)}
                    disabled={cancelLoading}
                    className="px-4 py-2 rounded-lg bg-red-100 text-red-600 text-sm font-bold hover:bg-red-200 transition-colors">
                    Hủy toàn bộ định kỳ
                  </button>
                )}
              </div>

              {recurringGroupLoading ? (
                <div className="py-12 text-center text-slate-400 text-sm">Đang tải danh sách...</div>
              ) : recurringGroupBookings.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">Không có dữ liệu</div>
              ) : (
                <div className="space-y-3">
                  {recurringGroupBookings.map(b => {
                    const bId = b._id || b.id;
                    const canReview = b.status === 'completed';
                    const hasReview = b.rating || b.feedback;
                    return (
                      <div key={bId} onClick={() => setChildBookingDetailId(b._id || b.id)} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-colors cursor-pointer">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800 text-sm">{formatDate(b.bookingDate)} · {b.startTime}</span>
                              {b.bookingCode ? <span className="font-mono text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">#{b.bookingCode}</span> : b.recurringGroupId && b.isGroup ? <span className="font-mono text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">#{String(b.recurringGroupId).slice(-6).toUpperCase()}</span> : null}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">{b.branchId?.name || b.branchName || ''}</div>
                          </div>
                          <StatusBadge status={b.status} />
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                          {(b.status === 'pending' || b.status === 'confirmed') && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); handleShowQR(b); }}
                                className="px-2.5 py-1 rounded text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors">
                                Xem QR
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleCancel(b); }}
                                disabled={cancelLoading}
                                className="px-2.5 py-1 rounded text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors disabled:opacity-50">
                                Hủy đơn này
                              </button>
                            </>
                          )}
                          {b.status === 'completed' && (
                            <button onClick={(e) => { e.stopPropagation(); handleRebook(b); }}
                              className="px-2.5 py-1 rounded text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors">
                              Đặt lại
                            </button>
                          )}
                          {canReview && !hasReview && (
                            <button onClick={(e) => { e.stopPropagation(); openReview(b); }}
                              className="ml-auto px-2.5 py-1 rounded text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors">
                              Đánh giá
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MONTH PICKER MODAL ── */}
      {showMonthPicker && (
        <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setShowMonthPicker(false)}>
          <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <button onClick={() => setPickerYear(y => y - 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors border-none bg-transparent cursor-pointer text-lg">‹</button>
              <span className="text-base font-bold text-slate-800">{pickerYear}</span>
              <button onClick={() => setPickerYear(y => y + 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors border-none bg-transparent cursor-pointer text-lg">›</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MONTHS_VN.map((m, i) => {
                const active = i === viewMonth && pickerYear === viewYear;
                return (
                  <button key={i} onClick={() => { setViewMonth(i); setViewYear(pickerYear); setShowMonthPicker(false); setSelectedDate(null); }}
                    className="py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer transition-all"
                    style={{
                      background: active ? '#0ea5e9' : '#f8fafc',
                      color: active ? '#fff' : '#475569',
                      boxShadow: active ? '0 2px 8px rgba(14,165,233,0.3)' : 'none',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#e0f2fe'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = '#f8fafc'; }}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── QR MODAL ── */}
      {showQR && (
        <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => { setShowQR(false); setQrData(''); }}>
          <div className="bg-white rounded-[1.5rem] w-full max-w-sm p-8 shadow-xl text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Mã QR Check-in</h3>
            <p className="text-xs text-slate-400 mb-6">Đưa mã này cho nhân viên tại chi nhánh để check-in</p>
            {qrLoading ? (
              <div className="py-12 text-slate-400 text-sm">Đang tạo mã QR...</div>
            ) : qrData ? (
              <img src={qrData} alt="QR code" className="w-56 h-56 mx-auto rounded-xl border border-slate-200 shadow-sm" />
            ) : (
              <div className="py-12 text-slate-400 text-sm">Không thể tạo mã QR</div>
            )}
            <button onClick={() => { setShowQR(false); setQrData(''); }}
              className="mt-6 px-6 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition-colors">
              Đóng
            </button>
          </div>
        </div>
      )}
      {/* Quick Booking Modal */}
      {quickBookPack && (
        <QuickBookModal
          pack={quickBookPack}
          userVehicles={userVehicles}
          branches={branches}
          apiBase={apiBase || API_BASE}
          token={token}
          onClose={() => setQuickBookPack(null)}
          onSuccess={() => {
            fetchSlotPacks();
            doFetch(keyword, statusFilter, typeFilter, dateFrom, dateTo, page, sort, true);
          }}
        />
      )}
      {/* Cancel Confirmation Modal */}
      {packToCancel && (
        <div className="fixed inset-0 z-[10005] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative border border-slate-100 text-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPackToCancel(null)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Xác nhận hủy gói lượt</h3>
              <p className="text-xs text-slate-500 mb-4">Hành động này không thể hoàn tác. Gói lượt sẽ bị hủy bỏ hoàn toàn và ẩn khỏi giao diện của bạn.</p>
              
              <div className="w-full bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-6 border border-slate-100 text-slate-700">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Mã gói lượt:</span>
                  <span className="font-mono font-bold text-slate-800">{packToCancel.packCode}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Gói dịch vụ:</span>
                  <span className="font-bold text-slate-800">{packToCancel.packageId?.name || 'Gói dịch vụ'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Chi nhánh:</span>
                  <span className="font-bold text-slate-800">{packToCancel.branchId?.name || 'Áp dụng toàn hệ thống'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Số lượt còn lại:</span>
                  <span className="font-bold text-red-600">{packToCancel.remainingSlots}/{packToCancel.totalSlots} lượt</span>
                </div>
              </div>
              
              <div className="flex w-full gap-3">
                <button
                  type="button"
                  onClick={() => setPackToCancel(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-100 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleCancelPackConfirm}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 transition-colors"
                >
                  Xác nhận hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Request Modal */}
      {showRefundModal && refundTarget && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl relative">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Yêu cầu hoàn tiền</h3>
            <p className="text-sm text-slate-500 mb-4">Mã đơn: <span className="font-bold text-slate-700">{refundTarget.bookingCode || refundTarget._id?.slice(-6).toUpperCase()}</span></p>
            <textarea
              className="w-full h-24 p-3 rounded-xl border border-slate-200 text-sm mb-6 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="Nhập lý do hoàn tiền (VD: Hủy do bận đột xuất, không hài lòng dịch vụ...)"
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRefundModal(false)} className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Đóng
              </button>
              <button onClick={submitRefundRequest} disabled={refundLoading} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                {refundLoading ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Child Booking Detail Modal */}
      <AnimatePresence>
        {childBookingDetailId && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => setChildBookingDetailId(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col relative overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex-1 overflow-auto bg-slate-50 relative p-0 sm:p-2">
                <CustomerBookingDetail apiBase={apiBase} token={token} user={user} onUserUpdate={onUserUpdate} bookingId={childBookingDetailId} onClose={() => setChildBookingDetailId(null)} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
