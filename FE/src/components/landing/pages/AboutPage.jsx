import Navbar from '../layout/Navbar';
import Footer from '../layout/Footer';
import PackagesSection from '../sections/PackagesSection';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { translateText } from '@/utils/notifTranslator';

const stats = [
  { value: '50.000+', label: 'Lượt rửa xe' },
  { value: '15+', label: 'Chi nhánh' },
  { value: '4.9', label: 'Đánh giá trung bình' },
  { value: '5+', label: 'Năm kinh nghiệm' },
];

const values = [
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
    title: 'Chất lượng vượt trội',
    desc: 'Sử dụng công nghệ và dung dịch chuyên dụng cao cấp, đảm bảo xe của bạn luôn sáng bóng như mới.',
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
    ),
    title: 'Tiết kiệm thời gian',
    desc: 'Đặt lịch trước qua ứng dụng, đến là rửa ngay — không chờ đợi. Quy trình tối ưu chỉ 15-45 phút.',
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    title: 'Đội ngũ chuyên nghiệp',
    desc: 'Kỹ thuật viên được đào tạo bài bản, tận tâm với từng chi tiết nhỏ nhất trên xe của bạn.',
  },
  {
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'An toàn & bảo vệ',
    desc: 'Cam kết bồi thường nếu có hư hỏng. Sản phẩm thân thiện môi trường, an toàn cho sức khỏe.',
  },
];

const timeline = [
  { year: '2019', title: 'Thành lập', desc: 'AutoWashPro ra đời với 1 chi nhánh đầu tiên tại TP. Hồ Chí Minh, mang đến dịch vụ rửa xe chuyên nghiệp.' },
  { year: '2020', title: 'Mở rộng', desc: 'Phát triển lên 3 chi nhánh, ra mắt ứng dụng đặt lịch trực tuyến giúp khách hàng chủ động thời gian.' },
  { year: '2022', title: 'Đổi mới', desc: 'Triển khai hệ thống gói lượt và chương trình khách hàng thân thiết, đạt 10.000 lượt rửa.' },
  { year: '2024', title: 'Dẫn đầu', desc: '15+ chi nhánh trên toàn quốc, phục vụ hơn 50.000 lượt xe, trở thành thương hiệu rửa xe uy tín hàng đầu.' },
  { year: '2025', title: 'Tương lai', desc: 'Mở rộng hệ sinh thái dịch vụ xe hơi toàn diện: bảo dưỡng, phụ kiện, và chăm sóc xe tại nhà.' },
];

const team = [
  { name: 'Lữ Anh Bảo Khang', role: 'Thành viên', avatar: 'LABK' },
  { name: 'Trương Nguyễn Thái Bình', role: 'Thành viên', avatar: 'TNTB' },
  { name: 'Phạm Thị Kim Hương', role: 'Thành viên', avatar: 'PTKH' },
  { name: 'Hồ Đình Anh', role: 'Thành viên', avatar: 'HDA' },
];

function fadeInUp(i = 0) {
  return {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-50px' },
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] },
  };
}

export default function AboutPage({ onOpenAuth, user, onLogout, onGoToProfile, onGoToHistory, onGoToPayments, onGoToNotifications }) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'vi';

  return (
    <div className="bg-white min-h-screen">
      <Navbar onOpenAuth={onOpenAuth} user={user} onLogout={onLogout} onGoToProfile={onGoToProfile} onGoToHistory={onGoToHistory} onGoToPayments={onGoToPayments} onGoToNotifications={onGoToNotifications} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 pt-32 pb-24">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-400 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full bg-teal-400 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <motion.p {...fadeInUp(0)} className="inline-block rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-emerald-200 mb-6 backdrop-blur-sm border border-white/10">
            {translateText('#1 Dịch vụ rửa xe tại Việt Nam', currentLang)}
          </motion.p>
          <motion.h1 {...fadeInUp(1)} className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
            {translateText('Chúng tôi yêu xe của bạn', currentLang)}{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-300">{translateText('như chính bạn', currentLang)}</span>
          </motion.h1>
          <motion.p {...fadeInUp(2)} className="text-emerald-100/80 text-lg max-w-2xl mx-auto leading-relaxed">
            {translateText('AutoWashPro ra đời với sứ mệnh mang đến trải nghiệm chăm sóc xe chuyên nghiệp, tiện lợi và đáng tin cậy cho mọi chủ xe tại Việt Nam.', currentLang)}
          </motion.p>
          <motion.div {...fadeInUp(3)} className="flex items-center justify-center gap-4 mt-10">
            <div className="flex -space-x-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-emerald-800 bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center">
                  <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 10-16 0" />
                  </svg>
                </div>
              ))}
            </div>
            <p className="text-sm text-emerald-200/70">
              {currentLang === 'en' ? 'Trusted by ' : 'Được '}<span className="font-semibold text-emerald-200">50.000+</span> {currentLang === 'en' ? 'customers nationwide' : 'khách hàng tin dùng'}
            </p>
          </motion.div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* Stats */}
      <section className="relative -mt-10 pb-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <motion.div key={s.label} {...fadeInUp(i)}
                className="rounded-2xl bg-white border border-slate-200 shadow-lg shadow-slate-200/50 px-5 py-6 text-center hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
                <p className="text-2xl md:text-3xl font-extrabold text-emerald-600">{s.value}</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">{translateText(s.label, currentLang)}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div {...fadeInUp(0)}>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">{translateText('Câu chuyện', currentLang)}</p>
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight mb-6">
                {translateText('Từ một ý tưởng nhỏ', currentLang)}{' '}
                <span className="text-emerald-600">{translateText('đến chuỗi cửa hàng', currentLang)}</span> {translateText('rửa xe hàng đầu', currentLang)}
              </h2>
              <div className="space-y-4 text-slate-600 leading-relaxed">
                <p>
                  {translateText('AutoWashPro được thành lập vào năm 2019 bởi đội ngũ những người đam mê xe hơi và dịch vụ khách hàng. Chúng tôi nhận thấy việc rửa xe tại Việt Nam còn nhiều bất cập: thời gian chờ lâu, chất lượng không đồng nhất, và khó khăn trong việc đặt lịch.', currentLang)}
                </p>
                <p>
                  {translateText('Từ đó, chúng tôi xây dựng một hệ thống rửa xe chuyên nghiệp với quy trình chuẩn hóa, ứng dụng đặt lịch thông minh, và cam kết chất lượng cho từng chiếc xe. Sau hơn 5 năm, AutoWashPro đã trở thành thương hiệu rửa xe được yêu thích nhất tại TP. Hồ Chí Minh và đang mở rộng ra các tỉnh thành khác.', currentLang)}
                </p>
              </div>
            </motion.div>
            <motion.div {...fadeInUp(1)} className="relative">
              <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 border border-emerald-200 overflow-hidden flex items-center justify-center">
                <div className="text-center p-8">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-200">
                    <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-slate-800">AutoWashPro</p>
                  <p className="text-sm text-slate-500 mt-1">{translateText('Chăm sóc xe tận tâm', currentLang)}</p>
                  <div className="mt-4 flex items-center justify-center gap-1 text-emerald-600 text-sm font-medium">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                    Since 2019
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-full h-full rounded-2xl border-2 border-emerald-200 -z-10" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-slate-50/60">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div {...fadeInUp(0)} className="text-center mb-14">
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">{translateText('Giá trị cốt lõi', currentLang)}</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900">{translateText('Tại sao chọn chúng tôi?', currentLang)}</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {values.map((v, i) => (
              <motion.div key={v.title} {...fadeInUp(i + 1)}
                className="rounded-2xl bg-white border border-slate-200 p-6 hover:shadow-lg hover:border-emerald-200 transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                  {v.icon}
                </div>
                <h3 className="font-bold text-slate-800 mb-2">{translateText(v.title, currentLang)}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{translateText(v.desc, currentLang)}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div {...fadeInUp(0)} className="text-center mb-14">
            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3">Lịch sử phát triển</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900">Hành trình của chúng tôi</h2>
          </motion.div>
          <div className="relative">
            <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-slate-200 -translate-x-1/2" />
            {timeline.map((t, i) => (
              <motion.div key={t.year} {...fadeInUp(i)}
                className={`relative flex items-start gap-6 md:gap-0 mb-10 last:mb-0 ${
                  i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}>
                <div className="hidden md:block md:w-1/2" />
                <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-md shrink-0 md:absolute md:left-1/2 md:-translate-x-1/2">
                  <div className="w-3 h-3 rounded-full bg-emerald-600 ring-4 ring-white" />
                </div>
                <div className={`md:w-1/2 ${i % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12'}`}>
                  <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all duration-300">
                    <span className="inline-block rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 mb-2">{t.year}</span>
                    <h3 className="font-bold text-slate-800 mb-1">{t.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{t.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div {...fadeInUp(0)} className="text-center mb-14">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3">Đội ngũ</p>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">Những con người tạo nên thương hiệu</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {team.map((m, i) => (
              <motion.div key={m.name} {...fadeInUp(i + 1)}
                className="text-center group">
                <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-xl font-bold text-white mb-4 shadow-lg shadow-emerald-900/30 group-hover:scale-105 transition-transform duration-300">
                  {m.avatar}
                </div>
                <h3 className="font-bold text-white">{m.name}</h3>
                <p className="text-sm text-slate-400">{m.role}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Giải pháp đặt lịch */}
      <PackagesSection />

      <Footer />
    </div>
  );
}
