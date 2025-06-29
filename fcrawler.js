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

const txtMega = { email: 'thefcooperation@gmail.com', password: '*Onyedika2009*' };
const imgMega = { email: 'fprojectimages@gmail.com', password: '*Onyedika2009*' };

// Utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get robots.txt
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

// Upload file to specific MEGA account
async function uploadToMegaIfNotExists(filename, filePath, fileSize, isImage = false) {
  return new Promise((resolve, reject) => {
    const creds = isImage ? imgMega : txtMega;
    const storage = new Storage({ email: creds.email, password: creds.password });

    storage.on('ready', () => {
      const exists = Object.values(storage.files).some(file => file.name === filename);
      if (exists) {
        console.log(`⏩ Skipped (already exists): ${filename}`);
        return resolve();
      }

      const readStream = fs.createReadStream(filePath);
      const upload = storage.upload({ name: filename, size: fileSize }, readStream);

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

// Download and upload image
async function downloadImage(url, baseUrl) {
  try {
    const fullUrl = new URL(url, baseUrl).href;
    const name = path.basename(new URL(fullUrl).pathname);
    const imgPath = path.join(crawledDir, name);

    if (fs.existsSync(imgPath)) {
      console.log(`⏩ Skipped (already exists): ${name}`);
      return;
    }

    const res = await axios.get(fullUrl, { responseType: 'arraybuffer', timeout: 10000 });
    fs.writeFileSync(imgPath, res.data);
    const size = fs.statSync(imgPath).size;
    console.log(`🖼️ Downloaded image: ${name} (${(size / 1024).toFixed(2)} KB)`);

    await uploadToMegaIfNotExists(name, imgPath, size, true);
  } catch (err) {
    console.warn(`⚠️ Image error: ${url} - ${err.message}`);
  }
}

// Crawl a page
async function crawlPage(url, robots, delay, count = { num: 0 }) {
  if (count.num >= MAX_PAGES || visited.has(url)) return;
  if (!robots.parser.isAllowed(url, 'fcrawler')) return;

  visited.add(url);
  count.num++;
  console.log(`📄 Crawling: ${url}`);

  try {
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data, { decodeEntities: false });

    const title = $('title').text().trim() || 'untitled';
    const safeTitle = title.replace(/[^\w]/g, '_').slice(0, 50);
    const filename = `${safeTitle}.html`;
    const filePath = path.join(crawledDir, filename);
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body>${$('body').html()}</body></html>`;

    fs.writeFileSync(filePath, htmlContent, 'utf-8');
    const size = fs.statSync(filePath).size;
    console.log(`📏 File size: ${(size / 1024).toFixed(2)} KB`);

    // Sentence text
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

    await uploadToMegaIfNotExists(filename, filePath, size);

    const imageUrls = $('img').map((_, el) => $(el).attr('src')).get();
    for (const img of imageUrls) {
      await downloadImage(img, url);
    }

    const links = $('a[href]').map((_, el) => $(el).attr('href')).get()
      .map(link => new URL(link, url).href).filter(href => href.startsWith('http'));

    for (const link of links) {
      await sleep(delay);
      await crawlPage(link, robots, delay, count);
    }
  } catch (err) {
    console.warn(`❌ Page error: ${url} - ${err.message}`);
  }
}

// Exported start
export async function crawlSite(startUrl) {
  if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);
  const robots = await getRobotsData(startUrl);
  await crawlPage(startUrl, robots, robots.delay);
  console.log('✅ Crawl complete.');
}
