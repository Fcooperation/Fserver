import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Storage } from 'megajs';
import robotsParser from 'robots-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const crawledDir = path.join(__dirname, 'crawled');
const indexPath = path.join(crawledDir, 'search_index.json');
const visited = new Set();
const MAX_PAGES = 10;

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

function formatHtml($) {
  const body = $('body');
  const blocks = [];
  body.children().each((_, el) => {
    const tag = $(el).get(0).tagName;
    const content = $.html(el);
    if (tag && content) blocks.push(content);
  });

  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="UTF-8"><title>${$('title').text()}</title></head>
      <body>${blocks.join('\n')}</body>
    </html>
  `;
}

function uploadToMega(filename, contentBuffer) {
  return new Promise((resolve, reject) => {
    const storage = new Storage({
      email: MEGA_EMAIL,
      password: MEGA_PASSWORD
    });

    storage.on('ready', () => {
      const file = storage.root.upload(filename, contentBuffer);
      file.on('complete', () => {
        console.log(`📤 Uploaded: ${filename}`);
        resolve();
      });
      file.on('error', reject);
    });

    storage.on('error', reject);
    storage.login();
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
    const $ = cheerio.load(res.data, { decodeEntities: false });

    const title = $('title').text().trim() || 'untitled';
    const filename = title.replace(/[^\w]/g, '_').slice(0, 50) + '.html';
    const filePath = path.join(crawledDir, filename);
    const rebuiltHtml = formatHtml($);

    fs.writeFileSync(filePath, rebuiltHtml, 'utf-8');
    await uploadToMega(filename, Buffer.from(rebuiltHtml, 'utf-8'));

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
