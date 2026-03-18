import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { authError, getSessionProfile } from './_lib/auth.js';
import { readJsonBody, sendJson, toWebRequest } from './_lib/nodeApi.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request: any, response: any): Promise<void> {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const body = readJsonBody<HandleUploadBody>(request);
  const profile = await getSessionProfile(request);
  if (!profile) {
    sendJson(response, 401, { code: 'auth/unauthorized', error: 'Unauthorized' });
    return;
  }

  const pathname = (body as HandleUploadBody & { pathname?: string }).pathname;
  const isLibraryPath = pathname?.startsWith(`library/${profile.uid}/`);
  const isSharedTrackPath = pathname?.startsWith(`sharedTracks/${profile.uid}/`);
  if (!pathname || (!isLibraryPath && !isSharedTrackPath)) {
    sendJson(response, 403, { error: 'Invalid upload path' });
    return;
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: toWebRequest(request),
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'audio/mpeg',
          'audio/wav',
          'audio/ogg',
          'audio/webm',
          'audio/flac',
          'audio/mp4',
          'audio/aac',
          'audio/x-m4a',
        ],
        maximumSizeInBytes: 50 * 1024 * 1024, // 50MB
      }),
      onUploadCompleted: async () => {},
    });

    sendJson(response, 200, jsonResponse);
  } catch (error) {
    sendJson(response, 400, { error: (error as Error).message });
  }
}
