import express, { Express } from 'express';
import { env } from 'node:process';
import { apiInit } from './apis';
import { cleanupTorrents } from './cron';
import { loadExistingTorrent } from './torrent';

env.PORT ||= String(8000);
env.TORRENT_STREAM_FOLDER ||= 'torrent-stream';
env.RECONNECT_TIMEOUT ||= String(15 * 60 * 1000);
env.YTS_DOMAIN ||= "yts.lt"
env.LOAD_TORRENTS_ON_RESTART = String(env.LOAD_TORRENTS_ON_RESTART).toUpperCase() === 'TRUE'

export const app: Express = express();
export const torrents = new Map();

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  res
    .status(500)
    .send({ error: 'Internal Server Error', details: err.message });
});

apiInit(app);

app.listen(env.PORT, async () => {
  console.log(new Date(), `Server listening on port ${env.PORT}`);

  await loadExistingTorrent();
});

setInterval(cleanupTorrents, 5 * 60 * 1000);

declare global {
  interface env {
    PORT: string;
    TORRENT_STREAM_FOLDER: string;
    RECONNECT_TIMEOUT: string;
  }
}
