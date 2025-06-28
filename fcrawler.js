import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Storage } from 'megajs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const crawledDir = path.join(__dirname, 'crawled');
const indexPath = path.join(crawledDir, 'search_index.json');
const MAX_PAGES = 10;
const visitedUrls = new Set();
const searchIndex = [];

// Setup MEGA storage
const storage = new Storage({
  email: 'thefcooperation@gmail.com',
  password: '*Onyedika2009*' // Replace with your password
});

// Helper: format filename safely
function formatFilename(title) {
  return title.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_') + '.html';
}

// Helper: check if file exists in MEGA
async function fileExistsInMega(filename) {
  return new Promise((resolve) => {
    let found = false;
    storage.on('ready', () => {
      storage.root.children.forEach(file => {
        if (file.name === filename) {
          found = true;
        }
      });
      resolve(found);
    });
  });
}

async function crawl(url, depth = 0) {
  if (visitedUrls.has(url) || visitedUrls.size >= MAX_PAGES) return;
  visitedUrls.add(url);

  try {
    const robotsUrl = new URL('/robots.txt', url).href;
    const robotsRes = await axios.get(robotsUrl).catch(() => null);
    const robots = robotsRes ? robotsParser(robotsUrl, robotsRes.data) : null;
    if (robots && !robots.isAllowed(url)) return;

    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const title = $('title').text() || 'untitled';
    const filename = formatFilename(title);

    // Try to get last-modified from header
    const lastModified = res.headers['last-modified'] || new Date().toISOString();

    // Build content with inline text + images
    let bodyContent = '';
    $('p, h1, h2, h3, h4, img').each((_, el) => {
      if (el.tagName === 'img') {
        const src = $(el).attr('src');
        if (src) bodyContent += `<img src="${src}" /><br/>`;
      } else {
        bodyContent += `<${el.tagName}>${$(el).text()}</${el.tagName}>`;
      }
    });

    const htmlContent = `
      <html><head><title>${title}</title></head>
      <body>${bodyContent}</body></html>
    `;
    const filePath = path.join(crawledDir, filename);
    fs.writeFileSync(filePath, htmlContent);

    // Measure file size
    const fileSize = fs.statSync(filePath).size;
    const kbSize = (fileSize / 1024).toFixed(2);
    console.log(`📏 File size: ${kbSize} KB`);

    // Check if already uploaded
    storage.once('ready', async () => {
      const exists = await fileExistsInMega(filename);
      if (exists) {
        console.log(`⏩ Skipped (already in MEGA): ${filename}`);
        return;
      }

      // Upload to MEGA
      const upload = storage.upload(filename, fs.createReadStream(filePath));
      upload.complete = () => {
        console.log(`📤 Uploaded to MEGA: ${filename}`);
      };
    });

    // Add to search index
    searchIndex.push({
      title,
      url,
      filename,
      size: fileSize,
      createdAt: lastModified,
      text: $('body').text().trim()
    });

    // Crawl next links
    const links = $('a[href]').map((_, el) => $(el).attr('href')).get();
    for (const link of links) {
      const absolute = new URL(link, url).href;
      await crawl(absolute, depth + 1);
    }
  } catch (err) {
    console.error(`❌ Failed to crawl ${url}: ${err.message}`);
  }
}

(async () => {
  if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);

  console.log(`📄 Crawling: https://www.google.com/`);
  await new Promise(resolve => storage.once('ready', resolve));
  await crawl('https://www.google.com/');

  fs.writeFileSync(indexPath, JSON.stringify(searchIndex, null, 2));
  console.log('✅ Crawl complete. Search index saved.');
})();
