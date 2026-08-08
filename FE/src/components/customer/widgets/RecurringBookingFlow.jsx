import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Plus, Car, Truck, Bike } from 'lucide-react';
import VoucherPicker from '../../VoucherPicker.jsx';
import { useSystemConfig } from '@/hooks/useSystemConfig';

const VEHICLE_TYPES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'van', label: 'Van' },
];

const WEEKDAYS = [
  { value: 1, label: 'T2', full: 'Thứ 2' },
  { value: 2, label: 'T3', full: 'Thứ 3' },
  { value: 3, label: 'T4', full: 'Thứ 4' },
  { value: 4, label: 'T5', full: 'Thứ 5' },
  { value: 5, label: 'T6', full: 'Thứ 6' },
  { value: 6, label: 'T7', full: 'Thứ 7' },
  { value: 0, label: 'CN', full: 'Chủ Nhật' },
];
const DEFAULT_WEEKS_OPTIONS = [2, 4, 8, 12, 16, 20, 24];
const WEEKS_OPTIONS = DEFAULT_WEEKS_OPTIONS;
const TIME_SLOTS = [
  '07:00','07:30','08:00','08:30','09:00','09:30',
  '10:00','10:30','11:00','11:30','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00',
];

function formatCurrency(v) {
  return `${new Intl.NumberFormat('vi-VN').format(v || 0)}đ`;
}

function buildPreviewDates(weekdays, weeks) {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const c = new Date(today);
      c.setDate(today.getDate() + w * 7 + d);
      if (weekdays.includes(c.getDay()) && c >= today) dates.push(c);
    }
  }
  return dates;
}

export default function RecurringBookingFlow({ user, vehicles: userVehicles = [], apiBase, token }) {
  const [branches, setBranches] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loyaltyConfig, setLoyaltyConfig] = useState(null);
  const configs = useSystemConfig();

  useEffect(() => {
    async function loadLoyaltyConfig() {
      try {
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const res = await fetch(`${apiBase}/loyalty/config`);
        const payload = await res.json();
        if (payload?.data) setLoyaltyConfig(payload.data);
        else if (payload?.tiers) setLoyaltyConfig(payload);
      } catch (e) { console.error(e); }
    }
    loadLoyaltyConfig();
  }, []);

  // ─── Step state ──────────────────────────────────────────────────────────────
  const [selectedBranch, setSelectedBranch] = useState('');    // STEP 1 (must pick first)
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('');
  const [selectedSubServices, setSelectedSubServices] = useState({});
  const [selectedWeekdays, setSelectedWeekdays] = useState([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [weeks, setWeeks] = useState(2);
  const [weeksInput, setWeeksInput] = useState('2');
  const [weeksError, setWeeksError] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);

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
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingVehicle(false);
    }
  }

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const bRes = await fetch(`${apiBase}/branches`, { headers: { Authorization: `Bearer ${token}` } });
        const bData = await bRes.json();
        const bList = (bData?.data || bData || []).map(b => ({ ...b, id: b._id || b.id }));
        setBranches(Array.isArray(bList) ? bList : []);
      } catch (e) { console.error(e); }
    }
    if (token) load();
  }, [apiBase, token]);

  useEffect(() => {
    if (!selectedBranch) { setPackages([]); return; }
    async function loadPackages() {
      try {
        const pRes = await fetch(`${apiBase}/packages?branchId=${selectedBranch}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const pData = await pRes.json();
        const pList = (pData?.data || pData || []).filter(p => p.status === 'active').map(p => ({ ...p, id: p._id || p.id }));
        setPackages(Array.isArray(pList) ? pList : []);
        if (pList.length > 0 && !pList.find(p => p.id === selectedPackage)) {
          setSelectedPackage(pList[0].id);
        }
      } catch (e) { console.error(e); }
    }
    loadPackages();
  }, [selectedBranch, apiBase, token]);

  useEffect(() => {
    if (!selectedVehicle && allVehicles[0]) {
      setSelectedVehicle(allVehicles[0]._id || allVehicles[0].id || '');
    }
  }, [allVehicles.length, selectedVehicle]);

  const pkg = packages.find(p => p.id === selectedPackage);
  
  // Calculate extra duration and price from subservices
  let extraDuration = 0;
  let extraPrice = 0;
  const currentSubServices = selectedSubServices[selectedPackage] || [];
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
  const pkgDuration = pkg ? pkg.duration + extraDuration : 0;
  const estimatedTotalSessions = selectedWeekdays.length * weeks;
  
  // Total cost before voucher
  const recurringTotal = totalBase * estimatedTotalSessions;

  const previewDates = useMemo(() => buildPreviewDates(selectedWeekdays, weeks), [selectedWeekdays, weeks]);

  // Tính discount từ VoucherPicker
  const discountPerSession = useMemo(() => {
    if (!appliedVoucher || !pkg) return 0;
    if (appliedVoucher.type === 'percentage') {
      const d = Math.floor(totalBase * appliedVoucher.value / 100);
      return appliedVoucher.maxDiscount > 0 ? Math.min(d, appliedVoucher.maxDiscount) : d;
    }
    return Math.min(appliedVoucher.value || 0, totalBase);
  }, [appliedVoucher, pkg, totalBase]);

  const pricePerSession = Math.max(0, totalBase - discountPerSession);

  const userTierObj = (loyaltyConfig?.tiers || []).find(t => (t.id || '').toLowerCase() === (user?.tier || 'bronze').toLowerCase());
  const pointMultiplier = userTierObj?.multiplier ?? 1.0;

  const baseRate = loyaltyConfig?.baseEarningRate 
    ? (loyaltyConfig.baseEarningRate / 100) 
    : (configs?.LOYALTY_BASE_EARNING_RATE ? (configs.LOYALTY_BASE_EARNING_RATE / 100) : 0.05);
  const pointsPerSession = Math.floor(pricePerSession * baseRate * pointMultiplier);

  const maxRecurringWeeks = Number(configs?.MAX_RECURRING_WEEKS) || 24;
  const activeWeeksOptions = (Array.isArray(configs?.RECURRING_WEEKS_OPTIONS) && configs.RECURRING_WEEKS_OPTIONS.length > 0)
    ? configs.RECURRING_WEEKS_OPTIONS
    : DEFAULT_WEEKS_OPTIONS;

  function toggleWeekday(v) {
    setSelectedWeekdays(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  }

  function handleWeeksInput(e) {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setWeeksInput(raw);
    const n = raw === '' ? 0 : parseInt(raw, 10);
    if (raw === '' || !Number.isInteger(n) || n < 2) {
      setWeeksError('Số tuần phải là số nguyên dương lớn hơn 1');
      setWeeks(n);
      return;
    }
    if (n > maxRecurringWeeks) {
      setWeeksError(`Số tuần tối đa được phép đặt là ${maxRecurringWeeks} tuần`);
      setWeeks(n);
      return;
    }
    setWeeksError('');
    setWeeks(n);
  }

  function selectWeek(w) {
    setWeeks(w);
    setWeeksInput(String(w));
    setWeeksError('');
  }

  async function handleSubmit() {
    if (!selectedBranch || !selectedVehicle || !selectedPackage || selectedWeekdays.length === 0 || !selectedTime) {
      setError('Vui lòng điền đầy đủ thông tin (chi nhánh, xe, gói, ngày trong tuần, giờ).');
      return;
    }
    if (!Number.isInteger(weeks) || weeks < 2 || weeks > maxRecurringWeeks) {
      setError(`Số tuần lặp lại phải từ 2 đến ${maxRecurringWeeks} tuần.`);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const body = {
        branchId: selectedBranch,
        packageId: selectedPackage,
        vehicleId: selectedVehicle,
        weekdays: selectedWeekdays,
        startTime: selectedTime,
        weeks,
        voucherCode: appliedVoucher?.code || undefined,
        selectedSubServices: currentSubServices,
        note: '',
      };
      const res = await fetch(`${apiBase}/bookings/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi tạo lịch định kỳ');
      setResult(data.data || data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const getVehicleIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('motor') || t.includes('máy')) return <Bike className="w-5 h-5" />;
    if (t.includes('suv') || t.includes('truck') || t.includes('pickup') || t.includes('van')) return <Truck className="w-5 h-5" />;
    return <Car className="w-5 h-5" />;
  };

  // Resolve current user's tier info from API config
  const userTierObj = (() => {
    const tiers = loyaltyConfig?.tiers || [];
    return tiers.find(t => (t.id || '').toLowerCase() === (user?.tier || 'bronze').toLowerCase());
  })();
  const tierColor = userTierObj?.color || '#adb5bd';
  const tierLabel = userTierObj?.name || user?.tier || 'Bronze';
  const branchObj = branches.find(b => b.id === selectedBranch);

  return (
    <div className="rb-wrapper">
      {/* Header */}
      <div className="rb-header">
        <div>
          <div className="aw-section-kicker">📅 BOOKING ĐỊNH KỲ</div>
          <h2 className="rb-title">Đặt lịch lặp lại hằng tuần</h2>
          <p className="rb-sub">Chọn địa điểm → ngày trong tuần → khung giờ cố định. Hệ thống tự tạo tất cả lịch hẹn.</p>
        </div>
        <div className="rb-tier-badge" style={{ borderColor: tierColor, color: tierColor }}>
          {tierLabel}
          <small>Ưu tiên phục vụ</small>
        </div>
      </div>

      {/* ─── STEP 0: Chọn địa điểm (TRƯỚC TIÊN) ─────────────────────── */}
      <article className="aw-card-section loc-section">
        <div className="aw-step-title loc-title">
          <span>📍</span> BƯỚC 1: CHỌN ĐỊA ĐIỂM CHI NHÁNH
          {selectedBranch && <span className="loc-selected-name"> — {branchObj?.name}</span>}
        </div>
        <div className="loc-branches-grid">
          {branches.length === 0 ? (
            <div className="aw-empty-state">Đang tải chi nhánh...</div>
          ) : branches.map(b => (
            <button key={b.id} type="button"
              className={b.id === selectedBranch ? 'loc-branch-card active' : 'loc-branch-card'}
              onClick={() => setSelectedBranch(b.id)}>
              <div className="loc-branch-icon">🏪</div>
              <div className="loc-branch-body">
                <strong>{b.name}</strong>
                <p>{b.address}</p>
                {b.openingTime && (
                  <span className="loc-branch-hours">⏰ {b.openingTime} – {b.closingTime}</span>
                )}
              </div>
              {b.id === selectedBranch && <div className="loc-check">✓</div>}
            </button>
          ))}
        </div>
      </article>

      {/* Chỉ hiện khi đã chọn chi nhánh */}
      {selectedBranch && (
        <div className="rb-grid">
          <div className="rb-flow">
            {/* Step 2: Xe */}
            <article className="aw-card-section">
              <div className="aw-step-title"><span>2</span> CHỌN XE</div>
              <div className="aw-options two-up">
                {hasNoVehicles ? (
                  <div className="max-w-xl mx-auto">
                    <p className="text-sm text-slate-500 font-medium mb-4 text-center">Bạn chưa có xe nào. Vui lòng thêm xe mới:</p>
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
                ) : allVehicles.map(v => {
                  const vid = v._id || v.id;
                  const vname = v.name || `${v.brand || ''} ${v.model || ''}`.trim() || v.licensePlate;
                  return (
                    <button key={vid} type="button"
                      className={vid === selectedVehicle ? 'aw-option active' : 'aw-option'}
                      onClick={() => setSelectedVehicle(vid)}>
                      <div className="aw-option-head"><strong>{vname}</strong><span>{vid === selectedVehicle ? '●' : '○'}</span></div>
                      <p>{v.licensePlate || v.plate}</p>
                      <small>{v.vehicleType || v.type}</small>
                    </button>
                  );
                })}
              </div>
            </article>

            {/* Step 3: Gói dịch vụ */}
            <article className="aw-card-section">
              <div className="aw-step-title"><span>3</span> GÓI DỊCH VỤ</div>
              <div className="aw-options stacked scrollable" style={{ maxHeight: 300 }}>
                {packages.map(p => {
                  const isActive = p.id === selectedPackage;
                  return (
                    <div key={p.id} className={isActive ? 'aw-option aw-service active' : 'aw-option aw-service'}>
                      <button type="button" style={{all: 'unset', width: '100%', cursor: 'pointer'}} onClick={() => setSelectedPackage(p.id)}>
                        <div className="aw-option-head service-head">
                          <div><strong>{p.name}</strong><small>{p.duration} phút</small></div>
                          <span>{formatCurrency(p.price)}</span>
                        </div>
                        <p style={{margin: '8px 0'}}>{p.description}</p>
                      </button>
                      
                      {isActive && p.subServices && p.subServices.length > 0 && (() => {
                        const included = p.subServices.filter(sub => sub.isOptional === false);
                        const optional = p.subServices.filter(sub => sub.isOptional !== false);
                        return (
                          <div style={{ marginTop: '10px', padding: '10px', background: '#f1f5f9', borderRadius: '8px' }}>
                            {included.length > 0 && (
                              <div style={{ marginBottom: optional.length > 0 ? '12px' : 0 }}>
                                <strong style={{ fontSize: '0.85rem', color: '#10b981', display: 'block', marginBottom: '8px' }}>Dịch vụ bao gồm:</strong>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {included.map(sub => (
                                    <span key={sub.name} style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '8px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                                      {sub.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {optional.length > 0 && (
                              <div>
                                <strong style={{ fontSize: '0.85rem', color: '#10b981', display: 'block', marginBottom: '8px' }}>Dịch vụ chọn thêm:</strong>
                                {optional.map((sub) => {
                                  const isChecked = (selectedSubServices[p.id] || []).includes(sub.name);
                                  return (
                                    <label key={sub.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                                      <input 
                                        type="checkbox" 
                                        checked={isChecked}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          setSelectedSubServices(prev => {
                                            const current = prev[p.id] || [];
                                            return {
                                              ...prev,
                                              [p.id]: checked ? [...current, sub.name] : current.filter(x => x !== sub.name)
                                            };
                                          });
                                        }}
                                      />
                                      <span style={{ flex: 1 }}>{sub.name} (+{sub.duration}p)</span>
                                      <span style={{ color: '#10b981', fontWeight: 'bold' }}>{sub.price > 0 ? `+${formatCurrency(sub.price)}` : 'Miễn phí'}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </article>

            {/* Step 4: Ngày + giờ + tuần */}
            <article className="aw-card-section">
              <div className="aw-step-title"><span>4</span> LỊCH ĐỊNH KỲ</div>
              <div className="rb-weekdays">
                {WEEKDAYS.map(d => (
                  <button key={d.value} type="button"
                    className={selectedWeekdays.includes(d.value) ? 'rb-day active' : 'rb-day'}
                    onClick={() => toggleWeekday(d.value)}>
                    <span>{d.label}</span>
                  </button>
                ))}
              </div>
              <div className="aw-slot-title">CHỌN KHUNG GIỜ CỐ ĐỊNH</div>
              <div className="aw-time-grid">
                {TIME_SLOTS.map(t => (
                  <button key={t} type="button"
                    className={t === selectedTime ? 'aw-time-card active' : 'aw-time-card'}
                    onClick={() => setSelectedTime(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 mb-2">
                <div className="aw-slot-title mb-0">SỐ TUẦN LẶP LẠI</div>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Tối đa {maxRecurringWeeks} tuần
                </span>
              </div>
              <div className="rb-weeks-grid">
                {activeWeeksOptions.map(w => (
                  <button key={w} type="button"
                    className={w === weeks ? 'rb-week-btn active' : 'rb-week-btn'}
                    onClick={() => selectWeek(w)}>
                    {w} tuần
                  </button>
                ))}
              </div>
              <div className="rb-weeks-manual flex-wrap">
                <span className="rb-weeks-manual-label">HOẶC NHẬP SỐ TUẦN:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={weeksError ? 'rb-weeks-manual-input error' : 'rb-weeks-manual-input'}
                  value={weeksInput}
                  onChange={handleWeeksInput}
                  placeholder={`2 - ${maxRecurringWeeks}`}
                  aria-label="Số tuần lặp lại"
                />
                <span className="text-xs text-slate-400 font-medium">
                  (Được phép nhập tối đa <strong className="text-slate-600 font-bold">{maxRecurringWeeks}</strong> tuần)
                </span>
                {weeksError && <span className="rb-weeks-manual-error w-full">{weeksError}</span>}
              </div>
            </article>

            {/* Step 5: Voucher */}
            <article className="aw-card-section" style={{ padding: 0 }}>
              <VoucherPicker
                apiBase={apiBase}
                token={token}
                selected={appliedVoucher}
                onSelect={setAppliedVoucher}
                orderAmount={totalBase}
              />
            </article>
          </div>

          {/* Right: Summary */}
          <aside className="aw-summary">
            <div className="aw-summary-card">
              <div className="aw-summary-title">TỔNG KẾT ĐỊNH KỲ</div>

              <div className="aw-summary-row">
                <span>Chi nhánh:</span><strong>{branchObj?.name || '—'}</strong>
              </div>
              <div className="aw-summary-row">
                <span>Gói dịch vụ:</span><strong>{pkg?.name || '—'}</strong>
              </div>
              <div className="aw-summary-row">
                <span>Ngày:</span>
                <strong>{selectedWeekdays.length > 0 ? selectedWeekdays.map(v => WEEKDAYS.find(d => d.value === v)?.label).join(', ') : '—'}</strong>
              </div>
              <div className="aw-summary-row">
                <span>Khung giờ:</span>
                <strong className={selectedTime ? 'is-positive' : 'is-warning'}>{selectedTime || 'Chưa chọn'}</strong>
              </div>
              <div className="aw-summary-row">
                <span>Số tuần:</span><strong>{weeks} tuần</strong>
              </div>
              <div className="aw-summary-row">
                <span>Số buổi dự kiến:</span>
                <strong style={{ color: '#3de0ff' }}>{previewDates.length} buổi</strong>
              </div>

              <div className="aw-summary-divider" />

              {appliedVoucher && (
                <div className="aw-summary-row">
                  <span>Voucher ({appliedVoucher.code}):</span>
                  <strong style={{ color: '#10b981' }}>−{formatCurrency(discountPerSession)}/buổi</strong>
                </div>
              )}

              <div className="aw-pricing">
                <div>
                  <span>GIÁ / BUỔI</span>
                  <strong>{formatCurrency(pricePerSession)}</strong>
                </div>
                <div>
                  <span>TỔNG DỰ KIẾN</span>
                  <strong style={{ color: '#ffb86b' }}>{pkg ? formatCurrency(pricePerSession * previewDates.length) : '—'}</strong>
                </div>
                {previewDates.length > 0 && pkg && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed rgba(148, 163, 184, 0.3)', width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                    <span>TÍCH ĐIỂM DỰ KIẾN</span>
                    <strong style={{ color: '#3de0ff' }}>+{pointsPerSession * previewDates.length} Điểm</strong>
                  </div>
                )}
              </div>

              {/* Preview dates */}
              {previewDates.length > 0 && (
                <div className="rb-preview">
                  <div className="rb-preview-title">📋 LỊCH DỰ KIẾN ({previewDates.length} buổi)</div>
                  <div className="rb-preview-list">
                    {previewDates.slice(0, 8).map((d, i) => (
                      <div key={i} className="rb-preview-item">
                        <span>{d.toLocaleDateString('vi-VN', { weekday: 'short' })}</span>
                        <strong>{d.toLocaleDateString('vi-VN')}</strong>
                      </div>
                    ))}
                    {previewDates.length > 8 && (
                      <div className="rb-preview-more">+{previewDates.length - 8} ngày nữa</div>
                    )}
                  </div>
                </div>
              )}

              {error && <div className="rb-error">{error}</div>}

              {result && (
                <div className="rb-result">
                  {result.totalCreated > 0 ? (
                    <div className="rb-result-ok">✓ Đã tạo {result.totalCreated} lịch hẹn!</div>
                  ) : null}
                  {result.totalCreated === 0 && (
                    <div className="rb-result-warn" style={{ color: '#ef4444', fontWeight: 'bold' }}>✗ Không thể tạo bất kỳ lịch hẹn nào do trùng khung giờ/quá khứ. Vui lòng chọn giờ khác!</div>
                  )}
                  {result.totalFailed > 0 && result.totalCreated > 0 && (
                    <div className="rb-result-warn" style={{ color: '#f59e0b', fontWeight: 'bold', marginTop: '8px' }}>⚠ {result.totalFailed} ngày bị bỏ qua (trùng slot/quá khứ).</div>
                  )}
                  <div style={{ marginTop: '8px' }}>
                    {result.failed?.slice(0, 5).map((f, i) => (
                      <div key={i} className="rb-result-failed">✗ {f.date}: {f.reason}</div>
                    ))}
                    {result.failed?.length > 5 && (
                      <div className="rb-result-failed">... và {result.failed.length - 5} ngày khác.</div>
                    )}
                  </div>
                </div>
              )}

              <button className="aw-confirm" type="button" onClick={handleSubmit}
                disabled={loading || previewDates.length === 0 || !selectedBranch}>
                {loading ? 'ĐANG TẠO LỊCH...' : `XÁC NHẬN ${previewDates.length} BUỔI`}
              </button>
            </div>
          </aside>
        </div>
      )}

      {!selectedBranch && (
        <div className="rb-pick-branch-hint">
          👆 Vui lòng chọn chi nhánh phía trên để tiến hành đặt lịch
        </div>
      )}
    </div>
  );
}
