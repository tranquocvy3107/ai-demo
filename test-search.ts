import { webSearchTool } from './src/modules/ai/tools/web-search.tool';

async function main() {
  const result = await webSearchTool.invoke({ query: 'nest js framework best practices', numResults: 5 });
  console.log('Result:');
  console.log(result);
}

main().catch(console.error);
