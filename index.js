import express from 'express';
import { crawlPage } from './fcrawler.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => {
  res.send('✅ Fcrawler is running and port is open');
});

// Run crawler when app starts
const startUrl = 'https://www.google.com/';
crawlPage(startUrl);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
