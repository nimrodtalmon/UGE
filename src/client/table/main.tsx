import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function Table() {
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then((s: { joinUrl: string }) => setJoinUrl(s.joinUrl));
  }, []);

  return (
    <main>
      <h1>UGE</h1>
      <p className="tagline">Hello, world — this is the table.</p>
      {joinUrl && (
        <div className="qr">
          <img src="/api/qr.svg" alt={`Join QR for ${joinUrl}`} />
          <code>{joinUrl}</code>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Table />);
