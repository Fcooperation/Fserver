// fcrawler.js
const puppeteer = require('puppeteer');

const startUrl = 'https://books.toscrape.com/';
const maxPages = 50;

(async () => {
  try {
    console.log('🚀 Launching Puppeteer...');
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    let visited = new Set();
    let toVisit = [startUrl];

    while (toVisit.length > 0 && visited.size < maxPages) {
      const currentUrl = toVisit.shift();
      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      console.log(`📘 Crawling: ${currentUrl}`);
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Extract book titles on the current page
      const books = await page.$$eval('article.product_pod h3 a', links =>
        links.map(link => ({
          title: link.getAttribute('title'),
          url: link.href
        }))
      );

      books.forEach(book => {
        console.log(`→ ${book.title} - ${book.url}`);
      });

      // Add pagination link if available
      const nextPage = await page.$eval('.next a', a => a.getAttribute('href')).catch(() => null);
      if (nextPage) {
        const nextUrl = new URL(nextPage, currentUrl).href;
        if (!visited.has(nextUrl)) toVisit.push(nextUrl);
      }
    }

    await browser.close();
    console.log('✅ Done crawling.');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
