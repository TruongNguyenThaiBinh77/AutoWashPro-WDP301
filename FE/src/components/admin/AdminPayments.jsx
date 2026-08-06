import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import useSSE from '@/hooks/useSSE';
import { showToast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import {
  CurrencyDollar,
  CheckCircle,
  ArrowClockwise,
  Eye,
  MagnifyingGlass,
  X,
  ArrowUUpLeft,
  ArrowsClockwise,
  Trash,
} from '@phosphor-icons/react';
import {
  formatCurrency,
  formatDate,
  STATUS_MAP,
  METHOD_MAP,
  Spinner,
} from '@/components/admin/paymentShared';

function api(path, opts = {}) {
  return fetch(`${getApiBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}`, ...opts.headers },
    ...opts,
  });
}
async function readErr(res, t) {
  try { const j = await res.json(); return j?.message || t('payments.error_prefix', { status: res.status }); } catch { return t('payments.error_prefix', { status: res.status }); }
}

const STATUS_TABS = [
  { key: '', labelKey: 'status_all' },
  { key: 'paid', labelKey: 'status_paid' },
  { key: 'pending', labelKey: 'status_pending' },
  { key: 'failed', labelKey: 'status_failed' },
  { key: 'refunded', labelKey: 'status_refunded' },
];

const METHOD_TABS = [
  { key: '', labelKey: 'method_all' },
  { key: 'cash', labelKey: 'method_cash' },
  { key: 'momo', labelKey: 'method_momo' },
  { key: 'vnpay', labelKey: 'method_vnpay' },
  { key: 'bank', labelKey: 'method_bank' },
];

/* ─────────────────────────── Main ─────────────────────────── */
export default function AdminPayments({ showDelete = true, detailPath = '/admin/payments', urlSync = false } = {}) {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => (urlSync ? searchParams.get('status') || '' : ''));
  const [methodFilter, setMethodFilter] = useState(() => (urlSync ? searchParams.get('method') || '' : ''));
  const [dateFilter, setDateFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => (urlSync ? searchParams.get('dateFrom') || '' : ''));
  const [dateTo, setDateTo] = useState(() => (urlSync ? searchParams.get('dateTo') || '' : ''));
  const [search, setSearch] = useState(() => (urlSync ? searchParams.get('search') || '' : ''));
  const [page, setPage] = useState(() => (urlSync ? parseInt(searchParams.get('page') || '1', 10) || 1 : 1));
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ revenue: 0, total: 0, paid: 0, pending: 0, failed: 0, refunded: 0 });
  const [newIds, setNewIds] = useState(() => new Set());
  const [totalPages, setTotalPages] = useState(1);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDateFrom, setDeleteDateFrom] = useState('');
  const [deleteDateTo, setDeleteDateTo] = useState('');
  const [deleteAll, setDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDateError, setDeleteDateError] = useState('');
  const PAGE_SIZE = 10;

  // Sync filters to URL (admin only) so quay lại detail page vẫn giữ bộ lọc
  useEffect(() => {
    if (!urlSync) return;
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (methodFilter) params.set('method', methodFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (search) params.set('search', search);
    if (page > 1) params.set('page', String(page));
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSync, statusFilter, methodFilter, dateFrom, dateTo, search, page]);

  const markViewed = useCallback(async (id) => {
    try {
      await api(`/payments/${id}/viewed`, { method: 'PATCH' });
      window.dispatchEvent(new CustomEvent('payment-viewed'));
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (methodFilter) params.set('method', methodFilter);
      if (dateFrom || dateTo) {
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
      } else if (dateFilter === 'today') {
        params.set('today', 'true');
      } else if (dateFilter) {
        params.set('date', dateFilter);
      }
      if (search) params.set('search', search);
      params.set('page', page);
      params.set('limit', PAGE_SIZE);
      const res = await api(`/payments?${params}`);
      if (!res.ok) { const e = await readErr(res, t); throw new Error(e); }
      const payload = await res.json();

      const responseData = payload?.data || payload;
      let list = [];
      let pagination = payload?.pagination;
      if (Array.isArray(responseData)) {
        list = responseData;
      } else if (responseData && Array.isArray(responseData.data)) {
        list = responseData.data;
        pagination = responseData.pagination || pagination;
      } else if (responseData && responseData.payments) {
        list = responseData.payments;
      }

      if (pagination) {
        setTotalPages(pagination.totalPages || 1);
      }

      if (responseData && responseData.stats) {
        setStats(responseData.stats);
      }

      setPayments(list);
      setNewIds(new Set(list.filter(p => !p.viewedAt && p.status === 'paid').map(p => p._id)));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [statusFilter, methodFilter, dateFilter, dateFrom, dateTo, page, search]);

  useEffect(() => { load(); }, [load]);

  const token = getStoredToken();
  useSSE(token, 'payment_new', load);

  // Stats
  const { revenue: totalRevenue, total, paid: paidCount, refunded: refundedCount } = stats;

  const filtered = payments;
  const safePage = Math.min(page, totalPages);
  const paginated = filtered;

  function onFilter(setter, value) { setter(value); setPage(1); }

  function handleOpenDetail(p) {
    markViewed(p._id);
    setNewIds(prev => { const n = new Set(prev); n.delete(p._id); return n; });
    navigate(`${detailPath}/${p._id}`);
  }

  function validateDeleteRange(from, to) {
    if (deleteAll) return '';
    if (!from || !to) return t('payments.select_both_dates');
    if (from > to) return t('payments.date_invalid');
    const today = new Date().toISOString().slice(0, 10);
    if (to > today) return t('payments.date_future');
    return '';
  }

  async function deletePaymentsByRange() {
    if (deleteAll) {
      if (!(await confirmDialog({ title: t('payments.delete_all_title'), message: t('payments.delete_all_confirm'), danger: true }))) return;
    } else {
      const err = validateDeleteRange(deleteDateFrom, deleteDateTo);
      if (err) { setDeleteDateError(err); return; }
      if (!(await confirmDialog({ title: t('payments.delete_confirm_title'), message: t('payments.delete_range_confirm', { from: deleteDateFrom, to: deleteDateTo }), danger: true }))) return;
    }
    setDeleteDateError('');
    setDeleting(true);
    try {
      const params = deleteAll ? 'all=true' : `dateFrom=${deleteDateFrom}&dateTo=${deleteDateTo}`;
      const res = await api(`/payments/range?${params}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || t('payments.delete_failed')); }
      const result = await res.json();
      showToast(result.message || t('payments.delete_success'), 'success');
      setShowDeleteModal(false);
      setDeleteDateFrom('');
      setDeleteDateTo('');
      setDeleteAll(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setDeleting(false); }
  }

  async function deletePaymentRow(p) {
    if (!(await confirmDialog({ title: t('payments.delete_confirm_title'), message: t('payments.delete_confirm_single', { txId: p.transactionId || '' }), danger: true }))) return;
    setDeleting(true);
    try {
      const res = await api(`/payments/${p._id}`, { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || t('payments.delete_failed')); }
      const result = await res.json();
      showToast(result.message || t('payments.delete_success'), 'success');
      load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setDeleting(false); }
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { labelKey: 'stat_revenue', value: formatCurrency(totalRevenue), color: 'text-emerald-600', bg: 'bg-emerald-50', icon: ArrowsClockwise },
          { labelKey: 'stat_total', value: total, color: 'text-blue-600', bg: 'bg-blue-50', icon: CurrencyDollar },
          { labelKey: 'stat_paid', value: paidCount, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
          { labelKey: 'stat_refunded', value: refundedCount, color: 'text-slate-500', bg: 'bg-slate-100', icon: ArrowUUpLeft },
        ].map(({ labelKey, value, color, bg, icon: Icon }) => (
          <div key={labelKey} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon size={18} className={color} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{t(labelKey)}</p>
              <p className="text-lg font-bold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-colors"
            placeholder={t('payments.search_placeholder')}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
        <select value={statusFilter} onChange={e => onFilter(setStatusFilter, e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400">
          {STATUS_TABS.map(tab => <option key={tab.key} value={tab.key}>{t(tab.labelKey)}</option>)}
        </select>
        <select value={methodFilter} onChange={e => onFilter(setMethodFilter, e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400">
          {METHOD_TABS.map(tab => <option key={tab.key} value={tab.key}>{t(tab.labelKey)}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => onFilter(setDateFrom, e.target.value)}
          max={dateTo || new Date().toISOString().slice(0, 10)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <span className="text-xs text-slate-400">→</span>
        <input type="date" value={dateTo} onChange={e => onFilter(setDateTo, e.target.value)}
          min={dateFrom || undefined} max={new Date().toISOString().slice(0, 10)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
            className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50">
            <X size={12} /> {t('payments.clear_date')}
          </button>
        )}
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50">
          <ArrowClockwise size={12} className={loading ? 'animate-spin' : ''} /> {t('payments.refresh')}
        </button>
        {showDelete && (
          <button onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500">
            <Trash size={12} /> {t('payments.delete_transactions')}
          </button>
        )}
      </div>

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <CurrencyDollar size={48} weight="duotone" />
          <p className="text-sm">{t('payments.empty')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">{t('payments.col_transaction')}</th>
                  <th className="px-4 py-3">{t('payments.col_customer')}</th>
                  <th className="px-4 py-3">{t('payments.col_method')}</th>
                  <th className="px-4 py-3 text-right">{t('payments.col_amount')}</th>
                  <th className="px-4 py-3">{t('payments.col_status')}</th>
                  <th className="px-4 py-3">{t('payments.col_date')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((p) => {
                  const st = STATUS_MAP[p.status] || { label: p.status, cls: 'bg-slate-100 text-slate-500' };
                  const mt = METHOD_MAP[p.method] || { label: p.method, cls: 'bg-slate-100 text-slate-500' };
                  return (
                    <tr key={p._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-700">{p.transactionId || '—'}</span>
                          {newIds.has(p._id) && (
                            <span className="text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5 py-0.5 animate-pulse">{t('payments.new_badge')}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{p.userId?.name || '—'}</div>
                        <div className="text-xs text-slate-400">{p.userId?.email || ''}</div>
                        {p.userId?.phone && <div className="text-xs text-slate-400">{p.userId.phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${mt.cls}`}>{mt.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleOpenDetail(p)} title={t('payments.view_detail')}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                            <Eye size={14} />
                          </button>
                          {showDelete && (
                            <button onClick={() => deletePaymentRow(p)} title={t('payments.delete_row')}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                {t('payments.prev')}
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                    safePage === p ? 'bg-emerald-600 text-white shadow-sm' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>{p}</button>
              ))}
              <button disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                {t('payments.next')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => { if (!deleting) setShowDeleteModal(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{t('payments.delete_range_title')}</h2>
              <button disabled={deleting} onClick={() => setShowDeleteModal(false)} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                {deleteAll ? t('payments.delete_all_data') : t('payments.select_date_range')}
                <span className="font-semibold text-red-600"> {t('admin.cannot_undo')}</span>
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={deleteAll} onChange={(e) => setDeleteAll(e.target.checked)}
                  className="rounded border-slate-300 text-red-600 focus:ring-red-400" />
                <span className="text-sm font-medium text-slate-700">{t('payments.delete_all_data')}</span>
              </label>
              {!deleteAll && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 mb-1">{t('payments.from_date')}</label>
                      <input type="date" value={deleteDateFrom} onChange={(e) => { setDeleteDateFrom(e.target.value); setDeleteDateError(''); }}
                        max={deleteDateTo || new Date().toISOString().slice(0, 10)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 mb-1">{t('payments.to_date')}</label>
                      <input type="date" value={deleteDateTo} onChange={(e) => { setDeleteDateTo(e.target.value); setDeleteDateError(''); }}
                        min={deleteDateFrom || undefined} max={new Date().toISOString().slice(0, 10)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
                    </div>
                  </div>
                  {deleteDateError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{deleteDateError}</p>
                  )}
                </>
              )}
            </div>
            <div className="border-t border-slate-100 px-6 py-4 flex gap-3 justify-end">
              <button disabled={deleting} onClick={() => setShowDeleteModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">{t('payments.cancel')}</button>
              <button onClick={deletePaymentsByRange} disabled={deleting || (!deleteAll && (!deleteDateFrom || !deleteDateTo))}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
                {deleting ? <Spinner size={14} /> : <Trash size={14} />}
                {deleting ? t('payments.deleting') : t('payments.delete_data')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
