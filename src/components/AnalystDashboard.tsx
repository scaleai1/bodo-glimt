// ─── Analyst Visual Dashboard ──────────────────────────────────────────────────
// Health-score gauge + revenue attribution bars + smart-alert feed with
// one-click "Approve & Fix" actions (pause campaign / note inventory risk).

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getUserConfig }                          from '../lib/userConfig';
import {
  fetchAccountInsights,
  fetchCampaignInsights,
  pauseCampaign,
  type AdInsights,
  type CampaignInsight,
}                                                 from '../lib/metaAds';
import {
  fetchOrderStats,
  fetchInventoryAlerts,
  type InventoryAlert,
  type OrderStats,
  type SiteCredentials,
  type PlatformType,
}                                                 from '../lib/siteManager';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SmartAlert {
  id:          string;
  severity:    'critical' | 'warning' | 'opportunity';
  title:       string;
  description: string;
  actionLabel?: string;
  actionFn?:   () => Promise<void>;
}

interface DashboardData {
  metaInsights:     AdInsights | null;
  campaignInsights: CampaignInsight[];
  siteStats:        OrderStats | null;
  inventoryAlerts:  InventoryAlert[];
  alerts:           SmartAlert[];
  healthScore:      number;
  gapPercent:       number | null;
  lastUpdated:      Date;
}

// ─── Health score ─────────────────────────────────────────────────────────────

function computeHealth(gapPct: number | null): number {
  if (gapPct === null) return 50;
  const abs = Math.abs(gapPct);
  if (abs <=  5) return 96;
  if (abs <= 10) return 88;
  if (abs <= 20) return 74;
  if (abs <= 35) return 55;
  if (abs <= 50) return 38;
  return 22;
}

// ─── Smart alerts builder ─────────────────────────────────────────────────────

function buildAlerts(
  campaigns:  CampaignInsight[],
  inventory:  InventoryAlert[],
  gapPct:     number | null,
  token:      string,
  onRefresh:  () => void,
): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  // Attribution gap
  if (gapPct !== null) {
    if (gapPct > 20) {
      alerts.push({
        id: 'gap-over', severity: 'warning',
        title: `Attribution Discrepancy: Meta over-reports +${gapPct.toFixed(1)}%`,
        description: `Meta is counting ${gapPct.toFixed(1)}% more revenue than your store recorded. ` +
          `Likely cause: view-through window too wide. Recommended: 1-day click / no view.`,
      });
    } else if (gapPct < -10) {
      alerts.push({
        id: 'gap-under', severity: 'warning',
        title: `Under-Attribution: ${Math.abs(gapPct).toFixed(1)}% of sales not tracked`,
        description: `Meta Pixel is missing ${Math.abs(gapPct).toFixed(1)}% of actual purchases. ` +
          `Check pixel installation and verify events fire on the order-confirmation page.`,
      });
    }
  }

  // Campaign ROAS alerts
  for (const c of campaigns) {
    const r = c.insights.roas;
    const s = c.insights.spend;
    if (s < 5) continue; // skip tiny spend — not actionable

    if (c.status === 'ACTIVE' && r < 2.5) {
      alerts.push({
        id: `crit-${c.id}`, severity: 'critical',
        title: `CRITICAL: "${c.name}"`,
        description: `ROAS ${r.toFixed(2)}x — below break-even (2.5x). ` +
          `Burning $${s.toFixed(0)} with negative ROI. Immediate pause recommended.`,
        actionLabel: 'Pause Campaign',
        actionFn: async () => { await pauseCampaign(c.id, token); onRefresh(); },
      });
    } else if (c.status === 'ACTIVE' && r >= 5.0) {
      alerts.push({
        id: `scale-${c.id}`, severity: 'opportunity',
        title: `SCALE: "${c.name}"`,
        description: `ROAS ${r.toFixed(2)}x is a top performer. ` +
          `+15% budget increase (~$${(s * 0.15 / 30).toFixed(0)}/day extra) is recommended.`,
        actionLabel: 'Mark Reviewed',
        actionFn: async () => { /* acknowledged */ },
      });
    }
  }

  // Inventory alerts
  for (const a of inventory) {
    if (a.alertType === 'out_of_stock') {
      alerts.push({
        id: `oos-${a.productId}`, severity: 'critical',
        title: `Out of Stock: "${a.productName}"`,
        description: `Zero inventory. Any active campaigns targeting this product are wasting budget. ` +
          `${a.suggestedAction}`,
        actionLabel: 'Mark Reviewed',
        actionFn: async () => { /* acknowledged */ },
      });
    } else if (a.alertType === 'low_stock') {
      alerts.push({
        id: `low-${a.productId}`, severity: 'warning',
        title: `Low Stock: "${a.productName}"`,
        description: `Only ${a.currentStock} units remaining (sold ${a.soldLast30Days} last 30 days). ` +
          `Consider pausing or reducing budget for this SKU until restocked.`,
      });
    }
  }

  return alerts.slice(0, 8);
}

// ─── SVG Gauge ────────────────────────────────────────────────────────────────
// Semicircle arc from left (score=0) counterclockwise through top to right (score=100).

const Gauge: React.FC<{ score: number; size?: number }> = ({ score, size = 156 }) => {
  const r  = (size / 2) - 16;
  const cx = size / 2;
  const cy = size / 2;

  // Avoid degenerate arc at score = 0 or 100
  const clamped = Math.min(99.8, Math.max(0.2, score));
  const θ    = Math.PI * (1 - clamped / 100);
  const endX = (cx + r * Math.cos(θ)).toFixed(3);
  const endY = (cy - r * Math.sin(θ)).toFixed(3);

  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'HEALTHY'  : score >= 60 ? 'MODERATE' : 'AT RISK';

  // Track: full top semicircle (slightly short of full 180° to avoid SVG degeneracy)
  const trackEnd = `${(cx + r - 0.01).toFixed(3)} ${cy}`;

  return (
    <svg width={size} height={size / 2 + 28} viewBox={`0 0 ${size} ${size / 2 + 28}`}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${trackEnd}`}
        fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={13} strokeLinecap="round"
      />
      {/* Progress */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${endX} ${endY}`}
        fill="none" stroke={color} strokeWidth={13} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 5px ${color})` }}
      />
      {/* Score */}
      <text x={cx} y={cy - 6} textAnchor="middle" fill={color}
        fontSize={Math.round(size * 0.22)} fontWeight="900" fontFamily="inherit">
        {score}
      </text>
      {/* Label */}
      <text x={cx} y={cy + 12} textAnchor="middle" fill={color}
        fontSize={10} fontWeight="700" letterSpacing="2" fontFamily="inherit">
        {label}
      </text>
      {/* Axis ticks */}
      <text x={cx - r - 3} y={cy + 20} textAnchor="end"   fill="#374151" fontSize={9} fontFamily="inherit">0</text>
      <text x={cx + r + 3} y={cy + 20} textAnchor="start" fill="#374151" fontSize={9} fontFamily="inherit">100</text>
    </svg>
  );
};

// ─── Attribution Bar Chart ─────────────────────────────────────────────────────

const AttributionBars: React.FC<{
  metaRevenue: number;
  siteRevenue: number;
  gapPct:      number | null;
  accent:      string;
}> = ({ metaRevenue, siteRevenue, gapPct, accent }) => {
  const max   = Math.max(metaRevenue, siteRevenue, 1);
  const metaW = (metaRevenue / max) * 100;
  const siteW = (siteRevenue / max) * 100;

  const gapColor =
    gapPct === null            ? '#6b7280' :
    Math.abs(gapPct) <= 20    ? '#10b981' : '#ef4444';

  const fmt = (n: number) =>
    n >= 10000 ? `$${(n / 1000).toFixed(1)}k` :
    n >= 1000  ? `$${(n / 1000).toFixed(2)}k` :
    `$${n.toFixed(0)}`;

  const Bar: React.FC<{ label: string; value: number; pct: number; color: string }> = (
    { label, value, pct, color }
  ) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{fmt(value)}</span>
      </div>
      <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 6, transition: 'width 1s ease',
        }} />
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <Bar label="Meta Reported"  value={metaRevenue} pct={metaW} color="#3b82f6" />
      <Bar label="Actual Store"   value={siteRevenue} pct={siteW} color={accent}  />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 2 }}>
        <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Attribution Gap
        </span>
        <span style={{ fontSize: 15, fontWeight: 900, color: gapColor }}>
          {gapPct !== null ? `${gapPct > 0 ? '+' : ''}${gapPct.toFixed(1)}%` : 'N/A'}
        </span>
        {gapPct !== null && Math.abs(gapPct) <= 20 && (
          <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>✓ within tolerance</span>
        )}
      </div>
    </div>
  );
};

// ─── Alert item ────────────────────────────────────────────────────────────────

const AlertItem: React.FC<{
  alert:   SmartAlert;
  onFix:   (id: string) => void;
  working: boolean;
  done:    boolean;
}> = ({ alert, onFix, working, done }) => {
  const theme = {
    critical:    { bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.22)',   dot: '#ef4444', btn: '#fca5a5' },
    warning:     { bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.22)',  dot: '#f59e0b', btn: '#fcd34d' },
    opportunity: { bg: 'rgba(16,185,129,0.07)',  border: 'rgba(16,185,129,0.22)', dot: '#10b981', btn: '#6ee7b7' },
  }[alert.severity];

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 11,
      padding: '11px 13px',
      background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 9,
    }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5,
        background: theme.dot, boxShadow: `0 0 5px ${theme.dot}`,
        animation: alert.severity === 'critical' ? 'pulse 2s ease-in-out infinite' : 'none',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#f1f5f9', marginBottom: 3 }}>
          {alert.title}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.55 }}>
          {alert.description}
        </div>
      </div>
      {alert.actionLabel && !done && (
        <button
          onClick={() => onFix(alert.id)}
          disabled={working}
          style={{
            flexShrink: 0, padding: '5px 11px',
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: 6, cursor: working ? 'wait' : 'pointer',
            color: theme.btn, fontSize: 10, fontWeight: 700,
            opacity: working ? 0.6 : 1, whiteSpace: 'nowrap',
            transition: 'opacity 0.2s',
          }}
        >
          {working ? '…' : `✓ ${alert.actionLabel}`}
        </button>
      )}
      {done && (
        <span style={{ flexShrink: 0, fontSize: 10, color: '#10b981', fontWeight: 700 }}>✓ Done</span>
      )}
    </div>
  );
};

// ─── Stat pill ─────────────────────────────────────────────────────────────────

const Stat: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 9, color: accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>
      {label}
    </div>
  </div>
);

// ─── Main component ────────────────────────────────────────────────────────────

export const AnalystDashboard: React.FC<{ accent?: string }> = ({ accent = '#06b6d4' }) => {
  const [data,       setData]       = useState<DashboardData | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [workingIds, setWorkingIds] = useState<Set<string>>(new Set());
  const [doneIds,    setDoneIds]    = useState<Set<string>>(new Set());

  const cfg          = getUserConfig();
  const accessToken  = (import.meta.env.VITE_META_ACCESS_TOKEN  as string) || cfg.metaAccessToken;
  const adAccountId  = (import.meta.env.VITE_META_AD_ACCOUNT_ID as string) || cfg.metaAdAccountId;
  const siteCreds: SiteCredentials | null =
    cfg.siteApiUrl && cfg.siteAdminApiKey && cfg.sitePlatformType
      ? { apiUrl: cfg.siteApiUrl, apiKey: cfg.siteAdminApiKey, platform: cfg.sitePlatformType as PlatformType }
      : null;

  const metaReady = !!(accessToken && adAccountId);
  const siteReady = !!siteCreds;

  const load = useCallback(async () => {
    if (!metaReady && !siteReady) return;
    setLoading(true);
    setError(null);

    try {
      const [metaRes, campaignRes, siteRes, invRes] = await Promise.allSettled([
        metaReady ? fetchAccountInsights(adAccountId, accessToken)        : Promise.reject('no-meta'),
        metaReady ? fetchCampaignInsights(adAccountId, accessToken)       : Promise.resolve([] as CampaignInsight[]),
        siteReady ? fetchOrderStats(siteCreds!, 30)                       : Promise.resolve(null as OrderStats | null),
        siteReady ? fetchInventoryAlerts(siteCreds!)                      : Promise.resolve([] as InventoryAlert[]),
      ]);

      const metaInsights     = metaRes.status      === 'fulfilled' ? metaRes.value      : null;
      const campaignInsights = campaignRes.status  === 'fulfilled' ? campaignRes.value  : [];
      const siteStats        = siteRes.status      === 'fulfilled' ? siteRes.value      : null;
      const inventoryAlerts  = invRes.status       === 'fulfilled' ? invRes.value       : [];

      const metaRev = metaInsights?.conversionValue ?? 0;
      const siteRev = siteStats?.revenue ?? 0;
      const gapPct  = siteRev > 0 ? ((metaRev - siteRev) / siteRev) * 100 : null;

      setData({
        metaInsights,
        campaignInsights,
        siteStats,
        inventoryAlerts,
        alerts:      buildAlerts(campaignInsights, inventoryAlerts, gapPct, accessToken, load),
        healthScore: computeHealth(gapPct),
        gapPercent:  gapPct,
        lastUpdated: new Date(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [metaReady, siteReady, accessToken, adAccountId, siteCreds]);

  useEffect(() => { void load(); }, [load]);

  const handleFix = async (alertId: string) => {
    const alert = data?.alerts.find(a => a.id === alertId);
    if (!alert?.actionFn) return;
    setWorkingIds(prev => new Set(prev).add(alertId));
    try {
      await alert.actionFn();
      setDoneIds(prev => new Set(prev).add(alertId));
    } catch (e) {
      console.error('Action failed:', e);
    } finally {
      setWorkingIds(prev => { const s = new Set(prev); s.delete(alertId); return s; });
    }
  };

  // ── No credentials ──────────────────────────────────────────────────────────
  if (!metaReady && !siteReady) {
    return (
      <div style={{
        padding: '16px 20px', marginBottom: 12,
        background: 'rgba(0,0,0,0.18)', border: '1px solid var(--brand-muted)',
        borderRadius: 12, fontSize: 12, color: '#6b7280', textAlign: 'center',
      }}>
        Connect <strong style={{ color: '#9ca3af' }}>Meta Ads</strong> or your{' '}
        <strong style={{ color: '#9ca3af' }}>store</strong> in Settings to activate the live dashboard.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: accent,
            textTransform: 'uppercase', letterSpacing: '0.12em',
          }}>
            Live Dashboard
          </span>
          {data && (
            <span style={{ fontSize: 10, color: '#4b5563' }}>
              · {data.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={load} disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 11px', borderRadius: 7,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
            color: '#6b7280', fontSize: 11, fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '8px 14px', marginBottom: 10,
          background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.22)',
          borderRadius: 8, fontSize: 11, color: '#fca5a5',
        }}>
          {error}
        </div>
      )}

      {/* ── Grid: Gauge + Attribution ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>

        {/* Health gauge */}
        <div style={{
          padding: '18px 14px',
          background: 'rgba(0,0,0,0.22)', border: '1px solid var(--brand-muted)',
          borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Attribution Health
          </span>

          {data
            ? <Gauge score={data.healthScore} size={156} />
            : <div style={{ height: 90, display: 'flex', alignItems: 'center', color: '#374151', fontSize: 12 }}>
                {loading ? 'Loading…' : '—'}
              </div>
          }

          {data?.metaInsights && (
            <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
              <Stat label="ROAS"  value={`${data.metaInsights.roas.toFixed(2)}x`}   accent={accent} />
              <Stat label="Spend" value={`$${data.metaInsights.spend.toFixed(0)}`}  accent={accent} />
              <Stat label="CTR"   value={`${data.metaInsights.ctr.toFixed(2)}%`}    accent={accent} />
            </div>
          )}
        </div>

        {/* Attribution bars */}
        <div style={{
          padding: '18px 16px',
          background: 'rgba(0,0,0,0.22)', border: '1px solid var(--brand-muted)',
          borderRadius: 12,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 16 }}>
            Revenue Attribution
          </span>

          {data ? (
            <AttributionBars
              metaRevenue={data.metaInsights?.conversionValue ?? 0}
              siteRevenue={data.siteStats?.revenue ?? 0}
              gapPct={data.gapPercent}
              accent={accent}
            />
          ) : (
            <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', fontSize: 11 }}>
              {loading ? 'Loading…' : siteReady ? '—' : 'Connect your store in Settings →'}
            </div>
          )}

          {data?.siteStats && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--brand-muted)', display: 'flex', gap: 16 }}>
              <Stat label="Orders"  value={String(data.siteStats.orders)}                              accent={accent} />
              <Stat label="AOV"     value={`$${data.siteStats.avgOrderValue.toFixed(0)}`}              accent={accent} />
              <Stat label="Revenue" value={`$${(data.siteStats.revenue / 1000).toFixed(1)}k`}          accent={accent} />
            </div>
          )}
        </div>
      </div>

      {/* ── Smart Alerts feed ── */}
      {data && data.alerts.length > 0 && (
        <div style={{
          padding: '14px 14px 12px',
          background: 'rgba(0,0,0,0.18)', border: '1px solid var(--brand-muted)',
          borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Smart Alerts
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: data.alerts.some(a => a.severity === 'critical')
                ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
              color: data.alerts.some(a => a.severity === 'critical') ? '#ef4444' : '#f59e0b',
            }}>
              {data.alerts.length} active
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {data.alerts.map(alert => (
              <AlertItem
                key={alert.id}
                alert={alert}
                onFix={handleFix}
                working={workingIds.has(alert.id)}
                done={doneIds.has(alert.id)}
              />
            ))}
          </div>
        </div>
      )}

      {data && data.alerts.length === 0 && !loading && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)',
          borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 13 }}>✅</span>
          <span style={{ fontSize: 11, color: '#6ee7b7', fontWeight: 600 }}>
            All systems healthy — no alerts detected.
          </span>
        </div>
      )}
    </div>
  );
};
