import type { ProducerLibraryTrack } from '../../src/types';
import { loadJsonFile, saveJsonFile } from '../_lib/blobStore.js';
import { getSessionProfile } from '../_lib/auth.js';
import { readJsonBody, sendJson } from '../_lib/nodeApi.js';

export const config = { runtime: 'nodejs' };

function getLibraryPath(uid: string) {
  return `_meta/libraries/${uid}.json`;
}

async function getLibrary(uid: string): Promise<ProducerLibraryTrack[]> {
  return loadJsonFile<ProducerLibraryTrack[]>(getLibraryPath(uid), []);
}

async function saveLibrary(uid: string, tracks: ProducerLibraryTrack[]) {
  await saveJsonFile(getLibraryPath(uid), tracks);
}

export default async function handler(request: any, response: any): Promise<void> {
  const profile = await getSessionProfile(request);
  if (!profile) {
    sendJson(response, 401, { code: 'auth/unauthorized', error: 'Unauthorized' });
    return;
  }

  if (request.method === 'GET') {
    sendJson(response, 200, await getLibrary(profile.uid));
    return;
  }

  if (request.method === 'POST') {
    const body = readJsonBody<Partial<ProducerLibraryTrack>>(request);
    if (!body.name || !body.storageUrl || typeof body.fileSize !== 'number') {
      sendJson(response, 400, { error: 'Missing required fields' });
      return;
    }

    const track: ProducerLibraryTrack = {
      id: crypto.randomUUID(),
      name: body.name,
      bpm: typeof body.bpm === 'number' ? body.bpm : 0,
      genre: body.genre ?? 'Unknown',
      producer: body.producer?.trim() || profile.djName,
      duration: typeof body.duration === 'number' ? body.duration : 0,
      storageUrl: body.storageUrl,
      fileSize: body.fileSize,
      uploadedAt: typeof body.uploadedAt === 'number' ? body.uploadedAt : Date.now(),
    };

    const library = await getLibrary(profile.uid);
    library.unshift(track);
    await saveLibrary(profile.uid, library);
    sendJson(response, 201, track);
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
}