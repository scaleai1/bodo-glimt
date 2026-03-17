import React, { useEffect, useRef, useState } from 'react';

export type InjurySeverity = 'healthy' | 'warning' | 'critical';

export interface TechnicalInjury {
  id: string;
  type: '404' | 'payment_error' | 'slow_load' | 'api_down' | 'checkout_friction';
  message: string;
  severity: InjurySeverity;
  timestamp: string;
  url?: string;
  count?: number;
}

interface InjuryReportProps {
  injuries: TechnicalInjury[];
  isLive?: boolean;
}

// Generate an EKG-like SVG path
function buildEkgPath(
  width: number,
  height: number,
  injuries: TechnicalInjury[],
  flatline: boolean
): string {
  if (flatline) {
    const mid = height / 2;
    return `M0,${mid} L${width},${mid}`;
  }

  const points: [number, number][] = [];
  const segments = 40;
  const step = width / segments;
  const mid = height / 2;

  for (let i = 0; i <= segments; i++) {
    const x = i * step;
    // Inject spikes at injury positions
    const spikeAt = injuries
      .map((_, idx) => Math.floor((idx + 1) * (segments / (injuries.length + 1))))
      .includes(i);

    if (spikeAt) {
      const inj = injuries[Math.floor((i / segments) * injuries.length)];
      const spikeHeight =
        inj.severity === 'critical' ? height * 0.8 :
        inj.severity === 'warning'  ? height * 0.45 : height * 0.2;
      // spike up then down
      points.push([x - step * 0.2, mid]);
      points.push([x,             mid - spikeHeight]);
      points.push([x + step * 0.2, mid + spikeHeight * 0.4]);
      points.push([x + step * 0.4, mid]);
    } else {
      const noise = (Math.sin(i * 1.3) * 3) + (Math.cos(i * 0.7) * 2);
      points.push([x, mid + noise]);
    }
  }

  return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}`;
}

const severityConfig: Record<InjurySeverity, { color: string; bg: string; label: string; icon: string }> = {
  healthy:  { color: 'text-success-green', bg: 'bg-success-green/10 border-success-green', label: 'HEALTHY', icon: '💚' },
  warning:  { color: 'text-yellow-400',    bg: 'bg-yellow-400/10 border-yellow-400',       label: 'WARNING', icon: '⚠️'  },
  critical: { color: 'text-danger-red',    bg: 'bg-danger-red/10 border-danger-red',        label: 'CRITICAL INJURY', icon: '🚨' },
};

const injuryTypeLabel: Record<TechnicalInjury['type'], string> = {
  '404':              '404 — Dead Ad URL',
  'payment_error':    'Payment Gateway Error',
  'slow_load':        'Slow Page Load',
  'api_down':         'API Connection Down',
  'checkout_friction':'Checkout Friction',
};

export const InjuryReport: React.FC<InjuryReportProps> = ({ injuries, isLive = true }) => {
  const svgRef = useRef<SVGPathElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 80 });
  const containerRef = useRef<HTMLDivElement>(null);

  const hasCritical = injuries.some((i) => i.severity === 'critical');
  const hasWarning  = injuries.some((i) => i.severity === 'warning');
  const overallStatus: InjurySeverity = hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy';
  const cfg = severityConfig[overallStatus];

  useEffect(() => {
    const updateDims = () => {
      if (containerRef.current) {
        setDimensions({
          width:  containerRef.current.offsetWidth - 48,
          height: 80,
        });
      }
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []);

  const ekgPath = buildEkgPath(dimensions.width, dimensions.height, injuries, overallStatus === 'healthy');
  const lineColor = hasCritical ? '#FF2D2D' : hasWarning ? '#EAB308' : '#00FF6A';

  return (
    <div className="bg-card-dark border border-border-dark rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏥</span>
          <div>
            <h2 className="text-white font-display font-bold uppercase tracking-widest text-sm">
              Injury Report — Technical Health
            </h2>
            <p className="text-text-secondary text-xs mt-0.5">Real-time site diagnostics</p>
          </div>
        </div>

        {/* Status badge */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-widest ${cfg.bg} ${cfg.color}`}>
          <span>{cfg.icon}</span>
          <span>{cfg.label}</span>
          {isLive && (
            <span className={`w-2 h-2 rounded-full ${hasCritical ? 'bg-danger-red animate-ping' : 'bg-success-green'}`} />
          )}
        </div>
      </div>

      {/* EKG Monitor */}
      <div
        ref={containerRef}
        className={`
          relative bg-pitch-dark rounded-lg border p-3 mb-5 overflow-hidden
          ${hasCritical ? 'border-danger-red' : hasWarning ? 'border-yellow-500' : 'border-success-green/40'}
        `}
        style={{ minHeight: '100px' }}
      >
        {/* Scan line effect */}
        <div
          className="absolute inset-y-0 w-px opacity-20 pointer-events-none"
          style={{
            background: lineColor,
            left: '0%',
            animation: 'scan-line 3s linear infinite',
          }}
        />

        {/* EKG label */}
        <div className="absolute top-2 left-3 flex items-center gap-2 z-10">
          <span className="text-xs font-mono text-text-secondary">EKG MONITOR</span>
          {isLive && (
            <span className={`text-xs font-mono animate-pulse ${hasCritical ? 'text-danger-red' : 'text-success-green'}`}>
              ● LIVE
            </span>
          )}
        </div>

        {/* SVG EKG line */}
        <svg
          width={dimensions.width}
          height={dimensions.height}
          className="mt-4"
          style={{ overflow: 'visible' }}
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={0} y1={dimensions.height * ratio}
              x2={dimensions.width} y2={dimensions.height * ratio}
              stroke="#2A2A2A"
              strokeWidth={1}
              strokeDasharray="4,4"
            />
          ))}

          {/* EKG path */}
          <path
            ref={svgRef}
            d={ekgPath}
            fill="none"
            stroke={lineColor}
            strokeWidth={hasCritical ? 2.5 : 2}
            strokeLinejoin="round"
            className={overallStatus === 'healthy' ? 'ekg-path' : ''}
            style={{
              filter: `drop-shadow(0 0 4px ${lineColor})`,
            }}
          />

          {/* Flatline label */}
          {overallStatus === 'healthy' && injuries.length === 0 && (
            <text
              x={dimensions.width / 2}
              y={dimensions.height / 2 - 12}
              fill="#5A5A5A"
              textAnchor="middle"
              fontSize={11}
              fontFamily="monospace"
            >
              All systems nominal
            </text>
          )}
        </svg>

        {/* Critical overlay text */}
        {hasCritical && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <span className="text-danger-red text-xs font-display font-black uppercase tracking-widest animate-pulse">
              ⚡ Technical Injury Detected — Urgent Fix Required
            </span>
          </div>
        )}
      </div>

      {/* Injury list */}
      {injuries.length === 0 ? (
        <div className="flex items-center gap-2 p-3 bg-success-green/5 border border-success-green/30 rounded-lg">
          <span className="text-success-green text-lg">✅</span>
          <p className="text-success-green text-sm font-bold uppercase tracking-wider">
            No injuries detected. All systems operational.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {injuries.map((injury) => {
            const scfg = severityConfig[injury.severity];
            return (
              <div
                key={injury.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${scfg.bg}`}
              >
                <span className="text-lg mt-0.5">{scfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold uppercase tracking-widest ${scfg.color}`}>
                      {injuryTypeLabel[injury.type]}
                    </span>
                    {injury.count !== undefined && (
                      <span className="text-xs text-text-secondary font-mono">
                        ×{injury.count}
                      </span>
                    )}
                  </div>
                  <p className="text-white text-xs mt-1">{injury.message}</p>
                  {injury.url && (
                    <p className="text-text-secondary text-xs font-mono mt-1 truncate">{injury.url}</p>
                  )}
                </div>
                <span className="text-text-secondary text-xs font-mono whitespace-nowrap">
                  {injury.timestamp}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InjuryReport;
