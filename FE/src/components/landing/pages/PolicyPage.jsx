import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../layout/Navbar';
import Footer from '../layout/Footer';
import { useSystemConfig } from '../../../hooks/useSystemConfig.jsx';
import { getApiBaseUrl } from '../../../lib/authStorage.js';
import { translateText } from '@/utils/notifTranslator';

const getFallbackPolicies = ({ depositPercent, noShowGraceMinutes, minAdvanceMinutes } = {}) => [
  {
    id: 'privacy',
    slug: 'privacy',
    title: 'Chính sách bảo mật',
    icon: '🔒',
    sections: [
      { subtitle: '1. Mục đích và phạm vi thu thập thông tin',
        body: 'AutoWashPro thu thập thông tin cá nhân của khách hàng bao gồm: họ tên, email, số điện thoại, biển số xe, địa chỉ và thông tin thanh toán. Các thông tin này chỉ được thu thập khi khách hàng tự nguyện đăng ký tài khoản, đặt lịch rửa xe hoặc sử dụng các dịch vụ trên hệ thống.' },
      { subtitle: '2. Phạm vi sử dụng thông tin',
        body: 'Thông tin cá nhân thu thập được chỉ sử dụng trong nội bộ AutoWashPro với các mục đích: xác nhận và quản lý lịch hẹn, hỗ trợ khách hàng, gửi thông báo về lịch hẹn và khuyến mãi, nâng cao chất lượng dịch vụ.' },
      { subtitle: '3. Thời gian lưu trữ thông tin',
        body: 'AutoWashPro lưu trữ thông tin cá nhân của khách hàng trong suốt thời gian tài khoản còn hoạt động. Khách hàng có quyền yêu cầu xóa tài khoản và thông tin cá nhân bất cứ lúc nào bằng cách liên hệ bộ phận hỗ trợ.' },
      { subtitle: '4. Cam kết bảo mật',
        body: 'AutoWashPro cam kết bảo vệ thông tin cá nhân của khách hàng bằng các biện pháp kỹ thuật và quản lý. Hệ thống sử dụng mã hóa SSL/TLS cho toàn bộ dữ liệu truyền tải và mã hóa mật khẩu bằng công nghệ bcrypt.' },
      { subtitle: '5. Chia sẻ thông tin với bên thứ ba',
        body: 'AutoWashPro không bán, chia sẻ hoặc tiết lộ thông tin cá nhân của khách hàng cho bên thứ ba ngoại trừ các trường hợp: có sự đồng ý của khách hàng, theo yêu cầu của cơ quan pháp luật, hoặc đối tác thanh toán (VNPay, MoMo) phục vụ xử lý giao dịch.' },
    ],
  },
  {
    id: 'terms',
    slug: 'terms',
    title: 'Điều khoản sử dụng',
    icon: '📋',
    sections: [
      { subtitle: '1. Chấp nhận điều khoản',
        body: 'Bằng việc truy cập và sử dụng hệ thống AutoWashPro, khách hàng xác nhận đã đọc, hiểu và đồng ý với tất cả các điều khoản được quy định trong tài liệu này.' },
      { subtitle: '2. Tài khoản người dùng',
        body: 'Khách hàng có trách nhiệm bảo mật thông tin tài khoản và mật khẩu. Mọi hoạt động diễn ra trên tài khoản đều được xem là do khách hàng thực hiện. AutoWashPro không chịu trách nhiệm cho các tổn thất phát sinh từ việc truy cập trái phép.' },
      { subtitle: '3. Quyền và nghĩa vụ của khách hàng',
        body: 'Khách hàng có quyền đặt lịch, hủy lịch, đánh giá dịch vụ và tham gia chương trình khách hàng thân thiết. Khách hàng có nghĩa vụ cung cấp thông tin chính xác, đến đúng giờ hẹn và tuân thủ nội quy của chi nhánh.' },
      { subtitle: '4. Quyền và nghĩa vụ của AutoWashPro',
        body: 'AutoWashPro có quyền từ chối phục vụ nếu khách hàng vi phạm điều khoản. Chúng tôi cam kết cung cấp dịch vụ đúng với mô tả và chịu trách nhiệm nếu dịch vụ không đạt chất lượng.' },
      { subtitle: '5. Sửa đổi điều khoản',
        body: 'AutoWashPro có quyền sửa đổi các điều khoản sử dụng bất cứ lúc nào. Các thay đổi sẽ được thông báo trên hệ thống. Việc tiếp tục sử dụng dịch vụ sau khi thay đổi được xem là chấp nhận điều khoản mới.' },
    ],
  },
  {
    id: 'payment',
    slug: 'payment',
    title: 'Chính sách thanh toán',
    icon: '💳',
    sections: [
      { subtitle: '1. Hình thức thanh toán',
        body: 'AutoWashPro chấp nhận các hình thức thanh toán sau: tiền mặt tại chi nhánh, chuyển khoản ngân hàng, thanh toán trực tuyến qua VNPay và MoMo.' },
      { subtitle: '2. Thanh toán đặt cọc',
        body: `Một số gói dịch vụ yêu cầu đặt cọc tối thiểu ${depositPercent}% giá trị đơn hàng khi đặt lịch. Khoản cọc sẽ được khấu trừ vào tổng số tiền khi khách hàng hoàn tất dịch vụ.` },
      { subtitle: '3. Thanh toán trực tuyến',
        body: 'Thanh toán trực tuyến qua VNPay/MoMo được xử lý ngay lập tức. Giao dịch thành công sẽ được xác nhận và cập nhật trạng thái thanh toán trong vòng 24h.' },
      { subtitle: '4. Hóa đơn và chứng từ',
        body: 'Hóa đơn điện tử được gửi qua email sau khi giao dịch hoàn tất. Khách hàng có nhu cầu lấy hóa đơn VAT vui lòng liên hệ bộ phận hỗ trợ và cung cấp mã số thuế trước khi thanh toán.' },
      { subtitle: '5. Bảo mật thông tin thanh toán',
        body: 'Mọi giao dịch thanh toán được bảo mật qua cổng thanh toán chuẩn PCI DSS. AutoWashPro không lưu trữ thông tin thẻ tín dụng hoặc mật khẩu tài khoản ngân hàng của khách hàng.' },
    ],
  },
  {
    id: 'cancellation',
    slug: 'cancellation',
    title: 'Chính sách hủy lịch',
    icon: '❌',
    sections: [
      { subtitle: '1. Hủy lịch trước giờ hẹn',
        body: 'Khách hàng có thể hủy lịch hẹn trước tối thiểu 2 giờ so với giờ bắt đầu. Việc hủy lịch được thực hiện trực tiếp trên hệ thống qua mục "Lịch sử đặt xe".' },
      { subtitle: '2. Hủy lịch muộn (dưới 2 giờ)',
        body: 'Trong trường hợp hủy lịch dưới 2 giờ trước giờ hẹn, khoản tiền cọc (nếu có) sẽ không được hoàn lại. Khách hàng vui lòng liên hệ chi nhánh qua số điện thoại để được hỗ trợ.' },
      { subtitle: '3. Không đến (No-show)',
        body: `Nếu khách hàng không đến sau ${noShowGraceMinutes ?? '30'} phút kể từ giờ hẹn, lịch hẹn sẽ tự động bị hủy bởi hệ thống. Tiền cọc sẽ không được hoàn lại và khách hàng sẽ bị ghi nhận một lượt "vắng mặt" (no-show).` },
      { subtitle: '4. Hủy lịch do chi nhánh',
        body: 'Trong trường hợp chi nhánh phải hủy lịch hẹn vì lý do bất khả kháng (mất điện, hỏng thiết bị, thiên tai), AutoWashPro sẽ thông báo sớm nhất có thể và hỗ trợ khách hàng đặt lại lịch miễn phí.' },
      { subtitle: '5. Giới hạn số lần hủy',
        body: 'Khách hàng hủy lịch nhiều lần (từ 5 lần trở lên trong một tháng) có thể bị giới hạn quyền đặt lịch hoặc yêu cầu đặt cọc 100% cho các lần đặt sau.' },
    ],
  },
  {
    id: 'refund',
    slug: 'refund',
    title: 'Chính sách hoàn tiền',
    icon: '🔙',
    sections: [
      { subtitle: '1. Điều kiện hoàn tiền',
        body: 'Khách hàng được hoàn tiền tự động vào Ví AutoWash khi hủy đơn đã thanh toán/cọc. Đối với đơn đã hoàn thành, khách hàng có thể gửi yêu cầu hoàn tiền trong vòng 24h kể từ khi hoàn thành. Ngoài ra, khách hàng được hoàn tiền khi chi nhánh hủy lịch do lỗi từ phía hệ thống.' },
      { subtitle: '2. Quy trình hoàn tiền',
        body: 'Hủy đơn: tiền được hoàn tự động vào Ví AutoWash ngay sau khi hủy, không cần yêu cầu. Hoàn tiền sau hoàn thành: khách hàng gửi yêu cầu qua hệ thống (trong vòng 24h), admin xem xét và phê duyệt, tiền sẽ được chuyển vào Ví AutoWash.' },
      { subtitle: '3. Phương thức hoàn tiền',
        body: 'Toàn bộ tiền hoàn được chuyển trực tiếp vào Ví AutoWash của khách hàng, có thể sử dụng ngay cho lần đặt lịch tiếp theo.' },
      { subtitle: '4. Hoàn tiền cho gói lượt (Slot Pack)',
        body: 'Gói lượt chưa sử dụng hết có thể được yêu cầu hoàn tiền với giá trị tương ứng số lượt còn lại, sau khi trừ phí quản lý 10%. Yêu cầu hoàn tiền gói lượt chỉ được chấp nhận trong vòng 30 ngày kể từ ngày mua.' },
    ],
  },
  {
    id: 'insurance',
    slug: 'insurance',
    title: 'Chính sách bảo hiểm & bồi thường',
    icon: '🤝',
    sections: [
      { subtitle: '1. Phạm vi bảo hiểm',
        body: 'AutoWashPro áp dụng bảo hiểm trách nhiệm dịch vụ cho toàn bộ quy trình rửa xe tại tất cả chi nhánh. Bảo hiểm này chi trả trong trường hợp xe của khách hàng bị trầy xước, móp méo, vỡ kính hoặc hư hỏng ngoại thất phát sinh trực tiếp từ quy trình rửa và chăm sóc xe của nhân viên AutoWashPro. Bảo hiểm không áp dụng cho các hư hỏng có sẵn trước khi nhận xe hoặc hư hỏng do nguyên nhân khách quan (thiên tai, trộm cắp).' },
      { subtitle: '2. Quy trình kiểm tra xe trước khi rửa',
        body: 'Trước khi tiến hành rửa, nhân viên AutoWashPro và khách hàng sẽ cùng kiểm tra tình trạng xe hiện tại. Mọi vết trầy xước, vết lõm, hoặc hư hỏng có sẵn sẽ được ghi nhận bằng hình ảnh và biên bản bàn giao. Quy trình này nhằm bảo vệ quyền lợi cả hai bên và là căn cứ xác định trách nhiệm khi có sự cố phát sinh. Khách hàng vui lòng dành 3-5 phút để cùng kiểm tra và ký xác nhận.' },
      { subtitle: '3. Quy trình xử lý khi có sự cố',
        body: 'Ngay khi phát hiện hư hỏng, khách hàng thông báo cho nhân viên hoặc quản lý chi nhánh trong vòng 24 giờ kể từ khi rời khỏi chi nhánh. AutoWashPro sẽ tiến hành: (1) lập biên bản ghi nhận sự cố có chữ ký hai bên, (2) chụp ảnh hiện trường, (3) định giá thiệt hại tại garage hoặc trung tâm sửa chữa uy tín do hai bên thỏa thuận. Thời gian xử lý yêu cầu tối đa 48 giờ làm việc.' },
      { subtitle: '4. Mức bồi thường',
        body: 'AutoWashPro cam kết bồi thường 100% chi phí sửa chữa, khắc phục hư hỏng tại garage được hai bên thống nhất. Trường hợp hư hỏng không thể khắc phục, mức bồi thường tối đa dựa trên giá trị thị trường của bộ phận bị hư hỏng tại thời điểm xảy ra sự cố. Mức bồi thường tối đa cho mỗi sự cố là 50.000.000đ. Bồi thường được thực hiện trong vòng 7 ngày làm việc sau khi hai bên thống nhất mức bồi thường.' },
      { subtitle: '5. Xử lý xe sang, xe đắt tiền',
        body: 'Đối với các dòng xe sang, siêu sang (Mercedes-Benz, BMW, Audi, Lexus, Porsche, Rolls-Royce, Bentley, Ferrari, Lamborghini, McLaren và các thương hiệu tương đương), AutoWashPro áp dụng quy trình rửa tay chuyên biệt bởi đội ngũ kỹ thuật viên có chứng chỉ chăm sóc xe hạng sang. Khách hàng sở hữu xe sang nên đặt lịch tại các chi nhánh có trang bị khu vực rửa xe riêng biệt (VIP Zone). Nếu có thiệt hại phát sinh, hạn mức bồi thường tối đa cho xe sang có thể lên đến 200.000.000đ mỗi sự cố, tùy theo đánh giá của bên giám định độc lập.' },
      { subtitle: '6. Trường hợp từ chối bồi thường',
        body: 'AutoWashPro có quyền từ chối bồi thường trong các trường hợp: (1) hư hỏng có sẵn trước khi rửa nhưng không được ghi nhận trong biên bản bàn giao, (2) hư hỏng do lỗi kỹ thuật của xe hoặc do xe đã có sẵn tình trạng xuống cấp, (3) khách hàng không thông báo trong vòng 24 giờ, (4) hư hỏng phát sinh sau khi xe đã rời khỏi chi nhánh và không thể xác định nguyên nhân, (5) khách hàng yêu cầu dịch vụ trái với quy trình hoặc từ chối kiểm tra xe trước khi rửa.' },
    ],
  },
  {
    id: 'booking',
    slug: 'booking',
    title: 'Chính sách đặt lịch',
    icon: '📅',
    sections: [
      { subtitle: '1. Quy trình đặt lịch',
        body: 'Khách hàng chọn chi nhánh, gói dịch vụ, thời gian và phương tiện. Hệ thống sẽ kiểm tra slot trống và xác nhận lịch hẹn. Mỗi lịch hẹn được cấp một mã duy nhất dùng để check-in tại chi nhánh.' },
      { subtitle: '2. Thời gian đặt lịch',
        body: `Khách hàng có thể đặt lịch trước tối thiểu ${minAdvanceMinutes ?? '15'} phút và tối đa 30 ngày so với thời điểm hiện tại. Mỗi khung giờ cách nhau 30 phút để đảm bảo đủ thời gian phục vụ.` },
      { subtitle: '3. Check-in và Check-out',
        body: 'Khách hàng đến chi nhánh đúng giờ hẹn, xuất trình mã lịch hẹn (QR code) để check-in. Sau khi hoàn tất dịch vụ, nhân viên thực hiện check-out và xác nhận hoàn thành.' },
      { subtitle: '4. Lịch hẹn định kỳ',
        body: 'Khách hàng có thể đặt lịch định kỳ theo tuần. Hệ thống tự động tạo lịch hẹn mới dựa trên lịch định kỳ đã đăng ký. Khách hàng có thể hủy hoặc điều chỉnh lịch định kỳ bất cứ lúc nào.' },
      { subtitle: '5. Ưu tiên xếp lịch',
        body: 'Khách hàng thân thiết ở hạng Bạc, Vàng, Kim cương được ưu tiên xếp lịch trước. Thứ tự ưu tiên dựa trên hạng thành viên và điểm tích lũy.' },
    ],
  },
  {
    id: 'loyalty',
    slug: 'loyalty',
    title: 'Chính sách khách hàng thân thiết',
    icon: '⭐',
    sections: [
      { subtitle: '1. Hạng thành viên',
        body: 'AutoWashPro có 4 hạng thành viên: Đồng (0-99 điểm), Bạc (100-499 điểm), Vàng (500-999 điểm), Kim cương (1.000+ điểm). Điểm tích lũy dựa trên giá trị đơn hàng đã hoàn thành.' },
      { subtitle: '2. Tích điểm',
        body: 'Mỗi 10.000đ chi tiêu tương ứng 1 điểm. Điểm được tự động cộng vào tài khoản sau khi lịch hẹn hoàn tất và thanh toán thành công. Điểm có hạn sử dụng 12 tháng kể từ ngày tích lũy.' },
      { subtitle: '3. Quyền lợi theo hạng',
        body: 'Khách hàng hạng Bạc được giảm 5% khi mua gói lượt, hạng Vàng giảm 10%, hạng Kim cương giảm 15%. Khách hàng hạng Vàng và Kim cương được ưu tiên xếp lịch và hỗ trợ ưu tiên.' },
      { subtitle: '4. Đổi quà từ điểm thưởng',
        body: 'Điểm tích lũy có thể được đổi lấy quà tặng và voucher giảm giá tại mục "Kho quà & Tích điểm". Điểm đã đổi không thể hoàn lại hoặc chuyển đổi thành tiền mặt.' },
    ],
  },
  {
    id: 'data-protection',
    slug: 'data-protection',
    title: 'Chính sách bảo vệ dữ liệu cá nhân',
    icon: '🛡️',
    sections: [
      { subtitle: '1. Nguyên tắc xử lý dữ liệu',
        body: 'AutoWashPro tuân thủ các nguyên tắc: thu thập dữ liệu tối thiểu (chỉ thu thập dữ liệu cần thiết), minh bạch về mục đích sử dụng, có sự đồng ý rõ ràng từ khách hàng, và đảm bảo tính chính xác của dữ liệu.' },
      { subtitle: '2. Quyền của khách hàng đối với dữ liệu',
        body: 'Khách hàng có quyền: truy cập dữ liệu cá nhân, yêu cầu chỉnh sửa dữ liệu không chính xác, yêu cầu xóa dữ liệu (quyền được lãng quên), phản đối xử lý dữ liệu, và yêu cầu xuất dữ liệu.' },
      { subtitle: '3. Cookie và công nghệ theo dõi',
        body: 'Hệ thống sử dụng cookie để cải thiện trải nghiệm người dùng và phân tích hành vi. Khách hàng có thể tùy chọn tắt cookie trong cài đặt trình duyệt.' },
      { subtitle: '4. Biện pháp bảo vệ kỹ thuật',
        body: 'Dữ liệu được bảo vệ bằng tường lửa, mã hóa SSL/TLS, xác thực đa lớp và kiểm soát truy cập chặt chẽ. Hệ thống được kiểm tra bảo mật định kỳ để phát hiện và khắc phục lỗ hổng.' },
    ],
  },
];

function Sidebar({ policies = [], activeSection, onSelect, currentLang }) {
  return (
    <nav className="space-y-1 sticky top-24">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 pb-2">{translateText('Danh sách chính sách', currentLang)}</p>
      {policies.map(p => {
        const key = p.slug || p.id;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left cursor-pointer ${
              activeSection === key
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            }`}
          >
            <span className="text-base shrink-0">{p.icon || '📜'}</span>
            <span className="truncate">{p.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function PolicyPage({ onOpenAuth, user, onLogout, onGoToProfile, onGoToHistory, onGoToPayments, onGoToNotifications }) {
  const location = useLocation();
  const configs = useSystemConfig();
  const depositPercent = Math.round(configs?.DEPOSIT_RATE ?? 0);
  const noShowGraceMinutes = configs?.AUTO_CANCEL_GRACE_MINUTES;
  const minAdvanceMinutes = configs?.MIN_ADVANCE_BOOKING_MINUTES;

  const [policies, setPolicies] = useState(() => getFallbackPolicies({ depositPercent, noShowGraceMinutes, minAdvanceMinutes }));
  const [activeSection, setActiveSection] = useState('privacy');

  useEffect(() => {
    let cancelled = false;
    async function loadPolicies() {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/policies?category=policy`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.success && Array.isArray(data?.data) && data.data.length > 0) {
          const mapped = data.data.map(p => ({
            id: p.slug || p._id,
            slug: p.slug,
            title: p.title,
            icon: p.icon || '📜',
            sections: p.sections || [],
            updatedAt: p.updatedAt
          }));
          setPolicies(mapped);
        }
      } catch {
        // keep fallback
      }
    }

    loadPolicies();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const hash = location.hash?.replace('#', '');
    if (hash && policies.some(p => (p.slug || p.id) === hash)) {
      setActiveSection(hash);
    }
  }, [location.hash, policies]);

  return (
    <div className="bg-white min-h-screen">
      <Navbar
        onOpenAuth={onOpenAuth}
        user={user}
        onLogout={onLogout}
        onGoToProfile={onGoToProfile}
        onGoToHistory={onGoToHistory}
        onGoToPayments={onGoToPayments}
        onGoToNotifications={onGoToNotifications}
      />

      {/* Hero header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 pt-28 pb-16 md:pb-20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white/90 text-xs font-semibold tracking-wide mb-4">
              📜 Chính sách & Điều khoản
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              Chính sách dịch vụ
            </h1>
            <p className="text-white/70 mt-3 md:mt-4 text-sm md:text-base max-w-2xl leading-relaxed">
              AutoWashPro cam kết minh bạch trong cung cấp dịch vụ và bảo vệ quyền lợi khách hàng với chính sách bảo hiểm
              bồi thường thiệt hại phát sinh trong quá trình rửa xe, bao gồm cả dòng xe sang và siêu sang.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-10 md:py-14">
        <div className="flex flex-col md:flex-row gap-10">
          {/* Sidebar - desktop */}
          <aside className="hidden md:block w-64 lg:w-72 shrink-0">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <Sidebar policies={policies} activeSection={activeSection} onSelect={(id) => { setActiveSection(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0 max-w-4xl">
            {/* Mobile section selector */}
            <div className="md:hidden mb-6">
              <select
                value={activeSection}
                onChange={e => { setActiveSection(e.target.value); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="w-full h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                {policies.map(p => (
                  <option key={p.slug || p.id} value={p.slug || p.id}>{p.icon} {p.title}</option>
                ))}
              </select>
            </div>

            <div className="space-y-10">
              {policies.filter(p => (p.slug || p.id) === activeSection).map(policy => (
                <section
                  key={policy.slug || policy.id}
                  id={policy.slug || policy.id}
                  className="scroll-mt-28"
                >
                  <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-200">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-xl">
                      {policy.icon}
                    </div>
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-slate-900">{policy.title}</h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Cập nhật lần cuối: {policy.updatedAt ? new Date(policy.updatedAt).toLocaleDateString('vi-VN') : '01/2026'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-5">
                    {(policy.sections || policy.content || []).map((section, i) => (
                      <div key={i} className="bg-slate-50/50 rounded-2xl p-5 md:p-6 border border-slate-100 hover:border-slate-200 transition-colors">
                        <h3 className="text-sm font-bold text-emerald-700 mb-2">{section.subtitle}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{section.body}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Back to top */}
            <div className="mt-12 pt-8 border-t border-slate-200 text-center">
              <a
                href="#"
                onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                Quay lại đầu trang
              </a>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}