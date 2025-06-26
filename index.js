import express from 'express';
import { crawlSite } from './fcrawler.js';

const app = express();
const PORT = 10000;

app.get('/', async (req, res) => {
  try {
    await crawlSite('https://example.com'); // Replace with any URL
    res.send('✅ Crawling and upload complete.');
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Failed: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/`);
});
