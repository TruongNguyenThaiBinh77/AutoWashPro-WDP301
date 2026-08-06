import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../layout/Navbar';
import Footer from '../layout/Footer';
import { useSystemConfig } from '../../../hooks/useSystemConfig.jsx';
import { getApiBaseUrl } from '../../../lib/authStorage.js';

const getFallbackPolicies = ({ depositPercent, noShowGraceMinutes, minAdvanceMinutes } = {}, t = (key) => key) => [
  {
    id: 'privacy',
    slug: 'privacy',
    title: t('landing.policy.privacy.title'),
    icon: '🔒',
    sections: [
      { subtitle: t('landing.policy.privacy.0.subtitle'), body: t('landing.policy.privacy.0.body') },
      { subtitle: t('landing.policy.privacy.1.subtitle'), body: t('landing.policy.privacy.1.body') },
      { subtitle: t('landing.policy.privacy.2.subtitle'), body: t('landing.policy.privacy.2.body') },
      { subtitle: t('landing.policy.privacy.3.subtitle'), body: t('landing.policy.privacy.3.body') },
      { subtitle: t('landing.policy.privacy.4.subtitle'), body: t('landing.policy.privacy.4.body') },
    ],
  },
  {
    id: 'terms',
    slug: 'terms',
    title: t('landing.policy.terms.title'),
    icon: '📋',
    sections: [
      { subtitle: t('landing.policy.terms.0.subtitle'), body: t('landing.policy.terms.0.body') },
      { subtitle: t('landing.policy.terms.1.subtitle'), body: t('landing.policy.terms.1.body') },
      { subtitle: t('landing.policy.terms.2.subtitle'), body: t('landing.policy.terms.2.body') },
      { subtitle: t('landing.policy.terms.3.subtitle'), body: t('landing.policy.terms.3.body') },
      { subtitle: t('landing.policy.terms.4.subtitle'), body: t('landing.policy.terms.4.body') },
    ],
  },
  {
    id: 'payment',
    slug: 'payment',
    title: t('landing.policy.payment.title'),
    icon: '💳',
    sections: [
      { subtitle: t('landing.policy.payment.0.subtitle'), body: t('landing.policy.payment.0.body') },
      { subtitle: t('landing.policy.payment.1.subtitle'), body: t('landing.policy.payment.1.body', { depositPercent }) },
      { subtitle: t('landing.policy.payment.2.subtitle'), body: t('landing.policy.payment.2.body') },
      { subtitle: t('landing.policy.payment.3.subtitle'), body: t('landing.policy.payment.3.body') },
      { subtitle: t('landing.policy.payment.4.subtitle'), body: t('landing.policy.payment.4.body') },
    ],
  },
  {
    id: 'cancellation',
    slug: 'cancellation',
    title: t('landing.policy.cancellation.title'),
    icon: '❌',
    sections: [
      { subtitle: t('landing.policy.cancellation.0.subtitle'), body: t('landing.policy.cancellation.0.body') },
      { subtitle: t('landing.policy.cancellation.1.subtitle'), body: t('landing.policy.cancellation.1.body') },
      { subtitle: t('landing.policy.cancellation.2.subtitle'), body: t('landing.policy.cancellation.2.body', { noShowGraceMinutes: noShowGraceMinutes ?? '30' }) },
      { subtitle: t('landing.policy.cancellation.3.subtitle'), body: t('landing.policy.cancellation.3.body') },
      { subtitle: t('landing.policy.cancellation.4.subtitle'), body: t('landing.policy.cancellation.4.body') },
    ],
  },
  {
    id: 'refund',
    slug: 'refund',
    title: t('landing.policy.refund.title'),
    icon: '🔙',
    sections: [
      { subtitle: t('landing.policy.refund.0.subtitle'), body: t('landing.policy.refund.0.body') },
      { subtitle: t('landing.policy.refund.1.subtitle'), body: t('landing.policy.refund.1.body') },
      { subtitle: t('landing.policy.refund.2.subtitle'), body: t('landing.policy.refund.2.body') },
      { subtitle: t('landing.policy.refund.3.subtitle'), body: t('landing.policy.refund.3.body') },
    ],
  },
  {
    id: 'insurance',
    slug: 'insurance',
    title: t('landing.policy.insurance.title'),
    icon: '🤝',
    sections: [
      { subtitle: t('landing.policy.insurance.0.subtitle'), body: t('landing.policy.insurance.0.body') },
      { subtitle: t('landing.policy.insurance.1.subtitle'), body: t('landing.policy.insurance.1.body') },
      { subtitle: t('landing.policy.insurance.2.subtitle'), body: t('landing.policy.insurance.2.body') },
      { subtitle: t('landing.policy.insurance.3.subtitle'), body: t('landing.policy.insurance.3.body') },
      { subtitle: t('landing.policy.insurance.4.subtitle'), body: t('landing.policy.insurance.4.body') },
      { subtitle: t('landing.policy.insurance.5.subtitle'), body: t('landing.policy.insurance.5.body') },
    ],
  },
  {
    id: 'booking',
    slug: 'booking',
    title: t('landing.policy.booking.title'),
    icon: '📅',
    sections: [
      { subtitle: t('landing.policy.booking.0.subtitle'), body: t('landing.policy.booking.0.body') },
      { subtitle: t('landing.policy.booking.1.subtitle'), body: t('landing.policy.booking.1.body', { minAdvanceMinutes: minAdvanceMinutes ?? '15' }) },
      { subtitle: t('landing.policy.booking.2.subtitle'), body: t('landing.policy.booking.2.body') },
      { subtitle: t('landing.policy.booking.3.subtitle'), body: t('landing.policy.booking.3.body') },
      { subtitle: t('landing.policy.booking.4.subtitle'), body: t('landing.policy.booking.4.body') },
    ],
  },
  {
    id: 'loyalty',
    slug: 'loyalty',
    title: t('landing.policy.loyalty.title'),
    icon: '⭐',
    sections: [
      { subtitle: t('landing.policy.loyalty.0.subtitle'), body: t('landing.policy.loyalty.0.body') },
      { subtitle: t('landing.policy.loyalty.1.subtitle'), body: t('landing.policy.loyalty.1.body') },
      { subtitle: t('landing.policy.loyalty.2.subtitle'), body: t('landing.policy.loyalty.2.body') },
      { subtitle: t('landing.policy.loyalty.3.subtitle'), body: t('landing.policy.loyalty.3.body') },
    ],
  },
  {
    id: 'data-protection',
    slug: 'data-protection',
    title: t('landing.policy.data-protection.title'),
    icon: '🛡️',
    sections: [
      { subtitle: t('landing.policy.data-protection.0.subtitle'), body: t('landing.policy.data-protection.0.body') },
      { subtitle: t('landing.policy.data-protection.1.subtitle'), body: t('landing.policy.data-protection.1.body') },
      { subtitle: t('landing.policy.data-protection.2.subtitle'), body: t('landing.policy.data-protection.2.body') },
      { subtitle: t('landing.policy.data-protection.3.subtitle'), body: t('landing.policy.data-protection.3.body') },
    ],
  },
];

function Sidebar({ policies = [], activeSection, onSelect }) {
  const { t } = useTranslation();
  return (
    <nav className="space-y-1 sticky top-24">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 pb-2">{t('landing.policy.listTitle')}</p>
      {policies.map(p => {
        const key = p.slug || p.id;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left cursor-pointer ${
              activeSection === key
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            }`}
          >
            <span className="text-base shrink-0">{p.icon || '📜'}</span>
            <span className="truncate">{p.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function PolicyPage({ onOpenAuth, user, onLogout, onGoToProfile, onGoToHistory, onGoToPayments, onGoToNotifications }) {
  const location = useLocation();
  const { t } = useTranslation();
  const configs = useSystemConfig();
  const depositPercent = Math.round(configs?.DEPOSIT_RATE ?? 0);
  const noShowGraceMinutes = configs?.AUTO_CANCEL_GRACE_MINUTES;
  const minAdvanceMinutes = configs?.MIN_ADVANCE_BOOKING_MINUTES;

  const [policies, setPolicies] = useState(() => getFallbackPolicies({ depositPercent, noShowGraceMinutes, minAdvanceMinutes }, t));
  const [activeSection, setActiveSection] = useState('privacy');

  useEffect(() => {
    let cancelled = false;
    async function loadPolicies() {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/policies?category=policy`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.success && Array.isArray(data?.data) && data.data.length > 0) {
          const mapped = data.data.map(p => ({
            id: p.slug || p._id,
            slug: p.slug,
            title: p.title,
            icon: p.icon || '📜',
            sections: p.sections || [],
            updatedAt: p.updatedAt
          }));
          setPolicies(mapped);
        }
      } catch {
        // keep fallback
      }
    }

    loadPolicies();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const hash = location.hash?.replace('#', '');
    if (hash && policies.some(p => (p.slug || p.id) === hash)) {
      setActiveSection(hash);
    }
  }, [location.hash, policies]);

  return (
    <div className="bg-white min-h-screen">
      <Navbar
        onOpenAuth={onOpenAuth}
        user={user}
        onLogout={onLogout}
        onGoToProfile={onGoToProfile}
        onGoToHistory={onGoToHistory}
        onGoToPayments={onGoToPayments}
        onGoToNotifications={onGoToNotifications}
      />

      {/* Hero header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 pt-28 pb-16 md:pb-20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white/90 text-xs font-semibold tracking-wide mb-4">
              {t('landing.policy.heroBadge')}
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              {t('landing.policy.heroTitle')}
            </h1>
            <p className="text-white/70 mt-3 md:mt-4 text-sm md:text-base max-w-2xl leading-relaxed">
              {t('landing.policy.heroSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-10 md:py-14">
        <div className="flex flex-col md:flex-row gap-10">
          {/* Sidebar - desktop */}
          <aside className="hidden md:block w-64 lg:w-72 shrink-0">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <Sidebar policies={policies} activeSection={activeSection} onSelect={(id) => { setActiveSection(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0 max-w-4xl">
            {/* Mobile section selector */}
            <div className="md:hidden mb-6">
              <select
                value={activeSection}
                onChange={e => { setActiveSection(e.target.value); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="w-full h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                {policies.map(p => (
                  <option key={p.slug || p.id} value={p.slug || p.id}>{p.icon} {p.title}</option>
                ))}
              </select>
            </div>

            <div className="space-y-10">
              {policies.filter(p => (p.slug || p.id) === activeSection).map(policy => (
                <section
                  key={policy.slug || policy.id}
                  id={policy.slug || policy.id}
                  className="scroll-mt-28"
                >
                  <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-200">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-xl">
                      {policy.icon}
                    </div>
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-slate-900">{policy.title}</h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {t('landing.policy.updatedAt', { date: policy.updatedAt ? new Date(policy.updatedAt).toLocaleDateString('vi-VN') : '01/2026' })}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-5">
                    {(policy.sections || policy.content || []).map((section, i) => (
                      <div key={i} className="bg-slate-50/50 rounded-2xl p-5 md:p-6 border border-slate-100 hover:border-slate-200 transition-colors">
                        <h3 className="text-sm font-bold text-emerald-700 mb-2">{section.subtitle}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{section.body}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Back to top */}
            <div className="mt-12 pt-8 border-t border-slate-200 text-center">
              <a
                href="#"
                onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                {t('landing.policy.backToTop')}
              </a>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}