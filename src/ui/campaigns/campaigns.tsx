import {
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Copy,
  Crown,
  Heart,
  Link2,
  LogIn,
  Map as MapGlyph,
  Minus,
  NotebookPen,
  Plus,
  RefreshCw,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { CLASS_MAP, CONDITIONS, RACE_MAP, slug } from "../../data/rules";
import { calculate, temporaryTotal } from "../../domain/calculate";
import type { Command } from "../../domain/commands";
import type { Character, HistoryEvent } from "../../domain/types";
import { db } from "../../storage/database";
import { backend, engine, useSyncStatus } from "../../sync/backend";
import type { CachedCampaign, CampaignNote } from "../../sync/types";
import { prepareCommand, type RequestDice } from "../physical-dice";
import { ConditionModal, ResourceModal } from "../play";
import type { CampaignView } from "../reference-navigation";
import {
  AppContext,
  AsyncButton,
  Empty,
  Field,
  Modal,
  Pill,
  ReferenceContext,
  Toggle,
} from "../shared";
import { Sheet, SkillModal } from "../sheet";
import { XpAmount } from "../experience";
import { CampaignMapScreen, CampaignMapsView } from "./campaign-maps";
import "./campaigns.css";

interface Props {
  campaignId?: string;
  view?: CampaignView;
  memberCharacterId?: string;
  campaignMapId?: string;
  invite?: string;
  open: (
    campaignId?: string,
    view?: CampaignView,
    characterId?: string,
    mapId?: string,
  ) => void;
  openOwnCharacter: (id: string) => void;
  onAccount: () => void;
  notify: (text: string) => void;
  requestDice: RequestDice;
}
type Action =
  | { kind: "resource"; mode: "damage" | "hp" | "mp" | "rest"; id: string }
  | { kind: "condition"; id: string }
  | { kind: "skill"; skillId: string; id: string };
// A character shown in a campaign: another member's (party) or the user's own.
interface Seat {
  character: Character;
  ownerName: string;
  own: boolean;
}

const classesOf = (c: Character) =>
  [...new Set(c.levels.map((l) => l.classId))]
    .map(
      (id) =>
        `${CLASS_MAP.get(id)?.name ?? id} ${c.levels.filter((l) => l.classId === id).length}`,
    )
    .join(" / ");
const conditionName = (id: string) =>
  CONDITIONS.find((e) => slug(e.name) === id)?.name ?? id;

export default function Campaigns(props: Props) {
  const status = useSyncStatus();
  const session = status.session;
  if (!backend || !engine)
    return (
      <Empty icon={<Users size={30} />} heading="Campanhas indisponíveis">
        Esta instalação ainda não tem um servidor configurado.
      </Empty>
    );
  if (status.state === "ready")
    return <p role="status">Verificando sua conta…</p>;
  if (!session)
    return (
      <div className="campaigns-page">
        <Empty
          icon={<Users size={30} />}
          heading={
            props.invite
              ? "Você recebeu um convite para uma campanha"
              : "Jogue em grupo"
          }
          action={
            <button className="button primary" onClick={props.onAccount}>
              <LogIn size={16} />
              Entrar ou criar conta
            </button>
          }
        >
          Com uma conta, você cria campanhas, convida seu grupo e acompanha as
          fichas de todos. O mestre tem uma visão geral da mesa.
        </Empty>
      </div>
    );
  return props.campaignId ? (
    <CampaignPage {...props} campaignId={props.campaignId} />
  ) : (
    <CampaignList {...props} />
  );
}

function CampaignList({ open, invite, notify }: Props) {
  const accountId = useSyncStatus().session!.userId;
  const campaigns = useLiveQuery(
    () => db.campaigns.where("accountId").equals(accountId).sortBy("name"),
    [accountId],
  );
  const [dialog, setDialog] = useState<"create" | "join" | null>(
    invite ? "join" : null,
  );
  return (
    <div className="campaigns-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MESA COMPARTILHADA</span>
          <h1>Campanhas</h1>
          <p>Seu grupo, suas fichas e a visão do mestre no mesmo lugar.</p>
        </div>
        <div className="heading-actions">
          <button className="button" onClick={() => setDialog("join")}>
            <Link2 size={15} />
            Entrar com convite
          </button>
          <button
            className="button primary"
            onClick={() => setDialog("create")}
          >
            <Plus size={16} />
            Nova campanha
          </button>
        </div>
      </div>
      {campaigns?.length === 0 && (
        <Empty icon={<Users size={30} />} heading="Nenhuma campanha ainda">
          Crie uma campanha para mestrar ou peça ao seu mestre o código de
          convite.
        </Empty>
      )}
      <div className="campaign-grid">
        {campaigns?.map((c) => (
          <button
            key={c.id}
            className="campaign-card"
            onClick={() => open(c.id)}
          >
            <span className="campaign-card-role">
              {c.role === "master" ? (
                <Pill tone="gold">
                  <Crown size={13} />
                  Mestre
                </Pill>
              ) : (
                <Pill>Jogador</Pill>
              )}
            </span>
            <strong>{c.name}</strong>
            {c.description && <p>{c.description}</p>}
            <small>
              <Users size={13} />
              {c.members.length}{" "}
              {c.members.length === 1 ? "participante" : "participantes"}
            </small>
          </button>
        ))}
      </div>
      {dialog === "create" && (
        <CreateCampaign
          onClose={() => setDialog(null)}
          onCreated={(id) => {
            setDialog(null);
            notify("Campanha criada. Convide seu grupo em Participantes.");
            open(id, "members");
          }}
        />
      )}
      {dialog === "join" && (
        <JoinCampaign
          initial={invite ?? ""}
          onClose={() => setDialog(null)}
          onJoined={(id) => {
            setDialog(null);
            notify("Você entrou na campanha.");
            open(id, "party");
          }}
        />
      )}
    </div>
  );
}

function CreateCampaign({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Modal
      title="Nova campanha"
      subtitle="Você será o mestre"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            disabled={!name.trim()}
            action={async () =>
              onCreated(await engine!.createCampaign(name, description))
            }
          >
            Criar campanha
          </AsyncButton>
        </>
      }
    >
      <Field label="Nome da campanha">
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Descrição" hint="Opcional. Aparece para o grupo.">
        <textarea
          value={description}
          maxLength={2000}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

function JoinCampaign({
  initial,
  onClose,
  onJoined,
}: {
  initial: string;
  onClose: () => void;
  onJoined: (id: string) => void;
}) {
  const [code, setCode] = useState(initial);
  return (
    <Modal
      title="Entrar em uma campanha"
      subtitle="Convite do mestre"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            disabled={code.trim().length < 4}
            action={async () => onJoined(await engine!.joinCampaign(code))}
          >
            Entrar na campanha
          </AsyncButton>
        </>
      }
    >
      <Field label="Código de convite">
        <input
          className="invite-input"
          value={code}
          maxLength={20}
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoFocus
        />
      </Field>
    </Modal>
  );
}

// Characters of a campaign: other members' from the cache, plus the user's own.
function useSeats(campaign: CachedCampaign | undefined) {
  return useLiveQuery(async () => {
    if (!campaign) return [];
    const party = await db.party
      .where("campaignId")
      .equals(campaign.id)
      .toArray();
    const links = await db.characterSync
      .where("accountId")
      .equals(campaign.accountId)
      .filter((s) => s.campaignId === campaign.id)
      .toArray();
    const own = (await db.characters.bulkGet(links.map((l) => l.id))).filter(
      (c): c is Character => !!c,
    );
    const me = campaign.members.find((m) => m.userId === campaign.accountId);
    const seats: Seat[] = [
      ...own.map((character) => ({
        character,
        ownerName: me?.name ?? "Você",
        own: true,
      })),
      ...party
        .filter((p) => p.accountId === campaign.accountId)
        .map((p) => ({
          character: p.data,
          ownerName: p.ownerName,
          own: false,
        })),
    ];
    return seats.sort((a, b) =>
      a.character.name.localeCompare(b.character.name, "pt-BR"),
    );
  }, [campaign?.id, campaign?.accountId, JSON.stringify(campaign?.members)]);
}

function CampaignPage(props: Props & { campaignId: string }) {
  const { campaignId, open, notify, requestDice } = props;
  const accountId = useSyncStatus().session!.userId;
  // null: not found; undefined: still loading.
  const campaign = useLiveQuery(
    async () => (await db.campaigns.get(campaignId)) ?? null,
    [campaignId],
  );
  const seats = useSeats(
    campaign?.accountId === accountId ? campaign : undefined,
  );
  const [action, setAction] = useState<Action | null>(null);
  if (campaign === undefined) return null;
  if (!campaign || campaign.accountId !== accountId)
    return (
      <Empty
        icon={<Users size={30} />}
        heading="Campanha indisponível"
        action={
          <button className="button" onClick={() => open()}>
            Ver minhas campanhas
          </button>
        }
      >
        Você não participa desta campanha ou ela foi encerrada.
      </Empty>
    );
  const master = campaign.role === "master";
  const view = props.view ?? (master ? "table" : "party");
  const views: [CampaignView, string, ReactNode][] = [
    ...(master
      ? [
          ["table", "Mesa", <Swords size={16} key="i" />] as [
            CampaignView,
            string,
            ReactNode,
          ],
        ]
      : []),
    ["party", "Grupo", <Users size={16} key="i" />],
    ["maps", "Mapas", <MapGlyph size={16} key="i" />],
    ["notes", master ? "Notas" : "Diário", <NotebookPen size={16} key="i" />],
    ["members", "Participantes", <Crown size={16} key="i" />],
  ];
  if (props.campaignMapId)
    return (
      <CampaignMapScreen
        campaign={campaign}
        mapId={props.campaignMapId}
        onBack={() => open(campaign.id, "maps")}
        notify={notify}
      />
    );
  const memberSeat = seats?.find(
    (s) => !s.own && s.character.id === props.memberCharacterId,
  );
  if (props.memberCharacterId)
    return memberSeat ? (
      <MemberContext
        seat={memberSeat}
        master={master}
        notify={notify}
        requestDice={requestDice}
      >
        <MemberSheet
          seat={memberSeat}
          campaign={campaign}
          onBack={() => open(campaign.id, view)}
        />
      </MemberContext>
    ) : (
      <Empty
        icon={<Users size={30} />}
        heading="Ficha indisponível"
        action={
          <button className="button" onClick={() => open(campaign.id, view)}>
            Voltar à campanha
          </button>
        }
      >
        Este personagem não está mais nesta campanha.
      </Empty>
    );
  const openSeat = (seat: Seat) =>
    seat.own
      ? props.openOwnCharacter(seat.character.id)
      : open(campaign.id, view, seat.character.id);
  const actionSeat = seats?.find((s) => s.character.id === action?.id);
  return (
    <div className="campaigns-page">
      <button className="text-button back-link" onClick={() => open()}>
        <ArrowLeft size={15} />
        Campanhas
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {master ? "VOCÊ É O MESTRE" : "CAMPANHA"}
          </span>
          <h1>{campaign.name}</h1>
          {campaign.description && <p>{campaign.description}</p>}
        </div>
      </div>
      <nav className="campaign-tabs" aria-label="Seções da campanha">
        {views.map(([id, label, icon]) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            aria-current={view === id ? "page" : undefined}
            onClick={() => open(campaign.id, id)}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
      {view === "table" && master && (
        <MasterTable
          seats={seats ?? []}
          onOpen={openSeat}
          onAction={setAction}
          notify={notify}
        />
      )}
      {view === "party" && (
        <PartyView campaign={campaign} seats={seats ?? []} onOpen={openSeat} />
      )}
      {view === "maps" && (
        <CampaignMapsView
          campaign={campaign}
          notify={notify}
          onOpen={(mapId) => open(campaign.id, "maps", undefined, mapId)}
        />
      )}
      {view === "notes" && <NotesView campaign={campaign} />}
      {view === "members" && (
        <MembersView campaign={campaign} onLeft={() => open()} />
      )}
      {action && actionSeat && !actionSeat.own && (
        <MemberContext
          seat={actionSeat}
          master={master}
          notify={notify}
          requestDice={requestDice}
        >
          {action.kind === "resource" ? (
            <ResourceModal mode={action.mode} onClose={() => setAction(null)} />
          ) : action.kind === "condition" ? (
            <ConditionModal onClose={() => setAction(null)} />
          ) : (
            <SkillModal
              skillId={action.skillId}
              onClose={() => setAction(null)}
            />
          )}
        </MemberContext>
      )}
    </div>
  );
}

// Makes the regular sheet components work on another member's character:
// the master's changes go to the server, everyone else only reads.
function MemberContext({
  seat,
  master,
  notify,
  requestDice,
  children,
}: {
  seat: Seat;
  master: boolean;
  notify: (text: string) => void;
  requestDice: RequestDice;
  children: ReactNode;
}) {
  const reference = useContext(ReferenceContext)!;
  const character = seat.character;
  const commit = useCallback(
    async (command: Command) => {
      if (!master) throw new Error("Somente o dono pode alterar esta ficha.");
      try {
        const prepared = await prepareCommand(character, command, requestDice);
        const event = await engine!.applyToParty(character.id, prepared);
        notify(
          `${character.name} · ${event.title}${event.detail ? `: ${event.detail}` : ""}`,
        );
      } catch (e) {
        notify((e as Error).message);
        throw e;
      }
    },
    [character, master, notify, requestDice],
  );
  return (
    <AppContext.Provider
      value={{
        character,
        commit,
        notify,
        openEntry: reference.openEntry,
        openBook: reference.openBook,
        access: master ? "master" : "viewer",
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

function Meter({
  kind,
  value,
  max,
  temporary,
}: {
  kind: "hp" | "mp";
  value: number;
  max: number;
  temporary: number;
}) {
  const label = kind === "hp" ? "PV" : "PM";
  return (
    <div className={`party-meter ${kind}`}>
      <span>
        {kind === "hp" ? <Heart size={14} /> : <Sparkles size={14} />}
        {label}
      </span>
      <div
        className="resource-track"
        role="progressbar"
        aria-label={`${label}: ${value} de ${max}`}
        aria-valuemin={Math.min(0, value)}
        aria-valuemax={Math.max(max, value)}
        aria-valuenow={value}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`,
          }}
        />
      </div>
      <b>
        {value}/{max}
        {temporary > 0 && <small> +{temporary}</small>}
      </b>
    </div>
  );
}

function SeatCard({
  seat,
  onOpen,
  children,
}: {
  seat: Seat;
  onOpen: () => void;
  children?: ReactNode;
}) {
  const c = seat.character;
  const d = calculate(c);
  const down = c.hp <= 0;
  return (
    <article className="party-card" data-down={down || undefined}>
      <button className="party-card-title" onClick={onOpen}>
        <span className="party-monogram" aria-hidden="true">
          {c.name.slice(0, 1).toUpperCase()}
        </span>
        <span>
          <strong>{c.name}</strong>
          <small>
            {seat.ownerName}
            {seat.own ? " · você" : ""}
          </small>
        </span>
      </button>
      <p className="party-card-line">
        {RACE_MAP.get(c.raceId)?.name} · {classesOf(c)} · nível{" "}
        {c.levels.length}
      </p>
      <Meter
        kind="hp"
        value={c.hp}
        max={d.hp.total}
        temporary={temporaryTotal(c, "hp")}
      />
      <Meter
        kind="mp"
        value={c.mp}
        max={d.mp.total}
        temporary={temporaryTotal(c, "mp")}
      />
      <div className="party-card-stats">
        <span>
          <Shield size={14} />
          Defesa <b>{d.defense.total}</b>
        </span>
        {c.combat.active && (
          <span>
            <Swords size={14} />
            Iniciativa <b>{c.combat.initiative}</b>
          </span>
        )}
        {down && <Pill tone="red">Caído</Pill>}
      </div>
      {d.conditions.length > 0 && (
        <div className="condition-pills">
          {d.conditions.map((id) => (
            <Pill key={id} tone="red">
              {conditionName(id)}
            </Pill>
          ))}
        </div>
      )}
      {children}
    </article>
  );
}

function MasterTable({
  seats,
  onOpen,
  onAction,
  notify,
}: {
  notify: (text: string) => void;
  seats: Seat[];
  onOpen: (seat: Seat) => void;
  onAction: (action: Action) => void;
}) {
  const inCombat = seats.some((s) => s.character.combat.active);
  const ordered = inCombat
    ? [...seats].sort(
        (a, b) =>
          Number(b.character.combat.active) -
            Number(a.character.combat.active) ||
          b.character.combat.initiative - a.character.combat.initiative,
      )
    : seats;
  const players = seats.filter((s) => !s.own);
  const [granting, setGranting] = useState(false);
  return (
    <section aria-label="Mesa do mestre">
      {granting && (
        <GroupExperience
          seats={players}
          notify={notify}
          onClose={() => setGranting(false)}
        />
      )}
      <div className="table-summary">
        <span>
          <Users size={15} />
          {players.length} {players.length === 1 ? "personagem" : "personagens"}
        </span>
        {players.length > 0 && (
          <span>
            Nível médio{" "}
            {Math.round(
              players.reduce((n, s) => n + s.character.levels.length, 0) /
                players.length,
            )}
          </span>
        )}
        {inCombat && <Pill tone="red">Em combate · ordem de iniciativa</Pill>}
        {players.length > 0 && (
          <button className="button small" onClick={() => setGranting(true)}>
            <Sparkles size={14} />
            Conceder XP
          </button>
        )}
        <button
          className="text-button"
          onClick={() => void engine!.sync().catch(() => {})}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>
      {!seats.length && (
        <Empty icon={<Users size={30} />} heading="A mesa está vazia">
          Convide o grupo em Participantes. Cada jogador escolhe o personagem
          que leva para a campanha, e as fichas aparecem aqui.
        </Empty>
      )}
      <div className="party-grid">
        {ordered.map((seat) => (
          <SeatCard
            key={seat.character.id}
            seat={seat}
            onOpen={() => onOpen(seat)}
          >
            {!seat.own && (
              <div className="party-actions">
                <button
                  className="button small"
                  onClick={() =>
                    onAction({
                      kind: "resource",
                      mode: "damage",
                      id: seat.character.id,
                    })
                  }
                >
                  <Minus size={14} />
                  Dano
                </button>
                <button
                  className="button small"
                  onClick={() =>
                    onAction({
                      kind: "resource",
                      mode: "hp",
                      id: seat.character.id,
                    })
                  }
                >
                  <Plus size={14} />
                  Curar
                </button>
                <button
                  className="button small"
                  onClick={() =>
                    onAction({
                      kind: "resource",
                      mode: "mp",
                      id: seat.character.id,
                    })
                  }
                >
                  <Sparkles size={14} />
                  PM
                </button>
                <button
                  className="button small"
                  onClick={() =>
                    onAction({ kind: "condition", id: seat.character.id })
                  }
                >
                  Condição
                </button>
              </div>
            )}
          </SeatCard>
        ))}
      </div>
    </section>
  );
}

// The master awards the same experience to several characters at once.
function GroupExperience({
  seats,
  notify,
  onClose,
}: {
  seats: Seat[];
  notify: (text: string) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState("");
  const [chosen, setChosen] = useState(() => seats.map((s) => s.character.id));
  const [failures, setFailures] = useState<string[]>([]);
  return (
    <Modal
      title="Conceder experiência"
      subtitle="Mesa do mestre"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            disabled={!chosen.length || !reason.trim() || !amount}
            action={async () => {
              const failed: string[] = [];
              let done = 0;
              for (const seat of seats.filter((s) =>
                chosen.includes(s.character.id),
              ))
                try {
                  await engine!.applyToParty(seat.character.id, {
                    type: "xp",
                    amount,
                    reason,
                  });
                  done++;
                } catch (e) {
                  failed.push(
                    `${seat.character.name}: ${(e as Error).message}`,
                  );
                }
              setFailures(failed);
              if (done)
                notify(
                  `${amount.toLocaleString("pt-BR")} XP para ${done} ${done === 1 ? "personagem" : "personagens"}.`,
                );
              if (!failed.length) onClose();
              else
                setChosen(
                  seats
                    .filter((s) =>
                      failed.some((f) => f.startsWith(s.character.name)),
                    )
                    .map((s) => s.character.id),
                );
            }}
          >
            <Sparkles size={16} />
            Conceder XP
          </AsyncButton>
        </>
      }
    >
      {failures.length > 0 && (
        <div className="notice danger" role="alert">
          <strong>Alguns personagens não receberam</strong>
          <ul>
            {failures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      <XpAmount value={amount} onChange={setAmount} />
      <Field label="Motivo">
        <input
          value={reason}
          maxLength={200}
          placeholder="Resgataram o prefeito de Valkaria"
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <fieldset className="xp-targets">
        <legend>Personagens</legend>
        {seats.map((seat) => (
          <Toggle
            key={seat.character.id}
            label={`${seat.character.name} · ${seat.ownerName} · ${seat.character.xp.toLocaleString("pt-BR")} XP`}
            checked={chosen.includes(seat.character.id)}
            onChange={(on) =>
              setChosen(
                on
                  ? [...chosen, seat.character.id]
                  : chosen.filter((id) => id !== seat.character.id),
              )
            }
          />
        ))}
      </fieldset>
    </Modal>
  );
}

function PartyView({
  campaign,
  seats,
  onOpen,
}: {
  campaign: CachedCampaign;
  seats: Seat[];
  onOpen: (seat: Seat) => void;
}) {
  return (
    <section aria-label="Grupo">
      <MyCharacterPicker campaign={campaign} />
      {!seats.length && (
        <Empty icon={<Users size={30} />} heading="Nenhum personagem ainda">
          Quando os jogadores levarem seus personagens para a campanha, as
          fichas aparecem aqui.
        </Empty>
      )}
      <div className="party-grid">
        {seats.map((seat) => (
          <SeatCard
            key={seat.character.id}
            seat={seat}
            onOpen={() => onOpen(seat)}
          />
        ))}
      </div>
    </section>
  );
}

// Lets the user bring one of their characters into (or out of) the campaign.
function MyCharacterPicker({ campaign }: { campaign: CachedCampaign }) {
  const mine = useLiveQuery(async () => {
    const links = new Map(
      (await db.characterSync.toArray()).map((s) => [s.id, s]),
    );
    return (await db.characters.orderBy("name").toArray())
      .filter((c) => {
        const link = links.get(c.id);
        return !link || link.accountId === campaign.accountId;
      })
      .map((c) => ({ character: c, link: links.get(c.id) }));
  }, [campaign.accountId]);
  const [choice, setChoice] = useState("");
  if (!mine) return null;
  const here = mine.filter((m) => m.link?.campaignId === campaign.id);
  const available = mine.filter((m) => m.link?.campaignId !== campaign.id);
  const selected = choice || available[0]?.character.id || "";
  const chosen = available.find((m) => m.character.id === selected);
  if (campaign.role === "master" && !here.length && !available.length)
    return null;
  return (
    <div className="panel my-character">
      <div className="panel-heading">
        <h3>
          <ScrollText size={17} />
          {campaign.role === "master"
            ? "Seus personagens nesta campanha"
            : "Seu personagem nesta campanha"}
        </h3>
      </div>
      {here.map(({ character }) => (
        <div className="row between" key={character.id}>
          <span>
            <strong>{character.name}</strong> está na campanha.
          </span>
          <AsyncButton
            className="button small"
            action={() => engine!.setCharacterCampaign(character.id, null)}
          >
            Retirar
          </AsyncButton>
        </div>
      ))}
      {available.length > 0 ? (
        <div className="row my-character-choice">
          <select
            aria-label="Personagem para levar à campanha"
            value={selected}
            onChange={(e) => setChoice(e.target.value)}
          >
            {available.map(({ character, link }) => (
              <option key={character.id} value={character.id}>
                {character.name}
                {link?.campaignId ? " (em outra campanha)" : ""}
                {!link ? " (só neste aparelho)" : ""}
              </option>
            ))}
          </select>
          <AsyncButton
            className="button primary small"
            action={async () => {
              if (!chosen) return;
              // Local-only characters are uploaded to the account first.
              if (!chosen.link)
                await engine!.linkCharacters([chosen.character.id]);
              await engine!.setCharacterCampaign(
                chosen.character.id,
                campaign.id,
              );
              setChoice("");
            }}
          >
            Levar para a campanha
          </AsyncButton>
        </div>
      ) : (
        !here.length && (
          <p className="muted">
            Crie um personagem para levá-lo a esta campanha.
          </p>
        )
      )}
      <small className="muted">
        O grupo vê sua ficha; o mestre também pode aplicar dano, cura e
        condições, que ficam no seu histórico e podem ser desfeitos.
      </small>
    </div>
  );
}

function MemberSheet({
  seat,
  campaign,
  onBack,
}: {
  seat: Seat;
  campaign: CachedCampaign;
  onBack: () => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const master = campaign.role === "master";
  const c = seat.character;
  const close = () => setAction(null);
  return (
    <div className="member-sheet">
      <button className="text-button back-link" onClick={onBack}>
        <ArrowLeft size={15} />
        {campaign.name}
      </button>
      <section className="character-banner">
        <div className="character-monogram" aria-hidden="true">
          <Shield className="character-crest" strokeWidth={1} />
          <span>{c.name.slice(0, 1).toUpperCase()}</span>
        </div>
        <div className="character-banner-title">
          <span className="character-caption">
            {master ? "FICHA DO JOGADOR · VISÃO DO MESTRE" : "FICHA DO GRUPO"}
          </span>
          <h2>{c.name}</h2>
          <p>
            {RACE_MAP.get(c.raceId)?.name}
            <span>·</span>
            {classesOf(c)}
            <span>·</span>
            {seat.ownerName}
          </p>
        </div>
        <div className="level-seal">
          <strong>{c.levels.length}</strong>
          <span>NÍVEL</span>
        </div>
      </section>
      <div className="notice compact-notice">
        {master
          ? "Você pode aplicar dano, cura, PM e condições. Escolhas do personagem continuam com o jogador."
          : "Somente leitura. Apenas o jogador altera esta ficha."}
      </div>
      <Sheet
        onResource={(mode) => setAction({ kind: "resource", mode, id: c.id })}
        onAttack={() => {}}
        onCondition={() => setAction({ kind: "condition", id: c.id })}
        onEdit={() => {}}
        onSkill={(skillId) => setAction({ kind: "skill", skillId, id: c.id })}
      />
      {master && <RecentHistory characterId={c.id} revision={c.revision} />}
      {action?.kind === "resource" && (
        <ResourceModal mode={action.mode} onClose={close} />
      )}
      {action?.kind === "condition" && <ConditionModal onClose={close} />}
      {action?.kind === "skill" && (
        <SkillModal skillId={action.skillId} onClose={close} />
      )}
    </div>
  );
}

function RecentHistory({
  characterId,
  revision,
}: {
  characterId: string;
  revision: number;
}) {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  useEffect(() => {
    let active = true;
    backend!
      .characterEvents(characterId)
      .then((rows) => {
        if (active)
          setEvents(
            rows
              .map((r) => r.data)
              .sort((a, b) => b.at.localeCompare(a.at))
              .slice(0, 12),
          );
      })
      .catch(() => active && setEvents([]));
    return () => {
      active = false;
    };
  }, [characterId, revision]);
  return (
    <section className="panel recent-history">
      <div className="panel-heading">
        <h3>
          <ScrollText size={17} />
          Diário recente
        </h3>
      </div>
      {events === null ? (
        <p className="muted">Carregando…</p>
      ) : events.length ? (
        <ul>
          {events.map((e) => (
            <li key={e.id} className={e.undone ? "undone" : ""}>
              <strong>{e.title}</strong>
              {e.detail && <span>{e.detail}</span>}
              <small>
                {new Date(e.at).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
                {e.author ? ` · por ${e.author}` : ""}
                {e.undone ? " · desfeito" : ""}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Sem registros disponíveis.</p>
      )}
    </section>
  );
}

function MembersView({
  campaign,
  onLeft,
}: {
  campaign: CachedCampaign;
  onLeft: () => void;
}) {
  const master = campaign.role === "master";
  const [copied, setCopied] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description);
  const [leaving, setLeaving] = useState(false);
  const link = `${location.origin}/#campaigns?invite=${campaign.inviteCode}`;
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied("");
    }
  };
  const members = [...campaign.members].sort(
    (a, b) =>
      Number(b.role === "master") - Number(a.role === "master") ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
  return (
    <section className="members-view" aria-label="Participantes">
      <div className="panel invite-panel">
        <div className="panel-heading">
          <h3>
            <Link2 size={17} />
            Convite
          </h3>
          {master && (
            <AsyncButton
              className="text-button"
              action={() => engine!.regenerateInvite(campaign.id)}
            >
              <RefreshCw size={14} />
              Gerar novo código
            </AsyncButton>
          )}
        </div>
        <p className="muted">
          Envie o link ou o código para o grupo. Quem entra participa como
          jogador.
        </p>
        <div className="invite-code" aria-label="Código de convite">
          {campaign.inviteCode}
        </div>
        <div className="row">
          <button className="button" onClick={() => void copy(link, "link")}>
            <Copy size={15} />
            {copied === "link" ? "Link copiado" : "Copiar link"}
          </button>
          <button
            className="button"
            onClick={() => void copy(campaign.inviteCode, "code")}
          >
            <Copy size={15} />
            {copied === "code" ? "Código copiado" : "Copiar código"}
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <h3>
            <Users size={17} />
            Participantes
          </h3>
          <span className="muted">{members.length}</span>
        </div>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.userId}>
              <span>
                <strong>{m.name}</strong>
                {m.userId === campaign.accountId && <small> · você</small>}
              </span>
              {m.role === "master" ? (
                <Pill tone="gold">
                  <Crown size={13} />
                  Mestre
                </Pill>
              ) : (
                <Pill>Jogador</Pill>
              )}
              {master && m.userId !== campaign.accountId && (
                <span className="member-actions">
                  <AsyncButton
                    className="text-button"
                    action={() =>
                      engine!.setMemberRole(
                        campaign.id,
                        m.userId,
                        m.role === "master" ? "player" : "master",
                      )
                    }
                  >
                    {m.role === "master" ? "Tornar jogador" : "Tornar mestre"}
                  </AsyncButton>
                  <AsyncButton
                    className="icon-button"
                    action={async () => {
                      if (confirm(`Remover ${m.name} da campanha?`))
                        await engine!.removeMember(campaign.id, m.userId);
                    }}
                  >
                    <UserMinus size={16} aria-label={`Remover ${m.name}`} />
                  </AsyncButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {master && (
        <div className="panel">
          <div className="panel-heading">
            <h3>Dados da campanha</h3>
            {!editing && (
              <button className="text-button" onClick={() => setEditing(true)}>
                Editar
              </button>
            )}
          </div>
          {!editing && (
            <p className="muted">
              <strong>{campaign.name}</strong>
              <br />
              {campaign.description || "Sem descrição."}
            </p>
          )}
          {editing && (
            <>
              <Field label="Nome">
                <input
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Descrição">
                <textarea
                  rows={3}
                  value={description}
                  maxLength={2000}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <div className="row">
                <button className="button" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
                <AsyncButton
                  disabled={!name.trim()}
                  action={async () => {
                    await engine!.updateCampaign(
                      campaign.id,
                      name,
                      description,
                    );
                    setEditing(false);
                  }}
                >
                  Salvar
                </AsyncButton>
              </div>
            </>
          )}
        </div>
      )}
      <div className="leave-campaign">
        {leaving ? (
          <div className="notice danger">
            <p>
              {campaign.members.length === 1
                ? "Você é o único participante: a campanha e as notas serão excluídas."
                : "Seus personagens saem da campanha junto com você. As fichas continuam na sua conta."}
            </p>
            <div className="row">
              <button className="button" onClick={() => setLeaving(false)}>
                Cancelar
              </button>
              <AsyncButton
                action={async () => {
                  await engine!.leaveCampaign(campaign.id);
                  onLeft();
                }}
              >
                Sair da campanha
              </AsyncButton>
            </div>
          </div>
        ) : (
          <button className="text-button" onClick={() => setLeaving(true)}>
            Sair da campanha
          </button>
        )}
      </div>
    </section>
  );
}

function NotesView({ campaign }: { campaign: CachedCampaign }) {
  const master = campaign.role === "master";
  const [notes, setNotes] = useState<CampaignNote[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Partial<CampaignNote> | null>(null);
  const load = useCallback(async () => {
    try {
      setNotes(await backend!.listNotes(campaign.id));
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setNotes((current) => current ?? []);
    }
  }, [campaign.id]);
  useEffect(() => {
    void load();
    return backend!.subscribe(() => void load());
  }, [load]);
  const journal = notes?.filter((n) => n.visibility === "all") ?? [];
  const secret = notes?.filter((n) => n.visibility === "master") ?? [];
  const list = (items: CampaignNote[]) =>
    items.map((n) => (
      <article className="note-card" key={n.id}>
        <div className="row between">
          <h4>{n.title || "Sem título"}</h4>
          {master && (
            <span className="row">
              <button className="text-button" onClick={() => setEditing(n)}>
                Editar
              </button>
              <AsyncButton
                className="icon-button"
                action={async () => {
                  if (!confirm(`Excluir “${n.title || "Sem título"}”?`)) return;
                  await backend!.deleteNote(n.id);
                  await load();
                }}
              >
                <Trash2 size={15} aria-label="Excluir nota" />
              </AsyncButton>
            </span>
          )}
        </div>
        <p>{n.body}</p>
        <small className="muted">
          {n.authorName} ·{" "}
          {new Date(n.updatedAt).toLocaleString("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </small>
      </article>
    ));
  return (
    <section className="notes-view" aria-label="Notas da campanha">
      {error && (
        <div className="notice danger">
          Não foi possível carregar as notas: {error}
        </div>
      )}
      {master && (
        <div className="row">
          <button
            className="button primary"
            onClick={() =>
              setEditing({ title: "", body: "", visibility: "all" })
            }
          >
            <Plus size={16} />
            Nova nota
          </button>
        </div>
      )}
      <div className="panel">
        <div className="panel-heading">
          <h3>
            <NotebookPen size={17} />
            Diário da campanha
          </h3>
          <span className="muted">Visível para o grupo</span>
        </div>
        {notes === null ? (
          <p className="muted">Carregando…</p>
        ) : journal.length ? (
          list(journal)
        ) : (
          <p className="muted">
            {master
              ? "Registre aqui resumos das sessões, pistas e acontecimentos."
              : "O mestre ainda não registrou nada no diário."}
          </p>
        )}
      </div>
      {master && (
        <div className="panel">
          <div className="panel-heading">
            <h3>
              <Crown size={17} />
              Notas do mestre
            </h3>
            <span className="muted">Só você e outros mestres veem</span>
          </div>
          {secret.length ? (
            list(secret)
          ) : (
            <p className="muted">Planos, segredos e ganchos ficam aqui.</p>
          )}
        </div>
      )}
      {editing && (
        <NoteEditor
          note={editing}
          campaignId={campaign.id}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </section>
  );
}

function NoteEditor({
  note,
  campaignId,
  onClose,
  onSaved,
}: {
  note: Partial<CampaignNote>;
  campaignId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(note.title ?? "");
  const [body, setBody] = useState(note.body ?? "");
  const [secret, setSecret] = useState(note.visibility === "master");
  return (
    <Modal
      title={note.id ? "Editar nota" : "Nova nota"}
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            disabled={!title.trim() && !body.trim()}
            action={async () => {
              await backend!.saveNote({
                id: note.id,
                campaignId,
                title: title.trim(),
                body,
                visibility: secret ? "master" : "all",
              });
              await onSaved();
            }}
          >
            Salvar nota
          </AsyncButton>
        </>
      }
    >
      <Field label="Título">
        <input
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Texto">
        <textarea
          rows={8}
          value={body}
          maxLength={50000}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <Toggle
        label="Nota secreta do mestre (o grupo não vê)"
        checked={secret}
        onChange={setSecret}
      />
    </Modal>
  );
}
