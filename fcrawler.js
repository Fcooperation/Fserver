import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import robotsParser from 'robots-parser';
import { URL } from 'url';

const visited = new Set();
const maxPages = 10;
const agent = 'fcrawler';

async function getRobotsInfo(baseURL) {
  try {
    const robotsUrl = new URL('/robots.txt', baseURL).href;
    const res = await axios.get(robotsUrl, { timeout: 5000 });
    const robots = robotsParser(robotsUrl, res.data);
    return { robots, crawlDelay: 0 }; // crawl-delay not parsed by robots-parser
  } catch {
    return { robots: null, crawlDelay: 0 };
  }
}

function sanitizeFilename(url) {
  return url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 100);
}

async function saveHtml(url, html) {
  const filename = sanitizeFilename(url) + '.html';
  const filepath = path.join('crawled', filename);
  await fs.mkdir('crawled', { recursive: true });
  await fs.writeFile(filepath, html);
  return filename;
}

async function updateSearchIndex({ url, title, filename }) {
  const filePath = 'crawled/search_index.json';
  let index = [];
  try {
    const existing = await fs.readFile(filePath, 'utf-8');
    index = JSON.parse(existing);
  } catch {}
  index.push({ url, title, filename });
  await fs.writeFile(filePath, JSON.stringify(index, null, 2));
}

async function crawlPage(url, robots, depth = 0) {
  if (visited.has(url) || visited.size >= maxPages) return;
  if (robots && !robots.isAllowed(url, agent)) return;

  visited.add(url);
  console.log(`🔍 Crawling: ${url}`);

  try {
    const res = await axios.get(url, { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const title = $('title').text() || url;

    // Save HTML content
    const filename = await saveHtml(url, $.html());
    await updateSearchIndex({ url, title, filename });

    // Extract links
    const links = new Set();
    $('a[href]').each((_, el) => {
      const link = $(el).attr('href');
      try {
        const absolute = new URL(link, url).href;
        if (absolute.startsWith('http')) {
          links.add(absolute);
        }
      } catch {}
    });

    for (const link of links) {
      await crawlPage(link, robots, depth + 1);
    }
  } catch (err) {
    console.warn(`❌ Failed to crawl ${url}: ${err.message}`);
  }
}

export async function crawlAndSave(startUrl) {
  const base = new URL(startUrl).origin;
  const { robots, crawlDelay } = await getRobotsInfo(base);

  await crawlPage(startUrl, robots);
  console.log('✅ Crawl complete. Search index saved.');
}
