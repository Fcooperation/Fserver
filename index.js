import express from 'express';
import { crawlSite } from './fcrawler.js';

const app = express();
const PORT = 10000;

app.get('/', async (req, res) => {
  try {
    await crawlSite('https://www.google.com/');
    res.send('✅ Crawl complete. Search index saved.');
  } catch (error) {
    console.error('❌ Error during crawl:', error);
    res.status(500).send('Error during crawling.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}/`);
});
