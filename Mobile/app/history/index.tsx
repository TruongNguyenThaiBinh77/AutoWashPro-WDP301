/**
 * AutoWashPro Booking History Screen
 * Shows user's booking history with filters
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { bookingApi } from '../../src/api';
import { 
  Text as AppText, 
  Card, 
  Loading, 
  EmptyState,
  BookingStatusBadge,
  PaymentStatusBadge,
  Icon,
  Header,
  ScreenContainer,
  SegmentedControl,
} from '../../src/components/common';
import { useColors } from '../../src/theme/ThemeContext';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';
import { format, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { formatCurrency, parseBookingDateTime } from '../../src/utils';
import type { Booking, BookingStatus } from '../../src/types';

type FilterTab = 'all' | 'upcoming' | 'completed' | 'cancelled';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'upcoming', label: 'Sắp tới' },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
];

import { sseService } from '../../src/services/sse';

export default function HistoryScreen() {
  const router = useRouter();
  const colors = useColors();
  const { isAuthenticated } = useAuth();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const fetchBookings = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const response = await bookingApi.getMyBookings({ limit: 100 });
      setBookings(response.data || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchBookings();
    
    if (isAuthenticated) {
      const unsubMyBookings = sseService.subscribe('my_bookings_updated', fetchBookings);
      const unsubBookingUpdate = sseService.subscribe('booking_update', fetchBookings);
      return () => {
        unsubMyBookings();
        unsubBookingUpdate();
      };
    }
  }, [fetchBookings, isAuthenticated]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchBookings();
  }, [fetchBookings]);

  const filterBookings = (bookings: Booking[]): Booking[] => {
    const now = new Date();

    switch (activeFilter) {
      case 'upcoming':
        return bookings.filter(b => {
          if (!['pending', 'confirmed', 'checked_in', 'in_progress'].includes(b.status)) return false;
          const when = parseBookingDateTime(b.bookingDate, b.startTime);
          return when ? when > now : false;
        });
      case 'completed':
        return bookings.filter(b => b.status === 'completed');
      case 'cancelled':
        return bookings.filter(b => b.status === 'cancelled');
      default:
        return bookings;
    }
  };

  const getVehicleInfo = (booking: Booking) => {
    if (typeof booking.vehicleId === 'object' && booking.vehicleId) {
      return booking.vehicleId.licensePlate;
    }
    return 'N/A';
  };

  const renderBookingCard = ({ item }: { item: Booking }) => {
    const branchName = typeof item.branchId === 'object' ? item.branchId.name : 'Chi nhánh';
    const packageName = typeof item.packageId === 'object' ? item.packageId.name : 'Dịch vụ';

    return (
      <TouchableOpacity
        onPress={() => router.push(`/booking/${item._id}`)}
        accessibilityLabel={`Đặt lịch ${item._id.slice(-8).toUpperCase()}`}
        accessibilityRole="button"
      >
        <Card style={styles.bookingCard}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View>
              <AppText variant="bodySmall" color="textSecondary">
                {(() => {
                  try {
                    const d = parseISO(item.bookingDate);
                    return Number.isNaN(d.getTime())
                      ? `${item.bookingDate} • ${item.startTime}`
                      : `${format(d, 'dd/MM/yyyy')} • ${item.startTime}`;
                  } catch {
                    return `${item.bookingDate} • ${item.startTime}`;
                  }
                })()}
              </AppText>
              <AppText variant="h4" style={styles.bookingId}>
                #{item._id.slice(-8).toUpperCase()}
              </AppText>
            </View>
            <View style={styles.badges}>
              <BookingStatusBadge status={item.status} />
              <View style={{ height: 4 }} />
              <PaymentStatusBadge status={item.paymentStatus} />
            </View>
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            <View style={styles.infoRow}>
              <Icon name="location-outline" size={16} color={colors.textSecondary} style={styles.infoIcon} />
              <AppText variant="bodySmall">{branchName}</AppText>
            </View>
            <View style={styles.infoRow}>
              <Icon name="sparkles-outline" size={16} color={colors.textSecondary} style={styles.infoIcon} />
              <AppText variant="bodySmall">{packageName}</AppText>
            </View>
            <View style={styles.infoRow}>
              <Icon name="car-outline" size={16} color={colors.textSecondary} style={styles.infoIcon} />
              <AppText variant="bodySmall">{getVehicleInfo(item)}</AppText>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.cardFooter}>
            <View style={styles.priceContainer}>
              <AppText variant="caption" color="textSecondary">
                Tổng tiền
              </AppText>
              <AppText variant="h4" color="primary">
                {formatCurrency(item.finalPrice ?? item.totalPrice)}
              </AppText>
            </View>
            <Icon name="chevron-forward" size={24} color={colors.textTertiary} />
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  const filteredBookings = filterBookings(bookings);

  if (!isAuthenticated) {
    return (
      <ScreenContainer edges={['top']}>
        <Header showBack title="Lịch sử đặt lịch" />
        <EmptyState
          icon={<Icon name="list-outline" size={48} color={colors.textTertiary} />}
          title="Vui lòng đăng nhập"
          message="Đăng nhập để xem lịch sử đặt lịch"
          actionLabel="Đăng nhập"
          onAction={() => router.push('/(auth)/login')}
        />
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return <Loading fullScreen message="Đang tải lịch sử..." />;
  }

  return (
    <ScreenContainer
      edges={['top']}
      bottomPadding={24}
    >
      <Header showBack title="Lịch sử đặt lịch" />

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        >
          {FILTER_TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterTab,
                activeFilter === tab.key && styles.filterTabActive,
              ]}
              onPress={() => setActiveFilter(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeFilter === tab.key }}
            >
              <AppText 
                variant="bodySmall"
                style={[
                  styles.filterText,
                  activeFilter === tab.key && styles.filterTextActive,
                ]}
              >
                {tab.label}
              </AppText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredBookings}
        renderItem={renderBookingCard}
        keyExtractor={(item) => item._id}
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={10}
        removeClippedSubviews={true}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Icon name="list-outline" size={48} color={colors.textTertiary} />}
            title="Không có đặt lịch"
            message={
              activeFilter === 'all'
                ? 'Bạn chưa có đặt lịch nào'
                : `Không có đặt lịch ${activeFilter === 'upcoming' ? 'sắp tới' : activeFilter === 'completed' ? 'hoàn thành' : 'đã hủy'}`
            }
          />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filterContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  filterList: {
    paddingHorizontal: 20,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    marginRight: spacing.sm,
  },
  filterTabActive: {
    backgroundColor: '#007AFF',
  },
  filterText: {
    ...typography.body,
    color: 'rgba(0, 0, 0, 0.6)',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    padding: 20,
    paddingBottom: spacing.xxl,
  },
  bookingCard: {
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  bookingId: {
    marginTop: spacing.xs,
  },
  badges: {
    alignItems: 'flex-end',
  },
  cardContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingTop: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  infoIcon: {
    marginRight: spacing.sm,
    width: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  priceContainer: {
    alignItems: 'flex-start',
  },
});
