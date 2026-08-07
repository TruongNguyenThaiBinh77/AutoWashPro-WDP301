import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, Receipt, PlusCircle, CreditCard,
  Banknote, ShieldCheck, Filter, ChevronRight, RefreshCw, Info
} from 'lucide-react';
import useSSE from '@/hooks/useSSE';
import { showToast as fireToast } from '@/lib/toast';
import { useTranslation } from 'react-i18next';

function formatCurrency(value) {
  return `${new Intl.NumberFormat('vi-VN').format(value || 0)}đ`;
}

const ERROR_KEYS = {
  'Validation failed': 'customer.wallet.errors.validationFailed',
  'Invalid amount': 'customer.wallet.errors.invalidAmount',
  'Amount is required': 'customer.wallet.errors.amountRequired',
  'Invalid payment method': 'customer.wallet.errors.invalidPaymentMethod',
  'Invalid payment type': 'customer.wallet.errors.invalidPaymentType',
  'User not found': 'customer.wallet.errors.userNotFound',
  'Payment not found': 'customer.wallet.errors.paymentNotFound',
  'Access denied. No token.': 'customer.wallet.errors.accessDenied',
  'Invalid token': 'customer.wallet.errors.invalidToken',
  'Token expired': 'customer.wallet.errors.tokenExpired',
  'Failed to fetch': 'customer.wallet.errors.failedToFetch',
};

function translateError(msg, t) {
  if (!msg) return '';
  let result = msg;
  if (ERROR_KEYS[msg]) {
    return t(ERROR_KEYS[msg]);
  }
  for (const [key, value] of Object.entries(ERROR_KEYS)) {
    result = result.replace(new RegExp(key, 'gi'), t(value));
  }
  return result;
}

export default function CustomerWallet({ apiBase, token, user, refreshUser }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState(100000);
  const [customAmount, setCustomAmount] = useState('');
  const [payMethod, setPayMethod] = useState('bank'); // bank or vnpay
  const [sepayData, setSepayData] = useState(null);
  const [vnpayLoading, setVnpayLoading] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showVnpaySuccessModal, setShowVnpaySuccessModal] = useState(false);
  const [successAmount, setSuccessAmount] = useState(0);

  // Search & Filter state
  const [typeFilter, setTypeFilter] = useState(''); // '' (all), 'credit', 'debit'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Listen to SSE topup success
  useSSE(token, 'wallet_topup_success', (data) => {
    setMessage(t('customer.wallet.topupSuccessMsg', { amount: formatCurrency(data?.amount) }));
    setSepayData(null);
    setShowTopupModal(false);
    refreshUser();
    fetchTransactions(1, false);
    setTimeout(() => setMessage(''), 5000);
  });

  // Listen to VNPay redirect results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vnpayResult = params.get('vnpay_result');
    if (vnpayResult) {
      try {
        const parsed = JSON.parse(decodeURIComponent(vnpayResult));
        const success = parsed?.success !== false && parsed?.data?.responseCode === '00';
        if (success) {
          const rawAmt = parsed?.data?.amount;
          const amt = rawAmt ? parseInt(rawAmt, 10) / 100 : 0;
          setSuccessAmount(amt);
          setShowVnpaySuccessModal(true);
          refreshUser();
          fetchTransactions(1, false);
        } else {
          setMessage(parsed?.message || t('customer.wallet.vnpayFail'));
        }
      } catch (e) {
        console.error('Lỗi phân tích kết quả VNPay:', e);
        setMessage(t('customer.wallet.vnpayParseError'));
      }
      
      const url = new URL(window.location);
      url.searchParams.delete('vnpay_result');
      window.history.replaceState({}, '', url);
    }
  }, [token]);

  const fetchTransactions = async (targetPage = 1, isAppend = false, overrideFrom = fromDate, overrideTo = toDate, overrideType = typeFilter) => {
    if (overrideFrom && overrideTo && overrideFrom > overrideTo) {
      fireToast.error(t('customer.wallet.dateRangeError'));
      return;
    }

    try {
      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      let url = `${apiBase}/wallet-transactions/my?page=${targetPage}&limit=10`;
      if (overrideType) url += `&type=${overrideType}`;
      if (overrideFrom) url += `&startDate=${overrideFrom}`;
      if (overrideTo) url += `&endDate=${overrideTo}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await res.json();
      if (res.ok) {
        const newData = payload.data || [];
        const pagination = payload.pagination || {};
        if (isAppend) {
          setTransactions(prev => [...prev, ...newData]);
        } else {
          setTransactions(newData);
        }
        setHasMore(pagination.hasNextPage || false);
        setTotalCount(pagination.total || 0);
        setPage(targetPage);
      }
    } catch (e) {
      console.error('Lỗi khi tải lịch sử ví:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchTransactions(page + 1, true);
    }
  };

  const handleTypeChange = (newType) => {
    setTypeFilter(newType);
    fetchTransactions(1, false, fromDate, toDate, newType);
  };

  const handleFromDateChange = (newFrom) => {
    setFromDate(newFrom);
    if (newFrom && toDate && newFrom > toDate) {
      fireToast.error(t('customer.wallet.dateRangeError'));
      return;
    }
    fetchTransactions(1, false, newFrom, toDate, typeFilter);
  };

  const handleToDateChange = (newTo) => {
    setToDate(newTo);
    if (fromDate && newTo && fromDate > newTo) {
      fireToast.error(t('customer.wallet.dateRangeError'));
      return;
    }
    fetchTransactions(1, false, fromDate, newTo, typeFilter);
  };

  const handleResetFilter = () => {
    setFromDate('');
    setToDate('');
    setTypeFilter('');
    fetchTransactions(1, false, '', '', '');
  };

  useEffect(() => {
    if (token) fetchTransactions(1, false);
  }, [token]);

  const handleTopup = async () => {
    const amount = customAmount ? parseInt(customAmount.replace(/\D/g, ''), 10) : topupAmount;
    if (!amount || amount < 10000) {
      setMessage(t('customer.wallet.minAmount'));
      return;
    }

    setMessage('');
    
    if (payMethod === 'bank') {
      setDepositLoading(true);
      try {
        const res = await fetch(`${apiBase}/payments/bank-provisional`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount, paymentType: 'topup' }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.message || t('customer.wallet.qrCreateFail'));
        
        const payObj = payload?.data || payload;
        setSepayData({
          qrCodeUrl: payObj.qrCodeUrl || `https://qr.sepay.vn/img?bank=MB&acc=6200320046868&amount=${amount}&des=DAT COC ${payObj.transactionId}`,
          transactionId: payObj.transactionId,
          amount: amount,
        });
      } catch (e) {
        setMessage(translateError(e.message, t) || t('customer.wallet.transactionCreateFail'));
      } finally {
        setDepositLoading(false);
      }
    } else if (payMethod === 'vnpay') {
      setVnpayLoading(true);
      try {
        const res = await fetch(`${apiBase}/bookings/vnpay-provisional`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount, paymentType: 'topup', origin: window.location.origin }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || t('customer.wallet.vnpayCreateFail'));
        
        const paymentUrl = data?.data?.paymentUrl;
        if (!paymentUrl) throw new Error(t('customer.wallet.noPaymentUrl'));
        
        window.location.href = paymentUrl;
      } catch (e) {
        setMessage(translateError(e.message, t) || t('customer.wallet.vnpayFail'));
        setVnpayLoading(false);
      }
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      
      {/* 1. UNIFIED PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
              <Wallet className="w-5 h-5" />
            </div>
            {t('customer.wallet.title')}
          </h1>
          <p className="text-slate-500 text-sm mt-1">{t('customer.wallet.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-200 flex items-center gap-2 font-semibold">
          <ShieldCheck size={20} />
          {message}
        </div>
      )}

      {/* 2. BALANCE CARD */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-800 rounded-3xl p-6 md:p-8 text-white shadow-xl shadow-emerald-900/15 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <p className="text-emerald-100 font-medium mb-1.5 text-xs uppercase tracking-wider">{t('customer.wallet.balanceLabel')}</p>
            <div className="text-4xl md:text-5xl font-black font-mono tracking-tight">
              {formatCurrency(user?.walletBalance)}
            </div>
            <p className="text-xs text-emerald-200 mt-3 flex items-center gap-1.5 font-medium">
              <ShieldCheck size={15} /> {t('customer.wallet.securityNote')}
            </p>
          </div>
          <button 
            onClick={() => setShowTopupModal(true)}
            className="bg-white text-emerald-700 hover:bg-emerald-50 px-6 py-3.5 rounded-2xl font-bold transition-all flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 cursor-pointer"
          >
            <PlusCircle size={20} />
            {t('customer.wallet.topup')}
          </button>
        </div>
      </div>

      {/* 3. AUTOMATIC DATE RANGE & TYPE FILTER BAR (WITHOUT BUTTON) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Filter size={16} className="text-emerald-600" />
            <span>{t('customer.wallet.filterTitle')}</span>
          </div>
          {(fromDate || toDate || typeFilter) && (
            <button onClick={handleResetFilter} className="text-xs font-semibold text-slate-500 hover:text-emerald-600 flex items-center gap-1 cursor-pointer">
              <RefreshCw size={12} /> {t('customer.wallet.resetFilter')}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('customer.wallet.typeLabel')}</label>
            <select
              value={typeFilter}
              onChange={e => handleTypeChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 focus:border-emerald-500 outline-none bg-slate-50/50"
            >
              <option value="">{t('customer.wallet.allTypes')}</option>
              <option value="credit">{t('customer.wallet.creditType')}</option>
              <option value="debit">{t('customer.wallet.debitType')}</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('customer.wallet.fromDate')}</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => handleFromDateChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-emerald-500 outline-none bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('customer.wallet.toDate')}</label>
            <input
              type="date"
              value={toDate}
              onChange={e => handleToDateChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-emerald-500 outline-none bg-slate-50/50"
            />
          </div>
        </div>
      </div>

      {/* 4. TRANSACTIONS LIST (NAVIGATES TO PAGE ON CLICK) */}
      <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Receipt size={18} className="text-emerald-600" />
            {t('customer.wallet.historyTitle')} ({totalCount})
          </h3>
          <span className="text-xs text-slate-400 font-medium">{t('customer.wallet.historyHint')}</span>
        </div>
        
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">{t('customer.wallet.loadingList')}</div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
              <Receipt size={28} />
            </div>
            <h3 className="text-slate-700 font-bold mb-1">{t('customer.wallet.emptyTitle')}</h3>
            <p className="text-slate-500 text-xs">{t('customer.wallet.emptyDesc')}</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {transactions.map(tx => {
                const isCredit = tx.type === 'credit';
                const Icon = isCredit ? ArrowUpCircle : ArrowDownCircle;
                const bookingObj = typeof tx.bookingId === 'object' ? tx.bookingId : null;
                
                let bookingCode = bookingObj?.bookingCode;
                if (!bookingCode && tx.reason) {
                  const match = tx.reason.match(/(AW-\d{8}-[A-Z0-9]+)/i);
                  if (match) bookingCode = match[1];
                }

                return (
                  <div
                    key={tx._id}
                    onClick={() => navigate(`/wallet/${tx._id}`)}
                    className="p-4 md:p-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`p-3 rounded-2xl shrink-0 transition-transform group-hover:scale-105 ${isCredit ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                        <Icon size={22} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 text-sm md:text-base group-hover:text-emerald-700 transition-colors truncate">
                          {tx.reason}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                          <span>{new Date(tx.createdAt).toLocaleString('vi-VN')}</span>
                          {bookingCode && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700">
                              {t('customer.wallet.bookingCodeLabel')} {bookingCode}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <div className={`font-black text-sm md:text-base font-mono whitespace-nowrap ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                        {isCredit ? '+' : '-'}{formatCurrency(tx.amount)}
                      </div>
                      <ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="p-4 border-t border-slate-100 text-center bg-slate-50/50">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-sm transition-colors border border-emerald-200/60 inline-flex items-center gap-2 disabled:opacity-50 shadow-xs cursor-pointer"
                >
                  {loadingMore ? (
                    <>
                      <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                      {t('customer.wallet.loadingMore')}
                    </>
                  ) : (
                    <>
                      {t('customer.wallet.showMore', { shown: transactions.length, total: totalCount })}
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* TOPUP MODAL */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {sepayData ? (
              <div className="p-6 text-center">
                <h3 className="text-xl font-black text-slate-900 mb-2">{t('customer.wallet.qrTitle')}</h3>
                <p className="text-sm text-slate-500 mb-6">{t('customer.wallet.qrHint')}</p>
                
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block mb-6">
                  <img src={sepayData.qrCodeUrl} alt="QR Code" className="w-56 h-56 rounded-xl object-cover" />
                </div>
                
                <div className="space-y-3 mb-6 text-left">
                  <div className="flex justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <span className="text-slate-500">{t('customer.wallet.amountLabel')}</span>
                    <strong className="text-emerald-600 text-base">{formatCurrency(sepayData.amount)}</strong>
                  </div>
                  <div className="flex justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                    <span className="text-slate-500">{t('customer.wallet.transferContent')}</span>
                    <strong className="text-slate-800 font-mono">{sepayData.transactionId}</strong>
                  </div>
                </div>

                <div className="text-emerald-600 text-xs font-semibold flex items-center justify-center gap-2 mb-6">
                  <span className="animate-spin">🔄</span> {t('customer.wallet.waitingBank')}
                </div>

                <button 
                  onClick={() => setSepayData(null)}
                  className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
                >
                  {t('customer.wallet.cancelBack')}
                </button>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-slate-900">{t('customer.wallet.topup')}</h3>
                  <button onClick={() => setShowTopupModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">{t('customer.wallet.chooseAmount')}</label>
                  <div className="grid grid-cols-3 gap-2.5 mb-4">
                    {[50000, 100000, 200000, 500000, 1000000, 2000000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => { setTopupAmount(amt); setCustomAmount(''); }}
                        className={`py-2 px-2 rounded-xl border-2 text-xs font-bold transition-all ${
                          topupAmount === amt && !customAmount
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 text-slate-600 hover:border-emerald-200'
                        }`}
                      >
                        {formatCurrency(amt).replace('đ','')}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder={t('customer.wallet.customAmountPlaceholder')} 
                      value={customAmount}
                      onChange={(e) => {
                        let val = e.target.value.replace(/\D/g, '');
                        if (val) val = parseInt(val, 10).toLocaleString('vi-VN');
                        setCustomAmount(val);
                        setTopupAmount(0);
                      }}
                      className="w-full pl-4 pr-10 py-3 rounded-xl border-2 border-slate-200 focus:border-emerald-500 focus:ring-0 outline-none font-semibold text-sm text-slate-800"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">đ</span>
                  </div>
                </div>

                <div className="mb-8">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">{t('customer.wallet.chooseMethod')}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPayMethod('bank')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                        payMethod === 'bank' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-200'
                      }`}
                    >
                      <Banknote size={26} className={payMethod === 'bank' ? 'text-emerald-600' : 'text-slate-400'} />
                      <span className={`text-xs font-bold ${payMethod === 'bank' ? 'text-emerald-700' : 'text-slate-600'}`}>{t('customer.wallet.methodQr')}</span>
                    </button>
                    <button
                      onClick={() => setPayMethod('vnpay')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                        payMethod === 'vnpay' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-200'
                      }`}
                    >
                      <CreditCard size={26} className={payMethod === 'vnpay' ? 'text-blue-600' : 'text-slate-400'} />
                      <span className={`text-xs font-bold ${payMethod === 'vnpay' ? 'text-blue-700' : 'text-slate-600'}`}>VNPay</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleTopup}
                  disabled={depositLoading || vnpayLoading}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-md transition-all disabled:opacity-70 flex justify-center items-center cursor-pointer"
                >
                  {depositLoading || vnpayLoading ? <span className="animate-pulse">{t('customer.wallet.processing')}</span> : t('customer.wallet.submitTopup')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VNPAY SUCCESS MODAL */}
      {showVnpaySuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">{t('customer.wallet.successTitle')}</h3>
            <p className="text-sm text-slate-500 mb-6">
              {t('customer.wallet.successDesc', { amount: formatCurrency(successAmount) })}
            </p>
            <button 
              onClick={() => setShowVnpaySuccessModal(false)}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-md transition-all cursor-pointer"
            >
              {t('customer.wallet.agree')}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
