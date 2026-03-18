// test/test-parse-html-tool.ts
import fs from 'fs';
import path from 'path';
import { parseHtmlToStructuredTool } from '../src/modules/ai/tools/html-to-rsm-json.tool';

async function testTool() {
  const htmlFilePath = path.join(__dirname, 'sample.html');

  if (!fs.existsSync(htmlFilePath)) {
    console.error('❌ sample.html không tồn tại trong thư mục test');
    process.exit(1);
  }

  const html = fs.readFileSync(htmlFilePath, 'utf-8');
  const url = 'https://www.thegioididong.com/';

  // Gọi tool bằng .call()
  const result = await parseHtmlToStructuredTool.call({ html, url });

  // In kết quả JSON
  console.log(JSON.stringify(result, null, 2));

  // In thống kê nhanh
  const data = JSON.parse(result);
  console.log(
    `\n✅ Links: ${data.links.length}, Products: ${data.products.length}, Texts: ${data.texts.length}`,
  );
}

testTool().catch((err) => {
  console.error('❌ Test lỗi:', err);
});
