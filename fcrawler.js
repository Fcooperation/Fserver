import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { parse as parseRobots } from 'robots-txt-parse';
import * as cheerio from 'cheerio';
import { URL } from 'url';

// Ensure "crawled" folder exists
const crawledDir = path.join(process.cwd(), 'crawled');
if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);

// Normalize and deduplicate
const visited = new Set();
const searchIndex = [];

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRobotsInfo(baseURL) {
  try {
    const robotsUrl = new URL('/robots.txt', baseURL).href;
    const res = await axios.get(robotsUrl);
    const parsed = parseRobots(res.data);
    const delay = parsed.crawlDelay?.['fcrawler'] ?? parsed.crawlDelay?.['*'] ?? 0;
    return { disallow: parsed.disallow, crawlDelay: delay * 1000 }; // Convert to ms
  } catch (err) {
    return { disallow: [], crawlDelay: 0 };
  }
}

function isAllowed(urlPath, disallowRules) {
  return !disallowRules.some(rule => urlPath.startsWith(rule));
}

async function getSitemapUrls(baseURL) {
  try {
    const robotsUrl = new URL('/robots.txt', baseURL).href;
    const res = await axios.get(robotsUrl);
    const sitemapLines = res.data.split('\n').filter(l => l.toLowerCase().startsWith('sitemap:'));
    const urls = [];

    for (const line of sitemapLines) {
      const sitemapUrl = line.split(':')[1].trim();
      const xml = await axios.get(sitemapUrl);
      const $ = cheerio.load(xml.data, { xmlMode: true });
      $('url > loc').each((_, el) => urls.push($(el).text()));
    }

    return urls;
  } catch (e) {
    return []; // Fallback: no sitemaps
  }
}

async function crawl(url, baseURL, disallowRules, crawlDelay, depth = 0, maxDepth = 10) {
  if (visited.has(url) || depth > maxDepth) return;
  const urlObj = new URL(url);

  if (!isAllowed(urlObj.pathname, disallowRules)) return;

  console.log(`🔎 Crawling: ${url}`);
  visited.add(url);
  await wait(crawlDelay); // obey crawl delay

  try {
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data);

    const title = $('title').text() || 'No Title';
    const filename = `page_${visited.size}.html`;
    const filepath = path.join(crawledDir, filename);
    fs.writeFileSync(filepath, $.html());

    searchIndex.push({
      url,
      title,
      filename
    });

    // Extract all internal + external links
    const links = [];
    $('a[href]').each((_, el) => {
      let href = $(el).attr('href');
      if (href.startsWith('/')) href = new URL(href, baseURL).href;
      else if (!href.startsWith('http')) return;

      try {
        const newURL = new URL(href);
        links.push(newURL.href);
      } catch (_) {}
    });

    for (const link of links) {
      await crawl(link, baseURL, disallowRules, crawlDelay, depth + 1, maxDepth);
    }
  } catch (err) {
    console.warn(`⚠️ Failed to crawl ${url}: ${err.message}`);
  }
}

export async function runCrawler(startUrl) {
  const baseURL = new URL(startUrl).origin;
  const { disallow, crawlDelay } = await getRobotsInfo(baseURL);
  const sitemapUrls = await getSitemapUrls(baseURL);

  const urlsToCrawl = sitemapUrls.length > 0 ? sitemapUrls.slice(0, 10) : [startUrl];

  for (const url of urlsToCrawl) {
    await crawl(url, baseURL, disallow, crawlDelay);
  }

  // Save index
  fs.writeFileSync(
    path.join(crawledDir, 'search_index.json'),
    JSON.stringify(searchIndex, null, 2)
  );

  console.log('✅ Crawl complete. Search index saved.');
}
