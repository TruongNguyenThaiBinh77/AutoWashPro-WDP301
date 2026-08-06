import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useLocation } from 'react-router-dom';
import {
  LockKey,
  User,
  Eye,
  EyeSlash,
  ArrowRight,
  Briefcase,
} from '@phosphor-icons/react';
import Label from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { getApiBaseUrl } from '@/lib/authStorage';
import { useTranslation } from 'react-i18next';

export default function AuthScreen({ authLoading, onLogin, onRegister, onBack, onGoogleLoginSuccess }) {
  const { t } = useTranslation(['auth', 'common']);
  const location = useLocation();
  const [authMode, setAuthMode] = useState('login');
  const [loginLoading, setLoginLoading] = useState(false);
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
    try { await onLogin(loginPhone, loginPass, null, t); setStatusMessage(t('messages.login_success')); }
    catch (error) { setAuthError(error.message || t('messages.login_failed')); }
    finally { setLoginLoading(false); }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setRegisterLoading(true); setAuthError(''); setStatusMessage('');
    try {
      await onRegister({ name: regName.trim(), email: regEmail, password: regPass });
      setStatusMessage(t('messages.register_success'));
    } catch (error) { setAuthError(error.message || t('messages.register_failed')); }
    finally { setRegisterLoading(false); }
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
      if (!res.ok) throw new Error(data.message || t('messages.google_login_failed'));
      
      setStatusMessage(t('messages.google_login_success'));
      if (onGoogleLoginSuccess) {
        onGoogleLoginSuccess(data.data.accessToken, data.data.refreshToken);
      }
    } catch (error) {
      setAuthError(error.message || t('messages.google_login_failed'));
    } finally {
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
      if (!res.ok) throw new Error(data.message || t('messages.forgot_failed'));
      setStatusMessage(t('messages.send_otp_success'));
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
      if (!res.ok) throw new Error(data.message || t('messages.otp_invalid'));
      setStatusMessage(t('messages.otp_valid'));
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
      if (!res.ok) throw new Error(data.message || t('messages.reset_password_failed'));
      setStatusMessage(t('messages.reset_password_success'));
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
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
          <p className="text-sm font-semibold text-slate-500">{t('messages.checking_session')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden font-sans">
      {/* Full-page car wash background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?w=1920&q=80)' }}
      />
      {/* Gray overlay to mute the image */}
      <div className="absolute inset-0 bg-slate-200/70" />

      {/* Main content */}
      <div className="relative z-10 flex h-full items-center justify-between px-8 lg:px-20 xl:px-32">
        {/* Left: Brand content floating on background */}
        <div className="hidden lg:flex flex-col justify-between h-full max-w-lg py-10">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-widest text-slate-800 uppercase">AUTOWASHPRO</h1>
              <span className="inline-block mt-0.5 rounded-full bg-emerald-50 text-emerald-600 px-3 py-0.5 border border-emerald-200 text-[10px] font-extrabold tracking-widest">
                CLIENT HUB
              </span>
            </div>
          </div>

          {/* Hero text */}
          <div className="my-auto">
            <h2 className="text-4xl lg:text-5xl font-black leading-[1.05] tracking-tight text-slate-800">
              {t('hero.tagline1')} <br />
              {t('hero.car')} <br />
              <span className="text-emerald-600">{t('hero.tagline2')}</span>
            </h2>
            <p className="mt-4 text-sm text-slate-600 leading-relaxed max-w-md">
              {t('hero.description')}
            </p>

            {/* Stats */}
            <div className="flex items-center gap-8 mt-6">
              <div>
                <div className="text-2xl font-black text-emerald-600">5,000+</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">{t('hero.trusted')}</div>
              </div>
              <div className="h-10 w-px bg-slate-300" />
              <div>
                <div className="text-2xl font-black text-emerald-600">15+</div>
                <div className="text-xs text-slate-500 font-semibold mt-1">{t('hero.branches')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Form card floating on background */}
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <div className="bg-white/95 backdrop-blur-sm rounded-[40px] p-6 md:p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
            {/* Mobile Logo */}
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-black tracking-widest text-slate-800 uppercase">AUTOWASHPRO</h1>
                <span className="inline-block mt-0.5 rounded-full bg-emerald-50 text-emerald-600 px-2 py-0.5 border border-emerald-200 text-[8px] font-extrabold tracking-widest">
                  CLIENT HUB
                </span>
              </div>
            </div>

            {onBack && (
              <button
                onClick={onBack}
                className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t('back')}
              </button>
            )}

            <h2 className="text-3xl font-black text-slate-800 tracking-tight">
              {authMode === 'forgot' ? t('forgot.title') : authMode === 'login' ? t('login.title') : t('register.title')}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {authMode === 'login' ? t('register.login_now') : authMode === 'register' ? t('login.register_now') : t('forgot.title')}
            </p>

            {/* Toggle Tabs */}
            {authMode !== 'forgot' && (
              <div className="my-5 flex rounded-2xl bg-slate-100/80 p-1.5">
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-xl py-2.5 text-sm font-bold transition-all duration-300',
                    authMode === 'login'
                      ? 'bg-white text-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                      : 'text-slate-400 hover:text-slate-600'
                  )}
                  onClick={() => { setAuthMode('login'); setAuthError(''); setStatusMessage(''); }}
                >
                  {t('login.button')}
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-xl py-2.5 text-sm font-bold transition-all duration-300',
                    authMode === 'register'
                      ? 'bg-white text-slate-800 shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                      : 'text-slate-400 hover:text-slate-600'
                  )}
                  onClick={() => { setAuthMode('register'); setAuthError(''); setStatusMessage(''); }}
                >
                  {t('register.button')}
                </button>
              </div>
            )}

            {location.state?.adminAuthError && (
              <div className="mb-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-xs md:text-sm text-red-555 font-semibold">{location.state.adminAuthError}</div>
            )}
            {authError && (
              <div className="mb-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-xs md:text-sm text-red-500 font-semibold">{authError}</div>
            )}
            {statusMessage && (
              <div className="mb-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs md:text-sm text-emerald-600 font-semibold">{statusMessage}</div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-phone" className="text-xs font-bold text-slate-600">
                    {t('fields.identifier')}
                  </Label>
                  <div className="relative flex items-center bg-slate-100/70 border border-transparent rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500/20 transition-all duration-300">
                    <div className="w-6 h-6 rounded-full bg-slate-200/50 flex items-center justify-center text-slate-500 text-xs font-bold mr-3 select-none">
                      @
                    </div>
                    <input
                      id="login-phone"
                      name="identifier"
                      type="text"
                      placeholder="manager@gmail.com"
                      value={loginPhone}
                      onChange={(e) => setLoginPhone(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="login-pass" className="text-xs font-bold text-slate-600">
                    {t('fields.password')}
                  </Label>
                  <div className="relative flex items-center bg-slate-100/70 border border-transparent rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500/20 transition-all duration-300">
                    <LockKey size={18} className="text-slate-400 mr-3" />
                    <input
                      id="login-pass"
                      name="password"
                      type={showLoginPass ? 'text' : 'password'}
                      placeholder="••••••"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPass(!showLoginPass)}
                      className="text-slate-400 hover:text-emerald-500 transition-colors focus:outline-none ml-2"
                    >
                      {showLoginPass ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-slate-500 text-xs md:text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="rounded-md border-slate-200 text-emerald-600 focus:ring-emerald-500/30 w-4 h-4 bg-slate-50"
                    />
                    <span className="font-semibold text-slate-500">{t('remember_me')}</span>
                  </label>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setAuthMode('forgot'); setAuthError(''); setStatusMessage(''); setForgotStep(1); }}
                    className="text-xs md:text-sm font-bold text-emerald-600 hover:text-emerald-500 transition-colors"
                  >
                    {t('forgot_password_btn')}
                  </a>
                </div>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl py-3 px-6 shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/25 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                >
                  {loginLoading ? t('login_loading') : t('login_continue')}
                  {!loginLoading && <ArrowRight size={18} weight="bold" />}
                </button>
              </form>
            ) : authMode === 'register' ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name" className="text-xs font-bold text-slate-600">
                    {t('fields.name')}
                  </Label>
                  <div className="relative flex items-center bg-slate-100/70 border border-transparent rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500/20 transition-all duration-300">
                    <div className="w-6 h-6 rounded-full bg-slate-200/50 flex items-center justify-center text-slate-500 text-xs font-bold mr-3 select-none">
                      @
                    </div>
                    <input
                      id="reg-name"
                      type="text"
                      placeholder={t('fields.name_placeholder')}
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-email" className="text-xs font-bold text-slate-600">
                    {t('fields.email')}
                  </Label>
                  <div className="relative flex items-center bg-slate-100/70 border border-transparent rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500/20 transition-all duration-300">
                    <div className="w-6 h-6 rounded-full bg-slate-200/50 flex items-center justify-center text-slate-500 text-xs font-bold mr-3 select-none">
                      @
                    </div>
                    <input
                      id="reg-email"
                      type="email"
                      placeholder="khachhang@mail.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-pass" className="text-xs font-bold text-slate-600">
                    {t('fields.password')}
                  </Label>
                  <div className="relative flex items-center bg-slate-100/70 border border-transparent rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500/20 transition-all duration-300">
                    <LockKey size={18} className="text-slate-400 mr-3" />
                    <input
                      id="reg-pass"
                      type={showRegPass ? 'text' : 'password'}
                      placeholder="••••••"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-slate-800 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPass(!showRegPass)}
                      className="text-slate-400 hover:text-emerald-500 transition-colors focus:outline-none ml-2"
                    >
                      {showRegPass ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={registerLoading}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl py-3 px-6 shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/25 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                >
                  {registerLoading ? t('register_loading') : t('register_btn2')}
                  {!registerLoading && <ArrowRight size={18} weight="bold" />}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                {forgotStep === 1 && (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-email" className="text-xs font-bold text-slate-600">
                        {t('email_registered')}
                      </Label>
                      <div className="relative flex items-center bg-slate-100/70 border border-transparent rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500/20 transition-all duration-300">
                        <div className="w-6 h-6 rounded-full bg-slate-200/50 flex items-center justify-center text-slate-500 text-xs font-bold mr-3 select-none">
                          @
                        </div>
                        <input
                          id="forgot-email"
                          type="email"
                          placeholder="khachhang@mail.com"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="bg-transparent border-none outline-none w-full text-slate-800 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl py-3 px-6 shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/25 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                    >
                      {forgotLoading ? t('forgot_sending') : t('forgot_send_btn')}
                      {!forgotLoading && <ArrowRight size={18} weight="bold" />}
                    </button>
                  </form>
                )}

                {forgotStep === 2 && (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-otp" className="text-xs font-bold text-slate-600">
                        {t('otp_label')}
                      </Label>
                      <div className="relative flex items-center bg-slate-100/70 border border-transparent rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500/20 transition-all duration-300">
                        <LockKey size={18} className="text-slate-400 mr-3" />
                        <input
                          id="forgot-otp"
                          type="text"
                          placeholder={t('otp_placeholder')}
                          value={forgotOtp}
                          onChange={(e) => setForgotOtp(e.target.value)}
                          className="bg-transparent border-none outline-none w-full text-slate-800 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl py-3 px-6 shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/25 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                    >
                      {forgotLoading ? t('forgot_verifying') : t('verify_otp_btn')}
                      {!forgotLoading && <ArrowRight size={18} weight="bold" />}
                    </button>
                  </form>
                )}

                {forgotStep === 3 && (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password" className="text-xs font-bold text-slate-600">
                        {t('new_password')}
                      </Label>
                      <div className="relative flex items-center bg-slate-100/70 border border-transparent rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-emerald-500/10 focus-within:bg-white focus-within:border-emerald-500/20 transition-all duration-300">
                        <LockKey size={18} className="text-slate-400 mr-3" />
                        <input
                          id="new-password"
                          type={showNewPassword ? 'text' : 'password'}
                          placeholder={t('new_password_placeholder')}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="bg-transparent border-none outline-none w-full text-slate-800 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="text-slate-400 hover:text-emerald-500 transition-colors focus:outline-none ml-2"
                        >
                          {showNewPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl py-3 px-6 shadow-lg shadow-emerald-500/15 hover:shadow-emerald-500/25 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                    >
                      {forgotLoading ? t('forgot_saving') : t('change_password_btn')}
                      {!forgotLoading && <ArrowRight size={18} weight="bold" />}
                    </button>
                  </form>
                )}

                <div className="mt-4 text-center">
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setAuthMode('login'); setAuthError(''); setStatusMessage(''); }}
                    className="text-xs md:text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    {t('back_to_login')}
                  </a>
                </div>
              </div>
            )}

            {authMode !== 'forgot' && (
              <>
                <div className="mt-5 flex items-center justify-center">
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="px-4 text-xs font-semibold text-slate-400">{t('or_divider')}</span>
                  <div className="h-px bg-slate-200 flex-1"></div>
                </div>

                <div className="mt-5 flex justify-center" style={{ width: '100%' }}>
                  <div style={{ width: '100%' }}>
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() => {
                        setAuthError(t('messages.google_login_failed'));
                      }}
                      theme="outline"
                      size="large"
                      shape="rectangular"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Footer links */}
            <div className="flex items-center justify-center gap-8 mt-5 text-xs font-bold text-slate-400">
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
                {t('help')}
              </a>
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
                {t('terms')}
              </a>
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
                {t('privacy')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
