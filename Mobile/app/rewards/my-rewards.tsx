import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { rewardApi } from '../../src/api';
import {
  Text as AppText,
  ScreenContainer,
  Header,
  EmptyState,
  Badge,
  Icon,
  Icons,
} from '../../src/components/common';
import { useColors } from '../../src/theme/ThemeContext';
import { spacing, borderRadius, shadows } from '../../src/theme/spacing';
import { formatCurrency } from '../../src/utils';
import type { Redemption } from '../../src/types';

export default function MyRewardsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyRewards = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      const data = await rewardApi.getMyRewards();
      setRedemptions(data);
    } catch (err) {
      console.error('Lỗi tải quà đã đổi:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchMyRewards();
  }, [fetchMyRewards]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyRewards();
  };

  if (!isAuthenticated) {
    return (
      <ScreenContainer background="subtle">
        <Header title="Quà đã đổi" showBack />
        <EmptyState
          iconName={Icons.giftOutline}
          title="Chưa đăng nhập"
          message="Vui lòng đăng nhập để xem quà đã đổi."
          actionLabel="Đăng nhập"
          onAction={() => router.push('/(auth)/login' as any)}
        />
      </ScreenContainer>
    );
  }

  const renderItem = ({ item }: { item: Redemption }) => {
    const isClaimed = item.status === 'claimed';
    const isReceived = item.status === 'received';
    const isSent = item.status === 'sent';
    const isCancelled = item.status === 'cancelled';
    
    let statusText = 'Chưa nhận';
    let statusColor = colors.warning;
    
    if (isReceived) { statusText = 'Đã nhận'; statusColor = colors.success; }
    else if (isSent) { statusText = 'Đang giao'; statusColor = colors.info; }
    else if (isCancelled) { statusText = 'Đã hủy'; statusColor = colors.error; }

    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.header}>
          <AppText variant="caption" color="textSecondary">
            Đổi ngày {new Date(item.createdAt).toLocaleDateString('vi-VN')}
          </AppText>
          <Badge label={statusText} color={statusColor as any} variant="subtle" />
        </View>
        
        <View style={styles.body}>
          {item.rewardSnapshot?.imageUrl ? (
            <Image source={{ uri: item.rewardSnapshot.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
             <View style={[styles.image, { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' }]}>
                <AppText style={{ fontSize: 24 }}>🎁</AppText>
             </View>
          )}
          <View style={styles.info}>
            <AppText variant="label" numberOfLines={2}>{item.rewardSnapshot?.name}</AppText>
            <AppText variant="caption" color="textSecondary" style={{ marginTop: 4 }}>
              -{formatCurrency(item.pointsSpent || item.rewardSnapshot?.pointCost || 0).replace(/\\s+/g, '')} điểm
            </AppText>
          </View>
        </View>
        
        <View style={[styles.footer, { backgroundColor: colors.background }]}>
          <AppText variant="caption" color="textSecondary">Mã nhận quà:</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name={Icons.ticketOutline} size={16} color={colors.primary} />
            <AppText variant="label" style={{ color: colors.primary, letterSpacing: 1 }}>{item.code}</AppText>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer background="subtle">
      <Header title="Quà đã đổi" showBack />
      
      <FlatList
        data={redemptions}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              iconName={Icons.giftOutline}
              title="Chưa đổi quà nào"
              message="Bạn chưa dùng điểm đổi phần quà vật lý nào."
              actionLabel="Xem quà tặng"
              onAction={() => router.back()}
            />
          ) : null
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.md,
    gap: spacing.md,
  },
  card: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  body: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.md,
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
  }
});
