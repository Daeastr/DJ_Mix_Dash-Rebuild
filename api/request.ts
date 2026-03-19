import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionProfile } from './_lib/auth.js';
import { loadQueue, saveQueue, appendEvent, loadMuted, MAX_QUEUE } from './_lib/communityStore.js';
import type { TrackRequest } from './_lib/communityStore.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const profile = await getSessionProfile(req as any);
  const body = req.body as { trackName: string; blobUrl?: string; guestId?: string; guestName?: string };
  
  if (!body.trackName?.trim()) return res.status(400).json({ error: 'Track name required' });
  
  let uid: string;
  let username: string;
  
  if (profile) {
    uid = profile.uid;
    username = profile.djName;
  } else {
    uid = body.guestId || `guest_${Math.random().toString(36).slice(2, 6)}`;
    username = body.guestName || `guest_${uid.slice(-4)}`;
  }
  
  // Check if muted
  const mutedData = await loadMuted();
  const muted = mutedData.muted.find(m => m.uid === uid);
  if (muted && (muted.mutedUntil === null || muted.mutedUntil > Date.now())) {
    return res.status(403).json({ error: 'You are muted' });
  }
  
  const queueData = await loadQueue();
  const pending = queueData.requests.filter(r => r.status === 'pending');
  
  // Check rate limit: one pending request per user
  const userPending = pending.find(r => r.userId === uid);
  if (userPending) {
    return res.status(429).json({ error: 'You already have a pending request', existingRequest: userPending });
  }
  
  // Check queue depth
  if (pending.length >= MAX_QUEUE) {
    return res.status(429).json({ error: 'Request queue is full (max 20 requests)' });
  }
  
  const now = Date.now();
  const request: TrackRequest = {
    id: crypto.randomUUID(),
    userId: uid,
    username,
    trackName: body.trackName.trim(),
    blobUrl: body.blobUrl,
    timestamp: now,
    status: 'pending',
    queuePosition: pending.length + 1,
  };
  
  queueData.requests.push(request);
  await saveQueue(queueData);
  
  await appendEvent({
    id: crypto.randomUUID(),
    type: 'request',
    userId: uid,
    username,
    message: `${username} requested: ${request.trackName}`,
    timestamp: now,
    metadata: {
      trackName: request.trackName,
      blobUrl: request.blobUrl,
      queuePosition: request.queuePosition,
      requestId: request.id,
    },
  });
  
  return res.json({ ok: true, request });
}
