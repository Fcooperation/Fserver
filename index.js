import express from 'express';
import { crawlSite } from './fcrawler.js';

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ Serve static frontend if needed
app.use(express.static('public'));

// ✅ Home route
app.get('/', (req, res) => {
  res.send('🌍 Fcrawler is live and crawling.');
});

// ✅ Change this URL to target a different crawlable site
const startUrl = 'https://file-examples.com/index.php/sample-documents-download/sample-pdf-download/';

app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}/`);
  console.log(`📄 Crawling: ${startUrl}`);
  await crawlSite(startUrl);
});
