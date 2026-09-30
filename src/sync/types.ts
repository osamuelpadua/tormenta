import type { Command } from "../domain/commands";
import type { Character, HistoryEvent } from "../domain/types";

export type Role = "master" | "player";
export interface Session {
  userId: string;
  email: string;
  name: string;
}
export interface Member {
  userId: string;
  name: string;
  role: Role;
  joinedAt: string;
}
export interface Campaign {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  role: Role;
  members: Member[];
  updatedAt: string;
}
export interface RemoteCharacter {
  id: string;
  ownerId: string;
  ownerName: string;
  campaignId: string | null;
  revision: number;
  data: Character;
  updatedAt: string;
  deleted: boolean;
}
export interface RemoteEvent {
  id: string;
  characterId: string;
  authorId: string | null;
  authorName: string | null;
  data: HistoryEvent;
  updatedAt: string;
}
export interface CampaignNote {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  // "master": private to the campaign masters; "all": the shared journal.
  visibility: "master" | "all";
  authorName: string;
  updatedAt: string;
}
export type SaveResult =
  | { status: "ok" }
  | { status: "conflict"; character: RemoteCharacter }
  | { status: "deleted" };
export interface SaveInput {
  character: Character;
  // null uploads a character the server does not know yet.
  expectedRevision: number | null;
  events: HistoryEvent[];
}
export interface PullResult {
  characters: RemoteCharacter[];
  // Only events of characters owned by the session; others' history stays remote.
  events: RemoteEvent[];
  // Every other member's character the session can still read. Characters
  // that left a campaign stop being readable, so the cache is pruned by it.
  visibleIds: string[];
  // Latest server change seen; null when nothing changed since the request.
  cursor: string | null;
}

// Server contract. The Supabase implementation enforces it with RLS and RPCs
// (supabase/migrations); the in-memory one mirrors the same rules for tests.
export interface RemoteBackend {
  readonly kind: "supabase" | "demo" | "memory";
  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  signUp(
    email: string,
    password: string,
    name: string,
  ): Promise<{ session: Session | null }>;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  updateProfile(name: string): Promise<void>;

  listCampaigns(): Promise<Campaign[]>;
  createCampaign(name: string, description: string): Promise<string>;
  updateCampaign(id: string, name: string, description: string): Promise<void>;
  joinCampaign(code: string): Promise<string>;
  leaveCampaign(id: string): Promise<void>;
  removeMember(campaignId: string, userId: string): Promise<void>;
  setMemberRole(campaignId: string, userId: string, role: Role): Promise<void>;
  regenerateInvite(campaignId: string): Promise<string>;

  pull(cursor: string | null): Promise<PullResult>;
  characterEvents(characterId: string): Promise<RemoteEvent[]>;
  saveCharacter(input: SaveInput): Promise<SaveResult>;
  deleteCharacter(id: string): Promise<void>;
  setCharacterCampaign(id: string, campaignId: string | null): Promise<void>;

  listNotes(campaignId: string): Promise<CampaignNote[]>;
  saveNote(
    note: Pick<CampaignNote, "campaignId" | "title" | "body" | "visibility"> & {
      id?: string;
    },
  ): Promise<void>;
  deleteNote(id: string): Promise<void>;

  // Called whenever something the session can read may have changed.
  subscribe(listener: () => void): () => void;
}

// Local bookkeeping, stored in IndexedDB next to the characters.
export interface CharacterSync {
  id: string;
  accountId: string;
  campaignId: string | null;
  // null until the first successful upload.
  syncedRevision: number | null;
}
export type OutboxOperation =
  | { kind: "create" }
  | { kind: "command"; command: Command; eventId: string; base?: Character }
  | { kind: "undo"; eventIds: string[] }
  | { kind: "delete" };
export interface OutboxEntry {
  seq?: number;
  characterId: string;
  at: string;
  op: OutboxOperation;
}
// Another member's character, cached for the group and master views.
export interface PartyCharacter extends RemoteCharacter {
  accountId: string;
}
export interface CachedCampaign extends Campaign {
  accountId: string;
}
