// fcrawler.js
const puppeteer = require('puppeteer');

(async () => {
  console.log("Launching Puppeteer...");

  const browser = await puppeteer.launch({
    headless: true, // headless mode (no GUI)
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // required for Render
  });

  const page = await browser.newPage();
  await page.goto('https://example.com');

  const title = await page.title();
  console.log("Page title is:", title);

  await browser.close();
})();
