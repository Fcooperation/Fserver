import fs from 'fs';
import axios from 'axios';
import cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import pkg from 'megajs';
import robotsParser from 'robots-parser';
import { URL } from 'url';

const { Storage } = pkg;

// ✅ HARD-CODED MEGA CREDENTIALS
const storage = new Storage({
  email: 'thefcooperation@gmail.com',
  password: 'YOUR_MEGA_PASSWORD_HERE'  // <-- replace with actual password
});

await storage.ready;

const START_URL = 'https://example.com';
const ALLOWED_DOMAINS = ['example.com'];

async function crawl(url, visited = new Set()) {
  if (visited.has(url)) return;
  visited.add(url);

  const domain = new URL(url).hostname;
  if (!ALLOWED_DOMAINS.includes(domain)) return;

  try {
    const robotsUrl = new URL('/robots.txt', url).href;
    const robotsRes = await axios.get(robotsUrl).catch(() => ({ data: '' }));
    const robots = robotsParser(robotsUrl, robotsRes.data);
    if (!robots.isAllowed(url)) return;

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const html = await page.content();
    const title = await page.title();
    const filename = `${title.replace(/[^\w]/g, '_')}.html`;

    fs.writeFileSync(filename, html);

    const file = await storage.upload({ name: filename, size: fs.statSync(filename).size }, fs.createReadStream(filename));
    console.log(`✅ Uploaded: ${file.name}`);

    const $ = cheerio.load(html);
    const links = $('a[href]').map((i, el) => $(el).attr('href')).get();

    await browser.close();

    for (const link of links) {
      try {
        const nextUrl = new URL(link, url).href;
        await crawl(nextUrl, visited);
      } catch {}
    }
  } catch (err) {
    console.error(`❌ Error at ${url}:`, err.message);
  }
}

crawl(START_URL);
