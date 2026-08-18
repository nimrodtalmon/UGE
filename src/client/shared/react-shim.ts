// 'react' as seen from game view bundles — re-exports the shell's instance.
import type * as ReactNS from 'react';

const R = (globalThis as Record<string, unknown>).__UGE_REACT as typeof ReactNS;

export default R;
export const useState = R.useState;
export const useEffect = R.useEffect;
export const useLayoutEffect = R.useLayoutEffect;
export const useMemo = R.useMemo;
export const useCallback = R.useCallback;
export const useRef = R.useRef;
export const useReducer = R.useReducer;
export const useContext = R.useContext;
export const useId = R.useId;
export const createElement = R.createElement;
export const createContext = R.createContext;
export const forwardRef = R.forwardRef;
export const memo = R.memo;
export const Fragment = R.Fragment;
export const Children = R.Children;
export const cloneElement = R.cloneElement;
export const isValidElement = R.isValidElement;
export const StrictMode = R.StrictMode;
