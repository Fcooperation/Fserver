const axios = require('axios');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');

const MAX_PAGES = 10;
const visited = new Set();
const searchIndex = [];

async function fetchRobots(origin, userAgent = 'fcrawler') {
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const res = await axios.get(robotsUrl, { timeout: 5000 });
    return robotsParser(robotsUrl, res.data);
  } catch {
    return robotsParser('', ''); // allow all by default
  }
}

async function obeyCrawlDelay(robots, userAgent) {
  const delay = robots.getCrawlDelay(userAgent);
  if (delay) {
    console.log(`⏳ Waiting ${delay}s per robots.txt...`);
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
  }
}

async function saveHtml(url, html) {
  const filename = `${visited.size}.html`;
  const fullPath = path.join(__dirname, 'crawled');
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath);

  const filePath = path.join(fullPath, filename);
  fs.writeFileSync(filePath, html);

  const $ = cheerio.load(html);
  searchIndex.push({
    url,
    title: $('title').text(),
    filename
  });

  console.log(`💾 Saved: ${url} → ${filename}`);
}

async function crawlPage(url, userAgent = 'fcrawler') {
  if (visited.size >= MAX_PAGES || visited.has(url)) return;
  visited.add(url);

  try {
    const { origin } = new URL(url);
    const robots = await fetchRobots(origin, userAgent);

    if (!robots.isAllowed(url, userAgent)) {
      console.log(`⛔ BLOCKED by robots.txt: ${url}`);
      return;
    }

    await obeyCrawlDelay(robots, userAgent);

    const res = await axios.get(url, { timeout: 10000 });
    const html = res.data;
    await saveHtml(url, html);

    const $ = cheerio.load(html);
    const links = $('a[href]')
      .map((i, el) => $(el).attr('href'))
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
      if (visited.size >= MAX_PAGES) break;
      await crawlPage(link, userAgent);
    }
  } catch (err) {
    console.log(`❌ Failed to crawl ${url}: ${err.message}`);
  }
}

async function parseSitemaps(startUrl) {
  try {
    const { origin } = new URL(startUrl);
    const robots = await fetchRobots(origin);
    const sitemaps = robots.getSitemaps();

    const urls = [];

    for (const sitemap of sitemaps) {
      const res = await axios.get(sitemap, { timeout: 10000 });
      const result = await xml2js.parseStringPromise(res.data);
      const locs = result.urlset?.url || [];
      locs.forEach(entry => {
        if (entry.loc && entry.loc[0]) urls.push(entry.loc[0]);
      });
    }

    console.log(`🗺️ Sitemap provided ${urls.length} starting URLs`);

    for (const link of urls) {
      if (visited.size >= MAX_PAGES) break;
      await crawlPage(link);
    }

    fs.writeFileSync('search_index.json', JSON.stringify(searchIndex, null, 2));
    console.log(`📄 Wrote search_index.json`);
  } catch (err) {
    console.error(`❌ Failed to parse sitemap: ${err.message}`);
  }
}

// 👇 Start from here
parseSitemaps('https://www.google.com');
