import { del } from '@vercel/blob';
import type { SharedTrack } from '../../src/types';
import { loadJsonFile, saveJsonFile } from '../_lib/blobStore.js';
import { authError, getSessionProfile } from '../_lib/auth.js';
import { readJsonBody, sendJson } from '../_lib/nodeApi.js';

export const config = { runtime: 'nodejs' };

const META_PATH = '_meta/tracks.json';

async function getTracksIndex(): Promise<SharedTrack[]> {
  return loadJsonFile<SharedTrack[]>(META_PATH, []);
}

async function saveTracksIndex(tracks: SharedTrack[]): Promise<void> {
  await saveJsonFile(META_PATH, tracks);
}

export default async function handler(request: any, response: any): Promise<void> {
  const url = new URL(request.url || '/', 'http://localhost');
  const segments = url.pathname.split('/');
  const id = segments[segments.length - 1];
  if (!id) {
    sendJson(response, 400, { error: 'Missing id' });
    return;
  }

  if (request.method === 'DELETE') {
    const profile = await getSessionProfile(request);
    if (!profile) {
      sendJson(response, 401, { code: 'auth/unauthorized', error: 'Unauthorized' });
      return;
    }

    const tracks = await getTracksIndex();
    const track = tracks.find(trackCandidate => trackCandidate.id === id);
    if (!track) {
      sendJson(response, 404, { error: 'Track not found' });
      return;
    }
    if (track.uploadedBy !== profile.uid) {
      sendJson(response, 403, { error: 'Forbidden' });
      return;
    }

    try {
      await del(track.storageUrl);
    } catch (err) {
      console.error('Failed to delete blob:', err);
    }

    const updated = tracks.filter(trackCandidate => trackCandidate.id !== id);
    await saveTracksIndex(updated);
    sendJson(response, 200, { success: true });
    return;
  }

  if (request.method === 'PATCH') {
    // Library-sourced tracks (id prefix lib_) are not in the shared index;
    // return success so the client can still load the track.
    if (id.startsWith('lib_')) {
      sendJson(response, 200, { id });
      return;
    }

    const body = readJsonBody<{ action?: string }>(request);
    const tracks = await getTracksIndex();
    const idx = tracks.findIndex(trackCandidate => trackCandidate.id === id);
    if (idx === -1) {
      sendJson(response, 404, { error: 'Track not found' });
      return;
    }

    if (body.action === 'incrementDownload') {
      tracks[idx].downloadCount = (tracks[idx].downloadCount || 0) + 1;
    }

    await saveTracksIndex(tracks);
    sendJson(response, 200, tracks[idx]);
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
}
