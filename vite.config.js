import { defineConfig } from 'vite';
// base './': relative paths, so the build runs from any folder of a site (itch.io, a GitHub Pages project page) as well as its root
export default defineConfig({base:'./',server:{host:'127.0.0.1',port:5202,strictPort:true},build:{chunkSizeWarningLimit:900}});
