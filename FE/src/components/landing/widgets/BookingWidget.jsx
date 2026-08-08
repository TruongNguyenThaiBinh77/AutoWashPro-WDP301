import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Clock, ShieldCheck, Car, Truck, Bike, Calendar, Tag, Check, 
  ArrowLeft, ArrowRight, RefreshCw, AlertCircle, Sparkles, Sun, Sunset, Plus,
  Copy, Info, CheckCircle2, X
} from 'lucide-react';
import VoucherPicker from '../../VoucherPicker.jsx';
import SlotPackFlow from '../../customer/widgets/SlotPackFlow.jsx';
import useSSE from '../../../hooks/useSSE.js';
import { storageKeys } from '../../../lib/authStorage.js';
import { useSystemConfig } from '../../../hooks/useSystemConfig.jsx';

import { showToast } from '@/lib/toast';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const WEEKS_OPTIONS = [2, 4, 8, 12, 16, 20, 24];

const WEEKDAY_OPTIONS = [
  { label: 'T2', value: 1 },
  { label: 'T3', value: 2 },
  { label: 'T4', value: 3 },
  { label: 'T5', value: 4 },
  { label: 'T6', value: 5 },
  { label: 'T7', value: 6 },
  { label: 'CN', value: 0 },
];

const TIME_SLOTS = ['07:00','07:30','08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];

function formatCurrency(v) {
  return `${new Intl.NumberFormat('vi-VN').format(v || 0)}đ`;
}

function buildBookingDates() {
  const weekdayFormatter = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const isoString = date.toLocaleDateString('en-CA');
    return {
      id: isoString,
      label: index === 0 ? 'Hôm nay' : weekdayFormatter.format(date).toUpperCase(),
      day, month, iso: isoString,
    };
  });
}

const VEHICLE_TYPES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'van', label: 'Van' },
];

function authHeader(token) {
  const t = token || localStorage.getItem(storageKeys.accessToken) || '';
  return t ? `Bearer ${t}` : '';
}

export default function BookingWidget({ onOpenAuth, user, vehicles: userVehicles = [], apiBase, token, onGoToHistory, pendingBooking, onSetPendingBooking, onVehicleCreated, onUserUpdate, initialBranchId, initialTab, rebookData }) {
  const configs = useSystemConfig();
  const depositPercent = Math.round(configs?.DEPOSIT_RATE ?? 0);
  const vatRate = Math.round(configs?.VAT_PERCENT ?? 10);
  const isLoggedIn = !!user && !!token;
  const bookingDates = useMemo(() => buildBookingDates(), []);

  const getUrlParam = (key, fallback) => {
    try { const p = new URLSearchParams(window.location.search); return p.get(key) || fallback; } catch { return fallback; }
  };
  const syncUrlParam = (key, value) => {
    try { const url = new URL(window.location); if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); window.history.replaceState({}, '', url); } catch {}
  };

  const [tab, setTab] = useState(getUrlParam('tab', initialTab || 'regular'));
  const [step, setStep] = useState(Number(getUrlParam('step', 1)));
  const [spCanAdvance, setSpCanAdvance] = useState(false);

  const defaultGuestVehicle = { licensePlate: '', brand: '', model: '', type: 'sedan' };

  const getSavedBookingState = () => {
    try {
      const s = sessionStorage.getItem('aw_booking_state');
      if (!s) return null;
      const p = JSON.parse(s);
      if (!p.savedAt || (Date.now() - p.savedAt > 3 * 60 * 1000)) {
        sessionStorage.removeItem('aw_booking_state');
        sessionStorage.removeItem('aw_bookingDraft');
        return null;
      }
      return p;
    } catch {
      return null;
    }
  };

  const initialBookingState = getSavedBookingState();
  // Selections (initialized from sessionStorage with 3 min expiration check)
  const [selectedBranch, setSelectedBranch] = useState(() => initialBookingState?.selectedBranch || null);
  const [selectedVehicle, setSelectedVehicle] = useState(() => initialBookingState?.selectedVehicle || '');
  const [selectedPackage, setSelectedPackage] = useState(() => initialBookingState?.selectedPackage || null);
  const [selectedSubServices, setSelectedSubServices] = useState(() => (initialBookingState?.selectedSubServices && Object.keys(initialBookingState.selectedSubServices).length) ? initialBookingState.selectedSubServices : {});
  const [selectedDate, setSelectedDate] = useState(() => initialBookingState?.selectedDate || null);
  const [selectedTime, setSelectedTime] = useState(() => initialBookingState?.selectedTime || '');
  const [selectedDays, setSelectedDays] = useState(() => initialBookingState?.selectedDays || []);
  const [weeks, setWeeks] = useState(() => initialBookingState?.weeks || 2);
  const [weeksInput, setWeeksInput] = useState(() => String(initialBookingState?.weeks || 2));
  const [weeksError, setWeeksError] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(() => initialBookingState?.appliedVoucher || null);
  const [selectedSlotPack, setSelectedSlotPack] = useState(() => initialBookingState?.selectedSlotPack || null);
  const [guestVehicle, setGuestVehicle] = useState(() => initialBookingState?.guestVehicle?.licensePlate ? initialBookingState.guestVehicle : defaultGuestVehicle);

  // Guest vehicle form
  const [vehicleError, setVehicleError] = useState('');

  useEffect(() => { syncUrlParam('step', step > 1 ? String(step) : ''); }, [step]);
  useEffect(() => { syncUrlParam('tab', tab !== 'regular' ? tab : ''); }, [tab]);

  // Auto-expire saved booking state after 3 minutes of inactivity
  useEffect(() => {
    const timer = setInterval(() => {
      const s = sessionStorage.getItem('aw_booking_state');
      if (s) {
        try {
          const p = JSON.parse(s);
          if (!p.savedAt || (Date.now() - p.savedAt > 3 * 60 * 1000)) {
            sessionStorage.removeItem('aw_booking_state');
            sessionStorage.removeItem('aw_bookingDraft');
            setStep(1);
          }
        } catch {}
      }
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Persist to sessionStorage on every meaningful change (step >= 2) with timestamp
  useEffect(() => {
    if (step < 2) return;
    const toSave = { selectedBranch, selectedVehicle, selectedPackage, selectedSubServices, selectedDate, selectedTime, selectedDays, weeks, appliedVoucher, selectedSlotPack, guestVehicle, savedAt: Date.now() };
    try { sessionStorage.setItem('aw_booking_state', JSON.stringify(toSave)); } catch {}
  }, [step, selectedBranch, selectedVehicle, selectedPackage, selectedSubServices, selectedDate, selectedTime, selectedDays, weeks, appliedVoucher, selectedSlotPack, guestVehicle]);

  // Data from API
  const [branches, setBranches] = useState([]);
  const [packages, setPackages] = useState([]);
  const [mySlotPacks, setMySlotPacks] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [todaySlots, setTodaySlots] = useState([]);
  const [todaySlotsLoading, setTodaySlotsLoading] = useState(false);

  // Booking state
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastBooking, setLastBooking] = useState(null);
  const [result, setResult] = useState(null);

  // Deposit payment state
  const [pendingDeposit, setPendingDeposit] = useState(null);
  const [depositPayment, setDepositPayment] = useState(null);
  const [depositQrStep, setDepositQrStep] = useState('select'); // 'select' | 'qr' | 'success'
  const [depositMethod, setDepositMethod] = useState('bank');
  const [paymentMode, setPaymentMode] = useState('deposit'); // 'deposit' or 'full'
  const [depositLoading, setDepositLoading] = useState(false);
  const [vnpayLoading, setVnpayLoading] = useState(false);
  const [depositPollCount, setDepositPollCount] = useState(0);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);

  // Real-time: recalculate deposit when DEPOSIT_RATE config changes
  useEffect(() => {
    if (pendingDeposit && pendingDeposit.finalPrice > 0) {
      const newDeposit = Math.round((pendingDeposit.finalPrice * (configs?.DEPOSIT_RATE ?? 0) / 100) / 1000) * 1000;
      if (newDeposit !== pendingDeposit.depositAmount) {
        setPendingDeposit(prev => ({ ...prev, depositAmount: newDeposit }));
      }
    }
  }, [configs?.DEPOSIT_RATE, pendingDeposit?.finalPrice]);

  // Real-time: recalculate recurring deposit when DEPOSIT_RATE config changes
  useEffect(() => {
    if (pendingDeposit && pendingDeposit.tab === 'recurring' && pendingDeposit.finalPrice > 0) {
      const newDeposit = Math.round((pendingDeposit.finalPrice * (configs?.DEPOSIT_RATE ?? 0) / 100) / 1000) * 1000;
      if (newDeposit !== pendingDeposit.depositAmount) {
        setPendingDeposit(prev => ({ ...prev, depositAmount: newDeposit }));
      }
    }
  }, [configs?.DEPOSIT_RATE, pendingDeposit?.finalPrice, pendingDeposit?.tab]);

  // Add vehicle inline
  const [localVehicles, setLocalVehicles] = useState([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    licensePlate: '', vehicleType: 'sedan', brand: '', model: '', color: '', year: '',
  });

  const allVehicles = [...userVehicles, ...localVehicles];
  const hasNoVehicles = allVehicles.length === 0;

  function handleVehicleFormChange(field, value) {
    setVehicleForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleAddVehicle(e) {
    e.preventDefault();
    if (!vehicleForm.licensePlate.trim()) { setError('Vui lòng nhập biển số xe'); return; }
    if (!vehicleForm.brand.trim()) { setError('Vui lòng nhập hãng xe'); return; }
    if (!vehicleForm.color.trim()) { setError('Vui lòng nhập màu xe'); return; }
    setAddingVehicle(true);
    setError('');
    try {
      const body = { ...vehicleForm };
      if (!body.year) delete body.year;
      if (!body.model) delete body.model;
      const res = await fetch(`${apiBase}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Thêm xe thất bại');
      const newVehicle = data?.data || data;
      setLocalVehicles(prev => [...prev, newVehicle]);
      setSelectedVehicle(newVehicle._id || newVehicle.id);
      setShowAddVehicle(false);
      setVehicleForm({ licensePlate: '', vehicleType: 'sedan', brand: '', model: '', color: '', year: '' });
      showToast('Đã thêm xe thành công!', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingVehicle(false);
    }
  }

  // Draft data để tạo booking sau khi payment confirm
  const [depositDraft, setDepositDraft] = useState(null);
  const [creatingBooking, setCreatingBooking] = useState(false);

  // Process pending booking after login
  const [processingPending, setProcessingPending] = useState(false);

  // Recurring conflict check
  const [conflictCheck, setConflictCheck] = useState({ status: 'idle', results: [], totalConflicts: 0 });

  // SSE update trigger
  const [slotsUpdateTick, setSlotsUpdateTick] = useState(0);
  useSSE(token, 'slots_updated', () => setSlotsUpdateTick(t => t + 1));

  const [loyaltyConfig, setLoyaltyConfig] = useState(null);

  // Load loyalty config (public) with real-time SSE sync
  const loadLoyaltyConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/loyalty/config`);
      const payload = await res.json();
      if (payload?.data) setLoyaltyConfig(payload.data);
      else if (payload?.tiers) setLoyaltyConfig(payload);
    } catch (e) {
      console.error('Failed to load loyalty config', e);
    }
  }, []);

  useEffect(() => {
    loadLoyaltyConfig();
  }, [loadLoyaltyConfig]);

  useSSE(token, 'config_updated', loadLoyaltyConfig);
  useSSE(token, 'loyalty_config_updated', (data) => {
    if (data) setLoyaltyConfig(data);
    else loadLoyaltyConfig();
  });
  useSSE(token, 'rewards_updated', loadLoyaltyConfig);

  // Load branches (public)
  useEffect(() => {
    async function loadBranches() {
      try {
        const res = await fetch(`${API_BASE}/branches/public`);
        const payload = await res.json();
        const data = payload?.data || payload || [];
        const branchList = Array.isArray(data) ? data : [];
        setBranches(branchList);
      } catch (e) { console.error('Failed to load branches', e); }
    }
    loadBranches();
  }, []);

  // Auto-select first branch after branches load (only if nothing restored)
  useEffect(() => {
    if (branches.length === 0 || selectedBranch) return;
    const targetBranchId = rebookData?.branchId?._id || rebookData?.branchId?.id || rebookData?.branchId;
    const targetBranchName = rebookData?.branchId?.name || rebookData?.branchName || rebookData?.branch;
    const found = branches.find(b => 
      (targetBranchId && String(b._id || b.id) === String(targetBranchId)) ||
      (targetBranchName && String(b.name || '').trim().toLowerCase() === String(targetBranchName).trim().toLowerCase())
    );
    setSelectedBranch(found || branches[0]);
  }, [branches, selectedBranch]);

  // Load packages when branch changes
  const loadPackagesForBranch = useCallback(async () => {
    if (!selectedBranch) { setPackages([]); return; }
    try {
      const branchId = selectedBranch._id || selectedBranch.id;
      const res = await fetch(`${API_BASE}/packages?branchId=${branchId}`);
      const payload = await res.json();
      const data = payload?.data || payload || [];
      const activePkgs = (Array.isArray(data) ? data : []).filter(p => p.status === 'active');
      setPackages(activePkgs);
      if (activePkgs.length > 0 && !activePkgs.find(p => (p._id || p.id) === (selectedPackage?._id || selectedPackage?.id))) {
        setSelectedPackage(activePkgs[0]);
      }
    } catch (e) { console.error('Failed to load packages', e); }
  }, [selectedBranch, selectedPackage]);

  useEffect(() => {
    loadPackagesForBranch();
  }, [selectedBranch]);

  useSSE(token, 'branch_sort_order_updated', useCallback((data) => {
    const curBranchId = selectedBranch?._id || selectedBranch?.id;
    if (curBranchId && String(data?.branchId) === String(curBranchId)) {
      loadPackagesForBranch();
    }
  }, [selectedBranch, loadPackagesForBranch]));

  const handledRebookIdRef = useRef(null);

  // Process rebookData: auto pre-fill branch, vehicle, time, jump to step 2
  useEffect(() => {
    if (!rebookData || branches.length === 0) return;

    const rebookId = rebookData._id || rebookData.id || JSON.stringify(rebookData);
    if (handledRebookIdRef.current === rebookId) return;
    handledRebookIdRef.current = rebookId;

    const targetBranchId = rebookData.branchId?._id || rebookData.branchId?.id || rebookData.branchId;
    const targetBranchName = rebookData.branchId?.name || rebookData.branchName || rebookData.branch;
    const foundBranch = branches.find(b => 
      (targetBranchId && String(b._id || b.id) === String(targetBranchId)) ||
      (targetBranchName && String(b.name || '').trim().toLowerCase() === String(targetBranchName).trim().toLowerCase())
    );
    if (foundBranch) {
      setSelectedBranch(foundBranch);
    }

    const targetVehicleId = rebookData.vehicleId?._id || rebookData.vehicleId?.id || rebookData.vehicleId;
    if (targetVehicleId) {
      setSelectedVehicle(targetVehicleId);
    } else if (rebookData.vehicleLicensePlate) {
      setGuestVehicle({
        licensePlate: rebookData.vehicleLicensePlate || '',
        brand: rebookData.vehicleBrand || '',
        model: rebookData.vehicleModel || '',
        type: rebookData.vehicleType || 'sedan',
      });
    }

    if (rebookData.startTime) {
      setSelectedTime(rebookData.startTime);
    }

    setStep(2);
    showToast('Thông tin từ lần đặt trước đã được điền sẵn. Bạn có thể chỉnh sửa hoặc thêm dịch vụ nếu cần.');
  }, [rebookData, branches]);

  // Pre-fill package & sub-services when packages load for rebookData
  useEffect(() => {
    if (!rebookData || packages.length === 0) return;
    const targetPkgId = rebookData.packageId?._id || rebookData.packageId?.id || rebookData.packageId;
    const foundPkg = packages.find(p => (p._id || p.id) === targetPkgId);
    if (foundPkg) {
      setSelectedPackage(foundPkg);
      const pId = foundPkg._id || foundPkg.id;
      const prevSubServices = (rebookData.selectedSubServices || []).map(s => typeof s === 'string' ? s : (s.name || s.title || s._id));
      if (prevSubServices.length > 0) {
        setSelectedSubServices(prev => ({
          ...prev,
          [pId]: prevSubServices,
        }));
      }
    }
  }, [rebookData, packages]);

  // Fetch today slots preview when branch + first package are available
  useEffect(() => {
    if (!selectedBranch) { setTodaySlots([]); return; }
    const firstPkg = packages[0];
    if (!firstPkg) { setTodaySlots([]); return; }
    const today = bookingDates[0]?.iso;
    if (!today) return;
    setTodaySlotsLoading(true);
    const branchId = selectedBranch._id || selectedBranch.id;
    const pkgId = firstPkg._id || firstPkg.id;
    fetch(`${API_BASE}/bookings/slots?branchId=${branchId}&date=${today}&packageId=${pkgId}`)
      .then(r => r.json())
      .then(payload => setTodaySlots(payload?.data || []))
      .catch(() => setTodaySlots([]))
      .finally(() => setTodaySlotsLoading(false));
  }, [selectedBranch, packages, slotsUpdateTick]);

  // Load slot packs (when logged in)
  useEffect(() => {
    if (!isLoggedIn) return;
    async function loadPacks() {
      try {
        const res = await fetch(`${apiBase}/slot-packs/my`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await res.json();
        setMySlotPacks(Array.isArray(payload?.data) ? payload.data : []);
      } catch (e) { console.error(e); }
    }
    loadPacks();
  }, [isLoggedIn, apiBase, token]);

  // Auto-select first vehicle (only fires when selectedVehicle is truly unset)
  useEffect(() => {
    if (!selectedVehicle && allVehicles[0]) {
      setSelectedVehicle(allVehicles[0]._id || allVehicles[0].id || '');
    }
  }, [userVehicles, selectedVehicle]);

  // Helper to build date object for any ISO date (whether in 7-day quick list or custom selected)
  const getDateObj = useCallback((dateIso) => {
    if (!dateIso) return bookingDates[0];
    const found = bookingDates.find(d => d.id === dateIso);
    if (found) return found;
    try {
      const parts = String(dateIso).split('-');
      if (parts.length === 3) {
        const [y, m, d] = parts;
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        const weekdayFormatter = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' });
        return {
          id: dateIso,
          label: weekdayFormatter.format(dateObj).toUpperCase(),
          day: d,
          month: m,
          iso: dateIso,
        };
      }
    } catch (_) {}
    return { id: dateIso, label: dateIso, day: dateIso, month: '', iso: dateIso };
  }, [bookingDates]);

  const formatRecurringDate = useCallback((dateIso, time) => {
    if (!dateIso) return time || '';
    const raw = String(dateIso);
    let weekday, day, month, year;
    // Date-only "YYYY-MM-DD" (từ preview/conflictCheck) → giữ nguyên ngày.
    // Ngược lại là ISO datetime (vd "2026-08-03T17:00:00.000Z") → parse bằng Date
    // và lấy theo giờ ĐỊA PHƯƠNG, tránh bị lùi 1 ngày do UTC.
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    if (isDateOnly) {
      const [y, m, d] = raw.split('-').map(Number);
      const dObj = new Date(y, m - 1, d);
      weekday = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][dObj.getDay()];
      day = d; month = m; year = y;
    } else {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw;
      weekday = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.getDay()];
      day = d.getDate(); month = d.getMonth() + 1; year = d.getFullYear();
    }
    const dateLabel = `${weekday}, (${day}/${month}/${year})`;
    return time ? `${dateLabel} · ${time}` : dateLabel;
  }, []);

  // Calculate max advance booking days based on user's tier
  const userTierKey = (user?.tier || user?.membershipTier || 'bronze').toLowerCase();
  const userTierObj = useMemo(() => {
    return (loyaltyConfig?.tiers || []).find(t => (t.id || '').toLowerCase() === userTierKey);
  }, [loyaltyConfig?.tiers, userTierKey]);

  const maxAdvanceDays = useMemo(() => {
    const tierDays = Number(userTierObj?.advanceDays);
    if (!isNaN(tierDays) && tierDays > 0) return tierDays;
    const configDays = Number(configs?.ADVANCE_BOOKING_LIMITS?.[userTierKey]);
    if (!isNaN(configDays) && configDays > 0) return configDays;
    return userTierKey === 'diamond' ? 60 : userTierKey === 'gold' ? 30 : 14;
  }, [userTierObj, configs?.ADVANCE_BOOKING_LIMITS, userTierKey]);

  const tierDisplayName = useMemo(() => {
    return userTierObj?.name || (userTierKey === 'diamond' ? 'Kim Cương' : userTierKey === 'gold' ? 'Vàng' : userTierKey === 'silver' ? 'Bạc' : 'Đồng');
  }, [userTierObj, userTierKey]);

  const maxAdvanceDateObj = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + maxAdvanceDays);
    return d;
  }, [maxAdvanceDays]);

  const maxAdvanceDateIso = useMemo(() => {
    return maxAdvanceDateObj.toLocaleDateString('en-CA');
  }, [maxAdvanceDateObj]);

  const maxAdvanceDateFormatted = useMemo(() => {
    const day = String(maxAdvanceDateObj.getDate()).padStart(2, '0');
    const month = String(maxAdvanceDateObj.getMonth() + 1).padStart(2, '0');
    const year = maxAdvanceDateObj.getFullYear();
    return `${day}/${month}/${year}`;
  }, [maxAdvanceDateObj]);

  const higherTiersLabel = useMemo(() => {
    const allTiers = loyaltyConfig?.tiers || [];
    const higher = allTiers.filter(t => {
      const days = Number(t.advanceDays) || Number(configs?.ADVANCE_BOOKING_LIMITS?.[t.id?.toLowerCase()]) || 0;
      return days > maxAdvanceDays;
    });
    if (higher.length === 0) return null;
    const tierNames = higher.map(t => t.name);
    let names = '';
    if (tierNames.length === 1) {
      names = `hạng ${tierNames[0]}`;
    } else if (tierNames.length === 2) {
      names = `hạng ${tierNames[0]} hoặc ${tierNames[1]}`;
    } else {
      const head = tierNames.slice(0, -1).join(', ');
      const tail = tierNames[tierNames.length - 1];
      names = `hạng ${head} hoặc ${tail}`;
    }
    const daysArr = higher.map(t => Number(t.advanceDays) || Number(configs?.ADVANCE_BOOKING_LIMITS?.[t.id?.toLowerCase()]));
    const days = daysArr.length > 1 ? `${Math.min(...daysArr)} - ${Math.max(...daysArr)} ngày` : `${daysArr[0]} ngày`;
    return { names, days };
  }, [loyaltyConfig?.tiers, configs?.ADVANCE_BOOKING_LIMITS, maxAdvanceDays]);

  // Fetch available slots
  const currentDate = useMemo(() => selectedDate ? getDateObj(selectedDate) : null, [selectedDate, getDateObj]);
  
  const fetchDate = useMemo(() => {
    if (tab === 'regular') return currentDate?.iso;
    // Đối với lịch định kỳ, tìm 1 ngày trong tương lai gần nhất mà KHÔNG phải là ngày nghỉ của chi nhánh
    // Để gọi API lấy danh sách khung giờ cố định của chi nhánh đó
    const daysOff = selectedBranch?.scheduleConfig?.daysOff || [];
    let d = new Date();
    for (let i = 0; i < 30; i++) {
      const iso = d.toLocaleDateString('en-CA');
      if (!daysOff.includes(iso)) return iso;
      d.setDate(d.getDate() + 1);
    }
    return new Date().toLocaleDateString('en-CA');
  }, [tab, currentDate?.iso, selectedBranch?.scheduleConfig?.daysOff]);

  useEffect(() => {
    if (!selectedBranch || !selectedPackage || !fetchDate) return;
    async function fetchSlots() {
      setSlotsLoading(true);
      try {
        const branchId = selectedBranch._id || selectedBranch.id;
        const pkgId = selectedPackage._id || selectedPackage.id;
        const url = `${API_BASE}/bookings/slots?branchId=${branchId}&date=${fetchDate}&packageId=${pkgId}`;
        const res = await fetch(url);
        const payload = await res.json();
        if (res.ok) setAvailableSlots(payload.data || []);
        else setAvailableSlots([]);
      } catch (err) { console.error(err); }
      finally { setSlotsLoading(false); }
    }
    fetchSlots();
  }, [selectedBranch, selectedPackage, fetchDate, isLoggedIn, apiBase, token, slotsUpdateTick]);

  // Restore pending booking selections after login, show step 5 for review
  useEffect(() => {
    if (!pendingBooking || !isLoggedIn || processingPending) return;
    const pb = pendingBooking;
    if (pb.tab) setTab(pb.tab);
    const restoreBranch = branches.find(b => (b._id || b.id) === pb.branchId);
    if (restoreBranch) setSelectedBranch(restoreBranch);
    const restorePkg = packages.find(p => (p._id || p.id) === pb.packageId);
    if (restorePkg) setSelectedPackage(restorePkg);
    if (pb.selectedDate) setSelectedDate(pb.selectedDate);
    if (pb.selectedTime) setSelectedTime(pb.selectedTime);
    if (pb.selectedDays) setSelectedDays(pb.selectedDays);
    if (pb.weeks) setWeeks(pb.weeks);
    if (pb.selectedSubServices) setSelectedSubServices(pb.selectedSubServices);
    setStep(5);
  }, [pendingBooking, isLoggedIn, branches, packages]);

  // Auto-select branch from URL param and jump to step 2
  useEffect(() => {
    if (!initialBranchId || branches.length === 0) return;
    const match = branches.find(b => (b._id || b.id) === initialBranchId);
    if (match) {
      setSelectedBranch(match);
      setStep(2);
    }
  }, [initialBranchId, branches]);

    const executeCreateBooking = async (options = {}) => {
    const isRecurring = options.tab === 'recurring';
    const endpoint = isRecurring ? `${apiBase}/bookings/recurring` : `${apiBase}/bookings`;
    
    let vehicleId = selectedVehicle || (allVehicles[0]?._id || allVehicles[0]?.id || '');
    
    const body = {
      branchId: selectedBranch?._id || selectedBranch?.id,
      packageId: pkg?._id || pkg?.id,
      vehicleId,
      bookingDate: isRecurring ? undefined : (currentDate?.iso || currentDate?.toLocaleDateString('en-CA')),
      startTime: selectedTime,
      voucherCode: appliedVoucher?.code || undefined,
      selectedSubServices: currentSubServices || [],
      note: '',
      isDraft: options.isDraft || false
    };

    if (isRecurring) {
      body.weekdays = selectedDays;
      body.weeks = weeks;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.message || errData?.error || 'Create booking failed');
    }
    
    const payload = await res.json();
    return payload?.data || payload;
  };

  async function processPendingBooking() {
    const pb = pendingBooking;
    if (!pb) return;
    setProcessingPending(true);
    setBookingLoading(true);
    setError('');

    try {
      // Create vehicle if guest provided info
      let vehicleId = '';
      const gv = pb.guestVehicle;
      if (gv && gv.licensePlate && gv.licensePlate.trim()) {
        // Check if vehicle already exists (from a previous failed attempt)
        const existing = userVehicles.find(v =>
          (v.licensePlate || '').replace(/\s+/g, '').toUpperCase() === gv.licensePlate.trim().replace(/\s+/g, '').toUpperCase()
        );
        if (existing) {
          vehicleId = existing._id || existing.id || '';
        }
        if (!vehicleId) {
          const vehRes = await fetch(`${apiBase}/vehicles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              licensePlate: gv.licensePlate.trim(),
              brand: gv.brand?.trim() || 'Khác',
              model: gv.model?.trim() || '',
              vehicleType: gv.type || 'sedan',
              color: 'Khác',
            }),
          });
          if (!vehRes.ok) {
            const errData = await vehRes.json().catch(() => null);
            // If duplicate, vehicle was already created — fetch it
            if (vehRes.status === 409) {
              const found = userVehicles.find(v =>
                (v.licensePlate || '').replace(/\s+/g, '').toUpperCase() === gv.licensePlate.trim().replace(/\s+/g, '').toUpperCase()
              );
              if (found) {
                vehicleId = found._id || found.id || '';
              } else {
                throw new Error('Xe đã tồn tại nhưng không tìm thấy trong danh sách');
              }
            } else {
              console.error('Vehicle creation failed:', vehRes.status, errData);
              throw new Error(errData?.message || 'Không thể lưu thông tin xe');
            }
          } else {
            const vehData = await vehRes.json();
            const newVehicle = vehData?.data || vehData;
            vehicleId = newVehicle?._id || newVehicle?.id || '';
            if (onVehicleCreated && newVehicle) onVehicleCreated(newVehicle);
          }
        }
      } else {
        // Use selected or first existing vehicle
        vehicleId = selectedVehicle || allVehicles[0]?._id || allVehicles[0]?.id || '';
      }

      // Show payment method first; booking is only created after user picks payment method.
      // Với ĐỊNH KỲ: tổng tiền = giá 1 buổi × số buổi THỰC TẾ được tạo (sau khi loại trùng lịch).
      // Không dùng số buổi dự kiến vì hệ thống bỏ qua các buổi xung đột slot.
      const perSession = totalBase || 0;
      let sessionCount = 1;
      if (pb.tab === 'recurring') {
        sessionCount = Math.max(1, actualRecurringSessions || previewDates.length || 1);
      }
      const estimatedTotal = perSession * sessionCount;
      const origEstimatedTotal = (perSessionBase || perSession) * sessionCount;
      const discEstimatedTotal = (pb.appliedDiscount || pb.discount || discount || 0) * sessionCount;
      const calculatedDeposit = Math.round((estimatedTotal * (configs?.DEPOSIT_RATE ?? 0) / 100) / 1000) * 1000;

      if (estimatedTotal > 0) {
        setPendingDeposit({
          isDraft: true,
          tab: pb.tab || 'regular',
          originalPrice: origEstimatedTotal,
          discount: discEstimatedTotal,
          voucherCode: pb.appliedVoucher?.code || pb.voucherCode || appliedVoucher?.code || '',
          finalPrice: estimatedTotal,
          totalAmount: estimatedTotal,
          depositAmount: calculatedDeposit,
          depositPaid: false,
          _vehicleId: vehicleId,
          _pendingData: pb,
        });
        setDepositQrStep('select');
        setDepositPayment(null);
        setPaymentMode(calculatedDeposit > 0 ? 'deposit' : 'full');
        onSetPendingBooking(null);
      } else {
        // No deposit needed - create booking directly
        const isRec = pb.tab === 'recurring';
        const ep = isRec ? `${apiBase}/bookings/recurring` : `${apiBase}/bookings`;
        const directBody = isRec
          ? { branchId: pb.branchId, packageId: pb.packageId, vehicleId, weekdays: pb.selectedDays, startTime: pb.selectedTime, weeks: pb.weeks, voucherCode: pb.appliedVoucher?.code || undefined, selectedSubServices: pb.selectedSubServices || [], note: '' }
          : { branchId: pb.branchId, packageId: pb.packageId, vehicleId, bookingDate: pb.selectedDate || undefined, startTime: pb.selectedTime, voucherCode: pb.appliedVoucher?.code || undefined, selectedSubServices: pb.selectedSubServices || [], note: '' };
        const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(directBody) });
        if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.message || 'Không thể tạo lịch hẹn'); }
        const p2 = await r.json();
        const bk = p2?.data || p2;
        const code = isRec ? (bk?.recurringGroupId || '') : (bk?.bookingCode || bk?.code || '');
        setBookingCode(code);
        setLastBooking({
          branch: selectedBranch || { name: '' },
          vehicle: { licensePlate: gv?.licensePlate || '', name: gv?.brand || '' },
          pkg: pkg || { name: '' },
          currentDate: pb.selectedDate ? getDateObj(pb.selectedDate) : null,
          selectedTime: pb.selectedTime,
          total: estimatedTotal,
          discount: pb.appliedDiscount || pb.discount || discount || 0,
          voucherCode: pb.appliedVoucher?.code || pb.voucherCode || appliedVoucher?.code || '',
          points: 0, isPayingWithPack: false, bookingCode: code,
          subServices: (pb.selectedSubServices || []).map(n => { const s = pkg?.subServices?.find(x => x.name === n); return s ? { name: s.name, price: s.price } : { name: n, price: 0 }; }),
          recurringCount: isRec ? bk?.totalCreated || 0 : undefined,
          recurringBookings: isRec ? (bk?.created || []).map(c => ({ date: c.bookingDate, time: c.startTime })) : undefined,
          depositAmount: 0, depositPaid: false,
        });
        setShowSuccessModal(true);
        onSetPendingBooking(null);
      }
    } catch (err) {
      console.error('processPendingBooking error:', err);
      setError(err.message || 'Không thể tạo lịch hẹn');
      onSetPendingBooking(null);
    } finally {
      setBookingLoading(false);
    }
  }

  async function payDeposit() {
    if (!pendingDeposit) return;
    setDepositLoading(true);
    setError('');
    try {
      if (pendingDeposit.isDraft) {
        // Draft: lưu data, tạo provisional bank payment (có QR code)
        const pb = pendingDeposit._pendingData;
        const isRec = pendingDeposit.tab === 'recurring';
        const vId = pendingDeposit._vehicleId || selectedVehicle || (allVehicles[0]?._id || allVehicles[0]?.id || '');
        const draft = {
          branchId: pb?.branchId || selectedBranch?._id || selectedBranch?.id,
          packageId: pb?.packageId || pkg?._id || pkg?.id,
          vehicleId: vId,
          bookingDate: pb?.selectedDate || (isRec ? undefined : currentDate?.iso),
          startTime: pb?.selectedTime || selectedTime,
          weekdays: pb?.selectedDays || selectedDays,
          weeks: pb?.weeks || weeks,
          voucherCode: pb?.appliedVoucher?.code || appliedVoucher?.code,
          selectedSubServices: pb?.selectedSubServices || currentSubServices,
          isRecurring: isRec,
          finalPrice: pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0,
          depositAmount: pendingDeposit.depositAmount || 0,
          paymentMode,
          branchName: selectedBranch?.name || '',
          pkgName: pkg?.name || '',
          pkgPrice: pkg?.price || 0,
          subServicesPrices: pkg?.subServices?.reduce((acc, s) => { acc[s.name] = s.price || 0; return acc; }, {}),
          vehicleInfo: vehicle ? { licensePlate: vehicle.licensePlate || vehicle.name, name: vehicle.name } : null,
        };
        setDepositDraft(draft);

        // Tạo provisional bank payment (có QR code)
        const actualAmount = paymentMode === 'full' ? (pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0) : (pendingDeposit.depositAmount || 0);
        const res = await fetch(`${apiBase}/payments/bank-provisional`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount: actualAmount, paymentType: paymentMode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Lỗi tạo thanh toán');
        const payment = data?.data || data;
        setDepositPayment(payment);
        setDepositQrStep('qr');
        setDepositPollCount(0);
      } else {
        // Booking đã tồn tại (VD: định kỳ) — tạo payment ngay
        const actualAmount = paymentMode === 'full' ? (pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0) : (pendingDeposit.depositAmount || 0);
        let bkId = pendingDeposit._id || pendingDeposit.id;
        if (!bkId && pendingDeposit.bookings && pendingDeposit.bookings.length > 0) {
          bkId = pendingDeposit.bookings[0]._id || pendingDeposit.bookings[0].id;
        }

        const res = await fetch(`${apiBase}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingId: bkId, method: depositMethod, paymentType: paymentMode, amount: actualAmount }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Lỗi thanh toán');
        const payment = data?.data || data;
        setDepositPayment(payment);
        setDepositQrStep('qr');
        setDepositPollCount(0);
      }
    } catch (err) {
      setError(err.message || 'Lỗi thanh toán');
    } finally {
      setDepositLoading(false);
    }
  }

  // Poll payment status when QR is shown
  const checkPaymentStatus = useCallback(async () => {
    if (depositQrStep !== 'qr' || !depositPayment) return;
    try {
      const targetUrl = pendingDeposit?._id
        ? `${apiBase}/payments/booking/${pendingDeposit._id}`
        : (depositPayment._id || depositPayment.id)
          ? `${apiBase}/payments/${depositPayment._id || depositPayment.id}`
          : null;
      if (!targetUrl) return;

      const res = await fetch(targetUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const p = data?.data || data;
      if (p?.status === 'paid') {
        if (depositDraft && !creatingBooking) {
          await createBookingAfterPayment(true, depositDraft, true);
        } else {
          setLastBooking(prev => prev ? { ...prev, depositPaid: true, paymentMode } : prev);
        }
        setPendingDeposit(null);
        setDepositPayment(null);
        setDepositDraft(null);
        setDepositQrStep('select');
        setShowSuccessModal(true);
      }
      setDepositPollCount(c => c + 1);
    } catch (e) { /* ignore errors */ }
  }, [depositQrStep, depositPayment, pendingDeposit, depositDraft, creatingBooking, apiBase, token, paymentMode]);

  useSSE(token, 'payment_new', checkPaymentStatus);

  // Fallback check once every 10s just in case SSE drops
  useEffect(() => {
    if (depositQrStep !== 'qr' || !depositPayment) return;
    const interval = setInterval(checkPaymentStatus, 10000);
    return () => clearInterval(interval);
  }, [depositQrStep, depositPayment, checkPaymentStatus]);

  async function payWithVnpay() {
    if (!pendingDeposit) return;
    if (!authHeader(token)) { storePendingAndAuth(); return; }
    setVnpayLoading(true);
    setError('');
    try {
      if (pendingDeposit.isDraft) {
        // Draft: lưu draft, tạo provisional VNPay — chưa tạo booking
        const isRec = pendingDeposit.tab === 'recurring';
        const vId = pendingDeposit._vehicleId || selectedVehicle || (allVehicles[0]?._id || allVehicles[0]?.id || '');
        const pb = pendingDeposit._pendingData;
        const fullPrice = pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0;
        const depositAmt = pendingDeposit.depositAmount || 0;
        const actualAmount = paymentMode === 'full' ? fullPrice : depositAmt;

        const draft = {
          branchId: pb?.branchId || selectedBranch?._id || selectedBranch?.id,
          packageId: pb?.packageId || pkg?._id || pkg?.id,
          vehicleId: vId,
          bookingDate: pb?.selectedDate || (isRec ? undefined : currentDate?.iso),
          startTime: pb?.selectedTime || selectedTime,
          weekdays: pb?.selectedDays || selectedDays,
          weeks: pb?.weeks || weeks,
          voucherCode: pb?.appliedVoucher?.code || appliedVoucher?.code,
          discountAmount: discount,
          selectedSubServices: pb?.selectedSubServices || currentSubServices,
          isRecurring: isRec,
          finalPrice: fullPrice,
          depositAmount: depositAmt,
          paymentMode,
          branchName: selectedBranch?.name || '',
          pkgName: pkg?.name || '',
          pkgPrice: pkg?.price || 0,
          subServicesPrices: pkg?.subServices?.reduce((acc, s) => { acc[s.name] = s.price || 0; return acc; }, {}),
          vehicleInfo: vehicle ? { licensePlate: vehicle.licensePlate || vehicle.name, name: vehicle.name } : null,
        };
        sessionStorage.setItem('aw_bookingDraft', JSON.stringify(draft));

        // Gọi provisional VNPay
        const res = await fetch(`${apiBase}/bookings/vnpay-provisional`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader(token) },
          body: JSON.stringify({ amount: actualAmount, origin: window.location.origin }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Tạo thanh toán VNPay thất bại');
        const paymentUrl = data?.data?.paymentUrl;
        if (!paymentUrl) throw new Error('Không nhận được URL thanh toán');

        // Save provisional payment data for later linking
        const provisionalPayment = data?.data?.payment;
        if (provisionalPayment?.transactionId) {
          sessionStorage.setItem('aw_provisionalPayment', JSON.stringify({ transactionId: provisionalPayment.transactionId }));
        }

        // Lưu lastBooking preview để khôi phục sau VNPay return
        const lastBk = {
          branch: selectedBranch || { name: '' },
          vehicle: vehicle || { licensePlate: '' },
          pkg: pkg || { name: '' },
          currentDate,
          selectedTime,
          total: fullPrice,
          discount: discount || draft.discountAmount || 0,
          voucherCode: appliedVoucher?.code || draft.voucherCode || '',
          points: 0, isPayingWithPack: false,
          bookingCode: '',
          subServices: (currentSubServices || []).map(n => {
            const s = pkg?.subServices?.find(x => x.name === n);
            return s ? { name: s.name, price: s.price } : { name: n, price: 0 };
          }),
          depositAmount: depositAmt,
          depositPaid: true,
          paymentMode,
        };
        sessionStorage.setItem('aw_lastBooking', JSON.stringify(lastBk));

        window.location.href = paymentUrl;
      } else {
        // Booking đã tồn tại — tạo VNPay payment bình thường
        const actualAmount = paymentMode === 'full' ? (pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0) : (pendingDeposit.depositAmount || 0);
        let bkId = pendingDeposit._id || pendingDeposit.id;
        if (!bkId && pendingDeposit.bookings && pendingDeposit.bookings.length > 0) {
          bkId = pendingDeposit.bookings[0]._id || pendingDeposit.bookings[0].id;
        }
        const res = await fetch(`${apiBase}/payments/vnpay-create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader(token) },
          body: JSON.stringify({ bookingId: bkId, paymentType: paymentMode, amount: actualAmount, origin: window.location.origin }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Tạo thanh toán VNPay thất bại');
        const paymentUrl = data?.data?.paymentUrl;
        if (!paymentUrl) throw new Error('Không nhận được URL thanh toán');

        const fullPrice = pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0;
        const depositAmt = pendingDeposit.depositAmount || 0;
        const lastBk = {
          branch: selectedBranch || { name: '' },
          vehicle: vehicle || { licensePlate: '' },
          pkg: pkg || { name: '' },
          currentDate,
          selectedTime,
          total: fullPrice,
          discount: discount || pendingDeposit?.discount || 0,
          voucherCode: appliedVoucher?.code || pendingDeposit?.voucherCode || '',
          points: 0, isPayingWithPack: false,
          bookingCode: '',
          subServices: (currentSubServices || []).map(n => {
            const s = pkg?.subServices?.find(x => x.name === n);
            return s ? { name: s.name, price: s.price } : { name: n, price: 0 };
          }),
          depositAmount: depositAmt,
          depositPaid: true,
          paymentMode,
        };
        sessionStorage.setItem('aw_lastBooking', JSON.stringify(lastBk));
        window.location.href = paymentUrl;
      }
    } catch (e) {
      setError(e.message || 'Thanh toán VNPay thất bại');
      setVnpayLoading(false);
    }
  }

  async function payWithWallet() {
    if (!pendingDeposit) return;
    setDepositLoading(true);
    setError('');
    try {
      const actualAmount = paymentMode === 'full' ? (pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0) : (pendingDeposit.depositAmount || 0);
      if (!user || (user.walletBalance || 0) < actualAmount) {
        throw new Error('Số dư ví không đủ để thanh toán');
      }

      if (pendingDeposit.isDraft) {
        const bk = await executeCreateBooking({ tab: pendingDeposit.tab || 'regular' });
        let bkId = bk._id || bk.id;
        if (!bkId && bk.created && bk.created.length > 0) {
          bkId = bk.created[0]._id || bk.created[0].id;
        }

        const payRes = await fetch(`${apiBase}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingId: bkId, method: 'wallet', paymentType: paymentMode, amount: actualAmount }),
        });
        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.message || 'Thanh toán ví thất bại');

        setLastBooking({
          _id: bkId,
          branch: selectedBranch, vehicle, pkg, currentDate, selectedTime,
          total: pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0,
          discount: discount || pendingDeposit?.discount || 0,
          voucherCode: appliedVoucher?.code || pendingDeposit?.voucherCode || '',
          points: 0, isPayingWithPack: false,
          bookingCode: (pendingDeposit.tab === 'recurring' ? bk?.recurringGroupId : (bk?.bookingCode || bk?.code)) || '',
          subServices: (currentSubServices || []).map(n => {
            const s = pkg?.subServices?.find(x => x.name === n);
            return s ? { name: s.name, price: s.price } : { name: n, price: 0 };
          }),
          recurringCount: (pendingDeposit.tab === 'recurring') ? (bk?.totalCreated || 0) : undefined,
          recurringBookings: (pendingDeposit.tab === 'recurring') ? (bk?.created || []).map(c => ({ date: c.bookingDate, time: c.startTime })) : undefined,
          depositAmount: pendingDeposit.depositAmount || 0,
          depositPaid: true,
          paymentMode,
        });
      } else {
        let bkId = pendingDeposit._id || pendingDeposit.id;
        if (!bkId && pendingDeposit.bookings && pendingDeposit.bookings.length > 0) {
          bkId = pendingDeposit.bookings[0]._id || pendingDeposit.bookings[0].id;
        }
        const payRes = await fetch(`${apiBase}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingId: bkId, method: 'wallet', paymentType: paymentMode, amount: actualAmount }),
        });
        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.message || 'Thanh toán ví thất bại');

        setLastBooking(prev => prev ? { ...prev, depositPaid: true, paymentMode } : prev);
      }

      setPendingDeposit(null);
      setDepositPayment(null);
      setDepositDraft(null);
      setDepositQrStep('select');
      setShowSuccessModal(true);
      if (onUserUpdate) onUserUpdate({ walletBalance: (user?.walletBalance || 0) - actualAmount });
    } catch (err) {
      setError(err.message || 'Thanh toán ví thất bại');
    } finally {
      setDepositLoading(false);
    }
  }

  // Xử lý VNPay return callback (BE đã tự confirm, FE chỉ đọc kết quả)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vnpayResult = params.get('vnpay_result');
    if (vnpayResult) {
      // Nếu là slot pack payment, chuyển qua SlotPackFlow xử lý
      if (sessionStorage.getItem('aw_lastSlotPack')) {
        sessionStorage.setItem('aw_slotPackVnpayResult', vnpayResult);
        setTab('slot_pack');
        const url = new URL(window.location);
        url.searchParams.delete('vnpay_result');
        window.history.replaceState({}, '', url);
        return;
      }

      try {
        const parsed = JSON.parse(decodeURIComponent(vnpayResult));
        const success = parsed?.success !== false && parsed?.data?.responseCode === '00';
        if (success) {
          if (!authHeader(token)) {
            showToast('Bạn cần đăng nhập lại để hoàn tất đặt lịch', 'error');
            return;
          }
          // Tạo booking từ draft data đã lưu (provisional VNPay)
          createBookingAfterPayment();
        } else {
          const failReason = parsed?.message || (parsed?.data?.responseCode === '24' ? 'Giao dịch bị hủy' : parsed?.data?.responseCode === '09' ? 'Thẻ/Tài khoản không đủ số dư' : 'Thanh toán VNPay thất bại');
          showToast('❌ ' + failReason, 'error');
        }
      } catch (e) {
        showToast('❌ Lỗi xử lý kết quả thanh toán VNPay', 'error');
      }
      setPendingDeposit(null);
      setDepositPayment(null);
      setDepositQrStep('select');
      // Clean URL params
      const url = new URL(window.location);
      url.searchParams.delete('vnpay_result');
      window.history.replaceState({}, '', url);
    }
  }, [token]);

  // Tạo booking sau khi VNPay/Bank payment thành công
  async function createBookingAfterPayment(isBank = false, pendingData = null, skipSuccessModal = false) {
    if (creatingBooking) return;
    setCreatingBooking(true);
    const draft = isBank ? pendingData : JSON.parse(sessionStorage.getItem('aw_bookingDraft') || '{}');
    if (!draft || !draft.branchId) { setError('Lỗi dữ liệu draft'); return; }

    setBookingLoading(true);
    try {
      const isRec = draft.isRecurring;
      const ep = isRec ? `${apiBase}/bookings/recurring` : `${apiBase}/bookings`;
      const bBody = isRec
        ? { branchId: draft.branchId, packageId: draft.packageId, vehicleId: draft.vehicleId, weekdays: draft.weekdays, startTime: draft.startTime, weeks: draft.weeks, voucherCode: draft.voucherCode || undefined, selectedSubServices: draft.selectedSubServices || [], note: '' }
        : { branchId: draft.branchId, packageId: draft.packageId, vehicleId: draft.vehicleId, bookingDate: draft.bookingDate, startTime: draft.startTime, voucherCode: draft.voucherCode || undefined, selectedSubServices: draft.selectedSubServices || [], note: '' };
      const ah = authHeader(token);
      const br = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: ah }, body: JSON.stringify(bBody) });
      const bd = await br.json();
      if (!br.ok) {
        const fieldErrors = bd?.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
        throw new Error(fieldErrors || bd.message || bd.error || 'Không thể tạo lịch hẹn');
      }
      const newBk = bd?.data || bd;
      const bkId = isRec ? (newBk.created?.[0]?._id || newBk.created?.[0]?.id) : (newBk._id || newBk.id);
      const newCode = isRec ? newBk.recurringGroupId : (newBk?.bookingCode || newBk?.code || '');

      // Link provisional payment (VNPay return) vào booking
      const provisionalData = JSON.parse(sessionStorage.getItem('aw_provisionalPayment') || '{}');
      const provisionalTxn = provisionalData?.transactionId;
      let paymentSuccess = false;

      if (provisionalTxn) {
        try {
          const linkRes = await fetch(`${apiBase}/payments/link-provisional`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: ah },
            body: JSON.stringify({ transactionId: provisionalTxn, bookingId: bkId, paymentType: draft.paymentMode }),
          });
          if (linkRes.ok) {
            paymentSuccess = true;
          }
        } catch (e) {
          console.warn('Link provisional payment failed, executing fallback:', e);
        }
      }

      if (!paymentSuccess) {
        // Fallback: create new payment + simulate (for bank flow, no provisional, or older backend deployment)
        const actualAmount = draft.paymentMode === 'full' ? draft.finalPrice : draft.depositAmount;
        const method = isBank ? 'bank' : 'vnpay';
        const payRes = await fetch(`${apiBase}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: ah },
          body: JSON.stringify({ bookingId: bkId, method, paymentType: draft.paymentMode, amount: actualAmount }),
        });
        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.message || 'Tạo thanh toán thất bại');
        const payment = payData?.data || payData;

        await fetch(`${apiBase}/payments/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: ah },
          body: JSON.stringify({
            transactionId: payment.transactionId,
            gatewayTransactionId: method === 'bank' ? `SIM${Date.now()}` : 'VNPAY',
            success: true,
          }),
        });
      }

      // Build lastBooking
      const subPrices = draft.subServicesPrices || {};
      setLastBooking({
        _id: newBk._id || newBk.id || newBk.bookingId,
        branch: { name: draft.branchName || selectedBranch?.name || '' },
        vehicle: draft.vehicleInfo || vehicle || { licensePlate: '' },
        pkg: { name: draft.pkgName || pkg?.name || '', price: draft.pkgPrice || 0 },
        currentDate: isRec ? null : {
          label: draft.bookingDate ? (() => {
            const parts = String(draft.bookingDate).split('T')[0].split('-');
            if (parts.length === 3) {
              const [y, m, d] = parts.map(Number);
              const dateObj = new Date(y, m - 1, d);
              const days = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
              return `${days[dateObj.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
            }
            return draft.bookingDate;
          })() : '',
          iso: draft.bookingDate,
        },
        selectedTime: draft.startTime,
        total: draft.finalPrice || 0,
        discount: draft.discountAmount || discount || 0,
        voucherCode: draft.voucherCode || appliedVoucher?.code,
        points: 0, isPayingWithPack: false,
        bookingCode: newCode,
        subServices: (draft.selectedSubServices || []).map(n => ({ name: n, price: subPrices[n] || 0 })),
        recurringCount: isRec ? (newBk.totalCreated || 1) : undefined,
        recurringBookings: isRec ? (newBk.created || []).map(c => ({ date: c.bookingDate, time: c.startTime })) : undefined,
        depositAmount: draft.depositAmount || 0,
        depositPaid: true,
        paymentMode: draft.paymentMode,
      });
      if (!skipSuccessModal) {
        setShowSuccessModal(true);
      }
    } catch (err) {
      showToast('❌ ' + (err.message || 'Không thể tạo lịch hẹn sau thanh toán'), 'error');
      setCreatingBooking(false);
    } finally {
      setBookingLoading(false);
      sessionStorage.removeItem('aw_bookingDraft');
      setCreatingBooking(false);
    }
  }

  // Simulate payment confirmation (for demo)
  async function simulatePaymentConfirm() {
    if (!depositPayment) return;
    setDepositLoading(true);
    try {
      if (depositDraft) {
        // Draft flow: tạo booking + payment + confirm
        await createBookingAfterPayment(true, depositDraft, true);
        setDepositQrStep('success');
        setTimeout(() => {
          setPendingDeposit(null);
          setDepositPayment(null);
          setDepositDraft(null);
          setDepositQrStep('select');
          setTimeout(() => setShowSuccessModal(true), 400);
        }, 1500);
      } else {
        // Booking đã tồn tại — chỉ simulate confirm payment
        const res = await fetch(`${apiBase}/payments/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            transactionId: depositPayment.transactionId,
            gatewayTransactionId: `SIM${Date.now()}`,
            success: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Lỗi xác nhận thanh toán');
        setLastBooking(prev => prev ? { ...prev, depositPaid: true, paymentMode } : prev);
        setDepositQrStep('success');
        setTimeout(() => {
          setPendingDeposit(null);
          setDepositPayment(null);
          setDepositQrStep('select');
          setTimeout(() => setShowSuccessModal(true), 400);
        }, 1500);
      }
    } catch (err) {
      setError(err.message || 'Lỗi xác nhận thanh toán');
    } finally {
      setDepositLoading(false);
    }
  }

  // Sub-services
  const pkg = selectedPackage;
  const defaultIncluded = useMemo(() => {
    return (pkg?.subServices || []).filter(s => s.isOptional === false || (s.isOptional === undefined && (s.price === 0 || !s.price))).map(s => s.name);
  }, [pkg]);

  const currentSubServices = useMemo(() => {
    const pId = pkg?._id || pkg?.id;
    if (!pId) return defaultIncluded;
    const selectedForPkg = selectedSubServices[pId];
    if (selectedForPkg !== undefined) return selectedForPkg;
    return defaultIncluded;
  }, [pkg, selectedSubServices, defaultIncluded]);
  let extraDuration = 0, extraPrice = 0;
  if (pkg && pkg.subServices) {
    for (const sub of pkg.subServices) {
      if (currentSubServices.includes(sub.name)) {
        extraDuration += sub.duration || 0;
        extraPrice += sub.price || 0;
      }
    }
  }
  const basePrice = pkg ? pkg.price : 0;
  const totalBase = basePrice + extraPrice;

  const validPacks = useMemo(() => {
    if (!isLoggedIn) return [];
    return mySlotPacks.filter(p => {
      if (p.status !== 'active' || p.remainingSlots <= 0) return false;
      const pPkgId = p.packageId?._id || p.packageId?.id || p.packageId;
      const selPkgId = pkg?._id || pkg?.id;
      if (pPkgId !== selPkgId) return false;
      const branchId = selectedBranch?._id || selectedBranch?.id;
      const pBranchId = p.branchId?._id || p.branchId?.id || p.branchId;
      if (pBranchId && pBranchId !== branchId) return false;
      return true;
    });
  }, [mySlotPacks, pkg, selectedBranch, isLoggedIn]);

  useEffect(() => {
    if (selectedSlotPack && !validPacks.find(p => (p._id || p.id) === selectedSlotPack)) {
      setSelectedSlotPack(null);
    }
  }, [validPacks, selectedSlotPack]);

  const pointMultiplier = userTierObj?.multiplier ?? 1.0;
  const baseEarningRate = (loyaltyConfig?.baseEarningRate ?? 5) / 100;

  const discount = appliedVoucher
    ? appliedVoucher.savings || (appliedVoucher.type === 'percentage' ? Math.floor(totalBase * appliedVoucher.value / 100) : appliedVoucher.value)
    : 0;
  const isPayingWithPack = !!selectedSlotPack;
  const effectiveBase = isPayingWithPack ? extraPrice : totalBase;
  const total = Math.max(0, effectiveBase - discount);
  const singleSessionPrice = Math.max(0, totalBase - discount);
  const pointsBase = isPayingWithPack ? totalBase : total;
  const tierLabel = userTierObj?.name || (user?.tier ? user.tier.charAt(0).toUpperCase() + user.tier.slice(1) : 'Thành viên');
  const pointsPct = Number((baseEarningRate * 100).toFixed(2));
  const points = Math.floor(pointsBase * baseEarningRate * pointMultiplier);

  const vehicle = allVehicles.find(v => (v._id || v.id) === selectedVehicle) || null;

  const previewDates = useMemo(() => {
    if (tab !== 'recurring' || selectedDays.length === 0) return [];
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const c = new Date(today);
        c.setDate(today.getDate() + w * 7 + d);
        if (selectedDays.includes(c.getDay()) && c >= today) dates.push(c);
      }
    }
    return dates;
  }, [selectedDays, weeks, tab]);

  const actualRecurringSessions = useMemo(() => {
    if (tab !== 'recurring') return 0;
    if (conflictCheck.status === 'done' && conflictCheck.results.length > 0) {
      return conflictCheck.results.filter(r => !r.conflict).length;
    }
    return previewDates.length;
  }, [tab, conflictCheck, previewDates]);

  const recurringScheduleDates = useMemo(() => {
    if (tab !== 'recurring') return [];
    if (conflictCheck.status === 'done' && conflictCheck.results.length > 0) {
      return conflictCheck.results
        .filter(r => !r.conflict && r.date)
        .map(r => new Date(r.date.includes('T') ? r.date : r.date + 'T00:00:00'));
    }
    return previewDates;
  }, [tab, conflictCheck, previewDates]);

  const toggleDay = (value) => {
    setSelectedDays(prev => prev.includes(value) ? prev.filter(d => d !== value) : [...prev, value]);
    setConflictCheck({ status: 'idle', results: [], totalConflicts: 0 });
  };

  const selectWeek = (w) => {
    setWeeks(w);
    setWeeksInput(String(w));
    setWeeksError('');
    setConflictCheck({ status: 'idle', results: [], totalConflicts: 0 });
  };

  const handleWeeksInput = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setWeeksInput(raw);
    const n = raw === '' ? 0 : parseInt(raw, 10);
    if (raw === '' || !Number.isInteger(n) || n < 2) {
      setWeeksError('Số tuần phải là số nguyên dương lớn hơn 1');
      setWeeks(n);
      return;
    }
    setWeeksError('');
    setWeeks(n);
    setConflictCheck({ status: 'idle', results: [], totalConflicts: 0 });
  };


  const totalSteps = tab === 'slot_pack' ? 4 : 5;

  const canNextStep = () => {
    if (tab === 'slot_pack') return spCanAdvance;
    if (step === 1) return selectedBranch;
    if (step === 2) return selectedPackage;
    if (step === 3) {
      if (isLoggedIn) return selectedVehicle || userVehicles.length > 0;
      return guestVehicle.licensePlate.trim().length > 0 && guestVehicle.brand.trim().length > 0;
    }
    if (step === 4) {
      if (tab === 'regular') return selectedDate && selectedTime;
      const basicOk = selectedDays.length > 0 && selectedTime && Number.isInteger(weeks) && weeks >= 2;
      if (!basicOk) return false;
      if (conflictCheck.status === 'done') return actualRecurringSessions > 0;
      return true;
    }
    return true;
  };

  function storePendingAndAuth() {
    const data = {
      tab,
      branchId: selectedBranch?._id || selectedBranch?.id,
      packageId: pkg?._id || pkg?.id,
      selectedSubServices: currentSubServices,
      selectedDate: tab === 'regular' ? currentDate.iso : undefined,
      selectedTime,
      selectedDays: tab === 'recurring' ? selectedDays : undefined,
      weeks: tab === 'recurring' ? weeks : undefined,
      appliedVoucher,
      guestVehicle: { ...guestVehicle },
    };
    onSetPendingBooking(data);
    onOpenAuth();
  }

  async function confirmBooking() {
    if (!isLoggedIn) { storePendingAndAuth(); return; }
    if (pendingBooking) { await processPendingBooking(); return; }
    if (!selectedTime) { setError('Vui lòng chọn khung giờ.'); return; }
    if (!vehicle) { setError('Vui lòng chọn xe.'); return; }
    setBookingLoading(true); setMessage(''); setError(''); setBookingCode('');

    try {
      const branchId = selectedBranch._id || selectedBranch.id;
      const pkgId = pkg._id || pkg.id;
      const calculatedDeposit = Math.round((total * (configs?.DEPOSIT_RATE ?? 0) / 100) / 1000) * 1000;
      if (total > 0) {
        setPendingDeposit({
          isDraft: true,
          tab: 'regular',
          originalPrice: totalBase,
          discount: discount || 0,
          voucherCode: appliedVoucher?.code || '',
          finalPrice: total,
          totalAmount: total,
          depositAmount: calculatedDeposit,
          depositPaid: false,
        });
        setDepositQrStep('select');
        setDepositPayment(null);
        setPaymentMode(calculatedDeposit > 0 ? 'deposit' : 'full');
        setBookingLoading(false);
        return;
      }
      
      const booking = await executeCreateBooking({ tab: 'regular' });
      setBookingCode(booking?.bookingCode || booking?.code || '');
      setLastBooking({
        _id: booking?._id || booking?.id,
        branch: selectedBranch, vehicle, pkg, currentDate, selectedTime, total, discount, points, isPayingWithPack,
        bookingCode: booking?.bookingCode || booking?.code || '',
        voucherCode: appliedVoucher?.code,
        subServices: (currentSubServices || []).map(n => {
          const s = pkg?.subServices?.find(x => x.name === n);
          return s ? { name: s.name, price: s.price } : { name: n, price: 0 };
        }),
        depositAmount: booking?.depositAmount || 0,
        depositPaid: booking?.depositPaid || false,
      });
      setShowSuccessModal(true);
    } catch (err) {
      setError(err.message || 'Không thể tạo lịch hẹn');
    } finally {
      setBookingLoading(false);
    }
  }

  async function confirmRecurringBooking() {
    if (!isLoggedIn) { storePendingAndAuth(); return; }
    if (pendingBooking) { await processPendingBooking(); return; }
    if (!selectedBranch || !selectedPackage || selectedDays.length === 0 || !selectedTime) {
      setError('Vui lòng điền đầy đủ thông tin.');
      return;
    }
    if (!Number.isInteger(weeks) || weeks < 2) {
      setError('Số tuần lặp lại phải là số nguyên dương lớn hơn 1.');
      return;
    }
    if (isLoggedIn && !selectedVehicle) { setError('Vui lòng chọn xe.'); return; }
    setBookingLoading(true); setError(''); setResult(null); setShowSuccessModal(false);

    try {
      const branchId = selectedBranch._id || selectedBranch.id;
      const pkgId = pkg._id || pkg.id;
      // Đảm bảo đã có thông tin check trùng lịch
      let totalValid = 0;
      if (conflictCheck.status === 'done' && conflictCheck.results.length > 0) {
        totalValid = conflictCheck.results.filter(r => !r.conflict).length;
      } else {
        const checkBody = {
          branchId, packageId: pkgId, vehicleId: vehicle?._id || vehicle?.id || '',
          weekdays: selectedDays, startTime: selectedTime, weeks,
          selectedSubServices: currentSubServices,
        };
        const checkRes = await fetch(`${apiBase}/bookings/recurring/check-conflicts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(checkBody),
        });
        const checkData = await checkRes.json();
        if (!checkRes.ok) throw new Error(checkData.message || 'Lỗi kiểm tra lịch');
        const results = checkData.data || checkData || [];
        totalValid = Array.isArray(results) ? results.filter(r => !r.conflict).length : 0;
      }

      if (totalValid <= 0) {
        throw new Error('Rất tiếc, tất cả các buổi dự kiến đều bị trùng lịch hoặc đã qua thời gian. Vui lòng chọn ngày/khung giờ khác nhé!');
      }

      const singlePrice = Math.max(0, totalBase - discount);
      const totalPrice = singlePrice * totalValid;
      const totalDeposit = Math.round((totalPrice * (configs?.DEPOSIT_RATE ?? 0) / 100) / 1000) * 1000;

      const pb = {
        branchId,
        packageId: pkgId,
        vehicleId: vehicle?._id || vehicle?.id || '',
        weekdays: selectedDays,
        startTime: selectedTime,
        weeks,
        voucherCode: appliedVoucher?.code || undefined,
        selectedSubServices: currentSubServices,
        note: '',
      };

      if (totalPrice > 0) {
        setPendingDeposit({
          isDraft: true,
          tab: 'recurring',
          originalPrice: totalBase * totalValid,
          discount: (discount || 0) * totalValid,
          voucherCode: appliedVoucher?.code || '',
          finalPrice: totalPrice,
          totalAmount: totalPrice,
          depositAmount: totalDeposit,
          depositPaid: false,
          _pendingData: pb,
        });
        setDepositQrStep('select');
      } else {
        const res = await fetch(`${apiBase}/bookings/recurring`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(pb),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Lỗi tạo lịch định kỳ');
        const resultData = data.data || data;
        setResult(resultData);
        if (resultData.totalCreated > 0) {
          setLastBooking({
            branch: selectedBranch, vehicle, pkg, currentDate: null, selectedTime,
            total: totalPrice,
            discount: discount * resultData.totalCreated,
            points: points * resultData.totalCreated,
            isPayingWithPack: false,
            bookingCode: resultData.recurringGroupId || '',
            subServices: (currentSubServices || []).map(n => {
              const s = pkg?.subServices?.find(x => x.name === n);
              return s ? { name: s.name, price: s.price } : { name: n, price: 0 };
            }),
            recurringCount: resultData.totalCreated,
            recurringBookings: (resultData.created || []).map(c => ({ date: c.bookingDate, time: c.startTime })),
            depositAmount: 0,
            depositPaid: true,
            totalRemaining: totalPrice,
          });
          setBookingCode(resultData.recurringGroupId || '');
          setShowSuccessModal(true);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBookingLoading(false);
    }
  }

  const checkRecurringConflicts = async () => {
    if (!token || !selectedBranch || !pkg || !vehicle?._id) return;
    const reqId = ++conflictReqIdRef.current;
    setConflictCheck({ status: 'checking', results: [], totalConflicts: 0 });
    setError('');
    try {
      const body = {
        branchId: selectedBranch._id || selectedBranch.id,
        packageId: pkg._id || pkg.id,
        vehicleId: vehicle._id || vehicle.id,
        weekdays: selectedDays,
        startTime: selectedTime,
        weeks,
        selectedSubServices: currentSubServices,
      };
      const res = await fetch(`${apiBase}/bookings/recurring/check-conflicts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (reqId !== conflictReqIdRef.current) return;
      if (!res.ok) throw new Error(data.message || 'Lỗi kiểm tra lịch');
      const results = data.data || data || [];
      const totalConflicts = Array.isArray(results) ? results.filter(r => r.conflict).length : 0;
      setConflictCheck({ status: 'done', results: Array.isArray(results) ? results : [], totalConflicts });
    } catch (err) {
      if (reqId !== conflictReqIdRef.current) return;
      setError(err.message);
      setConflictCheck({ status: 'idle', results: [], totalConflicts: 0 });
    }
  };

  // ─── Auto-check lịch trống khi đổi số tuần/ngày/giờ (debounce) ───
  const autoCheckTimer = useRef(null);
  const conflictReqIdRef = useRef(0);
  const checkRecurringRef = useRef(null);
  checkRecurringRef.current = checkRecurringConflicts;

  useEffect(() => {
    if (tab !== 'recurring') return;
    const canCheck = Boolean(token && selectedBranch && pkg && vehicle?._id)
      && selectedDays.length > 0
      && selectedTime
      && Number.isInteger(weeks) && weeks >= 2;
    if (autoCheckTimer.current) clearTimeout(autoCheckTimer.current);
    if (!canCheck) {
      if (conflictCheck.status === 'done') setConflictCheck({ status: 'idle', results: [], totalConflicts: 0 });
      return;
    }
    autoCheckTimer.current = setTimeout(() => {
      checkRecurringRef.current();
    }, 600);
    return () => {
      if (autoCheckTimer.current) clearTimeout(autoCheckTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, weeks, selectedDays, selectedTime, selectedBranch, pkg, vehicle, token, currentSubServices]);

  const reset = () => {
    sessionStorage.removeItem('aw_booking_state');
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setSelectedVehicle('');
    setSelectedPackage(null);
    setSelectedSubServices({});
    setSelectedDate(null);
    setSelectedTime('');
    setSelectedDays([]);
    setWeeks(2);
    setAppliedVoucher(null);
    setSelectedSlotPack(null);
    setMessage('');
    setError('');
    setBookingCode('');
    setResult(null);
    setConflictCheck({ status: 'idle', results: [], totalConflicts: 0 });
    setGuestVehicle({ licensePlate: '', brand: '', model: '', type: 'sedan' });
    setVehicleError('');
    setSpCanAdvance(false);
  };

  const getVehicleIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('motor') || t.includes('máy')) {
      return <Bike className="w-5 h-5" />;
    }
    if (t.includes('suv') || t.includes('truck') || t.includes('pickup') || t.includes('van')) {
      return <Truck className="w-5 h-5" />;
    }
    return <Car className="w-5 h-5" />;
  };

  const groupedSlots = useMemo(() => {
    if (availableSlots.length === 0) return { morning: [], afternoon: [] };
    
    const morning = [];
    const afternoon = [];
    
    availableSlots.forEach(slot => {
      const hour = parseInt((slot.startTime || '').split(':')[0], 10);
      if (hour < 12) {
        morning.push(slot);
      } else {
        afternoon.push(slot);
      }
    });
    
    return { morning, afternoon };
  }, [availableSlots]);

  const renderStepIndicator = (labels) => (
    <div className="relative flex items-center justify-between w-full max-w-2xl mx-auto mb-6 px-4">
      {/* Background connecting line */}
      <div className="absolute left-8 right-8 top-5 h-[2px] bg-slate-200 z-0" />
      {/* Active progress fill */}
      <div 
        className="absolute left-8 top-5 h-[2px] bg-gradient-to-r from-emerald-400 to-emerald-600 z-0 transition-all duration-500 ease-in-out" 
        style={{ width: `${((step - 1) / (labels.length - 1)) * 100}%` }}
      />

      {labels.map((lbl, i) => {
        const s = i + 1;
        const isCompleted = step > s;
        const isActive = step === s;
        return (
          <div key={lbl} className="relative z-10 flex flex-col items-center flex-1">
            <button
              type="button"
              disabled={s > step && !canNextStep()}
              onClick={() => { if (s < step || canNextStep()) setStep(s); }}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                isActive 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 scale-110 ring-4 ring-emerald-100'
                  : isCompleted 
                    ? 'bg-emerald-100 text-emerald-600 border border-emerald-200 hover:bg-emerald-200'
                    : 'bg-white text-slate-400 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {isCompleted ? <Check className="w-5 h-5" /> : s}
            </button>
            <span className={`mt-3 text-[11px] md:text-xs font-semibold tracking-wide text-center transition-all duration-300 hidden sm:block ${
              isActive ? 'text-emerald-600 font-bold' : isCompleted ? 'text-slate-700' : 'text-slate-400'
            }`}>
              {lbl}
            </span>
          </div>
        );
      })}
    </div>
  );

  const dayLabel = (value) => WEEKDAY_OPTIONS.find(o => o.value === value)?.label || String(value);

  return (
    <section id="booking" className="relative bg-white min-h-[calc(100dvh-64px)] pt-16">

      <div className="max-w-[1000px] mx-auto px-6 md:px-12 py-6 pb-40">

        <div className="bg-white/80 backdrop-blur-xl border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.02)] rounded-3xl p-6 md:p-8">

          {/* ── Tabs ── */}
          <div className="flex items-center gap-1.5 bg-slate-100/80 backdrop-blur-sm rounded-2xl p-1.5 border border-slate-200/50 w-fit mx-auto mb-6 shadow-inner">
            <button onClick={() => { setTab('regular'); reset(); }}
              className={`relative px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                tab === 'regular' 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/10 scale-[1.02]' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}>
              Đặt lịch thường
            </button>
            <button onClick={() => { setTab('recurring'); reset(); }}
              className={`relative px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                tab === 'recurring' 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/10 scale-[1.02]' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}>
              Đặt lịch định kì
            </button>
            <button onClick={() => { setTab('slot_pack'); reset(); }}
              className={`relative px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                tab === 'slot_pack' 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/10 scale-[1.02]' 
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}>
              Gói lượt
            </button>
          </div>

          {/* ── Slot Pack Tab ── */}
          {tab === 'slot_pack' && (
            isLoggedIn ? (
              <>
                {renderStepIndicator(['Chi nhánh', 'Xe & gói', 'Số lần', 'Thanh toán'])}
                <SlotPackFlow step={step} setStep={setStep} user={user} vehicles={userVehicles} apiBase={apiBase} token={token} onCanAdvanceChange={setSpCanAdvance} onGoToHistory={onGoToHistory} />
              </>
            ) : (
              <div className="text-center py-16 space-y-4">
                <div className="text-5xl mb-2">🎫</div>
                <p className="text-slate-600 font-medium">Đăng nhập để mua và quản lý gói lượt rửa xe</p>
                <button onClick={onOpenAuth}
                  className="inline-block px-8 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500 transition-colors">
                  Đăng nhập ngay
                </button>
              </div>
            )
          )}

          {/* ── Regular + Recurring Step Flow ── */}
          {tab !== 'slot_pack' && (
            <>
              {renderStepIndicator(tab === 'recurring'
                ? ['Chi nhánh', 'Gói DV', 'Xe', 'Lịch định kỳ', 'Xác nhận']
                : ['Chi nhánh', 'Gói DV', 'Xe', 'Thời gian', 'Xác nhận']
              )}

              {/* STEP 1: Chi nhánh */}
              {step === 1 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-lg font-bold text-slate-800">Chọn chi nhánh gần bạn</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {branches.length === 0 ? (
                      <div className="col-span-2 text-center text-slate-400 py-12 flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-8 h-8 animate-spin text-slate-300" />
                        <span>Đang tải danh sách chi nhánh...</span>
                      </div>
                    ) : branches.map((b) => {
                      const isSelected = (selectedBranch?._id || selectedBranch?.id) === (b._id || b.id);
                      return (
                        <button 
                          key={b._id || b.id} 
                          type="button"
                          onClick={() => setSelectedBranch(b)}
                          className={`group text-left p-6 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/20 shadow-md ring-4 ring-emerald-500/5'
                              : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-md'
                          }`}
                        >
                          <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full opacity-10 blur-xl transition-all duration-300 ${
                            isSelected ? 'bg-emerald-500 scale-125' : 'bg-slate-300 group-hover:bg-emerald-300'
                          }`} />

                          <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-xl transition-all duration-300 ${
                              isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-500'
                            }`}>
                              <MapPin className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <h4 className="font-bold text-slate-800 text-base truncate group-hover:text-slate-900">{b.name}</h4>
                                {isSelected && (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                )}
                              </div>
                              <p className="text-sm text-slate-500 mt-1 line-clamp-2 leading-relaxed">{b.address}</p>
                              
                              <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-slate-50">
                                {b.openingTime && (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                                    <Clock className="w-3.5 h-3.5" />
                                    {b.openingTime} – {b.closingTime}
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">
                                  🟢 Đang hoạt động
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* STEP 2: Gói dịch vụ */}
              {step === 2 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-lg font-bold text-slate-800">
                      Chọn gói dịch vụ{isLoggedIn && selectedBranch ? ` tại ${selectedBranch.name}` : ''}
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {packages.length === 0 ? (
                      <div className="col-span-2 text-center text-slate-400 py-12 flex flex-col items-center justify-center gap-3">
                        <Info className="w-8 h-8 text-slate-300" />
                        <span>Chi nhánh này chưa có gói dịch vụ nào.</span>
                      </div>
                    ) : packages.map((p, index) => {
                      const pId = p._id || p.id;
                      const isActive = pId === (selectedPackage?._id || selectedPackage?.id);
                      const isPopular = p.price >= 150000 || index === 1;

                      return (
                        <div 
                          key={pId}
                          className={`group rounded-2xl border-2 transition-all duration-300 relative overflow-hidden flex flex-col ${
                            isActive 
                              ? 'border-emerald-500 bg-emerald-50/10 shadow-md ring-4 ring-emerald-500/5' 
                              : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-md'
                          }`}
                        >
                          {isPopular && (
                            <div className="absolute right-0 top-0 bg-gradient-to-l from-emerald-600 to-teal-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl tracking-wider uppercase shadow-sm">
                              Khuyên Dùng
                            </div>
                          )}

                          <button 
                            type="button"
                            onClick={() => setSelectedPackage(p)} 
                            className="w-full text-left p-6 flex-1 flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-start justify-between pr-16 mb-2">
                                <span className="font-bold text-slate-800 text-lg group-hover:text-emerald-700 transition-colors">{p.name}</span>
                              </div>
                              <p className="text-xs text-slate-400 mb-4 line-clamp-2 leading-relaxed">{p.description}</p>
                            </div>
                            
                            <div className="flex items-baseline justify-between mt-auto pt-4 border-t border-slate-50">
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-semibold bg-slate-50 px-2 py-1 rounded-lg">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {p.duration} phút
                              </span>
                              <span className="text-xl font-extrabold text-emerald-600">{formatCurrency(p.price)}</span>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Sub-services below packages */}
                  {selectedPackage && selectedPackage.subServices && selectedPackage.subServices.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-8 p-6 rounded-2xl bg-slate-100/50 border border-slate-200/50"
                    >
                      {/* Included services */}
                      {selectedPackage.subServices.filter(sub => sub.isOptional === false || (sub.isOptional === undefined && (sub.price === 0 || !sub.price))).length > 0 && (
                        <div className="mb-6">
                          <div className="flex items-center gap-2 mb-4">
                            <Check className="w-4 h-4 text-emerald-600" />
                            <h4 className="text-sm font-bold text-slate-700">Dịch vụ đã bao gồm</h4>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedPackage.subServices.filter(sub => sub.isOptional === false || (sub.isOptional === undefined && (sub.price === 0 || !sub.price))).map(sub => {
                              const pId = selectedPackage._id || selectedPackage.id;
                              const checked = currentSubServices.includes(sub.name);
                              return (
                                <button
                                  type="button"
                                  key={sub.name}
                                  disabled={tab === 'recurring'}
                                  onClick={() => {
                                    setSelectedSubServices(prev => {
                                      const current = prev[pId] !== undefined ? prev[pId] : (selectedPackage?.subServices || []).filter(s => s.isOptional === false || (s.isOptional === undefined && (s.price === 0 || !s.price))).map(s => s.name);
                                      return { 
                                        ...prev, 
                                        [pId]: checked ? current.filter(x => x !== sub.name) : [...current, sub.name] 
                                      };
                                    });
                                  }}
                                  className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-300 ${
                                    checked
                                      ? 'border-emerald-400 bg-emerald-50 text-emerald-800 font-medium'
                                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                                  } ${tab === 'recurring' ? 'cursor-default' : 'cursor-pointer'}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                                      checked 
                                        ? 'bg-emerald-600 border-emerald-600 text-white' 
                                        : 'border-slate-300 bg-white'
                                    }`}>
                                      {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                    </div>
                                    <span className="text-sm font-medium">{sub.name}</span>
                                  </div>
                                  <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">
                                    {sub.duration > 0 ? `${sub.duration} phút` : 'Bao gồm'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Optional extra services */}
                      {tab === 'regular' && selectedPackage.subServices.filter(sub => sub.isOptional === true).length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                            <h4 className="text-sm font-bold text-slate-700">Dịch vụ chọn thêm (Tùy chọn)</h4>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedPackage.subServices.filter(sub => sub.isOptional === true).map(sub => {
                              const pId = selectedPackage._id || selectedPackage.id;
                              const checked = currentSubServices.includes(sub.name);
                              return (
                                <button
                                  type="button"
                                  key={sub.name}
                                  onClick={() => {
                                    setSelectedSubServices(prev => {
                                      const current = prev[pId] !== undefined ? prev[pId] : (selectedPackage?.subServices || []).filter(s => s.isOptional === false || (s.isOptional === undefined && (s.price === 0 || !s.price))).map(s => s.name);
                                      return { 
                                        ...prev, 
                                        [pId]: checked ? current.filter(x => x !== sub.name) : [...current, sub.name] 
                                      };
                                    });
                                  }}
                                  className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-300 ${
                                    checked
                                      ? 'border-indigo-400 bg-indigo-50 text-indigo-800 font-medium'
                                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                                  } cursor-pointer`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                                      checked 
                                        ? 'bg-indigo-600 border-indigo-600 text-white' 
                                        : 'border-slate-300 bg-white'
                                    }`}>
                                      {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                    </div>
                                    <span className="text-sm font-medium">{sub.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {sub.duration > 0 && (
                                      <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                                        {sub.duration} phút
                                      </span>
                                    )}
                                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50/50 px-2.5 py-1 rounded-lg">
                                      {sub.price > 0 ? `+${formatCurrency(sub.price)}` : 'Miễn phí'}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* STEP 3: Xe */}
              {step === 3 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  {isLoggedIn ? (
                    <div className="logged-in-vehicles">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Car className="w-5 h-5 text-emerald-600" />
                          <h3 className="text-lg font-bold text-slate-800">Chọn xe của bạn</h3>
                        </div>
                      </div>
                      {hasNoVehicles ? (
                        <div className="max-w-xl mx-auto">
                          <p className="text-sm text-emerald-700 font-medium mb-4 text-center">Bạn chưa có xe nào. Vui lòng thêm xe mới:</p>
                          <form onSubmit={handleAddVehicle} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs text-slate-500 font-bold block mb-1.5 uppercase tracking-wide">Biển số xe *</label>
                                <input required placeholder="Ví dụ: 30A-12345" value={vehicleForm.licensePlate}
                                  onChange={e => handleVehicleFormChange('licensePlate', e.target.value)}
                                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all font-semibold uppercase tracking-wider font-mono" />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 font-bold block mb-1.5 uppercase tracking-wide">Hãng xe *</label>
                                <input required placeholder="Ví dụ: Toyota, Honda, Hyundai..." value={vehicleForm.brand}
                                  onChange={e => handleVehicleFormChange('brand', e.target.value)}
                                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs text-slate-500 font-bold block mb-1.5 uppercase tracking-wide">Dòng xe</label>
                                <input placeholder="Ví dụ: Camry, Tucson, SH..." value={vehicleForm.model}
                                  onChange={e => handleVehicleFormChange('model', e.target.value)}
                                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 font-bold block mb-1.5 uppercase tracking-wide">Màu xe *</label>
                                <input required placeholder="Ví dụ: Trắng, Đen, Xanh..." value={vehicleForm.color}
                                  onChange={e => handleVehicleFormChange('color', e.target.value)}
                                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs text-slate-500 font-bold block mb-1.5 uppercase tracking-wide">Loại xe *</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {VEHICLE_TYPES.map(t => {
                                    const isSelected = vehicleForm.vehicleType === t.value;
                                    return (
                                      <button type="button" key={t.value}
                                        onClick={() => handleVehicleFormChange('vehicleType', t.value)}
                                        className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center text-center gap-1.5 transition-all ${
                                          isSelected
                                            ? 'border-emerald-500 bg-emerald-50/20 text-emerald-800 font-bold'
                                            : 'border-slate-100 bg-slate-50/50 text-slate-500 hover:border-slate-200'
                                        }`}>
                                        <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400'}`}>
                                          {getVehicleIcon(t.value)}
                                        </div>
                                        <span className="text-[11px]">{t.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 font-bold block mb-1.5 uppercase tracking-wide">Năm SX</label>
                                <input type="number" placeholder="2020" value={vehicleForm.year}
                                  onChange={e => handleVehicleFormChange('year', e.target.value)}
                                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" />
                              </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                              <button type="submit" disabled={addingVehicle}
                                className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all">
                                {addingVehicle ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
                                {addingVehicle ? 'Đang thêm...' : 'Lưu xe'}
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {allVehicles.map(v => {
                          const vId = v._id || v.id;
                          const isSelected = selectedVehicle === vId;
                          return (
                            <button 
                              key={vId} 
                              type="button"
                              onClick={() => setSelectedVehicle(vId)}
                              className={`group text-left p-5 rounded-2xl border-2 transition-all duration-300 relative flex items-start gap-4 ${
                                isSelected 
                                  ? 'border-emerald-500 bg-emerald-50/20 shadow-md ring-4 ring-emerald-500/5' 
                                  : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-md'
                              }`}
                            >
                              <div className={`p-3 rounded-xl transition-all duration-300 ${
                                isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-500'
                              }`}>
                                {getVehicleIcon(v.vehicleType || v.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-800 text-sm truncate">
                                  {v.name || `${v.brand || ''} ${v.model || ''}`.trim() || 'Xe chưa đặt tên'}
                                </div>
                                <div className="text-xs text-slate-400 capitalize mt-0.5">{v.vehicleType || v.type || 'Sedan'}</div>
                                
                                <div className="inline-flex items-center mt-3 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 tracking-wider shadow-sm font-mono">
                                  {v.licensePlate || v.plate}
                                </div>
                              </div>
                              {isSelected && (
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Car className="w-5 h-5 text-emerald-600" />
                        <h3 className="text-lg font-bold text-slate-800">Thông tin xe của bạn</h3>
                      </div>
                      <p className="text-sm text-slate-500 mb-6">Nhập thông tin xe để tiếp tục. Sau khi đăng nhập, xe sẽ tự động lưu vào tài khoản.</p>
                      
                      <div className="max-w-xl mx-auto bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-500 font-bold block mb-1.5 uppercase tracking-wide">Biển số xe *</label>
                            <input 
                              type="text" 
                              value={guestVehicle.licensePlate} 
                              placeholder="Ví dụ: 30A-12345"
                              onChange={e => setGuestVehicle(prev => ({ ...prev, licensePlate: e.target.value }))}
                              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all font-semibold uppercase tracking-wider font-mono" 
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 font-bold block mb-1.5 uppercase tracking-wide">Hãng xe *</label>
                            <input 
                              type="text" 
                              value={guestVehicle.brand} 
                              placeholder="Ví dụ: Toyota, Honda, Hyundai..."
                              onChange={e => setGuestVehicle(prev => ({ ...prev, brand: e.target.value }))}
                              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" 
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-slate-500 font-bold block mb-1.5 uppercase tracking-wide">Dòng xe (Model)</label>
                          <input 
                            type="text" 
                            value={guestVehicle.model} 
                            placeholder="Ví dụ: Camry, Tucson, SH..."
                            onChange={e => setGuestVehicle(prev => ({ ...prev, model: e.target.value }))}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" 
                          />
                        </div>

                        <div>
                          <label className="text-xs text-slate-500 font-bold block mb-3 uppercase tracking-wide">Loại xe *</label>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {VEHICLE_TYPES.map(t => {
                              const isSelected = guestVehicle.type === t.value;
                              return (
                                <button
                                  type="button"
                                  key={t.value}
                                  onClick={() => setGuestVehicle(prev => ({ ...prev, type: t.value }))}
                                  className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center text-center gap-2 transition-all ${
                                    isSelected
                                      ? 'border-emerald-500 bg-emerald-50/20 text-emerald-800 font-bold'
                                      : 'border-slate-100 bg-slate-50/50 text-slate-500 hover:border-slate-200'
                                  }`}
                                >
                                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400'}`}>
                                    {getVehicleIcon(t.value)}
                                  </div>
                                  <span className="text-xs">{t.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {/* STEP 4: Thời gian */}
              {step === 4 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-lg font-bold text-slate-800">
                      {tab === 'regular' ? 'Chọn ngày & giờ hẹn' : 'Lịch định kỳ'}
                    </h3>
                  </div>

                  {tab === 'regular' ? (
                    <div className="mb-6">
                      <label className="text-xs text-slate-400 font-bold uppercase tracking-wide block mb-3">Chọn ngày</label>
                      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200">
                        {bookingDates.map((d) => {
                          const isSelected = selectedDate === d.id;
                          return (
                            <button 
                              key={d.id} 
                              type="button"
                              onClick={() => {
                                if (selectedDate !== d.id) {
                                  setSelectedDate(d.id);
                                  setSelectedTime('');
                                }
                              }}
                              className={`flex flex-col items-center justify-between min-w-[76px] p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer ${
                                isSelected 
                                  ? 'border-emerald-500 bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20 scale-105' 
                                  : 'border-slate-100 bg-white hover:border-slate-200 text-slate-600'
                              }`}
                            >
                              <span className={`text-[10px] uppercase font-bold tracking-wider ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                                {d.label}
                              </span>
                              <span className="text-xl font-extrabold my-1">{d.day}</span>
                              <span className={`text-[10px] font-semibold ${isSelected ? 'text-emerald-200' : 'text-slate-400'}`}>
                                Thg {d.month}
                              </span>
                            </button>
                          );
                        })}

                        {/* Extended Custom Date Selector */}
                        <div className="flex flex-col items-center justify-between min-w-[140px] p-3 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:border-emerald-500 transition-all shrink-0">
                          <span className="text-[10px] uppercase font-bold text-emerald-800 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-emerald-600" /> Chọn ngày khác
                          </span>
                          <input
                            type="date"
                            min={new Date().toLocaleDateString('en-CA')}
                            max={maxAdvanceDateIso}
                            value={bookingDates.some(d => d.id === selectedDate) ? '' : (selectedDate || '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) return;
                              const todayStr = new Date().toLocaleDateString('en-CA');
                              if (val < todayStr) {
                                showToast('Chỉ được chọn ngày từ hiện tại trở đi vào tương lai!', 'error');
                                return;
                              }
                              if (val > maxAdvanceDateIso) {
                                showToast(`Hạng ${tierDisplayName} chỉ được đặt trước tối đa ${maxAdvanceDays} ngày (đến ngày ${maxAdvanceDateFormatted}).`, 'warning');
                                return;
                              }
                              setSelectedDate(val);
                              setSelectedTime('');
                            }}
                            className="w-full text-xs font-bold text-emerald-900 bg-white border border-emerald-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 text-center cursor-pointer shadow-sm mt-1"
                          />
                          {!bookingDates.some(d => d.id === selectedDate) && selectedDate && (
                            <span className="text-[10px] font-extrabold text-emerald-600 mt-1">
                              Đã chọn: {(() => {
                                const parts = String(selectedDate).split('T')[0].split('-');
                                return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : selectedDate;
                              })()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Informative Tier Advance Booking Rule Note */}
                      <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs text-blue-950 shadow-2xs">
                        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800">Quy định đặt lịch trước:</span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 text-blue-800 px-2 py-0.5 font-extrabold text-[11px] border border-blue-200">
                              Hạng {tierDisplayName}: Tối đa {maxAdvanceDays} ngày
                            </span>
                          </div>
                          <p className="text-[11.5px] text-slate-600 leading-relaxed">
                            Quý khách thuộc <strong>Hạng {tierDisplayName}</strong> được đặt lịch trước tối đa <strong>{maxAdvanceDays} ngày</strong> (hạn chót đến ngày <strong>{maxAdvanceDateFormatted}</strong>). Quy định này nhằm đảm bảo hệ thống chuẩn bị chu đáo cơ sở vật chất và ưu tiên phân bổ kỹ thuật viên chuyên nghiệp nhất cho xe của quý khách.
                          </p>
                          {higherTiersLabel && (
                            <p className="text-[11px] text-blue-700 font-semibold pt-0.5">
                              💡 <em>Mẹo: Nâng cấp lên hạng {higherTiersLabel.names} để mở rộng thời gian đặt trước lên tới {higherTiersLabel.days}!</em>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-6">
                      <label className="text-xs text-slate-400 font-bold uppercase tracking-wide block mb-3">Các ngày trong tuần</label>
                      <div className="flex gap-2">
                        {WEEKDAY_OPTIONS.map(({ label, value }) => (
                          <button 
                            key={value} 
                            type="button"
                            onClick={() => toggleDay(value)}
                            className={`w-12 h-12 rounded-xl text-sm font-bold transition-all ${
                              selectedDays.includes(value) 
                                ? 'bg-emerald-600 text-white shadow-md' 
                                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mb-6">
                    <label className="text-xs text-slate-400 font-bold uppercase tracking-wide block mb-3">Chọn khung giờ{tab === 'recurring' ? ' cố định' : ''}</label>
                    <div className="space-y-6">
                      {tab === 'regular' && !selectedDate ? (
                        <div className="flex flex-col items-center justify-center py-12 px-6 rounded-3xl border-2 border-dashed border-emerald-200/80 bg-emerald-50/30 text-center">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 mb-3 shadow-2xs">
                            <Calendar className="w-6 h-6" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 mb-1">
                            Vui lòng chọn ngày bạn muốn đặt lịch
                          </h4>
                          <p className="text-xs text-slate-500 max-w-sm">
                            Hãy ấn chọn 1 trong 7 ngày ở trên hoặc chọn ngày khác để xem các khung giờ còn trống tại chi nhánh.
                          </p>
                        </div>
                      ) : slotsLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
                          <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
                          <span className="text-sm">Đang tìm lịch trống...</span>
                        </div>
                      ) : (tab === 'regular' && availableSlots.filter(s => s.available).length === 0) || (tab === 'recurring' && availableSlots.length === 0) ? (
                        (() => {
                          // Distinguish: store closed today vs. genuinely fully booked
                          const today = new Date();
                          const todayStr = today.toLocaleDateString('en-CA');
                          const isToday = currentDate?.iso === todayStr;
                          const hasSlots = availableSlots.length > 0;
                          const allPast = hasSlots && availableSlots.every(s => !s.available);
                          const isTodayClosed = isToday && allPast;
                          const isConfiguredDayOff = selectedBranch?.scheduleConfig?.daysOff?.includes(tab === 'regular' ? currentDate?.iso : fetchDate);
                          
                          return (
                            <div className={`flex items-center gap-3 p-5 rounded-2xl border ${
                              isConfiguredDayOff 
                                ? 'bg-red-50 border-red-200'
                                : isTodayClosed 
                                  ? 'bg-slate-50 border-slate-200' 
                                  : 'bg-amber-50 border-amber-200'
                            }`}>
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                                isConfiguredDayOff ? 'bg-red-100' : isTodayClosed ? 'bg-slate-100' : 'bg-amber-100'
                              }`}>
                                {isConfiguredDayOff ? '⛔' : isTodayClosed ? '🔒' : '📅'}
                              </div>
                              <div>
                                <p className={`text-sm font-bold ${
                                  isConfiguredDayOff ? 'text-red-800' : isTodayClosed ? 'text-slate-700' : 'text-amber-800'
                                }`}>
                                  {isConfiguredDayOff 
                                    ? 'Chi nhánh tạm nghỉ ngày này' 
                                    : isTodayClosed 
                                      ? 'Cửa hàng hôm nay đã đóng cửa' 
                                      : 'Hết lịch trống'}
                                </p>
                                <p className={`text-xs mt-0.5 ${
                                  isConfiguredDayOff ? 'text-red-600' : isTodayClosed ? 'text-slate-500' : 'text-amber-600'
                                }`}>
                                  {isConfiguredDayOff
                                    ? 'Cửa hàng không nhận khách trong ngày này. Vui lòng chọn ngày khác.'
                                    : isTodayClosed 
                                      ? 'Đã hết giờ tiếp nhận cho hôm nay. Vui lòng chọn ngày khác từ ngày mai.'
                                      : 'Ngày này đã hết chỗ. Vui lòng chọn ngày khác.'
                                  }
                                </p>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                          {/* Morning Section */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-amber-600">
                              <Sun className="w-4 h-4" />
                              <h4 className="text-xs font-bold uppercase tracking-wider">Khung giờ buổi sáng</h4>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {groupedSlots.morning.length === 0 ? (
                                <span className="text-xs text-slate-400 py-2">Không có lịch trống buổi sáng</span>
                              ) : groupedSlots.morning.map(s => {
                                const timeLabel = s.startTime;
                                const isDisabled = tab === 'recurring' ? false : !s.available;
                                const isSelected = selectedTime === timeLabel;
                                const isVipBooked = s.vipBooked;
                                return (
                                  <button 
                                    key={timeLabel} 
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => setSelectedTime(timeLabel)}
                                    className={`relative flex flex-col items-center justify-center min-w-[76px] h-[54px] rounded-xl border font-semibold transition-all duration-200 ${
                                      isSelected
                                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/10 scale-105'
                                        : isDisabled
                                          ? 'border-slate-50 bg-slate-50 text-slate-400 cursor-not-allowed'
                                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className={isDisabled ? 'line-through text-slate-300 text-sm' : 'text-sm'}>{timeLabel}</span>
                                    {isDisabled && <span className="text-[10px] leading-none mt-1 font-medium text-red-400 text-center px-1 w-full truncate" title={s.reason || 'Đã kín'}>{s.reason || 'Đã kín'}</span>}
                                    {isVipBooked && (
                                      <span className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-white rounded-full p-0.5 shadow-sm" title="Khách VIP đã đặt giờ này">
                                        <Sparkles className="w-3 h-3" />
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Afternoon Section */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-blue-600">
                              <Sunset className="w-4 h-4" />
                              <h4 className="text-xs font-bold uppercase tracking-wider">Khung giờ buổi chiều</h4>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {groupedSlots.afternoon.length === 0 ? (
                                <span className="text-xs text-slate-400 py-2">Không có lịch trống buổi chiều</span>
                              ) : groupedSlots.afternoon.map(s => {
                                const timeLabel = s.startTime;
                                const isDisabled = tab === 'recurring' ? false : !s.available;
                                const isSelected = selectedTime === timeLabel;
                                const isVipBooked = s.vipBooked;
                                return (
                                  <button 
                                    key={timeLabel} 
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => setSelectedTime(timeLabel)}
                                    className={`relative flex flex-col items-center justify-center min-w-[76px] h-[54px] rounded-xl border font-semibold transition-all duration-200 ${
                                      isSelected
                                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/10 scale-105'
                                        : isDisabled
                                          ? 'border-slate-50 bg-slate-50 text-slate-400 cursor-not-allowed'
                                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className={isDisabled ? 'line-through text-slate-300 text-sm' : 'text-sm'}>{timeLabel}</span>
                                    {isDisabled && <span className="text-[10px] leading-none mt-1 font-medium text-red-400 text-center px-1 w-full truncate" title={s.reason || 'Đã kín'}>{s.reason || 'Đã kín'}</span>}
                                    {isVipBooked && (
                                      <span className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-white rounded-full p-0.5 shadow-sm" title="Khách VIP đã đặt giờ này">
                                        <Sparkles className="w-3 h-3" />
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {tab === 'recurring' && (
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <label className="text-xs text-slate-400 font-bold uppercase tracking-wide block mb-3">Số tuần lặp lại</label>
                      <div className="flex gap-2 flex-wrap mb-4">
                        {WEEKS_OPTIONS.map(w => (
                          <button 
                            key={w} 
                            type="button"
                            onClick={() => selectWeek(w)}

                            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                              weeks === w 
                                ? 'bg-emerald-600 text-white shadow-md' 
                                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {w} tuần
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Hoặc nhập số tuần:</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={weeksInput}
                          onChange={handleWeeksInput}
                          placeholder="> 1"
                          className={`w-20 px-3 py-2.5 rounded-xl border text-sm font-semibold outline-none transition-colors focus:border-emerald-500 ${
                            weeksError ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
                          }`}
                        />
                        {weeksError && <span className="text-xs font-semibold text-red-500">{weeksError}</span>}
                      </div>
                      {previewDates.length > 0 && (
                        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                          <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center justify-between">
                            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">📋 Danh sách buổi dự kiến</p>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                              {conflictCheck.status === 'done' ? `${actualRecurringSessions} buổi hợp lệ` : `${previewDates.length} buổi`}
                            </span>
                          </div>
                          <div className="p-3 max-h-52 overflow-y-auto">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {previewDates.map((d, i) => {
                                const conflictResult = conflictCheck.results.find(r => r.date === d.toLocaleDateString('en-CA'));
                                const isChecked = conflictCheck.status === 'done';
                                const hasConflict = conflictResult?.conflict;
                                const noSlot = isChecked && hasConflict;
                                const isValid = isChecked && !hasConflict;
                                return (
                                  <div key={i} className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                                    noSlot
                                      ? 'bg-red-50 border-red-200 text-red-700'
                                      : isValid
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : 'bg-slate-50 border-slate-100 text-slate-600'
                                  }`}>
                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] shrink-0 ${
                                      noSlot ? 'bg-red-100 text-red-600' : isValid ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'
                                    }`}>
                                      {noSlot ? '✕' : isValid ? '✓' : '-'}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="font-semibold truncate">
                                        {d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                                      </div>
                                      {noSlot && <div className="text-[9px] text-red-500 mt-0.5">Trùng giờ — không có chỗ</div>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {conflictCheck.status === 'idle' && isLoggedIn && selectedTime && (
                            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={checkRecurringConflicts}
                                className="w-full py-2 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-xs hover:bg-emerald-200 transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                Kiểm tra lịch trống ngay
                              </button>
                            </div>
                          )}
                          {conflictCheck.status === 'checking' && (
                            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-500 text-xs font-semibold">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang kiểm tra...</span>
                            </div>
                          )}
                          {conflictCheck.status === 'done' && actualRecurringSessions === 0 && (
                            <div className="px-4 py-3 bg-red-50 border-t border-red-100">
                              <p className="text-xs font-semibold text-red-600">
                                Rất tiếc, tất cả {previewDates.length} buổi dự kiến đều bị trùng lịch.
                              </p>
                              <p className="text-[11px] text-red-500 mt-1 leading-relaxed">
                                Bạn vui lòng chọn ngày hoặc khung giờ khác nhé, để chúng tôi có thể phục vụ bạn tốt nhất. Xin cảm ơn bạn đã thông cảm!
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {/* STEP 5: Xác nhận */}
              {step === 5 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto space-y-6">
                  <div className="text-center mb-6">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mx-auto mb-3 text-emerald-500">
                      <Sparkles className="w-7 h-7" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">Xác nhận lịch hẹn của bạn</h3>
                    <p className="text-sm text-slate-500 mt-1">Vui lòng kiểm tra lại thông tin chi tiết trước khi đặt chỗ</p>
                  </div>

                  {/* Booking Ticket Card */}
                  <div className="bg-white rounded-3xl border border-slate-200/60 shadow-lg shadow-slate-100/30 overflow-hidden relative">
                    {/* Top ticket strip decoration */}
                    <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />
                    
                    {/* Ticket circles decoration at sides */}
                    <div className="absolute top-1/2 -left-3 w-6 h-6 rounded-full bg-slate-50 border-r border-slate-200/60 z-10 -translate-y-1/2" />
                    <div className="absolute top-1/2 -right-3 w-6 h-6 rounded-full bg-slate-50 border-l border-slate-200/60 z-10 -translate-y-1/2" />
                    
                    <div className="p-6 md:p-8 space-y-6">
                      {/* Grid details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 border-b border-dashed border-slate-200">
                        <div className="flex items-start gap-3">
                          <MapPin className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Chi nhánh</span>
                            <span className="text-sm font-bold text-slate-700">{selectedBranch?.name}</span>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Car className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Phương tiện</span>
                            <span className="text-sm font-bold text-slate-700">
                              {pendingBooking?.guestVehicle?.licensePlate ? (
                                `${pendingBooking.guestVehicle.licensePlate} (${pendingBooking.guestVehicle.brand} ${pendingBooking.guestVehicle.model})`
                              ) : isLoggedIn && vehicle ? (
                                `${vehicle.licensePlate || vehicle.name}`
                              ) : !isLoggedIn && guestVehicle.licensePlate ? (
                                `${guestVehicle.licensePlate} (${guestVehicle.brand} ${guestVehicle.model})`
                              ) : (
                                'Chưa chọn xe'
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Dịch vụ chính</span>
                            <span className="text-sm font-bold text-slate-700">{pkg?.name}</span>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Calendar className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Thời gian</span>
                            {tab === 'regular' ? (
                              <span className="text-sm font-bold text-slate-700">
                                {(() => {
                                    const dateFormatted = currentDate?.iso 
                                      ? new Date(currentDate.iso.includes('T') ? currentDate.iso : currentDate.iso + 'T00:00:00').toLocaleDateString('vi-VN')
                                      : '';
                                    return `${currentDate?.label || ''}${dateFormatted ? ` (${dateFormatted})` : ''} · ${selectedTime}`;
                                  })()}
                              </span>
                            ) : (
                              <div>
                                <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-emerald-600" />
                                  {selectedTime}
                                  <span className="text-xs font-semibold text-slate-400">
                                    {selectedDays.map(dayLabel).join(', ')}
                                  </span>
                                </span>
                                {recurringScheduleDates.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {recurringScheduleDates.map((d, i) => (
                                      <span key={i} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800">
                                        {d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Sub-services summary: Included & Optional */}
                      <div className="pb-6 border-b border-dashed border-slate-200 space-y-4">
                        {/* Dịch vụ đã bao gồm trong gói */}
                        {(() => {
                          const keptIncluded = (pkg?.subServices || []).filter(s => (s.isOptional === false || (s.isOptional === undefined && (s.price === 0 || !s.price))) && currentSubServices.includes(s.name));
                          if (keptIncluded.length === 0) return null;
                          return (
                            <div>
                              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide block mb-2 flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" /> Dịch vụ có sẵn (Đã bao gồm)
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {keptIncluded.map(sub => (
                                  <span key={sub.name} className="text-xs font-semibold px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 flex items-center gap-1.5">
                                    <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                                    {sub.name}
                                    {sub.duration > 0 && <span className="text-[10px] text-emerald-600 font-normal">({sub.duration}p)</span>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Dịch vụ chọn thêm */}
                        {(() => {
                          const addedOptional = (pkg?.subServices || []).filter(s => s.isOptional && currentSubServices.includes(s.name));
                          if (addedOptional.length === 0) return null;
                          return (
                            <div>
                              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide block mb-2 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> Dịch vụ chọn thêm (Tùy chọn)
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {addedOptional.map(sub => (
                                  <span key={sub.name} className="text-xs font-semibold px-3 py-1 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-800 flex items-center gap-1">
                                    <span>+ {sub.name}</span>
                                    <span className="text-[10px] text-indigo-600 font-bold">({sub.price > 0 ? `+${formatCurrency(sub.price)}` : 'Miễn phí'})</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Payment Options */}
                      {isLoggedIn && (
                        <div className="space-y-4 pb-6 border-b border-dashed border-slate-200">
                          {tab === 'regular' && validPacks.length > 0 && (
                            <div className="rounded-2xl border border-emerald-200 overflow-hidden">
                              <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center gap-2">
                                <span className="text-base">🎫</span>
                                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Thanh toán bằng Gói Lượt</span>
                                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">{validPacks.length} gói</span>
                              </div>
                              <div className="p-3 space-y-2">
                                <button
                                  type="button"
                                  onClick={() => { setSelectedSlotPack(null); }}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-sm transition-all ${
                                    !selectedSlotPack
                                      ? 'border-slate-300 bg-slate-50 text-slate-600'
                                      : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'
                                  }`}
                                >
                                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                    !selectedSlotPack ? 'border-slate-500 bg-slate-500' : 'border-slate-300'
                                  }`}>
                                    {!selectedSlotPack && <span className="w-2 h-2 rounded-full bg-white" />}
                                  </span>
                                  <span className="font-medium">Không sử dụng gói lượt</span>
                                </button>
                                {validPacks.map(p => (
                                  <button
                                    key={p._id || p.id}
                                    type="button"
                                    onClick={() => { setSelectedSlotPack(p._id || p.id); setAppliedVoucher(null); }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-sm transition-all ${
                                      selectedSlotPack === (p._id || p.id)
                                        ? 'border-emerald-500 bg-emerald-50/30 text-emerald-800'
                                        : 'border-slate-100 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/20'
                                    }`}
                                  >
                                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                      selectedSlotPack === (p._id || p.id) ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                                    }`}>
                                      {selectedSlotPack === (p._id || p.id) && <span className="w-2 h-2 rounded-full bg-white" />}
                                    </span>
                                    <div className="flex-1 text-left">
                                      <div className="font-semibold">{p.packageId?.name || 'Gói lượt'}</div>
                                      <div className="text-xs opacity-70">Còn {p.remainingSlots} lần sử dụng · Miễn đặt cọc</div>
                                    </div>
                                    <span className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700">{p.remainingSlots} lần</span>
                          </button>
                        ))}
                      </div>
                            </div>
                          )}
                          {!isPayingWithPack && (
                            <>
                              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex justify-between items-center cursor-pointer transition-colors hover:bg-emerald-100/50" onClick={() => setVoucherModalOpen(true)}>
                                <div>
                                   <h4 className="text-emerald-800 font-bold text-sm">VOUCHER & ƯU ĐÃI</h4>
                                   {appliedVoucher ? <p className="text-emerald-600 font-medium text-xs mt-1">Đã áp dụng: {appliedVoucher.code}</p> : <p className="text-emerald-600 font-medium text-xs mt-1">Bấm để chọn ưu đãi</p>}
                                </div>
                                <span className="text-emerald-600 text-xs font-bold border border-emerald-200 px-3 py-1.5 rounded-full bg-white shadow-sm">Chọn</span>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Detailed Financial Breakdown */}
                      <div className="space-y-2.5 pt-2">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">CHI TIẾT GIÁ DỊCH VỤ</div>
                        
                        {/* Package price */}
                        <div className="flex justify-between text-sm text-slate-800 font-bold">
                          <span>{pkg?.name || 'Gói dịch vụ chính'}</span>
                          <span className="font-bold">{formatCurrency(basePrice)}</span>
                        </div>

                        {/* Included sub-services (Dịch vụ có sẵn trong gói - Miễn phí) */}
                        {(() => {
                          const keptIncluded = (pkg?.subServices || []).filter(s => (s.isOptional === false || (s.isOptional === undefined && (s.price === 0 || !s.price))) && currentSubServices.includes(s.name));
                          if (keptIncluded.length === 0) return null;
                          return (
                            <div className="pl-3 space-y-1 my-1">
                              {keptIncluded.map(sub => (
                                <div key={sub.name} className="flex justify-between text-xs text-slate-500">
                                  <span>+ {sub.name}</span>
                                  <span className="text-slate-400 font-medium">Miễn phí</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Optional added sub-services (Dịch vụ chọn thêm - Trả phí) */}
                        {(() => {
                          const addedSubServices = (pkg?.subServices || []).filter(s => s.isOptional && currentSubServices.includes(s.name));
                          if (addedSubServices.length === 0) return null;
                          return (
                            <div className="pt-2 border-t border-slate-100/80 space-y-1">
                              <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-indigo-500" /> Dịch vụ chọn thêm (Trả phí)
                              </div>
                              <div className="pl-3 space-y-1">
                                {addedSubServices.map(sub => (
                                  <div key={sub.name} className="flex justify-between text-xs text-indigo-950 font-medium">
                                    <span>+ {sub.name}</span>
                                    <span className="font-bold text-indigo-600">+{formatCurrency(sub.price || 0)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Package slot usage discount */}
                        {isPayingWithPack && (
                          <div className="flex justify-between text-sm text-emerald-600 font-medium">
                            <span>Sử dụng gói lượt</span>
                            <span>-{formatCurrency(basePrice)}</span>
                          </div>
                        )}

                        {/* Voucher discount */}
                        {isLoggedIn && discount > 0 && (
                          <div className="flex justify-between text-sm text-emerald-600 font-medium">
                            <span>Mã giảm giá {appliedVoucher?.code ? `(${appliedVoucher.code})` : ''}</span>
                            <span className="font-bold">-{formatCurrency(discount)}</span>
                          </div>
                        )}

                        {isLoggedIn && points > 0 && (
                          <div className="rounded-xl bg-amber-50/70 border border-amber-100 p-3 space-y-1">
                            <div className="flex justify-between items-center text-xs text-amber-700 font-semibold">
                              <span className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Thưởng tích điểm thành viên
                              </span>
                              <span className="font-extrabold">+{points} điểm</span>
                            </div>
                            <div className="text-[11px] text-amber-600/80 leading-snug">
                              {formatCurrency(pointsBase)} × {pointsPct}% (tỷ lệ tích điểm) × {pointMultiplier} (hạng {tierLabel})
                            </div>
                            <div className="text-[11px] text-amber-600/80 leading-snug mt-1">* Sẽ được cộng sau khi đơn hàng của bạn hoàn thành.</div>
                          </div>
                        )}

                        {tab === 'recurring' && pkg && actualRecurringSessions > 0 ? (
                          <div className="pt-3 mt-2 border-t border-slate-100 space-y-2">
                            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1">CÁCH TÍNH TỔNG TIỀN</div>

                            <div className="rounded-2xl bg-emerald-50/60 border border-emerald-100 p-4 space-y-3">
                              {/* Giá mỗi buổi sau khi giảm */}
                              <div className="flex justify-between items-center text-sm">
                                <div>
                                  <div className="font-bold text-slate-700">Giá mỗi buổi (sau khi giảm)</div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">Đã trừ ưu đãi của bạn</div>
                                </div>
                                <span className="text-xl font-extrabold text-emerald-600">{formatCurrency(singleSessionPrice)}</span>
                              </div>

                              {/* Nhân với số buổi */}
                              <div className="flex justify-between items-center text-sm">
                                <div>
                                  <div className="font-bold text-slate-700">Số buổi đặt định kỳ</div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">{selectedDays.length} ngày × {weeks} tuần (đã loại buổi trùng lịch)</div>
                                </div>
                                <span className="font-bold text-slate-700">× {actualRecurringSessions} buổi</span>
                              </div>

                              {/* Tổng dự kiến */}
                              <div className="flex justify-between items-end pt-2.5 border-t border-emerald-100">
                                <div>
                                  <div className="font-bold text-slate-800">Tổng dự kiến</div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">{formatCurrency(singleSessionPrice)} × {actualRecurringSessions} buổi</div>
                                </div>
                                <span className="text-2xl font-black text-emerald-600">{formatCurrency(singleSessionPrice * actualRecurringSessions)}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-slate-100">
                              <span className="text-base font-bold text-slate-800">Thành tiền tổng cộng</span>
                              <span className="text-2xl font-extrabold text-emerald-600">{formatCurrency(total)}</span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-400 text-right mt-1">* Giá đã bao gồm VAT {vatRate}%</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {tab === 'recurring' && isLoggedIn && !result && (
                    <div className="pt-4">
                      {conflictCheck.status === 'idle' && (
                        <button
                          type="button"
                          onClick={checkRecurringConflicts}
                          disabled={!selectedTime || previewDates.length === 0}
                          className="w-full py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-600 font-bold text-sm hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
                        >
                          <Calendar className="w-4 h-4" />
                          Kiểm tra lịch trống ({previewDates.length} buổi)
                        </button>
                      )}
                      {conflictCheck.status === 'checking' && (
                        <div className="flex items-center justify-center gap-2 py-3 text-slate-500 text-sm font-semibold">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Đang kiểm tra lịch trống...</span>
                        </div>
                      )}
                      {conflictCheck.status === 'done' && conflictCheck.totalConflicts === 0 && (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-2 text-sm text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-5 h-5 shrink-0" />
                          <span>Tất cả {previewDates.length} buổi đều trống lịch ✓</span>
                        </div>
                      )}
                    </div>
                  )}

                  {result && tab === 'recurring' && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 space-y-1">
                      {result.totalCreated > 0 && <div className="text-sm text-emerald-700 font-bold">✓ Đã tạo thành công {result.totalCreated} lịch hẹn!</div>}
                      {result.totalFailed > 0 && <div className="text-sm text-amber-600 font-semibold">⚠ {result.totalFailed} ngày bị bỏ qua do trùng lịch.</div>}
                    </div>
                  )}

                  {message && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <span>{message}</span>
                    </div>
                  )}
                  {error && (
                    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-sm font-semibold flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  {processingPending && (
                    <div className="flex items-center justify-center gap-2 text-emerald-600 font-semibold py-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Đang xử lý đặt lịch sau đăng nhập...</span>
                    </div>
                  )}

                  {/* Actions have been moved to sticky footer */}
                </motion.div>
              )}
            </>
          )}

          {/* ── Shared Navigation is rendered outside to escape backdrop-filter containing block ── */}
        </div>
      </div>

      {/* ── Shared Navigation ── */}
      {(tab !== 'slot_pack' || isLoggedIn) && (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col items-center gap-3 w-full max-w-[calc(100%-2rem)] sm:w-auto">
          
          {/* Info Banner floating independently above the pill */}
          {!isLoggedIn && step === totalSteps && (
            <div className="pointer-events-auto w-full max-w-[600px] p-3 sm:p-4 rounded-3xl bg-amber-50/90 backdrop-blur-xl border border-amber-200/50 flex items-start gap-3 text-left shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)]">
              <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-amber-700 leading-relaxed font-medium">
                Bạn cần đăng nhập để hoàn tất đặt chỗ. Thông tin xe bạn nhập ở bước trước sẽ được tự động lưu vào tài khoản sau khi đăng nhập thành công.
              </p>
            </div>
          )}

          {/* Navigation Pill */}
          <div className="pointer-events-auto bg-white/10 sm:bg-white/5 backdrop-blur-[64px] border border-white/20 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] rounded-[2rem] sm:rounded-full p-2 flex flex-col sm:flex-row items-center gap-2 w-full sm:w-max">
            
            {step > 1 && (
              <button 
                type="button"
                onClick={() => setStep(step - 1)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-[1.5rem] sm:rounded-full border border-white/30 bg-white/20 text-slate-700 text-sm font-bold hover:bg-white/40 hover:text-slate-900 transition-colors active:scale-[0.98]"
              >
                <ArrowLeft className="w-4 h-4" />
                Quay lại
              </button>
            )}
            
            {step === totalSteps && (
              <button 
                type="button"
                onClick={reset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-[1.5rem] sm:rounded-full border border-white/30 bg-white/20 text-slate-600 text-sm font-bold hover:bg-white/40 hover:text-slate-800 transition-colors active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4" />
                Đặt lại
              </button>
            )}
            
            {step < totalSteps ? (
              <button 
                type="button"
                onClick={() => setStep(step + 1)} 
                disabled={!canNextStep()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-[1.5rem] sm:rounded-full text-sm font-bold transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30"
                style={{
                  backgroundColor: canNextStep() ? '#10b981' : 'rgba(255,255,255,0.2)',
                  color: canNextStep() ? '#ffffff' : '#94a3b8',
                  cursor: canNextStep() ? 'pointer' : 'not-allowed',
                  border: canNextStep() ? 'none' : '1px solid rgba(255,255,255,0.4)'
                }}
              >
                <span>Tiếp theo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              tab === 'regular' ? (
                <button 
                  type="button"
                  onClick={confirmBooking} 
                  disabled={bookingLoading}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-[1.5rem] sm:rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {bookingLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang xử lý...</span>
                    </>
                  ) : isLoggedIn ? (
                    'Xác nhận đặt chỗ ngay'
                  ) : (
                    'Đăng nhập để đặt lịch'
                  )}
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={confirmRecurringBooking} 
                  disabled={bookingLoading || actualRecurringSessions === 0}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-[1.5rem] sm:rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  {bookingLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang xử lý...</span>
                    </>
                  ) : isLoggedIn ? (
                    `Xác nhận ${actualRecurringSessions} buổi`
                  ) : (
                    'Đăng nhập để đặt lịch'
                  )}
                </button>
              )
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showSuccessModal && lastBooking && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => { setShowSuccessModal(false); reset(); }}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100/80 max-h-[90vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header block (Light and simple) */}
              <div className="pt-8 pb-4 text-center px-6 bg-white border-b border-slate-50">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-3"
                >
                  <Check className="w-8 h-8 text-emerald-600 stroke-[3]" />
                </motion.div>
                
                <h3 className="text-xl font-bold text-slate-800">
                  {lastBooking.depositPaid 
                    ? (lastBooking.paymentMode === 'full' ? 'Thanh toán thành công' : 'Đặt cọc thành công') 
                    : 'Đặt lịch thành công'}
                </h3>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  {lastBooking.depositPaid
                    ? (lastBooking.paymentMode === 'full' 
                       ? `Đã thanh toán ${formatCurrency(lastBooking.total || 0)}` 
                       : `Đã đặt cọc ${formatCurrency(lastBooking.depositAmount || 0)}`)
                    : 'Cảm ơn bạn đã sử dụng dịch vụ của AutoWash Pro'}
                </p>

                {/* Lucky Spin Notification */}
                {(lastBooking.paymentMode === 'full' || lastBooking.isPayingWithPack) && (
                  <div className="mt-5 p-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 flex items-start sm:items-center gap-3 text-left shadow-inner shadow-white">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center text-orange-600 shadow-sm border border-amber-200/50">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-amber-900 leading-tight">Đủ điều kiện nhận 1 vòng quay may mắn!</p>
                      <p className="text-xs text-amber-700 mt-0.5">Vòng quay sẽ được cấp sau khi đơn hàng của bạn hoàn thành.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {/* Booking Code Callout */}
                <div className="text-center bg-gradient-to-br from-emerald-50 to-emerald-100/60 border-2 border-emerald-200/70 p-5 rounded-2xl shadow-sm">
                  <span className="text-[11px] text-emerald-500 font-bold uppercase tracking-wider block">Mã đặt lịch của bạn</span>
                  <span className="block mt-2 text-2xl font-black text-emerald-700 tracking-[0.15em] font-mono">
                    {lastBooking.bookingCode?.length === 36 ? `#${lastBooking.bookingCode.slice(-6).toUpperCase()}` : lastBooking.bookingCode}
                  </span>
                </div>

                {/* Details list */}
                <div className="divide-y divide-slate-100 text-sm">
                  <div className="flex justify-between py-3">
                    <span className="text-slate-400 text-xs font-semibold">Chi nhánh</span>
                    <span className="font-bold text-slate-700 text-sm">{lastBooking.branch?.name}</span>
                  </div>
                  {lastBooking.vehicle && (
                    <div className="flex justify-between py-3">
                      <span className="text-slate-400 text-xs font-semibold">Xe</span>
                      <span className="font-bold text-slate-700 text-sm">{lastBooking.vehicle.licensePlate || lastBooking.vehicle.name}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-3">
                    <span className="text-slate-400 text-xs font-semibold">
                      {lastBooking.recurringBookings?.length ? `Lịch định kỳ (${lastBooking.recurringBookings.length} buổi)` : 'Thời gian hẹn'}
                    </span>
                    <span className="font-bold text-slate-700 text-sm">
                      {lastBooking.recurringBookings?.length
                        ? `${formatRecurringDate(lastBooking.recurringBookings[0].date, lastBooking.recurringBookings[0].time || lastBooking.selectedTime)}`
                        : lastBooking.currentDate
                          ? `${lastBooking.currentDate.label} ${lastBooking.selectedTime}`
                          : `${lastBooking.selectedTime} · ${lastBooking.recurringCount || 0} buổi định kỳ`}
                    </span>
                  </div>

                  {lastBooking.recurringBookings?.length > 0 && (
                    <div className="py-2">
                      <div className="text-slate-400 text-xs font-semibold mb-2">Danh sách các buổi</div>
                      <div className="flex flex-wrap gap-1.5">
                        {lastBooking.recurringBookings.map((rb, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold">
                            <Calendar className="w-3 h-3" />
                            {formatRecurringDate(rb.date, rb.time)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bill Section */}
                  <div className="bg-slate-50/60 -mx-6 px-6 py-4 space-y-2.5 mt-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">CHI TIẾT THANH TOÁN</div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 text-sm">{lastBooking.pkg?.name}</span>
                      <span className="font-bold text-slate-800 text-sm">{formatCurrency(lastBooking.pkg?.price || 0)}</span>
                    </div>

                    {lastBooking.subServices?.filter(s => s).map((svc, i) => {
                      const n = typeof svc === 'string' ? svc : svc?.name;
                      const p = typeof svc === 'object' && svc !== null ? (svc.price || 0) : 0;
                      return (
                        <div className="flex justify-between items-center" key={i}>
                          <span className="text-slate-500 text-xs pl-3">+ {n}</span>
                          <span className="font-bold text-slate-600 text-xs">{p > 0 ? formatCurrency(p) : 'Miễn phí'}</span>
                        </div>
                      );
                    })}

                    {(lastBooking.discount > 0 || lastBooking.voucherCode) && (
                      <div className="flex justify-between items-center text-xs py-1.5 px-3 rounded-xl bg-emerald-50/90 border border-emerald-200/80">
                        <span className="text-emerald-800 font-bold flex items-center gap-1.5">
                          <span>🏷️ Ưu đãi Voucher</span>
                          {lastBooking.voucherCode && (
                            <span className="font-mono bg-emerald-200/80 text-emerald-900 px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider">
                              ({lastBooking.voucherCode})
                            </span>
                          )}
                        </span>
                        <span className="font-black text-emerald-700">
                          {lastBooking.discount > 0 ? `-${formatCurrency(lastBooking.discount)}` : 'Đã áp dụng'}
                        </span>
                      </div>
                    )}

                    <div className="!mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                      <span className="font-bold text-sm text-slate-700">Tổng thanh toán</span>
                      <span className="font-extrabold text-base text-emerald-600">{formatCurrency(lastBooking.total || 0)}</span>
                    </div>

                    {lastBooking.paymentMode === 'full' ? (
                      <>
                        <div className="flex justify-between items-center pt-1">
                          <div>
                            <span className="font-semibold text-sm text-emerald-600">Thanh toán (100%)</span>
                            {lastBooking.depositPaid && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">ĐÃ THANH TOÁN</span>
                            )}
                          </div>
                          <span className="font-bold text-base text-emerald-600">{formatCurrency(lastBooking.total || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">Còn lại (thanh toán sau)</span>
                          <span className="font-bold text-slate-500">0đ</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between items-center pt-1">
                          <div>
                            <span className="font-semibold text-sm text-amber-600">Đặt cọc ({depositPercent}%)</span>
                            {lastBooking.depositPaid && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">ĐÃ CỌC</span>
                            )}
                          </div>
                          <span className="font-bold text-base text-amber-600">{formatCurrency(lastBooking.depositAmount || 0)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-400 font-medium">Còn lại (thanh toán sau)</span>
                          <span className="font-bold text-slate-500">{formatCurrency(Math.max(0, (lastBooking.total || 0) - (lastBooking.depositAmount || 0)))}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  type="button"
                  onClick={() => { setShowSuccessModal(false); reset(); }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors active:scale-[0.98]"
                >
                  Đóng
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    const targetId = lastBooking._id || lastBooking.bookingId || lastBooking.id;
                    setShowSuccessModal(false);
                    reset();
                    onGoToHistory?.(targetId);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm transition-colors active:scale-[0.98]"
                >
                  Xem hóa đơn đơn hàng
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deposit Payment Modal */}
      <AnimatePresence>
        {pendingDeposit && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => { if (!depositLoading && depositQrStep === 'select') { setPendingDeposit(null); setError(''); } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100/80"
              onClick={e => e.stopPropagation()}
            >
              {depositQrStep === 'qr' && depositPayment ? (
                <>
                  {/* QR Code View */}
                  <div className="pt-4 pb-2 text-center px-6">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-1 bg-emerald-50 border-2 border-emerald-100">
                      <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M12 12a3 3 0 100-6 3 3 0 000 6z" /><path d="M2 12v4h20v-4" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Chuyển khoản ngân hàng</h3>
                    <p className="text-slate-400 text-[11px] mt-0.5">Quét mã QR hoặc chuyển khoản thủ công</p>
                  </div>

                  {depositPayment.qrCode && (
                    <div className="px-6 pb-1 flex justify-center">
                      <div className="bg-white rounded-xl border-2 border-slate-100 p-2.5 shadow-sm">
                        <img src={depositPayment.qrCode} alt="QR code" className="w-32 h-32" />
                      </div>
                    </div>
                  )}

                  <div className="px-5 py-1 space-y-2">
                    <div className="bg-slate-50 rounded-xl p-2 text-center">
                      <div className="text-xs text-slate-400 mb-1">Số tiền cần chuyển</div>
                      <div className="text-2xl font-black text-emerald-600">{formatCurrency(depositPayment.amount || 0)}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {paymentMode === 'full' 
                          ? 'Thanh toán 100%'
                          : `Đặt cọc ${depositPercent}% · Còn lại ${formatCurrency(Math.max(0, (pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0) - (depositPayment.amount || pendingDeposit.depositAmount || 0)))} (thanh toán sau)`
                        }
                      </div>
                    </div>

                    {/* Thông tin tài khoản thụ hưởng */}
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                      <div className="px-3 py-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-semibold">Ngân hàng</span>
                        <span className="text-xs font-bold text-slate-700">{depositPayment.bankInfo?.bankName || 'Ngân hàng TMCP Quân đội (MB)'}</span>
                      </div>
                      <div className="px-3 py-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-semibold">Số tài khoản</span>
                        <span className="text-xs font-bold text-slate-700 font-mono tracking-wider">{depositPayment.bankInfo?.accountNumber || '6200320046868'}</span>
                      </div>
                      <div className="px-3 py-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-semibold">Chủ tài khoản</span>
                        <span className="text-xs font-bold text-slate-700">{depositPayment.bankInfo?.accountHolder || 'CONG TY CO PHAN AUTO WASH PRO'}</span>
                      </div>
                      <div className="px-3 py-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-slate-400 font-semibold">Nội dung chuyển khoản</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(depositPayment.bankInfo?.transferContent || `${paymentMode === 'full' ? 'THANH TOAN' : 'DAT COC'} ${depositPayment.transactionId}`);
                              alert('Đã copy nội dung CK!');
                            }}
                            className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-wider"
                          >
                            Copy
                          </button>
                        </div>
                        <div className="text-sm font-bold text-slate-700 font-mono bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center tracking-wider">
                          {depositPayment.bankInfo?.transferContent || `${paymentMode === 'full' ? 'THANH TOAN' : 'DAT COC'} ${depositPayment.transactionId}`}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-xl px-3 py-2 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-semibold">Mã giao dịch</span>
                      <span className="text-xs font-bold text-slate-700 font-mono">{depositPayment.transactionId}</span>
                    </div>
                    <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 pt-0.5">
                      <RefreshCw className={`w-3 h-3 ${depositPollCount % 2 === 0 ? 'animate-spin' : ''}`} />
                      Đang kiểm tra thanh toán...
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border-t border-slate-100">
                    <button type="button" onClick={() => { setPendingDeposit(null); setDepositPayment(null); setDepositQrStep('select'); setError(''); }}
                      className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors">
                      Hủy giao dịch
                    </button>
                  </div>
                </>
              ) : depositQrStep === 'success' ? (
                <>
                  {/* Success animation */}
                  <div className="pt-12 pb-8 text-center px-6">
                    <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h3 className="text-2xl font-black text-slate-800">
                      {paymentMode === 'full' ? 'Thanh toán thành công!' : 'Đặt cọc thành công!'}
                    </h3>
                    <p className="text-slate-400 text-sm mt-2">
                      {paymentMode === 'full' ? 'Thanh toán 100% hoàn tất, lịch hẹn đã được xác nhận.' : 'Cảm ơn bạn, lịch hẹn đã được xác nhận.'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* Selection View (default) */}
                  {/* Header */}
                  <div className="pt-4 pb-2 text-center px-6 bg-white border-b border-slate-50">
                    <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-1">
                      <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">
                      {paymentMode === 'full' ? 'Thanh toán' : 'Thanh toán đặt cọc'}
                    </h3>
                    <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                      {paymentMode === 'full' ? 'Vui lòng thanh toán để hoàn tất đặt lịch' : 'Vui lòng đặt cọc để hoàn tất đặt lịch'}
                    </p>
                  </div>

                  <div className="p-4 space-y-2">
                    <div>
                      <div className="bg-slate-50 border border-slate-100/60 p-2.5 rounded-xl space-y-2">
                        {(() => {
                          const finalAmt = pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0;
                          const discAmt = pendingDeposit.discount || (appliedVoucher ? discount : 0);
                          const origAmt = pendingDeposit.originalPrice || (finalAmt + discAmt);
                          const code = pendingDeposit.voucherCode || appliedVoucher?.code;
                          const hasVoucher = discAmt > 0 || !!code;

                          return (
                            <>
                              {hasVoucher ? (
                                <>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-slate-400 font-semibold">Tổng dịch vụ</span>
                                    <span className="font-semibold text-slate-400 line-through">{formatCurrency(origAmt)}</span>
                                  </div>
                                  <div className="flex justify-between items-center bg-emerald-50/80 -mx-1 px-2 py-1 rounded-lg border border-emerald-100/60 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-emerald-700 font-bold">🏷️ Ưu đãi Voucher</span>
                                      {code && (
                                        <span className="bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                                          ({code})
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-black text-emerald-600">-{formatCurrency(discAmt)}</span>
                                  </div>
                                  <div className="flex justify-between text-sm pt-0.5 border-t border-slate-200">
                                    <span className="text-slate-600 font-bold">Tổng sau giảm</span>
                                    <span className="font-bold text-slate-800">{formatCurrency(finalAmt)}</span>
                                  </div>
                                </>
                              ) : (
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-400 font-semibold">Tổng dịch vụ</span>
                                  <span className="font-bold text-slate-700">{formatCurrency(finalAmt)}</span>
                                </div>
                              )}

                              {paymentMode === 'deposit' ? (
                                <>
                                  <div className="flex justify-between items-end">
                                    <div>
                                      <span className="text-amber-600 font-semibold text-sm">Đặt cọc ({depositPercent}%)</span>
                                      <div className="text-[11px] text-slate-400 mt-0.5">{depositPercent}% × {formatCurrency(finalAmt)}</div>
                                    </div>
                                    <span className="font-black text-xl text-amber-600">{formatCurrency(pendingDeposit.depositAmount || 0)}</span>
                                  </div>
                                  <div className="h-px bg-slate-200" />
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-400 font-semibold">Còn lại (thanh toán sau)</span>
                                    <span className="font-bold text-slate-500">{formatCurrency(Math.max(0, finalAmt - (pendingDeposit.depositAmount || 0)))}</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex justify-between items-end">
                                    <div>
                                      <span className="text-emerald-600 font-semibold text-sm">Thanh toán (100%)</span>
                                      <div className="text-[11px] text-slate-400 mt-0.5">Thanh toán toàn bộ hóa đơn</div>
                                    </div>
                                    <span className="font-black text-xl text-emerald-600">{formatCurrency(finalAmt)}</span>
                                  </div>
                                  <div className="h-px bg-slate-200" />
                                  <div className="flex justify-between text-sm">
                                    <span className="text-slate-400 font-semibold">Còn lại (thanh toán sau)</span>
                                    <span className="font-bold text-slate-500">0đ</span>
                                  </div>
                                </>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Số tiền cần thanh toán</span>
                      <div className="grid grid-cols-2 gap-3">
                        {pendingDeposit.depositAmount > 0 && (
                          <button 
                            onClick={() => setPaymentMode('deposit')} 
                            className={`p-2.5 border-2 rounded-xl text-left transition-all ${paymentMode === 'deposit' ? 'border-amber-500 bg-amber-50 shadow-sm' : 'border-slate-200 hover:border-amber-200 hover:bg-amber-50/50'}`}
                          >
                            <div className={`font-bold text-xs ${paymentMode === 'deposit' ? 'text-amber-700' : 'text-slate-500'}`}>Thanh toán cọc {depositPercent}%</div>
                            <div className={`mt-0.5 text-base font-black ${paymentMode === 'deposit' ? 'text-amber-600' : 'text-slate-700'}`}>{formatCurrency(pendingDeposit.depositAmount || 0)}</div>
                          </button>
                        )}
                        <button 
                          onClick={() => setPaymentMode('full')} 
                          className={`p-2.5 border-2 rounded-xl text-left transition-all ${paymentMode === 'full' ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/50'} ${pendingDeposit.depositAmount === 0 ? 'col-span-2' : ''}`}
                        >
                          <div className={`font-bold text-xs ${paymentMode === 'full' ? 'text-emerald-700' : 'text-slate-500'}`}>Thanh toán 100%</div>
                          <div className={`mt-0.5 text-base font-black ${paymentMode === 'full' ? 'text-emerald-600' : 'text-slate-700'}`}>{formatCurrency(pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0)}</div>
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Chọn phương thức</span>
                      <div className="grid grid-cols-2 gap-2">
                        {(() => {
                          const walletAmount = paymentMode === 'full' ? (pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0) : (pendingDeposit.depositAmount || 0);
                          const walletDisabled = !user || (user.walletBalance || 0) < walletAmount;
                          const methods = [
                            { value: 'bank', label: 'Ngân hàng', color: '#10b981' },
                            { value: 'vnpay', label: 'VNPay', color: '#2563eb' },
                            { value: 'wallet', label: 'Ví của tôi', color: '#f59e0b', disabled: walletDisabled },
                          ];
                          return methods.map(m => {
                            const isWalletDisabled = m.value === 'wallet' && m.disabled;
                            return (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => { if (!isWalletDisabled) setDepositMethod(m.value); }}
                            className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${
                              depositMethod === m.value
                                ? 'border-emerald-500 bg-emerald-50/30 shadow-sm'
                                : isWalletDisabled
                                  ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                                  : 'border-slate-100 bg-white hover:border-slate-200'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-black" style={{ backgroundColor: m.color }}>
                              {m.value === 'bank' ? (
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M12 12a3 3 0 100-6 3 3 0 000 6z" /><path d="M2 12v4h20v-4" />
                                </svg>
                              ) : m.value === 'wallet' ? (
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                </svg>
                              )}
                            </div>
                            <span className={`text-xs font-bold ${depositMethod === m.value ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {m.value === 'wallet' ? 'Ví (' + formatCurrency(user?.walletBalance || 0) + ')' : m.label}
                            </span>
                          </button>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {error && (
                      <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-500 font-semibold">{error}</div>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button type="button" onClick={() => { if (!depositLoading) { setPendingDeposit(null); setError(''); } }} disabled={depositLoading}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-500 hover:bg-slate-100 transition-colors active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5">
                      <ArrowLeft className="w-4 h-4" />
                      Quay lại
                    </button>
                    <button type="button" onClick={depositMethod === 'vnpay' ? payWithVnpay : depositMethod === 'wallet' ? payWithWallet : payDeposit} disabled={depositLoading || vnpayLoading || (depositMethod === 'wallet' && (!user || (user.walletBalance || 0) < (paymentMode === 'full' ? (pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0) : (pendingDeposit.depositAmount || 0))))}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm transition-colors active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2">
                      {depositLoading || vnpayLoading ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" />{'ĐANG XỬ LÝ...'}</>
                      ) : paymentMode === 'full' ? (
                        'THANH TOÁN ' + formatCurrency(pendingDeposit.finalPrice || pendingDeposit.totalAmount || 0)
                      ) : (
                        'ĐẶT CỌC ' + formatCurrency(pendingDeposit.depositAmount || 0)
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {voucherModalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setVoucherModalOpen(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="shrink-0 border-b border-slate-100 px-5 py-4 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 text-lg">Chọn Ưu Đãi</h3>
                <button
                  onClick={() => setVoucherModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <VoucherPicker
                  apiBase={apiBase} token={token} selected={appliedVoucher}
                  onSelect={(v) => { setAppliedVoucher(v); setVoucherModalOpen(false); }}
                  orderAmount={totalBase} compact branchId={selectedBranch?._id || selectedBranch?.id}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
