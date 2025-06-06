const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/content.js'],
  bundle: true,
  outfile: 'src/content-bundle.js',
  format: 'iife',
  target: 'chrome102',
  loader: {
    '.js': 'js',
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).catch(() => process.exit(1));