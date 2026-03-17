import React, { useState } from 'react';

export interface BudgetPlayer {
  id: string;
  name: string;         // e.g. "TikTok UK"
  platform: string;
  country: string;
  budget: number;
  roas: number;
  status: 'performer' | 'underperformer';
}

interface SubstitutionBoardProps {
  players: BudgetPlayer[];
  totalBudget: number;
  onTransfer?: (fromId: string, toId: string, amount: number) => void;
}

export const SubstitutionBoard: React.FC<SubstitutionBoardProps> = ({
  players,
  totalBudget,
  onTransfer,
}) => {
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [selectedTo, setSelectedTo] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [confirmed, setConfirmed] = useState(false);

  const underperformers = players.filter((p) => p.status === 'underperformer');
  const performers = players.filter((p) => p.status === 'performer');

  const fromPlayer = players.find((p) => p.id === selectedFrom);
  const toPlayer = players.find((p) => p.id === selectedTo);
  const maxTransfer = fromPlayer ? fromPlayer.budget : 0;

  const handleConfirm = () => {
    if (selectedFrom && selectedTo && transferAmount > 0 && onTransfer) {
      onTransfer(selectedFrom, selectedTo, transferAmount);
      setConfirmed(true);
      setTimeout(() => {
        setConfirmed(false);
        setSelectedFrom(null);
        setSelectedTo(null);
        setTransferAmount(0);
      }, 2500);
    }
  };

  const roasColor = (roas: number) =>
    roas > 5 ? 'text-electric-yellow' : roas >= 3 ? 'text-yellow-400' : 'text-danger-red';

  return (
    <div className="bg-card-dark border border-border-dark rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">🔄</span>
        <div>
          <h2 className="text-white font-display font-bold uppercase tracking-widest text-sm">
            Substitution Board — Budget Management
          </h2>
          <p className="text-text-secondary text-xs mt-0.5">
            Shift budget from underperformers to star players
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-text-secondary text-xs uppercase tracking-wider">Total Budget</p>
          <p className="text-electric-yellow font-display font-black text-xl">
            ${totalBudget.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* OUT column — underperformers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold bg-danger-red/20 text-danger-red border border-danger-red/40 px-2 py-1 rounded uppercase tracking-widest">
              🟥 Sub OUT
            </span>
            <span className="text-text-secondary text-xs">Underperforming</span>
          </div>
          <div className="flex flex-col gap-2">
            {underperformers.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedFrom(p.id)}
                className={`
                  w-full text-left p-3 rounded-lg border transition-all duration-200
                  ${selectedFrom === p.id
                    ? 'border-danger-red bg-danger-red/10 shadow-red-glow'
                    : 'border-border-dark bg-pitch-dark hover:border-danger-red/60'}
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-xs font-bold uppercase tracking-wide">
                      {p.name}
                    </p>
                    <p className="text-text-secondary text-xs">{p.platform} · {p.country}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-display font-black text-lg ${roasColor(p.roas)}`}>
                      {p.roas.toFixed(1)}x
                    </p>
                    <p className="text-text-secondary text-xs">${p.budget.toLocaleString()}</p>
                  </div>
                </div>
                {selectedFrom === p.id && (
                  <p className="mt-1 text-danger-red text-xs font-bold">▶ Selected for removal</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* IN column — star performers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold bg-electric-yellow/20 text-electric-yellow border border-electric-yellow/40 px-2 py-1 rounded uppercase tracking-widest">
              ⚡ Sub IN
            </span>
            <span className="text-text-secondary text-xs">Star Performers</span>
          </div>
          <div className="flex flex-col gap-2">
            {performers.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedTo(p.id)}
                className={`
                  w-full text-left p-3 rounded-lg border transition-all duration-200
                  ${selectedTo === p.id
                    ? 'border-electric-yellow bg-electric-yellow/10 border-glow-yellow'
                    : 'border-border-dark bg-pitch-dark hover:border-electric-yellow/60'}
                `}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-xs font-bold uppercase tracking-wide">
                      {p.name}
                    </p>
                    <p className="text-text-secondary text-xs">{p.platform} · {p.country}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-display font-black text-lg ${roasColor(p.roas)}`}>
                      {p.roas.toFixed(1)}x
                    </p>
                    <p className="text-text-secondary text-xs">${p.budget.toLocaleString()}</p>
                  </div>
                </div>
                {selectedTo === p.id && (
                  <p className="mt-1 text-electric-yellow text-xs font-bold">▶ Selected to receive</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transfer controls — shown when both players selected */}
      {selectedFrom && selectedTo && (
        <div className="mt-6 p-4 bg-pitch-dark border border-electric-yellow/30 rounded-xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-electric-yellow font-display font-bold text-xs uppercase tracking-widest">
              Transfer Amount
            </span>
            <span className="text-text-secondary text-xs">
              (Max: ${maxTransfer.toLocaleString()})
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={maxTransfer}
            step={100}
            value={transferAmount}
            onChange={(e) => setTransferAmount(Number(e.target.value))}
            className="w-full accent-electric-yellow cursor-pointer"
          />

          <div className="flex justify-between items-center mt-3">
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-danger-red font-bold">
                  {fromPlayer?.name}
                </span>
                <span className="text-text-secondary mx-2">→</span>
                <span className="text-electric-yellow font-bold">
                  {toPlayer?.name}
                </span>
              </div>
              <span className="text-white font-display font-black text-lg">
                ${transferAmount.toLocaleString()}
              </span>
            </div>

            <button
              onClick={handleConfirm}
              disabled={transferAmount === 0}
              className={`
                px-5 py-2 rounded-lg font-display font-bold uppercase tracking-widest text-xs
                transition-all duration-200
                ${transferAmount > 0
                  ? 'bg-electric-yellow text-deep-black hover:shadow-yellow-glow'
                  : 'bg-border-dark text-muted-gray cursor-not-allowed'}
              `}
            >
              Confirm Sub
            </button>
          </div>
        </div>
      )}

      {/* Confirmation flash */}
      {confirmed && (
        <div className="mt-4 p-3 bg-success-green/10 border border-success-green rounded-lg flex items-center gap-2">
          <span className="text-success-green text-xl">✅</span>
          <p className="text-success-green font-bold text-sm uppercase tracking-wider">
            Substitution Confirmed — Budget Transferred
          </p>
        </div>
      )}
    </div>
  );
};

export default SubstitutionBoard;
