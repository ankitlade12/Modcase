import { createServer, context, getServerPort, reddit } from '@devvit/web/server';
import { redis } from '@devvit/redis';
import { createModCaseApp } from './app.js';
import { handleHonoRequest } from './devvit/http.js';

function currentSubredditName(): string | null {
  try {
    return context.subredditName ?? null;
  } catch {
    return null;
  }
}

const app = createModCaseApp({
  redis,
  reddit,
  getSubredditName: currentSubredditName,
  captureRawPayloadsForDebug: false, // Raw debug payload capture is OFF for submission.
});

const server = createServer((req, res) => handleHonoRequest(app, req, res));
server.listen(getServerPort());

export default server;
