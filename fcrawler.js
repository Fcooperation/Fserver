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

// Mega login
const megaEmail = 'thefcooperation@gmail.com';
const megaPassword = '*Onyedika2009*';

// Delay between requests
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

async function uploadToMegaIfNotExists(filename, filePath) {
  return new Promise((resolve, reject) => {
    const storage = new Storage({ email: megaEmail, password: megaPassword });

    storage.on('ready', async () => {
      const files = Object.values(storage.files);
      const exists = files.some(file => file.name === filename);

      if (exists) {
        console.log(`⏩ Skipped (already exists): ${filename}`);
        return resolve();
      }

      const upload = storage.upload(filename, fs.createReadStream(filePath));
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

function extractCreationDate($) {
  // Try to find meta tags or time elements
  const metaDate =
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[name="pubdate"]').attr('content') ||
    $('meta[name="date"]').attr('content') ||
    $('time').attr('datetime') ||
    null;

  return metaDate || new Date().toISOString(); // fallback to now
}

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
    const createdDate = extractCreationDate($);

    const contentBlocks = [];

    $('h1, h2, p').each((_, el) => {
      contentBlocks.push({
        type: el.tagName,
        text: $(el).text().trim()
      });
    });

    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        contentBlocks.push({
          type: 'image',
          src: new URL(src, url).href,
          alt: $(el).attr('alt') || ''
        });
      }
    });

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const link = new URL(href, url).href;
      contentBlocks.push({
        type: 'link',
        text: $(el).text().trim(),
        href: link
      });
    });

    const jsonData = {
      url,
      title,
      createdAt: createdDate,
      crawledAt: new Date().toISOString(),
      blocks: contentBlocks
    };

    const safeName = title.replace(/[^\w]/g, '_').slice(0, 50);
    const filename = `${safeName}_${createdDate.replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(crawledDir, filename);

    if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`✅ Page saved locally: ${filename}`);

    const entry = {
      url,
      title,
      filename,
      createdAt: createdDate
    };

    let index = [];
    if (fs.existsSync(indexPath)) {
      index = JSON.parse(fs.readFileSync(indexPath));
    }
    index.push(entry);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

    await uploadToMegaIfNotExists(filename, filePath);

    // Follow links recursively
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
