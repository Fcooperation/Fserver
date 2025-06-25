import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import robotsParser from 'robots-parser';
import { URL } from 'url';

const MAX_PAGES = 10;
const visited = new Set();
const searchIndex = [];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRobots(url) {
  try {
    const robotsUrl = new URL('/robots.txt', url).href;
    const res = await axios.get(robotsUrl);
    return robotsParser(robotsUrl, res.data);
  } catch {
    return robotsParser('', ''); // Allow all if no robots
  }
}

async function crawlPage(url, userAgent) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': userAgent }
    });

    const $ = cheerio.load(res.data);
    const title = $('title').text() || 'untitled';
    const body = $('body').html() || '';
    const filename = `crawled/${Buffer.from(url).toString('hex')}.html`;

    fs.writeFileSync(filename, `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`);

    searchIndex.push({ url, title, filename, text: $('body').text().slice(0, 500) });

    const links = [];
    $('a[href]').each((_, a) => {
      let link = $(a).attr('href');
      try {
        link = new URL(link, url).href;
        if (!visited.has(link)) links.push(link);
      } catch {}
    });

    return links;
  } catch (err) {
    console.warn(`❌ Failed to crawl ${url}: ${err.message}`);
    return [];
  }
}

export async function crawlWebsite(startUrl, userAgent = 'fcrawler') {
  const robots = await getRobots(startUrl);
  const queue = [startUrl];
  visited.add(startUrl);

  if (!fs.existsSync('crawled')) fs.mkdirSync('crawled');

  while (queue.length && visited.size < MAX_PAGES) {
    const url = queue.shift();

    if (!robots.isAllowed(url, userAgent)) {
      console.log(`⛔ Blocked by robots.txt: ${url}`);
      continue;
    }

    const delay = robots.getCrawlDelay(userAgent) || 1;
    console.log(`⏳ Waiting ${delay}s before crawling ${url}`);
    await sleep(delay * 1000);

    const foundLinks = await crawlPage(url, userAgent);
    for (const link of foundLinks) {
      if (!visited.has(link)) {
        queue.push(link);
        visited.add(link);
      }
    }
  }

  fs.writeFileSync('search_index.json', JSON.stringify(searchIndex, null, 2));
  console.log('✅ Crawl complete. Search index saved.');
}
