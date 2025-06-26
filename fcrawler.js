import axios from 'axios';
import cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import puppeteer from 'puppeteer-core';
import { URL } from 'url';
import fs from 'fs/promises';
import { storage } from 'megajs';

const MEGA_EMAIL = 'thefcooperation@gmail.com';
const MEGA_PASSWORD = '*Onyedika2009*';
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

// Login to MEGA
async function connectToMega() {
  return new Promise((resolve, reject) => {
    const mega = storage({ email: MEGA_EMAIL, password: MEGA_PASSWORD }, err => {
      if (err) reject(err);
      else resolve(mega);
    });
  });
}

// Check if a file already exists on MEGA
async function fileExists(mega, name) {
  return new Promise(resolve => {
    let found = false;
    mega.root.children.forEach(file => {
      if (file.name === name) found = true;
    });
    resolve(found);
  });
}

// Download and save screenshot with Puppeteer
async function captureScreenshot(url, filename) {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.setViewport({ width: 1280, height: 800 });

  const screenshotPath = `/tmp/${filename}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });

  await browser.close();
  return screenshotPath;
}

// Crawl a single page
async function crawlPage(url, mega) {
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);
    const title = $('title').text().trim() || 'Untitled';
    const blocks = [];

    $('body').children().each((i, el) => {
      blocks.push($.html(el));
    });

    const safeTitle = title.replace(/[^a-z0-9]/gi, '_').slice(0, 50);
    const filename = `${safeTitle}.html`;

    const exists = await fileExists(mega, filename);
    if (exists) {
      console.log(`⏩ Skipped (already exists): ${filename}`);
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="UTF-8"><title>${title}</title></head>
        <body>${blocks.join('\n')}</body>
      </html>`;

    const htmlPath = `/tmp/${filename}`;
    await fs.writeFile(htmlPath, htmlContent);

    // Upload .html file
    const upload1 = mega.root.upload(htmlPath, filename);
    upload1.complete = () => console.log(`📤 Uploaded: ${filename}`);

    // Screenshot
    const thumbPath = await captureScreenshot(url, safeTitle);
    const upload2 = mega.root.upload(thumbPath, `${safeTitle}_thumb.png`);
    upload2.complete = () => console.log(`🖼️ Uploaded thumbnail: ${safeTitle}_thumb.png`);
  } catch (err) {
    console.error(`❌ Error crawling ${url}: ${err.message}`);
  }
}

// Example use
const START_URLS = [
  'https://example.com',
  'https://www.iana.org/domains/example'
];

const mega = await connectToMega();
for (const url of START_URLS) {
  await crawlPage(url, mega);
}
