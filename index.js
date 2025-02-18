import yts from '@dil5han/yts';
import express from 'express';
import parseTorrent from 'parse-torrent';
import rangeParser from 'range-parser';
import torrentStream from 'torrent-stream';

const app = express();
const torrents = new Map(); // Store torrent engines by infoHash
const RECONNECT_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds, using constant for clarity
const PORT = 8000; // Define port as a constant

// Middleware to handle errors globally
app.use((err, req, res, next) => {
  console.error('Global error handler:', err); // Log the full error
  if (res.headersSent) {
    return next(err); // Let default handler take over if headers already sent
  }
  res
    .status(500)
    .send({ error: 'Internal Server Error', details: err.message }); // Send JSON error response
});

app.get('/magnet', async (req, res, next) => {
  // Changed route to /magnet with query parameter
  const magnetLink = req.query.link; // Get magnet link from query parameter

  if (!magnetLink) {
    return res.status(400).send({
      error: 'Missing magnet link. Please provide ?link=[magnet URI]',
    });
  }

  let range = req.headers.range || ''; // Default to empty string if no range header

  try {
    let torrent;
    try {
      torrent = await parseTorrent(magnetLink); // Parse magnet link
    } catch (parseErr) {
      console.error('Error parsing magnet link:', parseErr);
      return res
        .status(400)
        .send({ error: 'Invalid magnet link.', details: parseErr.message });
    }

    const infoHash = torrent.infoHash;
    console.log(`Request for torrent: ${torrent.name || infoHash}`);

    if (torrents.has(infoHash)) {
      const existingEngine = torrents.get(infoHash);
      console.log('Using existing torrent stream for:', infoHash);
      clearTimeout(existingEngine.reconnectTimeout); // Clear any pending timeout

      streamTorrent(existingEngine, req, res, range, next); // Call streaming function
    } else {
      const engine = torrentStream(torrent);
      torrents.set(infoHash, engine);
      console.log('Starting new torrent stream for:', infoHash);

      engine.on('ready', () => {
        console.log('Torrent stream ready:', infoHash);
        streamTorrent(engine, req, res, range, next); // Call streaming function
      });

      engine.on('error', (err) => {
        console.error('Torrent engine error:', infoHash, err);
        torrents.delete(infoHash); // Remove torrent on error
        return next(err); // Pass error to global error handler
      });

      engine.on('end', () => {
        console.log('Torrent stream ended:', infoHash);
        torrents.delete(infoHash); // Clean up torrent engine when stream ends
      });

      req.on('close', () => {
        console.log('Client disconnected for:', infoHash);
        engine.reconnectTimeout = setTimeout(() => {
          console.log('No reconnect, destroying engine for:', infoHash);
          engine.destroy();
          torrents.delete(infoHash);
        }, RECONNECT_TIMEOUT);
      });
    }
  } catch (error) {
    console.error('Unexpected error in /magnet route:', error);
    next(error); // Pass error to global error handler
  }
});

// Extract streaming logic into a reusable function
function streamTorrent(engine, req, res, range, next) {
  const file = engine.files[0]; // Assuming first file is the video, consider file selection in future
  if (!file) {
    return res
      .status(404)
      .send({ error: 'No files found in torrent to stream.' });
  }

  const fileSize = file.length;
  let streamOptions = {};
  let statusCode = 200; // Default status code
  let ranges; // Declare ranges outside the if block

  if (range) {
    ranges = rangeParser(fileSize, range);

    if (ranges === -1 || ranges === -2 || ranges.type !== 'bytes') {
      // Handle invalid range requests
      return res.status(416).send({ error: 'Range Not Satisfiable' }); // 416 for invalid range
    }

    if (ranges && ranges.length > 0) {
      const { start, end } = ranges[0]; // Assuming single range is requested
      streamOptions = { start, end };
      statusCode = 206; // 206 Partial Content for range requests
      console.log(`Streaming range: ${start} - ${end}`);
    } else {
      console.log(`Streaming full file as no valid range parsed`);
    }
  }

  res.writeHead(statusCode, {
    'Content-Type': 'video/mp4', // Consider using mime-types library for better content type detection
    'Accept-Ranges': 'bytes',
    ...(statusCode === 206 && ranges && ranges.length > 0
      ? {
          'Content-Range': `bytes ${ranges[0].start}-${ranges[0].end}/${fileSize}`,
        }
      : {}),
  });

  const readStream = file.createReadStream(streamOptions);
  readStream.pipe(res);

  readStream.on('error', (err) => {
    console.error('Read stream error:', err);
    return next(err);
  });

  readStream.on('close', () => {
    console.log('Read stream closed');
  });
}

app.get('/imdb/:id', async (req, res, next) => {
  // Added next for error handling
  const imdbId = req.params.id;

  if (!imdbId) {
    return res.status(400).send({ error: 'Missing IMDB ID.' });
  }

  try {
    const data = await yts.yts(imdbId, '1');
    if (!data || !data[1] || data[1].length === 0) {
      return res
        .status(404)
        .send({ error: 'No torrents found for IMDB ID.', imdbId });
    }

    // const qualities = ['1080p', '720p']; // Preferred qualities order
    const qualities = ['720p']; // Preferred qualities order
    let bestQualityTorrent = null;

    for (const quality of qualities) {
      bestQualityTorrent = data[1].find((item) => item['Quality'] === quality);
      if (bestQualityTorrent) break; // Found best quality, exit loop
    }

    if (bestQualityTorrent) {
      const magnetLink = bestQualityTorrent['Magnet'];
      console.log(
        `Redirecting to magnet link for IMDB ID ${imdbId}: ${magnetLink}`
      );
      res.redirect(`/magnet?link=${encodeURIComponent(magnetLink)}`); // Use query parameter for magnet link
    } else {
      res.status(404).send({
        error: 'No suitable quality found for IMDB ID.',
        imdbId,
        availableQualities: data[1].map((item) => item['Quality']),
      });
    }
  } catch (error) {
    console.error('Error fetching torrent from YTS:', error);
    next(error); // Pass error to global error handler
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
