// 'react/jsx-runtime' as seen from game view bundles.
import type * as JsxNS from 'react/jsx-runtime';

const J = (globalThis as Record<string, unknown>).__UGE_REACT_JSX as typeof JsxNS;

export const jsx = J.jsx;
export const jsxs = J.jsxs;
export const Fragment = J.Fragment;
