import express from 'express';
import { crawlSite } from './fcrawler.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('🌐 Fserver is running and ready to crawl!');
});

app.listen(PORT, async () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  await crawlSite();
});
