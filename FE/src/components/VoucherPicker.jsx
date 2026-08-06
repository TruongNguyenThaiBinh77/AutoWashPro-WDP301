import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmDialog } from '@/lib/confirm';
import useSSE from '@/hooks/useSSE';
import { showToast } from '@/lib/toast';

function formatCurrency(v) {
  return `${new Intl.NumberFormat('vi-VN').format(v || 0)}đ`;
}

function DiscountBadge({ voucher, orderAmount, t }) {
  const savingsAmount = (() => {
    if (!orderAmount || !voucher) return 0;
    if (voucher.type === 'percentage') {
      const d = Math.floor(orderAmount * voucher.value / 100);
      return voucher.maxDiscount > 0 ? Math.min(d, voucher.maxDiscount) : d;
    }
    return Math.min(voucher.value || 0, orderAmount);
  })();

  if (voucher.type === 'percentage') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981', lineHeight: 1 }}>
          -{voucher.value}%
        </span>
        {voucher.maxDiscount > 0 && (
          <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
            {t('maxDiscount', { amount: formatCurrency(voucher.maxDiscount) })}
          </span>
        )}
        {savingsAmount > 0 && orderAmount > 0 && (
          <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700 }}>
            ≈ -{formatCurrency(savingsAmount)}
          </span>
        )}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981', lineHeight: 1 }}>
        -{formatCurrency(voucher.value)}
      </span>
    </div>
  );
}

function VoucherCard({ voucher, onSelect, selected, userPoints, orderAmount, t }) {
  const needsPoints   = voucher.requiredPoints > 0;
  const canAfford     = !needsPoints || (userPoints || 0) >= voucher.requiredPoints;
  const meetsMinOrder = !orderAmount || !voucher.minOrder || orderAmount >= voucher.minOrder;
  const isDisabled    = (needsPoints && !canAfford) || !meetsMinOrder;
  const isSelected    = selected?.code === voucher.code;

  return (
    <button
      type="button"
      onClick={() => !isDisabled && onSelect(isSelected ? null : voucher)}
      disabled={isDisabled}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        borderRadius: 14,
        border: isSelected ? '2px solid #10b981' : isDisabled ? '1.5px solid #e2e8f0' : '1.5px solid #e2e8f0',
        background: isSelected ? 'rgba(16,185,129,0.04)' : '#fff',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.55 : 1,
        transition: 'all 0.18s',
        overflow: 'hidden',
        boxShadow: isSelected ? '0 0 0 3px rgba(16,185,129,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
        textAlign: 'left',
        position: 'relative',
      }}
    >
      {/* Left accent stripe */}
      <div style={{
        width: 5,
        flexShrink: 0,
        background: isSelected
          ? 'linear-gradient(180deg, #10b981, #0d9488)'
          : isDisabled
            ? '#e2e8f0'
            : 'linear-gradient(180deg, #d1fae5, #a7f3d0)',
      }} />

      {/* Main content */}
      <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.06em',
                padding: '2px 7px', borderRadius: 6,
                background: isSelected ? 'rgba(16,185,129,0.12)' : '#f1f5f9',
                color: isSelected ? '#059669' : '#475569',
                fontFamily: 'monospace',
              }}>
                {voucher.code}
              </span>
              {needsPoints && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#d97706', padding: '1px 5px', borderRadius: 4, background: 'rgba(217,119,6,0.08)' }}>
                  ⭐ {voucher.requiredPoints.toLocaleString('vi-VN')} {t('points')}
                </span>
              )}
              {isSelected && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#fff', padding: '1px 6px', borderRadius: 4, background: '#10b981' }}>
                  {t('inUse')}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', marginTop: 4, lineHeight: 1.35 }}>
              {voucher.name}
            </div>
            {voucher.description && (
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>
                {voucher.description}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
              {voucher.minOrder > 0 && (
                <span style={{
                  fontSize: '0.65rem', fontWeight: 600,
                  padding: '2px 6px', borderRadius: 4,
                  background: meetsMinOrder ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  color: meetsMinOrder ? '#059669' : '#dc2626',
                }}>
                  {meetsMinOrder ? '✓' : '✗'} {t('minOrder', { amount: formatCurrency(voucher.minOrder) })}
                </span>
              )}
              {needsPoints && !canAfford && (
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
                  ✗ {t('notEnoughPoints', { points: (voucher.requiredPoints - userPoints).toLocaleString('vi-VN') })}
                </span>
              )}
              {needsPoints && canAfford && (
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.08)', color: '#059669' }}>
                  ✓ {t('enoughPoints')}
                </span>
              )}
              {(voucher.remaining || 0) > 0 && (
                <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#f8fafc', color: '#64748b' }}>
                  {t('remaining', { count: voucher.remaining })}
                </span>
              )}
            </div>
          </div>
          <DiscountBadge voucher={voucher} orderAmount={orderAmount} t={t} />
        </div>
      </div>
    </button>
  );
}

export default function VoucherPicker({ apiBase, token, selected, onSelect, orderAmount = 0, compact = false, branchId }) {
  const { t } = useTranslation('promotion');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [manualMsg, setManualMsg] = useState('');
  const [activeTab, setActiveTab] = useState('public');
  const [open, setOpen] = useState(!compact);
  const [tierList, setTierList] = useState([]);

  const loadTiers = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/loyalty/tiers`);
      const json = await res.json();
      if (Array.isArray(json?.data)) setTierList(json.data);
    } catch (e) { /* keep fallback */ }
  }, [apiBase]);

  useEffect(() => { loadTiers(); }, [loadTiers]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const params = branchId ? `?branchId=${branchId}` : '';
      const res = await fetch(`${apiBase}/vouchers/available${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || t('loadError'));
      setData(json.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [apiBase, token, branchId, t]);

  useEffect(() => { load(); }, [load]);

  // SSE Realtime Updates
  useSSE(token, 'vouchers_updated', load);

  async function applyManual() {
    const code = manualCode.trim().toUpperCase();
    if (!code) { setManualMsg(t('enterCode')); return; }
    try {
      const params = branchId ? `?branchId=${branchId}` : '';
      const res = await fetch(`${apiBase}/vouchers/code/${code}${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || t('invalidCode'));
      onSelect(json.data);
      setManualMsg(`✓ ${t('codeApplied')}`);
      setManualCode('');
    } catch (e) { onSelect(null); setManualMsg(e.message); }
  }

  async function handleSelectVoucher(voucher) {
    if (!voucher) { onSelect(null); return; }
    const needsPoints = voucher.requiredPoints > 0;
    if (needsPoints && voucher.isTemplate) {
      if (!(await confirmDialog({ title: t('redeemTitle'), message: t('redeemConfirm', { points: voucher.requiredPoints, name: voucher.name }), confirmLabel: t('redeemButton') }))) return;
      try {
        setLoading(true);
        const res = await fetch(`${apiBase}/vouchers/redeem-points`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ templateId: voucher._id })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || t('redeemError'));
        const realVoucher = json.data;
        onSelect(realVoucher);
        showToast(t('redeemSuccess', { code: realVoucher.code }));
        load();
      } catch (e) { showToast(e.message); }
      finally { setLoading(false); }
    } else { onSelect(voucher); }
  }

  const savings = (() => {
    if (!selected || !orderAmount) return 0;
    if (selected.type === 'percentage') {
      const d = Math.floor(orderAmount * selected.value / 100);
      return selected.maxDiscount > 0 ? Math.min(d, selected.maxDiscount) : d;
    }
    return Math.min(selected.value, orderAmount);
  })();

  const userPoints = data?.user?.loyaltyPoints || 0;
  const userTier   = data?.user?.tier || 'bronze';
  const tierObj    = tierList.find(t2 => (t2.id || '').toLowerCase() === String(userTier).toLowerCase());
  const tierMeta   = {
    label: tierObj?.name || userTier || 'Thành viên',
    icon: tierObj?.icon === 'Circle' ? '●' : (tierObj?.icon ? '◆' : '★'),
    bg: tierObj?.bg || '#f1f5f9',
    color: tierObj?.color || '#475569',
    ring: tierObj?.border || '#e2e8f0',
  };
  const tierCount  = (data?.tier_exclusive || []).length;
  const pubCount   = (data?.public || []).length;
  const ptsCount   = (data?.redeemable || []).length;

  // Tab definitions
  const tabs = [
    { id: 'public', icon: '🏷️', label: t('tabPublic'), count: pubCount },
    ...(tierCount > 0 ? [{ id: 'tier', icon: tierMeta.icon, label: t('tabTier', { tier: tierMeta.label }), count: tierCount }] : []),
    { id: 'points', icon: '⭐', label: t('tabPoints'), count: ptsCount },
  ];

  return (
    <div style={{ borderRadius: 16, border: '1.5px solid #e2e8f0', overflow: 'hidden', background: '#fff' }}>

      {/* ── Header / Toggle ── */}
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '12px 14px',
          background: open ? 'rgba(16,185,129,0.04)' : '#fff',
          border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid #e2e8f0' : 'none',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', flexShrink: 0,
          }}>🏷️</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#10b981', letterSpacing: '0.03em' }}>
              {t('headerTitle')}
            </div>
            {selected ? (
              <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>{selected.code}</span>
                {savings > 0 && <span style={{ color: '#10b981', fontWeight: 600 }}>— {t('saving')} {formatCurrency(savings)}</span>}
              </div>
            ) : (
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>{t('selectPrompt')}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Tier pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 700,
            background: tierMeta.bg, color: tierMeta.color,
            border: `1px solid ${tierMeta.ring}`,
          }}>
            {tierMeta.icon} {tierMeta.label}
          </div>
          {/* Points pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            padding: '3px 9px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 700,
            background: 'rgba(16,185,129,0.08)', color: '#10b981',
            border: '1px solid rgba(16,185,129,0.2)',
          }}>
            ⭐ {userPoints.toLocaleString('vi-VN')}
          </div>
          {/* Arrow */}
          <svg style={{ width: 16, height: 16, color: '#94a3b8', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {open && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Manual code input ── */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualCode}
              onChange={e => { setManualCode(e.target.value.toUpperCase()); setManualMsg(''); }}
              onKeyDown={e => e.key === 'Enter' && applyManual()}
              placeholder={t('codePlaceholder')}
              style={{
                flex: 1, padding: '9px 13px', borderRadius: 10,
                border: '1.5px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 600,
                fontFamily: 'monospace', letterSpacing: '0.05em', outline: 'none',
                background: '#f8fafc', color: '#1e293b',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#10b981'; e.target.style.background = '#fff'; }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
            />
            <button type="button" onClick={applyManual} style={{
              padding: '9px 16px', borderRadius: 10, border: 'none',
              background: '#10b981', color: '#fff', fontSize: '0.8rem', fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s',
            }}
              onMouseOver={e => e.target.style.background = '#059669'}
              onMouseOut={e => e.target.style.background = '#10b981'}
            >
              {t('applyButton')}
            </button>
            {selected && (
              <button type="button" onClick={() => { onSelect(null); setManualMsg(''); setManualCode(''); }} style={{
                padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: '#fff', fontSize: '0.8rem', cursor: 'pointer', color: '#64748b',
                transition: 'all 0.15s',
              }}>
                ✕
              </button>
            )}
          </div>

          {manualMsg && (
            <div style={{
              padding: '8px 12px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600,
              background: manualMsg.startsWith('✓') ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              color: manualMsg.startsWith('✓') ? '#10b981' : '#dc2626',
              border: `1px solid ${manualMsg.startsWith('✓') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>{manualMsg}</div>
          )}

          {/* ── Tabs ── */}
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 12, padding: 4 }}>
            {tabs.map(tab => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{
                flex: 1, padding: '7px 8px', borderRadius: 9, border: 'none', fontSize: '0.75rem',
                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                background: activeTab === tab.id ? '#fff' : 'transparent',
                color: activeTab === tab.id ? '#10b981' : '#64748b',
                boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}>
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.count > 0 && (
                  <span style={{
                    minWidth: 18, height: 18, borderRadius: 9, fontSize: '0.65rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                    background: activeTab === tab.id ? '#10b981' : '#cbd5e1',
                    color: activeTab === tab.id ? '#fff' : '#475569',
                  }}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Loading / Error ── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              {t('loading')}
            </div>
          )}
          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 10, fontSize: '0.78rem', background: 'rgba(239,68,68,0.07)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1rem' }}>⚠️</span>
              <span style={{ flex: 1 }}>{error}</span>
              <button type="button" onClick={load} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>{t('retry')}</button>
            </div>
          )}

          {/* ── Tab Content ── */}
          {data && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Public tab */}
              {activeTab === 'public' && (
                pubCount === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '0.82rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 6 }}>🎫</div>
                    {t('noPublicVouchers')}
                  </div>
                ) : data.public.map(v => (
                  <VoucherCard key={v._id} voucher={v} onSelect={handleSelectVoucher} selected={selected} userPoints={userPoints} orderAmount={orderAmount} t={t} />
                ))
              )}

              {/* Tier exclusive tab */}
              {activeTab === 'tier' && (
                tierCount === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '0.82rem' }}>
                    {t('noTierVouchers', { tier: tierMeta.label })}
                  </div>
                ) : (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
                      background: tierMeta.bg, border: `1px solid ${tierMeta.ring}`, fontSize: '0.78rem', fontWeight: 600, color: tierMeta.color,
                    }}>
                      {tierMeta.icon} {t('tierExclusive', { tier: tierMeta.label })}
                    </div>
                    {data.tier_exclusive.map(v => (
                      <VoucherCard key={v._id} voucher={v} onSelect={handleSelectVoucher} selected={selected} userPoints={userPoints} orderAmount={orderAmount} t={t} />
                    ))}
                  </>
                )
              )}

              {/* Points redemption tab */}
              {activeTab === 'points' && (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.05)',
                    border: '1px solid rgba(16,185,129,0.15)',
                  }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{t('yourPoints')}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>{t('redeemHint')}</div>
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981' }}>
                      ⭐ {userPoints.toLocaleString('vi-VN')}
                    </div>
                  </div>
                  {ptsCount === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '0.82rem' }}>
                      <div style={{ fontSize: '2rem', marginBottom: 6 }}>⭐</div>
                      {t('noRedeemable')}
                    </div>
                  ) : data.redeemable.map(v => (
                    <VoucherCard key={v._id} voucher={v} onSelect={handleSelectVoucher} selected={selected} userPoints={userPoints} orderAmount={orderAmount} t={t} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── Savings Preview Bar ── */}
          {selected && savings > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 12, marginTop: 4,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(13,148,136,0.06))',
              border: '1px solid rgba(16,185,129,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1rem' }}>🎉</span>
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{t('saving')}</div>
                  {orderAmount > 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 1 }}>
                      {formatCurrency(orderAmount)} → <strong style={{ color: '#10b981' }}>{formatCurrency(Math.max(0, orderAmount - savings))}</strong>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#10b981' }}>
                -{formatCurrency(savings)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
