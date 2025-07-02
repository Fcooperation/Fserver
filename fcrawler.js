import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';
import mime from 'mime-types';
import { fileURLToPath } from 'url';
import http from 'http';
import { parse } from 'node-html-parser';
import sanitize from 'sanitize-filename';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// pCloud login (hardcoded)
const PCLOUD_EMAIL = 'thefcooperation@gmail.com';
const PCLOUD_PASSWORD = 'Onyedika';

let accessToken = '';
const uploadQueue = [];

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

async function getFolderId(folderName, parentFolderId = 0) {
  const res = await axios.get('https://api.pcloud.com/listfolder', {
    params: {
      auth: accessToken,
      folderid: parentFolderId
    }
  });
  const folder = res.data.metadata.contents?.find(f => f.name === folderName && f.isfolder);
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

async function fileExistsInPCloud(folderId, filename) {
  const res = await axios.get('https://api.pcloud.com/listfolder', {
    params: {
      auth: accessToken,
      folderid: folderId
    }
  });
  return res.data.metadata.contents?.some(f => f.name === filename) ?? false;
}

async function uploadToPCloud(filePath, folderId) {
  const filename = path.basename(filePath);
  const exists = await fileExistsInPCloud(folderId, filename);
  if (exists) {
    console.log('⏭️ Skipping already uploaded:', filename);
    return;
  }

  const formData = new FormData();
  formData.append('auth', accessToken);
  formData.append('folderid', folderId);
  formData.append('filename', fs.createReadStream(filePath));

  const res = await axios.post('https://api.pcloud.com/uploadfile', formData, {
    headers: formData.getHeaders()
  });

  console.log('✅ Uploaded to pCloud:', filename);
}

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

async function crawlPage(url, siteFolderId) {
  try {
    const robotsTxt = await axios.get(new URL('/robots.txt', url).href);
    if (robotsTxt.data.includes('Disallow: /')) {
      console.log('⚠️ Robots.txt disallows crawling:', url);
      return;
    }
  } catch (e) {}

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
    await new Promise(res => setTimeout(res, 60000)); // 60 sec
  }
}

async function crawlSite(url) {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const folderId = await getFolderId(hostname);
  await crawlPage(url, folderId);
}

// Web interface
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

// Start
await loginToPCloud();
uploadWorker(); // keep uploading every 60 sec
