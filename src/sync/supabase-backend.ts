import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Character, HistoryEvent } from "../domain/types";
import type {
  Campaign,
  CampaignNote,
  PullResult,
  RemoteBackend,
  RemoteCharacter,
  RemoteEvent,
  Role,
  SaveInput,
  SaveResult,
  Session,
} from "./types";

interface CharacterRow {
  id: string;
  owner_id: string;
  owner_name?: string | null;
  owner?: { display_name: string } | null;
  campaign_id: string | null;
  revision: number;
  data: Character;
  updated_at: string;
  deleted_at: string | null;
}
interface EventRow {
  id: string;
  character_id: string;
  author_id: string | null;
  author?: { display_name: string } | null;
  data: HistoryEvent;
  updated_at: string;
}
const PAGE = 1000;
const NAME_KEY = "tormenta-account-name";
const MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [
    /already registered|already been registered/i,
    "Este e-mail já tem uma conta.",
  ],
  [
    /email not confirmed/i,
    "Confirme seu e-mail pelo link enviado antes de entrar.",
  ],
  [
    /password should be at least/i,
    "A senha precisa ter ao menos 6 caracteres.",
  ],
  [/unable to validate email|invalid email/i, "E-mail inválido."],
  [/rate limit/i, "Muitas tentativas. Aguarde alguns minutos e tente de novo."],
];
function fail(error: { message: string } | null): never | void {
  if (!error) return;
  const known = MESSAGES.find(([pattern]) => pattern.test(error.message));
  throw new Error(known ? known[1] : error.message);
}
const character = (row: CharacterRow): RemoteCharacter => ({
  id: row.id,
  ownerId: row.owner_id,
  ownerName: row.owner?.display_name ?? row.owner_name ?? "Jogador",
  campaignId: row.campaign_id,
  revision: row.revision,
  data: row.data,
  updatedAt: row.updated_at,
  deleted: !!row.deleted_at,
});
const event = (row: EventRow): RemoteEvent => ({
  id: row.id,
  characterId: row.character_id,
  authorId: row.author_id,
  authorName: row.author?.display_name ?? null,
  data: row.data,
  updatedAt: row.updated_at,
});
const later = (a: string | null, b: string) => (!a || b > a ? b : a);

export class SupabaseBackend implements RemoteBackend {
  readonly kind = "supabase" as const;
  // Loaded on demand so local-only installs do not download the client.
  private readonly client: Promise<SupabaseClient>;
  constructor(url: string, key: string) {
    this.client = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true },
      }),
    );
  }
  private sb() {
    return this.client;
  }
  private async userId() {
    const { data } = await (await this.sb()).auth.getSession();
    if (!data.session) throw new Error("Entre na sua conta para continuar.");
    return data.session.user.id;
  }
  // Works offline: the profile name is cached after the first fetch.
  private async toSession(user: User | null): Promise<Session | null> {
    if (!user) return null;
    const email = user.email ?? "";
    let name = "";
    try {
      const { data } = await (
        await this.sb()
      )
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      name = data?.display_name ?? "";
      if (name) localStorage.setItem(`${NAME_KEY}:${user.id}`, name);
    } catch {
      // Offline; fall back to the cached or registered name.
    }
    let cached: string | null = null;
    try {
      cached = localStorage.getItem(`${NAME_KEY}:${user.id}`);
    } catch {
      // Storage blocked or unavailable.
    }
    name ||= cached ?? user.user_metadata?.display_name ?? email.split("@")[0];
    return { userId: user.id, email, name };
  }
  async getSession() {
    const { data } = await (await this.sb()).auth.getSession();
    return this.toSession(data.session?.user ?? null);
  }
  onSessionChange(listener: (session: Session | null) => void) {
    let unsubscribe = () => {};
    let active = true;
    void this.sb().then((client) => {
      if (!active) return;
      const { data } = client.auth.onAuthStateChange((change, session) => {
        if (change === "TOKEN_REFRESHED" || change === "INITIAL_SESSION")
          return;
        // Supabase calls made inside this callback would deadlock; defer.
        setTimeout(
          () =>
            void this.toSession(session?.user ?? null).then(listener, () => {}),
          0,
        );
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }
  async signUp(email: string, password: string, name: string) {
    const { data, error } = await (
      await this.sb()
    ).auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    fail(error);
    return { session: await this.toSession(data.session?.user ?? null) };
  }
  async signIn(email: string, password: string) {
    const { data, error } = await (
      await this.sb()
    ).auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    fail(error);
    return (await this.toSession(data.user))!;
  }
  async signOut() {
    fail((await (await this.sb()).auth.signOut()).error);
  }
  async updateProfile(name: string) {
    const id = await this.userId();
    fail(
      (
        await (
          await this.sb()
        )
          .from("profiles")
          .update({ display_name: name.trim() })
          .eq("id", id)
      ).error,
    );
    fail(
      (
        await (
          await this.sb()
        ).auth.updateUser({
          data: { display_name: name.trim() },
        })
      ).error,
    );
  }

  async listCampaigns(): Promise<Campaign[]> {
    const id = await this.userId();
    const { data, error } = await (
      await this.sb()
    )
      .from("campaigns")
      .select(
        "id, name, description, invite_code, updated_at, campaign_members(user_id, role, joined_at, profile:profiles(display_name))",
      );
    fail(error);
    return (data ?? []).map((row) => {
      const members = (
        row.campaign_members as unknown as {
          user_id: string;
          role: Role;
          joined_at: string;
          profile: { display_name: string } | null;
        }[]
      ).map((m) => ({
        userId: m.user_id,
        name: m.profile?.display_name ?? "Jogador",
        role: m.role,
        joinedAt: m.joined_at,
      }));
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        inviteCode: row.invite_code,
        updatedAt: row.updated_at,
        role: members.find((m) => m.userId === id)?.role ?? "player",
        members,
      };
    });
  }
  private async rpc<T>(name: string, args: Record<string, unknown>) {
    const { data, error } = await (await this.sb()).rpc(name, args);
    fail(error);
    return data as T;
  }
  createCampaign(name: string, description: string) {
    return this.rpc<string>("create_campaign", {
      p_name: name,
      p_description: description,
    });
  }
  async updateCampaign(id: string, name: string, description: string) {
    if (!name.trim()) throw new Error("Dê um nome à campanha.");
    fail(
      (
        await (
          await this.sb()
        )
          .from("campaigns")
          .update({
            name: name.trim(),
            description: description.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
      ).error,
    );
  }
  joinCampaign(code: string) {
    return this.rpc<string>("join_campaign", { p_code: code });
  }
  async leaveCampaign(id: string) {
    await this.rpc("leave_campaign", { p_campaign: id });
  }
  async removeMember(campaignId: string, userId: string) {
    await this.rpc("remove_member", { p_campaign: campaignId, p_user: userId });
  }
  async setMemberRole(campaignId: string, userId: string, role: Role) {
    await this.rpc("set_member_role", {
      p_campaign: campaignId,
      p_user: userId,
      p_role: role,
    });
  }
  regenerateInvite(campaignId: string) {
    return this.rpc<string>("regenerate_invite", { p_campaign: campaignId });
  }

  // PostgREST caps each response; read every page.
  private async all<T>(
    query: (
      from: number,
      to: number,
    ) => PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>,
  ) {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await query(from, from + PAGE - 1);
      fail(error);
      const page = (data ?? []) as T[];
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }
  async pull(cursor: string | null): Promise<PullResult> {
    const id = await this.userId();
    const client = await this.sb();
    const characters = await this.all<CharacterRow>((from, to) => {
      let query = client
        .from("characters")
        .select(
          "id, owner_id, campaign_id, revision, data, updated_at, deleted_at, owner:profiles(display_name)",
        );
      if (cursor) query = query.gt("updated_at", cursor);
      return query.order("updated_at").range(from, to);
    });
    const events = await this.all<EventRow>((from, to) => {
      let query = client
        .from("character_events")
        .select(
          "id, character_id, author_id, data, updated_at, characters!inner(owner_id)",
        )
        .eq("characters.owner_id", id);
      if (cursor) query = query.gt("updated_at", cursor);
      return query.order("updated_at").range(from, to);
    });
    const visibleIds = await this.rpc<string[]>("visible_party_ids", {});
    let next: string | null = null;
    for (const row of [...characters, ...events])
      next = later(next, row.updated_at);
    return {
      characters: characters.map(character),
      events: events.map(event),
      visibleIds: visibleIds ?? [],
      cursor: next,
    };
  }
  async characterEvents(characterId: string) {
    const client = await this.sb();
    const rows = await this.all<EventRow>((from, to) =>
      client
        .from("character_events")
        .select(
          "id, character_id, author_id, data, updated_at, author:profiles(display_name)",
        )
        .eq("character_id", characterId)
        .order("updated_at")
        .range(from, to),
    );
    return rows.map(event);
  }
  async saveCharacter({
    character: data,
    expectedRevision,
    events,
  }: SaveInput): Promise<SaveResult> {
    const result = await this.rpc<{
      status: SaveResult["status"];
      character?: CharacterRow;
    }>("save_character", {
      p_expected: expectedRevision,
      p_data: data,
      p_events: events,
    });
    if (result.status === "conflict")
      return { status: "conflict", character: character(result.character!) };
    return { status: result.status } as SaveResult;
  }
  async deleteCharacter(id: string) {
    await this.rpc("delete_character", { p_id: id });
  }
  async setCharacterCampaign(id: string, campaignId: string | null) {
    await this.rpc("set_character_campaign", {
      p_id: id,
      p_campaign: campaignId,
    });
  }

  async listNotes(campaignId: string): Promise<CampaignNote[]> {
    const { data, error } = await (
      await this.sb()
    )
      .from("campaign_notes")
      .select(
        "id, campaign_id, title, body, visibility, updated_at, author:profiles(display_name)",
      )
      .eq("campaign_id", campaignId)
      .order("updated_at", { ascending: false });
    fail(error);
    return (data ?? []).map((row) => ({
      id: row.id,
      campaignId: row.campaign_id,
      title: row.title,
      body: row.body,
      visibility: row.visibility,
      updatedAt: row.updated_at,
      authorName:
        (row.author as unknown as { display_name: string } | null)
          ?.display_name ?? "Mestre",
    }));
  }
  async saveNote(
    note: Pick<CampaignNote, "campaignId" | "title" | "body" | "visibility"> & {
      id?: string;
    },
  ) {
    fail(
      (
        await (await this.sb()).from("campaign_notes").upsert({
          ...(note.id ? { id: note.id } : {}),
          campaign_id: note.campaignId,
          title: note.title,
          body: note.body,
          visibility: note.visibility,
          updated_at: new Date().toISOString(),
        })
      ).error,
    );
  }
  async deleteNote(id: string) {
    fail(
      (await (await this.sb()).from("campaign_notes").delete().eq("id", id))
        .error,
    );
  }
  // Realtime applies the SELECT policies, so only readable rows notify.
  subscribe(listener: () => void) {
    let stop = () => {};
    let active = true;
    void this.sb().then((client) => {
      if (!active) return;
      // Unique name: each subscriber (sync engine, notes view) has its own.
      const channel = client.channel(`tormenta-${crypto.randomUUID()}`);
      for (const table of ["characters", "campaign_members", "campaigns"])
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => listener(),
        );
      channel.subscribe();
      stop = () => void client.removeChannel(channel);
    });
    return () => {
      active = false;
      stop();
    };
  }
}
