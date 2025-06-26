import axios from 'axios';
import robotsParser from 'robots-parser';
import * as cheerio from 'cheerio';

export async function checkAndCrawlSite(siteUrl) {
  try {
    // Step 1: Fetch robots.txt
    const robotsUrl = new URL('/robots.txt', siteUrl).href;
    console.log(`📡 Checking robots.txt at: ${robotsUrl}`);

    let parser;
    let obeyRules = true;

    try {
      const res = await axios.get(robotsUrl, { timeout: 5000 });
      parser = robotsParser(robotsUrl, res.data);
      console.log('✅ robots.txt found and parsed');
    } catch (err) {
      console.warn('⚠️ robots.txt not found or error: allowing all');
      obeyRules = false;
      parser = {
        isAllowed: () => true // allow everything
      };
    }

    // Step 2: Fetch homepage HTML
    const htmlRes = await axios.get(siteUrl);
    const $ = cheerio.load(htmlRes.data);

    // Step 3: Extract all anchor links
    const links = new Set();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      try {
        const fullUrl = new URL(href, siteUrl).href;
        links.add(fullUrl);
      } catch {
        // Skip bad URLs
      }
    });

    // Step 4: Filter links based on robots.txt
    const allowedLinks = [];
    for (const link of links) {
      if (!obeyRules || parser.isAllowed(link, '*')) {
        allowedLinks.push(link);
      }
    }

    // Step 5: Output
    console.log(`🔗 Found ${links.size} total links`);
    console.log(`✅ ${allowedLinks.length} allowed by robots.txt`);
    allowedLinks.forEach(link => console.log('➡️', link));

  } catch (err) {
    console.error('❌ Error during crawl:', err.message);
  }
}
