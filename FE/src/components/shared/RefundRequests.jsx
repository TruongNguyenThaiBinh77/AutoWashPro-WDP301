import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { showToast } from '@/lib/toast';
import useSSE from '@/hooks/useSSE';
import { confirmDialog } from '@/lib/confirm';
import {
  ArrowUUpLeft,
  ArrowClockwise,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Trash,
  Spinner,
  MagnifyingGlass,
  Funnel,
  Calendar,
} from '@phosphor-icons/react';

function api(path, opts = {}) {
  return fetch(`${getApiBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}`, ...opts.headers },
    ...opts,
  });
}

export function formatCurrency(v) {
  return `${new Intl.NumberFormat('vi-VN').format(v || 0)}đ`;
}

export function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN');
}

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const STATUS_MAP = {
  pending: { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-700 border border-amber-200/80', icon: Clock },
  approved: { label: 'Đã hoàn tiền', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80', icon: CheckCircle },
  rejected: { label: 'Đã từ chối', cls: 'bg-red-50 text-red-600 border border-red-200/80', icon: XCircle },
};

export default function RefundRequests({ detailPath = '/admin/payments/refunds' }) {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalItems: 0, totalPages: 1 });

  const [viewedRequests, setViewedRequests] = useState(() => {
    return JSON.parse(localStorage.getItem('viewed_refund_requests') || '[]');
  });

  // Range Delete states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDateFrom, setDeleteDateFrom] = useState('');
  const [deleteDateTo, setDeleteDateTo] = useState('');
  const [deleteAll, setDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const debounceSearch = useRef(null);

  const load = useCallback(async (pg = page, q = search, st = statusFilter, sDate = startDate, eDate = endDate) => {
    // Validate date range
    if (sDate && eDate && new Date(sDate) > new Date(eDate)) {
      showToast(t('date_invalid'), 'error');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: pg, limit: 10 });
      if (q.trim()) params.set('search', q.trim());
      if (st && st !== 'all') params.set('status', st);
      if (sDate) params.set('startDate', sDate);
      if (eDate) params.set('endDate', eDate);

      const res = await api(`/refund-requests?${params}`);
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || t('load_error'));

      const dataList = resData?.data?.data || (Array.isArray(resData?.data) ? resData.data : []);
      const pageInfo = resData?.data?.pagination || { page: pg, limit: 10, totalItems: dataList.length, totalPages: 1 };

      setRequests(dataList);
      setPagination(pageInfo);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, startDate, endDate]);

  useEffect(() => {
    load(page, search, statusFilter, startDate, endDate);
  }, [page, statusFilter, startDate, endDate]); // eslint-disable-line

  const handleSearchChange = (val) => {
    setSearch(val);
    if (debounceSearch.current) clearTimeout(debounceSearch.current);
    debounceSearch.current = setTimeout(() => {
      setPage(1);
      load(1, val, statusFilter, startDate, endDate);
    }, 400);
  };

  const handleStartDateChange = (val) => {
    if (val && endDate && new Date(val) > new Date(endDate)) {
      showToast(t('date_invalid'), 'error');
      return;
    }
    setStartDate(val);
    setPage(1);
  };

  const handleEndDateChange = (val) => {
    if (startDate && val && new Date(startDate) > new Date(val)) {
      showToast(t('date_invalid'), 'error');
      return;
    }
    setEndDate(val);
    setPage(1);
  };

  const handleTodayClick = () => {
    const today = getTodayString();
    setStartDate(today);
    setEndDate(today);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const goToBooking = (r) => {
    const b = r.bookingId || {};
    const bookingId = b._id || b;
    if (!bookingId) return;
    const isAdmin = detailPath.startsWith('/admin');
    const roleBase = isAdmin ? '/admin' : '/manager';
    navigate(`${roleBase}/bookings?search=${encodeURIComponent(b.bookingCode || bookingId)}`);
  };

  const handleOpenDetail = (r) => {
    if (r._id && !viewedRequests.includes(r._id)) {
      const next = [...viewedRequests, r._id];
      setViewedRequests(next);
      localStorage.setItem('viewed_refund_requests', JSON.stringify(next));
      window.dispatchEvent(new Event('refund-request-viewed'));
    }
    navigate(`${detailPath}/${r._id}`);
  };

  const token = getStoredToken();
  useSSE(token, 'refund_request_new', () => load(page, search, statusFilter, startDate, endDate));
  useSSE(token, 'refund_request_updated', () => load(page, search, statusFilter, startDate, endDate));
  useSSE(token, 'refund_requests_updated', () => load(page, search, statusFilter, startDate, endDate));

  async function handleDeleteSingle(r) {
    if (!(await confirmDialog({ title: t('delete_confirm_title'), message: t('delete_confirm_single'), danger: true }))) return;
    try {
      const res = await api(`/refund-requests/${r._id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t('delete_failed'));
      setRequests(prev => prev.filter(item => item._id !== r._id));
      showToast(t('delete_success'), 'success');
      load(page, search, statusFilter, startDate, endDate);
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function deleteRequestsByRange() {
    if (deleteAll) {
      if (!(await confirmDialog({ title: t('delete_all_title'), message: t('delete_all_confirm'), danger: true }))) return;
    } else {
      if (!deleteDateFrom || !deleteDateTo) return showToast(t('select_date_range'), 'error');
      if (!(await confirmDialog({ title: t('delete_confirm_title'), message: t('delete_range_confirm', { from: deleteDateFrom, to: deleteDateTo }), danger: true }))) return;
    }
    setDeleting(true);
    try {
      const params = deleteAll ? 'all=true' : `dateFrom=${deleteDateFrom}&dateTo=${deleteDateTo}`;
      const res = await api(`/refund-requests/range?${params}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || t('delete_failed'));
      showToast(data.message || t('delete_success'), 'success');
      setShowDeleteModal(false);
      setDeleteDateFrom('');
      setDeleteDateTo('');
      setDeleteAll(false);
      load(1, search, statusFilter, startDate, endDate);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setDeleting(false); }
  }

  const todayStr = new Date().toDateString();

  return (
    <div className="space-y-5">
      {/* Search, Filter & Action Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Customer Name Search */}
          <div className="relative min-w-[240px] flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t('search_placeholder')}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-9 pr-4 text-xs text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
            />
            {search && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Funnel size={14} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-xl border border-slate-200 bg-slate-50/60 py-2 px-3 text-xs font-semibold text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">{t('status_all')}</option>
              <option value="pending">{t('status_pending')}</option>
              <option value="approved">{t('status_approved')}</option>
              <option value="rejected">{t('status_rejected')}</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(page, search, statusFilter, startDate, endDate)}
              disabled={loading}
              title={t('refresh')}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <ArrowClockwise size={13} className={loading ? 'animate-spin' : ''} />
              <span>{t('refresh')}</span>
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex h-8 items-center gap-1.5 rounded-xl bg-red-600 px-3.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors cursor-pointer shadow-2xs"
            >
              <Trash size={13} />
              <span>{t('delete_data')}</span>
            </button>
          </div>
        </div>

        {/* Date Range Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Calendar size={14} className="text-slate-400" />
            <span>{t('date_range')}</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="text-xs text-slate-400">{t('to')}</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* "Hôm nay" Button */}
          <button
            onClick={handleTodayClick}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
          >
            {t('today')}
          </button>

          {(search || statusFilter !== 'all' || startDate || endDate) && (
            <button
              onClick={handleClearFilters}
              className="text-xs font-medium text-slate-400 hover:text-slate-600 underline ml-auto cursor-pointer"
            >
              {t('clear_filters')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>}

      {/* Main Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400 rounded-2xl border border-slate-200 bg-white shadow-xs">
          <ArrowUUpLeft size={48} weight="duotone" />
          <p className="text-sm font-medium">{t('no_results')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5">{t('col_customer')}</th>
                  <th className="px-4 py-3.5">{t('col_booking_code')}</th>
                  <th className="px-4 py-3.5">{t('col_reason')}</th>
                  <th className="px-4 py-3.5 text-right">{t('col_amount')}</th>
                  <th className="px-4 py-3.5">{t('col_status')}</th>
                  <th className="px-4 py-3.5">{t('col_date')}</th>
                  <th className="px-4 py-3.5 text-right">{t('col_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const st = STATUS_MAP[r.status] || { label: r.status, cls: 'bg-slate-100 text-slate-500' };
                  const booking = r.bookingId || {};
                  const isDepositOnly = booking.paymentStatus === 'deposit_paid' || (booking.depositPaid && booking.paymentStatus !== 'paid');
                  const actualDeposit = booking.depositAmount || booking.deposit;
                  const refundAmount = isDepositOnly && actualDeposit ? actualDeposit : (booking.finalPrice ?? r.amount ?? r.refundAmount);

                  // NEW badge logic: created today AND not yet viewed in detail
                  const isCreatedToday = new Date(r.createdAt).toDateString() === todayStr;
                  const isNew = isCreatedToday && !viewedRequests.includes(r._id);

                  return (
                    <tr key={r._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{r.userId?.name || '—'}</span>
                          {isNew && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-xs">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Mới
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">{r.userId?.email || r.userId?.phone || ''}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {booking.bookingCode || ('AWP-' + String(booking._id || booking).slice(-8).toUpperCase())}
                        </span>
                        {booking.packageName && (
                          <div className="text-xs text-slate-400 truncate max-w-[160px]">{booking.packageName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-emerald-600">{formatCurrency(refundAmount)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{formatDateTime(r.createdAt)}</td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => goToBooking(r)}
                            title={t('view_booking')}
                            className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            {t('view_booking')}
                          </button>
                          <button
                            onClick={() => handleOpenDetail(r)}
                            title={t('view_detail')}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteSingle(r)}
                            title={t('delete_request')}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar (10 items / page) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/40 px-6 py-3.5 text-xs text-slate-500">
            <div>
              {t('showing')} <span className="font-semibold text-slate-700">{((pagination.page - 1) * pagination.limit) + 1}</span> - <span className="font-semibold text-slate-700">{Math.min(pagination.page * pagination.limit, pagination.totalItems)}</span> {t('of')} <span className="font-semibold text-slate-700">{pagination.totalItems}</span> {t('requests')}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={pagination.page <= 1 || loading}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {t('prev')}
                </button>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pNum) => (
                  <button
                    key={pNum}
                    onClick={() => setPage(pNum)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      pNum === pagination.page
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pNum}
                  </button>
                ))}
                <button
                  onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {t('next')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete by date range modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => { if (!deleting) setShowDeleteModal(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 text-sm">{t('delete_range_title')}</h2>
              <button disabled={deleting} onClick={() => setShowDeleteModal(false)} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-lg cursor-pointer">✕</button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600">
                {deleteAll ? t('delete_all_data') : t('select_date_range')}
                <span className="font-semibold text-red-600"> {t('cannot_undo')}</span>
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={deleteAll} onChange={(e) => setDeleteAll(e.target.checked)}
                  className="rounded border-slate-300 text-red-600 focus:ring-red-400" />
                <span className="font-medium text-slate-700">{t('delete_all_data')}</span>
              </label>
              {!deleteAll && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-slate-500 mb-1 font-medium">{t('from_date')}</label>
                    <input type="date" value={deleteDateFrom} onChange={(e) => setDeleteDateFrom(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-slate-500 mb-1 font-medium">{t('to_date')}</label>
                    <input type="date" value={deleteDateTo} onChange={(e) => setDeleteDateTo(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 px-6 py-4 flex gap-3 justify-end">
              <button disabled={deleting} onClick={() => setShowDeleteModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">{t('cancel')}</button>
              <button onClick={deleteRequestsByRange} disabled={deleting || (!deleteAll && (!deleteDateFrom || !deleteDateTo))}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 cursor-pointer">
                {deleting ? <Spinner size={14} className="animate-spin" /> : <Trash size={14} />}
                {deleting ? t('deleting') : t('delete_data')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
