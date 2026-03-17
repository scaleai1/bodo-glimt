import React, { useEffect, useRef, useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import type { DiagnosisReport } from '../lib/zolter-engine';

interface InsightTile {
  type: string;
  title: string;
  metric: string;
  context: string;
  action: 'SCALE' | 'PAUSE' | 'INVESTIGATE' | 'OPTIMIZE';
  color: 'green' | 'red' | 'orange' | 'yellow';
  emoji: string;
}

interface LiveInsightsTilesProps {
  report: DiagnosisReport;
  fileNames: string[];
  secondFileContent?: string;
}

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

const SYSTEM_PROMPT = `You are "Zolter" — Strategic AI Analyst for E-commerce.

Generate exactly 10 Insight Tiles. You MUST cover ALL of the following dimensions — do not skip any that have data:

MANDATORY ANALYSIS DIMENSIONS:
1. PLATFORM — Which platform leads? Which is wasting budget? Compare ROAS across all platforms.
2. COUNTRY/GEO — Which countries convert best? Worst? Any hidden geo opportunity?
3. CAMPAIGN — Top performer and worst performer with exact numbers.
4. CREATIVE FORMAT — Video vs Static performance gap if data exists.
5. AUDIENCE — Retargeting vs Prospecting ROAS ratio (must be ≥ 2×).
6. CONVERSION RATE — Which campaign/country/platform has the worst CR? What does it cost?
7. BUDGET ALLOCATION — Is budget going to the right places? What's the opportunity cost?
8. FUNNEL — Where are users dropping? Which step is the biggest leak?
9. PRODUCTS — If product data exists, which product drives the most revenue or has the highest AOV?
10. CROSS-FILE INSIGHT — If two files: connect campaign spend to product/ecommerce outcomes.

Rules:
- NEVER state the obvious. Every tile must reveal something the user hasn't immediately noticed.
- Use EXACT numbers from the data. No approximations.
- Every tile must drive an immediate action.
- Context sentence: max 14 words, must be action-oriented.
- If a dimension has no data, replace with the next most valuable insight from the data.

Zolter Algorithm:
- ROAS > 5.0 = SCALE | 3.0–5.0 = OPTIMIZE | < 3.0 = CRITICAL (break-even = 2.5x, 40% margin)
- Retargeting ROAS must be ≥ 2× Prospecting
- Funnel drop > 30% = DROP | > 50% = FLOW OBSTACLE
- Cart→Checkout drop > 40% = CHECKOUT FRICTION

Return ONLY a JSON array — no markdown, no explanation, no extra text:
[
  {"type":"winner|leak|geo|product|creative|audience|funnel|cross|budget|trend|alert","title":"Max 5 words","metric":"Label: exact value","context":"One sharp action sentence.","action":"SCALE|PAUSE|INVESTIGATE|OPTIMIZE","color":"green|red|orange|yellow","emoji":"single emoji"}
]`;

const colorConfig = {
  green:  { border: 'border-success-green/30',      bg: 'bg-success-green/5',   metric: 'text-success-green',   badge: 'bg-success-green/15 text-success-green border-success-green/30' },
  red:    { border: 'border-danger-red/30',          bg: 'bg-danger-red/5',      metric: 'text-danger-red',      badge: 'bg-danger-red/15 text-danger-red border-danger-red/30' },
  orange: { border: 'border-yellow-500/30',          bg: 'bg-yellow-500/5',      metric: 'text-yellow-400',      badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  yellow: { border: 'border-electric-yellow/30',     bg: 'bg-electric-yellow/5', metric: 'text-electric-yellow', badge: 'bg-electric-yellow/15 text-electric-yellow border-electric-yellow/30' },
};

const actionLabel: Record<string, string> = {
  SCALE: '⚡ SCALE', PAUSE: '🟥 PAUSE', INVESTIGATE: '🔍 INVESTIGATE', OPTIMIZE: '⚙️ OPTIMIZE',
};

const SkeletonTile: React.FC = () => (
  <div className="bg-card-dark border border-border-dark rounded-xl p-4 flex flex-col gap-3 animate-pulse min-h-[130px]">
    <div className="flex items-center justify-between">
      <div className="h-3 bg-border-dark rounded w-2/3" />
      <div className="h-4 bg-border-dark rounded w-16" />
    </div>
    <div className="h-6 bg-border-dark rounded w-1/2" />
    <div className="h-3 bg-border-dark rounded w-full mt-1" />
    <div className="h-3 bg-border-dark rounded w-3/4" />
  </div>
);

export const LiveInsightsTiles: React.FC<LiveInsightsTilesProps> = ({
  report,
  fileNames,
  secondFileContent,
}) => {
  const [tiles, setTiles]         = useState<InsightTile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState('');
  const lastKey = useRef('');

  // Build a compact key to detect when data actually changes
  const reportKey = `${report.totalRevenue}|${report.campaigns.length}|${report.funnelSteps.length}|${report.flags.length}|${fileNames.join(',')}`;

  useEffect(() => {
    if (reportKey === lastKey.current) return;
    if (report.campaigns.length === 0 && report.funnelSteps.length === 0) return;
    lastKey.current = reportKey;
    generateTiles();
  }, [reportKey]);

  const generateTiles = async () => {
    setIsLoading(true);
    setTiles([]);
    setError('');

    // Full data payload — all dimensions
    const allCampaigns = [...report.campaigns].sort((a, b) => b.revenue - a.revenue);

    // Platform aggregation
    const byPlatform: Record<string, { spend: number; revenue: number; conversions: number; count: number }> = {};
    for (const c of report.campaigns) {
      const k = c.platform || 'Unknown';
      if (!byPlatform[k]) byPlatform[k] = { spend: 0, revenue: 0, conversions: 0, count: 0 };
      byPlatform[k].spend       += c.spend;
      byPlatform[k].revenue     += c.revenue;
      byPlatform[k].conversions += c.conversions;
      byPlatform[k].count++;
    }
    const platformStats = Object.entries(byPlatform).map(([platform, v]) => ({
      platform, spend: v.spend, revenue: v.revenue,
      roas: v.spend > 0 ? +(v.revenue / v.spend).toFixed(2) : 0,
      conversions: v.conversions, campaigns: v.count,
    })).sort((a, b) => b.roas - a.roas);

    // Audience type aggregation
    const byAudience: Record<string, { spend: number; revenue: number; count: number }> = {};
    for (const c of report.campaigns) {
      const k = c.audienceType || 'Unknown';
      if (!byAudience[k]) byAudience[k] = { spend: 0, revenue: 0, count: 0 };
      byAudience[k].spend   += c.spend;
      byAudience[k].revenue += c.revenue;
      byAudience[k].count++;
    }

    const payload = {
      files: fileNames,
      hasSecondFile: !!secondFileContent,
      summary: {
        totalRevenue: report.totalRevenue,
        totalSpend: report.totalSpend,
        blendedRoas: +report.blendedRoas.toFixed(2),
        totalCampaigns: report.campaigns.length,
        criticalCount: report.criticalCampaigns.length,
        scalerCount: report.campaigns.filter((c) => c.status === 'SCALE').length,
      },
      // All campaigns — sorted by revenue
      campaigns: allCampaigns.map((c) => ({
        name: c.name,
        platform: c.platform,
        country: c.country,
        spend: c.spend,
        revenue: c.revenue,
        roas: +c.roas.toFixed(2),
        ctr: +c.ctr.toFixed(2),
        cr: +c.conversionRate.toFixed(2),
        conversions: c.conversions,
        grossProfit: +c.grossProfit.toFixed(0),
        roi: +c.roi.toFixed(1),
        status: c.status,
        audience: c.audienceType,
        format: c.format,
        placement: c.placement,
      })),
      // Platform breakdown
      platformBreakdown: platformStats,
      // All geo stats — every country
      geoBreakdown: report.geoStats.map((g) => ({
        country: g.country,
        roas: +g.roas.toFixed(2),
        revenue: g.revenue,
        spend: g.spend,
        aov: +g.aov.toFixed(0),
        cr: +g.cr.toFixed(2),
        flag: g.flag,
      })),
      // Audience type comparison
      audienceBreakdown: Object.entries(byAudience).map(([type, v]) => ({
        type, spend: v.spend, revenue: v.revenue,
        roas: v.spend > 0 ? +(v.revenue / v.spend).toFixed(2) : 0,
        campaigns: v.count,
      })),
      // Top/bottom performers
      topScorer: report.topScorer ? {
        name: report.topScorer.name, roas: +report.topScorer.roas.toFixed(2),
        platform: report.topScorer.platform, country: report.topScorer.country,
        spend: report.topScorer.spend, revenue: report.topScorer.revenue,
      } : null,
      criticalCampaigns: report.criticalCampaigns.map((c) => ({
        name: c.name, spend: c.spend, roas: +c.roas.toFixed(2),
        platform: c.platform, country: c.country,
      })),
      // Funnel
      funnel: report.funnelSteps.map((s) => ({
        step: s.label, users: s.users, dropPct: +s.dropPct.toFixed(1), alert: s.alertLevel,
      })),
      biggestLeak: report.biggestLeak,
      checkoutFriction: report.checkoutFriction,
      // Diagnostic flags
      flags: report.flags.map((f) => ({
        type: f.type, severity: f.severity, message: f.message, fix: f.recommendation,
      })),
    };

    try {
      // Use non-streaming call for structured JSON — more reliable
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2400,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Files: ${fileNames.join(' + ')}\n\n${JSON.stringify(payload)}`,
        }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      // Extract JSON array from response
      const arrMatch = text.match(/\[[\s\S]*\]/);
      if (!arrMatch) throw new Error('No JSON array in response');

      const parsed: InsightTile[] = JSON.parse(arrMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty tiles array');

      setTiles(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoading && tiles.length === 0 && !error) return null;

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-0.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-electric-yellow animate-pulse" />
          <h2 className="text-white font-display font-black uppercase tracking-widest text-xs">
            Zolter Live Insights
          </h2>
          {!isLoading && tiles.length > 0 && (
            <span className="text-text-secondary text-[10px] font-mono hidden sm:inline">
              — {fileNames.join(' + ')}
            </span>
          )}
        </div>
        {!isLoading && (
          <button
            onClick={generateTiles}
            className="text-[10px] text-text-secondary hover:text-electric-yellow uppercase tracking-wider font-bold transition-colors"
          >
            ↺ Refresh
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => <SkeletonTile key={i} />)}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between bg-card-dark border border-border-dark rounded-xl p-4">
          <p className="text-danger-red text-xs font-mono">{error}</p>
          <button
            onClick={generateTiles}
            className="ml-4 shrink-0 text-[10px] px-3 py-1.5 bg-electric-yellow text-deep-black rounded-lg font-bold uppercase tracking-wider"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tiles.map((tile, i) => {
            const cfg = colorConfig[tile.color as keyof typeof colorConfig] ?? colorConfig.orange;
            return (
              <div
                key={i}
                className={`border ${cfg.border} ${cfg.bg} rounded-xl p-4 flex flex-col gap-2.5 hover:scale-[1.01] transition-transform duration-200`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{tile.emoji}</span>
                    <p className="text-white font-display font-bold uppercase tracking-wide text-[11px] leading-tight">
                      {tile.title}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-widest whitespace-nowrap ${cfg.badge}`}>
                    {actionLabel[tile.action] ?? tile.action}
                  </span>
                </div>

                <p className={`font-display font-black text-xl leading-tight ${cfg.metric}`}>
                  {tile.metric}
                </p>

                <p className="text-text-secondary text-xs leading-relaxed border-t border-border-dark/50 pt-2">
                  {tile.context}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LiveInsightsTiles;
