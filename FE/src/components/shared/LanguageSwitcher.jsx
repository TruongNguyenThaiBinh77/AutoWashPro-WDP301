import { useTranslation } from 'react-i18next';
import { Globe } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export default function LanguageSwitcher({ className, isCompact = false, isLightBg = false }) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'vi';

  const toggleLanguage = () => {
    const nextLang = currentLang === 'vi' ? 'en' : 'vi';
    i18n.changeLanguage(nextLang);
  };

  if (isCompact) {
    return (
      <button
        type="button"
        onClick={toggleLanguage}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg font-bold text-xs transition-colors border',
          isLightBg
            ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            : 'bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-accent',
          className
        )}
        title={currentLang === 'vi' ? 'Chuyển sang Tiếng Anh (English)' : 'Switch to Vietnamese (Tiếng Việt)'}
        aria-label="Toggle language"
      >
        {currentLang === 'vi' ? 'EN' : 'VI'}
      </button>
    );
  }

  return (
    <div
      onClick={toggleLanguage}
      className={cn(
        'inline-flex items-center gap-1.5 p-1 rounded-full border cursor-pointer select-none transition-all duration-200 shadow-sm',
        isLightBg
          ? 'bg-slate-100 border-slate-200/80 text-slate-700'
          : 'bg-white/10 backdrop-blur-md border-white/20 text-slate-800 dark:text-white',
        className
      )}
      title={currentLang === 'vi' ? 'Chuyển sang Tiếng Anh' : 'Switch to Vietnamese'}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && toggleLanguage()}
    >
      <Globe size={16} className={currentLang === 'vi' ? 'text-emerald-500' : 'text-blue-500'} />
      <span
        className={cn(
          'px-2 py-0.5 rounded-full text-xs font-bold transition-all',
          currentLang === 'vi'
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'text-slate-500 hover:text-slate-800'
        )}
      >
        VI
      </span>
      <span
        className={cn(
          'px-2 py-0.5 rounded-full text-xs font-bold transition-all',
          currentLang === 'en'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-slate-500 hover:text-slate-800'
        )}
      >
        EN
      </span>
    </div>
  );
}
