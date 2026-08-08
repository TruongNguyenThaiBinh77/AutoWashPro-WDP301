import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Image, Dimensions, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { rewardApi } from '../../src/api';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  Text as AppText,
  ScreenContainer,
  Header,
  EmptyState,
  Icons,
  Icon,
  PressableScale,
  BottomSheet,
  ListItem,
} from '../../src/components/common';
import { useColors } from '../../src/theme/ThemeContext';
import { spacing, shadows } from '../../src/theme/spacing';
import type { PhysicalReward, UserTier } from '../../src/types';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 2;
const SCREEN_PADDING = 16;
const CARD_GAP = 12;
const CARD_WIDTH = (width - SCREEN_PADDING * 2 - CARD_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

// TIER HELPERS
const TIER_INFO: Record<UserTier, { label: string; color: string; bg: string; icon: any }> = {
  bronze: { label: 'ĐỒNG', color: '#B45309', bg: '#FEF3C7', icon: Icons.medal },
  silver: { label: 'BẠC', color: '#334155', bg: '#F1F5F9', icon: Icons.medal },
  gold: { label: 'VÀNG', color: '#D97706', bg: '#FEF3C7', icon: Icons.medal },
  diamond: { label: 'KIM CƯƠNG', color: '#0369A1', bg: '#E0F2FE', icon: Icons.diamond },
};

export default function RewardStoreScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  
  const [allRewards, setAllRewards] = useState<PhysicalReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc'>('newest');
  const [filterTier, setFilterTier] = useState<UserTier | 'all'>('all');
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);
  const [isSortSheetVisible, setIsSortSheetVisible] = useState(false);

  const fetchRewards = useCallback(async () => {
    try {
      const data = await rewardApi.getPublicRewards();
      setAllRewards(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Lỗi tải danh sách quà tặng:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  const filteredRewards = React.useMemo(() => {
    let result = [...allRewards];
    if (filterTier !== 'all') {
      result = result.filter(r => (r.requiredTier || 'bronze') === filterTier);
    }
    const tierRank: Record<string, number> = { bronze: 0, silver: 1, gold: 2, diamond: 3 };
    result.sort((a, b) => {
      if (sortBy === 'price_asc') return (a.pointCost || 0) - (b.pointCost || 0);
      if (sortBy === 'price_desc') return (b.pointCost || 0) - (a.pointCost || 0);
      const trA = tierRank[a.requiredTier || 'bronze'] ?? 0;
      const trB = tierRank[b.requiredTier || 'bronze'] ?? 0;
      if (trA !== trB) return trA - trB;
      return (a.pointCost || 0) - (b.pointCost || 0);
    });
    return result;
  }, [allRewards, sortBy, filterTier]);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRewards();
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {/* ── Điểm khả dụng (Points Card) ── */}
      <PressableScale
        style={styles.pointsCard}
        onPress={() => router.push('/(tabs)/history' as any)}
      >
        <View style={styles.pointsIconWrap}>
          <Icon name={Icons.star} size={28} color="#F59E0B" />
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <AppText variant="caption" style={{ color: '#15803D', fontWeight: '600' }}>
            Điểm khả dụng
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <AppText variant="h2" style={{ color: '#166534', fontWeight: '800' }}>
              {new Intl.NumberFormat('vi-VN').format(user?.loyaltyPoints || 0)}
            </AppText>
            <AppText variant="body" style={{ color: '#15803D', fontWeight: '500' }}>
              điểm
            </AppText>
          </View>
        </View>
        <Icon name={Icons.forward} size={20} color="#15803D" />
      </PressableScale>

      {/* ── Bộ lọc & Sắp xếp ── */}
      <View style={styles.filterBar}>
        <TouchableOpacity style={styles.filterLeft} onPress={() => setIsFilterSheetVisible(true)}>
          <Icon name={Icons.filter} size={18} color={filterTier !== 'all' ? colors.primary : colors.textPrimary} />
          <AppText variant="label" style={{ fontWeight: '600', color: filterTier !== 'all' ? colors.primary : colors.textPrimary }}>
            {filterTier === 'all' ? 'Bộ lọc' : TIER_INFO[filterTier as UserTier].label}
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterRight} onPress={() => setIsSortSheetVisible(true)}>
          <AppText variant="label" style={{ fontWeight: '500' }}>
            {sortBy === 'newest' ? 'Mới nhất' : sortBy === 'price_asc' ? 'Điểm thấp đến cao' : 'Điểm cao đến thấp'}
          </AppText>
          <Icon name={Icons.chevronDown} size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: PhysicalReward }) => {
    const tier = item.requiredTier || 'bronze';
    const tInfo = TIER_INFO[tier];

    return (
      <PressableScale
        onPress={() => router.push(`/rewards/${item._id}` as any)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.imageContainer}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, { backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' }]}>
               <AppText style={{ fontSize: 32 }}>🎁</AppText>
            </View>
          )}
          
          <View style={styles.stockBadge}>
             <AppText variant="caption" style={{ color: '#0F172A', fontWeight: '600', fontSize: 11 }}>
               Còn {item.stock}
             </AppText>
          </View>
        </View>
        
        <View style={styles.cardBody}>
          <AppText variant="label" numberOfLines={2} style={{ minHeight: 40, lineHeight: 20 }}>
            {item.name}
          </AppText>
          
          <View style={{ marginTop: 12, alignItems: 'flex-start', gap: 8 }}>
            <View style={styles.pointBadge}>
              <AppText variant="caption" style={{ color: '#D97706', fontWeight: '700' }}>
                {new Intl.NumberFormat('vi-VN').format(item.pointCost)} điểm
              </AppText>
            </View>
            <View style={[styles.tierChip, { backgroundColor: tInfo.bg }]}>
              <Icon name={tInfo.icon} size={12} color={tInfo.color} />
              <AppText variant="caption" style={{ color: tInfo.color, fontWeight: '600', fontSize: 10 }}>
                {tInfo.label}
              </AppText>
            </View>
          </View>
        </View>
      </PressableScale>
    );
  };

  return (
    <ScreenContainer background="subtle" padded={false}>
      <Header 
        title="Quà đổi điểm" 
        showBack 
        rightAction={
          <PressableScale onPress={() => router.push('/rewards/my-rewards' as any)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <AppText style={{ color: '#10B981', fontWeight: '600' }}>Quà đã đổi</AppText>
          </PressableScale>
        }
      />
      
      <FlatList
        data={filteredRewards}
        keyExtractor={(item) => item._id}
        ListHeaderComponent={renderHeader}
        renderItem={renderItem}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              iconName={Icons.giftOutline}
              title="Chưa có phần quà nào"
              message={filterTier !== 'all' ? 'Không có phần quà nào phù hợp với bộ lọc hiện tại.' : 'Hiện tại không có phần quà vật lý nào khả dụng để đổi.'}
              actionLabel={filterTier !== 'all' ? 'Xóa bộ lọc' : 'Quay lại'}
              onAction={() => filterTier !== 'all' ? setFilterTier('all') : router.back()}
            />
          ) : null
        }
      />
      
      {/* Filter Sheet */}
      <BottomSheet
        visible={isFilterSheetVisible}
        onClose={() => setIsFilterSheetVisible(false)}
        title="Lọc theo hạng"
      >
        <ListItem
          title="Tất cả các hạng"
          leftIcon={<Icon name={Icons.starOutline} size={24} color={colors.textSecondary} />}
          rightIcon={filterTier === 'all' ? <Icon name={Icons.check} size={24} color={colors.primary} /> : undefined}
          onPress={() => { setFilterTier('all'); setIsFilterSheetVisible(false); }}
        />
        {(['bronze', 'silver', 'gold', 'diamond'] as UserTier[]).map(tier => (
          <ListItem
            key={tier}
            title={`Hạng ${TIER_INFO[tier].label}`}
            leftIcon={<Icon name={TIER_INFO[tier].icon} size={24} color={TIER_INFO[tier].color} />}
            rightIcon={filterTier === tier ? <Icon name={Icons.check} size={24} color={colors.primary} /> : undefined}
            onPress={() => { setFilterTier(tier); setIsFilterSheetVisible(false); }}
          />
        ))}
      </BottomSheet>

      {/* Sort Sheet */}
      <BottomSheet
        visible={isSortSheetVisible}
        onClose={() => setIsSortSheetVisible(false)}
        title="Sắp xếp theo"
      >
        <ListItem
          title="Mới nhất"
          leftIcon={<Icon name={Icons.timeOutline} size={24} color={colors.textSecondary} />}
          rightIcon={sortBy === 'newest' ? <Icon name={Icons.check} size={24} color={colors.primary} /> : undefined}
          onPress={() => { setSortBy('newest'); setIsSortSheetVisible(false); }}
        />
        <ListItem
          title="Điểm: Thấp đến cao"
          leftIcon={<Icon name={Icons.trendingUp} size={24} color={colors.textSecondary} />}
          rightIcon={sortBy === 'price_asc' ? <Icon name={Icons.check} size={24} color={colors.primary} /> : undefined}
          onPress={() => { setSortBy('price_asc'); setIsSortSheetVisible(false); }}
        />
        <ListItem
          title="Điểm: Cao đến thấp"
          leftIcon={<Icon name={Icons.trendingDown} size={24} color={colors.textSecondary} />}
          rightIcon={sortBy === 'price_desc' ? <Icon name={Icons.check} size={24} color={colors.primary} /> : undefined}
          onPress={() => { setSortBy('price_desc'); setIsSortSheetVisible(false); }}
        />
      </BottomSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: SCREEN_PADDING,
    paddingBottom: 40,
  },
  listHeader: {
    marginBottom: 16,
  },
  // Points Card
  pointsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    ...shadows.sm,
  },
  pointsIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Filter Bar
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  filterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Grid
  row: {
    justifyContent: 'space-between',
    marginBottom: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadows.sm,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  stockBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  cardBody: {
    padding: 12,
  },
  pointBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  }
});
