/**
 * AutoWashPro Profile Screen
 * User profile, settings menu groups with gradient hero header
 * Following UX guidelines:
 *   - accessibility, no-emoji-icons, scale-feedback
 *   - visual-hierarchy (avatar → name → tier → menu groups)
 *   - destructive-nav-separation (logout separated)
 *   - group related items
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { bookingApi } from '../../src/api';
import {
  Text as AppText,
  Card,
  TierBadge,
  Icon,
  Icons,
  PressableScale,
  Button,
  ScreenContainer,
  Loading,
  AlertDialog,
} from '../../src/components/common';
import { useTheme, useColors } from '../../src/theme/ThemeContext';
import { toGradientColors, getGradients } from '../../src/theme/gradients';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius, shadows, layout } from '../../src/theme/spacing';
import { useTranslation } from 'react-i18next';

interface MenuItemProps {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  showArrow?: boolean;
  badge?: string;
  destructive?: boolean;
  badgeVariant?: 'primary' | 'success' | 'warning' | 'error' | 'info';
}

const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  showArrow = true,
  badge,
  destructive = false,
  badgeVariant = 'primary',
}) => {
  const colors = useColors();
  const styles = createMenuStyles(colors);
  const iconColor = destructive ? colors.error : colors.primary;
  const bgColor = destructive ? colors.errorLight : colors.surface;

  return (
    <PressableScale
      onPress={onPress}
      style={styles.menuItem}
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityRole="button"
    >
      <View style={[styles.menuIcon, { backgroundColor: bgColor }]}>
        <Icon name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.menuContent}>
        <AppText
          variant="body"
          style={destructive ? styles.destructiveText : undefined}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {badge ? (
        <View style={[styles.menuBadge, badgeVariantStyle(badgeVariant, colors)]}>
          <AppText variant="labelSmall" style={styles.menuBadgeText}>{badge}</AppText>
        </View>
      ) : null}
      {showArrow ? (
        <Icon name={Icons.forward} size={18} color={colors.textTertiary} />
      ) : null}
    </PressableScale>
  );
};

function badgeVariantStyle(variant: 'primary' | 'success' | 'warning' | 'error' | 'info', colors: any) {
  const map: Record<typeof variant, { backgroundColor: string }> = {
    primary: { backgroundColor: colors.primaryLight },
    success: { backgroundColor: colors.successLight },
    warning: { backgroundColor: colors.warningLight },
    error: { backgroundColor: colors.errorLight },
    info: { backgroundColor: colors.infoLight },
  };
  return map[variant];
}

const createMenuStyles = (colors: any) =>
  StyleSheet.create({
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      minHeight: 60,
    },
    menuIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    menuContent: {
      flex: 1,
    },
    menuBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
      marginRight: spacing.sm,
      minWidth: 32,
      alignItems: 'center',
    },
    menuBadgeText: {
      fontFamily: 'Outfit_700Bold',
      fontSize: 11,
      color: colors.textPrimary,
    },
    destructiveText: {
      color: colors.error,
      fontWeight: '600',
    },
  });

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { isDark } = useTheme();
  const colors = useColors();
  const styles = createStyles(colors);
  const gradients = getGradients(isDark);
  const { t } = useTranslation();

  const [bookingCount, setBookingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    // We only need the total count, so limit=1 is enough to get the pagination metadata.
    bookingApi
      .getMyBookings({ limit: 1 })
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.data || [];
        setBookingCount(d?.pagination?.total ?? list.length);
      })
      .catch(() => setBookingCount(0));
  }, [isAuthenticated]);

  const getTierProgress = () => {
    const lifetime = user?.lifetimePoints || 0;
    const tier = user?.tier || 'bronze';
    
    let threshold = 100000;
    let nextTierLabel = 'Bạc';
    let isMax = false;
    
    if (tier === 'diamond') {
      isMax = true;
      threshold = 1000000;
    } else if (tier === 'gold') {
      threshold = 1000000;
      nextTierLabel = 'Kim cương';
    } else if (tier === 'silver') {
      threshold = 500000;
      nextTierLabel = 'Vàng';
    } else {
      threshold = 100000;
      nextTierLabel = 'Bạc';
    }
    
    const progress = Math.min((lifetime / threshold) * 100, 100);
    
    return { threshold, nextTierLabel, isMax, progress, lifetime };
  };

  const { threshold, nextTierLabel, isMax, progress, lifetime } = getTierProgress();

  const handleLogout = () => {
    AlertDialog.confirm(
      t('profile.logout'),
      t('profile.logout_confirm'),
      () => logout(),
      undefined,
      t('profile.logout'),
      t('profile.cancel'),
    );
  };

  if (!isAuthenticated) {
    return (
      <ScreenContainer background="gradient">
        <LinearGradient
          colors={toGradientColors(gradients.hero)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.guestHero}
        >
          <View style={[styles.heroBlob, styles.heroBlob1]} />
          <View style={[styles.heroBlob, styles.heroBlob2]} />
          <View style={styles.guestIconWrap}>
            <Icon name={Icons.personOutline} size={48} color={colors.textInverse} />
          </View>
          <AppText variant="h2" style={styles.guestTitle}>{t('profile.guest_greeting')}</AppText>
          <AppText variant="body" style={styles.guestSubtitle}>
            {t('profile.login_prompt')}
          </AppText>
        </LinearGradient>

        <View style={styles.guestCTAs}>
          <Button
            title={t('profile.login')}
            onPress={() => router.push('/(auth)/login' as any)}
            fullWidth
            style={styles.guestLoginButton}
          />
          <Button
            title={t('profile.register')}
            variant="outline"
            onPress={() => router.push('/(auth)/register' as any)}
            fullWidth
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll background="subtle" bottomPadding={90}>
      {/* Gradient profile header */}
      <LinearGradient
        colors={toGradientColors(gradients.profile)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.profileHeader}
      >
        <View style={[styles.heroBlob, styles.heroBlob1]} />
        <View style={[styles.heroBlob, styles.heroBlob2]} />

        <PressableScale
          style={styles.avatar}
onPress={() => router.push('/profile/edit' as any)}
              accessibilityRole="button"
              accessibilityLabel="Chỉnh sửa thông tin cá nhân"
        >
          <AppText variant="h1" style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </AppText>
        </PressableScale>

        <AppText variant="h2" style={styles.userName}>{user?.name}</AppText>
        <AppText variant="body" style={styles.userEmail}>{user?.email}</AppText>
        <View style={styles.tierBadgeWrap}>
          <TierBadge tier={user?.tier || 'bronze'} />
        </View>

        <View style={styles.progressContainer}>
          {isMax ? (
            <AppText variant="label" style={styles.progressText}>{t('profile.tier_max')}</AppText>
          ) : (
            <AppText variant="label" style={styles.progressText}>
              {t('profile.tier_next', { tier: nextTierLabel, current: lifetime.toLocaleString('vi-VN'), total: threshold.toLocaleString('vi-VN') })}
            </AppText>
          )}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </View>
      </LinearGradient>

      {/* Stats card */}
      <View style={styles.statsWrap}>
        <Card style={styles.statsCard}>
          <View style={styles.statsRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/history' as any)}
              style={styles.statItem}
            >
              <AppText variant="h3" style={styles.statValue}>{bookingCount ?? '—'}</AppText>
              <AppText variant="caption" color="textSecondary">
                {t('profile.stats_orders')}
              </AppText>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AppText variant="h3" style={styles.statValue}>{user?.loyaltyPoints || 0}</AppText>
              <AppText variant="caption" color="textSecondary">
                {t('profile.stats_points')}
              </AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AppText variant="h3" style={styles.statValue}>{user?.lifetimePoints || 0}</AppText>
              <AppText variant="caption" color="textSecondary">
                {t('profile.stats_total_points')}
              </AppText>
            </View>
          </View>
        </Card>
      </View>

      {/* Account section */}
      <AppText variant="overline" color="textSecondary" style={styles.sectionTitle}>
        {t('profile.title')}
      </AppText>
      <View style={styles.menuSection}>
        <MenuItem
          icon={Icons.personOutline}
          title={t('profile.edit_info')}
          subtitle={t('profile.edit_info_desc')}
          onPress={() => router.push('/profile/edit' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.wallet}
          title={t('profile.wallet')}
          subtitle={t('profile.wallet_desc')}
          onPress={() => router.push('/wallet' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.carOutline}
          title={t('profile.manage_vehicles')}
          subtitle={t('profile.manage_vehicles_desc')}
          onPress={() => router.push('/vehicle' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.lockOutline}
          title={t('profile.change_password')}
          onPress={() => router.push('/profile/change-password' as any)}
        />
      </View>

      {/* Bookings section */}
      <AppText variant="overline" color="textSecondary" style={styles.sectionTitle}>
        {t('profile.bookings')}
      </AppText>
      <View style={styles.menuSection}>
        <MenuItem
          icon={Icons.listOutline}
          title={t('profile.booking_history')}
          onPress={() => router.push('/(tabs)/history' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.cardOutline}
          title={t('profile.payment_history')}
          onPress={() => router.push('/payment/history' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.voucherOutline}
          title={t('profile.my_vouchers')}
          onPress={() => router.push('/(tabs)/rewards' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.starOutline}
          title="Lịch sử điểm thưởng"
          onPress={() => router.push('/rewards/history' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.cartOutline}
          title={t('profile.slot_packs')}
          onPress={() => router.push('/slot-packs' as any)}
        />
      </View>

      {/* Settings */}
      <AppText variant="overline" color="textSecondary" style={styles.sectionTitle}>
        {t('profile.settings')}
      </AppText>
      <View style={styles.menuSection}>
        <MenuItem
          icon={Icons.notificationsOutline}
          title={t('profile.notifications')}
          subtitle={t('profile.notifications_desc')}
          onPress={() => router.push('/settings/notifications' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.chatOutline}
          title={t('profile.language')}
          subtitle={t('profile.language_desc')}
          onPress={() => router.push('/settings/language' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.info}
          title={t('profile.support')}
          onPress={() => router.push('/help' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.documentOutline}
          title={t('profile.terms')}
          onPress={() => router.push('/terms' as any)}
        />
        <View style={styles.menuDivider} />
        <MenuItem
          icon={Icons.shield}
          title={t('profile.privacy')}
          onPress={() => router.push('/privacy' as any)}
        />
      </View>

      {/* App Info */}
      <AppText variant="overline" color="textSecondary" style={styles.sectionTitle}>
        {t('profile.about_app')}
      </AppText>
      <View style={styles.menuSection}>
        <MenuItem
          icon={Icons.info}
          title={t('profile.about')}
          subtitle="Phiên bản 1.0.0"
          onPress={() => router.push('/about' as any)}
          showArrow={false}
        />
      </View>

      {/* Logout - visually separated with destructive emphasis */}
      <PressableScale
        style={styles.logoutButton}
        onPress={handleLogout}
        accessibilityLabel={t('profile.logout')}
        accessibilityRole="button"
      >
        <Icon name={Icons.logOutOutline} size={18} color={colors.error} style={styles.logoutIcon} />
        <AppText variant="body" color="error" style={styles.logoutText}>
          {t('profile.logout')}
        </AppText>
      </PressableScale>
    </ScreenContainer>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxl + spacing.lg,
  },
  heroBlob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroBlob1: {
    width: 200,
    height: 200,
    top: -60,
    right: -50,
  },
  heroBlob2: {
    width: 160,
    height: 160,
    bottom: -50,
    left: -30,
  },
  // Guest hero
  guestHero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    overflow: 'hidden',
  },
  guestIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  guestTitle: {
    color: colors.textInverse,
    marginBottom: spacing.xs,
  },
  guestSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  guestCTAs: {
    padding: spacing.lg,
  },
  guestLoginButton: {
    marginBottom: spacing.md,
  },
  // Profile header
  profileHeader: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    overflow: 'hidden',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: spacing.md,
  },
  avatarText: {
    color: colors.textInverse,
  },
  userName: {
    color: colors.textInverse,
  },
  userEmail: {
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  tierBadgeWrap: {
    marginTop: spacing.sm,
  },
  progressContainer: {
    width: '100%',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  progressText: {
    color: 'rgba(255,255,255,0.9)',
    marginBottom: spacing.xs,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.textInverse,
    borderRadius: borderRadius.full,
  },
  // Stats
  statsWrap: {
    paddingHorizontal: spacing.md,
    marginTop: -16,
  },
  statsCard: {
    ...shadows.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: 56,
    justifyContent: 'center',
  },
  statValue: {
    ...typography.h3,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.divider,
  },
  // Section
  sectionTitle: {
    marginLeft: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  menuSection: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: layout.cardRadius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.md,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 72,
  },
  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: `${colors.error}33`,
    minHeight: 48,
    shadowColor: colors.error,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 2,
  },
  logoutIcon: {
    marginRight: spacing.sm,
  },
  logoutText: {
    fontWeight: '700',
  },
  destructiveText: {
    color: colors.error,
    fontWeight: '600',
  },
});
