import React, { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LockKey,
  User,
  Eye,
  EyeSlash,
  ArrowRight,
  Sparkle,
  ShieldCheck,
  Star,
  MapPin,
  CaretLeft,
  Gift,
} from '@phosphor-icons/react';
import Label from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/authStorage';

export default function AuthScreen({ authLoading, onLogin, onRegister, onBack, onGoogleLoginSuccess }) {
  const location = useLocation();
  const [authMode, setAuthMode] = useState('login');
  const [branchesCount, setBranchesCount] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/branches/public`)
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
        if (list.length > 0) setBranchesCount(list.length);
      })
      .catch(() => {});
  }, []);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [regName, setRegName] = useState('');
  const [regPass, setRegPass] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleLogin(event) {
    if (event) event.preventDefault();
    setLoginLoading(true); setAuthError(''); setStatusMessage('');
    try {
      await onLogin(loginPhone, loginPass);
    } catch (error) {
      setAuthError(error.message || 'Đăng nhập thất bại');
      setLoginLoading(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setRegisterLoading(true); setAuthError(''); setStatusMessage('');
    try {
      await onRegister({ name: regName.trim(), email: regEmail, password: regPass });
    } catch (error) {
      setAuthError(error.message || 'Đăng ký thất bại');
      setRegisterLoading(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    setLoginLoading(true); setAuthError(''); setStatusMessage('');
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: credentialResponse.credential })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Đăng nhập Google thất bại');
      
      if (onGoogleLoginSuccess) {
        await onGoogleLoginSuccess(data.data.accessToken, data.data.refreshToken);
      }
    } catch (error) {
      setAuthError(error.message || 'Đăng nhập Google thất bại');
      setLoginLoading(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setForgotLoading(true); setAuthError(''); setStatusMessage('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi gửi yêu cầu');
      setStatusMessage('Mã OTP đã được gửi đến email của bạn.');
      setForgotStep(2);
    } catch (error) { setAuthError(error.message); }
    finally { setForgotLoading(false); }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    setForgotLoading(true); setAuthError(''); setStatusMessage('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp: forgotOtp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'OTP không hợp lệ');
      setStatusMessage('Mã OTP hợp lệ. Vui lòng nhập mật khẩu mới.');
      setForgotStep(3);
    } catch (error) { setAuthError(error.message); }
    finally { setForgotLoading(false); }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setForgotLoading(true); setAuthError(''); setStatusMessage('');
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, otp: forgotOtp, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi đổi mật khẩu');
      setStatusMessage('Đổi mật khẩu thành công. Vui lòng đăng nhập.');
      setAuthMode('login');
      setForgotStep(1);
      setForgotEmail('');
      setForgotOtp('');
      setNewPassword('');
    } catch (error) { setAuthError(error.message); }
    finally { setForgotLoading(false); }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-emerald-50/50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600 shadow-md" />
          <p className="text-sm font-extrabold text-emerald-800 tracking-wide">Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden font-sans bg-gradient-to-br from-slate-50 via-emerald-50/40 to-teal-50/60 text-slate-800">
      {/* Dynamic Animated Background Blobs & Floating Particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{
            x: [0, 40, -30, 0],
            y: [0, -50, 30, 0],
            scale: [1, 1.15, 0.95, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-emerald-300/30 blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -50, 40, 0],
            y: [0, 40, -40, 0],
            scale: [1, 1.2, 0.9, 1],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-40 -right-32 w-[500px] h-[500px] rounded-full bg-teal-200/40 blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, 30, -20, 0],
            y: [0, 30, -30, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/2 left-1/3 w-80 h-80 rounded-full bg-amber-200/25 blur-3xl"
        />

        {/* Floating Sparkles & Bubbles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0.2, y: '100vh', x: `${15 * i + 10}vw` }}
            animate={{
              opacity: [0.2, 0.6, 0.2],
              y: ['100vh', '-10vh'],
              x: [`${15 * i + 10}vw`, `${15 * i + (i % 2 === 0 ? 15 : 5)}vw`],
            }}
            transition={{
              duration: 12 + i * 3,
              repeat: Infinity,
              ease: 'linear',
              delay: i * 2,
            }}
            className="absolute"
          >
            <div className={`rounded-full bg-emerald-400/20 backdrop-blur-xs ${i % 2 === 0 ? 'w-4 h-4' : 'w-7 h-7'}`} />
          </motion.div>
        ))}
      </div>

      {/* Main Container */}
      <div className="relative z-10 flex min-h-screen items-center justify-between px-6 lg:px-16 xl:px-24 py-8">
        {/* Left: Brand Hero Content */}
        <div className="hidden lg:flex flex-col justify-between min-h-[580px] max-w-xl py-6 my-auto">
          {/* Logo Brand Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-4"
          >
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xl shadow-emerald-600/30 border border-white/40">
              <Sparkle className="w-8 h-8 animate-pulse text-amber-300" weight="fill" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-widest text-slate-900 uppercase">AUTOWASHPRO</h1>
              <span className="inline-flex items-center gap-1.5 mt-0.5 rounded-full bg-emerald-100/80 text-emerald-800 px-3 py-0.5 border border-emerald-300/80 text-[10px] font-black tracking-widest uppercase">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                CLIENT HUB VIP
              </span>
            </div>
          </motion.div>

          {/* Hero Main Heading & Intro */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="my-auto py-8"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-100/90 border border-amber-200 text-amber-900 text-xs font-bold mb-4 shadow-2xs">
              ⭐ Trải Nghiệm Chăm Sóc Xe Đẳng Cấp
            </div>
            <h2 className="text-4xl lg:text-5xl font-black leading-[1.1] tracking-tight text-slate-900">
              Chăm sóc xế yêu <br />
              <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 bg-clip-text text-transparent">
                Thông Minh & Sang Trọng.
              </span>
            </h2>
            <p className="mt-4 text-slate-600 text-base leading-relaxed max-w-md font-medium">
              Đặt lịch rửa xe, theo dõi tiến độ chăm sóc xe thời gian thực và tích điểm đổi hàng ngàn ưu đãi cao cấp.
            </p>

            {/* Feature Highlights Cards (Real Dynamic Data) */}
            <div className="grid grid-cols-2 gap-4 mt-8 max-w-md">
              <motion.div
                whileHover={{ y: -4, scale: 1.02 }}
                className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-emerald-100 shadow-sm flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                  <MapPin size={22} weight="fill" className="text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">
                    {branchesCount !== null ? `${branchesCount} Chi Nhánh` : 'Hệ Thống Rửa Xe'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-bold">Đặt lịch & Phục vụ</div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ y: -4, scale: 1.02 }}
                className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-amber-100 shadow-sm flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">
                  <Gift size={22} weight="fill" className="text-amber-600" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">Tích Điểm Đổi Quà</div>
                  <div className="text-[11px] text-slate-500 font-bold">Dầu nhớt, phụ kiện...</div>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Guarantee Badge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full border border-slate-200/60 w-fit"
          >
            <ShieldCheck size={18} className="text-emerald-600" weight="fill" />
            <span>Cam kết dịch vụ chuyên nghiệp & bảo mật tuyệt đối</span>
          </motion.div>
        </div>

        {/* Right: Glassmorphic Auth Form Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md mx-auto lg:mx-0 my-auto"
        >
          <div className="bg-white/90 backdrop-blur-2xl rounded-[36px] p-7 md:p-9 shadow-[0_25px_70px_-15px_rgba(16,185,129,0.18)] border border-white/90 relative overflow-hidden">
            {/* Ambient inner glow */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-200/30 rounded-full blur-2xl pointer-events-none" />

            {/* Mobile Header Logo */}
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/30">
                <Sparkle size={22} weight="fill" className="text-amber-300" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-widest text-slate-900 uppercase">AUTOWASHPRO</h1>
                <span className="inline-block rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[9px] font-black tracking-wider uppercase">
                  CLIENT HUB VIP
                </span>
              </div>
            </div>

            {onBack && (
              <button
                onClick={onBack}
                className="mb-4 flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-emerald-700 transition-colors focus:outline-none cursor-pointer bg-slate-100/80 px-3.5 py-1.5 rounded-full border border-slate-200/60 w-fit"
              >
                <CaretLeft size={14} weight="bold" />
                <span>Quay lại Trang Chủ</span>
              </button>
            )}

            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
              {authMode === 'forgot' ? 'Khôi phục Mật khẩu' : authMode === 'login' ? 'Chào Mừng Quay Lại' : 'Tạo Tài Khoản Mới'}
            </h2>
            <p className="mt-1.5 text-xs md:text-sm text-slate-500 font-medium">
              {authMode === 'login'
                ? 'Vui lòng đăng nhập để trải nghiệm dịch vụ.'
                : authMode === 'register'
                  ? 'Đăng ký nhanh chỉ trong 30 giây.'
                  : 'Nhập email để nhận mã xác minh OTP.'}
            </p>

            {/* Toggle Tabs (Login / Register) */}
            {authMode !== 'forgot' && (
              <div className="my-6 flex rounded-2xl bg-slate-100/90 p-1.5 border border-slate-200/60 relative">
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-xl py-2.5 text-xs md:text-sm font-black transition-all duration-300 relative z-10 cursor-pointer',
                    authMode === 'login' ? 'text-emerald-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  )}
                  onClick={() => { setAuthMode('login'); setAuthError(''); setStatusMessage(''); }}
                >
                  {authMode === 'login' && (
                    <motion.div
                      layoutId="auth-tab-pill"
                      className="absolute inset-0 bg-white rounded-xl shadow-md border border-emerald-100 -z-10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  Đăng nhập
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-xl py-2.5 text-xs md:text-sm font-black transition-all duration-300 relative z-10 cursor-pointer',
                    authMode === 'register' ? 'text-emerald-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  )}
                  onClick={() => { setAuthMode('register'); setAuthError(''); setStatusMessage(''); }}
                >
                  {authMode === 'register' && (
                    <motion.div
                      layoutId="auth-tab-pill"
                      className="absolute inset-0 bg-white rounded-xl shadow-md border border-emerald-100 -z-10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  Đăng ký
                </button>
              </div>
            )}

            {/* Error / Status Messages */}
            <AnimatePresence mode="wait">
              {location.state?.adminAuthError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-700 font-bold">
                  {location.state.adminAuthError}
                </motion.div>
              )}
              {authError && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-xs text-red-700 font-bold">
                  {authError}
                </motion.div>
              )}
              {statusMessage && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-xs text-emerald-800 font-bold">
                  {statusMessage}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Login Form */}
            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-phone" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Email hoặc Số điện thoại
                  </Label>
                  <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500 transition-all duration-300">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-black mr-3 select-none">
                      @
                    </div>
                    <input
                      id="login-phone"
                      name="identifier"
                      type="text"
                      placeholder="VD: manager@gmail.com hoặc 0912..."
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:ring-0"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="login-pass" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Mật khẩu
                  </Label>
                  <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500 transition-all duration-300">
                    <LockKey size={18} className="text-slate-400 mr-3 shrink-0" />
                    <input
                      id="login-pass"
                      name="password"
                      type={showLoginPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:ring-0"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPass(!showLoginPass)}
                      className="text-slate-400 hover:text-emerald-600 transition-colors focus:outline-none ml-2 cursor-pointer"
                    >
                      {showLoginPass ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Single Right Aligned Forgot Password link (Remember Me checkbox removed) */}
                <div className="flex items-center justify-end pt-1">
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setAuthMode('forgot'); setAuthError(''); setStatusMessage(''); setForgotStep(1); }}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-500 transition-colors cursor-pointer"
                  >
                    Quên mật khẩu?
                  </a>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loginLoading}
                  className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl py-3.5 px-6 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/35 transition-all duration-300 flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer"
                >
                  {loginLoading ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>ĐANG ĐĂNG NHẬP...</span>
                    </>
                  ) : (
                    <>
                      <span>ĐĂNG NHẬP NGAY</span>
                      <ArrowRight size={18} weight="bold" />
                    </>
                  )}
                </motion.button>
              </form>
            ) : authMode === 'register' ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Họ và tên
                  </Label>
                  <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500 transition-all duration-300">
                    <User size={18} className="text-slate-400 mr-3 shrink-0" />
                    <input
                      id="reg-name"
                      type="text"
                      placeholder="Nguyễn Văn A"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:ring-0"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-email" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Email
                  </Label>
                  <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500 transition-all duration-300">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-black mr-3 select-none">
                      @
                    </div>
                    <input
                      id="reg-email"
                      type="email"
                      placeholder="khachhang@gmail.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:ring-0"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-pass" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Mật khẩu
                  </Label>
                  <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500 transition-all duration-300">
                    <LockKey size={18} className="text-slate-400 mr-3 shrink-0" />
                    <input
                      id="reg-pass"
                      type={showRegPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:ring-0"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPass(!showRegPass)}
                      className="text-slate-400 hover:text-emerald-600 transition-colors focus:outline-none ml-2 cursor-pointer"
                    >
                      {showRegPass ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={registerLoading}
                  className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl py-3.5 px-6 shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/35 transition-all duration-300 flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer"
                >
                  {registerLoading ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>ĐANG XỬ LÝ...</span>
                    </>
                  ) : (
                    <>
                      <span>TẠO TÀI KHOẢN</span>
                      <ArrowRight size={18} weight="bold" />
                    </>
                  )}
                </motion.button>
              </form>
            ) : (
              <div className="space-y-4">
                {forgotStep === 1 && (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-email" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Email đã đăng ký
                      </Label>
                      <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500 transition-all duration-300">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-black mr-3 select-none">
                          @
                        </div>
                        <input
                          id="forgot-email"
                          type="email"
                          placeholder="khachhang@gmail.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="bg-transparent border-none outline-none w-full text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:ring-0"
                          required
                        />
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl py-3.5 px-6 shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer"
                    >
                      {forgotLoading ? 'ĐANG GỬI...' : 'GỬI MÃ OTP'}
                      {!forgotLoading && <ArrowRight size={18} weight="bold" />}
                    </motion.button>
                  </form>
                )}

                {forgotStep === 2 && (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-otp" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Mã xác nhận (OTP)
                      </Label>
                      <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500 transition-all duration-300">
                        <LockKey size={18} className="text-slate-400 mr-3 shrink-0" />
                        <input
                          id="forgot-otp"
                          type="text"
                          placeholder="Nhập 6 số OTP"
                          value={forgotOtp}
                          onChange={(e) => setForgotOtp(e.target.value)}
                          className="bg-transparent border-none outline-none w-full text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:ring-0"
                          required
                        />
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl py-3.5 px-6 shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer"
                    >
                      {forgotLoading ? 'ĐANG XÁC NHẬN...' : 'XÁC NHẬN OTP'}
                      {!forgotLoading && <ArrowRight size={18} weight="bold" />}
                    </motion.button>
                  </form>
                )}

                {forgotStep === 3 && (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password" className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Mật khẩu mới
                      </Label>
                      <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500 transition-all duration-300">
                        <LockKey size={18} className="text-slate-400 mr-3 shrink-0" />
                        <input
                          id="new-password"
                          type={showNewPassword ? 'text' : 'password'}
                          placeholder="Tạo mật khẩu mới"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="bg-transparent border-none outline-none w-full text-slate-800 text-sm font-medium placeholder:text-slate-400 focus:ring-0"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="text-slate-400 hover:text-emerald-600 transition-colors focus:outline-none ml-2 cursor-pointer"
                        >
                          {showNewPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl py-3.5 px-6 shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60 cursor-pointer"
                    >
                      {forgotLoading ? 'ĐANG LƯU...' : 'ĐỔI MẬT KHẨU'}
                      {!forgotLoading && <ArrowRight size={18} weight="bold" />}
                    </motion.button>
                  </form>
                )}

                <div className="mt-4 text-center">
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setAuthMode('login'); setAuthError(''); setStatusMessage(''); }}
                    className="text-xs font-bold text-slate-500 hover:text-emerald-700 transition-colors cursor-pointer"
                  >
                    Quay lại đăng nhập
                  </a>
                </div>
              </div>
            )}

            {/* Google OAuth Section */}
            {authMode !== 'forgot' && (
              <>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <div className="h-px bg-slate-200 flex-1" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Hoặc tiếp tục với</span>
                  <div className="h-px bg-slate-200 flex-1" />
                </div>

                <div className="mt-5 flex items-center justify-center w-full">
                  <div className="google-btn-wrapper w-full flex items-center justify-center overflow-hidden [&>div]:!mx-auto [&>div]:!flex [&>div]:!justify-center [&>div]:!items-center [&_iframe]:!mx-auto">
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => {
                        setAuthError('Đăng nhập Google không thành công');
                      }}
                      theme="outline"
                      size="large"
                      shape="pill"
                      width="380"
                      text="continue_with"
                      locale="vi"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Footer links (REMOVED as requested by user) */}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
