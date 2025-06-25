import axios from 'axios';
import cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { parseSitemapsFromRobots } from 'sitemap';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

const visited = new Set();
const searchIndex = [];
const MAX_PAGES = 10;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getRobotsTxt(url) {
  try {
    const robotsUrl = new URL('/robots.txt', url).href;
    const res = await axios.get(robotsUrl, { timeout: 5000 });
    return robotsParser(robotsUrl, res.data);
  } catch {
    return robotsParser('', '');
  }
}

async function getCrawlDelay(robots, userAgent = 'fcrawler') {
  const delay = robots.getCrawlDelay(userAgent);
  return (delay || 1) * 1000;
}

async function fetchAndSavePage(url) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data);

    const title = $('title').text() || 'Untitled';
    const filename = `${encodeURIComponent(url).slice(0, 50)}.html`;
    const filepath = path.join('crawled', filename);

    await fs.mkdir('crawled', { recursive: true });
    await fs.writeFile(filepath, $.html(), 'utf8');

    searchIndex.push({ url, title, filename });
    console.log(`✅ Saved: ${url}`);
  } catch (err) {
    console.log(`❌ Error crawling ${url}: ${err.message}`);
  }
}

async function crawlLinks($, baseUrl, robots, delayMs) {
  const links = new Set();
  $('a[href]').each((_, el) => {
    let link = $(el).attr('href');
    if (!link) return;
    try {
      const fullUrl = new URL(link, baseUrl).href;
      if (!visited.has(fullUrl) && robots.isAllowed(fullUrl, 'fcrawler')) {
        links.add(fullUrl);
      }
    } catch {}
  });

  for (const link of links) {
    if (visited.size >= MAX_PAGES) return;
    visited.add(link);
    await delay(delayMs);
    await crawlPage(link);
  }
}

async function crawlPage(url) {
  try {
    const robots = await getRobotsTxt(url);
    const delayMs = await getCrawlDelay(robots, 'fcrawler');

    if (!robots.isAllowed(url, 'fcrawler')) {
      console.log(`🚫 Disallowed by robots.txt: ${url}`);
      return;
    }

    await delay(delayMs);
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data);
    await fetchAndSavePage(url);
    await crawlLinks($, url, robots, delayMs);
  } catch (err) {
    console.log(`⚠️ Failed to crawl ${url}: ${err.message}`);
  }
}

export async function crawlSite(startUrl) {
  visited.clear();
  searchIndex.length = 0;

  const robots = await getRobotsTxt(startUrl);
  const delayMs = await getCrawlDelay(robots, 'fcrawler');
  const sitemaps = robots.getSitemaps();

  if (sitemaps.length) {
    console.log(`🗺️ Found ${sitemaps.length} sitemap(s)`);
    for (const sitemapUrl of sitemaps) {
      try {
        const res = await axios.get(sitemapUrl, { timeout: 10000 });
        const urls = await parseSitemapsFromRobots(res.data);

        for (const pageUrl of urls) {
          if (visited.size >= MAX_PAGES) break;
          if (!visited.has(pageUrl) && robots.isAllowed(pageUrl, 'fcrawler')) {
            visited.add(pageUrl);
            await delay(delayMs);
            await crawlPage(pageUrl);
          }
        }
      } catch (err) {
        console.log(`⚠️ Sitemap error: ${err.message}`);
      }
    }
  } else {
    await crawlPage(startUrl);
  }

  await fs.writeFile(
    'crawled/search_index.json',
    JSON.stringify(searchIndex, null, 2)
  );
  console.log('✅ Crawl complete. Search index saved.');
}
