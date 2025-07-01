import axios from 'axios';
import * as cheerio from 'cheerio';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const SHARED_FOLDER_ID = '1P5emItPagoPMRUhnp1gfDuCo13ntWawv';

const auth = new JWT({
  email: 'fprojecttext@fvideo-storage.iam.gserviceaccount.com',
  key: `-----BEGIN PRIVATE KEY-----
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
  scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });

function sanitizeFilename(url) {
  return url.replace(/[^a-z0-9]/gi, '_').substring(0, 100) + '.html';
}

async function uploadToDrive(filename, content) {
  const fileMetadata = {
    name: filename,
    parents: [SHARED_FOLDER_ID],
  };
  const media = {
    mimeType: 'text/html',
    body: Buffer.from(content, 'utf-8'),
  };

  try {
    await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
    console.log(`📤 Uploaded: ${filename}`);
  } catch (err) {
    console.error('❌ Drive upload failed:', err.message);
  }
}

async function crawlSite(url, visited = new Set()) {
  if (visited.has(url)) return;
  visited.add(url);
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data);

    const rebuilt = [];
    $('body').children().each((i, el) => {
      const tag = $(el).get(0).tagName;
      if (tag === 'img') {
        const src = $(el).attr('src');
        if (src) console.log('📷 Image detected:', src);
      } else if (tag === 'a' && $(el).attr('href')) {
        const href = new URL($(el).attr('href'), url).href;
        if (!visited.has(href) && href.startsWith('http')) {
          crawlSite(href, visited);
        }
      } else {
        rebuilt.push($.html(el));
      }
    });

    const rebuiltHtml = `<html><body>${rebuilt.join('\n')}</body></html>`;
    const filename = sanitizeFilename(url);
    await uploadToDrive(filename, rebuiltHtml);
  } catch (err) {
    console.log('⚠️ Error crawling', url, err.message);
  }
}

export { crawlSite };
