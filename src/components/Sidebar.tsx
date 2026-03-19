import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Users, MessageSquare, Music, Send, Star, Shield, Mic2, MoreVertical } from 'lucide-react';
import { motion } from 'motion/react';
import ChatFeed from './ChatFeed';
import RequestQueue from './RequestQueue';
import type { OnlineUser, CommunityEvent, TrackRequest, UserRole } from '../hooks/useCommunity';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onlineUsers: OnlineUser[];
  chatMessages: CommunityEvent[];
  requestQueue: TrackRequest[];
  currentUserId: string | null;
  currentUserRole: UserRole | null;
  isDJ: boolean;
  isConnected: boolean;
  communityTracks: { name: string; storageUrl?: string }[];
  onSendChat: (message: string) => Promise<boolean>;
  onSubmitRequest: (trackName: string, blobUrl?: string) => Promise<{ ok: boolean; error?: string; existingRequest?: TrackRequest }>;
  onSendShoutout: (targetUserId: string, targetUsername: string) => Promise<boolean>;
  onQueueAccept: (requestId: string) => void;
  onQueueSkip: (requestId: string) => void;
  onQueueShuffle: (requestId: string) => void;
  onDeleteMessage: (id: string) => void;
  onMuteUser: (userId: string, username: string, duration: number | null) => void;
  onLoadTrackFromRequest?: (trackName: string, blobUrl?: string) => void;
}

function getRoleBadge(role: UserRole) {
  switch (role) {
    case 'dj': return { label: 'DJ', color: '#00f5a0', icon: Mic2 };
    case 'mod': return { label: 'MOD', color: '#00e5ff', icon: Shield };
    case 'vip': return { label: 'VIP', color: '#ffe600', icon: Star };
    default: return null;
  }
}

interface UserContextMenu {
  user: OnlineUser;
  x: number;
  y: number;
}

export default function Sidebar({
  isOpen, onToggle, onlineUsers, chatMessages, requestQueue,
  currentUserId, currentUserRole, isDJ, isConnected, communityTracks,
  onSendChat, onSubmitRequest, onSendShoutout,
  onQueueAccept, onQueueSkip, onQueueShuffle,
  onDeleteMessage, onMuteUser, onLoadTrackFromRequest,
}: SidebarProps) {
  const [chatInput, setChatInput] = useState('');
  const [djChatInput, setDjChatInput] = useState('');
  const [requestInput, setRequestInput] = useState('');
  const [requestSuggestions, setRequestSuggestions] = useState<typeof communityTracks>([]);
  const [sendingChat, setSendingChat] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<TrackRequest | null>(null);
  const [userContextMenu, setUserContextMenu] = useState<UserContextMenu | null>(null);
  const [activeSection, setActiveSection] = useState<'users' | 'chat' | 'queue'>('chat');

  useEffect(() => {
    if (currentUserId) {
      const existing = requestQueue.find(r => r.userId === currentUserId && r.status === 'pending');
      setPendingRequest(existing || null);
    }
  }, [requestQueue, currentUserId]);

  const handleRequestInput = useCallback((value: string) => {
    setRequestInput(value);
    if (value.trim().length >= 2) {
      const filtered = communityTracks
        .filter(t => t.name.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 6);
      setRequestSuggestions(filtered);
    } else {
      setRequestSuggestions([]);
    }
  }, [communityTracks]);

  const handleSendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || sendingChat) return;
    setSendingChat(true);
    const ok = await onSendChat(msg);
    if (ok) setChatInput('');
    setSendingChat(false);
  }, [chatInput, sendingChat, onSendChat]);

  const handleDjCommand = useCallback(async () => {
    const cmd = djChatInput.trim();
    if (!cmd) return;
    if (cmd.startsWith('!play ')) {
      const trackName = cmd.slice(6).trim();
      if (trackName && onLoadTrackFromRequest) {
        const track = communityTracks.find(t => t.name.toLowerCase() === trackName.toLowerCase());
        onLoadTrackFromRequest(trackName, track?.storageUrl);
      }
    } else {
      await onSendChat(cmd);
    }
    setDjChatInput('');
  }, [djChatInput, onSendChat, onLoadTrackFromRequest, communityTracks]);

  const handleSubmitRequest = useCallback(async (trackName: string, blobUrl?: string) => {
    const result = await onSubmitRequest(trackName, blobUrl);
    if (result.ok) {
      setRequestInput('');
      setRequestSuggestions([]);
    } else if (result.existingRequest) {
      setPendingRequest(result.existingRequest);
    }
    return result;
  }, [onSubmitRequest]);

  const handleUserContextMenu = (e: React.MouseEvent, user: OnlineUser) => {
    if (!isDJ) return;
    e.preventDefault();
    setUserContextMenu({ user, x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const handler = () => setUserContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  if (!isOpen) {
    return (
      <aside className="w-8 flex-shrink-0 flex flex-col items-center border-l border-border bg-surface py-3 gap-3">
        <button
          onClick={onToggle}
          className="p-1 text-muted hover:text-text transition-colors"
          title="Expand sidebar"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="text-[0.55rem] font-mono text-muted font-bold tabular-nums">{onlineUsers.length}</div>
        <div
          className={`w-1.5 h-1.5 rounded-full transition-colors ${isConnected ? 'bg-accent' : 'bg-red'}`}
          title={isConnected ? 'Connected' : 'Disconnected'}
        />
        <div className="flex flex-col gap-1 overflow-hidden flex-1">
          {onlineUsers.slice(0, 8).map(user => (
            <div
              key={user.uid}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[0.45rem] font-bold text-black flex-shrink-0"
              style={{ backgroundColor: user.avatarColor }}
              title={user.username}
            >
              {user.avatarInitials}
            </div>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: 280 }}
      className="flex-shrink-0 w-[280px] flex flex-col border-l border-border bg-surface overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-accent animate-pulse' : 'bg-red'}`}
          />
          <span className="text-[0.65rem] font-bold text-text tracking-widest uppercase">
            {onlineUsers.length} watching
          </span>
        </div>
        <button
          onClick={onToggle}
          className="p-1 text-muted hover:text-text transition-colors rounded"
          title="Collapse sidebar"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-border shrink-0">
        {([
          { id: 'users' as const, icon: Users, label: `${onlineUsers.length}` },
          { id: 'chat' as const, icon: MessageSquare, label: 'CHAT' },
          ...(isDJ ? [{ id: 'queue' as const, icon: Music, label: `${requestQueue.length}` }] : []),
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[0.6rem] font-bold tracking-wider transition-colors border-b-2 ${
              activeSection === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Users section */}
      {activeSection === 'users' && (
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar">
          {onlineUsers.map(user => {
            const badge = getRoleBadge(user.role);
            return (
              <div
                key={user.uid}
                onContextMenu={(e) => handleUserContextMenu(e, user)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface2 group cursor-default transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[0.6rem] font-bold text-black flex-shrink-0"
                  style={{ backgroundColor: user.avatarColor }}
                >
                  {user.avatarInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.75rem] text-text truncate">{user.username}</span>
                    {badge && (
                      <span
                        className="text-[0.5rem] font-bold px-1 py-0.5 rounded"
                        style={{ color: badge.color, backgroundColor: `${badge.color}20`, border: `1px solid ${badge.color}40` }}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>
                {isDJ && user.uid !== currentUserId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUserContextMenu(e, user); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted hover:text-text transition-all"
                  >
                    <MoreVertical className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
          {onlineUsers.length === 0 && (
            <div className="text-center text-muted/40 text-[0.65rem] font-mono py-8">
              No one online yet
            </div>
          )}
        </div>
      )}

      {/* Chat section */}
      {activeSection === 'chat' && (
        <>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ChatFeed
              messages={chatMessages}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onDeleteMessage={onDeleteMessage}
              onMuteUser={onMuteUser}
            />
          </div>

          {/* Chat input (regular users) */}
          {!isDJ && (
            <div className="border-t border-border p-2 shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  placeholder="Say something..."
                  maxLength={300}
                  className="flex-1 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[0.75rem] text-text placeholder:text-muted/50 outline-none focus:border-accent/50 transition-colors"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || sendingChat}
                  className="px-2.5 py-1.5 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 rounded-lg transition-colors disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* DJ chat + command input */}
          {isDJ && (
            <div className="border-t border-border p-2 shrink-0 space-y-1.5">
              <div className="text-[0.55rem] font-mono text-muted/60 uppercase tracking-widest">DJ Console</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={djChatInput}
                  onChange={e => setDjChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleDjCommand()}
                  placeholder="!play [track] or chat..."
                  className="flex-1 bg-bg border border-[#00f5a0]/30 rounded-lg px-2.5 py-1.5 text-[0.75rem] text-[#00f5a0] placeholder:text-muted/50 outline-none focus:border-[#00f5a0]/60 transition-colors"
                />
                <button
                  onClick={handleDjCommand}
                  disabled={!djChatInput.trim()}
                  className="px-2.5 py-1.5 bg-[#00f5a0]/10 hover:bg-[#00f5a0]/20 text-[#00f5a0] border border-[#00f5a0]/30 rounded-lg transition-colors disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Request form (non-DJ) */}
          {!isDJ && (
            <div className="border-t border-border p-2 shrink-0">
              <div className="text-[0.55rem] font-mono text-muted/60 uppercase tracking-widest mb-1.5">Request a Track</div>
              {pendingRequest ? (
                <div className="bg-[#00e5ff]/8 border border-[#00e5ff]/30 rounded-lg px-2.5 py-2 text-[0.7rem] text-[#00e5ff]">
                  <div className="font-bold text-[0.6rem] uppercase tracking-widest mb-0.5">Your request is in queue</div>
                  <div className="truncate">{pendingRequest.trackName}</div>
                  <div className="text-[0.6rem] text-muted mt-0.5">Position #{pendingRequest.queuePosition}</div>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={requestInput}
                      onChange={e => handleRequestInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && requestInput.trim() && handleSubmitRequest(requestInput.trim())}
                      placeholder="Track name..."
                      className="flex-1 bg-bg border border-border rounded-lg px-2.5 py-1.5 text-[0.75rem] text-text placeholder:text-muted/50 outline-none focus:border-[#00e5ff]/50 transition-colors"
                    />
                    <button
                      onClick={() => requestInput.trim() && handleSubmitRequest(requestInput.trim())}
                      disabled={!requestInput.trim()}
                      className="px-2.5 py-1.5 bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30 rounded-lg transition-colors disabled:opacity-40"
                    >
                      <Music className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {requestSuggestions.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50">
                      {requestSuggestions.map(track => (
                        <button
                          key={track.name}
                          onClick={() => { handleSubmitRequest(track.name, track.storageUrl); }}
                          className="w-full text-left px-3 py-2 hover:bg-surface2 text-[0.75rem] text-text transition-colors"
                        >
                          {track.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Queue section (DJ only) */}
      {activeSection === 'queue' && isDJ && (
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          <RequestQueue
            queue={requestQueue}
            onAccept={onQueueAccept}
            onSkip={onQueueSkip}
            onShuffle={onQueueShuffle}
            onLoadTrack={onLoadTrackFromRequest}
          />
        </div>
      )}

      {/* User context menu (DJ actions) */}
      {userContextMenu && isDJ && (
        <div
          className="fixed z-50 bg-surface border border-border rounded-xl shadow-xl py-1 min-w-[160px] text-[0.75rem]"
          style={{ left: userContextMenu.x, top: userContextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { onSendShoutout(userContextMenu.user.uid, userContextMenu.user.username); setUserContextMenu(null); }}
            className="w-full text-left px-4 py-2 hover:bg-surface2 text-[#bf00ff] flex items-center gap-2 transition-colors"
          >
            🎙 Shoutout
          </button>
          <button
            onClick={async () => {
              await fetch('/api/moderation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'give_vip', targetUserId: userContextMenu.user.uid }),
              });
              setUserContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 hover:bg-surface2 text-[#ffe600] flex items-center gap-2 transition-colors"
          >
            <Star className="w-3.5 h-3.5" /> Give VIP
          </button>
          <button
            onClick={() => { onMuteUser(userContextMenu.user.uid, userContextMenu.user.username, 5); setUserContextMenu(null); }}
            className="w-full text-left px-4 py-2 hover:bg-surface2 text-muted flex items-center gap-2 transition-colors"
          >
            Mute from chat (5 min)
          </button>
        </div>
      )}
    </motion.aside>
  );
}
