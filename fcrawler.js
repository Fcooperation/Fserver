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

const megaEmail = 'thefcooperation@gmail.com';
const megaPassword = '*Onyedika2009*';

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

async function uploadToMegaIfNotExists(filename, filePath, fileSize) {
  return new Promise((resolve, reject) => {
    const storage = new Storage({ email: megaEmail, password: megaPassword });

    storage.on('ready', async () => {
      const files = Object.values(storage.files);
      const exists = files.some(file => file.name === filename);

      if (exists) {
        console.log(`⏩ Skipped (already exists): ${filename}`);
        return resolve();
      }

      const uploadWithRetry = async (attempt = 1) => {
        const readStream = fs.createReadStream(filePath);
        const upload = storage.upload({ name: filename, size: fileSize }, readStream);

        upload.on('complete', () => {
          console.log(`📤 Uploaded: ${filename}`);
          resolve();
        });

        upload.on('error', async (err) => {
          if (err.message.includes('EAGAIN') && attempt < 5) {
            const delay = 2000 * attempt;
            console.warn(`⚠️ Retry ${attempt}/5 after EAGAIN: ${filename} (${delay}ms)`);
            await sleep(delay);
            uploadWithRetry(attempt + 1);
          } else {
            console.error(`❌ Upload error: ${err.message}`);
            reject(err);
          }
        });
      };

      await sleep(2000); // Prevent rate-limit hammering
      uploadWithRetry();
    });

    storage.on('error', err => {
      console.error(`❌ MEGA login failed: ${err.message}`);
      reject(err);
    });

    storage.login();
  });
}

async function downloadImages($, url, pageFolder) {
  const images = $('img').map((_, el) => $(el).attr('src')).get();
  const downloaded = [];

  for (let src of images) {
    if (!src) continue;
    try {
      const imgUrl = new URL(src, url).href;
      const filename = path.basename(imgUrl).split('?')[0];
      const savePath = path.join(pageFolder, filename);

      const res = await axios.get(imgUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(savePath, res.data);
      downloaded.push(filename);
      console.log(`🖼️ Downloaded image: ${filename} (${(res.data.length / 1024).toFixed(2)} KB)`);
    } catch (err) {
      console.warn(`⚠️ Failed image: ${src}`);
    }
  }
  return downloaded;
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

    const pageFolder = crawledDir; // no separate folder for now

    await downloadImages($, url, pageFolder);

    const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${title}</title></head>
<body>${$('body').html()}</body></html>`;

    fs.writeFileSync(filePath, htmlContent, 'utf-8');

    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fileSizeKB = (fileSize / 1024).toFixed(2);
    console.log(`📏 File size: ${fileSizeKB} KB`);

    const sentences = $('body').text()
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 10);

    const entry = {
      url,
      title,
      filename,
      sentences
    };

    let index = [];
    if (fs.existsSync(indexPath)) {
      index = JSON.parse(fs.readFileSync(indexPath));
    }
    index.push(entry);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

    await uploadToMegaIfNotExists(filename, filePath, fileSize);

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
