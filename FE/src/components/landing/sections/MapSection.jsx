import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Clock, Phone, Envelope, ArrowRight, CaretLeft, Buildings, Tag, MagnifyingGlass } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl } from '@/lib/authStorage';

const API_BASE = getApiBaseUrl() || 'http://localhost:5000/api';

function getCities(branches) {
  const set = new Set(branches.map(b => b.city).filter(Boolean));
  return ['all', ...Array.from(set)];
}

function parseSvgPaths(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const paths = doc.querySelectorAll('path');
  return Array.from(paths).map(p => ({
    id: p.getAttribute('id') || '',
    name: p.getAttribute('name') || '',
    d: p.getAttribute('d') || '',
  }));
}

function fmtCurrency(n) {
  return new Intl.NumberFormat('vi-VN').format(n ?? 0) + 'đ';
}

export default function MapSection({ onSelectBranch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeCity, setActiveCity] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [provincePaths, setProvincePaths] = useState([]);
  const [hoveredProvince, setHoveredProvince] = useState(null);
  const [branches, setBranches] = useState([]);
  const [cities, setCities] = useState(['all']);

  // Detail view state
  const [detailBranch, setDetailBranch] = useState(null);
  const [packages, setPackages] = useState([]);
  const [loadingPkgs, setLoadingPkgs] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);

  useEffect(() => {
    fetch('/assets/vietnam.svg')
      .then(r => r.text())
      .then(text => {
        const paths = parseSvgPaths(text);
        setProvincePaths(paths);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/branches/public`)
      .then(r => r.json())
      .then(res => {
        const list = (res?.data || []).map(b => ({
          id: b._id,
          city: b.city || '',
          name: b.name.replace(/^AutoWash\s*/, ''),
          fullName: b.name,
          address: b.address,
          phone: b.phone || '',
          email: b.email || '',
          hours: (b.openingTime || '07:00') + ' - ' + (b.closingTime || '18:00'),
          cx: b.mapCoordinates?.svgCx || 0,
          cy: b.mapCoordinates?.svgCy || 0,
          image: b.image || '',
          locationCoords: b.location?.coordinates || null,
        }));
        setBranches(list);
        setCities(getCities(list));
      })
      .catch(() => {});
  }, []);

  // Fetch packages when detail branch changes
  useEffect(() => {
    if (!detailBranch) {
      setPackages([]);
      return;
    }
    setLoadingPkgs(true);
    fetch(`${API_BASE}/packages?branchId=${detailBranch.id}`)
      .then(r => r.json())
      .then(res => {
        const data = res?.data ?? res;
        setPackages(Array.isArray(data) ? data : Array.isArray(data?.packages) ? data.packages : []);
      })
      .catch(() => setPackages([]))
      .finally(() => setLoadingPkgs(false));
  }, [detailBranch]);

  const filtered = activeCity === 'all' ? branches : branches.filter((b) => b.city === activeCity);
  const selected = branches.find((b) => b.id === selectedId);

  const openDetail = (branch) => {
    setDetailBranch(branch);
    setSelectedId(branch.id);
  };

  const closeDetail = () => {
    setDetailBranch(null);
  };

  return (
    <section id="map" className="relative py-24 md:py-32 bg-neutral-950 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.03),transparent_60%)]" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ══════════ LEFT PANEL ══════════ */}
          <div className="lg:col-span-2">
            <div className="max-w-xl mb-8">
              <span className="text-emerald-400 text-sm font-medium tracking-widest uppercase mb-4 block">
                {t('landing.map.branch_system')}
              </span>
              <h2 className="text-3xl md:text-5xl tracking-tighter leading-none text-white">
                {t('landing.map.find_nearby')}
              </h2>
              <p className="text-neutral-400 mt-4 leading-relaxed">
                {t('landing.map.description', { count: branches.length })}
              </p>
            </div>

            {/* City filters */}
            <div className="flex flex-wrap gap-2 mb-6">
              {cities.map((c) => (
                <button
                  key={c}
                  onClick={() => { setActiveCity(c); setSelectedId(null); setDetailBranch(null); }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeCity === c
                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Branch list */}
            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-2 custom-scrollbar">
              {filtered.map((b) => (
                <div
                  key={b.id}
                  onClick={() => openDetail(b)}
                  className={`group w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                    detailBranch?.id === b.id
                      ? 'border-emerald-500/50 bg-emerald-500/10 shadow-sm shadow-emerald-500/5'
                      : selectedId === b.id
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900/80'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-neutral-700/50 bg-neutral-800 group-hover:border-neutral-600 transition-colors">
                      {b.image ? (
                        <img src={b.image} alt={b.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Buildings size={24} weight="duotone" className="text-neutral-600" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-neutral-200 text-sm truncate">{b.name}</span>
                        <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0 border border-emerald-500/20">{b.city}</span>
                      </div>
                      <p className="text-xs text-neutral-500 line-clamp-1">{b.address}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-neutral-500">
                        <span className="flex items-center gap-1"><Clock size={11} /> {b.hours}</span>
                        {b.phone && <span className="flex items-center gap-1"><Phone size={11} /> {b.phone}</span>}
                      </div>
                      <div className="mt-2 text-[11px] font-medium text-emerald-400 group-hover:text-emerald-300 transition-colors">
                        {t('landing.map.view_details')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ══════════ RIGHT PANEL ══════════ */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {detailBranch ? (
                /* ── Detail Panel ── */
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="h-full rounded-2xl border border-neutral-800 bg-neutral-900/70 backdrop-blur-sm overflow-hidden"
                >
                  <div className="max-h-[680px] overflow-y-auto custom-scrollbar">
                    {/* Back button */}
                    <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800 px-5 py-3">
                      <button
                        onClick={closeDetail}
                        className="flex items-center gap-2 text-sm text-neutral-400 hover:text-emerald-400 transition-colors font-medium"
                      >
                        <CaretLeft size={16} weight="bold" />
                        {t('landing.map.back_to_map')}
                      </button>
                    </div>

                    {/* Hero image */}
                    {detailBranch.image && (
                      <div
                        className="relative mx-5 mt-5 rounded-xl overflow-hidden cursor-pointer group h-[220px]"
                        onClick={() => setZoomImage(detailBranch.image)}
                      >
                        <img
                          src={detailBranch.image}
                          alt={detailBranch.fullName}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur-sm text-neutral-800 text-xs font-semibold px-4 py-2 rounded-full shadow-lg">
                            {t('landing.map.click_zoom')}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Branch name + badge */}
                    <div className="px-5 pt-5 pb-3">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-xl font-bold text-white">{detailBranch.fullName}</h3>
                        <span className="text-[11px] text-emerald-400 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                          {detailBranch.city}
                        </span>
                      </div>
                    </div>

                    {/* Info grid */}
                    <div className="px-5 pb-4 grid grid-cols-2 gap-3">
                      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-neutral-800/50 border border-neutral-700/40">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                          <MapPin size={16} weight="fill" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">{t('landing.map.address')}</p>
                          <p className="text-xs text-neutral-300 mt-0.5 leading-relaxed">{detailBranch.address}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-neutral-800/50 border border-neutral-700/40">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                          <Clock size={16} weight="fill" />
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">{t('landing.map.hours')}</p>
                          <p className="text-xs text-neutral-300 mt-0.5">{detailBranch.hours}</p>
                        </div>
                      </div>

                      {detailBranch.phone && (
                        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-neutral-800/50 border border-neutral-700/40">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                            <Phone size={16} weight="fill" />
                          </div>
                          <div>
                            <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">{t('landing.map.phone')}</p>
                            <p className="text-xs text-neutral-300 mt-0.5">{detailBranch.phone}</p>
                          </div>
                        </div>
                      )}

                      {detailBranch.email && (
                        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-neutral-800/50 border border-neutral-700/40">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                            <Envelope size={16} weight="fill" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">{t('landing.map.email')}</p>
                            <p className="text-xs text-neutral-300 mt-0.5 truncate">{detailBranch.email}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Service packages */}
                    <div className="px-5 pb-4">
                      <h4 className="text-sm font-bold text-neutral-200 mb-3 flex items-center gap-2">
                        <Tag size={14} weight="duotone" className="text-emerald-400" />
                        {t('landing.map.services')}
                      </h4>
                      {loadingPkgs ? (
                        <div className="flex items-center justify-center py-6">
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-emerald-500 border-t-transparent" />
                        </div>
                      ) : packages.length === 0 ? (
                        <p className="text-xs text-neutral-500 py-4 text-center bg-neutral-800/30 rounded-xl border border-neutral-800/50">{t('landing.map.no_packages')}</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                          {packages.slice(0, 6).map(pkg => (
                            <div key={pkg._id} className="p-3 rounded-xl bg-neutral-800/40 border border-neutral-700/30 hover:border-neutral-600/50 transition-colors">
                              <h5 className="text-xs font-semibold text-neutral-200 mb-1 truncate">{pkg.name}</h5>
                              {pkg.description && <p className="text-[10px] text-neutral-500 line-clamp-1 mb-2">{pkg.description}</p>}
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-emerald-400">{fmtCurrency(pkg.price)}</span>
                                {pkg.duration && <span className="text-[10px] text-neutral-500">{t('landing.map.duration_min', { count: pkg.duration })}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {packages.length > 6 && (
                        <p className="text-[11px] text-emerald-400 mt-2 text-center">
                          {t('landing.map.more_packages', { count: packages.length - 6 })}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="px-5 pb-5 flex gap-3">
                      <button
                        onClick={() => navigate(`/booking?branchId=${detailBranch.id}`)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors shadow-sm shadow-emerald-600/20"
                      >
                        {t('landing.map.book_here')}
                        <ArrowRight size={16} weight="bold" />
                      </button>
                      <button
                        onClick={() => navigate(`/branch/${detailBranch.id}`)}
                        className="py-3 px-5 rounded-xl border border-neutral-700 text-neutral-300 text-sm font-medium hover:bg-neutral-800 transition-colors"
                      >
                        {t('landing.map.detail_page')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* ── SVG Vietnam Map ── */
                <motion.div
                  key="map"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="relative h-full rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden backdrop-blur-sm"
                  style={{
                    boxShadow: 'inset 0 0 80px rgba(16,185,129,0.04), 0 0 60px rgba(16,185,129,0.02)',
                  }}
                >
                  <svg viewBox="0 0 812 872" className="w-full h-full" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur1" />
                        <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur2" />
                        <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur3" />
                        <feMerge>
                          <feMergeNode in="blur3" />
                          <feMergeNode in="blur2" />
                          <feMergeNode in="blur1" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <filter id="neon-glow-intense" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur1" />
                        <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur2" />
                        <feGaussianBlur in="SourceGraphic" stdDeviation="25" result="blur3" />
                        <feMerge>
                          <feMergeNode in="blur3" />
                          <feMergeNode in="blur2" />
                          <feMergeNode in="blur1" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <filter id="marker-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <radialGradient id="bg-glow" cx="50%" cy="50%" r="60%">
                        <stop offset="0%" stopColor="rgba(16,185,129,0.06)" />
                        <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                      </radialGradient>
                    </defs>

                    <rect width="812" height="872" fill="url(#bg-glow)" />

                    {provincePaths.map((p) => (
                      <path
                        key={p.id}
                        d={p.d}
                        fill={hoveredProvince === p.id ? 'rgba(16,185,129,0.08)' : 'transparent'}
                        stroke={hoveredProvince === p.id ? '#34d399' : 'rgba(16,185,129,0.25)'}
                        strokeWidth={hoveredProvince === p.id ? '1.2' : '0.5'}
                        filter={hoveredProvince === p.id ? 'url(#neon-glow)' : undefined}
                        onMouseEnter={() => setHoveredProvince(p.id)}
                        onMouseLeave={() => setHoveredProvince(null)}
                        style={{ transition: 'all 0.2s ease', cursor: 'default' }}
                      />
                    ))}

                    {branches.map((b) => (
                      <g key={b.id} onClick={() => { setSelectedId(b.id); openDetail(b); }} className="cursor-pointer">
                        <circle
                          cx={b.cx}
                          cy={b.cy}
                          r={selectedId === b.id ? 14 : 10}
                          fill="transparent"
                          stroke={selectedId === b.id ? '#10b981' : 'transparent'}
                          strokeWidth="2"
                          filter={selectedId === b.id ? 'url(#marker-glow)' : undefined}
                        />
                        <circle
                          cx={b.cx}
                          cy={b.cy}
                          r={selectedId === b.id ? 6 : 4}
                          fill={selectedId === b.id ? '#10b981' : '#34d399'}
                          stroke="#059669"
                          strokeWidth="1.5"
                          filter="url(#marker-glow)"
                        />
                        <circle
                          cx={b.cx}
                          cy={b.cy}
                          r={selectedId === b.id ? 8 : 6}
                          fill="rgba(16,185,129,0.15)"
                          stroke="none"
                        />
                        {selectedId === b.id && (
                          <>
                            <circle
                              cx={b.cx}
                              cy={b.cy}
                              r="18"
                              fill="none"
                              stroke="rgba(16,185,129,0.3)"
                              strokeWidth="1"
                            >
                              <animate attributeName="r" values="14;22;14" dur="2s" repeatCount="indefinite" />
                              <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                            </circle>
                          </>
                        )}
                        <text
                          x={b.cx}
                          y={b.cy - (selectedId === b.id ? 14 : 10)}
                          textAnchor="middle"
                          className="text-[5px]"
                          fill={selectedId === b.id ? '#10b981' : '#6ee7b7'}
                          fontWeight={selectedId === b.id ? 'bold' : 'normal'}
                          filter={selectedId === b.id ? 'url(#marker-glow)' : undefined}
                        >
                          {b.name}
                        </text>
                      </g>
                    ))}
                  </svg>

                  {/* Selected branch popup on map */}
                  {selected && !detailBranch && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-4 left-4 right-4 p-5 rounded-2xl bg-neutral-900/95 border border-neutral-800 shadow-lg backdrop-blur-xl"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3">
                          {selected.image && (
                            <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-neutral-700/50">
                              <img src={selected.image} alt={selected.name} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div>
                            <h4 className="font-semibold text-neutral-200">{selected.name}</h4>
                            <p className="text-xs text-neutral-500 mt-0.5">{selected.address}</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full">{selected.city}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 mb-4">
                        <span>🕐 {selected.hours}</span>
                        {selected.phone && <span>📞 {selected.phone}</span>}
                        {selected.email && <span>✉️ {selected.email}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openDetail(selected)}
                          className="flex-1 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 text-sm font-medium hover:bg-neutral-800 transition-colors"
                        >
                          {t('landing.map.details')}
                        </button>
                        <button
                          onClick={() => navigate(`/booking?branchId=${selected.id}`)}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors"
                        >
                          {t('landing.map.book_here')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ══════════ LIGHTBOX MODAL ══════════ */}
      <AnimatePresence>
        {zoomImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
            onClick={() => setZoomImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative flex flex-col max-w-4xl max-h-[90vh] w-full overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl border border-neutral-700/80"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setZoomImage(null)}
                className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 hover:scale-110 transition-all border border-white/20 shadow-lg"
                title={t('landing.map.close')}
              >
                <X size={20} weight="bold" />
              </button>

              <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden p-3 bg-black/40">
                <img
                  src={zoomImage}
                  alt={detailBranch?.fullName || t('landing.map.branch_fallback')}
                  className="max-h-[68vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
                />
              </div>

              <div className="shrink-0 py-4 px-6 text-center bg-neutral-900 border-t border-neutral-800">
                <p className="text-base font-bold text-white leading-snug">{detailBranch?.fullName}</p>
                {detailBranch?.address && (
                  <p className="text-xs text-neutral-400 mt-1 leading-snug">{detailBranch.address}</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
