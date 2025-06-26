import fs from 'fs';
import path from 'path';
import axios from 'axios';
import puppeteer from 'puppeteer';
import cheerio from 'cheerio';
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

async function connectMega() {
  return new Promise((resolve, reject) => {
    const storage = new Storage({
      email: megaEmail,
      password: megaPassword
    });
    storage.on('ready', () => resolve(storage));
    storage.on('error', err => reject(err));
    storage.login();
  });
}

async function fileExistsOnMega(storage, filename) {
  return storage.files.some(file => file.name === filename);
}

async function crawlPage(url, robots, crawlDelay, pageCount = { count: 0 }, storage, browser) {
  if (pageCount.count >= MAX_PAGES || visited.has(url)) return;
  if (!robots.parser.isAllowed(url, 'fcrawler')) return;

  visited.add(url);
  pageCount.count++;
  console.log(`📄 Crawling: ${url}`);

  try {
    const page = await browser.newPage();
    await page.goto(url, { timeout: 15000, waitUntil: 'networkidle2' });
    const html = await page.content();
    const $ = cheerio.load(html);

    const title = $('title').text().trim() || 'untitled';
    const filename = title.replace(/[^\w]/g, '_').slice(0, 50) + '.html';
    const filePath = path.join(crawledDir, filename);

    if (await fileExistsOnMega(storage, filename)) {
      console.log(`⏩ Skipped (already exists): ${filename}`);
      await page.close();
      return;
    }

    fs.writeFileSync(filePath, html, 'utf-8');

    const screenshotPath = path.join(crawledDir, filename.replace('.html', '.png'));
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await page.close();

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

    // Upload HTML
    const htmlStream = fs.createReadStream(filePath);
    const htmlUpload = storage.upload(filename, html.length);
    htmlStream.pipe(htmlUpload);
    htmlUpload.complete.then(() => {
      console.log(`📤 Uploaded: ${filename}`);
    });

    // Upload Screenshot
    const ssStream = fs.createReadStream(screenshotPath);
    const ssUpload = storage.upload(filename.replace('.html', '.png'), fs.statSync(screenshotPath).size);
    ssStream.pipe(ssUpload);
    ssUpload.complete.then(() => {
      console.log(`🖼️ Uploaded screenshot: ${filename.replace('.html', '.png')}`);
    });

    // Crawl next links
    const links = $('a[href]')
      .map((_, el) => $(el).attr('href'))
      .get()
      .map(link => new URL(link, url).href)
      .filter(href => href.startsWith('http'));

    for (const link of links) {
      await sleep(crawlDelay);
      await crawlPage(link, robots, crawlDelay, pageCount, storage, browser);
    }

  } catch (err) {
    console.warn(`❌ Error crawling ${url}: ${err.message}`);
  }
}

export async function crawlSite(startUrl) {
  if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);
  const robots = await getRobotsData(startUrl);
  const storage = await connectMega();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  await crawlPage(startUrl, robots, robots.delay, { count: 0 }, storage, browser);
  await browser.close();
  console.log('✅ Crawl complete. Search index saved.');
}
