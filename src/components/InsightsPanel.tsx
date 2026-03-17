import React, { useEffect, useRef, useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import type { DiagnosisReport } from '../lib/scale-engine';

interface InsightsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  report: DiagnosisReport;
  fileName: string;
}

interface InsightTile {
  type: 'winner' | 'leak' | 'geo' | 'product' | 'alert' | 'optimize';
  title: string;
  metric: string;
  context: string;
  action: 'SCALE' | 'PAUSE' | 'INVESTIGATE' | 'OPTIMIZE';
  color: 'green' | 'red' | 'orange' | 'yellow';
}

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

const SCALE_SYSTEM_PROMPT = `You are "Scale" — an advanced Strategic AI Analyst for E-commerce.

Your task: Transform raw campaign & funnel data into 4-6 executive Insight Tiles.

NEVER present dry data. Every metric must be wrapped in business context.
Instead of "ROAS is 4.5" → say "Instagram is driving your growth | ROAS: 4.5x"

Scale Algorithm:
- ROAS > 5.0 → SCALE (+15% budget)
- ROAS 3.0–5.0 → OPTIMIZE (CTR, creative, targeting)
- ROAS < 3.0 → CRITICAL/STOP
- Gross Margin: 40%
- Retargeting ROAS must be ≥ 2× Prospecting

Healthy Flow:
- Funnel drop > 30% → DROP DETECTED
- Funnel drop > 50% → FLOW OBSTACLE
- Cart→Checkout drop > 40% → CHECKOUT FRICTION

Return EXACTLY this JSON structure (no markdown, no extra text):
{
  "tiles": [
    {
      "type": "winner",
      "title": "[Punchy insight title]",
      "metric": "[Key metric with value]",
      "context": "[1 sentence strategic context]",
      "action": "SCALE",
      "color": "green"
    },
    {
      "type": "leak",
      "title": "[Budget waste title]",
      "metric": "[Loss metric]",
      "context": "[1 sentence reason + implication]",
      "action": "PAUSE",
      "color": "red"
    },
    {
      "type": "geo",
      "title": "[Geographic opportunity]",
      "metric": "[Conversion or ROAS metric]",
      "context": "[1 sentence about the market]",
      "action": "SCALE",
      "color": "green"
    },
    {
      "type": "optimize",
      "title": "[Optimization opportunity]",
      "metric": "[Metric showing potential]",
      "context": "[1 sentence on what to fix]",
      "action": "OPTIMIZE",
      "color": "orange"
    }
  ]
}

Rules:
- Use SHORT, PUNCHY titles (3-6 words max)
- Metric field: always include the number (e.g. "ROAS: 7.2x" or "CR: 1.1%")
- Context: max 15 words, action-oriented
- action must be one of: SCALE, PAUSE, INVESTIGATE, OPTIMIZE
- color: green=growth, orange=optimize, red=critical, yellow=watch
- Generate 4-6 tiles based on what the data shows
- If no funnel data: skip funnel tiles, focus on campaigns`;

const tileConfig: Record<InsightTile['color'], { border: string; bg: string; badge: string; badgeText: string; icon: string }> = {
  green:  { border: 'border-success-green/40', bg: 'bg-success-green/5',  badge: 'bg-success-green/20 text-success-green border-success-green/40',  badgeText: 'text-success-green', icon: '⚡' },
  red:    { border: 'border-danger-red/40',    bg: 'bg-danger-red/5',     badge: 'bg-danger-red/20 text-danger-red border-danger-red/40',            badgeText: 'text-danger-red',    icon: '🟥' },
  orange: { border: 'border-yellow-500/40',    bg: 'bg-yellow-500/5',     badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',            badgeText: 'text-yellow-400',    icon: '⚙️' },
  yellow: { border: 'border-electric-yellow/40', bg: 'bg-electric-yellow/5', badge: 'bg-electric-yellow/20 text-electric-yellow border-electric-yellow/40', badgeText: 'text-electric-yellow', icon: '★' },
};

const actionLabel: Record<InsightTile['action'], string> = {
  SCALE: '⚡ SCALE', PAUSE: '🟥 PAUSE', INVESTIGATE: '🔍 INVESTIGATE', OPTIMIZE: '⚙️ OPTIMIZE',
};

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ isOpen, onClose, report, fileName }) => {
  const [tiles, setTiles]       = useState<InsightTile[]>([]);
  const [rawText, setRawText]   = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone]     = useState(false);
  const [parseError, setParseError] = useState(false);
  const hasRun = useRef(false);

  useEffect(() => {
    if (!isOpen || hasRun.current) return;
    hasRun.current = true;
    runInsights();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      hasRun.current = false;
      setTiles([]);
      setRawText('');
      setIsDone(false);
      setParseError(false);
    }
  }, [isOpen]);

  const runInsights = async () => {
    setIsLoading(true);
    setTiles([]);
    setRawText('');
    setIsDone(false);
    setParseError(false);

    const dataContext = JSON.stringify({
      blendedRoas: report.blendedRoas.toFixed(2),
      totalRevenue: report.totalRevenue,
      totalSpend: report.totalSpend,
      campaigns: report.campaigns.map((c) => ({
        name: c.name, platform: c.platform, country: c.country,
        roas: +c.roas.toFixed(2), spend: c.spend, revenue: c.revenue,
        status: c.status, ctr: +c.ctr.toFixed(1), conversions: c.conversions,
        conversionRate: +c.conversionRate.toFixed(2),
      })),
      funnelSteps: report.funnelSteps.map((s) => ({
        step: s.label, users: s.users,
        dropPct: +s.dropPct.toFixed(1), alert: s.alertLevel,
      })),
      topCountry: report.topCountry,
      criticalCampaigns: report.criticalCampaigns.map((c) => c.name),
      flags: report.flags.map((f) => ({ type: f.type, severity: f.severity, message: f.message })),
    }, null, 2);

    let accumulated = '';

    try {
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: SCALE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Generate Insight Tiles for this data from "${fileName}":\n\n${dataContext}` }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && 'text' in event.delta) {
          accumulated += (event.delta as { type: 'text_delta'; text: string }).text;
          setRawText(accumulated);
        }
      }

      // Parse JSON
      const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.tiles)) {
          setTiles(parsed.tiles);
        } else {
          setParseError(true);
        }
      } else {
        setParseError(true);
      }

      setIsDone(true);
    } catch (err) {
      setParseError(true);
      setRawText(err instanceof Error ? `Error: ${err.message}` : 'Unknown error');
      setIsDone(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative bg-pitch-dark border border-electric-yellow/30 rounded-2xl w-full max-w-3xl shadow-[0_0_60px_rgba(255,229,0,0.12)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-electric-yellow rounded-full flex items-center justify-center text-deep-black font-black text-sm shadow-yellow-sm">
              Z
            </div>
            <div>
              <p className="text-white font-display font-black uppercase tracking-widest text-sm">Scale Insight Tiles</p>
              <p className="text-text-secondary text-[10px] font-mono truncate max-w-[300px]">{fileName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-white rounded-lg hover:bg-border-dark transition-colors">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Loading */}
          {isLoading && tiles.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-12">
              <span className="text-4xl animate-spin">⚽</span>
              <p className="text-electric-yellow font-display font-black uppercase tracking-widest text-sm">Scale is analysing...</p>
              <p className="text-text-secondary text-xs font-mono">Generating strategic insight tiles</p>
              {rawText && (
                <div className="w-full bg-card-dark border border-border-dark rounded-xl p-3 mt-2">
                  <p className="text-text-secondary text-[10px] font-mono whitespace-pre-wrap">{rawText}</p>
                </div>
              )}
            </div>
          )}

          {/* Tiles grid */}
          {tiles.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tiles.map((tile, i) => {
                const cfg = tileConfig[tile.color] ?? tileConfig.orange;
                return (
                  <div key={i} className={`border ${cfg.border} ${cfg.bg} rounded-xl p-4 flex flex-col gap-3`}>
                    {/* Tile header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{cfg.icon}</span>
                        <p className={`font-display font-black uppercase tracking-wide text-xs ${cfg.badgeText}`}>
                          {tile.title}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest ${cfg.badge}`}>
                        {actionLabel[tile.action] ?? tile.action}
                      </span>
                    </div>

                    {/* Key metric */}
                    <p className="text-white font-display font-black text-xl leading-tight">
                      {tile.metric}
                    </p>

                    {/* Context */}
                    <p className="text-text-secondary text-xs leading-relaxed border-t border-border-dark pt-2">
                      {tile.context}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Parse error fallback */}
          {parseError && isDone && (
            <div className="bg-card-dark border border-border-dark rounded-xl p-4">
              <p className="text-yellow-400 text-xs font-bold mb-2 uppercase tracking-widest">Raw Analysis</p>
              <p className="text-white text-xs leading-relaxed whitespace-pre-wrap font-mono">{rawText}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {isDone && (
          <div className="px-6 py-4 border-t border-border-dark shrink-0 flex items-center justify-between">
            <p className="text-text-secondary text-[10px] font-mono">
              Scale · {tiles.length} insight tile{tiles.length !== 1 ? 's' : ''} · {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <button
              onClick={runInsights}
              className="text-[10px] px-3 py-1.5 bg-card-dark border border-border-dark text-text-secondary hover:border-electric-yellow hover:text-electric-yellow rounded-lg uppercase tracking-wider font-bold transition-all"
            >
              ↺ Re-analyse
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InsightsPanel;
