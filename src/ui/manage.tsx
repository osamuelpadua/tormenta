import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Dices,
  Download,
  History,
  Plus,
  Search,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ATTRIBUTES,
  CATALOG,
  CLASSES,
  CLASS_MAP,
  DAMAGE_TYPES,
  ENTRY_MAP,
  RACES,
  SKILLS,
  XP,
  classLevel,
  sign,
  slug,
} from "../data/rules";
import { acquisition, uid } from "../domain/character";
import { calculate } from "../domain/calculate";
import { powerOptions, validation } from "../domain/creation";
import type { CatalogEntry, Character } from "../domain/types";
import { db, downloadBackup } from "../storage/database";
import { parseBackup, type Backup } from "../storage/schema";
import { EntryPicker, SpellChoices } from "./creation";
import {
  AsyncButton,
  Empty,
  ErrorList,
  Field,
  Modal,
  NumberField,
  Pill,
  SourceButton,
  Toggle,
  useApp,
} from "./shared";

export function Editor({ onClose }: { onClose: () => void }) {
  const { character: c, commit } = useApp();
  const [draft, setDraft] = useState(structuredClone(c));
  const [tab, setTab] = useState("identity");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const set = (partial: Partial<Character>) =>
    setDraft((d) => ({ ...d, ...partial }));
  const v = validation(draft);
  const before = calculate(c),
    after = calculate(draft);
  return (
    <Modal
      title="Editar personagem"
      subtitle={c.name}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            action={async () => {
              try {
                if (!reason.trim())
                  throw new Error("Descreva a alteração e sua origem.");
                if (v.errors.length && !review)
                  throw new Error(
                    "Revise as escolhas dependentes antes de salvar.",
                  );
                await commit({
                  type: "edit",
                  character: {
                    ...draft,
                    choices: {
                      ...draft.choices,
                      reviewedExceptions: v.errors,
                      editReason: reason,
                    },
                  },
                  reason,
                });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Salvar alterações
          </AsyncButton>
        </>
      }
    >
      <div className="tabs">
        {[
          ["identity", "Identidade"],
          ["attributes", "Atributos e perícias"],
          ["attacks", "Ataques"],
          ["modifiers", "Ajustes"],
          ["choices", "Escolhas internas"],
        ].map(([id, name]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <ErrorList errors={error ? [error] : []} />
      {tab === "identity" && (
        <>
          <div className="form-grid">
            <Field label="Nome">
              <input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Jogador">
              <input
                value={draft.player}
                onChange={(e) => set({ player: e.target.value })}
              />
            </Field>
            <Field label="Raça">
              <select
                value={draft.raceId}
                onChange={(e) => set({ raceId: e.target.value })}
              >
                {RACES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            <NumberField
              label="Idade"
              value={draft.age}
              onChange={(age) => set({ age })}
              min={0}
            />
            <Field label="Alinhamento / crenças">
              <input
                value={draft.alignment}
                onChange={(e) => set({ alignment: e.target.value })}
              />
            </Field>
            <NumberField
              label="Experiência (XP)"
              value={draft.xp}
              onChange={(xp) => set({ xp })}
              min={0}
            />
            <Field label="Modo de evolução">
              <select
                value={draft.advancement}
                onChange={(e) =>
                  set({
                    advancement: e.target.value as Character["advancement"],
                  })
                }
              >
                <option value="milestones">Marcos</option>
                <option value="xp">Pontos de experiência</option>
              </select>
            </Field>
            <Field label="Origem">
              <select
                value={draft.originId}
                onChange={(e) => set({ originId: e.target.value })}
              >
                <option value="">Sem origem</option>
                {CATALOG.filter((e) => e.kind === "origin").map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Divindade">
              <select
                value={draft.deityId}
                onChange={(e) => set({ deityId: e.target.value })}
              >
                <option value="">Sem devoção</option>
                {CATALOG.filter((e) => e.kind === "deity").map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {(
            [
              ["concept", "Conceito"],
              ["appearance", "Aparência"],
              ["personality", "Personalidade"],
              ["biography", "História"],
              ["notes", "Anotações"],
            ] as const
          ).map(([key, name]) => (
            <Field key={key} label={name}>
              <textarea
                value={draft[key]}
                onChange={(e) => set({ [key]: e.target.value })}
                rows={3}
              />
            </Field>
          ))}
        </>
      )}
      {tab === "attributes" && (
        <>
          <div className="form-grid">
            {ATTRIBUTES.map((a) => (
              <NumberField
                key={a.id}
                label={`${a.name} inicial`}
                value={draft.attributes[a.id]}
                onChange={(n) =>
                  set({ attributes: { ...draft.attributes, [a.id]: n } })
                }
              />
            ))}
          </div>
          <h3>Escolhas raciais de atributo</h3>
          <div className="skill-choices">
            {ATTRIBUTES.map((a) => (
              <Toggle
                key={a.id}
                label={a.name}
                checked={draft.racialChoices.includes(a.id)}
                onChange={(yes) =>
                  set({
                    racialChoices: yes
                      ? [...draft.racialChoices, a.id]
                      : draft.racialChoices.filter((x) => x !== a.id),
                  })
                }
              />
            ))}
          </div>
          <Field label="Especialidades de Ofício (separadas por vírgula)">
            <input
              value={draft.crafts.join(", ")}
              onChange={(e) =>
                set({
                  crafts: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <h3>Perícias treinadas</h3>
          <div className="skill-choices">
            {[
              ...SKILLS.filter((s) => s.id !== "oficio"),
              ...draft.crafts.map((name) => ({
                id: `oficio-${slug(name)}`,
                name: `Ofício (${name})`,
              })),
            ].map((s) => (
              <Toggle
                key={s.id}
                label={s.name}
                checked={draft.trained.some((t) => t.id === s.id)}
                onChange={(yes) =>
                  set({
                    trained: yes
                      ? [
                          ...draft.trained,
                          {
                            id: s.id,
                            source: "Edição autorizada",
                            level: draft.levels.length,
                          },
                        ]
                      : draft.trained.filter((t) => t.id !== s.id),
                  })
                }
              />
            ))}
          </div>
        </>
      )}
      {tab === "attacks" && (
        <>
          {draft.attacks.map((a) => (
            <section className="attack-editor" key={a.id}>
              <div className="row between">
                <h3>{a.name}</h3>
                <button
                  className="icon-button"
                  aria-label="Remover ataque"
                  onClick={() =>
                    set({ attacks: draft.attacks.filter((x) => x.id !== a.id) })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <div className="form-grid">
                {(["name", "damage", "range"] as const).map((key) => (
                  <Field
                    key={key}
                    label={
                      {
                        name: "Nome",
                        damage: "Dados de dano",
                        range: "Alcance",
                      }[key]
                    }
                  >
                    <input
                      value={a[key]}
                      onChange={(e) =>
                        set({
                          attacks: draft.attacks.map((x) =>
                            x.id === a.id ? { ...x, [key]: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
                <Field label="Perícia de ataque">
                  <select
                    value={a.skill}
                    onChange={(e) =>
                      set({
                        attacks: draft.attacks.map((x) =>
                          x.id === a.id ? { ...x, skill: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    <option value="luta">Luta</option>
                    <option value="pontaria">Pontaria</option>
                  </select>
                </Field>
                {(
                  ["attackBonus", "damageBonus", "threat", "critical"] as const
                ).map((key) => (
                  <NumberField
                    key={key}
                    label={
                      {
                        attackBonus: "Bônus de ataque",
                        damageBonus: "Bônus de dano",
                        threat: "Ameaça",
                        critical: "Crítico",
                      }[key]
                    }
                    value={a[key]}
                    onChange={(n) =>
                      set({
                        attacks: draft.attacks.map((x) =>
                          x.id === a.id ? { ...x, [key]: n } : x,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            </section>
          ))}
          <button
            className="button"
            onClick={() =>
              set({
                attacks: [
                  ...draft.attacks,
                  {
                    id: uid(),
                    name: "Novo ataque",
                    skill: "luta",
                    damage: "1d6",
                    damageType: "impacto",
                    threat: 20,
                    critical: 2,
                    range: "Corpo a corpo",
                    attribute: "for",
                    attackBonus: 0,
                    damageBonus: 0,
                    natural: false,
                    favorite: true,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            Adicionar ataque
          </button>
          <p className="muted">
            Armas empunhadas e ataques raciais são criados automaticamente. Use
            esta área para configurações adicionais.
          </p>
        </>
      )}
      {tab === "modifiers" && (
        <>
          <p>
            Registre bônus e penalidades permanentes com a fonte que os concede.
          </p>
          {draft.modifiers.map((m) => (
            <div className="modifier-editor" key={m.id}>
              <div className="form-grid">
                <Field label="Origem e motivo">
                  <input
                    value={m.label}
                    onChange={(e) =>
                      set({
                        modifiers: draft.modifiers.map((x) =>
                          x.id === m.id ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label="Valor afetado">
                  <select
                    value={m.target}
                    onChange={(e) =>
                      set({
                        modifiers: draft.modifiers.map((x) =>
                          x.id === m.id ? { ...x, target: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {[
                      ["defense", "Defesa"],
                      ["hp", "PV máximos"],
                      ["mp", "PM máximos"],
                      ["attack", "Ataques"],
                      ["damage", "Dano"],
                      ["speed", "Deslocamento"],
                      ["rd", "RD"],
                      ["capacity", "Capacidade"],
                      ...ATTRIBUTES.map((a) => [`attribute:${a.id}`, a.name]),
                      ...SKILLS.map((s) => [`skill:${s.id}`, s.name]),
                    ].map(([k, n]) => (
                      <option value={k} key={k}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <NumberField
                  label="Modificador"
                  value={m.value}
                  onChange={(n) =>
                    set({
                      modifiers: draft.modifiers.map((x) =>
                        x.id === m.id ? { ...x, value: n } : x,
                      ),
                    })
                  }
                />
              </div>
              <button
                className="text-button danger-text"
                onClick={() =>
                  set({
                    modifiers: draft.modifiers.filter((x) => x.id !== m.id),
                  })
                }
              >
                Remover ajuste
              </button>
            </div>
          ))}
          <button
            className="button"
            onClick={() =>
              set({
                modifiers: [
                  ...draft.modifiers,
                  {
                    id: uid(),
                    label: "",
                    source: "ajuste",
                    sourceId: uid(),
                    target: "defense",
                    value: 0,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            Novo ajuste autorizado
          </button>
        </>
      )}
      {tab === "choices" && (
        <>
          {Object.entries(draft.choices).map(([key, value]) => (
            <Field key={key} label={key}>
              <input
                value={Array.isArray(value) ? value.join(", ") : value}
                onChange={(e) =>
                  set({
                    choices: {
                      ...draft.choices,
                      [key]: Array.isArray(value)
                        ? e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : e.target.value,
                    },
                  })
                }
              />
            </Field>
          ))}
          <div className="notice">
            Escolhas internas preservam linhagens, escolas, focos, companheiros
            e decisões anteriores. Os registros com prefixo de revisão
            documentam exceções autorizadas.
          </div>
        </>
      )}
      <div className="change-preview">
        <span>
          PV máximos{" "}
          <b>
            {before.hp.total} → {after.hp.total}
          </b>
        </span>
        <span>
          PM máximos{" "}
          <b>
            {before.mp.total} → {after.mp.total}
          </b>
        </span>
        <span>
          Defesa{" "}
          <b>
            {before.defense.total} → {after.defense.total}
          </b>
        </span>
      </div>
      <small>
        PV e PM atuais serão preservados. Recuperação e gasto são operações
        separadas.
      </small>
      {v.errors.length > 0 && (
        <>
          <ErrorList errors={v.errors} />
          <Toggle
            label="Revisei as escolhas dependentes e o mestre autorizou as exceções"
            checked={review}
            onChange={setReview}
          />
        </>
      )}
      <Field label="Origem e motivo da edição">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Descreva o que mudou e por quê"
        />
      </Field>
    </Modal>
  );
}
export function Evolution({ onClose }: { onClose: () => void }) {
  const { character: c, commit } = useApp();
  const [clsId, setClsId] = useState(c.levels.at(-1)!.classId);
  const [draft, setDraft] = useState<Character>({
    ...structuredClone(c),
    levels: [...c.levels, { classId: clsId, powers: [], notes: "" }],
  });
  const [tab, setTab] = useState("class");
  const [resourceMode, setResourceMode] = useState<"keep" | "increase">("keep");
  const [exception, setException] = useState("");
  const [error, setError] = useState("");
  const cls = CLASS_MAP.get(clsId)!;
  const n = classLevel(draft, clsId);
  const before = calculate(c),
    after = calculate(draft);
  const existing = new Set(validation(c).errors);
  const errors = validation(draft).errors.filter((e) => !existing.has(e));
  const gained = draft.acquisitions.filter(
    (a) => !c.acquisitions.some((x) => x.id === a.id),
  );
  if (
    n >= 2 &&
    gained.filter(
      (a) => a.source === clsId && ENTRY_MAP.get(a.entryId)?.kind !== "spell",
    ).length !== 1
  )
    errors.push("Escolha um poder para este nível de classe.");
  if (c.advancement === "xp" && c.xp < XP[c.levels.length])
    errors.push(`A evolução requer ${XP[c.levels.length]} XP.`);
  return (
    <Modal
      title={`Um novo capítulo: nível ${c.levels.length + 1}`}
      subtitle="Evolução de personagem"
      className="evolution-dialog"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            action={async () => {
              try {
                if (errors.length && !exception.trim())
                  throw new Error(
                    "Resolva as escolhas da evolução ou registre uma autorização do mestre.",
                  );
                await commit({
                  type: "level",
                  character: {
                    ...draft,
                    choices: {
                      ...draft.choices,
                      ...(exception
                        ? {
                            levelException: exception,
                            reviewedExceptions: errors,
                          }
                        : {}),
                    },
                    levels: draft.levels.map((l, i) =>
                      i === draft.levels.length - 1
                        ? {
                            ...l,
                            powers: gained.map((a) => a.entryId),
                            notes: exception,
                          }
                        : l,
                    ),
                  },
                  resourceMode,
                });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Confirmar evolução
            <ArrowRight size={17} />
          </AsyncButton>
        </>
      }
    >
      <div className="tabs">
        {[
          ["class", "Classe"],
          ["power", "Poder"],
          ["spells", "Magias"],
          ["review", "Comparação"],
        ].map(([id, name]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <ErrorList errors={error ? [error] : []} />
      {tab === "class" && (
        <>
          <Field label="Classe do novo nível">
            <select
              value={clsId}
              onChange={(e) => {
                const id = e.target.value;
                setClsId(id);
                setDraft({
                  ...structuredClone(c),
                  levels: [...c.levels, { classId: id, powers: [], notes: "" }],
                });
              }}
            >
              {CLASSES.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} · {classLevel(c, cls.id)} →{" "}
                  {classLevel(c, cls.id) + 1}
                </option>
              ))}
            </select>
          </Field>
          <div className="notice">
            <strong>
              {cls.name} {n}
            </strong>
            <p>{cls.progression[String(n) as keyof typeof cls.progression]}</p>
            <small>
              p. {cls.page} · O primeiro nível de uma nova classe usa os ganhos
              de níveis adicionais. Treinamentos e proficiências iniciais não
              são recebidos novamente.
            </small>
          </div>
          <p>
            PV por este nível:{" "}
            {Math.max(1, cls.hpPerLevel + after.attributes.con.total)}. PM por
            este nível: {cls.mpPerLevel}. Atributos e habilidades podem alterar
            os totais abaixo.
          </p>
        </>
      )}
      {tab === "power" &&
        (n >= 2 ? (
          <EntryPicker
            character={draft}
            source={clsId}
            entries={powerOptions(draft, clsId)}
            onChange={setDraft}
          />
        ) : (
          <Empty heading="Habilidades iniciais da nova classe">
            As habilidades automáticas entram neste nível. As escolhas de
            caminho, foco ou escolas podem ser registradas na edição da ficha.
          </Empty>
        ))}
      {tab === "spells" && <SpellChoices c={draft} onChange={setDraft} />}
      <section className="evolution-comparison">
        <h3>Antes de confirmar</h3>
        <div className="comparison-row">
          <span>Nível total</span>
          <b>{c.levels.length}</b>
          <ArrowRight size={15} />
          <b>{draft.levels.length}</b>
        </div>
        {[
          ["PV máximos", before.hp.total, after.hp.total],
          ["PM máximos", before.mp.total, after.mp.total],
          ["Defesa", before.defense.total, after.defense.total],
          ...Object.entries(after.skills)
            .filter(([key, v]) => v.total !== before.skills[key]?.total)
            .map(([key, v]) => [
              SKILLS.find((s) => s.id === key)?.name ?? key,
              before.skills[key]?.total ?? 0,
              v.total,
            ]),
        ].map(([label, a, b]) => (
          <div className="comparison-row" key={label}>
            <span>{label}</span>
            <b>{a}</b>
            <ArrowRight size={15} />
            <b>{b}</b>
          </div>
        ))}
        {gained.map((a) => (
          <div className="comparison-row" key={a.id}>
            <span>{ENTRY_MAP.get(a.entryId)?.name}</span>
            <Pill tone="green">Novo</Pill>
          </div>
        ))}
      </section>
      <Field label="PV e PM atuais após a evolução">
        <select
          value={resourceMode}
          onChange={(e) =>
            setResourceMode(e.target.value as typeof resourceMode)
          }
        >
          <option value="keep">Preservar os valores atuais</option>
          <option value="increase">
            Acrescentar somente o aumento dos máximos
          </option>
        </select>
      </Field>
      <ErrorList errors={errors} />
      {errors.length > 0 && (
        <Field label="Exceção autorizada: mestre e motivo">
          <textarea
            value={exception}
            onChange={(e) => setException(e.target.value)}
            rows={2}
          />
        </Field>
      )}
    </Modal>
  );
}
export function AddEntry({
  spells,
  onClose,
}: {
  spells: boolean;
  onClose: () => void;
}) {
  const { character: c, commit } = useApp();
  const [draft, setDraft] = useState(structuredClone(c));
  const [source, setSource] = useState(c.levels[0].classId);
  const [mode, setMode] = useState<"spell" | "formula" | "device">("spell");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const selected = draft.acquisitions.filter(
    (a) => !c.acquisitions.some((x) => x.id === a.id),
  );
  return (
    <Modal
      title={
        spells ? "Biblioteca de magias" : "Biblioteca de poderes e habilidades"
      }
      onClose={onClose}
      wide
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            action={async () => {
              try {
                if (!reason.trim())
                  throw new Error("Registre a origem da aquisição.");
                await commit({
                  type: "edit",
                  character: {
                    ...draft,
                    acquisitions: draft.acquisitions.map((a) =>
                      selected.some((x) => x.id === a.id)
                        ? {
                            ...a,
                            mode: spells ? mode : undefined,
                            choices: {
                              ...a.choices,
                              acquisitionReason: reason,
                            },
                          }
                        : a,
                    ),
                  },
                  reason: `Aquisição: ${reason}`,
                });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Salvar escolhas ({selected.length})
          </AsyncButton>
        </>
      }
    >
      <ErrorList errors={error ? [error] : []} />
      <div className="form-grid">
        <Field label="Origem da aprendizagem">
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {[...new Set(c.levels.map((l) => l.classId))].map((id) => (
              <option key={id} value={id}>
                {CLASS_MAP.get(id)?.name}
              </option>
            ))}
            {["Raça", "Origem", "Devoção", "Mestre"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        {spells && (
          <Field label="Forma de uso">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="spell">Magia</option>
              <option value="formula">Fórmula alquímica</option>
              <option value="device">Engenhoca</option>
            </select>
          </Field>
        )}
      </div>
      <EntryPicker
        character={draft}
        source={source}
        entries={CATALOG.filter((e) =>
          spells
            ? e.kind === "spell"
            : [
                "power",
                "classPower",
                "originPower",
                "raceAbility",
                "ability",
                "partner",
              ].includes(e.kind),
        )}
        onChange={setDraft}
        spells={spells}
      />
      <Field label="Origem e motivo">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Evolução, habilidade, treino ou autorização do mestre…"
        />
      </Field>
      <small className="muted">
        A biblioteca inclui opções de todas as classes. Escolhas fora da
        progressão devem identificar a autorização do mestre.
      </small>
    </Modal>
  );
}
export function HistoryModal({ onClose }: { onClose: () => void }) {
  const { character: c, notify } = useApp();
  const events = useLiveQuery(
    () => db.history.where("characterId").equals(c.id).reverse().sortBy("at"),
    [c.id],
  );
  return (
    <Modal
      title="Diário da aventura"
      subtitle="Histórico"
      onClose={onClose}
      wide
      footer={
        <>
          <small className="muted">
            Operações desfeitas permanecem no diário.
          </small>
          <AsyncButton
            className="button"
            action={async () => {
              try {
                await db.undo(c.id, c.revision);
                notify("Última operação desfeita.");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <Undo2 size={16} />
            Desfazer última operação
          </AsyncButton>
        </>
      }
    >
      <div className="timeline">
        {events?.map((e) => (
          <article className={e.undone ? "undone" : ""} key={e.id}>
            <div className="timeline-dot" />
            <div className="row between">
              <h3>{e.title}</h3>
              <time>
                {new Date(e.at).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </time>
            </div>
            <p>{e.detail}</p>
            {e.undone && <Pill>Desfeito</Pill>}
            {e.rolls?.map((r, i) => (
              <details className="roll-detail" key={i}>
                <summary>
                  <Dices size={15} />
                  {r.expression}
                  <b>{r.total}</b>
                  {r.natural && <small>natural {r.natural}</small>}
                </summary>
                <p>
                  {r.dice
                    .map(
                      (d) =>
                        `d${d.sides}: [${d.values.join(", ")}] → mantidos [${d.kept.map((i) => d.values[i]).join(", ")}]`,
                    )
                    .join(" · ")}{" "}
                  · constante: {sign(r.constant)}
                </p>
              </details>
            ))}
          </article>
        ))}
      </div>
    </Modal>
  );
}
export function DiceModal({ onClose }: { onClose: () => void }) {
  const { commit } = useApp();
  const [expression, setExpression] = useState("1d20");
  const [label, setLabel] = useState("Teste da mesa");
  const [error, setError] = useState("");
  return (
    <Modal
      title="Registrar dados da mesa"
      subtitle="Dados físicos"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            action={async () => {
              try {
                await commit({ type: "roll", expression, label });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Dices size={17} />
            Informar resultados
          </AsyncButton>
        </>
      }
    >
      <ErrorList errors={error ? [error] : []} />
      <div className="dice-types">
        {[4, 6, 8, 10, 12, 20, 100].map((s) => (
          <button key={s} onClick={() => setExpression(`1d${s}`)}>
            d{s}
          </button>
        ))}
      </div>
      <Field label="Expressão de dados">
        <input
          className="dice-expression"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Identificação da rolagem">
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <p className="muted">
        Exemplos: 1d20+5, 2d6+3, 4d6kh3 (mantém os três maiores). Na próxima
        etapa, informe os dados que você rolou na mesa. O app soma os
        modificadores.
      </p>
    </Modal>
  );
}
export { BookModal } from "./book";
export function BackupModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const [preview, setPreview] = useState<Backup>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const characters = useLiveQuery(() => db.characters.toArray(), []);
  const recovery = useLiveQuery(() => db.recovery.toArray(), []);
  return (
    <Modal
      title="Guarde sua história"
      subtitle="Backups locais"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Fechar
          </button>
          {preview && (
            <AsyncButton
              action={async () => {
                try {
                  const added = await db.importBackup(preview);
                  onImported(added[0].id);
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Upload size={16} />
              Importar como cópias
            </AsyncButton>
          )}
        </>
      }
    >
      <p className="lead">
        Seus personagens ficam neste navegador. Um backup leva a aventura para
        outro dispositivo.
      </p>
      <ErrorList errors={error ? [error] : []} />
      <div className="backup-options">
        <AsyncButton
          className="backup-card"
          action={async () => {
            try {
              downloadBackup(await db.exportBackup());
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Download size={26} />
          <strong>Exportar personagens</strong>
          <small>
            {characters?.length ?? 0} personagem(ns), sessões e histórico
          </small>
        </AsyncButton>
        <label className="backup-card">
          <Upload size={26} />
          <strong>Importar backup</strong>
          <small>Selecionar arquivo JSON</small>
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 50 * 1024 * 1024)
                  throw new Error("Arquivo maior que 50 MB.");
                const parsed = parseBackup(await file.text());
                setPreview(parsed.backup);
                setWarnings(parsed.warnings);
                setError("");
              } catch (err) {
                setError((err as Error).message);
                setPreview(undefined);
              }
            }}
          />
        </label>
      </div>
      {preview && (
        <section className="backup-preview">
          <h3>Prévia da importação</h3>
          <p>
            {preview.history.length} eventos · exportado em{" "}
            {new Date(preview.exportedAt).toLocaleString("pt-BR")}
          </p>
          {preview.characters.map((c) => (
            <div className="row between" key={c.id}>
              <span>
                {c.name} · nível {c.levels.length}
              </span>
              <Pill tone="green">
                {characters?.some((x) => x.id === c.id)
                  ? "Será uma cópia"
                  : "Novo personagem"}
              </Pill>
            </div>
          ))}
          {warnings.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
        </section>
      )}
      {!!recovery?.length && (
        <details className="source-details">
          <summary>Recuperação local ({recovery.length})</summary>
          {recovery.map((r) => (
            <div className="row between" key={r.id}>
              <span>{r.reason}</span>
              <button
                className="button small"
                onClick={() => {
                  setPreview({
                    format: "tormenta-personagens",
                    schema: 1,
                    catalog: "t20-jda-2023-11-17",
                    exportedAt: r.at,
                    characters: r.characters,
                    history: r.history,
                  });
                }}
              >
                Prévia
              </button>
            </div>
          ))}
        </details>
      )}
      <small className="muted">
        A importação preserva os personagens existentes e valida a estrutura
        antes de gravar. Backups incluem os recursos e efeitos em andamento.
      </small>
    </Modal>
  );
}
