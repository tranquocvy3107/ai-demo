import { webSearchGGTool } from '../src/modules/ai';

async function runTest() {
  try {
    const input = {
      query: 'affeliate program',
      numResults: 5,
      mode: 'both' as const,
      onlyUniqueDomain: true,
      includeSubdomain: false,
    };

    console.log('🚀 Running webSearchTool...\n');

    const result = await webSearchGGTool.invoke(input);

    console.log('📦 RAW RESULT:\n');
    console.log(result);

    console.log('\n📊 PARSED RESULT:\n');
    const parsed = JSON.parse(result as string);

    parsed.results.forEach((r: any, i: number) => {
      console.log(`${i + 1}. ${r.title}`);
      console.log(`   url: ${r.url}`);
      console.log(`   domain: ${r.domain}\n`);
    });
  } catch (err) {
    console.error('❌ Test error:', err);
  }
}

runTest();

// giữ process sống để browser không auto đóng
setInterval(() => {}, 1000);
