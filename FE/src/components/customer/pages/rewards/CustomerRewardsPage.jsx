import { useCallback, useEffect, useState } from 'react';
import { Gift, Coins, Star, Ticket, Tag, CheckCircle, CaretRight, ArrowUp, ArrowDown, Eye, Lightbulb, Medal, Info, Warning } from '@phosphor-icons/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TierBadge from '@/components/ui/TierBadge';
import { confirmDialog } from '@/lib/confirm';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import useSSE from '@/hooks/useSSE';
import { useTranslation } from 'react-i18next';

const apiBase = getApiBaseUrl();


function api(path, opts = {}) {
  return fetch(`${apiBase}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}`, ...opts.headers },
  });
}
async function readErr(res, t) {
  try { const j = await res.json(); return j?.message || (t ? t('customer.rewards.httpError', { status: res.status }) : `Lỗi ${res.status}`); } catch { return t ? t('customer.rewards.httpError', { status: res.status }) : `Lỗi ${res.status}`; }
}

function formatCurrency(val) {
  if (!val && val !== 0) return '0';
  return Number(val).toLocaleString('vi-VN');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

function getTypeBadge(type) {
  switch (type) {
    case 'earned': return { labelKey: 'customer.rewards.typeEarn', color: 'bg-emerald-100 text-emerald-700' };
    case 'redeemed': return { labelKey: 'customer.rewards.typeRedeemed', color: 'bg-amber-100 text-amber-700' };
    case 'expired': return { labelKey: 'customer.rewards.typeExpired', color: 'bg-rose-100 text-rose-700' };
    case 'adjustment': return { labelKey: 'customer.rewards.typeAdjustment', color: 'bg-purple-100 text-purple-700' };
    default: return { labelKey: null, label: type, color: 'bg-slate-100 text-slate-700' };
  }
}

function PointHistoryTable({ items, loading, page, pagination, setPage, navigate, emptyMsg, activeTab, t }) {
  if (loading) return <div className="text-center py-12 text-slate-400 text-sm">{t('customer.rewards.loading')}</div>;
  if (items.length === 0) return <div className="text-center py-12 text-slate-400 text-sm">{emptyMsg || t('customer.rewards.emptyData')}</div>;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">{t('customer.rewards.dateHeader')}</th>
              <th className="px-4 py-3 text-left">{t('customer.rewards.typeHeader')}</th>
              <th className="px-4 py-3 text-left">{t('customer.rewards.descriptionHeader')}</th>
              <th className="px-4 py-3 text-right">{t('customer.rewards.pointsHeader')}</th>
              <th className="px-4 py-3 text-right">{t('customer.rewards.detailHeader')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map(item => {
              const badge = getTypeBadge(item.type);
              const isPositive = item.type === 'earned' || (item.type === 'adjustment' && item.points > 0);
              return (
                <tr key={item._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badge.color}`}>{badge.labelKey ? t(badge.labelKey) : badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 max-w-xs truncate">{item.description}</td>
                  <td className={`px-4 py-3 text-right text-sm font-extrabold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <span className="flex items-center justify-end gap-1">
                      {isPositive ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                      {isPositive ? '+' : ''}{Math.abs(item.points)?.toLocaleString('vi-VN')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => navigate(`/rewards/history/${item._id}?tab=${activeTab}`)}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                      <Eye size={14} /> {t('customer.rewards.view')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">{t('customer.rewards.prev')}</button>
          <span className="text-xs text-slate-500">{t('customer.rewards.pageInfo', { page, totalPages: pagination.totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">{t('customer.rewards.next')}</button>
        </div>
      )}
    </div>
  );
}

export default function CustomerRewardsPage({ user, refreshUser }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'reward');
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState({ totalEarned: 0, totalRedeemed: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [vouchers, setVouchers] = useState([]);
  const [myVouchers, setMyVouchers] = useState([]);
  const [myRewards, setMyRewards] = useState([]);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [tierConfig, setTierConfig] = useState(null);
  const [tierList, setTierList] = useState([]);
  const [loyaltyConfig, setLoyaltyConfig] = useState(null);

  const FALLBACK_TIER_MAP = {
    diamond: { label: 'customer.rewards.tierDiamond', color: '#0891b2', minPoints: 1000000 },
    gold: { label: 'customer.rewards.tierGold', color: '#b45309', minPoints: 500000 },
    silver: { label: 'customer.rewards.tierSilver', color: '#64748b', minPoints: 100000 },
    bronze: { label: 'customer.rewards.tierBronze', color: '#b45309', minPoints: 0 },
  };

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

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/loyalty/my-history?limit=50');
      const data = await res.json();
      if (data?.data) {
        setHistory(data.data);
      }
      const summaryData = data?.pagination?.summary || data?.meta?.summary;
      if (summaryData) {
        setSummary(summaryData);
      }
    } catch (e) { } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (refreshUser) refreshUser();
    fetchHistory();
    fetchVouchers();
  }, [fetchHistory]);

  const fetchVouchers = async () => {
    try {
      const resTpl = await api('/vouchers/available');
      const dataTpl = await resTpl.json();
      const tplPayload = dataTpl.data || [];
      const tplArray = Array.isArray(tplPayload) ? tplPayload : (tplPayload.redeemable || []);
      setVouchers(tplArray.filter(v => v.isTemplate && v.requiredPoints > 0));
    } catch (e) { }

    try {
      const resMy = await api('/vouchers/me');
      const dataMy = await resMy.json();
      setMyVouchers(dataMy.data || []);
    } catch (e) { }

    try {
      const resRewards = await api('/rewards/me');
      const dataRewards = await resRewards.json();
      setMyRewards(dataRewards.data || []);
    } catch (e) { }
  };

  const handleRedeem = async (templateId) => {    if (!(await confirmDialog({ title: t('customer.rewards.redeemDialogTitle'), message: t('customer.rewards.redeemDialogMessage'), confirmLabel: t('customer.rewards.redeemDialogConfirm') }))) return;
    setRedeemLoading(true);
    try {
      const res = await api('/vouchers/redeem-points', {
        method: 'POST',
        body: JSON.stringify({ templateId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || 'Lỗi đổi điểm');
      fetchVouchers();
      if (refreshUser) refreshUser();
      fetchHistory();
    } catch (err) { } finally { setRedeemLoading(false); }
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

  const lifetimeHistory = history.filter(item => item.type === 'earned' || item.type === 'adjustment');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Tier Card */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <TierBadge tier={user?.tier} />
            <div>
              <p className="text-xs text-slate-500 font-medium">{t('customer.rewards.availablePoints')}</p>
              <p className="text-3xl font-black text-slate-800">{formatCurrency(user?.loyaltyPoints || 0)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">{t('customer.rewards.lifetimePoints')}</p>
            <p className="text-xl font-bold text-emerald-700">{formatCurrency(user?.lifetimePoints || 0)}</p>
          </div>
        </div>
        <div className="mt-3">
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[11px] text-slate-500">
            <span>{t('customer.rewards.currentTier', { tier: currentTierObj?.name || user?.tier || 'Bronze' })}</span>
            {nextTierObj && <span>{t('customer.rewards.pointsToNextTier', { points: formatCurrency((nextTierObj.minPoints || 0) - (user?.lifetimePoints || 0)), tier: nextTierObj.name || nextTierObj.id })}</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {['reward', 'lifetime', 'exchange', 'rules', 'my-vouchers'].map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSearchParams({ tab }, { replace: true }); }}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === tab
              ? (tab === 'lifetime' ? 'border-blue-600 text-blue-600' : 'border-emerald-600 text-emerald-600')
              : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {tab === 'reward' ? t('customer.rewards.tabReward') : tab === 'lifetime' ? t('customer.rewards.tabLifetime') : tab === 'exchange' ? t('customer.rewards.tabExchange') : tab === 'rules' ? t('customer.rewards.tabRules') : t('customer.rewards.tabMyGifts')}
          </button>
        ))}
      </div>

      {/* Tab: Điểm thưởng */}
      {activeTab === 'reward' && (
        <div>
          <div className="flex gap-4 mb-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex-1">
              <p className="text-xs text-slate-500">{t('customer.rewards.totalEarned')}</p>
              <p className="text-lg font-extrabold text-emerald-700">+{formatCurrency(summary.totalEarned)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 flex-1">
              <p className="text-xs text-slate-500">{t('customer.rewards.totalRedeemed')}</p>
              <p className="text-lg font-extrabold text-amber-700">{summary.totalRedeemed > 0 ? '-' : ''}{formatCurrency(summary.totalRedeemed)}</p>
            </div>
          </div>
          <PointHistoryTable items={history} loading={loading} page={page} pagination={pagination} setPage={setPage} navigate={navigate} emptyMsg={t('customer.rewards.emptyEarnHistory')} activeTab={activeTab} t={t} />
        </div>
      )}

      {/* Tab: Điểm tích lũy */}
      {activeTab === 'lifetime' && (
        <div>
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 mb-4">
            <p className="text-xs text-slate-500">{t('customer.rewards.lifetimeSummaryNote')}</p>
            <p className="text-lg font-extrabold text-blue-700">{formatCurrency(user?.lifetimePoints || 0)}</p>
          </div>
          <PointHistoryTable items={lifetimeHistory} loading={loading} page={page} pagination={pagination} setPage={setPage} navigate={navigate} emptyMsg={t('customer.rewards.emptyLifetimeHistory')} activeTab={activeTab} t={t} />
        </div>
      )}

      {/* Tab: Cách tính điểm */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-6">
            <h3 className="text-base font-extrabold text-slate-800 mb-1 flex items-center gap-2">
              <Lightbulb weight="fill" className="text-emerald-600" /> {t('customer.rewards.rulesTitle')}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {t('customer.rewards.rulesIntro')}
            </p>
            <div className="bg-white rounded-xl border border-emerald-200 p-4 font-mono text-sm text-slate-700 text-center">
              {t('customer.rewards.rulesFormula', { rate: loyaltyConfig?.baseEarningRate ?? 5 })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Medal weight="fill" className="text-amber-500" /> {t('customer.rewards.tierHeaderTitle')}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{t('customer.rewards.tierHeaderDesc')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3 text-left">{t('customer.rewards.rankHeader')}</th>
                    <th className="px-6 py-3 text-left">{t('customer.rewards.minLifetimePointsHeader')}</th>
                    <th className="px-6 py-3 text-left">{t('customer.rewards.multiplierHeader')}</th>
                    <th className="px-6 py-3 text-left">{t('customer.rewards.benefitsHeader')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedTiers.map(t => (
                    <tr key={t.id} className={currentTierId === String(t.id || '').toLowerCase() ? 'bg-emerald-50/50' : ''}>
                      <td className="px-6 py-3 font-bold text-slate-800">
                        <span className="flex items-center gap-2">
                          <TierBadge tier={t.id} />
                          {t.name}
                          {currentTierId === String(t.id || '').toLowerCase() && (
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wide bg-emerald-100 rounded-full px-2 py-0.5">{t('customer.rewards.currentTierBadge')}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{t('customer.rewards.minPointsCell', { points: formatCurrency(t.minPoints || 0) })}</td>
                      <td className="px-6 py-3 font-extrabold text-emerald-600 whitespace-nowrap">x{Number(t.multiplier ?? 1).toLocaleString('vi-VN')}</td>
                      <td className="px-6 py-3 text-xs text-slate-500">
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

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-base font-extrabold text-slate-800 mb-3 flex items-center gap-2">
              <Info weight="fill" className="text-blue-500" /> {t('customer.rewards.regulationsTitle')}
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2"><CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={16} /> {t('customer.rewards.ruleEarnDeduct')}</li>
              <li className="flex items-start gap-2"><CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={16} /> {t('customer.rewards.ruleExpiry', { months: loyaltyConfig?.pointExpirationMonths ?? 6 })}</li>
              <li className="flex items-start gap-2"><CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={16} /> {t('customer.rewards.ruleRedeem')}</li>
              <li className="flex items-start gap-2"><Warning className="text-amber-500 shrink-0 mt-0.5" size={16} /> {t('customer.rewards.rulePaidOnly')}</li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab: Đổi điểm lấy quà */}
      {activeTab === 'exchange' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vouchers.length === 0 ? (
            <div className="col-span-full text-center py-12 text-slate-400 text-sm">{t('customer.rewards.noVouchersAvailable')}</div>
          ) : (
            vouchers.map(v => (
              <div key={v._id} className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{v.name}</p>
                    <p className="text-[11px] font-mono text-emerald-600 mt-0.5">{v.code}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                    <Coins weight="fill" size={14} /> {formatCurrency(v.requiredPoints)}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-4 line-clamp-2">{v.description}</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 mb-4">
                  {v.applicableTiers?.length > 0 && <span className="flex items-center gap-1"><Star size={12} /> {v.applicableTiers.join(', ')}</span>}
                  <span className="flex items-center gap-1"><Ticket size={12} /> {t('customer.rewards.remaining', { count: v.remaining })}</span>
                </div>
                <button onClick={() => handleRedeem(v._id)}
                  disabled={redeemLoading || (user?.loyaltyPoints || 0) < v.requiredPoints || v.remaining <= 0}
                  className={`w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                    (user?.loyaltyPoints || 0) < v.requiredPoints
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}>
                  {(user?.loyaltyPoints || 0) < v.requiredPoints ? t('customer.rewards.insufficientPoints') : redeemLoading ? t('customer.rewards.processing') : t('customer.rewards.redeemNow')} <CaretRight weight="bold" size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Quà tặng của tôi */}
      {activeTab === 'my-vouchers' && (
        <div className="space-y-8">
          {myRewards.length > 0 && (
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 mb-3 flex items-center gap-2">
                <Gift weight="fill" className="text-amber-500" /> {t('customer.rewards.redeemedRewards', { count: myRewards.length })}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myRewards.map(rd => {
                  const snap = rd.rewardSnapshot || {};
                  const cancelled = rd.status === 'cancelled';
                  const received = rd.status === 'received';
                  const sent = rd.status === 'sent';
                  return (
                    <div key={rd._id} className="rounded-xl border border-amber-100 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-3 mb-3">
                        {snap.imageUrl ? (
                          <img src={snap.imageUrl} alt={snap.name} className="w-14 h-14 rounded-lg object-cover border border-slate-100" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-amber-50 flex items-center justify-center text-2xl shrink-0">🎁</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-sm line-clamp-2">{snap.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{t('customer.rewards.redeemedOn', { date: formatDate(rd.createdAt) })}</p>
                        </div>
                      </div>
                      <div className={`rounded-lg px-3 py-2 border flex items-center justify-between mb-3 ${cancelled ? 'bg-slate-50 border-slate-200' : 'bg-emerald-50 border-emerald-100'}`}>
                        <span className="text-xs font-semibold text-slate-500">{t('customer.rewards.redeemCode')}</span>
                        <span className={`font-mono font-extrabold tracking-wider ${cancelled ? 'text-slate-400 line-through' : 'text-emerald-700'}`}>{rd.code}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3">
                        <span className="flex items-center gap-1"><Coins weight="fill" size={12} /> {t('customer.rewards.pointsSpent', { points: formatCurrency(rd.pointsSpent) })}</span>
                        {cancelled
                          ? <span className="text-rose-500 font-bold">{t('customer.rewards.statusCancelled')}</span>
                          : received
                            ? <span className="text-emerald-600 font-bold">{t('customer.rewards.statusReceived')}</span>
                            : sent
                              ? <span className="text-blue-600 font-bold">{t('customer.rewards.statusSent')}</span>
                              : <span className="text-emerald-600 font-bold">{t('customer.rewards.statusPendingSend')}</span>}
                      </div>
                      {!cancelled && !received && (
                      <button onClick={() => { navigator.clipboard.writeText(rd.code); showToast(t('customer.rewards.copySuccess'), 'success'); }}
                        className="w-full py-2.5 rounded-lg text-sm font-bold border bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 transition-all">
                        {t('customer.rewards.copyRedeemCode')}
                      </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-extrabold text-slate-800 mb-3 flex items-center gap-2">
              <Ticket weight="fill" className="text-emerald-500" /> {t('customer.rewards.myVouchers', { count: myVouchers.length })}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myVouchers.length === 0 ? (
                <div className="col-span-full text-center py-12 text-slate-400 text-sm">{t('customer.rewards.noVouchers')}</div>
              ) : (
                myVouchers.map(uv => {
                  const v = uv.voucherId;
                  if (!v) return null;
                  return (
                    <div key={uv._id} className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{v.name}</p>
                          <p className="text-sm font-mono text-emerald-600 mt-0.5">{v.code}</p>
                        </div>
                        <CheckCircle weight="fill" size={22} className="text-emerald-500" />
                      </div>
                      <p className="text-xs text-slate-500 mb-4">{v.description}</p>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-4">
                        <Tag size={12} /> {t('customer.rewards.expiryDate', { date: v.endDate ? new Date(v.endDate).toLocaleDateString('vi-VN') : '-' })}
                      </div>
                      <button onClick={() => { navigator.clipboard.writeText(v.code); }}
                        className="w-full py-2.5 rounded-lg text-sm font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all">
                        {t('customer.rewards.copyPromoCode')}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
