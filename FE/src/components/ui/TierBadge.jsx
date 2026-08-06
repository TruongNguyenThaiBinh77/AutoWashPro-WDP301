import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/index';
import {
  Trophy,
  Medal,
  Crown,
  Star,
  Diamond,
  Sparkle,
  Shield,
  ShieldStar,
  MedalMilitary,
  Flame,
  Lightning,
  Gift,
  Coin,
  Heart,
  Rocket,
  Sun,
  Circle,
  SealCheck,
  MagicWand,
  Fire,
  CheckCircle,
} from '@phosphor-icons/react';

export const ICON_CATALOG = [
  { name: 'Circle', label: i18n.t('shared.tierBadge.icon.circle'), icon: Circle },
  { name: 'Medal', label: i18n.t('shared.tierBadge.icon.medal'), icon: Medal },
  { name: 'Crown', label: i18n.t('shared.tierBadge.icon.crown'), icon: Crown },
  { name: 'Diamond', label: i18n.t('shared.tierBadge.icon.diamond'), icon: Diamond },
  { name: 'Trophy', label: i18n.t('shared.tierBadge.icon.trophy'), icon: Trophy },
  { name: 'Star', label: i18n.t('shared.tierBadge.icon.star'), icon: Star },
  { name: 'Sparkle', label: i18n.t('shared.tierBadge.icon.sparkle'), icon: Sparkle },
  { name: 'Shield', label: i18n.t('shared.tierBadge.icon.shield'), icon: Shield },
  { name: 'ShieldStar', label: i18n.t('shared.tierBadge.icon.shieldStar'), icon: ShieldStar },
  { name: 'MedalMilitary', label: i18n.t('shared.tierBadge.icon.medalMilitary'), icon: MedalMilitary },
  { name: 'Flame', label: i18n.t('shared.tierBadge.icon.flame'), icon: Flame },
  { name: 'Lightning', label: i18n.t('shared.tierBadge.icon.lightning'), icon: Lightning },
  { name: 'Gift', label: i18n.t('shared.tierBadge.icon.gift'), icon: Gift },
  { name: 'Coin', label: i18n.t('shared.tierBadge.icon.coin'), icon: Coin },
  { name: 'Heart', label: i18n.t('shared.tierBadge.icon.heart'), icon: Heart },
  { name: 'Rocket', label: i18n.t('shared.tierBadge.icon.rocket'), icon: Rocket },
  { name: 'Sun', label: i18n.t('shared.tierBadge.icon.sun'), icon: Sun },
  { name: 'SealCheck', label: i18n.t('shared.tierBadge.icon.sealCheck'), icon: SealCheck },
  { name: 'MagicWand', label: i18n.t('shared.tierBadge.icon.magicWand'), icon: MagicWand },
  { name: 'Fire', label: i18n.t('shared.tierBadge.icon.fire'), icon: Fire },
  { name: 'CheckCircle', label: i18n.t('shared.tierBadge.icon.checkCircle'), icon: CheckCircle },
];

export const COLOR_PALETTE = [
  { id: 'bronze', label: i18n.t('shared.tierBadge.color.bronze'), bg: '#fef3c7', border: '#fcd34d', color: '#b45309', preview: '#d97706' },
  { id: 'silver', label: i18n.t('shared.tierBadge.color.silver'), bg: '#f1f5f9', border: '#cbd5e1', color: '#475569', preview: '#94a3b8' },
  { id: 'gold', label: i18n.t('shared.tierBadge.color.gold'), bg: '#fef9c3', border: '#facc15', color: '#a16207', preview: '#eab308' },
  { id: 'diamond', label: i18n.t('shared.tierBadge.color.diamond'), bg: '#ecfeff', border: '#22d3ee', color: '#0e7490', preview: '#06b6d4' },
  { id: 'purple', label: i18n.t('shared.tierBadge.color.purple'), bg: '#faf5ff', border: '#e9d5ff', color: '#7e22ce', preview: '#9333ea' },
  { id: 'rose', label: i18n.t('shared.tierBadge.color.rose'), bg: '#fff1f2', border: '#fecdd3', color: '#be123c', preview: '#e11d48' },
  { id: 'emerald', label: i18n.t('shared.tierBadge.color.emerald'), bg: '#ecfdf5', border: '#a7f3d0', color: '#047857', preview: '#10b981' },
  { id: 'indigo', label: i18n.t('shared.tierBadge.color.indigo'), bg: '#e0e7ff', border: '#c7d2fe', color: '#4338ca', preview: '#4f46e5' },
];

const ICON_MAP = ICON_CATALOG.reduce((acc, item) => {
  acc[item.name] = item.icon;
  return acc;
}, {});

const PRESET_TIERS = {
  bronze: {
    label: i18n.t('shared.tierBadge.tier.bronze'),
    bg: '#fef3c7',
    border: '#fcd34d',
    color: '#b45309',
    iconName: 'Circle',
  },
  silver: {
    label: i18n.t('shared.tierBadge.tier.silver'),
    bg: '#f1f5f9',
    border: '#cbd5e1',
    color: '#475569',
    iconName: 'Medal',
  },
  gold: {
    label: i18n.t('shared.tierBadge.tier.gold'),
    bg: '#fef9c3',
    border: '#facc15',
    color: '#a16207',
    iconName: 'Crown',
  },
  diamond: {
    label: i18n.t('shared.tierBadge.tier.diamond'),
    bg: '#ecfeff',
    border: '#22d3ee',
    color: '#0e7490',
    iconName: 'Diamond',
  },
};

export function RenderIcon({ name, size = 13, className = '' }) {
  const IconComp = ICON_MAP[name];
  if (!IconComp) return null;
  return <IconComp size={size} weight="fill" className={className} />;
}

export default function TierBadge({ tier, iconName }) {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);

  const tierId = typeof tier === 'object' ? tier?.id : tier;
  const customName = typeof tier === 'object' ? tier?.name : null;
  const customIconName = typeof tier === 'object' ? tier?.icon : iconName;
  const customBg = typeof tier === 'object' ? tier?.bg : null;
  const customBorder = typeof tier === 'object' ? tier?.border : null;
  const customColor = typeof tier === 'object' ? tier?.color : null;
  const colorThemeId = typeof tier === 'object' ? tier?.colorTheme : null;

  const tierIdLower = (tierId || '').toLowerCase();
  const preset = PRESET_TIERS[tierIdLower] || {
    bg: '#f1f5f9',
    border: '#e2e8f0',
    color: '#475569',
    iconName: 'Star',
  };

  const presetLabel = PRESET_TIERS[tierIdLower]
    ? t(`shared.tierBadge.tier.${tierIdLower}`)
    : customName || tierId || t('shared.tierBadge.tier.member');

  const colorPreset = COLOR_PALETTE.find((c) => c.id === colorThemeId) || COLOR_PALETTE.find((c) => c.id === tierIdLower);

  const bg = customBg || colorPreset?.bg || preset.bg;
  const border = customBorder || colorPreset?.border || preset.border;
  const color = customColor || colorPreset?.color || preset.color;

  const label = presetLabel;

  const defaultPresetIcons = {
    bronze: 'Circle',
    silver: 'Medal',
    gold: 'Crown',
    diamond: 'Diamond',
  };

  let targetIconName = customIconName;
  if (!targetIconName || (targetIconName === 'Circle' && tierIdLower !== 'bronze')) {
    targetIconName = defaultPresetIcons[tierIdLower] || preset.iconName || 'Star';
  }

  const IconComp = ICON_MAP[targetIconName] || Circle;

  if (!tier || tier === 'none') {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border"
        style={{ background: '#f1f5f9', borderColor: '#e2e8f0', color: '#64748b' }}
      >
        —
      </span>
    );
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border cursor-default"
        style={{ background: bg, borderColor: border, color: color, lineHeight: '16px' }}
      >
        <IconComp size={12} weight="fill" />
        <span>{label}</span>
      </span>
      {showTooltip && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white whitespace-nowrap z-50 pointer-events-none"
          style={{ background: 'rgba(15,23,42,0.9)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          {label}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent"
            style={{ borderTopColor: 'rgba(15,23,42,0.9)' }}
          />
        </span>
      )}
    </span>
  );
}
