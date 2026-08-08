/**
 * AutoWashPro History Screen
 * Calendar + List views with booking management actions
 * Header + style matching booking tab
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text as RNText,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { format, parseISO, isSameDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, getDaysInMonth, addDays, subDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { bookingApi, slotPackApi } from '../../src/api';
import {
  Text as AppText,
  Card,
  Button,
  Loading,
  EmptyState,
  Icon,
  Icons,
  PressableScale,
  ScreenContainer,
  BookingStatusBadge,
  Skeleton,
  useToast,
  RatingSheet,
  AlertDialog,
} from '../../src/components/common';
import { useColors } from '../../src/theme/ThemeContext';
import { spacing, borderRadius, shadows } from '../../src/theme/spacing';
import { sseService } from '../../src/services/sse';
import type { Booking, BookingStatus, SlotPack } from '../../src/types';
import { formatCurrency, translateDynamicText } from '../../src/utils';
import { useTranslation } from 'react-i18next';

type ViewMode = 'calendar' | 'week' | 'list' | 'slot_packs';
type FilterKey = 'all' | 'upcoming' | 'in_progress' | 'completed' | 'cancelled';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'upcoming', label: 'Sắp tới' },
  { key: 'in_progress', label: 'Đang thực hiện' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
];

// Mirror web HistoryPage list filters
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'pending', label: 'Chờ xử lý' },
  { value: 'confirmed', label: 'Đã xác nhận' },
  { value: 'checked_in', label: 'Đã check-in' },
  { value: 'in_progress', label: 'Đang rửa' },
  { value: 'awaiting_payment', label: 'Chờ thanh toán' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
];
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Tất cả loại' },
  { value: 'single', label: 'Lịch thường' },
  { value: 'recurring', label: 'Lịch định kỳ' },
];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: '-createdAt', label: 'Mới nhất' },
  { value: 'createdAt', label: 'Cũ nhất' },
  { value: '-bookingDate', label: 'Gần đây nhất (Ngày hẹn)' },
];

// Mirrors the StatusBadge mapping in the web HistoryPage.jsx
const SLOTS_KEY: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Còn hiệu lực', color: '#10b981', bg: '#ecfdf5' },
  exhausted: { label: 'Đã dùng hết', color: '#6b7280', bg: '#f9fafb' },
  expired: { label: 'Hết hạn', color: '#ef4444', bg: '#fef2f2' },
  cancelled: { label: 'Đã hủy', color: '#94a3b8', bg: '#f1f5f9' },
};

function getPackStatusInfo(pack: any): { label: string; color: string; bg: string } {
  if (pack.status === 'active' && pack.remainingSlots <= 0) {
    return SLOTS_KEY.exhausted;
  }
  return SLOTS_KEY[pack.status] ?? SLOTS_KEY.cancelled;
}

const DAYS_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS_VN = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

function getDotColor(status: BookingStatus): string {
  switch (status) {
    case 'completed': return '#16A34A';
    case 'cancelled': return '#94A3B8';
    case 'pending': return '#F59E0B';
    // awaiting_payment — xe đã rửa xong, chờ khách trả nốt phần còn lại.
    // Tông indigo để phân biệt với completed (xanh) và in_progress (cyan).
    case 'awaiting_payment': return '#6366F1';
    default: return '#10B981';
  }
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const colors = useColors();
  const toast = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');

  // Calendar state
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // List filter
  const [filter, setFilter] = useState<FilterKey>('all');

  // List dropdown filters (mirror web HistoryPage.jsx)
  const [keyword, setKeyword] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [sort, setSort] = useState<string>('-createdAt');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Pagination (web uses limit=50 with server-side paging)
  const [page, setPage] = useState(1);
  const limit = 20;

  // Week-view state (Monday-based start)
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Slot pack view state
  const [slotPacks, setSlotPacks] = useState<SlotPack[]>([]);
  const [slotPacksLoading, setSlotPacksLoading] = useState(false);
  
  // Slot Pack Cancel OTP
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [packToCancel, setPackToCancel] = useState<SlotPack | null>(null);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);

  // Recurring Cancel OTP
  const [showRecurringOtpModal, setShowRecurringOtpModal] = useState(false);
  const [recurringOtpCode, setRecurringOtpCode] = useState('');
  const [recurringGroupIdToCancel, setRecurringGroupIdToCancel] = useState<string | null>(null);
  const [isRequestingRecurringOtp, setIsRequestingRecurringOtp] = useState(false);
  const [isConfirmingRecurringCancel, setIsConfirmingRecurringCancel] = useState(false);

  // Usage History Modal
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [usageHistory, setUsageHistory] = useState<any[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detail modal
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Cancel modal
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // Recurring Modal
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringGroupBookings, setRecurringGroupBookings] = useState<Booking[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringCancelLoading, setRecurringCancelLoading] = useState(false);

  // Review modal — delegates all rating UI to the shared `RatingSheet`.
  // Keeps only the booking context here.
  const [showReview, setShowReview] = useState(false);

  // Rebook modal
  const [showRebook, setShowRebook] = useState(false);
  const [rebookDate, setRebookDate] = useState('');
  const [rebookTime, setRebookTime] = useState('');
  const [rebookLoading, setRebookLoading] = useState(false);
  const [rebookError, setRebookError] = useState('');

  // QR modal
  const [showQR, setShowQR] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  const fetchBookings = useCallback(
    async (overridePage?: number) => {
      const targetPage = overridePage ?? page;
      try {
        const params: any = {
          page: targetPage,
          limit,
        };
        if (keyword.trim()) params.keyword = keyword.trim();
        if (statusFilter) params.status = statusFilter;
        if (typeFilter) params.bookingType = typeFilter;
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
        if (sort) params.sort = sort;
        const result = await bookingApi.getMyBookings(params);
        setBookings(result.data || []);
      } catch (error) {
        console.error('Error fetching bookings:', error);
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    // The effect re-fetches on each filter / sort / page change, so we keep
    // these in the dep list and intentionally ignore the function's own
    // identity (we want a stable reference for the effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyword, statusFilter, typeFilter, dateFrom, dateTo, sort, page],
  );

  const fetchSlotPacks = useCallback(async () => {
    try {
      setSlotPacksLoading(true);
      const data = await slotPackApi.getMySlotPacks();
      setSlotPacks(data || []);
    } catch (e) {
      console.error('Error fetching slot packs:', e);
    } finally {
      setSlotPacksLoading(false);
    }
  }, []);

  const handleCancelSlotPack = (slotPack: SlotPack) => {
    const isUnused = slotPack.usedSlots === 0;
    const warningMsg = isUnused
      ? 'Bạn có chắc chắn muốn hủy gói lượt này? Hệ thống sẽ gửi mã OTP qua email để xác nhận và hoàn tiền nếu đủ điều kiện.'
      : 'Gói của bạn đã được sử dụng nên sẽ KHÔNG được hoàn tiền nếu hủy. Bạn vẫn muốn tiếp tục hủy?';

    AlertDialog.confirm(
      'Yêu cầu hủy gói',
      warningMsg,
      async () => {
        setIsRequestingOtp(true);
        try {
          await slotPackApi.requestCancelOtp(slotPack._id);
          setPackToCancel(slotPack);
          setOtpCode('');
          setShowOtpModal(true);
          toast.success('Thành công', 'Mã OTP đã được gửi đến email của bạn');
        } catch (error: any) {
          AlertDialog.error('Lỗi', error.response?.data?.message || 'Không thể yêu cầu hủy gói');
        } finally {
          setIsRequestingOtp(false);
        }
      },
      undefined,
      'Đồng ý',
      'Đóng'
    );
  };

  const handleConfirmCancelOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast.error('Lỗi', 'Vui lòng nhập đúng 6 số OTP');
      return;
    }
    if (!packToCancel) return;

    setIsConfirmingCancel(true);
    try {
      await slotPackApi.cancelSlotPack(packToCancel._id, otpCode);
      const isUnused = packToCancel.usedSlots === 0;
      const successMsg = isUnused
        ? 'Hủy gói thành công. Tiền đã được hoàn vào ví hoặc đang xử lý theo chính sách.'
        : 'Gói đã được hủy. Bạn không được hoàn tiền theo chính sách sử dụng gói.';
      
      toast.success('Đã hủy gói', successMsg);
      setShowOtpModal(false);
      setPackToCancel(null);
      fetchSlotPacks();
    } catch (error: any) {
      AlertDialog.error('Lỗi', error.response?.data?.message || 'Xác nhận OTP thất bại');
    } finally {
      setIsConfirmingCancel(false);
    }
  };

  const handleQuickBook = (item: SlotPack) => {
    const branchId = typeof item.branchId === 'object' ? (item.branchId as any)._id : item.branchId;
    const packageId = typeof item.packageId === 'object' ? (item.packageId as any)._id : item.packageId;
    const vehicleId = typeof item.vehicleId === 'object' ? (item.vehicleId as any)._id : item.vehicleId;
    router.push({
      pathname: '/booking',
      params: {
        branchId,
        packageId,
        vehicleId,
        quickBook: 'true',
        quickBookSlotPackId: item._id,
      },
    } as any);
  };

  const openUsageHistory = async (item: SlotPack) => {
    setShowUsageModal(true);
    setUsageLoading(true);
    setUsageHistory([]);
    try {
      const history = await slotPackApi.getSlotPackUsageHistory(item._id);
      setUsageHistory(history || []);
    } catch (e: any) {
      toast.error('Lỗi tải lịch sử', e.message);
      setShowUsageModal(false);
    } finally {
      setUsageLoading(false);
    }
  };

  // Initial load + filter-driven refetch (debounced for the keyword input).
  useEffect(() => {
    setIsLoading(true);
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      fetchBookings(1);
      setPage(1);
    }, 400);
    return () => {
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    };
  }, [fetchBookings]);

  // Subscribe to real-time events for bookings & feedback updates
  //
  // H-7 SAFETY: trước đây 4 listener (`my_bookings_updated`, `booking_update`,
  // `notification`, `all`) cùng gọi fetchBookings() đồng thời khi BE bắn 1 event
  // (vd: manager confirm booking → BE gửi cả 3-4 event). Kết quả: 4 request song
  // song tới /bookings/my, UI nhảy dữ liệu + tốn bandwidth. Giờ debounce 600ms
  // gom tất cả event trong cùng 1 "burst" thành 1 lần fetch.
  useEffect(() => {
    let sseFetchTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (sseFetchTimer) clearTimeout(sseFetchTimer);
      sseFetchTimer = setTimeout(() => {
        fetchBookings();
        sseFetchTimer = null;
      }, 600);
    };

    const unsub1 = sseService.subscribe('my_bookings_updated', debouncedFetch);
    const unsub2 = sseService.subscribe('booking_update', debouncedFetch);
    const unsub3 = sseService.subscribe('notification', debouncedFetch);
    const unsub4 = sseService.subscribe('all', debouncedFetch);

    return () => {
      if (sseFetchTimer) {
        clearTimeout(sseFetchTimer);
        sseFetchTimer = null;
      }
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [fetchBookings]);

  // Slot packs are loaded on demand when entering the slot_packs view.
  useEffect(() => {
    if (viewMode === 'slot_packs') {
      fetchSlotPacks();
    }
  }, [viewMode, fetchSlotPacks]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings(1);
    setPage(1);
  };

  // Bookmarks by date
  const bookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    bookings.forEach(b => {
      const key = new Date(b.bookingDate).toISOString().split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [bookings]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(new Date(viewYear, viewMonth));
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    const prevMonthDays = getDaysInMonth(new Date(viewYear, viewMonth === 0 ? 11 : viewMonth - 1));
    for (let i = firstDay - 1; i >= 0; i--) {
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({ date: new Date(y, m, prevMonthDays - i), isCurrentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(viewYear, viewMonth, d), isCurrentMonth: true });
    }

    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({ date: new Date(y, m, d), isCurrentMonth: false });
    }

    return days;
  }, [viewYear, viewMonth]);

  // Navigation
  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else { setViewMonth(m => m - 1); }
    setSelectedDate(null);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else { setViewMonth(m => m + 1); }
    setSelectedDate(null);
  }, [viewMonth]);

  const goToday = useCallback(() => {
    const d = new Date();
    setViewMonth(d.getMonth());
    setViewYear(d.getFullYear());
    setSelectedDate(d);
  }, []);

  // Stats
  const stats = useMemo(() => {
    let pending = 0, confirmed = 0, completed = 0, cancelled = 0, awaitingPayment = 0;
    bookings.forEach(b => {
      if (b.status === 'pending') pending++;
      else if (b.status === 'confirmed') confirmed++;
      else if (b.status === 'completed') completed++;
      else if (b.status === 'cancelled') cancelled++;
      else if (b.status === 'awaiting_payment') awaitingPayment++;
    });
    return { pending, confirmed, completed, cancelled, awaitingPayment };
  }, [bookings]);

  // Recurring Group
  const loadRecurringGroup = useCallback(async (groupId: string) => {
    setRecurringLoading(true);
    setShowRecurringModal(true);
    try {
        const result = await bookingApi.getMyBookings({ recurringGroupId: groupId, limit: 100 });
        const sortedBookings = (result.data || []).sort((a: any, b: any) => {
          const dateA = new Date(a.bookingDate).getTime();
          const dateB = new Date(b.bookingDate).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return (a.startTime || '').localeCompare(b.startTime || '');
        });
        setRecurringGroupBookings(sortedBookings);
    } catch {
      toast.error('Không thể tải nhóm định kỳ');
    } finally {
      setRecurringLoading(false);
    }
  }, [toast]);

  const handleRequestRecurringCancel = async (groupId: string) => {
    setIsRequestingRecurringOtp(true);
    try {
      const preview = await bookingApi.getRecurringCancelPreview(groupId);
      const { totalRefundAmount, totalPenaltyAmount, pendingCount } = preview;
      
      const refundText = totalRefundAmount > 0 
        ? `Số tiền hoàn lại: ${formatCurrency(totalRefundAmount)}` 
        : `Số tiền hoàn lại: 0 ₫`;
      const penaltyText = totalPenaltyAmount > 0 
        ? `\nPhí phạt: ${formatCurrency(totalPenaltyAmount)}` 
        : '';
        
      Alert.alert(
        'Xác nhận hủy nhóm định kỳ',
        `Bạn đang hủy ${pendingCount} lịch.\n${refundText}${penaltyText}\n\nHệ thống sẽ gửi mã OTP qua email để xác nhận. Bạn có chắc chắn muốn tiếp tục?`,
        [
          { text: 'Hủy bỏ', style: 'cancel' },
          { 
            text: 'Nhận OTP', 
            onPress: async () => {
              try {
                await bookingApi.requestRecurringCancelOtp(groupId);
                setRecurringGroupIdToCancel(groupId);
                setRecurringOtpCode('');
                setShowRecurringOtpModal(true);
                toast.success('Đã gửi mã OTP đến email của bạn');
              } catch (error: any) {
                toast.error('Lỗi', error.response?.data?.message || 'Không thể yêu cầu OTP');
              }
            } 
          }
        ]
      );
    } catch (error: any) {
      toast.error('Lỗi', error.response?.data?.message || 'Không thể lấy thông tin hủy');
    } finally {
      setIsRequestingRecurringOtp(false);
    }
  };

  const handleConfirmRecurringCancel = async () => {
    if (!recurringGroupIdToCancel) return;
    if (recurringOtpCode.length !== 6) {
      toast.error('Lỗi', 'Vui lòng nhập đủ 6 số OTP');
      return;
    }
    
    setIsConfirmingRecurringCancel(true);
    try {
      await bookingApi.cancelRecurringGroup(recurringGroupIdToCancel, recurringOtpCode);
      toast.success('Đã hủy toàn bộ nhóm định kỳ');
      setShowRecurringOtpModal(false);
      setShowRecurringModal(false);
      setRecurringGroupIdToCancel(null);
      fetchBookings(1);
      setPage(1);
      if (detailBooking) {
        setDetailBooking(null);
      }
    } catch (error: any) {
      toast.error('Lỗi', error.response?.data?.message || 'Hủy nhóm thất bại');
    } finally {
      setIsConfirmingRecurringCancel(false);
    }
  };

  const handleCancelRecurringGroup = useCallback(async (groupId: string) => {
    handleRequestRecurringCancel(groupId);
  }, []);

  // Local UI list filter (chip-row). When dropdown filters are present,
  // the server already returned a narrowed list — `filteredBookings` then
  // only applies the chip filter on top.
  const dropdownFilteredBookings = useMemo(() => {
    return bookings;
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    if (filter === 'all') return dropdownFilteredBookings;
    return dropdownFilteredBookings.filter(b => {
      if (filter === 'upcoming') return b.status === 'pending' || b.status === 'confirmed';
      // 'in_progress' group covers all "active" states where the booking is still
      // in motion: just-arrived, being washed, or waiting for the remaining payment.
      if (filter === 'in_progress') return b.status === 'checked_in' || b.status === 'in_progress' || b.status === 'awaiting_payment';
      if (filter === 'completed') return b.status === 'completed';
      if (filter === 'cancelled') return b.status === 'cancelled';
      return true;
    });
  }, [dropdownFilteredBookings, filter]);

  // Load detail
  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const b = await bookingApi.getBooking(id);
      setDetailBooking(b);
    } catch {
      toast.error('Không thể tải chi tiết');
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  // Cancel
  const handleCancel = useCallback(() => {
    if (!detailBooking) return;
    setCancelError('');
    setCancelReason('');
    setShowCancelConfirm(true);
  }, [detailBooking]);

  const confirmCancel = useCallback(async () => {
    if (!detailBooking) return;
    if (!cancelReason.trim()) {
      setCancelError('Vui lòng nhập lý do hủy đơn');
      return;
    }
    setCancelLoading(true);
    setCancelError('');
    try {
      await bookingApi.cancelBooking(detailBooking._id, cancelReason.trim());
      toast.success('Đã hủy đơn thành công');
      setShowCancelConfirm(false);
      setDetailBooking(prev => prev ? { ...prev, status: 'cancelled' } : null);
      fetchBookings(1);
      setPage(1);
    } catch (e: any) {
      setCancelError(e?.response?.data?.message || 'Hủy thất bại');
    } finally {
      setCancelLoading(false);
    }
  }, [detailBooking, cancelReason, toast, fetchBookings]);

  // Review — the modal opens the shared `RatingSheet`. The sheet owns its
  // own rating/comment state and submit lifecycle.
  const openReview = useCallback(() => {
    if (!detailBooking) return;
    setShowReview(true);
  }, [detailBooking]);

  const submitReview = useCallback(
    async (rating: number, comment: string) => {
      if (!detailBooking) return;
      const updated = await bookingApi.submitFeedback(detailBooking._id, {
        rating,
        feedback: comment || undefined,
      });
      setDetailBooking((prev) => (prev ? { ...prev, ...updated } : null));
      setBookings((prev) => prev.map((b) => (b._id === updated._id ? { ...b, ...updated } : b)));
      setShowReview(false);
      toast.success('Đánh giá thành công!');
    },
    [detailBooking, toast],
  );

  // Rebook
  const handleRebook = useCallback(() => {
    if (!detailBooking) return;
    setRebookDate('');
    setRebookTime('');
    setRebookError('');
    setShowRebook(true);
  }, [detailBooking]);

  const submitRebook = useCallback(async () => {
    if (!detailBooking) return;
    setRebookError('');
    if (!rebookDate) { setRebookError('Vui lòng chọn ngày'); return; }
    if (!rebookTime) { setRebookError('Vui lòng chọn giờ'); return; }
    const selected = new Date(rebookDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (selected < today) { setRebookError('Ngày phải từ hôm nay trở đi'); return; }
    setRebookLoading(true);
    try {
      await bookingApi.rebookBooking(detailBooking._id, { bookingDate: rebookDate, startTime: rebookTime });
      toast.success('Đặt lại thành công!');
      setShowRebook(false);
      fetchBookings(1);
      setPage(1);
    } catch (e: any) {
      setRebookError(e?.response?.data?.message || 'Đặt lại thất bại');
    } finally {
      setRebookLoading(false);
    }
  }, [detailBooking, rebookDate, rebookTime, toast, fetchBookings]);

  // QR
  const handleShowQR = useCallback(async () => {
    if (!detailBooking) return;
    setQrLoading(true);
    setQrCode('');
    setShowQR(true);
    try {
      const result = await bookingApi.getBookingQR(detailBooking._id);
      setQrCode(result.qrDataUrl || '');
    } catch {
      toast.error('Không thể tạo mã QR');
      setShowQR(false);
    } finally {
      setQrLoading(false);
    }
  }, [detailBooking, toast]);

  const renderBookingItem = useCallback((b: Booking) => {
    const rawBranchName = typeof b.branchId === 'object' ? (b.branchId as any).name : '';
    const rawPackageName = typeof b.packageId === 'object' ? (b.packageId as any).name : 'Dịch vụ';
    const branchName = translateDynamicText(rawBranchName, i18n.language);
    const packageName = translateDynamicText(rawPackageName, i18n.language);
    const vehiclePlate = typeof b.vehicleId === 'object' ? (b.vehicleId as any).licensePlate : '';

    // "MỚI" badge (web parity): pulse red for bookings created in the
    // last 24h that are still relevant (pending/confirmed).
    const created = (b as any).createdAt ? new Date((b as any).createdAt) : null;
    const isNew =
      created &&
      Date.now() - created.getTime() < 24 * 60 * 60 * 1000 &&
      ['pending', 'confirmed'].includes(b.status);

    // Recurring bookings get a purple "Định kỳ" badge so the user can tell
    // them apart from one-off bookings at a glance. The same badge appears
    // in the day view (history/[date].tsx) so the two screens stay
    // consistent.
    const isRecurring = !!(b as any).isRecurring || !!(b as any).recurringGroupId;

    const handlePress = () => {
      router.push(`/booking/${b._id}` as any);
    };

    return (
      <PressableScale
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Đặt lịch ${packageName}`}
      >
        <Card style={[styles.bookingCard, isNew && { borderLeftWidth: 3, borderLeftColor: '#F43F5E' }, isRecurring && { borderLeftWidth: 3, borderLeftColor: '#8B5CF6' }]}>
          {/* Top: icon + package + status */}
          <View style={styles.visCardTop}>
            <View style={styles.visPackageRow}>
              <View style={[styles.visIconCircle, { backgroundColor: getStatusBg(b.status, colors) }]}>
                <Icon name={Icons.carOutline} size={13} color={getStatusFg(b.status, colors)} />
              </View>
              <AppText variant="body" color="textPrimary" style={styles.visPackageName} numberOfLines={1}>
                {packageName}
              </AppText>
              {isNew ? (
                <View style={{ backgroundColor: '#F43F5E', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <AppText style={{ fontSize: 9, color: '#FFF', fontWeight: '900', letterSpacing: 0.5 }}>MỚI</AppText>
                </View>
              ) : null}
              {isRecurring ? (
                <View style={{ backgroundColor: '#8B5CF6', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <AppText style={{ fontSize: 9, color: '#FFF', fontWeight: '900', letterSpacing: 0.5 }}>ĐỊNH KỲ</AppText>
                </View>
              ) : null}
            </View>
            <BookingStatusBadge status={b.status} />
          </View>

          {/* Branch */}
          <View style={styles.visInfoLine}>
            <Icon name={Icons.locationOutline} size={14} color={colors.textTertiary} />
            <AppText variant="bodySmall" color="textSecondary" numberOfLines={1} style={styles.visInfoText}>
              {branchName}
            </AppText>
          </View>

          {/* Time + date */}
          <View style={styles.visInfoLine}>
            <Icon name={Icons.timeOutline} size={14} color={colors.textTertiary} />
            <AppText variant="bodySmall" color="textSecondary" style={styles.visInfoText}>
              {b.startTime} · {format(parseISO(b.bookingDate), 'dd/MM/yyyy')}
            </AppText>
          </View>

          {/* Bottom: plate + price */}
          <View style={styles.visCardBottom}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {vehiclePlate ? (
                <View style={styles.visPlateTag}>
                  <AppText style={styles.visPlateText}>{vehiclePlate}</AppText>
                </View>
              ) : <View />}
              {b.paymentStatus === 'paid' ? (
                <View style={[styles.visPlateTag, { backgroundColor: colors.successLight }]}>
                  <AppText style={[styles.visPlateText, { color: colors.success }]}>Đã TT</AppText>
                </View>
              ) : (b.depositAmount ?? 0) > 0 && (b.depositPaid || b.paymentStatus === 'deposit_paid') ? (
                <View style={[styles.visPlateTag, { backgroundColor: colors.successLight }]}>
                  <AppText style={[styles.visPlateText, { color: colors.success }]}>Cọc {formatCurrency(b.depositAmount || 0)}</AppText>
                </View>
              ) : (b.depositAmount ?? 0) > 0 && !b.depositPaid ? (
                <View style={[styles.visPlateTag, { backgroundColor: colors.warningLight }]}>
                  <AppText style={[styles.visPlateText, { color: colors.warning }]}>Cọc {formatCurrency(b.depositAmount || 0)}</AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="body" color="primary" style={styles.visPrice}>
              {formatCurrency(b.finalPrice)}
            </AppText>
          </View>
          {isRecurring && (b as any).recurringGroupId ? (
            <TouchableOpacity 
              activeOpacity={0.7}
              style={{ paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, alignItems: 'center', marginTop: spacing.md }}
              onPress={() => setDetailBooking(b)}
            >
              <AppText variant="bodySmall" color="primary" style={{ fontFamily: 'Outfit-Medium' }}>
                Quản lý nhóm định kỳ
              </AppText>
            </TouchableOpacity>
          ) : null}
        </Card>
      </PressableScale>
    );
  }, [colors, loadDetail, loadRecurringGroup]);

  return (
    <ScreenContainer background="subtle" edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View>
          <AppText variant="h3" color="primary">
            Lịch sử đặt lịch
          </AppText>
          <AppText variant="label" color="textSecondary">
            Theo dõi các lịch đặt của bạn
          </AppText>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          {[1, 2, 3].map(i => (
            <Card key={i} style={styles.skeletonCard}>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Skeleton width={48} height={48} borderRadius={14} />
                <View style={{ flex: 1 }}>
                  <Skeleton width="60%" height={14} style={{ marginBottom: 8 }} />
                  <Skeleton width="80%" height={12} />
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <FlatList
          data={[0]}
          keyExtractor={() => 'main'}
          renderItem={() => (
            <View>
              {/* Stats Summary - Horizontal Scroll Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.statsScrollView}
                contentContainerStyle={styles.statsScrollContent}
              >
                {[
                  {
                    id: 'pending',
                    label: 'Chờ xử lý',
                    count: stats.pending,
                    color: '#EA580C',
                    bg: '#FFF7ED',
                    border: '#FDBA74',
                    activeBg: '#FFEDD5',
                    activeBorder: '#EA580C',
                    activeText: '#C2410C',
                  },
                  {
                    id: 'confirmed',
                    label: 'Đã xác nhận',
                    count: stats.confirmed,
                    color: '#2563EB',
                    bg: '#EFF6FF',
                    border: '#93C5FD',
                    activeBg: '#DBEAFE',
                    activeBorder: '#2563EB',
                    activeText: '#1D4ED8',
                  },
                  {
                    id: 'completed',
                    label: 'Hoàn thành',
                    count: stats.completed,
                    color: '#059669',
                    bg: '#ECFDF5',
                    border: '#A7F3D0',
                    activeBg: '#D1FAE5',
                    activeBorder: '#059669',
                    activeText: '#047857',
                  },
                  {
                    id: 'awaiting_payment',
                    label: 'Chờ thanh toán',
                    count: stats.awaitingPayment,
                    color: '#4F46E5',
                    bg: '#EEF2FF',
                    border: '#A5B4FC',
                    activeBg: '#E0E7FF',
                    activeBorder: '#4F46E5',
                    activeText: '#3730A3',
                  },
                  {
                    id: 'cancelled',
                    label: 'Đã hủy',
                    count: stats.cancelled,
                    color: '#64748B',
                    bg: '#F8FAFC',
                    border: '#CBD5E1',
                    activeBg: '#E2E8F0',
                    activeBorder: '#64748B',
                    activeText: '#475569',
                  },
                ].map((item) => {
                  const isActive = statusFilter === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id || 'all'}
                      activeOpacity={0.8}
                      onPress={() => {
                        setStatusFilter(item.id);
                        setViewMode('list');
                      }}
                      style={[
                        styles.statChip,
                        {
                          backgroundColor: isActive ? item.activeBg : item.bg,
                          borderColor: isActive ? item.activeBorder : item.border,
                          borderWidth: isActive ? 2 : 1,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statChipBadge,
                          {
                            backgroundColor: isActive ? item.activeBorder : item.color,
                          },
                        ]}
                      >
                        <RNText style={styles.statChipCount}>{item.count}</RNText>
                      </View>
                      <AppText
                        style={[
                          styles.statChipLabel,
                          {
                            color: isActive ? item.activeText : colors.textPrimary,
                            fontWeight: isActive ? '700' : '600',
                          },
                        ]}
                      >
                        {item.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* View toggle tabs */}
              <View style={[styles.toggleContainer, { backgroundColor: '#F1F5F9', borderColor: colors.border }]}>
                {[
                  { key: 'calendar', label: 'Lịch tháng', icon: Icons.calendarOutline },
                  { key: 'week', label: 'Lịch tuần', icon: Icons.calendarOutline },
                  { key: 'list', label: 'Danh sách', icon: Icons.listOutline },
                  { key: 'slot_packs', label: 'Gói lượt', icon: Icons.voucherOutline },
                ].map((tab) => {
                  const isSelected = viewMode === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      onPress={() => setViewMode(tab.key as ViewMode)}
                      activeOpacity={0.75}
                      style={[
                        styles.toggleBtn,
                        isSelected && [
                          styles.toggleBtnActive,
                          {
                            backgroundColor: colors.surface,
                            borderColor: '#A7F3D0',
                          },
                        ],
                      ]}
                    >
                      <Icon
                        name={tab.icon}
                        size={15}
                        color={isSelected ? colors.primary : '#64748B'}
                      />
                      <AppText
                        numberOfLines={1}
                        style={[
                          styles.toggleBtnText,
                          {
                            color: isSelected ? colors.primary : '#64748B',
                            fontWeight: isSelected ? '700' : '600',
                          },
                        ]}
                      >
                        {tab.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Calendar view */}
              {viewMode === 'calendar' && (
                <View style={[styles.calendarWrap, { backgroundColor: colors.background }]}>
                  {/* Month header */}
                  <View style={[styles.calHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn} activeOpacity={0.7}>
                      <Icon name={Icons.back} size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <View style={styles.calHeaderText}>
                      <AppText variant="h4" color="textPrimary">
                        {MONTHS_VN[viewMonth]} {viewYear}
                      </AppText>
                      <TouchableOpacity onPress={goToday} style={[styles.todayBtn, { backgroundColor: '#DCFCE7' }]} activeOpacity={0.7}>
                        <AppText variant="caption" style={{ color: '#16A34A', fontWeight: '700' }}>Hôm nay</AppText>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn} activeOpacity={0.7}>
                      <Icon name={Icons.forward} size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  {/* DOW */}
                  <View style={[styles.dowRow, { borderBottomColor: colors.border }]}>
                    {DAYS_VN.map((d, i) => (
                      <View key={d} style={styles.dowCell}>
                        <AppText style={[styles.dowText, i === 0 && { color: '#EF4444' }]}>{d}</AppText>
                      </View>
                    ))}
                  </View>

                  {/* Grid */}
                  <View style={styles.calGrid}>
                    {calendarDays.map((day, idx) => {
                      const key = localDateKey(day.date);
                      const dayBks = bookingsByDate[key] || [];
                      const today = isSameDay(day.date, new Date());
                      const isSelected = selectedDate && isSameDay(day.date, selectedDate);

                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => router.push(`/history/${localDateKey(day.date)}` as any)}
                          style={[
                            styles.dayCell,
                            {
                              backgroundColor: isSelected ? colors.primarySubtle : today ? '#FEFCE8' : day.isCurrentMonth ? 'transparent' : colors.surface,
                              borderRightWidth: (idx % 7) < 6 ? StyleSheet.hairlineWidth : 0,
                              borderBottomWidth: idx < 35 ? StyleSheet.hairlineWidth : 0,
                              borderRightColor: colors.border,
                              borderBottomColor: colors.border,
                            },
                          ]}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.dayNumber, today && !isSelected && { backgroundColor: colors.primary }]}>
                            <AppText style={[
                              styles.dayNumberText,
                              { color: today && !isSelected ? '#FFF' : isSelected ? colors.primary : day.isCurrentMonth ? colors.textPrimary : colors.textTertiary },
                            ]}>
                              {day.date.getDate()}
                            </AppText>
                          </View>
                          {dayBks.length > 0 && (
                            <View style={styles.dotRow}>
                              {dayBks.slice(0, 3).map((b, i) => (
                                <View key={i} style={[styles.dot, { backgroundColor: getDotColor(b.status) }]} />
                              ))}
                              {dayBks.length > 3 && (
                                <AppText style={styles.dotMore}>+{dayBks.length - 3}</AppText>
                              )}
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>


                </View>
              )}

              {/* Week view — mirrors web's "Lịch tuần" tab. Renders the next
                  7 days starting from Monday, with a count badge per day. */}
              {viewMode === 'week' && (
                <View style={[styles.calendarWrap, { backgroundColor: colors.background }]}>
                  <View style={[styles.calHeader, { borderBottomColor: colors.border }]}>
                    <TouchableOpacity
                      onPress={() => setWeekStart((d) => subDays(d, 7))}
                      style={styles.calNavBtn}
                      activeOpacity={0.7}
                    >
                      <Icon name={Icons.back} size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <View style={styles.calHeaderText}>
                      <AppText variant="h4" color="textPrimary">
                        {format(weekStart, 'dd/MM')} - {format(addDays(weekStart, 6), 'dd/MM/yyyy')}
                      </AppText>
                      <TouchableOpacity
                        onPress={() => {
                          const d = new Date();
                          const day = d.getDay();
                          d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
                          d.setHours(0, 0, 0, 0);
                          setWeekStart(d);
                        }}
                        style={[styles.todayBtn, { backgroundColor: '#DCFCE7' }]}
                        activeOpacity={0.7}
                      >
                        <AppText variant="caption" style={{ color: '#16A34A', fontWeight: '700' }}>Tuần này</AppText>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => setWeekStart((d) => addDays(d, 7))}
                      style={styles.calNavBtn}
                      activeOpacity={0.7}
                    >
                      <Icon name={Icons.forward} size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ maxHeight: 600 }} showsVerticalScrollIndicator={false}>
                    {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((day) => {
                      const key = localDateKey(day);
                      const dayBks = bookingsByDate[key] || [];
                      return (
                        <TouchableOpacity
                          key={key}
                          onPress={() => router.push(`/history/${key}` as any)}
                          style={[
                            styles.weekDayRow,
                            { borderBottomColor: colors.border },
                          ]}
                          activeOpacity={0.7}
                        >
                          <View
                            style={[
                              styles.weekDayBadge,
                              {
                                backgroundColor: isSameDay(day, new Date())
                                  ? colors.primary
                                  : colors.surface,
                              },
                            ]}
                          >
                            <AppText style={{ fontSize: 11, fontWeight: '700', color: isSameDay(day, new Date()) ? '#FFF' : colors.textSecondary }}>
                              {DAYS_VN[day.getDay()]}
                            </AppText>
                            <AppText
                              style={{
                                fontSize: 16,
                                fontWeight: '800',
                                color: isSameDay(day, new Date()) ? '#FFF' : colors.textPrimary,
                              }}
                            >
                              {day.getDate()}
                            </AppText>
                          </View>
                          <View style={{ flex: 1, marginLeft: spacing.md }}>
                            {dayBks.length === 0 ? (
                              <AppText variant="caption" color="textTertiary">
                                Không có lịch
                              </AppText>
                            ) : (
                              dayBks.slice(0, 2).map((b) => {
                                const pkgName =
                                  typeof b.packageId === 'object' ? (b.packageId as any).name : 'Dịch vụ';
                                return (
                                  <AppText
                                    key={b._id}
                                    variant="bodySmall"
                                    color="textPrimary"
                                    numberOfLines={1}
                                  >
                                    ⏰ {b.startTime} — {pkgName}
                                  </AppText>
                                );
                              })
                            )}
                            {dayBks.length > 2 ? (
                              <AppText variant="caption" color="textTertiary">
                                +{dayBks.length - 2} lịch khác
                              </AppText>
                            ) : null}
                          </View>
                          {dayBks.length > 0 ? (
                            <View style={[styles.statPill, { backgroundColor: colors.primarySubtle }]}>
                              <AppText variant="caption" color="primary" style={{ fontWeight: '700' }}>
                                {dayBks.length}
                              </AppText>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Slot Packs view — mirrors web's "Gói lượt" tab. Lists all
                  the user's slot packs with status + remaining-slot meter. */}
              {viewMode === 'slot_packs' && (
                <View style={{ paddingHorizontal: spacing.screenPadding, marginTop: spacing.md }}>
                  {slotPacksLoading ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                  ) : slotPacks.length === 0 ? (
                    <EmptyState
                      iconName={Icons.voucherOutline}
                      title="Chưa có gói lượt"
                      message="Mua trước gói lượt rửa xe để tiết kiệm hơn khi đặt lịch"
                      actionLabel="Mua gói lượt"
                      onAction={() => router.push('/slot-packs' as any)}
                    />
                  ) : (
                    slotPacks.map((pack) => {
                      const st = getPackStatusInfo(pack as any);
                      const total = pack.totalSlots;
                      const remain = pack.remainingSlots;
                      const pct = total > 0 ? (remain / total) * 100 : 0;
                      const meterColor =
                        pct > 50 ? colors.success : pct > 20 ? colors.warning : colors.error;
                      const pkg =
                        typeof pack.packageId === 'object' && pack.packageId !== null
                          ? (pack.packageId as any).name
                          : 'Gói dịch vụ';
                      const branch =
                        typeof pack.branchId === 'object' && pack.branchId !== null
                          ? (pack.branchId as any).name
                          : '';
                      return (
                        <Card key={pack._id} style={{ marginBottom: spacing.sm, padding: spacing.md }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1 }}>
                              <AppText style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, fontWeight: '700', letterSpacing: 1 }} color="textPrimary">
                                {pack.packCode}
                              </AppText>
                              <AppText variant="body" color="textPrimary" style={{ fontWeight: '700', marginTop: 2 }}>
                                {pkg}
                              </AppText>
                              {branch ? (
                                <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                                  📍 {branch}
                                </AppText>
                              ) : null}
                            </View>
                            <View style={[styles.statPill, { backgroundColor: st.bg }]}>
                              <AppText variant="caption" style={{ color: st.color, fontWeight: '700' }}>
                                {st.label}
                              </AppText>
                            </View>
                          </View>
                          {/* Slot meter */}
                          <View style={{ marginTop: spacing.sm }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <AppText variant="caption" color="textSecondary">Còn lại</AppText>
                              <AppText variant="caption" color="textPrimary" style={{ fontWeight: '700' }}>
                                {remain}/{total}
                              </AppText>
                            </View>
                            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceDark, overflow: 'hidden' }}>
                              <View
                                style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  backgroundColor: meterColor,
                                }}
                              />
                            </View>
                          </View>
                          {/* Footer info */}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
                            <View>
                              <AppText variant="caption" color="textTertiary">Đã dùng</AppText>
                              <AppText variant="caption" color="textPrimary" style={{ fontWeight: '700' }}>{pack.usedSlots || 0} lần</AppText>
                            </View>
                            <View>
                              <AppText variant="caption" color="textTertiary">Giá gói</AppText>
                              <AppText variant="caption" color="textPrimary" style={{ fontWeight: '700' }}>
                                {formatCurrency((pack as any).finalPriceAfterVoucher ?? pack.finalPrice ?? 0)}
                              </AppText>
                            </View>
                            {pack.expiresAt ? (
                              <View>
                                <AppText variant="caption" color="textTertiary">Hết hạn</AppText>
                                <AppText variant="caption" color="textPrimary" style={{ fontWeight: '700' }}>
                                  {format(parseISO(pack.expiresAt), 'dd/MM/yyyy')}
                                </AppText>
                              </View>
                            ) : null}
                          </View>
                          {/* Actions */}
                          <View style={{ flexDirection: 'row', justifyContent: 'flex-start', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 8, flexWrap: 'wrap' }}>
                            {st.label === 'Đang hoạt động' && remain > 0 && (
                              <>
                                <Button title="Đặt lịch nhanh" variant="primary" size="small" onPress={() => handleQuickBook(pack)} style={{ paddingHorizontal: 12 } as any} />
                                <Button title="Hủy gói slot" variant="outline" size="small" onPress={() => handleCancelSlotPack(pack)} loading={isRequestingOtp && packToCancel?._id === pack._id} style={{ borderColor: colors.border, paddingHorizontal: 12 } as any} />
                              </>
                            )}
                            <Button title="Lịch sử sử dụng" variant="outline" size="small" onPress={() => openUsageHistory(pack)} style={{ borderColor: colors.border, paddingHorizontal: 12 } as any} />
                          </View>
                        </Card>
                      );
                    })
                  )}
                </View>
              )}

              {/* List view */}
              {viewMode === 'list' && (
                <View>
                  {/* Dropdown filters — mirror web HistoryPage list filters
                      (keyword + status + type + sort + date range). */}
                  <View style={styles.dropdownFilters}>
                    <View
                      style={[
                        styles.searchRow,
                        {
                          backgroundColor: colors.surface,
                          borderColor: (isSearchFocused || keyword) ? colors.primary : colors.border,
                          borderWidth: 1.5,
                        },
                      ]}
                    >
                      <Icon
                        name={Icons.search}
                        size={18}
                        color={(isSearchFocused || keyword) ? colors.primary : colors.textTertiary}
                      />
                      <TextInput
                        value={keyword}
                        onChangeText={(t) => { setKeyword(t); setPage(1); }}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused(false)}
                        placeholder="Nhập gói dịch vụ, chi nhánh để tìm..."
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.searchInput, { color: colors.textPrimary }]}
                        accessibilityLabel="Tìm kiếm đặt lịch"
                      />
                      {keyword ? (
                        <TouchableOpacity
                          onPress={() => { setKeyword(''); setPage(1); }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={styles.searchClearBtn}
                        >
                          <AppText style={{ fontSize: 11, fontWeight: '700', color: colors.textTertiary }}>✕</AppText>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.dropdownScroll}
                    >
                      <View style={styles.dropdownWrap}>
                        <PickerField
                          label="Trạng thái"
                          value={statusFilter}
                          onChange={(v) => { setStatusFilter(v); setPage(1); }}
                          options={STATUS_OPTIONS}
                          colors={colors}
                        />
                      </View>
                      <View style={styles.dropdownWrap}>
                        <PickerField
                          label="Loại"
                          value={typeFilter}
                          onChange={(v) => { setTypeFilter(v); setPage(1); }}
                          options={TYPE_OPTIONS}
                          colors={colors}
                        />
                      </View>
                      <View style={styles.dropdownWrap}>
                        <PickerField
                          label="Sắp xếp"
                          value={sort}
                          onChange={(v) => { setSort(v); setPage(1); }}
                          options={SORT_OPTIONS}
                          colors={colors}
                        />
                      </View>
                      <View style={styles.dropdownWrap}>
                        <DatePickerField
                          label="Từ ngày"
                          value={dateFrom}
                          onChange={(v) => { setDateFrom(v); setPage(1); }}
                          colors={colors}
                        />
                      </View>
                      <View style={styles.dropdownWrap}>
                        <DatePickerField
                          label="Đến ngày"
                          value={dateTo}
                          onChange={(v) => { setDateTo(v); setPage(1); }}
                          colors={colors}
                        />
                      </View>
                    </ScrollView>
                    {(keyword || statusFilter || typeFilter || dateFrom || dateTo) ? (
                      <TouchableOpacity
                        onPress={() => {
                          setKeyword('');
                          setStatusFilter('');
                          setTypeFilter('');
                          setDateFrom('');
                          setDateTo('');
                          setPage(1);
                        }}
                        style={[styles.clearFilterBtn, { borderColor: colors.border }]}
                        activeOpacity={0.7}
                      >
                        <AppText variant="caption" style={{ color: colors.textSecondary, fontWeight: '600' }}>✕ Xóa bộ lọc</AppText>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Status filter chips */}
                  <View style={styles.filterRow}>
                    <FlatList
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      data={FILTERS}
                      keyExtractor={item => item.key}
                      contentContainerStyle={styles.filterScroll}
                      renderItem={({ item: f }) => (
                        <TouchableOpacity
                          onPress={() => setFilter(f.key)}
                          style={[
                            styles.filterChip,
                            { backgroundColor: filter === f.key ? colors.primary : colors.surface, borderColor: filter === f.key ? colors.primary : colors.border },
                          ]}
                          activeOpacity={0.7}
                        >
                          <AppText variant="bodySmall" style={{ color: filter === f.key ? '#FFF' : colors.textSecondary, fontWeight: filter === f.key ? '700' : '500' }}>
                            {f.label}
                          </AppText>
                        </TouchableOpacity>
                      )}
                    />
                  </View>

                  {filteredBookings.length === 0 ? (
                    <EmptyState
                      iconName={Icons.calendarOutline}
                      title={filter === 'all' ? 'Chưa có đặt lịch' : 'Không có đặt lịch nào'}
                      message={filter === 'all' ? 'Hãy đặt lịch đầu tiên của bạn' : 'Thử chọn bộ lọc khác'}
                      actionLabel={filter === 'all' ? 'Đặt lịch ngay' : undefined}
                      onAction={() => router.push('/(tabs)/booking' as any)}
                    />
                  ) : (
                    <View style={styles.listContent}>
                      {filteredBookings.map(b => (
                        <View key={b._id}>{renderBookingItem(b)}</View>
                      ))}
                    </View>
                  )}

                  {/* Pagination — mirrors web's page size 50 / pagination UI */}
                  <View style={styles.paginationRow}>
                    <Button
                      title="← Trước"
                      variant="outline"
                      onPress={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      style={styles.paginationBtn}
                    />
                    <AppText variant="bodySmall" color="textSecondary">
                      Trang {page}
                    </AppText>
                    <Button
                      title="Sau →"
                      variant="outline"
                      onPress={() => setPage((p) => p + 1)}
                      disabled={filteredBookings.length < limit}
                      style={styles.paginationBtn}
                    />
                  </View>
                </View>
              )}
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
          }
        />
      )}

      {/* ═══ DETAIL MODAL ═══ */}
      <Modal visible={!!detailBooking} transparent animationType="slide" onRequestClose={() => setDetailBooking(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDetailBooking(null)}>
          <TouchableOpacity style={[styles.modalContent, { backgroundColor: colors.background }]} activeOpacity={1}>
            {/* Modal header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <View>
                <AppText variant="h4" color="textPrimary">Chi tiết đặt lịch</AppText>
                <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                  #{detailBooking?._id.slice(-8).toUpperCase()}
                </AppText>
              </View>
              <TouchableOpacity onPress={() => setDetailBooking(null)} style={[styles.modalCloseBtn, { backgroundColor: colors.surfaceDark }]} activeOpacity={0.7}>
                <Icon name={Icons.close} size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Modal body */}
            {detailLoading ? (
              <View style={styles.modalBodyLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : detailBooking ? (
              <>
                <View style={styles.modalBody}>
                  <View style={styles.modalStatusRow}>
                    <BookingStatusBadge status={detailBooking.status} />
                  </View>

                  {detailInfoRows(detailBooking, colors).map(([label, value]) => (
                    <View key={label} style={styles.infoRow}>
                      <AppText variant="caption" color="textSecondary">{label}</AppText>
                      <AppText variant="bodySmall" color="textPrimary" style={styles.infoValue}>{value}</AppText>
                    </View>
                  ))}

                  {detailBooking.subServices && detailBooking.subServices.length > 0 && (
                    <View style={styles.infoRow}>
                      <AppText variant="caption" color="textSecondary">Dịch vụ phụ</AppText>
                      <View style={{ maxWidth: '60%', alignItems: 'flex-end' }}>
                        {detailBooking.subServices.map((sub: any, idx: number) => (
                          <AppText key={idx} variant="bodySmall" color="textPrimary" style={{ textAlign: 'right' }}>
                            {sub.name}
                          </AppText>
                        ))}
                      </View>
                    </View>
                  )}
                  {typeof detailBooking.depositAmount === 'number' && detailBooking.depositAmount > 0 && (
                    <View style={styles.infoRow}>
                      <AppText variant="caption" color="textSecondary">Tiền cọc</AppText>
                      <AppText variant="bodySmall" color={detailBooking.depositPaid ? 'success' : 'warning'} style={styles.infoValue}>
                        {formatCurrency(detailBooking.depositAmount)} ({detailBooking.depositPaid ? 'Đã đóng' : 'Chưa đóng'})
                      </AppText>
                    </View>
                  )}
                  {detailBooking.note ? (
                    <View style={styles.infoRow}>
                      <AppText variant="caption" color="textSecondary">Ghi chú</AppText>
                      <AppText variant="bodySmall" color="textPrimary" style={styles.infoValue}>{detailBooking.note}</AppText>
                    </View>
                  ) : null}
                  {detailBooking.reply ? (
                    <View style={[styles.infoRow, { backgroundColor: colors.surface, padding: spacing.sm, borderRadius: borderRadius.sm, marginTop: spacing.xs }]}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="caption" color="primary" style={{ fontWeight: '600' }}>Cửa hàng phản hồi:</AppText>
                        <AppText variant="bodySmall" color="textPrimary" style={{ marginTop: 2 }}>{detailBooking.reply}</AppText>
                      </View>
                    </View>
                  ) : null}

                  {detailBooking.recurringGroupId && (
                    <View style={{ marginTop: spacing.md }}>
                      <Button
                        title="Quản lý nhóm định kỳ"
                        variant="outline"
                        onPress={() => loadRecurringGroup(detailBooking.recurringGroupId!)}
                      />
                    </View>
                  )}

                  {detailBooking.rating ? (
                    <View style={[styles.ratingBox]}>
                      <View style={styles.ratingRow}>
                        <AppText variant="caption" color="textSecondary" style={{ marginRight: 6, fontWeight: '500' }}>Đánh giá</AppText>
                        <View style={{ flexDirection: 'row', gap: 1 }}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <AppText key={s} style={{ fontSize: 14, color: s <= (detailBooking.rating || 0) ? '#F59E0B' : '#E2E8F0' }}>★</AppText>
                          ))}
                        </View>
                      </View>
                      {detailBooking.feedback ? (
                        <AppText variant="caption" color="textTertiary" style={{ fontStyle: 'italic', marginTop: 4, lineHeight: 18 }}>
                          "{detailBooking.feedback}"
                        </AppText>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                {/* Modal footer actions */}
                <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
                  {(detailBooking.status === 'pending' || detailBooking.status === 'confirmed') && (
                    <View style={{ gap: spacing.sm }}>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button
                          title="Hủy đơn"
                          variant="outline"
                          onPress={handleCancel}
                          style={styles.modalActionBtn}
                        />
                        <Button
                          title="QR Check-in"
                          onPress={handleShowQR}
                          style={styles.modalActionBtn}
                        />
                      </View>
                    </View>
                  )}
                  {/* Awaiting payment — xe đã rửa xong, chờ khách trả nốt phần còn lại.
                      Hỗ trợ hủy (BE cho phép awaiting_payment → cancelled) + thanh toán nốt.
                      Ẩn nút "Thanh toán phần còn lại" khi booking không còn dư nợ
                      (paymentStatus='paid' hoặc depositAmount<=0 vì slot pack / recurring
                      buổi sau — BE đã chặn guard, FE hiển thị nhất quán). */}
                  {detailBooking.status === 'awaiting_payment' && (
                    <View style={{ gap: spacing.sm }}>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button
                          title="Hủy đơn"
                          variant="outline"
                          onPress={handleCancel}
                          style={styles.modalActionBtn}
                        />
                        {detailBooking.depositPaid &&
                          detailBooking.paymentStatus !== 'paid' &&
                          (detailBooking.depositAmount || 0) > 0 && (
                          <Button
                            title="Thanh toán phần còn lại"
                            onPress={() => {
                              setDetailBooking(null);
                              router.push(`/payment/select?bookingId=${detailBooking._id}&type=remaining` as any);
                            }}
                            style={styles.modalActionBtn}
                          />
                        )}
                      </View>
                    </View>
                  )}
                  {(detailBooking.status === 'completed' || detailBooking.status === 'cancelled') && (
                    <View style={{ gap: spacing.sm }}>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button
                          title="Đặt lại"
                          variant="outline"
                          onPress={handleRebook}
                          style={styles.modalActionBtn}
                        />
                        {detailBooking.status === 'completed' && (
                          <Button
                            title="Đánh giá"
                            onPress={openReview}
                            style={styles.modalActionBtn}
                          />
                        )}
                      </View>
                    </View>
                  )}
                  <Button
                    title="Đóng"
                    onPress={() => setDetailBooking(null)}
                    fullWidth
                  />
                </View>
              </>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ═══ CANCEL CONFIRM MODAL ═══ */}
      <Modal visible={showCancelConfirm} transparent animationType="fade" onRequestClose={() => setShowCancelConfirm(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { if (!cancelLoading) { setShowCancelConfirm(false); setCancelError(''); } }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ width: '100%', alignItems: 'center' }}>
            <TouchableOpacity style={[styles.confirmModal, { backgroundColor: colors.background }]} activeOpacity={1}>
              <AppText variant="h4" color="textPrimary" style={{ textAlign: 'center', marginBottom: spacing.sm }}>Xác nhận hủy đơn</AppText>
              <AppText variant="bodySmall" color="textSecondary" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
                Bạn có chắc muốn hủy đơn này? Hành động này không thể hoàn tác.
              </AppText>
              {cancelError ? (
                <View style={[styles.errorBox, { backgroundColor: colors.errorLight }]}>
                  <AppText variant="caption" color="error">{cancelError}</AppText>
                </View>
              ) : null}
              <TextInput
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="Nhập lý do hủy đơn..."
                style={[styles.reviewInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, marginBottom: spacing.md, minHeight: 80 }]}
                placeholderTextColor={colors.textTertiary}
                multiline
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  title="Không, giữ lại"
                  variant="outline"
                  onPress={() => { setShowCancelConfirm(false); setCancelError(''); }}
                  disabled={cancelLoading}
                  style={{ flex: 1 }}
                />
                <Button
                  title={cancelLoading ? 'Đang hủy...' : 'Xác nhận hủy'}
                  onPress={confirmCancel}
                  disabled={cancelLoading}
                  style={{ flex: 1, backgroundColor: colors.error }}
                  textStyle={{ color: '#FFF' }}
                />
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* ═══ REVIEW SHEET (shared component) ═══ */}
      <RatingSheet
        visible={showReview}
        initialRating={detailBooking?.rating || 0}
        initialComment={detailBooking?.feedback || ''}
        onClose={() => setShowReview(false)}
        onSubmit={submitReview}
      />

      {/* ═══ REBOOK MODAL ═══ */}
      <Modal visible={showRebook} transparent animationType="slide" onRequestClose={() => setShowRebook(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { if (!rebookLoading) { setShowRebook(false); setRebookError(''); } }}>
          <TouchableOpacity style={[styles.rebookModal, { backgroundColor: colors.background }]} activeOpacity={1}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <View>
                <AppText variant="h4" color="textPrimary">Đặt lại lịch</AppText>
                <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                  {typeof detailBooking?.packageId === 'object' ? (detailBooking.packageId as any).name : ''}
                </AppText>
              </View>
              <TouchableOpacity onPress={() => { setShowRebook(false); setRebookError(''); }} style={[styles.modalCloseBtn, { backgroundColor: colors.surfaceDark }]} activeOpacity={0.7}>
                <Icon name={Icons.close} size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <AppText variant="label" color="textSecondary" style={{ marginBottom: spacing.xs }}>Ngày mới</AppText>
              <TextInput
                value={rebookDate}
                onChangeText={setRebookDate}
                placeholder="YYYY-MM-DD"
                style={[styles.rebookInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholderTextColor={colors.textTertiary}
              />
              <AppText variant="label" color="textSecondary" style={{ marginBottom: spacing.xs, marginTop: spacing.md }}>Giờ mới</AppText>
              <TextInput
                value={rebookTime}
                onChangeText={setRebookTime}
                placeholder="HH:mm"
                style={[styles.rebookInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                placeholderTextColor={colors.textTertiary}
              />
              <AppText variant="caption" color="textTertiary" style={{ marginTop: spacing.sm }}>
                Nhập ngày và giờ bạn muốn đặt lại. Ngày phải từ hôm nay trở đi.
              </AppText>

              {rebookError ? (
                <View style={[styles.errorBox, { backgroundColor: colors.errorLight, marginTop: spacing.sm }]}>
                  <AppText variant="caption" color="error">{rebookError}</AppText>
                </View>
              ) : null}
            </View>

            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button title="Hủy" variant="outline" onPress={() => { setShowRebook(false); setRebookError(''); }} disabled={rebookLoading} style={{ flex: 1 }} />
                <Button
                  title={rebookLoading ? 'Đang đặt lại...' : 'Xác nhận đặt lại'}
                  onPress={submitRebook}
                  disabled={rebookLoading}
                  style={{ flex: 2 }}
                />
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ═══ RECURRING GROUP MODAL ═══ */}
      <Modal visible={showRecurringModal} transparent animationType="slide" onRequestClose={() => setShowRecurringModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowRecurringModal(false)}>
          <TouchableOpacity style={[styles.modalContent, { backgroundColor: colors.background }]} activeOpacity={1}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <View>
                <AppText variant="h4" color="textPrimary">Nhóm định kỳ</AppText>
              </View>
              <TouchableOpacity onPress={() => setShowRecurringModal(false)} style={[styles.modalCloseBtn, { backgroundColor: colors.surfaceDark }]} activeOpacity={0.7}>
                <Icon name={Icons.close} size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <View style={[styles.modalBody, { maxHeight: 500 }]}>
              {recurringLoading ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : (
                <ScrollView contentContainerStyle={styles.timelineContainer} showsVerticalScrollIndicator={false}>
                  {recurringGroupBookings.map((b, i) => {
                    const isLast = i === recurringGroupBookings.length - 1;
                    return (
                      <View key={b._id} style={styles.timelineItem}>
                        {/* Timeline Graphic */}
                        <View style={styles.timelineGraphic}>
                          <View style={[styles.timelineDot, { backgroundColor: getStatusFg(b.status, colors) }]} />
                          {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
                        </View>
                        
                        {/* Timeline Content */}
                        <View style={styles.timelineContent}>
                          <AppText variant="caption" color="textSecondary" style={styles.timelineStepLabel}>
                            Lần {i + 1}
                          </AppText>
                          <View style={styles.timelineContentHeader}>
                            <AppText variant="body" weight="600" color="textPrimary">
                              {new Date(b.bookingDate).toLocaleDateString('vi-VN', {
                                weekday: 'short',
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              })} · {b.startTime}
                            </AppText>
                            <BookingStatusBadge status={b.status} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
               {recurringGroupBookings.some(b => b.status === 'pending' || b.status === 'confirmed') && (
                 <Button
                    title={isRequestingRecurringOtp ? 'Đang xử lý...' : 'Hủy toàn bộ'}
                    onPress={() => detailBooking?.recurringGroupId && handleCancelRecurringGroup(detailBooking.recurringGroupId)}
                    disabled={isRequestingRecurringOtp}
                    style={{ backgroundColor: colors.error, marginBottom: spacing.sm }}
                    textStyle={{ color: '#FFF' }}
                 />
               )}
               <Button title="Đóng" variant="outline" onPress={() => setShowRecurringModal(false)} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ═══ RECURRING CANCEL OTP MODAL ═══ */}
      <Modal visible={showRecurringOtpModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.otpCard}>
            <AppText variant="h3" style={{ marginBottom: spacing.sm, textAlign: 'center' }}>Xác nhận OTP</AppText>
            <AppText variant="bodySmall" color="textSecondary" style={{ textAlign: 'center', marginBottom: spacing.md }}>
              Vui lòng nhập mã OTP gồm 6 chữ số đã được gửi đến email của bạn để xác nhận hủy nhóm lịch định kỳ.
            </AppText>
            
            <TextInput
              style={[styles.otpInput, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Nhập 6 số OTP"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              maxLength={6}
              value={recurringOtpCode}
              onChangeText={setRecurringOtpCode}
            />

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                title="Quay lại"
                variant="outline"
                onPress={() => {
                  setShowRecurringOtpModal(false);
                  setRecurringOtpCode('');
                }}
                style={{ flex: 1 }}
              />
              <Button
                title={isConfirmingRecurringCancel ? 'Đang hủy...' : 'Xác nhận'}
                onPress={handleConfirmRecurringCancel}
                disabled={isConfirmingRecurringCancel || recurringOtpCode.length !== 6}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* ═══ SLOT PACK CANCEL OTP MODAL ═══ */}
      <Modal visible={showOtpModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.otpCard}>
            <AppText variant="h3" style={{ marginBottom: spacing.sm, textAlign: 'center' }}>Xác nhận OTP</AppText>
            <AppText variant="bodySmall" color="textSecondary" style={{ textAlign: 'center', marginBottom: spacing.md }}>
              Vui lòng nhập mã OTP gồm 6 chữ số đã được gửi đến email của bạn để xác nhận hủy gói.
            </AppText>
            <TextInput
              style={[styles.otpInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="Nhập 6 số OTP"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                title="Hủy"
                variant="outline"
                onPress={() => setShowOtpModal(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={isConfirmingCancel ? "Đang xử lý..." : "Xác nhận"}
                variant="primary"
                onPress={handleConfirmCancelOtp}
                disabled={isConfirmingCancel || otpCode.length !== 6}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* ═══ USAGE HISTORY MODAL ═══ */}
      <Modal visible={showUsageModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowUsageModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { backgroundColor: colors.background, padding: 0 }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border, padding: spacing.md }]}>
              <AppText variant="h3">Lịch sử sử dụng gói</AppText>
              <TouchableOpacity onPress={() => setShowUsageModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name={Icons.close} size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              {usageLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : usageHistory.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <AppText variant="body" color="textSecondary">Chưa có lịch sử sử dụng</AppText>
                </View>
              ) : (
                <ScrollView contentContainerStyle={{ padding: spacing.md }}>
                  {usageHistory.map((item, i) => (
                    <View key={item._id || i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                      <View>
                        <AppText variant="bodySmall" color="textPrimary">
                          Lần {i + 1}: {item.usedAt ? format(new Date(item.usedAt), 'dd/MM/yyyy HH:mm') : ''}
                        </AppText>
                        <AppText variant="caption" color="textSecondary">
                          Mã ĐL: {typeof item.bookingId === 'string' ? item.bookingId.slice(-8).toUpperCase() : ((item.bookingId as any)?.bookingCode || (item.bookingId as any)?._id?.slice(-8).toUpperCase() || 'N/A')}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ═══ QR MODAL ═══ */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowQR(false)}>
          <TouchableOpacity style={[styles.qrModal, { backgroundColor: colors.background }]} activeOpacity={1}>
            <AppText variant="h4" color="textPrimary" style={{ textAlign: 'center' }}>Mã QR Check-in</AppText>
            <AppText variant="caption" color="textSecondary" style={{ textAlign: 'center', marginTop: 4, marginBottom: spacing.lg }}>
              Đưa mã này cho nhân viên khi đến rửa xe
            </AppText>

            {qrLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : qrCode ? (
              <View style={{ alignItems: 'center', padding: spacing.md }}>
                <AppText variant="body" color="textPrimary">QR Code sẵn sàng</AppText>
              </View>
            ) : (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <AppText variant="caption" color="textTertiary">Không có dữ liệu QR</AppText>
              </View>
            )}

            <Button title="Đóng" onPress={() => setShowQR(false)} fullWidth style={{ marginTop: spacing.lg }} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
}

function getStatusBg(status: BookingStatus, colors: any): string {
  switch (status) {
    case 'pending': return colors.warningLight;
    case 'confirmed': return colors.primarySubtle;
    case 'checked_in': case 'in_progress': return colors.infoLight;
    case 'awaiting_payment': return colors.infoLight;
    case 'completed': return colors.successLight;
    case 'cancelled': return colors.errorLight;
    default: return colors.surface;
  }
}

function getStatusFg(status: BookingStatus, colors: any): string {
  switch (status) {
    case 'pending': return colors.warning;
    case 'confirmed': return colors.primary;
    case 'checked_in': case 'in_progress': return colors.info;
    case 'awaiting_payment': return colors.info;
    case 'completed': return colors.success;
    case 'cancelled': return colors.error;
    default: return colors.textSecondary;
  }
}

function detailInfoRows(b: Booking, colors: any): [string, string][] {
  const pkg = typeof b.packageId === 'object' ? (b.packageId as any).name : '—';const branch = typeof b.branchId === 'object' ? (b.branchId as any).name : '—';
  const vehicle = typeof b.vehicleId === 'object' ? (b.vehicleId as any).licensePlate : '—';
  const date = b.bookingDate ? new Date(b.bookingDate).toLocaleDateString('vi-VN') : '—';
  const payment = b.paymentStatus === 'paid' ? 'Đã thanh toán' : 'Chưa thanh toán';
  const type = b.isRecurring ? 'Định kỳ' : '1 lần';

  return [
    ['Dịch vụ', pkg],
    ['Ngày', date],
    ['Giờ', b.startTime || '—'],
    ['Chi nhánh', branch],
    ['Biển số', vehicle],
    ['Thành tiền', formatCurrency(b.finalPrice)],
    ['Thanh toán', payment],
    ['Loại đặt', type],
  ];
}

/**
 * Compact dropdown field used by the list-view filters. Renders a label,
 * the selected option text, and a chevron. RN has no native cross-platform
 * Picker, so the actual cycling happens via a Modal with a vertical choice
 * list (same UX as the web select).
 */
interface PickerFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  colors: any;
}

const PickerField: React.FC<PickerFieldProps> = ({ label, value, options, onChange, colors }) => {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((o) => o.value === value)?.label || options[0]?.label || '';
  
  const isActive = value !== '' && value !== '-createdAt';

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={[
          styles.pickerField,
          {
            backgroundColor: isActive ? '#ECFDF5' : colors.surface,
            borderColor: isActive ? colors.primary : colors.border,
            borderWidth: 1.5,
          },
        ]}
        accessibilityLabel={label}
      >
        <AppText variant="caption" color={isActive ? "primary" : "textTertiary"} style={{ fontWeight: '700', fontSize: 10, letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <AppText
            variant="body"
            color={isActive ? "primary" : "textPrimary"}
            numberOfLines={1}
            style={{ fontWeight: isActive ? '700' : '600', fontSize: 13, flex: 1, marginRight: 4 }}
          >
            {selectedLabel}
          </AppText>
          <Icon
            name={Icons.forward}
            size={13}
            color={isActive ? colors.primary : colors.textTertiary}
            style={{ transform: [{ rotate: '90deg' }] }}
          />
        </View>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <TouchableOpacity
            style={[styles.pickerModal, { backgroundColor: colors.background }]}
            activeOpacity={1}
          >
            <AppText variant="label" color="textSecondary" style={{ marginBottom: spacing.sm, textAlign: 'center' }}>
              {label.toUpperCase()}
            </AppText>
            <ScrollView style={{ maxHeight: 400 }}>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  style={[
                    styles.pickerItem,
                    {
                      backgroundColor: o.value === value ? colors.primarySubtle : 'transparent',
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <AppText
                    variant="bodySmall"
                    color={o.value === value ? 'primary' : 'textPrimary'}
                    style={{ fontWeight: o.value === value ? '700' : '500' }}
                  >
                    {o.label}
                  </AppText>
                  {o.value === value ? (
                    <Icon name={Icons.checkmark} size={16} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const DatePickerField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  colors: any;
}> = ({ label, value, onChange, colors }) => {
  const [open, setOpen] = useState(false);

  const initialDate = useMemo(() => (value ? parseISO(value) : new Date()), [value]);
  const [calMonth, setCalMonth] = useState(initialDate.getMonth());
  const [calYear, setCalYear] = useState(initialDate.getFullYear());

  useEffect(() => {
    if (open) {
      const d = value ? parseISO(value) : new Date();
      setCalMonth(d.getMonth());
      setCalYear(d.getFullYear());
    }
  }, [open, value]);

  const displayDateText = useMemo(() => {
    if (!value) return 'Chọn ngày';
    try {
      return format(parseISO(value), 'dd/MM/yyyy');
    } catch {
      return value;
    }
  }, [value]);

  const isActive = !!value;

  const daysInMonth = getDaysInMonth(new Date(calYear, calMonth));
  const firstDay = new Date(calYear, calMonth, 1).getDay();

  const calDays = useMemo(() => {
    const arr: { date: Date; isCurrentMonth: boolean; dateStr: string }[] = [];
    const prevMonthDays = getDaysInMonth(new Date(calYear, calMonth === 0 ? 11 : calMonth - 1));

    for (let i = firstDay - 1; i >= 0; i--) {
      const m = calMonth === 0 ? 11 : calMonth - 1;
      const y = calMonth === 0 ? calYear - 1 : calYear;
      const d = new Date(y, m, prevMonthDays - i);
      arr.push({ date: d, isCurrentMonth: false, dateStr: localDateKey(d) });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(calYear, calMonth, d);
      arr.push({ date: dateObj, isCurrentMonth: true, dateStr: localDateKey(dateObj) });
    }
    const remaining = 42 - arr.length;
    for (let d = 1; d <= remaining; d++) {
      const m = calMonth === 11 ? 0 : calMonth + 1;
      const y = calMonth === 11 ? calYear + 1 : calYear;
      const dateObj = new Date(y, m, d);
      arr.push({ date: dateObj, isCurrentMonth: false, dateStr: localDateKey(dateObj) });
    }
    return arr;
  }, [calYear, calMonth, firstDay, daysInMonth]);

  const prevCalMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else { setCalMonth(m => m - 1); }
  };

  const nextCalMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else { setCalMonth(m => m + 1); }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={[
          styles.pickerField,
          {
            backgroundColor: isActive ? 'rgba(59, 130, 246, 0.08)' : colors.surface,
            borderColor: isActive ? colors.primary : colors.border,
            minWidth: 120,
          },
        ]}
        accessibilityLabel={label}
      >
        <AppText variant="bodySmall" color={isActive ? "primary" : "textTertiary"}>{label}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <AppText variant="body" color={isActive ? "primary" : "textTertiary"} style={{ fontWeight: isActive ? '700' : '500', fontSize: 13 }}>
            {displayDateText}
          </AppText>
          {isActive ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <AppText style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>✕</AppText>
            </TouchableOpacity>
          ) : (
            <Icon name={Icons.calendarOutline} size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />
          )}
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity style={[styles.datePickerModal, { backgroundColor: colors.background }]} activeOpacity={1}>
            <View style={styles.datePickerHeader}>
              <AppText variant="label" color="textSecondary" style={{ fontWeight: '700', letterSpacing: 0.5 }}>
                {label.toUpperCase()}
              </AppText>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <AppText style={{ color: colors.textTertiary, fontSize: 18 }}>✕</AppText>
              </TouchableOpacity>
            </View>

            {/* Month Navigation */}
            <View style={styles.datePickerNav}>
              <TouchableOpacity onPress={prevCalMonth} style={styles.calNavBtn}>
                <Icon name={Icons.back} size={18} color={colors.textPrimary} />
              </TouchableOpacity>
              <AppText variant="body" color="textPrimary" style={{ fontWeight: '700' }}>
                Tháng {calMonth + 1}/{calYear}
              </AppText>
              <TouchableOpacity onPress={nextCalMonth} style={styles.calNavBtn}>
                <Icon name={Icons.forward} size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Weekday Labels */}
            <View style={styles.dowRow}>
              {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d) => (
                <View key={d} style={styles.dowCell}>
                  <AppText style={styles.dowText}>{d}</AppText>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calGrid}>
              {calDays.map((item, idx) => {
                const isSelected = item.dateStr === value;
                const isToday = isSameDay(item.date, new Date());

                return (
                  <TouchableOpacity
                    key={idx}
                    disabled={!item.isCurrentMonth}
                    onPress={() => {
                      onChange(item.dateStr);
                      setOpen(false);
                    }}
                    style={styles.dayCell}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.dayNumber,
                        isSelected && { backgroundColor: colors.primary },
                        !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.primary },
                      ]}
                    >
                      <AppText
                        style={[
                          styles.dayNumberText,
                          {
                            color: isSelected
                              ? '#FFFFFF'
                              : !item.isCurrentMonth
                              ? colors.textTertiary
                              : colors.textPrimary,
                            fontWeight: isSelected || isToday ? '700' : '500',
                          },
                        ]}
                      >
                        {item.date.getDate()}
                      </AppText>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer Clear Button */}
            {isActive ? (
              <TouchableOpacity
                onPress={() => {
                  onChange('');
                  setOpen(false);
                }}
                style={[styles.datePickerClearBtn, { borderColor: colors.border }]}
              >
                <AppText variant="bodySmall" color="error" style={{ fontWeight: '600', textAlign: 'center' }}>
                  Xóa lọc ngày này
                </AppText>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  scrollContent: {
    paddingBottom: spacing.xxl + 80,
  },
  loadingWrap: {
    padding: spacing.md,
  },
  skeletonCard: {
    marginBottom: spacing.sm,
  },

  // View toggle
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.md,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  toggleBtnActive: {
    borderWidth: 1.5,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleBtnText: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
  },
  tabButtonText: {
    fontFamily: 'Outfit-Medium',
  },
  timelineContainer: {
    paddingVertical: spacing.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  timelineGraphic: {
    width: 24,
    alignItems: 'center',
    marginRight: spacing.md,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: -spacing.md,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: spacing.sm,
  },
  timelineContentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  timelineStepLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
    fontWeight: '700',
  },

  // Calendar
  calendarWrap: {
    marginHorizontal: spacing.screenPadding,
    marginTop: spacing.md,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.md,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calNavBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calHeaderText: {
    alignItems: 'center',
    gap: 4,
  },
  todayBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  dowRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dowCell: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dowText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    minHeight: 52,
    padding: 3,
    alignItems: 'center',
  },
  dayNumber: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dotRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotMore: {
    fontSize: 8,
    color: '#94A3B8',
    fontWeight: '700',
  },

  // List view filters
  filterRow: {
    paddingVertical: spacing.sm,
  },
  filterScroll: {
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },

  // List view
  listContent: {
    paddingHorizontal: spacing.screenPadding,
    paddingBottom: spacing.xxl,
  },
  bookingCard: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },

  // -- Compact card --
  visCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  visPackageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  visIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visPackageName: {
    fontWeight: '700',
    flex: 1,
  },
  visInfoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  visInfoText: {
    fontSize: 13,
  },
  visCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  visPlateTag: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  visPlateText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  visPrice: {
    fontWeight: '800',
    fontSize: 16,
  },

  // Modal base
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl + 4,
    borderTopRightRadius: borderRadius.xl + 4,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: borderRadius.xl + 4,
    borderTopRightRadius: borderRadius.xl + 4,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: spacing.lg,
  },
  modalBodyLoading: {
    padding: 40,
    alignItems: 'center',
  },
  modalStatusRow: {
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
  },
  infoValue: {
    fontWeight: '600',
    textAlign: 'right',
    maxWidth: '60%',
  },
  ratingBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalFooter: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  otpCard: {
    padding: spacing.lg,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  otpInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 20,
    textAlign: 'center',
    fontFamily: 'Outfit_700Bold',
    letterSpacing: 4,
  },
  modalActionBtn: {
    flex: 1,
  },

  // Confirm modal
  confirmModal: {
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.xl + 4,
    padding: spacing.lg,
  },
  errorBox: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },

  // Review modal — moved to shared `RatingSheet` component (src/components/common).
  // The history screen now reuses the shared sheet for booking-level rating.

  // Rebook modal
  rebookModal: {
    borderTopLeftRadius: borderRadius.xl + 4,
    borderTopRightRadius: borderRadius.xl + 4,
  },
  rebookInput: {
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    padding: spacing.md,
    fontSize: 14,
  },
  reviewInput: {
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    padding: spacing.md,
    fontSize: 14,
  },

  // QR modal
  qrModal: {
    marginHorizontal: spacing.lg + 20,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  
  // Stats
  statsScrollView: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  statsScrollContent: {
    paddingHorizontal: spacing.screenPadding,
    gap: spacing.xs,
    alignItems: 'center',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 8,
    height: 40,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  statChipBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  statChipCount: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: 22,
    padding: 0,
    margin: 0,
  },
  statChipLabel: {
    fontSize: 13,
  },

  // Week view
  weekDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekDayBadge: {
    width: 50,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  statPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },

  // List dropdown filters
  dropdownFilters: {
    paddingHorizontal: spacing.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
    borderRadius: 16,
    height: 48,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 14,
    padding: 0,
  },
  searchClearBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownScroll: {
    gap: spacing.sm,
  },
  dropdownWrap: {
    minWidth: 136,
  },
  dateRangeWrap: {
    flexDirection: 'row',
    gap: 4,
  },
  dateInput: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    minWidth: 110,
  },
  clearFilterBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  pickerField: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 12,
    height: 54,
    justifyContent: 'center',
  },
  pickerModal: {
    marginHorizontal: spacing.lg,
    marginTop: 'auto',
    marginBottom: 'auto',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    maxHeight: '70%',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
  },
  datePickerModal: {
    marginHorizontal: spacing.md,
    marginTop: 'auto',
    marginBottom: 'auto',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  datePickerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  datePickerClearBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },

  // Pagination
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.screenPadding,
  },
  paginationBtn: {
    minWidth: 96,
  },
});
