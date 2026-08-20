import '../shared/exposeReact.js';
import { createRoot } from 'react-dom/client';
import { App } from '../shared/App.js';

createRoot(document.getElementById('root')!).render(<App />);
