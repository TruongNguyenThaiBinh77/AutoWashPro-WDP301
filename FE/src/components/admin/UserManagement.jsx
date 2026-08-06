import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { showToast } from '@/lib/toast';
import {
  ArrowClockwise,
  CheckCircle,
  Coins,
  Crown,
  Envelope,
  Eye,
  MagnifyingGlass,
  PencilSimple,
  Phone,
  Plus,
  Shield,
  Trash,
  User,
  UserPlus,
  Users,
  Warning,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { getApiBaseUrl, getStoredToken } from "@/lib/authStorage";
import { userService } from "@/components/services/userService";
import TierBadge from "@/components/ui/TierBadge";

/* ─────────────────────────── API helper ─────────────────────────── */
async function apiFetch(path, options = {}) {
  const base = getApiBaseUrl();
  const token = getStoredToken();
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

async function readError(res, t) {
  try {
    const j = await res.json();
    return j?.message || j?.error || t('admin.users.error.http', { status: res.status });
  } catch {
    return t('admin.users.error.http', { status: res.status });
  }
}

/* ─────────────────────────── Spinner ─────────────────────────────── */
function Spinner({ size = 18, className = "" }) {
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

/* ─────────────────────────── Badges ──────────────────────────────── */
function RoleBadge({ role }) {
  const { t } = useTranslation();
  let style = "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  let label = t('admin.users.role.customer');
  let icon = <User size={11} weight="fill" />;

  if (role === "admin") {
    style = "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    label = t('admin.users.role.admin');
    icon = <Shield size={11} weight="fill" />;
  } else if (role === "manager") {
    style = "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200";
    label = t('admin.users.role.manager');
    icon = <Crown size={11} weight="fill" />;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style}`}
    >
      {icon}
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  let style = "bg-slate-100 text-slate-500 ring-1 ring-slate-200";
  let label = t('admin.users.status.inactive');
  let icon = <XCircle size={11} weight="fill" />;

  if (status === "active") {
    style = "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    label = t('admin.users.status.active');
    icon = <CheckCircle size={11} weight="fill" />;
  } else if (status === "suspended") {
    style = "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    label = t('admin.users.status.suspended');
    icon = <Warning size={11} weight="fill" />;
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style}`}
    >
      {icon}
      {label}
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
  const isErr = toast.type === "error";

  return (
    <div
      role="alert"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
        isErr
          ? "bg-white text-red-600 ring-red-200"
          : "bg-white text-emerald-700 ring-emerald-200"
      }`}
    >
      {isErr ? (
        <XCircle size={16} weight="fill" className="shrink-0" />
      ) : (
        <CheckCircle size={16} weight="fill" className="shrink-0" />
      )}
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
    const fn = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.35)", backdropFilter: "blur(3px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`relative flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Helper components ───────────────────── */
function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

const inp =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors";

/* ─────────────────────────── User forms ──────────────────────────── */
const EMPTY = {
  name: "",
  email: "",
  password: "",
  phone: "",
  role: "manager",
};

function CreateForm({ onSave, onCancel, saving }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = t('admin.users.create.errorName');
    if (!form.email.trim()) {
      e.email = t('admin.users.create.errorEmail');
    } else if (!/\S+@\S+\.\S+/.test(form.email)) {
      e.email = t('admin.users.create.errorEmailInvalid');
    }
    if (!form.password) {
      e.password = t('admin.users.create.errorPassword');
    } else if (form.password.length < 6) {
      e.password = t('admin.users.create.errorPasswordShort');
    }
    if (!form.role) e.role = t('admin.users.create.errorRole');
    return e;
  };

  const submit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) return setErrors(errs);

    onSave(form);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('admin.users.create.nameLabel')} required error={errors.name}>
          <input
            className={inp}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t('admin.users.create.namePlaceholder')}
          />
        </Field>
        <Field label={t('admin.users.create.phoneLabel')} error={errors.phone}>
          <input
            className={inp}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="0901234567"
          />
        </Field>
      </div>

      <Field label={t('admin.users.create.emailLabel')} required error={errors.email}>
        <input
          type="email"
          className={inp}
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="nguyenvana@gmail.com"
        />
      </Field>

      <Field label={t('admin.users.create.passwordLabel')} required error={errors.password}>
        <input
          type="password"
          className={inp}
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          placeholder={t('admin.users.create.passwordPlaceholder')}
        />
      </Field>

      <Field label={t('admin.users.create.roleLabel')} required error={errors.role}>
        <select
          className={inp}
          value={form.role}
          onChange={(e) => set("role", e.target.value)}
        >
          <option value="manager">{t('admin.users.create.optionManager')}</option>
          <option value="admin">{t('admin.users.create.optionAdmin')}</option>
        </select>
      </Field>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm !text-black hover:bg-slate-50 transition-colors"
        >
          {t('admin.users.create.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving && <Spinner size={14} className="text-white" />}
          {saving ? t('admin.users.create.creating') : t('admin.users.create.submit')}
        </button>
      </div>
    </form>
  );
}

function EditForm({ initial, onSave, onCancel, saving }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: initial.name || "",
    phone: initial.phone || "",
    role: initial.role || "customer",
    status: initial.status || "active",
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = t('admin.users.create.errorName');
    return e;
  };

  const submit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) return setErrors(errs);

    onSave(form);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('admin.users.edit.nameLabel')} required error={errors.name}>
          <input
            className={inp}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t('admin.users.edit.namePlaceholder')}
          />
        </Field>
        <Field label={t('admin.users.edit.phoneLabel')} error={errors.phone}>
          <input
            className={inp}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="0901234567"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('admin.users.edit.roleLabel')} error={errors.role}>
          <select
            className={inp}
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
          >
            <option value="manager">{t('admin.users.edit.optionManager')}</option>
            <option value="admin">{t('admin.users.edit.optionAdmin')}</option>
          </select>
        </Field>

        <Field label={t('admin.users.edit.statusLabel')} error={errors.status}>
          <select
            className={inp}
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="active">{t('admin.users.edit.optionActive')}</option>
            <option value="inactive">{t('admin.users.edit.optionInactive')}</option>
            <option value="suspended">{t('admin.users.edit.optionSuspended')}</option>
          </select>
        </Field>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm !text-black hover:bg-slate-50 transition-colors"
        >
          {t('admin.users.edit.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving && <Spinner size={14} className="text-white" />}
          {saving ? t('admin.users.edit.saving') : t('admin.users.edit.submit')}
        </button>
      </div>
    </form>
  );
}

/* ─────────────────────────── Detail View ─────────────────────────── */
function DetailView({ user }) {
  const { t } = useTranslation();
  const createdDate = user.createdAt
    ? new Date(user.createdAt).toLocaleString("vi-VN")
    : t('admin.users.detail.unknown');
  const lastLoginDate = user.lastLogin
    ? new Date(user.lastLogin).toLocaleString("vi-VN")
    : t('admin.users.detail.neverLoggedIn');
  const dob = user.dateOfBirth
    ? new Date(user.dateOfBirth).toLocaleDateString("vi-VN")
    : t('admin.users.detail.notUpdated');

  return (
    <div className="space-y-5 text-sm text-slate-600">
      {/* Overview Block */}
      <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4 border border-slate-100">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-bold text-xl border-2 border-white shadow-sm overflow-hidden">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="h-full w-full object-cover"
            />
          ) : (
            user.name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <h4 className="text-base font-bold text-slate-800 flex items-center gap-2">
            {user.name}
            <TierBadge tier={user.tier} />
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <RoleBadge role={user.role} />
            <StatusBadge status={user.status} />
          </div>
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-b border-slate-100 py-4">
        <div>
          <span className="block text-xs text-slate-400 font-medium">
            {t('admin.users.detail.phone')}
          </span>
          <span className="font-semibold text-slate-700 flex items-center gap-1.5 mt-0.5">
            <Phone size={14} className="text-slate-400" />
            {user.phone || t('admin.users.detail.notProvided')}
          </span>
        </div>
        <div>
          <span className="block text-xs text-slate-400 font-medium">
            {t('admin.users.detail.birthdate')}
          </span>
          <span className="font-semibold text-slate-700 mt-0.5">{dob}</span>
        </div>
        <div>
          <span className="block text-xs text-slate-400 font-medium">
            {t('admin.users.detail.points')}
          </span>
          <span className="font-semibold text-slate-700 flex items-center gap-1 mt-0.5">
            <Coins size={14} weight="fill" className="text-amber-500" />
            {t('admin.users.detail.pointsValue', { points: user.loyaltyPoints || 0 })}
          </span>
        </div>
        <div>
          <span className="block text-xs text-slate-400 font-medium">
            {t('admin.users.detail.lifetimePoints')}
          </span>
          <span className="font-semibold text-slate-700 flex items-center gap-1 mt-0.5">
            <Coins size={14} weight="duotone" className="text-slate-400" />
            {t('admin.users.detail.pointsValue', { points: user.lifetimePoints || 0 })}
          </span>
        </div>
      </div>

      {/* Registration info */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs text-slate-400">
        <div>
          <span>{t('admin.users.detail.lastLoginLabel')}</span>
          <p className="font-medium text-slate-600 mt-0.5">{lastLoginDate}</p>
        </div>
        <div>
          <span>{t('admin.users.detail.registeredLabel')}</span>
          <p className="font-medium text-slate-600 mt-0.5">{createdDate}</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Parse blocked message ──────────────── */
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
      else if (item.includes('lịch định kỳ')) icon = '🔄';
      else if (item.includes('điểm tích lũy')) icon = '⭐';
      return { icon, text: item };
    });

    return { header, items, footer };
  }
  return { header: msg, items: [], footer: '' };
}

/* ─────────────────────────── Block Delete Modal ─────────────────── */
function BlockDeleteModal({ title, message, onClose }) {
  const { t } = useTranslation();
  const { header, items, footer } = useMemo(() => parseBlockedMessage(message), [message]);

  return (
    <Modal title={title || t('admin.users.blocked.title')} onClose={onClose}>
      <div className="space-y-4 py-1">
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/70">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 mt-0.5 font-bold shadow-xs">
            <Warning size={20} weight="fill" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="text-sm font-bold text-amber-900">{t('admin.users.blocked.protectTitle')}</h4>
            <p className="text-xs text-amber-800 leading-relaxed font-medium">{header}</p>
          </div>
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
              {t('admin.users.blocked.linkedDataLabel')}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.map((it, idx) => (
                <div key={idx}
                  className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 shadow-2xs hover:bg-amber-50 transition-colors">
                  <span className="text-base shrink-0">{it.icon}</span>
                  <span className="text-xs font-semibold text-slate-800 leading-tight">{it.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {footer && (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
            <span className="text-amber-500 shrink-0 mt-0.5">💡</span>
            <p className="leading-relaxed">{footer}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            {t('admin.users.blocked.close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── Confirm delete ─────────────────────── */
function ConfirmDelete({ user, onConfirm, onCancel, deleting }) {
  const { t } = useTranslation();
  return (
    <Modal title={t('admin.users.delete.title')} onClose={onCancel}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl bg-red-50 p-4 ring-1 ring-red-100">
          <Warning
            size={18}
            weight="fill"
            className="mt-0.5 shrink-0 text-red-500"
          />
          <div className="text-sm text-red-700">
            <p className="font-bold">{t('admin.users.delete.confirm', { name: user.name })}</p>
            <p className="mt-1">
              {t('admin.users.delete.warning')}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm !text-black hover:bg-slate-50 transition-colors"
          >
            {t('admin.users.delete.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {deleting && <Spinner size={14} className="text-white" />}
            {deleting ? t('admin.users.delete.deleting') : t('admin.users.delete.submit')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────────────────────────────────────────────────────────────
   Main Component
   ─────────────────────────────────────────────────────────────────── */
export default function UserManagement() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Filters & Search
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Refs for current filter values (avoid stale closures)
  const searchRef = useRef(search);
  const roleRef = useRef(roleFilter);
  const statusRef = useRef(statusFilter);
  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { roleRef.current = roleFilter; }, [roleFilter]);
  useEffect(() => { statusRef.current = statusFilter; }, [statusFilter]);

  // Modals state
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState('');
  const [toast, setToast] = useState(null);

  const notify = (message, type = "success") => showToast(message, type);

  // Fetch Users
  const fetchUsers = useCallback(
    async (pg = 1, srch = searchRef.current, role = roleRef.current, st = statusRef.current) => {
      setLoading(true);
      setFetchError("");
      try {
        const params = { page: pg, limit: 10 };
        if (srch) params.search = srch;
        if (role) params.role = role;
        if (st) params.status = st;
        const result = await userService.getAllUsers(params);
        const list = result?.users || result || [];
        setUsers(Array.isArray(list) ? list : []);
        const pag = result?.pagination;
        setTotalPages(pag?.totalPages || 1);
        setTotal(pag?.total || 0);
        setPage(pg);
      } catch (err) {
        setFetchError(err.message || t('admin.users.error.load'));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Load initial data
  useEffect(() => {
    fetchUsers(1);
  }, []); // eslint-disable-line

  // Debounced search: khi gõ vào ô tìm kiếm thì tự search sau 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(1, search, roleFilter, statusFilter);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line

  // Handle filter changes
  const handleRoleFilter = (val) => {
    setRoleFilter(val);
    fetchUsers(1, search, val, statusFilter);
  };

  const handleStatusFilter = (val) => {
    setStatusFilter(val);
    fetchUsers(1, search, roleFilter, val);
  };

  const clearFilters = () => {
    setSearch('');
    setRoleFilter('');
    setStatusFilter('');
    fetchUsers(1, '', '', '');
  };

  // Actions
  const handleCreate = async (data) => {
    setSaving(true);
    try {
      await userService.createUser(data);
      fetchUsers(1);
      setModal(null);
      notify(t('admin.users.toast.createSuccess'));
    } catch (err) {
      notify(err.message || t('admin.users.error.create'), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data) => {
    setSaving(true);
    try {
      await userService.updateUser(selected._id, data);
      fetchUsers(page);
      setModal(null);
      notify(t('admin.users.toast.updateSuccess'));
    } catch (err) {
      notify(err.message || t('admin.users.error.update'), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/auth/users/${selected._id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.code === 'USER_IN_USE') {
          setBlockedMsg(errorData.message || t('admin.users.blocked.errorBlocked'));
          setModal('blocked');
          return;
        }
        throw new Error(errorData.message || t('admin.users.error.http', { status: res.status }));
      }
      fetchUsers(page);
      setModal(null);
      notify(t('admin.users.toast.deleteSuccess'));
    } catch (err) {
      notify(err.message || t('admin.users.error.delete'), "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
            placeholder={t('admin.users.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => handleRoleFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
        >
          <option value="">{t('admin.users.allRoles')}</option>
          <option value="admin">{t('admin.users.role.admin')}</option>
          <option value="manager">{t('admin.users.role.manager')}</option>
          <option value="customer">{t('admin.users.role.customer')}</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors"
        >
          <option value="">{t('admin.users.allStatuses')}</option>
          <option value="active">{t('admin.users.status.active')}</option>
          <option value="inactive">{t('admin.users.status.inactive')}</option>
          <option value="suspended">{t('admin.users.status.suspended')}</option>
        </select>

        {(search || roleFilter || statusFilter) && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
            <X size={14} /> {t('admin.users.clearFilters')}
          </button>
        )}

        <button
          onClick={() => { setSelected(null); setModal("create"); }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm ml-auto"
        >
          <UserPlus size={15} weight="bold" />
          {t('admin.users.addAccount')}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-28 text-slate-400">
          <Spinner size={28} />
          <span className="text-sm">{t('admin.users.loading')}</span>
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-100 bg-red-50 py-16">
          <Warning size={28} weight="duotone" className="text-red-400" />
          <p className="text-sm text-red-600">{fetchError}</p>
          <button
            onClick={() => fetchUsers(page)}
            className="rounded-lg border border-red-200 px-4 py-1.5 text-sm text-red-600 hover:bg-red-100 transition-colors"
          >
            {t('admin.users.retry')}
          </button>
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-20">
          <Users size={40} weight="thin" className="text-slate-300" />
          <p className="text-sm font-medium text-slate-500">
            {t('admin.users.noResults')}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4">{t('admin.users.columns.user')}</th>
                  <th className="px-6 py-4">{t('admin.users.columns.role')}</th>
                  <th className="px-6 py-4">{t('admin.users.columns.tier')}</th>
                  <th className="px-6 py-4">{t('admin.users.columns.status')}</th>
                  <th className="px-6 py-4 text-right">{t('admin.users.columns.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div>
                        <div className="font-semibold text-slate-800">{u.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{u.email}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{u.phone || ''}</div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <TierBadge tier={u.tier} />
                        <span className="text-xs text-slate-500 flex items-center gap-0.5">
                          <Coins size={12} weight="fill" className="text-amber-500" />
                          {u.loyaltyPoints || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => { setSelected(u); setModal("detail"); }}
                          title={t('admin.users.tooltip.view')}
                          className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => { setSelected(u); setModal("edit"); }}
                          title={t('admin.users.tooltip.edit')}
                          className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                          <PencilSimple size={15} />
                        </button>
                        {u.role !== 'admin' ? (
                          <button
                            onClick={() => { setSelected(u); setModal("delete"); }}
                            title={t('admin.users.tooltip.delete')}
                            className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                            <Trash size={15} />
                          </button>
                        ) : (
                          <span className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-slate-200 cursor-not-allowed" title={t('admin.users.tooltip.deleteForbidden')}>
                            <Trash size={15} />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-500">
                {total > 0 ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} / ${total}` : t('admin.users.zeroResults')}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => fetchUsers(page - 1)} disabled={page <= 1 || loading}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {t('admin.users.previous')}
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...' ? (
                      <span key={`dots-${i}`} className="px-1 text-xs text-slate-400">...</span>
                    ) : (
                      <button key={p} onClick={() => fetchUsers(p)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          p === page ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}>{p}</button>
                    )
                  )}
                <button onClick={() => fetchUsers(page + 1)} disabled={page >= totalPages || loading}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {t('admin.users.next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {modal === "create" && (
        <Modal title={t('admin.users.create.title')} onClose={() => setModal(null)} wide>
          <CreateForm onSave={handleCreate} onCancel={() => setModal(null)} saving={saving} />
        </Modal>
      )}

      {modal === "edit" && selected && (
        <Modal title={t('admin.users.edit.title', { name: selected.name })} onClose={() => setModal(null)} wide>
          <EditForm
            initial={selected}
            onSave={handleUpdate}
            onCancel={() => setModal(null)}
            saving={saving}
          />
        </Modal>
      )}

      {modal === "detail" && selected && (
        <Modal title={t('admin.users.detail.title')} onClose={() => setModal(null)}>
          <DetailView user={selected} />
        </Modal>
      )}

      {modal === "blocked" && (
        <BlockDeleteModal
          title={t('admin.users.blocked.blockedTitle')}
          message={blockedMsg}
          onClose={() => { setModal(null); setBlockedMsg(''); }}
        />
      )}

      {modal === "delete" && selected && (
        <ConfirmDelete
          user={selected}
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
          deleting={deleting}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}