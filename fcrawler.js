const axios = require('axios');
const robotsParser = require('robots-parser');
const xml2js = require('xml2js');

async function testRobots(url = 'https://www.google.com/search', userAgent = 'fcrawler') {
  try {
    const { origin } = new URL(url);
    const robotsUrl = `${origin}/robots.txt`;

    const res = await axios.get(robotsUrl);
    const robots = robotsParser(robotsUrl, res.data);

    const isAllowed = robots.isAllowed(url, userAgent);
    const delay = robots.getCrawlDelay(userAgent);

    console.log(`✅ ${url} is ${isAllowed ? 'ALLOWED' : 'BLOCKED'} for ${userAgent}`);

    if (delay) {
      console.log(`⏳ Respecting crawl-delay of ${delay} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    const sitemaps = robots.getSitemaps();
    if (sitemaps.length > 0) {
      console.log(`📦 Found ${sitemaps.length} sitemap(s):`);
      for (const sitemap of sitemaps) {
        console.log(`🔗 ${sitemap}`);
        await parseSitemap(sitemap, delay);
      }
    } else {
      console.log(`ℹ️ No sitemap found in robots.txt`);
    }

  } catch (err) {
    console.error(`❌ Failed to check robots.txt or sitemap`);
    console.error(err.message);
  }
}

async function parseSitemap(sitemapUrl, delay = 0) {
  try {
    const res = await axios.get(sitemapUrl);
    const xml = res.data;

    const result = await xml2js.parseStringPromise(xml);
    const urls = result.urlset?.url || [];

    console.log(`🌐 URLs found in sitemap:`);

    for (const entry of urls) {
      if (entry.loc && entry.loc[0]) {
        console.log(`→ ${entry.loc[0]}`);
        if (delay) {
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
      }
    }

  } catch (err) {
    console.error(`❌ Error parsing sitemap: ${sitemapUrl}`);
    console.error(err.message);
  }
}

module.exports = { testRobots };
