importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const { BackgroundSyncPlugin } = workbox.backgroundSync;
const { registerRoute } = workbox.routing;
const { NetworkFirst } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;

// 1. Background Sync: Queue offline complaint submissions
const bgSyncPlugin = new BackgroundSyncPlugin('complaint-sync-queue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
});

registerRoute(
  /\/api\/complaints/,
  new NetworkFirst({
    plugins: [bgSyncPlugin],
  }),
  'POST'
);

// 2. Cache the last 10 complaint submissions locally
registerRoute(
  /\/api\/complaints/,
  new NetworkFirst({
    cacheName: 'complaints-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10, // Strictly cache only the last 10 items
      }),
    ],
  }),
  'GET'
);