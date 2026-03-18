import { list } from '@vercel/blob';
import type { Genre, SharedTrack, ProducerLibraryTrack } from '../../src/types';
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

async function getProducerLibraryTracks(): Promise<SharedTrack[]> {
  try {
    const { blobs } = await list({ prefix: '_meta/libraries/' });
    const libraries = await Promise.all(
      blobs.map(async blob => {
        try {
          // Timestamp param busts CDN cache so we always read the latest library JSON
          const res = await fetch(`${blob.url}?t=${Date.now()}`);
          if (!res.ok) return [];
          const tracks = await res.json() as ProducerLibraryTrack[];
          const uid = blob.pathname.replace('_meta/libraries/', '').replace('.json', '');
          return tracks.map((t): SharedTrack => ({
            id: `lib_${t.id}`,
            name: t.name,
            bpm: t.bpm,
            genre: t.genre,
            producer: t.producer,
            duration: t.duration,
            storageUrl: t.storageUrl,
            uploadedBy: uid,
            uploaderName: t.producer,
            uploadedAt: t.uploadedAt,
            downloadCount: 0,
            fileSize: t.fileSize,
          }));
        } catch {
          return [];
        }
      })
    );
    return libraries.flat();
  } catch {
    return [];
  }
}

export default async function handler(request: any, response: any): Promise<void> {
  if (request.method === 'GET') {
    const [sharedTracks, libraryTracks] = await Promise.all([
      getTracksIndex(),
      getProducerLibraryTracks(),
    ]);
    // Deduplicate: shared tracks (explicitly posted to community) take priority
    const sharedIds = new Set(sharedTracks.map(t => t.id));
    const uniqueLibraryTracks = libraryTracks.filter(t => !sharedIds.has(t.id));
    const combined = [...sharedTracks, ...uniqueLibraryTracks].sort((a, b) => b.uploadedAt - a.uploadedAt);
    sendJson(response, 200, combined);
    return;
  }

  if (request.method === 'POST') {
    const profile = await getSessionProfile(request);
    if (!profile) {
      sendJson(response, 401, { code: 'auth/unauthorized', error: 'Unauthorized' });
      return;
    }

    // Only Hybrid tier accounts can post to the community shared tracks
    if (profile.tier !== 'hybrid') {
      sendJson(response, 403, { code: 'auth/forbidden', error: 'Only Hybrid tier accounts can share tracks with the community' });
      return;
    }

    const body = readJsonBody<Partial<SharedTrack>>(request);
    if (!body?.name || !body?.storageUrl || typeof body?.fileSize !== 'number') {
      sendJson(response, 400, { error: 'Missing required fields' });
      return;
    }

    const track: SharedTrack = {
      id: crypto.randomUUID(),
      name: body.name,
      bpm: typeof body.bpm === 'number' ? body.bpm : 0,
      genre: (body.genre ?? 'Unknown') as Genre,
      producer: body.producer?.trim() || profile.djName,
      duration: typeof body.duration === 'number' ? body.duration : 0,
      storageUrl: body.storageUrl,
      uploadedBy: profile.uid,
      uploaderName: profile.djName,
      uploadedAt: Date.now(),
      downloadCount: 0,
      fileSize: body.fileSize,
    };

    const tracks = await getTracksIndex();
    tracks.unshift(track);
    await saveTracksIndex(tracks);
    sendJson(response, 201, track);
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
}
