import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import mega from 'megajs';

const META_EMAIL = 'thefcooperation@gmail.com';
const META_PASSWORD = 'your_password_here'; // hardcoded as requested

function loginToMega() {
  return new Promise((resolve, reject) => {
    const storage = mega({ email: META_EMAIL, password: META_PASSWORD });
    storage.on('ready', () => resolve(storage));
    storage.on('error', reject);
  });
}

async function crawlPage(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  const title = await page.title();
  const html = await page.content();

  await browser.close();
  return { html, title };
}

function extractContent(html, url) {
  return {
    html,
    title: `Snapshot of ${url}`
  };
}

async function saveHTML(html, filename) {
  const fullPath = path.join('/tmp', filename);
  await fs.writeFile(fullPath, html);
  return fullPath;
}

async function uploadToMega(storage, filePath, filename) {
  const up = storage.upload({ name: filename });
  const data = await fs.readFile(filePath);
  up.end(data);
  return new Promise((resolve, reject) => {
    up.on('complete', resolve);
    up.on('error', reject);
  });
}

export async function crawlSite() {
  const startUrl = 'https://www.google.com/search?q=site:gov.uk+climate';

  const storage = await loginToMega();
  const { title, html } = await crawlPage(startUrl);
  const { html: finalHtml } = extractContent(html, startUrl);

  const safeName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 60);
  const filename = `${safeName || 'page'}.html`;
  const filePath = await saveHTML(finalHtml, filename);

  console.log(`✅ Saved ${filename}, uploading to MEGA...`);
  await uploadToMega(storage, filePath, filename);
  console.log('🚀 Upload complete!');
}
