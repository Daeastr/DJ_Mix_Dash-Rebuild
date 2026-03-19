import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionProfile } from './_lib/auth.js';
import { appendEvent } from './_lib/communityStore.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const profile = await getSessionProfile(req as any);
  if (!profile) return res.status(401).json({ error: 'Authentication required' });
  if (profile.tier !== 'hybrid') return res.status(403).json({ error: 'DJ access required' });
  
  const body = req.body as { trackName: string };
  if (!body.trackName) return res.status(400).json({ error: 'Track name required' });
  
  await appendEvent({
    id: crypto.randomUUID(),
    type: 'replay',
    userId: profile.uid,
    username: profile.djName,
    message: `↩ DJ replayed: ${body.trackName}`,
    timestamp: Date.now(),
    metadata: { trackName: body.trackName },
  });
  
  return res.json({ ok: true });
}
