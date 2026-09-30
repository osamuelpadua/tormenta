import { useEffect, useId, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Compass,
  EyeOff,
  Map as MapGlyph,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import { db } from "../../storage/database";
import { backend, useSyncStatus } from "../../sync/backend";
import {
  deleteCampaignPlace,
  ensureCampaignAsset,
  removeCampaignMap,
  saveCampaignPlace,
  shareMapToCampaign,
  updateCampaignMapInfo,
} from "../../sync/campaign-maps";
import type {
  CachedCampaign,
  CachedCampaignMap,
  CampaignLocation,
} from "../../sync/types";
import type { MapAsset } from "../../domain/maps";
import { mapError, useThumbnail } from "../maps/forms";
import { MapWorkspace } from "../maps/maps";
import "../maps/maps.css";
import { AsyncButton, Empty, Field, Modal, Pill, Toggle } from "../shared";

export function CampaignMapsView({
  campaign,
  onOpen,
  notify,
}: {
  campaign: CachedCampaign;
  onOpen: (mapId: string) => void;
  notify: (text: string) => void;
}) {
  const master = campaign.role === "master";
  const maps = useLiveQuery(
    () =>
      db.campaignMaps
        .where("campaignId")
        .equals(campaign.id)
        .filter((m) => m.accountId === campaign.accountId)
        .sortBy("name"),
    [campaign.id, campaign.accountId],
  );
  const [sharing, setSharing] = useState(false);
  const [removing, setRemoving] = useState<CachedCampaignMap>();
  return (
    <section aria-label="Mapas da campanha">
      <div className="table-summary">
        <span>
          <MapGlyph size={15} />
          Todos marcam e editam os locais.{" "}
          {master
            ? "Você pode criar locais secretos e revelá-los quando quiser."
            : "O mestre pode guardar locais secretos até revelá-los."}
        </span>
        {master && (
          <button
            className="button primary small"
            onClick={() => setSharing(true)}
          >
            <Plus size={15} />
            Adicionar mapa
          </button>
        )}
      </div>
      {maps?.length === 0 && (
        <Empty icon={<MapGlyph size={30} />} heading="Nenhum mapa na campanha">
          {master
            ? "Leve um dos seus mapas para a campanha. O grupo inteiro poderá explorá-lo e marcar locais."
            : "Quando o mestre adicionar um mapa, ele aparece aqui para todo o grupo."}
        </Empty>
      )}
      <div className="campaign-grid">
        {maps?.map((map) => (
          <CampaignMapCard
            key={map.id}
            map={map}
            master={master}
            onOpen={() => onOpen(map.id)}
            onRemove={() => setRemoving(map)}
          />
        ))}
      </div>
      {sharing && (
        <ShareMapDialog
          campaign={campaign}
          onClose={() => setSharing(false)}
          onShared={(id) => {
            setSharing(false);
            notify("Mapa adicionado à campanha.");
            onOpen(id);
          }}
        />
      )}
      {removing && (
        <Modal
          title={`Remover ${removing.name} da campanha?`}
          onClose={() => setRemoving(undefined)}
          footer={
            <>
              <button className="button" onClick={() => setRemoving(undefined)}>
                Cancelar
              </button>
              <AsyncButton
                action={async () => {
                  await removeCampaignMap(db, backend!, removing);
                  setRemoving(undefined);
                  notify("Mapa removido da campanha.");
                }}
              >
                Remover mapa
              </AsyncButton>
            </>
          }
        >
          <p>
            O mapa e todos os locais marcados pelo grupo deixam de existir na
            campanha. Os seus mapas neste aparelho não são alterados.
          </p>
        </Modal>
      )}
    </section>
  );
}

function CampaignMapCard({
  map,
  master,
  onOpen,
  onRemove,
}: {
  map: CachedCampaignMap;
  master: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const asset = useLiveQuery(
    () => db.mapAssets.get(map.asset.id),
    [map.asset.id],
  );
  const thumbnail = useThumbnail(
    asset ??
      (map.asset.kind === "bundled" ? (map.asset as MapAsset) : undefined),
  );
  const counts = useLiveQuery(async () => {
    const places = await db.campaignLocations
      .where("mapId")
      .equals(map.id)
      .filter((l) => l.accountId === map.accountId)
      .toArray();
    return {
      total: places.length,
      secret: places.filter((p) => p.secret).length,
    };
  }, [map.id, map.accountId]);
  return (
    <article className="campaign-map-card">
      <button
        className="campaign-map-open"
        onClick={onOpen}
        aria-label={`Abrir ${map.name}`}
      >
        <span className="campaign-map-art">
          {thumbnail ? (
            <img src={thumbnail} alt="" loading="lazy" />
          ) : (
            <Compass size={32} />
          )}
        </span>
        <strong>{map.name}</strong>
        <small>
          <MapPin size={13} />
          {counts?.total ?? 0} {counts?.total === 1 ? "local" : "locais"}
          {master && counts?.secret ? (
            <Pill>
              <EyeOff size={12} />
              {counts.secret} {counts.secret === 1 ? "secreto" : "secretos"}
            </Pill>
          ) : null}
        </small>
      </button>
      {master && (
        <button
          className="icon-button campaign-map-remove"
          aria-label={`Remover ${map.name} da campanha`}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      )}
    </article>
  );
}

function ShareMapDialog({
  campaign,
  onClose,
  onShared,
}: {
  campaign: CachedCampaign;
  onClose: () => void;
  onShared: (mapId: string) => void;
}) {
  const local = useLiveQuery(() => db.atlasMaps.orderBy("name").toArray(), []);
  const [choice, setChoice] = useState("");
  const [places, setPlaces] = useState(true);
  const [secret, setSecret] = useState(false);
  const [progress, setProgress] = useState<[number, number]>();
  const selected = local?.find((m) => m.id === choice) ?? local?.[0];
  const count = useLiveQuery(
    () =>
      selected ? db.mapLocations.where("mapId").equals(selected.id).count() : 0,
    [selected?.id],
  );
  return (
    <Modal
      title="Adicionar mapa à campanha"
      subtitle={campaign.name}
      onClose={() => !progress && onClose()}
      footer={
        <>
          <button className="button" disabled={!!progress} onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            disabled={!selected || !!progress}
            action={async () => {
              try {
                const id = await shareMapToCampaign(
                  db,
                  backend!,
                  campaign.id,
                  selected!,
                  { places: places && !!count, secret },
                  (done, total) => setProgress([done, total]),
                );
                onShared(id);
              } finally {
                setProgress(undefined);
              }
            }}
          >
            Adicionar à campanha
          </AsyncButton>
        </>
      }
    >
      {local?.length === 0 ? (
        <p className="muted">
          Crie ou importe um mapa em Mapas para poder levá-lo à campanha.
        </p>
      ) : (
        <>
          <Field
            label="Mapa"
            hint="Uma cópia vai para a campanha; o seu mapa neste aparelho continua como está."
          >
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setChoice(e.target.value)}
            >
              {local?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          {!!count && (
            <>
              <Toggle
                label={`Levar também os ${count} locais já marcados`}
                checked={places}
                onChange={setPlaces}
              />
              {places && (
                <Toggle
                  label="Como secretos: revele cada um ao grupo quando quiser"
                  checked={secret}
                  onChange={setSecret}
                />
              )}
            </>
          )}
          {progress && (
            <p role="status" className="muted">
              Enviando a imagem do mapa… {progress[0]} de {progress[1]} partes
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

// A campaign map in the full-screen viewer. The image is downloaded once and
// kept for offline use; places are read from the synced cache.
export function CampaignMapScreen({
  campaign,
  mapId,
  onBack,
  notify,
}: {
  campaign: CachedCampaign;
  mapId: string;
  onBack: () => void;
  notify: (text: string) => void;
}) {
  const accountId = useSyncStatus().session!.userId;
  const map = useLiveQuery(
    async () => (await db.campaignMaps.get(mapId)) ?? null,
    [mapId],
  );
  const locations = useLiveQuery(
    () =>
      db.campaignLocations
        .where("mapId")
        .equals(mapId)
        .filter((l) => l.accountId === accountId)
        .toArray(),
    [mapId, accountId],
  );
  const [asset, setAsset] = useState<MapAsset>();
  const [progress, setProgress] = useState<[number, number]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!map) return;
    let active = true;
    setError("");
    ensureCampaignAsset(
      db,
      backend!,
      map,
      (done, total) => active && setProgress([done, total]),
    )
      .then((loaded) => active && setAsset(loaded))
      .catch((e) => active && setError(mapError(e)));
    return () => {
      active = false;
    };
  }, [map?.id, map?.asset.id, attempt]);
  if (map === undefined) return null;
  if (!map || map.accountId !== accountId)
    return (
      <Empty
        icon={<MapGlyph size={30} />}
        heading="Mapa indisponível"
        action={
          <button className="button" onClick={onBack}>
            <ArrowLeft size={16} />
            Mapas da campanha
          </button>
        }
      >
        Ele pode ter sido removido da campanha.
      </Empty>
    );
  if (!asset)
    return (
      <div className="campaign-map-loading" role="status">
        <Compass size={34} />
        {error ? (
          <>
            <p>Não foi possível baixar o mapa: {error}</p>
            <div className="row">
              <button className="button" onClick={onBack}>
                Voltar
              </button>
              <button
                className="button primary"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Tentar de novo
              </button>
            </div>
          </>
        ) : (
          <p>
            Preparando o mapa para uso offline…
            {progress ? ` ${progress[0]} de ${progress[1]}` : ""}
          </p>
        )}
      </div>
    );
  const master = campaign.role === "master";
  return (
    <MapWorkspace
      key={map.id}
      binding={{
        map,
        asset,
        locations,
        canSecret: master,
        savedMessage: "Local salvo na campanha.",
        save: (input, previous) =>
          saveCampaignPlace(
            db,
            backend!,
            accountId,
            { ...input, secret: master ? !!input.secret : false },
            previous as CampaignLocation | undefined,
          ),
        remove: (place) =>
          deleteCampaignPlace(db, backend!, place as CampaignLocation),
        editMap: (close) => (
          <CampaignMapEditor
            map={map}
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

function CampaignMapEditor({
  map,
  onClose,
  onSaved,
}: {
  map: CachedCampaignMap;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const [name, setName] = useState(map.name);
  const [notes, setNotes] = useState(map.notes);
  return (
    <Modal
      title="Editar mapa"
      subtitle="Visível para todo o grupo"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            disabled={!name.trim()}
            action={async () => {
              await updateCampaignMapInfo(db, backend!, map, name, notes);
              onSaved();
            }}
          >
            Salvar mapa
          </AsyncButton>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => e.preventDefault()}>
        <Field label="Nome do mapa">
          <input
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field
          label="Anotações do mapa"
          hint="História do território e observações do grupo."
        >
          <textarea
            rows={8}
            maxLength={50000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
