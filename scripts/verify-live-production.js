async function run() {
  const [homeResp, editorResp] = await Promise.all([
    fetch('https://pdfpage.tools/'),
    fetch('https://pdfpage.tools/pdf-editor/')
  ]);

  const homeHtml = await homeResp.text();
  const editorHtml = await editorResp.text();

  function check(name, html) {
    console.log('=== ' + name + ' ===');
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
    const ogSiteMatch = html.match(/<meta property="og:site_name" content="([^"]+)"/);

    const title = titleMatch ? titleMatch[1] : null;
    const desc = descMatch ? descMatch[1] : null;
    const canonical = canonicalMatch ? canonicalMatch[1] : null;
    const ogSite = ogSiteMatch ? ogSiteMatch[1] : null;

    const hasSampleBtn = html.includes('editor-sample-btn');
    const hasWebApplication = html.includes('"@type":"WebApplication"') || html.includes('"@type": "WebApplication"');
    const hasWebSite = html.includes('"@type":"WebSite"') || html.includes('"@type": "WebSite"');
    const hasFaqPage = html.includes('"@type":"FAQPage"') || html.includes('"@type": "FAQPage"');

    console.log('Title:', title);
    console.log('Description:', desc);
    console.log('Canonical:', canonical);
    console.log('OG Site Name:', ogSite);
    console.log('Sample Button in HTML:', hasSampleBtn);
    console.log('WebApplication JSON-LD:', hasWebApplication);
    console.log('WebSite JSON-LD:', hasWebSite);
    console.log('FAQPage JSON-LD:', hasFaqPage);
  }

  check('LIVE HOMEPAGE', homeHtml);
  check('LIVE PDF EDITOR', editorHtml);
}

run().catch(console.error);
