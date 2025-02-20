import AdmZip from 'adm-zip';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';

export async function imdbIdToSubtitle(
  imdbId: string
): Promise<Buffer<ArrayBufferLike> | null> {
  try {
    const list = parse(
      await (
        await fetch(`https://yifysubtitles.ch/movie-imdb/${imdbId}`)
      ).text()
    );

    const row = list
      .querySelectorAll('.table-responsive tr[data-id]')
      .find(
        (row) =>
          row
            .querySelector('.flag-cell span.sub-lang')
            ?.innerText?.toLowerCase() === 'english'
      );

    if (!row) return null;

    const downloadPageUrl = row.querySelector('a[href]')?.getAttribute('href');
    if (!downloadPageUrl) return null;

    const downloadPage = parse(
      await (await fetch(`https://yifysubtitles.ch/${downloadPageUrl}`)).text()
    );

    const zipUrl = downloadPage
      .querySelector('a.download-subtitle[href]')
      ?.getAttribute('href');

    if (!zipUrl) return null;

    const zipResponse = await fetch(`https://yifysubtitles.ch/${zipUrl}`);

    const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());

    const zip = new AdmZip(zipBuffer);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      if (entry.entryName.toLowerCase().endsWith('.srt')) {
        return entry.getData();
      }
    }

    return null;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}
