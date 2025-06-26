import puppeteer from 'puppeteer';
import cheerio from 'cheerio';
import axios from 'axios';
import robotsParser from 'robots-parser';
import { Storage } from 'megajs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MEGA credentials (hardcoded)
const megaEmail = 'thefcooperation@gmail.com';
const megaPassword = '*Onyedika2009*';

// Login to MEGA
async function loginToMega() {
  return new Promise((resolve, reject) => {
    const storage = new Storage({ email: megaEmail, password: megaPassword });
    storage.on('ready', () => resolve(storage));
    storage.on('error', reject);
    storage.login();
  });
}

// Check if file already exists
function fileExistsInMega(storage, fileName) {
  return storage.root.children.some(file => file.name === fileName);
}

// Get HTML with Puppeteer
async function fetchHTMLWithPuppeteer(url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  const html = await page.content();
  await browser.close();
  return html;
}

// Save HTML locally
function saveLocally(fileName, content) {
  const outPath = path.join(__dirname, 'downloads', fileName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content);
  return outPath;
}

// Upload to MEGA
function uploadToMega(storage, filePath, fileName) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    const upload = storage.upload(fileName, fileStream);
    upload.on('complete', () => resolve(fileName));
    upload.on('error', reject);
  });
}

// Reformat page: preserve layout using cheerio block wrapping
function reformatPage(html, url) {
  const $ = cheerio.load(html);
  $('script, style, iframe, video').remove(); // Clean junk
  const title = $('title').text() || 'Untitled';
  const bodyContent = $('body').html() || '';
  return `
    <html>
      <head><meta charset="utf-8"><title>${title}</title></head>
      <body>${bodyContent}</body>
    </html>
  `;
}

// Crawl a URL
async function crawlPage(url, storage) {
  try {
    const html = await fetchHTMLWithPuppeteer(url);
    const formattedHTML = reformatPage(html, url);
    const fileName = url.replace(/[^a-zA-Z0-9]/g, '_') + '.html';

    if (fileExistsInMega(storage, fileName)) {
      console.log(`⏩ Skipped (already exists): ${fileName}`);
      return;
    }

    const filePath = saveLocally(fileName, formattedHTML);
    await uploadToMega(storage, filePath, fileName);
    console.log(`📤 Uploaded: ${fileName}`);
  } catch (err) {
    console.error(`❌ Error crawling ${url}:`, err.message);
  }
}

// Entry point
export async function runCrawler() {
  const seedUrls = [
    'https://example.com/',
    'https://www.iana.org/domains/example',
    'https://www.iana.org/',
    'https://www.iana.org/about'
  ];

  const storage = await loginToMega();

  for (const url of seedUrls) {
    await crawlPage(url, storage);
  }

  storage.close();
  console.log('✅ Crawl complete.');
}
