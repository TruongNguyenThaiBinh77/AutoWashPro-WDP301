import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowDown, ArrowLeft, ArrowUp, Building, Calendar, CheckCircle, Clock, Coin,
  FileText, MathOperations, Receipt, Trophy, User, Warning, Tag, CreditCard, Bookmarks,
} from '@phosphor-icons/react';
import TierBadge from '@/components/ui/TierBadge';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { useTranslation } from 'react-i18next';

function api(path, opts = {}) {
  return fetch(`${getApiBaseUrl()}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}`, ...opts.headers },
  });
}
async function readErr(res, t) {
  try { const j = await res.json(); return j?.message || t('customer.pointHistory.httpError', { status: res.status }); } catch { return t('customer.pointHistory.httpError', { status: res.status }); }
}
function formatCurrency(val) {
  if (!val && val !== 0) return '0';
  return Number(val).toLocaleString('vi-VN');
}
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function getTierDisplayName(tierId, tierName, t) {
  if (tierName && !['thành viên', 'customer', 'user'].includes(String(tierName).toLowerCase())) return tierName;
  const m = { bronze: t('customer.pointHistory.tierBronze'), silver: t('customer.pointHistory.tierSilver'), gold: t('customer.pointHistory.tierGold'), diamond: t('customer.pointHistory.tierDiamond') };
  return m[String(tierId || '').toLowerCase()] || t('customer.pointHistory.tierBronze');
}
function getTypeLabel(type, t) {
  const m = {
    earned: { label: t('customer.pointHistory.typeEarned'), color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    redeemed: { label: t('customer.pointHistory.typeRedeemed'), color: 'bg-amber-100 text-amber-800 border-amber-200' },
    expired: { label: t('customer.pointHistory.typeExpired'), color: 'bg-rose-100 text-rose-800 border-rose-200' },
    adjustment: { label: t('customer.pointHistory.typeAdjustment'), color: 'bg-purple-100 text-purple-800 border-purple-200' },
  };
  return m[type] || { label: type || t('customer.pointHistory.typeDefault'), color: 'bg-blue-100 text-blue-800 border-blue-200' };
}
function getBookingTypeLabel(type, t) {
  if (type === 'recurring') return { label: t('customer.pointHistory.bookingRecurring'), color: 'bg-purple-100 text-purple-800 border-purple-200' };
  if (type === 'slot_pack_usage') return { label: t('customer.pointHistory.bookingSlotPack'), color: 'bg-amber-100 text-amber-800 border-amber-200' };
  return { label: t('customer.pointHistory.bookingSingle'), color: 'bg-blue-100 text-blue-800 border-blue-200' };
}
function Spinner({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83" />
    </svg>
  );
}

export default function CustomerPointHistoryDetail() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const returnTab = searchParams.get('tab') || 'reward';
  const id = location.pathname.split('/rewards/history/')[1] || '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDetail = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api(`/loyalty/my-history/${id}`);
      if (!res.ok) throw new Error(await readErr(res, t));
      const json = await res.json();
      setData(json?.data ?? json);
    } catch (err) {
      setError(err.message || t('customer.pointHistory.loadFail'));
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Spinner size={30} />
        <p className="mt-3 text-xs font-semibold text-slate-500">{t('customer.pointHistory.loadingDetail')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto py-8">
        <button onClick={() => navigate(`/rewards?tab=${returnTab}`)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
          <ArrowLeft size={16} /> {t('customer.pointHistory.back')}
        </button>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-600">
          <Warning size={32} weight="duotone" />
          <p className="text-sm font-semibold">{error || t('customer.pointHistory.notFound')}</p>
        </div>
      </div>
    );
  }

  const user = data.userId || {};
  const snap = data.snapshot || {};
  const refBooking = (typeof data.referenceId === 'object' && data.referenceId) ? data.referenceId : {};
  const isEarned = data.type === 'earned';
  const branchName = snap.branchName || refBooking.branchId?.name || '';
  const branchAddress = snap.branchAddress || refBooking.branchId?.address || '';
  const bookingCode = snap.bookingCode || refBooking.bookingCode || '';
  const bookingType = snap.bookingType || refBooking.bookingType || 'single';
  const bookingTypeInfo = getBookingTypeLabel(bookingType);
  const pkgName = snap.packageName || refBooking.packageName || refBooking.packageId?.name || '';
  const pkgPrice = snap.packagePrice ?? refBooking.packagePrice ?? refBooking.packageId?.price ?? 0;
  const baseRate = snap.baseRate || 5;
  const multiplier = snap.multiplier || 1;
  const effectiveRate = snap.effectiveRate || Number((baseRate * multiplier).toFixed(2));

  // Sub-services & Voucher (Prioritize immutable snapshots over live packageId)
  const rawIncluded = (Array.isArray(refBooking.includedSubServices) && refBooking.includedSubServices.length > 0)
    ? refBooking.includedSubServices
    : (Array.isArray(snap.includedSubServices) && snap.includedSubServices.length > 0)
      ? snap.includedSubServices
      : (Array.isArray(refBooking.packageSnapshot?.subServices) && refBooking.packageSnapshot.subServices.length > 0)
        ? refBooking.packageSnapshot.subServices
        : (refBooking.packageId?.subServices || []);
  const includedSubServices = Array.isArray(rawIncluded)
    ? rawIncluded.filter(s => s.isOptional === false || s.isOptional === undefined)
    : [];
  const selectedSubs = refBooking.selectedSubServices || snap.selectedSubServices || snap.subServices || [];
  const addedSubServices = Array.isArray(selectedSubs)
    ? selectedSubs.filter(s => s.isOptional !== false)
    : [];
  const voucherCode = snap.voucherCode || refBooking.voucherCode || '';
  const discountAmount = snap.discountAmount || refBooking.discountAmount || 0;

  let orderAmount = snap.orderAmount || refBooking.finalPrice || 0;
  // Chỉ truy ngược số tiền đơn hàng cho giao dịch TÍCH điểm — giao dịch đổi/điều chỉnh không có đơn hàng
  if (!orderAmount && isEarned && data.points && effectiveRate > 0) {
    orderAmount = Math.round((Math.abs(data.points) * 100) / effectiveRate);
  }
  if (!orderAmount && isEarned) orderAmount = pkgPrice || 0;

  const displayPoints = (isEarned && orderAmount > 0 && effectiveRate > 0)
    ? Math.floor((orderAmount * effectiveRate) / 100)
    : Math.abs(data.points);

  const targetBookingId = refBooking._id || (typeof data.referenceId === 'string' ? data.referenceId : null);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-in fade-in duration-300">
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <button onClick={() => navigate(`/rewards?tab=${returnTab}`)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm cursor-pointer">
          <ArrowLeft size={16} /> Quay lại
        </button>
        <span className="text-xs font-mono font-bold text-slate-400">ID: {data._id}</span>
      </div>

      <div className="rounded-3xl p-6 text-slate-800 shadow-sm border border-slate-200/80 relative overflow-hidden"
        style={{ background: isEarned ? 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)' : 'linear-gradient(135deg, #fff1f2 0%, #fff5f5 100%)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md ${isEarned ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              {isEarned ? <ArrowUp size={30} weight="bold" /> : <ArrowDown size={30} weight="bold" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-extrabold ${isEarned ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                  {isEarned ? 'TÍCH ĐIỂM THƯỞNG (+)' : data.type === 'redeemed' ? 'ĐỔI QUÀ (-)' : data.type === 'adjustment' ? 'TRUY THU/ĐIỀU CHỈNH' : 'ĐIỂM HẾT HẠN (-)'}
                </span>
                <span className="text-xs text-slate-500 font-medium flex items-center gap-1"><Clock size={14} /> {formatDate(data.createdAt)}</span>
              </div>
              <h1 className="text-2xl font-black text-slate-800 mt-1">
                {isEarned ? `+${formatCurrency(data.points)} điểm` : `${formatCurrency(data.points)} điểm`}
              </h1>
            </div>
          </div>
          {bookingCode && (
            <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-200/60 p-3.5 text-right shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">Mã Đơn hàng</span>
              <span className="text-base font-mono font-black text-blue-700">{bookingCode}</span>
            </div>
          )}
        </div>
      </div>

      {/* Chi tiết & Lý do — Full Width */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileText size={20} className="text-amber-500" weight="fill" /> Chi tiết & Lý do
        </h2>
        <p className="text-base font-extrabold text-slate-800 leading-relaxed">{data.description}</p>

        {isEarned && orderAmount > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-xs">
              <span className="text-slate-400 font-medium block mb-1">Giá trị đơn hàng</span>
              <strong className="text-sm font-black text-slate-800">{formatCurrency(orderAmount)} ₫</strong>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-xs">
              <span className="text-slate-400 font-medium block mb-1">Tỷ lệ tích điểm</span>
              <strong className="text-sm font-black text-blue-600">{effectiveRate}%</strong>
              <span className="text-[10px] text-slate-400 block mt-0.5">(Cơ bản {baseRate}% × {multiplier})</span>
            </div>
            {bookingCode && (
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-xs">
                <span className="text-slate-400 font-medium block mb-1">Mã đơn hàng</span>
                <strong className="text-sm font-mono font-black text-blue-700">{bookingCode}</strong>
              </div>
            )}
            {branchName && (
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100 text-xs">
                <span className="text-slate-400 font-medium block mb-1">Chi nhánh</span>
                <strong className="text-xs font-bold text-emerald-700 block truncate">{branchName}</strong>
                {branchAddress && <span className="text-[10px] text-slate-400 block truncate">{branchAddress}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chi tiết Đơn hàng — Gọn gàng & có nút xem đơn */}
      {(bookingCode || pkgName) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Receipt size={18} className="text-blue-600" weight="fill" /> Chi tiết Đơn hàng
              </h2>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold border ${bookingTypeInfo.color}`}>
                <Bookmarks size={13} /> {bookingTypeInfo.label}
              </span>
            </div>
            {targetBookingId && (
              <button
                onClick={() => navigate(`/history/${targetBookingId}`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <span>Xem chi tiết đơn hàng</span>
                <ArrowLeft size={14} className="rotate-180" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {bookingCode && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                <span className="text-slate-400 block font-semibold">Mã đơn hàng:</span>
                <strong className="text-sm font-mono font-black text-blue-700">{bookingCode}</strong>
              </div>
            )}
            {pkgName && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                <span className="text-slate-400 block font-semibold">Gói dịch vụ:</span>
                <strong className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                  <Tag size={14} className="text-blue-600" weight="fill" /> {pkgName}
                </strong>
              </div>
            )}
            {orderAmount > 0 && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                <span className="text-slate-400 block font-semibold">Tổng tiền thanh toán:</span>
                <strong className="text-sm font-black text-emerald-700">{formatCurrency(orderAmount)} ₫</strong>
              </div>
            )}
            {branchName && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                <span className="text-slate-400 block font-semibold">Chi nhánh rửa xe:</span>
                <strong className="text-xs font-bold text-slate-800 block truncate">{branchName}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Công thức tính điểm */}
      {isEarned && orderAmount > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <MathOperations size={18} className="text-emerald-600" weight="fill" /> Công thức tính điểm
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/80"><span className="text-xs font-medium text-slate-500 block mb-1">Tiền thanh toán</span><p className="text-lg font-extrabold text-slate-800">{formatCurrency(orderAmount)} ₫</p></div>
            <div className="rounded-xl bg-blue-50/50 p-4 border border-blue-100"><span className="text-xs font-medium text-blue-700 block mb-1">Tỷ lệ cơ bản</span><p className="text-lg font-extrabold text-blue-700">{baseRate}%</p></div>
            <div className="rounded-xl bg-amber-50/50 p-4 border border-amber-100"><span className="text-xs font-medium text-amber-800 block mb-1">Hệ số hạng</span><div className="flex items-center gap-1.5"><span className="text-sm font-extrabold text-amber-800">{getTierDisplayName(snap.tier, snap.tierName)}</span><span className="text-xs font-bold text-emerald-600">x{multiplier}</span></div></div>
          </div>
          <div className="rounded-2xl p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 space-y-3 shadow-2xs">
            <p className="text-xs font-semibold text-slate-600">Điểm tích lũy = Số tiền × Tỷ lệ tích cơ bản × Hệ số hạng</p>
            <div className="p-3.5 rounded-xl bg-white border border-emerald-200 text-sm font-extrabold text-slate-800 flex items-center justify-between flex-wrap gap-2 shadow-2xs">
              <span className="text-emerald-700 text-base font-black">{formatCurrency(displayPoints)} điểm</span>
              <span className="text-xs font-bold text-slate-700 font-sans">= {formatCurrency(orderAmount)} ₫ × ({baseRate}% × {multiplier})</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
