import { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Drop, QrCode } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import DashboardShell from '@/components/layout/DashboardShell';
import { MANAGER_BRAND, MANAGER_MENU_ITEMS, MANAGER_PAGE_META } from '@/config/managerMenu';
import { clearSession, getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import NotificationBell from '@/components/ui/NotificationBell';
import useSSE from '@/hooks/useSSE';
import ManagerQRScanner from '@/components/manager/ManagerQRScanner';
import { translateText } from '@/utils/notifTranslator';
import ManagerCheckInConfirmModal from '@/components/manager/ManagerCheckInConfirmModal';

function api(path) {
  return fetch(`${getApiBaseUrl()}${path}`, { headers: { Authorization: `Bearer ${getStoredToken()}` } });
}

function resolvePageMeta(pathname, search = '') {
  if (pathname === '/manager' || pathname === '/manager/') {
    return MANAGER_PAGE_META.overview;
  }
  if (pathname.startsWith('/manager/bookings')) return MANAGER_PAGE_META.bookings;
  if (pathname.startsWith('/manager/schedule')) return MANAGER_PAGE_META.schedule;
  if (pathname.startsWith('/manager/branch')) return MANAGER_PAGE_META.branch;
  if (pathname.startsWith('/manager/vouchers')) return MANAGER_PAGE_META.vouchers;
  if (pathname.startsWith('/manager/payments/refunds/')) {
    return { title: 'Chi tiết Yêu cầu hoàn tiền', description: 'Xem chi tiết và duyệt yêu cầu hoàn tiền của khách hàng.' };
  }
  if (pathname.startsWith('/manager/payments/refunds')) return MANAGER_PAGE_META['refund-requests'];
  if (pathname.startsWith('/manager/payments/')) {
    return { title: 'Chi tiết thanh toán', description: 'Xem chi tiết giao dịch và thực hiện xác nhận hoặc hoàn tiền.' };
  }
  if (pathname.startsWith('/manager/payments')) return MANAGER_PAGE_META.payments;
  if (pathname.startsWith('/manager/customers')) return MANAGER_PAGE_META.customers;
  if (pathname.startsWith('/manager/feedbacks')) return MANAGER_PAGE_META.feedbacks;
  if (pathname.startsWith('/manager/revenue')) return MANAGER_PAGE_META.revenue;
  if (pathname.startsWith('/manager/packages')) return MANAGER_PAGE_META.packages;
  if (pathname.startsWith('/manager/slot-packs')) return MANAGER_PAGE_META['slot-packs'];
  if (pathname.startsWith('/manager/policies')) return MANAGER_PAGE_META.policies;
  if (pathname.startsWith('/manager/system-config')) return MANAGER_PAGE_META['system-config'];
  if (pathname.startsWith('/manager/profile')) return MANAGER_PAGE_META.profile;
  return MANAGER_PAGE_META.overview;
}

export default function ManagerLayout({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const meta = resolvePageMeta(location.pathname, location.search);
  const [badges, setBadges] = useState({});
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [pendingCheckinBooking, setPendingCheckinBooking] = useState(null);
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'vi';
  const token = getStoredToken();

  const loadCounts = useCallback(async () => {
    try {
      const [bRes, fRes, pRes, rRes] = await Promise.all([
        api('/bookings?status=pending&limit=1'),
        api('/bookings/feedbacks?replied=false&limit=1'),
        api('/payments/unviewed-count'),
        api('/refund-requests?limit=100'),
      ]);
      const bData = await bRes.json().catch(() => ({}));
      const fData = await fRes.json().catch(() => ({}));
      const pData = await pRes.json().catch(() => ({}));
      const rData = await rRes.json().catch(() => ({}));

      const pendingBookings = bData?.data?.pagination?.total ?? bData?.data?.total ?? 0;
      const unrepliedReviews = fData?.data?.total ?? 0;
      const unviewedPayments = pData?.data?.count ?? 0;

      const todayStr = new Date().toDateString();

      const refundList = Array.isArray(rData?.data?.data) ? rData.data.data : (Array.isArray(rData?.data) ? rData.data : []);
      const viewedRefundIds = JSON.parse(localStorage.getItem('viewed_refund_requests') || '[]');
      const unviewedRefunds = refundList.filter(
        r => !viewedRefundIds.includes(r._id) && new Date(r.createdAt).toDateString() === todayStr
      ).length;

      setBadges({
        bookings: pendingBookings,
        feedbacks: unrepliedReviews,
        payments: unviewedPayments + unviewedRefunds,
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [location.pathname, loadCounts]);

  useSSE(token, 'slots_updated', loadCounts);
  useSSE(token, 'payment_new', loadCounts);
  useSSE(token, 'feedback_new', loadCounts);
  useSSE(token, 'refund_request_new', loadCounts);
  useSSE(token, 'refund_requests_updated', loadCounts);
  useSSE(token, 'vouchers_updated', loadCounts);

  useEffect(() => {
    window.addEventListener('payment-viewed', loadCounts);
    window.addEventListener('refund-request-viewed', loadCounts);
    window.addEventListener('feedback-replied', loadCounts);
    return () => {
      window.removeEventListener('payment-viewed', loadCounts);
      window.removeEventListener('refund-request-viewed', loadCounts);
      window.removeEventListener('feedback-replied', loadCounts);
    };
  }, [loadCounts]);

  async function handleLogout() {
    await onLogout?.();
    clearSession();
    navigate('/', { replace: true });
  }

  const translatedTitle = translateText(meta.title, currentLang);
  const translatedDesc = translateText(meta.description, currentLang);

  return (
    <DashboardShell
      brand={{
        ...MANAGER_BRAND,
        tagline: translateText(MANAGER_BRAND.tagline, currentLang),
        logo: <Drop size={24} weight="fill" className="text-primary" aria-hidden />,
      }}
      menuItems={MANAGER_MENU_ITEMS}
      badges={badges}
      user={{
        name: user?.name || t('manager.layout.manager'),
        roleLabel: t('manager.layout.branchManager'),
      }}
      onLogout={handleLogout}
      header={
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{translatedTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{translatedDesc}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQRScanner(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              title={t('manager.layout.scanQr')}
            >
              <QrCode size={20} weight="bold" />
            </button>
            <NotificationBell />
          </div>
        </div>
      }
    >
      <Outlet context={{ user }} />
      
      {showQRScanner && (
        <ManagerQRScanner
          onClose={() => setShowQRScanner(false)}
          onCheckedIn={(b) => {
            setShowQRScanner(false);
            if (b?._id) navigate(`/manager/bookings/${b._id}`);
          }}
        />
      )}

      {pendingCheckinBooking && (
        <ManagerCheckInConfirmModal
          booking={pendingCheckinBooking}
          onClose={() => setPendingCheckinBooking(null)}
          onConfirmed={(bookingId) => {
            setPendingCheckinBooking(null);
            navigate(`/manager/bookings/${bookingId}`);
          }}
        />
      )}
    </DashboardShell>
  );
}
