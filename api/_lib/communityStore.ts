import { loadJsonFile, saveJsonFile } from './blobStore.js';

// Re-export types inline (don't import from src/types to avoid issues)
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

export interface MutedUser {
  uid: string;
  username: string;
  mutedUntil: number | null; // null = permanent
  mutedBy: string;
}

// File paths
const PRESENCE_PATH = '_meta/presence.json';
const EVENTS_PATH = '_meta/events.json';
const QUEUE_PATH = '_meta/queue.json';
const MUTED_PATH = '_meta/muted.json';

const MAX_EVENTS = 200;
const MAX_QUEUE = 20;
const USER_TIMEOUT_MS = 20000; // 20s without heartbeat = offline

interface PresenceData { users: OnlineUser[]; lastUpdate: number; }
interface EventsData { events: CommunityEvent[]; lastUpdate: number; }
interface QueueData { requests: TrackRequest[]; lastUpdate: number; }
interface MutedData { muted: MutedUser[]; }

export async function loadPresence(): Promise<PresenceData> {
  const data = await loadJsonFile<PresenceData>(PRESENCE_PATH, { users: [], lastUpdate: 0 });
  // Prune stale users
  const now = Date.now();
  data.users = data.users.filter(u => now - u.lastSeen < USER_TIMEOUT_MS);
  return data;
}

export async function savePresence(data: PresenceData): Promise<void> {
  await saveJsonFile(PRESENCE_PATH, { ...data, lastUpdate: Date.now() });
}

export async function loadEvents(): Promise<EventsData> {
  return loadJsonFile<EventsData>(EVENTS_PATH, { events: [], lastUpdate: 0 });
}

export async function saveEvents(data: EventsData): Promise<void> {
  await saveJsonFile(EVENTS_PATH, { ...data, lastUpdate: Date.now() });
}

export async function loadQueue(): Promise<QueueData> {
  return loadJsonFile<QueueData>(QUEUE_PATH, { requests: [], lastUpdate: 0 });
}

export async function saveQueue(data: QueueData): Promise<void> {
  await saveJsonFile(QUEUE_PATH, { ...data, lastUpdate: Date.now() });
}

export async function loadMuted(): Promise<MutedData> {
  return loadJsonFile<MutedData>(MUTED_PATH, { muted: [] });
}

export async function saveMuted(data: MutedData): Promise<void> {
  await saveJsonFile(MUTED_PATH, data);
}

export async function appendEvent(event: CommunityEvent): Promise<void> {
  const data = await loadEvents();
  data.events = [...data.events, event].slice(-MAX_EVENTS);
  await saveEvents(data);
}

export function deriveAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash) + username.charCodeAt(i);
    hash |= 0;
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 55%)`;
}

export function deriveInitials(username: string): string {
  const parts = username.trim().split(/[\s_-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

export { MAX_QUEUE };
