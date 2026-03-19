import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionProfile } from './_lib/auth.js';
import { loadEvents, saveEvents, loadMuted, saveMuted, loadPresence, savePresence } from './_lib/communityStore.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const profile = await getSessionProfile(req as any);
  if (!profile) return res.status(401).json({ error: 'Authentication required' });
  
  // Only DJ (hybrid) or mod roles can moderate
  const isDJ = profile.tier === 'hybrid';
  // TODO: check mod role from presence data
  if (!isDJ) {
    // Check if user is a mod in presence
    const presence = await loadPresence();
    const user = presence.users.find(u => u.uid === profile.uid);
    if (!user || user.role !== 'mod') {
      return res.status(403).json({ error: 'Moderation access required' });
    }
  }
  
  const body = req.body as {
    action: 'delete_message' | 'mute_user' | 'unmute_user' | 'give_vip';
    messageId?: string;
    targetUserId?: string;
    targetUsername?: string;
    duration?: number | null; // minutes, null = permanent
  };
  
  if (body.action === 'delete_message') {
    if (!body.messageId) return res.status(400).json({ error: 'Message ID required' });
    const eventsData = await loadEvents();
    const idx = eventsData.events.findIndex(e => e.id === body.messageId);
    if (idx >= 0) {
      eventsData.events[idx] = { ...eventsData.events[idx], deleted: true };
      await saveEvents(eventsData);
    }
    return res.json({ ok: true });
  }
  
  if (body.action === 'mute_user') {
    if (!body.targetUserId || !body.targetUsername) return res.status(400).json({ error: 'Target user required' });
    const mutedData = await loadMuted();
    const mutedUntil = body.duration ? Date.now() + body.duration * 60 * 1000 : null;
    const existing = mutedData.muted.findIndex(m => m.uid === body.targetUserId);
    const entry = { uid: body.targetUserId!, username: body.targetUsername!, mutedUntil, mutedBy: profile.uid };
    if (existing >= 0) {
      mutedData.muted[existing] = entry;
    } else {
      mutedData.muted.push(entry);
    }
    await saveMuted(mutedData);
    return res.json({ ok: true });
  }
  
  if (body.action === 'unmute_user') {
    if (!body.targetUserId) return res.status(400).json({ error: 'Target user required' });
    const mutedData = await loadMuted();
    mutedData.muted = mutedData.muted.filter(m => m.uid !== body.targetUserId);
    await saveMuted(mutedData);
    return res.json({ ok: true });
  }
  
  if (body.action === 'give_vip') {
    if (!isDJ) return res.status(403).json({ error: 'Only DJ can grant VIP' });
    if (!body.targetUserId) return res.status(400).json({ error: 'Target user required' });
    const presence = await loadPresence();
    const idx = presence.users.findIndex(u => u.uid === body.targetUserId);
    if (idx >= 0) {
      presence.users[idx] = { ...presence.users[idx], role: 'vip' };
      await savePresence(presence);
    }
    return res.json({ ok: true });
  }
  
  return res.status(400).json({ error: 'Unknown action' });
}
