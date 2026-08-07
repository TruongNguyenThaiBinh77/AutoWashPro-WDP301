import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeft, Wallet, ArrowDownCircle, ArrowUpCircle, Receipt, ShieldCheck,
  Calendar, Car, MapPin, Package, Clock, Copy, Check, ExternalLink, AlertCircle,
  Tag, Sparkles, CheckCircle2, Ticket
} from 'lucide-react';
import { showToast as fireToast } from '@/lib/toast';
import { useTranslation } from 'react-i18next';

function formatCurrency(value) {
  return `${new Intl.NumberFormat('vi-VN').format(value || 0)}đ`;
}

const STATUS_MAP = {
  pending: { labelKey: 'customer.walletDetail.status.pending', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { labelKey: 'customer.walletDetail.status.confirmed', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  checked_in: { labelKey: 'customer.walletDetail.status.checked_in', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  in_progress: { labelKey: 'customer.walletDetail.status.in_progress', bg: 'bg-purple-50 text-purple-700 border-purple-200' },
  awaiting_payment: { labelKey: 'customer.walletDetail.status.awaiting_payment', bg: 'bg-orange-50 text-orange-700 border-orange-200' },
  completed: { labelKey: 'customer.walletDetail.status.completed', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { labelKey: 'customer.walletDetail.status.cancelled', bg: 'bg-red-50 text-red-700 border-red-200' },
};

export default function CustomerWalletDetailPage({ apiBase, token, user }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const id = paramId || decodeURIComponent(pathname.split('/').pop() || '');
  const [tx, setTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedBooking, setCopiedBooking] = useState(false);

  useEffect(() => {
    async function fetchDetail() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`${apiBase}/wallet-transactions/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.message || t('customer.walletDetail.fetchFail'));
        setTx(payload.data || payload);
      } catch (err) {
        console.error('Fetch transaction detail error:', err);
        setError(err.message || t('customer.walletDetail.loadFail'));
      } finally {
        setLoading(false);
      }
    }
    if (id && token) fetchDetail();
  }, [id, token, apiBase]);

  const copyText = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedBooking(true);
      setTimeout(() => setCopiedBooking(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-500">{t('customer.walletDetail.loadingDetail')}</p>
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">{t('customer.walletDetail.notFoundTitle')}</h2>
        <p className="text-sm text-slate-500">{error || t('customer.walletDetail.notFoundDesc')}</p>
        <button
          onClick={() => navigate('/wallet')}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('customer.walletDetail.backToWallet')}
        </button>
      </div>
    );
  }

  const isCredit = tx.type === 'credit';
  const Icon = isCredit ? ArrowUpCircle : ArrowDownCircle;
  const bookingObj = typeof tx.bookingId === 'object' ? tx.bookingId : null;
  
  let bookingCode = bookingObj?.bookingCode;
  if (!bookingCode && tx.reason) {
    const match = tx.reason.match(/(AW-\d{8}-[A-Z0-9]+)/i);
    if (match) bookingCode = match[1];
  }

  const statusBadge = bookingObj?.status ? (STATUS_MAP[bookingObj.status] ? { ...STATUS_MAP[bookingObj.status], label: t(STATUS_MAP[bookingObj.status].labelKey) } : { label: bookingObj.status, bg: 'bg-slate-100 text-slate-700 border-slate-200' }) : null;

  // Breakdown calculations for booking
  const basePackagePrice = bookingObj?.packagePrice ?? bookingObj?.packageId?.price ?? 0;
  const packageName = bookingObj?.packageName || bookingObj?.packageId?.name || t('customer.walletDetail.defaultPackageName');

  // Standard included (free) services
  const rawSubServices = bookingObj?.selectedSubServices || bookingObj?.packageId?.subServices || [];
  const includedServices = rawSubServices.filter(s => s.price === 0 || s.isOptional === false);
  
  // Paid additional services
  const paidSubServices = rawSubServices.filter(s => s.price > 0 && s.isOptional !== false);
  const paidSubServicesTotal = paidSubServices.reduce((sum, item) => sum + (item.price || 0), 0);

  // Discount
  const discountAmount = bookingObj?.discountAmount || 0;
  const voucherCode = bookingObj?.voucherCode;

  // Final Price
  const finalPrice = bookingObj?.finalPrice ?? (basePackagePrice + paidSubServicesTotal - discountAmount);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16 animate-in fade-in duration-300">
      
      {/* TOP NAVIGATION HEADER */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <button
          onClick={() => navigate('/wallet')}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-emerald-700 bg-white hover:bg-slate-100 border border-slate-200/80 rounded-xl px-3.5 py-2 transition-all shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {t('customer.walletDetail.backToWallet2')}
        </button>

        <span className="text-xs font-bold text-slate-400 font-mono">ID: {tx._id}</span>
      </div>

      {/* HERO TRANSACTION STATUS CARD */}
      <div className="rounded-3xl bg-white border border-slate-200/80 p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-2xl shrink-0 ${isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              <Icon className="w-8 h-8" />
            </div>
            <div>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider mb-1 ${isCredit ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                {isCredit ? t('customer.walletDetail.creditType') : t('customer.walletDetail.debitType')}
              </span>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800 leading-tight">{tx.reason}</h1>
            </div>
          </div>

          <div className="text-left md:text-right border-t md:border-t-0 border-slate-100 pt-4 md:pt-0">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('customer.walletDetail.txnAmountLabel')}</span>
            <div className={`text-3xl md:text-4xl font-extrabold font-mono mt-1 ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
              {isCredit ? '+' : '-'}{formatCurrency(tx.amount)}
            </div>
          </div>
        </div>

        {/* METADATA GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{t('customer.walletDetail.txnIdLabel')}</span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-700 truncate mr-2">{tx._id}</span>
              <button onClick={() => copyText(tx._id, 'id')} className="p-1 text-slate-400 hover:text-emerald-600 rounded-md transition-colors" title={t('customer.walletDetail.copyCode')}>
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{t('customer.walletDetail.timeLabel')}</span>
            <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {new Date(tx.createdAt).toLocaleString('vi-VN')}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">{t('customer.walletDetail.statusLabel')}</span>
            <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> {t('customer.walletDetail.completed')}
            </p>
          </div>
        </div>
      </div>

      {/* LINKED BOOKING DETAILS CARD */}
      {bookingCode && (
        <div className="rounded-3xl bg-white border border-emerald-200/80 p-6 md:p-8 shadow-sm space-y-6">
          
          {/* Booking Card Header */}
          <div className="flex items-center justify-between border-b border-emerald-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-lg">
                🚗
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">{t('customer.walletDetail.linkedOrderTitle')}</h2>
                <p className="text-xs text-slate-500">{t('customer.walletDetail.linkedOrderSubtitle')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {statusBadge && (
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${statusBadge.bg}`}>
                  {statusBadge.label}
                </span>
              )}
              <button
                onClick={() => copyText(bookingCode, 'booking')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold font-mono text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                {copiedBooking ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {bookingCode}
              </button>
            </div>
          </div>

          {bookingObj ? (
            <div className="space-y-6">
              
              {/* SECTION 1: MAIN PACKAGE & SERVICES BREAKDOWN */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left col: Package details & Included / Optional Services */}
                <div className="space-y-4">
                  
                  {/* Main Package Base Price Card */}
                  <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-emerald-600" /> {t('customer.walletDetail.mainPackage')}
                      </span>
                      <span className="font-mono font-bold text-sm text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                        {formatCurrency(basePackagePrice)}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-800">{packageName}</h3>
                    {bookingObj.packageId?.description && (
                      <p className="text-xs text-slate-600 line-clamp-2">{bookingObj.packageId.description}</p>
                    )}
                  </div>

                  {/* Included Standard Services (FREE) */}
                  {includedServices.length > 0 && (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {t('customer.walletDetail.includedServices')}
                      </span>
                      <div className="space-y-1.5">
                        {includedServices.map((sub, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs text-slate-700 font-medium">
                            <span className="flex items-center gap-1.5">
                              <span className="text-emerald-500">•</span> {sub.name}
                            </span>
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                              {t('customer.walletDetail.free')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Paid Additional Services (IF ANY) */}
                  {paidSubServices.length > 0 && (
                    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/30 p-4 space-y-2">
                      <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" /> {t('customer.walletDetail.paidServices')}
                      </span>
                      <div className="space-y-1.5">
                        {paidSubServices.map((sub, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs text-slate-800 font-semibold">
                            <span>• {sub.name}</span>
                            <span className="font-mono text-amber-700">+{formatCurrency(sub.price)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Right col: Branch, Vehicle, Appointment Time & Voucher */}
                <div className="space-y-4">
                  
                  {/* Vehicle Info */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
                      <Car className="w-3.5 h-3.5 text-emerald-600" /> {t('customer.walletDetail.vehicleLabel')}
                    </span>
                    {bookingObj.vehicleId ? (
                      <div>
                        <span className="inline-block rounded-md bg-slate-900 px-2 py-0.5 text-xs font-mono font-bold text-emerald-400 mr-2">
                          {bookingObj.vehicleId.licensePlate}
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {[bookingObj.vehicleId.brand, bookingObj.vehicleId.model].filter(Boolean).join(' ')}
                        </span>
                        <p className="text-xs text-slate-500 mt-1 capitalize">
                          {bookingObj.vehicleId.vehicleType} {bookingObj.vehicleId.color ? `· ${bookingObj.vehicleId.color}` : ''}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-slate-700">{t('customer.walletDetail.registeredVehicle')}</p>
                    )}
                  </div>

                  {/* Branch Info */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" /> {t('customer.walletDetail.branchLabel')}
                    </span>
                    <p className="text-sm font-bold text-slate-800">{bookingObj.branchId?.name || t('customer.walletDetail.defaultBranch')}</p>
                    {bookingObj.branchId?.address && (
                      <p className="text-xs text-slate-500">{bookingObj.branchId.address}</p>
                    )}
                  </div>

                  {/* Appointment Time */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" /> {t('customer.walletDetail.timeLabel2')}
                    </span>
                    <p className="text-sm font-bold text-slate-800">
                      {bookingObj.bookingDate ? new Date(bookingObj.bookingDate).toLocaleDateString('vi-VN') : t('customer.walletDetail.updating')}
                      {bookingObj.startTime ? ` (${bookingObj.startTime} - ${bookingObj.endTime || ''})` : ''}
                    </p>
                  </div>

                </div>

              </div>

              {/* SECTION 2: DETAILED FINANCIAL BREAKDOWN TABLE */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-5 space-y-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <Receipt className="w-4 h-4 text-emerald-600" /> {t('customer.walletDetail.costBreakdown')}
                </h4>

                <div className="space-y-2 text-xs text-slate-700">
                  <div className="flex justify-between">
                    <span>{t('customer.walletDetail.mainPackageLine', { name: packageName })}:</span>
                    <span className="font-mono font-semibold">{formatCurrency(basePackagePrice)}</span>
                  </div>

                  {paidSubServices.length > 0 && (
                    <div className="flex justify-between">
                      <span>{t('customer.walletDetail.paidServicesLine', { count: paidSubServices.length })}:</span>
                      <span className="font-mono font-semibold text-amber-700">+{formatCurrency(paidSubServicesTotal)}</span>
                    </div>
                  )}

                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span className="flex items-center gap-1">
                        <Ticket className="w-3.5 h-3.5" /> {t('customer.walletDetail.voucherLine')} {voucherCode ? `(${voucherCode})` : ''}:
                      </span>
                      <span className="font-mono">-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900 text-sm">
                    <span>{t('customer.walletDetail.totalLine')}</span>
                    <span className="font-mono text-emerald-700">{formatCurrency(finalPrice)}</span>
                  </div>

                  <div className="flex justify-between border-t border-emerald-200/70 pt-2 font-bold text-xs bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-200">
                    <span className="text-emerald-800">{t('customer.walletDetail.paidViaWallet')}</span>
                    <span className="font-mono text-emerald-700 text-sm">{isCredit ? '+' : '-'}{formatCurrency(tx.amount)}</span>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
              {t('customer.walletDetail.noBookingObjNote', { code: bookingCode })}
            </div>          )}

          {/* FOOTER NAVIGATION ACTION (DIRECT REDIRECT TO SPECIFIC BOOKING PAGE) */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <span className="text-xs text-slate-500 font-medium">{t('customer.walletDetail.viewProgressPrompt')}</span>
            <button
              onClick={() => {
                if (bookingObj?._id) {
                  navigate(`/history/${bookingObj._id}`);
                } else {
                  navigate('/history');
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white transition-all shadow-sm cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" /> {t('customer.walletDetail.viewHistoryDetail')}
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
