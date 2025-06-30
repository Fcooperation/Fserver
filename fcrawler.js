// ✅ Full Fcrawler with block-format crawling, MEGA upload, thumbnails

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

// 🔐 MEGA logins by content type
const MEGA_ACCOUNTS = {
  text: { email: 'thefcooperation@gmail.com', password: '*Onyedika2009*' },
  images: { email: 'fprojectimages@gmail.com', password: '*Onyedika2009*' },
  docs: { email: 'fproject0000009@gmail.com', password: 'Onyedika' },
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 🧠 Respect robots.txt
async function getRobotsData(url) {
  try {
    const robotsUrl = new URL('/robots.txt', url).href;
    const res = await axios.get(robotsUrl);
    const robots = robotsParser(robotsUrl, res.data);
    return {
      parser: robots,
      delay: robots.getCrawlDelay('fcrawler') || 2000,
    };
  } catch {
    return { parser: { isAllowed: () => true }, delay: 2000 };
  }
}

// ☁️ Upload file to correct MEGA account
async function uploadToMega({ filename, filePath, fileSize, type }) {
  const { email, password } = MEGA_ACCOUNTS[type];
  return new Promise((resolve, reject) => {
    const storage = new Storage({ email, password });

    storage.on('ready', () => {
      const exists = Object.values(storage.files).some(f => f.name === filename);
      if (exists) {
        console.log(`⏩ Skipped (already exists): ${filename}`);
        return resolve();
      }

      const stream = fs.createReadStream(filePath);
      const upload = storage.upload({ name: filename, size: fileSize }, stream);

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

// 🖼️ Download and upload image
async function handleImage(src, baseUrl) {
  try {
    const url = new URL(src, baseUrl).href;
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const filename = path.basename(url.split('?')[0]);
    const filePath = path.join(crawledDir, filename);

    fs.writeFileSync(filePath, buffer);
    const fileSize = fs.statSync(filePath).size;

    console.log(`🖼️ Downloaded image: ${filename}`);
    await uploadToMega({ filename, filePath, fileSize, type: 'images' });
  } catch {
    console.warn(`⚠️ Image failed: ${src}`);
  }
}

// 🧱 Generate HTML block thumbnail for docs
function generateDocThumbnail(fileUrl) {
  const filename = path.basename(fileUrl.split('?')[0]);
  const ext = filename.split('.').pop().toLowerCase();
  const icon = ext === 'pdf' ? '📄' : ext === 'zip' ? '🗜️' : '📁';

  return `
    <div style="border:1px solid #ccc;padding:8px;margin:6px;width:300px;">
      ${icon} <a href="${fileUrl}" target="_blank" style="text-decoration:none;">${filename}</a>
    </div>
  `;
}

// 🌐 Crawl a single page in block format
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

    let docThumbnails = '';
    const docLinks = [];

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && /\.(pdf|zip|docx?|pptx?|rar)$/i.test(href)) {
        const fullUrl = new URL(href, url).href;
        docThumbnails += generateDocThumbnail(fullUrl);
        docLinks.push(fullUrl);
      }
    });

    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) handleImage(src, url);
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>${title}</title></head>
      <body>
        ${$('body').html()}
        <hr/>
        <h3>📎 Document Thumbnails</h3>
        ${docThumbnails}
      </body>
      </html>`;

    fs.writeFileSync(filePath, htmlContent, 'utf-8');
    const fileSize = fs.statSync(filePath).size;
    const fileSizeKB = (fileSize / 1024).toFixed(2);
    console.log(`📏 File size: ${fileSizeKB} KB`);

    await uploadToMega({ filename, filePath, fileSize, type: 'text' });

    if (docThumbnails) {
      const thumbFile = path.join(crawledDir, 'thumb_' + filename);
      fs.writeFileSync(thumbFile, docThumbnails, 'utf-8');
      const thumbSize = fs.statSync(thumbFile).size;
      await uploadToMega({ filename: 'thumb_' + filename, filePath: thumbFile, fileSize: thumbSize, type: 'docs' });
    }

    const entry = {
      url,
      title,
      filename,
      text: $('body').text().trim().slice(0, 500)
    };

    let index = [];
    if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath));
    index.push(entry);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

    const links = $('a[href]')
      .map((_, el) => $(el).attr('href'))
      .get()
      .map(link => {
        try {
          return new URL(link, url).href;
        } catch {
          return null;
        }
      })
      .filter(href => href && href.startsWith('http'));

    for (const link of links) {
      await sleep(crawlDelay);
      await crawlPage(link, robots, crawlDelay, pageCount);
    }
  } catch (err) {
    console.warn(`❌ Error crawling ${url}: ${err.message}`);
  }
}

// 🚀 Entry point
export async function crawlSite(startUrl) {
  if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);
  const robots = await getRobotsData(startUrl);
  await crawlPage(startUrl, robots, robots.delay);
  console.log('✅ Crawl complete.');
}
