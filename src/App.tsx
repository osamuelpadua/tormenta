import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowRight,
  Backpack,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Dices,
  Download,
  Feather,
  HardDrive,
  History,
  LayoutDashboard,
  MoreHorizontal,
  Menu,
  Map as MapIcon,
  Pencil,
  Plus,
  ScrollText,
  Shield,
  Sparkles,
  Star,
  Swords,
  TrendingUp,
  Undo2,
  UserRound,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { CATALOG, CLASS_MAP, ENTRY_MAP, RACE_MAP } from "./data/rules";
import { calculate } from "./domain/calculate";
import { uid } from "./domain/character";
import type { CatalogEntry, Item } from "./domain/types";
import type { Command } from "./domain/commands";
import { prepareCommand, usePhysicalDice } from "./ui/physical-dice";
import { db, downloadBackup } from "./storage/database";
import { CharacterWizard } from "./ui/creation";
import {
  Combat,
  ResourceModal,
  AttackModal,
  ConditionModal,
  UseModal,
} from "./ui/play";
import { Sheet, SkillModal } from "./ui/sheet";
import { Library } from "./ui/library";
import { EntryDetails } from "./ui/entry-details";
import { useReferenceNavigation } from "./ui/reference-navigation";
import "./ui/library.css";
import { CoinsModal, Inventory, ItemModal } from "./ui/inventory";
import {
  AddEntry,
  BackupModal,
  BookModal,
  DiceModal,
  Editor,
  Evolution,
  HistoryModal,
} from "./ui/manage";
import {
  AppContext,
  ReferenceContext,
  AsyncButton,
  Empty,
  Modal,
  Pill,
  SourceButton,
} from "./ui/shared";
import "./styles.css";
import "./ui/mobile.css";
import "./ui/fantasy.css";
import "./ui/entity-icon.css";
import "./ui/controls.css";
import "./ui/book.css";
import { EntityIcon } from "./ui/entity-icon";
import {
  InstallDialog,
  InstallRecommendation,
  useAppInstall,
} from "./ui/install";
import { backend, useSyncStatus } from "./sync/backend";
import {
  AccountModal,
  AccountRecommendation,
  useAccountPrompt,
  syncLabel,
  usePendingCount,
} from "./ui/campaigns/account";
import Campaigns from "./ui/campaigns/campaigns";
import "./ui/campaigns/campaigns.css";

const Maps = lazy(() => import("./ui/maps/maps"));
type ModalState =
  | {
      kind:
        | "create"
        | "backup"
        | "history"
        | "dice"
        | "edit"
        | "evolve"
        | "condition"
        | "coins"
        | "archive"
        | "help"
        | "install";
    }
  | { kind: "account"; signup?: boolean }
  | { kind: "tools" }
  | { kind: "resource"; mode: "damage" | "hp" | "mp" | "rest" }
  | { kind: "attack"; id: string }
  | { kind: "skill"; id: string }
  | { kind: "use"; entry: CatalogEntry }
  | { kind: "item"; item?: Item; consume?: boolean }
  | { kind: "add"; spells: boolean; entry?: CatalogEntry }
  | null;
const NAV = [
  {
    id: "sheet",
    name: "Ficha",
    icon: LayoutDashboard,
    description: "Cada detalhe da sua jornada.",
  },
  {
    id: "combat",
    name: "Combate",
    icon: Swords,
    description: "Presença na mesa. Controle em suas mãos.",
  },
  {
    id: "powers",
    name: "Poderes",
    icon: FlameIcon,
    description: "O que torna seu personagem único.",
  },
  {
    id: "spells",
    name: "Magias",
    icon: Sparkles,
    description: "O extraordinário ao alcance das mãos.",
  },
  {
    id: "inventory",
    name: "Inventário",
    icon: Backpack,
    description: "Tudo o que você leva para a aventura.",
  },
] as const;
function FlameIcon({ size = 20 }: { size?: number }) {
  return <Feather size={size} />;
}
export default function App() {
  const { requestDice, diceDialog } = usePhysicalDice();
  const sync = useSyncStatus();
  const pending = usePendingCount();
  const accountPrompt = useAccountPrompt();
  const accountId = sync.session?.userId ?? null;
  // Local-only characters always show; account characters only while that
  // account is signed in. Wait for the session check to keep the selection.
  const characters = useLiveQuery(async () => {
    if (backend && sync.state === "ready") return undefined;
    const all = await db.characters.orderBy("updatedAt").reverse().toArray();
    const owners = new Map(
      (await db.characterSync.toArray()).map((s) => [s.id, s.accountId]),
    );
    return all.filter(
      (c) => !owners.has(c.id) || owners.get(c.id) === accountId,
    );
  }, [accountId, sync.state === "ready"]);
  const [selected, setSelected] = useState(
    () => localStorage.getItem("tormenta-selected") ?? "",
  );
  const navigation = useReferenceNavigation();
  const { route, setTab } = navigation;
  const tab = route.tab;
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [online, setOnline] = useState(navigator.onLine);
  const c = characters?.find((c) => c.id === selected) ?? characters?.[0];
  const nav = NAV.find((n) => n.id === tab)!;
  const notify = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6500);
  }, []);
  const installation = useAppInstall(notify);
  const showInstall = () => {
    installation.dismiss();
    setModal({ kind: "install" });
  };
  const requestInstall = () => void installation.install(showInstall);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Installed apps are usually resumed from the background instead of
    // reloaded, so the browser never re-fetches sw.js on its own.
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine && !registration.installing)
          void registration.update().catch(() => undefined);
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, 60 * 60 * 1000);
    },
    onRegisterError: () =>
      notify(
        "Não foi possível preparar o uso offline. Recarregue quando houver conexão.",
      ),
  });
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (c) localStorage.setItem("tormenta-selected", c.id);
  }, [c?.id]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab]);
  const close = () => setModal(null);
  const commit = useCallback(
    (command: Command) => {
      const task = (async () => {
        if (!c) throw new Error("Selecione um personagem.");
        try {
          const prepared = await prepareCommand(c, command, requestDice);
          await db.dispatch(c.id, c.revision, prepared, uid());
          const result = ["roll", "attack", "use"].includes(command.type)
            ? await db.history
                .where("characterId")
                .equals(c.id)
                .filter((e) => e.before?.revision === c.revision && !e.undone)
                .last()
            : undefined;
          const message = result
            ? `${result.title}: ${result.detail}`
            : "Alteração salva neste dispositivo.";
          notify(message);
        } catch (e) {
          notify((e as Error).message);
          throw e;
        }
      })();
      void task.catch(() => {});
      return task;
    },
    [c, notify, requestDice],
  );
  const background = (promise: Promise<unknown>) => {
    void promise.catch(() => {});
  };
  const openEntry = (entry: CatalogEntry) => navigation.openEntry(entry.id);
  const openBook = (page: number, focus?: string) => {
    if (modal?.kind === "tools") close();
    navigation.openBook(page, focus);
  };
  const onResource = (mode: "damage" | "hp" | "mp" | "rest") =>
    setModal({ kind: "resource", mode });
  const onAttack = (id: string) => setModal({ kind: "attack", id });
  const onCondition = () => setModal({ kind: "condition" });
  const onEdit = () => setModal({ kind: "edit" });
  const onUse = (entry: CatalogEntry) => setModal({ kind: "use", entry });
  const modalContent = () => {
    if (!modal) return null;
    if (modal.kind === "tools")
      return (
        <Modal
          title="Ferramentas"
          subtitle={c?.name ?? "Seu diário de aventuras"}
          className="mobile-tools-dialog"
          onClose={close}
        >
          <div className="mobile-tools-list">
            {backend && (
              <>
                <button
                  onClick={() => {
                    close();
                    navigation.openCampaign();
                  }}
                >
                  <Users size={22} />
                  <span>
                    <strong>Campanhas</strong>
                    <small>Seu grupo, as fichas e a visão do mestre</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
                <button onClick={() => setModal({ kind: "account" })}>
                  <UserRound size={22} />
                  <span>
                    <strong>{sync.session ? "Sua conta" : "Entrar"}</strong>
                    <small>
                      {sync.session
                        ? `${sync.session.name} · ${syncLabel(sync, pending)}`
                        : "Guarde suas fichas na nuvem"}
                    </small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              </>
            )}
            <button
              onClick={() => {
                close();
                setTab("maps");
              }}
            >
              <MapIcon size={22} />
              <span>
                <strong>Mapas</strong>
                <small>Explore territórios e registre seus locais</small>
              </span>
              <ArrowRight size={17} />
            </button>
            <button onClick={() => openBook(17)}>
              <BookOpen size={22} />
              <span>
                <strong>Livro de referência</strong>
                <small>Consulte regras no PDF original</small>
              </span>
              <ArrowRight size={17} />
            </button>
            {c && (
              <button onClick={() => setModal({ kind: "history" })}>
                <History size={22} />
                <span>
                  <strong>Histórico da aventura</strong>
                  <small>Rolagens, alterações e desfazer</small>
                </span>
                <ArrowRight size={17} />
              </button>
            )}
            <button onClick={() => setModal({ kind: "backup" })}>
              <Download size={22} />
              <span>
                <strong>Backups e importação</strong>
                <small>Guarde ou restaure personagens e mapas</small>
              </span>
              <ArrowRight size={17} />
            </button>
            <button onClick={() => setModal({ kind: "create" })}>
              <Plus size={22} />
              <span>
                <strong>Novo personagem</strong>
                <small>Comece uma nova ficha</small>
              </span>
              <ArrowRight size={17} />
            </button>
            {!installation.installed && (
              <button onClick={showInstall}>
                <Download size={22} />
                <span>
                  <strong>Instalar app</strong>
                  <small>Adicione Tormenta Wiki ao dispositivo</small>
                </span>
                <ArrowRight size={17} />
              </button>
            )}
            <button onClick={() => setModal({ kind: "help" })}>
              <CircleHelp size={22} />
              <span>
                <strong>Como usar</strong>
                <small>Criação, combate e dados locais</small>
              </span>
              <ArrowRight size={17} />
            </button>
          </div>
        </Modal>
      );
    if (modal.kind === "install")
      return <InstallDialog installation={installation} onClose={close} />;
    if (modal.kind === "account")
      return (
        <AccountModal onClose={close} notify={notify} signup={modal.signup} />
      );
    if (modal.kind === "create")
      return (
        <CharacterWizard
          requestDice={requestDice}
          onClose={close}
          onSave={async (character) => {
            await db.create(character);
            setSelected(character.id);
            setTab("sheet");
            close();
            notify(`${character.name} está pronto para a aventura.`);
            if (navigator.storage?.persist) void navigator.storage.persist();
          }}
        />
      );
    if (modal.kind === "backup")
      return <BackupModal onClose={close} onImported={setSelected} />;
    if (modal.kind === "help")
      return (
        <Modal title="Sua mesa, seu ritmo" onClose={close}>
          <div className="help-content">
            <h3>Comece pela ficha</h3>
            <p>
              Crie um personagem, faça as escolhas do assistente e confira a
              revisão. Os valores com uma seta se expandem para mostrar os
              componentes.
            </p>
            <h3>Durante a aventura</h3>
            <p>
              Empunhe suas armas no Inventário. Em Combate, informe a
              iniciativa, inicie e encerre seu turno e avance as rodadas.
              Informe acontecimentos externos quando afetarem suas habilidades.
            </p>
            <h3>Dados físicos na mesa</h3>
            <p>
              Consulte os bônus e role seus próprios dados. Registrar testes de
              perícia é opcional. Ao registrar ataques ou efeitos com dados,
              informe os resultados da mesa; o app soma os bônus e atualiza a
              ficha.
            </p>
            <h3>Seus dados ficam com você</h3>
            <p>
              Personagens e histórico são salvos neste navegador. Exporte
              backups para transferir ou guardar uma cópia. Após o primeiro
              carregamento completo, a versão de produção funciona offline.
            </p>
            <h3>Regras e cobertura</h3>
            <p>
              A biblioteca usa os PDFs fornecidos. A automação ainda está em
              revisão: efeitos sem cálculo próprio exigem acompanhamento na
              mesa. As referências e os registros de ajustes ficam acessíveis.
              Consulte docs/LIMITACOES.md no projeto para o estado de
              implementação.
            </p>
            <button className="button" onClick={() => openBook(17)}>
              <BookOpen size={16} />
              Consultar o livro
            </button>
            <p className="art-credits">
              Ícones de fantasia de{" "}
              <a
                href="https://game-icons.net/"
                target="_blank"
                rel="noreferrer"
              >
                Game-icons.net
              </a>
              , sob CC BY 3.0.{" "}
              <a href="/art/credits.html" target="_blank" rel="noreferrer">
                Autores e créditos
              </a>
              .
            </p>
          </div>
        </Modal>
      );
    if (!c) return null;
    switch (modal.kind) {
      case "history":
        return <HistoryModal onClose={close} />;
      case "dice":
        return <DiceModal onClose={close} />;
      case "edit":
        return <Editor onClose={close} />;
      case "evolve":
        return <Evolution onClose={close} />;
      case "condition":
        return <ConditionModal onClose={close} />;
      case "resource":
        return <ResourceModal mode={modal.mode} onClose={close} />;
      case "attack":
        return <AttackModal attackId={modal.id} onClose={close} />;
      case "skill":
        return <SkillModal skillId={modal.id} onClose={close} />;
      case "use":
        return (
          <UseModal entry={modal.entry} onClose={close} onAttack={onAttack} />
        );
      case "item":
        return (
          <ItemModal
            item={modal.item}
            consume={modal.consume}
            onClose={close}
          />
        );
      case "coins":
        return <CoinsModal onClose={close} />;
      case "add":
        return (
          <AddEntry
            spells={modal.spells}
            initialEntry={modal.entry}
            onClose={close}
          />
        );
      case "archive":
        return (
          <Modal
            title={`Arquivar ${c.name}?`}
            onClose={close}
            footer={
              <>
                <button className="button" onClick={close}>
                  Cancelar
                </button>
                <AsyncButton
                  action={async () => {
                    await db.archive(c.id);
                    setSelected("");
                    close();
                    notify(
                      "Personagem arquivado. Uma cópia está na recuperação local.",
                    );
                  }}
                >
                  Arquivar personagem
                </AsyncButton>
              </>
            }
          >
            <p>
              O personagem sairá da seleção principal. Uma cópia completa, com
              histórico, ficará disponível em Backups → Recuperação local.
            </p>
          </Modal>
        );
    }
  };
  const body = (
    <div
      className="app-shell"
      data-view={tab}
      data-map-open={
        (tab === "maps" && !!route.mapId) ||
        (tab === "campaigns" && !!route.campaignMapId) ||
        undefined
      }
      data-combat-active={c?.combat.active || undefined}
    >
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <a href="#sheet" className="brand" onClick={() => setTab("sheet")}>
          <img src="/icon.svg" alt="" />
          <span>
            TORMENTA
            <small>WIKI</small>
          </span>
        </a>
        <div className="edition-label">
          JOGO DO ANO <span>2023</span>
        </div>
        <div className="sidebar-divider" />
        <div className="character-switcher">
          <label htmlFor="character-select">SEU PERSONAGEM</label>
          {characters?.length ? (
            <div className="select-wrap">
              <select
                id="character-select"
                value={c?.id ?? ""}
                onChange={(e) => {
                  setSelected(e.target.value);
                  close();
                }}
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </div>
          ) : (
            <span className="no-character">Uma história por começar</span>
          )}
          <button
            className="new-character-link"
            onClick={() => setModal({ kind: "create" })}
          >
            <Plus size={14} />
            Novo personagem
          </button>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              aria-current={tab === n.id ? "page" : undefined}
              onClick={() => setTab(n.id)}
              disabled={!c}
            >
              <n.icon size={19} />
              <span>{n.name}</span>
              {n.id === "combat" && c?.combat.active && (
                <i className="live-dot" />
              )}
            </button>
          ))}
          <button
            className={tab === "maps" ? "active" : ""}
            aria-current={tab === "maps" ? "page" : undefined}
            onClick={() => setTab("maps")}
          >
            <MapIcon size={19} />
            <span>Mapas</span>
          </button>
          {backend && (
            <button
              className={tab === "campaigns" ? "active" : ""}
              aria-current={tab === "campaigns" ? "page" : undefined}
              onClick={() => navigation.openCampaign()}
            >
              <Users size={19} />
              <span>Campanhas</span>
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          {!installation.installed && (
            <button onClick={showInstall}>
              <Download size={18} />
              Instalar app
            </button>
          )}
          <button onClick={() => openBook(17)}>
            <BookOpen size={18} />
            Livro de referência
          </button>
          <button onClick={() => setModal({ kind: "backup" })}>
            <Download size={18} />
            Backups e importação
          </button>
          <button onClick={() => setModal({ kind: "help" })}>
            <CircleHelp size={18} />
            Como usar
          </button>
          {backend ? (
            <button
              className="sidebar-status account-status"
              onClick={() => setModal({ kind: "account" })}
            >
              <UserRound size={15} />
              <div>
                <span>
                  {sync.session ? sync.session.name : "Entrar na sua conta"}
                </span>
                <small>
                  {sync.session
                    ? syncLabel(sync, pending)
                    : "Fichas na nuvem e campanhas."}
                </small>
              </div>
            </button>
          ) : (
            <div className="sidebar-status">
              <HardDrive size={15} />
              <div>
                <span>Local. Seu. Sem cadastro.</span>
                <small>Arton acompanha você.</small>
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-characters">
            <select
              aria-label="Personagem no celular"
              value={c?.id ?? ""}
              onChange={(e) => {
                setSelected(e.target.value);
                close();
              }}
            >
              {!characters?.length && (
                <option value="">Meus personagens</option>
              )}
              {characters?.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              aria-label="Criar personagem"
              onClick={() => setModal({ kind: "create" })}
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="breadcrumb">
            <span>
              {tab === "maps"
                ? "Atlas da campanha"
                : tab === "campaigns"
                  ? "Mesa compartilhada"
                  : "Meus personagens"}
            </span>
            <span>/</span>
            <strong>
              {tab === "maps"
                ? "Mapas"
                : tab === "campaigns"
                  ? "Campanhas"
                  : (c?.name ?? "Uma nova aventura")}
            </strong>
          </div>
          <div className="topbar-tools">
            <span
              className="local-status"
              data-state={
                sync.session
                  ? sync.state === "error"
                    ? "error"
                    : sync.state === "syncing"
                      ? "syncing"
                      : pending
                        ? "pending"
                        : undefined
                  : undefined
              }
            >
              <i />
              {sync.session
                ? syncLabel(sync, pending)
                : online
                  ? "Salvo neste dispositivo"
                  : "Sem conexão"}
            </span>
            {c && (
              <>
                <button
                  className="icon-button"
                  aria-label="Abrir rolador"
                  title="Registrar dados da mesa"
                  onClick={() => setModal({ kind: "dice" })}
                >
                  <Dices size={20} />
                </button>
                <button
                  className="icon-button desktop-history"
                  aria-label="Abrir histórico"
                  title="Diário da aventura"
                  onClick={() => setModal({ kind: "history" })}
                >
                  <History size={20} />
                </button>
              </>
            )}
            <button
              className="mobile-backup icon-button"
              aria-label="Abrir ferramentas"
              aria-haspopup="dialog"
              onClick={() => setModal({ kind: "tools" })}
            >
              <Menu size={22} />
            </button>
          </div>
        </header>
        {(offlineReady || needRefresh) && (
          <div className="update-banner">
            <span>
              <Check size={15} />
              {needRefresh
                ? "Uma atualização está disponível. Sua sessão foi preservada."
                : "Aplicativo pronto para uso offline."}
            </span>
            {needRefresh && (
              <button onClick={() => void updateServiceWorker(true)}>
                Aplicar atualização
              </button>
            )}
            <button
              aria-label="Dispensar aviso"
              onClick={() => {
                setOfflineReady(false);
                setNeedRefresh(false);
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {!(tab === "maps" && route.mapId) &&
          !route.campaignMapId &&
          // One invitation at a time: the account first, then installing.
          (accountPrompt.show ? (
            <AccountRecommendation
              onCreate={() => setModal({ kind: "account", signup: true })}
              onDismiss={accountPrompt.dismiss}
            />
          ) : (
            <InstallRecommendation
              installation={installation}
              onInstall={requestInstall}
            />
          ))}
        <main id="main-content">
          {characters === undefined ? (
            <div className="loading-state">
              <img src="/icon.svg" alt="" />
              <p>Abrindo Tormenta Wiki…</p>
            </div>
          ) : tab === "campaigns" ? (
            <Campaigns
              campaignId={route.campaignId}
              view={route.campaignView}
              memberCharacterId={route.memberCharacterId}
              campaignMapId={route.campaignMapId}
              invite={route.invite}
              open={navigation.openCampaign}
              openOwnCharacter={(id) => {
                setSelected(id);
                setTab("sheet");
              }}
              onAccount={() => setModal({ kind: "account" })}
              notify={notify}
              requestDice={requestDice}
            />
          ) : tab === "maps" ? (
            <Suspense fallback={<p role="status">Abrindo seu atlas…</p>}>
              <Maps
                mapId={route.mapId}
                onOpen={navigation.openMap}
                accountId={accountId}
                onOpenCampaignMap={(campaignId, mapId) =>
                  navigation.openCampaign(campaignId, "maps", undefined, mapId)
                }
                onBack={() => setTab("maps")}
                notify={notify}
              />
            </Suspense>
          ) : !c ? (
            <Welcome
              onCreate={() => setModal({ kind: "create" })}
              onImport={() => setModal({ kind: "backup" })}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">SEU DIÁRIO DE AVENTURAS</span>
                  <h1>{nav.name}</h1>
                  <p>{nav.description}</p>
                </div>
                <div className="heading-actions">
                  <button className="button" onClick={onEdit}>
                    <Pencil size={15} />
                    Editar ficha
                  </button>
                  <button
                    className="button primary"
                    disabled={c.levels.length >= 20}
                    onClick={() => setModal({ kind: "evolve" })}
                  >
                    <TrendingUp size={16} />
                    Evoluir
                  </button>
                </div>
              </div>
              <section className="character-banner">
                <div className="character-monogram" aria-hidden="true">
                  <Shield className="character-crest" strokeWidth={1} />
                  <span>{c.name.slice(0, 1).toUpperCase()}</span>
                </div>
                <div className="character-banner-title">
                  <span className="character-caption">HERÓI DE ARTON</span>
                  <h2>{c.name}</h2>
                  <p>
                    {RACE_MAP.get(c.raceId)?.name}
                    <span>·</span>
                    {[...new Set(c.levels.map((l) => l.classId))]
                      .map(
                        (id) =>
                          `${CLASS_MAP.get(id)?.name} ${c.levels.filter((l) => l.classId === id).length}`,
                      )
                      .join(" / ")}
                    {c.originId && (
                      <>
                        <span>·</span>
                        {ENTRY_MAP.get(c.originId)?.name}
                      </>
                    )}
                  </p>
                </div>
                <div className="level-seal">
                  <strong>{c.levels.length}</strong>
                  <span>NÍVEL</span>
                </div>
                <details className="character-menu">
                  <summary aria-label="Opções do personagem">
                    <MoreHorizontal size={20} />
                  </summary>
                  <div>
                    <button
                      onClick={() =>
                        background(db.exportBackup([c.id]).then(downloadBackup))
                      }
                    >
                      <Download size={15} />
                      Exportar personagem
                    </button>
                    <button
                      onClick={() =>
                        background(
                          db
                            .undo(c.id, c.revision)
                            .then(() => notify("Última operação desfeita.")),
                        )
                      }
                    >
                      <Undo2 size={15} />
                      Desfazer última operação
                    </button>
                    <button onClick={() => setModal({ kind: "archive" })}>
                      Arquivar personagem
                    </button>
                  </div>
                </details>
              </section>
              {calculate(c).warnings.map((w) => (
                <div className="notice danger compact-notice" key={w}>
                  {w}
                </div>
              ))}
              {tab === "sheet" && (
                <Sheet
                  onResource={onResource}
                  onAttack={onAttack}
                  onCondition={onCondition}
                  onEdit={onEdit}
                  onSkill={(id) => setModal({ kind: "skill", id })}
                  onEvolve={() => setModal({ kind: "evolve" })}
                />
              )}{" "}
              {tab === "combat" && (
                <Combat
                  onResource={onResource}
                  onAttack={onAttack}
                  onCondition={onCondition}
                  onUse={onUse}
                />
              )}{" "}
              {(tab === "powers" || tab === "spells") && (
                <Library
                  key={`${c.id}:${tab}`}
                  spells={tab === "spells"}
                  onAdd={() =>
                    setModal({ kind: "add", spells: tab === "spells" })
                  }
                  onUse={onUse}
                />
              )}{" "}
              {tab === "inventory" && (
                <Inventory
                  onItem={(item) => setModal({ kind: "item", item })}
                  onUse={(item) =>
                    setModal({ kind: "item", item, consume: true })
                  }
                  onAdd={() => setModal({ kind: "item" })}
                  onCoins={() => setModal({ kind: "coins" })}
                />
              )}
              <footer className="page-footer">
                <span>
                  <Shield size={13} />
                  Tormenta20 · Jogo do Ano
                </span>
                <span>
                  Última alteração{" "}
                  {new Date(c.updatedAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </footer>
            </>
          )}
        </main>
        <nav className="mobile-nav" aria-label="Navegação no celular">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              aria-current={tab === n.id ? "page" : undefined}
              onClick={() => setTab(n.id)}
              disabled={!c}
            >
              <n.icon size={21} />
              <span>{n.name}</span>
            </button>
          ))}
        </nav>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="Fechar notificação" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modalContent()}
      {c && route.entryId && ENTRY_MAP.has(route.entryId) && (
        <EntryDetails
          entry={ENTRY_MAP.get(route.entryId)!}
          onClose={navigation.back}
          onAcquire={(entry) => {
            navigation.back();
            setModal({ kind: "add", spells: entry.kind === "spell", entry });
          }}
        />
      )}
      {route.bookPage !== undefined && (!route.entryId || c) && (
        <BookModal
          key={route.bookPage + ":" + (route.focus ?? "")}
          page={route.bookPage}
          focus={route.focus}
          onClose={navigation.back}
          returnLabel={
            route.entryId ? "Voltar ao conteúdo" : "Voltar à consulta"
          }
        />
      )}
      {diceDialog}
    </div>
  );
  return (
    <ReferenceContext.Provider value={{ openEntry, openBook }}>
      {c ? (
        <AppContext.Provider
          value={{ character: c, commit, notify, openEntry, openBook }}
        >
          {body}
        </AppContext.Provider>
      ) : (
        body
      )}
    </ReferenceContext.Provider>
  );
}
function Welcome({
  onCreate,
  onImport,
}: {
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-kicker">
        <span />
        UM NOVO CAPÍTULO EM ARTON
      </div>
      <div className="welcome-art" aria-hidden="true">
        <div className="art-orbit" />
        <div className="art-orbit second" />
        <img src="/icon.svg" alt="" />
        <span className="art-spark s1">✦</span>
        <span className="art-spark s2">✧</span>
        <span className="art-spark s3">✦</span>
      </div>
      <h1>
        Toda lenda começa
        <br />
        com um personagem.
      </h1>
      <p>
        A ficha, o grimório e o diário da sua aventura.
        <br />
        Um espaço para viver suas histórias em Tormenta20.
      </p>
      <div className="welcome-actions">
        <button className="button primary large" onClick={onCreate}>
          <Plus size={18} />
          Criar meu personagem
          <ArrowRight size={17} />
        </button>
        <button className="button large" onClick={onImport}>
          <UploadIcon />
          Restaurar um backup
        </button>
      </div>
      <div className="welcome-features">
        <div>
          <Swords size={22} />
          <h3>Presente na aventura</h3>
          <p>Ações, recursos e efeitos juntos durante o combate.</p>
        </div>
        <div>
          <BookOpen size={22} />
          <h3>Seu repertório à mão</h3>
          <p>Raças, classes, poderes e magias do Jogo do Ano.</p>
        </div>
        <div>
          <HardDrive size={22} />
          <h3>Com você, onde for</h3>
          <p>Sem conta. Dados locais e backups para guardar.</p>
        </div>
      </div>
      <div className="welcome-footer">
        17 RAÇAS <span>✦</span> 14 CLASSES <span>✦</span> INÚMERAS HISTÓRIAS
      </div>
    </div>
  );
}
function UploadIcon() {
  return <Download size={18} style={{ transform: "rotate(180deg)" }} />;
}
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error">
        <h1>Não foi possível abrir o diário.</h1>
        <p>{this.state.error}</p>
        <p>Seus dados não foram apagados.</p>
        <button className="button primary" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
