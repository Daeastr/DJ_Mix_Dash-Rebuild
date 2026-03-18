import type { CommunityPost, PostType } from '../../src/types';
import { loadJsonFile, saveJsonFile } from '../_lib/blobStore.js';
import { getSessionProfile } from '../_lib/auth.js';
import { readJsonBody, sendJson } from '../_lib/nodeApi.js';

export const config = { runtime: 'nodejs' };

const POSTS_PATH = '_meta/community/posts.json';

async function getPosts(): Promise<CommunityPost[]> {
  return loadJsonFile<CommunityPost[]>(POSTS_PATH, []);
}

async function savePosts(posts: CommunityPost[]): Promise<void> {
  await saveJsonFile(POSTS_PATH, posts);
}

export default async function handler(request: any, response: any): Promise<void> {
  if (request.method === 'GET') {
    const posts = await getPosts();
    sendJson(response, 200, posts.sort((a, b) => b.createdAt - a.createdAt));
    return;
  }

  if (request.method === 'POST') {
    const profile = await getSessionProfile(request);
    if (!profile) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    const body = readJsonBody<{
      type: string;
      title: string;
      body: string;
      trackRef?: { name: string; producer: string };
    }>(request);

    if (!body.title?.trim() || !body.body?.trim()) {
      sendJson(response, 400, { error: 'Title and body are required' });
      return;
    }

    const validTypes: PostType[] = ['general', 'question', 'track_spotlight'];
    const type: PostType = validTypes.includes(body.type as PostType)
      ? (body.type as PostType)
      : 'general';

    const post: CommunityPost = {
      id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      title: body.title.trim().slice(0, 200),
      body: body.body.trim().slice(0, 2000),
      authorId: profile.uid,
      authorName: profile.djName,
      createdAt: Date.now(),
      likes: [],
      commentCount: 0,
      trackRef: body.trackRef,
    };

    const posts = await getPosts();
    posts.push(post);
    await savePosts(posts);
    sendJson(response, 201, post);
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
}
