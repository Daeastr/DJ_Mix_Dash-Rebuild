import { useState, useEffect, useCallback, useRef } from 'react';

export type UserRole = 'dj' | 'mod' | 'vip' | 'listener';

export interface OnlineUser {
  uid: string;
  username: string;
  role: UserRole;
  joinedAt: number;
  lastSeen: number;
  avatarColor: string;
  avatarInitials: string;
}

export type EventType =
  | 'chat' | 'request' | 'accepted' | 'skipped'
  | 'shoutout' | 'replay' | 'join' | 'leave';

export interface CommunityEvent {
  id: string;
  type: EventType;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
  metadata?: {
    trackName?: string;
    blobUrl?: string;
    targetUserId?: string;
    targetUsername?: string;
    queuePosition?: number;
    requestId?: string;
  };
  deleted?: boolean;
}

export interface TrackRequest {
  id: string;
  userId: string;
  username: string;
  trackName: string;
  blobUrl?: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'skipped';
  queuePosition: number;
}

interface PresenceSnapshot {
  users: OnlineUser[];
  events: CommunityEvent[];
  queue: TrackRequest[];
  lastUpdate: number;
}

interface UseCommunityOptions {
  userProfile: { uid: string; djName: string; tier: string } | null;
  guestId?: string;
  guestName?: string;
  pollInterval?: number;
}

export function useCommunity({ userProfile, guestId, guestName, pollInterval = 3000 }: UseCommunityOptions) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [chatMessages, setChatMessages] = useState<CommunityEvent[]>([]);
  const [requestQueue, setRequestQueue] = useState<TrackRequest[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('dj_sidebar_open');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isConnected, setIsConnected] = useState(false);

  const lastUpdateRef = useRef<number>(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinedRef = useRef(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => {
      const next = !prev;
      try { localStorage.setItem('dj_sidebar_open', String(next)); } catch {}
      return next;
    });
  }, []);

  const getIdentity = useCallback(() => ({
    guestId: userProfile ? undefined : guestId,
    guestName: userProfile ? undefined : guestName,
  }), [userProfile, guestId, guestName]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/presence');
      if (!res.ok) return;
      const data: PresenceSnapshot = await res.json();

      if (data.lastUpdate > lastUpdateRef.current) {
        lastUpdateRef.current = data.lastUpdate;
        setOnlineUsers(sortUsers(data.users));
        setChatMessages(data.events.slice(-150));
        setRequestQueue(data.queue.filter(r => r.status === 'pending'));
        setIsConnected(true);
      }
    } catch {
      // Keep showing last known state
    }
  }, []);

  const join = useCallback(async () => {
    if (joinedRef.current) return;
    try {
      const res = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', ...getIdentity() }),
      });
      if (res.ok) {
        joinedRef.current = true;
        await poll();
      }
    } catch {}
  }, [getIdentity, poll]);

  const leave = useCallback(async () => {
    if (!joinedRef.current) return;
    joinedRef.current = false;
    try {
      navigator.sendBeacon('/api/presence', JSON.stringify({ action: 'leave', ...getIdentity() }));
    } catch {}
  }, [getIdentity]);

  const heartbeat = useCallback(async () => {
    if (!joinedRef.current) return;
    try {
      await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat', ...getIdentity() }),
      });
    } catch {}
  }, [getIdentity]);

  const sendChat = useCallback(async (message: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, ...getIdentity() }),
      });
      if (res.ok) {
        await poll();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [getIdentity, poll]);

  const submitRequest = useCallback(async (trackName: string, blobUrl?: string): Promise<{ ok: boolean; error?: string; existingRequest?: TrackRequest }> => {
    try {
      const res = await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackName, blobUrl, ...getIdentity() }),
      });
      const data = await res.json();
      if (res.ok) {
        await poll();
        return { ok: true };
      }
      return { ok: false, error: data.error, existingRequest: data.existingRequest };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }, [getIdentity, poll]);

  const sendShoutout = useCallback(async (targetUserId: string, targetUsername: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/shoutout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, targetUsername }),
      });
      if (res.ok) { await poll(); return true; }
      return false;
    } catch { return false; }
  }, [poll]);

  const sendReplay = useCallback(async (trackName: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackName }),
      });
      if (res.ok) { await poll(); return true; }
      return false;
    } catch { return false; }
  }, [poll]);

  const handleQueueAction = useCallback(async (action: 'accept' | 'skip' | 'shuffle', requestId: string): Promise<{ ok: boolean; blobUrl?: string }> => {
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, requestId }),
      });
      const data = await res.json();
      if (res.ok) {
        await poll();
        return { ok: true, blobUrl: data.request?.blobUrl };
      }
      return { ok: false };
    } catch { return { ok: false }; }
  }, [poll]);

  const moderateAction = useCallback(async (
    action: 'delete_message' | 'mute_user' | 'unmute_user' | 'give_vip',
    params: { messageId?: string; targetUserId?: string; targetUsername?: string; duration?: number | null }
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });
      if (res.ok) { await poll(); return true; }
      return false;
    } catch { return false; }
  }, [poll]);

  useEffect(() => {
    join();
    pollIntervalRef.current = setInterval(poll, pollInterval);
    heartbeatRef.current = setInterval(heartbeat, 10000);

    const handleUnload = () => leave();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener('beforeunload', handleUnload);
      leave();
    };
  }, [join, poll, heartbeat, leave, pollInterval]);

  return {
    onlineUsers,
    chatMessages,
    requestQueue,
    sidebarOpen,
    isConnected,
    toggleSidebar,
    sendChat,
    submitRequest,
    sendShoutout,
    sendReplay,
    handleQueueAction,
    moderateAction,
  };
}

function sortUsers(users: OnlineUser[]): OnlineUser[] {
  const roleOrder: Record<UserRole, number> = { dj: 0, mod: 1, vip: 2, listener: 3 };
  return [...users].sort((a, b) => {
    const roleDiff = roleOrder[a.role] - roleOrder[b.role];
    if (roleDiff !== 0) return roleDiff;
    return a.joinedAt - b.joinedAt;
  });
}
