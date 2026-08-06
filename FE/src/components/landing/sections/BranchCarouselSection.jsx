import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Autoplay, FreeMode } from 'swiper/modules';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/free-mode';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function MapSection({ onSelectBranch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [branches, setBranches] = useState([]);
  const [isBeginning, setIsBeginning] = useState(true);
  const [isEnd, setIsEnd] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const swiperRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/branches/public`)
      .then((r) => r.json())
      .then((res) => {
        const list = (res?.data || []).map((b) => ({
          id: b._id,
          city: b.city || '',
          name: b.name.replace(/^AutoWash\s*/, ''),
          address: b.address,
          phone: b.phone || '',
          email: b.email || '',
          hours: (b.openingTime || '07:00') + ' - ' + (b.closingTime || '18:00'),
          image: b.image || 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?q=80&w=800&auto=format&fit=crop',
        }));
        setBranches(list);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="bg-white py-16 md:py-24">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
        
        {/* Header section */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12">
          <h2 className="text-3xl md:text-[2.5rem] font-bold text-black tracking-tight mb-6 md:mb-0">
            {t('landing.map.branch_system')}
          </h2>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            {/* Progress line */}
            <div className="hidden md:block w-48 h-[1px] bg-gray-200 relative">
              <div 
                className="absolute top-0 left-0 h-full bg-black transition-all duration-300" 
                style={{ 
                  width: branches.length > 0 
                    ? `${((activeIndex + 1) / branches.length) * 100}%` 
                    : '20%' 
                }} 
              />
            </div>
            
            {/* Navigation buttons */}
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => swiperRef.current?.slidePrev()}
                className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-black hover:text-black transition-colors cursor-pointer"
              >
                <ArrowLeft size={18} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => swiperRef.current?.slideNext()}
                className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-black hover:text-black transition-colors cursor-pointer"
              >
                <ArrowRight size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Carousel with key to re-init when branches load */}
        {branches.length > 0 && (
          <Swiper
            key={branches.length}
            modules={[Navigation, Autoplay, FreeMode]}
            spaceBetween={24}
            slidesPerView={1.2}
            speed={5000}
            loop={true}
            freeMode={true}
            autoplay={{
              delay: 0,
              disableOnInteraction: false,
              pauseOnMouseEnter: true,
            }}
            breakpoints={{
              640: { slidesPerView: 2.2 },
              1024: { slidesPerView: 3.2 },
              1280: { slidesPerView: 4.2 },
            }}
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
            }}
            onSlideChange={(swiper) => {
              setIsBeginning(swiper.isBeginning);
              setIsEnd(swiper.isEnd);
              setActiveIndex(swiper.realIndex ?? swiper.activeIndex);
            }}
            className="!pb-12 [&_.swiper-wrapper]:!ease-linear"
          >
            {branches.map((b) => (
              <SwiperSlide key={b.id}>
                <div className="group flex flex-col h-full cursor-pointer" onClick={() => navigate(`/branch/${b.id}`)}>
                  {/* Image Card */}
                  <div className="bg-[#f4f4f4] rounded-3xl overflow-hidden aspect-[4/5] md:aspect-square relative flex items-center justify-center transition-transform duration-500 group-hover:-translate-y-2 group-hover:shadow-xl">
                    <img 
                      src={b.image} 
                      alt={b.name}
                      className="w-full h-full object-cover mix-blend-multiply opacity-90 group-hover:scale-105 transition-transform duration-700 ease-out"
                    />
                    {/* Small overlay badge for city */}
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold text-gray-800">
                      {b.city}
                    </div>
                  </div>
                  
                  {/* Text below */}
                  <div className="mt-6 flex flex-col">
                    <h3 className="text-xl font-bold text-gray-900 group-hover:text-black transition-colors">{b.name}</h3>
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2 leading-relaxed">{b.address}</p>
                  </div>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        )}

        {/* Bottom progress bar for mobile */}
        <div className="md:hidden w-full h-[1px] bg-gray-200 relative mt-4">
          <div 
            className="absolute top-0 left-0 h-full bg-black transition-all duration-300" 
            style={{ 
              width: branches.length > 0 
                ? `${((activeIndex + 1) / branches.length) * 100}%` 
                : '20%' 
            }} 
          />
        </div>

      </div>
    </div>
  );
}
