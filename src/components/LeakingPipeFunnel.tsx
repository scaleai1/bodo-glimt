import React from 'react';

export interface FunnelStep {
  label: string;
  users: number;
  icon: string;
}

interface LeakingPipeFunnelProps {
  steps: FunnelStep[];
  dropThreshold?: number; // percentage drop to flag as leak (default 30)
}

function getDropPercent(current: number, prev: number): number {
  if (prev === 0) return 0;
  return ((prev - current) / prev) * 100;
}

function getAlertType(drop: number, threshold: number): 'none' | 'warn' | 'critical' {
  if (drop >= threshold + 20) return 'critical';
  if (drop >= threshold) return 'warn';
  return 'none';
}

export const LeakingPipeFunnel: React.FC<LeakingPipeFunnelProps> = ({
  steps,
  dropThreshold = 30,
}) => {
  return (
    <div className="bg-card-dark border border-border-dark rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">🪣</span>
        <div>
          <h2 className="text-white font-display font-bold uppercase tracking-widest text-sm">
            Leaking Pipe — User Journey
          </h2>
          <p className="text-text-secondary text-xs mt-0.5">Ad → Cart → Goal</p>
        </div>
      </div>

      {/* Funnel */}
      <div className="flex flex-col items-center gap-0 w-full">
        {steps.map((step, i) => {
          const prev = steps[i - 1];
          const drop = prev ? getDropPercent(step.users, prev.users) : 0;
          const alert = prev ? getAlertType(drop, dropThreshold) : 'none';
          const isGoal = i === steps.length - 1;
          const widthPercent = prev
            ? Math.max(35, (step.users / steps[0].users) * 100)
            : 100;

          return (
            <React.Fragment key={step.label}>
              {/* Connector / Pipe between steps */}
              {i > 0 && (
                <div className="flex flex-col items-center w-full relative" style={{ height: '48px' }}>
                  {/* Pipe segment */}
                  <div
                    className={`w-2 h-full rounded transition-colors duration-500 ${
                      alert === 'critical'
                        ? 'bg-danger-red'
                        : alert === 'warn'
                        ? 'bg-yellow-500'
                        : 'bg-electric-yellow opacity-40'
                    }`}
                  />

                  {/* Crack / Leak visual */}
                  {alert !== 'none' && (
                    <div className="absolute right-1/2 translate-x-16 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
                      {/* Drip drops */}
                      <div className="flex flex-col gap-1">
                        {[0, 1, 2].map((d) => (
                          <span
                            key={d}
                            className="drip-drop text-xs"
                            style={{ animationDelay: `${d * 0.4}s` }}
                          >
                            💧
                          </span>
                        ))}
                      </div>

                      {/* Alert bubble */}
                      <div
                        className={`
                          px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider
                          whitespace-nowrap flex items-center gap-1.5
                          ${alert === 'critical'
                            ? 'bg-danger-red/10 border-danger-red text-danger-red'
                            : 'bg-yellow-500/10 border-yellow-500 text-yellow-400'}
                        `}
                      >
                        <span>⚠️</span>
                        <span>
                          {alert === 'critical' ? 'FLOW OBSTACLE' : 'DROP DETECTED'}
                          {' '}−{drop.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step node */}
              <div
                className="relative flex flex-col items-center"
                style={{ width: `${widthPercent}%`, transition: 'width 0.5s ease' }}
              >
                <div
                  className={`
                    w-full rounded-lg px-4 py-3 flex items-center justify-between
                    border transition-all duration-300
                    ${isGoal
                      ? 'bg-success-green/10 border-success-green shadow-green-glow'
                      : alert === 'critical'
                      ? 'bg-danger-red/10 border-danger-red'
                      : alert === 'warn'
                      ? 'bg-yellow-500/10 border-yellow-500'
                      : 'bg-pitch-dark border-border-dark'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{step.icon}</span>
                    <div>
                      <p className="text-white text-xs font-bold uppercase tracking-wider">
                        {step.label}
                      </p>
                      {prev && (
                        <p className="text-text-secondary text-xs mt-0.5">
                          {drop.toFixed(1)}% drop from previous
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`font-display font-black text-xl ${
                      isGoal ? 'text-success-green' : 'text-electric-yellow'
                    }`}>
                      {step.users.toLocaleString()}
                    </p>
                    <p className="text-text-secondary text-xs">users</p>
                  </div>
                </div>

                {/* Goal glow */}
                {isGoal && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-2xl">⚽</span>
                    <span className="text-success-green font-display font-bold text-sm uppercase tracking-widest">
                      GOAL!
                    </span>
                    <span className="text-2xl">⚽</span>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-6 pt-4 border-t border-border-dark">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <div className="w-3 h-3 rounded-full bg-electric-yellow opacity-60" />
          Healthy
        </div>
        <div className="flex items-center gap-1.5 text-xs text-yellow-400">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          Drop Alert (&gt;{dropThreshold}%)
        </div>
        <div className="flex items-center gap-1.5 text-xs text-danger-red">
          <div className="w-3 h-3 rounded-full bg-danger-red" />
          Flow Obstacle (&gt;{dropThreshold + 20}%)
        </div>
      </div>
    </div>
  );
};

export default LeakingPipeFunnel;
