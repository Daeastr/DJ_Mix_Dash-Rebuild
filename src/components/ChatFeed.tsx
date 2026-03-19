import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Trash2, VolumeX, ChevronDown } from 'lucide-react';
import type { CommunityEvent, UserRole } from '../hooks/useCommunity';

interface ChatFeedProps {
  messages: CommunityEvent[];
  currentUserId: string | null;
  currentUserRole: UserRole | null;
  onDeleteMessage: (id: string) => void;
  onMuteUser: (userId: string, username: string, duration: number | null) => void;
}

const MAX_MESSAGES = 150;

function getEventStyle(type: CommunityEvent['type']): { bg: string; border: string; textColor: string } {
  switch (type) {
    case 'request': return { bg: 'bg-[#00e5ff]/8', border: 'border-[#00e5ff]/30', textColor: 'text-[#00e5ff]' };
    case 'accepted': return { bg: 'bg-accent/8', border: 'border-accent/30', textColor: 'text-accent' };
    case 'skipped': return { bg: 'bg-surface/50', border: 'border-border/50', textColor: 'text-muted' };
    case 'shoutout': return { bg: 'bg-[#bf00ff]/10', border: 'border-[#bf00ff]/40', textColor: 'text-[#bf00ff]' };
    case 'replay': return { bg: 'bg-[#ff9500]/10', border: 'border-[#ff9500]/40', textColor: 'text-[#ff9500]' };
    case 'join':
    case 'leave': return { bg: 'bg-transparent', border: 'border-transparent', textColor: 'text-muted' };
    default: return { bg: 'bg-transparent', border: 'border-transparent', textColor: 'text-text' };
  }
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface ContextMenuState {
  x: number;
  y: number;
  event: CommunityEvent;
}

export default function ChatFeed({ messages, currentUserId, currentUserRole, onDeleteMessage, onMuteUser }: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const isModOrDJ = currentUserRole === 'dj' || currentUserRole === 'mod';

  const displayMessages = messages.slice(-MAX_MESSAGES);

  const scrollToBottom = useCallback((smooth = true) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  useEffect(() => {
    if (!isScrolledUp) {
      scrollToBottom();
    }
  }, [messages.length, isScrolledUp, scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setIsScrolledUp(!atBottom);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, event: CommunityEvent) => {
    if (!isModOrDJ) return;
    if (event.type === 'join' || event.type === 'leave') return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, event });
  }, [isModOrDJ]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar"
      >
        {displayMessages.map(event => {
          const style = getEventStyle(event.type);
          const isSystemEvent = event.type === 'join' || event.type === 'leave';

          return (
            <div
              key={event.id}
              onContextMenu={(e) => handleContextMenu(e, event)}
              className={`group relative rounded-lg px-2 py-1 border ${style.bg} ${style.border} ${isSystemEvent ? 'py-0.5' : ''}`}
            >
              {isSystemEvent ? (
                <span className="text-[10px] text-muted/60 font-mono">{event.message}</span>
              ) : event.type === 'shoutout' ? (
                <div className={`text-[0.75rem] font-bold ${style.textColor} tracking-wide`}>
                  {event.message}
                </div>
              ) : event.type === 'request' ? (
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[0.6rem] font-bold uppercase tracking-widest ${style.textColor}`}>REQUEST</span>
                    {event.metadata?.queuePosition && (
                      <span className="text-[0.6rem] font-mono text-muted">#{event.metadata.queuePosition}</span>
                    )}
                  </div>
                  <div className="text-[0.7rem] text-text">
                    <span className="font-semibold" style={{ color: stringToColor(event.username) }}>{event.username}</span>
                    {' '}<span className="text-muted">wants to hear</span>{' '}
                    <span className="font-bold text-[#00e5ff]">{event.metadata?.trackName}</span>
                  </div>
                </div>
              ) : event.type === 'accepted' || event.type === 'skipped' ? (
                <div className={`text-[0.7rem] font-mono ${style.textColor}`}>{event.message}</div>
              ) : event.type === 'replay' ? (
                <div className={`text-[0.7rem] font-mono ${style.textColor}`}>{event.message}</div>
              ) : (
                <div className="text-[0.75rem] leading-relaxed">
                  <span className="font-semibold mr-1.5" style={{ color: stringToColor(event.username) }}>{event.username}</span>
                  <span className="text-text/90">{event.message}</span>
                </div>
              )}

              {!isSystemEvent && (
                <span className="absolute right-1.5 bottom-0.5 text-[9px] text-muted/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatTimestamp(event.timestamp)}
                </span>
              )}
            </div>
          );
        })}

        {displayMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-muted/40 text-[0.65rem] font-mono text-center">
            <span>No messages yet</span>
            <span className="mt-1 opacity-60">Be the first to chat!</span>
          </div>
        )}
      </div>

      {isScrolledUp && (
        <button
          onClick={() => { scrollToBottom(); setIsScrolledUp(false); }}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 bg-accent text-black text-[0.6rem] font-bold rounded-full shadow-lg z-10 hover:bg-accent/90 transition-colors"
        >
          <ChevronDown className="w-3 h-3" /> new messages
        </button>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 bg-surface border border-border rounded-xl shadow-xl py-1 min-w-[160px] text-[0.75rem]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.event.userId !== currentUserId && (
            <>
              <button
                onClick={() => { onDeleteMessage(contextMenu.event.id); setContextMenu(null); }}
                className="w-full text-left px-4 py-2 hover:bg-surface2 text-red flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete message
              </button>
              <button
                onClick={() => { onMuteUser(contextMenu.event.userId, contextMenu.event.username, 5); setContextMenu(null); }}
                className="w-full text-left px-4 py-2 hover:bg-surface2 text-muted flex items-center gap-2 transition-colors"
              >
                <VolumeX className="w-3.5 h-3.5" /> Mute 5 min
              </button>
              <button
                onClick={() => { onMuteUser(contextMenu.event.userId, contextMenu.event.username, null); setContextMenu(null); }}
                className="w-full text-left px-4 py-2 hover:bg-surface2 text-muted flex items-center gap-2 transition-colors"
              >
                <VolumeX className="w-3.5 h-3.5" /> Mute permanently
              </button>
            </>
          )}
          {contextMenu.event.userId === currentUserId && (
            <button
              onClick={() => { onDeleteMessage(contextMenu.event.id); setContextMenu(null); }}
              className="w-full text-left px-4 py-2 hover:bg-surface2 text-red flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete message
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 62%)`;
}
