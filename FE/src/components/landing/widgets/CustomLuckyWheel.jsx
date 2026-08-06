import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const PALETTE = [
  { bg1: '#10b981', bg2: '#059669', text: '#ffffff', icon: '🎁' },
  { bg1: '#f59e0b', bg2: '#d97706', text: '#ffffff', icon: '⚡' },
  { bg1: '#6366f1', bg2: '#4f46e5', text: '#ffffff', icon: '🏷️' },
  { bg1: '#f43f5e', bg2: '#e11d48', text: '#ffffff', icon: '✨' },
  { bg1: '#06b6d4', bg2: '#0284c7', text: '#ffffff', icon: '🚗' },
  { bg1: '#8b5cf6', bg2: '#7c3aed', text: '#ffffff', icon: '🍀' },
];

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(x, y, radius, startAngle, endAngle) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M', x, y,
    'L', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    'Z'
  ].join(' ');
}

const CustomLuckyWheel = forwardRef(({ sectors = [], onSpinEnd, onSpinStart, onCenterClick, isSpinning: isSpinningProp }, ref) => {
  const { t } = useTranslation();
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [ledOffset, setLedOffset] = useState(0);
  const transitionRef = useRef(null);

  useEffect(() => {
    const speed = isSpinning ? 30 : 100;
    const interval = setInterval(() => {
      setLedOffset(prev => (prev + 1) % 16);
    }, speed);
    return () => clearInterval(interval);
  }, [isSpinning]);

  const numSectors = Math.max(sectors.length, 1);
  const sliceAngle = 360 / numSectors;

  useImperativeHandle(ref, () => ({
    spin: (targetIdOrIdx) => {
      if (isSpinning) return;
      setIsSpinning(true);
      if (onSpinStart) onSpinStart();

      let targetIndex = 0;
      if (typeof targetIdOrIdx === 'number' && targetIdOrIdx >= 0 && targetIdOrIdx < sectors.length) {
        targetIndex = targetIdOrIdx;
      } else if (targetIdOrIdx !== undefined) {
        const found = sectors.findIndex(s => String(s.id) === String(targetIdOrIdx) || String(s._id) === String(targetIdOrIdx));
        if (found !== -1) targetIndex = found;
      }

      // Pointer is fixed at top (0° / 360°)
      // Sector i spans from (i * sliceAngle) to ((i + 1) * sliceAngle)
      // Mid angle of sector i: i * sliceAngle + sliceAngle / 2
      const sectorMidAngle = targetIndex * sliceAngle + sliceAngle / 2;

      // To align sectorMidAngle to top (0°):
      // Desired final wheel angle mod 360 = (360 - sectorMidAngle)
      const currentMod = rotation % 360;
      const neededExtra = (360 - sectorMidAngle - currentMod + 360) % 360;
      const fullRotations = 360 * 5; // 5 full turns for momentum
      const nextRotation = rotation + fullRotations + neededExtra;

      setRotation(nextRotation);

      if (transitionRef.current) clearTimeout(transitionRef.current);
      transitionRef.current = setTimeout(() => {
        setIsSpinning(false);
        if (onSpinEnd) onSpinEnd(sectors[targetIndex] || sectors[0]);
      }, 5000); // 5s transition
    }
  }));

  const size = 420;
  const center = size / 2;
  const radius = size / 2 - 25;

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: size, height: size }}>
      {/* ── Outer Golden Border with LED Lights ── */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-500 p-3 shadow-2xl shadow-amber-500/30 border-4 border-amber-300 flex items-center justify-center">
        {/* Animated Chasing LED Bulbs */}
        {Array.from({ length: 16 }).map((_, idx) => {
          const angle = (idx * 360) / 16;
          const pos = polarToCartesian(center, center, radius + 14, angle);

          // Calculate distance to dual chasing light heads (head 1 at ledOffset, head 2 at ledOffset+8)
          const head1 = ledOffset % 16;
          const head2 = (ledOffset + 8) % 16;
          const dist1 = (idx - head1 + 16) % 16;
          const dist2 = (idx - head2 + 16) % 16;
          const minDist = Math.min(dist1, dist2);

          let ledStyle = 'bg-amber-900/50 border-amber-400/40 scale-90 opacity-60';
          if (minDist === 0) {
            ledStyle = 'bg-white border-2 border-amber-200 shadow-[0_0_12px_#fde047,_0_0_20px_#f59e0b] scale-125 z-10';
          } else if (minDist === 1) {
            ledStyle = 'bg-yellow-300 border border-amber-200 shadow-[0_0_8px_#f59e0b] scale-110';
          } else if (minDist === 2) {
            ledStyle = 'bg-amber-400 border border-amber-300 shadow-[0_0_4px_#d97706] scale-100';
          }

          return (
            <div
              key={idx}
              className={`absolute w-3.5 h-3.5 rounded-full transition-all duration-100 ${ledStyle}`}
              style={{
                left: `${(pos.x / size) * 100}%`,
                top: `${(pos.y / size) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          );
        })}

        {/* ── Spinning Canvas SVG Wheel ── */}
        <div
          className="w-full h-full rounded-full overflow-hidden shadow-inner"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: isSpinning ? 'transform 5s cubic-bezier(0.15, 0.85, 0.25, 1)' : 'none',
          }}
        >
          <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
            <defs>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.6" />
              </filter>
              {sectors.map((s, idx) => {
                const palette = PALETTE[idx % PALETTE.length];
                return (
                  <radialGradient key={idx} id={`grad-${idx}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={palette.bg1} />
                    <stop offset="100%" stopColor={palette.bg2} />
                  </radialGradient>
                );
              })}
            </defs>

            {sectors.map((sector, idx) => {
              const startAngle = idx * sliceAngle;
              const endAngle = (idx + 1) * sliceAngle;
              const midAngle = startAngle + sliceAngle / 2;
              const textPos = polarToCartesian(center, center, radius * 0.65, midAngle);
              const palette = PALETTE[idx % PALETTE.length];

              // Clean text label for display
              const rawText = sector.label || sector.name || t('landing.booking.wheel_fallback');
              const cleanText = rawText.toUpperCase();

              return (
                <g key={sector.id || idx}>
                  {/* Slice Segment */}
                  <path
                    d={describeArc(center, center, radius, startAngle, endAngle)}
                    fill={`url(#grad-${idx})`}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />

                  {/* Rotated High-Contrast Crisp Label */}
                  <g
                    transform={`translate(${textPos.x}, ${textPos.y}) rotate(${midAngle})`}
                    className="pointer-events-none"
                  >
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={palette.text}
                      fontSize={numSectors > 8 ? "11" : "13"}
                      fontWeight="900"
                      fontFamily="system-ui, -apple-system, sans-serif"
                      letterSpacing="0.5px"
                      filter="url(#shadow)"
                    >
                      {cleanText.length > 16 ? `${cleanText.slice(0, 14)}...` : cleanText}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {/* ── Center Metallic Hub Button ── */}
        <button
          type="button"
          onClick={onCenterClick}
          className="absolute z-20 w-16 h-16 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border-4 border-white shadow-2xl flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-amber-300 flex items-center justify-center shadow-inner pointer-events-none">
            <span className="text-amber-400 font-black text-xs tracking-wider uppercase">QUAY</span>
          </div>
        </button>
      </div>

      {/* ── Fixed Top Pointer Arrow ── */}
      <div className="absolute top-[-10px] left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center">
        <div className="w-8 h-10 bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 clip-triangle shadow-2xl border-x-2 border-white filter drop-shadow-lg"
          style={{ clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}
        />
        <div className="w-3 h-3 rounded-full bg-amber-300 -mt-8 border border-amber-600 shadow-sm" />
      </div>
    </div>
  );
});

CustomLuckyWheel.displayName = 'CustomLuckyWheel';
export default CustomLuckyWheel;
