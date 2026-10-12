import { minify } from 'html-minifier-terser';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative addresses, so dist/ works at a site's root or in a folder.
  base: './',
  plugins: [
    {
      // Vite minifies the CSS and JS but leaves the HTML as written.
      name: 'minify-html',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: (html) =>
          minify(html, { collapseWhitespace: true, removeComments: true, minifyJS: true }),
      },
    },
  ],
});
