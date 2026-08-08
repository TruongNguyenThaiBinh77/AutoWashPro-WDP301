import { useCallback, useEffect, useState } from 'react';
import {
  Gift, Coins, Star, Ticket, Tag, CheckCircle, CaretRight, ArrowUp, ArrowDown,
  Eye, Lightbulb, Medal, Info, Warning, MagnifyingGlass, Funnel, Calendar,
  ArrowClockwise, Copy, Check, Clock, Sparkle, X
} from '@phosphor-icons/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TierBadge from '@/components/ui/TierBadge';
import CustomerPagination from '@/components/ui/CustomerPagination';
import { confirmDialog } from '@/lib/confirm';
import { showToast } from '@/lib/toast';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import useSSE from '@/hooks/useSSE';

const apiBase = getApiBaseUrl();

function api(path, opts = {}) {
  return fetch(`${apiBase}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}`, ...opts.headers },
  });
}

function formatCurrency(val) {
  if (!val && val !== 0) return '0';
  return Number(val).toLocaleString('vi-VN');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('vi-VN');
}

function getTypeBadge(type) {
  switch (type) {
    case 'earned': return { label: 'Tích điểm', color: 'bg-emerald-100 text-emerald-700' };
    case 'redeemed': return { label: 'Đổi quà', color: 'bg-amber-100 text-amber-700' };
    case 'expired': return { label: 'Hết hạn', color: 'bg-rose-100 text-rose-700' };
    case 'adjustment': return { label: 'Điều chỉnh', color: 'bg-purple-100 text-purple-700' };
    default: return { label: type, color: 'bg-slate-100 text-slate-700' };
  }
}

function PointHistoryTable({ items, loading, page, pagination, setPage, navigate, emptyMsg, activeTab }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-medium">Đang tải lịch sử điểm...</p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
        <Coins size={36} className="mx-auto text-slate-300 mb-2" weight="duotone" />
        <p className="text-sm font-semibold text-slate-600">{emptyMsg || 'Chưa có dữ liệu giao dịch'}</p>
        <p className="text-xs text-slate-400 mt-1">Thử xóa bộ lọc để xem tất cả bản ghi</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
            <tr>
              <th className="px-5 py-3.5 text-left">Thời gian</th>
              <th className="px-4 py-3.5 text-left">Loại</th>
              <th className="px-4 py-3.5 text-left">Mô tả giao dịch</th>
              <th className="px-4 py-3.5 text-right">Điểm biến động</th>
              <th className="px-5 py-3.5 text-right">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(item => {
              const badge = getTypeBadge(item.type);
              const isPositive = item.type === 'earned' || (item.type === 'adjustment' && item.points > 0);
              return (
                <tr key={item._id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge.color}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-700 max-w-sm">
                    <p className="line-clamp-2 font-medium">{item.description}</p>
                    {item.snapshot?.bookingCode && (
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5 inline-block">
                        Đơn: #{item.snapshot.bookingCode}
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3.5 text-right text-sm font-black whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <span className="inline-flex items-center justify-end gap-1">
                      {isPositive ? <ArrowUp size={14} weight="bold" /> : <ArrowDown size={14} weight="bold" />}
                      {isPositive ? '+' : ''}{Math.abs(item.points)?.toLocaleString('vi-VN')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => navigate(`/rewards/history/${item._id}?tab=${activeTab}`)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-all cursor-pointer shadow-2xs"
                    >
                      <Eye size={14} weight="bold" /> Xem
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CustomerPagination pagination={pagination} page={page} setPage={setPage} itemName="giao dịch" />
    </div>
  );
}

export default function CustomerRewardsPage({ user, refreshUser }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Normalize initial active tab
  const rawTab = searchParams.get('tab') || 'reward';
  const initialTab = rawTab === 'history' ? 'reward' : rawTab === 'my-gifts' ? 'my-rewards' : rawTab;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Common pagination state
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filter States for Point History & Lifetime
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState('all');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [historySort, setHistorySort] = useState('newest');

  // Filter States for My Rewards (Gifts)
  const [giftSearch, setGiftSearch] = useState('');
  const [giftStatus, setGiftStatus] = useState('all');
  const [giftStartDate, setGiftStartDate] = useState('');
  const [giftEndDate, setGiftEndDate] = useState('');
  const [giftSort, setGiftSort] = useState('newest');

  // Filter States for My Vouchers
  const [voucherSearch, setVoucherSearch] = useState('');
  const [voucherStatus, setVoucherStatus] = useState('all');
  const [voucherSort, setVoucherSort] = useState('newest');

  // Filter States for Exchange Vouchers
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeTier, setExchangeTier] = useState('all');
  const [exchangePointsRange, setExchangePointsRange] = useState('all');

  // Data States
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState({ totalEarned: 0, totalRedeemed: 0 });
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 });

  const [vouchers, setVouchers] = useState([]);
  const [myVouchers, setMyVouchers] = useState([]);
  const [myVouchersPagination, setMyVouchersPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 });

  const [myRewards, setMyRewards] = useState([]);
  const [myRewardsPagination, setMyRewardsPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: 10 });

  const [redeemLoading, setRedeemLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const [tierConfig, setTierConfig] = useState(null);
  const [tierList, setTierList] = useState([]);
  const [loyaltyConfig, setLoyaltyConfig] = useState(null);

  // Copy code helper with feedback
  const handleCopyCode = (code, label = 'mã') => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`Đã sao chép ${label}: ${code}`, 'success');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Load Tier Config
  useEffect(() => {
    api('/loyalty/tiers').then(r => r.json()).then(payload => {
      if (Array.isArray(payload?.data)) {
        setTierList(payload.data);
        const map = {};
        payload.data.forEach(t => {
          map[t.id] = { label: t.name, color: t.color || '#b45309', minPoints: t.minPoints, ...t };
        });
        setTierConfig(map);
      }
    }).catch(() => {});

    api('/loyalty/config').then(r => r.json()).then(payload => {
      if (payload?.data) setLoyaltyConfig(payload.data);
    }).catch(() => {});
  }, []);

  // Fetch Point History (Tab: reward / lifetime)
  const fetchHistory = useCallback(async (targetPage = page, targetTab = activeTab) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: targetPage,
        limit: 10,
        sort: historySort,
      });

      if (targetTab === 'lifetime') {
        params.set('type', 'lifetime');
      } else if (historyType && historyType !== 'all') {
        params.set('type', historyType);
      }

      if (historySearch.trim()) params.set('search', historySearch.trim());
      if (historyStartDate) params.set('startDate', historyStartDate);
      if (historyEndDate) params.set('endDate', historyEndDate);

      const res = await api(`/loyalty/my-history?${params.toString()}`);
      const data = await res.json();
      const rawHistory = data?.data?.data || data?.data || [];
      const historyArray = Array.isArray(rawHistory) ? rawHistory : [];
      setHistory(historyArray);
      if (data?.pagination || data?.data?.pagination) {
        setPagination(data.pagination || data.data.pagination);
      }
      const summaryData = data?.pagination?.summary || data?.meta?.summary || data?.summary;
      if (summaryData) {
        setSummary(summaryData);
      }
    } catch (e) {
      console.error('Failed to fetch point history', e);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [page, activeTab, historyType, historySearch, historyStartDate, historyEndDate, historySort]);

  // Fetch Available Vouchers for Exchange
  const fetchExchangeVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const resTpl = await api('/vouchers/available');
      const dataTpl = await resTpl.json();
      const tplPayload = dataTpl?.data?.data || dataTpl?.data || dataTpl || [];
      const tplArray = Array.isArray(tplPayload)
        ? tplPayload
        : (Array.isArray(tplPayload?.redeemable) ? tplPayload.redeemable : []);
      setVouchers(tplArray.filter(v => v && v.isTemplate && v.requiredPoints > 0));
    } catch (e) {
      console.error('Failed to fetch exchange vouchers', e);
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch My Redeemed Rewards (Physical Gifts)
  const fetchMyRewards = useCallback(async (targetPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: targetPage,
        limit: 10,
        sort: giftSort,
      });
      if (giftStatus && giftStatus !== 'all') params.set('status', giftStatus);
      if (giftSearch.trim()) params.set('search', giftSearch.trim());
      if (giftStartDate) params.set('startDate', giftStartDate);
      if (giftEndDate) params.set('endDate', giftEndDate);

      const resRewards = await api(`/rewards/me?${params.toString()}`);
      const dataRewards = await resRewards.json();
      const rawRewards = dataRewards?.data?.data || dataRewards?.data || [];
      const rewardsArray = Array.isArray(rawRewards) ? rawRewards : [];
      setMyRewards(rewardsArray);
      if (dataRewards?.pagination || dataRewards?.data?.pagination) {
        setMyRewardsPagination(dataRewards.pagination || dataRewards.data.pagination);
      }
    } catch (e) {
      console.error('Failed to fetch my rewards', e);
      setMyRewards([]);
    } finally {
      setLoading(false);
    }
  }, [page, giftStatus, giftSearch, giftStartDate, giftEndDate, giftSort]);

  // Fetch My Vouchers
  const fetchMyVouchers = useCallback(async (targetPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: targetPage,
        limit: 10,
        sort: voucherSort,
      });
      if (voucherStatus && voucherStatus !== 'all') params.set('status', voucherStatus);
      if (voucherSearch.trim()) params.set('search', voucherSearch.trim());

      const resMy = await api(`/vouchers/me?${params.toString()}`);
      const dataMy = await resMy.json();
      const rawVouchers = dataMy?.data?.data || dataMy?.data || [];
      const voucherData = Array.isArray(rawVouchers) ? rawVouchers : [];
      setMyVouchers(voucherData);
      if (dataMy?.pagination || dataMy?.data?.pagination) {
        setMyVouchersPagination(dataMy.pagination || dataMy.data.pagination);
      }
    } catch (e) {
      console.error('Failed to fetch my vouchers', e);
      setMyVouchers([]);
    } finally {
      setLoading(false);
    }
  }, [page, voucherStatus, voucherSearch, voucherSort]);

  // Main data loader based on active tab
  useEffect(() => {
    if (refreshUser) refreshUser();

    if (activeTab === 'reward' || activeTab === 'lifetime') {
      fetchHistory(page, activeTab);
    } else if (activeTab === 'exchange') {
      fetchExchangeVouchers();
    } else if (activeTab === 'my-rewards') {
      fetchMyRewards(page);
    } else if (activeTab === 'my-vouchers') {
      fetchMyVouchers(page);
    }
  }, [activeTab, page, fetchHistory, fetchExchangeVouchers, fetchMyRewards, fetchMyVouchers]);

  // Real-time SSE listeners
  const sseToken = getStoredToken();
  useSSE(sseToken, 'my_rewards_updated', () => {
    if (activeTab === 'my-rewards') fetchMyRewards(page);
    if (activeTab === 'my-vouchers') fetchMyVouchers(page);
    if (activeTab === 'reward' || activeTab === 'lifetime') fetchHistory(page, activeTab);
    if (refreshUser) refreshUser();
  });
  useSSE(sseToken, 'rewards_updated', () => {
    if (activeTab === 'exchange') fetchExchangeVouchers();
    if (activeTab === 'my-rewards') fetchMyRewards(page);
  });
  useSSE(sseToken, 'vouchers_updated', () => {
    if (activeTab === 'exchange') fetchExchangeVouchers();
    if (activeTab === 'my-vouchers') fetchMyVouchers(page);
  });

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setPage(1);
    setSearchParams({ tab: newTab }, { replace: true });
  };

  // Redeem voucher handler
  const handleRedeem = async (templateId) => {
    if (!(await confirmDialog({
      title: 'Đổi điểm lấy mã giảm giá',
      message: 'Bạn có chắc chắn muốn đổi điểm để nhận voucher ưu đãi này?',
      confirmLabel: 'Đổi điểm ngay',
    }))) return;

    setRedeemLoading(true);
    try {
      const res = await api('/vouchers/redeem-points', {
        method: 'POST',
        body: JSON.stringify({ templateId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || 'Lỗi đổi điểm');
      showToast('Đổi điểm lấy voucher thành công! Kiểm tra ở tab "Voucher của tôi".', 'success');
      if (refreshUser) refreshUser();
      fetchExchangeVouchers();
      fetchMyVouchers(1);
    } catch (err) {
      showToast(err.message || 'Lỗi đổi điểm', 'error');
    } finally {
      setRedeemLoading(false);
    }
  };

  // Dynamic next tier calculation sorted by minPoints from API
  const sortedTiers = tierList.length > 0 ? [...tierList].sort((a, b) => (a.minPoints || 0) - (b.minPoints || 0)) : [];
  const currentTierId = (user?.tier || 'bronze').toLowerCase();
  const currentTierIndex = sortedTiers.findIndex(t => (t.id || '').toLowerCase() === currentTierId);
  const currentTierObj = currentTierIndex >= 0 ? sortedTiers[currentTierIndex] : null;
  const nextTierObj = (currentTierIndex >= 0 && currentTierIndex < sortedTiers.length - 1) ? sortedTiers[currentTierIndex + 1] : null;

  const currentMin = currentTierObj?.minPoints || 0;
  const nextMin = nextTierObj?.minPoints || currentMin;
  const progress = nextTierObj
    ? Math.min(100, Math.max(0, (((user?.lifetimePoints || 0) - currentMin) / (nextMin - currentMin)) * 100))
    : 100;

  // Filter exchange vouchers locally for instant response
  const filteredExchangeVouchers = vouchers.filter(v => {
    if (exchangeSearch.trim()) {
      const term = exchangeSearch.trim().toLowerCase();
      const matchName = v.name?.toLowerCase().includes(term);
      const matchCode = v.code?.toLowerCase().includes(term);
      const matchDesc = v.description?.toLowerCase().includes(term);
      if (!matchName && !matchCode && !matchDesc) return false;
    }
    if (exchangeTier !== 'all') {
      if (!v.applicableTiers || !v.applicableTiers.map(t => t.toLowerCase()).includes(exchangeTier.toLowerCase())) {
        return false;
      }
    }
    if (exchangePointsRange === 'under_100k' && v.requiredPoints >= 100000) return false;
    if (exchangePointsRange === '100k_500k' && (v.requiredPoints < 100000 || v.requiredPoints > 500000)) return false;
    if (exchangePointsRange === 'above_500k' && v.requiredPoints <= 500000) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Tier Overview Card */}
      <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/40 to-teal-50/60 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <TierBadge tier={user?.tier} />
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Điểm thưởng khả dụng</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className="text-3xl font-black text-slate-800 tracking-tight">{formatCurrency(user?.loyaltyPoints || 0)}</p>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full">Điểm</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Điểm tích lũy trọn đời</p>
            <p className="text-2xl font-black text-emerald-700 mt-0.5">{formatCurrency(user?.lifetimePoints || 0)}</p>
          </div>
        </div>

        {/* Progress bar to next tier */}
        <div className="mt-4 pt-4 border-t border-emerald-100/60">
          <div className="h-2.5 bg-slate-200/80 rounded-full overflow-hidden p-0.5 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700 shadow-sm"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              Hạng hiện tại: <strong className="text-slate-800">{currentTierObj?.name || user?.tier || 'Đồng'}</strong>
            </span>
            {nextTierObj ? (
              <span className="text-emerald-700 font-bold">
                Còn {formatCurrency((nextTierObj.minPoints || 0) - (user?.lifetimePoints || 0))} điểm để lên hạng {nextTierObj.name || nextTierObj.id}
              </span>
            ) : (
              <span className="text-emerald-600 font-bold">🏆 Bạn đã đạt hạng cao nhất!</span>
            )}
          </div>
        </div>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'reward', label: 'Điểm thưởng', icon: <Coins weight="fill" size={16} /> },
          { id: 'lifetime', label: 'Điểm tích lũy', icon: <Star weight="fill" size={16} /> },
          { id: 'exchange', label: 'Đổi điểm lấy quà', icon: <Gift weight="fill" size={16} /> },
          { id: 'my-rewards', label: 'Quà tặng của tôi', icon: <Medal weight="fill" size={16} /> },
          { id: 'my-vouchers', label: 'Voucher của tôi', icon: <Ticket weight="fill" size={16} /> },
          { id: 'rules', label: 'Cách tính điểm', icon: <Lightbulb weight="fill" size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-2 pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'border-emerald-600 text-emerald-600 shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ĐIỂM THƯỞNG (REWARD)                                                */}
      {/* ========================================================================= */}
      {activeTab === 'reward' && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-emerald-50/70 border border-emerald-100 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500">Tổng điểm đã tích lũy</p>
                <p className="text-2xl font-black text-emerald-700 mt-0.5">+{formatCurrency(summary.totalEarned)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <ArrowUp size={20} weight="bold" />
              </div>
            </div>
            <div className="rounded-2xl bg-amber-50/70 border border-amber-100 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500">Tổng điểm đã tiêu / đổi quà</p>
                <p className="text-2xl font-black text-amber-700 mt-0.5">
                  {summary.totalRedeemed > 0 ? '-' : ''}{formatCurrency(summary.totalRedeemed)}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <ArrowDown size={20} weight="bold" />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => { setHistorySearch(e.target.value); setPage(1); }}
                  placeholder="Tìm mô tả, mã đơn..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Type Filter */}
              <div className="relative">
                <select
                  value={historyType}
                  onChange={(e) => { setHistoryType(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
                >
                  <option value="all">Tất cả loại giao dịch</option>
                  <option value="earned">⭐ Tích điểm (+)</option>
                  <option value="redeemed">🎁 Đổi quà (-)</option>
                  <option value="expired">⏰ Hết hạn (-)</option>
                  <option value="adjustment">⚙️ Điều chỉnh</option>
                </select>
              </div>

              {/* Date From */}
              <div className="relative">
                <input
                  type="date"
                  value={historyStartDate}
                  onChange={(e) => { setHistoryStartDate(e.target.value); setPage(1); }}
                  title="Từ ngày"
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
                />
              </div>

              {/* Date To */}
              <div className="relative">
                <input
                  type="date"
                  value={historyEndDate}
                  onChange={(e) => { setHistoryEndDate(e.target.value); setPage(1); }}
                  title="Đến ngày"
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
                />
              </div>
            </div>

            {/* Quick Actions & Sort */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">Sắp xếp:</span>
                <select
                  value={historySort}
                  onChange={(e) => { setHistorySort(e.target.value); setPage(1); }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none"
                >
                  <option value="newest">Mới nhất trước</option>
                  <option value="oldest">Cũ nhất trước</option>
                  <option value="points_desc">Điểm cao nhất</option>
                  <option value="points_asc">Điểm thấp nhất</option>
                </select>
              </div>

              {(historySearch || historyType !== 'all' || historyStartDate || historyEndDate || historySort !== 'newest') && (
                <button
                  onClick={() => {
                    setHistorySearch('');
                    setHistoryType('all');
                    setHistoryStartDate('');
                    setHistoryEndDate('');
                    setHistorySort('newest');
                    setPage(1);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  <X size={12} weight="bold" /> Xóa bộ lọc
                </button>
              )}
            </div>
          </div>

          <PointHistoryTable
            items={history}
            loading={loading}
            page={page}
            pagination={pagination}
            setPage={setPage}
            navigate={navigate}
            emptyMsg="Không tìm thấy lịch sử điểm nào phù hợp với bộ lọc."
            activeTab={activeTab}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ĐIỂM TÍCH LŨY (LIFETIME)                                            */}
      {/* ========================================================================= */}
      {activeTab === 'lifetime' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-blue-50/70 border border-blue-100 p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">Tổng điểm tích lũy trọn đời (Dùng để xét hạng)</p>
              <p className="text-2xl font-black text-blue-700 mt-0.5">{formatCurrency(user?.lifetimePoints || 0)} điểm</p>
              <p className="text-[11px] text-slate-400 mt-1">Điểm này chỉ cộng dồn khi hoàn tất dịch vụ và không bị trừ khi đổi quà.</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Medal size={28} weight="duotone" />
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => { setHistorySearch(e.target.value); setPage(1); }}
                  placeholder="Tìm mô tả tích lũy..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <input
                type="date"
                value={historyStartDate}
                onChange={(e) => { setHistoryStartDate(e.target.value); setPage(1); }}
                title="Từ ngày"
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              />
              <input
                type="date"
                value={historyEndDate}
                onChange={(e) => { setHistoryEndDate(e.target.value); setPage(1); }}
                title="Đến ngày"
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              />
            </div>
          </div>

          <PointHistoryTable
            items={history}
            loading={loading}
            page={page}
            pagination={pagination}
            setPage={setPage}
            navigate={navigate}
            emptyMsg="Chưa có lịch sử điểm tích lũy nào."
            activeTab={activeTab}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ĐỔI ĐIỂM LẤY QUÀ (EXCHANGE VOUCHERS)                                */}
      {/* ========================================================================= */}
      {activeTab === 'exchange' && (
        <div className="space-y-4">
          {/* Exchange Filter Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={exchangeSearch}
                  onChange={(e) => setExchangeSearch(e.target.value)}
                  placeholder="Tìm voucher theo tên, mã..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <select
                value={exchangeTier}
                onChange={(e) => setExchangeTier(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              >
                <option value="all">Tất cả hạng áp dụng</option>
                <option value="diamond">Hạng Kim Cương</option>
                <option value="gold">Hạng Vàng</option>
                <option value="silver">Hạng Bạc</option>
                <option value="bronze">Hạng Đồng</option>
              </select>

              <select
                value={exchangePointsRange}
                onChange={(e) => setExchangePointsRange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              >
                <option value="all">Tất cả mức điểm</option>
                <option value="under_100k">Dưới 100.000 điểm</option>
                <option value="100k_500k">100.000 - 500.000 điểm</option>
                <option value="above_500k">Trên 500.000 điểm</option>
              </select>
            </div>
          </div>

          {filteredExchangeVouchers.length === 0 ? (
            <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <Gift size={40} className="mx-auto text-slate-300 mb-2" weight="duotone" />
              <p className="text-sm font-semibold text-slate-600">Không có voucher nào khả dụng để đổi điểm</p>
              <p className="text-xs text-slate-400 mt-1">Hãy quay lại sau khi hệ thống cập nhật thêm quà tặng mới nhé</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredExchangeVouchers.map(v => {
                const userPoints = user?.loyaltyPoints || 0;
                const canAfford = userPoints >= v.requiredPoints;
                const hasStock = v.remaining > 0;

                return (
                  <div
                    key={v._id}
                    className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="font-bold text-slate-800 text-sm leading-snug">{v.name}</p>
                          <span className="inline-block font-mono text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md mt-1 border border-emerald-100">
                            {v.code}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 border border-emerald-200 shrink-0">
                          <Coins weight="fill" size={14} /> {formatCurrency(v.requiredPoints)}
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 mb-4 line-clamp-2 leading-relaxed">{v.description}</p>

                      <div className="space-y-1.5 text-[11px] text-slate-500 mb-4 bg-slate-50 p-2.5 rounded-xl">
                        {v.applicableTiers?.length > 0 && (
                          <div className="flex items-center gap-1 text-amber-700 font-semibold">
                            <Star size={12} weight="fill" className="text-amber-500" />
                            <span>Dành cho: {v.applicableTiers.join(', ')}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Số lượng còn lại:</span>
                          <strong className="text-slate-700 font-bold">{v.remaining} lượt</strong>
                        </div>
                        {v.endDate && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Hạn đổi:</span>
                            <span className="text-slate-600">{formatDate(v.endDate)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRedeem(v._id)}
                      disabled={redeemLoading || !canAfford || !hasStock}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        !canAfford
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                          : !hasStock
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 active:scale-[0.98]'
                      }`}
                    >
                      {!hasStock ? 'Hết lượt đổi' : !canAfford ? 'Chưa đủ điểm thưởng' : redeemLoading ? 'Đang xử lý...' : 'Đổi ngay'}
                      {canAfford && hasStock && <CaretRight weight="bold" size={14} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: QUÀ TẶNG CỦA TÔI (MY REWARDS / PHYSICAL GIFTS)                      */}
      {/* ========================================================================= */}
      {activeTab === 'my-rewards' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={giftSearch}
                  onChange={(e) => { setGiftSearch(e.target.value); setPage(1); }}
                  placeholder="Tìm mã đổi, tên quà..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Status Filter */}
              <select
                value={giftStatus}
                onChange={(e) => { setGiftStatus(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">🕒 Chờ nhận quà</option>
                <option value="sent">🚚 Đã gửi · Đang vận chuyển</option>
                <option value="received">✅ Đã nhận quà</option>
                <option value="cancelled">❌ Đã hủy</option>
              </select>

              {/* Date From */}
              <input
                type="date"
                value={giftStartDate}
                onChange={(e) => { setGiftStartDate(e.target.value); setPage(1); }}
                title="Từ ngày đổi"
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              />

              {/* Date To */}
              <input
                type="date"
                value={giftEndDate}
                onChange={(e) => { setGiftEndDate(e.target.value); setPage(1); }}
                title="Đến ngày đổi"
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              />
            </div>

            {/* Quick Actions & Sort */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">Sắp xếp:</span>
                <select
                  value={giftSort}
                  onChange={(e) => { setGiftSort(e.target.value); setPage(1); }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none"
                >
                  <option value="newest">Mới đổi nhất</option>
                  <option value="oldest">Cũ nhất trước</option>
                  <option value="points_desc">Điểm đổi cao nhất</option>
                  <option value="points_asc">Điểm đổi thấp nhất</option>
                </select>
              </div>

              {(giftSearch || giftStatus !== 'all' || giftStartDate || giftEndDate || giftSort !== 'newest') && (
                <button
                  onClick={() => {
                    setGiftSearch('');
                    setGiftStatus('all');
                    setGiftStartDate('');
                    setGiftEndDate('');
                    setGiftSort('newest');
                    setPage(1);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  <X size={12} weight="bold" /> Xóa bộ lọc
                </button>
              )}
            </div>
          </div>

          {/* Cards Grid */}
          {!Array.isArray(myRewards) || myRewards.length === 0 ? (
            <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <Medal size={40} className="mx-auto text-slate-300 mb-2" weight="duotone" />
              <p className="text-sm font-semibold text-slate-600">Chưa có phần thưởng nào phù hợp với bộ lọc</p>
              <p className="text-xs text-slate-400 mt-1">Đổi quà tại tab "Đổi điểm lấy quà" để nhận những phần thưởng hấp dẫn</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Array.isArray(myRewards) ? myRewards : []).map(rd => {
                const snap = rd?.rewardSnapshot || {};
                const cancelled = rd?.status === 'cancelled';
                const received = rd?.status === 'received';
                const sent = rd?.status === 'sent';

                return (
                  <div
                    key={rd._id}
                    className={`rounded-2xl border bg-white p-5 shadow-sm transition-all flex flex-col justify-between ${
                      cancelled
                        ? 'border-red-100 bg-red-50/20'
                        : received
                        ? 'border-emerald-100 hover:border-emerald-300'
                        : 'border-amber-100 hover:border-amber-300'
                    }`}
                  >
                    <div>
                      {/* Header image & title */}
                      <div className="flex items-center gap-3.5 mb-3.5">
                        {snap.imageUrl ? (
                          <img
                            src={snap.imageUrl}
                            alt={snap.name}
                            className="w-14 h-14 rounded-2xl object-cover border border-slate-100 shrink-0 shadow-2xs"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 flex items-center justify-center text-2xl shrink-0 shadow-2xs">
                            🎁
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 text-sm line-clamp-2 leading-snug">{snap.name}</p>
                          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                            <Clock size={12} /> Đổi ngày {formatDate(rd.createdAt)}
                          </p>
                        </div>
                      </div>

                      {/* Code Badge */}
                      <div className={`rounded-xl px-3.5 py-2 border flex items-center justify-between mb-3 ${
                        cancelled ? 'bg-slate-50 border-slate-200' : 'bg-emerald-50/70 border-emerald-100'
                      }`}>
                        <span className="text-[11px] font-semibold text-slate-500">Mã đổi thưởng</span>
                        <span className={`font-mono font-black tracking-wider text-xs ${
                          cancelled ? 'text-slate-400 line-through' : 'text-emerald-700'
                        }`}>
                          {rd.code}
                        </span>
                      </div>

                      {/* Cancelled Alert Box */}
                      {cancelled && (
                        <div className="mb-3 bg-red-50 p-2.5 rounded-xl border border-red-100 text-xs text-red-700">
                          <p className="font-bold">Lý do hủy:</p>
                          <p className="mt-0.5">{rd.cancelReason || 'Quản lý hoặc hệ thống đã hủy đơn đổi quà này.'}</p>
                        </div>
                      )}

                      {/* Points & Status Row */}
                      <div className="flex items-center justify-between text-xs mb-3 pt-1">
                        <span className="flex items-center gap-1 font-bold text-slate-600">
                          <Coins weight="fill" size={14} className="text-amber-500" />
                          {formatCurrency(rd.pointsSpent)} điểm
                        </span>
                        {cancelled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            Đã hủy
                          </span>
                        ) : received ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            <CheckCircle weight="fill" size={12} /> Đã nhận quà
                          </span>
                        ) : sent ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            Đang vận chuyển
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Chờ nhận quà
                          </span>
                        )}
                      </div>

                      {received && (rd.receivedAt || rd.updatedAt) && (
                        <p className="text-[10px] text-emerald-600 font-semibold mb-3">
                          ✓ Đã nhận lúc: {formatDateTime(rd.receivedAt || rd.updatedAt)}
                        </p>
                      )}
                    </div>

                    {/* Action Button */}
                    {!cancelled && (
                      <button
                        onClick={() => handleCopyCode(rd.code, 'mã đổi quà')}
                        className="w-full py-2 rounded-xl text-xs font-bold border bg-amber-50/70 text-amber-800 hover:bg-amber-100 border-amber-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        {copiedCode === rd.code ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                        {copiedCode === rd.code ? 'Đã sao chép!' : 'Sao chép mã đổi quà'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <CustomerPagination
            pagination={myRewardsPagination}
            page={page}
            setPage={setPage}
            itemName="quà tặng"
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: VOUCHER CỦA TÔI (MY VOUCHERS)                                       */}
      {/* ========================================================================= */}
      {activeTab === 'my-vouchers' && (
        <div className="space-y-4">
          {/* Voucher Filter Bar */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={voucherSearch}
                  onChange={(e) => { setVoucherSearch(e.target.value); setPage(1); }}
                  placeholder="Tìm mã voucher, tên voucher..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <select
                value={voucherStatus}
                onChange={(e) => { setVoucherStatus(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">🟢 Khả dụng (Còn hạn)</option>
                <option value="used">⚪ Đã sử dụng</option>
                <option value="expired">🔴 Đã hết hạn</option>
              </select>

              <select
                value={voucherSort}
                onChange={(e) => { setVoucherSort(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              >
                <option value="newest">Mới nhất</option>
                <option value="expiring_soon">Sắp hết hạn nhất</option>
                <option value="discount_desc">Giảm giá nhiều nhất</option>
              </select>
            </div>
          </div>

          {/* Vouchers Grid */}
          {!Array.isArray(myVouchers) || myVouchers.length === 0 ? (
            <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <Ticket size={40} className="mx-auto text-slate-300 mb-2" weight="duotone" />
              <p className="text-sm font-semibold text-slate-600">Bạn chưa có voucher nào trong kho</p>
              <p className="text-xs text-slate-400 mt-1">Đổi điểm thưởng lấy voucher tại tab "Đổi điểm lấy quà"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(Array.isArray(myVouchers) ? myVouchers : []).map(uv => {
                const v = uv?.voucherId || uv;
                if (!v) return null;

                const isExpired = v.endDate && new Date(v.endDate) < new Date();
                const isUsed = v.remaining <= 0 || v.status === 'used';

                return (
                  <div
                    key={uv._id}
                    className={`rounded-2xl border bg-white p-5 shadow-sm transition-all flex flex-col justify-between ${
                      isExpired || isUsed
                        ? 'border-slate-200 bg-slate-50/50 opacity-70'
                        : 'border-emerald-100 hover:border-emerald-300 hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="font-bold text-slate-800 text-sm leading-snug">{v.name}</p>
                          <p className="text-xs font-mono font-black text-emerald-600 mt-1 bg-emerald-50 px-2 py-0.5 rounded-md inline-block border border-emerald-100">
                            {v.code}
                          </p>
                        </div>
                        {isUsed ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 shrink-0">
                            Đã dùng
                          </span>
                        ) : isExpired ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 shrink-0">
                            Hết hạn
                          </span>
                        ) : (
                          <CheckCircle weight="fill" size={22} className="text-emerald-500 shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-slate-500 mb-4 line-clamp-2 leading-relaxed">{v.description}</p>

                      <div className="space-y-1 text-[11px] text-slate-500 mb-4 bg-slate-50 p-2.5 rounded-xl">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Giảm giá:</span>
                          <strong className="text-emerald-700 font-bold">
                            {v.discountType === 'percentage' ? `Giảm ${v.discountValue}%` : `Giảm ${formatCurrency(v.discountValue)}đ`}
                          </strong>
                        </div>
                        {v.minOrderValue > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Đơn tối thiểu:</span>
                            <span className="text-slate-700 font-medium">{formatCurrency(v.minOrderValue)}đ</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Hạn dùng (HSD):</span>
                          <span className={isExpired ? 'text-rose-600 font-bold' : 'text-slate-700 font-medium'}>
                            {v.endDate ? formatDate(v.endDate) : 'Vô thời hạn'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopyCode(v.code, 'mã voucher')}
                      disabled={isExpired || isUsed}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${
                        isExpired || isUsed
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      {copiedCode === v.code ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                      {copiedCode === v.code ? 'Đã sao chép!' : 'Sao chép mã voucher'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <CustomerPagination
            pagination={myVouchersPagination}
            page={page}
            setPage={setPage}
            itemName="voucher"
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: CÁCH TÍNH ĐIỂM & QUY ĐỊNH (RULES)                                   */}
      {/* ========================================================================= */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 p-6 shadow-sm">
            <h3 className="text-base font-extrabold text-slate-800 mb-1 flex items-center gap-2">
              <Lightbulb weight="fill" className="text-emerald-600" /> Cách tính điểm thưởng
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Mỗi khi đơn hàng được thanh toán thành công, bạn sẽ được cộng điểm thưởng theo công thức:
            </p>
            <div className="bg-white rounded-2xl border border-emerald-200 p-4 font-mono text-xs sm:text-sm text-slate-700 text-center shadow-2xs">
              Điểm thưởng = (Số tiền đơn hàng đã thanh toán ×{' '}
              <span className="font-black text-emerald-600">Tỷ lệ cơ bản {loyaltyConfig?.baseEarningRate ?? 5}%</span>) ×{' '}
              <span className="font-black text-emerald-600">Hệ số nhân hạng</span>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Medal weight="fill" className="text-amber-500" /> Hạng thành viên & Hệ số nhân điểm
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Tích lũy đủ điểm trọn đời sẽ tự động thăng hạng và gia tăng quyền lợi</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5 text-left">Hạng</th>
                    <th className="px-6 py-3.5 text-left">Điểm tích lũy tối thiểu</th>
                    <th className="px-6 py-3.5 text-left">Hệ số nhân</th>
                    <th className="px-6 py-3.5 text-left">Quyền lợi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedTiers.map(t => (
                    <tr key={t.id} className={currentTierId === String(t.id || '').toLowerCase() ? 'bg-emerald-50/50' : ''}>
                      <td className="px-6 py-3.5 font-bold text-slate-800">
                        <span className="flex items-center gap-2">
                          <TierBadge tier={t.id} />
                          {t.name}
                          {currentTierId === String(t.id || '').toLowerCase() && (
                            <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wide bg-emerald-100 rounded-full px-2 py-0.5">
                              Hạng hiện tại
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-600 whitespace-nowrap font-medium">{formatCurrency(t.minPoints || 0)} điểm</td>
                      <td className="px-6 py-3.5 font-black text-emerald-600 whitespace-nowrap">x{Number(t.multiplier ?? 1).toLocaleString('vi-VN')}</td>
                      <td className="px-6 py-3.5 text-xs text-slate-500">
                        <ul className="space-y-0.5 list-disc list-inside">
                          {(t.benefits || []).map((b, bi) => <li key={bi}>{b}</li>)}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xs">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-800 mb-3 flex items-center gap-2">
              <Info weight="fill" className="text-blue-500" /> Quy định điểm thưởng
            </h3>
            <ul className="space-y-2.5 text-xs sm:text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={16} weight="fill" />
                <span>Điểm được cộng khi đơn hàng thanh toán thành công và bị trừ khi hủy đơn / hoàn tiền.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={16} weight="fill" />
                <span>Điểm thưởng có hiệu lực trong {loyaltyConfig?.pointExpirationMonths ?? 6} tháng kể từ lần tích điểm gần nhất.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={16} weight="fill" />
                <span>Điểm dùng để đổi voucher tại mục "Đổi điểm lấy quà".</span>
              </li>
              <li className="flex items-start gap-2">
                <Warning className="text-amber-500 shrink-0 mt-0.5" size={16} weight="fill" />
                <span>Chỉ tính trên phần tiền đã thanh toán thực tế, không tính trên phần tiền được giảm giá qua voucher.</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
