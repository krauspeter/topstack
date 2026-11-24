import { useState } from 'react';
import { api } from './api/client';
import { useWakeLock } from './hooks';
import { useLocation } from './router';
import { Feedback } from './screens/account/Feedback';
import { Invitation } from './screens/account/Invitation';
import { Login } from './screens/account/Login';
import { Profile } from './screens/account/Profile';
import { RedeemLink } from './screens/account/RedeemLink';
import { GuestJoin } from './screens/tournament/GuestJoin';
import { TournamentHome } from './screens/tournament/TournamentHome';
import { TournamentView } from './screens/tournament/TournamentView';
import { ChooseStarter, MatchEnd } from './screens/Between';
import { Home } from './screens/Home';
import { DualRoll } from './screens/DualRoll';
import { Leaderboard } from './screens/leaderboard/Leaderboard';
import { Roll } from './screens/Roll';
import { Seating } from './screens/Seating';
import { Setup } from './screens/Setup';
import { Tracker } from './screens/Tracker';
import { useAccount } from './store/useAccount';
import { deviceId, useMatch } from './store/useMatch';
import { controls } from './domain/match';
import { fromApi, lobbyFrom, remoteStatus } from './domain/remote';
import { useSync } from './store/useSync';
import { playerColors } from './theme';

type Screen = 'home' | 'setup' | 'seating';

/**
 * Konto-Seiten haben eigene Adressen (Links aus Mails und Einladungen). Sonst gilt wie in
 * Phase 2: Ein laufendes Match hat Vorrang, nach einem Neuladen geht es dort weiter.
 */
export function App() {
  const match = useMatch();
  const sync = useSync(match);
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

  if (url.pathname.startsWith('/gast/')) {
    const token = decodeURIComponent(url.pathname.slice('/gast/'.length));
    return <GuestJoin token={token} onDone={home} />;
  }

  if (url.pathname === '/turnier' || url.pathname.startsWith('/turnier/')) {
    if (account.status === 'loading') return <main className="page center muted">Lade …</main>;
    if (account.status !== 'signed-in') {
      return (
        <main className="page center">
          <section className="card">
            <h2>{account.status === 'offline' ? 'Keine Verbindung' : 'Bitte anmelden'}</h2>
            <p>Turniere brauchen eine Anmeldung und eine Verbindung zum Server.</p>
            <button className="btn" onClick={home}>
              Zur Startseite
            </button>
          </section>
        </main>
      );
    }
    const id = url.pathname.slice('/turnier/'.length);
    if (url.pathname === '/turnier' || !id) {
      return <TournamentHome me={account.me} onOpen={(tid) => navigate(`/turnier/${tid}`)} onBack={home} />;
    }
    return (
      <TournamentView
        key={id}
        id={id}
        me={account.me}
        onBack={() => navigate('/turnier')}
        onDeleted={() => navigate('/turnier', true)}
        onPlay={(config, events) => {
          if (!match.openRemote(config, events)) return false;
          navigate('/');
          return true;
        }}
      />
    );
  }

  if (url.pathname === '/rangliste') {
    if (account.status === 'loading') return <main className="page center muted">Lade …</main>;
    if (account.status !== 'signed-in') {
      return (
        <main className="page center">
          <section className="card">
            <h2>{account.status === 'offline' ? 'Keine Verbindung' : 'Bitte anmelden'}</h2>
            <p>Die Rangliste braucht eine Anmeldung und eine Verbindung zum Server.</p>
            <button className="btn" onClick={home}>
              Zur Startseite
            </button>
          </section>
        </main>
      );
    }
    return <Leaderboard me={account.me} onBack={home} />;
  }

  if (url.pathname === '/feedback') {
    if (account.status === 'loading') return <main className="page center muted">Lade …</main>;
    if (account.status !== 'signed-in') {
      return (
        <main className="page center">
          <section className="card">
            <h2>{account.status === 'offline' ? 'Keine Verbindung' : 'Bitte anmelden'}</h2>
            <p>Feedback geht nur mit Anmeldung und Verbindung zum Server.</p>
            <button className="btn" onClick={home}>
              Zur Startseite
            </button>
          </section>
        </main>
      );
    }
    return <Feedback onBack={() => (window.history.length > 1 ? window.history.back() : home())} />;
  }

  if (url.pathname === '/profil') {
    if (account.status === 'loading') return <main className="page center muted">Lade Profil …</main>;
    if (account.status === 'signed-in') {
      return (
        <Profile
          me={account.me}
          onFeedback={() => navigate('/feedback')}
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
    const remote = config.remote;
    switch (state.phase) {
      case 'roll':
        if (remote?.mode === 'dual' && remote.myPlayer)
          return (
            <DualRoll
              config={config}
              device={deviceId()}
              onInfo={(info) =>
                match.applyServer(remote.matchId, info.events.map(fromApi), [], remoteStatus(info.match), lobbyFrom(info))
              }
              onStart={match.beginFirstGame}
              onCancel={() => {
                match.close();
                navigate(`/turnier/${remote.tournamentId}`);
              }}
            />
          );
        return (
          <Roll
            players={config.players}
            onStart={match.beginFirstGame}
            onCancel={() => {
              match.close();
              if (remote) navigate(`/turnier/${remote.tournamentId}`);
            }}
          />
        );
      case 'playing':
        return (
          <Tracker
            config={config}
            state={state}
            events={record.events}
            onChange={match.changeLife}
            onUndo={match.undo}
            onWin={match.endGame}
            onAbort={() => {
              match.close();
              if (config.remote) navigate(`/turnier/${config.remote.tournamentId}`);
            }}
            sync={config.remote ? sync : undefined}
          />
        );
      case 'choose':
        return (
          <ChooseStarter
            config={config}
            state={state}
            onChoose={match.startNextGame}
            waiting={remote?.mode === 'dual' && state.chooser !== null && !controls(config, state.chooser)}
          />
        );
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
              if (config.remote) navigate(`/turnier/${config.remote.tournamentId}`);
            }}
            onConfirm={
              remote
                ? async () => {
                    const r = remote;
                    const ids = config.players.map((p) => p.id);
                    await api(`/tournaments/${r.tournamentId}/matches/${r.matchId}/result`, {
                      method: 'PUT',
                      body: {
                        games_a: state.wins[ids[0]],
                        games_b: state.wins[ids[1]],
                        games_drawn: state.games.filter((g) => g.endedAt !== null && g.winner === null).length,
                      },
                    });
                    match.close();
                    navigate(`/turnier/${r.tournamentId}`);
                  }
                : undefined
            }
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
          onTournaments={() => navigate('/turnier')}
          onLeaderboard={() => navigate('/rangliste')}
          onProfile={() => navigate('/profil')}
          onFeedback={() => navigate('/feedback')}
          onOpenTournament={(id) => navigate(`/turnier/${id}`)}
        />
      );
  }
}
