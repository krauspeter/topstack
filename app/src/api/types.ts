/** Antworten der API, wie in docs/schnittstellen.md beschrieben. */

export type GroupRole = 'admin' | 'member' | 'viewer';

export interface GroupMembership {
  id: string;
  name: string;
  role: GroupRole;
  player_id: string | null;
  /** Archiviert: nur lesbar (ADR-0018). */
  archived?: boolean;
  has_image?: boolean;
}

export interface Me {
  id: string;
  email: string | null;
  display_name: string;
  favorite_colors: string;
  locale: string;
  has_passkey: boolean;
  groups: GroupMembership[];
}

export interface InvitationInfo {
  group_name: string;
  expires_at: string;
}

export interface InvitationCreated {
  token: string;
  url: string;
  expires_at: string;
  max_uses: number | null;
}

export interface InvitationAccepted {
  group_id: string;
  player_id: string;
  joined: boolean;
}

export type PlayerKind = 'member' | 'reserved' | 'guest' | 'former';

export interface GroupPlayer {
  id: string;
  display_name: string;
  kind: PlayerKind;
  is_me: boolean;
}

export type TournamentStatus = 'setup' | 'seated' | 'drafting' | 'running' | 'paused' | 'finished' | 'cancelled';
export type TournamentAction =
  | 'invite'
  | 'respond'
  | 'seat'
  | 'start_draft'
  | 'report_colors'
  | 'cancel'
  | 'delete'
  | 'start_round'
  | 'next_round'
  | 'report_result'
  | 'pause'
  | 'resume'
  | 'finish'
  | 'request_cancel'
  | 'vote_cancel';

export interface MatchInfo {
  id: string;
  player_a_id: string;
  player_b_id: string;
  player_a: string;
  player_b: string;
  status: 'scheduled' | 'running' | 'finished';
  games_a: number;
  games_b: number;
  games_drawn: number;
  version: number;
  mine: boolean;
  can_report: boolean;
  tracker_mode: 'none' | 'shared' | 'dual';
  /** Live (AP-7): laufendes Spiel und Lebenspunkte, sonst `null`. */
  game_no: number | null;
  life_a: number | null;
  life_b: number | null;
}

/** Pause-Ansicht: nächster Gegner und meine Bilanz gegen ihn in der Gruppe. */
export interface NextOpponent {
  player_id: string;
  display_name: string;
  round: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface RoundInfo {
  number: number;
  status: 'planned' | 'running' | 'finished';
  bye: string | null;
  matches: MatchInfo[];
}

export interface Standing {
  player_id: string;
  display_name: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  match_points: number;
  games_won: number;
  games_lost: number;
  game_diff: number;
  needs_roll: boolean;
  roll: number | null;
  final_place: number | null;
  ranking_points: number | null;
}

export interface CancelVote {
  requested_by: string;
  confirmed: number;
  required: number;
  participants: number;
  i_voted: boolean;
  /** Spieler-IDs, die schon bestätigt haben. */
  voters: string[];
}

export interface Entry {
  player_id: string;
  display_name: string;
  kind: PlayerKind;
  status: 'invited' | 'accepted' | 'declined' | 'removed';
  seat_no: number | null;
  colors: string | null;
  is_me: boolean;
}

export interface Tournament {
  id: string;
  group_id: string;
  group_name: string;
  set_code: string;
  status: TournamentStatus;
  held_on: string;
  location: string | null;
  started_by: string | null;
  seating: { seed: number; draw: number } | null;
  entries: Entry[];
  my_player_id: string | null;
  actions: TournamentAction[];
  rounds: RoundInfo[];
  current_round: number | null;
  open_in_current: number;
  rounds_left: number;
  standings: Standing[];
  suggestion: string | null;
  cancel_vote: CancelVote | null;
  next_opponent: NextOpponent | null;
  /** Abschlusszeit (ISO); die Startseite zeigt das Turnier 24 h danach noch. */
  finished_at?: string | null;
}

export interface TrackerPlayer {
  id: string;
  display_name: string;
  colors: string | null;
  kind: PlayerKind;
}

export interface TrackerMatch {
  id: string;
  status: 'scheduled' | 'running' | 'finished';
  tracker_mode: 'shared' | 'dual' | 'none';
  games_a: number;
  games_b: number;
  games_drawn: number;
  version: number;
}

/** Ereignis im Format der API (snake_case), siehe `domain/remote.ts`. */
export interface ApiEvent {
  id: string;
  game_id: string;
  type: 'game_start' | 'die_roll' | 'life' | 'undo' | 'game_end';
  player_id: string | null;
  delta?: number | null;
  value?: number | null;
  undo_of?: string | null;
  reason?: 'life_zero' | 'concede' | 'time' | 'manual' | null;
  device_id: string;
  seq: number;
  client_ts: string;
  source: 'app' | 'hardware' | 'table';
}

export interface TrackerInfo {
  tournament_id: string;
  match: TrackerMatch;
  player_a: TrackerPlayer;
  player_b: TrackerPlayer;
  my_player_id: string | null;
  starting_life: number;
  time_limit_min: number | null;
  events: ApiEvent[];
  /** Modus `dual`: Warteraum bis Spiel 1. */
  seats?: { player_id: string; device_id: string; roll: number | null }[];
  tie?: number | null;
}

export interface EventBatchResult {
  accepted: string[];
  duplicates: string[];
  rejected: { id: string; detail: string }[];
  match: TrackerMatch;
}

export interface TournamentSummary {
  id: string;
  set_code: string;
  status: TournamentStatus;
  held_on: string;
  players: number;
  finished_at?: string | null;
}

export interface GuestLink {
  token: string;
  url: string;
  expires_at: string;
}

export interface GuestInfo {
  group_name: string;
  set_code: string;
  open: boolean;
}

export interface GuestJoined {
  tournament_id: string;
  player_id: string;
  display_name: string;
  /** Persönlicher Link zum Profil: Ergebnisse bleiben erhalten (UC-05, UC-18). */
  claim_url?: string | null;
}

// ---------------------------------------------------------------------------
// Rangliste und Statistik (AP-9)
// ---------------------------------------------------------------------------

export interface SeasonInfo {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string | null;
  current: boolean;
}

export interface LeaderboardRow {
  rank: number;
  player_id: string;
  display_name: string;
  kind: PlayerKind;
  tournaments: number;
  wins: number;
  ranking_points: number;
  match_points: number;
  avg_match_points: number;
}

export interface Leaderboard {
  tournaments: number;
  rows: LeaderboardRow[];
}

export interface WinRecord {
  wins: number;
  draws: number;
  losses: number;
}

export interface PlayerStats {
  player_id: string;
  display_name: string;
  tournaments: number;
  tournament_wins: number;
  ranking_points: number;
  places: Record<string, number>;
  avg_place: number;
  matches: WinRecord;
  match_win_rate: number;
  games_won: number;
  games_lost: number;
  games_drawn: number;
  game_win_rate: number;
  colors: { key: string; count: number }[];
  combos: { key: string; count: number }[];
  opponents: (WinRecord & { player_id: string; display_name: string })[];
  /** Eigene Kombinationen, beste Siegquote zuerst. */
  with_colors: ColorRecord[];
  /** Einzelne Gegner-Farben, meiste Niederlagen zuerst. */
  vs_colors: ColorRecord[];
}

export interface ColorRecord extends WinRecord {
  /** Kombination wie „BRG“ oder einzelne Farbe; „C“ = farblos. */
  key: string;
  win_rate: number;
}

/** Gruppen verwalten (Phase 5, AP-1, ADR-0018). */
export interface GroupRules {
  match_points_win: number;
  match_points_draw: number;
  match_points_loss: number;
  starting_life: number;
  games_to_win: number;
  extra_turns: number;
  boosters_per_player: number;
  match_time_limit_min: number | null;
  placement_bonus: number[];
  season_mode: 'calendar_year' | 'months' | 'eternal';
  season_months: number | null;
}

export interface GroupDetail {
  id: string;
  name: string;
  role: GroupRole;
  player_id: string | null;
  archived: boolean;
  has_image: boolean;
  created_at: string;
  rules: GroupRules;
  /** Geänderte Regeln, die ab der nächsten Saison gelten; nur für Admins. */
  pending_rules: Partial<GroupRules> | null;
  can_manage: boolean;
  can_invite: boolean;
  can_play: boolean;
  can_view_profiles: boolean;
}

export interface GroupRulesChanged {
  applied_now: boolean;
  group: GroupDetail;
}

export interface GroupMember {
  user_id: string;
  display_name: string;
  role: GroupRole;
  joined_at: string;
  player_id: string | null;
  is_me: boolean;
}

export interface LeftGroup {
  new_admin: string | null;
}

export interface DeletedGroup {
  id: string;
  name: string;
  deleted_at: string;
  purge_on: string;
}

/** Offener Einladungslink einer Gruppe (Phase 5, AP-2). */
export interface InvitationOut {
  id: string;
  created_by: string | null;
  mine: boolean;
  expires_at: string;
  uses: number;
  max_uses: number | null;
  player_name: string | null;
}

export interface MergeResult {
  source: string;
  target: string;
  tournaments: number;
  matches: number;
  merged: boolean;
}
