import yts from '@dil5han/yts';

yts
  .yts('tt1490017', '1') // yts('movies', '1') Replace the word "movies" with the search you want to search
  .then((data) => {
    if (data === null) {
      console.log('Error: Failed to fetch data from YTS.');
    } else if (data.length === 0) {
      console.log('No search results');
    } else {
      console.log(data);
    }
  })
  .catch((error) => {
    console.log('Error:', error);
  });
