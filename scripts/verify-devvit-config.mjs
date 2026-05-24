import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../devvit.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) {
    console.error(`Devvit config check failed: ${message}`);
    process.exitCode = 1;
  }
}

assert(config.name === 'modcase-v1', 'app name must stay modcase-v1 for the current app slug');
assert(config.server?.dir === 'dist/server', 'server.dir must point at dist/server');
assert(config.server?.entry === 'index.cjs', 'server.entry must be index.cjs');
assert(config.permissions?.reddit === true, 'reddit permission must be enabled');
assert(config.permissions?.redis === true, 'redis permission must be enabled');
assert(config.triggers?.onModAction === '/internal/triggers/on-mod-action', 'onModAction trigger route changed');

const menuItems = config.menu?.items ?? [];
assert(menuItems.length >= 3, 'expected precedent, seed, and debug menu items');
for (const item of menuItems) {
  assert(item.endpoint?.startsWith('/internal/'), `menu endpoint ${item.label ?? '<unnamed>'} must be internal`);
  assert(item.forUserType === 'moderator', `menu item ${item.label ?? '<unnamed>'} must be moderator-only`);
}

const forms = Object.values(config.forms ?? {});
for (const endpoint of forms) {
  assert(typeof endpoint === 'string' && endpoint.startsWith('/internal/'), `form endpoint ${endpoint} must be internal`);
}

if (!process.exitCode) {
  console.log('Devvit config check passed.');
}
