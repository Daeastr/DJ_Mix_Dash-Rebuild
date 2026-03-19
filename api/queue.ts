import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionProfile } from './_lib/auth.js';
import { loadQueue, saveQueue, appendEvent } from './_lib/communityStore.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const profile = await getSessionProfile(req as any);
  if (!profile) return res.status(401).json({ error: 'Authentication required' });
  if (profile.tier !== 'hybrid') return res.status(403).json({ error: 'DJ access required' });
  
  const body = req.body as { action: 'accept' | 'skip' | 'shuffle'; requestId: string };
  
  const queueData = await loadQueue();
  const idx = queueData.requests.findIndex(r => r.id === body.requestId && r.status === 'pending');
  if (idx < 0) return res.status(404).json({ error: 'Request not found' });
  
  const request = queueData.requests[idx];
  const now = Date.now();
  
  if (body.action === 'accept') {
    queueData.requests[idx] = { ...request, status: 'accepted' };
    await saveQueue(queueData);
    await appendEvent({
      id: crypto.randomUUID(),
      type: 'accepted',
      userId: profile.uid,
      username: profile.djName,
      message: `✓ DJ is playing ${request.trackName} — requested by ${request.username}`,
      timestamp: now,
      metadata: { trackName: request.trackName, requestId: request.id, blobUrl: request.blobUrl },
    });
    return res.json({ ok: true, request: queueData.requests[idx] });
  }
  
  if (body.action === 'skip') {
    queueData.requests[idx] = { ...request, status: 'skipped' };
    await saveQueue(queueData);
    await appendEvent({
      id: crypto.randomUUID(),
      type: 'skipped',
      userId: profile.uid,
      username: profile.djName,
      message: `✗ DJ skipped: ${request.trackName} (requested by ${request.username})`,
      timestamp: now,
      metadata: { trackName: request.trackName, requestId: request.id },
    });
    return res.json({ ok: true });
  }
  
  if (body.action === 'shuffle') {
    // Move request to end of queue and re-number all pending requests
    let pos = 1;
    queueData.requests = queueData.requests.map(r => {
      if (r.status !== 'pending') return r;
      if (r.id === body.requestId) return r; // handled below after pos is finalized
      return { ...r, queuePosition: pos++ };
    });
    // Place the shuffled request at the end
    queueData.requests = queueData.requests.map(r =>
      r.id === body.requestId ? { ...r, queuePosition: pos } : r
    );
    await saveQueue(queueData);
    return res.json({ ok: true });
  }
  
  return res.status(400).json({ error: 'Unknown action' });
}
