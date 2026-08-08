import React, { useCallback, useEffect, useRef, useState, useMemo, Fragment } from 'react';
import {
  ArrowClockwise,
  CalendarCheck,
  CaretDown,
  CaretRight,
  MagnifyingGlass,
  X,
  CheckCircle,
  XCircle,
  Warning,
  ClockCounterClockwise,
  ArrowLeft,
  CircleDashed,
  PlayCircle,
  Eye,
  CalendarPlus,
  Star,
  QrCode,
  Lightning,
  Receipt,
  Car,
  Clock,
  CurrencyCircleDollar,
  Printer,
  CaretLeft,
  CalendarBlank,
  Table as TableIcon,
  Rows,
  Package,
  Buildings,
  CreditCard,
  Lock,
  Wallet,
  Bank,
  User,
  MapPin,
  NotePencil,
  ArrowRight,
  Gift,
  Sparkle,
  Check,
  PencilSimple,
} from '@phosphor-icons/react';
import useSSE from '@/hooks/useSSE';
import { useNavigate, useLocation, useSearchParams, useOutletContext } from 'react-router-dom';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import TierBadge from '@/components/ui/TierBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { showToast } from '@/lib/toast';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import ManagerGenericQRDisplay from '@/components/manager/ManagerGenericQRDisplay';
import ManagerWalkInBookingModal from '@/components/manager/ManagerWalkInBookingModal';

/* ── helpers ── */
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

/* ── status config ── */
const STATUS_MAP = {
  pending: { label: 'Chờ xác nhận', cls: 'bg-amber-50 text-amber-700' },
  confirmed: { label: 'Đã xác nhận', cls: 'bg-indigo-50 text-indigo-700' },
  checked_in: { label: 'Đã check-in', cls: 'bg-cyan-50 text-cyan-700' },
  in_progress: { label: 'Đang thực hiện', cls: 'bg-blue-50 text-blue-700' },
  awaiting_payment: { label: 'Chờ thanh toán', cls: 'bg-orange-50 text-orange-700' },
  completed: { label: 'Hoàn thành', cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Đã hủy', cls: 'bg-slate-100 text-slate-500' },
};

const NEXT_STATUS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled'],
  checked_in: ['in_progress', 'cancelled'],
  in_progress: ['awaiting_payment', 'completed', 'cancelled'],
  awaiting_payment: ['cancelled'], // Chỉ hủy — hoàn thành qua thanh toán
};

const TYPE_MAP = {
  single: { label: 'Đặt 1 lần', cls: 'bg-slate-100 text-slate-600' },
  recurring: { label: 'Định kỳ', cls: 'bg-indigo-50 text-indigo-700' },
  slot_pack_usage: { label: 'Gói lượt', cls: 'bg-fuchsia-50 text-fuchsia-700' },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' };
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

/* ── status update dropdown ── */
function StatusMenu({ bookingId, current, onUpdated, notify }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Cancel modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  const nexts = NEXT_STATUS[current];
  if (!nexts) return <StatusBadge status={current} />;

  const update = async (newStatus) => {
    setOpen(false);
    if (newStatus === 'cancelled') {
      setShowCancelModal(true);
      setCancelReason('');
      setCancelError('');
      return;
    }

    setBusy(true);
    try {
      const res = await api(`/bookings/${bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      const payload = await res.json();
      onUpdated(payload?.data ?? payload);
    } catch (err) {
      notify(err.message, 'error');
    } finally { setBusy(false); }
  };

  const confirmCancel = async () => {
    if (!cancelReason.trim()) {
      setCancelError('Vui lòng nhập lý do hủy đơn');
      return;
    }
    setBusy(true);
    setCancelError('');
    try {
      const res = await api(`/bookings/${bookingId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cancellationReason: cancelReason.trim() }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      const payload = await res.json();
      onUpdated(payload?.data ?? payload);
      setShowCancelModal(false);
      notify('Hủy đơn thành công', 'success');
    } catch (err) {
      setCancelError(err.message);
    } finally { setBusy(false); }
  };

  const handleCompleteRefund = async () => {
    setBusy(true);
    try {
      const res = await api(`/bookings/${bookingId}/refund-complete`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await readErr(res));
      const payload = await res.json();
      onUpdated(payload?.data ?? payload);
      notify('Đã xác nhận hoàn tiền', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
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
              <button key={s} onClick={() => update(s)}
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
              <button onClick={() => setShowCancelModal(false)}
                disabled={busy}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                Không, giữ lại
              </button>
              <button onClick={confirmCancel}
                disabled={busy}
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

/* ── "sắp bị auto-cancel" cảnh báo ── */
function AtRiskNotice({ booking }) {
  if (!booking?.suggestedSlotStartTime) return null;
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <span className="text-[10px] text-slate-400">Gợi ý đổi giờ: {booking.suggestedSlotStartTime}</span>
    </div>
  );
}

function WaitingSlotNotice({ booking }) {
  if (booking.status !== 'checked_in' || !booking.bookingDate || !booking.startTime) return null;
  try {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const bookingDateStr = new Date(booking.bookingDate).toLocaleDateString('en-CA');
    if (bookingDateStr !== todayStr) return null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [bh, bm] = booking.startTime.split(':').map(Number);
    const bookingMinutes = (bh || 0) * 60 + (bm || 0);

    if (bookingMinutes > currentMinutes) {
      return (
        <div className="mt-1.5 flex items-center">
          <span className="text-[10px] text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-sm">
            ⏳ Đang chờ slot ({booking.startTime})
          </span>
        </div>
      );
    }
  } catch (e) { }
  return null;
}

/* ── rebook modal ── */
function RebookModal({ booking, onClose, onRebooked, notify }) {
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState(booking.startTime || '09:00');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!date || !time) return;
    setBusy(true); setErr('');
    try {
      const res = await api(`/bookings/${booking._id}/rebook`, {
        method: 'POST',
        body: JSON.stringify({ bookingDate: date, startTime: time }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Đặt lại thất bại');
      onRebooked(data.data || data);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <CalendarPlus size={18} className="text-blue-500" />
            Đặt lại lịch
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
            <p className="font-medium text-slate-700">{booking.packageId?.name || 'Dịch vụ'}</p>
            <p className="text-xs text-slate-500">{booking.userId?.name} · {booking.vehicleId?.licensePlate}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Ngày đặt mới</label>
              <input type="date" value={date} min={tomorrow}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Giờ bắt đầu</label>
              <input type="time" value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {err && <p className="text-sm text-red-500">{err}</p>}
        </div>

        <div className="border-t border-slate-100 px-6 py-4 flex gap-3 justify-end">
          <button onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Hủy
          </button>
          <button onClick={submit} disabled={busy || !date || !time}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
            {busy ? '...' : <><CalendarPlus size={14} /> Đặt lại</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── QR display modal ── */
/**
 * Trạng thái hiển thị QR theo vòng đời đơn:
 *  - 'active'     : đã xác nhận → hiện mã QR để khách quét check-in
 *  - 'checked_in' : đã check-in (hoặc đang/đã hoàn thành) → mã đã dùng
 *  - 'expired'    : đơn bị hệ thống tự hủy do quá hạn → hết hạn
 *  - null         : không hiển thị QR (pending, đơn hủy thủ công…)
 */
function getQrMode(b) {
  if (!b) return null;
  if (b.status === 'confirmed') return 'active';
  if (b.status === 'cancelled' && b.cancelledBy === 'system') return 'expired';
  return null;
}

// Đơn "mới": đang chờ xác nhận (chưa được manager xử lý)
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
              {booking.checkInTime && (
                <p className="text-xs text-slate-500">Vào lúc {new Date(booking.checkInTime).toLocaleString('vi-VN')}</p>
              )}
            </div>
          )}

          {mode === 'expired' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="relative rounded-2xl border-4 border-red-100 bg-red-50/60 p-6">
                <QrCode size={120} weight="duotone" className="text-red-200" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rotate-[-12deg] rounded-lg bg-red-600 px-4 py-1.5 text-sm font-bold text-white shadow-lg">
                    HẾT HẠN
                  </span>
                </div>
              </div>
              <p className="text-sm font-medium text-red-600">Mã đã hết hạn</p>
              <p className="text-xs text-slate-500 text-center">Đơn đã bị hệ thống tự động hủy do khách không đến đúng giờ.</p>
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

/* ── helpers ── */
const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

/* ── print receipt modal ── */
function PrintReceiptModal({ booking, onClose }) {
  const formatDate = (dateString) => { const d = new Date(dateString); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };
  const formatDateTime = (dateString) => { const d = new Date(dateString); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  const detailBooking = booking;
  const displayTotal = detailBooking.isGroup ? (detailBooking.groupTotalPrice || 0) : (detailBooking.totalAmount || detailBooking.finalPrice || 0);
  const displayDeposit = detailBooking.isGroup ? (detailBooking.groupTotalDeposit || 0) : (detailBooking.depositAmount || 0);
  const displayId = detailBooking.isGroup ? (detailBooking.recurringGroupId || detailBooking._id) : detailBooking._id;
  const displayInvoiceNumber = String(displayId).slice(-8).toUpperCase();
  const recurringGroupBookings = detailBooking.children || [];
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
    const el = document.getElementById('receipt-printable-area');
    if (!el) return;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.no-print').forEach((n) => n.remove());
    // Giữ đúng layout gốc: nạp cả <link> lẫn các <style> do CSS modules/CSS-in-JS nhét vào DOM
    let headCSS = '';
    document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
      if (l.href) headCSS += `<link rel="stylesheet" href="${l.href}">`;
    });
    document.querySelectorAll('style').forEach((s) => {
      headCSS += s.outerHTML;
    });
    // In qua iframe ẩn cùng tab (không mở tab mới), đúng 1 sheet, layout giữ nguyên
    const iframe = document.createElement('iframe');
    iframe.setAttribute('id', 'receipt-print-frame');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(`<html><head><title>Biên lai</title>
      ${headCSS}
      <style>
        @page { size: A4; margin: 8mm; }
        html, body { margin: 0; padding: 0; background: #fff; font-family: system-ui, -Apple-System, 'Segoe UI', sans-serif; }
        #receipt-printable-area {
          box-shadow: none !important;
          border-radius: 0 !important;
          max-height: none !important;
          overflow: visible !important;
          position: relative !important;
        }
        #receipt-printable-area .receipt-body {
          max-height: none !important;
          overflow: visible !important;
        }
        /* Phóng to nội dung để in đầy 1 sheet A4 */
        #receipt-printable-area .receipt-body { padding: 5mm 10mm !important; }
        #receipt-printable-area h2 { font-size: 36px !important; margin-bottom: 5mm !important; }
        #receipt-printable-area h3 { font-size: 22px !important; margin-bottom: 4mm !important; }
        #receipt-printable-area .text-4xl { font-size: 44px !important; }
        #receipt-printable-area table { font-size: 15px !important; border-collapse: collapse !important; }
        #receipt-printable-area th, #receipt-printable-area td { padding: 6px 2px !important; }
        #receipt-printable-area .text-\[13px\],
        #receipt-printable-area .text-\[10px\],
        #receipt-printable-area .text-xs { font-size: 15px !important; }
      </style>
      </head><body>${clone.outerHTML}</body></html>`);
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
    <div className="fixed inset-0 z-[9999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 no-print-bg"
      onClick={onClose}>

      <style>{''}</style>

      <div id="receipt-printable-area" className="bg-white rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] font-sans text-slate-900 relative" onClick={e => e.stopPropagation()}>

        {/* Close Button Absolute */}
        <button onClick={onClose} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors no-print">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        {/* Receipt Body */}
        <div className="receipt-body px-10 py-12 overflow-y-auto flex-1 selection:bg-slate-200">

          {/* Header */}
          <div className="flex justify-between items-start mb-12">
            <div>
              <h2 className="text-3xl font-bold mb-6 text-black tracking-tight">Biên lai</h2>
              <div className="grid grid-cols-[140px_1fr] gap-y-1 text-[13px]">
                <div className="font-semibold text-black">Mã đơn đặt lịch</div>
                <div className="text-black">#{detailBooking.bookingCode || `AWP-${displayInvoiceNumber}`}</div>
                <div className="font-semibold text-black">Mã giao dịch</div>
                <div className="text-black">TXN-{displayInvoiceNumber}</div>
                <div className="font-semibold text-black">Ngày thanh toán</div>
                <div className="text-black">{formatDateTime(detailBooking.paidAt || detailBooking.updatedAt || detailBooking.bookingDate)}</div>
              </div>
            </div>
            <div>
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
                {detailBooking.branchName || detailBooking.branchSnapshot?.name || detailBooking.branchId?.name || 'Chi nhánh trung tâm'}<br />
                {detailBooking.branchAddress || detailBooking.branchSnapshot?.address || detailBooking.branchId?.address || '123 Đường Rửa Xe'}<br />
                Hồ Chí Minh, Việt Nam<br />
                support@autowashpro.com
              </div>
            </div>
            <div>
              <div className="font-semibold text-black mb-1">Người thanh toán</div>
              <div className="text-black">
                {detailBooking.userId?.name || 'Khách hàng'} {detailBooking.userId?.phone || ''}<br />
                Biển số: {detailBooking.vehiclePlate || detailBooking.vehicleId?.licensePlate || 'Chưa cập nhật'}<br />
                {detailBooking.userId?.email || ''}
              </div>
            </div>
          </div>

          {/* Big Payment Status */}
          <div className="mb-10">
            <h3 className="text-2xl font-bold text-black mb-3">
              {formatCurrency(displayTotal)} {detailBooking.paymentStatus === 'paid' ? `đã thanh toán vào ${formatDate(detailBooking.updatedAt || detailBooking.bookingDate)}` : `cần thanh toán vào ${formatDate(detailBooking.bookingDate)}`}
            </h3>
            <p className="text-[13px] text-black max-w-xl leading-relaxed">
              Nếu quý khách chọn chuyển khoản ngân hàng,<br />
              vui lòng chuyển tới tài khoản dưới đây thay vì thanh toán tiền mặt.<br />
              --------------------------------<br />
              THÔNG TIN THANH TOÁN:<br />
              AutoWash Pro<br />
              Hồ Chí Minh, Vietnam
            </p>
          </div>

          {/* Table */}
          <div className="mb-14">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-black">
                  <th className="py-2 text-left font-normal text-black w-1/2">Mô tả</th>
                  <th className="py-2 text-right font-normal text-black">SL</th>
                  <th className="py-2 text-right font-normal text-black">Đơn giá (đã gồm thuế)</th>
                  <th className="py-2 text-right font-normal text-black">Thuế</th>
                  <th className="py-2 text-right font-normal text-black">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="py-3 text-left align-top">
                    <div className="font-normal text-black">
                      {detailBooking.packageName || detailBooking.packageSnapshot?.name || detailBooking.packageId?.name || 'Dịch vụ rửa xe'}
                      {(() => {
                        const included = Array.isArray(detailBooking.includedSubServices) && detailBooking.includedSubServices.length > 0
                          ? detailBooking.includedSubServices
                          : (Array.isArray(detailBooking.packageSnapshot?.subServices)
                            ? detailBooking.packageSnapshot.subServices.filter(s => s.isOptional === false)
                            : (Array.isArray(detailBooking.packageId?.subServices) ? detailBooking.packageId.subServices.filter(s => s.isOptional === false) : []));

                        if (included.length > 0) {
                          return `(${included.map(s => s.name).join(', ')})`;
                        }
                        return null;
                      })()}
                    </div>
                    {!detailBooking.isGroup && <div className="text-black mt-1">{formatDate(detailBooking.bookingDate)} • {detailBooking.startTime || '—'}</div>}
                    {detailBooking.isGroup && (
                      <div className="mt-2 space-y-1">
                        {recurringGroupBookings.map((rb, idx) => (
                          <div key={idx} className="text-slate-600 text-xs flex gap-2 items-center">
                            <span>Buổi {idx + 1}: {formatDate(rb.bookingDate)} • {rb.startTime}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100">{STATUS_MAP[rb.status]?.label || rb.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 text-right text-black align-top">{detailBooking.isGroup ? detailBooking.groupCount || recurringGroupBookings.length : 1}</td>
                  <td className="py-3 text-right text-black align-top">
                    {detailBooking.bookingType === 'slot_pack_usage' ? (
                      <span className="line-through text-slate-400 mr-2">{formatCurrency(detailBooking.packagePrice || detailBooking.packageSnapshot?.price || detailBooking.packageId?.price || 0)}</span>
                    ) : null}
                    {formatCurrency(detailBooking.bookingType === 'slot_pack_usage' ? 0 : (detailBooking.packagePrice || detailBooking.packageSnapshot?.price || detailBooking.packageId?.price || detailBooking.finalPrice || detailBooking.totalAmount))}
                  </td>
                  <td className="py-3 text-right text-black align-top">{vatRate}%</td>
                  <td className="py-3 text-right text-black align-top">{formatCurrency(detailBooking.bookingType === 'slot_pack_usage' ? 0 : (detailBooking.packagePrice || detailBooking.packageSnapshot?.price || detailBooking.packageId?.price || detailBooking.finalPrice || detailBooking.totalAmount))}</td>
                </tr>

                {/* Sub-services rows */}
                {(detailBooking.selectedSubServices || []).filter(s => s.isOptional !== false).map((sub, i) => (
                  <tr key={`sub-${i}`} className="border-b border-slate-100">
                    <td className="py-2 text-left text-black pl-4 font-normal">+ {sub.name} <span className="text-[10px] font-normal">(thêm)</span></td>
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
                {detailBooking.voucherCode && (
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-emerald-600 font-medium">Voucher ({detailBooking.voucherCode})</span>
                    <span className="text-emerald-600 font-medium">-{formatCurrency(detailBooking.discountAmount || 0)}</span>
                  </div>
                )}
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
                <p className="text-[11px] text-slate-500 italic text-right mt-1.5 font-medium">* Giá đã bao gồm VAT {vatRate}%</p>
              </div>
            </div>
          </div>          </div>

        {/* Footer Actions (Sticky) - Hide on Print */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3 no-print">
          <button onClick={handlePrint}
            className="w-full px-4 py-2.5 rounded-lg bg-black text-white text-sm font-semibold hover:bg-slate-800 transition-colors text-center">
            In hóa đơn
          </button>
        </div>

      </div>
    </div>
  );
}
export function BookingDetailsTab({ booking, onBack, onUpdated, notify }) {
  const [busy, setBusy] = useState(false);
  const [isEditingWalkIn, setIsEditingWalkIn] = useState(false);
  const [walkInForm, setWalkInForm] = useState({
    name: '', phone: '', email: '', licensePlate: '', vehicleType: '', brand: '', color: ''
  });

  const handleStartEditWalkIn = () => {
    setWalkInForm({
      name: booking.userId?.name || '',
      phone: booking.userId?.phone || '',
      email: booking.userId?.email || '',
      licensePlate: booking.vehiclePlate || booking.vehicleId?.licensePlate || '',
      vehicleType: booking.vehicleId?.vehicleType || 'Sedan',
      brand: booking.vehicleId?.brand || '',
      color: booking.vehicleId?.color || ''
    });
    setIsEditingWalkIn(true);
  };

  const handleSaveWalkInInfo = async () => {
    setBusy(true);
    try {
      const res = await api(`/bookings/${booking._id}/walk-in-info`, {
        method: 'PATCH',
        body: JSON.stringify(walkInForm)
      });
      if (!res.ok) throw new Error(await readErr(res));
      const data = await res.json();
      notify('Cập nhật thông tin thành công!', 'success');
      onUpdated(data?.data || data);
      setIsEditingWalkIn(false);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStartEditSubServices = () => {
    const selected = (booking.selectedSubServices || []).map(s => s.name || s);
    const pkgSubs = Array.isArray(booking.packageId?.subServices) ? booking.packageId.subServices : [];
    const selectedIncluded = selected.filter(name => pkgSubs.some(s => s.name === name && s.isOptional === false));
    const included = selectedIncluded.length > 0 ? selectedIncluded : pkgSubs.filter(s => s.isOptional === false).map(s => s.name);
    setEditedSubServiceNames([...new Set([...included, ...selected])]);
    setEditingSubServices(true);
  };

  const handleToggleSubService = (name) => {
    setEditedSubServiceNames(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const executeSaveSubServices = async (targetNames) => {
    setSavingSubServices(true);
    try {
      const res = await api(`/bookings/${booking._id}/sub-services`, {
        method: 'PATCH',
        body: JSON.stringify({ subServices: targetNames }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      const data = await res.json();
      const updated = data?.data || data;
      const refunded = data.refundAmount || (updated && updated.refundAmount) || 0;
      if (refunded > 0) {
        notify(`Đã hoàn ${formatCurrency(refunded)} vào ví khách hàng!`, 'success');
      } else {
        notify('Đã cập nhật dịch vụ thành công!', 'success');
      }
      setEditingSubServices(false);
      setRefundConfirmData(null);
      onUpdated(updated);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingSubServices(false);
    }
  };

  const handleSaveSubServices = () => {
    const currentPaid = booking.paymentStatus === 'paid'
      ? (booking.finalPrice || 0)
      : (booking.depositPaid || booking.paymentStatus === 'deposit_paid' ? (booking.depositAmount || 0) : 0);

    const prevSubServices = Array.isArray(booking.selectedSubServices) ? booking.selectedSubServices : [];
    const removedOptionalSubs = prevSubServices.filter(s => {
      const name = typeof s === 'string' ? s : s?.name;
      const isOpt = typeof s === 'object' ? s.isOptional !== false : true;
      return isOpt && !editedSubServiceNames.includes(name);
    });

    const refundAmountPreview = removedOptionalSubs.reduce((sum, s) => {
      const price = typeof s === 'object' ? (s.price || 0) : 0;
      return sum + price;
    }, 0);

    // Khách chỉ được hoàn tiền khi tổng tiền dịch vụ mới THẤP HƠN số tiền đã trả (khớp BE: refund = paid - newFinalPrice)
    const pkgPrice = booking.packagePrice ?? booking.packageId?.price ?? 0;
    const basePrice = booking.bookingType === 'slot_pack_usage' ? 0 : pkgPrice;
    const allSubs = [...(booking.packageId?.subServices || []), ...prevSubServices];
    const newExtraPrice = editedSubServiceNames.reduce((sum, name) => {
      const sub = allSubs.find(s => (s.name || s) === name);
      if (sub && typeof sub === 'object' && sub.isOptional !== false) {
        return sum + (sub.price || 0);
      }
      return sum;
    }, 0);
    const newTotal = Math.max(0, basePrice + newExtraPrice - (booking.discountAmount || 0));

    let actualRefundAmount = 0;
    if (currentPaid > newTotal) {
      actualRefundAmount = Math.min(currentPaid - newTotal, refundAmountPreview);
    }

    if (actualRefundAmount > 0) {
      setRefundConfirmData({
        refundAmount: actualRefundAmount,
        canceledNames: removedOptionalSubs.map(s => typeof s === 'string' ? s : s?.name),
        targetSubServices: editedSubServiceNames,
      });
      return;
    }

    executeSaveSubServices(editedSubServiceNames);
  };

  const [showQR, setShowQR] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [confirmCash, setConfirmCash] = useState(false);
  const [managerPayMethod, setManagerPayMethod] = useState(null);
  const [showPaymentQR, setShowPaymentQR] = useState(false);
  const [paymentQRData, setPaymentQRData] = useState(null);
  const [editingSubServices, setEditingSubServices] = useState(false);
  const [editedSubServiceNames, setEditedSubServiceNames] = useState([]);
  const [refundConfirmData, setRefundConfirmData] = useState(null);
  const [savingSubServices, setSavingSubServices] = useState(false);
  const [qrPaymentStatus, setQrPaymentStatus] = useState('loading');
  const [qrPollCount, setQrPollCount] = useState(0);
  const [receiptPayments, setReceiptPayments] = useState(null);

  const loadReceiptPayments = useCallback(async () => {
    if (!booking?._id) return;
    try {
      const res = await api(`/payments/booking/${booking._id}/history`);
      if (!res.ok) throw new Error('Không thể tải lịch sử thanh toán');
      const payload = await res.json();
      setReceiptPayments(Array.isArray(payload?.data) ? payload.data : []);
    } catch (e) {
      setReceiptPayments(null);
    }
  }, [booking?._id]);

  useEffect(() => {
    loadReceiptPayments();
  }, [loadReceiptPayments]);

  const needsPayment = booking.paymentStatus !== 'paid' && booking.paymentStatus !== 'refunded' && (booking.finalPrice || 0) > 0;
  const stages = [
    { id: 'pending', label: 'Chờ xác nhận' },
    { id: 'confirmed', label: 'Đã xác nhận' },
    { id: 'checked_in', label: 'Đã check-in' },
    { id: 'in_progress', label: 'Đang thực hiện' },
    ...(needsPayment || booking.status === 'awaiting_payment' ? [{ id: 'awaiting_payment', label: 'Chờ thanh toán' }] : []),
    { id: 'completed', label: 'Hoàn thành' },
  ];

  // Nhãn nút chuyển bước theo từng giai đoạn (xác nhận / check-in khi khách đến / …)
  const STAGE_ACTION = {
    confirmed: 'Xác nhận đơn',
    checked_in: 'Khách đã đến — Check-in',
    in_progress: 'Bắt đầu rửa',
    awaiting_payment: 'Rửa xong (Chờ TT)',
    completed: 'Hoàn thành',
  };

  const currentStageIndex = stages.findIndex(s => s.id === booking.status);

  const updateStatus = async (newStatus) => {
    setBusy(true);
    try {
      const res = await api(`/bookings/${booking._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      const payload = await res.json();
      onUpdated(payload?.data ?? payload);
    } catch (err) {
      notify(err.message, 'error');
    } finally { setBusy(false); }
  };

  const handleCashPayment = async () => {
    setConfirmCash(false);
    setBusy(true);
    const method = managerPayMethod || 'cash';
    try {
      const res = await api(`/payments`, {
        method: 'POST',
        body: JSON.stringify({ bookingId: booking._id, method, paymentType: booking.depositPaid ? 'remaining' : 'full' }),
      });
      if (!res.ok) throw new Error(await readErr(res));

      // Re-fetch payment history so table updates immediately
      await loadReceiptPayments();

      onUpdated({
        ...booking,
        paymentStatus: 'paid',
        paidAt: new Date().toISOString(),
        paymentMethod: method,
        ...(booking.status === 'awaiting_payment' ? { status: 'completed', checkOutTime: new Date().toISOString() } : {}),
      });
      notify(`Xác nhận thanh toán ${method === 'cash' ? 'tiền mặt' : method === 'bank' ? 'chuyển khoản' : method === 'wallet' ? 'ví' : 'VNPay'} thành công!`, 'success');
    } catch (err) {
      notify(err.message || 'Lỗi xác nhận thanh toán', 'error');
    } finally { setBusy(false); }
  };

  const handlePaymentClick = async () => {
    if (!managerPayMethod) { notify('Vui lòng chọn phương thức thanh toán', 'warning'); return; }
    if (managerPayMethod === 'cash' || managerPayMethod === 'wallet') { setConfirmCash(true); return; }
    setBusy(true);
    try {
      if (managerPayMethod === 'bank') {
        const res = await api('/payments', {
          method: 'POST',
          body: JSON.stringify({ bookingId: booking._id, method: 'bank', paymentType: booking.depositPaid ? 'remaining' : 'full' }),
        });
        if (!res.ok) throw new Error(await readErr(res));
        const data = await res.json();
        const payment = data?.data || data;
        setPaymentQRData(payment);
        setQrPaymentStatus('pending');
        setQrPollCount(0);
        setShowPaymentQR(true);
      } else if (managerPayMethod === 'vnpay') {
        const payload = {
          bookingId: booking._id,
          paymentType: booking.depositPaid ? 'remaining' : 'full',
          returnUrl: window.location.href
        };
        const res = await api('/payments/vnpay-create', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await readErr(res));
        const data = await res.json();
        const paymentUrl = data?.data?.paymentUrl || data?.paymentUrl;
        if (paymentUrl) window.location.href = paymentUrl;
      }
    } catch (err) {
      notify(err.message || 'Lỗi tạo thanh toán', 'error');
    } finally { setBusy(false); }
  };

  const checkQrPaymentStatus = useCallback(async () => {
    if (!showPaymentQR || !paymentQRData) return;
    try {
      const targetUrl = `/payments/${paymentQRData._id || paymentQRData.id}`;
      const res = await api(targetUrl);
      if (!res.ok) return;
      const data = await res.json();
      const p = data?.data || data;
      if (p?.status === 'paid') {
        setQrPaymentStatus('paid');
        onUpdated({ ...booking, paymentStatus: 'paid', paidAt: new Date().toISOString(), paymentMethod: 'bank' });
        notify('Đã phát hiện thanh toán!', 'success');
        setTimeout(() => { setShowPaymentQR(false); setPaymentQRData(null); }, 1200);
      }
      setQrPollCount(c => c + 1);
    } catch (e) { /* ignore */ }
  }, [showPaymentQR, paymentQRData, booking, onUpdated]);

  useEffect(() => {
    if (!showPaymentQR || qrPaymentStatus !== 'pending') return;
    const interval = setInterval(checkQrPaymentStatus, 10000);
    return () => clearInterval(interval);
  }, [showPaymentQR, qrPaymentStatus, checkQrPaymentStatus]);

  const renderQrButton = () => {
    const m = getQrMode(booking);
    if (!m) return null;
    const label = m === 'active' ? 'Hiển thị QR cho khách'
      : m === 'checked_in' ? 'Xem QR (đã check-in)' : 'Xem QR (hết hạn)';
    const cls = m === 'active' ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
      : m === 'checked_in' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100';
    return (
      <div className="mt-4 flex items-center gap-2">
        <button onClick={() => setShowQR(true)}
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${cls}`}>
          <QrCode size={15} />
          {label}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 pb-12">
      {/* Top Bar Navigation & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-3.5 py-2 rounded-xl transition-all"
        >
          <ArrowLeft size={16} /> Quay lại danh sách
        </button>

        <div className="flex items-center gap-3">
        </div>
      </div>

      {/* Main Order Header Banner */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight text-slate-900">
                Đơn đặt lịch <span className="font-mono text-emerald-600">#{booking.bookingCode || (booking._id ? booking._id.substring(18).toUpperCase() : '—')}</span>
              </h2>
              {booking.bookingType === 'recurring' && (
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                  <ArrowClockwise size={12} weight="bold" /> Đặt định kỳ
                </span>
              )}
              {booking.bookingType === 'slot_pack_usage' && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                  <Package size={12} weight="bold" /> Dùng gói lượt
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
              <span>Khung giờ: <strong className="text-slate-800 font-semibold">{booking.startTime}{booking.endTime ? ` - ${booking.endTime}` : ''}</strong></span>
              <span>•</span>
              <span>Ngày hẹn: <strong className="text-slate-800 font-semibold">{new Date(booking.bookingDate).toLocaleDateString('vi-VN')}</strong></span>
              {booking.createdAt && (
                <>
                  <span>•</span>
                  <span>Ngày tạo đơn: <strong className="text-blue-700 font-semibold">{new Date(booking.createdAt).toLocaleString('vi-VN')}</strong></span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={booking.status} />
            <WaitingSlotNotice booking={booking} />
          </div>
        </div>
        {/* Visual Workflow Stepper Bar */}
        {booking.status !== 'cancelled' ? (
          <div className="mt-8 mb-4">
            <div className="relative px-2 sm:px-6">
              {/* Connector line */}
              <div className="absolute top-6 left-8 right-8 h-1 bg-slate-100 -translate-y-1/2 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 transition-all duration-500"
                  style={{
                    width: `${(currentStageIndex / (stages.length - 1)) * 100}%`
                  }}
                />
              </div>

              <div className="relative flex justify-between">
                {stages.map((stage, idx) => {
                  const isPast = currentStageIndex > idx || booking.status === 'completed';
                  const isCurrent = currentStageIndex === idx;
                  const Icon = isPast ? CheckCircle : isCurrent ? PlayCircle : CircleDashed;

                  return (
                    <div key={stage.id} className="flex flex-col items-center group">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 z-10 ${isPast
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200 ring-4 ring-white'
                          : isCurrent
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-300 ring-4 ring-blue-100 animate-pulse'
                            : 'bg-white text-slate-300 border-2 border-slate-200'
                          }`}
                      >
                        <Icon size={22} weight={isPast ? 'fill' : isCurrent ? 'duotone' : 'regular'} />
                      </div>
                      <span
                        className={`text-xs font-bold mt-2.5 transition-colors text-center ${isCurrent ? 'text-blue-700 font-extrabold' : isPast ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                      >
                        {stage.label}
                      </span>

                      {/* Next action button rendered directly under current stage */}
                      {isCurrent && stage.id !== 'completed' && stage.id !== 'awaiting_payment' && (
                        <button
                          disabled={busy}
                          onClick={() => updateStatus(stages[idx + 1].id)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:shadow-lg hover:brightness-105 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                        >
                          {busy ? 'Đang cập nhật...' : (STAGE_ACTION[stages[idx + 1].id] || `Chuyển sang ${stages[idx + 1].label}`)}
                          <ArrowRight size={14} weight="bold" />
                        </button>
                      )}
                      {isCurrent && stage.id === 'awaiting_payment' && (
                        <span className="mt-3 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          Đợi thanh toán để hoàn thành
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-rose-50/80 p-4 border border-rose-200/80 text-rose-800 flex items-center gap-3">
            <XCircle size={24} weight="fill" className="text-rose-500 shrink-0" />
            <div>
              <p className="text-sm font-bold">Đơn đặt lịch này đã bị hủy</p>
              {booking.cancellationReason && (
                <p className="text-xs text-rose-600 mt-0.5">Lý do: {booking.cancellationReason}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4 Cards Modular Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* CARD 1: KHÁCH HÀNG & PHƯƠNG TIỆN */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <User size={16} className="text-emerald-600" /> Thông tin khách hàng & Xe
            </h3>
            <div className="flex items-center gap-2">
              {booking.isWalkIn && (
                <button
                  onClick={() => isEditingWalkIn ? handleSaveWalkInInfo() : handleStartEditWalkIn()}
                  disabled={busy}
                  className="text-[11px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-full transition-colors flex items-center gap-1"
                >
                  {busy ? <Spinner size={14} /> : isEditingWalkIn ? <Check size={14} /> : <PencilSimple size={14} />}
                  {isEditingWalkIn ? 'Lưu' : 'Sửa'}
                </button>
              )}
              {isEditingWalkIn && (
                <button
                  onClick={() => setIsEditingWalkIn(false)}
                  disabled={busy}
                  className="text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors"
                >
                  Hủy
                </button>
              )}
              {booking.userId?.tier && <TierBadge tier={booking.userId.tier} />}
            </div>
          </div>

          <div className="space-y-4">
            {isEditingWalkIn ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Tên khách hàng"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                  value={walkInForm.name}
                  onChange={e => setWalkInForm({ ...walkInForm, name: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Số điện thoại"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={walkInForm.phone}
                    onChange={e => setWalkInForm({ ...walkInForm, phone: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Biển số xe"
                    className="w-full px-3 py-2 text-sm font-mono uppercase rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={walkInForm.licensePlate}
                    onChange={e => setWalkInForm({ ...walkInForm, licensePlate: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={walkInForm.vehicleType}
                    onChange={e => setWalkInForm({ ...walkInForm, vehicleType: e.target.value })}
                  >
                    <option value="Sedan">Sedan</option>
                    <option value="SUV">SUV</option>
                    <option value="Hatchback">Hatchback</option>
                    <option value="Crossover">Crossover</option>
                    <option value="Khác">Khác</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Hãng xe"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={walkInForm.brand}
                    onChange={e => setWalkInForm({ ...walkInForm, brand: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Màu sắc"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                    value={walkInForm.color}
                    onChange={e => setWalkInForm({ ...walkInForm, color: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-900">{booking.userId?.name || 'Khách vãng lai'}</p>
                    <p className="text-sm text-slate-600 font-medium">{booking.userId?.phone || 'Chưa có SĐT'}</p>
                    {booking.userId?.email && <p className="text-xs text-slate-400">{booking.userId.email}</p>}
                  </div>
                </div>

                {/* License Plate & Vehicle Specs */}
                {(booking.vehiclePlate || booking.vehicleId?.licensePlate) && (
                  <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/70">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                        <Car size={15} className="text-slate-600" /> Biển số xe:
                      </span>
                      <div className="px-3.5 py-1 rounded-lg bg-white border-2 border-slate-900 shadow-2xs font-mono font-black text-sm tracking-wider text-slate-900 text-center">
                        {booking.vehiclePlate || booking.vehicleId?.licensePlate}
                      </div>
                    </div>

                    {booking.vehicleId?.vehicleType && (
                      <div className="text-xs text-slate-600 flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/60">
                        <span className="font-bold text-slate-800 capitalize bg-white px-2 py-0.5 rounded border border-slate-200">
                          {booking.vehicleId.vehicleType}
                        </span>
                        {booking.vehicleId.brand && <span className="text-slate-600 font-medium">• {booking.vehicleId.brand}</span>}
                        {booking.vehicleId.color && <span className="text-slate-600 font-medium">• {booking.vehicleId.color}</span>}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Financial summary */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              {(() => {
                const pkgPrice = booking.packagePrice ?? booking.packageId?.price ?? 0;
                const subTotal = (booking.selectedSubServices || []).reduce((sum, s) => sum + (s.price || 0), 0);
                const totalValue = pkgPrice + subTotal;
                return <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Giá gói (cơ bản):</span>
                    <span className="font-bold text-slate-900">{formatCurrency(pkgPrice)}</span>
                  </div>
                  {booking.bookingType === 'slot_pack_usage' && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Chiết khấu gói lượt:</span>
                      <span className="font-bold text-emerald-600">-{formatCurrency(pkgPrice)}</span>
                    </div>
                  )}
                  {(booking.selectedSubServices || []).filter(s => s.price > 0).length > 0 && (
                    <>
                      {(booking.selectedSubServices || []).filter(s => s.price > 0).map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-xs pl-3">
                          <span className="text-slate-500">{s.name}:</span>
                          <span className="font-medium text-slate-800">+{formatCurrency(s.price)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-dashed border-slate-200">
                        <span className="text-slate-700 font-semibold">Tổng dịch vụ thêm:</span>
                        <span className="font-bold text-slate-900">+{formatCurrency(subTotal)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100 font-bold">
                    <span className="text-slate-800">Tổng giá trị dịch vụ:</span>
                    <span className="text-slate-900">{formatCurrency(totalValue)}</span>
                  </div>
                  {booking.discountAmount > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">
                        Giảm từ voucher{booking.voucherCode ? ` (${booking.voucherCode})` : ''}:
                      </span>
                      <span className="font-bold text-emerald-600">-{formatCurrency(booking.discountAmount)}</span>
                    </div>
                  )}
                </>;
              })()}
              {(booking.depositPaid || booking.paymentStatus === 'deposit_paid' || booking.paymentStatus === 'paid') && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Tiền đã trả:</span>
                  <span className="font-bold text-emerald-600">
                    {booking.paymentStatus === 'paid' ? formatCurrency(booking.finalPrice || 0) : formatCurrency(booking.depositAmount || 0)}
                  </span>
                </div>
              )}
              {booking.paymentStatus !== 'paid' && (
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                  <span className="text-slate-700 font-semibold">Còn lại phải thu:</span>
                  <span className="font-black text-rose-600">
                    {formatCurrency(Math.max(0, (booking.finalPrice || booking.totalAmount || 0) - (booking.depositPaid ? (booking.depositAmount || 0) : 0)))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CARD 2: GÓI DỊCH VỤ & TIẾN ĐỘ */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Package size={16} className="text-indigo-600" /> Chi tiết Gói Dịch Vụ
            </h3>
            {booking.status !== 'completed' && booking.status !== 'cancelled' && booking.status !== 'awaiting_payment' && !editingSubServices && (
              <button onClick={handleStartEditSubServices}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-xl border border-violet-300 bg-violet-50 text-xs font-bold text-violet-700 hover:bg-violet-100 transition-colors cursor-pointer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg> Chỉnh sửa dịch vụ
              </button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-base font-bold text-slate-900">{booking.packageName || booking.packageSnapshot?.name || booking.packageId?.name || 'Gói dịch vụ'}</p>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <Clock size={14} className="text-slate-400" /> Thời gian dự kiến: <strong className="text-slate-800">{booking.packageId?.duration || 45} phút</strong>
              </p>
            </div>

            {/* Included & Optional Sub-services */}
            {(() => {
              const selectedIncluded = (booking.selectedSubServices || []).filter(s => s.isOptional === false);
              const snapshotIncluded = Array.isArray(booking.includedSubServices) && booking.includedSubServices.length > 0
                ? booking.includedSubServices
                : (Array.isArray(booking.packageSnapshot?.subServices) ? booking.packageSnapshot.subServices.filter(s => s.isOptional === false) : []);
              const included = selectedIncluded.length > 0
                ? selectedIncluded
                : (snapshotIncluded.length > 0 ? snapshotIncluded : (Array.isArray(booking.packageId?.subServices) ? booking.packageId.subServices.filter(s => s.isOptional === false) : []));
              const extra = (booking.selectedSubServices || []).filter(s => s.isOptional !== false);

              return (
                <div className="space-y-2 pt-2">
                  {included.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 mb-1.5 uppercase">Bao gồm trong gói:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {included.map((sub, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                            <CheckCircle size={13} weight="fill" className="text-emerald-500" /> {sub.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {extra.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-indigo-400 mb-1.5 uppercase">Dịch vụ chọn thêm:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {extra.map((sub, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold">
                            <span>+ {sub.name}</span>
                            <span className="text-[10px] text-indigo-400">({formatCurrency(sub.price)})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <MapPin size={15} className="text-slate-400" /> Chi nhánh: <strong className="text-slate-800">{booking.branchId?.name || booking.branchName || '—'}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* CARD 3: ƯU ĐÃI & TÍCH ĐIỂM */}
        <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sparkle size={16} className="text-amber-500" /> Ưu đãi & Tích điểm
            </h3>
            {booking.spinEarned && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-600">
                🎡 +1 vòng quay
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Star size={14} className="text-amber-400" /> Điểm tích lũy:
              </span>
              <span className={`font-bold ${(booking.pointsEarned || 0) > 0 ? 'text-emerald-600' : (booking.expectedPoints || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                {(booking.pointsEarned || 0) > 0
                  ? `+${Number(booking.pointsEarned).toLocaleString('vi-VN')} điểm`
                  : (booking.expectedPoints || 0) > 0
                    ? `Sẽ nhận +${Number(booking.expectedPoints).toLocaleString('vi-VN')} điểm khi hoàn thành`
                    : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Gift size={14} className="text-pink-400" /> Vòng quay may mắn:
              </span>
              <span className={`font-bold ${booking.spinEarned ? 'text-pink-600' : booking.expectedSpin ? 'text-amber-600' : 'text-slate-400'}`}>
                {booking.spinEarned
                  ? 'Đã tặng 1 lượt'
                  : booking.expectedSpin
                    ? 'Sẽ tặng 1 lượt khi hoàn thành'
                    : '—'}
              </span>
            </div>

            {booking.bookingType === 'slot_pack_usage' && (
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Package size={14} className="text-amber-500" /> Gói lượt:
                </span>
                <span className="font-mono font-bold text-slate-900">{booking.slotPackId?.packCode || booking.slotPackId?._id || '—'}</span>
              </div>
            )}

            {(booking.refundStatus && booking.refundStatus !== 'none') && (
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                <span className="text-slate-500 font-medium">Hoàn tiền:</span>
                <span className="font-bold text-rose-600">
                  {formatCurrency(booking.refundAmount || 0)} ({booking.refundStatus === 'completed' ? 'đã hoàn' : 'đang xử lý'})
                </span>
              </div>
            )}

            {booking.rescheduleCount > 0 && (
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <ClockCounterClockwise size={14} className="text-slate-400" /> Đổi lịch:
                </span>
                <span className="font-bold text-slate-700">{booking.rescheduleCount} lần</span>
              </div>
            )}

            {booking.priority > 1 && (
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                <span className="text-slate-500 font-medium">Ưu tiên xử lý:</span>
                <span className="font-bold text-blue-600">
                  {['Bronze', 'Silver', 'Gold', 'Diamond'][booking.priority - 1] || booking.priority}
                </span>
              </div>
            )}

            {booking.note && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ghi chú khách:</p>
                <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{booking.note}</p>
              </div>
            )}
          </div>
        </div>

        {/* CARD 3: THU TIỀN KHÁCH */}
        {booking.paymentStatus !== 'paid' && booking.status !== 'cancelled' && (
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <CurrencyCircleDollar size={16} className="text-emerald-600" /> Thu tiền khách
              </h3>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${booking.depositPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'
                }`}>
                {booking.depositPaid ? 'Đã đặt cọc' : (booking.isWalkIn ? 'Chưa thanh toán' : 'Chưa đặt cọc')}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 font-medium">Còn lại phải thu</span>
                <span className="font-black text-slate-900">{formatCurrency(Math.max(0, (booking.finalPrice || booking.totalAmount || 0) - (booking.depositPaid ? (booking.depositAmount || 0) : 0)))}</span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Chọn phương thức</p>
                <div className="grid grid-cols-3 gap-2">
                  {[{ id: 'cash', icon: <Wallet size={16} />, label: 'Tiền mặt' }, { id: 'bank', icon: <Bank size={16} />, label: 'Ngân hàng' }, { id: 'wallet', icon: <CreditCard size={16} />, label: 'Ví' }].map(m => (
                    <button key={m.id} type="button"
                      onClick={() => setManagerPayMethod(prev => prev === m.id ? null : m.id)}
                      className={`flex flex-col items-center justify-center text-center gap-1 rounded-lg border py-2 px-1 text-[11px] font-semibold transition-colors ${managerPayMethod === m.id
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}>
                      {m.icon}{m.label}
                    </button>
                  ))}
                </div>
              </div>

              <button disabled={busy} onClick={handlePaymentClick}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors">
                <CurrencyCircleDollar size={15} weight="fill" />
                {managerPayMethod === 'bank' ? 'Tạo mã QR ngân hàng (SePay)' : managerPayMethod === 'vnpay' ? 'Thanh toán qua VNPAY' : (booking.depositPaid ? 'Thu phần còn lại' : 'Xác nhận thu tiền')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── INVOICE (full width, outside grid) ── */}
      <div className="mt-5 rounded-2xl border border-emerald-200/80 bg-white overflow-hidden shadow-xs">
        {/* Invoice header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 px-5 py-3 text-white shadow-xs">
          <span className="font-bold text-xs uppercase tracking-wider">Hóa đơn dịch vụ</span>
          <span className="font-mono text-xs font-semibold text-emerald-100">
            #{String(booking._id).slice(-8).toUpperCase()}
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* Main info rows - simple & no icons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 pb-4 border-b border-slate-100 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Dịch vụ:</span>
              <span className="font-semibold text-slate-900">{booking.packageName || booking.packageId?.name || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Ngày:</span>
              <span className="font-semibold text-slate-900">{new Date(booking.bookingDate).toLocaleDateString('vi-VN')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Giờ:</span>
              <span className="font-semibold text-slate-900">{booking.startTime || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Chi nhánh:</span>
              <span className="font-semibold text-slate-900">{booking.branchName || booking.branchSnapshot?.name || booking.branchId?.name || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Biển số:</span>
              <span className="font-mono font-bold text-slate-900">{booking.vehiclePlate || booking.vehicleId?.licensePlate || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Phương thức:</span>
              <span className="font-medium text-slate-800">
                {booking.paymentMethod === 'cash' ? 'Tiền mặt' :
                  booking.paymentMethod === 'bank' ? 'Chuyển khoản' :
                    booking.paymentMethod === 'wallet' ? 'Ví AutoWash' :
                      booking.paymentMethod === 'vnpay' ? 'VNPay' :
                        booking.paymentMethod === 'momo' ? 'MoMo' : (booking.paymentMethod || '—')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Thanh toán:</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${booking.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                booking.paymentStatus === 'deposit_paid' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                {booking.paymentStatus === 'paid' ? 'Đã thanh toán' : booking.paymentStatus === 'deposit_paid' ? 'Đã đặt cọc' : 'Chưa thanh toán'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Loại đặt:</span>
              <span className="font-medium text-slate-800">{booking.bookingType === 'recurring' ? 'Định kỳ' : booking.bookingType === 'slot_pack_usage' ? 'Gói lượt' : '1 lần'}</span>
            </div>
          </div>

          {/* Price Breakdown */}
          {(() => {
            const pkgPrice = booking.packagePrice ?? booking.packageId?.price ?? 0;
            const subTotal = (booking.selectedSubServices || []).reduce((sum, s) => sum + (s.price || 0), 0);
            const totalValue = pkgPrice + subTotal;
            const finalVal = Number(booking.finalPrice ?? (totalValue - (booking.discountAmount || 0)));

            return (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Giá gói (cơ bản):</span>
                  <span className="font-mono font-semibold text-slate-800">{Number(pkgPrice).toLocaleString('vi-VN')}đ</span>
                </div>

                {booking.bookingType === 'slot_pack_usage' && (
                  <div className="flex justify-between items-center text-emerald-600">
                    <span>Chiết khấu gói lượt:</span>
                    <span className="font-mono font-semibold">-{Number(pkgPrice).toLocaleString('vi-VN')}đ</span>
                  </div>
                )}

                {(booking.selectedSubServices || []).filter(s => s.price > 0).map((s, i) => (
                  <div key={i} className="flex justify-between items-center text-slate-600">
                    <span>Dịch vụ chọn thêm ({s.name}):</span>
                    <span className="font-mono font-semibold text-slate-800">+{Number(s.price).toLocaleString('vi-VN')}đ</span>
                  </div>
                ))}

                {booking.voucherCode && booking.discountAmount > 0 && (
                  <div className="flex justify-between items-center text-emerald-700">
                    <span>Voucher ({booking.voucherCode}):</span>
                    <span className="font-mono font-semibold">-{Number(booking.discountAmount).toLocaleString('vi-VN')}đ</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs sm:text-sm font-bold text-slate-900">
                  <span>Thành tiền:</span>
                  <span className="font-mono font-black text-sm sm:text-base text-emerald-700">{finalVal.toLocaleString('vi-VN')}đ</span>
                </div>
                <p className="text-[11px] text-slate-400 text-right">* Giá đã bao gồm VAT {booking?.vatPercent ?? configs?.VAT_PERCENT ?? 10}%</p>
              </div>
            );
          })()}

          {/* Deposit summary */}
          {(booking.depositAmount > 0 && (!booking.isWalkIn || booking.depositPaid || booking.paymentStatus === 'paid')) && (
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              {booking.paymentStatus === 'paid' ? (
                <span className="text-emerald-700 font-bold">
                  ✓ Đã thanh toán trước 100% ({Number(booking.finalPrice || booking.totalAmount || 0).toLocaleString('vi-VN')}đ)
                </span>
              ) : booking.depositPaid ? (
                <span className="text-amber-700 font-bold">
                  ✓ Đã đặt cọc {Number(booking.depositAmount).toLocaleString('vi-VN')}đ (Còn lại: {Number(Math.max(0, (booking.finalPrice || booking.totalAmount || 0) - (booking.depositAmount || 0))).toLocaleString('vi-VN')}đ)
                </span>
              ) : (
                <span className="text-slate-600 font-bold">
                  Cần đặt cọc: {Number(booking.depositAmount).toLocaleString('vi-VN')}đ (Chưa cọc)
                </span>
              )}
            </div>
          )}

          <div className="pt-2">
            <button onClick={() => setShowPrint(true)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs transition-all shadow-xs cursor-pointer">
              In hóa đơn
            </button>
          </div>
        </div>
      </div>

      {/* Rating + Review (completed) */}
      {booking.status === 'completed' && (booking.rating || booking.feedback) && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-2">
          <h3 className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
            <Star size={11} weight="fill" /> Đánh giá từ khách hàng
          </h3>
          {booking.rating && (
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} size={16} weight={s <= booking.rating ? 'fill' : 'regular'}
                  className={s <= booking.rating ? 'text-amber-400' : 'text-slate-200'} />
              ))}
            </div>
          )}
          {booking.feedback && (
            <p className="text-sm text-amber-800 italic">"{booking.feedback}"</p>
          )}
          {booking.managerReply && (
            <div className="mt-2 border-t border-amber-200 pt-2">
              <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Phản hồi chi nhánh</p>
              <p className="text-xs text-emerald-800">{booking.managerReply}</p>
            </div>
          )}
        </div>
      )}

      {/* Lịch sử thanh toán (Outer detail view) */}
      <div className="mt-5 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <CreditCard size={16} className="text-emerald-600" /> Lịch sử thanh toán
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                <th className="py-2.5 px-3">Loại thanh toán</th>
                <th className="py-2.5 px-3">Phương thức</th>
                <th className="py-2.5 px-3">Ngày thanh toán</th>
                <th className="py-2.5 px-3 text-right">Đã trả</th>
                <th className="py-2.5 px-3 text-right">Mã giao dịch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receiptPayments === null ? (
                <tr>
                  <td className="py-3 px-3 font-semibold text-slate-800">
                    <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold ${booking.paymentStatus === 'deposit_paid' ? 'bg-amber-50 text-amber-700 border border-amber-200' : booking.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                      {booking.paymentStatus === 'paid' ? 'Toàn bộ' : (booking.paymentStatus === 'deposit_paid' ? 'Đặt cọc' : 'Chưa thanh toán')}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-700">
                    {booking.paymentMethod === 'wallet' ? 'Ví AutoWash' : booking.paymentMethod === 'cash' ? 'Tiền mặt' : booking.paymentMethod === 'vnpay' ? 'VNPay' : booking.paymentMethod === 'bank' ? 'Chuyển khoản' : 'Ví AutoWash'}
                  </td>
                  <td className="py-3 px-3 text-slate-600">{new Date(booking.paidAt || booking.updatedAt || booking.bookingDate).toLocaleDateString('vi-VN')}</td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-600">
                    {booking.paymentStatus === 'paid'
                      ? formatCurrency(booking.finalPrice || booking.totalAmount || 0)
                      : (booking.paymentStatus === 'deposit_paid' ? formatCurrency(booking.depositAmount || 0) : '0đ')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-500 font-semibold">TXN-{String(booking._id).slice(-8).toUpperCase()}</td>
                </tr>
              ) : receiptPayments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 px-3 text-center text-slate-400 italic">Chưa có giao dịch thanh toán</td>
                </tr>
              ) : receiptPayments.map((p, i) => (
                <tr key={i}>
                  <td className="py-3 px-3 font-semibold text-slate-800">
                    <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold ${p.paymentType === 'deposit' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                      {p.paymentType === 'deposit' ? 'Đặt cọc' : p.paymentType === 'remaining' ? 'Phần còn lại' : p.paymentType === 'full' ? 'Toàn bộ' : 'Thanh toán'}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-700">
                    {p.method === 'cash' ? 'Tiền mặt' : p.method === 'wallet' ? 'Ví AutoWash' : p.method === 'bank' ? 'Chuyển khoản' : p.method === 'vnpay' ? 'VNPay' : p.method === 'momo' ? 'MoMo' : (p.method || '—')}
                  </td>
                  <td className="py-3 px-3 text-slate-600">{new Date(p.paidAt || p.createdAt || booking.bookingDate).toLocaleDateString('vi-VN')}</td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-600">{formatCurrency(p.amount)}</td>
                  <td className="py-3 px-3 text-right font-mono text-slate-500 font-semibold">{p.transactionId ? String(p.transactionId).toUpperCase() : `TXN-${String(p._id || booking._id).slice(-8).toUpperCase()}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR check-in — chỉ hiển thị khi đơn đã xác nhận / đã check-in / hết hạn */}
      {renderQrButton()}

      {showQR && <QRDisplayModal booking={booking} onClose={() => setShowQR(false)} />}
      {showPrint && <PrintReceiptModal booking={booking} onClose={() => setShowPrint(false)} />}

      {/* ADD SERVICE MODAL */}
      {/* Cash payment confirmation modal */}
      {confirmCash && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm" onClick={() => setConfirmCash(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mx-auto mb-3">
              <CurrencyCircleDollar size={24} weight="fill" className="text-emerald-600" />
            </div>
            <h3 className="text-base font-bold text-slate-900 text-center">
              {managerPayMethod === 'wallet' ? 'Xác nhận thu từ ví' : 'Xác nhận thu tiền mặt'}
            </h3>
            <div className="mt-4 bg-slate-50 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Khách hàng:</span>
                <span className="font-bold text-slate-700">
                  {booking.userId?.name || 'Không xác định'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Phương thức:</span>
                <span className="font-bold text-slate-700">
                  {managerPayMethod === 'wallet' ? 'Ví AutoWash' : 'Tiền mặt'}
                </span>
              </div>
              {managerPayMethod === 'wallet' && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Số dư ví hiện tại:</span>
                  <span className="font-bold text-indigo-600">
                    {booking.userId?.walletBalance !== undefined ? formatCurrency(booking.userId.walletBalance) : 'Chưa cập nhật'}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                <span className="text-slate-500">Số tiền cần thu:</span>
                <span className="font-black text-emerald-600 text-sm">{formatCurrency(booking.paymentStatus === 'paid' ? 0 : (booking.finalPrice || booking.totalAmount || 0) - (booking.depositPaid ? (booking.depositAmount || 0) : 0))}</span>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button onClick={() => setConfirmCash(false)} disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50">Hủy</button>
              <button onClick={handleCashPayment} disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors disabled:opacity-60 flex items-center gap-1.5">
                {busy ? '...' : <><CheckCircle size={15} weight="fill" /> Xác nhận</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit sub-services modal */}
      {editingSubServices && (() => {
        const pkgSubs = booking.packageId?.subServices || [];
        const inc = pkgSubs.filter(s => s.isOptional === false);
        const opt = pkgSubs.filter(s => s.isOptional !== false);
        const prevOptNames = (booking.selectedSubServices || []).filter(s => s.isOptional !== false).map(s => s.name);
        const calcTotal = pkgSubs.filter(s => editedSubServiceNames.includes(s.name)).reduce((sum, s) => sum + (s.price || 0), 0);
        return (
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditingSubServices(false)}>
            <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100/80 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <NotePencil size={18} weight="fill" className="text-violet-600" />
                  <h3 className="text-base font-bold text-slate-800">Chỉnh sửa dịch vụ</h3>
                </div>
                <button onClick={() => setEditingSubServices(false)} disabled={savingSubServices} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {inc.length > 0 && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1.5">Dịch vụ bao gồm trong gói <span className="font-normal text-slate-400">(Tích chọn/Hủy chọn)</span>:</label>
                    <div className="space-y-1.5">
                      {inc.map((sub, i) => {
                        const checked = editedSubServiceNames.includes(sub.name);
                        return (
                          <label key={i} className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${checked ? 'bg-white border-emerald-300 text-emerald-800' : 'bg-white/60 border-slate-200 text-slate-400 line-through'}`}>
                            <input type="checkbox" checked={checked} onChange={() => handleToggleSubService(sub.name)} className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer" />
                            <span>{sub.name}{sub.duration ? ` (${sub.duration} phút)` : ''}</span>
                            <span className="ml-auto text-[11px] font-bold text-emerald-600">Đi kèm (0đ)</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {opt.length > 0 && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1.5">Dịch vụ chọn thêm <span className="font-normal text-slate-400">(Tích để chọn thêm)</span>:</label>
                    <div className="space-y-1.5">
                      {opt.map((sub, i) => {
                        const checked = editedSubServiceNames.includes(sub.name);
                        const wasPaid = prevOptNames.includes(sub.name) && sub.price > 0;
                        return (
                          <label key={i} className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${checked ? 'bg-white border-indigo-300 text-indigo-800' : 'bg-white/60 border-slate-200 text-slate-500'}`}>
                            <input type="checkbox" checked={checked} onChange={() => handleToggleSubService(sub.name)} className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer" />
                            <span>{sub.name}{sub.duration ? ` (${sub.duration} phút)` : ''}</span>
                            <span className="ml-auto text-[11px] font-bold text-indigo-600">{wasPaid && !checked ? `-${formatCurrency(sub.price)}` : `+${formatCurrency(sub.price)}`}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1">
                  <div className="flex justify-between text-slate-700">
                    <span className="font-medium">Tổng tiền dịch vụ mới:</span>
                    <span className="font-bold text-slate-900 text-sm">{formatCurrency(calcTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 px-6 pb-6">
                <button onClick={handleSaveSubServices} disabled={savingSubServices}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50">
                  {savingSubServices ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Đang lưu...</> : 'Lưu thay đổi dịch vụ'}
                </button>
                <button onClick={() => setEditingSubServices(false)} disabled={savingSubServices}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors">Hủy</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Refund confirmation for edit flow */}
      {refundConfirmData && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative border border-emerald-100">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-2xl mb-3 mx-auto">💡</div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-1">Xác nhận hủy dịch vụ & hoàn tiền vào Ví</h3>
            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 my-4 space-y-2 text-xs">
              <div className="text-slate-600 font-medium">Bạn đã bỏ chọn dịch vụ chọn thêm:</div>
              <div className="font-bold text-emerald-800 bg-white/90 p-2.5 rounded-lg border border-emerald-100/80 leading-relaxed">
                {refundConfirmData.canceledNames.map((n, i) => <div key={i}>• {String(n).replace(/^\+\s*/, '')}</div>)}
              </div>
              <div className="pt-2 border-t border-emerald-200/60 flex justify-between items-center text-sm">
                <span className="font-medium text-slate-700">Số tiền hoàn về Ví:</span>
                <span className="font-black text-emerald-600 text-base">+{formatCurrency(refundConfirmData.refundAmount)}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 text-center mb-4 leading-relaxed">
              Số tiền trên sẽ được tự động hoàn trực tiếp vào <b>Ví AutoWash Pro</b> của khách hàng ngay khi bấm xác nhận.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRefundConfirmData(null)} disabled={savingSubServices}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors">Quay lại</button>
              <button onClick={() => executeSaveSubServices(refundConfirmData.targetSubServices)} disabled={savingSubServices}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-colors flex items-center justify-center gap-1.5">
                {savingSubServices ? 'Đang xử lý...' : 'Xác nhận & Hoàn tiền'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR SePay Payment Modal */}
      {showPaymentQR && paymentQRData && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPaymentQR(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-100/80 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="pt-5 pb-2 text-center px-6">
              <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2 bg-emerald-50 border-2 border-emerald-100">
                <CurrencyCircleDollar size={22} weight="fill" className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Chuyển khoản ngân hàng</h3>
              <p className="text-slate-400 text-[11px] mt-0.5">Quét mã QR để thanh toán</p>
            </div>

            <div className="px-6 pb-1 flex justify-center">
              <div className="bg-white rounded-xl border-2 border-slate-100 p-2.5 shadow-sm">
                {paymentQRData.qrCode ? (
                  <img src={paymentQRData.qrCode} alt="QR ngân hàng" className="w-36 h-36" />
                ) : (
                  <div className="w-36 h-36 flex items-center justify-center text-slate-300 text-[11px]">Đang tải...</div>
                )}
              </div>
            </div>

            <div className="px-5 py-1">
              <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                <div className="text-xs text-slate-400 mb-1">Số tiền</div>
                <div className="text-2xl font-black text-emerald-600">{Number(paymentQRData.amount || 0).toLocaleString('vi-VN')}đ</div>
              </div>
            </div>

            {paymentQRData.bankInfo && (
              <div className="px-5 space-y-2">
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-semibold">Ngân hàng</span>
                    <span className="text-xs font-bold text-slate-700">{paymentQRData.bankInfo.bankName}</span>
                  </div>
                  <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-semibold">Số tài khoản</span>
                    <span className="text-xs font-bold text-slate-700 font-mono tracking-wider">{paymentQRData.bankInfo.accountNumber}</span>
                  </div>
                  <div className="px-3 py-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-semibold">Chủ tài khoản</span>
                    <span className="text-xs font-bold text-slate-700">{paymentQRData.bankInfo.accountHolder}</span>
                  </div>
                  <div className="px-3 py-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-slate-400 font-semibold">Nội dung chuyển khoản</span>
                      <button onClick={() => { navigator.clipboard.writeText(paymentQRData.bankInfo.transferContent); alert('Đã copy nội dung CK!'); }}
                        className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-wider">Copy</button>
                    </div>
                    <div className="text-sm font-bold text-slate-700 font-mono bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center tracking-wider">
                      {paymentQRData.bankInfo.transferContent}
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-semibold">Mã giao dịch</span>
                  <span className="text-xs font-bold text-slate-700 font-mono">{paymentQRData.transactionId}</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-0.5 pb-1">
                  <svg className={`w-3.5 h-3.5 text-emerald-500 ${qrPollCount % 2 === 0 ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  Đang kiểm tra thanh toán...
                </div>
              </div>
            )}

            <div className="p-4">
              <button onClick={() => { setShowPaymentQR(false); setPaymentQRData(null); }}
                className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                Hủy giao dịch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Week view (lịch tuần) ── */
const CAL_STATUS_COLOR = {
  pending: 'bg-amber-400 text-white border-amber-500',
  confirmed: 'bg-indigo-500 text-white border-indigo-600',
  checked_in: 'bg-cyan-500 text-white border-cyan-600',
  in_progress: 'bg-blue-500 text-white border-blue-600',
  awaiting_payment: 'bg-orange-500 text-white border-orange-600',
  completed: 'bg-emerald-500 text-white border-emerald-600',
  cancelled: 'bg-slate-300 text-slate-600 border-slate-400',
};

function calDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function getWeekStart(from = new Date()) {
  const d = new Date(from);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

const WEEK_DAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function WeekView({ onSelect, onConfirmAll, onQR, refreshSignal }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const load = useCallback(async (start) => {
    setLoading(true);
    try {
      const from = calDateStr(start);
      const endDay = new Date(start);
      endDay.setDate(start.getDate() + 6);
      const to = calDateStr(endDay);
      const res = await api(`/bookings?dateFrom=${from}&dateTo=${to}&limit=500&page=1`);
      const data = await res.json();
      const list = data?.data?.bookings || data?.data || [];
      setBookings(Array.isArray(list) ? list : []);
    } catch { setBookings([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(weekStart); }, [weekStart, load, refreshSignal]);

  const byDay = {};
  for (const b of bookings) {
    const ds = b.bookingDate ? calDateStr(new Date(b.bookingDate)) : '';
    if (!byDay[ds]) byDay[ds] = [];
    byDay[ds].push(b);
  }

  const todayStr = calDateStr(new Date());
  const pendingCount = bookings.filter((b) => b.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
            className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-50"><CaretLeft size={14} /></button>
          <div className="px-3 py-1.5 text-sm font-semibold text-slate-800 min-w-56 text-center">
            {weekDays[0].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – {weekDays[6].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </div>
          <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
            className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-50"><CaretRight size={14} /></button>
        </div>
        <button onClick={() => setWeekStart(getWeekStart())}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors">
          Tuần này
        </button>
        {pendingCount > 0 && (
          <button onClick={() => onConfirmAll(bookings.filter((b) => b.status === 'pending').map((b) => b._id), () => load(weekStart))}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
            <CheckCircle size={14} weight="fill" /> Xác nhận tất cả ({pendingCount})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Day header row */}
          <div className="grid border-b border-slate-100 bg-slate-50 sticky top-0 z-10"
            style={{ gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))' }}>
            {weekDays.map((day, i) => {
              const ds = calDateStr(day);
              const isToday = ds === todayStr;
              const count = (byDay[ds] || []).length;
              const newCount = (byDay[ds] || []).filter((b) => isNewBooking(b)).length;
              return (
                <div key={ds} className={`px-2 py-2.5 text-center border-r border-slate-100 last:border-0 ${isToday ? 'bg-blue-50' : ''}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-blue-500' : 'text-slate-400'}`}>{WEEK_DAY_SHORT[i]}</p>
                  <p className={`text-xl font-bold leading-tight ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>{day.getDate()}</p>
                  <p className="text-[10px] text-slate-400 mb-1">{day.toLocaleDateString('vi-VN', { month: 'numeric' })} / {day.getFullYear()}</p>
                  {count > 0 ? (
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{count} lịch</span>
                      {newCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-white" />{newCount} mới
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-300">Trống</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Day columns with booking cards */}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))' }}>
            {weekDays.map((day) => {
              const ds = calDateStr(day);
              const isToday = ds === todayStr;
              const dayBookings = [...(byDay[ds] || [])].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

              const slotCounts = {};
              dayBookings.forEach(b => {
                if (b.status !== 'completed' && b.status !== 'cancelled' && b.startTime) {
                  slotCounts[b.startTime] = (slotCounts[b.startTime] || 0) + 1;
                }
              });

              return (
                <div key={ds} className={`border-r border-slate-100 last:border-0 p-1.5 space-y-1 min-h-[160px] ${isToday ? 'bg-blue-50/30' : ''}`}>
                  {Object.keys(slotCounts).length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1 justify-center pb-2 border-b border-slate-100">
                      {Object.entries(slotCounts).sort(([s1], [s2]) => s1.localeCompare(s2)).map(([slot, c]) => (
                        <span key={slot} className="text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 px-1 py-0.5 rounded" title={`${c} lịch đang hoạt động`}>
                          {slot} ({c})
                        </span>
                      ))}
                    </div>
                  )}
                  {dayBookings.length === 0 ? (
                    <div className="flex min-h-[140px] items-center justify-center">
                      <p className="text-[10px] text-slate-200">—</p>
                    </div>
                  ) : dayBookings.map((b) => {
                    const fresh = isNewBooking(b);
                    const colorCls = CAL_STATUS_COLOR[b.status] || CAL_STATUS_COLOR.pending;
                    const qrMode = getQrMode(b);
                    return (
                      <div key={b._id} onClick={() => onSelect(b)}
                        title={`${b.userId?.name || '?'} | ${b.startTime}–${b.endTime} | ${STATUS_MAP[b.status]?.label || b.status}`}
                        className={`relative rounded-lg border px-2 py-1.5 cursor-pointer transition-opacity hover:opacity-80 ${colorCls} ${fresh ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}>
                        {fresh && (
                          <span className="absolute -top-1.5 right-1 inline-flex items-center gap-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold text-white shadow-sm">
                            <span className="h-1 w-1 animate-pulse rounded-full bg-white" /> Mới
                          </span>
                        )}
                        {qrMode && (
                          <button onClick={(e) => { e.stopPropagation(); onQR(b); }} title="Xem QR"
                            className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded bg-white/25 hover:bg-white/40">
                            <QrCode size={10} weight="bold" />
                          </button>
                        )}
                        <p className="text-[10px] font-bold leading-tight opacity-75">{b.startTime}–{b.endTime}</p>
                        <p className="text-[11px] font-semibold leading-tight truncate pr-5">{b.userId?.name || '—'}</p>
                        <p className="text-[10px] leading-tight truncate opacity-75">{b.packageId?.name || '—'}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(STATUS_MAP).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5 text-xs text-slate-500">
            <div className={`h-3 w-3 rounded-sm ${(CAL_STATUS_COLOR[k] || '').split(' ')[0]}`} />
            {v.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ Main ═══ */
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PAGE_SIZE = 15;

export default function ManagerBookings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useOutletContext() || {};

  const getInitialValue = (paramKey, defaultValue) => {
    if (searchParams.has(paramKey)) {
      return searchParams.get(paramKey);
    }
    const saved = sessionStorage.getItem('manager_bookings_filters');
    if (saved) {
      const sp = new URLSearchParams(saved);
      if (sp.has(paramKey)) return sp.get(paramKey);
    }
    return defaultValue;
  };

  const [bookings, setBookings] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(() => {
    const val = getInitialValue('page', '1');
    return parseInt(val, 10) || 1;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(() => getInitialValue('search', ''));
  const [statusFilter, setStatusFilter] = useState(() => getInitialValue('status', ''));
  const [typeFilter, setTypeFilter] = useState(() => getInitialValue('type', ''));
  const [todayOnly, setTodayOnly] = useState(() => getInitialValue('today', 'false') === 'true');
  const [dateFrom, setDateFrom] = useState(() => getInitialValue('dateFrom', ''));
  const [dateTo, setDateTo] = useState(() => getInitialValue('dateTo', ''));
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [viewMode, setViewMode] = useState(() => getInitialValue('viewMode', 'table')); // 'table' | 'calendar'
  const [bookingTypeTab, setBookingTypeTab] = useState(() => {
    const saved = getInitialValue('type', '');
    if (saved === 'recurring') return 'recurring';
    if (saved === 'single') return 'regular';
    if (saved === '') return 'all';
    return 'all';
  }); // 'all' | 'regular' | 'recurring'
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [qrBooking, setQrBooking] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [groupChildren, setGroupChildren] = useState({});
  const groupChildrenLoadingRef = useRef({});
  const debounce = useRef(null);

  const loadGroupChildren = useCallback(async (groupId) => {
    if (groupChildrenLoadingRef.current[groupId]) return;
    groupChildrenLoadingRef.current[groupId] = true;
    try {
      const res = await api(`/bookings?recurringGroupId=${encodeURIComponent(groupId)}&limit=200`);
      if (!res.ok) throw new Error(await readErr(res));
      const p = await res.json();
      const list = p?.data?.bookings ?? (Array.isArray(p?.data) ? p.data : []);
      const sorted = [...list].sort((a, b) => new Date(a.bookingDate) - new Date(b.bookingDate));
      setGroupChildren(prev => ({ ...prev, [groupId]: sorted }));
    } catch {
      // giữ nguyên state -> lần expand sau sẽ thử lại
    } finally {
      groupChildrenLoadingRef.current[groupId] = false;
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (todayOnly) params.set('today', 'true');
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (page > 1) params.set('page', String(page));
    if (viewMode && viewMode !== 'table') params.set('viewMode', viewMode);

    const queryString = params.toString();
    sessionStorage.setItem('manager_bookings_filters', queryString);
    setSearchParams(params, { replace: true });
  }, [search, statusFilter, typeFilter, todayOnly, dateFrom, dateTo, page, viewMode, setSearchParams]);

  const toggleGroup = (groupId) => {
    const willExpand = !expandedGroups[groupId];
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    if (willExpand && !groupChildren[groupId]) loadGroupChildren(groupId);
  };

  const [viewedBookings, setViewedBookings] = useState(() => {
    return JSON.parse(localStorage.getItem('viewed_bookings') || '[]');
  });

  const isNewBooking = useCallback((b) => {
    if (!b || b.status !== 'pending') return false;
    const isCreatedToday = b.createdAt && new Date(b.createdAt).toDateString() === new Date().toDateString();
    return isCreatedToday && !viewedBookings.includes(b._id);
  }, [viewedBookings]);

  const handleSelectBookingWithMark = (b) => {
    if (b._id && !viewedBookings.includes(b._id)) {
      const next = [...viewedBookings, b._id];
      setViewedBookings(next);
      localStorage.setItem('viewed_bookings', JSON.stringify(next));
      window.dispatchEvent(new Event('booking-viewed'));
    }
    navigate(`/manager/bookings/${b._id}`, { state: { fromSearch: location.search } });
  };

  const tableData = useMemo(() => {
    // BE đã gom groupByRecurring trước phân trang; mỗi group là 1 hàng có isGroup=true.
    // Children được lazy-load khi expand (groupChildren[groupId]).
    return bookings.map(b => {
      if (b.isGroup) {
        return {
          isGroup: true,
          groupId: b.recurringGroupId,
          children: groupChildren[b.recurringGroupId] || [],
          groupCount: b.groupCount || 0,
          userId: b.userId,
          packageId: b.packageId,
          bookingType: 'recurring_group',
          bookingDate: b.bookingDate,
          startTime: b.startTime,
          bookingCode: b.bookingCode,
          _id: `group_${b.recurringGroupId}`,
        };
      }
      return b;
    });
  }, [bookings, groupChildren]);

  const notify = showToast;
  const [sortFilter, setSortFilter] = useState('newest');

  const fetch_ = useCallback(async (q = search, sf = statusFilter, tf = typeFilter, today = todayOnly, df = dateFrom, dt = dateTo, pg = page, sort = sortFilter) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: pg, limit: PAGE_SIZE });
      params.set('groupByRecurring', 'true');
      if (sort) params.set('sort', sort);
      if (sf) params.set('status', sf);
      if (tf) params.set('bookingType', tf);
      if (q.trim()) params.set('search', q.trim());
      if (today) { const d = getTodayStr(); params.set('createdFrom', d); params.set('createdTo', d); }
      else if (df) { params.set('dateFrom', df); if (dt) params.set('dateTo', dt); }
      const res = await api(`/bookings?${params}`);
      if (!res.ok) throw new Error(await readErr(res));
      const p = await res.json();
      const data = p?.data ?? p;
      const pagination = data?.pagination;
      setBookings(data?.bookings ?? (Array.isArray(data) ? data : []));
      setTotal(pagination?.total ?? data?.total ?? 0);
      setPage(pagination?.page ?? data?.page ?? pg);
      setTotalPages(pagination?.totalPages ?? data?.totalPages ?? 1);
    } catch (err) { setError(err.message || 'Không thể tải dữ liệu'); }
    finally { setLoading(false); }
  }, [search, statusFilter, typeFilter, sortFilter, todayOnly, dateFrom, dateTo, page]);

  useEffect(() => { fetch_(); }, []); // eslint-disable-line

  const token = getStoredToken();
  const [refreshSignal, setRefreshSignal] = useState(0);
  const triggerRefresh = useCallback(() => {
    fetch_();
    setRefreshSignal(s => s + 1);
  }, [fetch_]);

  useSSE(token, 'slots_updated', triggerRefresh);
  useSSE(token, 'payment_new', triggerRefresh);
  useSSE(token, 'booking_new', () => {
    notify('🔔 Có đơn đặt lịch mới tại chi nhánh!', 'info');
    triggerRefresh();
  });
  useSSE(token, 'customer_checkin_request', () => {
    notify('⚡ Khách hàng vừa gửi yêu cầu Check-in tại quầy!', 'info');
    triggerRefresh();
  });
  useSSE(token, 'customer_checked_in_via_qr', (data) => {
    notify('✅ Khách đã quét QR Check-in thành công!', 'success');
    triggerRefresh();
    if (data?.bookingId) {
      navigate(`/manager/bookings/${data.bookingId}`);
    }
  });

  const handleSearch = (v) => {
    setSearch(v);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setPage(1); fetch_(v, statusFilter, typeFilter, todayOnly, dateFrom, dateTo, 1, sortFilter); }, 420);
  };

  const handleFilter = (v) => { setStatusFilter(v); setPage(1); fetch_(search, v, typeFilter, todayOnly, dateFrom, dateTo, 1, sortFilter); };
  const handleTypeFilter = (v) => { setTypeFilter(v); setPage(1); fetch_(search, statusFilter, v, todayOnly, dateFrom, dateTo, 1, sortFilter); };
  const handleTodayToggle = () => { const next = !todayOnly; setTodayOnly(next); setPage(1); if (next) { setDateFrom(''); setDateTo(''); } fetch_(search, statusFilter, typeFilter, next, '', '', 1, sortFilter); };
  const handlePageChange = (pg) => { setPage(pg); fetch_(search, statusFilter, typeFilter, todayOnly, dateFrom, dateTo, pg, sortFilter); };

  const handleUpdated = (updated) => {
    const mergeOne = (b) => {
      const merged = { ...b, ...updated };
      ['userId', 'packageId', 'vehicleId', 'branchId'].forEach((k) => {
        if (typeof updated[k] === 'string' || updated[k] == null) merged[k] = b[k];
      });
      return merged;
    };
    setBookings((p) => p.map((b) => (b._id !== updated._id ? b : mergeOne(b))));
    setGroupChildren((prev) => {
      let touched = false;
      const next = {};
      Object.keys(prev).forEach((gid) => {
        const list = prev[gid];
        if (!Array.isArray(list) || !list.some((c) => c._id === updated._id)) { next[gid] = list; return; }
        touched = true;
        next[gid] = list.map((c) => (c._id !== updated._id ? c : mergeOne(c)));
      });
      return touched ? next : prev;
    });
    notify('Đã cập nhật trạng thái đặt lịch');
  };

  const handleCancel = async (id) => {
    const reason = cancelReason.trim();
    setConfirmCancelId(null);
    setCancelReason('');
    try {
      const res = await api(`/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ cancellationReason: reason || 'Quản lý hủy' }) });
      if (!res.ok) throw new Error(await readErr(res));
      const p = await res.json();
      const updated = p?.data ?? p;
      const mergeOne = (b) => {
        const merged = { ...b, ...updated };
        ['userId', 'packageId', 'vehicleId', 'branchId'].forEach((k) => {
          if (typeof updated[k] === 'string' || updated[k] == null) merged[k] = b[k];
        });
        return merged;
      };
      setBookings((prev) => prev.map((b) => (b._id !== updated._id ? b : mergeOne(b))));
      setGroupChildren((prev) => {
        let touched = false;
        const next = {};
        Object.keys(prev).forEach((gid) => {
          const list = prev[gid];
          if (!Array.isArray(list) || !list.some((c) => c._id === updated._id)) { next[gid] = list; return; }
          touched = true;
          next[gid] = list.map((c) => (c._id !== updated._id ? c : mergeOne(c)));
        });
        return touched ? next : prev;
      });
      notify('Đã hủy lịch');
    } catch (err) { notify(err.message || 'Hủy thất bại', 'error'); }
  };

  const pendingInView = (() => {
    const list = [];
    tableData.forEach((item) => {
      if (item.isGroup) {
        item.children.forEach((c) => { if (c.status === 'pending') list.push(c); });
      } else if (item.status === 'pending') {
        list.push(item);
      }
    });
    return list;
  })();

  // Xác nhận hàng loạt; nếu truyền ids dùng ids, ngược lại xác nhận các đơn pending đang hiển thị.
  const confirmAll = async (ids, after) => {
    setConfirmingAll(true);
    try {
      const res = await api(`/bookings/confirm`, {
        method: 'POST',
        body: JSON.stringify(ids && ids.length ? { ids } : { ids: pendingInView.map((b) => b._id) }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      const p = await res.json();
      const result = p?.data ?? p;
      notify(`Đã xác nhận ${result.confirmed} đơn`);
      if (after) after();
      else fetch_(search, statusFilter, typeFilter, todayOnly, dateFrom, dateTo, page, sortFilter);
    } catch (err) {
      notify(err.message || 'Xác nhận thất bại', 'error');
    } finally {
      setConfirmingAll(false);
      setConfirmAllOpen(false);
    }
  };

  const handleBookingTypeTab = (tab) => {
    setBookingTypeTab(tab);
    let tf = '';
    if (tab === 'regular') tf = 'single';
    else if (tab === 'recurring') tf = 'recurring';
    else if (tab === 'all') tf = '';
    setTypeFilter(tf);
    setPage(1);
    fetch_(search, statusFilter, tf, todayOnly, dateFrom, dateTo, 1, sortFilter);
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setTodayOnly(false);
    setBookingTypeTab('all');
    setTypeFilter('');
    setSortFilter('newest');
    setPage(1);
    fetch_('', '', '', false, '', '', 1, 'newest');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* view toggle: Bảng / Lịch */}
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          <button onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === 'table' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Rows size={14} /> Bảng
          </button>
          <button onClick={() => setViewMode('calendar')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === 'calendar' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <CalendarBlank size={14} /> Lịch
          </button>
        </div>

        {viewMode === 'table' && (
          <>
            <div className="relative flex-1 min-w-[200px]">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="booking-search" value={search} onChange={(e) => handleSearch(e.target.value)}
                placeholder="Tìm theo khách hàng, mã đặt…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors" />
            </div>

            {/* Sort Dropdown */}
            <select
              id="manager-booking-sort"
              value={sortFilter}
              onChange={(e) => {
                const v = e.target.value;
                setSortFilter(v);
                setPage(1);
                fetch_(search, statusFilter, typeFilter, todayOnly, dateFrom, dateTo, 1, v);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors cursor-pointer"
            >
              <option value="time_asc">Lịch hẹn gần nhất (Sớm → Muộn)</option>
              <option value="newest">Mới tạo nhất</option>
              <option value="time_desc">Lịch hẹn xa nhất (Muộn → Sớm)</option>
              <option value="price_desc">Giá trị cao nhất</option>
              <option value="price_asc">Giá trị thấp nhất</option>
              <option value="priority_desc">Khách hàng VIP</option>
              <option value="oldest">Tạo cũ nhất</option>
            </select>

            <select id="booking-status-filter" value={statusFilter} onChange={(e) => handleFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors cursor-pointer">
              <option value="">Tất cả trạng thái</option>
              <option value="pending">Chờ xác nhận</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="checked_in">Đã check-in</option>
              <option value="in_progress">Đang thực hiện</option>
              <option value="completed">Hoàn thành</option>
              <option value="cancelled">Đã hủy</option>
            </select>
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateFrom} max={dateTo || undefined}
                onChange={(e) => { const v = e.target.value; setDateFrom(v); setTodayOnly(false); setPage(1); fetch_(search, statusFilter, typeFilter, false, v, dateTo, 1); }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors" />
              <span className="text-slate-400 text-xs">→</span>
              <input type="date" value={dateTo} min={dateFrom || undefined}
                onChange={(e) => { const v = e.target.value; setDateTo(v); setTodayOnly(false); setPage(1); fetch_(search, statusFilter, typeFilter, false, dateFrom, v, 1); }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors" />
              <button onClick={() => { setDateFrom(''); setDateTo(''); setTodayOnly(true); setPage(1); fetch_(search, statusFilter, typeFilter, true, '', '', 1); }}
                className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${todayOnly ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}>
                📅 Hôm nay
              </button>
            </div>
            <button onClick={() => fetch_(search, statusFilter, typeFilter, todayOnly, dateFrom, dateTo)} disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors">
              <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            {(search || statusFilter || dateFrom || dateTo || todayOnly || bookingTypeTab !== 'all') && (
              <button onClick={handleClearFilters}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                <XCircle size={14} /> Xóa bộ lọc
              </button>
            )}
            {pendingInView.length > 0 && (
              <button onClick={() => setConfirmAllOpen(true)} disabled={confirmingAll}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                <CheckCircle size={14} weight="fill" /> Xác nhận tất cả ({pendingInView.length})
              </button>
            )}
          </>
        )}

        </div>

      {/* Booking type tabs — only shown in table mode */}
      {viewMode === 'table' && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-fit">

            <button
              id="tab-all-bookings"
              onClick={() => handleBookingTypeTab('all')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${bookingTypeTab === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
            >
              📋 Tất cả
            </button>
            <button
              id="tab-regular-bookings"
              onClick={() => handleBookingTypeTab('regular')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${bookingTypeTab === 'regular'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
            >
              📅 Đặt lịch thường
            </button>
            <button
              id="tab-recurring-bookings"
              onClick={() => handleBookingTypeTab('recurring')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${bookingTypeTab === 'recurring'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
            >
              🔄 Đặt lịch định kỳ
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowWalkInModal(true)}
              className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 transition-all shadow-sm">
              <Lightning size={18} weight="fill" className="text-blue-600" /> Tạo đơn tại cửa hàng
            </button>
            <button onClick={() => setShowQRScanner(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
              <QrCode size={18} weight="bold" className="text-slate-700" /> Mã QR
            </button>
          </div>
        </div>
      )}

      {viewMode === 'calendar' && (
        <WeekView
          onSelect={(b) => handleSelectBookingWithMark(b)}
          onConfirmAll={(ids, after) => confirmAll(ids, after)}
          onQR={(b) => setQrBooking(b)}
        />
      )}
      {viewMode === 'table' && (<>
        {/* filter info */}
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-400">
            {todayOnly
              ? `Lịch hôm nay (${new Date().toLocaleDateString('vi-VN')}) — `
              : dateFrom || dateTo
                ? `Từ ${dateFrom || '...'} đến ${dateTo || '...'} — `
                : ''}
            {total > 0 ? `${total} lịch hẹn` : ''}
          </p>
          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${bookingTypeTab === 'recurring'
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : bookingTypeTab === 'regular'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
            {bookingTypeTab === 'recurring' ? '🔄 Đang xem: Đặt lịch định kỳ' : bookingTypeTab === 'regular' ? '📅 Đang xem: Đặt lịch thường' : '📋 Đang xem: Tất cả'}
          </span>
        </div>


        {/* table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400"><Spinner /></div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-16 text-red-500">
              <Warning size={26} weight="duotone" /><p className="text-sm">{error}</p>
              <button onClick={() => fetch_()} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm hover:bg-red-50 transition-colors">Thử lại</button>
            </div>
          ) : bookings.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <CalendarCheck size={36} weight="thin" /><p className="text-sm">Không có lịch đặt nào</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3">Khách hàng</th>
                  <th className="px-4 py-3">Mã đơn</th>
                  <th className="px-4 py-3">Dịch vụ</th>
                  <th className="px-4 py-3">Ngày / Giờ</th>
                  <th className="px-4 py-3">Thanh toán</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableData.map((b) => {
                  if (b.isGroup) {
                    const isExpanded = expandedGroups[b.groupId];
                    return (
                      <Fragment key={b._id}>
                        <tr className="hover:bg-slate-50 transition-colors cursor-pointer bg-indigo-50/30" onClick={() => toggleGroup(b.groupId)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-indigo-500">
                                {isExpanded ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
                              </span>
                              <p className="font-medium text-slate-800">{b.userId?.name ?? '—'}</p>
                              {b.userId?.tier && <TierBadge tier={b.userId.tier} />}
                              {(() => {
                                const hasNew = (b.children || []).some(isNewBooking);
                                if (!hasNew) return null;
                                return (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Mới
                                  </span>
                                );
                              })()}
                            </div>
                            <p className="text-[11px] text-slate-400 pl-6">{b.userId?.phone ?? ''}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs font-bold text-slate-400">#{b.bookingCode || (b.groupId || '').slice(-6).toUpperCase()}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-slate-600">{b.packageId?.name ?? '—'}</span>
                            <div className="mt-1">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700">
                                Nhóm định kỳ ({b.groupCount || (b.children || []).length} đơn)
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-700">
                              {b.children.length > 0
                                ? `${new Date(b.children[0].bookingDate).toLocaleDateString('vi-VN')} → ${new Date(b.children[b.children.length - 1].bookingDate).toLocaleDateString('vi-VN')}`
                                : b.bookingDate
                                  ? new Date(b.bookingDate).toLocaleDateString('vi-VN')
                                  : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-slate-500 italic">Xem chi tiết ở đơn lẻ</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-slate-500 italic">Xem chi tiết ở đơn lẻ</span>
                          </td>
                          <td className="px-4 py-3 text-right"></td>
                        </tr>
                        {isExpanded && b.children.length === 0 && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-400">
                              <span className="inline-flex items-center gap-2"><Spinner /> Đang tải các đơn trong nhóm…</span>
                            </td>
                          </tr>
                        )}
                        {isExpanded && b.children.map(child => (
                          <tr key={child._id} className="hover:bg-slate-50 transition-colors bg-slate-50/50">
                            <td className="px-4 py-3 pl-10 relative">
                              <div className="absolute left-6 top-0 bottom-0 w-px bg-indigo-100"></div>
                              <div className="absolute left-6 top-1/2 w-3 h-px bg-indigo-100"></div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="font-medium text-slate-800">{child.userId?.name ?? '—'}</p>
                                {child.userId?.tier && <TierBadge tier={child.userId.tier} />}
                              </div>
                              <p className="text-[11px] text-slate-400">{child.userId?.phone ?? ''}</p>
                            </td>
                            <td className="px-4 py-3">
                              {child.bookingCode ? <span className="font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 text-[10px]">#{child.bookingCode}</span> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-slate-600">{child.packageId?.name ?? '—'}</span>
                              <div className="mt-1">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${TYPE_MAP[child.bookingType]?.cls || 'bg-slate-100 text-slate-500'}`}>
                                  {TYPE_MAP[child.bookingType]?.label || child.bookingType} (Lần {child.recurringPosition}/{child.recurringTotal})
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-800">{new Date(child.bookingDate).toLocaleDateString('vi-VN')}</p>
                              <p className="text-[11px] text-slate-500 font-medium">{child.startTime}</p>
                              {child.createdAt && (
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5" title="Thời gian khách đặt đơn">
                                  Đặt: {new Date(child.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${child.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' :
                                child.paymentStatus === 'deposit_paid' ? 'bg-teal-50 text-teal-700' :
                                  child.paymentStatus === 'refunded' ? 'bg-slate-100 text-slate-500' :
                                    'bg-amber-50 text-amber-700'
                                }`}>
                                {
                                  child.paymentStatus === 'paid' ? 'Đã thanh toán' :
                                    child.paymentStatus === 'deposit_paid' ? 'Đã cọc' :
                                      child.paymentStatus === 'refunded' ? 'Đã hoàn tiền' :
                                        child.paymentStatus === 'failed' ? 'Thất bại' :
                                          'Chưa thanh toán'
                                }
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <StatusMenu bookingId={child._id} current={child.status} onUpdated={handleUpdated} notify={notify} />
                              <AtRiskNotice booking={child} onUpdated={handleUpdated} notify={notify} />
                              <WaitingSlotNotice booking={child} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={() => handleSelectBookingWithMark(child)}
                                  className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
                                  Xem đơn
                                </button>
                                {child.status !== 'cancelled' && child.status !== 'completed' && (
                                  <button onClick={() => setConfirmCancelId(child._id)}
                                    className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors">
                                    Hủy
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  }

                  // Normal row
                  return (
                    <tr key={b._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-medium text-slate-800">
                            {b.userId?.name ?? '—'}
                            {b.isWalkIn && b.isNewCustomerWalkIn && (
                              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700 border border-purple-200">
                                <Lightning size={10} weight="fill" /> Vãng lai
                              </span>
                            )}
                          </p>
                          {b.userId?.tier && <TierBadge tier={b.userId.tier} />}
                          {isNewBooking(b) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Mới
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{b.userId?.phone ?? ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        {b.bookingCode ? <span className="font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 text-[10px]">#{b.bookingCode}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-600">{b.packageName || b.packageSnapshot?.name || b.packageId?.name || '—'}</span>
                        {b.bookingType && (
                          <div className="mt-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${TYPE_MAP[b.bookingType]?.cls || 'bg-slate-100 text-slate-500'}`}>
                              {TYPE_MAP[b.bookingType]?.label || b.bookingType}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{new Date(b.bookingDate).toLocaleDateString('vi-VN')}</p>
                        <p className="text-[11px] text-slate-500 font-medium">{b.startTime}</p>
                        {b.createdAt && (
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5" title="Thời gian khách đặt đơn">
                            Đặt: {new Date(b.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' :
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
                      <td className="px-4 py-3">
                        <StatusMenu bookingId={b._id} current={b.status} onUpdated={handleUpdated} notify={notify} />
                        <AtRiskNotice booking={b} onUpdated={handleUpdated} notify={notify} />
                        <WaitingSlotNotice booking={b} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleSelectBookingWithMark(b)}
                            className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
                            Xem đơn
                          </button>
                          {b.status !== 'cancelled' && b.status !== 'completed' && (
                            <button onClick={() => setConfirmCancelId(b._id)}
                              className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors">
                              Hủy
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              ‹ Trước
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => handlePageChange(p)} disabled={loading}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${page === p ? 'bg-blue-600 text-white shadow-sm' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>{p}</button>
            ))}
            <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              Sau ›
            </button>
          </div>
        )}
      </>)}

      {qrBooking && <QRDisplayModal booking={qrBooking} onClose={() => setQrBooking(null)} />}

      {showQRScanner && (
        <ManagerGenericQRDisplay
          branchId={user?.branchId}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* Cancel Modal */}
      {confirmCancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(3px)' }}
          onClick={e => e.target === e.currentTarget && (() => { setConfirmCancelId(null); setCancelReason(''); })()}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-[15px] font-semibold text-slate-800">Xác nhận hủy lịch</h2>
              <button onClick={() => { setConfirmCancelId(null); setCancelReason(''); }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-600">Bạn có chắc chắn muốn hủy lịch đặt này? Hành động không thể hoàn tác.</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Lý do hủy</label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Nhập lý do hủy (tùy chọn)..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 transition-colors resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 border-t border-slate-100 px-6 py-4 justify-end">
              <button onClick={() => { setConfirmCancelId(null); setCancelReason(''); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                Giữ lại
              </button>
              <button onClick={() => handleCancel(confirmCancelId)}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors">
                Hủy lịch
              </button>
            </div>
          </div>
        </div>
      )}

      {showWalkInModal && (
        <ManagerWalkInBookingModal
          user={user}
          onClose={() => setShowWalkInModal(false)}
          onSuccess={(b) => {
            fetch_();
            navigate(`/manager/bookings/${b._id}`);
          }}
        />
      )}

      <ConfirmDialog
        open={confirmAllOpen}
        title="Xác nhận tất cả đơn chờ"
        message={`Xác nhận ${pendingInView.length} đơn đang chờ? Khách sẽ được thông báo và có thể đến check-in.`}
        confirmLabel="Xác nhận tất cả"
        onConfirm={() => confirmAll()}
        onCancel={() => setConfirmAllOpen(false)}
      />
    </div>
  );
}
