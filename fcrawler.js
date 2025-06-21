const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

(async () => {
  let browser = null;

  try {
    console.log("🚀 Launching Puppeteer");

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });

    const title = await page.title();
    console.log('✅ Title:', title);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
})();
