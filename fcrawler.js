import axios from 'axios';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, unlinkSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 🔐 pCloud login credentials
const PCLOUD_USER = 'thefcooperation@gmail.com';
const PCLOUD_PASS = 'Onyedika';

let authToken = null;

async function loginToPCloud() {
  const res = await axios.get('https://api.pcloud.com/login', {
    params: {
      getauth: 1,
      username: PCLOUD_USER,
      password: PCLOUD_PASS
    }
  });

  if (res.data.result === 0) {
    authToken = res.data.auth;
    console.log('✅ Logged into pCloud');
  } else {
    throw new Error('❌ Failed to log into pCloud: ' + res.data.error);
  }
}

async function obeyRobotsTxt(url) {
  const base = new URL(url).origin;
  try {
    const res = await axios.get(`${base}/robots.txt`);
    const parser = robotsParser(`${base}/robots.txt`, res.data);
    const isAllowed = parser.isAllowed(url, '*');
    const delay = parser.getCrawlDelay('*') || 1;
    return { isAllowed, delay };
  } catch {
    return { isAllowed: true, delay: 1 };
  }
}

async function uploadToPCloud(filePath, remoteName) {
  const form = new FormData();
  form.append('auth', authToken);
  form.append('filename', fs.createReadStream(filePath));
  form.append('folderid', 0); // Root folder

  try {
    const res = await axios.post('https://api.pcloud.com/uploadfile', form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    console.log(`📤 Uploaded to pCloud: ${remoteName}`);
  } catch (err) {
    console.log(`❌ Upload failed: ${remoteName}`);
  }
}

async function savePageAsHTML(url, $) {
  const pageTitle = $('title').text().replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
  const fileName = `${pageTitle || 'page'}.html`;
  const folderPath = path.join(__dirname, 'output');
  mkdirSync(folderPath, { recursive: true });

  const content = $.html();
  const filePath = path.join(folderPath, fileName);
  writeFileSync(filePath, content, 'utf8');
  return filePath;
}

async function crawlSite(startUrl) {
  await loginToPCloud();

  const visited = new Set();
  const queue = [startUrl];
  let pageCount = 0;

  while (queue.length && pageCount < 10) {
    const url = queue.shift();
    if (visited.has(url)) continue;

    const { isAllowed, delay } = await obeyRobotsTxt(url);
    if (!isAllowed) {
      console.log(`⛔ Blocked by robots.txt: ${url}`);
      continue;
    }

    try {
      console.log(`📄 Crawling: ${url}`);
      const res = await axios.get(url);
      const $ = cheerio.load(res.data);

      const filePath = await savePageAsHTML(url, $);
      await uploadToPCloud(filePath, path.basename(filePath));
      unlinkSync(filePath);

      // Extract links for future crawl
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('#')) {
          try {
            const absUrl = new URL(href, url).href;
            if (!visited.has(absUrl)) queue.push(absUrl);
          } catch {}
        }
      });

      visited.add(url);
      pageCount++;
      await new Promise(r => setTimeout(r, delay * 1000));
    } catch (err) {
      console.log(`❌ Error crawling ${url}:`, err.message);
    }
  }

  console.log('✅ Crawling complete.');
}
export { crawlSite };
