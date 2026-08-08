import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSystemConfig } from '@/hooks/useSystemConfig';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function formatPrice(v) {
  return new Intl.NumberFormat('vi-VN').format(v || 0) + 'đ';
}

export default function PackagesSection() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('single');
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const configs = useSystemConfig();
  const depositPercent = configs?.DEPOSIT_RATE ? Math.round(configs.DEPOSIT_RATE) : 0;
  const vatRate = configs?.VAT_PERCENT ? Math.round(configs.VAT_PERCENT) : 10;

  useEffect(() => {
    async function fetchPackages() {
      try {
        const res = await fetch(`${API_BASE}/slot-products/public`);
        const payload = await res.json();
        const data = payload?.data || payload || [];
        setPackages(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Failed to load slot products:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchPackages();
  }, []);

  const tabs = [
    {
      id: 'single',
      label: 'Đặt lịch thường',
      sublabel: 'Linh hoạt & Nhanh chóng',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )
    },
    {
      id: 'recurring',
      label: 'Đặt lịch định kỳ',
      sublabel: 'Tự động & Tiện lợi',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
      )
    },
    {
      id: 'slot_pack',
      label: 'Gói slot prepaid',
      sublabel: 'Tiết kiệm đến 15%',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z" />
          <line x1="12" y1="5" x2="12" y2="19" />
        </svg>
      )
    }
  ];

  return (
    <section id="packages" className="relative py-24 md:py-32 overflow-hidden bg-slate-50">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08),transparent_60%)]" />
      <div className="pointer-events-none absolute -left-40 top-1/3 h-[500px] w-[500px] rounded-full bg-emerald-100/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-1/3 h-[500px] w-[500px] rounded-full bg-teal-100/20 blur-3xl" />

      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-12">
        {/* Header Section */}
        <div className="text-center mb-16">
          <span className="text-emerald-600 text-xs font-semibold tracking-widest uppercase mb-4 block">
            GIẢI PHÁP ĐẶT LỊCH
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter leading-none text-slate-900 mb-6">
            Chọn cách đặt lịch phù hợp với bạn
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm md:text-base leading-relaxed">
            Chúng tôi cung cấp nhiều hình thức đặt lịch rửa xe linh hoạt, giúp bạn tiết kiệm tối đa thời gian, chi phí và giữ cho phương tiện luôn sạch bóng.
          </p>
        </div>

        {/* Dynamic Navigation/Tab Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch justify-center gap-4 max-w-4xl mx-auto mb-16 p-2 bg-slate-200/50 backdrop-blur-md rounded-2xl border border-slate-200">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-4 px-6 py-4 rounded-xl text-left transition-all duration-300 flex-1 relative ${
                  isActive
                    ? 'bg-white text-emerald-700 shadow-md shadow-emerald-500/5 border border-emerald-100'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                }`}
              >
                <div className={`p-3 rounded-xl transition-all duration-300 ${
                  isActive ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-300/40 text-slate-500'
                }`}>
                  {tab.icon}
                </div>
                <div>
                  <div className="font-bold text-sm sm:text-base leading-tight">{tab.label}</div>
                  <div className="text-xs text-slate-400 font-medium mt-0.5">{tab.sublabel}</div>
                </div>
                {isActive && (
                  <motion.div
                    layoutId="active-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-emerald-600 rounded-full hidden sm:block"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'single' && (
              <motion.div
                key="single"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white rounded-3xl p-8 md:p-12 border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.02)]"
              >
                <div className="lg:col-span-7 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700">
                    ✨ DỊCH VỤ NHANH CHÓNG
                  </div>
                  <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    Đặt lịch đơn lẻ 24/7
                  </h3>
                  <p className="text-slate-500 text-sm md:text-base leading-relaxed">
                    Giải pháp hoàn hảo khi bạn cần rửa xe gấp hoặc không có lịch trình rửa xe định kỳ cố định. Đặt chỗ linh hoạt bất cứ lúc nào trong ngày chỉ với vài thao tác chạm.
                  </p>

                  <div className="space-y-4 pt-2">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center font-bold text-sm text-emerald-600">
                        1
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm md:text-base">Hẹn lịch chính xác</h4>
                        <p className="text-xs md:text-sm text-slate-400">Chọn chi nhánh gần nhất và chọn đúng khung giờ rửa xe còn trống.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center font-bold text-sm text-emerald-600">
                        2
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm md:text-base">Cá nhân hóa dịch vụ</h4>
                        <p className="text-xs md:text-sm text-slate-400">Chọn gói rửa chính và thêm các dịch vụ tùy chọn như vệ sinh động cơ, nội thất.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center font-bold text-sm text-emerald-600">
                        3
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm md:text-base">Đặt cọc online {depositPercent}%</h4>
                        <p className="text-xs md:text-sm text-slate-400">Thanh toán đặt cọc qua chuyển khoản để đảm bảo slot, không phải xếp hàng chờ đợi.</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={() => navigate('/booking?tab=regular')}
                      className="px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-[0_4px_20px_-5px_rgba(16,185,129,0.3)] hover:shadow-emerald-500/30 transition-all duration-300 text-center"
                    >
                      Đặt lịch ngay
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 relative flex items-center justify-center">
                  <div className="w-full max-w-[340px] aspect-[4/5] bg-gradient-to-tr from-emerald-500 to-teal-600 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between text-white">
                    {/* Glassmorphism card inside */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-8 -mt-8" />
                    
                    <div className="flex justify-between items-start z-10">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md">
                        ONLINE CONFIRMED
                      </span>
                    </div>

                    <div className="z-10 space-y-2">
                      <div className="text-[11px] font-bold text-emerald-100 uppercase tracking-widest">Giữ chỗ 24/7</div>
                      <div className="text-2xl font-black leading-tight">Nhanh Chóng & Linh Hoạt</div>
                      <p className="text-[11px] text-emerald-50/80 leading-relaxed">
                        Đặt lịch online trước khi đi để tiết kiệm thời gian chờ. Hệ thống tự động xác nhận slot ngay lập tức.
                      </p>
                    </div>

                    <div className="pt-4 border-t border-white/20 flex justify-between items-center z-10">
                      <div>
                        <div className="text-[10px] text-emerald-100/60 uppercase">Phí đặt cọc</div>
                        <div className="text-lg font-bold">Chỉ {depositPercent}%</div>
                      </div>
                      <div className="w-9 h-9 rounded-full bg-white text-emerald-600 flex items-center justify-center font-bold">
                        →
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'recurring' && (
              <motion.div
                key="recurring"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white rounded-3xl p-8 md:p-12 border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.02)]"
              >
                <div className="lg:col-span-7 space-y-6">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700">
                    🔄 TIẾT KIỆM THỜI GIAN
                  </div>
                  <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    Đặt lịch định kỳ tự động
                  </h3>
                  <p className="text-slate-500 text-sm md:text-base leading-relaxed">
                    Bạn quá bận rộn để nhớ đặt lịch rửa xe hàng tuần? Giải pháp đặt lịch định kỳ của AutoWashPro giúp xe của bạn luôn sạch sẽ theo một lịch trình cố định được thiết lập một lần duy nhất.
                  </p>

                  <div className="space-y-4 pt-2">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center font-bold text-sm text-emerald-600">
                        ✓
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm md:text-base">Lên lịch hàng tuần tự động</h4>
                        <p className="text-xs md:text-sm text-slate-400">Chọn thứ trong tuần và giờ rửa xe cố định. Hệ thống tự tạo đặt lịch mỗi tuần.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center font-bold text-sm text-emerald-600">
                        ✓
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm md:text-base">Ưu tiên giữ slot giờ cao điểm</h4>
                        <p className="text-xs md:text-sm text-slate-400">Lịch định kỳ luôn được hệ thống ưu tiên xếp chỗ trước kể cả trong các khung giờ cao điểm.</p>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center font-bold text-sm text-emerald-600">
                        ✓
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm md:text-base">Dễ dàng quản lý & thay đổi</h4>
                        <p className="text-xs md:text-sm text-slate-400">Bạn có thể dời lịch, hủy buổi rửa xe hoặc thay đổi thông tin định kỳ ngay trong hồ sơ.</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={() => navigate('/booking?tab=recurring')}
                      className="px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-[0_4px_20px_-5px_rgba(16,185,129,0.3)] hover:shadow-emerald-500/30 transition-all duration-300 text-center"
                    >
                      Thiết lập lịch định kỳ
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 relative flex items-center justify-center">
                  <div className="w-full max-w-[340px] aspect-[4/5] bg-gradient-to-tr from-teal-600 to-cyan-700 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between text-white">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-8 -mt-8" />
                    
                    <div className="flex justify-between items-start z-10">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="23 4 23 10 17 10" />
                          <polyline points="1 20 1 14 7 14" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md">
                        RECURRING VIP
                      </span>
                    </div>

                    <div className="z-10 space-y-2">
                      <div className="text-[11px] font-bold text-cyan-100 uppercase tracking-widest">Tiện lợi & Tự động</div>
                      <div className="text-2xl font-black leading-tight">Xế Cưng Luôn Sạch Bóng</div>
                      <p className="text-[11px] text-cyan-5/80 leading-relaxed">
                        Hệ thống tự động nhắc nhở trước 60 phút và sắp xếp chỗ đón tiếp chuyên nghiệp cho lịch rửa xe hàng tuần của bạn.
                      </p>
                    </div>

                    <div className="pt-4 border-t border-white/20 flex justify-between items-center z-10">
                      <div>
                        <div className="text-[10px] text-cyan-100/60 uppercase">Chu kỳ linh hoạt</div>
                        <div className="text-lg font-bold">4 - 12 tuần</div>
                      </div>
                      <div className="w-9 h-9 rounded-full bg-white text-teal-600 flex items-center justify-center font-bold">
                        →
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'slot_pack' && (
              <motion.div
                key="slot_pack"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="space-y-12"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white rounded-3xl p-8 md:p-12 border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.02)]">
                  <div className="lg:col-span-7 space-y-6">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700">
                      💰 GIẢI PHÁP SIÊU TIẾT KIỆM
                    </div>
                    <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                      Gói slot trả trước (Slot packs)
                    </h3>
                    <p className="text-slate-500 text-sm md:text-base leading-relaxed">
                      Lựa chọn tối ưu về mặt kinh tế dành cho khách hàng thân thiết. Mua trước số lượt rửa xe theo gói lớn để nhận mức chiết khấu cực sâu lên đến 15% và đơn giản hóa quy trình đặt lịch.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150">
                        <div className="text-xl font-bold text-emerald-600">Giảm giá sâu</div>
                        <p className="text-xs text-slate-400 mt-1">Chiết khấu 5% khi mua gói 5 lượt, 10% khi mua 10 lượt và 15% khi mua trên 20 lượt.</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150">
                        <div className="text-xl font-bold text-emerald-600">Không cần đặt cọc</div>
                        <p className="text-xs text-slate-400 mt-1">Khi đặt lịch bằng gói slot, bạn không cần phải thanh toán đặt cọc {depositPercent}% tại bước xác nhận.</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150">
                        <div className="text-xl font-bold text-emerald-600">Áp dụng đa xe</div>
                        <p className="text-xs text-slate-400 mt-1">Bạn có thể chọn chế độ "Tất cả xe" để sử dụng gói slot chung cho nhiều xe trong nhà.</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150">
                        <div className="text-xl font-bold text-emerald-600">Quản lý trực quan</div>
                        <p className="text-xs text-slate-400 mt-1">Theo dõi số lượt còn lại, hạn sử dụng, mã coupon check-in trực tiếp tại Cổng khách hàng.</p>
                      </div>
                    </div>

                    <div className="pt-4">
                      <button
                        onClick={() => navigate('/booking?tab=slot_pack')}
                        className="px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-[0_4px_20px_-5px_rgba(16,185,129,0.3)] hover:shadow-emerald-500/30 transition-all duration-300"
                      >
                        Mua gói slot tiết kiệm ngay
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-5 relative flex items-center justify-center">
                    <div className="w-full max-w-[340px] aspect-[4/5] bg-gradient-to-tr from-amber-500 to-orange-600 rounded-[2.5rem] p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between text-white">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-8 -mt-8" />
                      
                      <div className="flex justify-between items-start z-10">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md">
                          PREPAID PASS
                        </span>
                      </div>

                      <div className="z-10 space-y-2">
                        <div className="text-[11px] font-bold text-amber-100 uppercase tracking-widest">Tiết kiệm & Tiện lợi</div>
                        <div className="text-2xl font-black leading-tight">Mua Nhiều Lượt — Dùng Dần</div>
                        <p className="text-[11px] text-amber-50/80 leading-relaxed">
                          Nhận mã gói check-in tiện lợi, quét QR tại quầy để rửa xe ngay mà không cần giao dịch thanh toán rườm rà.
                        </p>
                      </div>

                      <div className="pt-4 border-t border-white/20 flex justify-between items-center z-10">
                        <div>
                          <div className="text-[10px] text-amber-100/60 uppercase">Chiết khấu tối đa</div>
                          <div className="text-lg font-bold">Lên đến 15%</div>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-white text-orange-600 flex items-center justify-center font-bold">
                          →
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Slot Products list - Dynamic data loading */}
                <div className="space-y-6">
                  <div className="text-center">
                    <h4 className="text-2xl font-bold text-slate-900">Các gói slot có sẵn để mua</h4>
                    <p className="text-sm text-slate-400 mt-1">Chọn gói sản phẩm phù hợp bên dưới để đăng ký mua trực tiếp tại Cổng đặt lịch.</p>
                  </div>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
                      <div className="text-sm text-slate-400">Đang tải các gói slot...</div>
                    </div>
                  ) : packages.length === 0 ? (
                    <div className="text-center text-slate-400 py-16 bg-white border border-slate-200 rounded-3xl">
                      Chưa có gói slot công khai nào được phát hành.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
                      {packages.map((pkg, i) => {
                        const originalPrice = pkg.originalPrice || (pkg.price * (1 + (pkg.discountPercent || 0)/100));
                        return (
                          <motion.div
                            key={pkg._id || pkg.id || i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: i * 0.1 }}
                            className={`relative rounded-3xl p-8 transition-all duration-300 ${
                              pkg.popular || i === 1
                                ? 'bg-gradient-to-b from-emerald-600 to-teal-700 text-white shadow-xl scale-105 md:scale-105 z-10'
                                : 'bg-white border border-slate-200 text-slate-800 hover:shadow-lg hover:-translate-y-1'
                            }`}
                          >
                            {(pkg.popular || i === 1) && (
                              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-950 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider shadow-md">
                                Phổ biến nhất
                              </div>
                            )}
                            <div className="space-y-6">
                              <div>
                                <h3 className={`text-xl font-bold tracking-tight ${pkg.popular || i === 1 ? 'text-white' : 'text-slate-900'}`}>
                                  {pkg.name}
                                </h3>
                                <p className={`text-xs mt-1.5 leading-relaxed ${pkg.popular || i === 1 ? 'text-emerald-100/80' : 'text-slate-400'}`}>
                                  {pkg.description || 'Gói lượt rửa xe tiết kiệm.'}
                                </p>
                              </div>

                              <div className="flex items-baseline gap-2 pt-2 border-t border-slate-100/10">
                                <span className={`text-3xl font-black tracking-tight ${pkg.popular || i === 1 ? 'text-white' : 'text-slate-900'}`}>
                                  {formatPrice(pkg.price)}
                                </span>
                                {originalPrice > pkg.price && (
                                  <span className={`text-sm line-through ${pkg.popular || i === 1 ? 'text-emerald-200/60' : 'text-slate-300'}`}>
                                    {formatPrice(originalPrice)}
                                  </span>
                                )}
                              </div>
                              <p className={`text-[11px] font-medium -mt-4 ${pkg.popular || i === 1 ? 'text-emerald-100/80' : 'text-slate-400'}`}>
                                * Giá đã bao gồm VAT {vatRate}%
                              </p>

                              {pkg.slots && (
                                <div className={`text-sm font-bold flex items-center gap-2 ${pkg.popular || i === 1 ? 'text-amber-300' : 'text-emerald-600'}`}>
                                  <span>🎫</span> {pkg.slots} lượt rửa xe chất lượng cao
                                </div>
                              )}

                              <ul className="space-y-3 pt-2">
                                {pkg.features?.map((f, idx) => (
                                  <li key={idx} className="flex items-start gap-2.5 text-xs">
                                    <svg className={`w-4 h-4 mt-0.5 shrink-0 ${pkg.popular || i === 1 ? 'text-emerald-200' : 'text-emerald-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span className={pkg.popular || i === 1 ? 'text-emerald-50/90' : 'text-slate-500'}>
                                      {f}
                                    </span>
                                  </li>
                                ))}
                                {!pkg.features && (
                                  <>
                                    <li className="flex items-start gap-2.5 text-xs">
                                      <svg className={`w-4 h-4 mt-0.5 shrink-0 ${pkg.popular || i === 1 ? 'text-emerald-200' : 'text-emerald-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span className={pkg.popular || i === 1 ? 'text-emerald-50/90' : 'text-slate-500'}>Không cần đặt cọc {depositPercent}%</span>
                                    </li>
                                    <li className="flex items-start gap-2.5 text-xs">
                                      <svg className={`w-4 h-4 mt-0.5 shrink-0 ${pkg.popular || i === 1 ? 'text-emerald-200' : 'text-emerald-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span className={pkg.popular || i === 1 ? 'text-emerald-50/90' : 'text-slate-500'}>Ưu tiên đặt chỗ nhanh</span>
                                    </li>
                                  </>
                                )}
                              </ul>

                              <button
                                onClick={() => navigate('/booking?tab=slot_pack')}
                                className={`w-full py-3.5 rounded-xl text-xs font-bold transition-all duration-300 ${
                                  pkg.popular || i === 1
                                    ? 'bg-white text-emerald-800 hover:bg-emerald-50 shadow-md'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm'
                                }`}
                              >
                                Mua gói tại cổng đặt lịch
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
