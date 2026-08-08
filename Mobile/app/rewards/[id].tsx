import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { useSystemConfig } from '../../src/contexts/ConfigContext';
import { rewardApi } from '../../src/api';
import {
  Text as AppText,
  ScreenContainer,
  Header,
  Button,
  TierBadge,
  Icon,
  Icons,
  useToast,
  AlertDialog,
} from '../../src/components/common';
import { useColors } from '../../src/theme/ThemeContext';
import { spacing, layout, shadows, borderRadius } from '../../src/theme/spacing';
import { formatCurrency } from '../../src/utils';
import type { PhysicalReward, UserTier } from '../../src/types';

const TIER_RANK: Record<UserTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  diamond: 3,
};

const TIER_INFO: Record<UserTier, { label: string; color: string; bg: string; icon: any }> = {
  bronze: { label: 'ĐỒNG', color: '#B45309', bg: '#FEF3C7', icon: Icons.medal },
  silver: { label: 'BẠC', color: '#334155', bg: '#F1F5F9', icon: Icons.medal },
  gold: { label: 'VÀNG', color: '#D97706', bg: '#FEF3C7', icon: Icons.medal },
  diamond: { label: 'KIM CƯƠNG', color: '#0369A1', bg: '#E0F2FE', icon: Icons.diamond },
};

export default function RewardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const toast = useToast();
  const { user, isAuthenticated } = useAuth();
  
  const [reward, setReward] = useState<PhysicalReward | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);
  
  useEffect(() => {
    const fetchReward = async () => {
      try {
        const rewards = await rewardApi.getPublicRewards();
        const found = rewards.find((r) => r._id === id);
        if (found) {
          setReward(found);
        } else {
          toast.error('Lỗi', 'Không tìm thấy quà tặng này');
          router.back();
        }
      } catch (err: any) {
        toast.error('Lỗi', err.message || 'Lỗi tải chi tiết quà tặng');
      } finally {
        setLoading(false);
      }
    };
    fetchReward();
  }, [id]);

  const userPoints = user?.loyaltyPoints || 0;
  const reqTier = reward?.requiredTier || 'bronze';
  const pointCost = reward?.pointCost || 0;
  const userRank = TIER_RANK[user?.tier || 'bronze'];
  const reqRank = TIER_RANK[reqTier];
  
  const hasEnoughPoints = userPoints >= pointCost;
  const hasRequiredTier = userRank >= reqRank;
  const hasStock = (reward?.stock || 0) > 0;
  const canRedeem = hasEnoughPoints && hasRequiredTier && hasStock;
  
  const handleRedeem = async () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }
    if (!reward || !canRedeem) return;
    
    const ok = await AlertDialog.confirm(
      'Đổi điểm lấy quà',
      `Bạn có chắc chắn muốn dùng ${new Intl.NumberFormat('vi-VN').format(pointCost)} điểm để đổi lấy "${reward.name}"?`,
      'Xác nhận Đổi quà',
      'Hủy'
    );
    if (!ok) return;
    
    setIsRedeeming(true);
    try {
      const res = await rewardApi.redeemReward(reward._id);
      if (res?.code) {
        AlertDialog.show({
          title: 'Đổi phần thưởng thành công! 🎉',
          message: `Mã nhận quà của bạn là: ${res.code}\\n\\nVui lòng xuất trình mã này tại quầy thu ngân để nhận phần quà vật lý.`,
          variant: 'success',
          actions: [
            { text: 'Xem quà đã đổi', onPress: () => router.replace('/rewards/my-rewards' as any) }
          ]
        });
      }
    } catch (err: any) {
      AlertDialog.error('Lỗi đổi quà', err.response?.data?.message || err.message || 'Không thể đổi phần thưởng');
    } finally {
      setIsRedeeming(false);
    }
  };

  if (loading) {
    return (
      <ScreenContainer background="subtle">
        <Header title="Chi tiết quà tặng" showBack />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!reward) return null;

  return (
    <ScreenContainer background="subtle">
      <Header title="Chi tiết quà tặng" showBack />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
        {/* Hero Image */}
        <View style={styles.imageContainer}>
          {reward.imageUrl ? (
            <Image source={{ uri: reward.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, { backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' }]}>
              <AppText style={{ fontSize: 64 }}>🎁</AppText>
            </View>
          )}
          
          <View style={styles.badges}>
            <View style={styles.pointBadge}>
              <AppText variant="labelSmall" style={{ color: '#D97706', fontWeight: 'bold' }}>
                {new Intl.NumberFormat('vi-VN').format(pointCost)} Điểm
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[styles.tierChip, { backgroundColor: TIER_INFO[reqTier].bg }]}>
                <Icon name={TIER_INFO[reqTier].icon} size={12} color={TIER_INFO[reqTier].color} />
                <AppText variant="caption" style={{ color: TIER_INFO[reqTier].color, fontWeight: '700', fontSize: 10 }}>
                  {TIER_INFO[reqTier].label}
                </AppText>
              </View>
              <View style={styles.stockBadge}>
                <AppText variant="labelSmall" style={{ color: '#0F172A', fontWeight: 'bold', fontSize: 11 }}>
                  Còn {reward.stock} phần
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* Info Content */}
        <View style={styles.content}>
          <AppText variant="h2" style={{ marginBottom: spacing.sm }}>{reward.name}</AppText>
          <View style={{ backgroundColor: colors.surface, padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border }}>
            <AppText variant="body" color="textSecondary">
              {reward.description || 'Sản phẩm quà tặng chính hãng chất lượng cao từ hệ thống AutoWashPro.'}
            </AppText>
          </View>
          
          {/* Point calculation card */}
          <View style={[styles.calcCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
            <View style={[styles.calcHeader, { borderBottomColor: colors.primary + '20' }]}>
              <AppText variant="labelSmall" style={{ color: colors.primary, textTransform: 'uppercase' }}>Thông tin quy đổi điểm</AppText>
              <AppText variant="label" style={{ color: colors.primary, fontWeight: 'bold' }}>Đổi Quà Vật Lý</AppText>
            </View>
            <View style={{ gap: spacing.sm }}>
              <View style={styles.row}>
                <AppText variant="body" color="textSecondary">Điểm hiện tại của bạn:</AppText>
                <AppText variant="body" style={{ fontWeight: 'bold' }}>{new Intl.NumberFormat('vi-VN').format(userPoints)} điểm</AppText>
              </View>
              <View style={styles.row}>
                <AppText variant="body" style={{ color: colors.primary }}>Điểm trừ đổi quà:</AppText>
                <AppText variant="h4" style={{ color: colors.primary }}>- {new Intl.NumberFormat('vi-VN').format(pointCost)}</AppText>
              </View>
              <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.primary + '20', paddingTop: spacing.sm, marginTop: spacing.xs }]}>
                {hasEnoughPoints ? (
                  <>
                    <AppText variant="body" style={{ fontWeight: 'bold' }}>Điểm còn lại:</AppText>
                    <AppText variant="h3" style={{ color: colors.success }}>
                      {new Intl.NumberFormat('vi-VN').format(userPoints - pointCost)} điểm
                    </AppText>
                  </>
                ) : (
                  <>
                    <AppText variant="body" style={{ fontWeight: 'bold', color: colors.error }}>Còn thiếu:</AppText>
                    <AppText variant="h3" style={{ color: colors.error }}>
                      {new Intl.NumberFormat('vi-VN').format(pointCost - userPoints)} điểm
                    </AppText>
                  </>
                )}
              </View>
            </View>
          </View>
          
          {/* Notice */}
          <View style={[styles.notice, { backgroundColor: colors.warning + '15', borderColor: colors.warning + '30' }]}>
            <Icon name={Icons.sparkle} size={20} color={colors.warning} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <AppText variant="label" style={{ fontWeight: 'bold', color: colors.warning }}>Hướng dẫn nhận quà:</AppText>
              <AppText variant="caption" style={{ color: colors.warning, marginTop: 4 }}>
                Sau khi bấm "Xác nhận đổi quà", hệ thống sẽ cấp Mã đổi thưởng. Xuất trình mã này tại chi nhánh AutoWashPro để nhận quà.
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>
      
      {/* Bottom Action */}
      <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <Button 
          title={
            !hasStock ? "Phần quà đã hết hàng" :
            !hasRequiredTier ? `Cần hạng ${TIER_INFO[reqTier].label} trở lên` :
            !hasEnoughPoints ? "Không đủ điểm đổi quà" :
            "Xác nhận đổi quà"
          }
          onPress={handleRedeem}
          loading={isRedeeming}
          disabled={!canRedeem}
          style={{ flex: 1 }}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    width: '100%',
    height: 250,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badges: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  pointBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stockBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
  },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  calcCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  calcHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notice: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    borderTopWidth: 1,
    ...shadows.md,
  }
});
