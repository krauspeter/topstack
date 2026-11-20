/** Antworten der API, wie in docs/schnittstellen.md beschrieben. */

export interface GroupMembership {
  id: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  player_id: string | null;
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
export type TournamentAction = 'invite' | 'respond' | 'seat' | 'start_draft' | 'report_colors' | 'cancel' | 'delete';

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
}

export interface TournamentSummary {
  id: string;
  set_code: string;
  status: TournamentStatus;
  held_on: string;
  players: number;
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
}
