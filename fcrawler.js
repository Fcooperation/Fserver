import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { Storage } from 'megajs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const crawledDir = path.join(__dirname, 'crawled');
const indexPath = path.join(crawledDir, 'search_index.json');
const visited = new Set();
const MAX_PAGES = 10;

// MEGA credentials (hardcoded as you requested)
const MEGA_EMAIL = 'thefcooperation@gmail.com';
const MEGA_PASSWORD = '*Onyedika2009*';

// Pause between pages
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Load robots.txt
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

// Connect to MEGA
async function connectToMega() {
  return new Promise((resolve, reject) => {
    const storage = new Storage({ email: MEGA_EMAIL, password: MEGA_PASSWORD });
    storage.on('ready', () => resolve(storage));
    storage.on('error', reject);
    storage.login();
  });
}

// Upload if not already in MEGA
async function uploadToMegaIfNotExists(filename, content, storage) {
  const exists = storage.files.some(file => file.name === filename);
  if (exists) {
    console.log(`⏩ Skipped upload (already exists): ${filename}`);
    return;
  }

  return new Promise((resolve, reject) => {
    const file = storage.upload(filename);
    file.write(content);
    file.end();
    file.on('complete', () => {
      console.log(`📤 Uploaded: ${filename}`);
      resolve();
    });
    file.on('error', reject);
  });
}

// Crawl a single page
async function crawlPage(url, robots, crawlDelay, storage, pageCount = { count: 0 }) {
  if (pageCount.count >= MAX_PAGES || visited.has(url)) return;
  if (!robots.parser.isAllowed(url, 'fcrawler')) return;

  visited.add(url);
  pageCount.count++;
  console.log(`📄 Crawling: ${url}`);

  try {
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data);
    const title = $('title').text().trim() || 'untitled';
    const filename = title.replace(/[^\w]/g, '_').slice(0, 50) + '.html';
    const filePath = path.join(crawledDir, filename);

    const htmlContent = $.html(); // preserve full structure
    fs.writeFileSync(filePath, htmlContent, 'utf-8');
    await uploadToMegaIfNotExists(filename, htmlContent, storage);

    // Add to search index
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

    // Follow links
    const links = $('a[href]')
      .map((_, el) => $(el).attr('href'))
      .get()
      .map(link => new URL(link, url).href)
      .filter(href => href.startsWith('http'));

    for (const link of links) {
      await sleep(crawlDelay);
      await crawlPage(link, robots, crawlDelay, storage, pageCount);
    }
  } catch (err) {
    console.warn(`❌ Error crawling ${url}: ${err.message}`);
  }
}

// Main entry point
export async function crawlSite(startUrl) {
  if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);
  const robots = await getRobotsData(startUrl);
  const storage = await connectToMega();
  await crawlPage(startUrl, robots, robots.delay, storage);
  console.log('✅ Crawl complete. Search index saved.');
}
