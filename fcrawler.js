import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import mega from 'megajs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Your MEGA credentials
const email = process.env.META_EMAIL;
const password = process.env.META_PASSWORD;

const storage = mega({ email, password }, () => {
  console.log('🔐 Logged into MEGA.');
  startCrawling();
});

async function fetchWithPuppeteer(url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const html = await page.content();
  await browser.close();
  return html;
}

async function uploadToMega(filename, content) {
  return new Promise((resolve, reject) => {
    const file = storage.file(filename);
    const writeStream = file.upload();
    writeStream.end(content);
    writeStream.on('complete', () => {
      console.log(`📤 Uploaded: ${filename}`);
      resolve();
    });
    writeStream.on('error', reject);
  });
}

function sanitizeFilename(str) {
  return str.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_');
}

async function fileExistsOnMega(filename) {
  return new Promise((resolve) => {
    storage.load(() => {
      const exists = storage.children.some(file => file.name === filename);
      resolve(exists);
    });
  });
}

async function crawlPage(url) {
  try {
    console.log(`📄 Crawling: ${url}`);
    const html = await fetchWithPuppeteer(url);
    const $ = cheerio.load(html);

    const title = $('title').text().trim() || 'Untitled';
    const filename = sanitizeFilename(title) + '.html';

    if (await fileExistsOnMega(filename)) {
      console.log(`⏩ Skipped (already exists): ${filename}`);
      return;
    }

    const structuredContent = $('body').html();
    await uploadToMega(filename, structuredContent);
  } catch (err) {
    console.error(`❌ Error crawling ${url}:`, err.message);
  }
}

function startCrawling() {
  const urls = [
    'https://example.com',
    'https://www.iana.org/',
    'https://www.iana.org/domains',
    'https://www.iana.org/about'
  ];

  (async () => {
    for (const url of urls) {
      await crawlPage(url);
    }
  })();
}
