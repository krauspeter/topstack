import { useState } from 'react';
import { useWakeLock } from './hooks';
import { ChooseStarter, MatchEnd } from './screens/Between';
import { Home } from './screens/Home';
import { Roll } from './screens/Roll';
import { Seating } from './screens/Seating';
import { Setup } from './screens/Setup';
import { Tracker } from './screens/Tracker';
import { useMatch } from './store/useMatch';

type Screen = 'home' | 'setup' | 'seating';

/**
 * Phase 2: Offline-Life-Tracker ohne Server. Ein laufendes Match hat immer Vorrang:
 * Nach einem Neuladen oder Absturz geht es genau dort weiter, wo der Spielstand war.
 */
export function App() {
  const match = useMatch();
  const [screen, setScreen] = useState<Screen>('home');
  const { record, state } = match;

  useWakeLock(record !== null || screen === 'seating');

  if (!match.loaded) return <main className="page center muted">Lade Spielstand …</main>;

  if (record && state) {
    const { config } = record;
    switch (state.phase) {
      case 'roll':
        return <Roll players={config.players} onStart={match.beginFirstGame} onCancel={match.close} />;
      case 'playing':
        return (
          <Tracker
            config={config}
            state={state}
            events={record.events}
            onChange={match.changeLife}
            onUndo={match.undo}
            onWin={match.endGame}
            onAbort={match.close}
          />
        );
      case 'choose':
        return <ChooseStarter config={config} state={state} onChoose={match.startNextGame} />;
      case 'finished':
        return (
          <MatchEnd
            config={config}
            state={state}
            onRematch={() => {
              match.close();
              match.start({
                names: [config.players[0].name, config.players[1].name],
                colors: [config.players[0].color ?? 'blau', config.players[1].color ?? 'rot'],
                startingLife: config.startingLife,
                timeLimitMin: config.timeLimitMin ?? null,
              });
            }}
            onDone={() => {
              match.close();
              setScreen('home');
            }}
          />
        );
    }
  }

  switch (screen) {
    case 'setup':
      return (
        <Setup
          onStart={(setup) => {
            match.start(setup);
            setScreen('home');
          }}
          onBack={() => setScreen('home')}
        />
      );
    case 'seating':
      return <Seating onBack={() => setScreen('home')} />;
    default:
      return <Home onNewMatch={() => setScreen('setup')} onSeating={() => setScreen('seating')} />;
  }
}
