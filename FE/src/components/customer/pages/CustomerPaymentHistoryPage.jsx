import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '@/lib/toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CurrencyCircleDollar, TrendUp, TrendDown } from '@phosphor-icons/react';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import { useTranslation } from 'react-i18next';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const PAYMENT_STATUS_MAP = {
  pending: { labelKey: 'customer.paymentHistory.status.pending', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  paid: { labelKey: 'customer.paymentHistory.status.paid', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  failed: { labelKey: 'customer.paymentHistory.status.failed', cls: 'bg-red-50 text-red-600 border-red-200' },
  refunded: { labelKey: 'customer.paymentHistory.status.refunded', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
};

const METHOD_MAP = {
  cash: 'customer.paymentHistory.method.cash',
  bank: 'customer.paymentHistory.method.bank',
};

function formatCurrency(v) { return `${new Intl.NumberFormat('vi-VN').format(v || 0)}đ`; }
function formatDate(d) { return new Date(d).toLocaleDateString('vi-VN'); }
function formatDateTime(d) { return new Date(d).toLocaleString('vi-VN'); }

function StatusBadge({ status, t }) {
  const s = PAYMENT_STATUS_MAP[status] || { labelKey: null, cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  const label = s.labelKey ? t(s.labelKey) : status;
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>{label}</span>;
}

export default function CustomerPaymentHistoryPage({ onBack, apiBase, token }) {
  const { t } = useTranslation();
  const configs = useSystemConfig();
  const depositPercent = configs?.DEPOSIT_RATE ? Math.round(configs.DEPOSIT_RATE) : 30;
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState(null);

  const loadPayments = async () => {
    if (!token) return;
    setLoading(true);
    let url = `${apiBase || API_BASE}/payments/my?withStats=true&page=${page}&limit=10`;
    if (filterDateFrom) url += `&dateFrom=${filterDateFrom}`;
    if (filterDateTo) url += `&dateTo=${filterDateTo}`;

    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await r.json();
      const responseData = payload?.data || payload;
      let paymentsList = [];
      if (responseData && responseData.payments) {
         paymentsList = responseData.payments;
         if (responseData.stats) setStats(responseData.stats);
      } else if (Array.isArray(responseData)) {
         paymentsList = responseData;
      }

      if (payload?.pagination) {
        setTotalPages(payload.pagination.totalPages || 1);
      }

      setPayments(paymentsList);
    } catch {
      showToast(t('customer.paymentHistory.loadFail'), 'error');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPayments(); }, [apiBase, token, filterDateFrom, filterDateTo, page]);

  function openDetail(payment) {
    navigate(`/payments/${payment._id || payment.id}`);
  }

  return (
    <div className="space-y-6">
      <main className="w-full">
        
        {/* Filters and Stats Section */}
        <div className="mb-8 space-y-6">
          {stats && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500">
                <CurrencyCircleDollar size={28} weight="duotone" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-0.5">{t('customer.paymentHistory.monthSpend')}</p>
                <div className="flex items-baseline gap-3">
                  <p className="text-2xl font-bold text-slate-800">{formatCurrency(stats.currentMonthTotal)}</p>
                  {(() => {
                    const current = stats.currentMonthTotal || 0;
                    const prev = stats.previousMonthTotal || 0;
                    let percent = 0;
                    if (prev === 0 && current > 0) percent = 100;
                    else if (prev > 0) percent = ((current - prev) / prev) * 100;
                    
                    if (percent === 0) return <span className="text-[11px] text-slate-400">{t('customer.paymentHistory.noChange')}</span>;
                    const isUp = percent > 0;
                    return (
                      <div className={`flex items-center gap-1 text-[12px] font-medium ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isUp ? <TrendUp weight="bold" /> : <TrendDown weight="bold" />}
                        <span>{t('customer.paymentHistory.percentVsLastMonth', { percent: Math.abs(percent).toFixed(1) })}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-4">{t('customer.paymentHistory.last6Months')}</h3>
              <div className="h-48 w-full">
                {stats && stats.months && stats.months.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.months} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dy={10} />
                    <YAxis tickFormatter={(val) => `${val / 1000}k`} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dx={-10} />
                    <Tooltip 
                      formatter={(val) => [formatCurrency(val), t('customer.paymentHistory.spending')]}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
                      cursor={{ fill: '#f1f5f9' }}
                    />
                    <Bar dataKey="totalAmount" radius={[4, 4, 0, 0]}>
                      {stats.months.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === stats.months.length - 1 ? '#10b981' : '#94a3b8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                  <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                  <span className="text-sm">{t('customer.paymentHistory.noSpendData')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <h3 className="text-sm font-bold text-slate-800 mb-4">{t('customer.paymentHistory.spendByVehicle')}</h3>
            <div className="flex-1 overflow-y-auto max-h-48 pr-2">
              {stats && stats.vehicles && stats.vehicles.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {stats.vehicles.map((v, i) => (
                    <div key={v.vehicleId || i} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 uppercase">{v.licensePlate}</p>
                        <p className="text-xs text-slate-500 capitalize">{v.vehicleType === 'unknown' ? t('customer.paymentHistory.other') : v.vehicleType} {v.brand ? `· ${v.brand}` : ''}</p>
                      </div>
                      <div className="text-right font-bold text-emerald-600 text-sm">
                        {formatCurrency(v.totalAmount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                  <span className="text-sm">{t('customer.paymentHistory.noSpendData')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">{t('customer.paymentHistory.fromDate')}</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
                className="w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">{t('customer.paymentHistory.toDate')}</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
                className="w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400 text-sm">{t('customer.paymentHistory.loading')}</div>
        ) : payments.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">{t('customer.paymentHistory.noMatch')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map(p => {
              const pId = p._id || p.id;
              const booking = p.bookingId || p.bookingData || {};
              return (
                <div key={pId} onClick={() => openDetail(p)}
                  className="p-5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-800">
                          {booking?.packageId?.name || booking?.packageName || booking?.branchId?.name || booking?.branchName || t('customer.paymentHistory.payment')}
                        </span>
                        <StatusBadge status={p.status} t={t} />
                      </div>
                      <p className="text-xs text-slate-400">
                        {booking?.bookingDate ? formatDate(booking.bookingDate) : ''}
                        {booking?.startTime ? ` ${booking.startTime}` : ''}
                        {p.method && ` · ${t(METHOD_MAP[p.method] || p.method)}`}
                        {booking?.bookingCode && <span className="font-mono font-bold text-emerald-600"> · #{booking.bookingCode}</span>}
                      </p>
                      {p.paymentType === 'deposit' && booking?.finalPrice && (
                        <p className="text-xs text-amber-600 font-semibold mt-1.5">
                          {t('customer.paymentHistory.depositLine', { percent: depositPercent, remaining: formatCurrency(Math.max(0, (booking.finalPrice || 0) - (p.amount || 0))) })}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(p.amount)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{p.paymentType === 'deposit' ? t('customer.paymentHistory.deposit') : p.paymentType === 'remaining' ? t('customer.paymentHistory.remaining') : t('customer.paymentHistory.full')}</p>
                    </div>
                  </div>
                  {p.transactionId && (
                    <div className="mt-2 text-[10px] text-slate-400 font-mono">{t('customer.paymentHistory.txnId')} {p.transactionId}</div>
                  )}
                  {p.paidAt && (
                    <div className="text-[10px] text-slate-400 mt-0.5">{t('customer.paymentHistory.paidAt')} {formatDateTime(p.paidAt)}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && totalPages > 0 && (
          <div className="flex justify-center items-center gap-2 mt-8">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="w-10 h-10 rounded-full flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center transition-colors ${
                    page === p ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="w-10 h-10 rounded-full flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        )}
      </main>

    </div>
  );
}
