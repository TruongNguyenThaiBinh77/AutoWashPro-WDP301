import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '@/lib/toast';
import useSSE from '@/hooks/useSSE';
import VoucherPicker from '../../VoucherPicker.jsx';
import {
  Calendar,
  Clock,
  MapPin,
  Car,
  Search,
  Filter,
  RefreshCw,
  QrCode,
  Star,
  DollarSign,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  Tag
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

const DAYS_VN = [
  'customer.bookingsHistory.day.sun',
  'customer.bookingsHistory.day.mon',
  'customer.bookingsHistory.day.tue',
  'customer.bookingsHistory.day.wed',
  'customer.bookingsHistory.day.thu',
  'customer.bookingsHistory.day.fri',
  'customer.bookingsHistory.day.sat',
];
const MONTHS_VN = [
  'customer.bookingsHistory.month.jan',
  'customer.bookingsHistory.month.feb',
  'customer.bookingsHistory.month.mar',
  'customer.bookingsHistory.month.apr',
  'customer.bookingsHistory.month.may',
  'customer.bookingsHistory.month.jun',
  'customer.bookingsHistory.month.jul',
  'customer.bookingsHistory.month.aug',
  'customer.bookingsHistory.month.sep',
  'customer.bookingsHistory.month.oct',
  'customer.bookingsHistory.month.nov',
  'customer.bookingsHistory.month.dec',
];

const STATUS_MAP = {
  pending:          { labelKey: 'customer.bookingsHistory.status.pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed:        { labelKey: 'customer.bookingsHistory.status.confirmed', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  checked_in:       { labelKey: 'customer.bookingsHistory.status.checkedIn', cls: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  in_progress:      { labelKey: 'customer.bookingsHistory.status.inProgress', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  awaiting_payment: { labelKey: 'customer.bookingsHistory.status.awaitingPayment', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  completed:        { labelKey: 'customer.bookingsHistory.status.completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled:        { labelKey: 'customer.bookingsHistory.status.cancelled', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  paid:             { labelKey: 'customer.bookingsHistory.status.paid', cls: 'bg-green-50 text-green-700 border-green-200' },
};

function StatusBadge({ status, t }) {
  const s = STATUS_MAP[status] ?? { labelKey: null, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  const label = s.labelKey ? t(s.labelKey) : status;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold shadow-2xs ${s.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
      {label}
    </span>
  );
}

/* ── cảnh báo "sắp bị hủy tự động" + đổi giờ nhanh sang slot gợi ý ── */
function AtRiskBanner({ booking, apiBase, token, onRescheduled, t }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!['pending', 'confirmed'].includes(booking.status) || !booking.lateWarningSentAt) return null;

  async function rescheduleToSuggested() {
    setBusy(true); setErr('');
    try {
      const res = await fetch(`${apiBase}/bookings/${booking._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ startTime: booking.suggestedSlotStartTime }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || t('customer.bookingsHistory.rescheduleFail'));
      onRescheduled(payload?.data || payload);
      showToast(t('customer.bookingsHistory.rescheduledToast', { time: booking.suggestedSlotStartTime }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="mt-3 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900">
      <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
        <span>{t('customer.bookingsHistory.atRiskWarning')}</span>
      </div>
      {booking.suggestedSlotStartTime && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-amber-700">
            {t('customer.bookingsHistory.suggestedSlot', { time: booking.suggestedSlotStartTime })}
          </span>
          <button
            onClick={rescheduleToSuggested}
            disabled={busy}
            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {busy ? t('customer.bookingsHistory.switching') : t('customer.bookingsHistory.switchTo', { time: booking.suggestedSlotStartTime })}
          </button>
        </div>
      )}
      {err && <div className="mt-1.5 text-xs text-red-600 font-medium">{err}</div>}
    </div>
  );
}

function formatCurrency(n) {
  return Number(n || 0).toLocaleString('vi-VN') + 'đ';
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('vi-VN');
}

function isSameDay(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export default function BookingsHistory({ apiBase, token }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filter & Search states for modern UI
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Calendar state
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailBooking, setDetailBooking] = useState(null);

  // View mode: 'calendar' or 'list'
  const [viewMode, setViewMode] = useState('list');

  // Review state
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [hoverStar, setHoverStar] = useState(0);
  const reviewTextRef = useRef(null);

  const [cancelLoading, setCancelLoading] = useState(false);
  const [rebookLoading, setRebookLoading] = useState(false);

  // QR Modal
  const [showQR, setShowQR] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');

  // Rebook modal
  const [rebookTarget, setRebookTarget] = useState(null);
  const [rebookVoucherCode, setRebookVoucherCode] = useState('');
  const [rebookVoucherDiscount, setRebookVoucherDiscount] = useState(0);
  const [showRebookVoucherModal, setShowRebookVoucherModal] = useState(false);

  // Cancel Confirm Modal
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelError, setCancelError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelStep, setCancelStep] = useState(1);
  const [cancelOtp, setCancelOtp] = useState('');
  const [cancelPreview, setCancelPreview] = useState(null);

  // Refund request modal
  const [refundRequests, setRefundRequests] = useState([]);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBase}/bookings/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(t('customer.bookingsHistory.loadFail'));
      const payload = await res.json();
      const data = payload?.data || payload;
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || t('customer.bookingsHistory.loadError'));
    } finally {
      setLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useSSE(token, 'notification', fetchBookings);
  useSSE(token, 'my_bookings_updated', fetchBookings);
  useSSE(token, 'booking_new', fetchBookings);
  useSSE(token, 'booking_update', fetchBookings);
  useSSE(token, 'points_updated', fetchBookings);
  useSSE(token, 'refund_request_updated', fetchBookings);

  useEffect(() => {
    let mounted = true;
    async function loadRefundRequests() {
      try {
        const res = await fetch(`${apiBase}/refund-requests/my`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const payload = await res.json();
        const data = payload?.data || payload;
        if (mounted) setRefundRequests(Array.isArray(data) ? data : []);
      } catch {
        // ignore - refund status is a non-critical enhancement
      }
    }
    loadRefundRequests();
    return () => { mounted = false; };
  }, [apiBase, token]);

  function findRefundRequest(bookingId) {
    return refundRequests.find((r) => String(r.bookingId?._id || r.bookingId) === String(bookingId));
  }

  // Filtered Bookings for List View
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Status filter
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;

      // Date filter
      if (dateFilter) {
        const bDate = new Date(b.bookingDate).toISOString().split('T')[0];
        if (bDate !== dateFilter) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const pkgName = (b.packageName || b.packageId?.name || '').toLowerCase();
        const branch = (b.branchName || b.branchId?.name || '').toLowerCase();
        const plate = (b.vehiclePlate || b.vehicleId?.licensePlate || '').toLowerCase();
        if (!pkgName.includes(term) && !branch.includes(term) && !plate.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [bookings, statusFilter, searchTerm, dateFilter]);

  // Group bookings by date for Calendar View
  const bookingsByDate = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      const key = new Date(b.bookingDate).toISOString().split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [bookings]);

  // Bookings for selected date in Calendar View
  const selectedDateBookings = useMemo(() => {
    if (!selectedDate) return [];
    const key = selectedDate.toISOString().split('T')[0];
    return bookingsByDate[key] || [];
  }, [selectedDate, bookingsByDate]);

  // Calendar navigation
  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else { setViewMonth((m) => m - 1); }
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else { setViewMonth((m) => m + 1); }
  }, [viewMonth]);

  const goToday = useCallback(() => {
    const d = new Date();
    setViewMonth(d.getMonth());
    setViewYear(d.getFullYear());
    setSelectedDate(d);
  }, []);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const days = [];

    // Previous month trailing days
    const prevMonthDays = getDaysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({ date: new Date(y, m, d), isCurrentMonth: false });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(viewYear, viewMonth, d), isCurrentMonth: true });
    }

    // Next month leading days
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({ date: new Date(y, m, d), isCurrentMonth: false });
    }

    return days;
  }, [viewYear, viewMonth]);

  function handlePrevMonth() { prevMonth(); setSelectedDate(null); }
  function handleNextMonth() { nextMonth(); setSelectedDate(null); }

  async function loadDetail(id) {
    setDetailBooking(null);
    try {
      const res = await fetch(`${apiBase}/bookings/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(t('customer.bookingsHistory.detailLoadFail'));
      const payload = await res.json();
      setDetailBooking(payload?.data || payload);
    } catch (err) {
      setError(err.message || t('customer.bookingsHistory.detailLoadError'));
    }
  }

  function openReviewForm() {
    setReviewRating(detailBooking?.rating || 0);
    setReviewText(detailBooking?.feedback || '');
    setReviewError('');
    setShowReview(true);
    setTimeout(() => reviewTextRef.current?.focus(), 100);
  }

  async function submitReview() {
    if (reviewRating === 0) { setReviewError(t('customer.bookingsHistory.reviewRatingRequired')); return; }
    setReviewLoading(true);
    setReviewError('');
    try {
      const res = await fetch(`${apiBase}/bookings/${detailBooking._id}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: reviewRating, feedback: reviewText.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t('customer.bookingsHistory.reviewSubmitFail'));
      }
      const payload = await res.json();
      const updated = payload?.data || payload;
      setDetailBooking((prev) => ({ ...prev, ...updated }));
      setBookings((prev) => prev.map((b) => b._id === updated._id ? { ...b, ...updated } : b));
      setShowReview(false);
    } catch (e) {
      setReviewError(e.message);
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleCancel(id) {
    setCancelTarget(id);
    setCancelError('');
    setCancelReason('');
    setCancelStep(1);
    setCancelOtp('');
    setCancelPreview(null);
    setShowCancelConfirm(true);
    try {
      const res = await fetch(`${apiBase}/bookings/${id}/cancel-preview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const payload = await res.json();
        setCancelPreview(payload?.data || null);
      }
    } catch (e) { /* ignore preview errors */ }
  }

  async function requestCancelOtp() {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      setCancelError(t('customer.bookingsHistory.cancelReasonRequired'));
      return;
    }
    setCancelLoading(true);
    setCancelError('');
    try {
      const res = await fetch(`${apiBase}/bookings/${cancelTarget}/cancel-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || t('customer.bookingsHistory.otpRequestFail')); }
      setCancelStep(2);
    } catch (e) {
      setCancelError(e.message);
    } finally {
      setCancelLoading(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    if (cancelStep === 2 && !cancelOtp.trim()) {
      setCancelError(t('customer.bookingsHistory.otpRequired'));
      return;
    }
    setCancelLoading(true);
    setCancelError('');
    try {
      const res = await fetch(`${apiBase}/bookings/${cancelTarget}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cancellationReason: cancelReason.trim(), otp: cancelOtp.trim() }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || t('customer.bookingsHistory.cancelFail')); }
      
      const resData = await res.json().catch(() => ({}));
      const updatedBooking = resData.data || resData;
      setDetailBooking((prev) => ({ ...prev, status: 'cancelled' }));
      setBookings((prev) => prev.map((b) => b._id === cancelTarget ? { ...b, status: 'cancelled' } : b));
      setShowCancelConfirm(false);
      setCancelTarget(null);
      setCancelReason('');
      setCancelOtp('');
      setCancelStep(1);
      setCancelPreview(null);
      const refundAmount = updatedBooking?.refundAmount || 0;
      showToast(refundAmount > 0 ? t('customer.bookingsHistory.cancelledRefundToast', { amount: refundAmount.toLocaleString('vi-VN') }) : t('customer.bookingsHistory.cancelledToast'));
    } catch (e) {
      setCancelError(e.message);
    } finally {
      setCancelLoading(false);
    }
  }

  function openRefundRequest(booking) {
    setRefundTarget(booking);
    setRefundReason('');
    setRefundError('');
    setShowRefundModal(true);
  }

  async function submitRefundRequest() {
    if (!refundTarget) return;
    if (!refundReason.trim()) { setRefundError(t('customer.bookingsHistory.refundReasonRequired')); return; }
    setRefundLoading(true);
    setRefundError('');
    try {
      const res = await fetch(`${apiBase}/refund-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: refundTarget._id, reason: refundReason.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || t('customer.bookingsHistory.refundRequestFail'));
      const created = payload?.data || payload;
      setRefundRequests((prev) => [created, ...prev]);
      setShowRefundModal(false);
      setRefundTarget(null);
      showToast(t('customer.bookingsHistory.refundRequestedToast'));
    } catch (e) {
      setRefundError(e.message);
    } finally {
      setRefundLoading(false);
    }
  }

  function handleRescheduled(updated) {
    setBookings((prev) => prev.map((b) => (b._id === updated._id ? { ...b, ...updated } : b)));
    setDetailBooking((prev) => (prev && prev._id === updated._id ? { ...prev, ...updated } : prev));
  }

  function handleRebook(b) {
    navigate('/booking', { state: { rebookData: b } });
  }

  async function handleShowQR(id) {
    setQrLoading(true);
    setQrUrl('');
    setQrError('');
    setShowQR(true);
    try {
      const res = await fetch(`${apiBase}/bookings/${id}/qr`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(t('customer.bookingsHistory.qrCreateFail'));
      const payload = await res.json();
      setQrUrl(payload?.data || payload?.url || '');
    } catch (e) {
      setQrError(e.message);
    } finally {
      setQrLoading(false);
    }
  }

  function getStatusCounts() {
    const counts = { total: bookings.length, pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    bookings.forEach((b) => {
      if (counts[b.status] !== undefined) counts[b.status]++;
    });
    return counts;
  }

  const stats = getStatusCounts();

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* ═══ HEADER & STATS BAR ═══ */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-600 font-extrabold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>{t('customer.bookingsHistory.eyebrow')}</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1 tracking-tight">{t('customer.bookingsHistory.title')}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{t('customer.bookingsHistory.subtitle')}</p>
          </div>

          {/* View toggle */}
          <div className="inline-flex p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 self-start md:self-auto">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t('customer.bookingsHistory.listView')}</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{t('customer.bookingsHistory.calendarView')}</span>
            </button>
          </div>
        </div>

        {/* Interactive Quick Filter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
          {[
            { id: 'all', labelKey: 'customer.bookingsHistory.filterAll', count: stats.total, color: 'border-slate-200 text-slate-900 bg-slate-50' },
            { id: 'pending', labelKey: 'customer.bookingsHistory.status.pending', count: stats.pending, color: 'border-amber-200 text-amber-700 bg-amber-50/60' },
            { id: 'confirmed', labelKey: 'customer.bookingsHistory.status.confirmed', count: stats.confirmed, color: 'border-blue-200 text-blue-700 bg-blue-50/60' },
            { id: 'completed', labelKey: 'customer.bookingsHistory.status.completed', count: stats.completed, countCls: 'text-emerald-600', color: 'border-emerald-200 text-emerald-700 bg-emerald-50/60' },
            { id: 'cancelled', labelKey: 'customer.bookingsHistory.status.cancelled', count: stats.cancelled, color: 'border-slate-200 text-slate-600 bg-slate-100/60' },
          ].map((s) => {
            const isActive = statusFilter === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStatusFilter(s.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${s.color} ${
                  isActive ? 'ring-2 ring-emerald-500 border-transparent shadow-xs font-bold' : 'opacity-80 hover:opacity-100'
                }`}
              >
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t(s.labelKey)}</div>
                <div className={`text-2xl font-extrabold mt-1 ${s.countCls || ''}`}>{s.count}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ LIST VIEW TOOLBAR ═══ */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('customer.bookingsHistory.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
              />
              {dateFilter && (
                <button onClick={() => setDateFilter('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {(searchTerm || dateFilter || statusFilter !== 'all') && (
              <button
                onClick={() => { setSearchTerm(''); setDateFilter(''); setStatusFilter('all'); }}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{t('customer.bookingsHistory.resetFilter')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-400 font-semibold border border-slate-200">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
          {t('customer.bookingsHistory.loading')}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium text-center">
          {error}
        </div>
      )}

      {/* ═══ LIST VIEW CONTENT ═══ */}
      {viewMode === 'list' && !loading && (
        <div className="space-y-4">
          {filteredBookings.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-xs">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800">{t('customer.bookingsHistory.emptyTitle')}</h3>
              <p className="text-slate-500 text-xs mt-1">{t('customer.bookingsHistory.emptyHint')}</p>
            </div>
          ) : (
            filteredBookings.map((b) => {
              const pkgSubs = b.packageId?.subServices || [];
              const includedList = [];
              if (Array.isArray(pkgSubs)) {
                pkgSubs.forEach(s => {
                  if (s.isOptional === false || (!s.isOptional && (s.price === 0 || !s.price))) {
                    if (!includedList.some(item => item.name === s.name)) includedList.push(s);
                  }
                });
              }
              if (Array.isArray(b.selectedSubServices)) {
                b.selectedSubServices.forEach(s => {
                  const sName = typeof s === 'string' ? s : s.name;
                  const sPrice = typeof s === 'object' ? s.price : 0;
                  const sOpt = typeof s === 'object' ? s.isOptional : undefined;
                  if (sOpt === false || (sOpt === undefined && (sPrice === 0 || !sPrice))) {
                    if (!includedList.some(item => item.name === sName)) includedList.push({ name: sName, price: sPrice });
                  }
                });
              }

              const extraList = [];
              if (Array.isArray(b.selectedSubServices)) {
                b.selectedSubServices.forEach(s => {
                  const sName = typeof s === 'string' ? s : s.name;
                  const isInc = includedList.some(inc => inc.name === sName);
                  if (!isInc) {
                    if (!extraList.some(item => item.name === sName)) extraList.push(typeof s === 'object' ? s : { name: s });
                  }
                });
              }

              return (
                <div
                  key={b._id}
                  onClick={() => loadDetail(b._id)}
                  className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 hover:border-emerald-500/30 cursor-pointer group"
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-extrabold shrink-0 group-hover:scale-105 transition-transform">
                        <Car className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 text-base group-hover:text-emerald-700 transition-colors">
                          {b.packageName || b.packageId?.name || t('customer.bookingsHistory.fallbackPackage')}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1 font-semibold text-slate-700">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {b.branchName || b.branchId?.name || '—'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {formatDate(b.bookingDate)}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-semibold text-emerald-600">
                            <Clock className="w-3.5 h-3.5 text-emerald-500" />
                            {b.startTime || ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center sm:flex-col sm:items-end justify-between gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      <StatusBadge status={b.status} />
                      <div className="text-right">
                        <div className="text-base font-extrabold text-slate-900">
                          {formatCurrency(b.totalAmount || b.finalPrice)}
                        </div>
                        {b.depositAmount > 0 && (
                          <div className={`text-[11px] font-bold mt-0.5 ${b.depositPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {b.depositPaid ? t('customer.bookingsHistory.deposited', { amount: formatCurrency(b.depositAmount) }) : t('customer.bookingsHistory.deposit', { amount: formatCurrency(b.depositAmount) })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Body - License plate & Sub-services */}
                  <div className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-medium">{t('customer.bookingsHistory.licensePlateLabel')}</span>
                      <span className="bg-slate-900 text-white font-mono font-bold text-xs px-3 py-1 rounded-md tracking-wider shadow-2xs">
                        {b.vehiclePlate || b.vehicleId?.licensePlate || '—'}
                      </span>
                    </div>

                    {/* Sub services preview */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {includedList.slice(0, 3).map((sub, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          {sub.name || sub}
                        </span>
                      ))}
                      {extraList.slice(0, 2).map((sub, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-[11px]">
                          +{sub.name || sub}
                        </span>
                      ))}
                    </div>
                  </div>

                  <AtRiskBanner booking={b} apiBase={apiBase} token={token} onRescheduled={handleRescheduled} t={t} />

                  {/* Card Footer Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => loadDetail(b._id)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                    >
                      {t('customer.bookingsHistory.detailBtn')}
                    </button>

                    <div className="flex items-center gap-2 flex-wrap">
                      {['pending', 'confirmed'].includes(b.status) && (
                        <button
                          onClick={() => handleCancel(b._id)}
                          disabled={cancelLoading}
                          className="px-3.5 py-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('customer.bookingsHistory.cancelBtn')}</span>
                        </button>
                      )}

                      {['pending', 'confirmed', 'checked_in'].includes(b.status) && (
                        <button
                          onClick={() => handleShowQR(b._id)}
                          className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{t('customer.bookingsHistory.qrBtn')}</span>
                        </button>
                      )}

                      {(b.status === 'completed' || b.status === 'cancelled') && (
                        <button
                          onClick={() => handleRebook(b)}
                          disabled={rebookLoading}
                          className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{t('customer.bookingsHistory.rebookBtn')}</span>
                        </button>
                      )}

                      {b.status === 'completed' && (
                        <button
                          onClick={() => { loadDetail(b._id); openReviewForm(); }}
                          className="px-3.5 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span>{b.rating ? t('customer.bookingsHistory.editReviewBtn') : t('customer.bookingsHistory.reviewBtn')}</span>
                        </button>
                      )}

                      {b.status === 'completed' && ['paid', 'deposit_paid'].includes(b.paymentStatus) && (() => {
                        const existing = findRefundRequest(b._id);
                        if (existing?.status === 'pending') {
                          return (
                            <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold flex items-center gap-1">
                              {t('customer.bookingsHistory.refundPending')}
                            </span>
                          );
                        }
                        return (
                          <button
                            onClick={() => openRefundRequest(b)}
                            className="px-3.5 py-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>{t('customer.bookingsHistory.refundBtn')}</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ═══ CALENDAR VIEW CONTENT ═══ */}
      {viewMode === 'calendar' && !loading && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {/* Calendar Navigation Header */}
          <div className="p-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
            <button
              onClick={handlePrevMonth}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-all cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>

            <div className="text-center">
              <h2 className="text-lg font-extrabold tracking-tight">
                {t(MONTHS_VN[viewMonth])} {viewYear}
              </h2>
              <button
                onClick={goToday}
                className="mt-1 px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-all cursor-pointer"
              >
                {t('customer.bookingsHistory.today')}
              </button>
            </div>

            <button
              onClick={handleNextMonth}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-all cursor-pointer"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Days of week header */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-extrabold text-slate-500 uppercase tracking-wider">
            {DAYS_VN.map((d, i) => (
              <div key={d} className={`py-3 ${i === 0 ? 'text-red-500' : ''}`}>{t(d)}</div>
            ))}
          </div>

          {/* Grid Days */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {calendarDays.map((day, idx) => {
              const key = day.date.toISOString().split('T')[0];
              const dayBookings = bookingsByDate[key] || [];
              const isToday = isSameDay(day.date, new Date());
              const isSelected = selectedDate && isSameDay(day.date, selectedDate);
              const hasBookings = dayBookings.length > 0;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate(day.date)}
                  className={`min-h-[84px] p-2 cursor-pointer transition-all relative ${
                    isSelected
                      ? 'bg-emerald-50/80 ring-2 ring-emerald-500 ring-inset'
                      : isToday
                      ? 'bg-amber-50/40'
                      : day.isCurrentMonth
                      ? 'bg-white hover:bg-slate-50'
                      : 'bg-slate-50/60 text-slate-400'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center ${
                    isToday
                      ? 'bg-slate-900 text-white'
                      : isSelected
                      ? 'text-emerald-700 font-extrabold'
                      : day.isCurrentMonth
                      ? 'text-slate-800'
                      : 'text-slate-400'
                  }`}>
                    {day.date.getDate()}
                  </div>

                  {/* Indicators */}
                  {hasBookings && (
                    <div className="mt-1 flex flex-wrap gap-1 justify-center">
                      {dayBookings.slice(0, 3).map((b, i) => (
                        <span
                          key={i}
                          className={`w-2 h-2 rounded-full ${
                            b.status === 'completed'
                              ? 'bg-emerald-500'
                              : b.status === 'cancelled'
                              ? 'bg-slate-400'
                              : b.status === 'pending'
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                        />
                      ))}
                      {dayBookings.length > 3 && (
                        <span className="text-[9px] font-bold text-slate-500">+{dayBookings.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Date Drawer Panel */}
          {selectedDate && (
            <div className="border-t-2 border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    {selectedDate.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedDateBookings.length > 0 ? t('customer.bookingsHistory.bookingsOnDate', { count: selectedDateBookings.length }) : t('customer.bookingsHistory.noBookingsOnDate')}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedDateBookings.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs font-semibold">
                  {t('customer.bookingsHistory.emptyDay')}
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDateBookings.map((b) => (
                    <div
                      key={b._id}
                      onClick={() => loadDetail(b._id)}
                      className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs hover:border-emerald-500 cursor-pointer transition-all flex items-center justify-between"
                    >
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{b.packageName || b.packageId?.name || t('customer.bookingsHistory.fallbackPackageShort')}</div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                          <span>📍 {b.branchName || b.branchId?.name || '—'}</span>
                          <span>•</span>
                          <span className="font-semibold text-emerald-600">⏰ {b.startTime || ''}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <StatusBadge status={b.status} />
                        <div className="font-extrabold text-slate-900 text-sm mt-1">{formatCurrency(b.totalAmount || b.finalPrice)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ DETAIL MODAL ═══ */}
      {detailBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => setDetailBooking(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-lg text-white">{t('customer.bookingsHistory.detailTitle')}</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">#{String(detailBooking._id).slice(-8).toUpperCase()}</p>
              </div>
              <button
                onClick={() => setDetailBooking(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between">
                <StatusBadge status={detailBooking.status} t={t} />
                <span className="text-xs font-bold text-slate-500">
                  {detailBooking.bookingType === 'recurring' ? t('customer.bookingsHistory.type.recurring') : detailBooking.bookingType === 'slot_pack_usage' ? t('customer.bookingsHistory.type.slotPack') : t('customer.bookingsHistory.type.single')}
                </span>
              </div>

              {/* Info rows */}
              {(() => {
                const pkgSubs = detailBooking.packageId?.subServices || [];
                const includedList = [];

                if (Array.isArray(pkgSubs)) {
                  pkgSubs.forEach(s => {
                    if (s.isOptional === false || (!s.isOptional && (s.price === 0 || !s.price))) {
                      if (!includedList.some(item => item.name === s.name)) {
                        includedList.push(s);
                      }
                    }
                  });
                }

                if (Array.isArray(detailBooking.selectedSubServices)) {
                  detailBooking.selectedSubServices.forEach(s => {
                    const sName = typeof s === 'string' ? s : s.name;
                    const sPrice = typeof s === 'object' ? s.price : 0;
                    const sOpt = typeof s === 'object' ? s.isOptional : undefined;
                    
                    if (sOpt === false || (sOpt === undefined && (sPrice === 0 || !sPrice))) {
                      if (!includedList.some(item => item.name === sName)) {
                        includedList.push({ name: sName, price: sPrice });
                      }
                    }
                  });
                }

                const extraList = [];
                if (Array.isArray(detailBooking.selectedSubServices)) {
                  detailBooking.selectedSubServices.forEach(s => {
                    const sName = typeof s === 'string' ? s : s.name;
                    const isInc = includedList.some(inc => inc.name === sName);
                    if (!isInc) {
                      if (!extraList.some(item => item.name === sName)) {
                        extraList.push(typeof s === 'object' ? s : { name: s });
                      }
                    }
                  });
                }

                return [
                  [t('customer.bookingsHistory.field.service'), detailBooking.packageName || detailBooking.packageId?.name || '—'],
                  ...(includedList.length > 0
                    ? [[t('customer.bookingsHistory.field.includedServices'), includedList.map((sub, i) => {
                        const sName = sub.name || sub;
                        const dur = sub.duration || (detailBooking.packageId?.subServices || []).find(x => x.name === sName)?.duration;
                        return (
                          <span key={i} style={{ fontSize: 11, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 12, marginLeft: 4, border: '1px solid #a7f3d0' }}>
                            {sName} {dur ? `(${dur}p)` : ''}
                          </span>
                        );
                      })]]
                    : []),
                  ...(extraList.length > 0
                    ? [[t('customer.bookingsHistory.field.extraServices'), extraList.map((sub, i) => {
                        const sName = sub.name || sub;
                        const dur = sub.duration || (detailBooking.packageId?.subServices || []).find(x => x.name === sName)?.duration;
                        return (
                          <span key={i} style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12, marginLeft: 4 }}>
                            + {sName} {dur ? `(${dur}p)` : ''}
                          </span>
                        );
                      })]]
                    : []),
                  [t('customer.bookingsHistory.field.date'), formatDate(detailBooking.bookingDate)],
                [t('customer.bookingsHistory.field.time'), detailBooking.startTime || '—'],
                [t('customer.bookingsHistory.field.branch'), detailBooking.branchName || detailBooking.branchId?.name || '—'],
                [t('customer.bookingsHistory.field.plate'), detailBooking.vehiclePlate || detailBooking.vehicleId?.licensePlate || '—'],
                [t('customer.bookingsHistory.field.total'), formatCurrency(detailBooking.totalAmount || detailBooking.finalPrice)],
                [t('customer.bookingsHistory.field.payment'), detailBooking.paymentStatus === 'paid' || detailBooking.paymentStatus === 'deposit_paid' ? t('customer.bookingsHistory.paymentPaid') : t('customer.bookingsHistory.paymentUnpaid')],
                [t('customer.bookingsHistory.field.bookingType'), detailBooking.bookingType === 'recurring' ? t('customer.bookingsHistory.typeRecurring') : detailBooking.bookingType === 'slot_pack_usage' ? t('customer.bookingsHistory.typeSlotPack') : t('customer.bookingsHistory.typeSingle')],
              ].map(([label, value]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                  borderBottom: '1px solid #f1f5f9',
                }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{label}</span>
                  <div style={{ textAlign: 'right', maxWidth: '60%' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{value}</span>
                  </div>
                </div>
              ));
            })()}

              {detailBooking.depositAmount > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, color: '#d97706', fontWeight: 600 }}>{t('customer.bookingsHistory.depositPercent', { percent: Math.round((detailBooking.depositAmount || 0) / ((detailBooking.totalAmount || detailBooking.finalPrice || 1)) * 100) })}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>{formatCurrency(detailBooking.depositAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{t('customer.bookingsHistory.remainingPayLater')}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>{formatCurrency(Math.max(0, (detailBooking.totalAmount || detailBooking.finalPrice || 0) - (detailBooking.depositAmount || 0)))}</span>
                  </div>
                  {detailBooking.depositPaid && (
                    <div style={{ marginTop: 8, textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 700, border: '1px solid #a7f3d0' }}>
                        {t('customer.bookingsHistory.depositPaidBadge', { amount: formatCurrency(detailBooking.depositAmount) })}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Information list */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">{t('customer.bookingsHistory.info.package')}</span>
                  <span className="font-extrabold text-slate-900">{detailBooking.packageName || detailBooking.packageId?.name || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">{t('customer.bookingsHistory.info.branch')}</span>
                  <span className="font-bold text-slate-800">{detailBooking.branchName || detailBooking.branchId?.name || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">{t('customer.bookingsHistory.info.date')}</span>
                  <span className="font-bold text-slate-800">{formatDate(detailBooking.bookingDate)} ({detailBooking.startTime || ''})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">{t('customer.bookingsHistory.info.plate')}</span>
                  <span className="bg-slate-900 text-white font-mono font-bold text-xs px-2 py-0.5 rounded">
                    {detailBooking.vehiclePlate || detailBooking.vehicleId?.licensePlate || '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">{t('customer.bookingsHistory.info.total')}</span>
                  <span className="font-extrabold text-emerald-700 text-sm">{formatCurrency(detailBooking.totalAmount || detailBooking.finalPrice)}</span>
                </div>
                {detailBooking.depositAmount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-amber-700 font-bold">{t('customer.bookingsHistory.info.deposit')}</span>
                    <span className="font-extrabold text-amber-700">{formatCurrency(detailBooking.depositAmount)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setDetailBooking(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                {t('customer.bookingsHistory.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ REVIEW MODAL ═══ */}
      {showReview && detailBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => setShowReview(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-extrabold text-slate-900 text-base">{t('customer.bookingsHistory.reviewTitle')}</h3>
              <button onClick={() => setShowReview(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center py-2 space-y-3">
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onMouseEnter={() => setHoverStar(s)}
                    onMouseLeave={() => setHoverStar(0)}
                    onClick={() => setReviewRating(s)}
                    className="p-1 cursor-pointer transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        s <= (hoverStar || reviewRating) ? 'text-amber-400 fill-amber-400' : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <textarea
                ref={reviewTextRef}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder={t('customer.bookingsHistory.reviewPlaceholder')}
                className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-amber-400 bg-slate-50"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowReview(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold"
              >
                Hủy
              </button>
              <button
                onClick={submitReview}
                disabled={reviewLoading || reviewRating === 0}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50"
              >
                {reviewLoading ? 'Đang gửi...' : 'Gửi Đánh Giá'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ QR MODAL ═══ */}
      {showQR && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6 text-center shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-extrabold text-slate-900 text-base">Mã QR Check-in</h3>
            <p className="text-xs text-slate-500">Xuất trình mã này cho nhân viên khi bạn đến chi nhánh.</p>

            {qrLoading ? (
              <div className="py-8 text-xs text-slate-400 font-semibold">Đang tạo mã QR...</div>
            ) : qrUrl ? (
              <div className="space-y-3">
                <img src={qrUrl} alt="QR Check-in" className="w-48 h-48 mx-auto rounded-xl border p-2 bg-white" />
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs font-bold text-emerald-600 underline"
                >
                  Mở ảnh QR nguyên bản
                </a>
              </div>
            ) : (
              <div className="py-8 text-xs text-red-500">{qrError || 'Không có mã QR'}</div>
            )}

            <button
              onClick={() => setShowQR(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* ═══ CONFIRM CANCEL MODAL ═══ */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => { if (!cancelLoading) setShowCancelConfirm(false); }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-base">
                {cancelStep === 1 ? 'Xác Nhận Hủy Đơn' : 'Nhập Mã OTP Xác Thực'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {cancelStep === 1
                  ? 'Bạn có chắc chắn muốn hủy đơn rửa xe này không?'
                  : 'Mã OTP đã được gửi đến email của bạn.'}
              </p>
            </div>

            {cancelStep === 1 ? (
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Nhập lý do hủy..."
                className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50"
              />
            ) : (
              <input
                type="text"
                value={cancelOtp}
                onChange={(e) => setCancelOtp(e.target.value)}
                placeholder="Mã OTP 6 chữ số"
                className="w-full p-3 rounded-xl border border-slate-200 text-center font-mono font-bold text-base bg-slate-50"
              />
            )}

            {cancelError && <div className="text-xs text-red-600 text-center font-semibold">{cancelError}</div>}

            <div className="flex gap-2">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold"
              >
                Trở lại
              </button>
              <button
                onClick={cancelStep === 1 ? requestCancelOtp : confirmCancel}
                disabled={cancelLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {cancelLoading ? 'Đang xử lý...' : cancelStep === 1 ? 'Lấy mã OTP' : 'Xác nhận hủy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ REFUND REQUEST MODAL ═══ */}
      {showRefundModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => { if (!refundLoading) setShowRefundModal(false); }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-extrabold text-slate-900 text-base">Yêu Cầu Hoàn Tiền</h3>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Nhập lý do chi tiết..."
              className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium bg-slate-50"
            />
            {refundError && <div className="text-xs text-red-600 font-semibold">{refundError}</div>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowRefundModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold"
              >
                Hủy
              </button>
              <button
                onClick={submitRefundRequest}
                disabled={refundLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {refundLoading ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
