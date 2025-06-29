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
const visited = new Set();
const MAX_PAGES = 10;

const megaEmail = 'thefcooperation@gmail.com';
const megaPassword = '*Onyedika2009*';

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get robots.txt data
async function getRobotsData(url) {
  try {
    const robotsUrl = new URL('/robots.txt', url).href;
    const res = await axios.get(robotsUrl);
    const robots = robotsParser(robotsUrl, res.data);
    return {
      parser: robots,
      delay: robots.getCrawlDelay('fcrawler') || 2000
    };
  } catch {
    return { parser: { isAllowed: () => true }, delay: 2000 };
  }
}

// Upload to MEGA, passing file size
async function uploadToMegaIfNotExists(filename, filePath, fileSize) {
  return new Promise((resolve, reject) => {
    const storage = new Storage({ email: megaEmail, password: megaPassword });

    storage.on('ready', async () => {
      const files = Object.values(storage.files);
      const exists = files.some(file => file.name === filename);

      if (exists) {
        console.log(`⏩ Skipped (already exists): ${filename}`);
        return resolve();
      }

      const readStream = fs.createReadStream(filePath);
      const upload = storage.upload({ name: filename, size: fileSize }, readStream);

      upload.on('complete', () => {
        console.log(`📤 Uploaded: ${filename}`);
        resolve();
      });

      upload.on('error', err => {
        console.error(`❌ Upload error: ${err.message}`);
        reject(err);
      });
    });

    storage.on('error', err => {
      console.error(`❌ MEGA login failed: ${err.message}`);
      reject(err);
    });

    storage.login();
  });
}

// Crawl and save individual page
async function crawlPage(url, robots, crawlDelay, pageCount = { count: 0 }) {
  if (pageCount.count >= MAX_PAGES || visited.has(url)) return;
  if (!robots.parser.isAllowed(url, 'fcrawler')) return;

  visited.add(url);
  pageCount.count++;
  console.log(`📄 Crawling: ${url}`);

  try {
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data, { decodeEntities: false });

    const title = $('title').text().trim() || 'untitled';
    const filename = title.replace(/[^\w]/g, '_').slice(0, 50) + '.html';
    const filePath = path.join(crawledDir, filename);

    const htmlContent = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>${title}</title>\n</head>\n<body>\n${$('body').html()}\n</body>\n</html>`;
    fs.writeFileSync(filePath, htmlContent, 'utf-8');

    // 📏 File size check
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileSizeKB = (fileSize / 1024).toFixed(2);
    console.log(`📏 File size: ${fileSizeKB} KB`);

    const entry = {
      url,
      title,
      filename,
      text: $('body').text().trim().slice(0, 500)
    };

    let index = [];
    if (fs.existsSync(indexPath)) {
      index = JSON.parse(fs.readFileSync(indexPath));
    }
    index.push(entry);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

    await uploadToMegaIfNotExists(filename, filePath, fileSize);

    const links = $('a[href]')
      .map((_, el) => $(el).attr('href'))
      .get()
      .map(link => new URL(link, url).href)
      .filter(href => href.startsWith('http'));

    for (const link of links) {
      await sleep(crawlDelay);
      await crawlPage(link, robots, crawlDelay, pageCount);
    }
  } catch (err) {
    console.warn(`❌ Error crawling ${url}: ${err.message}`);
  }
}

// Exported crawlSite
export async function crawlSite(startUrl) {
  if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);
  const robots = await getRobotsData(startUrl);
  await crawlPage(startUrl, robots, robots.delay);
  console.log('✅ Crawl complete. Search index saved.');
}
