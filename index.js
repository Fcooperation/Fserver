// index.js

import express from 'express';
import { checkRobotsTxt } from './fcrawler.js';

const app = express();
const PORT = 3000;

// Change this to test any other site
const START_URL = 'https://www.google.com/';

app.get('/', async (req, res) => {
  const allowed = await checkRobotsTxt(START_URL);
  if (allowed) {
    res.send(`✅ Allowed to crawl: ${START_URL}`);
    // (You can start full crawling here later)
  } else {
    res.send(`⛔ Not allowed to crawl: ${START_URL}`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
