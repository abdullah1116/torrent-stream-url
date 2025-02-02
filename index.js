import yts from '@dil5han/yts';
import express from 'express';
import torrentStream from 'torrent-stream';
import parseTorrent from 'parse-torrent';

const app = express();
const torrents = new Map(); // Store all torrents in a map
const reconnectTimeout = 1 * 60 * 1000; // 30 minutes

app.get('/magnet:', async (req, res) => {
  const magnet = req.url.slice(1);

  try {
    // Parse the magnet link
    const torrent = await parseTorrent(magnet);
    console.log('Parsed torrent:', (torrent || {})['name']);

    // Check if the torrent already exists
    if (torrents.has(torrent.infoHash)) {
      console.log('Using existing torrent stream');
      const existingEngine = torrents.get(torrent.infoHash);
      existingEngine.reconnectTimeout = clearTimeout(
        existingEngine.reconnectTimeout
      );
      existingEngine.files.forEach((file) => {
        console.log('has existing files');
        file.createReadStream().pipe(res);
      });
    } else {
      // Create a readable stream from the torrent
      const engine = torrentStream(torrent);
      torrents.set(torrent.infoHash, engine);

      engine.on('ready', () => {
        console.log('Torrent stream ready');
        engine.files.forEach((file) => {
          console.log('Adding file:', file.name);
          file.createReadStream().pipe(res);
        });
      });

      engine.on('error', (err) => {
        console.error(err);
        res.status(500).send('Error streaming torrent');
      });

      engine.on('end', () => {
        console.log('Torrent stream ended');
        torrents.delete(torrent.infoHash);
      });

      // Set the response headers
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Transfer-Encoding': 'chunked',
      });

      // Handle client disconnection
      req.on('close', () => {
        console.log('Client disconnected');
        engine.reconnectTimeout = setTimeout(() => {
          console.log(
            'Client did not reconnect, deleting torrent and its files'
          );
          engine.destroy();
          torrents.delete(torrent.infoHash);
        }, reconnectTimeout);
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error parsing torrent');
  }
});
app.get('/imdb/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const data = await yts.yts(id, '1');
    let bestQuality;

    for (const item of data[1]) {
      if (item['Quality'] === '1080p') {
        bestQuality = item;
        break;
      } else if (item['Quality'] === '720p' && !bestQuality) {
        bestQuality = item;
      }
    }

    if (bestQuality) {
      const magnet = bestQuality['Magnet'];
      console.log(`Redirecting to ${magnet}`);
      res.redirect(`/${magnet}`);
    } else {
      res.status(404).send('No suitable quality found');
    }
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});

// Add reconnect method to engine
torrentStream.prototype.reconnect = function (res) {
  console.log('Client reconnected');
  clearTimeout(this.reconnectTimeout);
  this.files.forEach((file) => {
    file.createReadStream().pipe(res);
  });
};

app.listen(8000, () => {
  console.log('Server listening on port 8000');
});
