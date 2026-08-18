// Game view bundles must share the shell's React instance (hooks break across
// two copies), so the shell exposes it and views import via the shims.
import * as React from 'react';
import * as JsxRuntime from 'react/jsx-runtime';

(globalThis as Record<string, unknown>).__UGE_REACT = React;
(globalThis as Record<string, unknown>).__UGE_REACT_JSX = JsxRuntime;
