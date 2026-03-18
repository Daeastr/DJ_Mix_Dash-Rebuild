interface NodeLikeRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface NodeLikeResponse {
  setHeader(name: string, value: string): void;
  status(code: number): NodeLikeResponse;
  json(payload: unknown): void;
}

export function readJsonBody<T>(request: NodeLikeRequest): T {
  if (typeof request.body === 'string') {
    return JSON.parse(request.body) as T;
  }

  return (request.body ?? {}) as T;
}

export function sendJson(response: NodeLikeResponse, status: number, payload: unknown, headers?: Record<string, string>) {
  if (headers) {
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }
  }

  response.status(status).json(payload);
}

export function toWebRequest(request: NodeLikeRequest) {
  const forwardedProto = request.headers?.['x-forwarded-proto'];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || 'https';
  const forwardedHost = request.headers?.['x-forwarded-host'];
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || request.headers?.host || 'localhost';

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (Array.isArray(value)) {
      headers.set(name, value.join(', '));
    } else if (typeof value === 'string') {
      headers.set(name, value);
    }
  }

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : typeof request.body === 'string'
      ? request.body
      : request.body == null
        ? undefined
        : JSON.stringify(request.body);

  return new Request(new URL(request.url || '/', `${protocol}://${host}`).toString(), {
    method: request.method,
    headers,
    body,
  });
}