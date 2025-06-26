import axios from 'axios';
import cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import robotsParser from 'robots-parser';
import { Storage } from 'megajs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const megaEmail = 'thefcooperation@gmail.com';
const megaPassword = '*Onyedika2009*'; // Hardcoded as requested

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, 'uploads');

const startUrl = 'https://example.com/';
const visited = new Set();

async function initMega() {
  return new Promise((resolve, reject) => {
    const storage = new Storage({ email: megaEmail, password: megaPassword });
    storage.on('ready', () => resolve(storage));
    storage.on('error', reject);
    storage.login();
  });
}

async function pageExistsInMega(storage, fileName) {
  return storage.root.children.some(file => file.name === fileName);
}

function sanitizeFileName(title) {
  return title.replace(/[^a-z0-9]/gi, '_').substring(0, 100) + '.html';
}

async function crawlPage(url, storage) {
  if (visited.has(url)) return;
  visited.add(url);

  try {
    const robotsUrl = new URL('/robots.txt', url).href;
    const { data: robotsTxt } = await axios.get(robotsUrl).catch(() => ({ data: '' }));
    const robots = robotsParser(robotsUrl, robotsTxt);
    if (!robots.isAllowed(url, '*')) return;

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const html = await page.content();
    const $ = cheerio.load(html);
    const title = $('title').text().trim() || 'Untitled';
    const fileName = sanitizeFileName(title);

    if (await pageExistsInMega(storage, fileName)) {
      console.log(`⏩ Skipped (already exists): ${fileName}`);
      await browser.close();
      return;
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, fileName);
    await fs.writeFile(filePath, html);
    const fileStream = await fs.readFile(filePath);

    storage.root.upload(fileName, fileStream).on('complete', () => {
      console.log(`📤 Uploaded: ${fileName}`);
    });

    await browser.close();

    // Crawl more links (limited depth here to avoid infinite loop)
    const links = $('a[href]')
      .map((_, el) => new URL($(el).attr('href'), url).href)
      .get()
      .filter(link => link.startsWith('http') && !visited.has(link));

    for (const link of links.slice(0, 3)) {
      await crawlPage(link, storage);
    }

  } catch (err) {
    console.error(`❌ Error crawling ${url}:`, err.message);
  }
}

const start = async () => {
  const storage = await initMega();
  await crawlPage(startUrl, storage);
};

start();
