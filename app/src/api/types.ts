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
