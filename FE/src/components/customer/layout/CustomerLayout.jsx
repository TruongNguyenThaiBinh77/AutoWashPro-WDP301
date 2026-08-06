import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { User, Calendar, CreditCard, Bell, Gift, LogOut, ChevronDown, Award, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Navbar from '../../landing/layout/Navbar';

const TIER_BADGES = {
  diamond: { labelKey: 'tier_diamond', bg: 'bg-blue-50 text-blue-600 border-blue-200' },
  gold: { labelKey: 'tier_gold', bg: 'bg-amber-50 text-amber-600 border-amber-200' },
  silver: { labelKey: 'tier_silver', bg: 'bg-slate-100 text-slate-700 border-slate-300' },
  bronze: { labelKey: 'tier_bronze', bg: 'bg-orange-50 text-orange-600 border-orange-200' },
};

const HISTORY_SUB_TABS = [
  { key: 'calendar', labelKey: 'tab_calendar' },
  { key: 'week', labelKey: 'tab_week' },
  { key: 'list', labelKey: 'tab_list' },
  { key: 'slot_packs', labelKey: 'tab_slot_packs' },
];

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function CustomerLayout({
  children,
  user,
  apiBase,
  token,
  onLogout,
  onOpenAuth,
  onGoToProfile,
  onGoToHistory,
  onGoToPayments,
  onGoToNotifications,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tierList, setTierList] = useState([]);
  const { t, i18n } = useTranslation('customer');
  const currentLang = i18n.language || 'vi';

  useEffect(() => {
    fetch(`${apiBase || API_BASE}/loyalty/tiers`)
      .then(r => r.json())
      .then(p => { if (Array.isArray(p?.data)) setTierList(p.data); })
      .catch(() => {});
  }, [apiBase]);

  const currentPath = location.pathname;
  const isHistoryPage = currentPath === '/history' || currentPath.startsWith('/history/');
  const [historyExpanded, setHistoryExpanded] = useState(isHistoryPage);

  // Keep expanded state in sync with path
  useEffect(() => {
    if (isHistoryPage) setHistoryExpanded(true);
  }, [isHistoryPage]);

  const currentViewMode = searchParams.get('view') || 'list';

  const handleSubTabClick = (key) => {
    if (!isHistoryPage) {
      navigate(`/history?view=${key}`);
    } else {
      setSearchParams({ view: key });
    }
  };

  const sidebarLinks = [
    { labelKey: 'layout.profile', to: '/profile', icon: User, badge: null },
    { labelKey: 'layout.wallet', to: '/wallet', icon: Wallet, badge: null },
    { labelKey: 'layout.booking_history', to: '/history', icon: Calendar, badge: null, hasSubMenu: true },
    { labelKey: 'layout.payment_history', to: '/payments', icon: CreditCard, badge: null },
    { labelKey: 'layout.notifications', to: '/notifications', icon: Bell, badge: null },
    { labelKey: 'layout.rewards', to: '/rewards', icon: Award, badge: null },
  ];

  // Dynamic tier info: prefer API name, fallback to hardcoded map
  const apiTier = tierList.find(t => (t.id || '').toLowerCase() === (user?.tier || 'bronze').toLowerCase());
  const fallbackTier = TIER_BADGES[user?.tier] || TIER_BADGES.bronze;
  const tierInfo = {
    label: apiTier?.name || t(fallbackTier.labelKey),
    bg: fallbackTier.bg,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 1. Global Top Navbar */}
      <Navbar
        alwaysVisible={true}
        onOpenAuth={onOpenAuth}
        user={user}
        onLogout={onLogout}
        onGoToProfile={onGoToProfile}
        onGoToHistory={onGoToHistory}
        onGoToPayments={onGoToPayments}
        onGoToNotifications={onGoToNotifications}
      />

      {/* Main Content Layout */}
      <div className="pt-16 flex-1 flex w-full">
        {/* Mobile Horizontal Sub-Navbar */}
        <div className="md:hidden w-full px-4 pt-4 pb-2 bg-white border-b border-slate-200 overflow-x-auto scrollbar-none flex gap-2">
          {sidebarLinks.map((link) => {
            const Icon = link.icon;
            const active = link.to === '/history' ? isHistoryPage : link.to === '/wallet' ? currentPath.startsWith('/wallet') : currentPath === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon size={16} />
                <span>{t(link.labelKey)}</span>
              </Link>
            );
          })}
        </div>

        {/* Desktop Fixed/Sticky Left Sidebar Pane */}
        <aside className="hidden md:flex flex-col w-72 lg:w-80 shrink-0 bg-white border-r border-slate-200/80 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4 z-30 shadow-xs">
          {/* User Profile Card */}
          <div className="p-3.5 mb-3 rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-50/40 border border-slate-100/80">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-emerald-500/20 shrink-0 overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name || 'Avatar'} className="w-full h-full object-cover" />
                ) : (
                  (user?.name || user?.email || '?').charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {user?.name || t('layout.member_fallback')}
                </h3>
                <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${tierInfo.bg}`}>
                    <Award size={11} />
                    {tierInfo.label}
                  </span>
                  {user?.loyaltyPoints !== undefined && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {user.loyaltyPoints}{t('layout.points_label')}
                    </span>
                  )}
                </div>
                <div className="mt-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold bg-blue-50 text-blue-700 border-blue-200">
                    <Wallet size={11} />
                    {t('layout.wallet_label')}: {(user?.walletBalance || 0).toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {t('layout.account_settings')}
          </div>

          {/* Sidebar Navigation */}
          <nav className="space-y-1 flex-1 mt-1">
            {sidebarLinks.map((link) => {
              const Icon = link.icon;
              const active = link.to === '/history' ? isHistoryPage : link.to === '/wallet' ? currentPath.startsWith('/wallet') : currentPath === link.to;

              // Expandable "Lịch sử đặt xe" with sub-tabs
              if (link.hasSubMenu) {
                return (
                  <div key={link.to}>
                    <div
                      className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition-all group cursor-pointer ${
                        active
                          ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/80 shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 border border-transparent'
                      }`}
                      onClick={() => {
                        if (!isHistoryPage) navigate('/history');
                        setHistoryExpanded(v => !v);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl transition-colors ${
                          active
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                        }`}>
                          <Icon size={16} />
                        </div>
                        <span>{t(link.labelKey)}</span>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${historyExpanded ? 'rotate-180' : ''} ${
                          active ? 'text-emerald-600' : 'text-slate-300 group-hover:text-slate-400'
                        }`}
                      />
                    </div>

                    {/* Sub-menu accordion items */}
                    {historyExpanded && (
                      <div className="ml-5 pl-4 border-l-2 border-slate-100 my-1 space-y-1">
                        {HISTORY_SUB_TABS.map((subTab) => {
                          const isSubActive = isHistoryPage && currentViewMode === subTab.key;
                          return (
                            <button
                              key={subTab.key}
                              onClick={() => handleSubTabClick(subTab.key)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                                isSubActive
                                  ? 'bg-emerald-100/70 text-emerald-800 font-bold'
                                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
                              }`}
                            >
                              <span>{t(subTab.labelKey)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all group ${
                    active
                      ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/80 shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <div className={`p-2 rounded-xl transition-colors ${
                    active
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                  }`}>
                    <Icon size={16} />
                  </div>
                  <span>{t(link.labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          {/* Logout Button at bottom */}
          <div className="pt-3 mt-auto border-t border-slate-100">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <div className="p-2 rounded-xl bg-rose-100/80 text-rose-600">
                <LogOut size={16} />
              </div>
              <span>{t('layout.logout')}</span>
            </button>
          </div>
        </aside>

        {/* Right Main Content Panel */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
