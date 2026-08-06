import { useState, useEffect } from 'react';
import { Star, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const FALLBACK_REVIEWS = [
  { id: 't1', name: 'Lê Văn Cường', location: 'AutoWash Pro Thủ Đức', content: 'Dịch vụ tốt, đội ngũ chuyên nghiệp. Tôi đặt lịch trước qua website, đến nơi có khoang trống vào rửa ngay không phải xếp hàng chờ đợi cực kỳ tiện lợi.', rating: 5, color: 'emerald' },
  { id: 't2', name: 'Phạm Thị Dung', location: 'AutoWash Pro Quận 1', content: 'Rửa rất sạch, nhân viên nhiệt tình hỗ trợ dọn sạch nội thất bụi bẩn. Phòng chờ có điều hòa mát mẻ và nước uống phục vụ chu đáo.', rating: 5, color: 'blue' },
  { id: 't3', name: 'Nguyễn Văn An', location: 'AutoWash Pro Quận 7', content: 'Công nghệ rửa xe tiên tiến với bọt tuyết chuẩn quốc tế, bảo vệ nước sơn bóng của xe hiệu quả. Đặt lịch rất mượt mà.', rating: 5, color: 'violet' },
  { id: 't4', name: 'Trần Minh Tuấn', location: 'AutoWash Pro Cầu Giấy', content: 'Ceramic coating dọn xe cực kỳ bóng bẩy, nhân viên chu đáo hướng dẫn kỹ các lưu ý bảo vệ sơn xe rất tận tâm.', rating: 5, color: 'amber' },
  { id: 't5', name: 'Hoàng Thị Mai', location: 'AutoWash Pro Tân Bình', content: 'Giao diện Web trực quan. Giá cả minh bạch, chất lượng dọn dẹp xe tuyệt vời đến từng chi tiết nhỏ nhất. Sẽ quay lại.', rating: 5, color: 'rose' },
  { id: 't6', name: 'Đặng Văn Hải', location: 'AutoWash Pro Bình Thạnh', content: 'Lần đầu tiên rửa xe ở AutoWash Pro, chất lượng làm sạch nội thất rất kỹ. Xe mình đi cả tuần bụi bẩn bám đầy, sau khi rửa xong sạch bong như mới.', rating: 5, color: 'emerald' },
  { id: 't7', name: 'Vũ Thị Thanh', location: 'AutoWash Pro Đà Nẵng', content: 'Gói rửa cao cấp rất đáng tiền! Xe được chăm sóc từng chi tiết từ mâm, lốp cho đến nội thất bên trong. Nhân viên tư vấn nhiệt tình, thái độ chuyên nghiệp.', rating: 5, color: 'blue' },
  { id: 't8', name: 'Bùi Quốc Bảo', location: 'AutoWash Pro Quận 2', content: 'Đặt lịch online nhanh gọn, tới là có chỗ ngay. Nhân viên kỹ thuật làm việc rất bài bản, có check list trước sau rõ ràng. Mình rất yên tâm.', rating: 5, color: 'violet' },
  { id: 't9', name: 'Đỗ Thị Hồng', location: 'AutoWash Pro Tân Phú', content: 'Đội ngũ nhân viên thân thiện, không khí phòng chờ thoải mái. Chất lượng đánh bóng sơn vượt ngoài mong đợi, giá cả hợp lý. Cả nhà ai cũng khen.', rating: 5, color: 'amber' },
  { id: 't10', name: 'Ngô Văn Phúc', location: 'AutoWash Pro Gò Vấp', content: 'Mua gói giặt nội thất cho xe 7 chỗ, kết quả rất ưng ý. Xe hết sạch mùi ẩm mốc, ghế da được dưỡng bóng đẹp. Chắc chắn sẽ quay lại thường xuyên.', rating: 5, color: 'rose' },
  { id: 't11', name: 'Trương Thị Thu', location: 'AutoWash Pro Hà Nội', content: 'Web đặt lịch dễ dùng, chọn được khung giờ phù hợp. Nhân viên hỗ trợ tận nơi hướng dẫn tận tình. Dịch vụ rửa xe tại chỗ chu đáo, nhanh chóng.', rating: 5, color: 'emerald' },
  { id: 't12', name: 'Phan Đức Duy', location: 'AutoWash Pro Hải Phòng', content: 'Chăm sóc khách hàng rất tốt, có nhắn tin nhắc lịch trước khi đến. Xe rửa xong sạch sẽ, thơm tho. Mình đã giới thiệu cho bạn bè và ai cũng hài lòng.', rating: 5, color: 'blue' },
];

const MARQUEE_KEYFRAMES = `
@keyframes marquee-right { 0% { transform: translateX(0); } 100% { transform: translateX(-33.33%); } }
@keyframes marquee-left { 0% { transform: translateX(-33.33%); } 100% { transform: translateX(0); } }
.animate-marquee-right { animation: marquee-right var(--speed, 35s) linear infinite; }
.animate-marquee-left { animation: marquee-left var(--speed, 45s) linear infinite; }
.marquee-container:hover .animate-marquee-right,
.marquee-container:hover .animate-marquee-left { animation-play-state: paused; }
`;

function getColorClasses(colorName) {
  switch (colorName) {
    case 'emerald': return 'bg-emerald-100 text-emerald-700';
    case 'blue': return 'bg-blue-100 text-blue-700';
    case 'violet': return 'bg-violet-100 text-violet-700';
    case 'amber': return 'bg-amber-100 text-amber-700';
    case 'rose': return 'bg-rose-100 text-rose-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function TestimonialCard({ item }) {
  const parts = item.name?.trim().split(/\s+/) || [];
  const avatarText = parts.length >= 2 ? (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase() : (parts[0]?.[0] || '').toUpperCase();
  return (
    <div className="w-[380px] shrink-0 p-7 bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:shadow-emerald-50/60 transition-all duration-300 mx-3 flex flex-col justify-between">
      <div>
        <div className="flex gap-1 text-yellow-400 mb-4">
          {[...Array(item.rating)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
        </div>
        <p className="text-slate-600 text-sm leading-relaxed italic mb-6">&ldquo;{item.content}&rdquo;</p>
      </div>
      <div className="flex items-center gap-3.5 border-t border-slate-100 pt-4">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-inner ${getColorClasses(item.color)}`}>
          {avatarText}
        </div>
        <div className="text-left truncate">
          <p className="font-bold text-slate-900 text-sm">{item.name}</p>
          <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">{item.location}</p>
        </div>
      </div>
    </div>
  );
}

export default function TestimonialsSection() {
  const { t } = useTranslation();
  const [testimonials, setTestimonials] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/testimonials`)
      .then((res) => {
        if (!res.ok) throw new Error('Network error');
        return res.json();
      })
      .then((data) => {
        const arr = data?.data || data || [];
        if (Array.isArray(arr) && arr.length > 0) setTestimonials(arr);
        else setTestimonials(FALLBACK_REVIEWS);
      })
      .catch(() => setTestimonials(FALLBACK_REVIEWS));
  }, []);

  const items = testimonials.length > 0 ? testimonials : FALLBACK_REVIEWS;
  if (items.length === 0) return null;

  const marqueeRow1 = [...items, ...items, ...items];
  const marqueeRow2 = [...items, ...items, ...items];

  return (
    <section id="testimonials-section" className="relative py-24 md:py-32 bg-slate-50 overflow-hidden font-sans">
      <style>{MARQUEE_KEYFRAMES}</style>

      <div className="absolute top-10 left-10 w-96 h-96 bg-emerald-100/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-teal-100/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-[1400px] mx-auto px-6 md:px-12 mb-16">
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-100/60 text-emerald-600 mb-4 shadow-xs">
            <MessageSquare className="w-5 h-5" />
          </div>
          <p className="text-emerald-600 text-xs font-bold tracking-widest uppercase">{t('landing.testimonials.heading')}</p>
          <h2 className="mt-3 text-3xl md:text-5xl font-black tracking-tight text-slate-900">{t('landing.testimonials.subheading')}</h2>
          <p className="mt-4 text-sm md:text-base text-slate-500 leading-relaxed">
            {t('landing.testimonials.description')}
          </p>
        </div>
      </div>

      <div className="marquee-container flex flex-col gap-6 md:gap-8 cursor-grab select-none">
        <div className="flex overflow-hidden w-full relative">
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-slate-50 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-slate-50 to-transparent z-10 pointer-events-none" />
          <div className="animate-marquee-right flex" style={{ '--speed': '35s' }}>
            {marqueeRow1.map((item, index) => (
              <TestimonialCard key={`r1-${item.id || index}-${index}`} item={item} />
            ))}
          </div>
        </div>

        <div className="flex overflow-hidden w-full relative">
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-slate-50 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-slate-50 to-transparent z-10 pointer-events-none" />
          <div className="animate-marquee-left flex" style={{ '--speed': '45s' }}>
            {marqueeRow2.map((item, index) => (
              <TestimonialCard key={`r2-${item.id || index}-${index}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
