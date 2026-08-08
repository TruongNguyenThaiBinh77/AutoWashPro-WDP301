import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '@/lib/authStorage';
import {
  MapPin, Clock, Phone, Envelope, ArrowRight, Tag,
  CaretLeft, Compass, Star, Ticket, X,
} from '@phosphor-icons/react';
import Navbar from '../layout/Navbar';
import Footer from '../layout/Footer';
import DirectionsMap from '../widgets/DirectionsMap';
import { useSystemConfig } from '@/hooks/useSystemConfig';

const API_BASE = getApiBaseUrl() || 'http://localhost:5000/api';

function fmtCurrency(n) {
  return new Intl.NumberFormat('vi-VN').format(n ?? 0) + 'đ';
}

const VOUCHER_TYPE_MAP = {
  percentage: 'Giảm %',
  fixed: 'Giảm tiền',
};

export default function BranchDetailPage({ onOpenAuth, user, onLogout, onGoToProfile, onGoToHistory, onGoToPayments, onGoToNotifications }) {
  const configs = useSystemConfig();
  const vatRate = configs?.VAT_PERCENT ? Math.round(configs.VAT_PERCENT) : 10;
  const location = useLocation();
  const navigate = useNavigate();
  const id = location.pathname.split('/').filter(Boolean).pop();
  const [branch, setBranch] = useState(null);
  const [packages, setPackages] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDirections, setShowDirections] = useState(false);
  const [dirMenuOpen, setDirMenuOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);

  useEffect(() => {
    if (!dirMenuOpen) return;
    const fn = (e) => { if (!e.target.closest('[data-dir-menu]')) setDirMenuOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [dirMenuOpen]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [bRes, pRes, vRes] = await Promise.all([
          fetch(`${API_BASE}/branches/public/${id}`),
          fetch(`${API_BASE}/packages?branchId=${id}`),
          fetch(`${API_BASE}/vouchers/public?branchId=${id}`),
        ]);
        const bData = await bRes.json().then(r => r?.data ?? r);
        const pData = await pRes.json().then(r => r?.data ?? r);
        const vData = await vRes.json().then(r => r?.data ?? r);
        setBranch(bData);
        setPackages(Array.isArray(pData) ? pData : Array.isArray(pData?.packages) ? pData.packages : []);
        setVouchers(Array.isArray(vData) ? vData : []);
      } catch (e) {
        console.error('Failed to load branch details', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar onOpenAuth={onOpenAuth} user={user} onLogout={onLogout} onGoToProfile={onGoToProfile} onGoToHistory={onGoToHistory} onGoToPayments={onGoToPayments} onGoToNotifications={onGoToNotifications} />
        <div className="max-w-6xl mx-auto px-4 py-12 space-y-6">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-[320px] animate-pulse rounded-2xl bg-slate-100" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
            <div className="space-y-4">
              <div className="h-6 w-3/4 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar onOpenAuth={onOpenAuth} user={user} onLogout={onLogout} onGoToProfile={onGoToProfile} onGoToHistory={onGoToHistory} onGoToPayments={onGoToPayments} onGoToNotifications={onGoToNotifications} />
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <MapPin size={48} weight="duotone" />
          <p className="mt-4 text-sm">Không tìm thấy chi nhánh</p>
          <button onClick={() => navigate('/map')} className="mt-3 text-xs font-medium text-emerald-600 hover:underline">
            Quay lại bản đồ
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  const coords = branch.location?.coordinates;
  const lat = coords?.[1];
  const lng = coords?.[0];
  const mapSrc = lat && lng
    ? `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`
    : '';

  const formattedHours = branch.openingTime && branch.closingTime
    ? `${branch.openingTime} - ${branch.closingTime}`
    : '07:00 - 18:00';

  function requestDirections() {
    if (!lat || !lng) return;
    setShowDirections(true);
    setDirMenuOpen(false);
  }

  function openGoogleMaps() {
    if (!lat || !lng) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    setDirMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar onOpenAuth={onOpenAuth} user={user} onLogout={onLogout} onGoToProfile={onGoToProfile} onGoToHistory={onGoToHistory} onGoToPayments={onGoToPayments} onGoToNotifications={onGoToNotifications} />

      {/* Back navigation */}
      <div className="border-b border-slate-100 bg-slate-50/50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2 text-xs text-slate-500">
          <button onClick={() => navigate('/map')} className="flex items-center gap-1 hover:text-emerald-600 transition-colors">
            <CaretLeft size={12} /> Cửa hàng
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium">{branch.name}</span>
        </div>
      </div>

      {/* Hero Branch Image */}
      {branch.image && (
        <div className="max-w-6xl mx-auto px-4 pt-8">
          <div
            className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm cursor-pointer group h-[320px] md:h-[400px]"
            onClick={() => setZoomImage(branch.image)}
          >
            <img
              src={branch.image}
              alt={branch.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">{branch.name}</h2>
              <p className="text-sm text-white/80 mt-1">{branch.address}</p>
            </div>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm text-slate-800 text-xs font-semibold px-4 py-2 rounded-full shadow-lg">
                🔍 Click để phóng to
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Branch header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">{branch.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{branch.address}</p>
        </div>

        {/* Map + Info grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-10">

          {/* Map */}
          <div className="lg:col-span-3 rounded-2xl overflow-hidden border border-slate-200 shadow-xs h-[320px] relative">
            {mapSrc ? (
              <>
                <iframe
                  src={mapSrc}
                  title="Bản đồ"
                  className="w-full h-full border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="absolute bottom-4 right-4 z-10" data-dir-menu>
                  <div className="relative">
                    <button
                      onClick={() => setDirMenuOpen((o) => !o)}
                      className="flex items-center gap-2 rounded-xl bg-white/95 backdrop-blur-md px-4 py-2.5 shadow-lg border border-slate-200 text-sm font-semibold text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all"
                    >
                      <Compass size={16} weight="bold" />
                      Chỉ đường
                    </button>
                    {dirMenuOpen && (
                      <div className="absolute bottom-full mb-2 right-0 w-52 rounded-xl bg-white shadow-xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-150">
                        <button
                          onClick={requestDirections}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                        >
                          <MapPin size={16} weight="duotone" className="shrink-0" />
                          <div>
                            <p className="font-medium">Chỉ đường trong trang</p>
                            <p className="text-[11px] text-slate-400">Xem bản đồ ngay tại đây</p>
                          </div>
                        </button>
                        <button
                          onClick={openGoogleMaps}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-t border-slate-100"
                        >
                          <Compass size={16} weight="duotone" className="shrink-0" />
                          <div>
                            <p className="font-medium">Mở Google Maps</p>
                            <p className="text-[11px] text-slate-400">Chỉ đường bằng ứng dụng</p>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full bg-slate-50 text-slate-400">
                <MapPin size={32} weight="duotone" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <MapPin size={16} weight="duotone" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 font-medium">Địa chỉ</p>
                  <p className="text-sm font-medium text-slate-700 mt-0.5">{branch.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Clock size={16} weight="duotone" />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Giờ mở cửa</p>
                  <p className="text-sm font-medium text-slate-700 mt-0.5">{formattedHours}</p>
                </div>
              </div>
              {branch.phone && (
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                    <Phone size={16} weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Số điện thoại</p>
                    <p className="text-sm font-medium text-slate-700 mt-0.5">{branch.phone}</p>
                  </div>
                </div>
              )}
              {branch.email && (
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <Envelope size={16} weight="duotone" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Email</p>
                    <p className="text-sm font-medium text-slate-700 mt-0.5">{branch.email}</p>
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => navigate(`/booking?branchId=${branch._id}`)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm">
              Đặt lịch tại đây
              <ArrowRight size={16} weight="bold" />
            </button>
          </div>
        </div>

        {/* Directions section */}
        {showDirections && lat && lng && (
          <div className="mb-10">
            <DirectionsMap
              destLat={lat}
              destLng={lng}
              destAddress={branch.address}
              destName={branch.name}
              onClose={() => setShowDirections(false)}
            />
          </div>
        )}

        {/* Packages */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Tag size={18} weight="duotone" className="text-emerald-500" />
            Gói dịch vụ
          </h2>
          {packages.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center bg-slate-50 rounded-2xl">Chưa có gói dịch vụ nào</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {packages.map(pkg => (
                <div key={pkg._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow">
                  <h3 className="font-semibold text-slate-800 text-sm mb-2">{pkg.name}</h3>
                  {pkg.description && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{pkg.description}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-emerald-600">{fmtCurrency(pkg.price)}</span>
                    {pkg.duration && <span className="text-xs text-slate-400">{pkg.duration} phút</span>}
                  </div>
                  <p className="text-[10px] font-medium text-slate-400 mt-1">* Giá đã bao gồm VAT {vatRate}%</p>
                  {pkg.rating && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-amber-500">
                      <Star size={12} weight="fill" />
                      <span>{pkg.rating}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vouchers */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Ticket size={18} weight="duotone" className="text-rose-500" />
            Voucher ưu đãi
          </h2>
          {vouchers.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center bg-slate-50 rounded-2xl">Chưa có voucher nào</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {vouchers.map(v => (
                <div key={v._id} className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5 shadow-xs">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-slate-800 text-sm">{v.name}</h3>
                      <p className="text-[11px] font-mono text-rose-500 mt-0.5">{v.code}</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-rose-100 text-rose-600 uppercase">
                      {VOUCHER_TYPE_MAP[v.type] || v.type}
                    </span>
                  </div>
                  {v.description && <p className="text-xs text-slate-500 mb-3">{v.description}</p>}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Giảm {v.type === 'percentage' ? `${v.value}%` : fmtCurrency(v.value)}
                      {v.maxDiscount > 0 && v.type === 'percentage' && ` (tối đa ${fmtCurrency(v.maxDiscount)})`}
                    </span>
                    {v.minOrder > 0 && <span>Đơn từ {fmtCurrency(v.minOrder)}</span>}
                  </div>
                  {v.endDate && (
                    <div className="mt-2 text-[10px] text-slate-400">
                      HS: {new Date(v.endDate).toLocaleDateString('vi-VN')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />

      {/* Lightbox Zoom Modal */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setZoomImage(null)}
        >
          <div
            className="relative flex flex-col max-w-4xl max-h-[90vh] w-full overflow-hidden rounded-2xl bg-slate-900 shadow-2xl border border-slate-700/80"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 hover:scale-110 transition-all border border-white/20 shadow-lg"
              title="Đóng"
            >
              <X size={20} weight="bold" />
            </button>

            <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden p-3 bg-black/40">
              <img
                src={zoomImage}
                alt={branch?.name || 'Chi nhánh'}
                className="max-h-[68vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>

            <div className="shrink-0 py-4 px-6 text-center bg-slate-900 border-t border-slate-800">
              <p className="text-base font-bold text-white leading-snug">{branch?.name}</p>
              {branch?.address && (
                <p className="text-xs text-slate-300 mt-1 leading-snug">{branch.address}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}