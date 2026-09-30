import { useEffect, useId, useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import { db } from "../../storage/database";
import { saveLocation, saveMap } from "../../storage/maps";
import type {
  AtlasMap,
  MapAsset,
  MapLocation,
  MapPoint,
  PreparedMapImage,
} from "../../domain/maps";
import { ErrorList, Field, Modal } from "../shared";
import { MAP_CATEGORIES, MAP_ICONS, MapIcon } from "./catalog";
import { prepareMapImage } from "./prepare-image";

export function mapError(error: unknown) {
  if (error instanceof Error && /quota/i.test(error.name + error.message))
    return "O armazenamento deste dispositivo está cheio. Exporte um backup e libere espaço antes de tentar novamente.";
  return error instanceof Error
    ? error.message
    : "Não foi possível salvar. Tente novamente.";
}
export function useThumbnail(asset?: MapAsset) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (asset?.kind === "bundled") {
      setUrl(`${asset.baseUrl}/thumbnail.webp`);
      return;
    }
    if (!asset?.thumbnail) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(asset.thumbnail);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [asset?.id, asset?.thumbnail]);
  return url;
}
export function MapEditor({
  map,
  asset,
  onClose,
  onSaved,
}: {
  map?: AtlasMap;
  asset?: MapAsset;
  onClose: () => void;
  onSaved: (map: AtlasMap) => void;
}) {
  const formId = useId();
  const [name, setName] = useState(map?.name ?? "");
  const [notes, setNotes] = useState(map?.notes ?? "");
  const [image, setImage] = useState<PreparedMapImage>();
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const preview = useThumbnail(image?.asset ?? asset);
  useEffect(() => () => pending.current?.abort(), []);
  const close = () => {
    if (!saving) {
      pending.current?.abort();
      onClose();
    }
  };
  return (
    <Modal
      title={map ? "Editar mapa" : "Novo mapa"}
      subtitle="Seu atlas de aventuras"
      onClose={close}
      className="atlas-editor"
      footer={
        <>
          <button className="button" onClick={close} disabled={saving}>
            Cancelar
          </button>
          <button
            className="button primary"
            form={formId}
            type="submit"
            disabled={
              saving ||
              progress !== undefined ||
              !name.trim() ||
              (!map && !image) ||
              (!!map && !!image && !replaceConfirmed)
            }
          >
            {saving ? "Salvando…" : "Salvar mapa"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving || progress !== undefined) return;
          setSaving(true);
          setError("");
          try {
            if (image && navigator.storage?.estimate) {
              const storage = await navigator.storage.estimate();
              const bytes =
                image.tiles.reduce(
                  (total, tile) => total + tile.blob.size,
                  image.asset.original?.size ?? 0,
                ) + (image.asset.thumbnail?.size ?? 0);
              if (
                storage.quota &&
                storage.usage &&
                bytes > storage.quota - storage.usage
              )
                throw new Error(
                  "Não há espaço disponível para esta imagem. Exporte seus mapas e libere espaço no dispositivo.",
                );
            }
            const saved = await saveMap(
              db,
              { name: name.trim(), notes },
              image,
              map,
            );
            if (navigator.storage?.persist)
              void navigator.storage.persist().catch(() => {});
            onSaved(saved);
          } catch (err) {
            setError(mapError(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        <ErrorList errors={error ? [error] : []} />
        <Field label="Nome do mapa">
          <input
            autoFocus
            value={name}
            maxLength={200}
            required
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
            placeholder="Reino, cidade, masmorra…"
          />
        </Field>
        <label className="atlas-upload">
          <Upload size={24} />
          <strong>
            {map ? "Substituir imagem" : "Escolher imagem do mapa"}
          </strong>
          <span>JPEG, PNG ou WebP · até 50 MB e 64 megapixels</span>
          <input
            type="file"
            aria-label="Imagem do mapa"
            accept="image/jpeg,image/png,image/webp"
            disabled={saving}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              pending.current?.abort();
              const controller = new AbortController();
              pending.current = controller;
              setImage(undefined);
              setProgress(0);
              setError("");
              setReplaceConfirmed(false);
              try {
                const prepared = await prepareMapImage(
                  file,
                  (value) => {
                    if (!controller.signal.aborted) setProgress(value);
                  },
                  controller.signal,
                );
                if (!controller.signal.aborted) setImage(prepared);
              } catch (err) {
                if (!controller.signal.aborted) setError(mapError(err));
              } finally {
                if (!controller.signal.aborted) setProgress(undefined);
              }
            }}
          />
        </label>
        {progress !== undefined && (
          <div className="atlas-progress" role="status">
            <span>Preparando imagem… {progress}%</span>
            <progress max={100} value={progress} />
          </div>
        )}
        {preview && (
          <img
            className="atlas-image-preview"
            src={preview}
            alt="Prévia do mapa"
          />
        )}
        {!!map && !!image && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={replaceConfirmed}
              onChange={(event) => setReplaceConfirmed(event.target.checked)}
            />
            <span>
              Substituir a imagem mantendo os locais nas mesmas posições
              relativas. Se o território mudou, pode ser necessário
              reposicioná-los.
            </span>
          </label>
        )}
        <Field
          label="Anotações do mapa"
          hint="Contexto da campanha, história e observações gerais."
        >
          <textarea
            rows={5}
            maxLength={50000}
            value={notes}
            disabled={saving}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

type EditedPlace = MapLocation & { secret?: boolean };
type PlaceInput = Pick<
  MapLocation,
  "mapId" | "name" | "categoryId" | "iconId" | "x" | "y" | "notes"
> & { secret?: boolean };
export function LocationEditor<T extends EditedPlace>({
  mapId,
  point,
  location,
  canSecret = false,
  save,
  onClose,
  onSaved,
}: {
  mapId: string;
  point: MapPoint;
  location?: T;
  // Only campaign masters may keep a place hidden from the group.
  canSecret?: boolean;
  save?: (input: PlaceInput, previous?: T) => Promise<T>;
  onClose: () => void;
  onSaved: (location: T) => void;
}) {
  const [secret, setSecret] = useState(location?.secret ?? false);
  const formId = useId();
  const [name, setName] = useState(location?.name ?? "");
  const [categoryId, setCategory] = useState(
    location?.categoryId ?? "interest",
  );
  const [iconId, setIcon] = useState(location?.iconId ?? "treasure-map");
  const [notes, setNotes] = useState(location?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal
      title={location ? "Editar local" : "Adicionar local"}
      subtitle="Um novo capítulo no mapa"
      onClose={close}
      className="atlas-editor"
      footer={
        <>
          <button className="button" disabled={busy} onClick={close}>
            Cancelar
          </button>
          <button
            className="button primary"
            form={formId}
            type="submit"
            disabled={busy || !name.trim()}
          >
            {busy ? "Salvando…" : "Salvar local"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const input = {
              mapId,
              ...point,
              name: name.trim(),
              categoryId,
              iconId,
              notes,
              ...(canSecret ? { secret } : {}),
            };
            const saved = save
              ? await save(input, location)
              : ((await saveLocation(db, input, location)) as T);
            if (navigator.storage?.persist)
              void navigator.storage.persist().catch(() => {});
            onSaved(saved);
          } catch (err) {
            setError(mapError(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorList errors={error ? [error] : []} />
        <Field label="Nome do local">
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cidade de Valdris"
          />
        </Field>
        <Field label="Categoria">
          <select
            value={categoryId}
            onChange={(event) => {
              const next = MAP_CATEGORIES.find(
                (category) => category.id === event.target.value,
              )!;
              setCategory(next.id);
              // Keep a deliberately chosen icon when changing category.
              if (
                iconId ===
                MAP_CATEGORIES.find((category) => category.id === categoryId)
                  ?.iconId
              )
                setIcon(next.iconId);
            }}
          >
            {!MAP_CATEGORIES.some((category) => category.id === categoryId) && (
              <option value={categoryId}>Outro local</option>
            )}
            {MAP_CATEGORIES.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="atlas-icon-field">
          <legend>Ícone do local</legend>
          <div className="atlas-icon-grid">
            {MAP_ICONS.map((icon) => (
              <button
                key={icon.id}
                type="button"
                title={icon.name}
                aria-label={`Ícone: ${icon.name}`}
                aria-pressed={iconId === icon.id}
                className={iconId === icon.id ? "selected" : ""}
                onClick={() => setIcon(icon.id)}
              >
                <MapIcon id={icon.id} size={28} />
                <span>{icon.name}</span>
                {iconId === icon.id && (
                  <Check size={12} className="atlas-icon-check" />
                )}
              </button>
            ))}
          </div>
        </fieldset>
        <Field
          label="Descrição e anotações"
          hint="História, NPCs, missões, segredos, tesouros…"
        >
          <textarea
            rows={6}
            maxLength={50000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="O que torna este lugar importante para a sua campanha?"
          />
        </Field>
        {canSecret && (
          <label className="check-label atlas-secret-option">
            <input
              type="checkbox"
              checked={secret}
              onChange={(event) => setSecret(event.target.checked)}
            />
            <span>
              Local secreto
              <small>Só mestres veem. Revele ao grupo quando quiser.</small>
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
}
