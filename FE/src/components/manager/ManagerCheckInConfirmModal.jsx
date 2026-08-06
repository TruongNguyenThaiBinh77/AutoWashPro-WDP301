import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Warning, User, Car, Clock, Package, MapPin } from '@phosphor-icons/react';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';

function formatCurrency(amt) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amt || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function ManagerCheckInConfirmModal({ booking, onClose, onConfirmed }) {
  const { t } = useTranslation('manager');
  const [busy, setBusy] = useState(false);
  const token = getStoredToken();
  const apiBase = getApiBaseUrl();

  if (!booking) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const bDateStr = booking.bookingDate ? new Date(booking.bookingDate).toISOString().split('T')[0] : '';
  const isToday = bDateStr === todayStr;

  const customerName = booking.userId?.name || booking.userId?.fullName || booking.customerName || booking.customerSnapshot?.name || t('fallback_customer');
  const customerPhone = booking.userId?.phone || booking.customerPhone || booking.customerSnapshot?.phone || '';
  const licensePlate = booking.vehicleId?.licensePlate || booking.licensePlate || 'N/A';
  const vehicleName = booking.vehicleId?.model ? `${booking.vehicleId?.brand || ''} ${booking.vehicleId?.model}` : '';

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/bookings/${booking._id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'checked_in' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t('cannot_confirm'));
      }
      onConfirmed(booking._id);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    try {
      await fetch(`${apiBase}/bookings/${booking._id}/reject-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: t('reject_reason') }),
      }).catch(() => {});
    } finally {
      setBusy(false);
      onClose();
    }
  };

  const packageName = booking.packageId?.name || booking.packageName || t('fallback_package');
  const packagePrice = booking.packagePrice ?? booking.packageId?.price ?? 0;
  const branchName = booking.branchId?.name || booking.branchName || t('fallback_branch');

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <XCircle size={28} weight="fill" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <CheckCircle size={28} weight="duotone" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900">{t('checkin_title')}</h3>
            <p className="text-xs text-slate-500 font-medium">{t('booking_code')}: #{booking._id?.slice(-8).toUpperCase()}</p>
          </div>
        </div>

        {/* Date Warning Notice */}
        {!isToday ? (
          <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
            <Warning size={24} className="text-amber-600 shrink-0 mt-0.5" weight="fill" />
            <div>
              <p className="text-xs font-bold text-amber-800">{t('warning_title')}</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                {t('warning_desc', { date: formatDate(bDateStr), today: formatDate(todayStr) })}
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-emerald-800 text-xs font-bold">
            <CheckCircle size={20} className="text-emerald-600 shrink-0" weight="fill" />
            {t('today_ok', { date: formatDate(todayStr) })}
          </div>
        )}

        {/* Info Grid */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 text-xs mb-6">
          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <User size={16} className="text-slate-400" />
              {t('customer')}:
            </div>
            <div className="font-bold text-slate-800 text-right">
              {customerName} {customerPhone ? `(${customerPhone})` : ''}
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <Car size={16} className="text-slate-400" />
              {t('license_plate')}:
            </div>
            <div className="font-bold text-indigo-600 text-right bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
              {licensePlate} {vehicleName ? `- ${vehicleName}` : ''}
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <Package size={16} className="text-slate-400" />
              {t('package')}:
            </div>
            <div className="font-bold text-slate-800 text-right">
              {packageName} <span className="text-emerald-600 font-semibold">({formatCurrency(packagePrice)})</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <Clock size={16} className="text-slate-400" />
              {t('time_slot')}:
            </div>
            <div className="font-bold text-slate-800 text-right">
              {booking.startTime || '10:00'} - {formatDate(bDateStr)}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <MapPin size={16} className="text-slate-400" />
              {t('branch_field')}:
            </div>
            <div className="font-semibold text-slate-700 text-right truncate max-w-[200px]">
              {branchName}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleReject}
            disabled={busy}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 transition-colors disabled:opacity-50 text-sm"
          >
            {t('reject')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
          >
            {busy ? (
              t('processing')
            ) : (
              <>
                <CheckCircle size={18} weight="bold" />
                {t('confirm_checkin')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
