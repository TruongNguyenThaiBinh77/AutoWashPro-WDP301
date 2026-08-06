import { motion, useInView } from 'framer-motion';
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import CustomLuckyWheel from '../widgets/CustomLuckyWheel.jsx';
import { storageKeys } from '../../../lib/authStorage.js';
import { showToast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { useTranslation } from 'react-i18next';
import TierBadge from '@/components/ui/TierBadge';
import { Trophy, CheckCircle, Warning, ClockCounterClockwise } from '@phosphor-icons/react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function formatPrice(v) {
  return v ? new Intl.NumberFormat('vi-VN').format(v) + 'đ' : '0đ';
}

function formatDate(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const TIER_BADGE_CLS = {
  bronze: 'bg-amber-100 text-amber-800',
  silver: 'bg-slate-200 text-slate-700',
  gold: 'bg-yellow-200 text-yellow-900',
  diamond: 'bg-cyan-100 text-cyan-800',
};

const FALLBACK_TIERS = [
  { id: 'bronze', nameKey: 'landing.gifts.tier.bronze', minPoints: 0 },
  { id: 'silver', nameKey: 'landing.gifts.tier.silver', minPoints: 100000 },
  { id: 'gold', nameKey: 'landing.gifts.tier.gold', minPoints: 500000 },
  { id: 'diamond', nameKey: 'landing.gifts.tier.diamond', minPoints: 1000000 },
];

function buildTierMaps(tiers) {
  const sorted = [...(tiers || [])].sort((a, b) => (a.minPoints || 0) - (b.minPoints || 0));
  const rank = {};
  const label = {};
  const badge = {};
  sorted.forEach((t, i) => {
    const id = String(t.id || '').toLowerCase();
    rank[id] = i;
    label[id] = t.name || id;
    badge[id] = t.badgeCls || TIER_BADGE_CLS[id] || TIER_BADGE_CLS.bronze;
  });
  return { sorted, rank, label, badge };
}

function VoucherCard({ voucher, index, onRedeem, redeeming }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (voucher.code) {
      navigator.clipboard.writeText(voucher.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isPercent = voucher.type === 'percentage';
  const discountText = voucher.type === 'none' ? voucher.name : (isPercent ? t('landing.gifts.voucher.discountPercent', { value: voucher.value }) : t('landing.gifts.voucher.discountAmount', { value: formatPrice(voucher.value) }));
  const isRedeem = voucher.isTemplate;
  const isPersonal = voucher.assignedTo != null;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="group relative bg-white rounded-2xl flex flex-col overflow-hidden border border-slate-200 hover:border-emerald-300 hover:shadow-xl transition-all duration-300"
    >
      <div className="absolute left-0 top-[60%] w-4 h-4 -ml-2 rounded-full bg-[#fcfdfd] border-r border-slate-200 z-10 hidden sm:block"></div>
      <div className="absolute right-0 top-[60%] w-4 h-4 -mr-2 rounded-full bg-[#fcfdfd] border-l border-slate-200 z-10 hidden sm:block"></div>

      <div className="p-6 md:p-8 flex-1 border-b-2 border-dashed border-slate-100 relative">
        <div className="flex items-start justify-between mb-4">
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase ${
            isPersonal ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {isPersonal ? t('landing.gifts.voucher.forYou') : (isRedeem ? t('landing.gifts.voucher.redeemBadge') : t('landing.gifts.voucher.promoBadge'))}
          </div>
          {voucher.remaining > 0 && !isPersonal && (
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              {t('landing.gifts.voucher.remaining', { count: voucher.remaining })}
            </div>
          )}
        </div>
        
        <h3 className="text-3xl font-black text-slate-800 mb-2 leading-tight group-hover:text-emerald-600 transition-colors">
          {discountText}
        </h3>
        
        <p className="text-sm font-bold text-slate-700 mb-2">
          {voucher.name}
        </p>
        
        <p className="text-sm text-slate-500 leading-relaxed mb-4 line-clamp-2">
          {voucher.description}
        </p>
        
        <div className="text-xs text-slate-400 font-medium flex items-center gap-2">
          {t('landing.gifts.voucher.expiry', { date: formatDate(voucher.endDate) })}
        </div>
      </div>

      <div className="bg-slate-50/50 p-6 flex flex-col sm:flex-row items-center gap-4 justify-between">
        {isRedeem ? (
          <div className="w-full flex items-center justify-between">
            <div className="font-bold text-amber-500 flex items-center gap-2">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
               {t('landing.gifts.points', { count: voucher.requiredPoints })}
            </div>
            <button
              onClick={() => onRedeem(voucher)}
              disabled={redeeming}
              className="px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-800 text-white hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {redeeming ? t('landing.gifts.processing') : t('landing.gifts.redeemNow')}
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 w-full relative">
              <input 
                type="text" 
                readOnly 
                value={voucher.code} 
                className="w-full pl-4 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-mono font-bold text-sm uppercase tracking-wider focus:outline-none"
              />
            </div>
            <button 
              onClick={handleCopy}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-sm ${
                copied 
                  ? 'bg-slate-800 text-white shadow-slate-800/20' 
                  : 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-400 hover:-translate-y-0.5'
              }`}
            >
              {copied ? t('landing.gifts.voucher.copied') : t('landing.gifts.voucher.copyCode')}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}

function RewardCard({ reward, index, onRedeem, redeeming, points, userTier, tierMaps }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const enough = (points || 0) >= (reward.pointCost || 0);
  const soldOut = (reward.stock || 0) <= 0;
  const reqTier = (reward.requiredTier || 'bronze').toLowerCase();
  const userRank = tierMaps.rank[(userTier || 'bronze').toLowerCase()] ?? 0;
  const reqRank = tierMaps.rank[reqTier] ?? 0;
  const tierOk = userRank >= reqRank;
  const reqLabel = tierMaps.label[reqTier] || t('landing.gifts.tier.bronze');

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="group relative bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-emerald-300 hover:shadow-xl transition-all duration-300"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {reward.imageUrl ? (
          <img src={reward.imageUrl} alt={reward.name} loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">🎁</div>
        )}
        {soldOut && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center">
            <span className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-black uppercase tracking-wider">{t('landing.gifts.soldOut')}</span>
          </div>
        )}
        <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-black shadow-sm">
          ⭐ {t('landing.gifts.points', { count: reward.pointCost })}
        </div>
        <div className={`absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black shadow-sm border ${tierMaps.badge[reqTier] || TIER_BADGE_CLS.bronze}`}>
          {reqTier === 'bronze' ? t('landing.gifts.reward.allTiers') : t('landing.gifts.reward.tier', { tier: reqLabel })}
        </div>
      </div>
      <div className="p-5">
        <h4 className="text-base font-bold text-slate-800 mb-1 line-clamp-1 group-hover:text-emerald-600 transition-colors">{reward.name}</h4>
        <p className="text-sm text-slate-500 leading-relaxed mb-3 line-clamp-2">{reward.description}</p>
        <div className="text-xs text-slate-400 font-medium mb-4">{t('landing.gifts.reward.stockLeft', { count: reward.stock })}</div>
        <button
          onClick={() => onRedeem(reward)}
          disabled={redeeming || soldOut || !enough || !tierOk}
          className={`w-full px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
            soldOut || !enough || !tierOk
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed'
          }`}
        >
          {soldOut ? t('landing.gifts.soldOut') : !tierOk ? t('landing.gifts.reward.needTier', { tier: reqLabel }) : !enough ? t('landing.gifts.reward.needMore', { points: (reward.pointCost || 0) - (points || 0) }) : redeeming ? t('landing.gifts.processing') : t('landing.gifts.redeemNow')}
        </button>
      </div>
    </motion.div>
  );
}

export default function GiftStoreSection({ user, onOpenAuth }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('redeem'); // 'redeem' | 'wheel'
  const [vouchers, setVouchers] = useState([]);
  const [wheelSectors, setWheelSectors] = useState([]);
  const [spinCount, setSpinCount] = useState(0);
  const [userPoints, setUserPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [spinHistory, setSpinHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [redeemingId, setRedeemingId] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [rewardLoading, setRewardLoading] = useState(false);
  const [myRewards, setMyRewards] = useState([]);
  const [tiers, setTiers] = useState([]);

  const tierMaps = useMemo(() => buildTierMaps(tiers), [tiers]);

  const wheelRef = useRef(null);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState(null);

  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  const fetchSpinHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem(storageKeys.accessToken);
      const res = await fetch(`${API_BASE}/gifts/my-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const payload = await res.json();
        setSpinHistory(Array.isArray(payload?.data) ? payload.data : []);
      }
    } catch (e) {
      console.error(t('landing.gifts.error.fetchHistory'), e);
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    async function loadWheel() {
      try {
        const resGifts = await fetch(`${API_BASE}/gifts/public`);
        if (resGifts.ok) {
          const payload = await resGifts.json();
          const items = payload?.data || [];
          const PALETTE = ['#10b981', '#06b6d4', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6'];
          if (items.length > 0) {
            setWheelSectors(items.map((it, idx) => ({
              id: it._id,
              label: it.name,
              probability: it.probability,
              color: it.color || PALETTE[idx % PALETTE.length]
            })));
          } else {
             setWheelSectors([{ id: '1', label: t('landing.gifts.wheel.empty'), color: '#94a3b8' }]);
          }
        }
      } catch(e) {}
    }
    loadWheel();
  }, []);

  useEffect(() => {
    if (user && activeTab === 'wheel') {
      fetchSpinHistory();
    }
  }, [user, activeTab, fetchSpinHistory]);

  const loadVouchers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = localStorage.getItem(storageKeys.accessToken);
      const resProfile = await fetch(`${API_BASE}/auth/profile`, { headers: { Authorization: `Bearer ${token}` } });
      if (resProfile.ok) {
         const prof = await resProfile.json();
         if (prof.data) {
           setSpinCount(prof.data.spinCount || 0);
           setUserPoints(prof.data.loyaltyPoints || 0);
         }
      }

      const resV = await fetch(`${API_BASE}/vouchers/available?type=${filterType}&page=${page}&limit=6`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resV.ok) {
         const payload = await resV.json();
         const { data, pagination, user: uData } = payload?.data || {};
         
         if (data) {
           setVouchers(data);
         }
         if (pagination) {
           setTotalPages(pagination.totalPages || 1);
         }
         if (uData) {
           setUserPoints(uData.loyaltyPoints || 0);
         }
      }

      const resR = await fetch(`${API_BASE}/rewards/public`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resR.ok) {
        const payload = await resR.json();
        const list = Array.isArray(payload?.data) ? payload.data : [];
        setRewards([...list].sort((a, b) => {
          const trA = tierMaps.rank[(a.requiredTier || 'bronze').toLowerCase()] ?? 0;
          const trB = tierMaps.rank[(b.requiredTier || 'bronze').toLowerCase()] ?? 0;
          if (trB !== trA) return trB - trA;
          return (a.pointCost || 0) - (b.pointCost || 0);
        }));
      }

      const resMyR = await fetch(`${API_BASE}/rewards/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resMyR.ok) {
        const payload = await resMyR.json();
        setMyRewards(Array.isArray(payload?.data) ? payload.data : []);
      }
    } catch (e) {
      console.error('Failed to load store data:', e);
    } finally {
      setLoading(false);
    }
  }, [user, filterType, page, tierMaps]);

  useEffect(() => { loadVouchers(); }, [loadVouchers]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/loyalty/tiers`)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        const list = Array.isArray(payload?.data) ? payload.data
          : (typeof payload?.data === 'object' && Array.isArray(payload.data.tiers)) ? payload.data.tiers
          : [];
        setTiers(list.length > 0 ? list : FALLBACK_TIERS);
      })
      .catch(() => { if (!cancelled) setTiers(FALLBACK_TIERS); });
    return () => { cancelled = true; };
  }, []);

  const handleRedeem = async (voucher) => {
    if (!user) return onOpenAuth();
    if (redeemingId) return;
    if ((userPoints || 0) < (voucher.requiredPoints || 0)) {
      showToast(t('landing.gifts.error.insufficientVoucherPoints'), 'error');
      return;
    }
    const ok = await confirmDialog({
      title: t('landing.gifts.confirm.redeemTitle'),
      message: t('landing.gifts.confirm.redeemMessage', { points: voucher.requiredPoints, name: voucher.name }),
      confirmLabel: t('landing.gifts.confirm.redeem'),
    });
    if (!ok) return;

    setRedeemingId(voucher._id);
    try {
      const token = localStorage.getItem(storageKeys.accessToken);
      const res = await fetch(`${API_BASE}/vouchers/redeem-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ templateId: voucher._id }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || t('landing.gifts.error.redeemVoucher'));
      showToast(t('landing.gifts.success.redeemVoucher'));
      await loadVouchers();
    } catch (err) {
      showToast(err.message || t('landing.gifts.error.redeemVoucher'), 'error');
    } finally {
      setRedeemingId(null);
    }
  };

  const handleRedeemReward = async (reward) => {
    if (!user) return onOpenAuth();
    if (rewardLoading) return;
    const reqTier = (reward.requiredTier || 'bronze').toLowerCase();
    if ((tierMaps.rank[(user.tier || 'bronze').toLowerCase()] ?? 0) < (tierMaps.rank[reqTier] ?? 0)) {
      showToast(t('landing.gifts.error.insufficientTier', { tier: tierMaps.label[reqTier] || reqTier }), 'error');
      return;
    }
    if ((userPoints || 0) < (reward.pointCost || 0)) {
      showToast(t('landing.gifts.error.insufficientRewardPoints'), 'error');
      return;
    }
    const ok = await confirmDialog({
      title: t('landing.gifts.confirm.redeemRewardTitle'),
      message: t('landing.gifts.confirm.redeemRewardMessage', { points: reward.pointCost, name: reward.name }),
      confirmLabel: t('landing.gifts.confirm.redeem'),
    });
    if (!ok) return;

    setRewardLoading(true);
    try {
      const token = localStorage.getItem(storageKeys.accessToken);
      const res = await fetch(`${API_BASE}/rewards/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rewardId: reward._id }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || t('landing.gifts.error.redeemReward'));
      const code = payload.data?.redemption?.code || '';
      await confirmDialog({
        title: t('landing.gifts.success.redeemRewardTitle'),
        content: (
          <div className="text-center">
            <p className="text-sm text-slate-500 mb-3">{t('landing.gifts.success.redeemRewardContent', { name: reward.name })}</p>
            <div className="flex items-center justify-center gap-2">
              <code className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-black text-lg tracking-widest">{code}</code>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(code); showToast(t('landing.gifts.success.copiedCode'), 'success'); }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors"
              >
                {t('landing.gifts.copy')}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-3">{t('landing.gifts.success.codeSaved')}</p>
          </div>
        ),
        confirmLabel: t('landing.gifts.close'),
        hideCancel: true,
      });
      await loadVouchers();
    } catch (err) {
      showToast(err.message || t('landing.gifts.error.redeemReward'), 'error');
    } finally {
      setRewardLoading(false);
    }
  };

  const handleSpinClick = async () => {
    if (!user) return onOpenAuth();
    if (spinning) return;
    if (spinCount <= 0) {
      showToast(t('landing.gifts.error.noSpinLeft'), 'error');
      return;
    }
    
    setSpinning(true);
    setSpinResult(null);
    
    try {
      const token = localStorage.getItem(storageKeys.accessToken);
      const res = await fetch(`${API_BASE}/gifts/spin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t('landing.gifts.error.spin'));
      }
      
      setSpinCount(data.data.spinCount);
      const wonPrize = data.data.prize;
      const createdVoucher = data.data.voucher;

      if (wheelRef.current) {
        const targetSector = wheelSectors.find(s => String(s.id) === String(wonPrize._id));
        if (targetSector) {
           wheelRef.current.spin(targetSector.id);
        } else {
           wheelRef.current.spin();
        }
      }

      window.__lastSpinResult = {
        prize: wonPrize,
        voucher: createdVoucher
      };

    } catch (err) {
      showToast(err.message, 'error');
      setSpinning(false);
    }
  };

  const onSpinEnd = (sector) => {
    setSpinning(false);
    const result = window.__lastSpinResult;
    if (result) {
       setSpinResult(result);
       if (result.voucher) {
          setVouchers(prev => [result.voucher, ...prev]);
       }
       fetchSpinHistory();
    }
  };

  return (
    <section ref={ref} id="gifts" className="relative py-24 md:py-32 overflow-hidden bg-[#fcfdfd]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(16,185,129,0.02),transparent_60%)]" />
      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 md:mb-16"
        >
          <span className="text-emerald-600 text-xs md:text-sm font-bold tracking-widest uppercase mb-3 block">
            {t('landing.gifts.eyebrow')}
          </span>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-slate-900 mb-6 max-w-2xl mx-auto leading-tight">
            {t('landing.gifts.title')}
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
            {t('landing.gifts.subtitle')}
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex justify-center mb-12">
          <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center shadow-inner flex-wrap justify-center gap-1.5 border border-slate-200/60">
            <button
              onClick={() => setActiveTab('redeem')}
              className={`px-6 sm:px-8 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                activeTab === 'redeem' 
                  ? 'bg-white text-emerald-600 shadow-md' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('landing.gifts.tabs.discount')}
            </button>
            <button
              onClick={() => setActiveTab('wheel')}
              className={`px-6 sm:px-8 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                activeTab === 'wheel' 
                  ? 'bg-white text-emerald-600 shadow-md' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('landing.gifts.tabs.wheel')}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 sm:px-8 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                activeTab === 'history' 
                  ? 'bg-white text-emerald-600 shadow-md' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('landing.gifts.tabs.history')}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'redeem' ? (
          <div>
            {!user ? (
              <div className="text-center py-20 bg-white border border-slate-200 rounded-3xl shadow-sm">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">{t('landing.gifts.login.title')}</h3>
                <p className="text-slate-500 mb-6">{t('landing.gifts.login.message')}</p>
                <button onClick={onOpenAuth} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5">
                  {t('landing.gifts.login.button')}
                </button>
              </div>
            ) : (
              <div>
                <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Trophy weight="fill" className="text-amber-500 w-6 h-6" />
                    <span className="text-sm font-bold text-slate-700">{t('landing.gifts.pointsLabel')}<span className="text-emerald-600 text-lg">{userPoints}</span></span>
                  </div>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => {setFilterType('redeem');}} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'redeem' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>{t('landing.gifts.filter.physical')}</button>
                    <button onClick={() => {setFilterType('redeemable');}} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'redeemable' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>{t('landing.gifts.filter.voucher')}</button>
                    <button onClick={() => {setFilterType('mine');}} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${filterType === 'mine' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>{t('landing.gifts.filter.mine')}</button>
                  </div>
                </div>

                {filterType === 'redeem' && (
                  <div>
                    {loading ? (
                      <div className="text-center text-slate-400 py-12 font-medium">{t('landing.gifts.loading.gifts')}</div>
                    ) : rewards.length === 0 ? (
                      <div className="text-center py-20">
                        <p className="text-slate-500 font-medium">{t('landing.gifts.empty.physicalGifts')}</p>
                      </div>
                    ) : (
                      <div className="mb-10">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center text-xl shrink-0 border border-amber-200/70">🎁</div>
                          <div>
                            <h3 className="text-lg font-black text-slate-900">{t('landing.gifts.redeemPhysical.title')}</h3>
                            <p className="text-xs text-slate-500 font-medium">{t('landing.gifts.redeemPhysical.description')}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                          {rewards.map((reward, i) => (
                            <RewardCard key={reward._id || i} reward={reward} index={i} onRedeem={handleRedeemReward} redeeming={rewardLoading} points={userPoints} userTier={user?.tier} tierMaps={tierMaps} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {filterType === 'redeemable' && (
                  <div>
                    {loading ? (
                      <div className="text-center text-slate-400 py-12 font-medium">{t('landing.gifts.loading.vouchers')}</div>
                    ) : vouchers.length === 0 ? (
                      <div className="text-center py-20">
                        <p className="text-slate-500 font-medium">{t('landing.gifts.empty.vouchers')}</p>
                      </div>
                    ) : (
                      <div className="mb-10">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl shrink-0 border border-emerald-200/70">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-slate-900">{t('landing.gifts.redeemVoucher.title')}</h3>
                            <p className="text-xs text-slate-500 font-medium">{t('landing.gifts.redeemVoucher.description')}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {vouchers.map((voucher, i) => (
                            <VoucherCard key={voucher._id || voucher.id || i} voucher={voucher} index={i} onRedeem={handleRedeem} redeeming={redeemingId === voucher._id} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

            {filterType === 'mine' && myRewards.length > 0 && (
              <div className="mt-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center text-xl shrink-0 border border-amber-200/70">🎁</div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{t('landing.gifts.redeemed.title')}</h3>
                    <p className="text-xs text-slate-500 font-medium">{t('landing.gifts.redeemed.description')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {myRewards.map(rd => {
                    const snap = rd.rewardSnapshot || {};
                    const cancelled = rd.status === 'cancelled';
                    const received = rd.status === 'received';
                    const sent = rd.status === 'sent';
                    return (
                      <div key={rd._id} className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm flex flex-col">
                        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                          {snap.imageUrl ? (
                            <img src={snap.imageUrl} alt={snap.name || t('landing.gifts.redeemed.fallbackName')} loading="lazy"
                              className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl">🎁</div>
                          )}
                          <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-black shadow-sm">
                            ⭐ {t('landing.gifts.points', { count: rd.pointsSpent })}
                          </div>
                        </div>
                        <div className="p-5 flex-1 flex flex-col">
                          <h4 className="text-base font-bold text-slate-800 mb-1 line-clamp-1">{snap.name}</h4>
                          <p className="text-[11px] text-slate-400 mb-3">{t('landing.gifts.redeemed.redeemedOn', { date: formatDate(rd.createdAt) })}</p>
                          <div className={`rounded-lg px-3 py-2 border flex items-center justify-between mb-3 ${cancelled ? 'bg-slate-50 border-slate-200' : 'bg-emerald-50 border-emerald-100'}`}>
                            <span className="text-xs font-semibold text-slate-500">{t('landing.gifts.redeemed.codeLabel')}</span>
                            <span className={`font-mono font-extrabold tracking-wider ${cancelled ? 'text-slate-400 line-through' : 'text-emerald-700'}`}>{rd.code}</span>
                          </div>
                          <div className="mt-auto flex items-center justify-between text-[11px] text-slate-400 mb-3">
                            {cancelled
                              ? <span className="text-rose-500 font-bold">{t('landing.gifts.redeemed.status_cancelled')}</span>
                              : received
                                ? <span className="text-emerald-600 font-bold">{t('landing.gifts.redeemed.status_received')}</span>
                                : sent
                                  ? <span className="text-blue-600 font-bold">{t('landing.gifts.redeemed.status_sent')}</span>
                                  : <span className="text-emerald-600 font-bold">{t('landing.gifts.redeemed.status_pending')}</span>}
                          </div>
                          {!cancelled && !received && (
                          <button onClick={() => { navigator.clipboard.writeText(rd.code); showToast(t('landing.gifts.copy_code'), 'success'); }}
                            className="mt-auto w-full py-2.5 rounded-xl font-bold text-sm border bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 transition-all">
                            {t('landing.gifts.copy')}
                          </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {filterType === 'mine' && myRewards.length === 0 && (
              <div className="text-center py-20 bg-white border border-slate-200 rounded-3xl shadow-sm">
                <div className="text-4xl mb-4">🎁</div>
                <p className="text-slate-500 font-medium">{t('landing.gifts.empty_mine')}</p>
                <p className="text-xs text-slate-400 mt-1">{t('landing.gifts.empty_mine_hint')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    ) : activeTab === 'wheel' ? (
          <div className="space-y-12">
            {/* ── Spin Wheel Container Card ── */}
            <div className="flex flex-col items-center justify-center py-16 px-6 bg-gradient-to-b from-white via-emerald-50/60 to-teal-50/40 border border-emerald-100/90 rounded-3xl shadow-xl relative overflow-hidden text-slate-900 text-center">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.12),transparent_70%)] pointer-events-none" />
              
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100/80 border border-emerald-200/80 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-3 relative z-10">
                {t('landing.gifts.wheel.eyebrow')}
              </div>

              <h3 className="text-3xl md:text-4xl font-black text-slate-900 mb-2 relative z-10 tracking-tight">{t('landing.gifts.wheel.heading')}</h3>
              <p className="text-slate-500 mb-6 relative z-10 max-w-md text-xs md:text-sm font-medium leading-relaxed">{t('landing.gifts.wheel.subtitle')}</p>

              <div className="bg-white/90 border border-emerald-200/90 rounded-full px-7 py-3 mb-8 relative z-10 shadow-sm flex items-center gap-2.5">
                <span className="text-slate-700 text-sm font-bold">{t('landing.gifts.wheel.spins_available')}</span>
                <span className="text-emerald-600 text-2xl font-black">{user ? spinCount : 0}</span>
              </div>

              <div className="relative z-10 scale-[0.9] sm:scale-100 origin-center my-4">
                 {wheelSectors.length > 0 && (
                   <CustomLuckyWheel
                     ref={wheelRef}
                     sectors={wheelSectors}
                     onSpinEnd={onSpinEnd}
                     onCenterClick={handleSpinClick}
                   />
                 )}
              </div>

              <div className="mt-8 relative z-10 flex flex-col items-center">
                 <button
                   onClick={handleSpinClick}
                   disabled={spinning || (user && spinCount <= 0)}
                   className={`px-16 py-4.5 rounded-full font-black text-xl transition-all shadow-xl cursor-pointer ${
                     spinning
                       ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none border border-slate-300'
                       : (user && spinCount <= 0)
                         ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none border border-slate-300'
                         : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 hover:shadow-emerald-500/40 hover:scale-105 active:scale-95 border border-emerald-500/20'
                   }`}
                 >
                   {spinning ? t('landing.gifts.wheel.spinning') : t('landing.gifts.wheel.spin_now')}
                 </button>
              </div>

              {spinResult && (() => {
                const prizeName = (spinResult.prize?.name || '').toLowerCase();
                const isNoPrize = !spinResult.voucher && (prizeName.includes('may mắn') || prizeName.includes('không trúng'));

                return (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="absolute inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-6"
                  >
                     <div className="bg-white p-8 md:p-10 rounded-3xl shadow-2xl text-center max-w-sm w-full relative border border-slate-100 text-slate-900">
                       <button onClick={() => setSpinResult(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-sm">
                         ✕
                       </button>
                       <div className={`w-20 h-20 rounded-2xl text-white flex items-center justify-center mx-auto mb-5 shadow-lg text-3xl ${
                         isNoPrize 
                           ? 'bg-gradient-to-br from-slate-400 to-slate-500 shadow-slate-500/20' 
                           : 'bg-gradient-to-br from-amber-400 to-amber-500 shadow-amber-500/20'
                       }`}>
                         {isNoPrize ? '🍀' : '🎁'}
                       </div>
                       <h4 className="text-2xl font-black text-slate-900 mb-1">
                         {isNoPrize ? t('landing.gifts.wheel.no_prize_title') : t('landing.gifts.wheel.win_title')}
                       </h4>
                       <p className="text-xs font-medium text-slate-500 mb-5">
                         {isNoPrize ? t('landing.gifts.wheel.no_prize_desc') : t('landing.gifts.wheel.win_desc')}
                       </p>
                       <div className={`text-lg font-bold mb-6 p-4 rounded-2xl border shadow-2xs ${
                         isNoPrize 
                           ? 'bg-slate-50 text-slate-700 border-slate-200' 
                           : 'bg-emerald-50/80 text-emerald-700 border-emerald-200/80'
                       }`}>
                         {spinResult.prize?.name || (isNoPrize ? t('landing.gifts.wheel.no_prize_fallback') : t('landing.gifts.wheel.secret_prize'))}
                       </div>
                       {!isNoPrize && spinResult.voucher && (
                         <p className="text-xs text-slate-500 mb-6 font-medium" dangerouslySetInnerHTML={{ __html: t('landing.gifts.wheel.auto_claimed') }} />
                       )}
                       <button 
                         onClick={() => setSpinResult(null)}
                         className={`w-full py-3 text-white font-bold text-sm rounded-xl transition-all shadow-md cursor-pointer ${
                           isNoPrize 
                             ? 'bg-slate-800 hover:bg-slate-700 shadow-slate-800/20' 
                             : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20'
                         }`}
                       >
                         {isNoPrize ? t('landing.gifts.wheel.try_again') : t('landing.gifts.wheel.claim_prize')}
                       </button>
                     </div>
                  </motion.div>
                );
              })()}
            </div>

            {/* ── Shortcut Banner to History ── */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-left">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center text-2xl shrink-0">
                  🏆
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">{t('landing.gifts.history_banner.title')}</h4>
                  <p className="text-xs text-slate-500">{t('landing.gifts.history_banner.description')}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('history')}
                className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shrink-0 cursor-pointer shadow-sm"
              >
                {t('landing.gifts.history_banner.cta')}
              </button>
            </div>
          </div>
        ) : (
          /* ── TAB 3: LỊCH SỬ QUAY THƯỞNG ── */
          <div className="bg-white rounded-3xl p-6 md:p-10 border border-slate-200/80 shadow-sm relative z-10">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center text-2xl shadow-2xs border border-amber-200/80">
                  🏆
                </div>
                <div>
                  <h4 className="text-xl font-black text-slate-900">{t('landing.gifts.history.title')}</h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{t('landing.gifts.history.subtitle')}</p>
                </div>
              </div>
              {spinHistory.length > 0 && (
                <span className="text-xs font-bold px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {t('landing.gifts.history.total_wins', { count: spinHistory.length })}
                </span>
              )}
            </div>

            {!user ? (
              <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-slate-200">
                <p className="text-slate-500 text-sm font-medium mb-4">{t('landing.gifts.history.login_prompt')}</p>
                <button onClick={onOpenAuth} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-md">
                  {t('landing.gifts.history.login_btn')}
                </button>
              </div>
            ) : historyLoading ? (
              <div className="text-center py-16 text-slate-400 text-sm font-medium">{t('landing.gifts.history.loading')}</div>
            ) : spinHistory.length === 0 ? (
              <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-3xl mx-auto mb-3">
                  🎁
                </div>
                <h5 className="text-base font-bold text-slate-800">{t('landing.gifts.history.empty_title')}</h5>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">{t('landing.gifts.history.empty_desc')}</p>
                <button
                  onClick={() => setActiveTab('wheel')}
                  className="mt-5 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm cursor-pointer"
                >
                  {t('landing.gifts.history.cta')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {spinHistory.map((item, idx) => {
                  const isUsed = item.status === 'used';
                  const isExpired = item.status === 'expired';
                  const statusLabel = isUsed ? t('landing.gifts.history.status_used') : isExpired ? t('landing.gifts.history.status_expired') : t('landing.gifts.history.status_active');
                  const statusCls = isUsed ? 'bg-slate-100 text-slate-500 border-slate-200' : isExpired ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                  return (
                    <div key={item._id || idx} className="p-5 rounded-2xl border border-slate-200/90 bg-white hover:border-emerald-300 hover:shadow-md transition-all flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-white flex items-center justify-center text-xl font-bold shrink-0 shadow-xs">
                          🎁
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-sm font-bold text-slate-900 truncate">{item.name}</h5>
                          <div className="text-[12px] font-mono text-slate-500 mt-1 flex items-center gap-2">
                            <span>Mã: <strong className="text-slate-800">{item.code}</strong></span>
                            <span>·</span>
                            <span>{formatDate(item.wonAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold border ${statusCls}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
