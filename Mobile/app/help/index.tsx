/**
 * AutoWashPro Help & Support Screen
 * FAQ, contact info, and support options
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import {
  Text as AppText,
  Card,
  Button,
  ScreenContainer,
  Header,
  ListItem,
  Icon,
  Icons,
  AlertDialog,
  useToast,
} from '../../src/components/common';
import { useSystemConfig } from '../../src/contexts/ConfigContext';
import { useColors } from '../../src/theme/ThemeContext';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export default function HelpScreen() {
  const colors = useColors();
  const configs = useSystemConfig();
  const toast = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactMessage, setContactMessage] = useState('');

  const cancelThresholdMinutes = configs?.LATE_CANCEL_THRESHOLD_MINUTES || 120;
  const cancelThresholdText = cancelThresholdMinutes >= 60 
    ? `${Math.floor(cancelThresholdMinutes / 60)} giờ` 
    : `${cancelThresholdMinutes} phút`;

  const FAQS: FAQItem[] = [
    {
      id: '1',
      question: 'Làm sao để đặt lịch rửa xe?',
      answer: 'Bạn có thể đặt lịch rửa xe bằng cách: 1) Chọn chi nhánh gần bạn, 2) Chọn gói dịch vụ phù hợp, 3) Chọn phương tiện, 4) Chọn ngày và giờ, 5) Xác nhận đặt lịch.',
    },
    {
      id: '2',
      question: 'Tôi có thể hủy đặt lịch không?',
      answer: `Bạn có thể hủy đặt lịch miễn phí trước giờ hẹn ít nhất ${cancelThresholdText}. Nếu hủy muộn hơn thời gian này, bạn có thể phải chịu phí phạt theo quy định. Để hủy, vào mục "Lịch sử đặt lịch" và chọn "Hủy đặt lịch".`,
    },
    {
      id: '3',
      question: 'Làm sao để thanh toán?',
      answer: 'AutoWashPro hỗ trợ thanh toán qua: Tiền mặt khi đến chi nhánh, Ví MoMo, và VNPay. Bạn có thể chọn phương thức thanh toán khi xác nhận đặt lịch.',
    },
    {
      id: '4',
      question: 'Tôi quên mật khẩu, làm sao?',
      answer: 'Bạn có thể khôi phục mật khẩu bằng cách nhấn "Quên mật khẩu" trên màn hình đăng nhập và làm theo hướng dẫn.',
    },
    {
      id: '5',
      question: 'Điểm tích lũy là gì?',
      answer: 'Mỗi lần sử dụng dịch vụ, bạn sẽ tích lũy điểm dựa trên giá trị đơn hàng. Điểm có thể đổi voucher và quà tặng tại mục "Phần thưởng".',
    },
    {
      id: '6',
      question: 'Làm sao liên hệ với AutoWashPro?',
      answer: 'Bạn có thể liên hệ qua hotline 1900 xxxx, email support@autowashpro.vn, hoặc chat trực tiếp với chúng tôi.',
    },
  ];

  const filteredFAQs = FAQS.filter(faq =>
    faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCallHotline = () => {
    Linking.openURL('tel:19001234');
  };

  const handleEmail = () => {
    Linking.openURL('mailto:support@autowashpro.vn');
  };

  const handleChat = () => {
    AlertDialog.show({
      title: 'Chat với chúng tôi',
      message: 'Tính năng chat đang được phát triển. Vui lòng liên hệ qua hotline hoặc email để được hỗ trợ nhanh nhất.',
      variant: 'info',
      actions: [{ text: 'Đã hiểu' }],
    });
  };

  const handleSendMessage = () => {
    if (!contactMessage.trim()) {
      AlertDialog.warning('Thiếu nội dung', 'Vui lòng nhập nội dung tin nhắn trước khi gửi');
      return;
    }
    AlertDialog.show({
      title: 'Gửi thành công',
      message: 'Cảm ơn bạn đã liên hệ. Chúng tôi sẽ phản hồi trong thời gian sớm nhất.',
      variant: 'success',
      actions: [
        {
          text: 'OK',
          onPress: () => setContactMessage(''),
        },
      ],
    });
  };

  return (
    <ScreenContainer scroll>
      <Header showBack title="Trợ giúp & Hỗ trợ" />

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Icon name={Icons.search} size={18} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Tìm kiếm câu hỏi..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Contact Options */}
      <View style={styles.section}>
        <AppText variant="h4" style={styles.sectionTitle}>
          Liên hệ với chúng tôi
        </AppText>
        <View style={styles.contactGrid}>
          <Card
            style={[styles.contactCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={handleCallHotline}
          >
            <Icon name={Icons.call} size={28} color={colors.primary} />
            <AppText variant="body" style={styles.contactTitle}>
              Hotline
            </AppText>
            <AppText variant="caption" color="textSecondary">
              1900 1234 (8:00 - 22:00)
            </AppText>
          </Card>
          <Card
            style={[styles.contactCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={handleEmail}
          >
            <Icon name={Icons.mailOutline} size={28} color={colors.primary} />
            <AppText variant="body" style={styles.contactTitle}>
              Email
            </AppText>
            <AppText variant="caption" color="textSecondary">
              support@autowashpro.vn
            </AppText>
          </Card>
          <Card
            style={[styles.contactCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={handleChat}
          >
            <Icon name={Icons.chatOutline} size={28} color={colors.primary} />
            <AppText variant="body" style={styles.contactTitle}>
              Chat trực tuyến
            </AppText>
            <AppText variant="caption" color="textSecondary">
              Phản hồi trong 5 phút
            </AppText>
          </Card>
        </View>
      </View>

      {/* Contact Form */}
      <View style={styles.section}>
        <Card
          style={styles.sectionHeader}
          onPress={() => setShowContactForm(!showContactForm)}
        >
          <AppText variant="h4">Gửi tin nhắn</AppText>
          <Icon
            name={showContactForm ? 'chevron-up' : 'chevron-down'}
            size={24}
            color={colors.primary}
          />
        </Card>

        {showContactForm && (
          <Card style={styles.formCard}>
            <AppText variant="bodySmall" color="textSecondary" style={styles.formLabel}>
              Nội dung
            </AppText>
            <View style={[styles.textInputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TextInput
                style={[styles.textInput, { color: colors.textPrimary }]}
                placeholder="Mô tả vấn đề của bạn..."
                placeholderTextColor={colors.textTertiary}
                value={contactMessage}
                onChangeText={setContactMessage}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
            <Button
              title="Gửi"
              onPress={handleSendMessage}
              style={styles.sendButton}
            />
          </Card>
        )}
      </View>

      {/* FAQ Section */}
      <View style={styles.section}>
        <AppText variant="h4" style={styles.sectionTitle}>
          Câu hỏi thường gặp
        </AppText>

        {filteredFAQs.length === 0 ? (
          <Card>
            <AppText variant="body" color="textSecondary" style={styles.emptyText}>
              Không tìm thấy câu hỏi phù hợp
            </AppText>
          </Card>
        ) : (
          filteredFAQs.map((faq) => (
            <Card key={faq.id} style={styles.faqCard}>
              <ListItem
                title={faq.question}
                showChevron
                trailingIcon={expandedId === faq.id ? 'chevron-up' : 'chevron-down'}
                onPress={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
              />
              {expandedId === faq.id && (
                <View style={[styles.faqAnswer, { borderTopColor: colors.divider }]}>
                  <AppText variant="bodySmall" color="textSecondary">
                    {faq.answer}
                  </AppText>
                </View>
              )}
            </Card>
          ))
        )}
      </View>

      {/* Working Hours */}
      <View style={styles.section}>
        <AppText variant="h4" style={styles.sectionTitle}>
          Giờ hoạt động
        </AppText>
        <Card>
          <ListItem
            leadingIcon="time-outline"
            title="Thứ 2 - Thứ 6"
            subtitle="07:00 - 21:00"
            showDivider
          />
          <ListItem
            leadingIcon="time-outline"
            title="Thứ 7 - Chủ nhật"
            subtitle="08:00 - 20:00"
            showDivider={false}
          />
        </Card>
      </View>

      {/* Quick Links */}
      <View style={styles.section}>
        <AppText variant="h4" style={styles.sectionTitle}>
          Liên kết nhanh
        </AppText>
        <View style={styles.linksGrid}>
          <Card
            style={[styles.linkCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/terms' as any)}
          >
            <Icon name={Icons.documentOutline} size={24} color={colors.primary} />
            <AppText variant="caption">Điều khoản</AppText>
          </Card>
          <Card
            style={[styles.linkCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/privacy' as any)}
          >
            <Icon name={Icons.lockOutline} size={24} color={colors.primary} />
            <AppText variant="caption">Bảo mật</AppText>
          </Card>
          <Card
            style={[styles.linkCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/about' as any)}
          >
            <Icon name={'information-circle-outline'} size={24} color={colors.primary} />
            <AppText variant="caption">Về chúng tôi</AppText>
          </Card>
          <Card
            style={[styles.linkCard, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => router.push('/settings' as any)}
          >
            <Icon name={Icons.settingsOutline} size={24} color={colors.primary} />
            <AppText variant="caption">Cài đặt</AppText>
          </Card>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    padding: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: spacing.md,
    marginLeft: spacing.sm,
  },
  section: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contactCard: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
  },
  contactTitle: {
    fontWeight: '600',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  formCard: {
    marginTop: spacing.sm,
  },
  formLabel: {
    marginBottom: spacing.sm,
  },
  textInputContainer: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  textInput: {
    ...typography.body,
    minHeight: 100,
  },
  sendButton: {
    marginTop: spacing.sm,
  },
  faqCard: {
    marginBottom: spacing.sm,
    padding: 0,
  },
  faqAnswer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    marginTop: spacing.sm,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.lg,
  },
  linksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  linkCard: {
    width: '48%',
    alignItems: 'center',
    borderWidth: 1,
  },
});
