import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionProfile } from './_lib/auth.js';
import { appendEvent, loadMuted, deriveAvatarColor, deriveInitials } from './_lib/communityStore.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const profile = await getSessionProfile(req as any);
  const body = req.body as { message: string; guestId?: string; guestName?: string };
  
  if (!body.message?.trim()) return res.status(400).json({ error: 'Message required' });
  if (body.message.trim().length > 300) return res.status(400).json({ error: 'Message too long' });
  
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
  
  const event = {
    id: crypto.randomUUID(),
    type: 'chat' as const,
    userId: uid,
    username,
    message: body.message.trim(),
    timestamp: Date.now(),
  };
  
  await appendEvent(event);
  return res.json({ ok: true, event });
}
