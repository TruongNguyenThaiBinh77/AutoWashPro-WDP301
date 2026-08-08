/**
 * AutoWashPro Terms of Service Screen
 */

import React from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import {
  Text as AppText,
  Card,
  ScreenContainer,
  Header,
} from '../../src/components/common';
import { useSystemConfig } from '../../src/contexts/ConfigContext';
import { useColors } from '../../src/theme/ThemeContext';
import { spacing } from '../../src/theme/spacing';

export default function TermsScreen() {
  const colors = useColors();
  const configs = useSystemConfig();

  const cancelThresholdMinutes = configs?.LATE_CANCEL_THRESHOLD_MINUTES || 120;
  const cancelThresholdText = cancelThresholdMinutes >= 60 
    ? `${Math.floor(cancelThresholdMinutes / 60)} giờ` 
    : `${cancelThresholdMinutes} phút`;

  const sections = [
    {
      title: '1. Chấp nhận các điều khoản',
      content: 'Bằng cách truy cập và sử dụng ứng dụng AutoWashPro, bạn đồng ý bị ràng buộc bởi các Điều khoản Dịch vụ này. Nếu bạn không đồng ý với bất kỳ phần nào của các điều khoản này, vui lòng không sử dụng ứng dụng.',
    },
    {
      title: '2. Mô tả dịch vụ',
      content: 'AutoWashPro cung cấp nền tảng đặt lịch rửa xe trực tuyến. Chúng tôi kết nối người dùng với các chi nhánh rửa xe thuộc mạng lưới AutoWashPro để cung cấp dịch vụ rửa xe và chăm sóc xe.',
    },
    {
      title: '3. Tài khoản người dùng',
      content: 'Để sử dụng dịch vụ, bạn cần tạo tài khoản với thông tin chính xác. Bạn chịu trách nhiệm bảo mật thông tin tài khoản và hoạt động diễn ra dưới tài khoản của bạn. Chúng tôi có quyền đình chỉ hoặc chấm dứt tài khoản nếu phát hiện vi phạm.',
    },
    {
      title: '4. Đặt lịch và hủy đặt lịch',
      content: `Khi đặt lịch qua AutoWashPro, bạn đồng ý đến đúng giờ đã đặt. Bạn có thể hủy đặt lịch miễn phí trước giờ hẹn ít nhất ${cancelThresholdText}. Nếu hủy muộn hoặc không đến, chúng tôi có thể áp dụng các biện pháp phạt theo chính sách.`,
    },
    {
      title: '5. Thanh toán',
      content: 'AutoWashPro hỗ trợ thanh toán qua tiền mặt, MoMo, và VNPay. Giá dịch vụ được hiển thị rõ ràng trước khi xác nhận đặt lịch. Bạn đồng ý thanh toán đầy đủ theo giá đã công bố.',
    },
    {
      title: '6. Điểm tích lũy và voucher',
      content: 'Điểm tích lũy được tính dựa trên giá trị đơn hàng. Điểm có thể đổi voucher theo quy định của AutoWashPro. Voucher chỉ có giá trị sử dụng một lần và không có giá trị quy đổi tiền mặt.',
    },
    {
      title: '7. Trách nhiệm của AutoWashPro',
      content: 'Chúng tôi cam kết cung cấp dịch vụ đặt lịch chất lượng. Tuy nhiên, chúng tôi không chịu trách nhiệm về chất lượng dịch vụ rửa xe do các chi nhánh cung cấp trực tiếp. Mọi khiếu nại về dịch vụ vui lòng liên hệ trực tiếp với chi nhánh.',
    },
    {
      title: '8. Quyền sở hữu trí tuệ',
      content: 'Nội dung trong ứng dụng AutoWashPro bao gồm văn bản, đồ họa, logo, hình ảnh và phần mềm thuộc quyền sở hữu của AutoWashPro hoặc được cấp phép. Bạn không được sao chép, sửa đổi hoặc phân phối nội dung mà không có sự đồng ý bằng văn bản.',
    },
    {
      title: '9. Giới hạn trách nhiệm',
      content: 'Trong phạm vi tối đa được pháp luật cho phép, AutoWashPro không chịu trách nhiệm về bất kỳ thiệt hại gián tiếp, đặc biệt, ngẫu nhiên hoặc do hậu quả nào phát sinh từ việc sử dụng dịch vụ.',
    },
    {
      title: '10. Thay đổi điều khoản',
      content: 'Chúng tôi có quyền cập nhật các Điều khoản Dịch vụ này bất cứ lúc nào. Thông báo về thay đổi sẽ được đăng tải trên ứng dụng. Việc tiếp tục sử dụng sau khi thay đổi đồng nghĩa với việc bạn chấp nhận các điều khoản mới.',
    },
    {
      title: '11. Luật áp dụng',
      content: 'Các Điều khoản này được điều chỉnh bởi và tuân thủ theo luật pháp Việt Nam. Mọi tranh chấp phát sinh sẽ được giải quyết tại cơ quan có thẩm quyền tại Việt Nam.',
    },
    {
      title: '12. Liên hệ',
      content: 'Nếu bạn có câu hỏi về các Điều khoản Dịch vụ này, vui lòng liên hệ qua hotline 1900 1234 hoặc email support@autowashpro.vn.',
    },
  ];

  return (
    <ScreenContainer scroll>
      <Header showBack title="Điều khoản sử dụng" />

      <View style={styles.lastUpdated}>
        <AppText variant="caption" color="textSecondary">
          Cập nhật lần cuối: 01/01/2024
        </AppText>
      </View>

      {sections.map((section, index) => (
        <View key={index} style={styles.sectionWrapper}>
          <Card style={styles.sectionCard}>
            <AppText variant="h4" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {section.title}
            </AppText>
            <AppText variant="body" color="textSecondary" style={styles.sectionContent}>
              {section.content}
            </AppText>
          </Card>
        </View>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  lastUpdated: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionWrapper: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionCard: {},
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  sectionContent: {
    lineHeight: 22,
  },
});
