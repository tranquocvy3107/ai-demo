const { chromium } = require('playwright');
const { readFileSync, existsSync, writeFileSync } = require('fs');
const { join } = require('path');

function loadSemrushCookie() {
  const txtPath = join(process.cwd(), 'src', 'config', 'cookie-semrush.txt');
  if (existsSync(txtPath)) {
    return readFileSync(txtPath, 'utf8').trim();
  }
  return null;
}

function parseCookieString(cookieStr) {
  return cookieStr.split(';').map(pair => {
    const [name, ...rest] = pair.trim().split('=');
    return {
      name: name.trim(),
      value: rest.join('='),
      domain: '.semrush.com',
      path: '/',
    };
  }).filter(c => c.name && c.value !== undefined);
}

(async () => {
  const domain = process.argv[2] || 'firecrawl.dev';
  const cookieStr = loadSemrushCookie();
  if (!cookieStr) {
    console.error('No cookie');
    process.exit(1);
  }

  const cookies = parseCookieString(cookieStr);
  console.log(`[test] Parsed ${cookies.length} cookies`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
  });

  await context.addCookies(cookies);

  // Intercept XHR/fetch calls to see what APIs the page uses
  const apiCalls = [];
  const page = await context.newPage();
  
  page.on('response', async (response) => {
    const request = response.request();
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('json') || url.includes('/api/') || url.includes('rpc')) {
      const status = response.status();
      let body = '';
      try {
        body = await response.text();
        if (body.length > 2000) body = body.substring(0, 2000) + '...';
      } catch {}

      const postData = request.postData() || '';
      apiCalls.push({ 
        url, 
        status, 
        contentType: ct, 
        responseBody: body, 
        requestBody: postData 
      });
      console.log(`[XHR] ${status} ${url.substring(0, 200)}`);
    }
  });

  const targetUrl = `https://www.semrush.com/analytics/overview/?fid=11064728&q=${encodeURIComponent(domain)}&searchType=domain&protocol=https`;
  console.log(`[test] Navigating to: ${targetUrl}`);

  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('[test] Page loaded');

  // Wait a bit more for async data
  await page.waitForTimeout(5000);

  // Try to extract visible text data
  const pageText = await page.evaluate(() => {
    // Look for specific data containers
    const result = {};
    
    // Authority Score
    const asElements = document.querySelectorAll('[data-test="authority-score"], [class*="authority"], [class*="AuthorityScore"]');
    if (asElements.length) {
      result.authorityScoreElements = Array.from(asElements).map(el => el.textContent?.trim());
    }

    // Get all text that contains numbers and relevant keywords
    const bodyText = document.body.innerText;
    
    // Find sections with traffic data
    const sections = bodyText.split('\n').filter(line => {
      const lower = line.toLowerCase();
      return (lower.includes('organic') || lower.includes('paid') || lower.includes('authority') || 
              lower.includes('traffic') || lower.includes('keyword') || lower.includes('backlink') ||
              lower.includes('visit')) && /\d/.test(line);
    });
    result.relevantLines = sections.slice(0, 30);

    // Get title
    result.title = document.title;

    return result;
  });

  console.log('\n[test] Page title:', pageText.title);
  console.log('\n[test] Relevant lines:');
  (pageText.relevantLines || []).forEach(l => console.log(`  ${l}`));
  if (pageText.authorityScoreElements) {
    console.log('\n[test] Authority Score elements:', pageText.authorityScoreElements);
  }

  // Save API calls
  console.log(`\n[test] Captured ${apiCalls.length} API/JSON responses:`);
  for (const call of apiCalls) {
    console.log(`\n  URL: ${call.url.substring(0, 250)}`);
    console.log(`  Status: ${call.status}, CT: ${call.contentType}`);
    if (call.responseBody && !call.responseBody.startsWith('<!DOCTYPE')) {
      console.log(`  Body: ${call.responseBody.substring(0, 500)}`);
    }
  }

  writeFileSync('C:/tmp/semrush-api-calls.json', JSON.stringify(apiCalls, null, 2), 'utf8');
  console.log('\n[test] Saved API calls to C:/tmp/semrush-api-calls.json');

  await browser.close();
})();
