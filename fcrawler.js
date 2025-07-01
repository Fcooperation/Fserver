import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CRAWLED_DIR = path.join(__dirname, 'crawled');
const INDEX_PATH = path.join(CRAWLED_DIR, 'search_index.json');
const MAX_PAGES = 10;
const visited = new Set();

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const auth = new google.auth.GoogleAuth({
  keyFile: './client_secret_942532537890-pieivl8jq3ublsvnsm6tk2se89bahtc5.apps.googleusercontent.com.json',
  scopes: SCOPES
});
const drive = google.drive({ version: 'v3', auth });

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
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

async function uploadToDrive({ name, mimeType, body }) {
  try {
    const file = await drive.files.create({
      requestBody: { name, mimeType },
      media: { mimeType, body }
    });
    console.log(`📤 Uploaded to Drive: ${name}`);
    return file.data.id;
  } catch (err) {
    console.error(`❌ Drive upload failed: ${err.message}`);
  }
}

async function crawlPage(url, robots, crawlDelay, pageCount = { count: 0 }) {
  if (pageCount.count >= MAX_PAGES || visited.has(url)) return;
  if (!robots.parser.isAllowed(url, 'fcrawler')) return;

  visited.add(url);
  pageCount.count++;
  console.log(`📄 Crawling: ${url}`);

  try {
    const res = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(res.data, { decodeEntities: false });

    const title = $('title').text().trim() || 'untitled';
    const safeTitle = title.replace(/[^\w]/g, '_').slice(0, 50);
    const fullHtml = `
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><title>${title}</title></head>
      <body>${$('body').html()}</body></html>
    `;

    const pageText = $('body').text().trim().slice(0, 800);

    // Upload full rebuilt HTML
    await uploadToDrive({
      name: `${safeTitle}.html`,
      mimeType: 'text/html',
      body: fullHtml
    });

    // Upload plain text
    await uploadToDrive({
      name: `${safeTitle}.txt`,
      mimeType: 'text/plain',
      body: pageText
    });

    // Save to local search index
    const entry = { url, title, text: pageText };
    let index = [];
    if (fs.existsSync(INDEX_PATH)) index = JSON.parse(fs.readFileSync(INDEX_PATH));
    index.push(entry);
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

    // Detect image/doc links only (but don’t download/upload)
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        const fullUrl = new URL(src, url).href;
        console.log(`📷 Image detected: ${fullUrl}`);
      }
    });

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && /\.(pdf|zip|docx?|pptx?|rar)$/i.test(href)) {
        const fullUrl = new URL(href, url).href;
        console.log(`📄 Doc link detected: ${fullUrl}`);
      }
    });

    // Crawl next links
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
  if (!fs.existsSync(CRAWLED_DIR)) fs.mkdirSync(CRAWLED_DIR);
  const robots = await getRobotsData(startUrl);
  await crawlPage(startUrl, robots, robots.delay);
  console.log('✅ Crawl complete.');
}
