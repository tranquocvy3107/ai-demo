import { webSearchDDGTool } from '../src/modules/ai/tools/web-search-gg.tool';

async function run() {
  const result = await webSearchDDGTool.invoke({
    query: 'affeliate program',
    numResults: 5,
    mode: 'domain',
    onlyUniqueDomain: true,
    includeSubdomain: false,
  });

  console.log('RESULT:\n', result);
}

run().catch(console.error);
