import fs from 'fs';

const indexHtml = fs.readFileSync('dist/index.html', 'utf8');
const editorHtml = fs.readFileSync('dist/pdf-editor/index.html', 'utf8');

function inspect(name, html) {
  console.log('=== ' + name + ' ===');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const ogSiteName = html.match(/<meta property="og:site_name" content="([^"]+)"/)?.[1];
  const jsonLd = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  
  console.log('Title:', title);
  console.log('Description:', desc);
  console.log('Canonical:', canonical);
  console.log('OG Site Name:', ogSiteName);
  console.log('JSON-LD count:', jsonLd.length);
  jsonLd.forEach((ld, i) => {
    try {
      const parsed = JSON.parse(ld.trim());
      console.log(`JSON-LD #${i+1} Type:`, parsed['@type'], '| Context:', parsed['@context']);
      console.log('  Details:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(`JSON-LD #${i+1} raw:`, ld.trim().slice(0, 80));
    }
  });
}

inspect('HOMEPAGE', indexHtml);
inspect('PDF EDITOR', editorHtml);
