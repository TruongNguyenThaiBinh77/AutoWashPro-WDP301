import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChartLine,
  CurrencyDollar,
  CalendarCheck,
  Buildings,
  Users,
  Money,
  CreditCard,
  CalendarBlank,
  CaretDown,
  Funnel,
  X,
  ArrowUp,
  ArrowDown,
  TrendUp,
  CirclesFour,
  Storefront,
} from '@phosphor-icons/react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import TierBadge from '@/components/ui/TierBadge';
import useSSE from '@/hooks/useSSE';

function fmt(n) {
  return new Intl.NumberFormat('vi-VN').format(n ?? 0);
}

function fmtCurrency(n) {
  return `${fmt(n)}đ`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function toLocalDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TIME_FILTERS = [
  { key: 'all', labelKey: 'time_filter_all' },
  { key: 'today', labelKey: 'time_filter_today' },
  { key: '7d', labelKey: 'time_filter_7d' },
  { key: '30d', labelKey: 'time_filter_30d' },
  { key: 'month', labelKey: 'time_filter_month' },
  { key: 'quarter', labelKey: 'time_filter_quarter' },
  { key: 'year', labelKey: 'time_filter_year' },
];

function getDateRange(key) {
  const now = new Date();
  const start = new Date();
  let endDate = now.toISOString();
  switch (key) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case '7d':
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case '30d':
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      start.setMonth(q * 3, 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      return {};
  }
  return { startDate: start.toISOString(), endDate };
}

const STATUS_META = {
  pending:          { labelKey: 'booking_status_pending',          color: '#f59e0b', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  checked_in:       { labelKey: 'booking_status_checked_in',       color: '#3b82f6', bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400' },
  in_progress:      { labelKey: 'booking_status_in_progress',      color: '#0ea5e9', bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-400' },
  awaiting_payment: { labelKey: 'booking_status_awaiting_payment', color: '#f97316', bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-400' },
  completed:        { labelKey: 'booking_status_completed',        color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  cancelled:        { labelKey: 'booking_status_cancelled',        color: '#ef4444', bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-400' },
};

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#0ea5e9', '#10b981', '#ef4444', '#8b5cf6'];

function CustomTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-md text-xs">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-slate-500" style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{currency ? fmtCurrency(p.value) : fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export default function AdminOverview() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const goToBooking = useCallback((booking) => {
    navigate(`/admin/bookings?search=${encodeURIComponent(booking.bookingCode || booking._id)}`);
  }, [navigate]);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [revenueTrends, setRevenueTrends] = useState([]);
  const [bookingStats, setBookingStats] = useState({ stats: [], total: 0 });
  const [branchRevenue, setBranchRevenue] = useState([]);

  const [timeFilter, setTimeFilter] = useState('all');
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [branchOpen, setBranchOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedFilters, setAppliedFilters] = useState(null);

  const buildQueryString = useCallback(() => {
    const params = {};
    if (appliedFilters) {
      if (appliedFilters.branchIds) params.branchIds = appliedFilters.branchIds;
      if (appliedFilters.startDate) params.startDate = appliedFilters.startDate;
      if (appliedFilters.endDate) params.endDate = appliedFilters.endDate;
    }
    return new URLSearchParams(params).toString();
  }, [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const headers = { Authorization: `Bearer ${getStoredToken()}` };
      const qs = buildQueryString();
      const qsFull = qs ? `?${qs}` : '';
      const [resReport, resBranches, resUsers, resBookings, resTrends, resStats, resBranchRev] = await Promise.all([
        fetch(`${apiBase}/reports/revenue${qsFull}`, { headers }),
        fetch(`${apiBase}/branches`, { headers }),
        fetch(`${apiBase}/auth/users?all=true`, { headers }),
        fetch(`${apiBase}/bookings?limit=10${qsFull}`, { headers }),
        fetch(`${apiBase}/reports/revenue-trends${qsFull}`, { headers }),
        fetch(`${apiBase}/reports/booking-stats${qsFull}`, { headers }),
        fetch(`${apiBase}/reports/revenue-by-branch${qsFull}`, { headers }),
      ]);
      const [reportData, branchesData, usersData, bookingsData, trendsData, statsData, branchRevData] = await Promise.all([
        resReport.json().then(r => r?.data ?? r),
        resBranches.json().then(r => r?.data ?? r),
        resUsers.json().then(r => r?.data ?? r),
        resBookings.json().then(r => r?.data ?? r),
        resTrends.json().then(r => r?.data ?? r),
        resStats.json().then(r => r?.data ?? r),
        resBranchRev.json().then(r => r?.data ?? r),
      ]);
      setReport(reportData);
      setBranches(Array.isArray(branchesData) ? branchesData : []);
      setUsers(Array.isArray(usersData?.users) ? usersData.users : Array.isArray(usersData) ? usersData : []);
      setBookings(bookingsData?.bookings ?? (Array.isArray(bookingsData) ? bookingsData : []));
      setRevenueTrends(Array.isArray(trendsData) ? trendsData : []);
      setBookingStats(statsData?.stats ? { stats: statsData.stats, total: statsData.total } : { stats: [], total: 0 });
      setBranchRevenue(Array.isArray(branchRevData?.branchRevenue) ? branchRevData.branchRevenue : []);
    } catch (e) {
      console.error('Failed to load overview data', e);
    } finally {
      setLoading(false);
    }
  }, [buildQueryString]);

  useEffect(() => { load(); }, [load]);

  const token = getStoredToken();
  useSSE(token, 'slots_updated', load);
  useSSE(token, 'payment_new', load);

  function handleQuickFilter(key) {
    setTimeFilter(key);
    if (key === 'all') {
      setAppliedFilters(null);
      setCustomStart('');
      setCustomEnd('');
    } else {
      const range = getDateRange(key);
      setCustomStart(toLocalDateInput(range.startDate));
      setCustomEnd(toLocalDateInput(range.endDate));
      setAppliedFilters({
        ...(selectedBranches.length > 0 ? { branchIds: selectedBranches.join(',') } : {}),
        startDate: range.startDate,
        endDate: range.endDate,
      });
    }
  }

  function applyCustomRange() {
    const applied = {};
    if (selectedBranches.length > 0) applied.branchIds = selectedBranches.join(',');
    if (customStart) applied.startDate = new Date(customStart).toISOString();
    if (customEnd) applied.endDate = new Date(customEnd + 'T23:59:59').toISOString();
    setAppliedFilters(Object.keys(applied).length > 0 ? applied : null);
    setTimeFilter('');
  }

  function toggleBranch(id) {
    setSelectedBranches(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);
  }

  function clearFilters() {
    setAppliedFilters(null);
    setTimeFilter('all');
    setSelectedBranches([]);
    setCustomStart('');
    setCustomEnd('');
    setBranchOpen(false);
  }

  const isFiltering = appliedFilters !== null;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-72 animate-pulse rounded-xl bg-slate-100" />
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  const activeBranches = branches.filter(b => b.status === 'active').length;
  const customers = users.filter(u => u.role === 'customer');
  const revenue = report?.totalRevenue ?? 0;
  const totalBookings = report?.totalBookings ?? 0;
  const cashRevenue = report?.cashRevenue ?? 0;
  const transferRevenue = report?.transferRevenue ?? 0;
  const byPackage = report?.byPackage ?? [];
  const byCustomer = report?.byCustomer ?? [];
  const maxPkgRevenue = byPackage.length > 0 ? Math.max(...byPackage.map(p => p.totalRevenue)) : 1;

  // Compute trend from revenueTrends
  const trendData = revenueTrends;
  const trendRevenue = trendData.length >= 2
    ? ((trendData[trendData.length - 1].revenue - trendData[0].revenue) / (trendData[0].revenue || 1)) * 100
    : 0;
  const trendBookings = trendData.length >= 2
    ? ((trendData[trendData.length - 1].bookingsCount - trendData[0].bookingsCount) / (trendData[0].bookingsCount || 1)) * 100
    : 0;

  const statCards = [
    {
      labelKey: 'stat_revenue', value: fmtCurrency(revenue),
      icon: <CurrencyDollar size={20} weight="duotone" className="text-emerald-600" />,
      bg: 'bg-emerald-50', trend: trendRevenue, trendLabelKey: 'trend_vs_start',
    },
    {
      labelKey: 'stat_bookings', value: fmt(totalBookings),
      icon: <CalendarCheck size={20} weight="duotone" className="text-blue-600" />,
      bg: 'bg-blue-50', trend: trendBookings, trendLabelKey: 'trend_vs_start',
    },
    {
      labelKey: 'stat_branches', value: `${activeBranches}/${branches.length}`,
      icon: <Buildings size={20} weight="duotone" className="text-violet-600" />,
      bg: 'bg-violet-50',
    },
    {
      labelKey: 'stat_customers', value: fmt(customers.length),
      icon: <Users size={20} weight="duotone" className="text-amber-600" />,
      bg: 'bg-amber-50',
    },
  ];

  // Prepare pie data for booking stats
  const pieData = bookingStats.stats
    .filter(s => s._id)
    .map(s => ({
      name: STATUS_META[s._id] ? t(STATUS_META[s._id].labelKey) : s._id,
      value: s.count,
      color: STATUS_META[s._id]?.color || '#94a3b8',
    }));

  return (
    <div className="space-y-6">

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.labelKey} className="relative flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-xs overflow-hidden">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${s.bg}`}>
              {s.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500">{t(s.labelKey)}</p>
              {s.trend !== undefined && (
                <div className={cn('mt-1 flex items-center gap-0.5 text-[11px] font-medium', s.trend >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {s.trend >= 0 ? <ArrowUp size={10} weight="bold" /> : <ArrowDown size={10} weight="bold" />}
                  <span>{Math.abs(s.trend).toFixed(1)}%</span>
                  <span className="text-slate-400 ml-0.5">{t(s.trendLabelKey)}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Filter section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Funnel size={16} weight="duotone" className={cn('text-slate-400', isFiltering && 'text-emerald-500')} />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.overview.filters')}</span>
          {isFiltering && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">{t('admin.overview.filtering_active')}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {TIME_FILTERS.map(f => (
              <button key={f.key} onClick={() => handleQuickFilter(f.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  timeFilter === f.key
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}>
                {t(f.labelKey)}
              </button>
            ))}
          </div>
          <div className="relative">
            <button onClick={() => setBranchOpen(!branchOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors">
              <Buildings size={14} />
              {selectedBranches.length === 0 ? t('admin.overview.all_branches') : t('admin.overview.branches_selected', { count: selectedBranches.length })}
              <CaretDown size={12} weight="bold" />
            </button>
            {branchOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setBranchOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  {branches.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">{t('admin.overview.no_branches')}</p>
                  ) : branches.map(b => (
                    <label key={b._id}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                      <input type="checkbox" checked={selectedBranches.includes(b._id)} onChange={() => toggleBranch(b._id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-400" />
                      <span className="truncate">{b.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{t('admin.overview.date_from')}</span>
            <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); setTimeFilter(''); }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-colors" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{t('admin.overview.date_to')}</span>
            <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); setTimeFilter(''); }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-colors" />
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={applyCustomRange}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              {t('admin.overview.apply')}
            </button>
            {isFiltering && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                <X size={12} />
                {t('admin.overview.clear_filters')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 1: Revenue trend chart + Booking status pie */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Revenue trend line chart */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <TrendUp size={18} weight="duotone" className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">{t('admin.overview.chart_revenue_trend')}</h3>
          </div>
          {trendData.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">{t('admin.overview.no_data')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                  tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip content={<CustomTooltip currency />} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revenueGrad)" name={t('admin.overview.chart_tooltip_revenue')} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Booking status pie */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <CirclesFour size={18} weight="duotone" className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">{t('admin.overview.chart_booking_status')}</h3>
          </div>
          {pieData.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">{t('admin.overview.no_data')}</p>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap justify-center gap-3">
                {pieData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span>{entry.name}</span>
                    <span className="font-semibold text-slate-700">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Booking trend + Revenue by branch */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Booking trend bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <ChartLine size={18} weight="duotone" className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">{t('admin.overview.chart_booking_trend')}</h3>
          </div>
          {trendData.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">{t('admin.overview.no_data')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="bookingsCount" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('admin.overview.chart_tooltip_bookings')} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue by branch bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <Storefront size={18} weight="duotone" className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">{t('admin.overview.chart_revenue_by_branch')}</h3>
          </div>
          {branchRevenue.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">{t('admin.overview.no_data')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={branchRevenue} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                  tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <YAxis type="category" dataKey="branchName" tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} width={120} />
                <Tooltip content={<CustomTooltip currency />} />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} name={t('admin.overview.chart_tooltip_revenue')} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Revenue split + top packages */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <Money size={18} weight="duotone" className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">{t('admin.overview.chart_revenue_by_method')}</h3>
          </div>
          <div className="space-y-4">
            {[
              { labelKey: 'cash',  value: cashRevenue,     icon: <Money size={18} className="text-emerald-500" />, color: 'bg-emerald-500' },
              { labelKey: 'transfer', value: transferRevenue, icon: <CreditCard size={18} className="text-blue-500" />, color: 'bg-blue-500' },
            ].map((item) => {
              const pct = revenue > 0 ? (item.value / revenue) * 100 : 0;
              return (
                <div key={item.labelKey}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      {item.icon}
                      {t('admin.overview.' + item.labelKey)}
                    </span>
                    <span className="font-semibold text-slate-800">{fmtCurrency(item.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full transition-all duration-700 ${item.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <ChartLine size={18} weight="duotone" className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">{t('admin.overview.chart_top_packages')}</h3>
          </div>
          <div className="space-y-3">
            {byPackage.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">{t('admin.overview.no_data')}</p>
            ) : byPackage.slice(0, 5).map((p) => {
              const pct = (p.totalRevenue / maxPkgRevenue) * 100;
              return (
                <div key={p._id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-slate-700">{p.package?.name ?? t('admin.overview.unknown_package')}</span>
                    <span className="ml-2 shrink-0 font-semibold text-slate-800">{fmtCurrency(p.totalRevenue)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-violet-400 transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent bookings */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <CalendarCheck size={18} weight="duotone" className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">{t('admin.overview.chart_recent_bookings')}</h3>
        </div>
        {bookings.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">{t('admin.overview.no_bookings')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">{t('admin.overview.table_customer')}</th>
                  <th className="py-2 pr-4">{t('admin.overview.table_package')}</th>
                  <th className="py-2 pr-4">{t('admin.overview.table_branch')}</th>
                  <th className="py-2 pr-4">{t('admin.overview.table_time')}</th>
                  <th className="py-2 pr-4">{t('admin.overview.table_status')}</th>
                  <th className="py-2 text-right">{t('admin.overview.table_amount')}</th>
                  <th className="py-2 pl-3 text-right">{t('admin.overview.table_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bookings.map((b) => {
                  const sm = STATUS_META[b.status] || STATUS_META.pending;
                  const sourceCode = b.bookingCode || `AWP-${String(b._id).slice(-8).toUpperCase()}`;
                  return (
                    <tr key={b._id} className="hover:bg-slate-50/50">
                      <td className="py-3 pr-4">
                        <span className="font-medium text-slate-700">{b.userId?.name ?? '—'}</span>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5">{sourceCode}</p>
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{b.packageId?.name ?? t('admin.overview.unknown_package')}</td>
                      <td className="py-3 pr-4 text-slate-600">{b.branchId?.name ?? '—'}</td>
                      <td className="py-3 pr-4 text-slate-600">{fmtDate(b.bookingDate)}</td>
                      <td className="py-3 pr-4">
                        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', sm.bg, sm.text)}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', sm.dot)} />
                          {t(sm.labelKey)}
                        </span>
                      </td>
                      <td className="py-3 text-right font-medium text-slate-700">
                        {b.finalPrice ? fmtCurrency(b.finalPrice) : '—'}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        <button onClick={() => goToBooking(b)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors">
                          {t('admin.overview.view_more')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top customers */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center gap-2">
          <Users size={18} weight="duotone" className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">{t('admin.overview.chart_top_customers')}</h3>
        </div>
        {byCustomer.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">{t('admin.overview.no_data')}</p>
        ) : (
          <div className="space-y-2">
            {byCustomer.slice(0, 6).map((c) => (
              <div key={c._id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                  {(c.user?.name ?? '?')[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{c.user?.name ?? t('admin.overview.anonymous')}</p>
                  <p className="truncate text-xs text-slate-400">{t('admin.overview.bookings_count', { count: c.bookingsCount })} · {fmtCurrency(c.totalRevenue)}</p>
                </div>
                <TierBadge tier={c.user?.tier || 'bronze'} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}