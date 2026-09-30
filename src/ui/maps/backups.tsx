import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, Upload } from "lucide-react";
import { db } from "../../storage/database";
import {
  downloadMapBackup,
  exportMapBackup,
  importMapBackup,
  parseMapBackup,
  type MapBackupPreview,
} from "../../storage/map-backup";
import { ErrorList, Field } from "../shared";
import { mapError } from "./forms";
import "./maps.css";

export function MapBackups() {
  const maps = useLiveQuery(() => db.atlasMaps.toArray(), []);
  const [mapId, setMapId] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [preview, setPreview] = useState<MapBackupPreview>();
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState("");
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const task = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await work();
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };
  return (
    <section className="atlas-backup-section" aria-label="Backups dos mapas">
      <h3>Seu atlas, em qualquer mesa</h3>
      <p>
        Guarde mapas, imagens, locais e anotações em um arquivo ZIP. A
        restauração cria cópias e preserva os mapas atuais.
      </p>
      <ErrorList errors={error ? [error] : []} />
      <Field label="Mapas para exportar">
        <select
          value={mapId}
          disabled={busy}
          onChange={(event) => setMapId(event.target.value)}
        >
          <option value="">Todos os mapas ({maps?.length ?? 0})</option>
          {maps?.map((map) => (
            <option key={map.id} value={map.id}>
              {map.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="backup-options">
        <button
          className="backup-card"
          disabled={busy || !maps?.length}
          onClick={() =>
            void task(async () => {
              downloadMapBackup(
                await exportMapBackup(
                  db,
                  setProgress,
                  mapId ? [mapId] : undefined,
                ),
              );
              setSuccess("Backup de mapas preparado.");
            })
          }
        >
          <Download size={26} />
          <strong>Exportar mapas</strong>
          <small>Imagens e anotações incluídas</small>
        </button>
        <button
          className="backup-card"
          disabled={busy}
          onClick={() => setChoosing((value) => !value)}
        >
          <Upload size={26} />
          <strong>Importar mapas</strong>
          <small>Restaurar arquivo ZIP</small>
        </button>
      </div>
      {choosing && (
        <Field label="Arquivo de backup dos mapas">
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                setPreview(undefined);
                void task(async () =>
                  setPreview(await parseMapBackup(file, setProgress)),
                );
              }
            }}
          />
        </Field>
      )}
      {busy && <p role="status">{progress || "Salvando mapas…"}</p>}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
      {preview && (
        <div className="backup-preview">
          <h4>Prévia dos mapas</h4>
          <p>
            {preview.maps.length} mapas · {preview.locations.length} locais ·{" "}
            {preview.images.length} imagens
          </p>
          <ul>
            {preview.maps.map((map) => (
              <li key={map.id}>{map.name} — será uma cópia</li>
            ))}
          </ul>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void task(async () => {
                const added = await importMapBackup(db, preview);
                setPreview(undefined);
                setChoosing(false);
                setSuccess(
                  `${added.length} mapa(s) restaurado(s) como cópias.`,
                );
              })
            }
          >
            Importar mapas como cópias
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() => setPreview(undefined)}
          >
            Cancelar importação
          </button>
        </div>
      )}
    </section>
  );
}
