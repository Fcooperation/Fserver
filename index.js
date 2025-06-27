import express from 'express';
import { crawlSite } from './fcrawler.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', async (req, res) => {
  const startUrl = 'https://www.google.com/';
  await crawlSite(startUrl);
  res.send('✅ Fcrawler finished crawling.');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}/`);
});
