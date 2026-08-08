/**
 * AutoWashPro Rewards Screen — Premium UI Refactor
 * All business logic preserved. Layout, spacing, typography, and
 * visual hierarchy improved to production quality.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Text,
  Animated,
  Pressable,
  LayoutChangeEvent,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSystemConfig } from '../../src/contexts/ConfigContext';
import { voucherApi, giftApi, rewardApi } from '../../src/api';
import {
  Text as AppText,
  Card,
  Loading,
  EmptyState,
  Badge,
  TierBadge,
  Icon,
  Icons,
  PressableScale,
  SkeletonListItem,
  ScreenContainer,
} from '../../src/components/common';
import { useColors } from '../../src/theme/ThemeContext';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius, shadows, layout } from '../../src/theme/spacing';
import { formatCurrency, translateDynamicText } from '../../src/utils';
import type { Voucher, UserVoucher, UserTier, Gift, PhysicalReward } from '../../src/types';

// ─── Constants ─────────────────────────────────────────────────────────────────
type TabKey = 'available' | 'my';

const TABS: { key: TabKey; translationKey: string; icon: string }[] = [
  { key: 'available', translationKey: 'rewards.tab_available', icon: Icons.giftOutline },
  { key: 'my',        translationKey: 'rewards.tab_my',      icon: Icons.bookmarkOutline },
];

const TIERS: UserTier[] = ['bronze', 'silver', 'gold', 'diamond'];

const TIER_LABELS: Record<UserTier, string> = {
  bronze:  'Bronze',
  silver:  'Silver',
  gold:    'Gold',
  diamond: 'Diamond',
};

const TIER_GRADIENTS: Record<UserTier, [string, string, string]> = {
  bronze:  ['#92400E', '#B45309', '#D97706'],
  silver:  ['#475569', '#64748B', '#94A3B8'],
  gold:    ['#B45309', '#D97706', '#FBBF24'],
  diamond: ['#0369A1', '#38BDF8', '#BAE6FD'],
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function computePointsToNext(tier: UserTier, points: number, loyaltyTiersConfig?: any[]) {
  if (!Array.isArray(loyaltyTiersConfig) || loyaltyTiersConfig.length === 0) {
    const thresholds: Record<UserTier, number> = { bronze: 100000, silver: 500000, gold: 1000000, diamond: 1000000 };
    const prev: Record<UserTier, number>       = { bronze: 0,      silver: 100000, gold: 500000,  diamond: 1000000 };
    if (tier === 'diamond') return null;
    const next     = thresholds[tier];
    const from     = prev[tier];
    const progress = Math.min(1, Math.max(0, (points - from) / (next - from)));
    const remaining = Math.max(0, next - points);
    
    let nextTierName = '';
    if (tier === 'bronze') nextTierName = 'Silver';
    else if (tier === 'silver') nextTierName = 'Gold';
    else if (tier === 'gold') nextTierName = 'Diamond';
    
    return { progress, remaining, target: next, nextTierName };
  }

  const sorted = [...loyaltyTiersConfig].sort((a, b) => (a.minPoints || 0) - (b.minPoints || 0));
  const currentIndex = sorted.findIndex(t => t.id === tier);
  
  if (currentIndex === -1 || currentIndex === sorted.length - 1) {
    return null;
  }

  const currentTierConfig = sorted[currentIndex];
  const nextTierConfig = sorted[currentIndex + 1];
  
  const from = currentTierConfig.minPoints || 0;
  const next = nextTierConfig.minPoints || 0;
  
  const progress = next > from ? Math.min(1, Math.max(0, (points - from) / (next - from))) : 1;
  const remaining = Math.max(0, next - points);
  
  return { progress, remaining, target: next, nextTierName: nextTierConfig.name };
}

function formatDate(dateStr?: string) {
  if (!dateStr) return 'Không giới hạn';
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ─── CouponTab Segmented Control ───────────────────────────────────────────────
const CouponTabs: React.FC<{ value: TabKey; onChange: (v: TabKey) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [tabWidth, setTabWidth] = useState(0);
  const activeIndex = TABS.findIndex((t) => t.key === value);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width / TABS.length;
    setTabWidth(w);
    slideAnim.setValue(activeIndex * w);
  };

  const handlePress = (key: TabKey) => {
    const idx = TABS.findIndex((t) => t.key === key);
    Animated.spring(slideAnim, { toValue: idx * tabWidth, tension: 80, friction: 12, useNativeDriver: true }).start();
    onChange(key);
  };

  return (
    <View style={ctab.wrapper} onLayout={onLayout}>
      {tabWidth > 0 && (
        <Animated.View style={[ctab.pill, { width: tabWidth, transform: [{ translateX: slideAnim }] }]} />
      )}
      {TABS.map((tab) => {
        const isActive = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={ctab.tab}
            onPress={() => handlePress(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Icon name={tab.icon} size={18} color={isActive ? '#10B981' : '#94A3B8'} />
            <Text style={[ctab.label, isActive && ctab.labelActive]}>{t(tab.translationKey as any)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const ctab = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    height: 48,
    position: 'relative',
    overflow: 'hidden',
    marginHorizontal: 20,
    marginBottom: 8,
  },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  label: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: '#94A3B8',
  },
  labelActive: {
    fontFamily: 'Outfit_700Bold',
    color: '#10B981',
  },
});

// ─── Tier Selector ─────────────────────────────────────────────────────────────
const TierSelector: React.FC<{ currentTier: UserTier }> = ({ currentTier }) => {
  const colors = useColors();
  return (
    <View style={[ts.container, { backgroundColor: colors.surface }]}>
      {TIERS.map((tier, idx) => {
        const isActive   = tier === currentTier;
        const isAchieved = TIERS.indexOf(tier) <= TIERS.indexOf(currentTier);
        return (
          <View
            key={tier}
            style={[
              ts.item,
              isActive && { backgroundColor: colors.primarySubtle, borderColor: colors.primary },
            ]}
          >
            <View style={{ opacity: isAchieved ? 1 : 0.35 }}>
              <TierBadge tier={tier} />
            </View>
            <Text style={[ts.label, isActive && { color: colors.primary, fontWeight: '700' }]}>
              {TIER_LABELS[tier]}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const ts = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 8,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 4,
  },
  label: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 11,
    color: '#64748B',
  },
});

// ─── Progress Bar ──────────────────────────────────────────────────────────────
const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, { toValue: progress, duration: 800, useNativeDriver: false }).start();
  }, [progress]);

  return (
    <View style={pb.track}>
      <Animated.View
        style={[pb.fill, { width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      />
    </View>
  );
};

const pb = StyleSheet.create({
  track: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 12,
  },
  fill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
  },
});

// ─── Reward Hero Card ──────────────────────────────────────────────────────────
const RewardHeroCard: React.FC<{
  tier: UserTier;
  points: number;
  pointsToNext: ReturnType<typeof computePointsToNext>;
  onRedeem: () => void;
  onSpin: () => void;
}> = ({ tier, points, pointsToNext, onRedeem, onSpin }) => {
  const { t } = useTranslation();
  const colors = useColors();
  return (
    <LinearGradient
      colors={TIER_GRADIENTS[tier]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={hero.card}
    >
      {/* Decorative blobs */}
      <View style={hero.blob1} />
      <View style={hero.blob2} />

      {/* Top row: label + badge */}
      <View style={hero.topRow}>
        <Text style={hero.cardLabel}>{t('rewards.loyalty_points')}</Text>
        <TierBadge tier={tier} />
      </View>

      {/* Points */}
      <View style={hero.pointsRow}>
        <Icon name={Icons.star} size={28} color="#FFFFFF" style={{ marginTop: 2 }} />
        <Text style={hero.pointsValue}>{points.toLocaleString('vi-VN')}</Text>
        <Text style={hero.pointsUnit}>{t('rewards.points')}</Text>
      </View>

      {/* Progress */}
      {pointsToNext && (
        <>
          <ProgressBar progress={pointsToNext.progress} />
          <Text style={hero.hint}>
            {t('rewards.points_to_next', { points: pointsToNext.remaining.toLocaleString('vi-VN'), tier: pointsToNext.nextTierName })}
          </Text>
        </>
      )}
      {!pointsToNext && (
        <Text style={hero.hint}>{t('rewards.max_tier_msg')}</Text>
      )}

      {/* Redeem CTA */}
      <PressableScale
        style={hero.redeemBtn}
        onPress={onRedeem}
        accessibilityLabel={t('rewards.redeem_points')}
      >
        <Icon name={Icons.refreshOutline} size={18} color={colors.primary} />
        <Text style={[hero.redeemText, { color: colors.primary }]}>{t('rewards.redeem_points')}</Text>
        <Icon name={Icons.forward} size={16} color={colors.primary} />
      </PressableScale>

      {/* Spin CTA — opens the lucky wheel (mirrors Web GiftStorePage "Vòng quay") */}
      <PressableScale
        style={[hero.redeemBtn, hero.spinBtn]}
        onPress={onSpin}
        accessibilityLabel={t('rewards.lucky_spin')}
      >
        <Icon name={Icons.sparkle} size={18} color="#FFFFFF" />
        <Text style={[hero.redeemText, hero.spinBtnText]}>{t('rewards.lucky_spin')}</Text>
        <Icon name={Icons.forward} size={16} color="#FFFFFF" />
      </PressableScale>
    </LinearGradient>
  );
};

const hero = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: layout.cardRadius,
    padding: 24,
    overflow: 'hidden',
    ...shadows.md,
  },
  blob1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -70,
    right: -60,
  },
  blob2: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -50,
    left: -30,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.3,
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  pointsValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 44,
    color: '#FFFFFF',
    lineHeight: 50,
    letterSpacing: -1,
  },
  pointsUnit: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 17,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
    lineHeight: 18,
  },
  redeemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginTop: 20,
    gap: 8,
    alignSelf: 'stretch',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  redeemText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    flex: 1,
    textAlign: 'center',
  },
  spinBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  spinBtnText: {
    color: '#FFFFFF',
  },
});

// ─── Section Header ────────────────────────────────────────────────────────────
const SectionHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode }> = ({
  title, subtitle, action,
}) => (
  <View style={sh.row}>
    <View style={sh.textCol}>
      <Text style={sh.title}>{title}</Text>
      {subtitle && <Text style={sh.subtitle}>{subtitle}</Text>}
    </View>
    {action}
  </View>
);

const sh = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  textCol: { flex: 1 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: '#0F172A', letterSpacing: 0.1 },
  subtitle: { fontFamily: 'Outfit_400Regular', fontSize: 13, color: '#94A3B8', marginTop: 2 },
});

const formatDiscountBadge = (type?: string, value?: number): string => {
  if (value === undefined || value === null) return '0đ';
  if (type === 'percentage') return `${value}%`;
  return formatCurrency(value).replace(/\s+/g, '');
};

// ─── Voucher Card ──────────────────────────────────────────────────────────────
const VoucherCard: React.FC<{
  voucher: Voucher;
  tier: UserTier;
  isRedeemable?: boolean;
  onPress: () => void;
}> = ({ voucher, tier, isRedeemable, onPress }) => {
  const { t, i18n } = useTranslation();
  const colors = useColors();

  const code = voucher.code || '';
  const name = translateDynamicText(voucher.name || code || 'Voucher', i18n.language);
  const description = translateDynamicText(voucher.description || '', i18n.language);
  
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Voucher ${voucher.name || voucher.code}`}
    >
      <View style={vc.card}>
        {/* Left: discount preview */}
        <LinearGradient
          colors={TIER_GRADIENTS[tier]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={vc.discountSection}
        >
          <View style={vc.discountBlob} />
          <Text
            style={vc.discountValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {formatDiscountBadge(voucher.type, voucher.value)}
          </Text>
          <Text style={vc.discountLabel}>{t('rewards.discount')}</Text>
          {/* Perforation notches */}
          <View style={[vc.notchTop, { backgroundColor: colors.background }]} />
          <View style={[vc.notchBottom, { backgroundColor: colors.background }]} />
        </LinearGradient>

        {/* Dashed divider */}
        <View style={vc.divider} />

        {/* Right: details */}
        <View style={vc.infoSection}>
          <Text style={vc.voucherName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={vc.description} numberOfLines={2}>
            {description || `Mã: ${voucher.code}`}
          </Text>

          {/* Meta row */}
          {(voucher.minOrder && voucher.minOrder > 0) || voucher.maxDiscount ? (
            <View style={vc.metaRow}>
              {voucher.minOrder && voucher.minOrder > 0 ? (
                <View style={vc.metaItem}>
                  <Icon name={Icons.cartOutline} size={12} color="#94A3B8" />
                  <Text style={vc.metaText}>{t('rewards.min_order')} {formatCurrency(voucher.minOrder)}</Text>
                </View>
              ) : null}
              {voucher.maxDiscount ? (
                <View style={vc.metaItem}>
                  <Icon name={Icons.arrowUp} size={12} color="#94A3B8" />
                  <Text style={vc.metaText}>{t('rewards.max_discount')} {formatCurrency(voucher.maxDiscount)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Footer */}
          <View style={vc.footer}>
            <View style={vc.expiryRow}>
              <Icon name={Icons.timeOutline} size={13} color="#F59E0B" />
              <Text style={vc.expiry}>{t('rewards.expires')} {formatDate(voucher.endDate)}</Text>
            </View>
            {isRedeemable && voucher.requiredPoints ? (
              <Badge label={`${voucher.requiredPoints} ${t('rewards.points')}`} variant="warning" size="small" />
            ) : null}
          </View>
        </View>
      </View>
    </PressableScale>
  );
};

const MyVoucherCard: React.FC<{
  voucher: UserVoucher;
  onPress: () => void;
}> = ({ voucher, onPress }) => {
  const rawV: any = voucher.voucherId || voucher;
  const vObj: any = typeof rawV === 'string' ? voucher : rawV;

  const { t, i18n } = useTranslation();
  const colors = useColors();

  const isUsed = !!(rawV.usedAt || rawV.isUsed || rawV.used || rawV.status === 'used');
  const code = vObj.code || rawV.code || '';
  const name = translateDynamicText(vObj.name || code || 'Voucher', i18n.language);
  const type = vObj.type || rawV.type || 'fixed';
  const value = vObj.value ?? rawV.discountAmount ?? rawV.value ?? 0;
  const endDate = vObj.endDate || rawV.endDate;

  return (
    <PressableScale onPress={onPress} accessibilityRole="button">
      <View style={[vc.card, isUsed && vc.cardUsed]}>
        {/* Left: discount preview */}
        <View
          style={[
            vc.discountSection,
            { backgroundColor: isUsed ? '#CBD5E1' : colors.primary },
          ]}
        >
          <Text
            style={vc.discountValue}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {formatDiscountBadge(type, value)}
          </Text>
          <Text style={vc.discountLabel}>{isUsed ? 'ĐÃ DÙNG' : 'GIẢM'}</Text>
          <View style={[vc.notchTop, { backgroundColor: colors.background }]} />
          <View style={[vc.notchBottom, { backgroundColor: colors.background }]} />
        </View>

        <View style={vc.divider} />

        {/* Right: details */}
        <View style={vc.infoSection}>
          <View style={vc.myVoucherHeader}>
            <Text style={vc.voucherName} numberOfLines={1}>{name}</Text>
            <Badge label={isUsed ? t('rewards.status_used') : t('rewards.status_valid')} variant={isUsed ? 'default' : 'success'} size="small" />
          </View>
          <Text style={vc.description} numberOfLines={1}>Mã: {code}</Text>
          {rawV.usedAt ? (
            <Text style={vc.usedAt}>{t('rewards.used_at')} {formatDate(rawV.usedAt)}</Text>
          ) : null}
          <View style={vc.expiryRow}>
            <Icon name={Icons.timeOutline} size={13} color="#F59E0B" />
            <Text style={vc.expiry}>HSD: {formatDate(endDate)}</Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
};

const vc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: layout.cardRadius,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    minHeight: 110,
    ...shadows.md,
  },
  cardUsed: { opacity: 0.65 },
  discountSection: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  discountBlob: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    top: -28,
    right: -28,
  },
  discountValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  discountLabel: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  notchTop: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    top: -9,
    right: -1,
  },
  notchBottom: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    bottom: -9,
    right: -1,
  },
  divider: {
    width: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  infoSection: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
    gap: 4,
  },
  myVoucherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  voucherName: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: '#0F172A',
    flex: 1,
  },
  description: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiry: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '500',
  },
  usedAt: {
    fontSize: 12,
    color: '#94A3B8',
  },
});

// ─── Main Screen ────────────────────────────────────────────────────────────────
export default function RewardsScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const configs = useSystemConfig();
  const { t, i18n } = useTranslation();
  const colors = useColors();

  const [activeTab, setActiveTab] = useState<TabKey>('available');
  const [availableVouchers, setAvailableVouchers] = useState<{
    tierExclusive: Voucher[];
    public: Voucher[];
    redeemable: Voucher[];
  } | null>(null);
  const [myVouchers, setMyVouchers]   = useState<UserVoucher[]>([]);
  const [gifts, setGifts]             = useState<Gift[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) { setIsLoading(false); return; }
    try {
      const [availableRes, myRes, giftsRes] = await Promise.all([
        voucherApi.getAvailableVouchers(),
        voucherApi.getMyVouchers(),
        // Public gifts power the "Phần thưởng vòng quay" preview strip below.
        // Endpoint is unauthenticated; safe to call even if the user is a
        // guest (response is empty in that case anyway).
        giftApi.getPublicGifts().catch(() => [] as Gift[]),
      ]);
      setAvailableVouchers(availableRes);
      setMyVouchers(myRes);
      setGifts(Array.isArray(giftsRes) ? giftsRes : []);
    } catch (error) {
      console.error('Error fetching vouchers:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchData();
  }, [fetchData]);

  // ── Not authenticated ─────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <ScreenContainer background="subtle">
        <EmptyState
          iconName={Icons.giftOutline}
          title="Vui lòng đăng nhập"
          message="Đăng nhập để xem voucher và điểm thưởng"
          actionLabel="Đăng nhập"
          onAction={() => router.push('/(auth)/login' as any)}
        />
      </ScreenContainer>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <ScreenContainer background="subtle">
        <View style={styles.skeletonHeader}>
          <AppText variant="h2">Ưu đãi</AppText>
        </View>
        <View style={styles.skeletonList}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <SkeletonListItem />
            </View>
          ))}
        </View>
      </ScreenContainer>
    );
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const allAvailable = [
    ...(availableVouchers?.public || []),
    ...(availableVouchers?.tierExclusive || []),
    ...(availableVouchers?.redeemable || []),
  ];
  const tier           = (user?.tier || 'bronze') as UserTier;
  const points         = user?.loyaltyPoints || 0;
  const lifetimePoints = user?.lifetimePoints || 0;
  const pointsToNext   = computePointsToNext(tier, lifetimePoints, configs?.LOYALTY_TIERS);

  return (
    <ScreenContainer background="subtle">
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t('rewards.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('rewards.header_subtitle', 'Tích điểm, đổi quà và nhiều ưu đãi hấp dẫn')}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PressableScale
            onPress={() => router.push('/rewards/history' as any)}
            accessibilityLabel="Lịch sử điểm thưởng"
            style={[styles.historyBtn, { backgroundColor: colors.warningLight }]}
          >
            <Icon name={Icons.starOutline} size={20} color={colors.warning} />
          </PressableScale>
          <PressableScale
            onPress={() => router.push({ pathname: '/voucher', params: { tab: 'my' } })}
            accessibilityLabel="Lịch sử voucher"
            style={[styles.historyBtn, { backgroundColor: colors.primarySubtle }]}
          >
            <Icon name={Icons.listOutline} size={20} color={colors.primary} />
          </PressableScale>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Hero Card ── */}
        <RewardHeroCard
          tier={tier}
          points={points}
          pointsToNext={pointsToNext}
          onRedeem={() => setActiveTab('available')}
          onSpin={() => router.push('/gifts/spin' as any)}
        />

        {/* ── Tier Selector ── */}
        <SectionHeader title={t('rewards.membership_tier')} subtitle={t('rewards.membership_desc')} />
        <TierSelector currentTier={tier} />

        {/* ── Prize Preview — shows the gifts the user can win on the wheel.
              Mirrors FE GiftStoreSection "Vòng quay" tab: each gift becomes a
              card with a probability pill so the user knows what's at stake
              before tapping "Vòng quay may mắn". Skips render if the BE
              returned no active gifts. ── */}
        {gifts.length > 0 && (
          <>
            <SectionHeader
              title={t('rewards.spin_rewards')}
              subtitle={t('rewards.spin_desc', '{{count}} giải đang chờ bạn', { count: gifts.length })}
              action={
                <PressableScale
                  onPress={() => router.push('/gifts/spin' as any)}
                  style={styles.viewAllBtn}
                  accessibilityLabel={t('rewards.spin_now')}
                >
                  <Text style={[styles.viewAllText, { color: colors.primary }]}>{t('rewards.spin_now')}</Text>
                  <Icon name={Icons.forward} size={14} color={colors.primary} />
                </PressableScale>
              }
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.prizeScroll}
            >
              {gifts.map((g) => {
                const isFixed = g.type === 'fixed';
                const isPercent = g.type === 'percentage';
                const translatedName = translateDynamicText(g.name || '', i18n.language);
                const translatedDesc = translateDynamicText(g.description || '', i18n.language);
                const labelText =
                  g.type === 'none'
                    ? (translatedName || t('rewards.prize_lucky', 'May mắn'))
                    : isPercent
                      ? `${t('rewards.discount_prefix', 'Giảm')} ${g.value}%`
                      : isFixed
                        ? `${t('rewards.discount_prefix', 'Giảm')} ${formatCurrency(g.value ?? 0).replace(/\s+/g, '')}`
                        : (translatedName || t('rewards.prize_label', 'Phần thưởng'));
                const probability = typeof g.probability === 'number' ? g.probability : null;
                const accent = g.color || colors.primary;
                return (
                  <View
                    key={g._id || (g as any).id}
                    style={[styles.prizeCard, { borderColor: colors.border, backgroundColor: colors.background }]}
                  >
                    <View style={[styles.prizeAccent, { backgroundColor: accent }]} />
                    <View style={styles.prizeBody}>
                      <AppText variant="label" color="textTertiary" style={styles.prizeLabel}>
                        {t('rewards.prize_label')}
                      </AppText>
                      <AppText variant="h4" color="textPrimary" numberOfLines={1} style={styles.prizeTitle}>
                        {labelText}
                      </AppText>
                      {g.description ? (
                        <AppText variant="caption" color="textSecondary" numberOfLines={2} style={styles.prizeDesc}>
                          {translatedDesc}
                        </AppText>
                      ) : null}
                      {probability !== null ? (
                        <View style={[styles.probPill, { backgroundColor: `${accent}22` }]}>
                          <Text style={[styles.probText, { color: accent }]}>{t('rewards.probability', { prob: probability })}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* ── Cửa hàng Đổi điểm ── */}
        <SectionHeader
          title="Cửa hàng quà tặng"
          subtitle="Dùng điểm tích luỹ đổi phần quà độc quyền"
        />
        <PressableScale
          onPress={() => router.push('/rewards/store' as any)}
          style={{
            marginHorizontal: 20, // matching other sections
            marginBottom: 32,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: colors.primary + '10', // soft tinted background
            borderWidth: 1,
            borderColor: colors.primary + '20',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 }}>
             <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
                <Icon name={Icons.giftOutline} size={24} color="#FFFFFF" />
             </View>
             <View style={{ flex: 1 }}>
                <AppText variant="label" style={{ color: colors.primary, fontWeight: '700', fontSize: 16 }}>
                  Vào Cửa Hàng Quà Vật Lý
                </AppText>
                <AppText variant="caption" style={{ color: colors.primary + 'CC', marginTop: 2 }}>
                  Khám phá danh sách quà tặng
                </AppText>
             </View>
             <Icon name={Icons.forward} size={20} color={colors.primary} />
          </View>
        </PressableScale>

        {/* ── Coupon Section ── */}
        <SectionHeader
          title={t('rewards.voucher_section_title')}
          subtitle={activeTab === 'available' ? t('rewards.vouchers_available', { count: allAvailable.length }) : t('rewards.vouchers_my', { count: myVouchers.length })}
          action={
            <PressableScale
              onPress={() => router.push({ pathname: '/voucher', params: { tab: 'my' } })}
              style={styles.viewAllBtn}
            >
              <Text style={[styles.viewAllText, { color: colors.primary }]}>{t('rewards.view_all')}</Text>
              <Icon name={Icons.forward} size={14} color={colors.primary} />
            </PressableScale>
          }
        />

        {/* ── Tab Switcher ── */}
        <CouponTabs value={activeTab} onChange={setActiveTab} />

        {/* ── Voucher List ── */}
        <View style={styles.voucherList}>
          {activeTab === 'available' ? (
            allAvailable.length > 0 ? (
              allAvailable.map((voucher) => (
                <VoucherCard
                  key={voucher._id}
                  voucher={voucher}
                  tier={tier}
                  isRedeemable={!!availableVouchers?.redeemable?.some((v) => v._id === voucher._id)}
                  onPress={() => router.push({ pathname: '/voucher/[id]' as any, params: { id: voucher._id } })}
                />
              ))
            ) : (
              <View style={styles.emptyWrapper}>
                <EmptyState
                  iconName={Icons.voucherOutline}
                  title={t('rewards.empty_available_title')}
                  message={t('rewards.empty_available_msg')}
                />
              </View>
            )
          ) : myVouchers.length > 0 ? (
            myVouchers.map((voucher) => (
              <MyVoucherCard
                key={voucher._id}
                voucher={voucher}
                onPress={() => router.push({ pathname: '/voucher/[id]' as any, params: { id: voucher._id } })}
              />
            ))
          ) : (
            <View style={styles.emptyWrapper}>
              <EmptyState
                iconName={Icons.voucherOutline}
                title={t('rewards.empty_my_title')}
                message={t('rewards.empty_my_msg')}
                actionLabel={t('rewards.explore_promos')}
                onAction={() => setActiveTab('available')}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Screen-level Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '400',
  },
  historyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 110,
  },
  voucherList: {
    paddingTop: 8,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyWrapper: {
    marginHorizontal: 20,
    marginTop: 8,
  },
  skeletonHeader: { padding: 20 },
  skeletonList:   { paddingHorizontal: 20 },
  skeletonCard:   { marginBottom: 12, borderRadius: 16 },

  // Prize preview (gifts/spin wheel)
  prizeScroll: {
    paddingHorizontal: 20,
    gap: spacing.sm,
    paddingBottom: 4,
  },
  prizeCard: {
    width: 200,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    ...shadows.sm,
  },
  prizeAccent: {
    width: 6,
  },
  prizeBody: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  prizeLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
    fontWeight: '700',
  },
  prizeTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  prizeDesc: {
    lineHeight: 16,
  },
  probPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 6,
  },
  probText: {
    fontSize: 11,
    fontWeight: '700',
  },
});