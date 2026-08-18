import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import type { GameViewProps } from '../../shared/plugin.js';
import type { ActiveGame } from '../../shared/types.js';

/** Load the running game's view for this device's role and render it. */
export function GameScreen(props: {
  game: ActiveGame;
  move: (name: string, ...args: unknown[]) => void;
}) {
  const { game } = props;
  // key the loaded component by game+role so a stale view never renders a new game's state
  const viewKey = `${game.id}/${game.role ?? ''}`;
  const [loaded, setLoaded] = useState<{ key: string; comp: ComponentType<GameViewProps> } | null>(null);
  const [failed, setFailed] = useState(false);
  const View = loaded?.key === viewKey ? loaded.comp : null;

  // hand views a stable `move` so their effects/timers can safely depend on it
  const moveRef = useRef(props.move);
  moveRef.current = props.move;
  const move = useCallback((name: string, ...args: unknown[]) => moveRef.current(name, ...args), []);

  useEffect(() => {
    if (!game.role) return;
    let dead = false;
    setFailed(false);

    const cssHref = `/dist/games/${game.id}/${game.role}.css`;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref; // 404 is harmless when a game ships no styles
    document.head.appendChild(link);

    const jsUrl = `/dist/games/${game.id}/${game.role}.js`;
    import(jsUrl).then(
      (m: { default: ComponentType<GameViewProps> }) =>
        !dead && setLoaded({ key: viewKey, comp: m.default }),
      () => !dead && setFailed(true),
    );
    return () => {
      dead = true;
      link.remove();
    };
  }, [game.id, game.role, viewKey]);

  if (!game.role) {
    return (
      <div className="center-screen">
        <p className="muted">{game.name} in progress — you're watching.</p>
      </div>
    );
  }
  if (failed) {
    return (
      <div className="center-screen">
        <p className="muted">
          {game.name} has no "{game.role}" view — that's a plugin bug.
        </p>
      </div>
    );
  }
  if (!View) {
    return (
      <div className="center-screen">
        <p className="muted">loading {game.name}…</p>
      </div>
    );
  }
  return (
    <View
      view={game.view}
      role={game.role}
      me={game.me}
      players={game.players}
      over={game.over}
      move={move}
      serverNow={game.serverNow}
    />
  );
}
