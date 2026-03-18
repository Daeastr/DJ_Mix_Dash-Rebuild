import type { UserTier } from '../../src/types';
import { authError, buildSessionCookie, getSessionProfile, updateUserTier } from '../_lib/auth.js';
import { readJsonBody, sendJson } from '../_lib/nodeApi.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request: any, response: any): Promise<void> {
  const profile = await getSessionProfile(request);

  if (request.method === 'GET') {
    if (!profile) {
      sendJson(response, 401, { code: 'auth/unauthorized', error: 'Unauthorized' });
      return;
    }

    sendJson(response, 200, { user: { uid: profile.uid, email: profile.email }, profile });
    return;
  }

  if (request.method === 'PATCH') {
    if (!profile) {
      sendJson(response, 401, { code: 'auth/unauthorized', error: 'Unauthorized' });
      return;
    }

    const body = readJsonBody<{ tier?: UserTier }>(request);
    if (!body.tier) {
      sendJson(response, 400, { error: 'Missing tier' });
      return;
    }

    const updatedProfile = await updateUserTier(profile.uid, body.tier);
    if (!updatedProfile) {
      sendJson(response, 401, { code: 'auth/unauthorized', error: 'Unauthorized' });
      return;
    }

    sendJson(response, 200, { user: { uid: updatedProfile.uid, email: updatedProfile.email }, profile: updatedProfile }, {
      'Set-Cookie': buildSessionCookie(updatedProfile),
    });
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
}