// optimize-codebase.js
const fs = require('fs');
const path = require('path');

const TARGET_EXTENSIONS = ['.js', '.ts', '.css'];
const SAFE_COMMENT_REGEX = /(TODO|FIXME|IMPORTANT)/i;

function shouldProcess(file) {
  return TARGET_EXTENSIONS.includes(path.extname(file));
}

function optimizeCode(code, ext) {
  // Remove non-error/warn console logs
  code = code.replace(/console\.(log|warn)\((?!.*error).*?\);?\s*$/gm, '');
  // Remove block comments except those with SAFE_COMMENT_REGEX
  code = code.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    SAFE_COMMENT_REGEX.test(match) ? match : ''
  );
  // Remove line comments except those with SAFE_COMMENT_REGEX
  code = code.replace(/\/\/(?!.*(TODO|FIXME|IMPORTANT)).*$/gm, '');
  // Remove extra blank lines
  code = code.replace(/\n{3,}/g, '\n\n');
  // Minify CSS whitespace
  if (ext === '.css') code = code.replace(/\s{2,}/g, ' ');
  return code;
}

function walk(dir, callback) {
  fs.readdirSync(dir).forEach((f) => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, callback);
    else callback(p);
  });
}

// Run optimization
['src', 'test', 'scripts'].forEach((dir) => {
  walk(dir, (file) => {
    if (shouldProcess(file)) {
      const ext = path.extname(file);
      const orig = fs.readFileSync(file, 'utf8');
      const optimized = optimizeCode(orig, ext);
      if (orig !== optimized) {
        fs.writeFileSync(file, optimized, 'utf8');
        console.log(`Optimized: ${file}`);
      }
    }
  });
}); 