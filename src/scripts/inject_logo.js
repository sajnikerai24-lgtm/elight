
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', '..', 'public');
const htmlFiles = ['index.html', 'products.html', 'cart.html', 'admin.html', 'login.html'];

for (const file of htmlFiles) {
  const filePath = path.join(publicDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Bump SVG cache-buster to ?v=3 so browsers immediately load the updated 3D reflective E logo
  content = content.replace(/\/images\/elight-logo\.svg(\?v=\d+)?/g, '/images/elight-logo.svg?v=3');
  content = content.replace(/\/images\/elight-favicon\.svg(\?v=\d+)?/g, '/images/elight-favicon.svg?v=3');

  // Remove redundant lightning bolt emoji inside <h1> right next to the custom logo
  content = content.replace(/<h1>\s*⚡\s*ELIGHT/g, '<h1>ELIGHT');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated logo references in ${file}`);
}
