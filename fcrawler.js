import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mega = require('megajs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hardcoded credentials
const email = 'thefcooperation@gmail.com';
const password = '*Onyedika2009*'; // 🔒 Replace this with real MEGA password

export async function crawlSite(startUrl) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const html = await page.content();
  const title = await page.title();
  const safeTitle = title.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_');
  const filename = `${safeTitle}.html`;
  const fullPath = path.join(__dirname, filename);
  await fs.writeFile(fullPath, html);
  console.log(`Saved: ${filename}`);

  await uploadToMega(fullPath, filename);
  await browser.close();
}

async function uploadToMega(localPath, filename) {
  const stream = require('fs').createReadStream(localPath);

  const storage = mega({ email, password });
  await new Promise((resolve, reject) => {
    storage.login(err => {
      if (err) return reject(err);
      resolve();
    });
  });

  const upload = storage.upload(filename);
  stream.pipe(upload);

  upload.on('complete', file => {
    console.log('Uploaded to MEGA:', file.name);
  });

  upload.on('error', err => {
    console.error('Upload failed:', err);
  });
}
