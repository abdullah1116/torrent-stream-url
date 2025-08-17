import MagnetUri from 'magnet-uri';
import { torrents } from './index';

import fs from 'node:fs';
import parseTorrent from 'parse-torrent';
import path from 'path';
import { env } from 'process';
import RangeParser from 'range-parser';
import torrentStream from 'torrent-stream';

export async function torrentToEngine(
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
export function streamTorrent(
  torrent: MagnetUri.Instance,
  engine,
  req,
  res,
  next
) {
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

export async function loadExistingTorrent() {
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

export type IMyEngine = TorrentStream.TorrentEngine & {
  reconnectTimeout: Timer;
  lazyDestroy: () => void;
  clientConnect: () => void;
  clientCount: number;
  lastClientDisconnect: number;
};
