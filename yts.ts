import parse from 'node-html-parser';

export async function yts(movieName: string): Promise<lazyMovie[]> {
  const root = parse(
    await (
      await fetch(`https://yts.mx/browse-movies/${movieName}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.106 Safari/537.36',
        },
      })
    ).text()
  );

  return root
    .querySelectorAll('.browse-movie-wrap')
    .map((element) => {
      const anchor = element.querySelector('a.browse-movie-title');
      if (anchor) {
        const href = anchor.getAttribute('href');
        const text = anchor.textContent;
        if (href && text) {
          return new lazyMovie(text, href);
        }
      }
    })
    .filter((m) => !!m);
}

class lazyMovie {
  torrents: {
    quality: string;
    qualityFull: string;
    fileSize: string;
    magnet: string;
  }[] = [];

  constructor(public name: string, public link: string) {}

  async fetch() {
    const page = parse(
      await (
        await fetch(this.link, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.106 Safari/537.36',
          },
        })
      ).text()
    );

    this.torrents = page
      .querySelectorAll('.modal-torrent')
      .map((element) => {
        const qualitySizeElements = element.querySelectorAll('.quality-size');
        const qualityFull = qualitySizeElements[0]?.textContent?.trim() || '';
        const fileSize = qualitySizeElements[1]?.textContent?.trim() || '';
        const magnetElement = element.querySelector('.magnet-download');
        const magnet = magnetElement?.getAttribute('href');
        const qualityElementModal = element.querySelector('.modal-quality');
        const quality = qualityElementModal?.textContent || '';

        if (magnet) {
          return { quality, qualityFull, fileSize, magnet };
        }
      })
      .filter((t) => !!t);
  }
}
