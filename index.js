import http from 'http';
import { crawlSite } from './fcrawler.js';

http.createServer((req, res) => {
  if (req.url.startsWith('/crawl?url=')) {
    const url = decodeURIComponent(req.url.split('=')[1]);
    crawlSite(url);
    res.end('✅ Crawling started: ' + url);
  } else {
    res.end('🌐 Fcrawler is live');
  }
}).listen(10000, () => {
  console.log('🚀 Fcrawler running at http://localhost:10000/');
});
