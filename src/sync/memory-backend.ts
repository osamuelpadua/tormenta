import type { Character, HistoryEvent } from "../domain/types";
import type {
  Campaign,
  CampaignLocation,
  CampaignLocationInput,
  CampaignMap,
  CampaignNote,
  RemoteMapAsset,
  PullResult,
  RemoteBackend,
  RemoteCharacter,
  RemoteEvent,
  Role,
  SaveInput,
  SaveResult,
  Session,
} from "./types";

interface Account {
  id: string;
  email: string;
  password: string;
  name: string;
}
interface CampaignRow {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
}
interface MemberRow {
  campaignId: string;
  userId: string;
  role: Role;
  joinedAt: string;
}
interface CharacterRow {
  id: string;
  ownerId: string;
  campaignId: string | null;
  revision: number;
  data: Character;
  updatedAt: string;
  deletedAt: string | null;
}
interface EventRow {
  id: string;
  characterId: string;
  authorId: string | null;
  data: HistoryEvent;
  updatedAt: string;
}
type MapRow = Omit<CampaignMap, never>;
interface LocationRow extends Omit<
  CampaignLocation,
  "createdByName" | "updatedByName"
> {
  createdBy: string;
  updatedBy: string;
}
interface NoteRow extends Omit<CampaignNote, "authorName"> {
  authorId: string;
}
export interface MemoryState {
  accounts: Account[];
  campaigns: CampaignRow[];
  members: MemberRow[];
  characters: CharacterRow[];
  events: EventRow[];
  notes: NoteRow[];
  maps?: MapRow[];
  locations?: LocationRow[];
  clock: number;
}
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function inviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => INVITE_ALPHABET[b % 32]).join("");
}
const copy = <T>(value: T): T => structuredClone(value);

// Shared server state. Every rule mirrors a policy or RPC of
// supabase/migrations so the sync engine can be tested without a network.
export class MemoryServer {
  state: MemoryState;
  // Uploaded map images; kept in memory only, even in the demo.
  files = new Map<string, Blob>();
  private listeners = new Set<() => void>();
  constructor(
    state?: MemoryState,
    private onChange?: (state: MemoryState) => void,
  ) {
    this.state = state ?? {
      accounts: [],
      campaigns: [],
      members: [],
      characters: [],
      events: [],
      notes: [],
      maps: [],
      locations: [],
      clock: Date.now(),
    };
  }
  // Strictly increasing, like a server clock used as a pull cursor.
  now() {
    this.state.clock = Math.max(this.state.clock + 1, Date.now());
    return new Date(this.state.clock).toISOString();
  }
  listen(listener: () => void) {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  changed() {
    this.onChange?.(this.state);
    for (const listener of this.listeners) listener();
  }
  // Adopts state written elsewhere (another tab) without persisting it again.
  replace(state: MemoryState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  account(id: string) {
    return this.state.accounts.find((a) => a.id === id);
  }
  member(campaignId: string, userId: string) {
    return this.state.members.find(
      (m) => m.campaignId === campaignId && m.userId === userId,
    );
  }
  isMaster(campaignId: string | null, userId: string) {
    return !!campaignId && this.member(campaignId, userId)?.role === "master";
  }
  canRead(row: CharacterRow, userId: string) {
    return (
      row.ownerId === userId ||
      (!!row.campaignId && !!this.member(row.campaignId, userId))
    );
  }
}

export class MemoryBackend implements RemoteBackend {
  readonly kind: "memory" | "demo";
  private session: Session | null = null;
  private sessionListeners = new Set<(session: Session | null) => void>();
  constructor(
    readonly server: MemoryServer,
    options: { kind?: "memory" | "demo"; session?: Session | null } = {},
  ) {
    this.kind = options.kind ?? "memory";
    this.session = options.session ?? null;
  }
  private get state() {
    return this.server.state;
  }
  private user() {
    if (!this.session) throw new Error("Entre na sua conta para continuar.");
    return this.session.userId;
  }
  private setSession(session: Session | null) {
    this.session = session;
    for (const listener of this.sessionListeners) listener(session);
  }
  private remote(row: CharacterRow): RemoteCharacter {
    return {
      id: row.id,
      ownerId: row.ownerId,
      ownerName: this.server.account(row.ownerId)?.name ?? "Jogador",
      campaignId: row.campaignId,
      revision: row.revision,
      data: copy(row.data),
      updatedAt: row.updatedAt,
      deleted: !!row.deletedAt,
    };
  }
  private remoteEvent(row: EventRow): RemoteEvent {
    return {
      id: row.id,
      characterId: row.characterId,
      authorId: row.authorId,
      authorName: row.authorId
        ? (this.server.account(row.authorId)?.name ?? null)
        : null,
      data: copy(row.data),
      updatedAt: row.updatedAt,
    };
  }
  private requireMaster(campaignId: string) {
    if (!this.server.isMaster(campaignId, this.user()))
      throw new Error("Apenas o mestre da campanha pode fazer isso.");
  }
  private detach(campaignId: string, userId: string) {
    const now = this.server.now();
    for (const row of this.state.characters)
      if (row.campaignId === campaignId && row.ownerId === userId) {
        row.campaignId = null;
        row.updatedAt = now;
      }
  }
  async getSession() {
    return this.session;
  }
  onSessionChange(listener: (session: Session | null) => void) {
    this.sessionListeners.add(listener);
    return () => void this.sessionListeners.delete(listener);
  }
  async signUp(email: string, password: string, name: string) {
    email = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("E-mail inválido.");
    if (password.length < 6)
      throw new Error("A senha precisa ter ao menos 6 caracteres.");
    if (this.state.accounts.some((a) => a.email === email))
      throw new Error("Este e-mail já tem uma conta.");
    const account = {
      id: crypto.randomUUID(),
      email,
      password,
      name: name.trim() || email.split("@")[0],
    };
    this.state.accounts.push(account);
    this.server.changed();
    const session = { userId: account.id, email, name: account.name };
    this.setSession(session);
    return { session };
  }
  async signIn(email: string, password: string) {
    const account = this.state.accounts.find(
      (a) => a.email === email.trim().toLowerCase() && a.password === password,
    );
    if (!account) throw new Error("E-mail ou senha incorretos.");
    const session = {
      userId: account.id,
      email: account.email,
      name: account.name,
    };
    this.setSession(session);
    return session;
  }
  async signOut() {
    this.setSession(null);
  }
  async updateProfile(name: string) {
    const account = this.server.account(this.user())!;
    account.name = name.trim() || account.name;
    this.server.changed();
    this.setSession({ ...this.session!, name: account.name });
  }
  async listCampaigns(): Promise<Campaign[]> {
    const userId = this.user();
    return this.state.members
      .filter((m) => m.userId === userId)
      .map((m) => {
        const row = this.state.campaigns.find((c) => c.id === m.campaignId)!;
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          inviteCode: row.inviteCode,
          role: m.role,
          updatedAt: row.updatedAt,
          members: this.state.members
            .filter((x) => x.campaignId === row.id)
            .map((x) => ({
              userId: x.userId,
              name: this.server.account(x.userId)?.name ?? "Jogador",
              role: x.role,
              joinedAt: x.joinedAt,
            })),
        };
      });
  }
  async createCampaign(name: string, description: string) {
    const userId = this.user();
    if (!name.trim()) throw new Error("Dê um nome à campanha.");
    const now = this.server.now();
    const row = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      inviteCode: inviteCode(),
      createdAt: now,
      updatedAt: now,
    };
    this.state.campaigns.push(row);
    this.state.members.push({
      campaignId: row.id,
      userId,
      role: "master",
      joinedAt: now,
    });
    this.server.changed();
    return row.id;
  }
  async updateCampaign(id: string, name: string, description: string) {
    this.requireMaster(id);
    const row = this.state.campaigns.find((c) => c.id === id)!;
    if (!name.trim()) throw new Error("Dê um nome à campanha.");
    Object.assign(row, {
      name: name.trim(),
      description: description.trim(),
      updatedAt: this.server.now(),
    });
    this.server.changed();
  }
  async joinCampaign(code: string) {
    const userId = this.user();
    const row = this.state.campaigns.find(
      (c) => c.inviteCode === code.trim().toUpperCase(),
    );
    if (!row) throw new Error("Convite não encontrado. Confira o código.");
    if (!this.server.member(row.id, userId)) {
      this.state.members.push({
        campaignId: row.id,
        userId,
        role: "player",
        joinedAt: this.server.now(),
      });
      this.server.changed();
    }
    return row.id;
  }
  async leaveCampaign(id: string) {
    const userId = this.user();
    const members = this.state.members.filter((m) => m.campaignId === id);
    const me = members.find((m) => m.userId === userId);
    if (!me) return;
    if (
      me.role === "master" &&
      members.length > 1 &&
      !members.some((m) => m.userId !== userId && m.role === "master")
    )
      throw new Error("Promova outro mestre antes de sair da campanha.");
    this.detach(id, userId);
    this.state.members = this.state.members.filter((m) => m !== me);
    if (members.length === 1) {
      this.state.campaigns = this.state.campaigns.filter((c) => c.id !== id);
      this.state.notes = this.state.notes.filter((n) => n.campaignId !== id);
      this.state.maps = this.maps.filter((m) => m.campaignId !== id);
      this.state.locations = this.places.filter((l) => l.campaignId !== id);
    }
    this.server.changed();
  }
  async removeMember(campaignId: string, userId: string) {
    this.requireMaster(campaignId);
    if (userId === this.user())
      throw new Error("Use Sair da campanha para remover a si mesmo.");
    this.detach(campaignId, userId);
    this.state.members = this.state.members.filter(
      (m) => !(m.campaignId === campaignId && m.userId === userId),
    );
    this.server.changed();
  }
  async setMemberRole(campaignId: string, userId: string, role: Role) {
    this.requireMaster(campaignId);
    const member = this.server.member(campaignId, userId);
    if (!member) throw new Error("Participante não encontrado.");
    if (
      role === "player" &&
      !this.state.members.some(
        (m) =>
          m.campaignId === campaignId &&
          m.role === "master" &&
          m.userId !== userId,
      )
    )
      throw new Error("A campanha precisa de ao menos um mestre.");
    member.role = role;
    this.server.changed();
  }
  async regenerateInvite(campaignId: string) {
    this.requireMaster(campaignId);
    const row = this.state.campaigns.find((c) => c.id === campaignId)!;
    row.inviteCode = inviteCode();
    row.updatedAt = this.server.now();
    this.server.changed();
    return row.inviteCode;
  }
  async pull(cursor: string | null): Promise<PullResult> {
    const userId = this.user();
    const next = this.server.now();
    const readable = this.state.characters.filter((row) =>
      this.server.canRead(row, userId),
    );
    const own = new Set(
      readable.filter((r) => r.ownerId === userId).map((r) => r.id),
    );
    return {
      characters: readable
        .filter((r) => !cursor || r.updatedAt > cursor)
        .map((r) => this.remote(r)),
      events: this.state.events
        .filter(
          (e) => own.has(e.characterId) && (!cursor || e.updatedAt > cursor),
        )
        .map((e) => this.remoteEvent(e)),
      visibleIds: readable
        .filter((r) => r.ownerId !== userId && !r.deletedAt)
        .map((r) => r.id),
      cursor: next,
    };
  }
  async characterEvents(characterId: string) {
    const userId = this.user();
    const row = this.state.characters.find((c) => c.id === characterId);
    if (!row || !this.server.canRead(row, userId)) return [];
    return this.state.events
      .filter((e) => e.characterId === characterId)
      .map((e) => this.remoteEvent(e));
  }
  async saveCharacter({
    character,
    expectedRevision,
    events,
  }: SaveInput): Promise<SaveResult> {
    const userId = this.user();
    const now = this.server.now();
    let row = this.state.characters.find((c) => c.id === character.id);
    if (!row) {
      if (expectedRevision !== null) return { status: "deleted" };
      row = {
        id: character.id,
        ownerId: userId,
        campaignId: null,
        revision: character.revision,
        data: copy(character),
        updatedAt: now,
        deletedAt: null,
      };
      this.state.characters.push(row);
    } else {
      if (
        row.ownerId !== userId &&
        !this.server.isMaster(row.campaignId, userId)
      )
        throw new Error("Você não pode alterar esta ficha.");
      if (row.deletedAt) return { status: "deleted" };
      if (expectedRevision !== row.revision)
        return { status: "conflict", character: this.remote(row) };
      if (character.revision <= row.revision)
        throw new Error("Revisão inválida.");
      Object.assign(row, {
        revision: character.revision,
        data: copy(character),
        updatedAt: now,
      });
    }
    for (const event of events) {
      const existing = this.state.events.find((e) => e.id === event.id);
      if (existing) {
        if (existing.characterId !== row.id) continue;
        existing.data = copy(event);
        existing.updatedAt = now;
      } else
        this.state.events.push({
          id: event.id,
          characterId: row.id,
          authorId: userId,
          data: copy(event),
          updatedAt: now,
        });
    }
    this.server.changed();
    return { status: "ok" };
  }
  async deleteCharacter(id: string) {
    const row = this.state.characters.find((c) => c.id === id);
    if (!row) return;
    if (row.ownerId !== this.user())
      throw new Error("Somente o dono pode excluir a ficha.");
    row.deletedAt = row.updatedAt = this.server.now();
    this.server.changed();
  }
  async setCharacterCampaign(id: string, campaignId: string | null) {
    const userId = this.user();
    const row = this.state.characters.find((c) => c.id === id);
    if (!row || row.ownerId !== userId)
      throw new Error("Somente o dono pode mudar a campanha da ficha.");
    if (campaignId && !this.server.member(campaignId, userId))
      throw new Error("Entre na campanha antes de levar o personagem.");
    row.campaignId = campaignId;
    row.updatedAt = this.server.now();
    this.server.changed();
  }
  async listNotes(campaignId: string) {
    const userId = this.user();
    const master = this.server.isMaster(campaignId, userId);
    if (!this.server.member(campaignId, userId)) return [];
    return this.state.notes
      .filter(
        (n) =>
          n.campaignId === campaignId && (master || n.visibility === "all"),
      )
      .map(({ authorId, ...n }) => ({
        ...n,
        authorName: this.server.account(authorId)?.name ?? "Mestre",
      }));
  }
  async saveNote(
    note: Pick<CampaignNote, "campaignId" | "title" | "body" | "visibility"> & {
      id?: string;
    },
  ) {
    this.requireMaster(note.campaignId);
    const now = this.server.now();
    const existing = this.state.notes.find((n) => n.id === note.id);
    if (existing) {
      if (existing.campaignId !== note.campaignId)
        throw new Error("Nota de outra campanha.");
      Object.assign(existing, {
        title: note.title,
        body: note.body,
        visibility: note.visibility,
        updatedAt: now,
      });
    } else
      this.state.notes.push({
        id: note.id ?? crypto.randomUUID(),
        campaignId: note.campaignId,
        title: note.title,
        body: note.body,
        visibility: note.visibility,
        authorId: this.user(),
        updatedAt: now,
      });
    this.server.changed();
  }
  async deleteNote(id: string) {
    const note = this.state.notes.find((n) => n.id === id);
    if (!note) return;
    this.requireMaster(note.campaignId);
    this.state.notes = this.state.notes.filter((n) => n !== note);
    this.server.changed();
  }
  private get maps() {
    return (this.state.maps ??= []);
  }
  private get places() {
    return (this.state.locations ??= []);
  }
  private place(row: LocationRow): CampaignLocation {
    const { createdBy, updatedBy, ...rest } = row;
    return {
      ...copy(rest),
      createdByName: this.server.account(createdBy)?.name ?? null,
      updatedByName: this.server.account(updatedBy)?.name ?? null,
    };
  }
  private requireMember(campaignId: string) {
    if (!this.server.member(campaignId, this.user()))
      throw new Error("Este mapa foi removido.");
  }
  async listCampaignMaps() {
    const userId = this.user();
    const mine = this.maps.filter((m) =>
      this.server.member(m.campaignId, userId),
    );
    const ids = new Set(mine.map((m) => m.id));
    return {
      maps: copy(mine),
      locations: this.places
        .filter(
          (l) =>
            ids.has(l.mapId) &&
            (!l.secret || this.server.isMaster(l.campaignId, userId)),
        )
        .map((l) => this.place(l)),
    };
  }
  async addCampaignMap(
    campaignId: string,
    name: string,
    notes: string,
    asset: RemoteMapAsset,
    sourceKey: string | null,
  ) {
    if (!this.server.isMaster(campaignId, this.user()))
      throw new Error("Apenas o mestre da campanha pode adicionar mapas.");
    const id = crypto.randomUUID();
    this.maps.push({
      id,
      campaignId,
      name: name.trim(),
      notes,
      asset: copy(asset),
      sourceKey,
      revision: 0,
      updatedAt: this.server.now(),
    });
    this.server.changed();
    return id;
  }
  async updateCampaignMap(
    id: string,
    expectedRevision: number,
    name: string,
    notes: string,
  ) {
    const map = this.maps.find((m) => m.id === id);
    if (!map) throw new Error("Este mapa foi removido.");
    this.requireMember(map.campaignId);
    if (map.revision !== expectedRevision)
      throw new Error(
        "Este mapa mudou enquanto você editava. Abra novamente para conferir a versão atual.",
      );
    Object.assign(map, {
      name: name.trim(),
      notes,
      revision: map.revision + 1,
      updatedAt: this.server.now(),
    });
    this.server.changed();
  }
  async deleteCampaignMap(id: string) {
    const map = this.maps.find((m) => m.id === id);
    if (!map) return;
    if (!this.server.isMaster(map.campaignId, this.user()))
      throw new Error("Apenas o mestre da campanha pode remover mapas.");
    this.state.maps = this.maps.filter((m) => m !== map);
    this.state.locations = this.places.filter((l) => l.mapId !== id);
    this.server.changed();
  }
  async saveMapLocation(
    input: CampaignLocationInput,
    expectedRevision: number | null,
  ) {
    const userId = this.user();
    const map = this.maps.find((m) => m.id === input.mapId);
    if (!map || !this.server.member(map.campaignId, userId))
      throw new Error("Este mapa foi removido.");
    const master = this.server.isMaster(map.campaignId, userId);
    if (input.secret && !master)
      throw new Error("Apenas o mestre cria locais secretos.");
    const current = this.places.find((l) => l.id === input.id);
    if (current && (current.mapId !== map.id || (current.secret && !master)))
      throw new Error("Este local foi removido.");
    if (expectedRevision === null && current)
      throw new Error("Este local já existe.");
    if (expectedRevision !== null && !current)
      throw new Error("Este local foi removido.");
    if (current && current.revision !== expectedRevision)
      throw new Error(
        "Este local mudou enquanto você editava. Abra novamente para conferir a versão atual.",
      );
    const now = this.server.now();
    const fields = {
      name: input.name.trim(),
      categoryId: input.categoryId,
      iconId: input.iconId,
      x: input.x,
      y: input.y,
      notes: input.notes,
      secret: input.secret,
    };
    let row: LocationRow;
    if (current) {
      Object.assign(current, fields, {
        revision: current.revision + 1,
        updatedBy: userId,
        updatedAt: now,
      });
      row = current;
    } else {
      row = {
        id: input.id,
        mapId: map.id,
        campaignId: map.campaignId,
        ...fields,
        revision: 0,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      };
      this.places.push(row);
    }
    map.updatedAt = now;
    this.server.changed();
    return this.place(row);
  }
  async deleteMapLocation(id: string, expectedRevision: number) {
    const userId = this.user();
    const current = this.places.find((l) => l.id === id);
    if (
      !current ||
      !this.server.member(current.campaignId, userId) ||
      (current.secret && !this.server.isMaster(current.campaignId, userId))
    )
      return;
    if (current.revision !== expectedRevision)
      throw new Error(
        "Este local mudou enquanto você editava. Abra novamente para conferir a versão atual.",
      );
    this.state.locations = this.places.filter((l) => l !== current);
    this.server.changed();
  }
  async uploadMapFile(path: string, file: Blob) {
    if (!this.server.isMaster(path.split("/")[0], this.user()))
      throw new Error("Apenas o mestre envia imagens de mapas.");
    this.server.files.set(path, file);
  }
  async downloadMapFile(path: string) {
    this.requireMember(path.split("/")[0]);
    const file = this.server.files.get(path);
    if (!file) throw new Error("Imagem do mapa indisponível.");
    return file;
  }
  async removeMapFiles(campaignId: string, assetId: string) {
    if (!this.server.isMaster(campaignId, this.user())) return;
    for (const path of [...this.server.files.keys()])
      if (path.startsWith(`${campaignId}/${assetId}/`))
        this.server.files.delete(path);
  }
  subscribe(listener: () => void) {
    return this.server.listen(listener);
  }
}
