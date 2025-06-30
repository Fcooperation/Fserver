import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 10000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const crawledDir = path.join(__dirname, 'crawled');
const indexPath = path.join(crawledDir, 'search_index.json');

app.use(express.static('public'));

// Search index endpoint
app.get('/index', (req, res) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Index not found' });
  }
});

// Serve crawled HTML page by filename
app.get('/page/:filename', (req, res) => {
  const file = path.join(crawledDir, req.params.filename);
  if (fs.existsSync(file)) {
    res.sendFile(file);
  } else {
    res.status(404).send('Page not found');
  }
});

// Home
app.get('/', (req, res) => {
  res.send(`
    <h2>📚 Fweb is Live</h2>
    <p>Use <code>/index</code> to get search index.</p>
    <p>Use <code>/page/:filename</code> to view any crawled file.</p>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}/`);
});
