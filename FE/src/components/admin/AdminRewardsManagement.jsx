import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import {
  ArrowClockwise,
  CheckCircle,
  Package,
  MagnifyingGlass,
  Plus,
  Trash,
  Warning,
  X,
  XCircle,
  PencilSimple,
  PaperPlaneTilt,
} from '@phosphor-icons/react';
import TierBadge from '@/components/ui/TierBadge';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { translateText } from '@/utils/notifTranslator';

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

const inp = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-colors';

const FALLBACK_TIER_OPTIONS = [
  { id: 'bronze', name: 'Đồng' },
  { id: 'silver', name: 'Bạc' },
  { id: 'gold', name: 'Vàng' },
  { id: 'diamond', name: 'Kim Cương' },
];

const REDEMPTION_STATUS = {
  claimed: { label: 'Chờ gửi quà', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  sent: { label: 'Đã gửi cho khách', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  received: { label: 'Khách đã nhận', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Đã hủy', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
};

function StatusBadge({ status }) {
  const { i18n } = useTranslation();
  const lang = i18n.language || 'vi';
  const s = REDEMPTION_STATUS[status] || { label: status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>{translateText(s.label, lang)}</span>;
}

/* ═══ Cấu hình quà tặng vật lý (Reward CRUD) ═══ */
function RewardModal({ initial, onSave, onClose, saving, tierOptions = FALLBACK_TIER_OPTIONS }) {
  const [form, setForm] = useState(initial || {
    name: '', description: '', imageUrl: '', pointCost: '', stock: '',
    requiredTier: 'bronze', status: 'active', sortOrder: 0,
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Nhập tên phần quà';
    if (!form.pointCost || Number(form.pointCost) < 1) e.pointCost = 'Nhập số điểm (> 0)';
    if (form.stock === '' || form.stock == null || Number(form.stock) < 0) e.stock = 'Nhập số lượng tồn kho';
    return e;
  };

  const submit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) return setErrors(errs);
    onSave({
      ...form,
      pointCost: Number(form.pointCost),
      stock: Number(form.stock),
      sortOrder: Number(form.sortOrder) || 0,
    });
  };

  const isEdit = !!initial?._id;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-800">{isEdit ? 'Chỉnh sửa phần quà' : 'Thêm phần quà vật lý mới'}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="max-h-[72vh] space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Tên phần quà <span className="text-red-500">*</span></label>
            <input className={inp} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nước hoa khử mùi xe" />
            {errors.name && <p className="mt-0.5 text-[11px] text-red-500">{errors.name}</p>}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Mô tả</label>
            <textarea className={`${inp} min-h-[70px] resize-y`} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Mô tả ngắn về phần quà..." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Ảnh (URL)</label>
            <input className={inp} value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Số điểm đổi <span className="text-red-500">*</span></label>
              <input type="number" min="1" className={inp} value={form.pointCost} onChange={(e) => set('pointCost', e.target.value)} placeholder="100" />
              {errors.pointCost && <p className="mt-0.5 text-[11px] text-red-500">{errors.pointCost}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Số lượng tồn kho <span className="text-red-500">*</span></label>
              <input type="number" min="0" className={inp} value={form.stock} onChange={(e) => set('stock', e.target.value)} placeholder="50" />
              {errors.stock && <p className="mt-0.5 text-[11px] text-red-500">{errors.stock}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Hạng tối thiểu</label>
              <select className={inp} value={form.requiredTier || 'bronze'} onChange={(e) => set('requiredTier', e.target.value)}>
                {tierOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Trạng thái</label>
              <select className={inp} value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="active">Kích hoạt</option>
                <option value="inactive">Tắt</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">Hủy</button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
              {saving && <Spinner size={14} />}{saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RewardsConfigTab({ isManager = false }) {
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [tierOptions, setTierOptions] = useState(FALLBACK_TIER_OPTIONS);
  const notify = (msg, type = 'success') => showToast(msg, type);

  useEffect(() => {
    let cancelled = false;
    api('/loyalty/tiers')
      .then(async (res) => {
        if (!res.ok) return;
        const payload = await res.json();
        const list = Array.isArray(payload?.data) ? payload.data
          : (typeof payload?.data === 'object' && Array.isArray(payload.data.tiers)) ? payload.data.tiers
          : [];
        if (!cancelled && list.length > 0) {
          setTierOptions(list.map((t) => ({ id: t.id, name: t.name || t.id })));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const fetch_ = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      params.append('limit', 50);
      const res = await api(`/rewards?${params.toString()}`);
      if (!res.ok) throw new Error(await readErr(res));
      const p = await res.json();
      setRewards(Array.isArray(p?.data) ? p.data : []);
    } catch (err) { setError(err.message || 'Không thể tải phần quà'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleSave = async (form) => {
    setSaving(true);
    try {
      const isEdit = !!selected?._id;
      const res = await api(isEdit ? `/rewards/${selected._id}` : '/rewards', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await readErr(res));
      setModal(null); notify(isEdit ? 'Cập nhật phần quà thành công!' : 'Thêm phần quà thành công!');
      fetch_();
    } catch (err) { notify(err.message || 'Lưu thất bại', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ title: 'Xóa phần quà', message: 'Bạn có chắc chắn muốn xóa phần quà này?', confirmLabel: 'Xóa', danger: true }))) return;
    try {
      const res = await api(`/rewards/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readErr(res));
      setRewards((prev) => prev.filter((r) => r._id !== id));
      notify('Xóa phần quà thành công!');
    } catch (err) { notify(err.message || 'Xóa thất bại', 'error'); }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={fetch_} disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white !text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors">
          <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên phần quà..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
        <button onClick={() => { setSelected(null); setModal('create'); }}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm">
          <Plus size={14} weight="bold" />Thêm phần quà
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400"><Spinner size={24} /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 py-16 text-red-500">
          <Warning size={26} weight="duotone" /><p className="text-sm">{error}</p>
        </div>
      ) : rewards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-20">
          <Package size={40} weight="thin" className="text-slate-300" />
          <p className="text-sm text-slate-500">Chưa có phần quà vật lý nào</p>
          <button onClick={() => { setSelected(null); setModal('create'); }}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
            <Plus size={13} weight="bold" />Thêm phần quà đầu tiên
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3">Quà tặng</th>
                  <th className="px-4 py-3">Điểm đổi</th>
                  <th className="px-4 py-3">Tồn kho</th>
                  <th className="px-4 py-3">Hạng tối thiểu</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rewards.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          {r.imageUrl ? (
                            <img src={r.imageUrl} alt={r.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-lg">🎁</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 line-clamp-1">{r.name}</p>
                          {r.description && <p className="text-[11px] text-slate-400 line-clamp-1">{r.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-amber-600">{Number(r.pointCost).toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-3 text-slate-600">{r.stock}</td>
                    <td className="px-4 py-3"><TierBadge tier={r.requiredTier || 'bronze'} /></td>
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {r.status === 'active' ? 'Kích hoạt' : 'Tắt'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setSelected(r); setModal('edit'); }} title="Chỉnh sửa"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                          <PencilSimple size={14} />
                        </button>
                        {!isManager && (
                          <button onClick={() => handleDelete(r._id)} title="Xóa"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                            <Trash size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

{modal === 'create' && <RewardModal initial={null} onSave={handleSave} onClose={() => setModal(null)} saving={saving} tierOptions={tierOptions} />}
{modal === 'edit' && selected && <RewardModal initial={selected} onSave={handleSave} onClose={() => setModal(null)} saving={saving} tierOptions={tierOptions} />}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

/* ═══ Trao quà: danh sách lượt đổi + nút "Đã gửi quà cho khách" ═══ */
export function RedemptionsTab({ isManager = false, managerBranchId = '' }) {
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(null);
  const [verifying, setVerifying] = useState(null);
  const [codeInput, setCodeInput] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const notify = (msg, type = 'success') => showToast(msg, type);

  const fetch_ = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      params.append('page', page);
      params.append('limit', 10);
      const res = await api(`/rewards/redemptions?${params.toString()}`);
      if (!res.ok) throw new Error(await readErr(res));
      const p = await res.json();
      setRedemptions(Array.isArray(p?.data) ? p.data : []);
      if (p?.pagination) setPagination(p.pagination);
    } catch (err) { setError(err.message || 'Không thể tải danh sách đổi thưởng'); }
    finally { setLoading(false); }
  }, [search, statusFilter, page]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleSent = async (rd) => {
    const ok = await confirmDialog({
      title: 'Xác nhận đã gửi quà',
      message: `Xác nhận bạn đã giao "${rd.rewardSnapshot?.name || 'phần quà'}" cho khách hàng? Khách sẽ dùng mã đổi thưởng để nhận quà.`,
      confirmLabel: 'Đã gửi quà',
    });
    if (!ok) return;

    setSending(rd._id);
    try {
      const res = await api(`/rewards/redemptions/${rd._id}/sent`, {
        method: 'POST',
        body: JSON.stringify(managerBranchId ? { branchId: managerBranchId } : {}),
      });
      if (!res.ok) throw new Error(await readErr(res));
      notify('Đã gửi quà cho khách hàng!');
      fetch_();
    } catch (err) { notify(err.message || 'Cập nhật thất bại', 'error'); }
    finally { setSending(null); }
  };

  const handleVerifyReceived = async (rd) => {
    const code = (codeInput[rd._id] || '').trim();
    if (!code) { notify('Vui lòng nhập mã đổi thưởng của khách', 'error'); return; }
    setVerifying(rd._id);
    try {
      const res = await api(`/rewards/redemptions/${rd._id}/received`, {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await readErr(res));
      notify('Đã xác nhận khách nhận quà!');
      setCodeInput(prev => ({ ...prev, [rd._id]: '' }));
      fetch_();
    } catch (err) { notify(err.message || 'Xác nhận thất bại', 'error'); }
    finally { setVerifying(null); }
  };

  const { i18n } = useTranslation();
  const lang = i18n.language || 'vi';

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Thanh công cụ tìm kiếm và lọc */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={fetch_} disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white !text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors">
          <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={translateText('Tìm theo mã đổi thưởng hoặc tên quà...', lang)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-colors">
          <option value="">{translateText('Tất cả trạng thái', lang)}</option>
          <option value="claimed">{translateText('Chờ gửi quà', lang)}</option>
          <option value="sent">{translateText('Đã gửi cho khách', lang)}</option>
          <option value="received">{translateText('Khách đã nhận', lang)}</option>
          <option value="cancelled">{translateText('Đã hủy', lang)}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400"><Spinner size={24} /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 py-16 text-red-500">
          <Warning size={26} weight="duotone" /><p className="text-sm">{error}</p>
        </div>
      ) : redemptions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-20">
          <Package size={40} weight="thin" className="text-slate-300" />
          <p className="text-sm text-slate-500">{translateText('Chưa có lượt đổi thưởng nào', lang)}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3">{translateText('Khách hàng', lang)}</th>
                  <th className="px-4 py-3">{translateText('Quà tặng', lang)}</th>
                  <th className="px-4 py-3">{translateText('Ngày đổi', lang)}</th>
                  <th className="px-4 py-3">{translateText('Trạng thái', lang)}</th>
                  <th className="px-4 py-3">{translateText('Chi nhánh / Người gửi', lang)}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {redemptions.map((rd) => {
                  const snap = rd.rewardSnapshot || {};
                  const u = rd.user || {};
                  const canSend = rd.status === 'claimed';
                  const canVerify = rd.status === 'sent';
                  return (
                    <tr key={rd._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{u.name || '—'}</p>
                        <p className="text-[11px] text-slate-400">{u.phone || u.email || ''}</p>
                        {u.tier && <TierBadge tier={u.tier} />}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 line-clamp-1">{snap.name || '—'}</p>
                        <p className="text-[11px] text-amber-600 font-semibold">{Number(snap.pointCost || rd.pointsSpent || 0).toLocaleString('vi-VN')} {translateText('điểm', lang)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(rd.createdAt)}</td>
                      <td className="px-4 py-3"><StatusBadge status={rd.status} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {rd.status === 'sent' || rd.status === 'received' ? (
                          <>
                            {rd.sentAt && <p>{formatDate(rd.sentAt)}</p>}
                            {rd.branchId?.name && <p className="text-slate-400">{rd.branchId.name}</p>}
                            {rd.sentBy?.name && <p className="text-slate-400">{lang === 'en' ? 'by ' : 'bởi '}{rd.sentBy.name}</p>}
                          </>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {canSend ? (
                          <button onClick={() => handleSent(rd)} disabled={sending === rd._id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
                            {sending === rd._id ? <Spinner size={12} /> : <PaperPlaneTilt size={13} />}
                            {sending === rd._id ? (lang === 'en' ? 'Sending...' : 'Đang gửi...') : translateText('Đã gửi quà cho khách', lang)}
                          </button>
                        ) : canVerify ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={codeInput[rd._id] || ''}
                              onChange={(e) => setCodeInput(prev => ({ ...prev, [rd._id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyReceived(rd); }}
                              placeholder="Nhập mã của khách"
                              className="w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-700 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-colors"
                            />
                            <button onClick={() => handleVerifyReceived(rd)} disabled={verifying === rd._id}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                              {verifying === rd._id ? <Spinner size={12} /> : <CheckCircle size={13} />}
                              {verifying === rd._id ? 'Đang xác nhận...' : 'Xác nhận đã nhận'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Trước</button>
          <span className="text-xs text-slate-500">Trang {page} / {pagination.totalPages}</span>
          <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Sau</button>
        </div>
      )}
    </div>
  );
}
