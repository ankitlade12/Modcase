import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Hono } from 'hono';

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function handleHonoRequest(app: Hono, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const host = req.headers.host ?? 'localhost';
    const url = `http://${host}${req.url ?? '/'}`;
    const headers = new Headers();

    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else if (value !== undefined) {
        headers.set(key, String(value));
      }
    }

    const method = req.method ?? 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const body = hasBody ? new Uint8Array(await readRequestBody(req)) : undefined;
    const request = new Request(url, {
      method,
      headers,
      body,
    });

    const response = await app.fetch(request);
    res.statusCode = response.status;
    res.statusMessage = response.statusText;
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (!response.body) {
      res.end();
      return;
    }

    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('[ModCase] unhandled server adapter error:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
    }
    res.end(JSON.stringify({ error: 'modcase_server_error' }));
  }
}
