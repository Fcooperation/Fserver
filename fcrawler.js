import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const crawledDir = path.join(__dirname, 'crawled');
const indexPath = path.join(crawledDir, 'search_index.json');
const visited = new Set();
const MAX_PAGES = 10;

// === GOOGLE DRIVE SETUP ===
const FOLDER_ID = '1P5emItPagoPMRUhnp1gfDuCo13ntWawv';
const auth = new google.auth.GoogleAuth({
  credentials: {
    type: 'service_account',
    project_id: 'fvideo-storage',
    private_key_id: 'bfee408f7119fdaa45844420f0e2a1dc2f91523d',
    private_key: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDAG//EzgU79Kfg
U+0xKway6SKAz+q4EZARPU7geZ5RPdBmOW8J968umMB5YLIV4kArCMt1H0mZgmm8
a5KuBXislWzGIdiTXpr2JFvsPrKgEDu6L7gP90KXrmLZ3Uo/1SHDE/WSgwUP13EU
ro7V2XVytZfAsTJn0rTui6louOecHIrBVqXXncH89AbLYwtDEHLfF0LGHShiWG7W
AgLJj10+wThROHBH8GaEnSNnpfo5pJ9f+txVc45Zf76XNZX+G+d53XZUMvcFuzBH
34iPvcDbFzFrJW5nchu6aSZHPvcSzUT1nzc8/S3JxdvKGi07Dd2lHbM7C8sH5TVP
OI6cSfxRAgMBAAECggEAEmBbRfsjGwobKOU+Ui64dFLCvymkXTko281Oh0B6+XB9
R9oEmiJ8OmvYNYQfZOKAmt07gReeFbYY4TI1FLpnQbMFdap1KhupnRP7SwzwT0le
PUAlTjmrwBCpWgfF+3cqxJtbKUmpKUvFgGH2PdSQXImsW31XwgCw2AS6Ds9pMFCM
LDsocqhsndtUdVZxwxxyHZ5GYURNWgQ7NoiU2GymStq/R71LTzyoFMAyw4md4aBH
1FjTfMkxuFnVVuv6qtWTfWuVkHAromdOCzRsSnOpDCUVagkwZMJAVEHpbZhJ9uoQ
lwipmjcjh0hTbqKWTnREsMJ7w1AC+/QVdTXab/405QKBgQDmUdG1BdR4MZnEgHk7
3YdMjmWzfZtvRJ6YXFgx4JMZdOm02iSHy7Ep9dgVvce6iW6hLhTyRyglLtR/18Fg
38sLsuDuGRbGNyYobB86aXRahdLDxXJlX81eDDylOZ3895m3piI5nOJ/hI3fHj2w
cnnvJ+XKO9YPP7xl9lUUpYezkwKBgQDVh4RsRhePNC4vJ3jFvJbcezqF81YLWLW+
rXOchHfYffea4pM7e6LICU6G1ZZ7qpGmngEzC5zGqJWId3KCWL31bB+m0OgprZbZ
nISqKGmEZW7VfOuoNc1zYRDe/vCAnHyLwTSvbgJaYFbzxU0deI6TgXVOUaqs4NJN
hJxvuGrHCwKBgDkoROqvr7LEXGyvlWaN623MSODqYxCR7unQwPJf0SGYKgd/u2EX
47eOEzoSBub8BEBrtzcJAaV4obO4T31DDJiyo69y+nvmY8nUS0urr/xnCY8cCO+v
fr/AOaynR9XnfHZe/E9f57XNp4efcZ/ASRJYzGYLw2u1XYPQRf0Bt1ORAoGAIXbm
ow1tHc1gu5UlEWBYCF/rsRiM0KRrf2Gxr8L3AV/kkUqXJohe35jNzMXmmqUFxKYY
rAZS4LOFE+kcch80TiVO5Jby+60v6hTkmcJRnyVCdITqbedYto9s1HYB/TYJMuHp
vuCvz7gviG7QgiDlv2pXlxmndQabDvkMh1nQqjcCgYEAnT9ZV15sXwZEVL8k7zUL
JFB0T9hVvtfFRtVQrkO9iUe2z+Tr0PxkUCQF4Fm/qvnwbLtIJN8OjtfxwRVELif3
kRKzpPzbwLMpnjeu8Q7krOrUAA878Gj179nuqkLulj0zuPyW3GPLdj50+F1jXOUh
dccWKCxeR84FyDT0yfBTMgE=
-----END PRIVATE KEY-----`,
    client_email: 'fprojecttext@fvideo-storage.iam.gserviceaccount.com',
    client_id: '109374060354568163586',
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// === GOOGLE DRIVE UPLOADER ===
async function uploadToDrive(name, content) {
  try {
    const fileMetadata = {
      name,
      parents: [FOLDER_ID],
    };
    const media = {
      mimeType: 'text/html',
      body: content,
    };
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id',
    });
    console.log(`📤 Uploaded to Drive: ${name}`);
  } catch (err) {
    console.error(`❌ Drive upload failed: ${err.message}`);
  }
}

async function crawlPage(url, pageCount = { count: 0 }) {
  if (pageCount.count >= MAX_PAGES || visited.has(url)) return;
  visited.add(url);
  pageCount.count++;
  console.log(`📄 Crawling: ${url}`);

  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data, { decodeEntities: false });

    const title = $('title').text().trim() || 'untitled';
    const filename = title.replace(/[^\w]/g, '_').slice(0, 50) + '.html';

    // DETECT IMAGES & DOCS
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        const full = new URL(src, url).href;
        console.log(`📷 Image detected: ${full}`);
      }
    });

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && /\.(pdf|docx?|zip|pptx?|mp3)$/i.test(href)) {
        const full = new URL(href, url).href;
        console.log(`📎 Document detected: ${full}`);
      }
    });

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${title}</title></head>
<body>
${$('body').html()}
</body>
</html>`;

    await uploadToDrive(filename, html);

    const entry = {
      url,
      title,
      filename,
      text: $('body').text().trim().slice(0, 500),
    };
    if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);
    let index = [];
    if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath));
    index.push(entry);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

    const links = $('a[href]')
      .map((_, el) => $(el).attr('href'))
      .get()
      .map(link => new URL(link, url).href)
      .filter(href => href.startsWith('http'));

    for (const link of links) {
      await crawlPage(link, pageCount);
    }
  } catch (err) {
    console.warn(`❌ Error crawling ${url}: ${err.message}`);
  }
}

export async function crawlSite(startUrl) {
  await crawlPage(startUrl);
  console.log('✅ Crawl complete.');
}
