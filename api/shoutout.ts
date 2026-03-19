import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionProfile } from './_lib/auth.js';
import { appendEvent } from './_lib/communityStore.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const profile = await getSessionProfile(req as any);
  if (!profile) return res.status(401).json({ error: 'Authentication required' });
  if (profile.tier !== 'hybrid') return res.status(403).json({ error: 'DJ access required' });
  
  const body = req.body as { targetUserId: string; targetUsername: string };
  if (!body.targetUsername) return res.status(400).json({ error: 'Target user required' });
  
  const now = Date.now();
  await appendEvent({
    id: crypto.randomUUID(),
    type: 'shoutout',
    userId: profile.uid,
    username: profile.djName,
    message: `🎙 DJ is shouting out @${body.targetUsername}!`,
    timestamp: now,
    metadata: {
      targetUserId: body.targetUserId,
      targetUsername: body.targetUsername,
    },
  });
  
  return res.json({ ok: true });
}
