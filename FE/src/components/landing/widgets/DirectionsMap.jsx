import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Compass, MapPin, Clock, Warning } from '@phosphor-icons/react';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

function fmtDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}ph`;
  return `${m} phút`;
}

function fmtDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export default function DirectionsMap({ destLat, destLng, destAddress, destName, onClose }) {
  const { t } = useTranslation();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const routeLayersRef = useRef([]);
  const [userLoc, setUserLoc] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current, {
      center: [destLat, destLng],
      zoom: 14,
      zoomControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(mapInstance.current);
    L.control.zoom({ position: 'topright' }).addTo(mapInstance.current);

    const destIcon = L.divIcon({
      className: '',
      html: `<div style="background:#059669;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)"><svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/></svg></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
    L.marker([destLat, destLng], { icon: destIcon }).addTo(mapInstance.current)
      .bindPopup(`<b>${destName || ''}</b><br/>${destAddress || ''}`)
      .openPopup();

    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [destLat, destLng, destName, destAddress]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError(t('landing.directions.no_geolocation'));
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { setError(t('landing.directions.location_denied')); setLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (!userLoc || !mapInstance.current) return;
    setLoading(true);
    setError('');

    routeLayersRef.current.forEach((l) => { try { mapInstance.current.removeLayer(l); } catch {} });
    routeLayersRef.current = [];

    const userIcon = L.divIcon({
      className: '',
      html: `<div style="background:#2563eb;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    const marker = L.marker([userLoc.lat, userLoc.lng], { icon: userIcon }).addTo(mapInstance.current)
      .bindPopup(t('landing.directions.your_location'));
    routeLayersRef.current.push(marker);

    fetch(`${OSRM_BASE}/${userLoc.lng},${userLoc.lat};${destLng},${destLat}?overview=full&geometries=polyline&steps=true`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.routes || data.routes.length === 0) throw new Error(t('landing.directions.no_route'));
        const r = data.routes[0];
        setRoute({
          distance: r.distance,
          duration: r.duration,
          steps: r.legs[0].steps,
          geometry: r.geometry,
        });

        const coords = decodePolyline(r.geometry);
        const polyline = L.polyline(coords, { color: '#059669', weight: 5, opacity: 0.8 }).addTo(mapInstance.current);
        routeLayersRef.current.push(polyline);

        const bounds = L.latLngBounds(coords);
        mapInstance.current.fitBounds(bounds, { padding: [50, 50] });
        setLoading(false);
      })
      .catch((e) => { setError(e.message || 'Lỗi tải dữ liệu đường đi'); setLoading(false); });
  }, [userLoc, destLat, destLng]);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 bg-emerald-50 border-b border-emerald-100">
        <div className="flex items-center gap-2">
          <Compass size={16} weight="duotone" className="text-emerald-600" />
          <h3 className="text-sm font-bold text-emerald-800">Chỉ đường đến {destName}</h3>
        </div>
        <button onClick={onClose} className="text-emerald-600 hover:text-emerald-800 text-xs font-medium">Đóng</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3">
        <div ref={mapRef} className="lg:col-span-2 h-[400px]" />
        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600 mb-3" />
              <p className="text-sm">{t('landing.directions.loading')}</p>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Warning size={24} className="text-amber-500" weight="duotone" />
              <p className="text-sm text-slate-600">{error}</p>
              <button onClick={() => { setError(''); setLoading(true); navigator.geolocation.getCurrentPosition((p) => setUserLoc({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setError(t('landing.directions.location_denied'))); }}
                className="text-xs text-emerald-600 hover:underline font-medium">{t('landing.directions.retry')}</button>
            </div>
          )}
          {!loading && !error && route && (
            <>
              <div className="flex gap-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-center flex-1">
                  <p className="text-[10px] text-emerald-600 font-medium uppercase">{t('landing.directions.distance')}</p>
                  <p className="text-base font-bold text-emerald-800">{fmtDistance(route.distance)}</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-center flex-1">
                  <p className="text-[10px] text-blue-600 font-medium uppercase">{t('landing.directions.duration')}</p>
                  <p className="text-base font-bold text-blue-800">{fmtDuration(route.duration)}</p>
                </div>
              </div>
              <div className="space-y-0">
                {route.steps.map((step, i) => (
                  <div key={i} className="flex gap-3 py-2 border-b border-slate-100 last:border-0">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold mt-0.5">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 leading-snug">{step.maneuver?.modifier ? t(`landing.directions.${step.maneuver.modifier.replace(' ', '_')}`) + ' ' : ''}{step.name ? t('landing.directions.onto', { name: step.name }) : ''}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-400">{fmtDistance(step.distance)}</span>
                        {step.duration > 60 && <span className="text-[11px] text-slate-400">· {fmtDuration(step.duration)}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}${userLoc ? `&origin=${userLoc.lat},${userLoc.lng}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
              >
                {t('landing.directions.open_google_maps')}
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
