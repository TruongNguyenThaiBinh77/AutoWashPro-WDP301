import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const steps = [
  {
    number: '01',
    titleKey: 'landing.how.step1Title',
    descKey: 'landing.how.step1Desc',
    image: '/images/steps/step1.jpg',
    tagKey: 'landing.how.step1Tag',
  },
  {
    number: '02',
    titleKey: 'landing.how.step2Title',
    descKey: 'landing.how.step2Desc',
    image: '/images/steps/step2.jpg',
    tagKey: 'landing.how.step2Tag',
  },
  {
    number: '03',
    titleKey: 'landing.how.step3Title',
    descKey: 'landing.how.step3Desc',
    image: '/images/steps/step3.jpg',
    tagKey: 'landing.how.step3Tag',
  },
  {
    number: '04',
    titleKey: 'landing.how.step4Title',
    descKey: 'landing.how.step4Desc',
    image: '/images/steps/step4.jpg',
    tagKey: 'landing.how.step4Tag',
  },
];

function StepCard({ step, index }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const { t } = useTranslation();

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1 } : {}}
      transition={{ duration: 0.6, delay: index * 0.15 }}
      className={`relative z-10 ${index % 2 === 0 ? 'lg:-translate-y-8' : 'lg:translate-y-6'}`}
    >
      {/* Smooth Fluid Wave Motion wrapper */}
      <motion.div
        animate={{
          y: [-20, 20, -20],
        }}
        transition={{
          duration: 5.2,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
          delay: index * 0.75,
        }}
        className="h-full"
      >
        <div className="group relative p-8 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-3xl shadow-sm hover:shadow-2xl hover:shadow-emerald-200/60 hover:-translate-y-2.5 transition-all duration-500 text-center flex flex-col items-center h-full">
          {/* Step Badge */}
          <div className="absolute -top-3.5 px-4 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-mono font-black text-xs rounded-full shadow-md shadow-emerald-500/25 tracking-wider uppercase">
            {t('landing.how.stepLabel')} {step.number}
          </div>

          {/* Illustration Container */}
          <div className="w-full aspect-square max-w-[210px] bg-gradient-to-b from-emerald-50/90 to-teal-50/40 rounded-2xl p-4 mt-2 mb-6 overflow-hidden flex items-center justify-center border border-emerald-100/80 group-hover:scale-105 transition-transform duration-500 shadow-2xs">
            <img
              src={step.image}
              alt={t(step.titleKey)}
              className="w-full h-full object-contain mix-blend-multiply rounded-xl"
            />
          </div>

          <h3 className="text-lg font-extrabold text-slate-900 mb-2 group-hover:text-emerald-700 transition-colors">{t(step.titleKey)}</h3>
          <p className="text-slate-500 text-xs leading-relaxed max-w-xs mb-5">{t(step.descKey)}</p>
          
          <span className="mt-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold text-emerald-800 bg-emerald-50/90 border border-emerald-200/70 shadow-2xs">
            {t(step.tagKey)}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function HowItWorksSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <section className="relative py-28 md:py-36 bg-emerald-50/30 overflow-hidden" id="services" ref={ref}>
      {/* Background Ambient Glow Orbs */}
      <div className="absolute top-1/4 left-10 w-96 h-96 bg-emerald-200/30 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-200/30 blur-3xl rounded-full pointer-events-none" />

      <div className="max-w-[1520px] mx-auto px-6 md:px-12 lg:px-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-2xl mx-auto text-center mb-24"
        >
          <span className="text-emerald-600 text-xs font-extrabold tracking-widest uppercase mb-3 block px-3.5 py-1 bg-emerald-100/60 rounded-full w-fit mx-auto border border-emerald-200/60">
            {t('landing.how.label')}
          </span>
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tighter leading-none text-slate-900 mb-4">
            {t('landing.how.titlePart1')} <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">{t('landing.how.titlePart2')}</span>
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm md:text-base leading-relaxed">
            {t('landing.how.subtitle')}
          </p>
        </motion.div>

        {/* Cards Grid with Widened Spacing & Wave Line */}
        <div className="relative">
          {/* Desktop SVG Dotted Connecting Wave Line */}
          <div className="hidden lg:block absolute top-1/2 left-16 right-16 -translate-y-1/2 pointer-events-none z-0">
            <svg className="w-full h-32" viewBox="0 0 1000 120" fill="none" preserveAspectRatio="none">
              <motion.path
                d="M 50 70 Q 250 15 500 70 T 950 70"
                stroke="#10b981"
                strokeWidth="3"
                strokeDasharray="8 8"
                animate={{ strokeDashoffset: [0, -64] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                className="opacity-45"
              />
            </svg>
          </div>

          {/* Grid with Widened Gap (gap-8 md:gap-10 lg:gap-12 xl:gap-16) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10 lg:gap-12 xl:gap-16 items-center relative z-10">
            {steps.map((step, index) => (
              <StepCard key={step.number} step={step} index={index} />
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-28 md:mt-36 text-center relative z-20"
        >
          <button
            onClick={() => navigate('/booking')}
            className="px-9 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-full font-bold text-sm hover:from-emerald-500 hover:to-teal-500 hover:scale-105 active:scale-95 transition-all duration-300 shadow-xl shadow-emerald-500/25 cursor-pointer"
          >
            {t('landing.how.cta')}
          </button>
        </motion.div>
      </div>
    </section>
  );
}
