import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionProfile } from './_lib/auth.js';
import {
  loadPresence, savePresence, loadEvents, loadQueue, appendEvent,
  deriveAvatarColor, deriveInitials, type OnlineUser
} from './_lib/communityStore.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const [presence, eventsData, queueData] = await Promise.all([
      loadPresence(),
      loadEvents(),
      loadQueue(),
    ]);
    
    return res.json({
      users: presence.users,
      events: eventsData.events.filter(e => !e.deleted).slice(-150),
      queue: queueData.requests.filter(r => r.status === 'pending'),
      lastUpdate: Math.max(presence.lastUpdate, eventsData.lastUpdate, queueData.lastUpdate),
    });
  }
  
  if (req.method === 'POST') {
    const profile = await getSessionProfile(req as any);
    const body = req.body as { action: 'join' | 'leave' | 'heartbeat'; guestId?: string; guestName?: string };
    
    const presence = await loadPresence();
    const now = Date.now();
    
    let uid: string;
    let username: string;
    let role: OnlineUser['role'];
    
    if (profile) {
      uid = profile.uid;
      username = profile.djName;
      // DJ role for hybrid tier users (the primary DJ user)
      role = profile.tier === 'hybrid' ? 'dj' : 'listener';
    } else {
      uid = body.guestId || `guest_${Math.random().toString(36).slice(2, 6)}`;
      username = body.guestName || `guest_${uid.slice(-4)}`;
      role = 'listener';
    }
    
    const userIndex = presence.users.findIndex(u => u.uid === uid);
    
    if (body.action === 'join' || body.action === 'heartbeat') {
      const user: OnlineUser = {
        uid,
        username,
        role,
        joinedAt: userIndex >= 0 ? presence.users[userIndex].joinedAt : now,
        lastSeen: now,
        avatarColor: deriveAvatarColor(username),
        avatarInitials: deriveInitials(username),
      };
      
      if (userIndex >= 0) {
        presence.users[userIndex] = user;
      } else {
        presence.users.push(user);
        if (body.action === 'join') {
          await appendEvent({
            id: crypto.randomUUID(),
            type: 'join',
            userId: uid,
            username,
            message: `${username} joined`,
            timestamp: now,
          });
        }
      }
    } else if (body.action === 'leave') {
      if (userIndex >= 0) {
        presence.users.splice(userIndex, 1);
        await appendEvent({
          id: crypto.randomUUID(),
          type: 'leave',
          userId: uid,
          username,
          message: `${username} left`,
          timestamp: now,
        });
      }
    }
    
    await savePresence(presence);
    return res.json({ ok: true, uid });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}
