import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { showToast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import {
  ArrowClockwise,
  CheckCircle,
  MagnifyingGlass,
  Plus,
  Star,
  Tag,
  Trash,
  Warning,
  X,
  XCircle,
  PencilSimple,
  ClockCounterClockwise,
  Gift,
  Package,
  PaperPlaneTilt,
  Coin,
  Trophy,
  ArrowUp,
  ArrowDown,
  Eye,
} from '@phosphor-icons/react';
import TierBadge from '@/components/ui/TierBadge';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { RewardsConfigTab, RedemptionsTab } from '@/components/admin/AdminRewardsManagement';

function api(path, opts = {}) {
  return fetch(`${getApiBaseUrl()}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}`, ...opts.headers },
  });
}
async function readErr(res) {
  try { const j = await res.json(); return j?.message || `Lỗi ${res.status}`; } catch { return `Lỗi ${res.status}`; }
}
function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function Toast({ toast, onDismiss }) {
  useEffect(() => { if (!toast) return; const t = setTimeout(onDismiss, 3500); return () => clearTimeout(t); }, [toast, onDismiss]);
  if (!toast) return null;
  const ok = toast.type !== 'error';
  return (
    <div role="alert" className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 bg-white ${ok ? 'text-emerald-700 ring-emerald-200' : 'text-red-600 ring-red-200'}`}>
      {ok ? <CheckCircle size={15} weight="fill" /> : <XCircle size={15} weight="fill" />}
      {toast.message}
      <button onClick={onDismiss} className="ml-1 opacity-50 hover:opacity-100"><X size={13} /></button>
    </div>
  );
}

function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

const inp = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors';
const EMPTY_VOUCHER = {
  code: '', name: '', description: '', type: 'percentage', value: '',
  maxDiscount: '', minOrder: '', quantity: '', startDate: '', endDate: '',
  branchId: '', applicableToAllBranches: true, applicableToAllPackages: true, status: 'active',
};

function VoucherModal({ initial, onSave, onClose, saving, branches = [] }) {
  const [form, setForm] = useState({ ...EMPTY_VOUCHER, ...initial, branchId: initial?.branchId?._id || initial?.branchId || '' });
  const [errors, setErrors] = useState({});
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    const today = new Date().toISOString().split('T')[0];
    if (!form.code.trim()) e.code = 'Nhập mã voucher';
    if (!form.name.trim()) e.name = 'Nhập tên voucher';
    if (!form.value) e.value = 'Nhập giá trị';
    if (!form.quantity) e.quantity = 'Nhập số lượng';
    if (!form.startDate) e.startDate = 'Chọn ngày bắt đầu';
    if (!form.endDate) e.endDate = 'Chọn ngày kết thúc';
    if (form.startDate && form.startDate < today) e.startDate = 'Ngày bắt đầu không được ở quá khứ';
    if (form.endDate && form.endDate < today) e.endDate = 'Ngày kết thúc không được ở quá khứ';
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      e.endDate = 'Ngày kết thúc phải sau ngày bắt đầu';
    }
    return e;
  };

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) return setErrors(errs);
    onSave({
      ...form,
      value: Number(form.value),
      maxDiscount: Number(form.maxDiscount) || 0,
      minOrder: Number(form.minOrder) || 0,
      quantity: Number(form.quantity),
    });
  };

  const isEdit = !!initial?._id;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-800">{isEdit ? 'Chỉnh sửa voucher' : 'Tạo voucher mới'}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="max-h-[72vh] space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Mã voucher <span className="text-red-500">*</span></label>
              <input className={inp} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="SUMMER20" disabled={isEdit} />
              {errors.code && <p className="mt-0.5 text-[11px] text-red-500">{errors.code}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Số lượng <span className="text-red-500">*</span></label>
              <input type="number" min="0" className={inp} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="100" />
              {errors.quantity && <p className="mt-0.5 text-[11px] text-red-500">{errors.quantity}</p>}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Tên voucher <span className="text-red-500">*</span></label>
            <input className={inp} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Giảm giá mùa hè" />
            {errors.name && <p className="mt-0.5 text-[11px] text-red-500">{errors.name}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Mô tả</label>
            <input className={inp} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="..." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Chi nhánh áp dụng</label>
            <select className={inp} value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
              <option value="">— Tất cả chi nhánh —</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
            <p className="mt-0.5 text-[11px] text-slate-400">Để trống nếu voucher áp dụng cho tất cả chi nhánh.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Loại</label>
              <select className={inp} value={form.type} onChange={(e) => set('type', e.target.value)}>
                <option value="percentage">Phần trăm (%)</option>
                <option value="fixed">Cố định (₫)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Giá trị <span className="text-red-500">*</span></label>
              <input type="number" min="0" className={inp} value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="20" />
              {errors.value && <p className="mt-0.5 text-[11px] text-red-500">{errors.value}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Giảm tối đa (₫)</label>
              <input type="number" min="0" className={inp} value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} placeholder="100000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Đơn hàng tối thiểu (₫)</label>
              <input type="number" min="0" className={inp} value={form.minOrder} onChange={(e) => set('minOrder', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Trạng thái</label>
              <select className={inp} value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">Kích hoạt</option>
                <option value="inactive">Tắt</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Áp dụng cho hạng thành viên (để trống là áp dụng tất cả)</label>
            <div className="flex flex-wrap gap-3 mt-1">
              {[
                { id: 'bronze', label: 'Đồng' },
                { id: 'silver', label: 'Bạc' },
                { id: 'gold', label: 'Vàng' },
                { id: 'diamond', label: 'Kim Cương' }
              ].map((tier) => {
                const currentTiers = form.applicableTiers || [];
                const isChecked = currentTiers.includes(tier.id);
                return (
                  <label key={tier.id} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-700">
                    <input 
                      type="checkbox" 
                      checked={isChecked} 
                      onChange={(e) => {
                        if (e.target.checked) {
                          set('applicableTiers', [...currentTiers, tier.id]);
                        } else {
                          set('applicableTiers', currentTiers.filter(t => t !== tier.id));
                        }
                      }} 
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                    />
                    {tier.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Ngày bắt đầu <span className="text-red-500">*</span></label>
              <input type="date" className={inp} min={new Date().toISOString().split('T')[0]} value={form.startDate?.split('T')[0] ?? form.startDate} onChange={(e) => set('startDate', e.target.value)} />
              {errors.startDate && <p className="mt-0.5 text-[11px] text-red-500">{errors.startDate}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Ngày kết thúc <span className="text-red-500">*</span></label>
              <input type="date" className={inp} min={form.startDate?.split('T')[0] || new Date().toISOString().split('T')[0]} value={form.endDate?.split('T')[0] ?? form.endDate} onChange={(e) => set('endDate', e.target.value)} />
              {errors.endDate && <p className="mt-0.5 text-[11px] text-red-500">{errors.endDate}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Hủy</button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving && <Spinner size={14} />}{saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VoucherUsageModal({ voucherId, onClose }) {
  const navigate = useNavigate();
  const isManager = window.location.pathname.startsWith('/manager');
  const [usages, setUsages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchUsages = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', 10);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);
      const res = await api(`/vouchers/usage/${voucherId}?${params.toString()}`);
      if (!res.ok) throw new Error('Không thể tải lịch sử sử dụng');
      const p = await res.json();
      setUsages(p?.data ?? []);
      if (p?.pagination) setPagination(p.pagination);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [voucherId, page, dateFrom, dateTo]);

  useEffect(() => { fetchUsages(); }, [fetchUsages]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-800">Lịch sử sử dụng Voucher</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Từ ngày:</span>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Đến ngày:</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100" />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium">Xóa bộ lọc</button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{pagination.total} kết quả</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-0">
          {loading ? (
             <div className="flex justify-center py-10"><Spinner /></div>
          ) : error ? (
             <p className="text-red-500 text-sm text-center py-10">{error}</p>
          ) : usages.length === 0 ? (
             <p className="text-slate-500 text-sm text-center py-10">Chưa có ai sử dụng voucher này.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Khách hàng</th>
                    <th className="px-4 py-3">Mã đơn</th>
                    <th className="px-4 py-3">Ngày đặt</th>
                    <th className="px-4 py-3">Giảm giá</th>
                    <th className="px-4 py-3">Ngày dùng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usages.map((u, i) => (
                    <tr key={u._id || i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{u.userId?.name || '—'}</span>
                            {u.userId?.tier && <TierBadge tier={u.userId.tier} />}
                          </div>
                          {u.userId?.phone && <p className="text-[11px] text-slate-400 mt-0.5">{u.userId.phone}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {u.bookingId ? (
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-mono text-[13px] font-bold text-slate-700">
                              {u.bookingId.bookingCode || 'AWP-' + String(u.bookingId._id).slice(-8).toUpperCase()}
                            </span>
                            <button
                              onClick={() => {
                                const code = u.bookingId.bookingCode || ('AWP-' + String(u.bookingId._id).slice(-8).toUpperCase());
                                navigate(`${isManager ? '/manager/bookings' : '/admin/bookings'}?search=${encodeURIComponent(code)}`);
                              }}
                              className="text-[11px] text-blue-600 hover:text-blue-700 underline font-medium"
                            >
                              {(u.bookingId.bookingCode || '').startsWith('SP-') ? 'Xem gói lượt' : 'Xem đơn'}
                            </button>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{u.bookingId?.bookingDate ? formatDate(u.bookingId.bookingDate) : '—'}</td>
                      <td className="px-4 py-3 text-emerald-600 font-medium">-{Number(u.discountAmount).toLocaleString('vi-VN')}₫</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <span>{new Date(u.usedAt).toLocaleString('vi-VN')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination */}
              <div className="flex items-center justify-center gap-4 border-t border-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">
                  {pagination.total > 0 ? `${(pagination.page - 1) * 10 + 1}–${Math.min(pagination.page * 10, pagination.total)} / ${pagination.total}` : '0 kết quả'}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!pagination.hasPrevPage}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Trước
                  </button>
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.page) <= 1)
                    .reduce((acc, p, i, arr) => {
                      if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`dots-${i}`} className="px-1 text-xs text-slate-400">...</span>
                      ) : (
                        <button key={p} onClick={() => setPage(p)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            p === pagination.page ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}>{p}</button>
                      )
                    )}
                  <button onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={!pagination.hasNextPage}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Sau
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VoucherUsageReportTab() {
  const navigate = useNavigate();
  const isManager = window.location.pathname.startsWith('/manager');
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api('/vouchers/usage-report')
      .then(res => { if (!res.ok) throw new Error('Không thể tải báo cáo sử dụng'); return res.json(); })
      .then(p => {
        if (mounted) {
          const raw = p?.data?.data ?? p?.data ?? [];
          setReport(Array.isArray(raw) ? raw : []);
          setLoading(false);
        }
      })
      .catch(e => { if (mounted) { setError(e.message); setLoading(false); } });
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="flex justify-center py-24 text-slate-400"><Spinner size={24} /></div>;
  if (error) return <div className="text-red-500 text-center py-10 flex flex-col items-center gap-2"><Warning size={24} />{error}</div>;
  if (report.length === 0) return <div className="text-slate-500 text-center py-10">Chưa có dữ liệu sử dụng voucher.</div>;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {report.map(item => (
        <div key={item.userId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                {item.user?.name || 'Khách vãng lai'}
                {item.user?.tier && <TierBadge tier={item.user.tier} />}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{item.user?.phone || item.user?.email || 'Chưa có thông tin liên hệ'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-emerald-600">Đã tiết kiệm: {Number(item.totalDiscountAmount).toLocaleString('vi-VN')}₫</p>
              <p className="text-xs text-slate-500 mt-1">Sử dụng tổng cộng {item.totalUsedVouchers} voucher</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {item.vouchersUsed.map((v, i) => (
              <div key={i} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 hover:border-slate-200 transition-colors">
                <div className="flex flex-col gap-1 overflow-hidden pr-2">
                   <div className="flex items-center gap-1.5">
                     <span className="font-mono text-[10px] font-bold bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded shadow-sm">{v.code}</span>
                     {v.bookings && v.bookings.length > 0 && (
                       <button
                         onClick={() => {
                           const b = v.bookings[0];
                           navigate(`${isManager ? '/manager/bookings' : '/admin/bookings'}?search=${encodeURIComponent(b?.code || b?.id || '')}`);
                         }}
                         className="text-[10px] text-blue-600 hover:text-blue-700 underline font-medium"
                       >
                         {v.bookings.length === 1 ? 'Xem đơn' : 'Xem đơn gần nhất'}
                       </button>
                     )}
                     </div>
                   <span className="text-[11px] font-medium text-slate-600 truncate" title={v.name}>{v.name}</span>
                </div>
                <div className="text-right flex flex-col shrink-0">
                   <span className="text-xs font-bold text-emerald-600">-{Number(v.totalDiscount).toLocaleString('vi-VN')}₫</span>
                   <span className="text-[10px] text-slate-400 mt-0.5">{v.count} lần dùng</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WheelManagementTab() {
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGift, setEditingGift] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchGifts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/gifts');
      if (res.ok) {
        const p = await res.json();
        setGifts(p?.data || []);
      }
    } catch (e) {
      showToast('Lỗi khi tải dữ liệu vòng quay', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGifts(); }, [fetchGifts]);

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ title: 'Xóa phần quà', message: 'Bạn có chắc chắn muốn xóa?', confirmLabel: 'Xóa', danger: true }))) return;
    try {
      const res = await api(`/gifts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Xóa thành công!');
        fetchGifts();
      }
    } catch (e) {
      showToast('Xóa thất bại', 'error');
    }
  };

  const moveGift = async (id, direction) => {
    const sorted = [...gifts].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const idx = sorted.findIndex(g => g._id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const current = sorted[idx];
    const target = sorted[swapIdx];
    const tempOrder = current.sortOrder || 0;
    try {
      await Promise.all([
        api(`/gifts/${current._id}`, { method: 'PUT', body: JSON.stringify({ sortOrder: target.sortOrder || 0 }) }),
        api(`/gifts/${target._id}`, { method: 'PUT', body: JSON.stringify({ sortOrder: tempOrder }) }),
      ]);
      fetchGifts();
    } catch (e) {
      showToast('Sắp xếp thất bại', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800">Quản lý Ô Vòng Quay</h3>
        <button onClick={() => { setEditingGift(null); setModalOpen(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm">
          <Plus size={14} weight="bold" /> Thêm ô thưởng
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : gifts.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
          <Gift size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">Chưa có ô thưởng nào. Hãy thêm ô thưởng đầu tiên!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...gifts].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((g, i, arr) => (
            <div key={g._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-2 h-full" style={{ backgroundColor: g.color || '#ccc' }}></div>
              <div className="flex items-start justify-between mb-1">
                <h4 className="font-bold text-slate-800 text-lg">{g.name}</h4>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">#{g.sortOrder || i}</span>
              </div>
              <p className="text-sm text-slate-500 mb-4">{g.description || 'Không có mô tả'}</p>
              
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-slate-50 rounded px-3 py-2">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Loại</p>
                  <p className="text-sm font-medium text-slate-700">{g.type === 'percentage' ? 'Giảm %' : g.type === 'fixed' ? 'Giảm Tiền' : 'Quà tặng / Không có'}</p>
                </div>
                <div className="bg-slate-50 rounded px-3 py-2">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Giá trị</p>
                  <p className="text-sm font-medium text-slate-700">{g.type === 'percentage' ? `${g.value}%` : formatCurrency(g.value)}</p>
                </div>
                <div className="bg-slate-50 rounded px-3 py-2">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Tỷ lệ trúng</p>
                  <p className="text-sm font-medium text-amber-600">{g.probability}%</p>
                </div>
                <div className="bg-slate-50 rounded px-3 py-2">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Trạng thái</p>
                  <p className={`text-sm font-medium ${g.status === 'active' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {g.status === 'active' ? 'Đang bật' : 'Đã tắt'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-auto">
                <div className="flex gap-1">
                  <button onClick={() => moveGift(g._id, 'up')} disabled={i === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => moveGift(g._id, 'down')} disabled={i === arr.length - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <ArrowDown size={14} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingGift(g); setModalOpen(true); }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                    <PencilSimple size={16} />
                  </button>
                  <button onClick={() => handleDelete(g._id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <WheelGiftModal 
          initial={editingGift} 
          onClose={() => setModalOpen(false)}
          onSave={async (form) => {
            setSaving(true);
            try {
              let res;
              if (editingGift) {
                res = await api(`/gifts/${editingGift._id}`, { method: 'PUT', body: JSON.stringify(form) });
              } else {
                res = await api('/gifts', { method: 'POST', body: JSON.stringify(form) });
              }
              if (res.ok) {
                showToast(editingGift ? 'Cập nhật thành công' : 'Thêm thành công');
                setModalOpen(false);
                fetchGifts();
              } else {
                const err = await res.json();
                showToast(err.message || 'Có lỗi xảy ra', 'error');
              }
            } catch (e) {
              showToast('Lỗi mạng', 'error');
            } finally {
              setSaving(false);
            }
          }}
          saving={saving}
        />
      )}
    </div>
  );
}

function WheelGiftModal({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || {
    name: '', description: '', type: 'none', value: 0, probability: 10, color: '#10b981', status: 'active', sortOrder: 0
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-800">{initial ? 'Sửa ô thưởng' : 'Thêm ô thưởng mới'}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Tên hiển thị trên vòng quay <span className="text-red-500">*</span></label>
            <input className={inp} required value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Mô tả (ẩn)</label>
            <input className={inp} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Loại Voucher Trúng</label>
              <select className={inp} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="none">Không có (Chỉ tặng hiện vật/may mắn)</option>
                <option value="percentage">Giảm theo %</option>
                <option value="fixed">Giảm tiền mặt (đ)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Giá trị giảm (nếu có)</label>
              <input type="number" min="0" className={inp} value={form.value} onChange={e => set('value', Number(e.target.value))} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tỷ lệ trúng (%) <span className="text-red-500">*</span></label>
              <input type="number" min="0" max="100" required className={inp} value={form.probability} onChange={e => set('probability', Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Màu sắc ô</label>
              <input type="color" className="w-full h-[38px] rounded cursor-pointer border border-slate-200" value={form.color} onChange={e => set('color', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Thứ tự</label>
              <input type="number" min="0" className={inp} value={form.sortOrder} onChange={e => set('sortOrder', Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Trạng thái</label>
              <select className={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Bật</option>
                <option value="inactive">Tắt</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Hủy</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DashboardOverview({ stats }) {
  const { total = 0, active = 0, expired = 0, totalRemaining = 0 } = stats;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Gift size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Tổng Voucher</p>
            <p className="text-xl font-bold text-slate-800">{total}</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Đang hoạt động</p>
            <p className="text-xl font-bold text-emerald-700">{active}</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Coin size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Lượt còn lại</p>
            <p className="text-xl font-bold text-amber-700">{totalRemaining.toLocaleString('vi-VN')}</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
            <Trophy size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Hết hạn</p>
            <p className="text-xl font-bold text-slate-600">{expired}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ Loyalty Config Modal ═══ */
function LoyaltyConfigModal({ initialConfig, onSave, onClose, saving }) {
  const [form, setForm] = useState(() => {
    if (initialConfig) {
      return {
        baseEarningRate: initialConfig.baseEarningRate ?? 5,
        pointExpirationMonths: initialConfig.pointExpirationMonths ?? 6,
        tiers: Array.isArray(initialConfig.tiers)
          ? initialConfig.tiers.map((t) => ({
              id: t.id || '',
              name: t.name || '',
              minPoints: t.minPoints ?? 0,
              multiplier: t.multiplier ?? 1.0,
              benefitsText: Array.isArray(t.benefits) ? t.benefits.join('\n') : '',
            }))
          : [],
      };
    }
    return {
      baseEarningRate: 5,
      pointExpirationMonths: 6,
      tiers: [
        { id: 'bronze', name: 'Đồng', minPoints: 0, multiplier: 1.0, benefitsText: 'Tích lũy điểm thưởng từ mỗi hóa đơn' },
        { id: 'silver', name: 'Bạc', minPoints: 100000, multiplier: 1.2, benefitsText: 'Tất cả ưu đãi của hạng Đồng\nHệ số nhân điểm x1.2' },
        { id: 'gold', name: 'Vàng', minPoints: 500000, multiplier: 1.5, benefitsText: 'Tất cả ưu đãi của hạng Bạc\nHệ số nhân điểm x1.5' },
        { id: 'diamond', name: 'Kim cương', minPoints: 1000000, multiplier: 2.0, benefitsText: 'Tất cả ưu đãi của hạng Vàng\nHệ số nhân điểm x2.0' },
      ],
    };
  });

  const handleTierChange = (index, field, value) => {
    setForm((prev) => {
      const nextTiers = [...prev.tiers];
      nextTiers[index] = { ...nextTiers[index], [field]: value };
      return { ...prev, tiers: nextTiers };
    });
  };

  const handleAddTier = () => {
    setForm((prev) => ({
      ...prev,
      tiers: [
        ...prev.tiers,
        { id: `tier_${Date.now()}`, name: 'Hạng mới', minPoints: 2000000, multiplier: 2.5, benefitsText: '' },
      ],
    }));
  };

  const handleRemoveTier = (index) => {
    if (form.tiers.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      baseEarningRate: Number(form.baseEarningRate),
      pointExpirationMonths: Number(form.pointExpirationMonths),
      tiers: form.tiers.map((t) => ({
        id: t.id,
        name: t.name,
        minPoints: Number(t.minPoints),
        multiplier: Number(t.multiplier),
        benefits: t.benefitsText ? t.benefitsText.split('\n').filter((b) => b.trim()) : [],
      })),
    };
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4" style={{ background: 'linear-gradient(135deg,#ecfdf5,#f0fdf4)' }}>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Coin size={20} weight="duotone" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Cấu hình tích điểm & hạng thành viên</h3>
              <p className="text-xs text-slate-500">Tùy chỉnh tỷ lệ tích điểm và mốc thăng hạng toàn hệ thống</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form id="loyalty-config-form" onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {/* General Config */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Tỷ lệ tích điểm cơ bản (% giá trị đơn)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.baseEarningRate}
                  onChange={(e) => setForm({ ...form, baseEarningRate: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm font-semibold text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Ví dụ: 5% nghĩa là đơn 100,000đ nhận 5,000 điểm cơ bản</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Thời hạn điểm tích lũy (tháng)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={form.pointExpirationMonths}
                  onChange={(e) => setForm({ ...form, pointExpirationMonths: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Thời gian điểm tích lũy tự động hết hạn tính từ ngày tích</p>
            </div>
          </div>

          {/* Tiers List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Trophy size={16} className="text-amber-500" />
                Cấu hình mốc điểm & hệ số nhân từng hạng
              </h4>
              <button
                type="button"
                onClick={handleAddTier}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <Plus size={14} weight="bold" /> Thêm hạng
              </button>
            </div>

            <div className="space-y-4">
              {form.tiers.map((tier, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                        {idx + 1}
                      </span>
                      <TierBadge tier={tier.id} />
                    </div>
                    {form.tiers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTier(idx)}
                        className="text-slate-400 hover:text-red-600 transition-colors p-1"
                        title="Xóa hạng này"
                      >
                        <Trash size={15} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Mã ID hạng</label>
                      <input
                        type="text"
                        value={tier.id}
                        onChange={(e) => handleTierChange(idx, 'id', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-800"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Tên hiển thị</label>
                      <input
                        type="text"
                        value={tier.name}
                        onChange={(e) => handleTierChange(idx, 'name', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Điểm thăng hạng (minPoints)</label>
                      <input
                        type="number"
                        min="0"
                        value={tier.minPoints}
                        onChange={(e) => handleTierChange(idx, 'minPoints', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-extrabold text-amber-700"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Hệ số nhân điểm (Multiplier)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        value={tier.multiplier}
                        onChange={(e) => handleTierChange(idx, 'multiplier', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-extrabold text-emerald-700"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">Danh sách ưu đãi (Mỗi dòng 1 ưu đãi)</label>
                      <textarea
                        rows={2}
                        value={tier.benefitsText}
                        onChange={(e) => handleTierChange(idx, 'benefitsText', e.target.value)}
                        placeholder="Nhập các ưu đãi của hạng..."
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Hủy
          </button>
          <button
            type="submit"
            form="loyalty-config-form"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? <Spinner size={14} /> : null}
            Lưu cấu hình
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Lifetime Points Tab ═══ */
function LifetimePointsTab({ branches = [], isManager = false }) {
  const navigate = useNavigate();
  const [allHistory, setAllHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  useEffect(() => {
    if (startDate && endDate && startDate > endDate) {
      setDateError('Ngày bắt đầu không được lớn hơn ngày kết thúc');
    } else {
      setDateError('');
    }
  }, [startDate, endDate]);

  const fetchAll = useCallback(async () => {
    if (startDate && endDate && startDate > endDate) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (branchId && !isManager) params.append('branchId', branchId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('page', page);
      params.append('limit', 10);
      const res = await api(`/loyalty/admin/history?${params.toString()}`);
      if (!res.ok) throw new Error(await readErr(res));
      const json = await res.json();
      const list = json?.data ?? [];
      setAllHistory(Array.isArray(list) ? list : []);
      if (json?.pagination) setPagination(json.pagination);
    } catch (err) {
      setError(err.message || 'Không thể tải điểm tích lũy');
    } finally { setLoading(false); }
  }, [search, branchId, startDate, endDate, page, isManager]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const lifetimeHistory = allHistory.filter(item => item.type === 'earned' || item.type === 'adjustment');

  const totalLifetime = lifetimeHistory.reduce((sum, item) => {
    if (item.type === 'earned' || (item.type === 'adjustment' && item.points > 0)) return sum + Math.abs(item.points);
    return sum;
  }, 0);

  const handleResetFilters = () => {
    setSearch(''); setBranchId(''); setStartDate(''); setEndDate(''); setDateError(''); setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => { setPage(1); fetchAll(); }} disabled={loading || Boolean(dateError)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors" title="Tải lại">
            <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="relative flex-1 min-w-[220px]">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Tìm theo tên, email, SĐT, mã đơn..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors" />
            {search && <button onClick={() => { setSearch(''); setPage(1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={12} /></button>}
          </div>
          {!isManager && (
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">Tất cả chi nhánh</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Từ ngày:</span>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className={`rounded-lg border px-3 py-1.5 text-xs text-slate-700 focus:outline-none transition-colors ${dateError ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-100' : 'border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100'}`} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Đến ngày:</span>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className={`rounded-lg border px-3 py-1.5 text-xs text-slate-700 focus:outline-none transition-colors ${dateError ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-100' : 'border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100'}`} />
          </div>
          {(search || branchId || startDate || endDate) && (
            <button onClick={handleResetFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Xóa bộ lọc</button>
          )}
        </div>
        {dateError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-600">
            <Warning size={15} weight="fill" />{dateError}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <ArrowUp size={20} weight="bold" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Tổng điểm tích lũy</p>
            <p className="text-xl font-extrabold text-blue-700">+{totalLifetime.toLocaleString('vi-VN')} điểm</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Trophy size={20} weight="bold" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Số giao dịch tích lũy</p>
            <p className="text-xl font-extrabold text-sky-700">{lifetimeHistory.length} giao dịch</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
            <Coin size={20} weight="bold" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Chỉ bao gồm</p>
            <p className="text-xl font-extrabold text-cyan-700">Tích điểm + Điều chỉnh</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400"><Spinner size={24} /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 py-16 text-red-500">
          <Warning size={26} weight="duotone" /><p className="text-sm">{error}</p>
        </div>
      ) : lifetimeHistory.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-20">
          <Trophy size={40} weight="thin" className="text-slate-300" />
          <p className="text-sm text-slate-500">Chưa có lịch sử điểm tích lũy nào</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">Loại</th>
                <th className="px-4 py-3">Số điểm</th>
                <th className="px-4 py-3">Chi tiết & Lý do (Snapshot)</th>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lifetimeHistory.map((item) => {
                const user = item.userId || {};
                const snap = item.snapshot || {};
                const isEarned = item.type === 'earned';
                const branchName = snap.branchName || snap.branchId?.name || '';
                return (
                  <tr key={item._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <img src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} alt=""
                          className="h-8 w-8 rounded-full object-cover border border-slate-200" />
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">{user.name || 'Khách hàng'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-slate-400">{user.phone || user.email || '-'}</span>
                            {user.tier && <TierBadge tier={user.tier} />}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          isEarned
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}>
                          {isEarned ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />}
                          {isEarned ? 'Tích điểm thưởng' : 'Truy thu/Điều chỉnh'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-extrabold text-sm ${isEarned ? 'text-emerald-600' : 'text-purple-600'}`}>
                        {isEarned ? `+${Math.abs(item.points).toLocaleString('vi-VN')}` : `${Math.abs(item.points).toLocaleString('vi-VN')}`} điểm
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <p className="text-xs font-semibold text-slate-800">{item.description}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => navigate(`${isManager ? '/manager' : '/admin'}/rewards/history/${item._id}`)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors shadow-2xs" title="Xem chi tiết">
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              Hiển thị {(pagination.page - 1) * 10 + 1}–{Math.min(pagination.page * 10, pagination.total)} / {pagination.total} giao dịch
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!pagination.hasPrevPage}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Trước</button>
              <span className="px-2 text-xs font-bold text-slate-700">Trang {pagination.page} / {pagination.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={!pagination.hasNextPage}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Sau</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ Point History Tab ═══ */
export function PointHistoryTab({ branches = [], isManager = false }) {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState({ totalEarned: 0, totalRedeemed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [type, setType] = useState('');
  const [deleteStatus, setDeleteStatus] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateError, setDateError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [deleteModalItem, setDeleteModalItem] = useState(null);
  const [deleteMode, setDeleteMode] = useState('soft');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteHistory = async () => {
    if (!deleteModalItem) return;
    setDeleting(true);
    try {
      const res = await api(`/loyalty/admin/history/${deleteModalItem._id}`, {
        method: 'DELETE',
        body: JSON.stringify({ mode: deleteMode }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      showToast.success(deleteMode === 'hard' ? 'Đã xóa vĩnh viễn giao dịch khỏi CSDL!' : 'Đã ẩn giao dịch điểm thưởng khỏi danh sách!');
      setDeleteModalItem(null);
      fetchHistory();
    } catch (err) {
      showToast.error(err.message || 'Lỗi khi xóa giao dịch điểm');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate && startDate > endDate) {
      setDateError('Ngày bắt đầu không được lớn hơn ngày kết thúc');
    } else {
      setDateError('');
    }
  }, [startDate, endDate]);

  const fetchHistory = useCallback(async () => {
    if (startDate && endDate && startDate > endDate) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (branchId && !isManager) params.append('branchId', branchId);
      if (type) params.append('type', type);
      if (!isManager && deleteStatus) params.append('deleteStatus', deleteStatus);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('page', page);
      params.append('limit', 10);

      const res = await api(`/loyalty/admin/history?${params.toString()}`);
      if (!res.ok) {
        throw new Error(await readErr(res));
      }
      const json = await res.json();
      const list = json?.data ?? [];
      setHistory(Array.isArray(list) ? list : []);
      if (json?.pagination) {
        setPagination(json.pagination);
        if (json.pagination.summary) {
          setSummary(json.pagination.summary);
        }
      }
    } catch (err) {
      setError(err.message || 'Không thể tải lịch sử điểm thưởng');
    } finally {
      setLoading(false);
    }
  }, [search, branchId, type, deleteStatus, startDate, endDate, page, isManager]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleResetFilters = () => {
    setSearch('');
    setBranchId('');
    setType('');
    setDeleteStatus('all');
    setStartDate('');
    setEndDate('');
    setDateError('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { setPage(1); fetchHistory(); }}
            disabled={loading || Boolean(dateError)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
            title="Tải lại"
          >
            <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Search box */}
          <div className="relative flex-1 min-w-[220px]">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, email, SĐT, mã đơn..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Branch filter (Only shown for Admin, hidden for Manager) */}
          {!isManager && (
            <select
              value={branchId}
              onChange={(e) => { setBranchId(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
            >
              <option value="">Tất cả chi nhánh</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>{b.name}</option>
              ))}
            </select>
          )}

          {/* Delete Status Filter (Only shown for Admin) */}
          {!isManager && (
            <select
              value={deleteStatus}
              onChange={(e) => { setDeleteStatus(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors font-medium"
            >
              <option value="all">Tất cả (Chưa xóa & Xóa mềm)</option>
              <option value="active">Chưa xóa (Khả dụng)</option>
              <option value="deleted">Chỉ giao dịch đã xóa mềm</option>
            </select>
          )}

          {/* Type filter */}
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
          >
            <option value="">Tất cả loại giao dịch</option>
            <option value="earned">Tích điểm thưởng (+)</option>
            <option value="redeemed">Đổi quà / Sử dụng (-)</option>
            <option value="expired">Điểm hết hạn (-)</option>
            <option value="adjustment">Truy thu / Điều chỉnh (+/-)</option>
          </select>
        </div>

        {/* Date range filters */}
        <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Từ ngày:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className={`rounded-lg border px-3 py-1.5 text-xs text-slate-700 focus:outline-none transition-colors ${
                dateError ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-100' : 'border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
              }`}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Đến ngày:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className={`rounded-lg border px-3 py-1.5 text-xs text-slate-700 focus:outline-none transition-colors ${
                dateError ? 'border-red-400 bg-red-50 focus:ring-2 focus:ring-red-100' : 'border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
              }`}
            />
          </div>

          {(search || branchId || type || startDate || endDate) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>

        {/* Date Validation Alert */}
        {dateError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-600 animate-in fade-in duration-200">
            <Warning size={15} weight="fill" />
            {dateError}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <ArrowUp size={20} weight="bold" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Tổng điểm đã tích</p>
            <p className="text-xl font-extrabold text-emerald-700">+{summary.totalEarned.toLocaleString('vi-VN')} điểm</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <ArrowDown size={20} weight="bold" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Tổng điểm đã đổi / hết hạn</p>
            <p className="text-xl font-extrabold text-rose-700">-{summary.totalRedeemed.toLocaleString('vi-VN')} điểm</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Trophy size={20} weight="bold" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Tổng giao dịch điểm</p>
            <p className="text-xl font-extrabold text-blue-700">{pagination.total} giao dịch</p>
          </div>
        </div>
      </div>

      {/* Table Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400"><Spinner size={24} /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 py-16 text-red-500">
          <Warning size={26} weight="duotone" /><p className="text-sm">{error}</p>
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-20">
          <Trophy size={40} weight="thin" className="text-slate-300" />
          <p className="text-sm text-slate-500">Chưa có lịch sử điểm thưởng nào</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">Loại</th>
                <th className="px-4 py-3">Số điểm</th>
                <th className="px-4 py-3">Chi tiết & Lý do (Snapshot)</th>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((item) => {
                const user = item.userId || {};
                const snap = item.snapshot || {};
                const isEarned = item.type === 'earned';
                const branchName = snap.branchName || snap.branchId?.name || '';
                return (
                  <tr key={item._id} className="hover:bg-slate-50 transition-colors">
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover border border-slate-200"
                        />
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">{user.name || 'Khách hàng'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-slate-400">{user.phone || user.email || '-'}</span>
                            {user.tier && <TierBadge tier={user.tier} />}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          isEarned
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : item.type === 'redeemed'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : item.type === 'adjustment'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {isEarned ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />}
                          {isEarned
                            ? 'Tích điểm thưởng'
                            : item.type === 'redeemed'
                            ? 'Đổi quà'
                            : item.type === 'adjustment'
                            ? 'Truy thu/Điều chỉnh'
                            : 'Điểm hết hạn'}
                        </span>
                        {item.isDeleted && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                            <Trash size={10} /> Đã xóa mềm
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Points */}
                    <td className="px-4 py-3">
                      <span className={`font-extrabold text-sm ${isEarned ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isEarned ? `+${item.points.toLocaleString('vi-VN')}` : item.points.toLocaleString('vi-VN')} điểm
                      </span>
                    </td>

                    {/* Details & Snapshot */}
                    <td className="px-4 py-3 max-w-md">
                      <p className="text-xs font-semibold text-slate-800">{item.description}</p>
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => navigate(`${isManager ? '/manager' : '/admin'}/rewards/history/${item._id}`)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors shadow-2xs"
                          title="Xem chi tiết giao dịch"
                        >
                          <Eye size={16} />
                        </button>
                        {!isManager && (
                          <button
                            onClick={() => { setDeleteModalItem(item); setDeleteMode('soft'); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors shadow-2xs"
                            title="Xóa giao dịch điểm"
                          >
                            <Trash size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              Hiển thị {(pagination.page - 1) * 10 + 1}–{Math.min(pagination.page * 10, pagination.total)} / {pagination.total} giao dịch
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPrevPage}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Trước
              </button>
              <span className="px-2 text-xs font-bold text-slate-700">Trang {pagination.page} / {pagination.totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={!pagination.hasNextPage}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Sau
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600">
                <Trash size={22} weight="bold" />
                <h3 className="text-base font-extrabold text-slate-800">Xóa Giao dịch Điểm thưởng</h3>
              </div>
              <button
                onClick={() => setDeleteModalItem(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                Bạn có chắc chắn muốn xóa lịch sử điểm thưởng của khách hàng <strong>{deleteModalItem.userId?.name || 'Khách hàng'}</strong>?
              </p>
              <p className="text-[11px] text-slate-500 font-mono">Mã ID Giao dịch: {deleteModalItem._id}</p>

              {/* Mode selection */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <span className="font-bold text-slate-700 block">Chọn phương thức xóa:</span>
                
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="deleteMode"
                    value="soft"
                    checked={deleteMode === 'soft'}
                    onChange={() => setDeleteMode('soft')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <strong className="text-slate-800 font-bold block">Xóa mềm (Mặc định - Khuyên dùng)</strong>
                    <span className="text-[11px] text-slate-500 block">Ẩn giao dịch khỏi danh sách hiển thị, bảo toàn lịch sử CSDL.</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer border-t border-slate-200/60 pt-2">
                  <input
                    type="radio"
                    name="deleteMode"
                    value="hard"
                    checked={deleteMode === 'hard'}
                    onChange={() => setDeleteMode('hard')}
                    className="mt-0.5 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <strong className="text-rose-700 font-bold block">Xóa cứng (Vĩnh viễn)</strong>
                    <span className="text-[11px] text-rose-600 block">Xóa vĩnh viễn khỏi CSDL MongoDB. Không thể khôi phục!</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
              <button
                onClick={() => setDeleteModalItem(null)}
                disabled={deleting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleDeleteHistory}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ Main ═══ */
export default function AdminRewards() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'config';
  const [activeTab, setActiveTabState] = useState(initialTab);

  const setActiveTab = useCallback((tabKey) => {
    setActiveTabState(tabKey);
    setSearchParams({ tab: tabKey }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'config';
    if (tabFromUrl !== activeTab) {
      setActiveTabState(tabFromUrl);
    }
  }, [searchParams]);

  const [vouchers, setVouchers] = useState([]);
  const [voucherStats, setVoucherStats] = useState({ total: 0, active: 0, expired: 0, totalRemaining: 0 });
  const [branches, setBranches] = useState([]);
  const [loyaltyConfig, setLoyaltyConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const notify = (msg, type = 'success') => showToast(msg, type);

  const fetchLoyaltyConfig = useCallback(async () => {
    try {
      const res = await api('/loyalty/config');
      if (res.ok) {
        const json = await res.json();
        setLoyaltyConfig(json?.data ?? json);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchLoyaltyConfig();
  }, [fetchLoyaltyConfig]);

  useEffect(() => {
    api('/branches').then(r => r.json()).then(p => {
      const list = p?.data ?? p;
      setBranches(Array.isArray(list) ? list : []);
    }).catch(() => {});
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api('/vouchers/stats');
      if (res.ok) {
        const json = await res.json();
        const s = json?.data ?? json;
        setVoucherStats({
          total: s?.total ?? 0,
          active: s?.active ?? 0,
          expired: s?.expired ?? 0,
          totalRemaining: s?.totalRemaining ?? 0,
        });
      }
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const fetch_ = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (branchFilter) params.append('branchId', branchFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('page', page);
      params.append('limit', 10);
      const res = await api(`/vouchers?${params.toString()}`);
      if (!res.ok) throw new Error(await readErr(res));
      const p = await res.json();
      const data = p?.data ?? p;
      setVouchers(Array.isArray(data) ? data : []);
      if (p?.pagination) setPagination(p.pagination);
    } catch (err) { setError(err.message || 'Không thể tải voucher'); }
    finally { setLoading(false); }
  }, [search, statusFilter, branchFilter, startDate, endDate, page]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleCreate = async (form) => {
    setSaving(true);
    try {
      const res = await api('/vouchers', { method: 'POST', body: JSON.stringify(form) });
      if (!res.ok) throw new Error(await readErr(res));
      setModal(null); notify('Tạo voucher thành công!');
      setPage(1); fetch_();
    } catch (err) { notify(err.message || 'Tạo thất bại', 'error'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (form) => {
    setSaving(true);
    try {
      const res = await api(`/vouchers/${selected._id}`, { method: 'PUT', body: JSON.stringify(form) });
      if (!res.ok) throw new Error(await readErr(res));
      const p = await res.json(); const updated = p?.data ?? p;
      setVouchers((prev) => prev.map((v) => v._id === updated._id ? updated : v));
      setModal(null); notify('Cập nhật voucher thành công!');
    } catch (err) { notify(err.message || 'Cập nhật thất bại', 'error'); }
    finally { setSaving(false); }
  };

  const handleSaveLoyaltyConfig = async (payload) => {
    setSaving(true);
    try {
      const res = await api('/loyalty/config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readErr(res));
      const json = await res.json();
      setLoyaltyConfig(json?.data ?? json);
      setModal(null);
      notify('Cập nhật cấu hình tích điểm thành công!');
    } catch (err) {
      notify(err.message || 'Cập nhật thất bại', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ title: 'Xóa voucher', message: 'Bạn có chắc chắn muốn xóa voucher này?', confirmLabel: 'Xóa', danger: true }))) return;
    try {
      const res = await api(`/vouchers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readErr(res));
      setVouchers((prev) => prev.filter((v) => v._id !== id));
      notify('Xóa voucher thành công!');
    } catch (err) { notify(err.message || 'Xóa thất bại', 'error'); }
  };

  const isExpired = (v) => new Date(v.endDate) < new Date();
  const isActive = (v) => v.status === 'active' && !isExpired(v);

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit flex-wrap">
        {[
          { key: 'config',    label: 'Cấu hình điểm thưởng', icon: Coin },
          { key: 'history',   label: 'Lịch sử điểm thưởng', icon: Trophy },
          { key: 'lifetime',  label: 'Điểm tích lũy',        icon: Star },
          { key: 'list',      label: 'Danh sách Voucher', icon: Tag },
          { key: 'gifts',     label: 'Quà tặng vật lý',  icon: Package },
          { key: 'redemptions', label: 'Trao quà',        icon: PaperPlaneTilt },
          { key: 'wheel',     label: 'Quản lý Vòng Quay', icon: Gift },
          { key: 'report',    label: 'Báo cáo sử dụng', icon: ClockCounterClockwise },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                isActive
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'config' && (
        <div className="space-y-5">
          {/* Points config */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#ecfdf5,#f0fdf4)' }}>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Coin size={16} weight="duotone" className="text-emerald-600" />
                Cấu hình chương trình điểm thưởng
              </h3>
              <button
                onClick={() => navigate('/admin/system-config?tab=loyalty')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <PencilSimple size={14} /> Chỉnh sửa cấu hình
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Tích điểm */}
                <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#eff6ff,#f0f9ff)', border: '1px solid #bfdbfe' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#dbeafe' }}>
                      <Coin size={16} className="text-blue-600" weight="fill" />
                    </div>
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Tích điểm</p>
                  </div>
                  <p className="text-3xl font-extrabold text-blue-700">{loyaltyConfig?.baseEarningRate ?? 5}%</p>
                  <p className="text-xs text-blue-500 mt-1">Giá trị đơn hàng</p>
                </div>

                {/* Hạng thành viên */}
                <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#fefce8,#fffbeb)', border: '1px solid #fde68a' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#fef3c7' }}>
                      <Trophy size={16} className="text-amber-600" weight="fill" />
                    </div>
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Hạng thành viên</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(loyaltyConfig?.tiers || [{ id: 'bronze' }, { id: 'silver' }, { id: 'gold' }, { id: 'diamond' }]).map(t => (
                      <TierBadge key={t.id} tier={t} />
                    ))}
                  </div>
                </div>

                {/* Hệ số nhân */}
                <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#f0fdf4,#ecfdf5)', border: '1px solid #bbf7d0' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#dcfce7' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Hệ số nhân</p>
                  </div>
                  <div className="space-y-1.5">
                    {(loyaltyConfig?.tiers || [
                      { id: 'bronze', name: 'Đồng', multiplier: 1 },
                      { id: 'silver', name: 'Bạc', multiplier: 1.2 },
                      { id: 'gold', name: 'Vàng', multiplier: 1.5 },
                      { id: 'diamond', name: 'Kim Cương', multiplier: 2 },
                    ]).map(r => (
                      <div key={r.id} className="flex items-center justify-between rounded-lg px-2.5 py-1" style={{ background: '#f8fafc' }}>
                        <span className="text-[11px] font-semibold text-slate-700">{r.name}</span>
                        <span className="text-xs font-extrabold text-emerald-700">x{r.multiplier}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tier progression */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#fefce8,#fffbeb)' }}>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Trophy size={18} weight="duotone" className="text-amber-500" />
                Ngưỡng nâng hạng & Quyền lợi thành viên
              </h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {(loyaltyConfig?.tiers || [
                  { id: 'bronze', name: 'Đồng', minPoints: 0, multiplier: 1.0 },
                  { id: 'silver', name: 'Bạc', minPoints: 100000, multiplier: 1.2 },
                  { id: 'gold', name: 'Vàng', minPoints: 500000, multiplier: 1.5 },
                  { id: 'diamond', name: 'Kim Cương', minPoints: 1000000, multiplier: 2.0 },
                ]).map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col h-full rounded-2xl border border-slate-200/90 bg-slate-50/50 p-5 transition-all hover:bg-white hover:border-amber-300 hover:shadow-md"
                  >
                    <div className="flex flex-col items-center text-center pb-3 border-b border-slate-200/60">
                      <div className="mb-2">
                        <TierBadge tier={row} />
                      </div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{row.name}</h4>
                      <p className="text-xl font-black text-slate-800 mt-1">
                        {row.minPoints ? `${Number(row.minPoints).toLocaleString('vi-VN')} điểm` : '0 điểm'}
                      </p>
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700 border border-emerald-200">
                        Hệ số thưởng: x{row.multiplier}
                      </span>
                    </div>

                    {row.benefits && row.benefits.length > 0 && (
                      <div className="mt-3 flex-1 text-xs text-slate-700 space-y-2">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Đặc quyền & Ưu đãi:
                        </span>
                        {row.benefits.map((b, bIdx) => (
                          <div key={bIdx} className="flex items-start gap-2 leading-relaxed">
                            <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" weight="fill" />
                            <span className="font-medium text-slate-700 break-words">{b}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' ? (
        <PointHistoryTab branches={branches} />
      ) : activeTab === 'lifetime' ? (
        <LifetimePointsTab branches={branches} />
      ) : activeTab === 'gifts' ? (
        <RewardsConfigTab isManager={false} />
      ) : activeTab === 'redemptions' ? (
        <RedemptionsTab isManager={false} />
      ) : activeTab === 'wheel' ? (
        <WheelManagementTab />
      ) : activeTab === 'report' ? (
        <VoucherUsageReportTab />
      ) : activeTab === 'list' && (
        <div className="space-y-5">
          <DashboardOverview stats={voucherStats} />

          {/* Toolbar */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button onClick={() => { setPage(1); fetch_(); }} disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white !text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors">
                <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <div className="relative flex-1 max-w-md">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo mã hoặc tên voucher..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
                />
                {search && (
                  <button
                    onClick={() => { setSearch(''); setPage(1); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <button onClick={() => { setSelected(null); setModal('create'); }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm">
                <Plus size={14} weight="bold" />Tạo voucher
              </button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="active">Hoạt động</option>
                <option value="inactive">Tắt</option>
              </select>
              <select
                value={branchFilter}
                onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
              >
                <option value="">Tất cả chi nhánh</option>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Từ ngày:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Đến ngày:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
                />
              </div>
              {(statusFilter || branchFilter || startDate || endDate) && (
                <button
                  onClick={() => { setStatusFilter(''); setBranchFilter(''); setStartDate(''); setEndDate(''); setPage(1); }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-24 text-slate-400"><Spinner size={24} /></div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 py-16 text-red-500">
              <Warning size={26} weight="duotone" /><p className="text-sm">{error}</p>
            </div>
          ) : vouchers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-20">
              <Tag size={40} weight="thin" className="text-slate-300" />
              <p className="text-sm text-slate-500">Chưa có voucher nào</p>
              <button onClick={() => { setSelected(null); setModal('create'); }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors">
                <Plus size={13} weight="bold" />Tạo voucher đầu tiên
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Mã</th>
                    <th className="px-4 py-3">Tên</th>
                    <th className="px-4 py-3">Giá trị</th>
                    <th className="px-4 py-3">SL còn lại</th>
                    <th className="px-4 py-3">Hiệu lực</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vouchers.map((v) => (
                    <tr key={v._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700">{v.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{v.name}</p>
                        {v.description && <p className="text-[11px] text-slate-400 truncate max-w-[180px]" title={v.description}>{v.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {v.type === 'percentage' ? `${v.value}%` : `${formatCurrency(v.value)}₫`}
                        {v.maxDiscount > 0 && <span className="text-[11px] text-slate-400"> (tối đa {formatCurrency(v.maxDiscount)}₫)</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{v.remaining ?? v.quantity}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDate(v.startDate)} – {formatDate(v.endDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isActive(v) ? 'bg-emerald-50 text-emerald-700' : isExpired(v) ? 'bg-slate-100 text-slate-400' : 'bg-rose-50 text-rose-600'}`}>
                          {isActive(v) ? 'Hoạt động' : isExpired(v) ? 'Hết hạn' : 'Tắt'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSelected(v); setModal('usage'); }} title="Lịch sử dùng"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                            <ClockCounterClockwise size={14} />
                          </button>
                          <button onClick={() => { setSelected(v); setModal('edit'); }} title="Chỉnh sửa"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                            <PencilSimple size={14} />
                          </button>
                          <button onClick={() => handleDelete(v._id)} title="Xóa"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <Trash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination */}
              <div className="flex items-center justify-center gap-4 border-t border-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Hiển thị {(pagination.page - 1) * 10 + 1}–{Math.min(pagination.page * 10, pagination.total)} / {pagination.total} voucher
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={!pagination.hasPrevPage}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Trước
                  </button>
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.page) <= 1)
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
                          onClick={() => setPage(p)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            p === pagination.page
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={!pagination.hasNextPage}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Sau
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {modal === 'create' && (
        <VoucherModal initial={null} onSave={handleCreate} onClose={() => setModal(null)} saving={saving} branches={branches} />
      )}
      {modal === 'edit' && selected && (
        <VoucherModal initial={selected} onSave={handleUpdate} onClose={() => setModal(null)} saving={saving} branches={branches} />
      )}
      {modal === 'usage' && selected && (
        <VoucherUsageModal voucherId={selected._id} onClose={() => setModal(null)} />
      )}
      {modal === 'loyaltyConfig' && (
        <LoyaltyConfigModal initialConfig={loyaltyConfig} onSave={handleSaveLoyaltyConfig} onClose={() => setModal(null)} saving={saving} />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
