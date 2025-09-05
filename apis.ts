import { Express } from 'express';
import multer from 'multer';
import path from 'node:path';
import parseTorrent, { toMagnetURI } from 'parse-torrent';
import { imdbIdToSubtitle } from './subtitle';
import { streamTorrent, torrentToEngine } from './torrent';
import { yts } from './yts';

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

export function apiInit(app: Express) {
  app.get('/magnet:', async (req, res, next) => {
    let errorMessage = '';
    let removeClient = false;

    try {
      errorMessage = 'error parsing magnet';
      const torrent = await parseTorrent(req.url.slice(1));
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
      const data = await yts(imdbId).catch(
        (e) => (console.error('yts error:', e), Promise.reject(e))
      );
      await data[0]
        .fetch()
        .catch((e) => (console.error('yts error:', e), Promise.reject(e)));

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

      res.setHeader(
        'Set-Cookie',
        `tt=${imdbId}; Path=/; HttpOnly; Max-Age=86400`
      );
      res.redirect(`/${magnetLink}`);
    } catch (error: any) {
      errorMessage ||= error?.message || error;

      next(errorMessage);
    }
  });

  app.get('/srt/:id?', async (req, res, next) => {
    let imdbId = req.params.id || '';
    if (!imdbId) {
      imdbId = req.cookies?.tt;
    }

    console.log(new Date(), 'srt      ', imdbId);

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
          'Content-Disposition': `attachment; filename="subtitle ${imdbId}.srt"`,
        })
        .send(subtitles)
        .end();
    } catch (error: any) {
      errorMessage ||= error?.message || error;

      next(errorMessage);
    }
  });

  app.get('/torrent-file', async (req, res, next) => {
    res.sendFile(path.join(__dirname, '/torrent-picker.html'));
  });

  app.post('/torrent', upload.single('file'), async (req: any, res) => {
    if (!req.file) {
      return res.status(400).send('No file was uploaded.');
    }

    try {
      const torrent = await parseTorrent(req.file.buffer);

      const magnet = toMagnetURI(torrent);

      res.status(200).send({ magnet });
    } catch (error) {
      console.error('Error parsing torrent file:', error);
      res.status(500).send({ error: 'Failed to parse torrent file.' });
    }
  });
}
