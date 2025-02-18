import axios from 'axios';
import * as cheerio from 'cheerio';

export async function yts(movieName: string): Promise<lazyMovie[]> {
  let movies: lazyMovie[] = [];

  let searchPage: any;

  searchPage = await axios
    .get(`https://yts.mx/browse-movies/${movieName}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.106 Safari/537.36',
      },
    })
    .catch(() => console.error('Error fetching movie list'));

  const search = cheerio.load(searchPage.data);

  search('.browse-movie-wrap').each((index, element) => {
    const anchor = search(element).find('a.browse-movie-title');
    const href = anchor.attr('href');
    const text = anchor.first().text();
    if (href && text) {
      movies.push(new lazyMovie(text, href));
    }
  });

  return movies;
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
    // let movieDetail: MovieDetail = {
    //   Url: undefined,
    //   Name: undefined,
    //   Language: undefined,
    //   Img: undefined,
    //   Release_date: undefined,
    //   Gen: undefined,
    //   Rating: undefined,
    //   Likes: undefined,
    //   Runtime: undefined,
    // };

    const page = cheerio.load((await axios.get(this.link)).data);

    // movieDetail.Name = page('.tech-spec-info h1').text().trim(); // Updated selector - more robust
    // movieDetail.Language = page('.tech-spec-info h2').eq(0).text().trim(); // Updated selector - more robust
    // movieDetail.Img = page('#movie-poster img').attr('src'); // Updated selector - more robust
    // movieDetail.Release_date = page('.tech-spec-info h2').eq(1).text().trim(); // Updated selector - more robust
    // movieDetail.Rating =
    //   page('.rating-row span.score_ratings').text().trim() + ' ⭐' ||
    //   'Not Rated'; // Updated selector - more specific
    // movieDetail.Likes = page('.rating-row span.peers').text().trim(); // Updated selector - more specific

    // page('.tech-spec-element').each((index, element) => {
    //   const headingElement = page(element).find('h4'); // Select h4 inside .tech-spec-element
    //   const valueElement = page(element).find('div.modal-torrent'); // Select div.modal-torrent inside .tech-spec-element

    //   const heading = headingElement.text().trim();
    //   const value = valueElement.text().trim();

    //   if (heading === 'Genre:') {
    //     movieDetail.Gen = value;
    //   } else if (heading === 'Runtime:') {
    //     movieDetail.Runtime = value;
    //   }
    // });

    page('.modal-torrent').each((i, element) => {
      const qualityElement = page(element);
      const qualitySizeElements = qualityElement.find('.quality-size');
      const qualityFull = qualitySizeElements.eq(0).text().trim();
      const fileSize = qualitySizeElements.eq(1).text().trim();
      const magnet = qualityElement.find('.magnet-download').attr('href');
      const quality = qualityElement.find('.modal-quality').text();

      if (magnet) {
        this.torrents.push({ quality, qualityFull, fileSize, magnet });
      }
    });
  }
}
