/**
 * AutoWashPro Recurring Booking Screen
 * 5-step flow: branch -> package -> vehicle -> recurrence (weekdays, time, weeks) -> confirm
 *
 * Backend constraints (see booking.service.js createRecurringBooking):
 *  - weeks: 1..12
 *  - weekdays: non-empty array of 0..6 (0 = Sunday)
 *  - startTime: HH:mm, must end before branch.closingTime
 *  - Backend begins from today (no startDate param); days in the past are skipped.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  BackHandler,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSystemConfig } from '../../src/contexts/ConfigContext';
import {
  branchApi,
  packageApi,
  vehicleApi,
  bookingApi,
} from '../../src/api';
import {
  Text as AppText,
  Card,
  Button,
  Loading,
  EmptyState,
  Input,
  AlertDialog,
  useToast,
  StepIndicator,
  Icon,
  Icons,
  PressableScale,
  ScreenContainer,
  Header,
} from '../../src/components/common';
import { useColors } from '../../src/theme/ThemeContext';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import {
  spacing,
  borderRadius,
  layout,
  shadows,
} from '../../src/theme/spacing';
import { formatCurrency } from '../../src/utils';
import { consumePendingVoucher } from '../../src/utils/voucherStore';
import type {
  Branch,
  Package as ServicePackage,
  Vehicle,
  AvailableSlot,
  RecurringBookingResult,
} from '../../src/types';

type Step = 'branch' | 'package' | 'vehicle' | 'recurrence' | 'confirm';

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'branch', label: 'Chi nhánh', icon: 'location-outline' },
  { key: 'package', label: 'Gói', icon: 'sparkles-outline' },
  { key: 'vehicle', label: 'Xe', icon: 'car-outline' },
  { key: 'recurrence', label: 'Lịch', icon: 'calendar-outline' },
  { key: 'confirm', label: 'Xác nhận', icon: 'checkmark-outline' },
];

const WEEKDAY_OPTIONS = [
  { value: 1, short: 'T2', long: 'Thứ Hai' },
  { value: 2, short: 'T3', long: 'Thứ Ba' },
  { value: 3, short: 'T4', long: 'Thứ Tư' },
  { value: 4, short: 'T5', long: 'Thứ Năm' },
  { value: 5, short: 'T6', long: 'Thứ Sáu' },
  { value: 6, short: 'T7', long: 'Thứ Bảy' },
  { value: 0, short: 'CN', long: 'Chủ Nhật' },
];

const WEEK_PRESETS = [2, 3, 4, 6, 8, 12]; // match landing page (WEEKS_OPTIONS)

// Loyalty point multiplier per tier — mirrors FE RecurringBookingFlow.jsx.
function getPointMultiplier(tier?: string, loyaltyTiersConfig?: any): number {
  if (Array.isArray(loyaltyTiersConfig)) {
    const found = loyaltyTiersConfig.find((t: any) => t.id === tier);
    if (found?.multiplier) return found.multiplier;
  }
  if (tier === 'diamond') return 2.0;
  if (tier === 'gold') return 1.5;
  if (tier === 'silver') return 1.2;
  return 1;
}

export default function RecurringBookingScreen() {
  const configs = useSystemConfig();
  const rawDepositConfig = configs?.DEPOSIT_RATE;
  const depositPercent = typeof rawDepositConfig === 'number'
    ? (rawDepositConfig <= 1 ? Math.round(rawDepositConfig * 100) : Math.round(rawDepositConfig))
    : 20;
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const toast = useToast();

  // 'gold' | 'diamond' get full VIP treatment; everyone else sees VIP-only slots as locked.
  const userTier = (user as any)?.tier as
    | 'bronze'
    | 'silver'
    | 'gold'
    | 'diamond'
    | undefined;
  const isVip = userTier === 'gold' || userTier === 'diamond';

  const [step, setStep] = useState<Step>('branch');

  useEffect(() => {
    const onBackPress = () => {
      const idx = STEPS.findIndex(s => s.key === step);
      if (idx > 0) {
        setStep(STEPS[idx - 1].key);
        return true;
      }
      return false; // let default back action occur if at step 0
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [step]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [branchPackageCounts, setBranchPackageCounts] = useState<{ counts: Record<string, number>; globalCount: number }>({ counts: {}, globalCount: 0 });

  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ServicePackage | null>(
    null,
  );
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedSubServices, setSelectedSubServices] = useState<any[]>([]);

  // Recurrence config
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]); // default empty
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [weeks, setWeeks] = useState<number>(4);

  const [voucherCode, setVoucherCode] = useState('');
  const [voucherDiscount, setVoucherDiscount] = useState(0);
  const [paymentOption, setPaymentOption] = useState<'deposit' | 'full'>('deposit');

  const [note, setNote] = useState('');

  const saveProgressAndHome = async () => {
    try {
      await AsyncStorage.setItem('aw_recurring_draft_progress', JSON.stringify({
        step,
        selectedBranch,
        selectedPackage,
        selectedVehicle,
        selectedSubServices,
        selectedWeekdays,
        selectedTime,
        weeks,
        voucherCode,
        voucherDiscount,
        note,
      }));
      toast.info('Tiến trình đã được lưu', 'Bạn có thể tiếp tục đặt lịch sau');
      router.replace('/');
    } catch {}
  };

  // Slots for selected day-of-week (first slot preview)
  const [daySlots, setDaySlots] = useState<AvailableSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // User's existing active bookings on the chosen branch — used to disable
  // slots the user already owns so they can't double-book themselves.
  const [userBookedSlotKeys, setUserBookedSlotKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const [validSessionsCount, setValidSessionsCount] = useState<number | null>(null);

  const filteredPackages = useMemo(
    () =>
      packages.filter((pkg) => {
        if (!pkg.branchId) return true;
        const bid =
          typeof pkg.branchId === 'object' && pkg.branchId !== null
            ? (pkg.branchId as any)._id || (pkg.branchId as any).id
            : pkg.branchId;
        return bid === selectedBranch?._id;
      }),
    [packages, selectedBranch?._id],
  );

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch branch-specific packages when branch changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedBranch?._id) return;
      try {
        const list = await branchApi.getBranchPackages(selectedBranch._id);
        if (cancelled || !Array.isArray(list)) return;
        setPackages((prev) => {
          const merged = [...prev, ...list];
          // Dedupe by _id
          const seen = new Set<string>();
          return merged.filter((p) => {
            if (seen.has(p._id)) return false;
            seen.add(p._id);
            return true;
          });
        });
      } catch {
        /* fall back to already-loaded catalog */
      }
    })();
    return () => { cancelled = true; };
  }, [selectedBranch?._id]);

  // Fetch slots when entering recurrence step or when the chosen weekday changes.
  useEffect(() => {
    if (step !== 'recurrence') return;
    if (!selectedBranch?._id || !selectedPackage?._id) return;
    if (selectedWeekdays.length === 0) return;
    fetchAllSlotsForWeekdays();
    fetchUserBookedSlotsForWeekdays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedBranch?._id, selectedPackage?._id, selectedWeekdays.join(',')]);

  // Pull the user's existing active bookings for this branch so we can disable
  // any slot they already own (similar to the single-booking flow). Cached by
  // (branch, weekdays) so toggling a weekday refreshes the relevant dates.
  const fetchUserBookedSlotsForWeekdays = useCallback(async () => {
    if (!isAuthenticated || !selectedBranch?._id || selectedWeekdays.length === 0) {
      setUserBookedSlotKeys(new Set());
      return;
    }
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastCandidate = new Date(today);
      lastCandidate.setDate(lastCandidate.getDate() + weeks * 7);

      const candidateDates: string[] = [];
      const cursor = new Date(today);
      while (cursor <= lastCandidate) {
        if (selectedWeekdays.includes(cursor.getDay())) {
          const y = cursor.getFullYear();
          const m = String(cursor.getMonth() + 1).padStart(2, '0');
          const d = String(cursor.getDate()).padStart(2, '0');
          candidateDates.push(`${y}-${m}-${d}`);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      const keys = new Set<string>();
      // Fetch each weekday in date range, 1 query per date — but limit to
      // active statuses only. We don't filter by status (BE only supports
      // exact match) so we filter client-side after fetch.
      const activeStatuses = new Set(['pending', 'confirmed', 'checked_in', 'in_progress']);
      const results = await Promise.allSettled(
        candidateDates.map((d) =>
          bookingApi.getMyBookings({
            dateFrom: d,
            dateTo: d,
            branchId: selectedBranch._id,
            limit: 100,
          }),
        ),
      );
      results.forEach((r, idx) => {
        if (r.status !== 'fulfilled') return;
        for (const b of r.value.data) {
          if (b.startTime && activeStatuses.has(b.status)) {
            keys.add(`${candidateDates[idx]}|${b.startTime}`);
          }
        }
      });
      setUserBookedSlotKeys(keys);
    } catch (err) {
      console.warn('[recurring] failed to fetch user bookings', err);
      setUserBookedSlotKeys(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, selectedBranch?._id, selectedWeekdays.join(','), weeks]);

  const fetchInitialData = async () => {
    try {
      const [branchesRes, packagesRes] = await Promise.all([
        branchApi.getPublicBranches(),
        // `limit: 'all'` so the recurring flow shows every active package the
        // user could pick from — without it, BE defaults to 9 sorted by price
        // and we end up with an empty category-filtered list (see booking/
        // index.tsx for the same rationale).
        packageApi.getPackages({ status: 'active', limit: 'all' }),
      ]);
      setBranches(branchesRes);
      
      const counts: Record<string, number> = {};
      let globalCount = 0;
      for (const pkg of (packagesRes || [])) {
        if (pkg.status !== 'active') continue;
        const bid = typeof pkg.branchId === 'object' && pkg.branchId !== null
          ? (pkg.branchId as any)._id || (pkg.branchId as any).id
          : pkg.branchId;
        if (bid) {
          counts[String(bid)] = (counts[String(bid)] || 0) + 1;
        } else {
          globalCount++;
        }
      }
      setBranchPackageCounts({ counts, globalCount });

      setPackages(packagesRes || []);
      if (isAuthenticated) {
        const vehiclesRes = await vehicleApi.getVehicles();
        setVehicles(vehiclesRes);
      }

      const draftStr = await AsyncStorage.getItem('aw_recurring_draft_progress');
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft.selectedBranch) setSelectedBranch(draft.selectedBranch);
        if (draft.selectedPackage) setSelectedPackage(draft.selectedPackage);
        if (draft.selectedVehicle) setSelectedVehicle(draft.selectedVehicle);
        if (draft.selectedSubServices) setSelectedSubServices(draft.selectedSubServices);
        if (draft.selectedWeekdays) setSelectedWeekdays(draft.selectedWeekdays);
        if (draft.selectedTime) setSelectedTime(draft.selectedTime);
        if (draft.weeks) setWeeks(draft.weeks);
        if (draft.voucherCode) setVoucherCode(draft.voucherCode);
        if (draft.voucherDiscount) setVoucherDiscount(draft.voucherDiscount);
        if (draft.note) setNote(draft.note);
        if (draft.step) setStep(draft.step);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllSlotsForWeekdays = useCallback(async () => {
    if (!selectedBranch?._id || !selectedPackage?._id) return;
    if (selectedWeekdays.length === 0) return;

    setIsLoadingSlots(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastCandidate = new Date(today);
      lastCandidate.setDate(lastCandidate.getDate() + getEffectiveWeeks() * 7);

      const candidateDates: string[] = [];
      const cursor = new Date(today);
      cursor.setDate(today.getDate() + 1); // tomorrow onwards
      while (cursor <= lastCandidate) {
        if (selectedWeekdays.includes(cursor.getDay())) {
          const y = cursor.getFullYear();
          const m = String(cursor.getMonth() + 1).padStart(2, '0');
          const d = String(cursor.getDate()).padStart(2, '0');
          candidateDates.push(`${y}-${m}-${d}`);
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      if (candidateDates.length === 0) {
        setDaySlots([]);
        setIsLoadingSlots(false);
        return;
      }

      const allSlotsRes = await Promise.all(
        candidateDates.map((dateStr) =>
          bookingApi.getAvailableSlots({
            branchId: selectedBranch._id,
            date: dateStr,
            packageId: selectedPackage._id,
          })
        )
      );

      const slotsMap = new Map<string, AvailableSlot>();
      if (allSlotsRes.length > 0 && allSlotsRes[0]) {
        allSlotsRes[0].forEach((slot) => slotsMap.set(slot.startTime, { ...slot }));
        for (let i = 1; i < allSlotsRes.length; i++) {
          if (!allSlotsRes[i]) continue;
          allSlotsRes[i].forEach((slot) => {
            const existing = slotsMap.get(slot.startTime);
            if (existing && !slot.available) {
              existing.available = false;
            }
          });
        }
      }
      setDaySlots(Array.from(slotsMap.values()));
    } catch (error) {
      console.error('Error fetching slots:', error);
      setDaySlots([]);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [selectedBranch?._id, selectedPackage?._id, selectedWeekdays, weeks]);

  const getStepIndex = (): number => STEPS.findIndex(s => s.key === step);

  const canGoNext = (): boolean => {
    switch (step) {
      case 'branch':
        return !!selectedBranch;
      case 'package':
        return !!selectedPackage;
      case 'vehicle':
        return !!selectedVehicle;
      case 'recurrence':
        return (
          selectedWeekdays.length > 0 &&
          !!selectedTime &&
          getEffectiveWeeks() >= 1 &&
          getEffectiveWeeks() <= 12
        );
      case 'confirm':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    const idx = getStepIndex();
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].key);
  };

  const handleBack = () => {
    const idx = getStepIndex();
    if (idx > 0) setStep(STEPS[idx - 1].key);
    else router.back();
  };

  const toggleWeekday = (day: number) => {
    setSelectedWeekdays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort(),
    );
  };

  const selectPresetWeeks = (w: number) => {
    setWeeks(w);
  };

  // Build preview dates list (same logic as BE booking.service.js)
  const buildPreviewDates = (weekdays: number[], weeksCount: number): Date[] => {
    const dates: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let w = 0; w < weeksCount; w++) {
      for (let d = 0; d < 7; d++) {
        const candidate = new Date(today);
        candidate.setDate(today.getDate() + w * 7 + d);
        if (weekdays.includes(candidate.getDay()) && candidate >= today) {
          dates.push(new Date(candidate));
        }
      }
    }
    return dates;
  };

  const previewDates = useMemo(
    () => buildPreviewDates(selectedWeekdays, getEffectiveWeeks()),
    [selectedWeekdays, getEffectiveWeeks()]
  );

  useEffect(() => {
    if (!selectedBranch || !selectedPackage || !selectedVehicle || selectedWeekdays.length === 0 || !selectedTime) {
      setValidSessionsCount(null);
      return;
    }
    let cancelled = false;
    const fetchConflicts = async () => {
      try {
        const { apiClient } = require('../../src/api/client');
        const response = await apiClient.post('/bookings/recurring/check-conflicts', {
          branchId: selectedBranch._id,
          packageId: selectedPackage._id,
          vehicleId: selectedVehicle._id,
          weekdays: selectedWeekdays,
          startTime: selectedTime,
          weeks: getEffectiveWeeks(),
        });
        if (!cancelled) {
          const conflicts = response.data?.conflicts || [];
          setValidSessionsCount(Math.max(0, previewDates.length - conflicts.length));
        }
      } catch (err) {
        if (!cancelled) setValidSessionsCount(previewDates.length);
      }
    };
    fetchConflicts();
    return () => { cancelled = true; };
  }, [selectedBranch, selectedPackage, selectedVehicle, selectedWeekdays, selectedTime, weeks, previewDates.length]);

  // Returns the effective weeks value (always clamped to 1..12).
  function getEffectiveWeeks(): number {
    return Math.min(12, Math.max(1, weeks || 0));
  }

  // Read voucher selection when returning from voucher-picker screen
  // Apply discount optimistically (like landing page) — BE will validate on submit
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingVoucher();
      if (pending) {
        setVoucherCode(pending.code);
        setVoucherDiscount(pending.discount);
      }
    }, []),
  );

  const voucherSavings = voucherDiscount;

  const handleSubmit = async () => {
    if (
      !selectedBranch ||
      !selectedPackage ||
      !selectedVehicle ||
      selectedWeekdays.length === 0 ||
      !selectedTime
    ) {
      return;
    }

    const effectiveWeeks = getEffectiveWeeks();
    if (effectiveWeeks < 1 || effectiveWeeks > 12) return;

    setIsSubmitting(true);

    try {
      const checkConflicts = async (data: any) => {
        const { apiClient } = require('../../src/api/client');
        const response = await apiClient.post('/bookings/recurring/check-conflicts', data);
        return response.data;
      };
      
      const conflictsRes = await checkConflicts({
        branchId: selectedBranch._id,
        packageId: selectedPackage._id,
        vehicleId: selectedVehicle._id,
        weekdays: selectedWeekdays,
        startTime: selectedTime,
        weeks: effectiveWeeks,
      });

      if (conflictsRes?.conflicts && conflictsRes.conflicts.length > 0) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Phát hiện trùng lịch',
            `Có ${conflictsRes.conflicts.length} buổi bị trùng:\n` +
              conflictsRes.conflicts.slice(0, 5).map((c: any) => `- ${c.date} lúc ${c.startTime}`).join('\n') +
              (conflictsRes.conflicts.length > 5 ? `\n... và ${conflictsRes.conflicts.length - 5} buổi khác` : '') +
              '\n\nBạn có muốn tiếp tục tạo các buổi còn lại không?',
            [
              { text: 'Hủy', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Tiếp tục', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) {
          setIsSubmitting(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Check conflicts error:', err);
    }

    try {
      const subServicesNote = selectedSubServices.length > 0 
        ? `\n\n[Dịch vụ thêm]: ${selectedSubServices.map(s => s.name).join(', ')}`
        : '';

      const totalSessions = previewDates.length > 0
        ? previewDates.length
        : selectedWeekdays.length * effectiveWeeks;
      const basePrice = selectedPackage?.price || 0;
      const subServicesPrice = selectedSubServices.reduce((sum, s) => sum + (s.price || 0), 0);
      const totalEstimate = totalSessions * (basePrice + subServicesPrice);
      const computedTotal = Math.max(0, totalEstimate - voucherSavings);
      const computedDeposit = paymentOption === 'full'
        ? computedTotal
        : Math.round((computedTotal * (configs?.DEPOSIT_RATE ?? 0) / 100) / 1000) * 1000;

      const recurringDraft = {
        branchId: selectedBranch._id,
        branchName: selectedBranch.name,
        packageId: selectedPackage._id,
        packageName: selectedPackage.name,
        vehicleId: selectedVehicle._id,
        vehiclePlate: selectedVehicle.licensePlate,
        weekdays: selectedWeekdays,
        startTime: selectedTime,
        weeks: effectiveWeeks,
        voucherCode: voucherCode.trim() || undefined,
        note: (note.trim() + subServicesNote).trim() || undefined,
        subServices: selectedSubServices.map(s => s._id),
        totalAmount: computedTotal,
        depositAmount: computedDeposit,
        paymentOption,
      };

      await AsyncStorage.setItem('aw_recurring_draft', JSON.stringify({
        ...recurringDraft,
        timestamp: Date.now(),
      }));
      await AsyncStorage.removeItem('aw_recurring_draft_progress');
      router.push('/payment/checkout?type=recurring' as any);
    } catch (error: any) {
      const apiMessage =
        error?.response?.data?.message || error?.message || 'Không thể tạo lịch định kỳ';
      toast.show({ variant: 'error', message: apiMessage });
      AlertDialog.error('Lỗi', apiMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------- Render helpers ----------



  const renderBranchStep = () => (
    <StepLayout
      title="Chi nhánh"
      subtitle="Chọn chi nhánh bạn muốn đặt lịch"
      icon={Icons.locationOutline}
    >
      {branches.map(branch => {
        const count = (branchPackageCounts.counts[branch._id] || 0) + branchPackageCounts.globalCount;
        const hasPackages = count > 0;
        return (
          <SelectableCard
            key={branch._id}
            title={branch.name}
            subtitle={
              <View>
                <AppText variant="caption" color="textSecondary">{branch.address}</AppText>
                <AppText variant="caption" color="textTertiary">{branch.openingTime} - {branch.closingTime}</AppText>
              </View>
            }
            icon={Icons.locationOutline}
            selected={selectedBranch?._id === branch._id}
            disabled={!hasPackages}
            disabledLabel="Chi nhánh này hiện chưa có gói dịch vụ nào"
            onPress={() => {
              if (selectedBranch?._id === branch._id) return;
              setSelectedBranch(branch);
              setSelectedPackage(null);
              setSelectedSubServices([]);
              setSelectedTime('');
              setDaySlots([]);
            }}
          />
        );
      })}
    </StepLayout>
  );

  const renderPackageStep = () => (
    <StepLayout
      title="Gói dịch vụ"
      subtitle="Chọn gói rửa xe phù hợp với nhu cầu"
      icon={Icons.sparkle}
    >
      {filteredPackages.length === 0 ? (
        <EmptyState
          icon={<AppText style={styles.optionEmoji}>✨</AppText>}
          title="Chưa có gói dịch vụ"
          message={
            selectedBranch
              ? `Chi nhánh "${selectedBranch.name}" chưa có gói nào. Bạn có thể chọn chi nhánh khác hoặc quay lại bước trước.`
              : 'Hiện không có gói dịch vụ nào khả dụng.'
          }
        />
      ) : (
        filteredPackages.map(pkg => (
          <SelectableCard
            key={pkg._id}
            title={pkg.name}
            subtitle={
              <View>
                <AppText variant="caption" color="textSecondary">
                  {pkg.duration} phút •{' '}
                  {pkg.category === 'full'
                    ? 'Toàn diện'
                    : pkg.category === 'external'
                      ? 'Rửa ngoài'
                      : 'Dọn nội thất'}
                </AppText>
                <AppText variant="body" color="primary" style={styles.optionPrice}>
                  {formatCurrency(pkg.price)}
                </AppText>
              </View>
            }
            icon={Icons.sparkle}
            selected={selectedPackage?._id === pkg._id}
            onPress={() => {
              if (selectedPackage?._id === pkg._id) return;
              setSelectedPackage(pkg);
              setSelectedSubServices([]);
              setSelectedTime('');
              setDaySlots([]);
            }}
          />
        ))
      )}
      {selectedPackage?.subServices && selectedPackage.subServices.some((s: any) => s.isOptional) && (
        <View style={{ marginTop: spacing.md }}>
          <AppText variant="h4" style={{ marginBottom: spacing.sm }}>
            Dịch vụ thêm (Tùy chọn)
          </AppText>
          {selectedPackage.subServices.filter((s: any) => s.isOptional).map((sub: any) => {
            const isSelected = selectedSubServices.some(s => s._id === sub._id);
            return (
              <TouchableOpacity
                key={sub._id}
                style={[
                  styles.optionCard,
                  { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderRadius: 8, marginBottom: spacing.sm },
                  isSelected && { borderWidth: 1, borderColor: colors.primary }
                ]}
                onPress={() => {
                  setSelectedSubServices(prev =>
                    isSelected ? prev.filter(s => s._id !== sub._id) : [...prev, sub]
                  );
                }}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="body" style={{ fontWeight: '600' }}>{sub.name}</AppText>
                  <AppText variant="caption" color="primary">{formatCurrency(sub.price)}</AppText>
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: isSelected ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected ? colors.primary : 'transparent' }}>
                  {isSelected && <AppText style={{ color: 'white', fontSize: 12 }}>✓</AppText>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </StepLayout>
  );

  const renderVehicleStep = () => (
    <StepLayout
      title="Phương tiện"
      subtitle="Chọn xe bạn sẽ sử dụng dịch vụ"
      icon={Icons.carOutline}
    >
      {vehicles.length === 0 ? (
        <EmptyState
          title="Chưa có phương tiện"
          message="Vui lòng thêm phương tiện trước"
          actionLabel="Thêm xe"
          onAction={() => router.push('/vehicle/add')}
        />
      ) : (
        vehicles.map(vehicle => (
          <SelectableCard
            key={vehicle._id}
            title={vehicle.licensePlate}
            subtitle={
              <View>
                <AppText variant="caption" color="textSecondary">
                  {vehicle.brand} {vehicle.model && `• ${vehicle.model}`}
                </AppText>
                <AppText variant="caption" color="textTertiary">
                  {vehicle.color} • {vehicle.vehicleType}
                </AppText>
              </View>
            }
            icon={Icons.carOutline}
            selected={selectedVehicle?._id === vehicle._id}
            onPress={() => setSelectedVehicle(vehicle)}
          />
        ))
      )}
      <Button
        title="+ Thêm phương tiện mới"
        variant="outline"
        onPress={() => router.push('/vehicle/add')}
        style={styles.addButton}
      />
    </StepLayout>
  );

  const renderRecurrenceStep = () => (
    <StepLayout
      title="Lịch hẹn"
      subtitle="Chọn thứ, giờ và số tuần đặt lịch"
      icon={Icons.calendarOutline}
    >
      {/* Weekday picker */}
      <AppText variant="label" style={styles.sectionLabel}>
        Chọn thứ trong tuần
      </AppText>
      <View style={styles.weekdayRow}>
        {WEEKDAY_OPTIONS.map(day => {
          const active = selectedWeekdays.includes(day.value);
          return (
            <TouchableOpacity
              key={day.value}
              style={[
                styles.weekdayChip,
                active && styles.weekdayChipActive,
              ]}
              onPress={() => toggleWeekday(day.value)}
            >
              <AppText
                style={[
                  styles.weekdayChipText,
                  active && styles.weekdayChipTextActive,
                ]}
              >
                {day.short}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
      <AppText variant="caption" color="textSecondary" style={styles.helperText}>
        Có thể chọn nhiều thứ
      </AppText>

      {/* Time picker */}
      <AppText variant="label" style={styles.sectionLabel}>
        Khung giờ cố định
      </AppText>
      {selectedWeekdays.length === 0 ? (
        <AppText variant="body" color="textSecondary">
          Vui lòng chọn ít nhất một thứ trong tuần trước
        </AppText>
      ) : isLoadingSlots ? (
        <View style={styles.timeGrid}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <View key={i} style={styles.timeCardSkeleton}>
              <AppText style={styles.timeLoadingText}>--:--</AppText>
            </View>
          ))}
        </View>
      ) : daySlots.length === 0 ? (
        <AppText variant="body" color="textSecondary">
          Không có khung giờ trống
        </AppText>
      ) : (
        <>
          {(() => {
            // Group slots into morning / afternoon like landing page TIME_SLOTS layout.
            const morning = daySlots.filter(s => {
              const hour = parseInt((s.startTime || '0').split(':')[0], 10);
              return hour < 12;
            });
            const afternoon = daySlots.filter(s => {
              const hour = parseInt((s.startTime || '0').split(':')[0], 10);
              return hour >= 12;
            });

            const renderSlotGrid = (slots: AvailableSlot[]) => (
              <View style={styles.timeGrid}>
                {slots.map((slot, idx) => {
                  // Determine the FIRST upcoming date matching one of the chosen
                  // weekdays — same logic as fetchSlotsForFirstWeekday so the keys
                  // line up with userBookedSlotKeys.
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  let candidate = new Date(today);
                  candidate.setDate(today.getDate() + 1);
                  for (let i = 0; i < 7; i++) {
                    if (selectedWeekdays.includes(candidate.getDay())) break;
                    candidate.setDate(candidate.getDate() + 1);
                  }
                  const yy = candidate.getFullYear();
                  const mm = String(candidate.getMonth() + 1).padStart(2, '0');
                  const dd = String(candidate.getDate()).padStart(2, '0');
                  const slotDateStr = `${yy}-${mm}-${dd}`;
                  const userHasThisSlot = userBookedSlotKeys.has(
                    `${slotDateStr}|${slot.startTime}`,
                  );
                  const isUnavailable = !slot.available && !userHasThisSlot;
                  const isVipOnly =
                    !!slot.vipOnly && !isUnavailable && !userHasThisSlot && !isVip;
                  const isLocked = userHasThisSlot || isUnavailable || isVipOnly;
                  const canBook = slot.available && !isVipOnly;
                  return (
                    <TouchableOpacity
                      key={`${slot.startTime}-${idx}`}
                      style={[
                        styles.timeCard,
                        isLocked && styles.timeCardDisabled,
                        selectedTime === slot.startTime && styles.timeCardSelected,
                      ]}
                      disabled={!canBook}
                      onPress={() => canBook && setSelectedTime(slot.startTime)}
                    >
                      <AppText
                        style={[
                          styles.timeText,
                          isLocked && styles.timeTextDisabled,
                          selectedTime === slot.startTime && styles.timeTextSelected,
                        ]}
                      >
                        {slot.startTime}
                      </AppText>
                      {userHasThisSlot ? (
                        <AppText style={[styles.timeSlotFull, { color: colors.primary }]}>
                          Bạn đã đặt
                        </AppText>
                      ) : isUnavailable ? (
                        <AppText style={styles.timeSlotFull}>Kín</AppText>
                      ) : isVipOnly ? (
                        <AppText style={[styles.timeSlotFull, { color: colors.warning }]}>
                          VIP
                        </AppText>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );

            return (
              <View>
                {morning.length > 0 ? (
                  <View style={{ marginBottom: spacing.sm }}>
                    <AppText variant="caption" color="textSecondary" style={styles.slotGroupLabel}>
                      Buổi sáng
                    </AppText>
                    {renderSlotGrid(morning)}
                  </View>
                ) : null}
                {afternoon.length > 0 ? (
                  <View>
                    <AppText variant="caption" color="textSecondary" style={styles.slotGroupLabel}>
                      Buổi chiều
                    </AppText>
                    {renderSlotGrid(afternoon)}
                  </View>
                ) : null}
              </View>
            );
          })()}
        </>
      )}

      <AppText variant="caption" color="textTertiary" style={styles.helperText}>
        Khoảng giờ hiển thị chỉ cho 1 ngày mẫu. Backend sẽ tự đổi sang giờ
        trống gần nhất (±2h) cho các ngày sau bị trùng, hoặc bỏ qua nếu cả
        ngày đã kín — bạn sẽ thấy số buổi tạo được / bị bỏ qua sau khi đặt.
      </AppText>

      {/* Weeks picker — presets match landing page: 1,2,3,4,6,8,12 */}
      <AppText variant="label" style={styles.sectionLabel}>
        Số tuần lặp lại
      </AppText>
      <View style={styles.weeksRow}>
        {WEEK_PRESETS.map(w => (
          <TouchableOpacity
            key={w}
            style={[
              styles.weekChip,
              weeks === w && styles.weekChipActive,
            ]}
            onPress={() => selectPresetWeeks(w)}
          >
            <AppText
              style={[
                styles.weekChipText,
                weeks === w && styles.weekChipTextActive,
              ]}
            >
              {w}
            </AppText>
          </TouchableOpacity>
        ))}
      </View>
      <AppText variant="caption" color="textTertiary" style={styles.helperText}>
        {getEffectiveWeeks()} tuần · {previewDates.length} buổi dự kiến
      </AppText>

      {/* Total sessions preview */}
      <Card style={styles.previewCard}>
        <AppText variant="label" color="textSecondary">
          Tổng số buổi ước tính
        </AppText>
        <AppText variant="h2" color="primary">
          {validSessionsCount !== null ? validSessionsCount : previewDates.length} buổi hợp lệ
        </AppText>
        {validSessionsCount !== null && validSessionsCount < previewDates.length && (
           <AppText variant="caption" color="error">
             (Bỏ qua {previewDates.length - validSessionsCount} buổi do kín lịch)
           </AppText>
        )}
        <AppText variant="caption" color="textTertiary" style={{ marginTop: 4 }}>
          {selectedWeekdays.length} thứ × {getEffectiveWeeks()} tuần
          {selectedTime ? ` • lúc ${selectedTime}` : ''}
        </AppText>
      </Card>

      {/* Preview dates list */}
      {previewDates.length > 0 && (
        <Card style={styles.previewDatesCard}>
          <AppText variant="label" color="textSecondary">
            Lịch dự kiến ({previewDates.length} buổi)
          </AppText>
          <View style={styles.previewDatesList}>
            {previewDates.slice(0, 8).map((d, i) => {
              const weekdayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
              return (
                <View key={i} style={styles.previewDateItem}>
                  <AppText style={styles.previewDateWeekday}>
                    {weekdayLabels[d.getDay()]}
                  </AppText>
                  <AppText style={styles.previewDateValue}>
                    {d.toLocaleDateString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </AppText>
                </View>
              );
            })}
          </View>
          {previewDates.length > 8 && (
            <AppText variant="caption" color="textTertiary" style={styles.previewMore}>
              +{previewDates.length - 8} ngày nữa
            </AppText>
          )}
        </Card>
      )}
    </StepLayout>
  );

  const renderConfirmStep = () => {
    if (!selectedBranch || !selectedPackage || !selectedVehicle || selectedWeekdays.length === 0 || !selectedTime) {
      return null;
    }

    const effectiveWeeks = getEffectiveWeeks();
    // Use validSessionsCount if available, otherwise fallback
    const totalSessions = validSessionsCount !== null 
      ? validSessionsCount 
      : (previewDates.length > 0 ? previewDates.length : selectedWeekdays.length * effectiveWeeks);
    const basePrice = selectedPackage?.price || 0;
    const subServicesPrice = selectedSubServices.reduce((sum, s) => sum + (s.price || 0), 0);
    const pricePerSession = basePrice + subServicesPrice;
    const totalEstimate = totalSessions * pricePerSession;
    const finalEstimate = Math.max(0, totalEstimate - voucherSavings);
    // Cọc theo cấu hình DEPOSIT_RATE × TỔNG tiền cả nhóm, làm tròn 1.000đ — match logic BE.
    const depositRate = depositPercent / 100;
    const depositAmount = Math.round((finalEstimate * depositRate) / 1000) * 1000;
    const payNowAmount = paymentOption === 'full' ? finalEstimate : depositAmount;
    // Loyalty points — match FE RecurringBookingFlow.jsx (5% × tier multiplier).
    const priceAfterVoucherPerSession = totalSessions > 0
      ? Math.max(0, Math.floor(finalEstimate / totalSessions))
      : Math.max(0, pricePerSession - Math.floor(voucherSavings / Math.max(1, totalSessions)));
    const pointsPerSession = Math.floor(
      priceAfterVoucherPerSession * (configs?.LOYALTY_BASE_EARNING_RATE ? (configs.LOYALTY_BASE_EARNING_RATE / 100) : 0) * getPointMultiplier(userTier, configs?.LOYALTY_TIERS),
    );
    const totalPoints = pointsPerSession * totalSessions;
    const weekdayLabels = selectedWeekdays
      .map(d => WEEKDAY_OPTIONS.find(o => o.value === d)?.long)
      .filter(Boolean)
      .join(', ');

    return (
      <StepLayout
        title="Xác nhận"
        subtitle="Vui lòng kiểm tra lại thông tin và chọn hình thức thanh toán"
        icon={Icons.checkmark}
      >
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Chi nhánh</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>{selectedBranch?.name}</AppText>
          </View>
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Địa chỉ</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>{selectedBranch?.address}</AppText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Gói dịch vụ</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>{selectedPackage?.name}</AppText>
          </View>
          {selectedSubServices.length > 0 && (
            <View style={styles.summaryRow}>
              <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Dịch vụ thêm</AppText>
              <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>
                {selectedSubServices.map(s => s.name).join(', ')}
              </AppText>
            </View>
          )}
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Phương tiện</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>{selectedVehicle?.licensePlate}</AppText>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Thứ</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>{weekdayLabels || '—'}</AppText>
          </View>
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Giờ</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>{selectedTime || '—'}</AppText>
          </View>
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Số tuần</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>{effectiveWeeks} tuần</AppText>
          </View>
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Tổng buổi hợp lệ</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>{totalSessions} buổi</AppText>
          </View>

          {/* Preview dates in confirm step */}
          {previewDates.length > 0 && (
            <View style={styles.confirmPreviewDates}>
              <AppText variant="label" color="textPrimary" style={styles.confirmPreviewTitle}>
                Lịch dự kiến ({previewDates.length} buổi)
              </AppText>
              {previewDates.slice(0, 8).map((d, i) => {
                const weekdayShort = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                return (
                  <View key={i} style={styles.confirmPreviewItem}>
                    <AppText style={styles.confirmPreviewWeekday}>
                      {weekdayShort[d.getDay()]}
                    </AppText>
                    <AppText style={styles.confirmPreviewDate}>
                      {d.toLocaleDateString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </AppText>
                  </View>
                );
              })}
              {previewDates.length > 8 && (
                <AppText variant="caption" color="textTertiary" style={styles.confirmPreviewMore}>
                  +{previewDates.length - 8} ngày nữa
                </AppText>
              )}
            </View>
          )}
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Đơn giá</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryValue}>
              {formatCurrency(pricePerSession)} / buổi
            </AppText>
          </View>
          <View style={styles.summaryRow}>
            <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Tổng cộng</AppText>
            <AppText variant="bodySmall" color="textPrimary" style={styles.summaryPrice}>
              {formatCurrency(totalEstimate)}
            </AppText>
          </View>
          {voucherSavings > 0 && (
            <View style={styles.summaryRow}>
              <AppText variant="caption" style={[styles.summaryLabel, { color: '#10b981' }]}>Giảm giá voucher</AppText>
              <AppText variant="bodySmall" style={[styles.summaryPrice, { color: '#10b981' }]}>
                -{formatCurrency(voucherSavings)}
              </AppText>
            </View>
          )}
          {voucherSavings > 0 && (
            <View style={styles.summaryRow}>
              <AppText variant="caption" color="textSecondary" style={[styles.summaryLabel, { fontWeight: '700' }]}>Thành tiền</AppText>
              <AppText variant="bodySmall" color="textPrimary" style={[styles.summaryPrice, { fontWeight: '700' }]}>
                {formatCurrency(finalEstimate)}
              </AppText>
            </View>
          )}
          {totalPoints > 0 ? (
            <View style={styles.summaryRow}>
              <AppText variant="caption" color="textSecondary" style={styles.summaryLabel}>Điểm tích lũy ước tính</AppText>
              <AppText variant="bodySmall" style={[styles.summaryValue, { color: colors.primary, fontWeight: '700' }]}>
                +{totalPoints} điểm
              </AppText>
            </View>
          ) : null}
        </Card>

        {/* Payment mode toggle — deposit 30% vs full payment (match landing page) */}
        <AppText variant="label" style={styles.sectionLabel}>
          Hình thức thanh toán
        </AppText>
        <View style={styles.paymentOptionRow}>
          <TouchableOpacity
            style={[
              styles.paymentOptionCard,
              paymentOption === 'deposit' && styles.paymentOptionCardActive,
            ]}
            onPress={() => setPaymentOption('deposit')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.paymentOptionTitle,
                paymentOption === 'deposit' && styles.paymentOptionTitleActive,
              ]}
            >
              Đặt cọc {depositPercent}%
            </Text>
            <Text
              style={[
                styles.paymentOptionAmount,
                paymentOption === 'deposit' && styles.paymentOptionAmountActive,
              ]}
            >
              {formatCurrency(depositAmount)}
            </Text>
            <Text
              style={[
                styles.paymentOptionHint,
                paymentOption === 'deposit' && styles.paymentOptionHintActive,
              ]}
            >
              Còn lại {formatCurrency(Math.max(0, finalEstimate - depositAmount))} sau buổi cuối
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.paymentOptionCard,
              paymentOption === 'full' && styles.paymentOptionCardActive,
            ]}
            onPress={() => setPaymentOption('full')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.paymentOptionTitle,
                paymentOption === 'full' && styles.paymentOptionTitleActive,
              ]}
            >
              Thanh toán đủ
            </Text>
            <Text
              style={[
                styles.paymentOptionAmount,
                paymentOption === 'full' && styles.paymentOptionAmountActive,
              ]}
            >
              {formatCurrency(finalEstimate)}
            </Text>
            <Text
              style={[
                styles.paymentOptionHint,
                paymentOption === 'full' && styles.paymentOptionHintActive,
              ]}
            >
              Thanh toán 100% ngay
            </Text>
          </TouchableOpacity>
        </View>
        <Card style={styles.payNowCard}>
          <AppText variant="label" color="textSecondary">
            Số tiền thanh toán ngay
          </AppText>
          <AppText variant="h2" color="primary">
            {formatCurrency(payNowAmount)}
          </AppText>
        </Card>

        {/* Voucher Picker — navigates to dedicated screen */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.voucherButton,
            {
              backgroundColor: voucherCode ? '#ECFDF5' : '#F0FDF4',
              borderColor: voucherCode ? colors.primary : '#A7F3D0',
              borderWidth: 1.5,
            },
          ]}
          onPress={() => {
            router.push(
              `/booking/voucher-picker?branchId=${selectedBranch?._id || ''}&orderAmount=${totalEstimate}`,
            );
          }}
        >
          <View style={styles.voucherButtonContent}>
            {/* Icon Avatar Badge */}
            <View style={[
              styles.voucherIconBadge,
              { backgroundColor: voucherCode ? colors.primary : '#10B981' }
            ]}>
              <Icon
                name={voucherCode ? Icons.checkmarkCircle : Icons.ticketOutline}
                size={20}
                color="#FFFFFF"
              />
            </View>

            {/* Text Details */}
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={[
                styles.voucherTagText,
                { color: voucherCode ? '#059669' : colors.primaryDark }
              ]}>
                {voucherCode ? 'ĐÃ ÁP DỤNG VOUCHER' : 'VOUCHER & ƯU ĐÃI'}
              </Text>

              {voucherCode ? (
                <Text style={styles.voucherSelectedText} numberOfLines={1}>
                  {voucherCode}
                  {voucherDiscount > 0 ? ` — Tiết kiệm ${formatCurrency(voucherDiscount)}` : ''}
                </Text>
              ) : (
                <Text style={styles.voucherPlaceholderText}>
                  Chọn voucher để tiết kiệm thêm ✨
                </Text>
              )}
            </View>

            {/* Right Action Button */}
            {voucherCode ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setVoucherCode('');
                  setVoucherDiscount(0);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.voucherClearBtn}
                accessibilityLabel="Xóa voucher"
              >
                <Icon name={Icons.close} size={14} color="#DC2626" />
              </TouchableOpacity>
            ) : (
              <View style={styles.voucherArrowBadge}>
                <Icon name={Icons.chevronForward} size={16} color={colors.primary} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        <Input
          label="Ghi chú (tùy chọn)"
          placeholder="Ghi chú cho các buổi đặt lịch"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          containerStyle={styles.voucherInput}
        />
      </StepLayout>
    );
  };

  // ---------- Guards ----------

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          title="Vui lòng đăng nhập"
          message="Bạn cần đăng nhập để đặt lịch"
          actionLabel="Đăng nhập"
          onAction={() => router.push('/(auth)/login')}
        />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return <Loading fullScreen message="Đang tải..." />;
  }

  return (
    <ScreenContainer>
      <Header 
        title="Đặt lịch định kỳ" 
        showBack 
        onBackPress={handleBack}
        rightAction={
          <TouchableOpacity onPress={saveProgressAndHome} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Về trang chủ">
            <Icon name={Icons.homeOutline} size={24} color={colors.primary} />
          </TouchableOpacity>
        }
      />
      <StepIndicator
        steps={STEPS}
        currentIndex={getStepIndex()}
        onStepPress={(idx: number) => {
          if (idx < getStepIndex()) setStep(STEPS[idx].key);
        }}
      />
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xs }}
        showsVerticalScrollIndicator={false}
      >
        {step === 'branch' && renderBranchStep()}
        {step === 'package' && renderPackageStep()}
        {step === 'vehicle' && renderVehicleStep()}
        {step === 'recurrence' && renderRecurrenceStep()}
        {step === 'confirm' && renderConfirmStep()}
      </ScrollView>

      <View style={[styles.bottomAction, { backgroundColor: 'transparent' }]}>
        {getStepIndex() > 0 ? (
          <View style={{ marginBottom: spacing.sm }}>
            <Button title="Quay lại" variant="outline" onPress={handleBack} fullWidth />
          </View>
        ) : null}
        <View>
          <Button
            title={step === 'confirm' ? 'Xác nhận đặt lịch định kỳ' : 'Tiếp tục'}
            onPress={step === 'confirm' ? handleSubmit : handleNext}
            disabled={!canGoNext()}
            loading={isSubmitting}
            fullWidth
            accessibilityLabel={step === 'confirm' ? 'Xác nhận đặt lịch định kỳ' : 'Tiếp tục bước tiếp theo'}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    fontSize: 24,
    color: colors.primary,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
  },
  progressDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 3,
  },
  progressDotText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  progressDotTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  progressLabel: {
    fontSize: 10,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  progressLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  stepHeaderIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepHeaderText: {
    flex: 1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  stepTitle: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  helperText: {
    marginTop: spacing.xs,
  },
  doubleBezelOuter: {
    padding: 6,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  doubleBezelInner: {
    borderRadius: 18,
    padding: spacing.md,
  },
  optionCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  optionCheckEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    marginLeft: spacing.sm,
  },
  optionCard: {
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: layout.cardRadius,
    ...shadows.md,
  },
  optionCardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  optionEmoji: {
    fontSize: 24,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  optionPrice: {
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  checkIcon: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '600',
  },
  addButton: {
    marginTop: spacing.md,
  },
  weekdayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  weekdayChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  weekdayChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
  },
  weekdayChipText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  weekdayChipTextActive: {
    color: colors.textInverse,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timeCard: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 16,
    minWidth: 72,
    alignItems: 'center',
    ...shadows.sm,
  },
  timeCardDisabled: {
    opacity: 0.5,
  },
  timeCardSelected: {
    backgroundColor: colors.primary,
  },
  timeText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  timeTextDisabled: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  timeTextSelected: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  timeSlotFull: {
    ...typography.caption,
    color: colors.error,
    fontSize: 10,
    marginTop: 2,
  },
  timeCardSkeleton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceDark,
    borderRadius: 16,
    minWidth: 72,
    alignItems: 'center',
    opacity: 0.5,
  },
  timeLoadingText: {
    ...typography.body,
    color: colors.textTertiary,
  },
  weeksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  weekChip: {
    minWidth: 48,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  weekChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekChipText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  weekChipTextActive: {
    color: colors.textInverse,
    fontWeight: '700',
  },
  slotGroupLabel: {
    marginBottom: spacing.xs,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  paymentOptionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  paymentOptionCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  paymentOptionCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  paymentOptionTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
  },
  paymentOptionTitleActive: {
    color: colors.textInverse,
  },
  paymentOptionAmount: {
    ...typography.h4,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 4,
  },
  paymentOptionAmountActive: {
    color: colors.textInverse,
  },
  paymentOptionHint: {
    ...typography.caption,
    color: colors.textTertiary,
    fontSize: 11,
  },
  paymentOptionHintActive: {
    color: colors.textInverse,
    opacity: 0.9,
  },
  payNowCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.infoLight,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: '#BAE6FD', // colors.infoLight hex; tint slightly stronger
    ...shadows.md,
  },
  previewCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.infoLight,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    ...shadows.md,
  },
  previewDatesCard: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceDark,
    borderRadius: layout.cardRadius,
  },
  previewDatesList: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  previewDateItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
  },
  previewDateWeekday: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  previewDateValue: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  previewMore: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  summaryCard: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: layout.cardRadius,
    ...shadows.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  summaryPrice: {
    ...typography.h3,
    color: colors.primary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.sm,
  },
  summaryFootnote: {
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  confirmPreviewDates: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  confirmPreviewTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  confirmPreviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: spacing.xs,
  },
  confirmPreviewWeekday: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  confirmPreviewDate: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  confirmPreviewMore: {
    fontSize: 12,
    color: colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  voucherInput: {
    marginTop: spacing.md,
  },
  bottomAction: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  bottomPadding: {
    height: spacing.xxl,
  },
  voucherButton: {
    marginTop: spacing.md,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  voucherButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voucherIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voucherTagText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  voucherSelectedText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#047857',
    marginTop: 2,
  },
  voucherPlaceholderText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  voucherClearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  voucherArrowBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
});

interface StepLayoutProps {
  title: string;
  subtitle?: string;
  icon: string;
  children: React.ReactNode;
}

const StepLayout: React.FC<StepLayoutProps> = ({ title, subtitle, icon, children }) => {
  const colors = useColors();
  return (
    <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
      <View style={styles.stepHeader}>
        <View style={[styles.stepHeaderIcon, { backgroundColor: colors.primarySubtle }]}>
          <Icon name={icon} size={24} color={colors.primary} />
        </View>
        <View style={styles.stepHeaderText}>
          <AppText variant="h2" style={{ fontWeight: '700' }}>{title}</AppText>
          {subtitle ? (
            <AppText variant="body" color="textSecondary" style={{ marginTop: 4 }}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
};

interface SelectableCardProps {
  selected: boolean;
  onPress: () => void;
  icon: string;
  title: string;
  subtitle: React.ReactNode;
  disabled?: boolean;
  disabledLabel?: string;
}

const SelectableCard: React.FC<SelectableCardProps> = ({
  selected,
  onPress,
  icon,
  title,
  subtitle,
  disabled,
  disabledLabel,
}) => {
  const colors = useColors();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={title}
    >
      <Card
        style={[
          styles.optionCard,
          {
            backgroundColor: selected ? colors.primarySubtle : colors.surface,
            borderColor: selected ? colors.primary : colors.borderLight,
            opacity: disabled ? 0.6 : 1,
            marginBottom: spacing.md,
            padding: spacing.lg,
          },
        ]}
      >
        <View style={styles.optionRow}>
          <View
            style={[
              styles.optionIcon,
              { backgroundColor: selected ? colors.primary : colors.background },
              disabled && { elevation: 0, shadowOpacity: 0 }
            ]}
          >
            <Icon
              name={icon}
              size={22}
              color={selected ? colors.textInverse : colors.primary}
            />
          </View>
          <View style={styles.optionInfo}>
            <AppText variant="body" style={styles.optionTitle} numberOfLines={1}>
              {title}
            </AppText>
            {subtitle}
            {disabled && disabledLabel ? (
              <AppText
                variant="caption"
                color="error"
                style={{ marginTop: spacing.xs, fontWeight: '500' }}
              >
                {disabledLabel}
              </AppText>
            ) : null}
          </View>
          <View style={[
            selected ? styles.optionCheck : styles.optionCheckEmpty,
            {
              backgroundColor: selected ? colors.primary : 'transparent',
              borderColor: selected ? colors.primary : colors.textTertiary,
            }
          ]}>
            {selected && <Icon name={Icons.checkmark} size={14} color={colors.textInverse} />}
          </View>
        </View>
      </Card>
    </PressableScale>
  );
};
