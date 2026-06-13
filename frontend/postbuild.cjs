const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const htmlPath = path.join(distDir, 'index.html');

if (fs.existsSync(htmlPath)) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  
  // Regex to match the compiled CSS link tag: <link rel="stylesheet" crossorigin href="/assets/index-XXXXXX.css">
  const cssMatch = html.match(/<link[^>]*rel="stylesheet"[^>]*href="[^"]*assets\/([^"]+\.css)"[^>]*>/);
  if (cssMatch) {
    const cssFileName = cssMatch[1];
    const cssPath = path.join(distDir, 'assets', cssFileName);
    
    if (fs.existsSync(cssPath)) {
      const cssContent = fs.readFileSync(cssPath, 'utf8');
      
      // Replace the link tag with the inline style block
      html = html.replace(cssMatch[0], `<style>${cssContent}</style>`);
      
      // Write the modified HTML back
      fs.writeFileSync(htmlPath, html, 'utf8');
      console.log(`[Post-Build] Successfully inlined CSS from ${cssFileName} to index.html`);
      
      // Clean up the now unused CSS file from the output assets folder to keep it clean
      try {
        fs.unlinkSync(cssPath);
        console.log(`[Post-Build] Cleaned up compiled asset file ${cssFileName}`);
      } catch (err) {
        console.warn(`[Post-Build] Could not delete ${cssFileName}:`, err.message);
      }
    } else {
      console.warn(`[Post-Build] CSS file not found at path: ${cssPath}`);
    }
  } else {
    console.warn('[Post-Build] No compiled CSS link tag found in index.html');
  }
} else {
  console.warn('[Post-Build] dist/index.html not found');
}
