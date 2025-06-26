import puppeteer from 'puppeteer-core';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import mega from 'megajs';

// Hardcoded credentials (YOU control this account)
const megaEmail = 'thefcooperation@gmail.com';
const megaPassword = 'your_password_here'; // Change to your real password

export async function crawlSite(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  console.log(`🌐 Visiting: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2' });

  const html = await page.content();
  const filename = `page-${Date.now()}.html`;
  const filepath = path.join(os.tmpdir(), filename);
  await fs.writeFile(filepath, html, 'utf8');
  console.log(`📄 Saved HTML to ${filepath}`);

  // Upload to MEGA
  const storage = mega({ email: megaEmail, password: megaPassword });
  await new Promise((resolve, reject) => storage.login(err => (err ? reject(err) : resolve())));

  const upload = storage.upload(filename, fs.createReadStream(filepath));
  upload.on('complete', file => {
    console.log(`✅ Uploaded to MEGA: ${file.name}`);
  });
  upload.on('error', console.error);

  await new Promise(resolve => upload.on('complete', resolve));

  await browser.close();
}
