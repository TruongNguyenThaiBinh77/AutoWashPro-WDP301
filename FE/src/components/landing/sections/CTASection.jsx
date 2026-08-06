import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, CheckCircle2, ShieldCheck, ArrowRight, Star } from 'lucide-react';

export default function CTASection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="relative py-20 md:py-32 bg-slate-95 overflow-hidden" ref={ref}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        {/* Main Glassmorphism Container */}
        <div className="relative rounded-[2.5rem] bg-gradient-to-br from-slate-900 via-emerald-950/90 to-slate-900 border border-emerald-500/20 p-8 sm:p-12 md:p-16 shadow-2xl overflow-hidden">
          
          {/* Animated Background Glowing Orbs */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-500/20 blur-[100px] rounded-full pointer-events-none"
          />
          <motion.div
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 2,
            }}
            className="absolute -bottom-24 -right-24 w-[30rem] h-[30rem] bg-teal-500/20 blur-[120px] rounded-full pointer-events-none"
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center relative z-10">
            
            {/* Left Content Column */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-7 flex flex-col items-start text-left"
            >
              {/* Animated Top Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-6 shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Sparkles size={14} className="text-emerald-400 animate-pulse" />
                <span>{t('landing.cta.badge')}</span>
              </div>

              {/* Main Headline */}
              <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-white mb-6">
                {t('landing.cta.titlePart1')} <br className="hidden sm:block" />
                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200 bg-clip-text text-transparent">
                  {t('landing.cta.titlePart2')}
                </span>
              </h2>

              {/* Subtitle */}
              <p className="text-slate-300 text-base sm:text-lg leading-relaxed max-w-xl mb-8">
                {t('landing.cta.subtitle')}
              </p>

              {/* CTA Action & Trust Features */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto mb-8">
                <motion.button
                  onClick={() => navigate('/auth')}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-extrabold text-base shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/50 transition-all duration-300 cursor-pointer overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {t('landing.cta.register')}
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </motion.button>
              </div>

              {/* Trust Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-800/80 pt-6 w-full text-slate-400 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>{t('landing.cta.trustFreeSignup')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-emerald-400 shrink-0" />
                  <span>{t('landing.cta.trustNoCard')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-emerald-400 shrink-0" />
                  <span>{t('landing.cta.trust30s')}</span>
                </div>
              </div>
            </motion.div>

            {/* Right Interactive Image Frame */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-5 relative"
            >
              <div className="relative rounded-3xl overflow-hidden border border-emerald-500/30 bg-slate-900/60 shadow-2xl group">
                <img
                  src="/images/cta_banner.jpg"
                  alt={t('landing.cta.imageAlt')}
                  className="w-full h-80 sm:h-96 object-cover object-center group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                {/* Floating Stat Overlay Card 1 */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                    <Star size={16} fill="currentColor" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{t('landing.cta.rating')}</div>
                    <div className="text-[10px] text-slate-400">{t('landing.cta.ratingLabel')}</div>
                  </div>
                </motion.div>

                {/* Floating Stat Overlay Card 2 */}
                <motion.div
                  animate={{ y: [0, 8, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                  className="absolute bottom-4 right-4 bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{t('landing.cta.carsWashed')}</div>
                    <div className="text-[10px] text-slate-400">{t('landing.cta.qualityLabel')}</div>
                  </div>
                </motion.div>
              </div>
            </motion.div>

          </div>
        </div>
      </div>
    </section>
  );
}
