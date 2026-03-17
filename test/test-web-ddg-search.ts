import { webSearchDDGTool } from '../src/modules/ai/tools/web-search-ddg.tool';

async function runTest() {
  console.log('====== START DUCKDUCKGO SEARCH TEST ======\n');

  const query = 'best affiliate programs 2026';
  const numResults = 5;

  console.log('Query:', query);

  try {
    const rawResult = await webSearchDDGTool.invoke({ query, numResults });

    console.log('\n====== RAW RESULT ======');
    console.log(rawResult);

    const parsed = JSON.parse(rawResult);

    if (parsed.results && parsed.results.length > 0) {
      console.log('\n====== PARSED RESULTS ======');
      parsed.results.forEach((r: any, i: number) => {
        console.log(`\n${i + 1}. ${r.title}`);
        console.log(`URL: ${r.url}`);
        console.log(`Snippet: ${r.snippet}`);
      });
    } else {
      console.log('\nNo results found.');
    }
  } catch (err) {
    console.error('❌ ERROR:', err);
  }

  console.log('\n====== END TEST ======');
}

runTest();
