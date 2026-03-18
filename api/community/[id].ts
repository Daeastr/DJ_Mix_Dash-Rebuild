import type { CommunityPost, CommunityComment } from '../../src/types';
import { loadJsonFile, saveJsonFile } from '../_lib/blobStore.js';
import { getSessionProfile } from '../_lib/auth.js';
import { readJsonBody, sendJson } from '../_lib/nodeApi.js';

export const config = { runtime: 'nodejs' };

const POSTS_PATH = '_meta/community/posts.json';

function commentsPath(postId: string): string {
  return `_meta/community/comments_${postId}.json`;
}

async function getPosts(): Promise<CommunityPost[]> {
  return loadJsonFile<CommunityPost[]>(POSTS_PATH, []);
}

async function savePosts(posts: CommunityPost[]): Promise<void> {
  await saveJsonFile(POSTS_PATH, posts);
}

async function getComments(postId: string): Promise<CommunityComment[]> {
  return loadJsonFile<CommunityComment[]>(commentsPath(postId), []);
}

async function saveComments(postId: string, comments: CommunityComment[]): Promise<void> {
  await saveJsonFile(commentsPath(postId), comments);
}

export default async function handler(request: any, response: any): Promise<void> {
  const url = new URL(request.url || '/', 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];
  if (!id) {
    sendJson(response, 400, { error: 'Missing id' });
    return;
  }

  // GET — fetch post + its comments
  if (request.method === 'GET') {
    const posts = await getPosts();
    const post = posts.find(p => p.id === id);
    if (!post) {
      sendJson(response, 404, { error: 'Post not found' });
      return;
    }
    const comments = await getComments(id);
    sendJson(response, 200, { post, comments: comments.sort((a, b) => a.createdAt - b.createdAt) });
    return;
  }

  // All mutations require auth
  const profile = await getSessionProfile(request);
  if (!profile) {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  // POST — add a comment
  if (request.method === 'POST') {
    const body = readJsonBody<{ body: string }>(request);
    if (!body.body?.trim()) {
      sendJson(response, 400, { error: 'Comment body is required' });
      return;
    }

    const comment: CommunityComment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      postId: id,
      body: body.body.trim().slice(0, 1000),
      authorId: profile.uid,
      authorName: profile.djName,
      createdAt: Date.now(),
      likes: [],
    };

    const comments = await getComments(id);
    comments.push(comment);
    await saveComments(id, comments);

    // Increment commentCount on the post
    const posts = await getPosts();
    await savePosts(
      posts.map(p => p.id === id ? { ...p, commentCount: p.commentCount + 1 } : p)
    );

    sendJson(response, 201, comment);
    return;
  }

  // PATCH — toggle like on a post
  if (request.method === 'PATCH') {
    const body = readJsonBody<{ action: 'like' | 'unlike' }>(request);
    const posts = await getPosts();
    const post = posts.find(p => p.id === id);
    if (!post) {
      sendJson(response, 404, { error: 'Post not found' });
      return;
    }

    const likes =
      body.action === 'like'
        ? post.likes.includes(profile.uid) ? post.likes : [...post.likes, profile.uid]
        : post.likes.filter(uid => uid !== profile.uid);

    await savePosts(posts.map(p => p.id === id ? { ...p, likes } : p));
    sendJson(response, 200, { likes });
    return;
  }

  // DELETE — remove post (owner only)
  if (request.method === 'DELETE') {
    const posts = await getPosts();
    const post = posts.find(p => p.id === id);
    if (!post) {
      sendJson(response, 404, { error: 'Post not found' });
      return;
    }
    if (post.authorId !== profile.uid) {
      sendJson(response, 403, { error: 'Forbidden' });
      return;
    }
    await savePosts(posts.filter(p => p.id !== id));
    sendJson(response, 200, { success: true });
    return;
  }

  sendJson(response, 405, { error: 'Method not allowed' });
}
