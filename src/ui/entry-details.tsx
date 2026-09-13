import { useMemo } from "react";
import { CLASS_MAP } from "../data/rules";
import type { CatalogEntry } from "../domain/types";
import { EntityIcon } from "./entity-icon";
import { Modal, Pill, useApp } from "./shared";
import { BookEntryButton, EntryReadout } from "./entry-readout";
import { libraryContext } from "./library-data";

export function EntryDetails({
  entry: e,
  onClose: close,
  onAcquire,
}: {
  entry: CatalogEntry;
  onClose: () => void;
  onAcquire?: (entry: CatalogEntry) => void;
}) {
  const { character: c, commit } = useApp();
  const relation = useMemo(() => libraryContext(c)(e), [c, e]);
  const background = (promise: Promise<unknown>) => {
    void promise.catch(() => {});
  };

  const acs = c.acquisitions.filter((a) => a.entryId === e.id);
  return (
    <Modal
      title={e.name}
      titleIcon={<EntityIcon name={e.name} size={34} />}
      subtitle={e.group || e.kind}
      onClose={close}
      footer={
        <>
          <BookEntryButton entry={e} />
          <button className="button" onClick={close}>
            Fechar
          </button>
        </>
      }
    >
      <div className="entry-relation">
        <Pill
          tone={
            relation.status === "owned"
              ? "green"
              : relation.status === "blocked"
                ? "red"
                : "neutral"
          }
        >
          {relation.label}
        </Pill>
        {relation.reasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
      </div>
      <EntryReadout entry={e} />
      {relation.status !== "owned" && e.kind !== "classChoice" && onAcquire && (
        <button className="button primary" onClick={() => onAcquire(e)}>
          Preparar aquisição
        </button>
      )}
      {acs.map((a) => (
        <section className="acquisition-detail" key={a.id}>
          <h3>
            Aprendido no nível {a.level} ·{" "}
            {CLASS_MAP.get(a.source)?.name ?? a.source}
          </h3>
          {Object.entries(a.choices).map(([key, value]) => (
            <p key={key}>
              <b>{key}:</b> {value}
            </p>
          ))}
          {e.kind === "spell" &&
            a.source === "arcanista" &&
            c.choices.path === "Mago" && (
              <button
                className="button small"
                onClick={() =>
                  background(
                    commit({
                      type: "edit",
                      character: {
                        ...c,
                        acquisitions: c.acquisitions.map((x) =>
                          x.id === a.id ? { ...x, prepared: !x.prepared } : x,
                        ),
                      },
                      reason: `Memorização: ${e.name}`,
                    }),
                  )
                }
              >
                {a.prepared ? "Retirar da memorização" : "Memorizar"}
              </button>
            )}
          {a.mode === "device" && a.broken && (
            <button
              className="button"
              onClick={() =>
                background(
                  commit({ type: "repairDevice", acquisitionId: a.id }),
                )
              }
            >
              Reparar engenhoca (1 hora)
            </button>
          )}
          <button
            className="text-button danger-text"
            onClick={() =>
              background(
                commit({
                  type: "edit",
                  character: {
                    ...c,
                    acquisitions: c.acquisitions.filter((x) => x.id !== a.id),
                  },
                  reason: `Remoção de aquisição: ${e.name}`,
                }).then(close),
              )
            }
          >
            Remover aquisição
          </button>
        </section>
      ))}
    </Modal>
  );
}
