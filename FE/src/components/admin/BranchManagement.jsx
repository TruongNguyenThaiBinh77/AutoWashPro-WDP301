import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { showToast } from '@/lib/toast';
import {
  ArrowClockwise,
  Buildings,
  CaretLeft,
  CheckCircle,
  Clock,
  Envelope,
  MagnifyingGlass,
  MagnifyingGlassPlus,
  MapPin,
  PencilSimple,
  Phone,
  Plus,
  Trash,
  Warning,
  X,
  XCircle,
  Package,
  ClockCountdown,
  Car,
  Money,
  ListChecks,
  Tag,
} from '@phosphor-icons/react';
import { getApiBaseUrl, getStoredToken } from '@/lib/authStorage';

/* ─────────────────────────── API helper ─────────────────────────── */
async function apiFetch(path, options = {}) {
  const base = getApiBaseUrl();
  const token = getStoredToken();
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

async function readError(res, t) {
  try {
    const j = await res.json();
    return j?.message || j?.error || t('admin.branches.error.http', { status: res.status });
  } catch {
    return t('admin.branches.error.http', { status: res.status });
  }
}

/* ─────────────────────────── Spinner ─────────────────────────────── */
function Spinner({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={`animate-spin ${className}`}
      aria-hidden
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

/* ─────────────────────────── Status badge ────────────────────────── */
function StatusBadge({ status }) {
  const { t } = useTranslation();
  const active = status === 'active';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        active
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
      }`}
    >
      {active
        ? <CheckCircle size={11} weight="fill" />
        : <XCircle size={11} weight="fill" />}
      {active ? t('admin.branches.status.active') : t('admin.branches.status.inactive')}
    </span>
  );
}

/* ─────────────────────────── Toast ───────────────────────────────── */
function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const isErr = toast.type === 'error';

  return (
    <div
      role="alert"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
        isErr
          ? 'bg-white text-red-600 ring-red-200'
          : 'bg-white text-emerald-700 ring-emerald-200'
      }`}
    >
      {isErr ? <XCircle size={16} weight="fill" className="shrink-0" /> : <CheckCircle size={16} weight="fill" className="shrink-0" />}
      {toast.message}
      <button onClick={onDismiss} className="ml-1 opacity-50 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

/* ─────────────────────────── Modal wrapper ───────────────────────── */
function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`relative flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>
        {/* body */}
        <div className="max-h-[78vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Branch form ─────────────────────────── */
const EMPTY = {
  name: '',
  address: '',
  phone: '',
  email: '',
  openingTime: '07:00',
  closingTime: '18:00',
  status: 'active',
  image: '',
  managerId: '',
  svgCx: '',
  svgCy: '',
};

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

const inp =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors';

function BranchForm({ initial, onSave, onCancel, saving }) {
  const { t } = useTranslation();
  const initialManagerId =
    typeof initial?.managerId === 'object' && initial?.managerId !== null
      ? initial.managerId._id || initial.managerId.id || ''
      : initial?.managerId ?? '';

  const [form, setForm] = useState(() => ({
    ...EMPTY,
    ...initial,
    managerId: initialManagerId,
    svgCx: initial?.mapCoordinates?.svgCx ?? '',
    svgCy: initial?.mapCoordinates?.svgCy ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [managers, setManagers] = useState([]);
  const [managersLoading, setManagersLoading] = useState(true);

  useEffect(() => {
    async function fetchManagers() {
      try {
        const res = await apiFetch('/auth/users?role=manager&all=true');
        if (!res.ok) return;
        const payload = await res.json();
        const raw = payload?.data ?? payload;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.users) ? raw.users : [];
        setManagers(list);
      } catch (e) {
        console.error('Failed to load managers', e);
      } finally {
        setManagersLoading(false);
      }
    }
    fetchManagers();
  }, []);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = t('admin.branches.form.errors.name');
    if (!form.address.trim()) e.address = t('admin.branches.form.errors.address');
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = t('admin.branches.form.errors.email');
    return e;
  };

  const submit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) return setErrors(errs);
    const { svgCx, svgCy, ...rest } = form;
    onSave({
      ...rest,
      mapCoordinates: { svgCx: Number(svgCx) || 0, svgCy: Number(svgCy) || 0 },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('admin.branches.form.name')} required error={errors.name}>
          <input id="f-name" className={inp} value={form.name}
            onChange={(e) => set('name', e.target.value)} placeholder={t('admin.branches.form.placeholders.name')} />
        </Field>
        <Field label={t('admin.branches.form.phone')} error={errors.phone}>
          <input id="f-phone" className={inp} value={form.phone}
            onChange={(e) => set('phone', e.target.value)} placeholder="028 1234 5678" />
        </Field>
      </div>

      <Field label={t('admin.branches.form.address')} required error={errors.address}>
        <input id="f-addr" className={inp} value={form.address}
          onChange={(e) => set('address', e.target.value)} placeholder={t('admin.branches.form.placeholders.address')} />
      </Field>

      <Field label={t('admin.branches.form.email')} error={errors.email}>
        <input id="f-email" type="email" className={inp} value={form.email}
          onChange={(e) => set('email', e.target.value)} placeholder="chinhanh@autowashpro.com" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t('admin.branches.form.openingTime')} error={errors.openingTime}>
          <input id="f-open" type="time" className={inp} value={form.openingTime}
            onChange={(e) => set('openingTime', e.target.value)} />
        </Field>
        <Field label={t('admin.branches.form.closingTime')} error={errors.closingTime}>
          <input id="f-close" type="time" className={inp} value={form.closingTime}
            onChange={(e) => set('closingTime', e.target.value)} />
        </Field>
      </div>

      <Field label={t('admin.branches.form.imageUrl')} error={errors.image}>
        <input id="f-img" className={inp} value={form.image}
          onChange={(e) => set('image', e.target.value)} placeholder="https://..." />
      </Field>

      <Field label={t('admin.branches.form.status')} error={errors.status}>
        <select id="f-status" className={inp} value={form.status}
          onChange={(e) => set('status', e.target.value)}>
          <option value="active">{t('admin.branches.status.active')}</option>
          <option value="inactive">{t('admin.branches.status.inactiveFull')}</option>
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t('admin.branches.form.svgX')} error={errors.svgCx}>
          <input id="f-svgCx" type="number" className={inp} value={form.svgCx}
            onChange={(e) => set('svgCx', e.target.value)} placeholder={t('admin.branches.form.placeholders.svgX')} />
        </Field>
        <Field label={t('admin.branches.form.svgY')} error={errors.svgCy}>
          <input id="f-svgCy" type="number" className={inp} value={form.svgCy}
            onChange={(e) => set('svgCy', e.target.value)} placeholder={t('admin.branches.form.placeholders.svgY')} />
        </Field>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel} disabled={saving}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          {t('admin.branches.common.cancel')}
        </button>
        <button type="submit" id="branch-submit" disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors">
          {saving && <Spinner size={14} className="text-white" />}
          {saving ? t('admin.branches.common.saving') : t('admin.branches.common.save')}
        </button>
      </div>
    </form>
  );
}

function parseBlockedMessage(msg = '') {
  const match = msg.match(/^(.*?)\((.*?)\)\.(.*)$/s);
  if (match) {
    const header = match[1].trim();
    const itemsRaw = match[2].trim().split(/,\s*/);
    const footer = match[3].trim();

    const items = itemsRaw.map((item) => {
      let icon = '📌';
      if (item.includes('lịch đặt chưa hoàn thành')) icon = '📅';
      else if (item.includes('gói lượt')) icon = '🎫';
      else if (item.includes('đơn đặt lịch') || item.includes('gói của chi nhánh')) icon = '🚗';
      else if (item.includes('voucher') || item.includes('mã ưu đãi')) icon = '🏷️';
      else if (item.includes('khách hàng đặt') || item.includes('sử dụng')) icon = '👥';

      return { icon, text: item };
    });

    return { header, items, footer };
  }
  return { header: msg, items: [], footer: '' };
}

function BlockDeleteModal({ title, message, onClose, onDeactivate, deactivating }) {
  const { t } = useTranslation();
  const { header, items, footer } = useMemo(() => parseBlockedMessage(message), [message]);

  return (
    <Modal title={title || t('admin.branches.modal.cannotDelete')} onClose={onClose}>
      <div className="space-y-4 py-1">
        {/* Header Warning Banner */}
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/70">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 mt-0.5 font-bold shadow-xs">
            <Warning size={20} weight="fill" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="text-sm font-bold text-amber-900">{t('admin.branches.modal.blockedBanner')}</h4>
            <p className="text-xs text-amber-800 leading-relaxed font-medium">{header}</p>
          </div>
        </div>

        {/* Structured Grid Items */}
        {items.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
              {t('admin.branches.modal.blockedListTitle')}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 shadow-2xs hover:bg-amber-50 transition-colors"
                >
                  <span className="text-base shrink-0">{it.icon}</span>
                  <span className="text-xs font-semibold text-slate-800 leading-tight">{it.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer recommendation note */}
        {footer && (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
            <span className="text-amber-500 shrink-0 mt-0.5">💡</span>
            <p className="leading-relaxed">{footer}</p>
          </div>
        )}

        {/* Modal Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {t('admin.branches.common.close')}
          </button>
          {onDeactivate && (
            <button
              type="button"
              onClick={onDeactivate}
              disabled={deactivating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4.5 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors shadow-xs"
            >
              {deactivating ? t('admin.branches.common.processing') : t('admin.branches.modal.deactivate')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── Confirm delete ─────────────────────── */
function ConfirmDelete({ branch, onConfirm, onCancel, deleting }) {
  const { t } = useTranslation();
  return (
    <Modal title={t('admin.branches.confirm.deleteTitle')} onClose={onCancel}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl bg-red-50 p-4 ring-1 ring-red-100">
          <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-red-500" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-red-700">{t('admin.branches.confirm.deleteQuestion', { name: branch.name })}</p>
            <p className="text-xs text-red-600 leading-relaxed">
              {t('admin.branches.confirm.deleteWarning')}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={deleting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            {t('admin.branches.common.cancel')}
          </button>
          <button id="confirm-delete-btn" onClick={onConfirm} disabled={deleting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors">
            {deleting && <Spinner size={14} className="text-white" />}
            {deleting ? t('admin.branches.confirm.deleting') : t('admin.branches.confirm.delete')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── Assign Manager Modal ─────────────────────────── */
function AssignManagerModal({ branch, allBranches = [], onClose, onSave, saving }) {
  const { t } = useTranslation();
  const [managers, setManagers] = useState([]);
  const [branchesList, setBranchesList] = useState(allBranches);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [selectedMgrId, setSelectedMgrId] = useState(() => {
    if (!branch?.managerId) return '';
    return typeof branch.managerId === 'object' ? branch.managerId._id : String(branch.managerId);
  });

  useEffect(() => {
    let mounted = true;
    async function initData() {
      setLoading(true);
      try {
        const [userRes, branchRes] = await Promise.all([
          apiFetch('/auth/users?role=manager&all=true'),
          branchesList.length > 0 ? Promise.resolve(null) : apiFetch('/branches'),
        ]);

        let mgrList = [];
        if (userRes && userRes.ok) {
          const payload = await userRes.json();
          const raw = payload?.data ?? payload;
          mgrList = Array.isArray(raw) ? raw : Array.isArray(raw?.users) ? raw.users : [];
        }

        if (branchRes && branchRes.ok) {
          const payload = await branchRes.json();
          const raw = payload?.data ?? payload;
          if (mounted) setBranchesList(Array.isArray(raw) ? raw : []);
        }

        if (mounted) setManagers(mgrList);
      } catch (err) {
        console.error('Failed to load modal data', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    initData();
    return () => { mounted = false; };
  }, []); // eslint-disable-line

  // Map managerId -> assigned branch
  const managerAssignmentMap = useMemo(() => {
    const map = {};
    branchesList.forEach((b) => {
      if (!b.managerId) return;
      const mId = typeof b.managerId === 'object' ? b.managerId._id : String(b.managerId);
      if (mId) {
        map[mId] = b;
      }
    });
    return map;
  }, [branchesList]);

  const filteredManagers = useMemo(() => {
    if (!search.trim()) return managers;
    const s = search.trim().toLowerCase();
    return managers.filter(
      (m) =>
        (m.name && m.name.toLowerCase().includes(s)) ||
        (m.email && m.email.toLowerCase().includes(s)) ||
        (m.phone && m.phone.includes(s))
    );
  }, [managers, search]);

  const handleSelect = (mId, isDisabled) => {
    setFormError('');
    if (isDisabled) return;
    setSelectedMgrId(mId);
  };

  const isSearchEmptyResult = search.trim() !== '' && filteredManagers.length === 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    // Strict validation 1: Search typed but no results matched
    if (isSearchEmptyResult) {
      setFormError(t('admin.branches.assign.errors.noResult', { keyword: search }));
      return;
    }

    // Strict validation 2: If a manager ID is selected, check if it's currently visible in search or valid
    if (selectedMgrId !== '') {
      const isVisible = filteredManagers.some((m) => String(m._id) === String(selectedMgrId));
      if (search.trim() !== '' && !isVisible) {
        setFormError(t('admin.branches.assign.errors.selectedNotMatch', { keyword: search }));
        return;
      }

      const targetMgr = managers.find((m) => String(m._id) === String(selectedMgrId));
      if (!targetMgr) {
        setFormError(t('admin.branches.assign.errors.invalid'));
        return;
      }
      const assignedBranch = managerAssignmentMap[selectedMgrId];
      if (assignedBranch && String(assignedBranch._id) !== String(branch._id)) {
        setFormError(t('admin.branches.assign.errors.alreadyAssigned', { manager: targetMgr.name, branch: assignedBranch.name }));
        return;
      }
    }

    onSave(selectedMgrId || null);
  };

  return (
    <Modal title={t('admin.branches.assign.title', { name: branch.name })} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error notification */}
        {formError && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-200">
            <Warning size={16} weight="fill" className="shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
            placeholder={t('admin.branches.assign.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFormError('');
            }}
          />
        </div>

        {/* Manager Options List */}
        <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
          {/* Option: Unassign */}          <div
            onClick={() => handleSelect('', false)}
            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
              selectedMgrId === ''
                ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-100'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400 font-bold text-sm">
                🚫
              </div>
              <div>
                <p className="text-xs font-bold text-slate-700">{t('admin.branches.assign.unassigned')}</p>
                <p className="text-[11px] text-slate-400">{t('admin.branches.assign.unassignedHint')}</p>
              </div>
            </div>
            <input
              type="radio"
              name="manager-select"
              checked={selectedMgrId === ''}
              onChange={() => handleSelect('', false)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
              <Spinner size={18} />
              <span className="text-xs">{t('admin.branches.assign.loading')}</span>
            </div>
          ) : filteredManagers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              {t('admin.branches.assign.noManagers', { keyword: search })}
            </div>
          ) : (
            filteredManagers.map((m) => {
              const isSelected = String(selectedMgrId) === String(m._id);
              const assignedBranch = managerAssignmentMap[m._id];
              const isOtherBranch = assignedBranch && String(assignedBranch._id) !== String(branch._id);
              const isCurrentBranch = assignedBranch && String(assignedBranch._id) === String(branch._id);

              return (
                <div
                  key={m._id}
                  onClick={() => handleSelect(m._id, isOtherBranch)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isOtherBranch
                      ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                      : isSelected
                      ? 'border-blue-500 bg-blue-50/90 ring-2 ring-blue-100 cursor-pointer'
                      : 'border-slate-200 bg-white hover:bg-slate-50 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-sm shadow-2xs ${
                        isOtherBranch
                          ? 'bg-slate-200 text-slate-500'
                          : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                      }`}
                    >
                      {m.name ? m.name.charAt(0).toUpperCase() : '👤'}
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold text-slate-800 truncate">{m.name}</p>
                        {isOtherBranch ? (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            📍 {t('admin.branches.assign.managingOther', { branch: assignedBranch.name })}
                          </span>
                        ) : isCurrentBranch ? (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            ✓ {t('admin.branches.assign.managingCurrent')}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            ✨ {t('admin.branches.assign.available')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                        <span>✉️ {m.email}</span>
                        {m.phone && <span>• 📞 {m.phone}</span>}
                      </p>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="manager-select"
                    disabled={isOtherBranch}
                    checked={isSelected}
                    onChange={() => handleSelect(m._id, isOtherBranch)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 shrink-0 ml-2 disabled:opacity-40"
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {t('admin.branches.common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving || isSearchEmptyResult}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
          >
            {saving && <Spinner size={14} className="text-white" />}
            {saving ? t('admin.branches.common.saving') : t('admin.branches.assign.saveChanges')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─────────────────────────── Detail View ─────────────────────────── */
function BranchDetailFull({ branch, onBack, onEdit, onChangeManager }) {
  const { t } = useTranslation();
  const [packages, setPackages] = useState([]);
  const [pkgLoading, setPkgLoading] = useState(true);
  const [pkgSearch, setPkgSearch] = useState('');
  const [pkgModal, setPkgModal] = useState(null);
  const [pkgSaving, setPkgSaving] = useState(false);
  const [pkgSelected, setPkgSelected] = useState(null);
  const [pkgDeleting, setPkgDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [zoomImage, setZoomImage] = useState(null);

  const mgr = typeof branch.managerId === 'object' && branch.managerId !== null ? branch.managerId : null;

  const notify = (msg, type = 'success') => showToast(msg, type);

  const [currentSortOrder, setCurrentSortOrder] = useState(branch?.packageSortOrder || 'price_asc');

  useEffect(() => {
    if (branch?.packageSortOrder) setCurrentSortOrder(branch.packageSortOrder);
  }, [branch?.packageSortOrder]);

  const handleSortOrderChange = async (newSortOrder) => {
    setCurrentSortOrder(newSortOrder);
    try {
      const res = await apiFetch(`/branches/${branch._id || branch.id}`, {
        method: 'PUT',
        body: JSON.stringify({ packageSortOrder: newSortOrder }),
      });
      if (!res.ok) throw new Error(await readError(res, t));

      setPackages((prev) => {
        const list = [...prev];
        if (newSortOrder === 'price_asc') {
          list.sort((a, b) => (a.price || 0) - (b.price || 0));
        } else if (newSortOrder === 'price_desc') {
          list.sort((a, b) => (b.price || 0) - (a.price || 0));
        } else if (newSortOrder === 'booking_count') {
          list.sort((a, b) => (b.bookingCount || 0) - (a.bookingCount || 0));
        }
        return list;
      });

      const label = newSortOrder === 'price_asc' ? t('admin.branches.detail.sort.labelPriceAsc') : newSortOrder === 'price_desc' ? t('admin.branches.detail.sort.labelPriceDesc') : t('admin.branches.detail.sort.labelMostBooked');
      notify(t('admin.branches.detail.notify.sortChanged', { label }));
    } catch (err) {
      notify(err.message || t('admin.branches.detail.notify.sortError'), 'error');
    }
  };

  useEffect(() => {
    let mounted = true;
    async function load() {
      setPkgLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('includeDeleted', 'true');
        params.set('branchId', branch._id);
        if (pkgSearch.trim()) params.set('name', pkgSearch.trim());
        const res = await apiFetch(`/packages?${params}`);
        if (!res.ok) return;
        const payload = await res.json();
        const data = payload?.data ?? payload;
        const list = Array.isArray(data) ? [...data] : [];
        const sortOrder = currentSortOrder || 'price_asc';
        if (sortOrder === 'price_asc') {
          list.sort((a, b) => (a.price || 0) - (b.price || 0));
        } else if (sortOrder === 'price_desc') {
          list.sort((a, b) => (b.price || 0) - (a.price || 0));
        } else if (sortOrder === 'booking_count') {
          list.sort((a, b) => (b.bookingCount || 0) - (a.bookingCount || 0));
        }
        if (mounted) setPackages(list);
      } catch (e) {
        console.error('Failed to load packages', e);
      } finally {
        if (mounted) setPkgLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [pkgSearch, currentSortOrder]);

  const handlePkgUpdate = async (data) => {
    setPkgSaving(true);
    try {
      const res = await apiFetch(`/packages/${pkgSelected._id}`, { method: 'PUT', body: JSON.stringify(data) });
      if (!res.ok) throw new Error(await readError(res, t));
      const payload = await res.json();
      const updated = payload?.data ?? payload;
      setPackages((p) => p.map((b) => (b._id === updated._id ? updated : b)));
      setPkgModal(null);
      setPkgSelected(null);
      notify(t('admin.branches.detail.notify.pkgUpdated'));
    } catch (err) {
      notify(err.message || t('admin.branches.detail.notify.updateFailed'), 'error');
    } finally { setPkgSaving(false); }
  };

  const [pkgDeleteError, setPkgDeleteError] = useState('');

  const handlePkgDelete = async (isHard = false) => {
    setPkgDeleting(true);
    setPkgDeleteError('');
    try {
      const url = isHard ? `/packages/${pkgSelected._id}?hard=true` : `/packages/${pkgSelected._id}`;
      const res = await apiFetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const errMsg = payload.message || payload.error || t('admin.branches.detail.notify.deleteFailed');
        setPkgDeleteError(errMsg);
        return;
      }
      if (isHard) {
        setPackages((p) => p.filter((b) => b._id !== pkgSelected._id));
        notify(t('admin.branches.detail.notify.hardDeleted'));
      } else {
        setPackages((p) => p.map((b) => (b._id === pkgSelected._id ? { ...b, status: 'inactive', isDeleted: true } : b)));
        notify(t('admin.branches.detail.notify.softDeleted'));
      }
      setPkgModal(null);
      setPkgSelected(null);
      setPkgDeleteError('');
    } catch (err) {
      setPkgDeleteError(err.message || t('admin.branches.detail.notify.deleteFailed'));
    } finally { setPkgDeleting(false); }
  };

  const VEHICLE_LABELS = {
    sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup', van: 'Van',
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div role="alert" className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${toast.type === 'error' ? 'bg-white text-red-600 ring-red-200' : 'bg-white text-emerald-700 ring-emerald-200'}`}>
          {toast.type === 'error' ? <XCircle size={15} weight="fill" /> : <CheckCircle size={15} weight="fill" />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-1 opacity-50 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold !text-slate-700 hover:bg-slate-50 border border-slate-200 shadow-sm transition-colors"
        >
          <CaretLeft size={16} weight="bold" />
          {t('admin.branches.detail.backToList')}
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => onEdit(branch)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-semibold !text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <PencilSimple size={16} /> {t('admin.branches.detail.edit')}
          </button>
          <button onClick={() => setPkgModal('create')}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-semibold !text-emerald-700 hover:bg-emerald-100 transition-colors">
            <Plus size={16} weight="bold" /> {t('admin.branches.detail.addPackage')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* ── Top: Title & Status ── */}
        <div className="flex items-center gap-4">
          <div
            onClick={() => branch.image && setZoomImage(branch.image)}
            className={`relative flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 text-blue-500 overflow-hidden shadow-xs shrink-0 transition-all ${
              branch.image ? 'cursor-pointer group ring-2 ring-blue-100 hover:ring-blue-500 hover:shadow-md' : ''
            }`}
            title={branch.image ? t('admin.branches.detail.viewLargeImage') : undefined}
          >
            {branch.image ? (
              <>
                <img src={branch.image} alt={branch.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                  <MagnifyingGlassPlus size={24} weight="bold" />
                </div>
              </>
            ) : (
              <Buildings size={36} weight="duotone" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
              {branch.name}
              <StatusBadge status={branch.status} />
            </h2>
            {branch.image && (
              <button
                onClick={() => setZoomImage(branch.image)}
                className="mt-1 text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <MagnifyingGlassPlus size={13} weight="bold" /> {t('admin.branches.detail.zoomImage')}
              </button>
            )}
          </div>
        </div>

        {/* ── Manager Card Banner ── */}
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-slate-50 p-5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xl shadow-xs shrink-0">
                {mgr?.name ? mgr.name.charAt(0).toUpperCase() : '👤'}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100/90 px-2.5 py-0.5 rounded-md">
                    {t('admin.branches.detail.managerBadge')}
                  </span>
                  {mgr && (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-md">
                      ✓ {t('admin.branches.detail.managerActive')}
                    </span>
                  )}
                </div>
                <h4 className="text-lg font-bold text-slate-800">
                  {mgr ? mgr.name : <span className="text-slate-400 italic">{t('admin.branches.detail.managerUnassigned')}</span>}
                </h4>
                {mgr && (
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-medium pt-0.5">
                    {mgr.email && (
                      <span className="flex items-center gap-1.5">
                        <Envelope size={14} className="text-blue-500" />
                        {mgr.email}
                      </span>
                    )}
                    {mgr.phone && (
                      <span className="flex items-center gap-1.5 font-mono">
                        <Phone size={14} className="text-emerald-500" />
                        {mgr.phone}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => onChangeManager ? onChangeManager() : onEdit(branch)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-blue-200 px-3.5 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors shadow-2xs"
            >
              <PencilSimple size={14} />
              {mgr ? t('admin.branches.detail.changeManager') : t('admin.branches.detail.assignManager')}
            </button>
          </div>
        </div>

        {/* ── Information Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <MapPin size={20} weight="fill" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('admin.branches.detail.address')}</p>
              <p className="text-sm font-medium text-slate-700 leading-snug">{branch.address || t('admin.branches.common.notUpdated')}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Phone size={20} weight="fill" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('admin.branches.detail.phone')}</p>
              <p className="text-sm font-medium text-slate-700">{branch.phone || t('admin.branches.common.notUpdated')}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Envelope size={20} weight="fill" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('admin.branches.detail.email')}</p>
              <p className="text-sm font-medium text-slate-700 break-all">{branch.email || t('admin.branches.common.notUpdated')}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
              <Clock size={20} weight="fill" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('admin.branches.detail.hours')}</p>
              <p className="text-sm font-medium text-slate-700">
                {branch.openingTime && branch.closingTime ? `${branch.openingTime} – ${branch.closingTime}` : t('admin.branches.common.notUpdated')}
              </p>
            </div>
          </div>
        </div>

        {/* ── Packages Section ── */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Package size={16} weight="duotone" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">{t('admin.branches.detail.packagesTitle')}</h3>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs shadow-2xs">
                <span className="text-slate-500 font-medium">{t('admin.branches.detail.sort')}:</span>
                <select
                  value={currentSortOrder}
                  onChange={(e) => handleSortOrderChange(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="price_asc">{t('admin.branches.detail.sort.optionPriceAsc')}</option>
                  <option value="price_desc">{t('admin.branches.detail.sort.optionPriceDesc')}</option>
                  <option value="booking_count">{t('admin.branches.detail.sort.optionMostBooked')}</option>
                </select>
              </div>

              <div className="relative">
                <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={pkgSearch} onChange={(e) => setPkgSearch(e.target.value)}
                  placeholder={t('admin.branches.detail.pkgSearchPlaceholder')}
                  className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
                />
              </div>
            </div>
          </div>

          {pkgLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Spinner size={22} />
            </div>
          ) : packages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
              <Package size={32} weight="thin" />
              <p className="text-sm">{t('admin.branches.detail.noPackages')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-slate-50/60">
              {packages.map((pkg) => (
                <div
                  key={pkg._id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all duration-200 group"
                >
                  <div>
                    {/* Card Header: Category & Actions */}
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 uppercase tracking-wide border border-blue-100">
                          {pkg.category === 'external' ? t('admin.branches.package.category.external') : pkg.category === 'internal' ? t('admin.branches.package.category.internal') : t('admin.branches.package.category.full')}
                        </span>
                        <span className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold border ${
                          pkg.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {pkg.status === 'active' ? t('admin.branches.package.status.active') : t('admin.branches.package.status.inactive')}
                        </span>
                        <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200/80 flex items-center gap-1">
                          {t('admin.branches.package.bookings', { count: pkg.bookingCount || 0 })}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setPkgSelected(pkg); setPkgModal('edit'); }}
                          title={t('admin.branches.common.edit')}
                          className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <PencilSimple size={15} />
                        </button>
                        <button
                          onClick={() => { setPkgSelected(pkg); setPkgModal('delete'); }}
                          title={t('admin.branches.package.delete')}
                          className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Title & Price Header */}
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <h4 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {pkg.name}
                      </h4>
                      <div className="text-right shrink-0">
                        <span className="text-lg font-extrabold text-emerald-600">
                          {Number(pkg.price).toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    </div>

                    {/* Description */}
                    {pkg.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">
                        {pkg.description}
                      </p>
                    )}

                    {/* Duration & Vehicle Types */}
                    <div className="flex flex-wrap items-center gap-2 py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 mb-3">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                        <ClockCountdown size={14} className="text-amber-500" />
                        {t('admin.branches.package.duration', { minutes: pkg.duration })}
                      </span>
                      {pkg.vehicleTypes?.length > 0 && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
                            <Car size={14} className="text-blue-500" />
                            {pkg.vehicleTypes.map((vt) => VEHICLE_LABELS[vt] || vt).join(', ')}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Sub-services Checklist */}
                    {pkg.subServices && pkg.subServices.length > 0 && (
                      <div className="space-y-2.5 pt-3 border-t border-slate-100">
                        {/* Included subservices */}
                        {pkg.subServices.filter((s) => !s.isOptional).length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                              <span className="text-emerald-500 font-bold">✓</span> {t('admin.branches.package.process', { count: pkg.subServices.filter((s) => !s.isOptional).length })}
                            </p>
                            <div className="grid grid-cols-1 gap-1">
                              {pkg.subServices.filter((s) => !s.isOptional).map((sub, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs text-slate-700 bg-emerald-50/50 px-2.5 py-1 rounded-lg border border-emerald-100/60">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <span className="text-emerald-600 font-bold text-xs">✓</span> {sub.name}
                                  </span>
                                  {sub.duration > 0 && (
                                    <span className="text-[10px] text-slate-400 font-mono">({sub.duration}p)</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Optional add-ons */}
                        {pkg.subServices.filter((s) => s.isOptional).length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                              <span className="text-indigo-500 font-bold">✨</span> {t('admin.branches.package.optionalAddons', { count: pkg.subServices.filter((s) => s.isOptional).length })}
                            </p>
                            <div className="grid grid-cols-1 gap-1">
                              {pkg.subServices.filter((s) => s.isOptional).map((sub, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs text-slate-700 bg-indigo-50/40 px-2.5 py-1 rounded-lg border border-indigo-100/60">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <span className="text-indigo-500 font-bold text-xs">+</span> {sub.name}
                                  </span>
                                  {sub.price > 0 && (
                                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100/70 px-1.5 py-0.2 rounded">
                                      +{Number(sub.price).toLocaleString('vi-VN')}₫
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Package Create Modal ── */}
      {pkgModal === 'create' && (
        <Modal title={t('admin.branches.package.modal.createTitle')} onClose={() => setPkgModal(null)} wide>
          <CreatePackageForm onSave={async (data) => {
            setPkgSaving(true);
            try {
              const res = await apiFetch('/packages', { method: 'POST', body: JSON.stringify({ ...data, branchId: branch._id }) });
              if (!res.ok) throw new Error(await readError(res));
              const payload = await res.json();
              const created = payload?.data ?? payload;
              setPackages((p) => [created, ...p]);
              setPkgModal(null);
              notify(t('admin.branches.detail.notify.pkgCreated'));
            } catch (err) {
              notify(err.message || t('admin.branches.detail.notify.createFailed'), 'error');
            } finally { setPkgSaving(false); }
          }} onCancel={() => setPkgModal(null)} saving={pkgSaving} />
        </Modal>
      )}

      {/* ── Package Edit Modal ── */}
      {pkgModal === 'edit' && pkgSelected && (
        <Modal title={t('admin.branches.package.modal.editTitle', { name: pkgSelected.name })} onClose={() => { setPkgModal(null); setPkgSelected(null); }} wide>
          <CreatePackageForm initial={pkgSelected} onSave={handlePkgUpdate} onCancel={() => { setPkgModal(null); setPkgSelected(null); }} saving={pkgSaving} />
        </Modal>
      )}

      {/* ── Package Delete Modal ── */}
      {pkgModal === 'delete' && pkgSelected && (
        <Modal title={t('admin.branches.package.modal.deleteTitle')} onClose={() => { setPkgModal(null); setPkgSelected(null); setPkgDeleteError(''); }}>
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-2">
              <p className="text-sm font-bold text-slate-800">{t('admin.branches.package.modal.deleteQuestion', { name: pkgSelected.name })}</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                • <b>{t('admin.branches.package.modal.softDelete')}:</b> {t('admin.branches.package.modal.softDeleteDesc')} <i>{t('admin.branches.status.inactiveFull')}</i>{t('admin.branches.package.modal.softDeleteDesc2')}<br />
                • <b>{t('admin.branches.package.modal.hardDelete')}:</b> {t('admin.branches.package.modal.hardDeleteDesc')}
              </p>
            </div>

            {pkgDeleteError && (
              <div className="flex gap-2.5 rounded-xl bg-red-50 p-3.5 border border-red-200 text-xs text-red-700 font-semibold leading-relaxed">
                <Warning size={18} weight="fill" className="shrink-0 text-red-500 mt-0.5" />
                <div>{pkgDeleteError}</div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setPkgModal(null); setPkgSelected(null); setPkgDeleteError(''); }}
                disabled={pkgDeleting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {t('admin.branches.common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handlePkgDelete(false)}
                disabled={pkgDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60 transition-colors"
              >
                {pkgDeleting && <Spinner size={14} className="text-white" />}
                {t('admin.branches.package.modal.softDeleteBtn')}
              </button>
              <button
                type="button"
                onClick={() => handlePkgDelete(true)}
                disabled={pkgDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
              >
                {pkgDeleting && <Spinner size={14} className="text-white" />}
                {t('admin.branches.package.modal.hardDeleteBtn')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Zoom Image Lightbox Modal ── */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn"
          onClick={() => setZoomImage(null)}
        >
          <div
            className="relative flex flex-col max-w-4xl max-h-[90vh] w-full overflow-hidden rounded-2xl bg-slate-900 shadow-2xl border border-slate-700/80"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomImage(null)}
              className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 hover:scale-110 transition-all border border-white/20 shadow-lg"
              title={t('admin.branches.common.close')}
            >
              <X size={20} weight="bold" />
            </button>

            <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden p-3 bg-black/40">
              <img
                src={zoomImage}
                alt={branch.name}
                className="max-h-[68vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>

            <div className="shrink-0 py-4 px-6 text-center bg-slate-900 border-t border-slate-800">
              <p className="text-base font-bold text-white leading-snug">{branch.name}</p>
              {branch.address && (
                <p className="text-xs text-slate-300 mt-1 leading-snug">{branch.address}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreatePackageForm({ initial, onSave, onCancel, saving }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    price: initial?.price ?? '',
    duration: initial?.duration ?? '',
    image: initial?.image ?? '',
    status: initial?.status ?? 'active',
    category: initial?.category ?? 'full',
    vehicleTypes: initial?.vehicleTypes ?? [],
    subServices: initial?.subServices ?? [],
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const toggleVehicle = (val) => {
    setForm((f) => ({ ...f, vehicleTypes: f.vehicleTypes.includes(val) ? f.vehicleTypes.filter((v) => v !== val) : [...f.vehicleTypes, val] }));
  };

  const addSub = () => setForm((f) => ({ ...f, subServices: [...f.subServices, { name: '', price: '', duration: '', isOptional: true }] }));
  
  const updSub = (idx, key, val) => {
    setForm((f) => {
      const s = [...f.subServices];
      if (key === 'isOptional' && val === false) {
        s[idx] = { ...s[idx], isOptional: false, price: 0 };
      } else {
        s[idx] = { ...s[idx], [key]: val };
      }
      return { ...f, subServices: s };
    });
    setErrors((e) => {
      if (!e.subServices) return e;
      const subErrs = [...e.subServices];
      if (subErrs[idx]) {
        subErrs[idx] = { ...subErrs[idx], [key]: '' };
        if (key === 'isOptional' && val === false) {
          subErrs[idx].price = '';
        }
      }
      return { ...e, subServices: subErrs };
    });
  };

  const delSub = (idx) => {
    setForm((f) => ({ ...f, subServices: f.subServices.filter((_, i) => i !== idx) }));
    setErrors((e) => {
      if (!e.subServices) return e;
      return { ...e, subServices: e.subServices.filter((_, i) => i !== idx) };
    });
  };

  const parseVnd = (v) => Number(String(v).replace(/\./g, ''));

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = t('admin.branches.pkgForm.errors.name');

    const numericPrice = parseVnd(form.price);
    if (!form.price || isNaN(numericPrice) || numericPrice <= 1000) {
      errs.price = t('admin.branches.pkgForm.errors.price');
    }

    if (!form.duration || Number(form.duration) <= 0) {
      errs.duration = t('admin.branches.pkgForm.errors.duration');
    }

    const subErrors = [];
    let hasSubError = false;

    (form.subServices || []).forEach((sub, idx) => {
      const sErr = {};
      if (!sub.name || !sub.name.trim()) {
        sErr.name = t('admin.branches.pkgForm.errors.subName');
        hasSubError = true;
      }
      if (!sub.duration || Number(sub.duration) <= 0) {
        sErr.duration = t('admin.branches.pkgForm.errors.subDuration');
        hasSubError = true;
      }
      if (sub.isOptional) {
        const subPriceNum = parseVnd(sub.price);
        if (!sub.price || isNaN(subPriceNum) || subPriceNum <= 1000) {
          sErr.price = t('admin.branches.pkgForm.errors.subPrice');
          hasSubError = true;
        }
      }
      subErrors[idx] = sErr;
    });

    if (hasSubError) {
      errs.subServices = subErrors;
    }

    if (Object.keys(errs).length) return setErrors(errs);
    onSave({ ...form, price: parseVnd(form.price), duration: Number(form.duration) });
  };

  const inp = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors';

  const onPriceChange = (v) => {
    setForm((f) => ({ ...f, price: v }));
    setErrors((e) => ({ ...e, price: '' }));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t('admin.branches.pkgForm.name')} <span className="text-red-500">*</span></label>
          <input className={inp} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('admin.branches.pkgForm.placeholders.name')} />
          {errors.name && <p className="mt-1 text-[11px] text-red-500">{errors.name}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t('admin.branches.pkgForm.category')}</label>
          <select className={inp} value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="full">{t('admin.branches.package.category.full')}</option><option value="external">{t('admin.branches.package.category.external')}</option><option value="internal">{t('admin.branches.package.category.internal')}</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t('admin.branches.pkgForm.description')}</label>
        <textarea rows={2} className={inp + ' resize-none'} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={t('admin.branches.pkgForm.placeholders.description')} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t('admin.branches.pkgForm.price')} <span className="text-red-500">*</span></label>
          <input type="text" inputMode="numeric" className={inp} value={form.price} onChange={(e) => onPriceChange(e.target.value)} placeholder="80000" />
          {errors.price && <p className="mt-1 text-[11px] text-red-500">{errors.price}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t('admin.branches.pkgForm.duration')} <span className="text-red-500">*</span></label>
          <input type="number" min="1" className={inp} value={form.duration} onChange={(e) => set('duration', e.target.value)} placeholder="60" />
          {errors.duration && <p className="mt-1 text-[11px] text-red-500">{errors.duration}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t('admin.branches.form.status')}</label>
          <select className={inp} value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">{t('admin.branches.status.active')}</option><option value="inactive">{t('admin.branches.status.inactive')}</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t('admin.branches.pkgForm.vehicleTypes')}</label>
        <div className="flex flex-wrap gap-2">
          {[{ v: 'sedan', l: 'Sedan' }, { v: 'suv', l: 'SUV' }, { v: 'pickup', l: 'Pickup' }, { v: 'van', l: 'Van' }].map((o) => (
            <button key={o.v} type="button" onClick={() => toggleVehicle(o.v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${form.vehicleTypes.includes(o.v) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>{o.l}</button>
          ))}
        </div>
      </div>
      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="text-xs font-bold text-slate-700 block">{t('admin.branches.pkgForm.subServices')}</label>
            <span className="text-[11px] text-slate-400">{t('admin.branches.pkgForm.subServicesHint')}</span>
          </div>
          <button type="button" onClick={addSub}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors">
            <Plus size={13} weight="bold" /> {t('admin.branches.pkgForm.addSubService')}
          </button>
        </div>

        <div className="space-y-3 mt-3">
          {form.subServices.map((sub, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => updSub(idx, 'isOptional', false)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                      !sub.isOptional 
                        ? 'bg-emerald-500 text-white shadow-xs' 
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {t('admin.branches.pkgForm.included')}
                  </button>
                  <button
                    type="button"
                    onClick={() => updSub(idx, 'isOptional', true)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                      sub.isOptional 
                        ? 'bg-indigo-500 text-white shadow-xs' 
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {t('admin.branches.pkgForm.optional')}
                  </button>
                </div>
                <button type="button" onClick={() => delSub(idx)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" title={t('admin.branches.common.delete')}>
                  <Trash size={15} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-1">
                  <label className="text-[10px] font-medium text-slate-500 block mb-1">
                    {t('admin.branches.pkgForm.subName')} <span className="text-red-500">*</span>
                  </label>
                  <input placeholder={t('admin.branches.pkgForm.placeholders.subName')} className={inp + ' text-xs'} value={sub.name}
                    onChange={(e) => updSub(idx, 'name', e.target.value)} />
                  {errors.subServices?.[idx]?.name && (
                    <p className="mt-1 text-[11px] text-red-500">{errors.subServices[idx].name}</p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-1">
                    {t('admin.branches.pkgForm.subPrice')} {sub.isOptional ? <span className="text-red-500">*</span> : <span className="text-slate-400">({t('admin.branches.pkgForm.free')})</span>}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={!sub.isOptional ? t('admin.branches.pkgForm.placeholders.subPriceIncluded') : t('admin.branches.pkgForm.placeholders.subPriceExample')}
                    disabled={!sub.isOptional}
                    className={`${inp} text-xs ${!sub.isOptional ? 'bg-slate-100/90 text-slate-400 cursor-not-allowed border-slate-200' : ''}`}
                    value={!sub.isOptional ? '0' : sub.price}
                    onChange={(e) => updSub(idx, 'price', e.target.value)}
                  />
                  {errors.subServices?.[idx]?.price && (
                    <p className="mt-1 text-[11px] text-red-500">{errors.subServices[idx].price}</p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 block mb-1">
                    {t('admin.branches.pkgForm.subDuration')} <span className="text-red-500">*</span>
                  </label>
                  <input type="number" min="1" placeholder="5" className={inp + ' text-xs'} value={sub.duration}
                    onChange={(e) => updSub(idx, 'duration', e.target.value)} />
                  {errors.subServices?.[idx]?.duration && (
                    <p className="mt-1 text-[11px] text-red-500">{errors.subServices[idx].duration}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {form.subServices.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center">
              <p className="text-xs text-slate-400">{t('admin.branches.pkgForm.noSubServices')}</p>
              <button type="button" onClick={addSub} className="mt-1 text-xs font-semibold text-blue-600 hover:underline">
                {t('admin.branches.pkgForm.addSubServiceNow')}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">{t('admin.branches.common.cancel')}</button>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {saving && <Spinner size={14} className="text-white" />}{saving ? t('admin.branches.common.saving') : t('admin.branches.common.save')}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main page
═══════════════════════════════════════════════════════════════════ */
export default function BranchManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const detailIdFromUrl = searchParams.get('detail');

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState(null);     // null | 'create' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null);
  const [currentView, setCurrentView] = useState(detailIdFromUrl ? 'detail' : 'list'); // 'list' | 'detail'
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [toast, setToast] = useState(null);
  const debounce = useRef(null);

  const notify = (message, type = 'success') => showToast(message, type);

  const openDetailView = useCallback((branchObj) => {
    setSelected(branchObj);
    setCurrentView('detail');
    setSearchParams({ detail: branchObj._id });
  }, [setSearchParams]);

  const closeDetailView = useCallback(() => {
    setSelected(null);
    setCurrentView('list');
    setSearchParams({});
  }, [setSearchParams]);

  // Restore detail view on initial load or F5 refresh if ?detail=<id> is in URL
  useEffect(() => {
    if (!detailIdFromUrl) {
      return;
    }

    const found = branches.find((b) => String(b._id) === String(detailIdFromUrl));
    if (found) {
      setSelected(found);
      setCurrentView('detail');
    } else {
      async function restoreBranch() {
        try {
          const res = await apiFetch(`/branches/${detailIdFromUrl}`);
          if (res.ok) {
            const payload = await res.json();
            const b = payload?.data ?? payload;
            if (b && b._id) {
              setSelected(b);
              setCurrentView('detail');
            }
          }
        } catch (e) {
          console.error('Failed to restore branch from URL', e);
        }
      }
      restoreBranch();
    }
  }, [detailIdFromUrl, branches]);

  /* ── fetch ── */
  const fetchBranches = useCallback(async (q = search, st = statusFilter) => {
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams();
      if (st) params.set('status', st);
      if (q.trim()) params.set('search', q.trim());
      const res = await apiFetch(`/branches?${params}`);
      if (!res.ok) throw new Error(await readError(res));
      const payload = await res.json();
      const data = payload?.data ?? payload;
      setBranches(Array.isArray(data) ? data : []);
    } catch (err) {
      setFetchError(err.message || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { fetchBranches(); }, []); // eslint-disable-line

  const handleStatusFilter = (val) => {
    setStatusFilter(val);
    fetchBranches(search, val);
  };

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchBranches(val, statusFilter), 420);
  };

  /* ── create ── */
  const handleCreate = async (data) => {
    setSaving(true);
    try {
      const res = await apiFetch('/branches', { method: 'POST', body: JSON.stringify(data) });
      if (!res.ok) throw new Error(await readError(res));
      const payload = await res.json();
      const created = payload?.data ?? payload;
      setBranches((p) => [created, ...p]);
      setModal(null);
      notify('Tạo chi nhánh thành công!');
    } catch (err) {
      notify(err.message || 'Tạo thất bại', 'error');
    } finally { setSaving(false); }
  };

  /* ── update ── */
  const handleUpdate = async (data) => {
    setSaving(true);
    try {
      const res = await apiFetch(`/branches/${selected._id}`, { method: 'PUT', body: JSON.stringify(data) });
      if (!res.ok) throw new Error(await readError(res));
      const payload = await res.json();
      const updated = payload?.data ?? payload;
      setBranches((p) => p.map((b) => (b._id === updated._id ? updated : b)));
      setModal(null);
      notify('Cập nhật thành công!');
    } catch (err) {
      notify(err.message || 'Cập nhật thất bại', 'error');
    } finally { setSaving(false); }
  };

  const [blockedMsg, setBlockedMsg] = useState('');

  /* ── delete ── */
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/branches/${selected._id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res));
      setBranches((p) => p.filter((b) => b._id !== selected._id));
      setModal(null);
      notify('Đã xóa chi nhánh.');
    } catch (err) {
      setBlockedMsg(err.message || 'Không thể xóa chi nhánh');
      setModal('blocked');
    } finally { setDeleting(false); }
  };

  const handleDeactivateBranch = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/branches/${selected._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const payload = await res.json();
      const updated = payload?.data ?? payload;
      setBranches((p) => p.map((b) => (b._id === updated._id ? updated : b)));
      setModal(null);
      notify(`Đã chuyển chi nhánh "${selected.name}" sang "Ngừng hoạt động".`);
    } catch (err) {
      notify(err.message || 'Thay đổi thất bại', 'error');
    } finally { setDeleting(false); }
  };

  /* ── assign manager ── */
  const handleAssignManager = async (managerId) => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/branches/${selected._id}`, {
        method: 'PUT',
        body: JSON.stringify({ managerId: managerId || null }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const payload = await res.json();
      const updated = payload?.data ?? payload;
      setBranches((p) => p.map((b) => (b._id === updated._id ? updated : b)));
      setSelected(updated);
      setModal(null);
      notify('Cập nhật quản lý chi nhánh thành công!');
    } catch (err) {
      notify(err.message || 'Cập nhật quản lý thất bại', 'error');
    } finally { setSaving(false); }
  };

  const stats = {
    total: branches.length,
    active: branches.filter((b) => b.status === 'active').length,
    inactive: branches.filter((b) => b.status === 'inactive').length,
  };

  /* ─────────────────── render ─────────────────── */
  if (currentView === 'detail' && selected) {
    return (
      <div className="space-y-6">
        <BranchDetailFull
          branch={selected}
          onBack={closeDetailView}
          onEdit={(br) => { setSelected(br); setModal('edit'); }}
          onChangeManager={() => setModal('assignManager')}
        />

        {/* ── Modals for Detail View ── */}
        {modal === 'edit' && (
          <Modal title="Cập nhật thông tin chi nhánh" onClose={() => setModal(null)} wide>
            <BranchForm initial={selected} onSave={handleUpdate} onCancel={() => setModal(null)} saving={saving} />
          </Modal>
        )}
        {modal === 'assignManager' && selected && (
          <AssignManagerModal
            branch={selected}
            allBranches={branches}
            onClose={() => setModal(null)}
            onSave={handleAssignManager}
            saving={saving}
          />
        )}
        {modal === 'delete' && (
          <ConfirmDelete branch={selected} onConfirm={handleDelete} onCancel={() => setModal(null)} deleting={deleting} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Tổng chi nhánh',     value: stats.total,    icon: <Buildings size={18} weight="duotone" className="text-blue-500" />,    bg: 'bg-blue-50' },
          { label: 'Đang hoạt động',     value: stats.active,   icon: <CheckCircle size={18} weight="duotone" className="text-emerald-500" />, bg: 'bg-emerald-50' },
          { label: 'Ngừng hoạt động',    value: stats.inactive, icon: <XCircle size={18} weight="duotone" className="text-slate-400" />,      bg: 'bg-slate-100' },
        ].map((s) => (
          <div key={s.label}
            className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-xs"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.bg}`}>
              {s.icon}
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* search */}
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="branch-search"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
            placeholder="Tìm tên, địa chỉ…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {/* status filter */}
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => handleStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
        >
          <option value="">Tất cả</option>
          <option value="active">Hoạt động</option>
          <option value="inactive">Ngừng</option>
        </select>

        {/* refresh */}
        <button
          id="branch-refresh"
          onClick={() => fetchBranches()}
          disabled={loading}
          title="Làm mới"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <ArrowClockwise size={15} className={loading ? 'animate-spin' : ''} />
        </button>

        {/* add button */}
        <button
          id="add-branch-btn"
          onClick={() => { setSelected(null); setModal('create'); }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs"
        >
          <Plus size={15} weight="bold" />
          Thêm chi nhánh
        </button>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-28 text-slate-400">
          <Spinner size={28} />
          <span className="text-sm">Đang tải…</span>
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-100 bg-red-50 py-16">
          <Warning size={28} weight="duotone" className="text-red-400" />
          <p className="text-sm text-red-600">{fetchError}</p>
          <button
            onClick={() => fetchBranches()}
            className="rounded-lg border border-red-200 px-4 py-1.5 text-sm text-red-600 hover:bg-red-100 transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : branches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-20">
          <Buildings size={40} weight="thin" className="text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Chưa có chi nhánh nào</p>
          <button
            id="add-branch-empty"
            onClick={() => { setSelected(null); setModal('create'); }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} weight="bold" />
            Thêm chi nhánh đầu tiên
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full border-collapse text-left text-xs text-slate-600">
            <thead className="bg-slate-50/90 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200 tracking-wider">
              <tr>
                <th className="px-5 py-3.5 whitespace-nowrap">Tên chi nhánh / Quản lý</th>
                <th className="px-5 py-3.5">Địa chỉ & Liên hệ</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Giờ hoạt động</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Trạng thái</th>
                <th className="px-5 py-3.5 whitespace-nowrap text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branches.map((b) => {
                const mgr = typeof b.managerId === 'object' && b.managerId !== null ? b.managerId : null;
                return (
                  <tr
                    key={b._id}
                    onClick={() => openDetailView(b)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 overflow-hidden shadow-2xs border border-slate-200/60 group-hover:border-blue-200 transition-colors">
                          {b.image ? (
                            <img src={b.image} alt={b.name} className="h-full w-full object-cover" />
                          ) : (
                            <Buildings size={22} weight="duotone" className="text-blue-500" />
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800 text-sm whitespace-nowrap group-hover:text-blue-600 transition-colors">{b.name}</div>
                          <div className="text-[11px] text-blue-700 font-semibold flex items-center gap-1">
                            👤 Quản lý: {mgr ? mgr.name : <span className="text-slate-400 italic font-normal">Chưa phân công</span>}
                          </div>
                          {b.email && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              ✉️ {b.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-xs font-semibold text-slate-800 line-clamp-1 max-w-[280px]" title={b.address}>
                        {b.address || '—'}
                      </div>
                      {b.phone && (
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          📞 {b.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-xs font-medium text-slate-600">
                      {b.openingTime || b.closingTime ? `${b.openingTime} – ${b.closingTime}` : '—'}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openDetailView(b); }}
                          title="Xem chi tiết"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                        >
                          <svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor">
                            <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.48c.35.79,8.82,19.58,27.65,38.41C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.35c18.83-18.83,27.3-37.62,27.65-38.41A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128a133.47,133.47,0,0,1-23.06,30.75C185.67,180.81,158.78,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelected(b); setModal('edit'); }}
                          title="Chỉnh sửa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <PencilSimple size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelected(b); setModal('delete'); }}
                          title="Xóa"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals ── */}
      {modal === 'create' && (
        <Modal title="Thêm chi nhánh mới" onClose={() => setModal(null)} wide>
          <BranchForm initial={EMPTY} onSave={handleCreate} onCancel={() => setModal(null)} saving={saving} />
        </Modal>
      )}

      {modal === 'edit' && selected && (
        <Modal title={`Chỉnh sửa: ${selected.name}`} onClose={() => setModal(null)} wide>
          <BranchForm initial={selected} onSave={handleUpdate} onCancel={() => setModal(null)} saving={saving} />
        </Modal>
      )}

      {modal === 'assignManager' && selected && (
        <AssignManagerModal
          branch={selected}
          allBranches={branches}
          onClose={() => setModal(null)}
          onSave={handleAssignManager}
          saving={saving}
        />
      )}

      {modal === 'delete' && selected && (
        <ConfirmDelete
          branch={selected}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
          deleting={deleting}
        />
      )}

      {/* ── Modals ── */}
      {modal === 'create' && (
        <Modal title="Thêm chi nhánh mới" onClose={() => setModal(null)} wide>
          <BranchForm initial={EMPTY} onSave={handleCreate} onCancel={() => setModal(null)} saving={saving} />
        </Modal>
      )}

      {modal === 'edit' && selected && (
        <Modal title={`Chỉnh sửa: ${selected.name}`} onClose={() => setModal(null)} wide>
          <BranchForm initial={selected} onSave={handleUpdate} onCancel={() => setModal(null)} saving={saving} />
        </Modal>
      )}

      {modal === 'assignManager' && selected && (
        <AssignManagerModal
          branch={selected}
          onClose={() => setModal(null)}
          onSave={handleAssignManager}
          saving={saving}
        />
      )}

      {modal === 'delete' && selected && (
        <ConfirmDelete
          branch={selected}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
          deleting={deleting}
        />
      )}

      {modal === 'blocked' && selected && (
        <BlockDeleteModal
          title="Không thể xóa chi nhánh"
          message={blockedMsg}
          onClose={() => setModal(null)}
          onDeactivate={handleDeactivateBranch}
          deactivating={deleting}
        />
      )}

      {/* ── Toast ── */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
