import { useMemo, useState, useLayoutEffect, useRef } from "react";
import { EntityIcon } from "./entity-icon";
import {
  BookEntryButton,
  BookSubjectButton,
  EntryReadout,
} from "./entry-readout";
import { LIBRARY_ROW_MAP, searchText } from "./library-data";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Dices,
  Plus,
  Shield,
  Sparkles,
  Swords,
  X,
} from "lucide-react";
import {
  ATTRIBUTES,
  CATALOG,
  CLASSES,
  CLASS_MAP,
  ENTRY_MAP,
  POINT_COST,
  RACES,
  RACE_MAP,
  SCHOOLS,
  SKILLS,
  WEALTH,
  classLevel,
  knownSpellCount,
  racialMagic,
  sign,
  slug,
} from "../data/rules";
import {
  acquisition,
  classTraining,
  emptyCharacter,
  ITEM_TEMPLATES,
  itemFromTemplate,
  originBenefits,
  uid,
} from "../domain/character";
import { calculate } from "../domain/calculate";
import { FAMILIARS, ANIMAL_PARTNERS } from "../domain/partners";
import {
  initialTraining,
  learn,
  powerOptions,
  selected,
  spellOptions,
  validation,
} from "../domain/creation";
import type { CatalogEntry, Character, RollResult } from "../domain/types";
import type { RequestDice } from "./physical-dice";
import {
  AsyncButton,
  Calculation,
  ChoiceCard,
  Empty,
  ErrorList,
  Field,
  Modal,
  NumberField,
  Pill,
  SearchBox,
  Toggle,
} from "./shared";

export function EntryPicker({
  entries,
  character,
  source,
  onChange,
  spells = false,
}: {
  entries: CatalogEntry[];
  character: Character;
  source: string;
  onChange: (c: Character) => void;
  spells?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState("");
  const filtered = entries.filter((e) =>
    searchText(query)
      .split(" ")
      .filter(Boolean)
      .every((term) =>
        (
          LIBRARY_ROW_MAP.get(e.id)?.text ??
          searchText(e.name + " " + e.description)
        ).includes(term),
      ),
  );
  const picked = character.acquisitions.filter(
    (a) => a.source === source && entries.some((e) => e.id === a.entryId),
  );
  const toggle = (e: CatalogEntry) => {
    const current = character.acquisitions.find(
      (a) => a.source === source && a.entryId === e.id,
    );
    if (current)
      onChange({
        ...character,
        acquisitions: character.acquisitions.filter((a) => a.id !== current.id),
      });
    else onChange(learn(character, e.id, source));
  };
  return (
    <div className="entry-picker">
      <div className="row between">
        <SearchBox
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(0);
          }}
          placeholder={spells ? "Pesquisar magias…" : "Pesquisar poderes…"}
        />
        <Pill>{picked.length} escolhido(s)</Pill>
      </div>
      <div className="picker-list">
        {filtered.slice(page * 24, (page + 1) * 24).map((e) => {
          const ac = character.acquisitions.find(
            (a) => a.source === source && a.entryId === e.id,
          );
          return (
            <div className={`picker-entry ${ac ? "chosen" : ""}`} key={e.id}>
              <div className="row between">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={!!ac}
                    onChange={() => toggle(e)}
                  />
                  <span>
                    <EntityIcon name={e.name} size={24} />{" "}
                    <strong>{e.name}</strong>
                    <small>
                      {spells
                        ? `${e.circle}º círculo · ${e.school}`
                        : e.group || source}{" "}
                      · p. {e.page}
                    </small>
                  </span>
                </label>
                <button
                  className="text-button"
                  onClick={() => setOpen(open === e.id ? "" : e.id)}
                >
                  {open === e.id ? "Recolher" : "Detalhes"}
                </button>
              </div>
              {open === e.id && (
                <>
                  <EntryReadout entry={e} />
                  <BookEntryButton entry={e} />
                </>
              )}
              {ac && (
                <AcquisitionChoices
                  character={character}
                  entry={e}
                  acquisitionId={ac.id}
                  onChange={onChange}
                />
              )}
            </div>
          );
        })}
        {!filtered.length && (
          <Empty heading="Nenhum resultado">
            Tente outro nome ou revise a classe e as escolas escolhidas.
          </Empty>
        )}
      </div>
      {filtered.length > 24 && (
        <div className="pagination">
          <button
            className="button small"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <small>
            {page + 1} / {Math.ceil(filtered.length / 24)}
          </small>
          <button
            className="button small"
            disabled={(page + 1) * 24 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
function AcquisitionChoices({
  character,
  entry,
  acquisitionId,
  onChange,
}: {
  character: Character;
  entry: CatalogEntry;
  acquisitionId: string;
  onChange: (c: Character) => void;
}) {
  const ac = character.acquisitions.find((a) => a.id === acquisitionId)!;
  const set = (key: string, value: string) =>
    onChange({
      ...character,
      acquisitions: character.acquisitions.map((a) =>
        a.id === ac.id ? { ...a, choices: { ...a.choices, [key]: value } } : a,
      ),
    });
  return (
    <div className="acquisition-choices">
      {entry.name === "Familiar" && (
        <Field label="Familiar">
          <select
            value={ac.choices.familiar ?? ""}
            onChange={(e) => set("familiar", e.target.value)}
          >
            <option value="">Escolha…</option>
            {FAMILIARS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </Field>
      )}
      {["Especialista em Escola", "Mestre em Escola"].includes(entry.name) && (
        <Field label="Escola de magia">
          <select
            value={ac.choices.school ?? ""}
            onChange={(e) => set("school", e.target.value)}
          >
            <option value="">Escolha…</option>
            {SCHOOLS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </Field>
      )}
      {(entry.kind === "partner" || entry.name === "Companheiro Animal") && (
        <>
          <Field label="Nome do parceiro">
            <input
              value={ac.choices.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          {entry.name === "Companheiro Animal" ? (
            <Field label="Tipo de companheiro">
              <select
                value={ac.choices.partnerType ?? ""}
                onChange={(e) => set("partnerType", e.target.value)}
              >
                <option value="">Escolha…</option>
                {ANIMAL_PARTNERS.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Patamar definido pelo mestre">
              <select
                value={ac.choices.tier ?? "0"}
                onChange={(e) => set("tier", e.target.value)}
              >
                <option value="0">Iniciante</option>
                <option value="1">Veterano</option>
                <option value="2">Mestre</option>
              </select>
            </Field>
          )}
          {(entry.name === "Ajudante" ||
            ac.choices.partnerType === "Ajudante") &&
            [1, 2, 3].map((n) => (
              <Field key={n} label={`Perícia do ajudante ${n}`}>
                <select
                  value={ac.choices[`skill${n}`] ?? ""}
                  onChange={(e) => set(`skill${n}`, e.target.value)}
                >
                  <option value="">Escolha…</option>
                  {SKILLS.filter(
                    (s) => !["luta", "pontaria"].includes(s.id),
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          <Toggle
            label="Parceiro acompanhando o personagem"
            checked={ac.choices.active !== "não"}
            onChange={(active) => set("active", active ? "sim" : "não")}
          />
        </>
      )}
      {entry.name === "Aumento de Atributo" && (
        <Field label="Atributo aumentado">
          <select
            value={ac.choices.attribute ?? ""}
            onChange={(e) => set("attribute", e.target.value)}
          >
            <option value="">Escolha…</option>
            {ATTRIBUTES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {entry.name === "Proficiência" && (
        <Field label="Proficiência">
          <select
            value={ac.choices.proficiency ?? ""}
            onChange={(e) => set("proficiency", e.target.value)}
          >
            <option value="">Escolha…</option>
            {[
              ["marciais", "Armas marciais"],
              ["pesadas", "Armaduras pesadas"],
              ["escudos", "Escudos"],
              ["fogo", "Armas de fogo"],
              ["exoticas", "Arma exótica (especifique abaixo)"],
            ].map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </Field>
      )}
      {["Foco em Arma", "Especialização em Arma", "Mestre em Arma"].includes(
        entry.name,
      ) && (
        <Field label="Arma escolhida">
          <select
            value={ac.choices.weapon ?? ""}
            onChange={(e) => set("weapon", e.target.value)}
          >
            <option value="">Escolha…</option>
            {ITEM_TEMPLATES.filter((i) => i.damage).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {entry.name === "Foco em Magia" && (
        <Field label="Magia escolhida">
          <select
            value={ac.choices.spell ?? ""}
            onChange={(e) => set("spell", e.target.value)}
          >
            <option value="">Escolha…</option>
            {CATALOG.filter((e) => e.kind === "spell").map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {entry.kind === "spell" &&
        ac.source === "arcanista" &&
        character.choices.path === "Mago" && (
          <Toggle
            label="Memorizada para o dia"
            checked={!!ac.prepared}
            onChange={(prepared) =>
              onChange({
                ...character,
                acquisitions: character.acquisitions.map((a) =>
                  a.id === ac.id ? { ...a, prepared } : a,
                ),
              })
            }
          />
        )}
      <Field label="Escolha interna / observação">
        <input
          value={ac.choices.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Alvo, especialidade, linhagem, parceiro…"
        />
      </Field>
    </div>
  );
}
export function SkillChoices({
  c,
  onChange,
}: {
  c: Character;
  onChange: (c: Character) => void;
}) {
  const training = classTraining(c);
  const d = calculate({ ...c, hp: 1 });
  const origin = originBenefits(c.originId);
  const already = (key: string) => [
    ...training.mandatory,
    ...["classSkills", "intSkills", "raceSkills", "originSkills"]
      .filter((k) => k !== key)
      .flatMap((k) => selected(c, k)),
  ];
  const groups = [
    {
      key: "classSkills",
      name: "Treinamentos da classe",
      count: training.choices,
      options: training.options,
    },
    {
      key: "intSkills",
      name: "Inteligência",
      count: Math.max(0, d.attributes.int.total),
      options: SKILLS.map((s) => s.id),
    },
    ...(["humano", "kliren", "osteon"].includes(c.raceId)
      ? [
          {
            key: "raceSkills",
            name: "Benefícios raciais",
            count: c.raceId === "humano" ? 2 : 1,
            options: SKILLS.map((s) => s.id),
          },
        ]
      : []),
    ...(c.originId
      ? [
          {
            key: "originSkills",
            name: "Benefícios da origem",
            count: 2,
            options: origin.skills,
          },
        ]
      : []),
  ];
  return (
    <>
      <div className="notice">
        <strong>Treinamentos obrigatórios</strong>
        <p>
          {training.mandatory
            .map((id) => SKILLS.find((s) => s.id === id)?.name ?? id)
            .join(" · ")}
        </p>
        <small>
          Raça e origem podem conceder poderes no lugar de alguns treinamentos.
          As escolhas são conferidas na revisão.
        </small>
      </div>
      <Field
        label="Especialidades de Ofício"
        hint="Separe por vírgula. O primeiro Ofício será usado nos treinamentos iniciais."
      >
        <input
          value={c.crafts.join(", ")}
          onChange={(e) =>
            onChange({
              ...c,
              crafts: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="Artesão, alquimista, engenhoqueiro…"
        />
      </Field>
      {groups.map((group) => (
        <section key={group.key} className="wizard-section">
          <div className="row between">
            <h3>{group.name}</h3>
            <Pill>
              {selected(c, group.key).length} / {group.count}
            </Pill>
          </div>
          <div className="skill-choices">
            {SKILLS.filter((s) => group.options.includes(s.id)).map((s) => {
              const check = selected(c, group.key).includes(s.id);
              return (
                <Toggle
                  key={s.id}
                  label={s.name}
                  checked={check}
                  disabled={!check && already(group.key).includes(s.id)}
                  onChange={(v) => {
                    const choices = v
                      ? [...selected(c, group.key), s.id]
                      : selected(c, group.key).filter((x) => x !== s.id);
                    onChange({
                      ...c,
                      choices: { ...c.choices, [group.key]: choices },
                      crafts:
                        s.id === "oficio" && !c.crafts.length
                          ? ["Artesão"]
                          : c.crafts,
                    });
                  }}
                />
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
export function SpellChoices({
  c,
  onChange,
}: {
  c: Character;
  onChange: (c: Character) => void;
}) {
  const classes = CLASSES.filter((cls) => knownSpellCount(c, cls.id) > 0);
  const [active, setActive] = useState(classes[0]?.id ?? "");
  const source = classes.some((c) => c.id === active) ? active : classes[0]?.id;
  if (!source)
    return (
      <Empty icon={<Sparkles />} heading="As magias da sua jornada">
        Esta classe não concede magias no nível atual. Magias raciais e outras
        formas de aprendizagem podem ser registradas na biblioteca com sua
        origem.
      </Empty>
    );
  return (
    <>
      <div className="tabs">
        {classes.map((cls) => (
          <button
            className={source === cls.id ? "active" : ""}
            key={cls.id}
            onClick={() => setActive(cls.id)}
          >
            {cls.name}
          </button>
        ))}
      </div>
      <div className="notice">
        <strong>{knownSpellCount(c, source)} magias conhecidas</strong>
        <p>
          {source === "arcanista" && c.choices.path === "Mago"
            ? "Memorize metade das magias conhecidas, arredondada para baixo."
            : "A lista considera tipo, círculo e escolas da classe de origem."}
        </p>
      </div>
      <EntryPicker
        character={c}
        source={source}
        entries={spellOptions(c, source)}
        onChange={onChange}
        spells
      />
    </>
  );
}
const STEPS = [
  "Identidade",
  "Atributos",
  "Raça",
  "Classe",
  "Origem",
  "Devoção",
  "Perícias",
  "Poderes",
  "Equipamento",
  "Magias",
  "Revisão",
];
export function CharacterWizard({
  onClose,
  onSave,
  requestDice,
}: {
  onClose: () => void;
  onSave: (c: Character) => Promise<void>;
  requestDice: RequestDice;
}) {
  const [c, setC] = useState<Character>(() => ({
    ...emptyCharacter(),
    hp: 1,
    choices: { ...emptyCharacter().choices, attributeMethod: "points" },
  }));
  const [step, setStep] = useState(0);
  const wizard = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = wizard.current;
    root?.closest(".modal-body")?.scrollTo({ top: 0, behavior: "instant" });
    const current = root?.querySelector<HTMLElement>(
      ".wizard-nav button.active",
    );
    if (current && current.parentElement) {
      current.parentElement.scrollLeft =
        current.offsetLeft - current.parentElement.offsetLeft - 12;
    }
  }, [step]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [powerSource, setPowerSource] = useState("Raça");
  const [weapon, setWeapon] = useState("adaga");
  const [martial, setMartial] = useState("espada-longa");
  const [armor, setArmor] = useState("armadura-de-couro");
  const [adjust, setAdjust] = useState(false);
  const [master, setMaster] = useState("");
  const update = (partial: Partial<Character>) =>
    setC((prev) => ({ ...prev, ...partial }));
  const choice = (key: string, value: string | string[]) =>
    setC((prev) => ({ ...prev, choices: { ...prev.choices, [key]: value } }));
  const prepared = useMemo(() => initialTraining(c), [c]);
  const d = calculate(prepared);
  const race = RACE_MAP.get(c.raceId)!;
  const cls = CLASS_MAP.get(c.levels[0].classId)!;
  const v = validation(prepared, true);
  const powerSources = [
    ...(["humano", "golem", "osteon", "lefou"].includes(c.raceId)
      ? ["Raça"]
      : []),
    ...(c.originId ? ["Origem"] : []),
    ...(c.deityId ? ["Devoção"] : []),
  ];
  const source = powerSources.includes(powerSource)
    ? powerSource
    : powerSources[0];
  const setClass = (id: string) => {
    setC((prev) => ({
      ...prev,
      levels: [{ classId: id, powers: [], notes: "" }],
      choices: {
        ...prev.choices,
        classSkills: [],
        primarySkill: CLASS_MAP.get(id)?.mandatory[0] ?? "",
      },
    }));
  };
  const rollAttributes = async () => {
    const results: RollResult[] = [];
    for (const attribute of ATTRIBUTES) {
      const result = await requestDice("4d6kh3", `Atributo: ${attribute.name}`);
      if (!result) return;
      results.push(result);
    }
    const attr = (n: number) => (n <= 7 ? -2 : Math.floor((n - 10) / 2));
    while (results.reduce((n, r) => n + attr(r.total), 0) < 6) {
      const lowest = results.reduce(
        (best, r, i) => (r.total < results[best].total ? i : best),
        0,
      );
      const retry = await requestDice(
        "4d6kh3",
        "Soma dos atributos menor que 6: repita o menor resultado",
      );
      if (!retry) return;
      results[lowest] = retry;
    }
    update({
      attributes: Object.fromEntries(
        ATTRIBUTES.map((a, i) => [a.id, attr(results[i].total)]),
      ) as Character["attributes"],
      choices: {
        ...c.choices,
        attributeMethod: "roll",
        attributeRolls: results.map(
          (r) =>
            `${r.dice[0].values.join(", ")} → ${r.total} → ${sign(attr(r.total))}`,
        ),
      },
    });
  };
  const addKit = async () => {
    const coin = await requestDice("4d6", "Tibares iniciais");
    if (!coin) return;
    const ids = [
      "mochila",
      "saco-de-dormir",
      "traje-de-viajante",
      weapon,
      ...(cls.proficiencyIds.includes("marciais") ? [martial] : []),
      ...(cls.id !== "arcanista" ? [armor] : []),
      ...(cls.proficiencyIds.includes("escudos") ? ["escudo-leve"] : []),
    ];
    const kit = ids
      .filter((id) => ITEM_TEMPLATES.some((t) => t.id === id))
      .map(itemFromTemplate);
    update({
      inventory: kit,
      coins: { tc: 0, ts: coin.total, to: 0 },
      choices: {
        ...c.choices,
        initialWealthRoll: `${coin.expression}: ${coin.dice[0].values.join(", ")} = ${coin.total}`,
      },
    });
  };
  const save = async () => {
    try {
      if (!c.name.trim()) throw new Error("Informe o nome do personagem.");
      if (v.errors.length && !(adjust && master.trim()))
        throw new Error(
          "Resolva a revisão ou registre uma exceção autorizada.",
        );
      const final = structuredClone(prepared);
      const stats = calculate(final);
      final.hp = stats.hp.total;
      final.mp = stats.mp.total;
      if (adjust) {
        final.choices.masterAdjustment = master;
        final.choices.reviewedExceptions = v.errors;
      }
      await onSave(final);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title="Uma nova história"
      subtitle="Criação de personagem"
      className="character-wizard"
      onClose={onClose}
      wide
      footer={
        <>
          <button
            className="button"
            onClick={() => (step ? setStep(step - 1) : onClose())}
          >
            <ArrowLeft size={16} />
            {step ? "Voltar" : "Cancelar"}
          </button>
          <span className="muted wizard-step-counter">
            {step + 1} de {STEPS.length}
          </span>
          {step < STEPS.length - 1 ? (
            <button
              className="button primary"
              onClick={() => {
                setStep(step + 1);
                setQuery("");
                setError("");
              }}
            >
              Continuar
              <ArrowRight size={16} />
            </button>
          ) : (
            <AsyncButton action={save}>
              <Check size={16} />
              Criar personagem
            </AsyncButton>
          )}
        </>
      }
    >
      <div className="wizard-layout" ref={wizard}>
        <aside className="wizard-nav">
          {STEPS.map((name, i) => (
            <button
              key={name}
              className={step === i ? "active" : step > i ? "done" : ""}
              aria-current={step === i ? "step" : undefined}
              onClick={() => {
                setStep(i);
                setQuery("");
              }}
            >
              <span>
                {step > i ? (
                  <Check size={13} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              {name}
            </button>
          ))}
          <div className="wizard-preview">
            <strong>{c.name || "Seu personagem"}</strong>
            <small>
              {race.name} · {cls.name} 1
            </small>
            <div>
              <b>{d.hp.total}</b> PV <b>{d.mp.total}</b> PM
            </div>
          </div>
        </aside>
        <div className="wizard-content">
          <div className="section-intro">
            <span className="eyebrow">
              Passo {String(step + 1).padStart(2, "0")}
            </span>
            <h2>{STEPS[step]}</h2>
          </div>
          {error && <ErrorList errors={[error]} />}
          {step === 0 && (
            <>
              <p className="lead">
                Dê um nome a quem vai atravessar Arton com você.
              </p>
              <Field label="Nome do personagem">
                <input
                  autoFocus
                  value={c.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="Como começa a sua lenda?"
                  maxLength={200}
                />
              </Field>
              <div className="form-grid">
                <Field label="Jogador">
                  <input
                    value={c.player}
                    onChange={(e) => update({ player: e.target.value })}
                    placeholder="Seu nome"
                  />
                </Field>
                <NumberField
                  label="Idade"
                  value={c.age}
                  onChange={(age) => update({ age })}
                  min={0}
                />
              </div>
              <Field label="Conceito do personagem">
                <textarea
                  value={c.concept}
                  onChange={(e) => update({ concept: e.target.value })}
                  placeholder="Um cavaleiro em busca de redenção, uma inventora curiosa…"
                  rows={3}
                />
              </Field>
              <Field label="Aparência">
                <textarea
                  value={c.appearance}
                  onChange={(e) => update({ appearance: e.target.value })}
                  rows={2}
                />
              </Field>
              <Field label="Personalidade e crenças">
                <textarea
                  value={c.personality}
                  onChange={(e) => update({ personality: e.target.value })}
                  rows={2}
                />
              </Field>
            </>
          )}
          {step === 1 && (
            <>
              <div className="segmented">
                {[
                  ["points", "Compra por pontos"],
                  ["roll", "Dados físicos"],
                  ["manual", "Valores ajustados"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={c.choices.attributeMethod === id ? "active" : ""}
                    onClick={() => choice("attributeMethod", id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {c.choices.attributeMethod === "points" ? (
                <div className="notice">
                  <strong>
                    {10 -
                      Object.values(c.attributes).reduce(
                        (s, n) => s + (POINT_COST[n] ?? 100),
                        0,
                      )}{" "}
                    pontos disponíveis
                  </strong>
                  <p>
                    10 pontos · custos: −1 = −1; 0 = 0; 1 = 1; 2 = 2; 3 = 4; 4 =
                    7. Os ajustes raciais entram depois.
                  </p>
                </div>
              ) : c.choices.attributeMethod === "roll" ? (
                <>
                  <AsyncButton className="button" action={rollAttributes}>
                    <Dices size={17} />
                    Informar 4d6 da mesa para cada atributo
                  </AsyncButton>
                  <p className="muted">
                    Se a soma dos atributos for menor que 6, o menor resultado é
                    rolado novamente (p. 17).
                  </p>
                </>
              ) : (
                <Field label="Mestre e motivo do ajuste">
                  <textarea
                    value={String(c.choices.attributeReason ?? "")}
                    onChange={(e) => choice("attributeReason", e.target.value)}
                  />
                </Field>
              )}
              <div className="attribute-editor">
                {ATTRIBUTES.map((a) => (
                  <div key={a.id}>
                    <span>{a.name}</span>
                    <div className="stepper">
                      <button
                        aria-label={`Diminuir ${a.name}`}
                        disabled={
                          c.attributes[a.id] <=
                          (c.choices.attributeMethod === "points" ? -1 : -10)
                        }
                        onClick={() =>
                          update({
                            attributes: {
                              ...c.attributes,
                              [a.id]: c.attributes[a.id] - 1,
                            },
                          })
                        }
                      >
                        −
                      </button>
                      <strong>{sign(c.attributes[a.id])}</strong>
                      <button
                        aria-label={`Aumentar ${a.name}`}
                        disabled={
                          c.attributes[a.id] >=
                          (c.choices.attributeMethod === "points" ? 4 : 20)
                        }
                        onClick={() =>
                          update({
                            attributes: {
                              ...c.attributes,
                              [a.id]: c.attributes[a.id] + 1,
                            },
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                    <small>{a.description}</small>
                  </div>
                ))}
              </div>
              {selected(c, "attributeRolls").length > 0 && (
                <details>
                  <summary>Dados da geração</summary>
                  {selected(c, "attributeRolls").map((r, i) => (
                    <p key={i}>
                      {ATTRIBUTES[i].name}: {r}
                    </p>
                  ))}
                </details>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="Pesquisar raça…"
              />
              <div className="choice-grid">
                {RACES.filter((r) => slug(r.name).includes(slug(query))).map(
                  (r) => (
                    <ChoiceCard
                      key={r.id}
                      selected={c.raceId === r.id}
                      title={r.name}
                      description={`${r.size} · ${r.speed}m · p. ${r.page}`}
                      onClick={() =>
                        update({
                          raceId: r.id,
                          racialChoices: ATTRIBUTES.filter(
                            (a) => a.id !== r.exclude,
                          )
                            .slice(0, r.choose)
                            .map((a) => a.id),
                          originId: r.id === "golem" ? "" : c.originId,
                        })
                      }
                    >
                      <div className="race-stats">
                        {Object.entries(r.attributes).map(([k, n]) => (
                          <span key={k}>
                            {k.toUpperCase()} {sign(n)}
                          </span>
                        ))}
                        {r.choose > 0 && (
                          <span>+1 em {r.choose} atributos</span>
                        )}
                      </div>
                    </ChoiceCard>
                  ),
                )}
              </div>
              {race.choose > 0 && (
                <section className="wizard-section">
                  <h3>Atributos de {race.name}</h3>
                  <div className="skill-choices">
                    {ATTRIBUTES.filter((a) => a.id !== race.exclude).map(
                      (a) => (
                        <Toggle
                          key={a.id}
                          label={a.name}
                          checked={c.racialChoices.includes(a.id)}
                          onChange={(checked) =>
                            update({
                              racialChoices: checked
                                ? [...c.racialChoices, a.id]
                                : c.racialChoices.filter((x) => x !== a.id),
                            })
                          }
                        />
                      ),
                    )}
                  </div>
                </section>
              )}
              {["qareen", "golem"].includes(c.raceId) && (
                <Field label="Elemento">
                  <select
                    value={String(c.choices.element ?? "fogo")}
                    onChange={(e) => choice("element", e.target.value)}
                  >
                    {[
                      "ácido",
                      "eletricidade",
                      "fogo",
                      "frio",
                      "luz",
                      "trevas",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              )}
              {c.raceId === "suraggel" && (
                <Field label="Herança divina">
                  <select
                    value={String(c.choices.suraggel)}
                    onChange={(e) => choice("suraggel", e.target.value)}
                  >
                    <option>Aggelus</option>
                    <option>Sulfure</option>
                  </select>
                </Field>
              )}
              <div className="notice">
                <strong>Habilidades raciais</strong>
                <p>{race.abilities.join(" · ")}</p>
                <BookSubjectButton subject={`race:${race.id}`} />
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div className="choice-grid">
                {CLASSES.map((x) => (
                  <ChoiceCard
                    key={x.id}
                    selected={cls.id === x.id}
                    title={x.name}
                    description={`${x.initialHp} PV + Constituição · ${x.mpPerLevel} PM/nível`}
                    onClick={() => setClass(x.id)}
                  />
                ))}
              </div>
              {cls.either && (
                <Field label="Perícia obrigatória à escolha">
                  <select
                    value={String(c.choices.primarySkill ?? cls.mandatory[0])}
                    onChange={(e) => choice("primarySkill", e.target.value)}
                  >
                    {cls.mandatory.slice(0, 2).map((id) => (
                      <option key={id} value={id}>
                        {SKILLS.find((s) => s.id === id)?.name ?? id}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {cls.id === "arcanista" && (
                <>
                  <Field label="Caminho do arcanista">
                    <select
                      value={String(c.choices.path)}
                      onChange={(e) => choice("path", e.target.value)}
                    >
                      <option>Bruxo</option>
                      <option>Feiticeiro</option>
                      <option>Mago</option>
                    </select>
                  </Field>
                  {c.choices.path === "Feiticeiro" ? (
                    <Field label="Linhagem">
                      <select
                        value={String(c.choices.lineage ?? "")}
                        onChange={(e) => choice("lineage", e.target.value)}
                      >
                        <option value="">Escolha…</option>
                        <option>Dracônica</option>
                        <option>Feérica</option>
                        <option>Rubra</option>
                      </select>
                    </Field>
                  ) : (
                    c.choices.path === "Bruxo" && (
                      <Field label="Foco arcano">
                        <input
                          value={String(c.choices.focus ?? "")}
                          onChange={(e) => choice("focus", e.target.value)}
                          placeholder="Descreva seu foco"
                        />
                      </Field>
                    )
                  )}
                </>
              )}
              {["bardo", "druida"].includes(cls.id) && (
                <>
                  <h3>Três escolas de magia</h3>
                  <div className="skill-choices">
                    {SCHOOLS.map((s) => (
                      <Toggle
                        key={s}
                        label={s}
                        checked={selected(c, "schools").includes(s)}
                        onChange={(v) =>
                          choice(
                            "schools",
                            v
                              ? [...selected(c, "schools"), s]
                              : selected(c, "schools").filter((x) => x !== s),
                          )
                        }
                      />
                    ))}
                  </div>
                </>
              )}
              <details className="source-details">
                <summary>
                  Progressão completa de {cls.name} · p. {cls.page}
                </summary>
                <BookSubjectButton subject={`class:${cls.id}`} />
                <table>
                  <thead>
                    <tr>
                      <th>Nível</th>
                      <th>Habilidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cls.progression).map(([n, text]) => (
                      <tr key={n}>
                        <td>{n}</td>
                        <td>{text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
          {step === 4 &&
            (c.raceId === "golem" ? (
              <Empty icon={<Shield />} heading="Propósito de criação">
                Golens não recebem uma origem. Escolha um poder geral entre os
                benefícios raciais na etapa Poderes.
              </Empty>
            ) : (
              <>
                <Field label="Origem">
                  <select
                    value={c.originId}
                    onChange={(e) =>
                      update({
                        originId: e.target.value,
                        choices: { ...c.choices, originSkills: [] },
                        acquisitions: c.acquisitions.filter(
                          (a) => a.source !== "Origem",
                        ),
                      })
                    }
                  >
                    <option value="">Sem origem / origem personalizada</option>
                    {CATALOG.filter((e) => e.kind === "origin").map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {c.originId && (
                  <>
                    <p className="source-text">
                      {ENTRY_MAP.get(c.originId)?.description}
                    </p>
                    {ENTRY_MAP.get(c.originId) && (
                      <BookEntryButton entry={ENTRY_MAP.get(c.originId)!} />
                    )}
                  </>
                )}
                <Field label="Sua história">
                  <textarea
                    value={c.biography}
                    onChange={(e) => update({ biography: e.target.value })}
                    rows={5}
                    placeholder="De onde você veio? O que deixou para trás?"
                  />
                </Field>
              </>
            ))}
          {step === 5 && (
            <>
              <Field label="Divindade">
                <select
                  value={c.deityId}
                  onChange={(e) =>
                    update({
                      deityId: e.target.value,
                      acquisitions: c.acquisitions.filter(
                        (a) => a.source !== "Devoção",
                      ),
                    })
                  }
                >
                  <option value="">Sem devoção / Panteão / bem</option>
                  {CATALOG.filter((e) => e.kind === "deity").map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              {c.deityId ? (
                <>
                  <p className="source-text">
                    {ENTRY_MAP.get(c.deityId)?.description}
                  </p>
                  {ENTRY_MAP.get(c.deityId) && (
                    <BookEntryButton entry={ENTRY_MAP.get(c.deityId)!} />
                  )}
                </>
              ) : (
                <div className="notice">
                  <p>
                    A devoção é opcional para a maioria das classes. Druidas
                    devem escolher uma das divindades permitidas. Obrigações e
                    restrições acompanham os poderes concedidos.
                  </p>
                </div>
              )}
            </>
          )}
          {step === 6 && <SkillChoices c={c} onChange={setC} />}
          {step === 7 && (
            <>
              {powerSources.length ? (
                <>
                  <div className="tabs">
                    {powerSources.map((s) => (
                      <button
                        className={source === s ? "active" : ""}
                        onClick={() => setPowerSource(s)}
                        key={s}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <EntryPicker
                    character={prepared}
                    source={source}
                    entries={powerOptions(c, source)}
                    onChange={setC}
                  />
                </>
              ) : (
                <Empty
                  icon={<Swords />}
                  heading="Habilidades de classe prontas"
                >
                  As habilidades recebidas no 1º nível entram automaticamente na
                  ficha. Novos poderes serão escolhidos durante a evolução.
                </Empty>
              )}
            </>
          )}
          {step === 8 && (
            <>
              <p className="lead">
                Prepare a mochila para a primeira aventura.
              </p>
              <div className="form-grid">
                <Field label="Arma simples">
                  <select
                    value={weapon}
                    onChange={(e) => setWeapon(e.target.value)}
                  >
                    {ITEM_TEMPLATES.filter(
                      (i) => i.damage && i.proficiency === "simples",
                    ).map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} · {i.damage}
                      </option>
                    ))}
                  </select>
                </Field>
                {cls.proficiencyIds.includes("marciais") && (
                  <Field label="Arma marcial">
                    <select
                      value={martial}
                      onChange={(e) => setMartial(e.target.value)}
                    >
                      {ITEM_TEMPLATES.filter(
                        (i) => i.damage && i.proficiency === "marciais",
                      ).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} · {i.damage}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {cls.id !== "arcanista" && (
                  <Field label="Armadura inicial">
                    <select
                      value={armor}
                      onChange={(e) => setArmor(e.target.value)}
                    >
                      {ITEM_TEMPLATES.filter((i) =>
                        [
                          "armadura-de-couro",
                          "couro-batido",
                          "gibao-de-peles",
                          ...(cls.proficiencyIds.includes("pesadas")
                            ? ["brunea"]
                            : []),
                        ].includes(i.id),
                      ).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              <AsyncButton className="button" action={addKit}>
                <Plus size={16} />
                {c.inventory.length ? "Refazer" : "Adicionar"} equipamento
                inicial e informar T$ 4d6 da mesa
              </AsyncButton>
              {c.choices.initialWealthRoll && (
                <p className="muted">
                  Dinheiro inicial: {String(c.choices.initialWealthRoll)}
                </p>
              )}
              <div className="simple-list">
                {c.inventory.map((i) => (
                  <div key={i.id}>
                    <span>{i.name}</span>
                    <small>{i.spaces} espaço(s)</small>
                  </div>
                ))}
              </div>
              {c.originId && (
                <div className="notice">
                  <strong>Itens da origem</strong>
                  <p>{originBenefits(c.originId).items}</p>
                  <small>
                    Adicione ou personalize os itens da origem no inventário
                    após criar a ficha.
                  </small>
                </div>
              )}
            </>
          )}
          {step === 9 && (
            <>
              <SpellChoices c={prepared} onChange={setC} />
              {!!racialMagic(c).fixed.length && (
                <p className="notice">
                  Magias raciais recebidas automaticamente:{" "}
                  {racialMagic(c).fixed.join(", ")}.
                </p>
              )}
              {!!racialMagic(c).count && (
                <section>
                  <h3>Magias da raça · escolha {racialMagic(c).count}</h3>
                  <EntryPicker
                    character={prepared}
                    source="Raça"
                    entries={spellOptions(c, "Raça")}
                    onChange={setC}
                    spells
                  />
                </section>
              )}
            </>
          )}
          {step === 10 && (
            <>
              <div className="review-hero">
                <div className="character-monogram">
                  {c.name.slice(0, 1) || "?"}
                </div>
                <div>
                  <h2>{c.name || "Sem nome"}</h2>
                  <p>
                    {race.name} · {cls.name} 1
                  </p>
                  <small>
                    {ENTRY_MAP.get(c.originId)?.name ?? "Sem origem"}
                    {c.deityId ? ` · ${ENTRY_MAP.get(c.deityId)?.name}` : ""}
                  </small>
                </div>
              </div>
              <div className="stats-grid">
                <Calculation label="Pontos de vida" value={d.hp} />
                <Calculation label="Pontos de mana" value={d.mp} />
                <Calculation label="Defesa" value={d.defense} />
              </div>
              <div className="attribute-grid">
                {ATTRIBUTES.map((a) => (
                  <Calculation
                    key={a.id}
                    label={a.name}
                    value={d.attributes[a.id]}
                    signed
                    compact
                  />
                ))}
              </div>
              <ErrorList errors={v.errors} />
              {v.warnings.map((w) => (
                <p className="notice" key={w}>
                  {w}
                </p>
              ))}
              {!v.errors.length && (
                <div className="notice success">
                  <Check size={18} /> Escolhas conferidas. Seu personagem está
                  pronto.
                </div>
              )}
              {v.errors.length > 0 && (
                <>
                  <Toggle
                    label="Registrar exceções autorizadas pelo mestre"
                    checked={adjust}
                    onChange={setAdjust}
                  />
                  {adjust && (
                    <Field label="Mestre e motivo das exceções">
                      <textarea
                        value={master}
                        onChange={(e) => setMaster(e.target.value)}
                        placeholder="As pendências acima serão preservadas no registro do personagem."
                      />
                    </Field>
                  )}
                </>
              )}
              <p className="muted">
                Para começar em nível superior, use Evoluir após criar a ficha.
                Cada nível terá sua própria revisão.
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
