import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Settings, ExternalLink, TrendingUp,
  Activity, ChevronDown, ChevronUp,
  X, Sparkles, ArrowLeft, LogOut,
} from 'lucide-react';
import { AgentProvider, useAgentBus } from '../agents/AgentContext';
import type { AgentMessage } from '../agents/types';
import { NewCampaignConversation } from '../components/NewCampaignConversation';
import { BrandingSettings } from '../components/BrandingSettings';
import { ConnectionMap } from '../components/ConnectionMap';
import { MetaLiveFeed } from '../components/MetaLiveFeed';
import { AICreativeSuite } from '../components/AICreativeSuite';
import { ToastProvider } from '../components/Toast';
import { useBrand } from '../lib/BrandingService';


import type { CampaignPair } from '../components/CampaignView';

// ─── Local types ───────────────────────────────────────────────────────────────

interface StatusResponse {
  lastUpdated: string;
  lastRunAt: string | null;
  runCount: number;
  accountId: string;
  siteHealth: string;
  bugPage: string | null;
  pairs: CampaignPair[];
  totalWasteSavedUsd?: number;
  activeSafetyPauses?: { name: string; reason: string; pausedAt: string; estimatedWasteSavedUsd: number }[];
  globalDailyMaxUsd?: number;
  totalBudgetUsd?: number;
}

// ─── Mock campaign data ────────────────────────────────────────────────────────

const MOCK_PAIRS: CampaignPair[] = [
  {
    productId: 101, productName: 'Budo Pro Gloves', category: 'Combat Equipment',
    adSetId: '23850001', adSetName: 'Budo – Sports Gear Retargeting',
    campaignName: 'Budo | Retargeting | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 50.00, roas: 6.2, spend: 23.50, inventory: 42,
    impressions: 18400, reach: 12100, results: 31, costPerResult: 7.58, ctr: 2.84, cpm: 12.77, frequency: 1.52,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'LOW' },
    liveDecision: 'SCALE', liveDecisionReason: 'ROAS 6.20 > 5.0 AND inventory 42 > 10',
    lastAction: 'SCALE', lastActionAt: null, lastActionAgo: '8m ago', lastActionReason: 'ROAS 6.20 > 5.0',
  },
  {
    productId: 102, productName: 'Budo Summer Training Gi', category: 'Apparel',
    adSetId: '23850002', adSetName: 'Budo – Summer Collection Prospecting',
    campaignName: 'Budo | Prospecting | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 35.00, roas: 4.1, spend: 18.00, inventory: 8,
    impressions: 22600, reach: 19800, results: 14, costPerResult: 12.86, ctr: 1.91, cpm: 7.96, frequency: 1.14,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'LOW' },
    liveDecision: 'HOLD', liveDecisionReason: 'ROAS 4.10 in optimize range (3.0–5.0)',
    lastAction: 'HOLD', lastActionAt: null, lastActionAgo: '23m ago', lastActionReason: 'ROAS in range',
  },
  {
    productId: 103, productName: 'Budo Elite Foot Protectors', category: 'Premium Gear',
    adSetId: '23850003', adSetName: 'Budo – Premium Products Retargeting',
    campaignName: 'Budo | Premium | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'PAUSED', dailyBudgetUsd: 60.00, roas: 1.8, spend: 41.00, inventory: 1,
    impressions: 31200, reach: 14700, results: 9, costPerResult: 45.56, ctr: 3.42, cpm: 13.14, frequency: 2.12,
    siteHealth: 'OK', dropOff: { cart: 'HIGH', checkout: 'LOW' },
    liveDecision: 'PAUSE', liveDecisionReason: 'Critical inventory: 1 units < 2',
    lastAction: 'PAUSE', lastActionAt: null, lastActionAgo: '2m ago', lastActionReason: 'Critical inventory',
  },
  {
    productId: 104, productName: 'Budo Sparring Accessories Pack', category: 'Accessories',
    adSetId: '23850004', adSetName: 'Budo – Accessories Bundle',
    campaignName: 'Budo | Accessories | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 28.00, roas: 5.9, spend: 12.00, inventory: 65,
    impressions: 9800, reach: 8300, results: 18, costPerResult: 6.67, ctr: 2.21, cpm: 12.24, frequency: 1.18,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'HIGH' },
    liveDecision: 'HOLD', liveDecisionReason: 'High drop-off at checkout prevents scale',
    lastAction: 'HOLD', lastActionAt: null, lastActionAgo: '8m ago', lastActionReason: 'High drop-off',
  },
  {
    productId: 105, productName: 'Budo Kids Starter Set', category: 'Kids',
    adSetId: '23850005', adSetName: 'Budo – Kids Collection',
    campaignName: 'Budo | Kids | Purchases', campaignObjective: 'PURCHASES',
    adSetStatus: 'ACTIVE', dailyBudgetUsd: 20.00, roas: 7.1, spend: 8.50, inventory: 84,
    impressions: 7100, reach: 6600, results: 22, costPerResult: 3.86, ctr: 3.07, cpm: 11.97, frequency: 1.08,
    siteHealth: 'OK', dropOff: { cart: 'LOW', checkout: 'LOW' },
    liveDecision: 'SCALE', liveDecisionReason: 'ROAS 7.10 > 5.0 AND inventory 84 > 10',
    lastAction: null, lastActionAt: null, lastActionAgo: null, lastActionReason: null,
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────


const API_BASE = 'http://localhost:3001';
const POLL_MS  = 10_000;



// ─── Agent Carousel ────────────────────────────────────────────────────────────

const AGENT_CARDS = [
  {
    id:           'analyst'   as const,
    Icon:         Activity,
    name:         'Analyst',
    accent:       '#06b6d4',
    tagline:      'Campaign Intelligence',
    description:  'Continuously monitors ROAS, spend, and creative performance across all your ad sets. Surfaces scaling opportunities and flags budget waste before it compounds.',
    capabilities: ['ROAS & CPA real-time tracking', 'Creative fatigue detection', 'Auto Scale / Hold / Pause logic'],
  },
  {
    id:           'campaigner' as const,
    Icon:         TrendingUp,
    name:         'Campaigner',
    accent:       'var(--brand-primary)',
    tagline:      'AI Ad Builder',
    description:  'Launch full Meta campaigns through conversation. Describe your audience and goal — the agent handles structure, targeting, and budgets via the live Meta Ads API.',
    capabilities: ['Natural language campaign setup', 'Meta Ads API live connection', 'Ad set & budget management'],
  },
  {
    id:           'creative' as const,
    Icon:         Sparkles,
    name:         'AI Creative',
    accent:       '#a78bfa',
    tagline:      'Image · Video · Copy',
    description:  'Generate scroll-stopping ad creatives in seconds — product images, cinematic video clips, and high-converting ad copy, all powered by AI.',
    capabilities: ['Flux Schnell image generation', 'Luma Ray 2 video generation', 'Claude-powered ad copy'],
  },
] as const;

type AgentCarouselId = (typeof AGENT_CARDS)[number]['id'];

// ─── Agent Carousel (below) ────────────────────────────────────────────────────


const AgentCarousel: React.FC<{ onOpen: (id: AgentCarouselId) => void }> = ({ onOpen }) => {
  const [hovered, setHovered] = React.useState<number | null>(null);

  return (
    <section style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* Hero header */}
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <h1 style={{
          color: '#fff', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em',
          lineHeight: 1.1, fontFamily: 'var(--font-display)', margin: '0 0 6px',
        }}>
          Your AI Marketing Command Center
        </h1>
        <p style={{ color: '#6b7280', fontSize: 12, maxWidth: 380, margin: '0 auto', lineHeight: 1.5 }}>
          Three specialized agents working in perfect sync to scale your revenue and eliminate waste.
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, flex: 1, minHeight: 0 }}>
        {AGENT_CARDS.map((card, i) => {
          const { Icon, name, accent, tagline, description, capabilities } = card;
          const isHov = hovered === i;
          return (
            <div
              key={card.id}
              onClick={() => onOpen(card.id)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position:      'relative',
                overflow:      'hidden',
                borderRadius:  14,
                padding:       '22px 20px 18px',
                cursor:        'pointer',
                display:       'flex',
                flexDirection: 'column',
                background:    `linear-gradient(145deg, color-mix(in srgb, ${accent} 10%, #111827) 0%, color-mix(in srgb, ${accent} 4%, #0d1117) 100%)`,
                border:        `1px solid color-mix(in srgb, ${accent} ${isHov ? '45' : '18'}%, transparent)`,
                boxShadow:     isHov
                  ? `0 0 0 1px color-mix(in srgb, ${accent} 18%, transparent), 0 16px 48px color-mix(in srgb, ${accent} 18%, rgba(0,0,0,0.6))`
                  : '0 2px 12px rgba(0,0,0,0.35)',
                transform:   isHov ? 'translateY(-5px)' : 'translateY(0)',
                transition:  'transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease',
              }}
            >
              {/* Top accent bar */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${accent} 0%, transparent 70%)`,
                opacity: isHov ? 1 : 0.45,
                transition: 'opacity 0.28s',
              }} />

              {/* Watermark icon */}
              <div style={{
                position: 'absolute', bottom: -16, right: -16,
                opacity: isHov ? 0.1 : 0.04,
                transition: 'opacity 0.28s',
                pointerEvents: 'none',
              }}>
                <Icon size={128} color={accent} />
              </div>

              {/* Agent number badge */}
              <div style={{
                position: 'absolute', top: 16, right: 16,
                width: 22, height: 22, borderRadius: '50%',
                background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 900, color: accent, fontFamily: 'monospace',
              }}>
                0{i + 1}
              </div>

              {/* Icon box */}
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
                marginBottom: 12,
                boxShadow: isHov ? `0 0 16px color-mix(in srgb, ${accent} 22%, transparent)` : 'none',
                transition: 'box-shadow 0.28s',
              }}>
                <Icon size={20} color={accent} />
              </div>

              {/* Name + tagline pill */}
              <div style={{ marginBottom: 10 }}>
                <div style={{
                  color: '#fff', fontWeight: 900, fontSize: 17, lineHeight: 1.1,
                  marginBottom: 6, fontFamily: 'var(--font-display)',
                }}>
                  {name}
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: `color-mix(in srgb, ${accent} 10%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${accent} 24%, transparent)`,
                  borderRadius: 20, padding: '2px 9px',
                }}>
                  <span style={{ color: accent, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {tagline}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p style={{ color: '#9ca3af', fontSize: 11.5, lineHeight: 1.6, marginBottom: 10 }}>
                {description}
              </p>

              {/* Illustration */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', margin: '2px 0 8px' }}>
                {card.id === 'analyst' && (
                  <svg width="100%" height="88" viewBox="0 0 240 88" style={{ overflow: 'visible' }}>
                    <line x1="0" y1="70" x2="240" y2="70" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    <line x1="0" y1="48" x2="240" y2="48" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    <line x1="0" y1="26" x2="240" y2="26" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                    <rect x="12" y="50" width="28" height="20" rx="4" fill={accent} fillOpacity="0.2"/>
                    <rect x="58" y="36" width="28" height="34" rx="4" fill={accent} fillOpacity="0.38"/>
                    <rect x="104" y="20" width="28" height="50" rx="4" fill={accent} fillOpacity="0.58"/>
                    <rect x="150" y="6"  width="28" height="64" rx="4" fill={accent} fillOpacity="0.82"/>
                    <polyline points="26,50 72,36 118,20 164,6" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="26"  cy="50" r="3.5" fill={accent}/>
                    <circle cx="72"  cy="36" r="3.5" fill={accent}/>
                    <circle cx="118" cy="20" r="3.5" fill={accent}/>
                    <circle cx="164" cy="6"  r="3.5" fill={accent}/>
                    <rect x="183" y="2" width="54" height="16" rx="5" fill={accent} fillOpacity="0.12" stroke={accent} strokeOpacity="0.3" strokeWidth="1"/>
                    <text x="210" y="13.5" textAnchor="middle" fontSize="8.5" fill={accent} fontFamily="monospace" fontWeight="bold">ROAS 6.2× ↑</text>
                    <text x="26"  y="84" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.2)">W1</text>
                    <text x="72"  y="84" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.2)">W2</text>
                    <text x="118" y="84" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.2)">W3</text>
                    <text x="164" y="84" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.2)">W4</text>
                  </svg>
                )}
                {card.id === 'campaigner' && (
                  <svg width="100%" height="88" viewBox="0 0 240 88">
                    <rect x="10"  y="4"  width="220" height="22" rx="5" fill={accent} fillOpacity="0.12" stroke={accent} strokeOpacity="0.25" strokeWidth="1"/>
                    <text x="120" y="18" textAnchor="middle" fontSize="8" fill={accent} fillOpacity="0.8" fontFamily="sans-serif" letterSpacing="2" fontWeight="700">PROSPECTING</text>
                    <line x1="120" y1="26" x2="120" y2="38" stroke={accent} strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="3,2"/>
                    <polygon points="115,36 120,42 125,36" fill={accent} fillOpacity="0.4"/>
                    <rect x="35"  y="43" width="170" height="20" rx="5" fill={accent} fillOpacity="0.22" stroke={accent} strokeOpacity="0.4" strokeWidth="1"/>
                    <text x="120" y="56.5" textAnchor="middle" fontSize="8" fill={accent} fillOpacity="0.9" fontFamily="sans-serif" letterSpacing="2" fontWeight="700">RETARGETING</text>
                    <line x1="120" y1="63" x2="120" y2="73" stroke={accent} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3,2"/>
                    <polygon points="115,71 120,77 125,71" fill={accent} fillOpacity="0.5"/>
                    <rect x="65"  y="77" width="110" height="18" rx="5" fill={accent} fillOpacity="0.42" stroke={accent} strokeOpacity="0.65" strokeWidth="1"/>
                    <text x="120" y="89" textAnchor="middle" fontSize="8" fill={accent} fontFamily="sans-serif" letterSpacing="2" fontWeight="700">CONVERSION</text>
                  </svg>
                )}
                {card.id === 'creative' && (
                  <svg width="100%" height="88" viewBox="0 0 240 88">
                    {/* Card 1 — Image */}
                    <rect x="2"   y="6"  width="68" height="70" rx="8" fill={accent} fillOpacity="0.08" stroke={accent} strokeOpacity="0.18" strokeWidth="1"/>
                    <rect x="9"   y="13" width="54" height="34" rx="4" fill={accent} fillOpacity="0.15"/>
                    <polygon points="18,40 36,20 54,40" fill={accent} fillOpacity="0.28"/>
                    <circle cx="50" cy="22" r="5" fill={accent} fillOpacity="0.4"/>
                    <text x="36" y="66" textAnchor="middle" fontSize="7.5" fill={accent} fillOpacity="0.55">Image</text>
                    {/* Card 2 — Video (highlight) */}
                    <rect x="86"  y="2"  width="68" height="78" rx="8" fill={accent} fillOpacity="0.15" stroke={accent} strokeOpacity="0.4" strokeWidth="1.5"/>
                    <rect x="93"  y="9"  width="54" height="44" rx="4" fill={accent} fillOpacity="0.22"/>
                    <circle cx="120" cy="31" r="13" fill={accent} fillOpacity="0.3"/>
                    <polygon points="114,24 114,38 127,31" fill={accent} fillOpacity="0.9"/>
                    <text x="120" y="68" textAnchor="middle" fontSize="7.5" fill={accent} fontWeight="bold">Video ✦</text>
                    {/* Card 3 — Copy */}
                    <rect x="170" y="6"  width="68" height="70" rx="8" fill={accent} fillOpacity="0.08" stroke={accent} strokeOpacity="0.18" strokeWidth="1"/>
                    <rect x="178" y="15" width="52" height="5" rx="2" fill={accent} fillOpacity="0.38"/>
                    <rect x="178" y="24" width="42" height="4" rx="2" fill={accent} fillOpacity="0.24"/>
                    <rect x="178" y="32" width="46" height="4" rx="2" fill={accent} fillOpacity="0.24"/>
                    <rect x="178" y="40" width="36" height="4" rx="2" fill={accent} fillOpacity="0.18"/>
                    <rect x="178" y="48" width="44" height="4" rx="2" fill={accent} fillOpacity="0.18"/>
                    <text x="204" y="66" textAnchor="middle" fontSize="7.5" fill={accent} fillOpacity="0.55">Copy</text>
                  </svg>
                )}
              </div>

              {/* Capabilities */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {capabilities.map(c => (
                  <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                      background: `color-mix(in srgb, ${accent} 10%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${accent} 24%, transparent)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: accent }} />
                    </div>
                    <span style={{ color: '#9ca3af', fontSize: 11 }}>{c}</span>
                  </div>
                ))}
              </div>

              {/* CTA button */}
              <button style={{
                width: '100%', padding: '10px 16px', borderRadius: 9,
                border: `1px solid color-mix(in srgb, ${accent} ${isHov ? '70' : '35'}%, transparent)`,
                background: isHov ? accent : `color-mix(in srgb, ${accent} 18%, transparent)`,
                color: isHov ? '#0d0d0d' : 'rgba(255,255,255,0.9)',
                fontSize: 11, fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'background 0.28s, color 0.28s, border-color 0.28s',
                fontFamily: 'inherit',
              }}>
                Open {name} →
              </button>
            </div>
          );
        })}
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '12px 0 16px' }}>
        {AGENT_CARDS.map((card, i) => (
          <div key={i} style={{
            width: hovered === i ? 20 : 5, height: 5, borderRadius: 3,
            background: hovered === i ? card.accent : 'rgba(255,255,255,0.1)',
            transition: 'all 0.25s',
          }} />
        ))}
      </div>
    </section>
  );
};

// ─── Side panel (shared shell) ─────────────────────────────────────────────────

const SidePanel: React.FC<{
  isOpen: boolean; onClose: () => void;
  title: string; accent?: string;
  width?: number; noScroll?: boolean;
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, accent = '#ffffff', width = 480, noScroll, children }) => (
  <div
    className="fixed top-0 right-0 h-full z-40 flex flex-col"
    style={{
      width,
      background: 'var(--brand-surface)',
      borderLeft: '1px solid var(--brand-muted)',
      transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.3s cubic-bezier(.4,0,.2,1)',
    }}
  >
    <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
      style={{ borderColor: 'var(--brand-muted)', background: 'var(--brand-surface)' }}>
      <span className="font-black text-xs uppercase tracking-widest" style={{ color: accent }}>{title}</span>
      <button onClick={onClose} className="p-1.5 rounded transition-colors hover:bg-white/10">
        <X size={14} color="#6b7280" />
      </button>
    </div>
    {noScroll
      ? <div className="flex-1 flex flex-col min-h-0">{children}</div>
      : <div className="flex-1 overflow-y-auto p-6">{children}</div>
    }
  </div>
);

// ─── Settings panel ────────────────────────────────────────────────────────────

const SettingsPanel: React.FC<{ isOpen: boolean; onClose: () => void; metaUrl: string; onLogout: () => void }> = ({ isOpen, onClose, metaUrl, onLogout }) => (
  <SidePanel isOpen={isOpen} onClose={onClose} title="Settings">
    <a
      href={metaUrl} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between px-4 py-3 rounded-lg mb-6 transition-colors"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-muted)', color: '#9ca3af', textDecoration: 'none' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
    >
      <span className="text-xs font-bold uppercase tracking-widest">Meta Ads Manager</span>
      <ExternalLink size={13} />
    </a>
    <BrandingSettings />
    <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--brand-muted)' }}>
      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-colors text-xs font-bold uppercase tracking-widest"
        style={{ border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', background: 'rgba(239,68,68,0.04)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.45)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.25)'; }}
      >
        <LogOut size={13} /> Disconnect &amp; Restart Setup
      </button>
    </div>
  </SidePanel>
);

// ─── Page types ────────────────────────────────────────────────────────────────

type PageId = 'home' | 'analyst' | 'campaigner' | 'creative';


// ─── Chief Agent (Orchestrator) chat panel ─────────────────────────────────────

const OrchestratorChatPanel: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useAgentBus();
  const conv      = state.conversations.orchestrator;
  const isRunning = conv.status === 'THINKING' || conv.status === 'WORKING';
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const ACCENT = '#a78bfa';

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages, isOpen]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || isRunning) return;
    setInput('');
    await dispatch({ from: 'user', to: 'orchestrator', content: msg });
  };

  const messages = conv.messages.filter((m: AgentMessage) => m.from === 'user' || m.from === 'orchestrator');

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Chief Agent" accent={ACCENT} width={540} noScroll>

      {/* Sub-agent status pill */}
      {isRunning && conv.lastAction && conv.lastAction !== 'Analyzing…' && (
        <div className="shrink-0 px-6 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--brand-muted)' }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
          <span className="text-[11px] font-mono" style={{ color: '#6b7280' }}>{conv.lastAction}</span>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !isRunning && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center" style={{ minHeight: 200 }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}40` }}>
              <Sparkles size={24} color={ACCENT} />
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-1">Chief Agent</p>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                Orchestrates Analyst · Creative · Campaigner
              </p>
            </div>
            <div className="mt-2 space-y-2 w-full max-w-xs">
              {[
                'Analyze top campaigns and suggest a new creative',
                'Which ad sets should I scale today?',
                'Generate an image ad for our best product',
              ].map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="w-full text-left text-[11px] px-3 py-2 rounded-lg transition-colors"
                  style={{ background: `${ACCENT}0d`, border: `1px solid ${ACCENT}25`, color: '#9ca3af' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${ACCENT}55`; (e.currentTarget as HTMLElement).style.color = '#d1d5db'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${ACCENT}25`; (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}>
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(m => {
          const isUser = m.from === 'user';
          return (
            <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                <div className="w-6 h-6 rounded-lg flex items-center justify-center mr-2 mt-0.5 shrink-0"
                  style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}40` }}>
                  <Sparkles size={11} color={ACCENT} />
                </div>
              )}
              <div style={{
                maxWidth: '82%',
                padding: '10px 14px',
                borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: isUser ? `${ACCENT}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isUser ? `${ACCENT}40` : 'rgba(255,255,255,0.07)'}`,
                fontSize: 13, lineHeight: 1.65,
                color: isUser ? '#e2e8f0' : '#d1d5db',
                whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
            </div>
          );
        })}

        {isRunning && (
          <div className="flex justify-start items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}40` }}>
              <Sparkles size={11} color={ACCENT} />
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: '12px 12px 12px 2px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div className="flex gap-1">
                {[0, 150, 300].map(d => (
                  <span key={d} style={{
                    width: 6, height: 6, borderRadius: '50%', background: ACCENT,
                    display: 'inline-block',
                    animation: `pulse 1.4s ease-in-out ${d}ms infinite`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 py-4 border-t" style={{ borderColor: 'var(--brand-muted)' }}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Give the Chief Agent a mission…"
            disabled={isRunning}
            style={{
              flex: 1, background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--brand-muted)', borderRadius: 8,
              color: '#fff', fontSize: 13, padding: '10px 14px',
              outline: 'none', fontFamily: 'inherit',
              opacity: isRunning ? .5 : 1,
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isRunning}
            style={{
              padding: '10px 16px', borderRadius: 8, border: 'none',
              background: input.trim() && !isRunning ? ACCENT : `${ACCENT}22`,
              color: input.trim() && !isRunning ? '#000' : '#374151',
              fontSize: 12, fontWeight: 700,
              cursor: input.trim() && !isRunning ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </SidePanel>
  );
};

// ─── Page shell (shared wrapper) ──────────────────────────────────────────────

const PageShell: React.FC<{
  accent: string;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  onBack: () => void;
  children: React.ReactNode;
}> = ({ accent, icon, title, tagline, onBack, children }) => (
  <div>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '20px 0 18px', marginBottom: 8,
      borderBottom: '1px solid var(--brand-muted)',
    }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8,
          border: '1px solid var(--brand-muted)',
          background: 'transparent', color: '#9ca3af',
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', cursor: 'pointer',
          transition: 'color 0.2s, border-color 0.2s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.25)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; }}
      >
        <ArrowLeft size={12} /> Back
      </button>
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `color-mix(in srgb, ${accent} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: 20, fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>
          {title}
        </div>
        <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 3 }}>
          {tagline}
        </div>
      </div>
    </div>
    <div style={{ paddingTop: 24 }}>{children}</div>
  </div>
);

// ─── Analyst page ──────────────────────────────────────────────────────────────

const AnalystPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { state, dispatch } = useAgentBus();
  const conv      = state.conversations.analyst;
  const isRunning = conv.status === 'THINKING' || conv.status === 'WORKING';
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const ACCENT = '#06b6d4';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || isRunning) return;
    setInput('');
    await dispatch({ from: 'user', to: 'analyst', content: msg });
  };

  const messages = conv.messages.filter((m: AgentMessage) => m.from === 'user' || m.from === 'analyst');

  return (
    <PageShell
      accent={ACCENT}
      icon={<Activity size={20} color={ACCENT} />}
      title="Analyst"
      tagline="Campaign Intelligence"
      onBack={onBack}
    >
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid var(--brand-muted)',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        height: 'calc(100vh - 280px)',
        minHeight: 420,
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.length === 0 && !isRunning && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${ACCENT}18`, border: `1px solid ${ACCENT}40`,
              }}>
                <Activity size={26} color={ACCENT} />
              </div>
              <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.65, maxWidth: 340 }}>
                Ask the Analyst about your campaigns — ROAS, spend efficiency, creative fatigue, or scaling opportunities.
              </p>
            </div>
          )}
          {messages.map(m => {
            const isUser = m.from === 'user';
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '75%', padding: '12px 16px',
                  borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: isUser ? `${ACCENT}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isUser ? `${ACCENT}40` : 'rgba(255,255,255,0.07)'}`,
                  fontSize: 13.5, lineHeight: 1.65, color: isUser ? '#e2e8f0' : '#d1d5db',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            );
          })}
          {isRunning && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '12px 16px', borderRadius: '14px 14px 14px 2px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 150, 300].map(d => (
                    <span key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: ACCENT, display: 'inline-block', animation: `pulse 1.4s ease-in-out ${d}ms infinite` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div style={{ borderTop: '1px solid var(--brand-muted)', padding: '14px 16px', display: 'flex', gap: 8, flexShrink: 0 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the analyst anything…"
            disabled={isRunning}
            style={{
              flex: 1, background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--brand-muted)', borderRadius: 10,
              color: '#fff', fontSize: 13.5, padding: '11px 16px',
              outline: 'none', fontFamily: 'inherit',
              opacity: isRunning ? 0.5 : 1,
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || isRunning}
            style={{
              padding: '11px 22px', borderRadius: 10, border: 'none',
              background: input.trim() && !isRunning ? ACCENT : `${ACCENT}22`,
              color: input.trim() && !isRunning ? '#000' : '#374151',
              fontSize: 12, fontWeight: 700, cursor: input.trim() && !isRunning ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </PageShell>
  );
};

// ─── Campaigner page ───────────────────────────────────────────────────────────

const DECISION_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  SCALE: { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  label: '▲ Scale'  },
  HOLD:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: '⏸ Hold'   },
  PAUSE: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: '⏹ Pause'  },
};

const CampaignerPage: React.FC<{ onBack: () => void; pairs: CampaignPair[] }> = ({ onBack, pairs }) => {
  const [panelOpen, setPanelOpen] = useState(true);
  const ACCENT = 'var(--brand-primary)';

  return (
    <>
      <PageShell
        accent={ACCENT}
        icon={<TrendingUp size={20} color={ACCENT} />}
        title="Campaigner"
        tagline="AI Ad Builder"
        onBack={onBack}
      >
        <div style={{ transition: 'margin-right 0.3s', marginRight: panelOpen ? 510 : 0 }}>

          {/* ── Active Campaigns table ── */}
          <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--brand-muted)', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 90px 90px 70px 70px 110px',
              gap: 0,
              padding: '10px 20px',
              borderBottom: '1px solid var(--brand-muted)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              {['Campaign / Ad Set', 'Status', 'Budget/day', 'Spend', 'ROAS', 'Decision'].map(h => (
                <span key={h} style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {pairs.map((p, i) => {
              const ds = DECISION_STYLE[p.liveDecision ?? 'HOLD'] ?? DECISION_STYLE.HOLD;
              const isActive = p.adSetStatus === 'ACTIVE';
              return (
                <div
                  key={p.adSetId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 90px 90px 70px 70px 110px',
                    gap: 0,
                    padding: '12px 20px',
                    borderBottom: i < pairs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* Name */}
                  <div>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{p.productName}</div>
                    <div style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>{p.adSetName}</div>
                  </div>
                  {/* Status */}
                  <div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                      color: isActive ? '#10b981' : '#6b7280',
                      background: isActive ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isActive ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                      {isActive ? '● Active' : '○ Paused'}
                    </span>
                  </div>
                  {/* Budget */}
                  <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600 }}>${(p.dailyBudgetUsd ?? 0).toFixed(0)}</div>
                  {/* Spend */}
                  <div style={{ color: '#9ca3af', fontSize: 12 }}>${p.spend?.toFixed(0) ?? '—'}</div>
                  {/* ROAS */}
                  <div style={{ color: p.roas && p.roas >= 5 ? '#10b981' : p.roas && p.roas >= 3 ? '#f59e0b' : '#ef4444', fontSize: 12, fontWeight: 700 }}>
                    {p.roas != null ? `${p.roas.toFixed(1)}x` : '—'}
                  </div>
                  {/* Decision */}
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: ds.color, background: ds.bg }}>
                      {ds.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Launch new campaign strip ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(0,0,0,0.2)', border: '1px solid var(--brand-muted)',
            borderRadius: 12, padding: '16px 22px',
          }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Launch a new campaign</div>
              <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3 }}>Describe your goal — the agent handles targeting, structure & budget</div>
            </div>
            {!panelOpen && (
              <button
                onClick={() => setPanelOpen(true)}
                style={{
                  padding: '10px 22px', borderRadius: 9, flexShrink: 0,
                  border: `1px solid color-mix(in srgb, ${ACCENT} 40%, transparent)`,
                  background: `color-mix(in srgb, ${ACCENT} 15%, transparent)`,
                  color: '#fff', fontSize: 12, fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
                }}
              >
                Open Builder →
              </button>
            )}
          </div>
        </div>
      </PageShell>
      <NewCampaignConversation isOpen={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
};

// ─── Creative page ─────────────────────────────────────────────────────────────

const CreativePage: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <PageShell
    accent="#a78bfa"
    icon={<Sparkles size={20} color="#a78bfa" />}
    title="AI Creative Studio"
    tagline="Image · Video · Copy"
    onBack={onBack}
  >
    <AICreativeSuite />
  </PageShell>
);

// ─── Inner dashboard (needs ToastProvider) ─────────────────────────────────────

const DashboardInner: React.FC<{ onLogout?: () => void }> = ({ onLogout = () => {} }) => {
  const brand = useBrand();

  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const [orchestratorOpen, setOrchestratorOpen] = useState(false);
  const [devOpen,          setDevOpen]          = useState(false);
  const [currentPage,      setCurrentPage]      = useState<PageId>('home');

  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [_isLive,    setIsLive]     = useState(false);
  const hasDataRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: StatusResponse = await res.json();
      setStatusData(json);
      setIsLive(true);
      hasDataRef.current = true;
    } catch {
      if (!hasDataRef.current) {
        setStatusData({
          lastUpdated: new Date().toISOString(), lastRunAt: null, runCount: 0,
          accountId: 'act_DEMO', siteHealth: 'OK', bugPage: null, pairs: MOCK_PAIRS,
        });
        hasDataRef.current = true;
      }
      setIsLive(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const pairs = statusData?.pairs ?? MOCK_PAIRS;
  const accountNum = (statusData?.accountId ?? '').replace('act_', '');
  const metaUrl    = accountNum
    ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountNum}`
    : 'https://adsmanager.facebook.com';

  const navBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 'var(--radius-size)',
    border: '1px solid var(--brand-muted)',
    color: '#9ca3af', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    cursor: 'pointer', background: 'transparent',
    transition: 'color 0.2s, border-color 0.2s',
  };

  const pageActive = (color: string): React.CSSProperties => ({
    color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
  });

  return (
    <div className="min-h-screen" style={{ background: 'var(--brand-surface)' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--brand-surface-card)',
          borderColor: 'var(--brand-muted)',
          padding: '0 28px',
          height: 72,
          flexShrink: 0,
        }}
      >
        {/* Left — brand logo + log out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => setCurrentPage('home')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            <img
              src={brand.logoUrl} alt={brand.name}
              style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'contain', background: `${brand.primary}18`, flexShrink: 0 }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </button>
          <div style={{ width: 1, height: 26, background: 'var(--brand-muted)' }} />
          <button
            onClick={onLogout}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.32)', fontSize: 11, fontWeight: 500, letterSpacing: '0.03em', padding: 0, transition: 'color 0.18s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.32)'; }}
          >
            <LogOut size={11} /> Log out
          </button>
        </div>

        {/* Right — nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            onClick={() => { setOrchestratorOpen(o => !o); setSettingsOpen(false); }}
            style={{ ...navBtn, ...(orchestratorOpen ? pageActive('#a78bfa') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a78bfa'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,#a78bfa 40%,transparent)'; }}
            onMouseLeave={e => { if (!orchestratorOpen) { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Sparkles size={12} /> Chief Agent
          </button>
          <button
            onClick={() => { setCurrentPage('analyst'); setOrchestratorOpen(false); setSettingsOpen(false); }}
            style={{ ...navBtn, ...(currentPage === 'analyst' ? pageActive('#06b6d4') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#06b6d4'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,#06b6d4 40%,transparent)'; }}
            onMouseLeave={e => { if (currentPage !== 'analyst') { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Activity size={12} /> Analyst
          </button>
          <button
            onClick={() => { setCurrentPage('campaigner'); setOrchestratorOpen(false); setSettingsOpen(false); }}
            style={{ ...navBtn, ...(currentPage === 'campaigner' ? pageActive('var(--brand-primary)') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,var(--brand-primary) 40%,transparent)'; }}
            onMouseLeave={e => { if (currentPage !== 'campaigner') { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <TrendingUp size={12} /> Campaigner
          </button>
          <button
            onClick={() => { setCurrentPage('creative'); setOrchestratorOpen(false); setSettingsOpen(false); }}
            style={{ ...navBtn, ...(currentPage === 'creative' ? pageActive('#a78bfa') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a78bfa'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,#a78bfa 40%,transparent)'; }}
            onMouseLeave={e => { if (currentPage !== 'creative') { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Sparkles size={12} /> AI Creative
          </button>
          <button
            onClick={() => { setSettingsOpen(o => !o); setOrchestratorOpen(false); }}
            style={{ ...navBtn, ...(settingsOpen ? pageActive('var(--brand-primary)') : {}) }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--brand-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb,var(--brand-primary) 40%,transparent)'; }}
            onMouseLeave={e => { if (!settingsOpen) { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-muted)'; } }}>
            <Settings size={12} /> Settings
          </button>
        </nav>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main
        className="transition-all duration-300"
        style={{
          ...(settingsOpen || orchestratorOpen ? { marginRight: 560 } : {}),
          ...(currentPage === 'home' ? {
            height: 'calc(100vh - 72px)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          } : {
            maxWidth: 1280, margin: '0 auto', padding: '0 24px',
          }),
        }}
      >
        {currentPage === 'home' && (
          <>
            {/* Scale.ai brand hero */}
            <div style={{ textAlign: 'center', padding: '14px 0 6px', flexShrink: 0 }}>
              <span style={{
                fontSize: 58, fontWeight: 700, letterSpacing: '-0.03em',
                fontFamily: 'var(--font-display)', lineHeight: 1, color: '#fff',
              }}>
                Scale<span style={{ color: 'var(--brand-primary)' }}>.ai</span>
              </span>
            </div>
            <AgentCarousel onOpen={id => setCurrentPage(id)} />
          </>
        )}
        {currentPage === 'analyst'    && <AnalystPage    onBack={() => setCurrentPage('home')} />}
        {currentPage === 'campaigner' && <CampaignerPage onBack={() => setCurrentPage('home')} pairs={pairs} />}
        {currentPage === 'creative'   && <CreativePage   onBack={() => setCurrentPage('home')} />}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t px-6 py-4 mt-10" style={{ borderColor: 'var(--brand-muted)' }}>
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <p className="text-[10px] font-mono" style={{ color: '#374151' }}>
            ScaleAI · AI Marketing Intelligence
          </p>
          <button onClick={() => setDevOpen(o => !o)}
            className="flex items-center gap-1.5 text-[10px] font-mono transition-colors"
            style={{ color: '#374151' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#6b7280'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#374151'; }}>
            Developer Tools
            {devOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
        {devOpen && (
          <div className="max-w-screen-xl mx-auto mt-6 space-y-5">
            <ConnectionMap />
            <MetaLiveFeed />
          </div>
        )}
      </footer>

      {/* ── Side panels ─────────────────────────────────────────────────────── */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} metaUrl={metaUrl} onLogout={onLogout} />
      <OrchestratorChatPanel isOpen={orchestratorOpen} onClose={() => setOrchestratorOpen(false)} />
      {(settingsOpen || orchestratorOpen) && (
        <div className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={() => { setSettingsOpen(false); setOrchestratorOpen(false); }} />
      )}
    </div>
  );
};

// ─── Dashboard ─────────────────────────────────────────────────────────────────

const Dashboard: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => (
  <ToastProvider>
    <AgentProvider>
      <DashboardInner onLogout={onLogout} />
    </AgentProvider>
  </ToastProvider>
);

export default Dashboard;
