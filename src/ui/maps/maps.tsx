import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Compass,
  Expand,
  Map as MapGlyph,
  MapPin,
  Move,
  Pencil,
  Plus,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
  List,
  Search,
  Eye,
  EyeOff,
} from "lucide-react";
import { db } from "../../storage/database";
import { deleteLocation, deleteMap, saveLocation } from "../../storage/maps";
import type {
  AtlasMap,
  MapAsset,
  MapLocation,
  MapPoint,
} from "../../domain/maps";
import { AsyncButton, Modal } from "../shared";
import { MapViewer, type ViewerHandle } from "./viewer";
import { MapEditor, LocationEditor, mapError, useThumbnail } from "./forms";
import { categoryName, MapIcon } from "./catalog";
import "./maps.css";

export default function Maps({
  mapId,
  onOpen,
  onOpenCampaignMap,
  accountId,
  onBack,
  notify,
}: {
  mapId?: string;
  onOpen: (id: string) => void;
  onOpenCampaignMap?: (campaignId: string, mapId: string) => void;
  accountId?: string | null;
  onBack: () => void;
  notify: (text: string) => void;
}) {
  const maps = useLiveQuery(
    () => db.atlasMaps.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const [creating, setCreating] = useState(false);
  const active = useLiveQuery(async () => {
    if (!mapId) return null;
    const map = await db.atlasMaps.get(mapId);
    return {
      map,
      asset: map ? await db.mapAssets.get(map.assetId) : undefined,
    };
  }, [mapId]);
  if (mapId && active === undefined)
    return (
      <p className="atlas-loading" role="status">
        Abrindo mapa…
      </p>
    );
  if (mapId && active?.map && active.asset)
    return (
      <LocalMapWorkspace
        key={mapId}
        map={active.map}
        asset={active.asset}
        onBack={onBack}
        notify={notify}
      />
    );
  if (mapId)
    return (
      <div className="atlas-empty">
        <MapGlyph size={44} />
        <h1>Mapa indisponível</h1>
        <p>Ele pode ter sido removido em outra aba.</p>
        <button className="button" onClick={onBack}>
          <ArrowLeft size={18} />
          Voltar aos mapas
        </button>
      </div>
    );
  return (
    <section className="atlas-home">
      <header className="atlas-heading">
        <div>
          <span className="eyebrow">SEU ATLAS DE AVENTURAS</span>
          <h1>Mapas</h1>
          <p>Cada lugar guarda uma história. Trace a sua.</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={18} />
          Novo mapa
        </button>
      </header>
      <div className="atlas-intro">
        <Compass size={26} />
        <p>
          Explore seus mundos, marque descobertas e guarde os segredos da
          campanha.
        </p>
        <span>
          <MapGlyph size={16} />
          {maps?.length ?? 0} mapas
        </span>
      </div>
      {maps === undefined ? (
        <p role="status">Abrindo seu atlas…</p>
      ) : maps.length ? (
        <div className="atlas-grid">
          {maps.map((map) => (
            <MapCard
              key={map.id}
              map={map}
              onOpen={() => onOpen(map.id)}
              notify={notify}
            />
          ))}
        </div>
      ) : (
        <div className="atlas-empty">
          <MapGlyph size={44} />
          <h2>Um mundo por descobrir</h2>
          <p>Adicione uma imagem de reino, cidade ou masmorra para começar.</p>
          <button className="button primary" onClick={() => setCreating(true)}>
            Criar primeiro mapa
          </button>
        </div>
      )}
      {accountId && onOpenCampaignMap && (
        <CampaignMapsSection accountId={accountId} onOpen={onOpenCampaignMap} />
      )}
      <p className="atlas-local-note">
        Seu atlas fica salvo neste dispositivo. Use Backups para guardar uma
        cópia ou levar os mapas para outra mesa.
      </p>
      {creating && (
        <MapEditor
          onClose={() => setCreating(false)}
          onSaved={(map) => {
            setCreating(false);
            notify("Mapa salvo neste dispositivo.");
            onOpen(map.id);
          }}
        />
      )}
    </section>
  );
}
// Maps shared in the user's campaigns, next to the maps of this device.
function CampaignMapsSection({
  accountId,
  onOpen,
}: {
  accountId: string;
  onOpen: (campaignId: string, mapId: string) => void;
}) {
  const shared = useLiveQuery(async () => {
    const maps = await db.campaignMaps
      .where("accountId")
      .equals(accountId)
      .sortBy("name");
    const campaigns = new Map(
      (await db.campaigns.where("accountId").equals(accountId).toArray()).map(
        (c) => [c.id, c.name],
      ),
    );
    return maps.map((map) => ({
      map,
      campaign: campaigns.get(map.campaignId) ?? "Campanha",
    }));
  }, [accountId]);
  if (!shared?.length) return null;
  return (
    <section className="atlas-campaign-maps" aria-label="Mapas das campanhas">
      <h2>Mapas das campanhas</h2>
      <div className="atlas-campaign-list">
        {shared.map(({ map, campaign }) => (
          <button key={map.id} onClick={() => onOpen(map.campaignId, map.id)}>
            <MapGlyph size={20} />
            <span>
              <strong>{map.name}</strong>
              <small>{campaign} · compartilhado com o grupo</small>
            </span>
            <Compass size={17} />
          </button>
        ))}
      </div>
    </section>
  );
}
function MapCard({
  map,
  onOpen,
  notify,
}: {
  map: AtlasMap;
  onOpen: () => void;
  notify: (text: string) => void;
}) {
  const asset = useLiveQuery(
    () => db.mapAssets.get(map.assetId),
    [map.assetId],
  );
  const count = useLiveQuery(
    () => db.mapLocations.where("mapId").equals(map.id).count(),
    [map.id],
  );
  const thumbnail = useThumbnail(asset);
  const [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false);
  return (
    <article className="atlas-card">
      <button
        className="atlas-card-open"
        onClick={onOpen}
        aria-label={`Abrir ${map.name}`}
      >
        <div className="atlas-card-art">
          {thumbnail && <img src={thumbnail} alt="" loading="lazy" />}
          <span className="atlas-card-compass">
            <Compass size={27} />
          </span>
        </div>
        <div className="atlas-card-title">
          <h2>{map.name}</h2>
          <span>
            <MapPin size={14} />
            {count ?? 0} locais
          </span>
        </div>
        {map.notes && <p>{map.notes}</p>}
      </button>
      <footer>
        <button className="button" onClick={onOpen}>
          Explorar <Compass size={16} />
        </button>
        <div>
          <button
            className="icon-button"
            aria-label={`Editar ${map.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil size={17} />
          </button>
          <button
            className="icon-button"
            aria-label={`Excluir ${map.name}`}
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={17} />
          </button>
        </div>
      </footer>
      {editing && (
        <MapEditor
          map={map}
          asset={asset}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            notify("Mapa atualizado.");
          }}
        />
      )}
      {deleting && (
        <DeleteMapDialog
          map={map}
          onClose={() => setDeleting(false)}
          onDeleted={() => notify("Mapa excluído.")}
        />
      )}
    </article>
  );
}
function DeleteMapDialog({
  map,
  onClose,
  onDeleted,
}: {
  map: AtlasMap;
  onClose: () => void;
  onDeleted: () => void;
}) {
  return (
    <Modal
      title={`Excluir ${map.name}?`}
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            action={async () => {
              await deleteMap(db, map);
              onClose();
              onDeleted();
            }}
          >
            Excluir mapa
          </AsyncButton>
        </>
      }
    >
      <p>
        O mapa e todos os seus locais e anotações serão removidos deste
        dispositivo. Exporte um backup antes se quiser guardar uma cópia.
      </p>
      {map.sourceKey && (
        <p>
          O mapa padrão não será adicionado novamente nas próximas atualizações.
        </p>
      )}
    </Modal>
  );
}
function useCompact() {
  const [compact, setCompact] = useState(
    () => matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const change = () => setCompact(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return compact;
}
// A place on screen: local maps use plain locations; campaign places also
// carry secrecy and authorship.
export type Place = MapLocation & {
  secret?: boolean;
  createdByName?: string | null;
  updatedByName?: string | null;
};
export type PlaceInput = Pick<
  Place,
  "mapId" | "name" | "categoryId" | "iconId" | "x" | "y" | "notes"
> & { secret?: boolean };
// Where the map data lives: this device, or a campaign on the server.
export interface MapBinding {
  map: { id: string; name: string; notes: string };
  asset: MapAsset;
  locations: Place[] | undefined;
  canSecret: boolean;
  savedMessage: string;
  save: (input: PlaceInput, previous?: Place) => Promise<Place>;
  remove: (place: Place) => Promise<void>;
  editMap: (close: () => void) => ReactNode;
}
function LocalMapWorkspace({
  map,
  asset,
  onBack,
  notify,
}: {
  map: AtlasMap;
  asset: MapAsset;
  onBack: () => void;
  notify: (text: string) => void;
}) {
  const locations = useLiveQuery(
    () => db.mapLocations.where("mapId").equals(map.id).toArray(),
    [map.id],
  );
  return (
    <MapWorkspace
      binding={{
        map,
        asset,
        locations,
        canSecret: false,
        savedMessage: "Local salvo neste dispositivo.",
        save: (input, previous) => saveLocation(db, input, previous),
        remove: (place) => deleteLocation(db, place),
        editMap: (close) => (
          <MapEditor
            map={map}
            asset={asset}
            onClose={close}
            onSaved={() => {
              close();
              notify("Mapa atualizado.");
            }}
          />
        ),
      }}
      onBack={onBack}
      notify={notify}
    />
  );
}
export function MapWorkspace({
  binding,
  onBack,
  notify,
}: {
  binding: MapBinding;
  onBack: () => void;
  notify: (text: string) => void;
}) {
  const { map, asset, locations } = binding;
  const viewer = useRef<ViewerHandle>(null);
  const compact = useCompact();
  const [mode, setMode] = useState<"browse" | "add" | "move">("browse");
  const [selectedId, setSelected] = useState<string>();
  const selected = locations?.find((location) => location.id === selectedId);
  const [editingMap, setEditingMap] = useState(false);
  const [form, setForm] = useState<{
    point: MapPoint;
    location?: Place;
  }>();
  const [moving, setMoving] = useState<{
    location: Place;
    point: MapPoint;
  }>();
  const [showList, setShowList] = useState(false);
  const [query, setQuery] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [deleting, setDeleting] = useState<Place>();
  const [moveError, setMoveError] = useState("");
  // A short gesture hint on opening, then the map is left uncluttered.
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setHint(false), 4500);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    setMode("browse");
    setMoving(undefined);
    setForm(undefined);
  }, [asset.id]);
  const cancelMode = () => {
    setMode("browse");
    setMoving(undefined);
    setMoveError("");
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        cancelMode();
        setSelected(undefined);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // On wide screens the list stays open beside the map while browsing.
  const openLocation = (location: Place) => {
    setSelected(location.id);
    if (compact) setShowList(false);
  };
  const filtered = (locations ?? [])
    .filter((location) =>
      `${location.name} ${categoryName(location.categoryId)}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.trim().toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const toggleAdd = () => {
    setMoving(undefined);
    setSelected(undefined);
    setMoveError("");
    setMode(mode === "add" ? "browse" : "add");
  };
  const locationList = locations?.length ? (
    <>
      <label className="atlas-search">
        <Search size={16} />
        <input
          type="search"
          value={query}
          placeholder="Buscar local…"
          aria-label="Buscar local"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="atlas-location-list">
        {filtered.map((location) => (
          <button
            key={location.id}
            aria-current={location.id === selectedId || undefined}
            onClick={() => {
              viewer.current?.focus(location);
              openLocation(location);
            }}
          >
            <MapIcon id={location.iconId} />
            <span>
              <strong>{location.name}</strong>
              <small>{categoryName(location.categoryId)}</small>
            </span>
            <Compass size={17} />
          </button>
        ))}
        {!filtered.length && (
          <p className="muted atlas-list-empty">Nenhum local encontrado.</p>
        )}
      </div>
    </>
  ) : (
    <div className="atlas-empty">
      <MapPin size={36} />
      <p>Seu mapa ainda não tem locais.</p>
      <button
        className="button"
        onClick={() => {
          setShowList(false);
          setMode("add");
        }}
      >
        Adicionar primeiro local
      </button>
    </div>
  );
  const details = selected && (
    <LocationDetails
      location={selected}
      canSecret={binding.canSecret}
      onSecret={async (secret) => {
        try {
          await binding.save({ ...selected, secret }, selected);
          notify(
            secret
              ? "Local oculto: só mestres veem."
              : "Local revelado ao grupo.",
          );
        } catch (err) {
          notify(mapError(err));
        }
      }}
      onEdit={() => setForm({ location: selected, point: selected })}
      onMove={() => {
        setMoving({
          location: selected,
          point: { x: selected.x, y: selected.y },
        });
        setSelected(undefined);
        setMode("move");
      }}
      onDelete={() => setDeleting(selected)}
    />
  );
  const listOpen = showList && !compact;
  return (
    <section
      className="atlas-workspace"
      aria-label={`Mapa: ${map.name}`}
      data-list={listOpen || undefined}
      data-details={(selected && !compact) || undefined}
    >
      <header className="atlas-bar">
        <button
          className="atlas-bar-back"
          aria-label="Voltar aos mapas"
          onClick={onBack}
        >
          <ArrowLeft size={19} />
          <span>Mapas</span>
        </button>
        <div className="atlas-bar-title">
          <h1>{map.name}</h1>
          <small>
            {locations?.length ?? 0}{" "}
            {locations?.length === 1 ? "local" : "locais"}
          </small>
        </div>
        <button
          className={`atlas-bar-button${showList ? " active" : ""}`}
          aria-pressed={showList}
          aria-label={`Locais (${locations?.length ?? 0})`}
          title="Locais"
          onClick={() => {
            cancelMode();
            if (compact) setSelected(undefined);
            setShowList(!showList);
          }}
        >
          <List size={19} />
          <span>Locais</span>
        </button>
        <button
          className="atlas-bar-button"
          aria-label="Anotações do mapa"
          title="Anotações do mapa"
          onClick={() => setShowNotes(true)}
        >
          <BookOpen size={19} />
          <span>Anotações</span>
        </button>
        <button
          className="atlas-bar-button"
          aria-label="Editar mapa"
          title="Editar mapa"
          onClick={() => setEditingMap(true)}
        >
          <Pencil size={18} />
        </button>
      </header>
      <div className="atlas-zoom-controls" role="group" aria-label="Zoom">
        <button
          aria-label="Aumentar zoom"
          title="Aumentar zoom"
          onClick={() => viewer.current?.zoom(0.5)}
        >
          <ZoomIn size={20} />
        </button>
        <button
          aria-label="Diminuir zoom"
          title="Diminuir zoom"
          onClick={() => viewer.current?.zoom(-0.5)}
        >
          <ZoomOut size={20} />
        </button>
        <button
          aria-label="Ajustar mapa à tela"
          title="Ajustar mapa à tela"
          onClick={() => viewer.current?.fit()}
        >
          <Expand size={19} />
        </button>
      </div>
      {mode === "browse" && (
        <button className="atlas-add" aria-pressed={false} onClick={toggleAdd}>
          <Plus size={19} />
          Adicionar local
        </button>
      )}
      {hint && mode === "browse" && !selected && (
        <p className="atlas-hint" aria-hidden="true">
          <Compass size={15} />
          {compact
            ? "Arraste para explorar · dois dedos para ampliar"
            : "Arraste para explorar · role para ampliar"}
        </p>
      )}
      {listOpen && (
        <aside className="atlas-list-panel" aria-label="Locais do mapa">
          <header>
            <h2>Locais</h2>
            <button
              className="icon-button"
              aria-label="Fechar lista de locais"
              onClick={() => setShowList(false)}
            >
              <X size={18} />
            </button>
          </header>
          {locationList}
        </aside>
      )}
      {mode !== "browse" && (
        <div className="atlas-mode-banner" role="status">
          <span>
            {mode === "add"
              ? "Toque ou clique no mapa para posicionar um novo local."
              : "Arraste o marcador ou toque no destino. Confirme para salvar."}
          </span>
          <div>
            {mode === "add" ? (
              <button
                className="button"
                onClick={() =>
                  setForm({
                    point: viewer.current?.center() ?? { x: 0.5, y: 0.5 },
                  })
                }
              >
                Usar centro
              </button>
            ) : (
              <AsyncButton
                action={async () => {
                  if (!moving) return;
                  try {
                    const saved = await binding.save(
                      { ...moving.location, ...moving.point },
                      moving.location,
                    );
                    cancelMode();
                    setSelected(saved.id);
                    notify("Local reposicionado.");
                  } catch (err) {
                    setMoveError(mapError(err));
                  }
                }}
              >
                <Check size={16} />
                Confirmar posição
              </AsyncButton>
            )}
            <button className="button" onClick={cancelMode}>
              <X size={16} />
              Cancelar
            </button>
          </div>
          {moveError && <p role="alert">{moveError}</p>}
        </div>
      )}
      <div className="atlas-map-area">
        <MapViewer
          ref={viewer}
          asset={asset}
          locations={locations ?? []}
          selectedId={selectedId}
          mode={mode}
          moving={moving}
          onSelect={openLocation}
          onPlace={(point) => setForm({ point })}
          onMove={(point) =>
            setMoving((current) =>
              current ? { ...current, point } : undefined,
            )
          }
        />
        {selected && !compact && (
          <aside
            className="atlas-location-panel"
            aria-label="Informações do local"
          >
            <header>
              <span className="eyebrow">LOCAL DESCOBERTO</span>
              <button
                className="icon-button"
                aria-label="Fechar informações do local"
                onClick={() => setSelected(undefined)}
              >
                <X size={18} />
              </button>
            </header>
            {details}
          </aside>
        )}
      </div>
      {selected && compact && (
        <Modal
          title={selected.name}
          subtitle={categoryName(selected.categoryId)}
          onClose={() => setSelected(undefined)}
          className="atlas-location-dialog"
        >
          {details}
        </Modal>
      )}
      {form && (
        <LocationEditor
          mapId={map.id}
          point={form.point}
          location={form.location}
          canSecret={binding.canSecret}
          save={binding.save}
          onClose={() => setForm(undefined)}
          onSaved={(location) => {
            setForm(undefined);
            setMode("browse");
            setSelected(location.id);
            notify(binding.savedMessage);
          }}
        />
      )}
      {editingMap && binding.editMap(() => setEditingMap(false))}
      {deleting && (
        <Modal
          title={`Excluir ${deleting.name}?`}
          onClose={() => setDeleting(undefined)}
          footer={
            <>
              <button className="button" onClick={() => setDeleting(undefined)}>
                Cancelar
              </button>
              <AsyncButton
                action={async () => {
                  await binding.remove(deleting);
                  setDeleting(undefined);
                  setSelected(undefined);
                  notify("Local excluído.");
                }}
              >
                Excluir local
              </AsyncButton>
            </>
          }
        >
          <p>O local e suas anotações serão removidos do mapa.</p>
        </Modal>
      )}
      {showNotes && (
        <Modal
          title="Anotações do mapa"
          subtitle={map.name}
          onClose={() => setShowNotes(false)}
          footer={
            <button
              className="button"
              onClick={() => {
                setShowNotes(false);
                setEditingMap(true);
              }}
            >
              <Pencil size={16} />
              Editar anotações
            </button>
          }
        >
          <p className="atlas-prose">
            {map.notes ||
              "Registre aqui a história do território e as observações gerais da campanha."}
          </p>
        </Modal>
      )}
      {showList && compact && (
        <Modal
          title="Locais do mapa"
          subtitle={map.name}
          onClose={() => setShowList(false)}
          className="atlas-locations-dialog"
        >
          {locationList}
        </Modal>
      )}
    </section>
  );
}
function LocationDetails({
  location,
  canSecret,
  onSecret,
  onEdit,
  onMove,
  onDelete,
}: {
  location: Place;
  canSecret: boolean;
  onSecret: (secret: boolean) => Promise<void>;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="atlas-location-details">
      {location.secret && (
        <p className="atlas-secret-badge">
          <EyeOff size={15} />
          Secreto · só mestres veem
        </p>
      )}
      <div className="atlas-location-identity">
        <span className="atlas-location-symbol">
          <MapIcon id={location.iconId} size={36} />
        </span>
        <span className="eyebrow">{categoryName(location.categoryId)}</span>
        <h2>{location.name}</h2>
      </div>
      <p className="atlas-prose">
        {location.notes ||
          "Nenhuma anotação por enquanto. Que histórias este lugar guarda?"}
      </p>
      <div className="atlas-location-actions">
        <button className="button" onClick={onEdit}>
          <Pencil size={16} />
          Editar
        </button>
        <button className="button" onClick={onMove}>
          <Move size={16} />
          Mover
        </button>
        <button className="button atlas-danger" onClick={onDelete}>
          <Trash2 size={16} />
          Excluir
        </button>
      </div>
      {canSecret && (
        <AsyncButton
          className={`button atlas-secret-toggle${location.secret ? " primary" : ""}`}
          action={() => onSecret(!location.secret)}
        >
          {location.secret ? <Eye size={16} /> : <EyeOff size={16} />}
          {location.secret ? "Revelar ao grupo" : "Tornar secreto"}
        </AsyncButton>
      )}
      <small className="muted">
        {location.createdByName
          ? `Marcado por ${location.createdByName} · `
          : ""}
        Atualizado em {new Date(location.updatedAt).toLocaleDateString("pt-BR")}
        {location.updatedByName &&
        location.updatedByName !== location.createdByName
          ? ` por ${location.updatedByName}`
          : ""}
      </small>
    </div>
  );
}
