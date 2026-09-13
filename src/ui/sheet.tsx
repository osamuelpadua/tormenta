import { useState } from "react";
import { EntityIcon } from "./entity-icon";
import {
  BookOpen,
  Check,
  Dices,
  Feather,
  Pencil,
  Plus,
  Search,
  Shield,
  Star,
  Swords,
  Sparkles,
} from "lucide-react";
import {
  ATTRIBUTES,
  CATALOG,
  CLASS_MAP,
  CONDITIONS,
  ENTRY_MAP,
  RACE_MAP,
  SKILLS,
  classLevel,
  sign,
  slug,
} from "../data/rules";
import { calculate } from "../domain/calculate";
import { characterEntries } from "../domain/character";
import { usageFor } from "../domain/effects";
import type { CatalogEntry } from "../domain/types";
import { AttackList, EffectsList, Resources } from "./play";
import { partners, partnerLimit, familiar } from "../domain/partners";
import { coverageFor } from "../domain/coverage";
import {
  AsyncButton,
  Calculation,
  Empty,
  ErrorList,
  Field,
  Modal,
  NumberField,
  Pill,
  SearchBox,
  SourceButton,
  Toggle,
  useApp,
} from "./shared";

export function Sheet({
  onResource,
  onAttack,
  onCondition,
  onEdit,
  onSkill,
}: {
  onResource: (type: "damage" | "hp" | "mp" | "rest") => void;
  onAttack: (id: string) => void;
  onCondition: () => void;
  onEdit: () => void;
  onSkill: (id: string) => void;
}) {
  const { character: c, openEntry } = useApp();
  const d = calculate(c);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const skillDefs = [
    ...SKILLS.filter((s) => s.id !== "oficio"),
    ...c.crafts.map((name) => ({
      id: `oficio-${slug(name)}`,
      name: `Ofício (${name})`,
      attribute: "int",
      trained: true,
      armor: false,
    })),
  ];
  const skills = skillDefs.filter(
    (s) =>
      slug(s.name).includes(slug(query)) &&
      (filter === "all" ||
        (filter === "trained" && c.trained.some((t) => t.id === s.id)) ||
        (filter === "favorites" && c.favorites.includes(s.id))),
  );
  return (
    <>
      <Resources onResource={onResource} />
      <div className="attribute-grid">
        {ATTRIBUTES.map((a) => {
          return (
            <Calculation
              key={a.id}
              label={a.name}
              value={d.attributes[a.id]}
              signed
              compact
              icon={<EntityIcon name={a.name} size={24} />}
            />
          );
        })}
      </div>
      <nav className="sheet-shortcuts" aria-label="Atalhos da ficha">
        {[
          ["sheet-skills", "Perícias"],
          ["sheet-attacks", "Ataques"],
          ["sheet-details", "Detalhes"],
          ["sheet-notes", "Anotações"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              const section = document.getElementById(id);
              section?.scrollIntoView({ block: "start", behavior: "instant" });
              section?.focus({ preventScroll: true });
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="sheet-layout">
        <div className="stack">
          <section
            className="panel skills-panel"
            id="sheet-skills"
            tabIndex={-1}
            aria-label="Perícias da ficha"
          >
            <div className="panel-heading">
              <h3>
                <Dices size={18} />
                Perícias
              </h3>
              <span className="muted">½ nível {Math.floor(d.level / 2)}</span>
            </div>
            <div className="skills-toolbar">
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="Pesquisar perícia…"
              />
              <select
                aria-label="Filtrar perícias"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">Todas</option>
                <option value="trained">Treinadas</option>
                <option value="favorites">Favoritas</option>
              </select>
            </div>
            <div className="skill-table">
              <div className="skill-table-head">
                <span>Perícia</span>
                <span>Atributo</span>
                <span>Total</span>
              </div>
              {skills.map((s) => (
                <button
                  className="skill-row"
                  key={s.id}
                  onClick={() => onSkill(s.id)}
                >
                  <span>
                    <i
                      className={`training-dot ${c.trained.some((t) => t.id === s.id) ? "trained" : ""}`}
                    />
                    {s.name}
                    {s.trained && <small title="Requer treinamento">T</small>}
                    {s.armor && <Shield size={11} className="muted" />}
                  </span>
                  <span>{s.attribute.toUpperCase()}</span>
                  <strong>
                    {sign(d.skills[s.id]?.total ?? 0)}
                    <Dices size={15} />
                  </strong>
                </button>
              ))}
            </div>
            <div className="table-legend">
              <span>
                <i className="training-dot trained" />
                Treinada
              </span>
              <span>T · Só treinada</span>
              <span>
                <Shield size={11} />
                Penalidade de armadura
              </span>
            </div>
          </section>
          <section
            className="panel"
            id="sheet-attacks"
            tabIndex={-1}
            aria-label="Ataques da ficha"
          >
            <div className="panel-heading">
              <h3>
                <Swords size={17} />
                Ataques
              </h3>
              <button className="text-button" onClick={onEdit}>
                Configurar
              </button>
            </div>
            <AttackList onAttack={onAttack} />
          </section>
        </div>
        <div className="stack">
          <section className="panel" id="sheet-resistances">
            <div className="panel-heading">
              <h3>Resistências</h3>
              <Shield size={17} />
            </div>
            {["fortitude", "reflexos", "vontade"].map((id) => (
              <div className="resistance-row" key={id}>
                <Calculation
                  label={SKILLS.find((s) => s.id === id)!.name}
                  value={d.skills[id]}
                  signed
                />
                <button
                  className="icon-button"
                  title={`Consultar ${id}`}
                  onClick={() => onSkill(id)}
                >
                  <Dices size={16} />
                </button>
              </div>
            ))}
          </section>
          <section
            className="panel"
            id="sheet-details"
            tabIndex={-1}
            aria-label="Detalhes da ficha"
          >
            <div className="panel-heading">
              <h3>Características</h3>
              <button
                className="icon-button"
                onClick={onEdit}
                aria-label="Editar características"
              >
                <Pencil size={15} />
              </button>
            </div>
            <Calculation
              label="Iniciativa"
              value={d.skills.iniciativa}
              signed
            />
            <Calculation label="Deslocamento" value={d.speed} unit="m" />
            <Calculation label="Carga" value={d.load} unit=" espaços" />
            <Calculation
              label="Capacidade"
              value={d.capacity}
              unit=" espaços"
            />
            <dl className="character-details">
              <div>
                <dt>Tamanho</dt>
                <dd>{d.size}</dd>
              </div>
              <div>
                <dt>Sentidos</dt>
                <dd>{d.senses.join(", ") || "Padrão da criatura"}</dd>
              </div>
              <div>
                <dt>Proficiências</dt>
                <dd>
                  {d.proficiencies
                    .map(
                      (p) =>
                        ({
                          simples: "Armas simples",
                          marciais: "Armas marciais",
                          leves: "Armaduras leves",
                          pesadas: "Armaduras pesadas",
                          escudos: "Escudos",
                          fogo: "Armas de fogo",
                        })[p] ?? p,
                    )
                    .join(", ")}
                </dd>
              </div>
              <div>
                <dt>Origem</dt>
                <dd>{ENTRY_MAP.get(c.originId)?.name ?? "Não definida"}</dd>
              </div>
              <div>
                <dt>Devoção</dt>
                <dd>{ENTRY_MAP.get(c.deityId)?.name ?? "Sem devoção"}</dd>
              </div>
              <div>
                <dt>Jogador</dt>
                <dd>{c.player || "Não informado"}</dd>
              </div>
              <div>
                <dt>Idade</dt>
                <dd>{c.age} anos</dd>
              </div>
            </dl>
          </section>
          <EffectsList onCondition={onCondition} />
          {(partners(c).length > 0 || familiar(c)) && (
            <section className="panel">
              <div className="panel-heading">
                <h3>Companhia de aventura</h3>
                <Pill>
                  {partners(c).filter((p) => p.active).length}/{partnerLimit(c)}
                </Pill>
              </div>
              {familiar(c) && <p>Familiar: {familiar(c)}</p>}
              {partners(c).map((p) => (
                <p key={p.id}>
                  <strong>{p.name}</strong> · {p.type} ·{" "}
                  {["Iniciante", "Veterano", "Mestre"][p.tier]}
                  {!p.active ? " · afastado" : ""}
                </p>
              ))}
            </section>
          )}
          <section
            className="panel"
            id="sheet-notes"
            tabIndex={-1}
            aria-label="Anotações da ficha"
          >
            <div className="panel-heading">
              <h3>
                <Feather size={17} />
                Sua história
              </h3>
              <button className="text-button" onClick={onEdit}>
                Editar
              </button>
            </div>
            <div className="bio-preview">
              {c.concept && <p>{c.concept}</p>}
              {[
                ["Aparência", c.appearance],
                ["Personalidade", c.personality],
                ["História", c.biography],
                ["Anotações", c.notes],
              ]
                .filter(([, text]) => text)
                .map(([label, text]) => (
                  <details key={label}>
                    <summary>{label}</summary>
                    <p>{text}</p>
                  </details>
                ))}
              {!c.concept && !c.biography && !c.notes && (
                <p className="muted">
                  Sua história está começando. Guarde aqui pistas, memórias e
                  objetivos.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
export function SkillModal({
  skillId,
  onClose,
}: {
  skillId: string;
  onClose: () => void;
}) {
  const { character: c, commit, openBook } = useApp();
  const [bonus, setBonus] = useState(0);
  const [dc, setDC] = useState("");
  const [die, setDie] = useState("");
  const [underwater, setUnderwater] = useState(false);
  const [attracted, setAttracted] = useState(false);
  const [use, setUse] = useState("");
  const [error, setError] = useState("");
  const d = calculate(c, { underwater, attracted });
  const skill = SKILLS.find((s) => s.id === skillId) ?? {
    id: skillId,
    name: `Ofício (${c.crafts.find((x) => `oficio-${slug(x)}` === skillId) ?? skillId})`,
    attribute: "int",
    trained: true,
  };
  const trained = c.trained.some((t) => t.id === skillId);
  const uses = CATALOG.filter(
    (e) => e.kind === "skillUse" && e.group === skill.name,
  );
  const selectedUse = ENTRY_MAP.get(use);
  const modifier = d.skills[skillId].total + bonus;
  const expression = `1d20${sign(modifier)}`;
  const validDie =
    die !== "" &&
    Number.isInteger(Number(die)) &&
    Number(die) >= 1 &&
    Number(die) <= 20;
  const total = Number(die) + modifier;
  return (
    <Modal
      title={skill.name}
      subtitle="Perícia"
      onClose={onClose}
      footer={
        <>
          <span className="cost-summary">{expression}</span>
          <button className="button" onClick={onClose}>
            Fechar
          </button>
          <AsyncButton
            disabled={(skill.trained && !trained) || !validDie}
            action={async () => {
              try {
                await commit({
                  type: "roll",
                  expression,
                  physicalRolls: [{ expression, values: [Number(die)] }],
                  label: `${skill.name}${selectedUse ? `: ${selectedUse.name}` : ""}`,
                  skill: skillId,
                  dc: dc === "" ? undefined : Number(dc),
                  context: { underwater, attracted },
                });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Check size={17} />
            Registrar teste
          </AsyncButton>
        </>
      }
    >
      <ErrorList errors={error ? [error] : []} />
      <div className="row between">
        <Pill tone={trained ? "green" : "neutral"}>
          {trained ? "Treinada" : "Não treinada"}
        </Pill>
        <button
          className="text-button"
          onClick={() =>
            void commit({
              type: "edit",
              character: {
                ...c,
                favorites: c.favorites.includes(skillId)
                  ? c.favorites.filter((x) => x !== skillId)
                  : [...c.favorites, skillId],
              },
              reason: `Favorito: ${skill.name}`,
            })
          }
        >
          <Star
            size={16}
            fill={c.favorites.includes(skillId) ? "currentColor" : "none"}
          />
          Favorita
        </button>
      </div>
      {skill.trained && !trained && (
        <div className="notice danger">
          Esta perícia exige treinamento (p. 114).
        </div>
      )}
      <Calculation label={skill.name} value={d.skills[skillId]} signed />
      <div className="notice">
        <strong>Role 1d20 na mesa e some {sign(modifier)}.</strong>
        <p>
          Você pode consultar o bônus e fechar. Registrar o resultado é
          opcional.
        </p>
      </div>
      <div className="form-grid">
        <NumberField
          label="Modificador contextual"
          value={bonus}
          onChange={setBonus}
        />
        <Field label="Classe de dificuldade">
          <input
            type="number"
            value={dc}
            onChange={(e) => setDC(e.target.value)}
            placeholder="Opcional"
          />
        </Field>
      </div>
      <Field
        label="Resultado do d20 (opcional)"
        hint="Informe apenas o dado físico, de 1 a 20. O app soma os bônus."
      >
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          step={1}
          value={die}
          onChange={(event) => setDie(event.target.value)}
          placeholder="Dado da mesa"
        />
      </Field>
      {die !== "" && !validDie && (
        <p role="alert" className="notice danger">
          Informe um número inteiro de 1 a 20.
        </p>
      )}
      {validDie && (
        <div className="notice" role="status">
          <strong>
            Total do teste: {die} {modifier >= 0 ? "+" : "−"}{" "}
            {Math.abs(modifier)} = {total}
          </strong>
          {dc !== "" && (
            <p>
              CD {dc}:{" "}
              {Number(die) === 20 || (Number(die) !== 1 && total >= Number(dc))
                ? "sucesso"
                : "falha"}
              {[1, 20].includes(Number(die)) ? ` (${die} natural)` : ""}.
            </p>
          )}
        </div>
      )}
      {skillId === "atletismo" && (
        <Toggle
          label="Natação: aplicar penalidade de armadura"
          checked={underwater}
          onChange={setUnderwater}
        />
      )}
      <Toggle
        label="Interação com criatura que sente atração pelo personagem"
        checked={attracted}
        onChange={setAttracted}
      />
      {uses.length > 0 && (
        <>
          <Field label="Uso específico">
            <select value={use} onChange={(e) => setUse(e.target.value)}>
              <option value="">Teste geral</option>
              {uses.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          {selectedUse && (
            <p className="source-text">{selectedUse.description}</p>
          )}
        </>
      )}
      <SourceButton page={114} onClick={() => openBook(114)} />
    </Modal>
  );
}
export function Library({
  spells,
  onAdd,
  onUse,
}: {
  spells: boolean;
  onAdd: () => void;
  onUse: (e: CatalogEntry) => void;
}) {
  const { character: c, commit, openEntry } = useApp();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [favorites, setFavorites] = useState(false);
  const all = [
    ...new Map(
      characterEntries(c)
        .filter((e) => (e.kind === "spell") === spells)
        .map((e) => [e.id, e]),
    ).values(),
  ];
  const groups = [
    ...new Set(
      all.map((e) =>
        spells ? `${e.circle}º círculo` : e.group || "Raça / origem",
      ),
    ),
  ];
  const entries = all.filter(
    (e) =>
      slug(e.name + " " + e.description).includes(slug(query)) &&
      (group === "all" ||
        (spells ? `${e.circle}º círculo` : e.group || "Raça / origem") ===
          group) &&
      (!favorites || c.favorites.includes(e.id)),
  );
  return (
    <>
      <div className="library-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder={
            spells ? "Pesquisar minhas magias…" : "Pesquisar meus poderes…"
          }
        />
        <select
          aria-label="Filtrar biblioteca"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="all">
            {spells ? "Todos os círculos" : "Todas as origens"}
          </option>
          {groups.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <button
          className={`button ${favorites ? "selected" : ""}`}
          onClick={() => setFavorites(!favorites)}
        >
          <Star size={16} />
          Favoritos
        </button>
        <button className="button primary" onClick={onAdd}>
          <Plus size={16} />
          {spells ? "Aprender magia" : "Adicionar poder"}
        </button>
      </div>
      {entries.length ? (
        <div className="library-grid">
          {entries.map((e) => {
            const usage = usageFor(c, e);
            const ac = c.acquisitions.find((a) => a.entryId === e.id);
            return (
              <article
                className="power-card"
                data-magic={spells || undefined}
                key={e.id}
              >
                <div className="row between">
                  <Pill tone={spells ? "blue" : "gold"}>
                    {spells
                      ? `${e.circle}º · ${e.school}`
                      : e.group || "Habilidade racial"}
                  </Pill>
                  <button
                    className="icon-button"
                    aria-label={`Favoritar ${e.name}`}
                    onClick={() =>
                      void commit({
                        type: "edit",
                        character: {
                          ...c,
                          favorites: c.favorites.includes(e.id)
                            ? c.favorites.filter((x) => x !== e.id)
                            : [...c.favorites, e.id],
                        },
                        reason: `Favorito: ${e.name}`,
                      })
                    }
                  >
                    <Star
                      size={16}
                      fill={
                        c.favorites.includes(e.id) ? "currentColor" : "none"
                      }
                    />
                  </button>
                </div>
                <button className="power-title" onClick={() => openEntry(e)}>
                  <span className="power-emblem" aria-hidden="true">
                    <EntityIcon name={e.name} size={31} />
                  </span>
                  {e.name}
                </button>
                <p>
                  {e.description
                    .replace(/^(Arcana|Divina|Universal).*?Duração:.*?\./s, "")
                    .slice(0, 210)}
                  {e.description.length > 210 ? "…" : ""}
                </p>
                <div className="card-tags">
                  <Pill>{coverageFor(e).label}</Pill>
                  {usage.active ? (
                    <>
                      <span>{usage.minimum} PM</span>
                      <span>{usage.duration}</span>
                    </>
                  ) : (
                    <span>Habilidade passiva</span>
                  )}
                  {ac?.mode === "device" && (
                    <Pill>Engenhoca{ac.broken ? " enguiçada" : ""}</Pill>
                  )}
                  {ac?.source === "arcanista" &&
                    c.choices.path === "Mago" &&
                    spells && (
                      <Pill tone={ac.prepared ? "green" : "neutral"}>
                        {ac.prepared ? "Memorizada" : "Não memorizada"}
                      </Pill>
                    )}
                </div>
                <footer>
                  <button className="text-button" onClick={() => openEntry(e)}>
                    Consultar · p. {e.page}
                  </button>
                  {usage.active && (
                    <button className="button small" onClick={() => onUse(e)}>
                      {spells ? "Lançar" : "Usar"}
                      <Sparkles size={13} />
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={spells ? <Sparkles /> : <BookOpen />}
          heading={
            query || group !== "all"
              ? "Nenhum resultado"
              : spells
                ? "Seu grimório começa aqui"
                : "Seu repertório de aventuras"
          }
          action={
            <button className="button primary" onClick={onAdd}>
              <Plus size={16} />
              {spells ? "Consultar magias" : "Consultar poderes"}
            </button>
          }
        >
          {spells
            ? "Encontre magias no catálogo, registre sua origem e organize as favoritas."
            : "Habilidades de raça e classe aparecem automaticamente. Adicione as escolhas que fazem parte da sua história."}
        </Empty>
      )}
    </>
  );
}
