import { Check, X, Shuffle, Music } from 'lucide-react';
import type { TrackRequest } from '../hooks/useCommunity';

interface RequestQueueProps {
  queue: TrackRequest[];
  onAccept: (requestId: string) => void;
  onSkip: (requestId: string) => void;
  onShuffle: (requestId: string) => void;
  onLoadTrack?: (trackName: string, blobUrl?: string) => void;
}

export default function RequestQueue({ queue, onAccept, onSkip, onShuffle, onLoadTrack }: RequestQueueProps) {
  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted/40 text-[0.65rem] font-mono text-center">
        <Music className="w-6 h-6 mb-2 opacity-40" />
        <span>No pending requests</span>
      </div>
    );
  }

  const next = queue[0];
  const rest = queue.slice(1);

  return (
    <div className="space-y-2">
      {/* Next up */}
      <div className="bg-surface border border-accent/30 rounded-xl p-3 shadow-lg shadow-accent/5">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[0.55rem] font-mono text-accent/60 uppercase tracking-widest">NEXT UP</span>
          <span className="text-[0.55rem] font-mono text-muted">#{next.queuePosition}</span>
        </div>
        <div className="font-semibold text-[0.8rem] text-text truncate mb-0.5">{next.trackName}</div>
        <div className="text-[0.65rem] text-muted font-mono mb-2">
          Requested by <span className="text-[#00e5ff]">{next.username}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { onAccept(next.id); onLoadTrack?.(next.trackName); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 rounded-lg text-[0.65rem] font-bold transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> ACCEPT
          </button>
          <button
            onClick={() => onShuffle(next.id)}
            className="px-3 py-1.5 bg-surface2 hover:bg-surface2/80 text-muted border border-border rounded-lg text-[0.65rem] font-bold transition-colors"
            title="Move to end of queue"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSkip(next.id)}
            className="px-3 py-1.5 bg-red/10 hover:bg-red/20 text-red border border-red/30 rounded-lg text-[0.65rem] font-bold transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Queue (rest) */}
      {rest.length > 0 && (
        <div className="space-y-1">
          <div className="text-[0.55rem] font-mono text-muted/60 uppercase tracking-widest px-1">
            IN QUEUE ({rest.length})
          </div>
          {rest.map(req => (
            <div key={req.id} className="flex items-center gap-2 px-2 py-1.5 bg-surface/50 border border-border/50 rounded-lg">
              <span className="text-[0.6rem] font-mono text-muted/60 w-5 text-center">#{req.queuePosition}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[0.7rem] text-text truncate">{req.trackName}</div>
                <div className="text-[0.6rem] text-muted/60 font-mono">{req.username}</div>
              </div>
              <button
                onClick={() => onSkip(req.id)}
                className="p-1 text-muted/40 hover:text-red transition-colors"
                title="Skip"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
