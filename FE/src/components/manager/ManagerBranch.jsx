import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '@/lib/toast';
import {
  Buildings,
  CheckCircle,
  Clock,
  Envelope,
  MapPin,
  PencilSimple,
  Phone,
  ToggleLeft,
  ToggleRight,
  Warning,
  X,
  XCircle,
} from '@phosphor-icons/react';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';
import { Map, MapMarker, MapControls, MarkerContent, MarkerPopup } from '@/components/ui/map';

function api(path, opts = {}) {
  return fetch(`${getApiBaseUrl()}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getStoredToken()}`, ...opts.headers },
  });
}
async function readErr(res, t) {
  try { const j = await res.json(); return j?.message || t('error_prefix', { status: res.status }); } catch { return t('error_prefix', { status: res.status }); }
}
function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
function Toast({ toast, onDismiss }) {
  useEffect(() => { if (!toast) return; const t = setTimeout(onDismiss, 3500); return () => clearTimeout(t); }, [toast, onDismiss]);
  if (!toast) return null;
  const ok = toast.type !== 'error';
  return (
    <div role="alert" className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 bg-white ${ok ? 'text-emerald-700 ring-emerald-200' : 'text-red-600 ring-red-200'}`}>
      {ok ? <CheckCircle size={15} weight="fill" /> : <XCircle size={15} weight="fill" />}
      {toast.message}
      <button onClick={onDismiss} className="ml-1 opacity-50 hover:opacity-100"><X size={13} /></button>
    </div>
  );
}

/* ── edit modal ── */
const inp = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors';

function EditModal({ branch, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    name: branch.name ?? '',
    address: branch.address ?? '',
    phone: branch.phone ?? '',
    email: branch.email ?? '',
    openingTime: branch.openingTime ?? '07:00',
    closingTime: branch.closingTime ?? '18:00',
    image: branch.image ?? '',
    svgCx: branch.mapCoordinates?.svgCx ?? '',
    svgCy: branch.mapCoordinates?.svgCy ?? '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-800">{t('edit_title')}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const { svgCx, svgCy, ...rest } = form;
          onSave({ ...rest, mapCoordinates: { svgCx: Number(svgCx) || 0, svgCy: Number(svgCy) || 0 } });
        }} className="space-y-4 overflow-y-auto max-h-[70vh] px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('field_name')}</label>
              <input className={inp} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('field_phone')}</label>
              <input className={inp} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('field_address')}</label>
            <input className={inp} value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('field_email')}</label>
            <input type="email" className={inp} value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('field_opening')}</label>
              <input type="time" className={inp} value={form.openingTime} onChange={(e) => set('openingTime', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('field_closing')}</label>
              <input type="time" className={inp} value={form.closingTime} onChange={(e) => set('closingTime', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('field_coord_x')}</label>
              <input type="number" className={inp} value={form.svgCx} onChange={(e) => set('svgCx', e.target.value)} placeholder={t('coord_example')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t('field_coord_y')}</label>
              <input type="number" className={inp} value={form.svgCy} onChange={(e) => set('svgCy', e.target.value)} placeholder={t('coord_example')} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t('field_image_url')}</label>
            <input className={inp} value={form.image} onChange={(e) => set('image', e.target.value)} placeholder={t('image_placeholder')} />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">{t('cancel')}</button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
              {saving && <Spinner size={14} />}{saving ? t('saving') : t('save_changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══ Main ═══ */
export default function ManagerBranch({ user }) {
  const { t } = useTranslation('manager');
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [toast, setToast] = useState(null);
  const notify = (msg, type = 'success') => showToast(msg, type);

  useEffect(() => {
    api('/branches')
      .then(async (res) => {
        if (!res.ok) throw new Error(await readErr(res, t));
        const p = await res.json();
        const data = p?.data ?? p;
        setBranches(Array.isArray(data) ? data : []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (form) => {
    setSaving(true);
    try {
      const res = await api(`/branches/${editing._id}`, { method: 'PUT', body: JSON.stringify(form) });
      if (!res.ok) throw new Error(await readErr(res, t));
      const p = await res.json();
      const updated = p?.data ?? p;
      setBranches((prev) => prev.map((b) => b._id === updated._id ? updated : b));
      setEditing(null);
      notify(t('update_success'));
    } catch (err) { notify(err.message || t('update_failed'), 'error'); }
    finally { setSaving(false); }
  };

  const handleToggle = async (branch) => {
    const next = branch.status === 'active' ? 'inactive' : 'active';
    setTogglingId(branch._id);
    try {
      const res = await api(`/branches/${branch._id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      if (!res.ok) throw new Error(await readErr(res, t));
      const p = await res.json();
      const updated = p?.data ?? p;
      setBranches((prev) => prev.map((b) => b._id === updated._id ? updated : b));
      notify(next === 'active' ? t('success_active') : t('success_inactive'));
    } catch (err) { notify(err.message || t('toggle_failed'), 'error'); }
    finally { setTogglingId(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-slate-400"><Spinner size={24} /></div>;
  if (error) return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 py-16 text-red-500">
      <Warning size={26} weight="duotone" /><p className="text-sm">{error}</p>
    </div>
  );

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-slate-500">{t('branch_list_desc')}</p>
      </div>

      {branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 py-20 text-slate-400">
          <Buildings size={48} weight="duotone" className="mb-4 text-slate-300" />
          <p>{t('no_branches_assigned')}</p>
        </div>
      ) : (
        <div className="space-y-16">
          {branches.map((b) => {
            const active = b.status === 'active';
            const toggling = togglingId === b._id;

            return (
              <div key={b._id} className="flex flex-col gap-6">
                {/* ── Top: Title & Status ── */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-500 overflow-hidden shadow-sm shrink-0">
                      {b.image ? (
                        <img src={b.image} alt={b.name} className="h-full w-full object-cover" />
                      ) : (
                        <Buildings size={32} weight="duotone" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        {b.name}
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}`}>
                          <div className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {active ? t('active_status') : t('inactive_status')}
                        </span>
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">{t('branch_detail')}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(b)}
                      disabled={toggling}
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold !text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-sm disabled:opacity-50 transition-colors"
                    >
                      {toggling ? <Spinner size={14} /> : active ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} className="text-slate-400" />}
                      {active ? t('toggle_active') : t('toggle_inactive')}
                    </button>
                    <button
                      onClick={() => setEditing(b)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold !text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      <PencilSimple size={16} /> {t('update_branch')}
                    </button>
                  </div>
                </div>

                {/* ── Middle: Map ── */}
                <div className="h-[400px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm relative z-0">
                  <Map
                    viewport={{ center: b.location?.coordinates || [106.700981, 10.776889], zoom: 15 }}
                    className="h-full w-full"
                  >
                    <MapControls position="bottom-right" showZoom showCompass showLocate />
                    <MapMarker
                      longitude={b.location?.coordinates?.[0] || 106.700981}
                      latitude={b.location?.coordinates?.[1] || 10.776889}
                    >
                      <MarkerContent />
                      <MarkerPopup>
                        <div className="space-y-1 p-1">
                          <h4 className="font-semibold text-slate-800 text-sm">{b.name}</h4>
                          <p className="text-xs text-slate-500">{b.address}</p>
                        </div>
                      </MarkerPopup>
                    </MapMarker>
                  </Map>
                </div>

                {/* ── Bottom: Information Cards ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <MapPin size={20} weight="fill" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('field_address')}</p>
                      <p className="text-sm font-medium text-slate-700 leading-snug">{b.address || t('not_updated')}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <Phone size={20} weight="fill" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('field_phone')}</p>
                      <p className="text-sm font-medium text-slate-700">{b.phone || t('not_updated')}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <Envelope size={20} weight="fill" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('field_email')}</p>
                      <p className="text-sm font-medium text-slate-700 break-all">{b.email || t('not_updated')}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                      <Clock size={20} weight="fill" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('field_hours')}</p>
                      <p className="text-sm font-medium text-slate-700">
                        {b.openingTime && b.closingTime ? `${b.openingTime} – ${b.closingTime}` : t('not_updated')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditModal branch={editing} onSave={handleSave} onClose={() => setEditing(null)} saving={saving} />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
