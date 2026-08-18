import { createRoot } from 'react-dom/client';

function Join() {
  return (
    <main>
      <div className="ok">✓</div>
      <h1>You reached the UGE table</h1>
      <p>The lobby arrives in stage 2 — for now this page just proves your phone can see the brain.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Join />);
