import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Phone, Mail, Car, Lock, Plus, Edit2, Trash2, CheckCircle2,
  AlertTriangle, Award, Gift, Sparkles, X, Check, ShieldCheck, Camera, Upload, Link as LinkIcon, Image as ImageIcon
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showToast as fireToast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { translateText } from '@/utils/notifTranslator';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const FALLBACK_TIER_MAP = {
  diamond: { label: 'Kim cương', color: 'text-cyan-600', bg: 'bg-cyan-50 border-cyan-200', minPoints: 1000000, benefits: ['Tất cả ưu đãi của hạng Vàng', 'Giảm 10% khi mua gói dịch vụ', 'Hệ số nhân điểm x2.0', 'Tặng 2 lần xịt gầm miễn phí mỗi tháng'] },
  gold: { label: 'Vàng', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', minPoints: 500000, benefits: ['Tất cả ưu đãi của hạng Bạc', 'Hệ số nhân điểm x1.5', 'Giảm 5% khi mua gói dịch vụ', 'Tặng 1 lần xịt gầm miễn phí mỗi tháng'] },
  silver: { label: 'Bạc', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-300', minPoints: 100000, benefits: ['Tất cả ưu đãi của hạng Đồng', 'Hệ số nhân điểm x1.2', 'Ưu tiên xếp lịch khi đông xe'] },
  bronze: { label: 'Đồng', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', minPoints: 0, benefits: ['Tích điểm cho mỗi lần rửa xe', 'Nhận ưu đãi vào dịp sinh nhật'] },
};

function formatCurrency(val) {
  if (!val && val !== 0) return '0';
  return Number(val).toLocaleString('vi-VN');
}

export default function CustomerProfilePage({ user, vehicles: initialVehicles, onLogout, apiBase, token, onBack, onUserUpdate }) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'vi';
  const [vehicles, setVehicles] = useState(initialVehicles || []);
  const avatarInputRef = useRef(null);
  
  // Modals visibility
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showEditVehicle, setShowEditVehicle] = useState(false);

  // Forms state
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', phone: user?.phone || '', avatar: user?.avatar || '' });
  const [profileSaving, setProfileSaving] = useState(false);

  const [passForm, setPassForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passSaving, setPassSaving] = useState(false);

  const [form, setForm] = useState({ licensePlate: '', vehicleType: 'sedan', brand: '', model: '', color: '', year: '' });
  const [submitting, setSubmitting] = useState(false);

  const [editVehicle, setEditVehicle] = useState(null);
  const [editFormVehicle, setEditFormVehicle] = useState({ licensePlate: '', vehicleType: 'sedan', brand: '', model: '', color: '', year: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [tierConfig, setTierConfig] = useState(null);
  const [tierList, setTierList] = useState([]);

  useEffect(() => {
    setProfileForm({ name: user?.name || '', phone: user?.phone || '', avatar: user?.avatar || '' });
  }, [user]);

  useEffect(() => {
    async function fetchTiers() {
      try {
        const res = await fetch(`${apiBase || API_BASE}/loyalty/tiers`);
        if (res.ok) {
          const payload = await res.json();
          if (Array.isArray(payload.data)) {
            setTierList(payload.data);
            const map = {};
            payload.data.forEach(t => map[t.id] = { label: t.name, color: t.color, bg: t.bg, minPoints: t.minPoints, benefits: t.benefits || [], ...t });
            setTierConfig(map);
          }
        }
      } catch (err) {
        console.error('Failed to fetch tiers', err);
      }
    }
    fetchTiers();
  }, [apiBase]);

  useEffect(() => {
    if (initialVehicles) setVehicles(initialVehicles);
  }, [initialVehicles]);

  // Handle Avatar file upload
  function handleAvatarFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      fireToast.error('Dung lượng ảnh tối đa là 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      setProfileForm(prev => ({ ...prev, avatar: evt.target?.result || '' }));
    };
    reader.readAsDataURL(file);
  }

  // Update Profile API
  async function handleUpdateProfile(e) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const res = await fetch(`${apiBase || API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(profileForm),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Cập nhật thất bại');
      }
      const payload = await res.json();
      const updated = payload?.data || payload;
      setShowEditProfileModal(false);
      fireToast.success('Cập nhật thông tin cá nhân thành công!');
      if (onUserUpdate) onUserUpdate(updated);
    } catch (e) {
      fireToast.error(e.message || 'Cập nhật thất bại');
    } finally {
      setProfileSaving(false);
    }
  }

  // Change Password API
  async function handleChangePassword(e) {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirmPassword) {
      fireToast.error('Mật khẩu mới không khớp!');
      return;
    }
    if (passForm.newPassword.length < 6) {
      fireToast.error('Mật khẩu mới phải từ 6 ký tự trở lên');
      return;
    }

    setPassSaving(true);
    try {
      const res = await fetch(`${apiBase || API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          currentPassword: passForm.currentPassword,
          newPassword: passForm.newPassword,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Đổi mật khẩu thất bại');
      }
      fireToast.success('Đổi mật khẩu thành công!');
      setShowChangePassModal(false);
      setPassForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (e) {
      fireToast.error(e.message || 'Đổi mật khẩu thất bại');
    } finally {
      setPassSaving(false);
    }
  }

  // Add Vehicle API
  async function handleAddVehicle(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const cleanPayload = { ...form };
      if (!cleanPayload.year) delete cleanPayload.year;
      else cleanPayload.year = parseInt(cleanPayload.year, 10);
      if (!cleanPayload.model) delete cleanPayload.model;

      const currentYear = new Date().getFullYear();
      if (cleanPayload.year && (cleanPayload.year < 1900 || cleanPayload.year > currentYear)) {
        throw new Error(`Năm sản xuất không được lớn hơn năm hiện tại (${currentYear})`);
      }

      const res = await fetch(`${apiBase || API_BASE}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cleanPayload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let errMsg = errData.message || errData.error;
        if (!errMsg && Array.isArray(errData.errors) && errData.errors.length > 0) {
          errMsg = errData.errors.map(err => err.msg).join(', ');
        }
        throw new Error(errMsg || 'Thêm xe thất bại');
      }
      const payload = await res.json();
      const newVehicle = payload?.data || payload;
      setVehicles(prev => [...prev, newVehicle]);
      setShowAddVehicle(false);
      setForm({ licensePlate: '', vehicleType: 'sedan', brand: '', model: '', color: '', year: '' });
      fireToast.success('Thêm phương tiện thành công');
    } catch (e) {
      fireToast.error(e.message || 'Thêm xe thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  // Edit Vehicle API
  async function handleUpdateVehicle(e) {
    e.preventDefault();
    const vId = editVehicle?._id || editVehicle?.id;
    if (!vId) return;
    setEditSubmitting(true);
    try {
      const cleanPayload = { ...editFormVehicle };
      if (!cleanPayload.year) delete cleanPayload.year;
      else cleanPayload.year = parseInt(cleanPayload.year, 10);
      if (!cleanPayload.model) delete cleanPayload.model;

      const currentYear = new Date().getFullYear();
      if (cleanPayload.year && (cleanPayload.year < 1900 || cleanPayload.year > currentYear)) {
        throw new Error(`Năm sản xuất không được lớn hơn năm hiện tại (${currentYear})`);
      }

      const res = await fetch(`${apiBase || API_BASE}/vehicles/${vId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(cleanPayload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        let errMsg = errData.message || errData.error;
        if (!errMsg && Array.isArray(errData.errors) && errData.errors.length > 0) {
          errMsg = errData.errors.map(err => err.msg).join(', ');
        }
        throw new Error(errMsg || 'Cập nhật xe thất bại');
      }
      const payload = await res.json();
      const updated = payload?.data || payload;
      setVehicles(prev => prev.map(v => ((v._id || v.id) === vId ? updated : v)));
      setShowEditVehicle(false);
      setEditVehicle(null);
      fireToast.success('Đã cập nhật xe thành công');
    } catch (e) {
      fireToast.error(e.message || 'Cập nhật xe thất bại');
    } finally {
      setEditSubmitting(false);
    }
  }

  function openEditVehicle(v) {
    setEditVehicle(v);
    setEditFormVehicle({
      licensePlate: v.licensePlate || '',
      vehicleType: v.vehicleType || 'sedan',
      brand: v.brand || '',
      model: v.model || '',
      color: v.color || '',
      year: v.year || '',
    });
    setShowEditVehicle(true);
  }

  // Delete Vehicle API
  async function handleDeleteVehicle(vehicle) {
    const vId = vehicle._id || vehicle.id;
    const plate = vehicle.licensePlate || '';
    const brandModel = [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Xe';

    if (!(await confirmDialog({
      title: 'Xóa phương tiện',
      confirmLabel: 'Xóa',
      danger: true,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Bạn có chắc chắn muốn xóa phương tiện này? Hành động này không thể hoàn tác.</p>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{brandModel}</p>
              <p className="text-xs text-slate-500">{plate} · {vehicle.vehicleType || ''} · {vehicle.color || ''}</p>
            </div>
          </div>
        </div>
      ),
    }))) return;

    try {
      const res = await fetch(`${apiBase || API_BASE}/vehicles/${vId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || 'Xóa xe thất bại');
      }
      setVehicles(prev => prev.filter(v => (v._id || v.id) !== vId));
      fireToast.success('Đã xóa xe thành công');
    } catch (e) {
      if (e.message.includes('lịch hẹn đang hoạt động')) {
        const msg = e.message;
        const countMatch = msg.match(/(\d+)\s*lịch hẹn/);
        const count = countMatch ? parseInt(countMatch[1]) : 0;
        const codesMatch = msg.match(/Mã:\s*(.+)/);
        const codesRaw = codesMatch ? codesMatch[1].trim() : '';
        const bookingItems = codesRaw.split(/,\s*/).filter(Boolean);
        const bookings = bookingItems.map(item => {
          const m = item.match(/(\S+)\s*\((.+?)\s+(\S+)\)/);
          return m ? { code: m[1], date: m[2], time: m[3] } : { code: item, date: '', time: '' };
        });

        await confirmDialog({
          title: 'Không thể xóa phương tiện',
          hideCancel: true,
          confirmLabel: 'Đã hiểu',
          content: (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/70">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 mt-0.5 shadow-xs">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-amber-900">Bảo vệ liên kết dữ liệu hệ thống</h4>
                  <p className="text-xs text-amber-800 leading-relaxed font-medium">
                    Xe <strong>{plate}</strong> đang có <strong>{count} lịch hẹn đang hoạt động</strong>. Vui lòng hoàn thành hoặc hủy các lịch hẹn này trước khi xóa xe.
                  </p>
                </div>
              </div>
              {bookings.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
                    Các lịch hẹn đang hoạt động:
                  </span>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                    {bookings.slice(0, 4).map((b, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                        <span className="text-base shrink-0">📅</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{b.code}</p>
                          <p className="text-xs text-slate-500">{b.date} · {b.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ),
        });
      } else {
        fireToast.error(e.message || 'Xóa xe thất bại');
      }
    }
  }

  // Tier info calculation
  const effectiveTierMap = tierConfig || FALLBACK_TIER_MAP;
  const currentTierId = (user?.tier || 'bronze').toLowerCase();
  const currentTierObj = effectiveTierMap[currentTierId] || FALLBACK_TIER_MAP.bronze;

  const currentPoints = user?.lifetimePoints ?? user?.totalPointsEarned ?? user?.loyaltyPoints ?? 0;
  const availableRewardPoints = user?.loyaltyPoints || 0;
  const spinCount = user?.spinCount || 0;

  // Dynamic tier ordering sorted by minPoints from API
  const sortedTiers = tierList.length > 0
    ? [...tierList].sort((a, b) => (a.minPoints || 0) - (b.minPoints || 0))
    : [{ id: 'bronze' }, { id: 'silver' }, { id: 'gold' }, { id: 'diamond' }];
  const currentIndex = sortedTiers.findIndex(t => (t.id || '').toLowerCase() === currentTierId);
  const nextTierRaw = (currentIndex >= 0 && currentIndex < sortedTiers.length - 1) ? sortedTiers[currentIndex + 1] : null;
  const nextTierId = nextTierRaw?.id || null;
  const nextTierObj = nextTierId ? (effectiveTierMap[nextTierId] || FALLBACK_TIER_MAP[nextTierId]) : null;

  const currentMin = currentTierObj?.minPoints || 0;
  const nextMin = nextTierObj?.minPoints || currentMin;
  const progressPercent = nextTierObj
    ? Math.min(100, Math.max(0, ((currentPoints - currentMin) / (nextMin - currentMin)) * 100))
    : 100;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 animate-in fade-in duration-300">
      
      {/* HERO USER PROFILE CARD */}
      <div className="relative rounded-3xl bg-white border border-slate-200/80 p-6 md:p-8 shadow-sm overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="relative flex items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* AVATAR WITH CAMERA OVERLAY BUTTON */}
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white text-3xl font-extrabold shadow-md ring-4 ring-emerald-50 overflow-hidden group">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name || 'Avatar'} className="w-full h-full object-cover" />
              ) : (
                (user?.name || user?.email || 'U').charAt(0).toUpperCase()
              )}
              <button onClick={() => setShowEditProfileModal(true)} title="Đổi ảnh đại diện"
                className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer">
                <Camera className="w-6 h-6" />
              </button>
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white z-10 pointer-events-none">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-800 truncate">{user?.name || (currentLang === 'en' ? 'Customer' : 'Khách hàng')}</h1>
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-0.5 text-xs font-bold ${currentTierObj.bg || 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  <Award className="w-3.5 h-3.5" />
                  {translateText(currentTierObj.label, currentLang) || (currentLang === 'en' ? 'Member' : 'Thành viên')}
                </span>
              </div>
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{user?.email}</span>
              </p>
              {user?.phone && (
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{user?.phone}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 3 STAT CARDS */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 p-5 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">{translateText('ĐIỂM THƯỞNG', currentLang)}</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                <Gift className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-emerald-700 font-mono tracking-tight">{formatCurrency(availableRewardPoints)}</p>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">{translateText('Dùng để đổi Voucher & quà ưu đãi', currentLang)}</p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/60 to-sky-50/40 p-5 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">{translateText('XE ĐÃ ĐĂNG KÝ', currentLang)}</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm">
                <Car className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-blue-700 font-mono tracking-tight">{vehicles.length}</p>
            <p className="text-[11px] text-blue-600 font-medium mt-1">{translateText('Phương tiện lưu trong tài khoản', currentLang)}</p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/60 to-orange-50/40 p-5 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">{translateText('LƯỢT QUAY MAY MẮN', currentLang)}</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-amber-700 font-mono tracking-tight">{spinCount}</p>
            <p className="text-[11px] text-amber-600 font-medium mt-1">{translateText('Lượt quay may mắn nhận quà', currentLang)}</p>
          </div>
        </div>

        {/* TIER PROGRESS BAR */}
        {nextTierObj && (
          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
              <span className="uppercase tracking-wider">
                {currentLang === 'en'
                  ? `${translateText(nextTierObj.label, currentLang).toUpperCase()} TIER PROGRESS`
                  : `TIẾN TRÌNH LÊN HẠNG ${nextTierObj.label?.toUpperCase()}`}
              </span>
              <span className="font-mono text-emerald-700">{formatCurrency(currentPoints)} / {formatCurrency(nextMin)} {currentLang === 'en' ? 'pts' : 'điểm'}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-2 font-medium">
              {currentLang === 'en'
                ? `You need ${formatCurrency(Math.max(0, nextMin - currentPoints))} more points to upgrade to ${translateText(nextTierObj.label, currentLang)} tier.`
                : `Bạn cần tích lũy thêm ${formatCurrency(Math.max(0, nextMin - currentPoints))} điểm để nâng lên hạng ${nextTierObj.label}.`}
            </p>
          </div>
        )}
      </div>

      {/* 2 COLUMNS LAYOUT FOR INFO + SECURITY */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* SECTION 1: THÔNG TIN TÀI KHOẢN */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">{translateText('Thông tin cá nhân', currentLang)}</h2>
                <p className="text-xs text-slate-500">{translateText('Cập nhật họ tên, sđt và ảnh đại diện', currentLang)}</p>
              </div>
            </div>

            <button onClick={() => setShowEditProfileModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs">
              <Edit2 className="w-3.5 h-3.5" /> {translateText('Chỉnh sửa', currentLang)}
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{translateText('HỌ VÀ TÊN', currentLang)}</span>
              <p className="text-sm font-semibold text-slate-800">{user?.name || (currentLang === 'en' ? 'Not updated' : 'Chưa cập nhật')}</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{translateText('SỐ ĐIỆN THOẠI', currentLang)}</span>
              <p className="text-sm font-semibold text-slate-800">{user?.phone || (currentLang === 'en' ? 'Not updated' : 'Chưa cập nhật')}</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{translateText('EMAIL (KHÔNG THỂ THAY ĐỔI)', currentLang)}</span>
              <p className="text-sm font-semibold text-slate-600">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* SECTION 2: BẢO MẬT & ĐỔI MẬT KHẨU */}
        <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">{translateText('Đổi mật khẩu', currentLang)}</h2>
                <p className="text-xs text-slate-500">{translateText('Cập nhật mật khẩu bảo vệ tài khoản', currentLang)}</p>
              </div>
            </div>

            <button onClick={() => setShowChangePassModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs">
              <Edit2 className="w-3.5 h-3.5" /> {translateText('Chỉnh sửa', currentLang)}
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
              <div>
                <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{translateText('MẬT KHẨU', currentLang)}</span>
                <p className="text-sm font-mono font-bold text-slate-800">••••••••</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4" /> {translateText('Đã bảo vệ', currentLang)}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{translateText('XÁC THỰC TÀI KHOẢN', currentLang)}</span>
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {translateText('Đã liên kết với email', currentLang)} {user?.email}
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* SECTION 3: DANH SÁCH PHƯƠNG TIỆN */}
      <div className="rounded-3xl bg-white border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{translateText('Phương tiện của tôi', currentLang)} ({vehicles.length})</h2>
              <p className="text-xs text-slate-500">{translateText('Danh sách các xe dùng để đặt lịch dịch vụ rửa xe', currentLang)}</p>
            </div>
          </div>

          <button onClick={() => setShowAddVehicle(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> {translateText('+ Thêm xe mới', currentLang)}
          </button>
        </div>

        {vehicles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
            <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">Chưa có phương tiện nào được đăng ký</p>
            <p className="text-xs text-slate-400 mt-1">Thêm xe mới để thực hiện đặt lịch rửa xe nhanh chóng</p>
            <button onClick={() => setShowAddVehicle(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors">
              <Plus className="w-4 h-4" /> Thêm xe ngay
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {vehicles.map((v) => {
              const vId = v._id || v.id;
              const brandModel = [v.brand, v.model].filter(Boolean).join(' ') || 'Phương tiện';
              return (
                <div key={vId} className="group relative rounded-2xl border border-slate-200 bg-white p-5 hover:border-emerald-300 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <span className="inline-block rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-mono font-bold text-emerald-400 tracking-wider">
                        {v.licensePlate}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditVehicle(v)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Sửa">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteVehicle(v)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Xóa">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-slate-800">{brandModel}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 capitalize">{v.vehicleType || 'sedan'}</span>
                    {v.color && <span className="rounded-md bg-slate-100 px-2 py-0.5">{translateText(v.color, currentLang)}</span>}
                    {v.year && <span className="rounded-md bg-slate-100 px-2 py-0.5">{v.year}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL SỬA THÔNG TIN CÁ NHÂN & ẢNH ĐẠI DIỆN */}
      <AnimatePresence>
        {showEditProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-800">Chỉnh sửa thông tin cá nhân</h3>
                <button onClick={() => setShowEditProfileModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-5">
                
                {/* AVATAR EDIT SECTION */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Ảnh đại diện</label>
                  <div className="flex items-center gap-4">
                    <div className="relative h-16 w-16 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-extrabold text-2xl overflow-hidden ring-2 ring-emerald-100">
                      {profileForm.avatar ? (
                        <img src={profileForm.avatar} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        (profileForm.name || 'U').charAt(0).toUpperCase()
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      <input type="file" ref={avatarInputRef} accept="image/*" onChange={handleAvatarFileSelect} hidden />
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => avatarInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs">
                          <Upload className="w-3.5 h-3.5" /> Chọn từ máy
                        </button>
                        {profileForm.avatar && (
                          <button type="button" onClick={() => setProfileForm({ ...profileForm, avatar: '' })}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors">
                            Xóa ảnh
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hoặc dán URL link ảnh đại diện</label>
                    <div className="relative">
                      <LinkIcon className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input type="text" value={profileForm.avatar} onChange={e => setProfileForm({ ...profileForm, avatar: e.target.value })}
                        placeholder="https://example.com/avatar.jpg" className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2.5 text-xs text-slate-800 focus:border-emerald-500 outline-none" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Họ và tên *</label>
                    <input type="text" value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                      required className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Số điện thoại</label>
                    <input type="text" value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })}
                      placeholder="Nhập số điện thoại" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email (Không thể thay đổi)</label>
                    <input type="email" value={user?.email || ''} disabled
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed" />
                  </div>
                </div>

                <div className="pt-3 flex gap-3">
                  <button type="button" onClick={() => setShowEditProfileModal(false)}
                    className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                    Hủy
                  </button>
                  <button type="submit" disabled={profileSaving}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm">
                    {profileSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL ĐỔI MẬT KHẨU */}
      <AnimatePresence>
        {showChangePassModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl border border-slate-100 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-800">Đổi mật khẩu</h3>
                <button onClick={() => setShowChangePassModal(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Mật khẩu hiện tại *</label>
                  <input type="password" value={passForm.currentPassword} onChange={e => setPassForm({ ...passForm, currentPassword: e.target.value })}
                    required placeholder="••••••••" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Mật khẩu mới *</label>
                  <input type="password" value={passForm.newPassword} onChange={e => setPassForm({ ...passForm, newPassword: e.target.value })}
                    required placeholder="Tối thiểu 6 ký tự" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Xác nhận mật khẩu mới *</label>
                  <input type="password" value={passForm.confirmPassword} onChange={e => setPassForm({ ...passForm, confirmPassword: e.target.value })}
                    required placeholder="Nhập lại mật khẩu mới" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all outline-none" />
                </div>

                <div className="pt-3 flex gap-3">
                  <button type="button" onClick={() => setShowChangePassModal(false)}
                    className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                    Hủy
                  </button>
                  <button type="submit" disabled={passSaving}
                    className="flex-1 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm">
                    {passSaving ? 'Đang lưu...' : 'Cập nhật mật khẩu'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL THÊM XE */}
      <AnimatePresence>
        {showAddVehicle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl border border-slate-100 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-800">Thêm phương tiện mới</h3>
                <button onClick={() => setShowAddVehicle(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddVehicle} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Biển số xe *</label>
                  <input type="text" value={form.licensePlate} onChange={e => setForm({ ...form, licensePlate: e.target.value })}
                    required onInvalid={e => e.target.setCustomValidity('Vui lòng nhập biển số xe.')} onInput={e => e.target.setCustomValidity('')}
                    placeholder="Ví dụ: 30A-123.45" className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 uppercase focus:border-emerald-500 outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Hãng xe</label>
                    <input type="text" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })}
                      placeholder="Toyota, Honda..." className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Dòng xe</label>
                    <input type="text" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
                      placeholder="Camry, Civic..." className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Loại xe</label>
                    <select value={form.vehicleType} onChange={e => setForm({ ...form, vehicleType: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none">
                      <option value="sedan">Sedan (4 chỗ)</option>
                      <option value="suv">SUV / Crossover (5-7 chỗ)</option>
                      <option value="pickup">Bán tải (Pickup)</option>
                      <option value="van">Van / MPV</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Màu sắc</label>
                    <input type="text" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                      placeholder="Trắng, Đen..." className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Năm sản xuất (Tùy chọn)</label>
                  <input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}
                    placeholder="Ví dụ: 2023" min="1900" max={new Date().getFullYear()}
                    onInvalid={e => e.target.setCustomValidity(`Năm sản xuất phải nằm trong khoảng từ 1900 đến ${new Date().getFullYear()}.`)}
                    onInput={e => e.target.setCustomValidity('')}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none" />
                </div>

                <div className="pt-3 flex gap-3">
                  <button type="button" onClick={() => setShowAddVehicle(false)}
                    className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                    Hủy
                  </button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {submitting ? 'Đang thêm...' : 'Lưu phương tiện'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL SỬA XE */}
      <AnimatePresence>
        {showEditVehicle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl border border-slate-100 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-800">Cập nhật phương tiện</h3>
                <button onClick={() => setShowEditVehicle(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateVehicle} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Biển số xe *</label>
                  <input type="text" value={editFormVehicle.licensePlate} onChange={e => setEditFormVehicle({ ...editFormVehicle, licensePlate: e.target.value })}
                    required onInvalid={e => e.target.setCustomValidity('Vui lòng nhập biển số xe.')} onInput={e => e.target.setCustomValidity('')}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 uppercase focus:border-emerald-500 outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Hãng xe</label>
                    <input type="text" value={editFormVehicle.brand} onChange={e => setEditFormVehicle({ ...editFormVehicle, brand: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Dòng xe</label>
                    <input type="text" value={editFormVehicle.model} onChange={e => setEditFormVehicle({ ...editFormVehicle, model: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Loại xe</label>
                    <select value={editFormVehicle.vehicleType} onChange={e => setEditFormVehicle({ ...editFormVehicle, vehicleType: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none">
                      <option value="sedan">Sedan (4 chỗ)</option>
                      <option value="suv">SUV / Crossover (5-7 chỗ)</option>
                      <option value="pickup">Bán tải (Pickup)</option>
                      <option value="van">Van / MPV</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Màu sắc</label>
                    <input type="text" value={editFormVehicle.color} onChange={e => setEditFormVehicle({ ...editFormVehicle, color: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Năm sản xuất (Tùy chọn)</label>
                  <input type="number" value={editFormVehicle.year} onChange={e => setEditFormVehicle({ ...editFormVehicle, year: e.target.value })}
                    placeholder="Ví dụ: 2023" min="1900" max={new Date().getFullYear()}
                    onInvalid={e => e.target.setCustomValidity(`Năm sản xuất phải nằm trong khoảng từ 1900 đến ${new Date().getFullYear()}.`)}
                    onInput={e => e.target.setCustomValidity('')}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 focus:border-emerald-500 outline-none" />
                </div>

                <div className="pt-3 flex gap-3">
                  <button type="button" onClick={() => setShowEditVehicle(false)}
                    className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                    Hủy
                  </button>
                  <button type="submit" disabled={editSubmitting}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {editSubmitting ? 'Đang cập nhật...' : 'Lưu thay đổi'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
