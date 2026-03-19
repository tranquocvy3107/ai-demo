
const fs = require('fs');
const path = require('path');
const http = require('http');

const DOCS_DIR = 'c:/Users/MAY TINH KTECH/Documents/test/ai-demo/docs';
const API_URL = 'http://localhost:3000/rag/documents';

const files = [
  { 
    name: 'ai-tools.md', 
    title: 'AI Tools Description', 
    category: 'system_config', 
    priority: 10 
  },
  { 
    name: 'ai-workflows.md', 
    title: 'AI Agent Workflows', 
    category: 'system_config', 
    priority: 20 
  }
];

async function ingest() {
  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file.name);
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${filePath}`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.stringify({
      title: file.title,
      content: content,
      category: file.category,
      priority: file.priority,
      isActive: true
    });

    console.log(`Ingesting ${file.name}...`);
    
    await new Promise((resolve, reject) => {
      const req = http.request(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          console.log(`Status: ${res.statusCode}`);
          console.log(`Response: ${body}`);
          resolve();
        });
      });

      req.on('error', (err) => {
        console.error(`Error ingesting ${file.name}: ${err.message}`);
        reject(err);
      });

      req.write(data);
      req.end();
    });
  }
}

ingest().then(() => console.log('Done!')).catch(err => console.error(err));
