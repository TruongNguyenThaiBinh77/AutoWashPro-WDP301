import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Text,
  Modal,
  ScrollView,
  Linking,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../src/contexts/AuthContext';
import {
  branchApi,
  packageApi,
  slotPackApi,
  vehicleApi,
  paymentApi,
} from '../src/api';
import { useSystemConfig } from '../src/contexts/ConfigContext';
import { sseService } from '../src/services/sse';
import {
  Card,
  Loading,
  EmptyState,
  Button,
  Text as AppText,
  Icon,
  Icons,
  Header,
  ScreenContainer,
  AlertDialog,
  useToast,
  PressableScale,
  SegmentedControl,
  BottomSheet,
  BottomNavBar,
  StepIndicator,
} from '../src/components/common';
import { useColors } from '../src/theme/ThemeContext';
import { spacing, borderRadius, layout, shadows } from '../src/theme/spacing';
import { formatCurrency } from '../src/utils';
import type { SlotPack, Branch, Package, Vehicle } from '../src/types';
import { consumePendingVoucher } from '../src/utils/voucherStore';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Tiers and discount helpers are now dynamically built inside the component

const STEP_META = [
  { key: 1, label: 'Chi nhánh', icon: Icons.locationOutline },
  { key: 2, label: 'Xe & Gói DV', icon: Icons.carOutline },
  { key: 3, label: 'Số lượng', icon: Icons.cubeOutline },
  { key: 4, label: 'Thanh toán', icon: Icons.checkmark },
];

export default function SlotPacksScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colors = useColors();
  const { isAuthenticated, user } = useAuth();
  const configs = useSystemConfig();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const DISCOUNT_TIERS = useMemo(() => {
    if (!configs?.SLOT_PACK_DISCOUNTS || !Array.isArray(configs.SLOT_PACK_DISCOUNTS) || configs.SLOT_PACK_DISCOUNTS.length === 0) {
      return [
        { min: 1, max: 4, pct: 0, label: 'Giá gốc' },
        { min: 5, max: 9, pct: 5, label: 'Tiết kiệm 5%' },
        { min: 10, max: 19, pct: 10, label: 'Tiết kiệm 10%' },
        { min: 20, max: 50, pct: 15, label: 'Tiết kiệm 15%' },
      ];
    }
    const sorted = [...configs.SLOT_PACK_DISCOUNTS].sort((a, b) => a.minSlots - b.minSlots);
    const tiers = [];
    tiers.push({
      min: 1,
      max: sorted[0].minSlots - 1,
      pct: 0,
      label: 'Giá gốc'
    });
    for (let i = 0; i < sorted.length; i++) {
      const min = sorted[i].minSlots;
      const max = i < sorted.length - 1 ? sorted[i + 1].minSlots - 1 : 50;
      tiers.push({
        min,
        max,
        pct: sorted[i].discountPercent,
        label: `Tiết kiệm ${sorted[i].discountPercent}%`
      });
    }
    return tiers;
  }, [configs?.SLOT_PACK_DISCOUNTS]);

  const getDiscountPct = useCallback((n: number) => {
    return DISCOUNT_TIERS.find(t => n >= t.min && t.max ? n <= t.max : true)?.pct || 0;
  }, [DISCOUNT_TIERS]);

  const getDiscountLabel = useCallback((n: number) => {
    return DISCOUNT_TIERS.find(t => n >= t.min && t.max ? n <= t.max : true)?.label || '';
  }, [DISCOUNT_TIERS]);

  const [slotPacks, setSlotPacks] = useState<SlotPack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'active' | 'history'>('active');

  // Buy Flow State
  const [isBuying, setIsBuying] = useState(false);
  const [step, setStep] = useState(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Cancel OTP State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [packToCancel, setPackToCancel] = useState<SlotPack | null>(null);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  // Tracks how many active packages each branch has — used to disable branches
  // with no packages in the step-1 picker.
  const [branchPackageCounts, setBranchPackageCounts] = useState<Record<string, number>>({});

  const otpInputRef = useRef<any>(null);
  
  const startBuying = async () => {
    setIsBuying(true);
    setResumingPackId(null);
    setBuyError('');
    try {
      const draftStr = await AsyncStorage.getItem('aw_slotpack_draft');
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft.step) setStep(draft.step);
        if (draft.selectedBranch) setSelectedBranch(draft.selectedBranch);
        if (draft.selectedPackage) setSelectedPackage(draft.selectedPackage);
        if (draft.selectedVehicle) setSelectedVehicle(draft.selectedVehicle);
        if (draft.slotCount) setSlotCount(draft.slotCount);
      } else {
        setSelectedBranch('');
        setSelectedVehicle('');
        setSelectedPackage('');
        setSlotCount(5);
        setStep(1);
        setAppliedVoucher(null);
      }
    } catch {
      setSelectedBranch('');
      setSelectedVehicle('');
      setSelectedPackage('');
      setSlotCount(5);
      setStep(1);
      setAppliedVoucher(null);
    }
  };

  const saveProgressAndHome = async () => {
    try {
      await AsyncStorage.setItem('aw_slotpack_draft', JSON.stringify({
        step,
        selectedBranch,
        selectedPackage,
        selectedVehicle,
        slotCount,
      }));
      setIsBuying(false);
      toast.info('Tiến trình đã được lưu', 'Bạn có thể tiếp tục mua gói sau');
      router.replace('/');
    } catch {}
  };
  
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [selectedPackage, setSelectedPackage] = useState<string>('');
  const [slotCount, setSlotCount] = useState<number>(5);
  const [appliedVoucher, setAppliedVoucher] = useState<{code: string; name: string; discount: number} | null>(null);
  
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'vnpay' | 'wallet'>('vnpay');
  const [resumingPackId, setResumingPackId] = useState<string | null>(null);

  // Bank-transfer QR modal — populated after `paySlotPack('bank')`.
  // We poll the SlotPack status until it flips to "active" (i.e. the bank
  // webhook confirmed the Payment). Without this poll the screen used to
  // claim "Đã tạo gói slot. Vui lòng thanh toán." and never recovered.
  const [showQrModal, setShowQrModal] = useState(false);
  const [pendingPaymentPackId, setPendingPaymentPackId] = useState<string | null>(null);
  const [pendingPaymentQr, setPendingPaymentQr] = useState<string | null>(null);
  const [isPollingPayment, setIsPollingPayment] = useState(false);
  const [qrCountdown, setQrCountdown] = useState<number>(600);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Success Modal State after payment
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successPack, setSuccessPack] = useState<{
    packCode: string;
    branchName: string;
    packageName: string;
    totalSlots: number;
    finalPrice: number;
    paymentStatus: string;
  } | null>(null);

  // Handle VNPay return deep link (autowashpro://slot-packs?vnpay_result=...)
  useEffect(() => {
    const vnpayResultParam = params.vnpay_result;
    if (!vnpayResultParam) return;
    WebBrowser.dismissBrowser();

    const handleVnpayReturn = async () => {
      try {
        let parsed: any;
        const rawParam = Array.isArray(vnpayResultParam) ? vnpayResultParam[0] : vnpayResultParam;
        try {
          parsed = JSON.parse(rawParam);
        } catch {
          parsed = JSON.parse(decodeURIComponent(rawParam));
        }

        const isSuccess = parsed?.success !== false && parsed?.data?.responseCode === '00';
        if (isSuccess) {
          const stored = await AsyncStorage.getItem('aw_last_slot_pack');
          let packDetails: any = null;
          if (stored) {
            packDetails = JSON.parse(stored);
            await AsyncStorage.removeItem('aw_last_slot_pack');
          }

          const latestPacks = await slotPackApi.getMySlotPacks();
          const newestPack = Array.isArray(latestPacks) && latestPacks.length > 0 ? latestPacks[0] : null;

          const bName = packDetails?.branchName || (typeof newestPack?.branchId === 'object' ? (newestPack?.branchId as any)?.name : '') || 'Toàn hệ thống';
          const pName = packDetails?.packageName || (typeof newestPack?.packageId === 'object' ? (newestPack?.packageId as any)?.name : '') || 'Gói rửa xe';

          setSuccessPack({
            packCode: packDetails?.packCode || newestPack?.packCode || 'SP-SUCCESS',
            branchName: bName,
            packageName: pName,
            totalSlots: packDetails?.totalSlots || newestPack?.totalSlots || 5,
            finalPrice: packDetails?.finalPrice || newestPack?.finalPrice || 0,
            paymentStatus: 'paid',
          });
          setShowSuccessModal(true);
          setIsBuying(false);
          fetchSlotPacks();
        } else {
          toast.error('Thanh toán thất bại', parsed?.message || 'Giao dịch VNPay không thành công');
        }
      } catch (e) {
        console.error('Parse VNPay result error:', e);
      } finally {
        router.setParams({ vnpay_result: undefined });
      }
    };
    handleVnpayReturn();
  }, [params.vnpay_result]);

  const fetchSlotPacks = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await slotPackApi.getMySlotPacks();
      // apiClient interceptor unwraps { success, data } → returns array directly,
      // but defensively handle both shapes in case a future server response changes.
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.data)
          ? (data as any).data
          : [];
      setSlotPacks(list);
    } catch (error) {
      console.error('Error fetching slot packs:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  const filteredPacks = useMemo(() => {
    return slotPacks.filter((pack) => {
      const isActive = pack.status === 'active' && pack.remainingSlots > 0;
      if (filterTab === 'active') return isActive;
      return !isActive;
    });
  }, [slotPacks, filterTab]);

  useEffect(() => {
    fetchSlotPacks();
    
    if (isAuthenticated) {
      const unsub = sseService.subscribe('slot_pack_paid', fetchSlotPacks);
      return () => unsub();
    }
  }, [fetchSlotPacks, isAuthenticated]);

  // Refetch on screen focus so a pack bought from elsewhere (deep link,
  // promotion tab, etc.) appears without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      WebBrowser.dismissBrowser();
      if (isAuthenticated) fetchSlotPacks();
    }, [isAuthenticated, fetchSlotPacks])
  );

  useFocusEffect(
    useCallback(() => {
      if (isBuying && step === 4) {
        // voucherStore only exports consumePendingVoucher (read + clear).
        // Older names getPendingVoucher/clearPendingVoucher do not exist.
        const voucher = consumePendingVoucher();
        if (voucher) {
          setAppliedVoucher(voucher);
        }
      }
    }, [isBuying, step])
  );

  useEffect(() => {
    if (params.resumePackId && slotPacks.length > 0) {
      const packToResume = slotPacks.find(p => p._id === params.resumePackId);
      if (packToResume && packToResume.status === 'pending') {
        handleResumePayment(packToResume);
        router.setParams({ resumePackId: undefined });
      }
    }
  }, [params.resumePackId, slotPacks]);

  useEffect(() => {
    if (params.resumeWizard) {
      startBuying();
      router.setParams({ resumeWizard: undefined });
    }
  }, [params.resumeWizard]);

  useEffect(() => {
    if (isBuying && (step === 1 || (step > 1 && branches.length === 0))) {
      Promise.all([
        branchApi.getBranches(),
        // Pre-fetch package counts for all branches so we can badge disabled
        // state in the step-1 picker without a second round-trip.
        packageApi.getPackages({ status: 'active', limit: 'all' }),
      ]).then(([branchData, allPackages]) => {
        setBranches(branchData);
        // Build a map: branchId → active package count.
        const counts: Record<string, number> = {};
        for (const pkg of allPackages) {
          const bid = (pkg as any).branchId?._id || (pkg as any).branchId;
          if (bid) counts[String(bid)] = (counts[String(bid)] || 0) + 1;
        }
        setBranchPackageCounts(counts);
      }).catch(console.error);
    }
  }, [isBuying, step]);

  useEffect(() => {
    if (isBuying && (step === 2 || (step > 2 && packages.length === 0))) {
      if (selectedBranch && selectedBranch !== 'ALL') {
        packageApi.getPackages({ branchId: selectedBranch, status: 'active' }).then(data => {
          setPackages(data);
          if (data.length > 0 && !data.find(p => p._id === selectedPackage)) {
            setSelectedPackage(data[0]._id);
          }
        }).catch(console.error);
      } else {
        packageApi.getPackages({ status: 'active' }).then(data => setPackages(data)).catch(console.error);
      }
      if (vehicles.length === 0) {
        vehicleApi.getVehicles().then(data => {
          setVehicles(data);
          if (data.length > 0 && !selectedVehicle) setSelectedVehicle(data[0]._id);
        }).catch(console.error);
      }
    }
  }, [isBuying, step, selectedBranch]);

  const handleCancel = (slotPack: SlotPack) => {
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
      AsyncStorage.removeItem('aw_slot_pending').catch(() => {});
      
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return { bg: colors.successLight, text: colors.success };
      case 'exhausted': return { bg: colors.surfaceDark, text: colors.textSecondary };
      case 'expired': return { bg: colors.errorLight, text: colors.error };
      case 'cancelled': return { bg: colors.warningLight, text: colors.warning };
      case 'pending': return { bg: colors.warningLight, text: colors.warning };
      default: return { bg: colors.surface, text: colors.textSecondary };
    }
  };

  // Poll the SlotPack every 5s while the QR modal is open.
  // When the pack flips to "active", the bank webhook has confirmed the
  // payment and we close the modal automatically.
  useEffect(() => {
    if (!showQrModal || !pendingPaymentPackId) return;

    let cancelled = false;
    setIsPollingPayment(true);
    setQrCountdown(600);

    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await slotPackApi.getMySlotPacks();
        if (cancelled) return;
        const updated = (data || []).find((p) => p._id === pendingPaymentPackId);
        if (updated && updated.paymentStatus === 'paid') {
          setSlotPacks(data || []);
          setShowQrModal(false);
          setPendingPaymentPackId(null);
          setPendingPaymentQr(null);
          setIsPollingPayment(false);
          AsyncStorage.removeItem('aw_slot_pending').catch(() => {});

          const stored = await AsyncStorage.getItem('aw_last_slot_pack');
          let packDetails: any = null;
          if (stored) {
            packDetails = JSON.parse(stored);
            await AsyncStorage.removeItem('aw_last_slot_pack');
          }
          const bName = packDetails?.branchName || (typeof updated.branchId === 'object' ? (updated.branchId as any)?.name : '') || 'Toàn hệ thống';
          const pName = packDetails?.packageName || (typeof updated.packageId === 'object' ? (updated.packageId as any)?.name : '') || 'Gói rửa xe';

          setSuccessPack({
            packCode: updated.packCode || packDetails?.packCode || 'SP-SUCCESS',
            branchName: bName,
            packageName: pName,
            totalSlots: updated.totalSlots || packDetails?.totalSlots || 5,
            finalPrice: updated.finalPrice || packDetails?.finalPrice || 0,
            paymentStatus: 'paid',
          });
          setShowSuccessModal(true);
          toast.success('Thanh toán thành công', 'Gói slot đã được kích hoạt.');
          return;
        }
      } catch (e) {
        console.warn('poll slot pack failed', e);
      }
      pollTimerRef.current = setTimeout(poll, 5000);
    };

    poll();

    const countdownInterval = setInterval(() => {
      setQrCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          if (!cancelled) {
            setShowQrModal(false);
            setPendingPaymentPackId(null);
            setPendingPaymentQr(null);
            setIsPollingPayment(false);
            toast.error('Hết thời gian chờ', 'Đã quá hạn thời gian quét mã thanh toán.');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      cancelled = true;
      setIsPollingPayment(false);
      clearInterval(countdownInterval);
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [showQrModal, pendingPaymentPackId]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = { active: 'Đang hoạt động', exhausted: 'Đã dùng hết', expired: 'Đã hết hạn', cancelled: 'Đã hủy', pending: 'Chờ thanh toán' };
    return labels[status] || status;
  };


  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchSlotPacks();
  }, [fetchSlotPacks]);

  // Extract the package label from a slot-pack row so the user understands
  // the 1-package-per-pack constraint (BE stores a single packageId, not an
  // array). Mobile UX must make this explicit.
  const getPackPackageLabel = (pack: SlotPack): string => {
    if (pack.packageId && typeof pack.packageId === 'object') {
      return (pack.packageId as any).name || 'Gói dịch vụ';
    }
    return 'Gói dịch vụ';
  };

  const getPackBranchLabel = (pack: SlotPack): string => {
    if (pack.branchId && typeof pack.branchId === 'object') {
      return (pack.branchId as any).name || '';
    }
    return '';
  };

  const handleBuy = async () => {
    if (!resumingPackId && (!selectedBranch || !selectedVehicle || !selectedPackage)) {
      setBuyError('Vui lòng chọn đủ chi nhánh, xe và gói dịch vụ.');
      return;
    }
    setBuyLoading(true);
    setBuyError('');
    try {
      let packId = resumingPackId;
      if (!packId) {
        const pack = await slotPackApi.buySlotPack({
          branchId: selectedBranch !== 'ALL' ? selectedBranch : undefined,
          vehicleId: selectedVehicle !== 'ALL' ? selectedVehicle : undefined,
          packageId: selectedPackage,
          totalSlots: slotCount,
          voucherCode: appliedVoucher?.code,
        } as any);
        packId = pack._id;
        // Save pending slot pack draft for home screen
        await AsyncStorage.setItem('aw_slot_pending', packId);
        await AsyncStorage.removeItem('aw_slotpack_draft');
      }

      const payResult = await slotPackApi.paySlotPack(packId, paymentMethod);
      const selectedBranchObj = branches.find(b => b._id === selectedBranch);
      const selectedPkgObj = packages.find(p => p._id === selectedPackage);
      const packDraftInfo = {
        packCode: (payResult?.payment?.slotPackId as any)?.packCode || 'SP-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        branchName: selectedBranchObj?.name || 'Toàn hệ thống',
        packageName: selectedPkgObj?.name || 'Gói dịch vụ',
        totalSlots: slotCount,
        finalPrice: payResult?.payment?.amount || 0,
        paymentStatus: 'paid',
      };
      await AsyncStorage.setItem('aw_last_slot_pack', JSON.stringify(packDraftInfo));

      if (paymentMethod === 'vnpay') {
        if (payResult.paymentUrl) {
          await WebBrowser.openBrowserAsync(payResult.paymentUrl);
        }
        setIsBuying(false);
        setResumingPackId(null);
        fetchSlotPacks();
        toast.success('Vui lòng hoàn tất thanh toán trên VNPay');
        return;
      } else if (paymentMethod === 'wallet') {
        setIsBuying(false);
        setResumingPackId(null);
        setSuccessPack(packDraftInfo);
        setShowSuccessModal(true);
        fetchSlotPacks();
        toast.success('Thanh toán bằng ví thành công!');
        return;
      }

      // Bank transfer — backend returns a QR + bank info in the Payment doc.
      // We MUST NOT mark the pack as paid until the bank webhook flips the
      // Payment.status to "completed". Otherwise the slot pack becomes
      // "active" before money lands.
      const qrCode = payResult?.payment?.qrCode || payResult?.qrCode;
      if (!qrCode) {
        // Fallback when QR isn't available — show bank instructions only.
        setIsBuying(false);
        fetchSlotPacks();
        AlertDialog.show({
          title: 'Đã tạo gói slot',
          message: 'Vui lòng hoàn tất chuyển khoản theo thông tin ngân hàng. Gói sẽ được kích hoạt sau khi hệ thống xác nhận thanh toán.',
          variant: 'info',
          actions: [{ text: 'Đóng', onPress: () => {} }],
        });
        return;
      }

      setPendingPaymentPackId(packId);
      setPendingPaymentQr(qrCode);
      setIsBuying(false);
      setResumingPackId(null);
      setShowQrModal(true);
    } catch (err: any) {
      // BE returns { success, message, errors: [{ field, message }] } on validation.
      const resData = err.response?.data;
      let errorMsg = resData?.message || err.message || 'Lỗi mua gói slot';
      if (Array.isArray(resData?.errors) && resData.errors.length > 0) {
        // Map field-level errors to Vietnamese labels
        const fieldLabels: Record<string, string> = {
          branchId: 'Chi nhánh',
          packageId: 'Gói dịch vụ',
          vehicleId: 'Xe',
          totalSlots: 'Số lượt',
          voucherCode: 'Mã voucher',
        };
        const details = resData.errors
          .map((e: any) => `${fieldLabels[e.field] || e.field}: ${e.message}`)
          .join(', ');
        errorMsg = `${errorMsg} — ${details}`;
      }
      setBuyError(errorMsg);
    } finally {
      setBuyLoading(false);
    }
  };

  const handleResumePayment = (pack: SlotPack) => {
    const b = pack.branchId && typeof pack.branchId === 'object' ? (pack.branchId as any) : null;
    const v = pack.vehicleId && typeof pack.vehicleId === 'object' ? (pack.vehicleId as any) : null;
    const p = pack.packageId && typeof pack.packageId === 'object' ? (pack.packageId as any) : null;

    if (b) setBranches([b]);
    if (v) setVehicles([v]);
    if (p) setPackages([p]);

    setSelectedBranch(b ? b._id : 'ALL');
    setSelectedVehicle(v ? v._id : 'ALL');
    setSelectedPackage(p ? p._id : '');
    setSlotCount(pack.totalSlots);
    setResumingPackId(pack._id);
    setStep(4);
    setIsBuying(true);
  };



  const renderSlotPack = ({ item }: { item: SlotPack }) => {
    const effectiveStatus = item.paymentStatus === 'unpaid' ? 'pending' : item.status;
    const statusStyle = getStatusColor(effectiveStatus);
    const isCancelling = cancellingId === item._id;

    return (
      <Card style={[styles.slotCard, { padding: spacing.lg, backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primarySubtle }]}>
              <Icon name={Icons.cubeOutline} size={28} color={colors.primary} />
            </View>
            <View style={styles.headerInfo}>
              <AppText variant="h4">{item.packCode}</AppText>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.text }]}>{getStatusLabel(effectiveStatus)}</Text>
              </View>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <AppText variant="caption" color="textSecondary">Tổng slot</AppText>
              <AppText variant="h3" color="primary">{item.totalSlots}</AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AppText variant="caption" color="textSecondary">Đã dùng</AppText>
              <AppText variant="h3">{item.usedSlots}</AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AppText variant="caption" color="textSecondary">Còn lại</AppText>
              <AppText variant="h3" color="success">{item.remainingSlots}</AppText>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Icon name={Icons.walletOutline} size={16} color={colors.textSecondary} style={styles.infoIcon} />
            <AppText variant="bodySmall" color="textSecondary">Giá: {formatCurrency(item.finalPrice ?? 0)}</AppText>
          </View>
          <View style={styles.infoRow}>
            <Icon name={Icons.cubeOutline} size={16} color={colors.primary} style={styles.infoIcon} />
            <AppText variant="bodySmall" color="textPrimary" style={{ fontWeight: '600' }}>
              Áp dụng cho: {getPackPackageLabel(item)}
            </AppText>
          </View>
          {item.expiresAt && (
            <View style={styles.infoRow}>
              <Icon name={Icons.calendarOutline} size={16} color={colors.textSecondary} style={styles.infoIcon} />
              <AppText variant="bodySmall" color="textSecondary">Hết hạn: {new Date(item.expiresAt).toLocaleDateString('vi-VN')}</AppText>
            </View>
          )}
          {getPackBranchLabel(item) ? (
            <View style={styles.infoRow}>
              <Icon name={Icons.locationOutline} size={16} color={colors.textSecondary} style={styles.infoIcon} />
              <AppText variant="bodySmall" color="textSecondary">Chi nhánh: {getPackBranchLabel(item)}</AppText>
            </View>
          ) : null}
          {effectiveStatus === 'active' && item.remainingSlots > 0 && (
            <View style={styles.actions}>
              <Button title="Hủy gói slot" variant="outline" size="small" onPress={() => handleCancel(item)} loading={isCancelling} style={[styles.cancelButton, { flex: 1 }] as any} />
              <Button title="Đặt lịch nhanh" variant="primary" size="small" onPress={() => handleQuickBook(item)} style={{ flex: 1 } as any} />
            </View>
          )}
          {effectiveStatus === 'pending' && (
            <View style={styles.actions}>
              <Button title="Hủy gói slot" variant="outline" size="small" onPress={() => handleCancel(item)} loading={isCancelling} style={[styles.cancelButton, { flex: 1 }] as any} />
              <Button title="Tiếp tục thanh toán" variant="primary" size="small" onPress={() => handleResumePayment(item)} style={{ flex: 1 } as any} />
            </View>
          )}
      </Card>
    );
  };

  // Calculate VIP bonus directly from configs
  const getVipBonusDiscount = useCallback(() => {
    if (!user?.tier || !configs?.SLOT_PACK_VIP_BONUS_DISCOUNTS) return 0;
    return configs.SLOT_PACK_VIP_BONUS_DISCOUNTS[user.tier] || 0;
  }, [user?.tier, configs?.SLOT_PACK_VIP_BONUS_DISCOUNTS]);

  const subTotal = selectedPackage ? (packages.find(p => p._id === selectedPackage)?.price || 0) * slotCount : 0;
  const baseDiscountPct = getDiscountPct(slotCount);
  const vipBonusPct = getVipBonusDiscount();
  const totalDiscountPct = baseDiscountPct + vipBonusPct;
  const discountAmount = Math.floor(subTotal * (totalDiscountPct / 100));
  const finalPrice = subTotal - discountAmount;

  if (!isAuthenticated) {
    return (
      <ScreenContainer>
        <Header showBack title="Gói slot" />
        <EmptyState icon={<Icon name={Icons.cubeOutline} size={48} color={colors.textTertiary} />} title="Vui lòng đăng nhập" message="Đăng nhập để xem gói slot" actionLabel="Đăng nhập" onAction={() => router.push('/(auth)/login' as any)} />
      </ScreenContainer>
    );
  }

  if (isLoading) return <Loading fullScreen message="Đang tải gói slot..." />;

  // Derived calculations for step 4
  const pkg = packages.find(p => p._id === selectedPackage);
  const discountPct = getDiscountPct(slotCount);
  const gross = (pkg?.price || 0) * slotCount;
  const qtyDiscount = Math.floor(gross * discountPct / 100);
  const baseTotal = gross - qtyDiscount;
  const voucherSavings = appliedVoucher ? appliedVoucher.discount : 0;
  const finalTotal = Math.max(0, baseTotal - voucherSavings);
  const branchObj = branches.find(b => b._id === selectedBranch);

  return (
    <ScreenContainer>
      <Header showBack title="Gói slot của tôi" rightAction={<TouchableOpacity onPress={startBuying}><Text style={{ color: colors.primary, fontWeight: '600' }}>Mua gói</Text></TouchableOpacity>} />

      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <SegmentedControl
          value={filterTab}
          onChange={(val) => setFilterTab(val as 'active' | 'history')}
          options={[
            { value: 'active', label: 'Đang hoạt động' },
            { value: 'history', label: 'Lịch sử' },
          ]}
          fullWidth
        />
      </View>

      <FlatList
        data={filteredPacks}
        renderItem={renderSlotPack}
        keyExtractor={(item) => item._id}
        initialNumToRender={5}
        windowSize={5}
        maxToRenderPerBatch={5}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <EmptyState icon={<Icon name={Icons.cubeOutline} size={48} color={colors.textTertiary} />} title="Chưa có gói slot" message="Mua gói slot để tiết kiệm chi phí rửa xe" actionLabel="Khám phá gói slot" onAction={startBuying} />
        }
        ListHeaderComponent={
          slotPacks.length > 0 ? (
            <View style={[styles.summaryCard, { backgroundColor: colors.infoLight }]}>
              <Icon name={'information-circle-outline'} size={24} color={colors.info} style={styles.summaryIcon} />
              <View style={styles.summaryContent}>
                <AppText variant="bodySmall">Mua gói slot để tiết kiệm đến 20% chi phí rửa xe</AppText>
              </View>
            </View>
          ) : null
        }
        // "Mua thêm gói lượt" CTA mirrors FE PackagesSection — after the user
        // already owns packs, they still need an obvious path to buy another
        // one (different branch / package / vehicle combo).
        ListFooterComponent={
          slotPacks.length > 0 ? (
            <View style={styles.footerCtaWrap}>
              <Button
                title="+ Mua thêm gói lượt"
                onPress={startBuying}
                fullWidth
              />
              <AppText variant="caption" color="textTertiary" style={styles.footerHint}>
                Mỗi gói chỉ áp dụng cho 1 dịch vụ + chi nhánh cụ thể. Mua thêm để dùng cho gói khác.
              </AppText>
            </View>
          ) : null
        }
      />

      <Modal visible={isBuying} animationType="slide" onRequestClose={() => setIsBuying(false)}>
        <ScreenContainer edges={['top']} padded={false}>
          <Header
            title="Mua gói slot"
            showBack
            onBackPress={() => {
              if (step > 1 && !resumingPackId) {
                setStep(step - 1);
              } else {
                setIsBuying(false);
                setResumingPackId(null);
              }
            }}
            rightAction={
              <TouchableOpacity onPress={saveProgressAndHome} style={{ padding: 4 }} accessibilityLabel="Về trang chủ">
                <Icon name={Icons.homeOutline} size={24} color={colors.primary} />
              </TouchableOpacity>
            }
          />
          <View style={[styles.progressContainer, { backgroundColor: colors.background }]}>
            <StepIndicator
              steps={STEP_META.map(s => ({ key: String(s.key), label: s.label, icon: s.icon }))}
              currentIndex={step - 1}
              onStepPress={(idx) => {
                if (idx + 1 < step) setStep(idx + 1);
              }}
            />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }} showsVerticalScrollIndicator={false}>
            {step === 1 && (
              <StepLayout
                title="Chọn chi nhánh"
                subtitle="Chọn chi nhánh bạn muốn sử dụng gói"
                icon={Icons.locationOutline}
              >
                {branches.map(b => {
                  const pkgCount = branchPackageCounts[b._id] || 0;
                  const disabled = pkgCount === 0;
                  return (
                    <SelectableCard
                      key={b._id}
                      selected={selectedBranch === b._id}
                      onPress={() => !disabled && setSelectedBranch(b._id)}
                      icon={Icons.locationOutline}
                      title={b.name}
                      disabled={disabled}
                      disabledLabel="Chưa có gói dịch vụ"
                      subtitle={
                        <View>
                          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                            {b.address}
                          </AppText>
                          {disabled ? null : (
                            <View style={{ marginTop: 2 }}>
                              <AppText variant="caption" style={{ color: colors.success, fontWeight: '600' }}>{pkgCount} gói dịch vụ</AppText>
                            </View>
                          )}
                        </View>
                      }
                    />
                  );
                })}
              </StepLayout>
            )}

            {step === 2 && (
              <StepLayout
                title="Chọn xe & Gói dịch vụ"
                subtitle="Tùy chỉnh gói slot theo xe và dịch vụ"
                icon={Icons.carOutline}
              >
                <AppText variant="h4" style={{ marginBottom: spacing.sm }}>Chọn xe</AppText>
                <SelectableCard
                  selected={selectedVehicle === 'ALL'}
                  onPress={() => setSelectedVehicle('ALL')}
                  icon={Icons.carOutline}
                  title="Tất cả xe"
                  subtitle={
                    <AppText variant="caption" color="textSecondary">Không khóa cứng 1 biển số</AppText>
                  }
                />
                {vehicles.map(v => (
                  <SelectableCard
                    key={v._id}
                    selected={selectedVehicle === v._id}
                    onPress={() => setSelectedVehicle(v._id)}
                    icon={Icons.carOutline}
                    title={v.licensePlate}
                    subtitle={
                      <View>
                        <AppText variant="caption" color="textSecondary">{v.brand} {v.model}</AppText>
                      </View>
                    }
                  />
                ))}

                <AppText variant="h4" style={{ marginVertical: spacing.sm, marginTop: spacing.lg }}>Chọn gói dịch vụ</AppText>
                {packages.length === 0 ? (
                  <EmptyState
                    iconName={Icons.sparkle}
                    title="Chưa có gói dịch vụ"
                    message="Chi nhánh này chưa có gói dịch vụ nào."
                  />
                ) : packages.map(p => (
                  <SelectableCard
                    key={p._id}
                    selected={selectedPackage === p._id}
                    onPress={() => setSelectedPackage(p._id)}
                    icon={Icons.sparkle}
                    title={p.name}
                    subtitle={
                      <View>
                        <AppText variant="body" color="primary" style={styles.priceText}>
                          {formatCurrency(p.price)}
                        </AppText>
                        <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>{p.description}</AppText>
                      </View>
                    }
                  />
                ))}
              </StepLayout>
            )}

            {step === 3 && (
              <StepLayout
                title="Số lần rửa xe"
                subtitle="Mua càng nhiều, tiết kiệm càng lớn"
                icon={Icons.cubeOutline}
              >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
                  {DISCOUNT_TIERS.map(t => (
                    <View key={t.pct} style={{ width: '48%', padding: 12, backgroundColor: slotCount >= t.min && slotCount <= t.max ? colors.primarySubtle : colors.surface, borderRadius: 12, borderWidth: 1, borderColor: slotCount >= t.min && slotCount <= t.max ? colors.primary : colors.borderLight, ...shadows.sm }}>
                      <AppText variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>{t.min === 20 ? '20+' : `${t.min}-${t.max}`} lần</AppText>
                      <AppText variant="h4" color={t.pct > 0 ? "primary" : "textPrimary"} style={{ textAlign: 'center', marginVertical: 4 }}>{t.pct > 0 ? `-${t.pct}%` : 'Giá gốc'}</AppText>
                      <AppText variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>{t.label}</AppText>
                    </View>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24, marginBottom: 24 }}>
                  <PressableScale onPress={() => setSlotCount(n => Math.max(1, n - 1))} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight, justifyContent: 'center', alignItems: 'center', ...shadows.sm }}><Text style={{ fontSize: 24, color: colors.textPrimary }}>-</Text></PressableScale>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 40, fontWeight: '800', color: colors.primary }}>{slotCount}</Text>
                    <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>lượt</AppText>
                  </View>
                  <PressableScale onPress={() => setSlotCount(n => Math.min(50, n + 1))} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', ...shadows.sm }}><Text style={{ fontSize: 24, color: colors.textInverse }}>+</Text></PressableScale>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {[1, 3, 5, 10, 15, 20].map(n => (
                    <PressableScale key={n} onPress={() => setSlotCount(n)} style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, backgroundColor: slotCount === n ? colors.primary : colors.surface, borderWidth: 1, borderColor: slotCount === n ? colors.primary : colors.borderLight, ...shadows.sm }}>
                      <Text style={{ color: slotCount === n ? '#fff' : colors.textPrimary, fontWeight: '700' }}>{n} lần</Text>
                    </PressableScale>
                  ))}
                </View>
              </StepLayout>
            )}

            {step === 4 && (
              <StepLayout
                title="Xác nhận thanh toán"
                subtitle="Kiểm tra thông tin và chọn phương thức"
                icon={Icons.checkmark}
              >
                <Card style={{ backgroundColor: colors.surface, padding: spacing.md, marginBottom: spacing.md }}>
                  <SummaryRow icon={Icons.locationOutline} label="Chi nhánh" value={branchObj?.name || 'Toàn hệ thống'} />
                  <SummaryDivider />
                  <SummaryRow icon={Icons.sparkle} label="Gói dịch vụ" value={pkg?.name} />
                  <SummaryDivider />
                  <SummaryRow icon={Icons.cubeOutline} label="Số lượt" value={`${slotCount} lượt`} />
                </Card>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.voucherButton,
                    {
                      backgroundColor: appliedVoucher ? '#ECFDF5' : '#F0FDF4',
                      borderColor: appliedVoucher ? colors.primary : '#A7F3D0',
                      borderWidth: 1.5,
                      marginBottom: spacing.md,
                    },
                  ]}
                  onPress={() => router.push(`/booking/voucher-picker?branchId=${selectedBranch === 'ALL' ? '' : selectedBranch}&orderAmount=${baseTotal}` as any)}
                >
                  <View style={styles.voucherButtonContent}>
                    <View style={[
                      styles.voucherIconBadge,
                      { backgroundColor: appliedVoucher ? colors.primary : '#10B981' }
                    ]}>
                      <Icon
                        name={appliedVoucher ? Icons.checkmarkCircle : Icons.ticketOutline}
                        size={20}
                        color="#FFFFFF"
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <Text style={[
                        styles.voucherTagText,
                        { color: appliedVoucher ? '#059669' : colors.primaryDark }
                      ]}>
                        {appliedVoucher ? 'ĐÃ ÁP DỤNG VOUCHER' : 'VOUCHER & ƯU ĐÃI'}
                      </Text>
                      {appliedVoucher ? (
                        <Text style={styles.voucherSelectedText} numberOfLines={1}>
                          {appliedVoucher.code}
                          {voucherSavings > 0 ? ` — Tiết kiệm ${formatCurrency(voucherSavings)}` : ''}
                        </Text>
                      ) : (
                        <Text style={styles.voucherPlaceholderText}>
                          Chọn voucher để tiết kiệm thêm ✨
                        </Text>
                      )}
                    </View>
                    {appliedVoucher ? (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setAppliedVoucher(null);
                        }}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        style={styles.voucherClearBtn}
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

                <Card style={styles.priceCard}>
                  <View style={styles.priceRow}>
                    <AppText variant="body" color="textSecondary" style={{ flex: 1 }}>Tạm tính ({slotCount} lượt)</AppText>
                    <AppText variant="body" color="textPrimary">{formatCurrency(gross)}</AppText>
                  </View>
                  {discountPct > 0 && (
                    <View style={styles.priceRow}>
                      <AppText variant="body" color="primary" style={{ flex: 1 }}>Chiết khấu SL (-{discountPct}%)</AppText>
                      <AppText variant="body" color="primary">-{formatCurrency(qtyDiscount)}</AppText>
                    </View>
                  )}
                  {voucherSavings > 0 && (
                    <View style={styles.priceRow}>
                      <AppText variant="body" color="primary" style={{ flex: 1 }}>Voucher</AppText>
                      <AppText variant="body" color="primary">-{formatCurrency(voucherSavings)}</AppText>
                    </View>
                  )}
                  <View style={styles.priceDivider} />
                  <View style={styles.priceRow}>
                    <AppText variant="body" color="textSecondary" style={{ flex: 1 }}>Thực thu</AppText>
                    <AppText variant="h3" color="primary">{formatCurrency(finalTotal)}</AppText>
                  </View>
                </Card>

                {buyError ? <AppText color="error" style={{ marginBottom: 12, marginTop: 12, textAlign: 'center' }}>{buyError}</AppText> : null}

                <AppText variant="label" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
                  Phương thức thanh toán
                </AppText>

                {/* Wallet Option */}
                <TouchableOpacity
                  onPress={() => setPaymentMethod('wallet')}
                  activeOpacity={0.8}
                  style={{ marginBottom: spacing.sm }}
                >
                  <View
                    style={[
                      styles.selectablePaymentCard,
                      {
                        backgroundColor: paymentMethod === 'wallet' ? colors.primarySubtle : colors.surface,
                        borderColor: paymentMethod === 'wallet' ? colors.primary : colors.borderLight,
                      },
                    ]}
                  >
                    <View style={[styles.methodIconWrap, { backgroundColor: colors.primarySubtle }]}>
                      <Icon name={Icons.wallet} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <AppText variant="body" style={{ fontWeight: '600' }}>
                        Ví AutoWash
                      </AppText>
                      <AppText variant="caption" color="textSecondary">
                        Số dư: {formatCurrency(user?.walletBalance || 0)}
                      </AppText>
                    </View>
                    {paymentMethod === 'wallet' ? (
                      <View style={[styles.optionCheckBadge, { backgroundColor: colors.primary }]}>
                        <Icon name={Icons.checkmark} size={14} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={[styles.optionCheckEmptyBadge, { borderColor: colors.borderLight }]} />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Bank Option */}
                <TouchableOpacity
                  onPress={() => setPaymentMethod('bank')}
                  activeOpacity={0.8}
                  style={{ marginBottom: spacing.sm }}
                >
                  <View
                    style={[
                      styles.selectablePaymentCard,
                      {
                        backgroundColor: paymentMethod === 'bank' ? colors.primarySubtle : colors.surface,
                        borderColor: paymentMethod === 'bank' ? colors.primary : colors.borderLight,
                      },
                    ]}
                  >
                    <View style={[styles.methodIconWrap, { backgroundColor: colors.primarySubtle }]}>
                      <Icon name={Icons.card} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <AppText variant="body" style={{ fontWeight: '600' }}>
                        Ngân hàng
                      </AppText>
                      <AppText variant="caption" color="textSecondary">
                        Chuyển khoản qua mã QR
                      </AppText>
                    </View>
                    {paymentMethod === 'bank' ? (
                      <View style={[styles.optionCheckBadge, { backgroundColor: colors.primary }]}>
                        <Icon name={Icons.checkmark} size={14} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={[styles.optionCheckEmptyBadge, { borderColor: colors.borderLight }]} />
                    )}
                  </View>
                </TouchableOpacity>

                {/* VNPay Option */}
                <TouchableOpacity
                  onPress={() => setPaymentMethod('vnpay')}
                  activeOpacity={0.8}
                  style={{ marginBottom: spacing.md }}
                >
                  <View
                    style={[
                      styles.selectablePaymentCard,
                      {
                        backgroundColor: paymentMethod === 'vnpay' ? colors.primarySubtle : colors.surface,
                        borderColor: paymentMethod === 'vnpay' ? colors.primary : colors.borderLight,
                      },
                    ]}
                  >
                    <View style={[styles.methodIconWrap, { backgroundColor: colors.primarySubtle }]}>
                      <Icon name={Icons.globeOutline} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing.sm }}>
                      <AppText variant="body" style={{ fontWeight: '600' }}>
                        VNPay
                      </AppText>
                      <AppText variant="caption" color="textSecondary">
                        Cổng thanh toán VNPay
                      </AppText>
                    </View>
                    {paymentMethod === 'vnpay' ? (
                      <View style={[styles.optionCheckBadge, { backgroundColor: colors.primary }]}>
                        <Icon name={Icons.checkmark} size={14} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={[styles.optionCheckEmptyBadge, { borderColor: colors.borderLight }]} />
                    )}
                  </View>
                </TouchableOpacity>
              </StepLayout>
            )}
          </ScrollView>
          <View
            style={[
              styles.bottomAction,
              { backgroundColor: 'transparent', paddingBottom: Math.max(insets.bottom + 20, 20) },
            ]}
          >
            <View style={styles.bottomBackButton}>
              {step === 1 || resumingPackId ? (
                <Button
                  title="Hủy"
                  variant="outline"
                  onPress={() => {
                    setIsBuying(false);
                    setResumingPackId(null);
                  }}
                  disabled={buyLoading}
                  fullWidth
                />
              ) : (
                <Button
                  title="Quay lại"
                  variant="outline"
                  onPress={() => setStep(step - 1)}
                  disabled={buyLoading}
                  fullWidth
                />
              )}
            </View>
            <View style={step > 0 ? styles.bottomNextButton : styles.bottomPrimaryButton}>
              {step < 4 ? (
                <Button
                  title="Tiếp theo"
                  onPress={() => setStep(step + 1)}
                  disabled={
                    (step === 1 && (!selectedBranch || (selectedBranch !== 'ALL' && (branchPackageCounts[selectedBranch] || 0) === 0))) ||
                    (step === 2 && (!selectedVehicle || !selectedPackage)) ||
                    (step === 3 && slotCount < 1)
                  }
                  fullWidth
                />
              ) : (
                <Button
                  title="Thanh toán"
                  onPress={handleBuy}
                  loading={buyLoading}
                  fullWidth
                />
              )}
            </View>
          </View>
        </ScreenContainer>
      </Modal>

      <BottomSheet
        visible={showQrModal}
        onClose={() => setShowQrModal(false)}
        title="Quét QR để thanh toán"
        snapPoints={[0.65]}
      >
        <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
          <AppText variant="bodySmall" color="textSecondary" style={{ textAlign: 'center', marginBottom: spacing.lg, paddingHorizontal: spacing.md }}>
            Sử dụng app ngân hàng để quét mã QR bên dưới. Gói slot sẽ được kích hoạt tự động sau khi hệ thống xác nhận thanh toán.
          </AppText>
          
          <View style={{
            padding: 16,
            backgroundColor: '#ffffff',
            borderRadius: borderRadius.xl,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.1,
            shadowRadius: 24,
            elevation: 10,
            marginBottom: spacing.xl,
          }}>
            {pendingPaymentQr ? (
              <Image source={{ uri: pendingPaymentQr }} style={{ width: 220, height: 220 }} resizeMode="contain" />
            ) : (
              <View style={{ width: 220, height: 220, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.infoLight, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full }}>
            <ActivityIndicator size="small" color={colors.info} />
            <AppText variant="bodySmall" style={{ marginLeft: 8, color: colors.info, fontWeight: '600' }}>
              {isPollingPayment 
                ? `Đang chờ thanh toán... (${Math.floor(qrCountdown / 60).toString().padStart(2, '0')}:${(qrCountdown % 60).toString().padStart(2, '0')})` 
                : 'Vui lòng không đóng màn hình'
              }
            </AppText>
          </View>
        </View>
      </BottomSheet>
      
      {/* OTP Modal */}
      <Modal visible={showOtpModal} transparent animationType="fade">
        <View style={qrStyles.overlay}>
          <View style={[qrStyles.modal, { backgroundColor: colors.surface }]}>
            <AppText variant="h3" style={{ marginBottom: 12 }}>Xác thực hủy gói</AppText>
            <AppText variant="bodySmall" color="textSecondary" style={{ textAlign: 'center', marginBottom: 24 }}>
              Mã OTP đã được gửi đến email của bạn. Vui lòng nhập mã để xác nhận hủy gói lượt.
            </AppText>
            
            {/* Custom OTP UI */}
            <View style={{ width: '100%', alignItems: 'center', marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[0, 1, 2, 3, 4, 5].map(i => {
                  const isActive = otpCode.length === i;
                  const hasValue = !!otpCode[i];
                  return (
                    <View 
                      key={i} 
                      style={{ 
                        width: 45, 
                        height: 55, 
                        borderRadius: 12, 
                        borderWidth: isActive ? 2 : 1, 
                        borderColor: isActive ? colors.primary : (hasValue ? colors.textPrimary : colors.border), 
                        backgroundColor: isActive ? colors.primarySubtle : colors.surface,
                        justifyContent: 'center', 
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="h3" style={{ color: colors.textPrimary }}>
                        {otpCode[i] || ''}
                      </AppText>
                    </View>
                  );
                })}
              </View>
              
              {/* Hidden Input overlay */}
              <TextInput
                ref={otpInputRef}
                style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0 }}
                keyboardType="number-pad"
                maxLength={6}
                value={otpCode}
                onChangeText={setOtpCode}
                autoFocus
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <View style={{ flex: 1 }}>
                <Button 
                  title="Đóng" 
                  variant="outline" 
                  onPress={() => {
                    setShowOtpModal(false);
                    setPackToCancel(null);
                  }} 
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button 
                  title="Xác nhận" 
                  variant="primary" 
                  loading={isConfirmingCancel}
                  onPress={handleConfirmCancelOtp} 
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <View style={{
            width: '100%',
            maxWidth: 340,
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            padding: 24,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 10,
          }}>
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: '#DCFCE7',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <Icon name={Icons.checkmark} size={28} color="#16A34A" />
            </View>
            <AppText variant="h3" style={{ textAlign: 'center', marginBottom: 4, fontWeight: '700' }}>
              Mua gói thành công!
            </AppText>
            <AppText variant="caption" color="textSecondary" style={{ textAlign: 'center', marginBottom: 20 }}>
              Mã gói: <AppText variant="caption" style={{ fontWeight: '700', color: colors.primary }}>{successPack?.packCode}</AppText>
            </AppText>

            <View style={{
              width: '100%',
              backgroundColor: '#F8FAFC',
              borderRadius: 16,
              padding: 16,
              gap: 12,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#E2E8F0',
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="caption" color="textSecondary">Chi nhánh</AppText>
                <AppText variant="caption" style={{ fontWeight: '600', color: '#334155' }}>{successPack?.branchName || 'Toàn hệ thống'}</AppText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="caption" color="textSecondary">Gói dịch vụ</AppText>
                <AppText variant="caption" style={{ fontWeight: '600', color: '#334155' }}>{successPack?.packageName || '—'}</AppText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="caption" color="textSecondary">Số lần</AppText>
                <AppText variant="caption" style={{ fontWeight: '600', color: '#334155' }}>{successPack?.totalSlots} lần</AppText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                <AppText variant="body" style={{ fontWeight: '700', color: '#15803D' }}>Tổng thanh toán</AppText>
                <AppText variant="body" style={{ fontWeight: '700', color: '#15803D' }}>{formatCurrency(successPack?.finalPrice || 0)}</AppText>
              </View>
            </View>

            <View style={{
              width: '100%',
              backgroundColor: '#F0FDF4',
              borderRadius: 12,
              padding: 12,
              marginBottom: 20,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#DCFCE7',
            }}>
              <AppText variant="caption" style={{ color: '#166534', fontWeight: '600', textAlign: 'center', lineHeight: 18 }}>
                ✓ Đã thanh toán — mã {successPack?.packCode} đã sẵn sàng sử dụng.
              </AppText>
            </View>

            <Button
              title="Đóng"
              variant="primary"
              fullWidth
              onPress={() => setShowSuccessModal(false)}
            />
          </View>
        </View>
      </Modal>

      {!isBuying && <BottomNavBar />}
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
    <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xxl }}>
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

const qrStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: { textAlign: 'center', marginBottom: 8 },
  subtitle: { textAlign: 'center', marginBottom: spacing.md },
  qrWrapper: {
    width: 240,
    height: 240,
    padding: 12,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrImage: { width: '100%', height: '100%' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
});

const styles = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 32 },
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
  summaryCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: layout.cardRadius, marginBottom: 16, ...shadows.md },
  summaryIcon: { marginRight: 12 },
  summaryContent: { flex: 1 },
  slotCard: { marginBottom: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  headerInfo: { flex: 1 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 16 },
  statsContainer: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statDivider: { width: 1, height: 40, backgroundColor: '#eee' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoIcon: { marginRight: 8, width: 20 },
  actions: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', gap: 12 },
  cancelButton: { borderColor: '#f44336' },
  selectCard: { padding: 16, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, marginBottom: 12, backgroundColor: '#fff', ...shadows.sm },
  // Buy-more CTA footer (when packs already exist).
  footerCtaWrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    gap: spacing.sm,
  },
  footerHint: {
    textAlign: 'center',
    lineHeight: 16,
  },
  progressContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
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
  priceText: {
    fontWeight: '700',
    marginTop: spacing.xs,
  },
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
  priceCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#F1F5F9', // colors.borderLight
    borderRadius: layout.cardRadius,
    padding: spacing.md,
    ...shadows.md,
    backgroundColor: '#fff',
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
    backgroundColor: '#F1F5F9',
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
  selectablePaymentCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  methodIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCheckBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCheckEmptyBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
  },
});
