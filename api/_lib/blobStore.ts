import { list, put } from '@vercel/blob';

export async function loadJsonFile<T>(pathname: string, fallback: T): Promise<T> {
  try {
    const { blobs } = await list({ prefix: pathname, limit: 10 });
    const blob = blobs.find(candidate => candidate.pathname === pathname);
    if (!blob) return fallback;

    // Append a timestamp to bust any CDN or intermediate cache on every read
    const freshUrl = `${blob.url}?t=${Date.now()}`;
    const response = await fetch(freshUrl);
    if (!response.ok) return fallback;

    return await response.json() as T;
  } catch {
    return fallback;
  }
}

export async function saveJsonFile(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}