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
    return robotsParser('', ''); // Allow all if robots.txt fails
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
  const dir = path.join(__dirname, 'crawled');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  fs.writeFileSync(path.join(dir, filename), html);
  const $ = cheerio.load(html);

  searchIndex.push({
    url,
    title: $('title').text(),
    filename,
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
      console.log(`⛔ Blocked by robots.txt: ${url}`);
      return;
    }

    await obeyCrawlDelay(robots, userAgent);

    const res = await axios.get(url, { timeout: 10000 });
    await saveHtml(url, res.data);

    const $ = cheerio.load(res.data);
    const links = $('a')
      .map((i, el) => $(el).attr('href'))
      .get()
      .filter(link => link && link.startsWith('http'));

    for (const link of links) {
      if (visited.size >= MAX_PAGES) break;
      await crawlPage(link, userAgent);
    }
  } catch (err) {
    console.log(`⚠️ Failed to crawl: ${url} - ${err.message}`);
  }
}

async function parseSitemaps(siteUrl) {
  try {
    const origin = new URL(siteUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;

    const robotsRes = await axios.get(robotsUrl, { timeout: 5000 });
    const robots = robotsParser(robotsUrl, robotsRes.data);

    const sitemaps = robots.getSitemaps();
    if (sitemaps.length === 0) {
      console.log('⚠️ No sitemaps found. Crawling homepage only...');
      await crawlPage(siteUrl);
    } else {
      for (const sitemapUrl of sitemaps) {
        try {
          const sitemapRes = await axios.get(sitemapUrl, { timeout: 10000 });
          const parsed = await xml2js.parseStringPromise(sitemapRes.data);

          const urls = parsed.urlset?.url?.map(u => u.loc[0]) || [];

          for (const u of urls) {
            if (visited.size >= MAX_PAGES) break;
            await crawlPage(u);
          }
        } catch (err) {
          console.log(`⚠️ Failed to parse sitemap: ${sitemapUrl}`);
        }
      }
    }

    // Save search index
    fs.writeFileSync(path.join(__dirname, 'crawled', 'search_index.json'), JSON.stringify(searchIndex, null, 2));
    console.log('✅ Crawl complete. Search index saved.');
  } catch (err) {
    console.log(`❌ Error during sitemap parsing: ${err.message}`);
  }
}

module.exports = { parseSitemaps };
