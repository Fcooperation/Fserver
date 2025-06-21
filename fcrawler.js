// fcrawler.js
const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

(async () => {
  console.log("Launching headless browser...");

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });

  const page = await browser.newPage();
  await page.goto('https://example.com');

  const title = await page.title();
  console.log("Page title is:", title);

  await browser.close();
})();
