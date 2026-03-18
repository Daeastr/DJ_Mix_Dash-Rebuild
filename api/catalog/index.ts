import { list } from '@vercel/blob';
import type { ProducerLibraryTrack, SharedTrack } from '../../src/types';
import { sendJson } from '../_lib/nodeApi.js';

export const config = { runtime: 'nodejs' };

async function getProducerCatalog(): Promise<SharedTrack[]> {
  try {
    const { blobs } = await list({ prefix: '_meta/libraries/' });
    const libraries = await Promise.all(
      blobs.map(async blob => {
        try {
          const res = await fetch(`${blob.url}?t=${Date.now()}`);
          if (!res.ok) return [];
          const tracks = (await res.json()) as ProducerLibraryTrack[];
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
    return libraries.flat().sort((a, b) => b.uploadedAt - a.uploadedAt);
  } catch {
    return [];
  }
}

export default async function handler(request: any, response: any): Promise<void> {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const catalog = await getProducerCatalog();
  sendJson(response, 200, catalog);
}