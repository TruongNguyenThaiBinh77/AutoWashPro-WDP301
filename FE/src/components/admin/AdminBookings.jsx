import React, { useCallback, useEffect, useState, useMemo, Fragment } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { confirmDialog } from '@/lib/confirm';
import { showToast } from '@/lib/toast';
import useSSE from '@/hooks/useSSE';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import TierBadge from '@/components/ui/TierBadge';
import ManagerQuickCheckin from '@/components/manager/ManagerQuickCheckin';
import { BookingDetailsTab } from '@/components/manager/ManagerBookings';
import {
  ArrowClockwise, CalendarCheck, CaretDown, CaretRight, MagnifyingGlass, X,
  CheckCircle, XCircle, Warning, CircleDashed, PlayCircle, Eye, CalendarPlus,
  QrCode, Lightning, Receipt, Car, Clock, CurrencyCircleDollar, Printer, CaretLeft,
  CalendarBlank, Rows, Package, Buildings, CreditCard, Tag, User, MapPin, NotePencil,
  ArrowRight, Trash,
} from '@phosphor-icons/react';

function api(path, opts = {}) {
  return fetch(`${getApiBaseUrl()}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getStoredToken()}`,
      ...opts.headers,
    },
  });
}

async function readErr(res) {
  try { const j = await res.json(); return j?.message || `Lỗi ${res.status}`; }
  catch { return `Lỗi ${res.status}`; }
}

function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

const STATUS_MAP = {
  pending:          { label: 'Chờ xác nhận',       cls: 'bg-amber-50 text-amber-700' },
  confirmed:        { label: 'Đã xác nhận',         cls: 'bg-indigo-50 text-indigo-700' },
  checked_in:       { label: 'Đã check-in',          cls: 'bg-cyan-50 text-cyan-700' },
  in_progress:      { label: 'Đang thực hiện',       cls: 'bg-blue-50 text-blue-700' },
  awaiting_payment: { label: 'Chờ thanh toán',       cls: 'bg-orange-50 text-orange-700' },
  completed:        { label: 'Hoàn thành',           cls: 'bg-emerald-50 text-emerald-700' },
  cancelled:        { label: 'Đã hủy',               cls: 'bg-slate-100 text-slate-500' },
};

const NEXT_STATUS = {
  pending:          ['confirmed', 'cancelled'],
  confirmed:        ['checked_in', 'cancelled'],
  checked_in:       ['in_progress', 'cancelled'],
  in_progress:      ['awaiting_payment', 'completed', 'cancelled'],
  awaiting_payment: ['cancelled'],
};

const TYPE_MAP = {
  single: { label: 'Đặt 1 lần', cls: 'bg-slate-100 text-slate-600' },
  recurring: { label: 'Định kỳ', cls: 'bg-indigo-50 text-indigo-700' },
  slot_pack_usage: { label: 'Gói lượt', cls: 'bg-fuchsia-50 text-fuchsia-700' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || { label: status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function StatusMenu({ bookingId, current, onUpdated, notify }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const nexts = NEXT_STATUS[current] || [];

  if (nexts.length === 0) {
    return <StatusBadge status={current} />;
  }

  async function update(status, extra = {}) {
    setBusy(true); setOpen(false);
    try {
      const res = await api(`/bookings/${bookingId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, ...extra }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      const p = await res.json();
      notify(`Đã đổi trạng thái sang "${STATUS_MAP[status]?.label || status}"`);
      onUpdated(p?.data ?? p);
    } catch (err) {
      notify(err.message || 'Cập nhật thất bại', 'error');
    } finally {
      setBusy(false);
    }
  }

  const handleStatusClick = (status) => {
    if (status === 'cancelled') {
      setCancelReason('');
      setCancelError('');
      setShowCancelModal(true);
    } else {
      update(status);
    }
  };

  const confirmCancel = () => {
    if (!cancelReason.trim()) {
      setCancelError('Vui lòng nhập lý do hủy đơn');
      return;
    }
    setShowCancelModal(false);
    update('cancelled', { cancellationReason: cancelReason.trim() });
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((p) => !p)}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors hover:opacity-80 disabled:opacity-50 ${STATUS_MAP[current]?.cls || 'bg-slate-100 text-slate-500'}`}
        >
          {busy ? <Spinner size={11} /> : null}
          <span>{STATUS_MAP[current]?.label || current}</span>
          <CaretDown size={10} className="opacity-70" />
        </button>
        {open && (
          <div className="absolute right-0 top-7 z-[9999] min-w-[140px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {nexts.map((s) => (
              <button key={s} onClick={() => handleStatusClick(s)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors">
                <StatusBadge status={s} />
              </button>
            ))}
          </div>
        )}
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => { if (!busy) setShowCancelModal(false); }}>
          <div className="bg-white rounded-[1.5rem] w-full max-w-sm p-8 shadow-xl text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-4">🗑</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Xác nhận hủy đơn</h3>
            <p className="text-sm text-slate-500 mb-4">Bạn có chắc muốn hủy đơn này? Hành động này không thể hoàn tác.</p>
            <div className="text-left mb-6">
              <label className="text-xs font-medium text-slate-500 block mb-1.5">Lý do hủy <span className="text-red-500">*</span></label>
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                rows={3} maxLength={500} placeholder="Nhập lý do hủy đơn (bắt buộc)..."
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 resize-none" />
            </div>
            {cancelError && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 text-red-600 text-sm text-left">{cancelError}</div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)} disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                Không, giữ lại
              </button>
              <button onClick={confirmCancel} disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-500 transition-colors disabled:opacity-50">
                {busy ? 'Đang hủy...' : 'Xác nhận hủy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getQrMode(b) {
  if (!b) return null;
  if (b.status === 'confirmed') return 'active';
  if (b.status === 'cancelled' && b.cancelledBy === 'system') return 'expired';
  return null;
}

function isNewBooking(b) {
  return b?.status === 'pending';
}

function QRDisplayModal({ booking, onClose }) {
  const mode = getQrMode(booking);
  const [qrUrl, setQrUrl] = useState(null);
  const [loading, setLoading] = useState(mode === 'active');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (mode !== 'active') return;
    api(`/bookings/${booking._id}/qr`)
      .then((r) => r.json())
      .then((d) => { setQrUrl(d?.data?.qrDataUrl || null); })
      .catch(() => setErr('Không thể tạo QR'))
      .finally(() => setLoading(false));
  }, [booking._id, mode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode size={18} weight="fill" className="text-blue-600" />
            <h2 className="font-semibold text-slate-800">QR Check-in</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          {mode === 'active' && (
            <>
              <p className="text-sm text-slate-500 text-center">
                Cho khách hàng dùng điện thoại quét mã này để check-in.
              </p>
              {loading && <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />}
              {err && <p className="text-sm text-red-500">{err}</p>}
              {qrUrl && (
                <div className="rounded-2xl border-4 border-slate-100 bg-white p-3 shadow-inner">
                  <img src={qrUrl} alt="QR check-in" className="w-64 h-64 object-contain" />
                </div>
              )}
            </>
          )}

          {mode === 'checked_in' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="relative rounded-2xl border-4 border-emerald-100 bg-emerald-50/60 p-6">
                <QrCode size={120} weight="duotone" className="text-emerald-200" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rotate-[-12deg] rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg">
                    ĐÃ CHECK-IN
                  </span>
                </div>
              </div>
              <p className="text-sm font-medium text-emerald-700">Khách đã check-in thành công</p>
            </div>
          )}

          <div className="text-center space-y-0.5">
            <p className="text-xs font-semibold text-slate-700">{booking.userId?.name || '—'}</p>
            <p className="text-xs text-slate-500">
              {booking.packageId?.name} · {booking.startTime}–{booking.endTime}
            </p>
            <p className="font-mono text-[10px] text-slate-400 mt-1">#{String(booking._id).slice(-8).toUpperCase()}</p>
          </div>
          <button onClick={onClose}
            className="w-full rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

function PrintReceiptModal({ booking, onClose }) {
  const formatDate = (dateString) => { const d = new Date(dateString); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };
  const formatDateTime = (dateString) => { const d = new Date(dateString); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  const detailBooking = booking;
  const displayTotal = detailBooking.isGroup ? (detailBooking.groupTotalPrice || 0) : (detailBooking.totalAmount || detailBooking.finalPrice || 0);
  const displayDeposit = detailBooking.isGroup ? (detailBooking.groupTotalDeposit || 0) : (detailBooking.depositAmount || 0);
  const displayId = detailBooking.isGroup ? (detailBooking.recurringGroupId || detailBooking._id) : detailBooking._id;
  const displayInvoiceNumber = String(displayId).slice(-8).toUpperCase();
  const configs = useSystemConfig();
  const vatRate = detailBooking?.vatPercent ?? configs?.VAT_PERCENT ?? 10;

  const [receiptPayments, setReceiptPayments] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api(`/payments/booking/${booking._id}/history`);
        if (!res.ok) throw new Error('Không thể tải lịch sử thanh toán');
        const payload = await res.json();
        if (!cancelled) setReceiptPayments(Array.isArray(payload?.data) ? payload.data : null);
      } catch (e) {
        if (!cancelled) setReceiptPayments(null);
      }
    })();
    return () => { cancelled = true; };
  }, [booking._id]);

  const handlePrint = () => {
    const el = document.getElementById('receipt-printable-area-admin');
    if (!el) return;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.no-print').forEach((n) => n.remove());
    let headCSS = '';
    document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
      if (l.href) headCSS += `<link rel="stylesheet" href="${l.href}">`;
    });
    document.querySelectorAll('style').forEach((s) => {
      headCSS += s.outerHTML;
    });
    const iframe = document.createElement('iframe');
    iframe.setAttribute('id', 'receipt-print-frame');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(`<html><head><title>Biên lai thanh toán</title>${headCSS}</head><body>${clone.outerHTML}</body></html>`);
    doc.close();
    const doPrint = () => {
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => { iframe.remove(); }, 1500);
      }, 300);
    };
    if (doc.readyState === 'complete') doPrint();
    else iframe.addEventListener('load', doPrint);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div id="receipt-printable-area-admin" className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] font-sans text-slate-900 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors no-print">
          <X size={16} />
        </button>

        <div className="px-8 py-10 overflow-y-auto flex-1">
          <div className="flex justify-between items-start mb-8 pb-6 border-b border-slate-100">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Hóa Đơn Đặt Lịch</h2>
              <p className="text-xs text-slate-500 font-mono mt-1">Mã đơn: #{detailBooking.bookingCode || `AWP-${displayInvoiceNumber}`}</p>
              <p className="text-xs text-slate-500">Ngày tạo: {formatDateTime(detailBooking.createdAt || detailBooking.bookingDate)}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-blue-600">AutoWash Pro</div>
              <p className="text-xs text-slate-500">{detailBooking.branchId?.name || 'Chi nhánh trung tâm'}</p>
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-6 mb-8 text-xs">
            <div className="space-y-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <p className="font-semibold text-slate-700 uppercase tracking-wide text-[10px]">Khách hàng</p>
              <p className="font-bold text-slate-900 text-sm">{detailBooking.userId?.name || 'Khách hàng'}</p>
              <p className="text-slate-600">{detailBooking.userId?.phone || '—'}</p>
              <p className="text-slate-500">{detailBooking.userId?.email || ''}</p>
            </div>
            <div className="space-y-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <p className="font-semibold text-slate-700 uppercase tracking-wide text-[10px]">Xe & Lịch hẹn</p>
              <p className="font-bold text-slate-900 text-sm">Biển số: {detailBooking.vehiclePlate || detailBooking.vehicleId?.licensePlate || '—'}</p>
              <p className="text-slate-600">Ngày rửa: {formatDate(detailBooking.bookingDate)}</p>
              <p className="text-slate-600">Thời gian: {detailBooking.startTime} – {detailBooking.endTime}</p>
            </div>
          </div>

          {/* Pricing table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden mb-6">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 text-left">Dịch vụ</th>
                  <th className="px-4 py-2.5 text-right">Đơn giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {detailBooking.packageName || detailBooking.packageId?.name || 'Gói rửa xe'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {formatCurrency(detailBooking.packagePrice ?? detailBooking.packageId?.price ?? 0)}
                  </td>
                </tr>
                {(detailBooking.selectedSubServices || []).filter(s => s.price > 0).map((sub, i) => (
                  <tr key={i} className="bg-slate-50/50">
                    <td className="px-4 py-2 text-slate-600 pl-6">+ {sub.name}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-700">+{formatCurrency(sub.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total summary */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Tổng tiền dịch vụ:</span>
                <span className="font-semibold text-slate-900">{formatCurrency(displayTotal)}</span>
              </div>
              {displayDeposit > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Đã thanh toán / Đặt cọc:</span>
                  <span>-{formatCurrency(displayDeposit)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                <span>Còn lại:</span>
                <span className="text-blue-600">{formatCurrency(Math.max(0, displayTotal - displayDeposit))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer print action */}
        <div className="border-t border-slate-100 px-8 py-4 bg-slate-50 flex items-center justify-between no-print">
          <p className="text-xs text-slate-500">AutoWash Pro Systems · Hóa đơn chính thức</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white transition-colors">
              Đóng
            </button>
            <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm">
              <Printer size={16} /> In hóa đơn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminBookings() {
  const [bookings, setBookings] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchId, setBranchId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortFilter, setSortFilter] = useState('newest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [todayOnly, setTodayOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [invoiceBooking, setInvoiceBooking] = useState(null);
  const [qrBooking, setQrBooking] = useState(null);
  const [showCheckin, setShowCheckin] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDateFrom, setDeleteDateFrom] = useState('');
  const [deleteDateTo, setDeleteDateTo] = useState('');
  const [deleteAll, setDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [viewedBookings, setViewedBookings] = useState([]);
  const [highlightId, setHighlightId] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const token = getStoredToken();

  const notify = (msg, type = 'success') => showToast(msg, type);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('viewed_bookings') || '[]');
    setViewedBookings(stored);
  }, []);

  const loadBranches = useCallback(async () => {
    try {
      const res = await api('/branches?limit=100');
      if (res.ok) {
        const d = await res.json();
        setBranches(d?.data?.branches || d?.data || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadBranches(); }, [loadBranches]);

  const loadBookings = useCallback(async (pg = page) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: pg, limit: 10 });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (branchId) params.set('branchId', branchId);
      if (typeFilter) params.set('bookingType', typeFilter);
      if (sortFilter) params.set('sort', sortFilter);
      if (todayOnly) {
        const todayStr = new Date().toISOString().split('T')[0];
        params.set('dateFrom', todayStr);
        params.set('dateTo', todayStr);
      } else {
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
      }
      const res = await api(`/bookings?${params}`);
      if (!res.ok) throw new Error(await readErr(res));
      const data = await res.json();
      const list = data?.data?.bookings || data?.data || [];
      const bookingsArr = Array.isArray(list) ? list : [];
      setBookings(bookingsArr);
      setTotalPages(data?.data?.pagination?.totalPages || 1);
      setTotal(data?.data?.pagination?.total || 0);
      setPage(pg);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, statusFilter, branchId, typeFilter, sortFilter, todayOnly, dateFrom, dateTo, page]);

  useEffect(() => { loadBookings(1); }, [search, statusFilter, branchId, typeFilter, sortFilter, todayOnly, dateFrom, dateTo]);

  // Real-time SSE listeners
  useSSE(token, 'slots_updated', () => loadBookings(page));
  useSSE(token, 'payment_new', () => loadBookings(page));
  useSSE(token, 'booking_new', () => {
    notify('🔔 Có đơn đặt lịch mới từ khách hàng!', 'info');
    loadBookings(page);
  });
  useSSE(token, 'customer_checkin_request', () => {
    notify('⚡ Khách hàng vừa gửi yêu cầu Check-in!', 'info');
    loadBookings(page);
  });
  useSSE(token, 'customer_checked_in_via_qr', () => {
    notify('✅ Khách đã quét QR Check-in thành công!', 'success');
    loadBookings(page);
  });
  useSSE(token, 'refund_requests_updated', () => loadBookings(page));

  const handleOpenDetail = (booking) => {
    if (booking._id && !viewedBookings.includes(booking._id)) {
      const next = [...viewedBookings, booking._id];
      setViewedBookings(next);
      localStorage.setItem('viewed_bookings', JSON.stringify(next));
      window.dispatchEvent(new Event('booking-viewed'));
    }
    navigate(`/admin/bookings/${booking._id}`, { state: { from: `/admin/bookings${location.search}` } });
  };

  const handleOpenInvoice = (booking) => {
    setInvoiceBooking(booking);
  };

  const handleDeleteSingle = async (booking) => {
    const code = booking.bookingCode || `AWP-${String(booking._id).slice(-8).toUpperCase()}`;
    const ok = await confirmDialog({
      title: 'Xác nhận xóa đặt lịch',
      message: `Bạn có chắc chắn muốn xóa vĩnh viễn đơn đặt lịch "${code}"? Hành động này không thể hoàn tác!`,
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await api(`/bookings/${booking._id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readErr(res));
      notify(`Đã xóa đơn đặt lịch ${code} thành công!`);
      if (selectedBooking?._id === booking._id) setSelectedBooking(null);
      loadBookings(page);
    } catch (err) {
      notify(err.message || 'Xóa đơn thất bại', 'error');
    }
  };

  const handleDeleteRange = async () => {
    if (deleteAll) {
      if (!(await confirmDialog({ title: 'Xác nhận xóa tất cả', message: 'Bạn có chắc muốn xóa TOÀN BỘ dữ liệu đặt lịch trong hệ thống? Hành động này không thể hoàn tác!', danger: true }))) return;
    } else {
      if (!deleteDateFrom || !deleteDateTo) return notify('Vui lòng chọn khoảng ngày', 'error');
      if (!(await confirmDialog({ title: 'Xác nhận xóa theo khoảng ngày', message: `Bạn có chắc muốn xóa các đơn đặt lịch từ ${deleteDateFrom} đến ${deleteDateTo}? Hành động này không thể hoàn tác!`, danger: true }))) return;
    }
    setDeleting(true);
    try {
      const params = deleteAll ? 'all=true' : `dateFrom=${deleteDateFrom}&dateTo=${deleteDateTo}`;
      const res = await api(`/bookings/range?${params}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readErr(res));
      const result = await res.json();
      notify(result.message || 'Đã xóa dữ liệu thành công');
      setShowDeleteModal(false);
      setDeleteDateFrom('');
      setDeleteDateTo('');
      setDeleteAll(false);
      loadBookings(1);
    } catch (e) { notify(e.message || 'Xóa thất bại', 'error'); }
    finally { setDeleting(false); }
  };

  const handleBookingUpdated = (updated) => {
    setBookings((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
    if (selectedBooking?._id === updated._id) setSelectedBooking(updated);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên khách, SĐT, biển số, mã đơn…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-2xs transition-colors"
          />
        </div>

        {/* Sort Dropdown */}
        <select
          value={sortFilter}
          onChange={(e) => setSortFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-2xs transition-colors cursor-pointer"
        >
          <option value="newest">Mới tạo nhất</option>
          <option value="time_asc">Lịch hẹn gần nhất (Sớm → Muộn)</option>
          <option value="time_desc">Lịch hẹn xa nhất (Muộn → Sớm)</option>
          <option value="price_desc">Giá trị cao nhất</option>
          <option value="price_asc">Giá trị thấp nhất</option>
          <option value="priority_desc">Khách hàng VIP</option>
          <option value="oldest">Tạo cũ nhất</option>
        </select>

        {/* Branch Filter Dropdown */}
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-2xs transition-colors"
        >
          <option value="">🏢 Tất cả chi nhánh</option>
          {branches.map((b) => (
            <option key={b._id} value={b._id}>{b.name}</option>
          ))}
        </select>

        {/* Status Filter Dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-2xs transition-colors"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ xác nhận</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="checked_in">Đã check-in</option>
          <option value="in_progress">Đang thực hiện</option>
          <option value="awaiting_payment">Chờ thanh toán</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã hủy</option>
        </select>

        {/* Date Filter Inputs */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setTodayOnly(false); }}
            className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-2xs transition-colors"
          />
          <span className="text-slate-400 text-xs">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setTodayOnly(false); }}
            className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-2xs transition-colors"
          />
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setTodayOnly((prev) => !prev); }}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-colors shadow-2xs ${
              todayOnly ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            📅 Hôm nay
          </button>
        </div>

        <button
          onClick={() => loadBookings(1)}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 shadow-2xs transition-colors"
          title="Tải lại"
        >
          <ArrowClockwise size={15} className={loading ? 'animate-spin' : ''} />
        </button>

        <button
          onClick={() => setShowCheckin(true)}
          className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 shadow-2xs transition-colors"
        >
          <Lightning size={15} /> Check-in nhanh
        </button>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="ml-auto flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 shadow-sm transition-colors"
        >
          <Trash size={15} /> Xóa đặt lịch hàng loạt
        </button>
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500">
        <p>Tổng cộng: <span className="font-bold text-slate-800">{total}</span> lịch đặt</p>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-4 text-xs font-medium text-red-600 border border-red-200">{error}</div>}

      {/* Bookings Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-20 text-slate-400">
          <CalendarBlank size={48} weight="duotone" />
          <p className="text-sm font-medium">Không có đặt lịch nào phù hợp.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3.5">Khách hàng</th>
                <th className="px-4 py-3.5">Mã đơn</th>
                <th className="px-4 py-3.5">Chi nhánh</th>
                <th className="px-4 py-3.5">Dịch vụ</th>
                <th className="px-4 py-3.5">Ngày / Giờ</th>
                <th className="px-4 py-3.5">Thanh toán</th>
                <th className="px-4 py-3.5">Trạng thái</th>
                <th className="px-4 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((b) => {
                const isNew = isNewBooking(b);
                const isHighlighted = highlightId === b._id;

                return (
                  <tr
                    key={b._id}
                    className={`transition-colors ${
                      isHighlighted ? 'bg-amber-50 hover:bg-amber-100/80' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Customer */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-slate-900">{b.userId?.name || 'Khách vãng lai'}</p>
                        {b.userId?.tier && <TierBadge tier={b.userId.tier} />}
                        {isNew && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Mới
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">{b.userId?.phone || '—'}</p>
                      {b.vehicleId?.licensePlate && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">🚘 {b.vehicleId.licensePlate}</p>
                      )}
                    </td>

                    {/* Booking Code */}
                    <td className="px-4 py-3 font-mono font-bold text-blue-600">
                      {b.bookingCode ? (
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100 text-[11px]">
                          #{b.bookingCode}
                        </span>
                      ) : (
                        `#${String(b._id).slice(-8).toUpperCase()}`
                      )}
                    </td>

                    {/* Branch */}
                    <td className="px-4 py-3 text-slate-700">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Buildings size={14} className="text-slate-400 shrink-0" />
                        <span className="truncate max-w-[140px]">{b.branchId?.name || '—'}</span>
                      </div>
                    </td>

                    {/* Service Package */}
                    <td className="px-4 py-3 max-w-[160px]">
                      <p className="truncate font-medium text-slate-800">{b.packageName || b.packageId?.name || '—'}</p>
                      {b.bookingType && (
                        <div className="mt-1">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${TYPE_MAP[b.bookingType]?.cls || 'bg-slate-100 text-slate-500'}`}>
                            {TYPE_MAP[b.bookingType]?.label || b.bookingType}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Date / Time */}
                    <td className="px-4 py-3 text-slate-700">
                      <p className="font-semibold text-slate-800">
                        {b.bookingDate ? new Date(b.bookingDate).toLocaleDateString('vi-VN') : '—'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium">{b.startTime}–{b.endTime}</p>
                      {b.createdAt && (
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5" title="Thời gian khách đặt đơn">
                          Đặt: {new Date(b.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                      )}
                    </td>

                    {/* Payment Status */}
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        b.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                        b.paymentStatus === 'deposit_paid' ? 'bg-teal-50 text-teal-700' :
                        b.paymentStatus === 'refunded' ? 'bg-slate-100 text-slate-500' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {
                          b.paymentStatus === 'paid' ? 'Đã thanh toán' :
                          b.paymentStatus === 'deposit_paid' ? 'Đã cọc' :
                          b.paymentStatus === 'refunded' ? 'Đã hoàn tiền' :
                          b.paymentStatus === 'failed' ? 'Thất bại' :
                          'Chưa thanh toán'
                        }
                      </span>
                    </td>

                    {/* Status dropdown */}
                    <td className="px-4 py-3">
                      <StatusMenu bookingId={b._id} current={b.status} onUpdated={handleBookingUpdated} notify={notify} />
                    </td>

                    {/* Actions: Eye Icon (Chi tiết), Receipt Icon (Hóa đơn), Trash Icon (Xóa) */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Detail Eye Icon */}
                        <button
                          onClick={() => handleOpenDetail(b)}
                          title="Xem chi tiết đơn đặt lịch"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors shadow-2xs"
                        >
                          <Eye size={16} weight="bold" />
                        </button>

                        {/* Invoice Receipt Icon */}
                        <button
                          onClick={() => handleOpenInvoice(b)}
                          title="Xem & in hóa đơn"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors shadow-2xs"
                        >
                          <Receipt size={16} weight="bold" />
                        </button>

                        {/* Trash Icon */}
                        <button
                          onClick={() => handleDeleteSingle(b)}
                          title="Xóa đơn đặt lịch này"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shadow-2xs"
                        >
                          <Trash size={16} weight="bold" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                Hiển thị {total > 0 ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} / ${total}` : '0'} đơn đặt lịch
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => loadBookings(page - 1)}
                  disabled={page <= 1 || loading}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Trước
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`dots-${i}`} className="px-1 text-xs text-slate-400">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => loadBookings(p)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                          p === page ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-white'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => loadBookings(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </div>
      )}



      {/* Invoice Modal */}
      {invoiceBooking && (
        <PrintReceiptModal booking={invoiceBooking} onClose={() => setInvoiceBooking(null)} />
      )}

      {/* QR Display Modal */}
      {qrBooking && (
        <QRDisplayModal booking={qrBooking} onClose={() => setQrBooking(null)} />
      )}

      {/* Quick Check-in Modal */}
      {showCheckin && (
        <ManagerQuickCheckin onClose={() => setShowCheckin(false)} onCheckedIn={() => loadBookings(page)} />
      )}

      {/* Range Delete Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => { if (!deleting) setShowDeleteModal(false); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between bg-red-50/50">
              <h2 className="font-bold text-red-700 flex items-center gap-2">
                <Trash size={18} /> Xóa đặt lịch hàng loạt
              </h2>
              <button disabled={deleting} onClick={() => setShowDeleteModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Lưu ý: Thao tác này sẽ <span className="font-bold text-red-600">xóa vĩnh viễn</span> các đơn đặt lịch khỏi cơ sở dữ liệu và không thể hoàn tác.
              </p>
              <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={deleteAll}
                  onChange={(e) => setDeleteAll(e.target.checked)}
                  className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span className="font-bold text-red-600">Xóa TOÀN BỘ dữ liệu đặt lịch</span>
              </label>

              {!deleteAll && (
                <div className="space-y-3 pt-2">
                  <p className="font-semibold text-slate-700">Chọn khoảng ngày cần xóa:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Từ ngày</label>
                      <input
                        type="date"
                        value={deleteDateFrom}
                        onChange={(e) => setDeleteDateFrom(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Đến ngày</label>
                      <input
                        type="date"
                        value={deleteDateTo}
                        onChange={(e) => setDeleteDateTo(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-2 bg-slate-50">
              <button
                disabled={deleting}
                onClick={() => setShowDeleteModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-white transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteRange}
                disabled={deleting || (!deleteAll && (!deleteDateFrom || !deleteDateTo))}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting && <Spinner size={14} className="text-white" />}
                {deleting ? 'Đang xóa…' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
