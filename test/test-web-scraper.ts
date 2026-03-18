import { webScraperTool } from '../src/modules/ai';

async function testRealSite() {
  console.log('\n===== TEST REAL SITE =====');
  const result = await webScraperTool.invoke({
    url: 'https://www.thegioididong.com/',
    extractLinks: true,
  });
  console.log(result);
}

async function runAll() {
  try {
    await testRealSite();
  } catch (err) {
    console.error('TEST ERROR:', err);
  }
}

runAll();
