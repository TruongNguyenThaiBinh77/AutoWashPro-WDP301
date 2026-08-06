import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import { translateNotification } from '@/utils/notifTranslator';
import { getStoredToken } from '@/lib/authStorage';
import useSSE from '@/hooks/useSSE';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function timeAgo(dateStr, i18n) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return i18n.t('landing.navbar.timeAgo.justNow');
  if (mins < 60) return i18n.t('landing.navbar.timeAgo.minutesAgo', { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return i18n.t('landing.navbar.timeAgo.hoursAgo', { hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return i18n.t('landing.navbar.timeAgo.daysAgo', { days });
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

const NOTIF_ICONS = {
  booking_created: '📅',
  booking_confirmed: '✅',
  booking_cancelled: '❌',
  booking_completed: '🎉',
  booking_reminder: '⏰',
  booking_at_risk: '⚠️',
  booking_grace_extended: '🕐',
  payment_received: '💰',
  payment_confirmed: '💳',
  refund: '🔙',
  voucher: '🎫',
  points_earned: '⭐',
  points_deducted: '📉',
  tier_downgraded: '⬇️',
  system: '🔔',
};

export default function Navbar({ onOpenAuth, user, onLogout, onGoToProfile, onGoToHistory, onGoToPayments, onGoToNotifications, alwaysVisible = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const [visible, setVisible] = useState(true);
  const [prevScroll, setPrevScroll] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  // Notification state
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifFilter, setNotifFilter] = useState('all'); // 'all' | 'unread'
  const [showSpinModal, setShowSpinModal] = useState(false);

  const token = getStoredToken();

  // Fetch unread count
  const fetchUnreadCount = useCallback(() => {
    const activeToken = token || getStoredToken();
    if (!activeToken) return;
    fetch(`${API_BASE}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    })
      .then(r => r.json())
      .then(data => {
        const count = data?.data?.unread ?? data?.data?.count ?? data?.unread ?? data?.count ?? 0;
        setUnreadCount(Number(count) || 0);
      })
      .catch(() => {});
  }, [token]);

  // Fetch recent notifications for dropdown
  const fetchNotifications = useCallback(() => {
    const activeToken = token || getStoredToken();
    if (!activeToken) return;
    setNotifLoading(true);
    const params = new URLSearchParams({ page: '1', limit: '10' });
    if (notifFilter === 'unread') params.set('isRead', 'false');
    fetch(`${API_BASE}/notifications?${params.toString()}`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    })
      .then(r => r.json())
      .then(data => {
        const result = data?.data || data;
        setNotifications(Array.isArray(result) ? result : (result?.notifications || []));
      })
      .catch(() => setNotifications([]))
      .finally(() => setNotifLoading(false));
  }, [token, notifFilter]);

  // Poll unread count every 30s + sync with user & events
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (user) fetchUnreadCount();
  }, [user, fetchUnreadCount]);

  useEffect(() => {
    const handleSync = () => fetchUnreadCount();
    window.addEventListener('unread_notifications_updated', handleSync);
    return () => window.removeEventListener('unread_notifications_updated', handleSync);
  }, [fetchUnreadCount]);

  useSSE(token, 'notification', useCallback((data) => {
    fetchUnreadCount();
    if (data?.type === 'booking_completed') {
      setShowSpinModal(true);
    }
  }, [fetchUnreadCount]));

  // Load notifications when dropdown opens
  useEffect(() => {
    if (notifOpen) fetchNotifications();
  }, [notifOpen, fetchNotifications]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!profileOpen && !notifOpen) return;
    function handleClick(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen, notifOpen]);

  // Mark single notification as read
  const markAsRead = async (id) => {
    const activeToken = token || getStoredToken();
    if (!activeToken) return;
    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
      window.dispatchEvent(new CustomEvent('unread_notifications_updated'));
    } catch {}
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const activeToken = token || getStoredToken();
    if (!activeToken) return;
    try {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent('unread_notifications_updated'));
    } catch {}
  };

  const isCustomerPage = ['/profile', '/history', '/payments', '/notifications'].includes(location.pathname);
  const shouldAlwaysShow = alwaysVisible || isCustomerPage;

  useEffect(() => {
    const handleScroll = () => {
      const current = window.scrollY;
      setIsScrolled(current >= 50);
      if (shouldAlwaysShow || current < 50) {
        setVisible(true);
      } else if (current > prevScroll) {
        setVisible(false);
      } else {
        setVisible(true);
      }
      setPrevScroll(current);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [prevScroll, shouldAlwaysShow]);

  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'vi';

  const navItems = [
    { label: t('nav.home'), to: '/' },
    { label: t('nav.about'), to: '/about' },
    { label: t('nav.booking'), to: '/booking' },
    { label: t('nav.gifts'), to: '/gifts' },
    { label: t('nav.stores'), to: '/map' },
  ];

  function isActive(to) {
    return location.pathname === to;
  }

  const isTransparent = location.pathname === '/' && !isScrolled;
  const showNav = shouldAlwaysShow || visible;

  const badgeText = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <AnimatePresence>
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: showNav ? 0 : -80, opacity: showNav ? 1 : 0 }}
        exit={{ y: -80, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed top-0 left-0 right-0 z-[5000] transition-colors duration-300 ${
          isTransparent 
            ? 'bg-gradient-to-b from-black/50 to-transparent border-transparent' 
            : 'bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm'
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="flex items-center justify-between h-16">
            {/* Logo - left */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className={`text-base font-bold ${isTransparent ? 'text-white' : 'text-slate-900'}`}>
                Auto<span className="text-emerald-500">Wash</span>Pro
              </span>
            </Link>

            {/* Nav links - center */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    isActive(item.to)
                      ? (isTransparent ? 'text-white font-bold' : 'text-emerald-600')
                      : (isTransparent ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-emerald-600')
                  }`}
                >
                  {item.to === '/gifts' && <Gift size={16} className={isActive(item.to) ? (isTransparent ? 'text-white' : 'text-emerald-600') : (isTransparent ? 'text-white/80' : 'text-emerald-500')} />}
                  {item.label}
                  {isActive(item.to) && (
                    <span className={`absolute bottom-0 left-4 right-4 h-0.5 rounded-full ${isTransparent ? 'bg-white' : 'bg-emerald-600'}`} />
                  )}
                </Link>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Nút chuyển đổi ngôn ngữ ngay sát bên trái biểu tượng Thông báo */}
              <LanguageSwitcher isLightBg={!isTransparent} />

              {user ? (
                <>
                  {/* ── NOTIFICATION BELL ── */}
                  <div ref={notifRef} className="relative">
                    <button
                      onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
                      className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        isTransparent
                          ? 'text-white/80 hover:bg-white/10'
                          : 'text-slate-600 hover:bg-slate-100'
                      } ${notifOpen ? (isTransparent ? 'bg-white/10' : 'bg-slate-100') : ''}`}
                      title={t('notifications.title')}
                    >
                      <Bell size={20} />
                      {badgeText && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shadow-sm border-2 border-white animate-bounce" style={{ animationDuration: '2s', animationIterationCount: 3 }}>
                          {badgeText}
                        </span>
                      )}
                    </button>

                    {/* Notification Dropdown Panel */}
                    <AnimatePresence>
                      {notifOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.96 }}
                          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute right-0 top-full mt-2 w-[360px] sm:w-[400px] max-h-[480px] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden z-[9999] flex flex-col"
                        >
                          {/* Header */}
                          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900">{t('notifications.title')}</h3>
                            {unreadCount > 0 && (
                              <button
                                onClick={markAllAsRead}
                                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                              >
                                {t('notifications.mark_all_read')}
                              </button>
                            )}
                          </div>

                          {/* Filter Tabs */}
                          <div className="flex gap-1 px-4 pt-2 pb-1">
                            <button
                              onClick={() => setNotifFilter('all')}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                notifFilter === 'all'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              {t('notifications.all')}
                            </button>
                            <button
                              onClick={() => setNotifFilter('unread')}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                notifFilter === 'unread'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              {t('notifications.unread')}
                            </button>
                          </div>

                          {/* Notification List */}
                          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                            {notifLoading ? (
                              <div className="py-12 text-center text-slate-400 text-sm">{t('loading')}</div>
                            ) : notifications.length === 0 ? (
                              <div className="py-12 text-center">
                                <div className="text-3xl mb-2">🔔</div>
                                <p className="text-sm text-slate-400 font-medium">
                                  {t('notifications.empty')}
                                </p>
                              </div>
                            ) : (
                              notifications.map(n => {
                                const icon = NOTIF_ICONS[n.type] || NOTIF_ICONS.system;
                                const translated = translateNotification(n, currentLang);
                                return (
                                  <button
                                    key={n._id}
                                    onClick={() => {
                                      if (!n.isRead) markAsRead(n._id);
                                      setNotifOpen(false);
                                      if (n.link) navigate(n.link);
                                    }}
                                    className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors hover:bg-slate-50 ${
                                      !n.isRead ? 'bg-emerald-50/40' : ''
                                    }`}
                                  >
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-lg shrink-0">
                                      {icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm leading-snug ${!n.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                                        {translated.title || t('notifications.title')}
                                      </p>
                                      {translated.message && (
                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{translated.message}</p>
                                      )}
                                      <p className={`text-[11px] mt-1 font-semibold ${!n.isRead ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {timeAgo(n.createdAt, i18n)}
                                      </p>
                                    </div>
                                    {!n.isRead && (
                                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>

                          {/* Footer */}
                          <div className="border-t border-slate-100">
                            <button
                              onClick={() => {
                                setNotifOpen(false);
                                navigate('/notifications');
                              }}
                              className="w-full py-3 text-center text-sm font-bold text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              {t('notifications.view_all')}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* ── USER PROFILE BUTTON ── */}
                  <div ref={profileRef} className="relative">
                    <button onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
                      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${
                        isTransparent 
                          ? 'text-white border-white/30 hover:bg-white/10' 
                          : 'text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {user?.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-emerald-500/30" />
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      )}
                      <span className="hidden sm:inline">{user.name}</span>
                      <svg className="w-4 h-4 ml-1 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {profileOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.95 }}
                          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden z-50"
                        >
                          <button onClick={() => { setProfileOpen(false); onGoToProfile?.(); }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 10-16 0" />
                            </svg>
                            {t('landing.navbar.profile')}
                          </button>
                          <div className="h-px bg-slate-200" />
                          <button onClick={onLogout}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                            </svg>
                            {t('landing.navbar.logout')}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => { setIsOpen(false); onOpenAuth(); }}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    isTransparent 
                      ? 'bg-white text-emerald-600 hover:bg-white/90' 
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {t('landing.navbar.login')}
                </button>
              )}

              {/* Mobile menu toggle */}
              <button onClick={() => setIsOpen(!isOpen)}
                className="md:hidden w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {isOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-slate-200 bg-white overflow-hidden"
            >
              <div className="px-6 py-4 space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setIsOpen(false)}
                    className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.to)
                        ? 'text-emerald-600 bg-emerald-50'
                        : 'text-slate-600 hover:text-emerald-600 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Lucky Spin Completion Modal */}
      {showSpinModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden text-center animate-in zoom-in-95 duration-300">
            {/* Background effects */}
            <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-emerald-100/50 to-transparent pointer-events-none" />
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-400/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-400/20 rounded-full blur-3xl" />
            
            <div className="relative z-10 space-y-4">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 flex items-center justify-center text-3xl">
                🎉
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 leading-snug">{t('landing.navbar.bookingDone')}</h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  {t('landing.navbar.bookingDoneDesc1')}<span className="font-bold text-emerald-600">{t('landing.navbar.spinCount')}</span>{t('landing.navbar.bookingDoneDesc2')}
                </p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowSpinModal(false);
                    navigate('/gifts');
                  }}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/20 hover:scale-[1.02] transition-all"
                >
                  {t('landing.navbar.goToWheel')}
                </button>
                <button
                  onClick={() => setShowSpinModal(false)}
                  className="w-full rounded-xl bg-slate-100 text-slate-600 px-4 py-3 text-sm font-semibold hover:bg-slate-200 transition-colors"
                >
                  {t('landing.navbar.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
