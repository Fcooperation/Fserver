import express from 'express';
import { crawlSite } from './fcrawler.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('🌍 Fweb Crawler is Live');
});

app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
  crawlSite('https://example.com'); // Replace with your start URL
});
