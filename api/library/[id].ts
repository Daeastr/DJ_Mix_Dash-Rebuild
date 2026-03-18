import { del } from '@vercel/blob';
import type { ProducerLibraryTrack } from '../../src/types';
import { loadJsonFile, saveJsonFile } from '../_lib/blobStore.js';
import { getSessionProfile } from '../_lib/auth.js';
import { sendJson } from '../_lib/nodeApi.js';

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

  const url = new URL(request.url || '/', 'http://localhost');
  const segments = url.pathname.split('/');
  const id = segments[segments.length - 1];
  if (!id) {
    sendJson(response, 400, { error: 'Missing id' });
    return;
  }

  if (request.method !== 'DELETE') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const library = await getLibrary(profile.uid);
  const track = library.find(candidate => candidate.id === id);
  if (!track) {
    sendJson(response, 404, { error: 'Track not found' });
    return;
  }

  try {
    await del(track.storageUrl);
  } catch (error) {
    console.error('Failed to delete producer blob:', error);
  }

  await saveLibrary(profile.uid, library.filter(candidate => candidate.id !== id));
  sendJson(response, 200, { success: true, id });
}