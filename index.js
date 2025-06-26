import express from 'express';
import { checkRobotsTxt } from './fcrawler.js';

const app = express();
const PORT = process.env.PORT || 10000;

// Run robot checker on startup
const defaultSite = 'https://example.com';
checkRobotsTxt(defaultSite).then(result => {
  console.log('📡 Initial robots.txt check for', defaultSite);
  console.log(result);
}).catch(err => {
  console.error('❌ Failed to check default site:', err.message);
});

app.get('/', (req, res) => {
  res.send('🤖 Fcrawler robots.txt checker is running');
});

app.get('/check', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing ?url=https://example.com');

  try {
    const result = await checkRobotsTxt(url);
    res.json(result);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
