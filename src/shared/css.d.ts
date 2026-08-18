// CSS imports in view files are handled by esbuild (emitted as a sibling
// .css bundle that the platform shell loads alongside the view).
declare module '*.css';
