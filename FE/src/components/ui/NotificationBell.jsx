import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  CalendarCheck,
  CheckCircle,
  XCircle,
  Clock,
  CurrencyCircleDollar,
  Tag,
  ArrowCounterClockwise,
  Trash,
  Coin,
  Trophy,
  Star,
} from '@phosphor-icons/react';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import useSSE from '@/hooks/useSSE';
function api(path, opts = {}) {
  return fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getStoredToken()}`,
      ...opts.headers,
    },
    ...opts,
  });
}

const TYPE_CONFIG = {
  booking_created:   { Icon: CalendarCheck,          color: 'text-blue-500',   bg: 'bg-blue-50' },
  booking_confirmed: { Icon: CheckCircle,             color: 'text-emerald-500', bg: 'bg-emerald-50' },
  booking_cancelled: { Icon: XCircle,                 color: 'text-red-500',    bg: 'bg-red-50' },
  booking_completed: { Icon: CheckCircle,             color: 'text-emerald-500', bg: 'bg-emerald-50' },
  booking_reminder:  { Icon: Clock,                   color: 'text-amber-500',  bg: 'bg-amber-50' },
  payment_received:  { Icon: CurrencyCircleDollar,    color: 'text-emerald-500', bg: 'bg-emerald-50' },
  payment_confirmed: { Icon: CurrencyCircleDollar,    color: 'text-emerald-500', bg: 'bg-emerald-50' },
  points_earned:     { Icon: Star,                    color: 'text-emerald-600', bg: 'bg-emerald-50' },
  points_adjustment: { Icon: Coin,                    color: 'text-amber-600',   bg: 'bg-amber-50' },
  tier_upgraded:     { Icon: Trophy,                  color: 'text-amber-500',  bg: 'bg-amber-50' },
  refund:            { Icon: ArrowCounterClockwise,   color: 'text-orange-500', bg: 'bg-orange-50' },
  voucher:           { Icon: Tag,                     color: 'text-purple-500', bg: 'bg-purple-50' },
  system:            { Icon: Bell,                    color: 'text-slate-500',  bg: 'bg-slate-50' },
};

function timeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('just_now');
  if (m < 60) return `${m} ${t('minutes_ago')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${t('hours_ago')}`;
  return `${Math.floor(h / 24)} ${t('days_ago')}`;
}

export default function NotificationBell() {
  const { t } = useTranslation('notification');
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropRef = useRef(null);
  const pollRef = useRef(null);

  /* ── fetch unread count ── */
  const fetchCount = useCallback(async () => {
    try {
      const res = await api('/notifications/unread-count');
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data?.data?.unread ?? data?.unread ?? 0);
    } catch { /* silent */ }
  }, []);

  /* ── fetch notification list ── */
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/notifications?limit=15&page=1');
      if (!res.ok) return;
      const data = await res.json();
      const items = data?.data?.notifications ?? data?.data ?? data?.notifications ?? [];
      setNotifications(Array.isArray(items) ? items : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  const token = getStoredToken();
  useSSE(token, 'notification', useCallback(() => {
    setUnread((c) => c + 1);
    setNotifications((prev) => prev); // dummy trigger if needed, or better fetchList if open
    fetchCount();
  }, [fetchCount]));

  useSSE(token, 'booking_new', fetchCount);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  /* ── open dropdown → load list ── */
  useEffect(() => {
    if (open) fetchList();
  }, [open, fetchList]);

  /* ── close on outside click ── */
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  /* ── mark one as read ── */
  async function markRead(id) {
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
    );
    setUnread((c) => Math.max(0, c - 1));
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
    } catch { /* silent */ }
  }

  /* ── mark all as read ── */
  async function markAll() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
    } catch { /* silent */ }
  }

  /* ── delete all ── */
  async function deleteAll() {
    setNotifications([]);
    setUnread(0);
    try {
      await api('/notifications', { method: 'DELETE' });
    } catch { /* silent */ }
  }

  return (
    <div className="relative" ref={dropRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors shadow-sm"
        aria-label={t('title')}
      >
        <Bell size={18} weight={unread > 0 ? 'fill' : 'regular'} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-slate-500" weight="fill" />
              <span className="text-sm font-semibold text-slate-700">{t('title')}</span>
              {unread > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAll}
                  className="rounded-lg px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 transition-colors font-medium">
                  {t('mark_all_read')}
                </button>
              )}
              <button onClick={deleteAll}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-red-500 transition-colors">
                <Trash size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                <Bell size={32} weight="duotone" />
                <p className="text-xs">{t('empty')}</p>
              </div>
            ) : (
              notifications.map((n) => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
                const { Icon } = cfg;
                return (
                  <button
                    key={n._id}
                    onClick={() => { if (!n.isRead) markRead(n._id); }}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0 ${
                      n.isRead ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Icon */}
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}>
                      <Icon size={15} className={cfg.color} weight="fill" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs leading-snug text-slate-800 ${!n.isRead ? 'font-semibold' : 'font-normal'}`}>
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 leading-snug line-clamp-2">
                        {n.message}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">{timeAgo(n.createdAt, t)}</p>
                    </div>

                    {/* Unread dot */}
                    {!n.isRead && (
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
