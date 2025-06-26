import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { Storage } from 'megajs';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Hardcoded MEGA credentials (you said it's fine)
const megaEmail = 'thefcooperation@gmail.com';
const megaPassword = 'YOUR_PASSWORD_HERE'; // 🔐 Replace with real password

// Set up MEGA session
async function loginToMega() {
  return new Promise((resolve, reject) => {
    const storage = new Storage({
      email: megaEmail,
      password: megaPassword,
      autoload: true
    });

    storage.on('ready', () => resolve(storage));
    storage.on('error', reject);
  });
}

// Crawl with Puppeteer
async function crawlPage(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  const html = await page.content();
  await browser.close();
  return html;
}

// Extract title, text, and images
function extractContent(html, url) {
  const $ = cheerio.load(html);
  const title = $('title').text() || 'untitled';
  const blocks = [];

  $('body').children().each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    const outer = $.html(el).trim();
    if (outer) blocks.push(outer);
  });

  const fullContent = `
    <html><head><meta charset="utf-8"><title>${title}</title></head>
    <body>${blocks.join('\n')}</body></html>
  `;

  return { title, html: fullContent, url };
}

// Save file locally
async function saveHTML(content, filename) {
  const filePath = path.join(__dirname, filename);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

// Upload to MEGA
async function uploadToMega(storage, filePath, fileName) {
  const fileData = await fs.readFile(filePath);
  const file = storage.root.upload(fileName, fileData.length, err => {
    if (err) console.error('Upload error:', err);
  });

  file.write(fileData);
  file.end();
}

// MAIN FLOW
(async () => {
  const startUrl = 'https://www.google.com/search?q=site:gov.uk+climate'; // Example query

  try {
    const storage = await loginToMega();
    const html = await crawlPage(startUrl);
    const { title, html: pageContent } = extractContent(html, startUrl);

    const safeName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 60);
    const filename = `${safeName || 'page'}.html`;
    const filePath = await saveHTML(pageContent, filename);

    console.log(`✅ Saved ${filename}, now uploading to MEGA...`);
    await uploadToMega(storage, filePath, filename);
    console.log('🚀 Upload complete!');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
