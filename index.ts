import express, { Express } from 'express';
import MagnetUri from 'magnet-uri';
import fs from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import parseTorrent from 'parse-torrent';
import RangeParser from 'range-parser';
import torrentStream from 'torrent-stream';
import { imdbIdToSubtitle } from './subtitle';
import { yts } from './yts';

env.PORT ||= String(8000);
env.TORRENT_STREAM_FOLDER ||= 'torrent-stream';
env.RECONNECT_TIMEOUT ||= String(15 * 60 * 1000);

const app: Express = express();
const torrents = new Map();

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  res
    .status(500)
    .send({ error: 'Internal Server Error', details: err.message });
});

async function torrentToEngine(
  torrent: MagnetUri.Instance
): Promise<IMyEngine> {
  if (!torrents.has(torrent.infoHash)) {
    console.log(new Date(), 'engine+  ', torrent.infoHash, torrent.name);

    const engine = torrentStream(torrent as any, { tmp: '.' }) as IMyEngine;

    engine.clientCount = 0;
    engine.lastClientDisconnect = -1;

    engine.lazyDestroy = () => {
      console.log(
        new Date(),
        'client-  ',
        torrent.infoHash,
        `count: ${engine.clientCount}`
      );

      engine.lastClientDisconnect = Date.now();

      engine.clientCount--;
    };

    engine.clientConnect = () => {
      console.log(
        new Date(),
        'client+  ',
        torrent.infoHash,
        `count: ${engine.clientCount}`
      );

      engine.clientCount++;
    };

    const lock = Promise.withResolvers();

    torrents.set(torrent.infoHash, engine);

    engine.on('ready', () => {
      lock.resolve();
      console.log(new Date(), 'engine=  ', torrent.infoHash);
    });

    engine.on('error', (err) => {
      lock.reject();
      console.error(new Date(), 'enginex  ', torrent.infoHash);

      torrents.delete(torrent.infoHash);
    });

    engine.on('end', () => {
      torrents.delete(torrent.infoHash);
    });

    await lock.promise;
  }

  const engine = torrents.get(torrent.infoHash);
  clearTimeout(engine.reconnectTimeout);

  return engine;
}

function streamTorrent(torrent: MagnetUri.Instance, engine, req, res, next) {
  const movieExtensions = ['.mp4', '.mkv', '.avi', '.mov'];
  const file = engine.files
    .filter((file) => {
      const ext = path.extname(file.name).toLowerCase();
      return movieExtensions.includes(ext);
    })
    .reduce((prev, current) => {
      return !prev || current.length > prev.length ? current : prev;
    });

  if (!file) {
    return res.status(404).send({ error: 'No Movie found in torrent' });
  }

  const fileSize = file.length;
  let streamOptions = {};
  let statusCode = 200;
  let ranges;

  if (req.headers.range) {
    ranges = RangeParser(fileSize, req.headers.range);

    if (ranges === -1 || ranges === -2 || ranges.type !== 'bytes') {
      return res.status(416).send({ error: 'Range Not Satisfiable' });
    }

    if (ranges && ranges.length > 0) {
      const { start, end } = ranges[0];

      streamOptions = { start, end };
      statusCode = 206;
    }
  }

  res.writeHead(statusCode, {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    ...(statusCode === 206 && ranges && ranges.length > 0
      ? {
          'Content-Range': `bytes ${ranges[0].start}-${ranges[0].end}/${fileSize}`,
        }
      : {}),
  });

  const readStream = file.createReadStream(streamOptions);
  console.log(new Date(), 'stream+  ', torrent.infoHash);
  readStream.pipe(res);

  readStream.on('error', (err) => {
    console.error(new Date(), 'streamx  ', torrent.infoHash, err);
    return next(err);
  });

  readStream.on('close', () => {
    console.log(new Date(), 'stream-  ', torrent.infoHash);
  });
}

app.get('/magnet', async (req, res, next) => {
  let errorMessage = '';
  let removeClient = false;

  try {
    errorMessage = 'error parsing magnet';
    const torrent = await parseTorrent(req.query.link as string);
    console.log(new Date(), 'client+  ', torrent.infoHash);

    errorMessage = 'error loading torrent';
    const engine = await torrentToEngine(torrent);
    streamTorrent(torrent, engine, req, res, next);
    removeClient = true;
    engine.clientConnect();

    errorMessage = '';
    req.on('close', () => {
      engine.lazyDestroy();
    });

    //
  } catch (error: any) {
    errorMessage ||= error?.message;
    errorMessage ||= error;

    console.log(new Date(), 'magnetx  ', errorMessage, error);
    return res.status(400).send({
      error: errorMessage,
    });
  }
});

app.get('/imdb/:id', async (req, res, next) => {
  const imdbId = req.params.id || '';

  let errorMessage = '';
  try {
    errorMessage = 'invalid imdb id';
    if (!imdbId.match(/tt\d*$/)) {
      throw 'error';
    }

    errorMessage = 'movie not found, api error';
    const data = await yts(imdbId);
    await data[0].fetch();
    data[0].torrents;

    errorMessage = 'movie format error';
    const qualities = ['1080p', '720p'];
    let bestQualityTorrent: (typeof data)[0]['torrents'][0] = {} as any;

    for (const quality of qualities) {
      bestQualityTorrent = data[0].torrents.find(
        (item) => item['quality'] === quality
      )!;

      if (bestQualityTorrent) break;
    }

    const magnetLink = bestQualityTorrent['magnet'];

    res.redirect(`/magnet?link=${encodeURIComponent(magnetLink)}`);
  } catch (error: any) {
    errorMessage ||= error?.message || error;

    next(errorMessage);
  }
});

app.get('/srt/:id', async (req, res, next) => {
  const imdbId = req.params.id || '';

  let errorMessage = '';
  try {
    errorMessage = 'invalid imdb id';
    if (!imdbId.match(/tt\d*$/)) {
      throw 'error';
    }

    errorMessage = 'no subtitle found';
    const subtitles = await imdbIdToSubtitle(imdbId);

    return res
      .writeHead(200, {
        'Content-Type': 'text',
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'attachment;',
      })
      .send(subtitles)
      .end();
  } catch (error: any) {
    errorMessage ||= error?.message || error;

    next(errorMessage);
  }
});

async function loadExistingTorrent() {
  if (!fs.existsSync(env.TORRENT_STREAM_FOLDER!)) {
    return;
  }

  const files = fs.readdirSync(env.TORRENT_STREAM_FOLDER!);

  for (const file of files) {
    if (file.endsWith('.torrent')) {
      const infoHash = file.replace('.torrent', '');

      if (!torrents.has(infoHash)) {
        const torrentPath = path.join(env.TORRENT_STREAM_FOLDER!, file);

        try {
          const torrentFile = fs.readFileSync(torrentPath);
          const torrent = await parseTorrent(torrentFile);

          if (torrent && torrent.infoHash === infoHash) {
            console.log(new Date(), 'load+    ', infoHash);
            const engine = await torrentToEngine(torrent);
            engine.lazyDestroy();
          } else {
            console.warn(new Date(), 'load!    ', infoHash, torrent?.infoHash);
          }
        } catch (error) {
          console.error(new Date(), 'loadx    ', infoHash, error);
        }
      }
    }
  }
}

async function cleanupTorrents() {
  const timeoutMultiplier = torrents.size < 4 ? 5 : torrents.size < 6 ? 3 : 1;
  console.log(
    new Date(),
    'cleanup  ',
    'torrents count:',
    torrents.size,
    'timeout multiplier',
    timeoutMultiplier
  );

  for (const [infoHash, engine] of torrents.entries()) {
    if (engine.clientCount > 0) {
      continue;
    }

    if (engine.lastClientDisconnect === -1) {
      continue;
    }

    const inactiveTime = Date.now() - engine.lastClientDisconnect;
    const shouldRemove =
      inactiveTime >
      +env.RECONNECT_TIMEOUT! *
        (torrents.size < 4 ? 5 : torrents.size < 6 ? 3 : 1);

    if (shouldRemove) {
      console.log(new Date(), 'engine-  ', infoHash);

      engine.remove(false, () => {});
      engine.destroy(() => {});
      torrents.delete(infoHash);
    }
  }
}

setInterval(cleanupTorrents, 5 * 60 * 1000);

app.listen(env.PORT, async () => {
  console.log(new Date(), `Server listening on port ${env.PORT}`);
  await loadExistingTorrent();
});

type IMyEngine = TorrentStream.TorrentEngine & {
  reconnectTimeout: Timer;
  lazyDestroy: () => void;
  clientConnect: () => void;
  clientCount: number;
  lastClientDisconnect: number;
};
