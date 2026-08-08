/**
 * AutoWashPro Booking Flow
 *
 * 5-step booking flow backed by BookingContext (mirrors the web landing page
 * BookingWidget):
 *   branch → package → vehicle → datetime → confirm
 *
 * State & persistence:
 *  - Selections + step live in `BookingContext` so the user can deep-link in or
 *    back out without losing progress (draft is persisted to AsyncStorage).
 *  - Step transitions (`goNext` / `goBack`) and validation (`canGoNext`) are
 *    owned by the context — this screen only renders the active step and
 *    orchestrates side-effects (data fetch, slot lookup, submit).
 *
 * UX guidelines:
 *  - multi-step-progress (persisted via StepIndicator)
 *  - progressive disclosure (only the relevant step is interactive)
 *  - 44pt minimum touch targets
 *  - bottom-sticky primary CTA with safe-area handling
 *  - color-semantic tokens (no hardcoded hex)
 *  - loading / empty / error states per step
 *  - inline validation feedback
 *  - accessible labels for every interactive control
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Text as RNText,
  Text,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSystemConfig } from '../../src/contexts/ConfigContext';
import {
  useBooking,
  type VoucherState,
  type BookingStep,
} from '../../src/contexts/BookingContext';
import { useTranslation } from 'react-i18next';
import { translateDynamicText } from '../../src/utils';
import sseService from '../../src/services/sse';
import { SOCKET_EVENTS } from '../../src/utils/socketEvents';
import { branchApi, packageApi, vehicleApi, bookingApi, slotPackApi } from '../../src/api';
import {
  Text as AppText,
  Card,
  Button,
  Loading,
  EmptyState,
  Input,
  Icon,
  Icons,
  PressableScale,
  Header,
  ScreenContainer,
  StepIndicator,
  Chip,
  useToast,
  useAlertDialog,
} from '../../src/components/common';
import { useColors } from '../../src/theme/ThemeContext';
import { spacing, borderRadius, layout, shadows } from '../../src/theme/spacing';
import { formatCurrency } from '../../src/utils';
import { consumePendingVoucher } from '../../src/utils/voucherStore';
import type {
  Branch,
  Package,
  Vehicle,
  AvailableSlot,
  SlotPack,
} from '../../src/types';

const STEP_META: { key: BookingStep; label: string }[] = [
  { key: 'branch', label: 'Chi nhánh' },
  { key: 'package', label: 'Gói DV' },
  { key: 'vehicle', label: 'Xe' },
  { key: 'datetime', label: 'Thời gian' },
  { key: 'confirm', label: 'Xác nhận' },
];

const STEP_ICONS: Record<BookingStep, string> = {
  branch: Icons.locationOutline,
  package: Icons.sparkle,
  vehicle: Icons.carOutline,
  datetime: Icons.calendarOutline,
  confirm: Icons.checkmark,
};

const getVehicleTypeLabel = (type: string) => {
  switch (type) {
    case 'sedan': return 'Sedan';
    case 'suv': return 'SUV';
    case 'pickup': return 'Pickup';
    case 'van': return 'Van';
    default: return 'Sedan';
  }
};

const FALLBACK_TIME_SLOTS = [
  '08:00 - 08:30', '08:30 - 09:00', '09:00 - 09:30', '09:30 - 10:00',
  '10:00 - 10:30', '10:30 - 11:00', '11:00 - 11:30',
  '13:00 - 13:30', '13:30 - 14:00', '14:00 - 14:30', '14:30 - 15:00',
  '15:00 - 15:30', '15:30 - 16:00', '16:00 - 16:30', '16:30 - 17:00', '17:00 - 17:30',
];

export default function BookingScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, fetchUser: refreshUser, isAuthenticated } = useAuth();
  const colors = useColors();
  const toast = useToast();
  const alertDialog = useAlertDialog();
  const configs = useSystemConfig();
  const params = useLocalSearchParams();

  const {
    step,
    setStep,
    goNext,
    goBack,
    canGoNext,
    stepIndex,
    selectedBranch,
    setSelectedBranch,
    selectedPackage,
    setSelectedPackage,
    replaceSelectedPackage,
    selectedVehicle,
    setSelectedVehicle,
    selectedDate,
    selectedTime,
    setSelectedDateTime,
    resetAll,
    isHydrated,
  } = useBooking();

  // Local catalog state — kept per-screen because the catalog changes
  // frequently and isn't worth caching across flows.
  const [branches, setBranches] = useState<Branch[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [branchPackageCounts, setBranchPackageCounts] = useState<{ counts: Record<string, number>; globalCount: number }>({ counts: {}, globalCount: 0 });
  const selectedBranchIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedBranchIdRef.current = selectedBranch?._id || null;
  }, [selectedBranch?._id]);

  const [dateSlots, setDateSlots] = useState<Record<string, AvailableSlot[]>>({});
  const [dateSlotsErrors, setDateSlotsErrors] = useState<Record<string, string>>({});

  // Tracks the last (branchId) for which we have already attempted the
  // branch-scoped `/packages?branchId=…` fetch. Used by the swap effect
  // below to know when it is safe to decide there is *no* swap candidate.
  const [branchPackagesAttempted, setBranchPackagesAttempted] = useState<string | null>(null);

  const [selectedSubServices, setSelectedSubServices] = useState<string[]>([]);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherDiscount, setVoucherDiscount] = useState(0);

  // Slot packs: load the user's active packs once authenticated, and let the
  // user apply one in the confirm step. Packs whose (branch, package, vehicle)
  // match the current selection are surfaced as `validPacks` below — same
  // logic as the web landing BookingFlow.
  const [mySlotPacks, setMySlotPacks] = useState<SlotPack[]>([]);
  const [selectedSlotPackId, setSelectedSlotPackId] = useState<string | null>(null);

  // True while we're navigating to an internal sub-screen (voucher-picker,
  // vehicle/add, login) and expect to come BACK to a still-in-progress
  // booking. The focus reset below checks this so it only wipes the draft on
  // a genuine fresh entry, not when returning from one of these detours.
  const returningFromSubScreen = useRef(false);
  const [paymentOption, setPaymentOption] = useState<'deposit' | 'full'>('deposit');

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dateOptions = useMemo(() => {
    const userTier = user?.tier || 'bronze';
    const limits = configs?.ADVANCE_BOOKING_LIMITS || { bronze: 14, silver: 14, gold: 30, diamond: 60 };
    const maxDays = limits[userTier] || 14;
    return generateDateOptions(maxDays);
  }, [user?.tier, configs?.ADVANCE_BOOKING_LIMITS]);

  useEffect(() => {
    setSelectedSubServices([]);
  }, [selectedPackage?._id]);

  // Reset the draft if the user is no longer authenticated.
  useEffect(() => {
    if (isHydrated && !isAuthenticated) resetAll();
  }, [isHydrated, isAuthenticated, resetAll]);

  // Load the authenticated user's slot packs once (used in the confirm step).
  // Mirrors the web BookingFlow's `/slot-packs/my` call so the customer can
  // pay with a pack instead of a voucher.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const packs = await slotPackApi.getMySlotPacks();
        if (!cancelled && Array.isArray(packs)) setMySlotPacks(packs);
      } catch {
        /* slot packs are optional — fail silently */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Initial catalog load + deep-link prefill.
  useEffect(() => {
    let cancelled = false;
    const fetchInitial = async () => {
      try {
        const [branchesRes, packagesRes] = await Promise.all([
          branchApi.getPublicBranches(),
          // Pass `limit: 'all'` so the mobile booking flow receives the FULL
          // active catalog, not just the first 9 sorted by price. Without
          // this, the branch-filtered package view can end up empty because
          // the branch's packages were all > 9th by price.
          packageApi.getPackages({ status: 'active', limit: 'all' }),
        ]);
        if (cancelled) return;
        setBranches(branchesRes);

        // Compute and store branch package counts ONCE using the raw initial catalog.
        // This prevents other branches from falsely appearing empty after dedupe
        // drops their specific package variants when a branch is selected.
        const counts: Record<string, number> = {};
        let globalCount = 0;
        for (const pkg of packagesRes) {
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

        // Dedupe packages — backend has been observed to return the same
        // (name, price, duration, category) under multiple `_id`s (one per
        // branch), which made the picker show duplicates. We don't know
        // the branch yet at this point, so we just collapse them by
        // composite key and keep the first occurrence.
        setPackages((prev) => {
          // Merge with prev to ensure we don't overwrite getBranchPackages results
          // Merge with prev to ensure we don't overwrite getBranchPackages results
          // that might have finished before fetchInitial.
          const merged = [...packagesRes, ...prev];
          return dedupePackages(merged, selectedBranchIdRef.current);
        });

        if (isAuthenticated) {
          const vehiclesRes = await vehicleApi.getVehicles();
          if (!cancelled) setVehicles(vehiclesRes);
        }
      } catch (error) {
        console.error('Error fetching booking catalog:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchInitial();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Real-time synchronization of vehicles
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = sseService.subscribe(SOCKET_EVENTS.MY_VEHICLES_UPDATED, () => {
      vehicleApi.getVehicles()
        .then(res => setVehicles(res))
        .catch(err => console.error('Error fetching vehicles from SSE sync:', err));
    });
    return () => unsubscribe();
  }, [isAuthenticated]);

  // Deep-link prefill (rebook / quick-book from other screens).
  // Fresh-entry reset is handled separately by the focus effect below; this
  // effect only applies prefill when the caller passed explicit params.
  useEffect(() => {
    if (!isHydrated || isLoading) return;
    const hasPrefillParams = params.branchId || params.packageId || params.vehicleId;
    if (!hasPrefillParams) return;
    (async () => {
      // Set branch FIRST; setSelectedBranch clears selectedPackage, so we
      // have to set branch before package when both params are present.
      if (params.branchId && (!selectedBranch || selectedBranch._id !== params.branchId)) {
        try {
          const b = await branchApi.getBranch(params.branchId as string);
          setSelectedBranch(b);
        } catch {
          /* swallow */
        }
      }
      if (params.packageId && (!selectedPackage || selectedPackage._id !== params.packageId)) {
        try {
          const p = await packageApi.getPackage(params.packageId as string);
          // Use replace so a branch we just set above isn't wiped as a side
          // effect (setSelectedPackage only clears date/time, but replace is
          // the explicit "downstream is still valid" setter).
          replaceSelectedPackage(p);
        } catch {
          /* swallow */
        }
      }
      if (params.vehicleId && (!selectedVehicle || selectedVehicle._id !== params.vehicleId)) {
        const v = vehicles.find((x) => x._id === (params.vehicleId as string));
        if (v) setSelectedVehicle(v);
      }
      if (params.quickBook === 'true') {
        setStep('datetime');
        if (typeof params.quickBookSlotPackId === 'string') {
          setSelectedSlotPackId(params.quickBookSlotPackId);
        }
      } else if (params.branchId && step === 'branch') {
        setStep('package');
      }
    })();
    // intentional: prefill should run once per params change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, isLoading]);

  // Removed aggressive fresh-start reset on entry.
  // The booking draft is now allowed to persist so the user can resume
  // where they left off after pressing the Home button.
  useFocusEffect(
    useCallback(() => {
      if (returningFromSubScreen.current) {
        returningFromSubScreen.current = false;
        if (isAuthenticated) {
          vehicleApi.getVehicles()
            .then(res => setVehicles(res))
            .catch(err => console.error('Error refreshing vehicles:', err));
        }
      }
    }, [isAuthenticated])
  );

  // Packages shown in the package step — narrowed by branch availability.
  //
  // The backend's `getPackages` does not always respect a `branchId` filter,
  // and can return packages that don't belong to the selected branch. Since
  // the branch is always chosen first now, we narrow the visible list to the
  // packages that branch actually offers.
  //
  // A package is considered "compatible" when it has no branchId (global
  // package) or its branchId matches the selected branch. This prevents the
  // BE from later rejecting the (branchId, packageId) pair with
  // PACKAGE_BRANCH_MISMATCH when we ask for slots.
  const filteredPackages = useMemo(() => {
    let list = packages;
    if (selectedBranch?._id) {
      list = list.filter((p) => {
        if (!p.branchId) return true; // global package — assume available
        const branchId =
          typeof p.branchId === 'object' && p.branchId !== null
            ? (p.branchId as any)._id || (p.branchId as any).id
            : p.branchId;
        return branchId === selectedBranch._id;
      });
    }
    return dedupePackages(list, selectedBranch?._id ?? null);
  }, [packages, selectedBranch?._id]);



  // Fetch branch-specific packages once a branch is picked and merge them
  // into the catalog. The global `getPackages` endpoint does not always
  // include a row whose `branchId` matches the selected branch (especially
  // for branches that only have branch-scoped services), so without this
  // step the customer would see an empty list and then get a
  // `PACKAGE_BRANCH_MISMATCH` when we ask the BE for slots.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedBranch?._id) return;
      try {
        const list = await branchApi.getBranchPackages(selectedBranch._id);
        if (cancelled) return;
        if (Array.isArray(list) && list.length > 0) {
          setPackages((prev) => {
            const merged = [...prev, ...list];
            return dedupePackages(merged, selectedBranch._id);
          });
        }
      } catch {
        /* fall back to already-loaded catalog */
      } finally {
        if (!cancelled) {
          // Mark this branch as fully processed (either merged or empty) so
          // the swap effect can finalize its decision without deferring
          // forever when the branch truly has no extra rows.
          setBranchPackagesAttempted((prev) =>
            prev === selectedBranch._id ? prev : selectedBranch._id,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBranch?._id]);

  // Safety net for the deep-link prefill case: if a (branchId, packageId)
  // pair arrives where the package doesn't actually belong to the branch,
  // reconcile it before we carry the invalid pair to the slot lookup (which
  // the BE rejects with PACKAGE_BRANCH_MISMATCH). In the normal UI flow this
  // can't happen because picking a branch clears the package.
  //
  // We do this in two passes:
  //   1. If we find a row whose composite key matches the currently selected
  //      package BUT its `branchId` matches the selected branch, swap to it
  //      (different `_id` for the same product, branch-scoped variant).
  //   2. If no such compatible row exists, the branch does not offer this
  //      product. Pop a dialog and offer to re-pick the package (keeping the
  //      branch) or re-pick the branch. We do NOT silently clear the package
  //      — that's a frustrating dead end that leaves the user confused.
  useEffect(() => {
    if (isLoading || !selectedBranch?._id || !selectedPackage) return;
    const current = selectedPackage;
    const isCompatible = filteredPackages.some((p) => p._id === current._id);
    if (isCompatible) {
      console.log('[booking/swap-effect] current package still compatible, no-op');
      return;
    }
    console.log('[booking/swap-effect] current package not compatible, looking for swap candidate');

    // Wait for the branch-scoped package fetch to complete (success or empty)
    // before deciding there is *no* swap candidate. Without this guard we
    // race the `getBranchPackages` fetch and would clear a valid selection
    // just because the row for the new branch hadn't been merged yet — or
    // forever defer when the branch truly has no extra rows.
    if (branchPackagesAttempted !== selectedBranch._id) {
      console.log('[booking/swap-effect] branch-scoped packages not yet attempted, defer');
      return;
    }

    // Try swapping to the branch-scoped variant with the same business key.
    const swapCandidate = packages.find((p) => {
      if (p._id === current._id) return false;
      if (p.name !== current.name) return false;
      if (p.price !== current.price) return false;
      if (p.duration !== current.duration) return false;
      if (p.category !== current.category) return false;
      const bid =
        typeof p.branchId === 'object' && p.branchId !== null
          ? (p.branchId as any)._id
          : p.branchId;
      return bid === selectedBranch._id || !bid;
    });
    if (swapCandidate) {
      console.log('[booking/swap-effect] swap to', swapCandidate._id, '(branch-scoped variant)');
      // IMPORTANT: use replaceSelectedPackage (NOT setSelectedPackage) so we
      // don't wipe the user's branch selection as a side effect.
      replaceSelectedPackage(swapCandidate as any);
      setVoucherCode('');
      setVoucherDiscount(0);
      return;
    }

    // No compatible variant for this branch. Instead of silently clearing
    // the package (which is confusing — the user just picked it!), send
    // them back to the package step with an explanation. The branch they
    // chose does not offer this package, so they need to make a different
    // selection.
    console.log('[booking/swap-effect] no swap candidate, sending user back to package step');
    Alert.alert(
      'Gói dịch vụ không khả dụng',
      'Chi nhánh bạn chọn không có gói dịch vụ này. Vui lòng chọn gói khác hoặc đổi chi nhánh.',
      [
        {
          text: 'Chọn gói khác',
          onPress: () => {
            // Keep the branch, drop only the package so the user immediately
            // sees the (working) list of packages that branch offers.
            setSelectedPackage(null);
            setVoucherCode('');
            setVoucherDiscount(0);
            setStep('package');
          },
        },
        {
          text: 'Chọn chi nhánh khác',
          onPress: () => {
            // Clearing the branch also clears the package (branch-scoped).
            setSelectedBranch(null);
            setVoucherCode('');
            setVoucherDiscount(0);
            setStep('branch');
          },
        },
      ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch?._id, packages, filteredPackages, branchPackagesAttempted, isLoading]);

  // Fetch slots for all visible dates whenever the user enters the datetime
  // step with a branch + package selected.
  //
  // Session tracking: each (branchId, packageId) pair is one "session". The
  // session is invalidated whenever the pair changes, so going back and
  // changing branch or package re-fetches everything.
  const [slotsSessionKey, setSlotsSessionKey] = useState<string | null>(null);
  useEffect(() => {
    console.log('[booking/slots-effect] step=', step, 'branchId=', selectedBranch?._id, 'packageId=', selectedPackage?._id, 'sessionKey=', slotsSessionKey);
    if (step !== 'datetime') {
      // Don't keep a session alive outside the datetime step so we refetch
      // every time the user comes back here with the same selections.
      if (slotsSessionKey !== null) setSlotsSessionKey(null);
      return;
    }
    if (!selectedBranch?._id || !selectedPackage?._id) {
      console.log('[booking/slots-effect] missing branch or package, skip');
      return;
    }

    const sessionKey = `${selectedBranch._id}|${selectedPackage._id}`;
    if (slotsSessionKey === sessionKey) {
      console.log('[booking/slots-effect] session already kicked off, skip');
      return; // already kicked off
    }

    console.log('[booking/slots-effect] kicking off new session', sessionKey);
    // New session: mark it and kick off fetches for every visible date.
    setSlotsSessionKey(sessionKey);
    // Reset any previously loaded slots so the user sees skeletons instead
    // of stale data while we wait for the first response.
    setDateSlots({});
    setDateSlotsErrors({});
    dateOptions.forEach((date) => {
      console.log('[booking/slots-effect] fetch slot for', date.value);
      fetchSlots(selectedBranch._id, date.value, selectedPackage._id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedBranch?._id, selectedPackage?._id]);

  const fetchSlots = useCallback(
    async (branchId: string, date: string, packageId: string) => {
      console.log('[booking/fetchSlots] start', { branchId, date, packageId });
      setIsLoadingSlots(true);
      try {
        const response = await bookingApi.getAvailableSlots({
          branchId,
          date,
          packageId,
        });
        console.log('[booking/fetchSlots] ok', date, response?.length, 'slots');
        setDateSlots((prev) => ({ ...prev, [date]: response }));
        setDateSlotsErrors((prev) => {
          if (!(date in prev)) return prev;
          const next = { ...prev };
          delete next[date];
          return next;
        });
      } catch (error: any) {
        const data = error?.response?.data;
        const code = data?.code;
        const message = code || error?.message || 'unknown';
        console.error('[booking/fetchSlots] error', date, data || error?.message);
        setDateSlots((prev) => ({ ...prev, [date]: [] }));
        setDateSlotsErrors((prev) => ({ ...prev, [date]: message }));
        // Surface a one-time hint to the user instead of an infinite spinner.
        if (code === 'PACKAGE_BRANCH_MISMATCH') {
          toast.warning(
            'Gói dịch vụ không khả dụng tại chi nhánh này',
            'Vui lòng quay lại bước chọn gói để cập nhật.',
          );
        } else if (error?.response?.status !== 401) {
          toast.error('Không tải được khung giờ', 'Vui lòng thử lại sau.');
        }
      } finally {
        setIsLoadingSlots(false);
      }
    },
    [toast],
  );

  const handleNext = () => {
    if (!canGoNext()) return;
    goNext();
  };

  const handleBack = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }
    goBack();
  };

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

  // Slot packs compatible with the current branch/package/vehicle selection.
  // A pack is only valid when it has remaining slots, is active, and matches
  // all three of the user's current picks (any constraints stored on the pack).
  const validPacks = useMemo(() => {
    if (!selectedBranch || !selectedPackage || !selectedVehicle) return [];
    return mySlotPacks.filter((p) => {
      if (p.status !== 'active' || p.remainingSlots <= 0) return false;
      const pPkgId =
        typeof p.packageId === 'object' && p.packageId !== null
          ? (p.packageId as any)._id
          : (p.packageId as string);
      if (pPkgId && pPkgId !== selectedPackage._id) return false;
      const pBranchId =
        typeof p.branchId === 'object' && p.branchId !== null
          ? (p.branchId as any)._id
          : (p.branchId as string);
      if (pBranchId && pBranchId !== selectedBranch._id) return false;
      const pVehicleId =
        typeof p.vehicleId === 'object' && p.vehicleId !== null
          ? (p.vehicleId as any)._id
          : (p.vehicleId as string);
      if (pVehicleId && pVehicleId !== selectedVehicle._id) return false;
      return true;
    });
  }, [mySlotPacks, selectedBranch?._id, selectedPackage?._id, selectedVehicle?._id]);

  // Drop a selected pack if it's no longer in the valid set (user changed
  // selections).
  useEffect(() => {
    if (
      selectedSlotPackId &&
      !validPacks.find((p) => p._id === selectedSlotPackId)
    ) {
      setSelectedSlotPackId(null);
    }
  }, [validPacks, selectedSlotPackId]);

  const selectedSlotPack = useMemo(
    () => validPacks.find((p) => p._id === selectedSlotPackId) ?? null,
    [validPacks, selectedSlotPackId],
  );

  // Loyalty tier multiplier — same factor table as the web BookingFlow:
  //   diamond -> 2.0, gold -> 1.5, silver -> 1.2, everyone else -> 1.
  let pointMultiplier = 1;
  if (configs?.LOYALTY_TIERS && Array.isArray(configs.LOYALTY_TIERS)) {
    const userTier = user?.tier || 'bronze';
    const tierConfig = configs.LOYALTY_TIERS.find((t: any) => t.id === userTier);
    if (tierConfig && tierConfig.multiplier) {
      pointMultiplier = tierConfig.multiplier;
    }
  }

  const isPayingWithPack = !!selectedSlotPack;

  const handleSubmit = async () => {
    // Web parity (BookingFlow.jsx:201-203): show specific validation messages
    // instead of silently returning.
    if (!selectedTime) {
      toast.warning('Chưa chọn giờ', 'Vui lòng chọn khung giờ trước khi xác nhận đặt chỗ.');
      return;
    }
    if (!selectedVehicle) {
      toast.warning('Chưa chọn xe', 'Vui lòng chọn xe trước khi đặt lịch.');
      return;
    }
    if (!selectedBranch || !selectedPackage || !selectedDate) {
      toast.warning('Thiếu thông tin', 'Vui lòng hoàn tất tất cả các bước trước khi đặt lịch.');
      return;
    }
    setIsSubmitting(true);
    try {
      // Slot pack and voucher are mutually exclusive in the web flow — the
      // pack already pre-paid for the slot, so the voucher would be double
      // discounting. The BE ignores voucherCode when slotPackId is present
      // anyway, but we strip it client-side to keep the confirmation modal
      // honest ("Thanh toán bằng Gói Lượt").
      const voucherToSend = isPayingWithPack ? undefined : voucherCode || undefined;

      const needsDeposit = !isPayingWithPack && finalPrice > 0;

      if (needsDeposit) {
        // Payment-first flow: navigate to checkout WITHOUT creating booking.
        // Checkout reads draft from BookingContext and creates booking after
        // payment succeeds (matches landing page flow).
        // Persist extra fields not in BookingContext for checkout to read.
        await AsyncStorage.setItem('aw_checkout_extras', JSON.stringify({
          voucherCode: voucherToSend,
          voucherDiscount: isPayingWithPack ? 0 : voucherDiscount,
          selectedSubServices,
          timestamp: Date.now(),
        }));
        returningFromSubScreen.current = true;
        router.push('/payment/checkout?type=deposit' as any);
      } else {
        // Slot pack or free booking: create booking directly (no payment step).
        const response = await bookingApi.createBooking({
          branchId: selectedBranch._id,
          packageId: selectedPackage._id,
          vehicleId: selectedVehicle._id,
          bookingDate: selectedDate,
          startTime: selectedTime,
          voucherCode: voucherToSend,
          selectedSubServices: selectedSubServices,
          slotPackId: selectedSlotPackId || undefined,
          note: '',
        });
        resetAll();
        toast.success(
          'Đặt lịch thành công!',
          `Đã giữ chỗ ${selectedPackage?.name || 'Dịch vụ'} lúc ${selectedTime}.`,
        );
        router.replace('/(tabs)/history' as any);
      }
    } catch (error: any) {
      toast.error(
        'Đặt lịch thất bại',
        error.response?.data?.message || 'Không thể tạo đơn đặt lịch, vui lòng thử lại',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // handleValidateVoucher removed — replaced by voucher-picker screen flow

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState
          iconName={Icons.personOutline}
          title="Vui lòng đăng nhập"
          message="Bạn cần đăng nhập để đặt lịch"
          actionLabel="Đăng nhập"
          onAction={() => {
            returningFromSubScreen.current = true;
            router.push('/(auth)/login' as any);
          }}
        />
      </SafeAreaView>
    );
  }

  if (isLoading) return <Loading fullScreen message="Đang tải..." />;

  const basePrice = selectedPackage?.price ?? 0;
  const subServicesTotal = selectedSubServices.reduce((total, subName) => {
    // @ts-ignore - subServices exists on package but type might not be fully updated
    const sub = (selectedPackage as any)?.subServices?.find((s: any) => s.name === subName);
    return total + (sub?.price ?? 0);
  }, 0);
  const totalBase = basePrice + subServicesTotal;
  const finalPrice = isPayingWithPack ? 0 : Math.max(0, totalBase - voucherSavings);
  const rawDepositConfig = configs?.DEPOSIT_RATE;
  const depositRate = typeof rawDepositConfig === 'number'
    ? (rawDepositConfig > 1 ? rawDepositConfig / 100 : rawDepositConfig)
    : 0.3;
  const depositAmount = Math.round((finalPrice * depositRate) / 1000) * 1000;
  // Web uses 5% earn rate × tier multiplier, floored to an integer.
  const pointsEarned = Math.floor((isPayingWithPack ? totalBase : finalPrice) * (configs?.LOYALTY_BASE_EARNING_RATE ? (configs.LOYALTY_BASE_EARNING_RATE / 100) : 0) * pointMultiplier);

  const stepsForIndicator = STEP_META.map((s) => ({
    key: s.key,
    label: t(`booking.step_${s.key}` as any),
    icon: STEP_ICONS[s.key],
  }));

  return (
    <ScreenContainer edges={['top']} background="subtle">
      <Header 
        title={t('home.qs_booking')} 
        showBack 
        onBackPress={handleBack} 
        rightAction={
          <TouchableOpacity
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => {
              toast.info('Tiến trình đã được lưu', 'Bạn có thể tiếp tục đặt lịch sau');
              router.replace('/');
            }}
            accessibilityRole="button"
            accessibilityLabel="Về trang chủ"
          >
            <Icon name={Icons.homeOutline} size={24} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <View style={[styles.progressContainer, { backgroundColor: colors.background }]}>
        <StepIndicator
          steps={stepsForIndicator}
          currentIndex={stepIndex}
          onStepPress={(idx) => setStep(STEP_META[idx].key)}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Step 1: Pick branch */}
        {step === 'branch' && (
          <StepLayout
            title={t('booking.title_branch')}
            subtitle="Chọn chi nhánh thuận tiện nhất với bạn"
            icon={Icons.locationOutline}
          >
            {branches.length === 0 ? (
              <EmptyState
                iconName={Icons.locationOutline}
                title="Không có chi nhánh"
                message="Hiện tại không có chi nhánh nào hoạt động"
              />
            ) : (
              branches.map((branch) => {
                const pkgCount = (branchPackageCounts.counts[branch._id] || 0) + branchPackageCounts.globalCount;
                const disabled = pkgCount === 0;
                return (
                <SelectableCard
                  key={branch._id}
                  selected={selectedBranch?._id === branch._id}
                  onPress={() => !disabled && setSelectedBranch(branch)}
                  icon={Icons.locationOutline}
                  title={translateDynamicText(branch.name, i18n.language)}
                  disabled={disabled}
                  disabledLabel="Chưa có gói dịch vụ"
                  subtitle={
                    <View>
                      <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                        {translateDynamicText(branch.address, i18n.language)}
                      </AppText>
                      <View style={styles.cardRowMeta}>
                        <Icon name={Icons.timeOutline} size={12} color={colors.textTertiary} />
                        <AppText variant="caption" color="textTertiary">
                          {branch.openingTime} - {branch.closingTime}
                        </AppText>
                      </View>
                    </View>
                  }
                />
              );
            })
            )}
          </StepLayout>
        )}

        {/* Step 2: Pick package (scoped to the selected branch) */}
        {step === 'package' && (
          <StepLayout
            title={t('booking.title_package')}
            subtitle={
              selectedBranch
                ? `Gói dịch vụ tại ${selectedBranch.name}`
                : 'Chọn gói phù hợp với xe của bạn'
            }
            icon={Icons.sparkle}
          >
            {filteredPackages.length === 0 ? (
              <EmptyState
                iconName={Icons.sparkle}
                title="Chưa có gói dịch vụ"
                message="Chi nhánh này chưa có gói dịch vụ nào. Vui lòng chọn chi nhánh khác."
                actionLabel="Chọn chi nhánh khác"
                onAction={() => goBack()}
              />
            ) : (
              filteredPackages.map((pkg) => (
                <SelectableCard
                  key={pkg._id}
                  selected={selectedPackage?._id === pkg._id}
                  onPress={() => setSelectedPackage(pkg)}
                  onInfoPress={() => {
                    // @ts-ignore - subServices exists on package
                    const includedServices = (pkg as any).subServices?.filter((s: any) => !s.isOptional) || [];
                    if (includedServices.length > 0) {
                      alertDialog.show({
                        title: t('booking.package_includes'),
                        message: includedServices.map((s: any) => `• ${s.name}`).join('\n'),
                        variant: 'info',
                      });
                    } else if (pkg.description) {
                      alertDialog.show({
                        title: t('booking.package_details'),
                        message: pkg.description,
                        variant: 'info',
                      });
                    } else {
                      alertDialog.show({
                        title: t('booking.package_details'),
                        message: 'Không có thông tin chi tiết cho gói này.',
                        variant: 'info',
                      });
                    }
                  }}
                  icon={Icons.sparkle}
                  title={translateDynamicText(pkg.name, i18n.language)}
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
                      <AppText variant="body" color="primary" style={styles.priceText}>
                        {formatCurrency(pkg.price)}
                      </AppText>
                    </View>
                  }
                />
              ))
            )}

            {/* Sub-services Selection */}
            {selectedPackage && (selectedPackage as any).subServices?.some((s: any) => s.isOptional) && (
              <View style={{ marginTop: spacing.lg }}>
                <AppText variant="h4" style={{ marginBottom: spacing.sm }}>
                  Dịch vụ thêm (Tuỳ chọn)
                </AppText>
                {(selectedPackage as any).subServices
                  .filter((s: any) => s.isOptional)
                  .map((sub: any) => {
                    const isSelected = selectedSubServices.includes(sub.name);
                    return (
                      <PressableScale
                        key={sub.name}
                        onPress={() => {
                          setSelectedSubServices(prev =>
                            isSelected
                              ? prev.filter(name => name !== sub.name)
                              : [...prev, sub.name]
                          );
                        }}
                      >
                        <Card
                          style={[
                            styles.optionCard,
                            isSelected && {
                              borderWidth: 2,
                              borderColor: colors.primary,
                              backgroundColor: colors.primarySubtle,
                            },
                          ]}
                        >
                          <View style={styles.optionRow}>
                            <View style={styles.optionInfo}>
                              <AppText variant="body" style={styles.optionTitle}>
                                {translateDynamicText(sub.name, i18n.language)}
                              </AppText>
                              <AppText variant="caption" color="textSecondary">
                                +{sub.duration} phút • <AppText variant="caption" color="primary">+{formatCurrency(sub.price)}</AppText>
                              </AppText>
                            </View>
                            {isSelected ? (
                              <View style={[styles.optionCheck, { backgroundColor: colors.primary }]}>
                                <Icon name={Icons.checkmark} size={16} color={colors.textInverse} />
                              </View>
                            ) : (
                              <View style={[styles.optionCheckEmpty, { borderColor: colors.border }]} />
                            )}
                          </View>
                        </Card>
                      </PressableScale>
                    );
                  })}
              </View>
            )}
          </StepLayout>
        )}

        {/* Step 3: Pick vehicle */}
        {step === 'vehicle' && (
          <StepLayout
            title={t('booking.title_vehicle')}
            subtitle="Chọn xe để rửa"
            icon={Icons.carOutline}
          >
            {vehicles.length === 0 ? (
              <View>
                <EmptyState
                  iconName={Icons.carOutline}
                  title="Chưa có phương tiện"
                  message="Vui lòng thêm phương tiện trước"
                />
                <Button
                  title={t('booking.vehicle_add_new')}
                  variant="outline"
                  icon={<Icon name={Icons.add} size={20} color={colors.primary} />}
                  onPress={() => {
                    returningFromSubScreen.current = true;
                    router.push('/vehicle/add' as any);
                  }}
                  style={styles.addVehicleBtn}
                  fullWidth
                />
              </View>
            ) : (
              vehicles.map((vehicle) => (
                <SelectableCard
                  key={vehicle._id}
                  selected={selectedVehicle?._id === vehicle._id}
                  onPress={() => setSelectedVehicle(vehicle)}
                  icon={Icons.carOutline}
                  title={vehicle.licensePlate}
                  subtitle={
                    <View>
                      <AppText variant="caption" color="textSecondary">
                        {vehicle.brand}
                        {vehicle.model ? ` • ${vehicle.model}` : ''}
                      </AppText>
                      <AppText variant="caption" color="textTertiary">
                        {vehicle.color} • {getVehicleTypeLabel(vehicle.vehicleType)}
                      </AppText>
                    </View>
                  }
                />
              ))
            )}
            {vehicles.length > 0 ? (
              <Button
                title={t('booking.vehicle_add_new')}
                variant="outline"
                icon={<Icon name={Icons.add} size={20} color={colors.primary} />}
                onPress={() => {
                  returningFromSubScreen.current = true;
                  router.push('/vehicle/add' as any);
                }}
                style={styles.addVehicleBtn}
                fullWidth
              />
            ) : null}
          </StepLayout>
        )}

        {/* Step 4: Pick date & time */}
        {step === 'datetime' && (
          <StepLayout
            title={t('booking.title_date')}
            subtitle="Chọn khung giờ thuận tiện"
            icon={Icons.calendarOutline}
          >
            {isLoadingSlots && Object.keys(dateSlots).length === 0 ? (
              <Card style={{ backgroundColor: colors.infoLight, marginBottom: spacing.sm }}>
                <View style={styles.inlineRow}>
                  <ActivityIndicator size="small" color={colors.info} />
                  <AppText variant="bodySmall" color="textPrimary" style={styles.inlineRowText}>
                    Đang tải khung giờ trống, vui lòng đợi một chút…
                  </AppText>
                </View>
              </Card>
            ) : null}
            {!isLoadingSlots &&
            Object.keys(dateSlots).length > 0 &&
            Object.values(dateSlots).every((s) => Array.isArray(s) && s.length === 0) &&
            selectedBranch &&
            selectedPackage ? (
              <Card style={{ backgroundColor: colors.warningLight, marginBottom: spacing.sm }}>
                <View style={styles.inlineRow}>
                  <Icon name={Icons.warning} size={20} color={colors.warning} />
                  <AppText variant="bodySmall" color="textPrimary" style={styles.inlineRowText}>
                    Chưa tải được khung giờ. Có thể gói dịch vụ chưa được kích hoạt tại chi nhánh này.
                  </AppText>
                </View>
                <Button
                  title="Thử lại"
                  variant="outline"
                  size="small"
                  icon={<Icon name={Icons.refreshOutline} size={16} color={colors.primary} />}
                  onPress={() => {
                    if (!selectedBranch || !selectedPackage) return;
                    console.log('[booking/retry] manual retry for all dates');
                    setSlotsSessionKey(null);
                    setDateSlots({});
                    dateOptions.forEach((date) => {
                      fetchSlots(selectedBranch._id, date.value, selectedPackage._id);
                    });
                  }}
                  style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
                />
              </Card>
            ) : null}
            <AppText variant="label" style={styles.sectionLabel}>
              Ngày
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateScroll}
            >
              {dateOptions.map((date) => {
                const slotData = dateSlots[date.value];
                const slotError = dateSlotsErrors[date.value];
                const isLoadingDate = slotData === undefined && !slotError;
                const hasAvailableSlots = slotData?.some((s) => s.available) ?? false;
                const isFullyBooked =
                  slotData !== undefined && !hasAvailableSlots && (slotData?.length ?? 0) > 0;
                const isFailed = !!slotError;
                const isSelected = selectedDate === date.value;

                return (
                  <PressableScale
                    key={date.value}
                    onPress={() => {
                      // A fully-booked day is still openable — mirrors the
                      // landing page, which shows every booked slot struck
                      // through ("Kín lịch") instead of hiding the day. The
                      // "Đầy" badge below is just a hint, not a hard block.
                      setSelectedDateTime(date.value, null);
                      if (selectedBranch && selectedPackage) {
                        // Force a refetch on tap so the user can recover from a
                        // previous failure (PACKAGE_BRANCH_MISMATCH, network
                        // blip, etc.) without leaving the screen. We bypass
                        // the slotsSessionKey dedupe by clearing that date's
                        // cached result first.
                        setDateSlots((prev) => {
                          if (!(date.value in prev)) return prev;
                          const next = { ...prev };
                          delete next[date.value];
                          return next;
                        });
                        setDateSlotsErrors((prev) => {
                          if (!(date.value in prev)) return prev;
                          const next = { ...prev };
                          delete next[date.value];
                          return next;
                        });
                        fetchSlots(selectedBranch._id, date.value, selectedPackage._id);
                      }
                    }}
                    disabled={false}
                    accessibilityLabel={`Ngày ${date.label}${isSelected ? ', đang chọn' : ''}${
                      isFullyBooked ? ', đã đầy' : isFailed ? ', lỗi tải, chạm để thử lại' : ''
                    }`}
                  >
                    <View
                      style={[
                        styles.dateCard,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.surface,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                        isFullyBooked && styles.dateCardMuted,
                      ]}
                    >
                      {isLoadingDate ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <RNText
                            style={[
                              styles.dateDay,
                              { color: isSelected ? colors.textInverse : colors.textSecondary },
                            ]}
                          >
                            {date.dayOfWeek}
                          </RNText>
                          <RNText
                            style={[
                              styles.dateValue,
                              {
                                color: isSelected ? colors.textInverse : colors.textPrimary,
                                fontWeight: '700',
                              },
                            ]}
                          >
                            {date.label}
                          </RNText>
                          {isFailed ? (
                            <RNText style={[styles.dateFullText, { color: colors.error }]}>
                              Lỗi
                            </RNText>
                          ) : isFullyBooked ? (
                            <RNText style={[styles.dateFullText, { color: colors.error }]}>
                              Đầy
                            </RNText>
                          ) : null}
                        </>
                      )}
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>

            {selectedDate ? (
              <>
                <AppText variant="label" style={styles.sectionLabel}>
                  {t('booking.title_time')}
                </AppText>
                {dateSlots[selectedDate] === undefined ? (
                  <View style={styles.timeGrid}>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.timeCardSkeleton,
                          { backgroundColor: colors.surface, borderColor: colors.border },
                        ]}
                      >
                        <RNText style={[styles.timeText, { color: colors.textTertiary }]}>
                          --:--
                        </RNText>
                      </View>
                    ))}
                  </View>
                ) : (dateSlots[selectedDate] || []).length === 0 ? (
                  <View style={styles.timeGrid}>
                    {FALLBACK_TIME_SLOTS.map((slot, idx) => {
                      const isSelected = selectedTime === slot;
                      return (
                        <PressableScale
                          key={`fallback-${slot}-${idx}`}
                          onPress={() => setSelectedDateTime(selectedDate, slot)}
                          accessibilityLabel={
                            `${slot}` +
                            (isSelected ? ', đang chọn' : '')
                          }
                          accessibilityState={{ selected: isSelected }}
                        >
                          <View
                            style={[
                              styles.timeCard,
                              {
                                backgroundColor: isSelected ? colors.primary : colors.surface,
                                borderColor: isSelected ? colors.primary : colors.border,
                              }
                            ]}
                          >
                            <RNText
                              style={[
                                styles.timeText,
                                {
                                  color: isSelected ? colors.textInverse : colors.textPrimary,
                                  fontWeight: isSelected ? '700' : '500',
                                },
                              ]}
                            >
                              {slot}
                            </RNText>
                          </View>
                        </PressableScale>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.timeGrid}>
                    {(dateSlots[selectedDate] || []).map((slot, idx) => {
                      const isSelected = selectedTime === slot.startTime;
                      // Web parity (BookingFlow.jsx:510-522): VIP-only slots
                      // are locked for users below gold/diamond tier. The BE
                      // enforces this too, but we grey them out client-side
                      // with a "Chỉ VIP" / 👑 label, same as the Web does.
                      const isVipOnly = !!slot.vipOnly;
                      const canBookVip = user?.tier === 'gold' || user?.tier === 'diamond';
                      const lockVip = isVipOnly && !canBookVip;
                      
                      let isPast = false;
                      const now = new Date();
                      const advanceMin = configs?.MIN_ADVANCE_BOOKING_MINUTES || 30;
                      const effectiveNow = new Date(now.getTime() + advanceMin * 60000);
                      const localEffectiveDate = new Date(effectiveNow.getTime() - effectiveNow.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                      
                      if (selectedDate < localEffectiveDate) {
                        isPast = true;
                      } else if (selectedDate === localEffectiveDate && slot.startTime) {
                        const [hours, minutes] = slot.startTime.split(':').map(Number);
                        isPast = effectiveNow.getHours() > hours || (effectiveNow.getHours() === hours && effectiveNow.getMinutes() > minutes);
                      }

                      const isUnavailable = !slot.available || isPast;
                      const canBook = !isUnavailable && !lockVip;
                      return (
                        <PressableScale
                          key={`${slot.startTime}-${idx}`}
                          onPress={() => canBook && setSelectedDateTime(selectedDate, slot.startTime)}
                          disabled={!canBook}
                          accessibilityLabel={
                            `${slot.startTime}` +
                            (isUnavailable ? ', đã đầy' : '') +
                            (isSelected ? ', đang chọn' : '')
                          }
                          accessibilityState={{ disabled: !canBook, selected: isSelected }}
                        >
                          <View
                            style={[
                              styles.timeCard,
                              {
                                backgroundColor: isSelected ? colors.primary : colors.surface,
                                borderColor: isSelected ? colors.primary : colors.border,
                              },
                              isUnavailable && styles.timeCardMuted,
                            ]}
                          >
                            <RNText
                              style={[
                                styles.timeText,
                                {
                                  color: isSelected ? colors.textInverse : colors.textPrimary,
                                  fontWeight: isSelected ? '700' : '500',
                                },
                                isUnavailable && styles.timeTextDisabled,
                              ]}
                            >
                              {slot.startTime}
                            </RNText>
                            {isVipOnly ? (
                              <RNText style={[styles.timeSlotFull, { color: '#eab308', fontWeight: '700' }]}>
                                👑 Chỉ VIP
                              </RNText>
                            ) : isUnavailable ? (
                              <RNText style={[styles.timeSlotFull, { color: colors.error }]}>
                                Kín lịch
                              </RNText>
                            ) : null}
                          </View>
                        </PressableScale>
                      );
                    })}
                  </View>
                )}
              </>
            ) : null}
          </StepLayout>
        )}

        {/* Step 5: Confirm */}
        {step === 'confirm' && (
          <StepLayout
            title={t('booking.step_confirm')}
            subtitle="Kiểm tra thông tin và thanh toán"
            icon={Icons.checkmark}
          >
            <Card style={{ backgroundColor: colors.surface, padding: spacing.md }}>
              <SummaryRow icon={Icons.locationOutline} label={t('booking.step_branch')} value={selectedBranch?.name} />
              <SummaryDivider />
              <SummaryRow icon={Icons.sparkle} label={t('booking.step_package')} value={selectedPackage?.name} />
              <SummaryDivider />
              <SummaryRow icon={Icons.carOutline} label={t('booking.step_vehicle')} value={selectedVehicle?.licensePlate} />
              <SummaryDivider />
              <SummaryRow
                icon={Icons.calendarOutline}
                label={t('booking.title_date')}
                value={
                  selectedDate
                    ? new Date(selectedDate).toLocaleDateString('vi-VN', {
                        weekday: 'long',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : ''
                }
              />
              <SummaryDivider />
              <SummaryRow icon={Icons.timeOutline} label={t('booking.title_time')} value={selectedTime ?? undefined} />
            </Card>

            {/* Slot Pack picker — shown only when at least one usable pack
                matches the current branch/package/vehicle selection. The web
                flow renders the exact same dropdown with a "Không sử dụng
                gói lượt" default option. */}
            {validPacks.length > 0 ? (
              <View
                style={[
                  styles.voucherButton,
                  {
                    backgroundColor: isPayingWithPack
                      ? colors.primarySubtle
                      : colors.surface,
                    borderColor: isPayingWithPack ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={styles.voucherButtonContent}>
                  <Text style={{ fontSize: 20, marginRight: spacing.sm }}>🎫</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: colors.textSecondary,
                        letterSpacing: 0.5,
                      }}
                    >
                      GÓI LƯỢT CỦA BẠN
                    </Text>
                    <Text
                      style={{
                        fontSize: 14,
                        color: isPayingWithPack ? colors.primary : colors.textTertiary,
                        marginTop: 2,
                        fontWeight: isPayingWithPack ? '600' : '400',
                      }}
                    >
                      {isPayingWithPack
                        ? `Đang dùng gói lượt (còn ${selectedSlotPack!.remainingSlots} lần)`
                        : `${validPacks.length} gói lượt khả dụng`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      if (isPayingWithPack) {
                        setSelectedSlotPackId(null);
                      } else if (validPacks.length === 1) {
                        setSelectedSlotPackId(validPacks[0]._id);
                        setVoucherCode('');
                        setVoucherDiscount(0);
                      } else {
                        // Cycle through packs (or off) so the UX stays
                        // tappable without a real picker.
                        setSelectedSlotPackId(validPacks[0]._id);
                        setVoucherCode('');
                        setVoucherDiscount(0);
                      }
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ marginLeft: spacing.sm }}
                    accessibilityLabel={isPayingWithPack ? 'Bỏ chọn gói lượt' : 'Chọn gói lượt'}
                  >
                    <Text style={{ fontSize: 20, color: colors.textTertiary }}>
                      {isPayingWithPack ? '✕' : '›'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {validPacks.length > 1 ? (
                  <View style={{ marginTop: spacing.sm, gap: 6 }}>
                    {validPacks.map((p) => {
                      const isSelected = selectedSlotPackId === p._id;
                      return (
                        <TouchableOpacity
                          key={p._id}
                          onPress={() => {
                            if (isSelected) {
                              setSelectedSlotPackId(null);
                            } else {
                              setSelectedSlotPackId(p._id);
                              setVoucherCode('');
                              setVoucherDiscount(0);
                            }
                          }}
                          style={{
                            paddingVertical: spacing.xs,
                            paddingHorizontal: spacing.sm,
                            borderRadius: borderRadius.sm,
                            backgroundColor: isSelected
                              ? colors.primary
                              : colors.background,
                            borderWidth: 1,
                            borderColor: isSelected ? colors.primary : colors.border,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: isSelected ? colors.textInverse : colors.textPrimary,
                              fontWeight: isSelected ? '700' : '500',
                            }}
                          >
                            {p.packCode || p._id} — còn {p.remainingSlots} lần
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Voucher Picker — navigates to dedicated screen. Hidden when a
                slot pack is being applied, since pack and voucher are
                mutually exclusive (web mirrors this with a v-if on
                `!isPayingWithPack`). */}
            {!isPayingWithPack ? (
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
                  returningFromSubScreen.current = true;
                  router.push(
                    `/booking/voucher-picker?branchId=${selectedBranch?._id || ''}&orderAmount=${totalBase}`,
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
            ) : null}

            <Card style={styles.priceCard}>
              {selectedSubServices && selectedSubServices.length > 0 ? (
                <>
                  <View style={styles.priceRow}>
                    <AppText variant="body" color="textSecondary" style={{ flex: 1, paddingRight: spacing.sm }}>
                      Gói {selectedPackage?.name}
                    </AppText>
                    <AppText variant="body" color="textPrimary">
                      {formatCurrency(basePrice)}
                    </AppText>
                  </View>
                  {selectedSubServices.map((subName) => {
                    const sub = (selectedPackage as any)?.subServices?.find((s: any) => s.name === subName);
                    return (
                      <View key={subName} style={styles.priceRow}>
                        <AppText variant="body" color="textSecondary" style={{ flex: 1, paddingLeft: spacing.xs, paddingRight: spacing.sm }}>
                          + DV thêm: {subName}
                        </AppText>
                        <AppText variant="body" color="textSecondary">
                          +{formatCurrency(sub?.price || 0)}
                        </AppText>
                      </View>
                    );
                  })}
                  <View style={styles.priceRow}>
                    <AppText variant="body" weight="600" color="textSecondary" style={{ flex: 1, paddingRight: spacing.sm }}>
                      {t('booking.summary_subtotal')}
                    </AppText>
                    <AppText variant="body" weight="600" color="textPrimary">
                      {formatCurrency(totalBase)}
                    </AppText>
                  </View>
                </>
              ) : (
                <View style={styles.priceRow}>
                  <AppText variant="body" color="textSecondary" style={{ flex: 1, paddingRight: spacing.sm }}>
                    {t('booking.summary_subtotal')}
                  </AppText>
                  <AppText variant="body" color="textPrimary">
                    {formatCurrency(totalBase)}
                  </AppText>
                </View>
              )}
              {isPayingWithPack ? (
                <View style={styles.priceRow}>
                  <AppText variant="body" color="textSecondary" style={{ flex: 1, paddingRight: spacing.sm }}>
                    Thanh toán bằng gói lượt
                  </AppText>
                  <AppText variant="body" color="success">
                    -{formatCurrency(totalBase)}
                  </AppText>
                </View>
              ) : null}
              {voucherSavings > 0 && !isPayingWithPack ? (
                <View style={styles.priceRow}>
                  <AppText variant="body" color="textSecondary" style={{ flex: 1, paddingRight: spacing.sm }}>
                    Khuyến mãi từ voucher
                  </AppText>
                  <AppText variant="body" color="success">
                    -{formatCurrency(voucherSavings)}
                  </AppText>
                </View>
              ) : null}
              <View style={[styles.priceDivider, { backgroundColor: colors.divider }]} />
              <View style={styles.priceRow}>
                <AppText variant="body" color="textSecondary" style={{ flex: 1, paddingRight: spacing.sm }}>
                  {t('booking.summary_total')}
                </AppText>
                <AppText variant="h3" color="primary">
                  {formatCurrency(finalPrice)}
                </AppText>
              </View>
              <View
                style={[
                  styles.priceRow,
                  {
                    marginTop: spacing.sm,
                    paddingTop: spacing.sm,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.divider,
                  },
                ]}
              >
                <AppText variant="body" color="textSecondary" style={{ flex: 1, paddingRight: spacing.sm }}>
                  Tích điểm
                </AppText>
                <AppText variant="body" style={{ color: colors.primary, fontWeight: '600' }}>
                  +{pointsEarned} điểm
                  {pointMultiplier > 1 ? (
                    <AppText
                      variant="caption"
                      color="primary"
                      style={{ marginLeft: 4 }}
                    >
                      (x{pointMultiplier})
                    </AppText>
                  ) : null}
                </AppText>
              </View>
            </Card>


          </StepLayout>
        )}
      </ScrollView>

      {/* Bottom Action — sticky primary CTA */}
      <View
        style={[
          styles.bottomAction,
          { backgroundColor: 'transparent' },
        ]}
      >
        {stepIndex > 0 ? (
          <View style={styles.bottomBackButton}>
            <Button title={t('booking.btn_back')} variant="outline" onPress={handleBack} fullWidth />
          </View>
        ) : null}
        <View
          style={
            stepIndex > 0 ? styles.bottomNextButton : styles.bottomPrimaryButton
          }
        >
          <Button
            title={step === 'confirm' || (params.quickBook === 'true' && step === 'datetime') ? t('booking.btn_confirm') : t('booking.btn_next')}
            onPress={step === 'confirm' || (params.quickBook === 'true' && step === 'datetime') ? handleSubmit : handleNext}
            disabled={!canGoNext() || isLoadingSlots}
            loading={isSubmitting}
            fullWidth
            accessibilityLabel={
              step === 'confirm' || (params.quickBook === 'true' && step === 'datetime') ? t('booking.btn_confirm') : t('booking.btn_next')
            }
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

interface StepLayoutProps {
  title: string;
  subtitle?: string;
  icon: string;
  children: React.ReactNode;
}

const StepLayout: React.FC<StepLayoutProps> = ({ title, subtitle, icon, children }) => {
  const colors = useColors();
  return (
    <View style={{ paddingTop: spacing.xl, paddingBottom: spacing.xxl }}>
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
  onInfoPress?: () => void;
  icon: string;
  title: string;
  subtitle: React.ReactNode;
  disabled?: boolean;
  disabledLabel?: string;
}

const SelectableCard: React.FC<SelectableCardProps> = ({
  selected,
  onPress,
  onInfoPress,
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
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <AppText variant="body" style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                {title}
              </AppText>
              {onInfoPress && (
                <TouchableOpacity
                  onPress={onInfoPress}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
                  style={{ marginLeft: 6 }}
                >
                  <Icon name={Icons.informationCircleOutline} size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
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
  
const SummaryDivider: React.FC = () => {
  const colors = useColors();
  return (
    <View
      style={[
        styles.summaryDivider,
        { backgroundColor: colors.divider },
      ]}
    />
  );
};

const SummaryRow: React.FC<{
  icon: string;
  label: string;
  value?: string;
}> = ({ icon, label, value }) => {
  const colors = useColors();
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryLeft}>
        <Icon name={icon} size={16} color={colors.textSecondary} />
        <AppText variant="bodySmall" color="textSecondary">
          {label}
        </AppText>
      </View>
      <AppText variant="bodySmall" style={styles.summaryValue}>
        {value || '—'}
      </AppText>
    </View>
  );
};

/**
 * Dedupe packages that the backend returns as multiple instances of what is
 * logically the same product.
 *
 * The Mobile BE has been observed returning several rows with **different**
 * `_id`s but the same `(name, price, duration, category)`. This is almost
 * certainly because each row is bound to a specific branch, but the global
 * `/packages` endpoint joins/inlines them back, so the customer sees
 * "Rửa xe cơ bản" 5 times in a row.
 *
 * Strategy:
 *   1. Group by composite key `name|price|duration|category`.
 *   2. Within each group, prefer the instance whose `branchId` matches the
 *      currently-selected branch (if any). That way, the `_id` we end up
 *      holding is guaranteed to be valid for the branch the user picked —
 *      no more `PACKAGE_BRANCH_MISMATCH` at slot lookup time.
 *   3. Fall back to the global instance (`branchId` is null/missing) when
 *      no branch-specific match exists.
 *   4. Finally fall back to whatever was returned first.
 */
type DedupeBranchField = string | { _id: string } | null | undefined;
type PackageForDedupe<T> = T & {
  _id: string;
  name: string;
  price: number;
  duration: number;
  category: string;
  branchId?: DedupeBranchField;
};

function packageBranchIdOf<T>(p: T & { branchId?: DedupeBranchField }): string | null {
  const bid = p.branchId;
  if (!bid) return null;
  if (typeof bid === 'string') return bid;
  if (typeof bid === 'object' && '_id' in (bid as object)) {
    const inner = (bid as { _id?: unknown })._id;
    return typeof inner === 'string' ? inner : null;
  }
  return null;
}

function hasPackageMeta<T>(item: T): item is T & PackageForDedupe<T> {
  if (!item || typeof item !== 'object') return false;
  const x = item as Record<string, unknown>;
  return (
    typeof x._id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.price === 'number' &&
    typeof x.duration === 'number' &&
    typeof x.category === 'string'
  );
}

function dedupePackages<T>(
  items: T[],
  selectedBranchId?: string | null,
): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!hasPackageMeta(item)) continue;
    const key = `${item.name}|${item.price}|${item.duration}|${item.category}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  const result: T[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      result.push(bucket[0]);
      continue;
    }
    // Prefer a row whose branchId equals the selected branch.
    const branchMatch = selectedBranchId
      ? bucket.find(
          (p) =>
            hasPackageMeta(p) &&
            packageBranchIdOf(p) === selectedBranchId,
        )
      : undefined;
    if (branchMatch) {
      result.push(branchMatch);
      continue;
    }
    // Then prefer a "global" row (no branchId).
    const globalMatch = bucket.find(
      (p) =>
        hasPackageMeta(p) && packageBranchIdOf(p) == null,
    );
    if (globalMatch) {
      result.push(globalMatch);
      continue;
    }
    // Otherwise keep the first one returned.
    result.push(bucket[0]);
  }
  return result;
}

function generateDateOptions(limit: number = 7) {
  const dates: { value: string; label: string; dayOfWeek: string }[] = [];
  const today = new Date();
  const labels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  for (let i = 0; i < limit; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    // Build the YYYY-MM-DD key from LOCAL date parts, not toISOString().
    // toISOString() converts to UTC, so in UTC+7 a local midnight rolls back
    // to the previous day — the card labelled "21" would then send
    // "2026-07-20" to the BE and show yesterday's slots. Landing builds its
    // date key the same (local) way, so this keeps the two in sync.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const value = `${y}-${m}-${d}`;
    const label =
      i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : `${date.getDate()}/${date.getMonth() + 1}`;
    dates.push({
      value,
      label,
      dayOfWeek: labels[date.getDay()],
    });
  }
  return dates;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  stepHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  stepHeaderText: { flex: 1 },
  // Cards
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
  optionCard: {
    marginBottom: spacing.sm,
    borderRadius: layout.cardRadius,
    ...shadows.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  optionInfo: { flex: 1 },
  optionTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  optionCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    borderWidth: 1.5,
  },
  optionCheckEmpty: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    marginLeft: spacing.sm,
  },
  cardRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  priceText: {
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  // Vehicle
  addVehicleBtn: {
    marginTop: spacing.md,
  },
  // Date / time
  sectionLabel: {
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  dateScroll: {
    paddingVertical: 4,
    gap: spacing.sm,
  },
  dateCard: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    marginRight: spacing.sm,
    minWidth: 76,
    borderWidth: 1,
    ...shadows.sm,
  },
  dateCardMuted: { opacity: 0.5 },
  dateDay: {
    fontSize: 11,
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  dateValue: {
    fontSize: 14,
  },
  dateFullText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timeCard: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    minWidth: 76,
    alignItems: 'center',
    borderWidth: 1,
    ...shadows.sm,
  },
  timeCardSkeleton: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    minWidth: 76,
    alignItems: 'center',
    borderWidth: 1,
  },
  timeCardMuted: {
    opacity: 0.45,
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  timeTextDisabled: {
    textDecorationLine: 'line-through',
    textDecorationStyle: 'solid',
  },
  timeText: {
    fontSize: 14,
  },
  timeSlotFull: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  // Summary
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 96,
  },
  summaryValue: {
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },

  // Price
  priceCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#F1F5F9', // colors.borderLight
    borderRadius: layout.cardRadius,
    ...shadows.md,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  priceDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
  },
  // Info banner

  // Inline row (warning empty slot)
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineRowText: { flex: 1 },
  // Bottom CTA
  bottomAction: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: 0,
    gap: spacing.sm,
  },
  bottomBackButton: { flex: 1 },
  bottomNextButton: { flex: 1 },
  bottomPrimaryButton: { flex: 1 },
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
