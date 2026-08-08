import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { CaretLeft, CaretRight, ArrowClockwise, CalendarBlank, Clock, User, Car, XCircle } from '@phosphor-icons/react';
import { useNavigate, useSearchParams, useLocation, useOutletContext } from 'react-router-dom';

function api(path, opts = {}) {
  return fetch(`${getApiBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}`, ...opts.headers },
    ...opts,
  });
}

const STATUS_COLOR = {
  pending: { bg: 'bg-amber-400', bgSoft: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  confirmed: { bg: 'bg-indigo-500', bgSoft: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  checked_in: { bg: 'bg-cyan-500', bgSoft: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  in_progress: { bg: 'bg-blue-500', bgSoft: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  awaiting_payment: { bg: 'bg-orange-500', bgSoft: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  completed: { bg: 'bg-emerald-500', bgSoft: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  cancelled: { bg: 'bg-slate-300', bgSoft: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200' },
};

const STATUS_LABEL = {
  pending: 'Chờ',
  confirmed: 'Đã xác nhận',
  checked_in: 'Check-in',
  in_progress: 'Đang rửa',
  awaiting_payment: 'Chờ thanh toán',
  completed: 'Xong',
  cancelled: 'Đã hủy',
};

import { useSystemConfig } from '@/hooks/useSystemConfig';
import useSSE from '@/hooks/useSSE';

// Generate time slots based on config
function generateTimeSlots(config) {
  const slots = [];
  const interval = config?.slotInterval || 30;
  
  const parseTime = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':');
    return parseInt(h, 10) * 60 + parseInt(m, 10);
  };

  const addSlots = (start, end) => {
    const open = parseTime(start);
    const close = parseTime(end);
    if (open === null || close === null) return;
    for (let current = open; current < close; current += interval) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  };

  if (config && (config.morning || config.afternoon)) {
    if (config.morning?.start && config.morning?.end) {
      addSlots(config.morning.start, config.morning.end);
    }
    if (config.afternoon?.start && config.afternoon?.end) {
      addSlots(config.afternoon.start, config.afternoon.end);
    }
  } else {
    for (let current = 6 * 60; current <= 21 * 60; current += interval) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

function isNewBooking(b) {
  return b?.status === 'pending';
}

function formatDateVN(d) {
  return d.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function toDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function BookingCard({ booking, onClick }) {
  const cfg = STATUS_COLOR[booking.status] || STATUS_COLOR.pending;
  const fresh = isNewBooking(booking);

  return (
    <div
      onClick={onClick}
      className={`relative cursor-pointer rounded-xl border p-3 transition-all hover:shadow-md hover:-translate-y-0.5 bg-white ${cfg.border}`}
    >
      {fresh && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 ring-2 ring-white shadow-sm z-10">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
        </span>
      )}
      <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.bgSoft} ${cfg.text}`}>
            {STATUS_LABEL[booking.status]}
          </span>
          {booking.isWalkIn && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-pink-50 text-pink-700 border border-pink-200">
              Tạo tại cửa hàng
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
          <Clock size={12} weight="bold" />
          {booking.endTime ? `Đến ${booking.endTime}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm mb-1 truncate">
        <User size={14} className="text-slate-400 shrink-0" weight="bold" />
        <span className="truncate">{booking.userId?.name || 'Khách vãng lai'}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        <Car size={14} className="text-slate-400 shrink-0" weight="bold" />
        <span className="font-medium text-slate-700 truncate">{booking.vehicleId?.licensePlate || 'Chưa cập nhật xe'}</span>
      </div>
      <div className="text-[11px] text-slate-500 truncate bg-slate-50 rounded-lg px-2 py-1 mt-2 border border-slate-100">
        {booking.packageId?.name || 'Chưa chọn dịch vụ'}
      </div>
    </div>
  );
}

export default function ManagerSchedule() {
  const configs = useSystemConfig();
  const maxSlotCapacity = Number(configs?.DEFAULT_BRANCH_CAPACITY) || 4;

  const { user } = useOutletContext();
  const branchId = user?.branchId;
  const [scheduleConfig, setScheduleConfig] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const dateParam = searchParams.get('date');
  const [date, setDate] = useState(() => dateParam ? new Date(dateParam + 'T00:00:00') : new Date());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async (d) => {
    setLoading(true); setError('');
    try {
      const dateStr = toDateStr(d);
      
      let currentConfig = scheduleConfig;
      if (branchId && !currentConfig) {
        const bRes = await api(`/branches/${branchId}`);
        if (bRes.ok) {
          const bData = await bRes.json();
          currentConfig = bData.data?.scheduleConfig || {};
          setScheduleConfig(currentConfig);
        }
      }

      const res = await api(`/bookings?dateFrom=${dateStr}&dateTo=${dateStr}&limit=200&page=1`);
      if (!res.ok) throw new Error('Không thể tải lịch');
      const data = await res.json();
      const list = data?.data?.bookings || data?.data || [];
      setBookings(Array.isArray(list) ? list : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // Real-time updates for new bookings and slot changes
  const token = getStoredToken();
  useSSE(token, 'slots_updated', () => load(date));
  useSSE(token, 'payment_new', () => load(date));
  useSSE(token, 'booking_updated', () => load(date));

  function handleDateChange(newDate) {
    setDate(newDate);
    setSearchParams({ date: toDateStr(newDate) });
  }

  function prevDay() { const d = new Date(date); d.setDate(d.getDate() - 1); handleDateChange(d); }
  function nextDay() { const d = new Date(date); d.setDate(d.getDate() + 1); handleDateChange(d); }
  function goToday() { handleDateChange(new Date()); }

  const interval = scheduleConfig?.slotInterval || 30;
  const TIME_SLOTS = generateTimeSlots(scheduleConfig);

  // Helper to round time to nearest interval
  const roundToNearestInterval = (timeStr) => {
    if (!timeStr) return timeStr;
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return timeStr;
    
    const totalMinutes = h * 60 + m;
    const roundedMinutes = Math.round(totalMinutes / interval) * interval;
    
    const newH = Math.floor(roundedMinutes / 60) % 24;
    const newM = roundedMinutes % 60;
    
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  };

  // Group bookings by time slot
  const bookingsBySlot = {};
  TIME_SLOTS.forEach(slot => { bookingsBySlot[slot] = []; });

  bookings.forEach(b => {
    // Làm tròn thời gian về khung giờ gần nhất để gom nhóm trên UI
    const originalTime = b.startTime;
    const t = originalTime ? roundToNearestInterval(originalTime) : originalTime;
    
    if (bookingsBySlot[t]) {
      bookingsBySlot[t].push(b);
    } else if (t) {
      bookingsBySlot[t] = [b]; // For custom times not in TIME_SLOTS
    }
  });

  const isToday = toDateStr(date) === toDateStr(new Date());
  const byStatus = bookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});

  // Thực tế: Chỉ tính xe mới tới (checked_in) và đang thao tác (in_progress) là chiếm khoang rửa. Xe chờ thanh toán coi như đã dời ra bãi.
  const currentOccupied = bookings.filter(b => ['checked_in', 'in_progress'].includes(b.status)).length;
  const currentAvailable = Math.max(0, maxSlotCapacity - currentOccupied);

  // Sort slots so custom times appear in order if any
  const sortedSlots = Object.keys(bookingsBySlot).sort();

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <button onClick={prevDay} className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
            <CaretLeft size={14} />
          </button>
          <div className="px-3 py-1.5 text-sm font-semibold text-slate-800 min-w-52 text-center">
            {formatDateVN(date)}
          </div>
          <button onClick={nextDay} className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
            <CaretRight size={14} />
          </button>
        </div>
        <button onClick={goToday}
          className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors shadow-sm ${isToday ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}>
          Hôm nay
        </button>
        {!isToday && (
          <button onClick={goToday}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
            <XCircle size={14} /> Xóa bộ lọc
          </button>
        )}
        <input type="date" value={toDateStr(date)}
          onChange={(e) => { if (e.target.value) handleDateChange(new Date(e.target.value + 'T00:00:00')); }}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm" />
        <button onClick={() => load(date)} disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 shadow-sm">
          <ArrowClockwise size={12} className={loading ? 'animate-spin' : ''} /> Làm mới
        </button>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        {isToday && (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-sm border ${currentAvailable > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            <Car size={14} weight="fill" />
            <span>Khoang rửa đang trống: {currentAvailable}/{maxSlotCapacity} xe</span>
          </div>
        )}
        {(byStatus['pending'] || 0) > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            <span>{byStatus['pending']} mới · chờ xác nhận</span>
          </div>
        )}
        {Object.entries(STATUS_LABEL).map(([k, label]) => {
          if (k === 'pending') return null;
          const count = byStatus[k] || 0;
          if (!count) return null;
          const cfg = STATUS_COLOR[k];
          return (
            <div key={k} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.bgSoft} ${cfg.text} border ${cfg.border}`}>
              <span>{label}</span>
              <span className="rounded-full bg-white/50 px-1.5 py-0.5 text-[10px]">{count}</span>
            </div>
          );
        })}
        {bookings.length === 0 && !loading && (
          <p className="text-xs text-slate-400 flex items-center h-7">Không có lịch nào trong ngày này.</p>
        )}
      </div>

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedSlots.map(slot => {
            const items = bookingsBySlot[slot];
            // Lượt đặt ở trạng thái ( ko hiển thị trạng thái hoàn thành với trạng thái hủy) để quản lý slot đặt lịch xem thử còn slot nào trống.
            const activeCount = items.filter(b => ['pending', 'confirmed', 'checked_in', 'in_progress'].includes(b.status)).length;
            const isFull = activeCount >= maxSlotCapacity;
            const hasItems = items.length > 0;

            // Only show slots that have items OR are within standard hours
            if (!hasItems && !TIME_SLOTS.includes(slot)) return null;

            let isPast = false;
            let isFullyPast = false;
            if (isToday) {
              const now = new Date();
              const currentMinutes = now.getHours() * 60 + now.getMinutes();
              const slotMinutes = parseInt(slot.split(':')[0], 10) * 60 + parseInt(slot.split(':')[1], 10);
              if (slotMinutes <= currentMinutes) {
                isPast = true;
                if (activeCount === 0) isFullyPast = true;
              }
            }

            return (
              <div key={slot} className={`flex flex-col rounded-2xl border ${isFull ? 'border-red-200 bg-red-50/20' : isFullyPast ? 'border-slate-200 bg-slate-100/50 opacity-75' : 'border-slate-200 bg-slate-50/50'} overflow-hidden shadow-sm transition-all hover:border-blue-200`}>
                <div className={`px-4 py-3 flex items-center justify-between border-b ${isFull ? 'border-red-100 bg-red-50' : isFullyPast ? 'border-slate-200 bg-slate-100' : 'border-slate-100 bg-white'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-lg tracking-tight">{slot}</span>
                    {isPast && <span className="text-[10px] font-semibold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-sm">Đã qua</span>}
                    {activeCount > 0 && !isFull && <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-sm" title="Đang có lịch" />}
                    {isFull && <span className="flex h-2 w-2 rounded-full bg-red-500 shadow-sm animate-pulse" title="Đã đầy" />}
                  </div>
                  <div className={`text-[11px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${isFull ? 'bg-red-100 text-red-700' : isFullyPast ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-600'}`}>
                    {activeCount}/{maxSlotCapacity} LƯỢT
                  </div>
                </div>

                <div className="p-3 flex flex-col gap-2 min-h-[120px]">
                  {!hasItems ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2 opacity-50">
                      <CalendarBlank size={24} weight="duotone" />
                      <span className="text-xs font-medium">Slot trống</span>
                    </div>
                  ) : (
                    items.map(b => (
                      <BookingCard key={b._id} booking={b} onClick={() => navigate(`/manager/bookings/${b._id}`, { state: { from: location.pathname + location.search } })} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
