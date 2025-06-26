import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import mega from 'megajs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const crawledDir = path.join(__dirname, 'crawled');
const indexPath = path.join(crawledDir, 'search_index.json');
const visited = new Set();
const MAX_PAGES = 10;

// === HARD-CODED MEGA CREDENTIALS ===
const MEGA_EMAIL = 'thefcooperation@gmail.com';
const MEGA_PASSWORD = '*Onyedika2009*';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function cleanFileName(name) {
  return name.replace(/[^\w]/g, '_').slice(0, 50) + '.html';
}

function rebuildStructuredHtml($) {
  const blocks = $('body')
    .find('p, div, section, article, img, ul, ol, pre, code')
    .map((_, el) => $.html(el))
    .get();

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${$('title').text()}</title></head><body>
${blocks.join('\n')}
</body></html>`;
}

async function uploadToMega(filename, localPath) {
  return new Promise((resolve, reject) => {
    const storage = mega({ email: MEGA_EMAIL, password: MEGA_PASSWORD });

    storage.once('ready', () => {
      const fileStream = fs.createReadStream(localPath);
      const upload = storage.upload(filename);

      fileStream.pipe(upload);

      upload.on('complete', () => {
        console.log(`☁️ Uploaded to MEGA: ${filename}`);
        resolve();
      });

      upload.on('error', reject);
    });

    storage.on('error', reject);
  });
}

async function crawlPage(url, robots, crawlDelay, pageCount = { count: 0 }) {
  if (pageCount.count >= MAX_PAGES || visited.has(url)) return;
  if (!robots.parser.isAllowed(url, 'fcrawler')) return;

  visited.add(url);
  pageCount.count++;
  console.log(`📄 Crawling: ${url}`);

  try {
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data);
    const title = $('title').text().trim() || 'untitled';
    const filename = cleanFileName(title);
    const filePath = path.join(crawledDir, filename);
    const rebuiltHtml = rebuildStructuredHtml($);
    fs.writeFileSync(filePath, rebuiltHtml, 'utf-8');

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

    // Upload to MEGA
    await uploadToMega(filename, filePath);

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

export async function crawlSite(startUrl) {
  if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);
  const robots = await getRobotsData(startUrl);
  await crawlPage(startUrl, robots, robots.delay);
  console.log('✅ Crawl complete. Search index saved.');
}
