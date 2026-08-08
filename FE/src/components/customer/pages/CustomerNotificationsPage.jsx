import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerPagination from '@/components/ui/CustomerPagination';
import { showToast } from '@/lib/toast';
import useSSE from '@/hooks/useSSE';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const TYPE_ICON = {
  booking_created: '📅',
  booking_confirmed: '✅',
  booking_cancelled: '❌',
  booking_completed: '🎉',
  booking_reminder: '⏰',
  booking_at_risk: '⚠️',
  booking_grace_extended: '🕐',
  payment_received: '💰',
  payment_confirmed: '💳',
  points_earned: '⭐',
  points_adjustment: '🎁',
  tier_upgraded: '🏆',
  refund: '🔙',
  voucher: '🎫',
  system: '🔔',
};

function formatDateTime(d) {
  return new Date(d).toLocaleString('vi-VN');
}

export default function CustomerNotificationsPage({ onBack, apiBase, token }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const limit = 30;

  function doFetch(pg) {
    setLoading(true);
    fetch(`${apiBase || API_BASE}/notifications?limit=${limit}&page=${pg}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(payload => {
        const data = payload?.data || payload;
        setNotifications(data?.notifications || data || []);
        setPagination(data?.totalPages ? data : null);
      })
      .catch(() => { setNotifications([]); showToast('Không thể tải thông báo', 'error'); })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!token) return;
    doFetch(page);
  }, [apiBase, token, page]);

  /* ── SSE: auto-refresh on notification ── */
  useSSE(token, 'notification', useCallback(() => {
    doFetch(page);
  }, [doFetch, page]));

  async function markRead(id) {
    try {
      await fetch(`${apiBase || API_BASE}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => (n._id === id ? { ...n, isRead: true } : n)));
      window.dispatchEvent(new CustomEvent('unread_notifications_updated'));
    } catch (e) { showToast('Không thể đánh dấu đã đọc', 'error'); }
  }

  const handleItemClick = (n) => {
    const nId = n._id || n.id;
    if (!n.isRead) markRead(nId);
    if (n.type === 'points_earned' || n.type === 'points_adjustment' || n.type === 'tier_upgraded') {
      navigate('/rewards?tab=history');
    } else if (n.type === 'voucher') {
      navigate('/rewards?tab=reward');
    } else if (n.type?.startsWith('booking_')) {
      if (n.data?.bookingId) {
        navigate(`/history/${n.data.bookingId}`);
      } else {
        navigate('/history');
      }
    } else if (n.type?.startsWith('payment_') || n.type?.startsWith('wallet_')) {
      navigate('/payments');
    }
  };

  async function markAllRead() {
    try {
      await fetch(`${apiBase || API_BASE}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showToast('Đã đánh dấu tất cả là đã đọc');
      window.dispatchEvent(new CustomEvent('unread_notifications_updated'));
    } catch (e) { showToast('Không thể đánh dấu đã đọc', 'error'); }
  }

  async function deleteAll() {
    try {
      await fetch(`${apiBase || API_BASE}/notifications`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications([]);
      showToast('Đã xóa tất cả thông báo');
      window.dispatchEvent(new CustomEvent('unread_notifications_updated'));
    } catch (e) { showToast('Không thể xóa thông báo', 'error'); }
  }

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="space-y-6">
      <main className="w-full">
        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs text-slate-500">
            {unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Không có thông báo mới'}
          </p>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="px-3.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs">
                ✓ Đọc hết
              </button>
            )}
            {notifications.length > 0 && (
              <button onClick={deleteAll}
                className="px-3 py-1.5 rounded-lg border border-red-200 bg-white text-xs font-semibold text-red-500 hover:bg-red-50">
                Xóa tất cả
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-400 text-sm">Đang tải...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">Không có thông báo</p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map(n => {
              const nId = n._id || n.id;
              return (
                <div key={nId} onClick={() => handleItemClick(n)}
                  className={`p-4 rounded-xl border cursor-pointer transition-colors ${
                    n.isRead
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-sky-50/50 border-sky-200 hover:border-sky-300'
                  }`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0 mt-0.5">{TYPE_ICON[n.type] || '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${n.isRead ? 'text-slate-600' : 'text-slate-900 font-semibold'}`}>
                          {n.title || n.message || 'Thông báo'}
                        </p>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0 mt-1.5" />}
                      </div>
                      {n.message && (
                        <p className="text-xs text-slate-500 mt-1">{n.message}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1.5">{formatDateTime(n.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <CustomerPagination pagination={pagination} page={page} setPage={setPage} itemName="thông báo" />
      </main>
    </div>
  );
}
