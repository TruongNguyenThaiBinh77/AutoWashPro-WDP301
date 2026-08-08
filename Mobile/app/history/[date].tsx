import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { bookingApi } from '../../src/api';
import {
  Text as AppText,
  Card,
  Button,
  EmptyState,
  Icon,
  Icons,
  ScreenContainer,
  BookingStatusBadge,
  BottomNavBar,
  useToast,
  PressableScale,
  Skeleton,
} from '../../src/components/common';
import { useColors } from '../../src/theme/ThemeContext';
import { spacing, borderRadius, shadows } from '../../src/theme/spacing';
import { formatCurrency } from '../../src/utils';
import type { Booking, BookingStatus } from '../../src/types';

function getStatusBg(status: BookingStatus, colors: any): string {
  switch (status) {
    case 'pending': return colors.warningLight;
    case 'confirmed': return colors.primarySubtle;
    case 'checked_in': case 'in_progress': return colors.infoLight;
    case 'completed': return colors.successLight;
    case 'cancelled': return colors.errorLight;
    default: return colors.surface;
  }
}

function getStatusFg(status: BookingStatus, colors: any): string {
  switch (status) {
    case 'pending': return colors.warning;
    case 'confirmed': return colors.primary;
    case 'checked_in': case 'in_progress': return colors.info;
    case 'completed': return colors.success;
    case 'cancelled': return colors.error;
    default: return colors.textSecondary;
  }
}

export default function HistoryDayScreen() {
  const router = useRouter();
  const colors = useColors();
  const toast = useToast();
  const { date } = useLocalSearchParams<{ date: string }>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Recurring group state — mirrors the history.tsx modal. Tapping a
  // recurring row in the day view opens this modal directly instead of the
  // single-booking detail screen so the user sees the whole recurring series
  // (matching the FE HistoryPage behavior).
  const [recurringGroupBookings, setRecurringGroupBookings] = useState<Booking[]>([]);
  const [recurringGroupId, setRecurringGroupId] = useState<string | null>(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringCancelLoading, setRecurringCancelLoading] = useState(false);

  // Recurring Cancel OTP
  const [showRecurringOtpModal, setShowRecurringOtpModal] = useState(false);
  const [recurringOtpCode, setRecurringOtpCode] = useState('');
  const [isRequestingRecurringOtp, setIsRequestingRecurringOtp] = useState(false);
  const [isConfirmingRecurringCancel, setIsConfirmingRecurringCancel] = useState(false);

  const loadRecurringGroup = useCallback(
    async (groupId: string) => {
      setRecurringGroupId(groupId);
      setShowRecurringModal(true);
      setRecurringLoading(true);
      try {
        const result = await bookingApi.getMyBookings({ recurringGroupId: groupId } as any);
        const sortedBookings = (result.data || []).sort((a: any, b: any) => {
          const dateA = new Date(a.bookingDate).getTime();
          const dateB = new Date(b.bookingDate).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return (a.startTime || '').localeCompare(b.startTime || '');
        });
        setRecurringGroupBookings(sortedBookings);
      } catch {
        toast.error('Không thể tải nhóm định kỳ');
      } finally {
        setRecurringLoading(false);
      }
    },
    [toast],
  );

  const handleRequestRecurringCancel = async (groupId: string) => {
    setIsRequestingRecurringOtp(true);
    try {
      const preview = await bookingApi.getRecurringCancelPreview(groupId);
      const { totalRefundAmount, totalPenaltyAmount, pendingCount } = preview;
      
      const refundText = totalRefundAmount > 0 
        ? `Số tiền hoàn lại: ${formatCurrency(totalRefundAmount)}` 
        : `Số tiền hoàn lại: 0 ₫`;
      const penaltyText = totalPenaltyAmount > 0 
        ? `\nPhí phạt: ${formatCurrency(totalPenaltyAmount)}` 
        : '';
        
      Alert.alert(
        'Xác nhận hủy nhóm định kỳ',
        `Bạn đang hủy ${pendingCount} lịch.\n${refundText}${penaltyText}\n\nHệ thống sẽ gửi mã OTP qua email để xác nhận. Bạn có chắc chắn muốn tiếp tục?`,
        [
          { text: 'Hủy bỏ', style: 'cancel' },
          { 
            text: 'Nhận OTP', 
            onPress: async () => {
              try {
                await bookingApi.requestRecurringCancelOtp(groupId);
                setRecurringOtpCode('');
                setShowRecurringOtpModal(true);
                toast.success('Đã gửi mã OTP đến email của bạn');
              } catch (error: any) {
                toast.error('Lỗi', error.response?.data?.message || 'Không thể yêu cầu OTP');
              }
            } 
          }
        ]
      );
    } catch (error: any) {
      toast.error('Lỗi', error.response?.data?.message || 'Không thể lấy thông tin hủy');
    } finally {
      setIsRequestingRecurringOtp(false);
    }
  };

  const handleConfirmRecurringCancel = async () => {
    if (!recurringGroupId) return;
    if (recurringOtpCode.length !== 6) {
      toast.error('Lỗi', 'Vui lòng nhập đủ 6 số OTP');
      return;
    }
    
    setIsConfirmingRecurringCancel(true);
    try {
      await bookingApi.cancelRecurringGroup(recurringGroupId, recurringOtpCode);
      toast.success('Đã hủy toàn bộ nhóm định kỳ');
      setShowRecurringOtpModal(false);
      setShowRecurringModal(false);
      fetchBookings();
    } catch (error: any) {
      toast.error('Lỗi', error.response?.data?.message || 'Hủy nhóm thất bại');
    } finally {
      setIsConfirmingRecurringCancel(false);
    }
  };

  const handleCancelRecurringGroup = useCallback(
    async (groupId: string) => {
      handleRequestRecurringCancel(groupId);
    },
    [toast],
  );

  const fetchBookings = useCallback(async () => {
    if (!date) return;
    try {
      const result = await bookingApi.getMyBookings({
        dateFrom: date,
        dateTo: date,
        limit: 100, // Make sure we get all bookings for the day
      });
      setBookings(result.data || []);
    } catch {
      toast.error('Không thể tải dữ liệu');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [toast, date]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const dayBookings = useMemo(() => {
    if (!date) return [];
    return bookings.filter(b => {
      const bd = new Date(b.bookingDate).toISOString().split('T')[0];
      return bd === date;
    });
  }, [bookings, date]);

  const formattedDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('vi-VN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      } as any)
    : '';

  const renderBookingItem = ({ item }: { item: Booking }) => {
    const branchName = typeof item.branchId === 'object' ? (item.branchId as any).name : '';
    const packageName = typeof item.packageId === 'object' ? (item.packageId as any).name : 'Dịch vụ';
    const vehiclePlate = typeof item.vehicleId === 'object' ? (item.vehicleId as any).licensePlate : '';

    // "ĐỊNH KỲ" badge — visual parity with the history list. The left border
    // accent also flips to purple so the user can scan the day for recurring
    // bookings quickly.
    const isRecurring = !!(item as any).isRecurring || !!(item as any).recurringGroupId;

    return (
      <PressableScale
        onPress={() => {
          router.push(`/booking/${item._id}` as any);
        }}
      >
        <Card style={[styles.card, isRecurring && { borderLeftWidth: 3, borderLeftColor: '#8B5CF6' }]}>
          {/* Top: package + status */}
          <View style={styles.cardTop}>
            <View style={styles.packageRow}>
              <View style={[styles.iconCircle, { backgroundColor: getStatusBg(item.status, colors) }]}>
                <Icon name={Icons.carOutline} size={14} color={getStatusFg(item.status, colors)} />
              </View>
              <AppText variant="bodySmall" color="textPrimary" style={styles.packageName} numberOfLines={1}>
                {packageName}
              </AppText>
              {isRecurring ? (
                <View style={{ backgroundColor: '#8B5CF6', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                  <AppText style={{ fontSize: 9, color: '#FFF', fontWeight: '900', letterSpacing: 0.5 }}>ĐỊNH KỲ</AppText>
                </View>
              ) : null}
            </View>
            <BookingStatusBadge status={item.status} />
          </View>

          {/* Branch */}
          <View style={styles.infoLine}>
            <Icon name={Icons.locationOutline} size={12} color={colors.textTertiary} />
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {branchName}
            </AppText>
          </View>

          {/* Time & date */}
          <View style={styles.infoLine}>
            <Icon name={Icons.timeOutline} size={12} color={colors.textTertiary} />
            <AppText variant="caption" color="textSecondary">
              {item.startTime} · {format(parseISO(item.bookingDate), 'dd/MM/yyyy')}
            </AppText>
          </View>

          {/* Bottom: price + plate */}
          <View style={styles.cardBottom}>
            {vehiclePlate ? (
              <View style={styles.plateTag}>
                <AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 10 }}>
                  {vehiclePlate}
                </AppText>
              </View>
            ) : null}
            <AppText variant="bodySmall" color="primary" style={styles.price}>
              {formatCurrency(item.finalPrice)}
            </AppText>
          </View>
          {isRecurring && (item as any).recurringGroupId ? (
            <TouchableOpacity 
              activeOpacity={0.7}
              style={{ paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, alignItems: 'center', marginTop: spacing.md }}
              onPress={() => loadRecurringGroup((item as any).recurringGroupId)}
            >
              <AppText variant="bodySmall" color="primary" style={{ fontFamily: 'Outfit-Medium' }}>
                Quản lý nhóm định kỳ
              </AppText>
            </TouchableOpacity>
          ) : null}
        </Card>
      </PressableScale>
    );
  };

  return (
    <ScreenContainer background="subtle" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Icon name={Icons.back} size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <AppText variant="body" color="textPrimary" style={styles.headerDate}>
            {formattedDate}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {dayBookings.length > 0 ? `${dayBookings.length} lịch đặt` : 'Không có lịch đặt'}
          </AppText>
        </View>
      </View>

      {isLoading ? (
        <View style={[styles.listContent, { padding: 16 }]}>
          <Skeleton width="100%" height={120} borderRadius={12} style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height={120} borderRadius={12} style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height={120} borderRadius={12} style={{ marginBottom: 12 }} />
        </View>
      ) : dayBookings.length === 0 ? (
        <EmptyState
          iconName={Icons.calendarOutline}
          title="Không có lịch đặt"
          message="Không có lịch đặt nào trong ngày này."
        />
      ) : (
        <FlatList
          data={dayBookings}
          renderItem={renderBookingItem}
          keyExtractor={(item) => item._id}
          initialNumToRender={10}
          windowSize={5}
          maxToRenderPerBatch={10}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: 90 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(); }} tintColor={colors.primary} colors={[colors.primary]} />
          }
        />
      )}

      {/* ═══ RECURRING GROUP MODAL ═══ */}
      <Modal visible={showRecurringModal} transparent animationType="slide" onRequestClose={() => setShowRecurringModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowRecurringModal(false)}>
          <TouchableOpacity style={[styles.modalContent, { backgroundColor: colors.background }]} activeOpacity={1}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
              <View>
                <AppText variant="h4" color="textPrimary">Nhóm định kỳ</AppText>
                <AppText variant="caption" color="textSecondary" style={{ marginTop: 2 }}>
                  {recurringGroupBookings.length} lịch trong nhóm
                </AppText>
              </View>
              <TouchableOpacity onPress={() => setShowRecurringModal(false)} style={[styles.modalCloseBtn, { backgroundColor: colors.surfaceDark }]} activeOpacity={0.7}>
                <Icon name={Icons.close} size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <View style={[styles.modalBody, { maxHeight: 500 }]}>
              {recurringLoading ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : (
                <ScrollView contentContainerStyle={styles.timelineContainer} showsVerticalScrollIndicator={false}>
                  {recurringGroupBookings.map((b, i) => {
                    const isLast = i === recurringGroupBookings.length - 1;
                    return (
                      <View key={b._id} style={styles.timelineItem}>
                        {/* Timeline Graphic */}
                        <View style={styles.timelineGraphic}>
                          <View style={[styles.timelineDot, { backgroundColor: getStatusFg(b.status, colors) }]} />
                          {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
                        </View>
                        
                        {/* Timeline Content */}
                        <View style={styles.timelineContent}>
                          <AppText variant="caption" color="textSecondary" style={styles.timelineStepLabel}>
                            Lần {i + 1}
                          </AppText>
                          <View style={styles.timelineContentHeader}>
                            <AppText variant="body" weight="600" color="textPrimary">
                              {new Date(b.bookingDate).toLocaleDateString('vi-VN', {
                                weekday: 'short',
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric'
                              })} · {b.startTime}
                            </AppText>
                            <BookingStatusBadge status={b.status} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
            <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
              {recurringGroupBookings.some(b => b.status === 'pending' || b.status === 'confirmed') && (
                <Button
                  title={isRequestingRecurringOtp ? 'Đang xử lý...' : 'Hủy toàn bộ'}
                  onPress={() => recurringGroupId && handleCancelRecurringGroup(recurringGroupId)}
                  disabled={isRequestingRecurringOtp}
                  style={{ backgroundColor: colors.error, marginBottom: spacing.sm }}
                  textStyle={{ color: '#FFF' }}
                />
              )}
              <Button title="Đóng" variant="outline" onPress={() => setShowRecurringModal(false)} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ═══ RECURRING CANCEL OTP MODAL ═══ */}
      <Modal visible={showRecurringOtpModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.otpCard}>
            <AppText variant="h3" style={{ marginBottom: spacing.sm, textAlign: 'center' }}>Xác nhận OTP</AppText>
            <AppText variant="bodySmall" color="textSecondary" style={{ textAlign: 'center', marginBottom: spacing.md }}>
              Vui lòng nhập mã OTP gồm 6 chữ số đã được gửi đến email của bạn để xác nhận hủy nhóm lịch định kỳ.
            </AppText>
            
            <TextInput
              style={[styles.otpInput, { color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Nhập 6 số OTP"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              maxLength={6}
              value={recurringOtpCode}
              onChangeText={setRecurringOtpCode}
            />

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                title="Quay lại"
                variant="outline"
                onPress={() => {
                  setShowRecurringOtpModal(false);
                  setRecurringOtpCode('');
                }}
                style={{ flex: 1 }}
              />
              <Button
                title={isConfirmingRecurringCancel ? 'Đang hủy...' : 'Xác nhận'}
                onPress={handleConfirmRecurringCancel}
                disabled={isConfirmingRecurringCancel || recurringOtpCode.length !== 6}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <BottomNavBar />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    gap: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerDate: {
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packageName: {
    fontWeight: '700',
    flex: 1,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  plateTag: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  price: {
    fontWeight: '800',
    fontSize: 15,
  },
  // Recurring group modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl + 4,
    borderTopRightRadius: borderRadius.xl + 4,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: spacing.lg,
  },
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  timelineContainer: {
    paddingVertical: spacing.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  timelineGraphic: {
    width: 24,
    alignItems: 'center',
    marginRight: spacing.md,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: -spacing.md,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: spacing.sm,
  },
  timelineContentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  timelineStepLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
    fontWeight: '700',
  },
  otpCard: {
    width: '90%',
    maxWidth: 400,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    ...shadows.lg,
  },
  otpInput: {
    height: 56,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    fontFamily: 'Outfit-Bold',
  },
});
