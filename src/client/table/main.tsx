import '../shared/exposeReact.js';
import { createRoot } from 'react-dom/client';
import { App } from '../shared/App.js';

// the host page: same app as every other device, its own device identity so
// one machine can also open a second tab as a player
createRoot(document.getElementById('root')!).render(<App host />);
