/**
 * AutoWashPro Header Component
 * Standard top navigation bar + iOS-style large title variant + gradient variant
 * Following UX guidelines:
 *   - accessibility, touch-target-size >= 44pt
 *   - safe-area compliance
 *   - icon-only buttons need accessibilityLabel
 *   - large title style for visual hierarchy on home screens
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  StatusBar,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors, useTheme } from '../../theme/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, shadows } from '../../theme/spacing';
import { Icon, Icons } from './Icon';
import { toGradientColors, getGradients } from '../../theme/gradients';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
  leftAction?: React.ReactNode;
  style?: ViewStyle;
  transparent?: boolean;
  variant?: 'standard' | 'large' | 'gradient';
  onBackPress?: () => void;
  showShadow?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  rightAction,
  leftAction,
  style,
  transparent = false,
  variant = 'standard',
  onBackPress,
  showShadow = false,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isDark } = useTheme();
  const gradients = getGradients(isDark);

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const renderBackButton = (iconColor: string) => (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={handleBack}
      accessibilityRole="button"
      accessibilityLabel="Quay lại"
      accessibilityHint="Nhấn để quay về trang trước"
    >
      <Icon name={Icons.back} size={24} color={iconColor} />
    </TouchableOpacity>
  );

  // Large title variant (iOS-style)
  if (variant === 'large') {
    return (
      <View
        style={[
          styles.largeContainer,
          { paddingTop: insets.top + spacing.sm, backgroundColor: transparent ? 'transparent' : colors.background },
          style,
        ]}
      >
        {/* Top bar with actions */}
        <View style={styles.largeTopBar}>
          {showBack ? renderBackButton(colors.primary) : <View style={styles.iconButton} />}
          <View style={styles.largeActionsRight}>{rightAction}</View>
        </View>
        {/* Large title */}
        <View style={styles.largeTitleWrap}>
          <Text
            style={[styles.largeTitle, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.largeSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  // Gradient variant
  if (variant === 'gradient') {
    return (
      <LinearGradient
        colors={toGradientColors(gradients.hero) as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.standardContainer,
          { paddingTop: insets.top },
          showShadow && shadows.sm,
          style,
        ]}
      >
        <View style={styles.leftContainer}>
          {showBack ? (
            renderBackButton(colors.textInverse)
          ) : leftAction ? (
            <View>{leftAction}</View>
          ) : (
            <View style={styles.iconButton} />
          )}
        </View>

        <View style={styles.titleContainer}>
          <Text
            style={[styles.title, { color: colors.textInverse }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitleOnGradient]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={styles.rightContainer}>{rightAction}</View>
      </LinearGradient>
    );
  }

  // Standard variant
  return (
    <View
      style={[
        styles.standardContainer,
        {
          paddingTop: insets.top,
          backgroundColor: transparent ? 'transparent' : colors.background,
          borderBottomWidth: transparent ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.divider,
        },
        showShadow && shadows.sm,
        style,
      ]}
    >
      <View style={styles.leftContainer}>
        {showBack ? (
          renderBackButton(colors.primary)
        ) : leftAction ? (
          <View>{leftAction}</View>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>

      <View style={[styles.titleContainer, { top: insets.top, bottom: 16 }]} pointerEvents="none">
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.rightContainer}>{rightAction}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  standardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    minHeight: 56,
  },
  leftContainer: {
    minWidth: 44,
    alignItems: 'flex-start',
  },
  titleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 80, // prevent overlap with left/right buttons
  },
  rightContainer: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  title: {
    ...typography.h4,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.caption,
    marginTop: 2,
    textAlign: 'center',
  },
  subtitleOnGradient: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    textAlign: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },

  // Large title
  largeContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  largeTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    marginBottom: 8,
  },
  largeActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  largeTitleWrap: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  largeTitle: {
    ...typography.h1,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  largeSubtitle: {
    ...typography.body,
    marginTop: 4,
  },
});

export default Header;