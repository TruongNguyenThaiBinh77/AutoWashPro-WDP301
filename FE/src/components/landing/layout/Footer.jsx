import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, Phone, Mail, Clock, MapPin, ShieldCheck, Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '../../../lib/authStorage.js';
import { translateText } from '@/utils/notifTranslator';

const DEFAULT_SERVICES = [
  { titleKey: 'landing.footer.serviceSnowFoam', linkUrl: '/#services' },
  { titleKey: 'landing.footer.serviceEngine', linkUrl: '/#services' },
  { titleKey: 'landing.footer.serviceCeramic', linkUrl: '/#services' },
  { titleKey: 'landing.footer.serviceInterior', linkUrl: '/#services' },
  { titleKey: 'landing.footer.servicePolish', linkUrl: '/#services' },
];

const DEFAULT_POLICIES = [
  { slug: 'privacy', titleKey: 'landing.footer.policyPrivacy', icon: '🔒' },
  { slug: 'terms', titleKey: 'landing.footer.policyTerms', icon: '📋' },
  { slug: 'payment', titleKey: 'landing.footer.policyPayment', icon: '💳' },
  { slug: 'cancellation', titleKey: 'landing.footer.policyCancellation', icon: '❌' },
  { slug: 'refund', titleKey: 'landing.footer.policyRefund', icon: '🔙' },
];

export default function Footer() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'vi';
  const [featuredServices, setFeaturedServices] = useState(DEFAULT_SERVICES);
  const [policyList, setPolicyList] = useState(DEFAULT_POLICIES);

  useEffect(() => {
    let cancelled = false;
    async function fetchFooterData() {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/policies`);
        if (!res.ok) return;
        const data = await res.json();

        if (!cancelled && data?.success && Array.isArray(data?.data)) {
          const allItems = data.data;

          const services = allItems.filter(item => item.category === 'featured_service' && item.isActive);
          if (services.length > 0) {
            setFeaturedServices(services);
          }

          const policies = allItems.filter(item => item.category === 'policy' && item.isActive);
          if (policies.length > 0) {
            setPolicyList(policies);
          }
        }
      } catch {
        // Fallback to default lists on transport error
      }
    }

    fetchFooterData();
    return () => { cancelled = true; };
  }, []);

  const resolveTitle = (item) => (item.titleKey ? t(item.titleKey) : translateText(item.title, currentLang));

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="relative bg-gradient-to-b from-slate-50 via-emerald-50/30 to-slate-100/90 text-slate-700 border-t border-slate-200/80 overflow-hidden font-sans">
      {/* Subtle Pastel Ambient Orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-100/40 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-teal-100/40 blur-[100px] rounded-full pointer-events-none" />

      {/* Top Quick Info Ribbon Bar */}
      <div className="border-b border-slate-200/70 bg-white/70 backdrop-blur-md py-3.5">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-6 text-slate-600">
            <span className="flex items-center gap-2 font-medium">
              <Clock size={15} className="text-emerald-600 shrink-0" />
              {t('landing.footer.openHoursLabel')} <strong className="text-slate-900 font-bold">07:00 - 20:00</strong> {t('landing.footer.allDays')}
            </span>
            <span className="hidden sm:flex items-center gap-2 font-medium">
              <MapPin size={15} className="text-emerald-600 shrink-0" />
              {t('landing.footer.networkLabel')} <strong className="text-slate-900 font-bold">{t('landing.footer.networkValue')}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 text-emerald-700 font-bold ml-auto bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200/60">
            <Phone size={14} className="animate-pulse text-emerald-600" />
            <span>{t('landing.footer.hotline')}</span>
            <a href="tel:19008888" className="text-emerald-800 hover:text-emerald-600 font-extrabold underline transition-colors">
              1900 8888
            </a>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 pt-14 pb-10 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 lg:gap-8">
          
          {/* Col 1: Brand Intro */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-extrabold tracking-tight text-slate-900">
                Auto<span className="text-emerald-600">Wash</span>Pro
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-300/60 text-emerald-800 text-[10px] font-extrabold uppercase tracking-wider shadow-2xs">
                {t('landing.footer.badgeVersion')}
              </span>
            </div>
            
            <p className="text-slate-600 text-sm leading-relaxed max-w-md">
              {t('landing.footer.tagline')}
            </p>

            {/* Social Media Icons */}
            <div className="pt-2">
              <p className="text-xs font-bold text-slate-800 mb-2.5 uppercase tracking-wider">{t('landing.footer.connectTitle')}</p>
              <div className="flex items-center gap-3">
                {[
                  {
                    name: 'Facebook',
                    icon: (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                    ),
                  },
                  {
                    name: 'Instagram',
                    icon: (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                      </svg>
                    ),
                  },
                  {
                    name: 'YouTube',
                    icon: (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                    ),
                  },
                ].map((item) => (
                  <a
                    key={item.name}
                    href="#"
                    aria-label={item.name}
                    className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-emerald-600 hover:border-emerald-400 hover:bg-emerald-50/50 shadow-2xs transition-all duration-300"
                  >
                    {item.icon}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Col 2: Services */}
          <div>
            <h4 className="text-emerald-700 text-xs font-extrabold uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              {t('landing.footer.servicesTitle')}
            </h4>
            <ul className="space-y-2.5 text-sm font-medium">
              {featuredServices.map((item, idx) => (
                <li key={item._id || item.slug || idx}>
                  <a href={item.linkUrl || '/#services'} className="text-slate-600 hover:text-emerald-600 hover:translate-x-1 transition-all duration-200 inline-block">
                    {item.icon && <span className="mr-1.5">{item.icon}</span>}
                    {resolveTitle(item)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Policies */}
          <div>
            <h4 className="text-emerald-700 text-xs font-extrabold uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              {t('landing.footer.policiesTitle')}
            </h4>
            <ul className="space-y-2.5 text-sm font-medium">
              {policyList.map((item, idx) => (
                <li key={item._id || item.slug || idx}>
                  <a href={`/policies#${item.slug}`} className="text-slate-600 hover:text-emerald-600 transition-colors flex items-center gap-2">
                    <span>{item.icon || '📜'}</span> {resolveTitle(item)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4: Contact Info */}
          <div>
            <h4 className="text-emerald-700 text-xs font-extrabold uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              {t('landing.footer.contactTitle')}
            </h4>
            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex items-start gap-3 bg-white/90 border border-emerald-100 p-3 rounded-2xl shadow-2xs">
                <Mail size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="block text-[11px] text-slate-400 font-medium">{t('landing.footer.emailCsLabel')}</span>
                  <span className="font-bold text-slate-800">support@autowashpro.vn</span>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-white/90 border border-emerald-100 p-3 rounded-2xl shadow-2xs">
                <ShieldCheck size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="block text-[11px] text-slate-400 font-medium">{t('landing.footer.warrantyLabel')}</span>
                  <span className="font-bold text-emerald-700">{t('landing.footer.warrantyValue')}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span>&copy; {new Date().getFullYear()} AutoWashPro. {t('landing.footer.copyrightText')}</span>
            <Heart size={13} className="text-red-500 fill-red-500 animate-pulse" />
          </div>

          <div className="flex items-center gap-6">
            <a href="/policies#privacy" className="hover:text-emerald-600 transition-colors">{t('landing.footer.privacyLink')}</a>
            <a href="/policies#terms" className="hover:text-emerald-600 transition-colors">{t('landing.footer.termsLink')}</a>
            <button
              onClick={scrollToTop}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-600 text-white font-bold hover:bg-emerald-500 shadow-md shadow-emerald-500/20 transition-all duration-300 cursor-pointer"
            >
              <span>{t('landing.footer.backToTop')}</span>
              <ArrowUp size={13} />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
