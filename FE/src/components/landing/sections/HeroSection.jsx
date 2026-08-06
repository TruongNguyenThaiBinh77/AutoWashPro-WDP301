import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import VideoBackground from '../widgets/VideoBackground';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const STATIC_STATS = [
  { num: '2k+', labelKey: 'landing.hero.stats.washes' },
  { num: '100.0%', labelKey: 'landing.hero.stats.satisfaction' },
  { num: '5', labelKey: 'landing.hero.stats.branches' },
];

function formatNum(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k+`;
  return `${n}+`;
}

export default function HeroSection() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [stats, setStats] = useState(STATIC_STATS);

  useEffect(() => {
    fetch(`${API_BASE}/stats/public`)
      .then(r => r.json())
      .then(payload => {
        const d = payload?.data;
        if (!d) return;
        setStats([
          { num: formatNum(d.totalCompleted), labelKey: 'landing.hero.stats.washes' },
          { num: d.satisfactionRate, labelKey: 'landing.hero.stats.satisfaction' },
          { num: `${d.totalBranches}`, labelKey: 'landing.hero.stats.branches' },
        ]);
      })
      .catch(() => {});
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <VideoBackground />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-black/80 z-0" />

      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-5 md:px-12 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-4">
              <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white backdrop-blur-md text-xs font-semibold tracking-[0.2em] uppercase shadow-lg">
                {t('landing.hero.badge')}
              </span>
            </div>

            <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.1] text-white mb-6 drop-shadow-2xl">
              {t('landing.hero.titleCare')}<br className="hidden md:block"/> {t('landing.hero.titleWay')} <span className="text-emerald-400">{t('landing.hero.titleProfessional')}</span>
            </h1>

            <p className="text-white/80 md:text-white/90 text-base md:text-xl max-w-2xl mx-auto leading-relaxed mb-10 drop-shadow-md">
              {t('landing.hero.subtitle')}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <button
              onClick={() => navigate('/booking')}
              className="group relative w-full sm:w-auto px-8 py-3.5 rounded-full bg-emerald-500 text-white font-bold text-sm md:text-base overflow-hidden shadow-[0_0_40px_-10px_rgba(16,185,129,0.8)] hover:shadow-[0_0_60px_-10px_rgba(16,185,129,0.9)] transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="relative z-10 flex items-center justify-center gap-2">
                {t('landing.hero.bookNow')}
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </button>
            <button
              onClick={() => {
                document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="group w-full sm:w-auto px-8 py-3.5 rounded-full border border-white/30 bg-white/5 text-white font-semibold text-sm md:text-base hover:bg-white/10 transition-all duration-300 backdrop-blur-md hover:-translate-y-0.5 flex items-center justify-center gap-2"
            >
              {t('landing.hero.scrollExplore')}
              <svg className="w-4 h-4 group-hover:translate-y-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="grid grid-cols-3 gap-2 sm:gap-8 md:gap-16 pt-8 pb-4 border-t border-white/10 max-w-2xl mx-auto w-full"
          >
            {stats.map((stat) => (
              <div key={stat.labelKey} className="text-center group cursor-default flex flex-col items-center">
                <div className="text-2xl sm:text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 group-hover:scale-105 transition-transform duration-300 drop-shadow-md">
                  {stat.num}
                </div>
                <div className="text-[11px] sm:text-xs font-semibold text-white/70 tracking-widest uppercase mt-1">
                  {t(stat.labelKey)}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
