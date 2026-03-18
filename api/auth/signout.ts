import { buildClearSessionCookie, getSessionProfile, invalidateAllSessions } from '../_lib/auth.js';
import { sendJson } from '../_lib/nodeApi.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request: any, response: any): Promise<void> {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  // Invalidate all tokens issued before now so replayed cookies stop working
  const profile = await getSessionProfile(request);
  if (profile) {
    await invalidateAllSessions(profile.uid);
  }

  sendJson(response, 200, { success: true }, {
    'Set-Cookie': buildClearSessionCookie(),
  });
}