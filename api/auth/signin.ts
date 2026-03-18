import { authError, buildSessionCookie, validateCredentials } from '../_lib/auth.js';
import { readJsonBody, sendJson } from '../_lib/nodeApi.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request: any, response: any): Promise<void> {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = readJsonBody<{ email?: string; password?: string }>(request);
    const profile = await validateCredentials(body.email ?? '', body.password ?? '');

    sendJson(response, 200, { user: { uid: profile.uid, email: profile.email }, profile }, {
      'Set-Cookie': buildSessionCookie(profile),
    });
  } catch (error) {
    const details = error as { code?: string; message?: string; status?: number };
    sendJson(response, details.status ?? 401, { code: details.code ?? 'auth/unknown', error: details.message ?? 'Authentication failed' });
  }
}