import { useState } from 'react';
import { useWakeLock } from './hooks';
import { useLocation } from './router';
import { Invitation } from './screens/account/Invitation';
import { Login } from './screens/account/Login';
import { Profile } from './screens/account/Profile';
import { RedeemLink } from './screens/account/RedeemLink';
import { ChooseStarter, MatchEnd } from './screens/Between';
import { Home } from './screens/Home';
import { Roll } from './screens/Roll';
import { Seating } from './screens/Seating';
import { Setup } from './screens/Setup';
import { Tracker } from './screens/Tracker';
import { useAccount } from './store/useAccount';
import { useMatch } from './store/useMatch';
import { playerColors } from './theme';

type Screen = 'home' | 'setup' | 'seating';

/**
 * Konto-Seiten haben eigene Adressen (Links aus Mails und Einladungen). Sonst gilt wie in
 * Phase 2: Ein laufendes Match hat Vorrang, nach einem Neuladen geht es dort weiter.
 */
export function App() {
  const match = useMatch();
  const { account, signedIn, signOut, refresh } = useAccount();
  const { url, navigate } = useLocation();
  const [screen, setScreen] = useState<Screen>('home');
  const { record, state } = match;

  useWakeLock(url.pathname === '/' && (record !== null || screen === 'seating'));

  const home = () => navigate('/');

  if (url.pathname === '/anmelden') {
    const token = url.searchParams.get('token');
    if (token) {
      return (
        <RedeemLink
          token={token}
          invitation={url.searchParams.get('einladung')}
          onSignedIn={signedIn}
          onDone={() => navigate('/', true)}
          onNewLink={() => navigate('/anmelden', true)}
        />
      );
    }
    if (account.status === 'signed-in') {
      return (
        <main className="page center">
          <section className="card">
            <h2>Schon angemeldet</h2>
            <p>Du bist als {account.me.display_name} angemeldet.</p>
            <button className="btn primary big" onClick={home}>
              Zur Startseite
            </button>
          </section>
        </main>
      );
    }
    return (
      <Login
        onSignedIn={(me) => {
          signedIn(me);
          home();
        }}
        onBack={home}
      />
    );
  }

  if (url.pathname.startsWith('/einladung/')) {
    const token = decodeURIComponent(url.pathname.slice('/einladung/'.length));
    return (
      <Invitation
        token={token}
        account={account}
        onSignedIn={(me) => {
          signedIn(me);
          home();
        }}
        onJoined={() => {
          void refresh();
          navigate('/profil', true);
        }}
        onBack={home}
      />
    );
  }

  if (url.pathname === '/profil') {
    if (account.status === 'loading') return <main className="page center muted">Lade Profil …</main>;
    if (account.status === 'signed-in') {
      return (
        <Profile
          me={account.me}
          onChange={signedIn}
          onSignOut={() => {
            void signOut().then(home);
          }}
          onBack={home}
        />
      );
    }
    if (account.status === 'offline') {
      return (
        <main className="page center">
          <section className="card">
            <h2>Keine Verbindung</h2>
            <p>Das Profil braucht eine Verbindung zum Server. Der Life-Tracker funktioniert auch offline.</p>
            <button className="btn" onClick={home}>
              Zur Startseite
            </button>
          </section>
        </main>
      );
    }
    return (
      <Login
        onSignedIn={(me) => {
          signedIn(me);
          navigate('/profil', true);
        }}
        onBack={home}
      />
    );
  }

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
                colors: [playerColors(config.players[0], 0), playerColors(config.players[1], 1)],
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
      return (
        <Home
          account={account}
          onNewMatch={() => setScreen('setup')}
          onSeating={() => setScreen('seating')}
          onLogin={() => navigate('/anmelden')}
          onProfile={() => navigate('/profil')}
        />
      );
  }
}
