// fcrawler.js
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
    console.log(`✅ ${url} is ${isAllowed ? 'ALLOWED' : 'BLOCKED'} for ${userAgent}`);

    const sitemaps = robots.getSitemaps();
    if (sitemaps.length > 0) {
      console.log(`📦 Found ${sitemaps.length} sitemap(s):`);
      for (const sitemap of sitemaps) {
        console.log(`🔗 ${sitemap}`);
        await parseSitemap(sitemap);
      }
    } else {
      console.log(`ℹ️ No sitemap found in robots.txt`);
    }

  } catch (err) {
    console.error(`❌ Failed to check robots.txt or sitemap`);
    console.error(err.message);
  }
}

async function parseSitemap(sitemapUrl) {
  try {
    const res = await axios.get(sitemapUrl);
    const xml = res.data;

    const result = await xml2js.parseStringPromise(xml);
    const urls = result.urlset?.url || [];

    console.log(`🌐 URLs found in sitemap:`);
    urls.forEach(entry => {
      if (entry.loc && entry.loc[0]) {
        console.log(`→ ${entry.loc[0]}`);
      }
    });
  } catch (err) {
    console.error(`❌ Error parsing sitemap: ${sitemapUrl}`);
    console.error(err.message);
  }
}

module.exports = { testRobots };
