import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { crawlSite } from './fcrawler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/search', (req, res) => {
  const q = req.query.q?.toLowerCase();
  if (!q) return res.json([]);

  const indexPath = path.join(__dirname, 'crawled', 'search_index.json');
  if (!fs.existsSync(indexPath)) return res.json([]);

  const index = JSON.parse(fs.readFileSync(indexPath));
  const results = index.filter(entry => entry.sentence.toLowerCase().includes(q));
  res.json(results.slice(0, 20));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}/`);
  const startUrl = 'https://https://file-examples.com/index.php/sample-documents-download/sample-pdf-download//';
  console.log(`📄 Crawling: ${startUrl}`);
  crawlSite(startUrl);
});
