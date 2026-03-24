// ─── Analyst Agent ─────────────────────────────────────────────────────────────
// Tools: campaign diagnosis, Meta insights, website order stats, inventory alerts, ROAS validation

import { runAgentLoop }       from '../runAgentLoop';
import { ANALYST_SYSTEM_PROMPT } from './analyst.prompts';
import type { ClaudeToolDefinition, AgentAction } from '../types';
import { fetchActiveAdSets, fetchAccountInsights } from '../../lib/metaAds';
import { fetchOrderStats, fetchInventoryAlerts }   from '../../lib/siteManager';
import { runDiagnosis, summarizeForLLM }            from '../../lib/scale-engine';
import { getUserConfig }                            from '../../lib/userConfig';
import type { PlatformType, SiteCredentials }       from '../../lib/siteManager';
import type Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

const TOOLS: ClaudeToolDefinition[] = [
  {
    name: 'fetch_active_ad_sets',
    description: 'Retrieve all currently active Meta ad sets with budget, status, and spend data.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'fetch_meta_insights',
    description: 'Pull real-time Meta Ads account-level stats: Spend, CTR, ROAS, Impressions, Conversions. Always call this before any ROAS validation.',
    input_schema: {
      type: 'object',
      properties: {
        date_preset: { type: 'string', description: 'Date range — e.g. last_30d, last_7d, last_90d. Default: last_30d' },
      },
      required: [],
    },
  },
  {
    name: 'run_campaign_diagnosis',
    description: 'Run the Zolter intelligence engine on current campaign data. Returns SCALE/OPTIMIZE/CRITICAL status, flags, funnel health, and geo analysis.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_scale_decisions',
    description: 'Get the current SCALE / OPTIMIZE / CRITICAL decisions grouped by status.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_top_performers',
    description: 'Return the top campaigns ranked by ROAS.',
    input_schema: {
      type: 'object',
      properties: {
        n:              { type: 'string', description: 'Number of top results (default 3)' },
        roas_threshold: { type: 'string', description: 'Minimum ROAS to qualify (default 4.0)' },
      },
      required: [],
    },
  },
  {
    name: 'identify_fatigue',
    description: 'Detect campaigns showing a decaying trend signal — high spend but falling ROAS.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'fetch_order_stats',
    description: 'Pull real website revenue, order count, AOV, and top products from the connected store (Shopify / WooCommerce / Custom). Use to compute actual ROAS and validate Meta attribution.',
    input_schema: {
      type: 'object',
      properties: {
        days_back: { type: 'string', description: 'Number of days to look back (default 30). Match this to the Meta date range for valid comparison.' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_inventory_alerts',
    description: 'Get inventory alerts: out-of-stock, low-stock, and bestseller products. Use to identify campaigns that should be paused or scaled based on stock levels.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'run_roas_validation',
    description: 'Full ROAS Validation: compares Meta-reported revenue against actual website revenue to detect attribution gaps. Returns the discrepancy percentage and interpretation.',
    input_schema: {
      type: 'object',
      properties: {
        date_preset: { type: 'string', description: 'Date range for Meta (default last_30d). Website will use same period.' },
      },
      required: [],
    },
  },
];

// ─── Tool executor ─────────────────────────────────────────────────────────────

function makeExecutor(pairs: unknown[]) {
  return async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
    // Meta credentials: prefer env vars (server), fall back to user config (onboarding)
    const cfg          = getUserConfig();
    const adAccountId  = (import.meta.env.VITE_META_AD_ACCOUNT_ID as string) || cfg.metaAdAccountId;
    const accessToken  = (import.meta.env.VITE_META_ACCESS_TOKEN  as string) || cfg.metaAccessToken;

    // Site credentials: from user config (decrypted by runAgentLoop)
    const siteCredentials: SiteCredentials | null =
      cfg.siteApiUrl && cfg.siteAdminApiKey && cfg.sitePlatformType
        ? { apiUrl: cfg.siteApiUrl, apiKey: cfg.siteAdminApiKey, platform: cfg.sitePlatformType as PlatformType }
        : null;

    switch (name) {
      // ── Meta tools ──────────────────────────────────────────────────────────

      case 'fetch_active_ad_sets': {
        if (!adAccountId || !accessToken)
          return { note: 'Meta credentials not configured.', pairs };
        return fetchActiveAdSets(adAccountId, accessToken);
      }

      case 'fetch_meta_insights': {
        if (!adAccountId || !accessToken)
          return { note: 'Meta credentials not configured.', pairs };
        const preset = (input.date_preset as string) || 'last_30d';
        return fetchAccountInsights(adAccountId, accessToken, preset);
      }

      case 'run_campaign_diagnosis': {
        const report = runDiagnosis(undefined, undefined);
        return {
          blendedRoas:      report.blendedRoas,
          totalSpend:       report.totalSpend,
          totalRevenue:     report.totalRevenue,
          checkoutFriction: report.checkoutFriction,
          biggestLeak:      report.biggestLeak,
          flags: report.flags.map(f => ({
            type: f.type, severity: f.severity, message: f.message, recommendation: f.recommendation,
          })),
          summary:   summarizeForLLM(report),
          campaigns: report.campaigns.map(c => ({
            name: c.name, roas: c.roas, status: c.status,
            spend: c.spend, trendSignal: c.trendSignal, ctr: c.ctr, conversionRate: c.conversionRate,
          })),
        };
      }

      case 'get_scale_decisions': {
        const report = runDiagnosis(undefined, undefined);
        return {
          scale:    report.campaigns.filter(c => c.status === 'SCALE').map(c => ({ name: c.name, roas: c.roas })),
          optimize: report.campaigns.filter(c => c.status === 'OPTIMIZE').map(c => ({ name: c.name, roas: c.roas })),
          critical: report.campaigns.filter(c => c.status === 'CRITICAL').map(c => ({ name: c.name, roas: c.roas })),
        };
      }

      case 'get_top_performers': {
        const n         = parseInt((input.n as string) ?? '3', 10);
        const threshold = parseFloat((input.roas_threshold as string) ?? '4.0');
        const report    = runDiagnosis(undefined, undefined);
        return report.campaigns
          .filter(c => c.roas >= threshold)
          .sort((a, b) => b.roas - a.roas)
          .slice(0, n)
          .map(c => ({ name: c.name, roas: c.roas, spend: c.spend, status: c.status }));
      }

      case 'identify_fatigue': {
        const report = runDiagnosis(undefined, undefined);
        return report.campaigns
          .filter(c => c.trendSignal === 'decaying')
          .map(c => ({ name: c.name, roas: c.roas, ctr: c.ctr, trendSignal: c.trendSignal }));
      }

      // ── Website tools ────────────────────────────────────────────────────────

      case 'fetch_order_stats': {
        if (!siteCredentials)
          return { note: 'No website management credentials configured. Add them in Brand Settings → Website Integration.' };
        const daysBack = parseInt((input.days_back as string) ?? '30', 10);
        return fetchOrderStats(siteCredentials, daysBack);
      }

      case 'fetch_inventory_alerts': {
        if (!siteCredentials)
          return { note: 'No website management credentials configured.' };
        return fetchInventoryAlerts(siteCredentials);
      }

      case 'run_roas_validation': {
        const preset   = (input.date_preset as string) || 'last_30d';
        const daysBack = preset.includes('7') ? 7 : preset.includes('90') ? 90 : 30;

        // Pull both data sources in parallel
        const [metaData, siteData] = await Promise.allSettled([
          adAccountId && accessToken
            ? fetchAccountInsights(adAccountId, accessToken, preset)
            : Promise.reject(new Error('Meta credentials not configured')),
          siteCredentials
            ? fetchOrderStats(siteCredentials, daysBack)
            : Promise.reject(new Error('Site credentials not configured')),
        ]);

        const metaResult = metaData.status === 'fulfilled' ? metaData.value : null;
        const siteResult = siteData.status === 'fulfilled' ? siteData.value : null;

        const metaRevenue = (metaResult as Record<string, unknown> | null)?.conversionValue as number ?? 0;
        const metaSpend   = (metaResult as Record<string, unknown> | null)?.spend as number ?? 0;
        const siteRevenue = siteResult?.revenue ?? 0;

        const metaReportedRoas = metaSpend > 0 ? metaRevenue / metaSpend : null;
        const actualRoas       = metaSpend > 0 ? siteRevenue / metaSpend : null;

        const gapPct = siteRevenue > 0
          ? ((metaRevenue - siteRevenue) / siteRevenue) * 100
          : null;

        const interpretation =
          gapPct === null ? 'Cannot compute — missing data'
          : gapPct > 20  ? `Over-attribution: Meta over-counts by ${gapPct.toFixed(1)}% — check for view-through attribution window`
          : gapPct < -10 ? `Under-attribution: Meta under-counts by ${Math.abs(gapPct).toFixed(1)}% — pixel may be misconfigured`
          : `Attribution looks accurate (gap: ${gapPct.toFixed(1)}%) — within ±20% tolerance`;

        return {
          period:                    preset,
          metaSpend:                 metaSpend,
          metaReportedRevenue:       metaRevenue,
          metaReportedRoas:          metaReportedRoas,
          websiteActualRevenue:      siteRevenue,
          websiteActualRoas:         actualRoas,
          attributionGapPercent:     gapPct,
          interpretation,
          topProducts:               siteResult?.topProducts?.slice(0, 5) ?? [],
          metaError:   metaData.status === 'rejected' ? (metaData.reason as Error).message : null,
          siteError:   siteData.status === 'rejected' ? (siteData.reason as Error).message : null,
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };
}

// ─── Public runner ─────────────────────────────────────────────────────────────

export async function runAnalystAgent(
  userContent: string,
  history:     Anthropic.MessageParam[],
  pairs:       unknown[],
  onAction:    (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<{ text: string; updatedHistory: Anthropic.MessageParam[] }> {
  return runAgentLoop({
    agentId:      'analyst',
    model:        MODEL,
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    history,
    userContent,
    tools:        TOOLS,
    executeTool:  makeExecutor(pairs),
    onAction,
  });
}
