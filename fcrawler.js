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

// MEGA accounts
const megaAccounts = {
  text: { email: 'thefcooperation@gmail.com', password: '*Onyedika2009*' },
  images: { email: 'fprojectimages@gmail.com', password: '*Onyedika2009*' },
  docs: { email: 'fprojectdocuments@gmail.com', password: '*Onyedika2009*' }
};

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

function uploadToMegaIfNotExists(filename, filePath, type = 'text') {
  const { email, password } = megaAccounts[type];

  return new Promise((resolve, reject) => {
    const storage = new Storage({ email, password });

    storage.on('ready', () => {
      const exists = Object.values(storage.files).some(f => f.name === filename);
      if (exists) {
        console.log(`⏩ Skipped (already exists): ${filename}`);
        return resolve();
      }

      const stream = fs.createReadStream(filePath);
      const upload = storage.upload({ name: filename }, stream);

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

async function downloadImage(url, baseUrl) {
  try {
    const imageUrl = new URL(url, baseUrl).href;
    const name = path.basename(imageUrl.split('?')[0]);
    const filePath = path.join(crawledDir, name);

    if (fs.existsSync(filePath)) {
      console.log(`⏩ Skipped (already exists): ${name}`);
      return;
    }

    const res = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(filePath, res.data);
    console.log(`🖼️ Downloaded image: ${name}`);

    await uploadToMegaIfNotExists(name, filePath, 'images');
  } catch (err) {
    console.warn(`❌ Image download failed: ${url} (${err.message})`);
  }
}

function isDocumentLink(href) {
  return /\.(pdf|docx?|pptx?|zip|rar|xls|xlsx|mp3)$/i.test(href);
}

function getDocIcon(file) {
  const ext = file.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄', doc: '📄', docx: '📄',
    xls: '📊', xlsx: '📊',
    ppt: '📽️', pptx: '📽️',
    zip: '🗜️', rar: '🗜️',
    mp3: '🎵'
  };
  return icons[ext] || '📁';
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

    let docBoxes = '';
    $('a[href]').each((_, el) => {
      const link = $(el).attr('href');
      if (isDocumentLink(link)) {
        const docName = path.basename(link.split('?')[0]);
        const icon = getDocIcon(docName);
        const fullUrl = new URL(link, url).href;

        docBoxes += `
          <div style="margin:10px;padding:10px;border:1px solid #ccc;display:flex;align-items:center;">
            <span style="font-size:24px;margin-right:10px">${icon}</span>
            <a href="${fullUrl}" target="_blank">${docName}</a>
          </div>`;
      }
    });

    const images = $('img').map((_, el) => $(el).attr('src')).get();
    for (const img of images) {
      await downloadImage(img, url);
    }

    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body>
    ${$('body').html()}\n${docBoxes}</body></html>`;
    fs.writeFileSync(filePath, htmlContent, 'utf-8');

    const fileSize = fs.statSync(filePath).size;
    console.log(`📏 File size: ${(fileSize / 1024).toFixed(2)} KB`);

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

    await uploadToMegaIfNotExists(filename, filePath, docBoxes ? 'docs' : 'text');

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
