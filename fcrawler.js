import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import { fileURLToPath } from 'url';
import http from 'http';
import sanitize from 'sanitize-filename';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// pCloud login credentials
const PCLOUD_EMAIL = 'thefcooperation@gmail.com';
const PCLOUD_PASSWORD = 'Onyedika';

let accessToken = '';
const uploadQueue = [];

// Log into pCloud
async function loginToPCloud() {
  const res = await axios.get('https://api.pcloud.com/login', {
    params: {
      getauth: 1,
      username: PCLOUD_EMAIL,
      password: PCLOUD_PASSWORD
    }
  });

  if (res.data.result !== 0) {
    throw new Error('❌ Failed to log into pCloud: ' + res.data.error);
  }

  accessToken = res.data.auth;
  console.log('✅ Logged into pCloud.');
}

// Get or create a folder
async function getFolderId(folderName, parentFolderId = 0) {
  const res = await axios.get('https://api.pcloud.com/listfolder', {
    params: {
      auth: accessToken,
      folderid: parentFolderId
    }
  });

  const folder = res.data.metadata.contents?.find(
    f => f.name === folderName && f.isfolder
  );
  if (folder) return folder.folderid;

  const createRes = await axios.get('https://api.pcloud.com/createfolder', {
    params: {
      auth: accessToken,
      name: folderName,
      folderid: parentFolderId
    }
  });

  return createRes.data.metadata.folderid;
}

// Check if file already exists
async function fileExistsInPCloud(folderId, filename) {
  const res = await axios.get('https://api.pcloud.com/listfolder', {
    params: {
      auth: accessToken,
      folderid: folderId
    }
  });

  return res.data.metadata.contents?.some(f => f.name === filename) ?? false;
}

// Upload a file to pCloud
async function uploadToPCloud(filePath, folderId) {
  const filename = path.basename(filePath);
  const exists = await fileExistsInPCloud(folderId, filename);
  if (exists) {
    console.log('⏭️ Skipping already uploaded:', filename);
    return;
  }

  const sizeMB = (await fs.stat(filePath)).size / (1024 * 1024);
  console.log(`📦 Preparing to upload: ${filename} (${sizeMB.toFixed(2)} MB)`);

  const formData = new FormData();
  formData.append('auth', accessToken);
  formData.append('folderid', folderId);
  formData.append('filename', fs.createReadStream(filePath));

  const res = await axios.post('https://api.pcloud.com/uploadfile', formData, {
    headers: formData.getHeaders()
  });

  if (res.data.result === 0) {
    console.log('✅ Uploaded to pCloud:', filename);
  } else {
    console.error('❌ Upload failed:', res.data);
  }
}

// Rebuild links in HTML
function rebuildHtml($, url) {
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#')) return;

    const fullHref = href.startsWith('http') ? href : new URL(href, url).href;
    const sanitizedLocal = sanitize(fullHref).replace(/[:\/?=&]/g, '_') + '.html';

    $(el).attr('href', `/fweb/${sanitizedLocal}`);
    $(el).attr('data-fallback', fullHref);
  });
  return $.html();
}

// Crawl a single page
async function crawlPage(url, siteFolderId) {
  try {
    if (url.includes('login') || url.includes('signup')) {
      console.log('🚫 Skipping login/signup page:', url);
      return;
    }

    try {
      const robotsTxt = await axios.get(new URL('/robots.txt', url).href);
      if (robotsTxt.data.includes('Disallow: /')) {
        console.log('⚠️ robots.txt disallows:', url);
        return;
      }
    } catch {
      console.log('⚠️ No robots.txt found, continuing...');
    }

    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data);

    const html = rebuildHtml($, url);
    const filename = sanitize(url).replace(/[:\/?=&]/g, '_') + '.html';
    const localPath = path.join(__dirname, 'temp', filename);
    await fs.outputFile(localPath, html);
    uploadQueue.push({ path: localPath, folderId: siteFolderId });

    const text = $('body').text().replace(/\s+/g, ' ').trim();
    const sentences = text.split(/[.!?]/).filter(Boolean).map(s => s.trim()).slice(0, 30);
    const txtName = filename.replace('.html', '_sentences.txt');
    const txtPath = path.join(__dirname, 'temp', txtName);
    await fs.outputFile(txtPath, sentences.join('\n'));
    uploadQueue.push({ path: txtPath, folderId: siteFolderId });

    console.log('📄 Crawled:', url);
  } catch (err) {
    console.error('❌ Error crawling', url, err.message);
  }
}

// Upload worker (60 sec delay)
async function uploadWorker() {
  while (true) {
    if (uploadQueue.length > 0) {
      const file = uploadQueue.shift();
      try {
        await uploadToPCloud(file.path, file.folderId);
        await fs.remove(file.path);
      } catch (e) {
        console.error('❌ Upload failed:', e.message);
      }
    }
    await new Promise(res => setTimeout(res, 60000)); // wait 60 sec
  }
}

// Start crawling a site
async function crawlSite(url) {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const folderId = await getFolderId(hostname);
  await crawlPage(url, folderId);
}

// HTTP Interface
http.createServer((req, res) => {
  if (req.url.startsWith('/crawl?url=')) {
    const url = decodeURIComponent(req.url.split('=')[1]);
    crawlSite(url);
    res.end('✅ Crawling started: ' + url);
  } else {
    res.end('🌐 Fcrawler is live');
  }
}).listen(10000, () => {
  console.log('🚀 Server running on http://localhost:10000/');
});

// Init
await loginToPCloud();
uploadWorker();
