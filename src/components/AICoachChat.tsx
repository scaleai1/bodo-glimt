import React, { useCallback, useEffect, useRef, useState } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import {
  runDiagnosis,
  detectFileType,
  analyzeCampaigns,
  analyzeFunnel,
} from '../lib/scale-engine';
import type { DiagnosisReport } from '../lib/scale-engine';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isReport?: boolean;
}

interface AICoachChatProps {
  isOpen: boolean;
  onClose: () => void;
  uploadedFileName?: string;
  uploadedFileContent?: string;
  secondFileName?: string;
  secondFileContent?: string;
  dashboardContext?: string;
}

const QUICK_PROMPTS = [
  'Check checkout flow',
  'Which campaigns should I pause?',
  'Where is the funnel leaking?',
  'Mobile UX issues?',
  'Top revenue opportunities',
];

function formatTime(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function renderContent(content: string): React.ReactNode[] {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="text-electric-yellow font-bold">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

function parseCSVRows(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map((h) => h.replace(/^["']|["']$/g, '').trim().toLowerCase());
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const vals = line.split(delim).map((v) => v.replace(/^["']|["']$/g, '').trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
}

function buildSystemPrompt(report: DiagnosisReport | null, dashboardContext?: string): string {
  return `You are "Scale" — an advanced Strategic AI Analyst for E-commerce, embedded in the Bodø/Glimt Website Management System.

## Your Identity
Never present dry data. Every metric must be wrapped in business context.
Instead of "ROAS is 4.5" → say "Instagram is currently your most efficient growth channel at 4.5x ROAS."
Be direct, punchy, and executive-level. No vague advice. Always end with a clear next action.

## Scale Algorithm (core decision framework)
- ROAS > 5.0 → SCALE: increase budget +15%, expand audiences
- ROAS 3.0–5.0 → OPTIMIZE: improve CTR, creative, targeting
- ROAS < 3.0 → CRITICAL/STOP: pause immediately, reallocate budget
- Gross Margin: 40% | Break-even ROAS = 2.5x
- Retargeting ROAS must be ≥ 2× Prospecting ROAS
- Video with high CTR but low ROAS → "Creative trap — high engagement, zero purchase intent"

## Healthy Flow Diagnostics
- Funnel drop > 30% → DROP DETECTED
- Funnel drop > 50% → FLOW OBSTACLE
- Cart→Checkout drop > 40% → CHECKOUT FRICTION
- Mobile time ≥ 2× Desktop → UX FRICTION

## Insight Tile Style (when asked for full analysis)
Format insights as named tiles:
- "Winner Tile": best performer + why to scale
- "Budget Leak Tile": where money is wasted + fix
- "Geographic Hotspot": best market + opportunity
- "Optimization Target": what to fix + expected impact

## Response format
- Use **bold** for key metrics and numbers
- Short, punchy sentences
- Every response implies an action: SCALE, PAUSE, INVESTIGATE, or OPTIMIZE
${dashboardContext ? `\n## Live Dashboard Data\n${dashboardContext}` : ''}
${report && report.campaigns.length > 0 ? `\n## Campaign Data (${report.campaigns.length} campaigns)\n${JSON.stringify(report.campaigns.map(c => ({
  name: c.name, platform: c.platform, country: c.country,
  spend: c.spend, revenue: c.revenue, roas: +c.roas.toFixed(2),
  status: c.status, ctr: +c.ctr.toFixed(1), conversions: c.conversions,
  conversionRate: +c.conversionRate.toFixed(2),
})), null, 2)}` : ''}
${report && report.funnelSteps.length > 0 ? `\n## Funnel Data\n${JSON.stringify(report.funnelSteps.map(s => ({
  step: s.label, users: s.users, dropPct: +s.dropPct.toFixed(1), alert: s.alertLevel,
})), null, 2)}` : ''}
${report && report.topCountry ? `\n## Top Market: ${report.topCountry.country} | ROAS ${report.topCountry.roas.toFixed(1)}x | Revenue $${report.topCountry.revenue.toLocaleString()}` : ''}
${report && report.flags.length > 0 ? `\n## Active Flags\n${report.flags.map(f => `[${f.severity.toUpperCase()}] ${f.type}: ${f.message}`).join('\n')}` : ''}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const AICoachChat: React.FC<AICoachChatProps> = ({
  isOpen,
  onClose,
  uploadedFileName,
  uploadedFileContent,
  secondFileName,
  secondFileContent,
  dashboardContext,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: '0',
    role: 'assistant',
    content: `Match Center is live. I'm your AI Coach powered by Claude.\n\nUpload a **CSV or Excel file** and I'll analyze it using the full Scale algorithm.\n\nOr ask me anything — I have full context of your dashboard data.`,
    timestamp: formatTime(),
  }]);

  const [input, setInput]           = useState('');
  const [isTyping, setIsTyping]     = useState(false);
  const [report, setReport]         = useState<DiagnosisReport | null>(null);
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [historyForApi, setHistoryForApi] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  // ── Process uploaded file ──────────────────────────────────────────────────
  const processFile = useCallback((fileName: string, content: string) => {
    const rows = parseCSVRows(content);
    if (rows.length === 0) return;

    const fileType = detectFileType(rows);
    setContextFiles((prev) => prev.includes(fileName) ? prev : [...prev, fileName]);

    const newReport = runDiagnosis(
      uploadedFileContent ?? content,
      secondFileContent,
    );
    setReport(newReport);

    let summary = '';
    if (fileType === 'campaigns') {
      const campaigns = analyzeCampaigns(rows);
      const scalers  = campaigns.filter((c) => c.status === 'SCALE').length;
      const critical = campaigns.filter((c) => c.status === 'CRITICAL').length;
      const topRoas  = Math.max(...campaigns.map((c) => c.roas));
      summary = `**${fileName}** loaded — ${rows.length} campaigns detected.\n\n⚡ **${scalers} SCALE** · ⚙️ **${campaigns.filter((c) => c.status === 'OPTIMIZE').length} OPTIMIZE** · 🟥 **${critical} CRITICAL**\nTop ROAS: **${topRoas.toFixed(1)}x**\n\nAsk me anything or press Full Site Diagnosis for the complete breakdown.`;
    } else if (fileType === 'funnel') {
      const steps   = analyzeFunnel(rows);
      const leaks   = steps.filter((s) => s.alertLevel !== 'none');
      const maxDrop = steps.length > 1 ? Math.max(...steps.map((s) => s.dropPct)) : 0;
      summary = `**${fileName}** loaded — ${rows.length} funnel steps detected.\n\n${leaks.length > 0 ? `💧 **${leaks.length} leak(s)** found. Biggest drop: **${maxDrop.toFixed(0)}%**` : '✅ Funnel looks healthy — no major leaks.'}\n\nType "full diagnosis" for a complete breakdown.`;
    } else {
      summary = `**${fileName}** loaded (${rows.length} rows).\n\nColumns detected: ${Object.keys(rows[0] ?? {}).slice(0, 6).join(', ')}...\n\nI'll use this data to answer your questions. What would you like to know?`;
    }

    addAssistantMessage(summary);
  }, [uploadedFileContent, secondFileContent]);

  useEffect(() => {
    if (uploadedFileName && uploadedFileContent) processFile(uploadedFileName, uploadedFileContent);
  }, [uploadedFileName, uploadedFileContent]);

  useEffect(() => {
    if (secondFileName && secondFileContent) processFile(secondFileName, secondFileContent);
  }, [secondFileName, secondFileContent]);

  useEffect(() => {
    if (uploadedFileContent || secondFileContent) {
      setReport(runDiagnosis(uploadedFileContent, secondFileContent));
    }
  }, [uploadedFileContent, secondFileContent]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const addAssistantMessage = (content: string, isReport = false) => {
    const msg: ChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content,
      timestamp: formatTime(),
      isReport,
    };
    setMessages((prev) => [...prev, msg]);
    setHistoryForApi((prev) => [...prev, { role: 'assistant', content }]);
  };

  // ── Call Claude API with streaming ─────────────────────────────────────────
  const callClaude = async (userMessage: string) => {
    setIsTyping(true);

    const newHistory = [...historyForApi, { role: 'user' as const, content: userMessage }];
    setHistoryForApi(newHistory);

    // Add placeholder message we'll stream into
    const msgId = Date.now().toString();
    setMessages((prev) => [...prev, {
      id: msgId,
      role: 'assistant',
      content: '',
      timestamp: formatTime(),
    }]);

    try {
      const systemPrompt = buildSystemPrompt(report, dashboardContext);

      let accumulated = '';
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: newHistory,
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          accumulated += event.delta.text;
          setMessages((prev) =>
            prev.map((m) => m.id === msgId ? { ...m, content: accumulated } : m)
          );
        }
      }

      setHistoryForApi((prev) => [...prev, { role: 'assistant', content: accumulated }]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) =>
        prev.map((m) => m.id === msgId ? { ...m, content: `Error connecting to Claude: ${errMsg}` } : m)
      );
    } finally {
      setIsTyping(false);
    }
  };

  // ── Full Site Diagnosis — Shopify / Website Technical Health ──────────────
  const runFullDiagnosis = async () => {
    if (isDiagnosing) return;
    setIsDiagnosing(true);

    // Build site context from uploaded data (funnel steps are the most relevant signal)
    const currentReport = report ?? runDiagnosis(uploadedFileContent, secondFileContent);
    setReport(currentReport);

    const funnelContext = currentReport.funnelSteps.length > 0
      ? `\n\nFUNNEL DATA:\n${currentReport.funnelSteps.map((s) =>
          `${s.label}: ${s.users.toLocaleString()} users | drop: ${s.dropPct.toFixed(1)}% | alert: ${s.alertLevel}`
        ).join('\n')}`
      : '';

    const flagContext = currentReport.flags.length > 0
      ? `\n\nDETECTED FLAGS:\n${currentReport.flags.map((f) =>
          `[${f.severity.toUpperCase()}] ${f.type}: ${f.message} → Fix: ${f.recommendation}`
        ).join('\n')}`
      : '';

    const conversionContext = currentReport.campaigns.length > 0
      ? `\n\nCONVERSION DATA:\nBlended ROAS: ${currentReport.blendedRoas.toFixed(2)}x | Total Revenue: $${currentReport.totalRevenue.toLocaleString()} | Total Spend: $${currentReport.totalSpend.toLocaleString()}\nCritical campaigns (ROAS < 2.5x): ${currentReport.criticalCampaigns.length}\nCheckout friction detected: ${currentReport.checkoutFriction ? 'YES' : 'NO'}\nBiggest funnel leak: ${currentReport.biggestLeak ?? 'not detected'}`
      : '';

    const SITE_DIAGNOSIS_PROMPT = `You are "Scale" — a Shopify & E-commerce Website Technical Auditor.

Run a FULL SITE TECHNICAL DIAGNOSIS based on the available data. Your job is to find website bugs, UX blockers, and technical faults — NOT campaign performance.

DIAGNOSIS FRAMEWORK — check each area:

🔴 CRITICAL BLOCKERS (revenue-stopping bugs):
- Checkout errors: payment failures, broken coupon codes, missing shipping rates
- Cart abandonment triggers: unexpected costs at checkout, forced account creation, broken promo codes
- 404 pages on product links, collection pages, or internal navigation
- Mobile checkout broken: tap targets too small, keyboard overlapping fields, form errors on iOS/Android
- PageSpeed < 50 on mobile (Google Core Web Vitals fail)

🟠 CONVERSION KILLERS (friction that destroys conversion rate):
- Product pages missing: trust badges, reviews, clear return policy, size guides
- Add-to-Cart button below fold on mobile
- Images not loading, slow-loading, or wrong aspect ratio
- Price not visible without scrolling
- Upsell/cross-sell blocks causing page shift (CLS > 0.1)
- Search not returning results for common queries

🟡 UX FRICTION POINTS (hurting AOV and repeat purchase):
- Navigation too deep: customers need > 3 clicks to find products
- No sticky header or back-to-top on mobile
- Inconsistent fonts/colors (theme CSS conflict from third-party apps)
- Email capture popup blocking checkout on mobile
- Live chat widget covering CTA buttons
- Wishlist/compare features broken

⚪ TECHNICAL HEALTH (affecting SEO and speed):
- Duplicate meta titles or missing descriptions
- Images missing alt text (accessibility + SEO)
- Broken schema markup (no rich snippets in Google)
- Scripts loading synchronously in <head> (blocking render)
- Unused third-party apps still injecting scripts (bloating page)
- HTTPS mixed content warnings

SHOPIFY-SPECIFIC FAULTS TO CHECK:
- Inventory policy: products showing "In Stock" when out of stock
- Variant images not switching when color/size selected
- Discount codes not stacking correctly (Shopify limitation)
- Gift cards not accepted at checkout
- International pricing/currency switcher showing wrong prices
- Metafields not displaying on product pages
- "Continue Shopping" button redirecting to wrong page
- Order confirmation emails going to spam

SCORING:
- Each critical blocker = -20 points from site health score
- Each conversion killer = -10 points
- Each UX friction = -5 points
- Start at 100. Score below 60 = URGENT action required.

${funnelContext}${flagContext}${conversionContext}

OUTPUT FORMAT:
1. SITE HEALTH SCORE: [X/100] — [status label]
2. List each detected issue under its category (Critical / Conversion Killer / UX Friction / Technical)
3. For each issue: what it is, what it costs in revenue, exact fix
4. TOP 3 PRIORITY FIXES this week (ordered by revenue impact)
5. One "Quick Win" that can be fixed in < 1 hour

Be specific. Use exact Shopify terminology. No vague advice.`;

    await callClaude(SITE_DIAGNOSIS_PROMPT);
    setIsDiagnosing(false);
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    setMessages((prev) => [...prev, {
      id: Date.now().toString(), role: 'user', content: trimmed, timestamp: formatTime(),
    }]);
    setInput('');

    if (/full diagnosis|diagnos|full report|analyze all|run analysis/.test(trimmed.toLowerCase())) {
      await runFullDiagnosis();
      return;
    }

    await callClaude(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  if (!isOpen) return null;

  const hasData = (report?.campaigns.length ?? 0) > 0 || (report?.funnelSteps.length ?? 0) > 0 || !!dashboardContext;

  return (
    <aside className="fixed right-0 top-0 h-full z-40 flex flex-col bg-pitch-dark border-l border-border-dark w-full sm:w-[420px] shadow-[-8px_0_40px_rgba(0,0,0,0.6)] transition-transform duration-300">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-dark bg-card-dark shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 bg-electric-yellow rounded-full flex items-center justify-center shadow-yellow-sm text-deep-black">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="6" r="3" stroke="currentColor" strokeWidth="2"/>
                  <path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M18 10l2-1.5M18 10l1 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success-green rounded-full border-2 border-card-dark" />
          </div>
          <div>
            <p className="text-white font-bold text-xs uppercase tracking-widest">AI Coach</p>
            <p className={`text-[10px] font-mono ${hasData ? 'text-electric-yellow' : 'text-success-green'}`}>
              {hasData ? `● ${contextFiles.length > 0 ? contextFiles.length + ' file(s) loaded' : 'Dashboard data active'}` : '● Claude connected'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {contextFiles.map((f) => (
            <span key={f} className="hidden sm:block text-[9px] px-1.5 py-0.5 bg-electric-yellow/10 border border-electric-yellow/30 text-electric-yellow rounded font-mono truncate max-w-[80px]">
              {f.split('.')[0]}
            </span>
          ))}
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-text-secondary hover:text-white rounded-lg hover:bg-border-dark transition-colors">✕</button>
        </div>
      </div>

      {/* ── Full Diagnosis button ── */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <button
          onClick={runFullDiagnosis}
          disabled={isDiagnosing || isTyping}
          className={`
            w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
            font-display font-black uppercase tracking-widest text-xs
            transition-all duration-300
            ${isDiagnosing || isTyping
              ? 'bg-border-dark text-text-secondary cursor-not-allowed'
              : 'bg-electric-yellow text-deep-black hover:shadow-yellow-glow'}
          `}
        >
          {isDiagnosing ? (
            <>
              <span className="animate-spin text-base">⚽</span>
              <span>Analysing...</span>
            </>
          ) : (
            <>
              <span>🔍</span>
              <span>Full Site Diagnosis</span>
              <span className="text-[10px] font-normal opacity-70 normal-case tracking-normal">— Claude powered</span>
            </>
          )}
        </button>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5
              ${msg.role === 'user' ? 'bg-electric-yellow text-deep-black text-xs font-bold' : 'bg-card-dark border border-border-dark text-electric-yellow'}`}>
              {msg.role === 'user' ? 'U' : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="6" r="3" stroke="currentColor" strokeWidth="2"/>
                  <path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M18 10l2-1.5M18 10l1 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
            </div>

            <div className={`
              max-w-[84%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed
              ${msg.role === 'user'
                ? 'bg-electric-yellow/10 border border-electric-yellow/20 text-white rounded-tr-sm'
                : msg.isReport
                ? 'bg-deep-black border border-electric-yellow/30 text-white rounded-tl-sm'
                : 'bg-card-dark border border-border-dark text-white rounded-tl-sm'}
            `}>
              {msg.isReport && (
                <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-border-dark">
                  <span className="text-electric-yellow text-[10px] font-display font-black uppercase tracking-widest">
                    ⚽ SCALE DIAGNOSIS REPORT
                  </span>
                </div>
              )}
              <p className="whitespace-pre-line">{renderContent(msg.content)}</p>
              {msg.content === '' && (
                <span className="inline-block w-1.5 h-3 bg-electric-yellow animate-pulse rounded-sm" />
              )}
              <p className="text-text-secondary text-[10px] mt-1.5 font-mono">{msg.timestamp}</p>
            </div>
          </div>
        ))}

        {isTyping && messages[messages.length - 1]?.content !== '' && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-card-dark border border-border-dark flex items-center justify-center text-electric-yellow shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="6" r="3" stroke="currentColor" strokeWidth="2"/>
                  <path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M18 10l2-1.5M18 10l1 2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            <div className="bg-card-dark border border-border-dark rounded-xl rounded-tl-sm px-3.5 py-3 flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 bg-electric-yellow rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick prompts ── */}
      <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto shrink-0">
        {QUICK_PROMPTS.map((p) => (
          <button key={p} onClick={() => sendMessage(p)} disabled={isTyping}
            className="shrink-0 text-[10px] px-2.5 py-1.5 bg-card-dark border border-border-dark text-text-secondary
              hover:border-electric-yellow hover:text-electric-yellow rounded-full uppercase tracking-wider
              transition-all duration-150 disabled:opacity-40 whitespace-nowrap">
            {p.length > 26 ? p.substring(0, 26) + '…' : p}
          </button>
        ))}
      </div>

      {/* ── Input ── */}
      <div className="px-4 pb-4 pt-2 border-t border-border-dark shrink-0">
        <div className={`flex items-end gap-2 bg-card-dark border rounded-xl px-3 py-2 transition-all duration-200
          ${input ? 'border-electric-yellow/50 shadow-yellow-sm' : 'border-border-dark'}`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the Coach… (↵ send)"
            rows={1}
            className="flex-1 bg-transparent text-white text-xs resize-none outline-none placeholder-text-secondary leading-relaxed max-h-24 overflow-y-auto"
            style={{ minHeight: '20px' }}
          />
          <button onClick={() => sendMessage(input)} disabled={!input.trim() || isTyping}
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 transition-all duration-200
              ${input.trim() && !isTyping ? 'bg-electric-yellow text-deep-black hover:shadow-yellow-sm' : 'bg-border-dark text-text-secondary cursor-not-allowed'}`}>
            ↑
          </button>
        </div>
        <p className="text-text-secondary text-[10px] mt-1.5 text-center font-mono">
          {hasData ? `Claude · ${contextFiles.length > 0 ? contextFiles.join(' + ') : 'Dashboard data'}` : 'Claude · Ready'}
        </p>
      </div>
    </aside>
  );
};

export { buildSystemPrompt } from './AICoachChat.helpers';
export default AICoachChat;
