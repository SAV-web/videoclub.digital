const name = 'Woody Allen';
const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log('WIKIPEDIA SUMMARY:', {
      title: data.title,
      description: data.description,
      extract: data.extract,
      desktopUrl: data.content_urls?.desktop?.page
    });
  })
  .catch(err => {
    console.error('ERROR:', err);
  });
