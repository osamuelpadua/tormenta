import { useState } from "react";
import { EntityIcon } from "./entity-icon";
import {
  Activity,
  ArrowRight,
  Check,
  Clock3,
  Dices,
  Flame,
  Heart,
  Minus,
  Moon,
  Plus,
  Shield,
  Sparkles,
  Swords,
  Target,
  X,
  Zap,
} from "lucide-react";
import {
  ACTION_LABELS,
  ATTRIBUTES,
  CATALOG,
  CONDITIONS,
  DAMAGE_TYPES,
  ENTRY_MAP,
  SKILLS,
  sign,
  slug,
  classLevel,
} from "../data/rules";
import { calculate, temporaryTotal } from "../domain/calculate";
import { characterEntries, has, uid } from "../domain/character";
import { magicPlan, type CastingContext } from "../domain/magic";
import { attackPlan, type AttackOptions } from "../domain/attacks";
import { WILD_FORMS, formPlan } from "../domain/forms";
import { coverageFor, ATTACK_ABILITIES } from "../domain/coverage";
import { previewDamage, type DamageInput } from "../domain/commands";
import {
  castingCost,
  createEffect,
  durationFor,
  durationLabel,
  usageFor,
} from "../domain/effects";
import type {
  CatalogEntry,
  Character,
  DamageType,
  Effect,
  RulesContext,
} from "../domain/types";
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

export function Resources({
  onResource,
}: {
  onResource: (type: "damage" | "hp" | "mp" | "rest") => void;
}) {
  const { character: c } = useApp();
  const d = calculate(c);
  return (
    <div className="resource-grid">
      {(["hp", "mp"] as const).map((kind) => (
        <div className={`resource-card ${kind}`} key={kind}>
          <div className="row between">
            <span>
              {kind === "hp" ? <Heart size={17} /> : <Sparkles size={17} />}{" "}
              {kind === "hp" ? "Pontos de vida" : "Pontos de mana"}
            </span>
            {temporaryTotal(c, kind) > 0 && (
              <Pill>+{temporaryTotal(c, kind)} temp.</Pill>
            )}
          </div>
          <div className="resource-value">
            <strong>{c[kind]}</strong>
            <span>/ {d[kind].total}</span>
            <div className="resource-actions">
              <button
                title={kind === "hp" ? "Receber dano" : "Gastar PM"}
                aria-label={kind === "hp" ? "Receber dano" : "Gastar PM"}
                onClick={() => onResource(kind === "hp" ? "damage" : "mp")}
              >
                <Minus size={18} />
                <span className="resource-action-label">
                  {kind === "hp" ? "Dano" : "Gastar"}
                </span>
              </button>
              <button
                title={kind === "hp" ? "Recuperar PV" : "Recuperar PM"}
                aria-label={kind === "hp" ? "Recuperar PV" : "Recuperar PM"}
                onClick={() => onResource(kind)}
              >
                <Plus size={18} />
                <span className="resource-action-label">
                  {kind === "hp" ? "Curar" : "Recuperar"}
                </span>
              </button>
            </div>
          </div>
          <div
            className="resource-track"
            role="progressbar"
            aria-label={kind === "hp" ? "Pontos de vida" : "Pontos de mana"}
            aria-valuemin={Math.min(0, c[kind])}
            aria-valuemax={Math.max(d[kind].total, c[kind])}
            aria-valuenow={c[kind]}
          >
            <div
              style={{
                width: `${Math.max(0, Math.min(100, (c[kind] / Math.max(1, d[kind].total)) * 100))}%`,
              }}
            />
          </div>
          {kind === "hp" && c.nonlethal > 0 && (
            <small>{c.nonlethal} de dano não letal</small>
          )}
        </div>
      ))}
      <div className="defense-card">
        <Shield size={24} />
        <Calculation label="Defesa" value={d.defense} />
        <small>Toque para ver o cálculo</small>
      </div>
    </div>
  );
}
export function AttackList({ onAttack }: { onAttack: (id: string) => void }) {
  const { character: c } = useApp();
  const d = calculate(c);
  return (
    <div className="attack-list">
      {d.attacks.map((a) => (
        <div className="attack-row" key={a.id}>
          <div className="attack-icon">
            <EntityIcon name={a.name} size={31} />
          </div>
          <div className="attack-title">
            <strong>{a.name}</strong>
            <small>
              {a.range} · {a.damageType}
            </small>
          </div>
          <div>
            <b>{a.damageExpression}</b>
            <small>
              {a.threat === 20 ? "20" : a.threat} / ×{a.critical}
            </small>
          </div>
          <button
            className="roll-button"
            onClick={() => onAttack(a.id)}
            aria-label={`Atacar com ${a.name}`}
          >
            <Dices size={17} />
            {sign(a.toHit.total)}
          </button>
        </div>
      ))}
    </div>
  );
}
export function EffectsList({ onCondition }: { onCondition: () => void }) {
  const { character: c, commit, openEntry } = useApp();
  const d = calculate(c);
  return (
    <section className="panel effects-panel">
      <div className="panel-heading">
        <h3>
          <Activity size={17} />
          Condições e efeitos
        </h3>
        <button className="text-button" onClick={onCondition}>
          <Plus size={15} />
          Adicionar
        </button>
      </div>
      {d.conditions.length > 0 && (
        <div className="condition-pills">
          {d.conditions.map((id) => (
            <Pill key={id} tone="red">
              <EntityIcon
                name={CONDITIONS.find((e) => slug(e.name) === id)?.name ?? id}
                size={16}
              />
              {CONDITIONS.find((e) => slug(e.name) === id)?.name ?? id}
            </Pill>
          ))}
        </div>
      )}
      {c.effects.length ? (
        <div className="effects-list">
          {c.effects.map((e) => (
            <div
              className="effect-row"
              data-negative={e.source === "condicao"}
              data-active={e.active}
              key={e.id}
            >
              <div
                className={`effect-dot ${e.source === "condicao" ? "negative" : ""}`}
              >
                <EntityIcon
                  name={
                    CONDITIONS.find((x) => slug(x.name) === e.condition)
                      ?.name ?? e.name
                  }
                  size={23}
                />
              </div>
              <div>
                <button
                  className="inline-name"
                  onClick={() => {
                    const entry =
                      ENTRY_MAP.get(e.entryId ?? "") ??
                      CONDITIONS.find((x) => slug(x.name) === e.condition);
                    if (entry) openEntry(entry);
                  }}
                >
                  {CONDITIONS.find((x) => slug(x.name) === e.condition)?.name ??
                    e.name}
                </button>
                <small>
                  <Clock3 size={12} />
                  {durationLabel(e.duration)}
                  {e.target ? ` · ${e.target}` : ""}
                  {e.maintenance ? ` · ${e.maintenance} PM/turno` : ""}
                </small>
                {e.description && (
                  <p className="effect-description">{e.description}</p>
                )}
                <small className="effect-source">
                  Origem:{" "}
                  {e.source === "condicao"
                    ? "condição"
                    : e.source === "pericia"
                      ? "perícia"
                      : e.source}
                </small>
                {e.modifiers.length > 0 && (
                  <div className="effect-modifiers">
                    {e.modifiers.map((modifier) => (
                      <span key={modifier.id}>
                        {modifier.label}{" "}
                        {modifier.operation === "multiply"
                          ? `×${modifier.value}`
                          : modifier.operation === "set"
                            ? `= ${modifier.value}`
                            : sign(modifier.value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {e.duration.unit === "round" && (
                <span className="effect-rounds">
                  <strong>{e.duration.remaining}</strong>
                  <small>rodadas</small>
                </span>
              )}
              <button
                className="icon-button"
                aria-label={`Encerrar ${e.name}`}
                onClick={() => void commit({ type: "removeEffect", id: e.id })}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="quiet-empty">
          <Shield size={22} />
          <span>Nenhum efeito ativo</span>
          <small>Condições e efeitos temporários aparecem aqui.</small>
        </div>
      )}
    </section>
  );
}
export function Combat({
  onResource,
  onAttack,
  onCondition,
  onUse,
}: {
  onResource: (type: "damage" | "hp" | "mp" | "rest") => void;
  onAttack: (id: string) => void;
  onCondition: () => void;
  onUse: (e: CatalogEntry) => void;
}) {
  const { character: c, commit } = useApp();
  const d = calculate(c);
  const [initiative, setInitiative] = useState(d.skills.iniciativa?.total ?? 0);
  const [sustain, setSustain] = useState<string[]>([]);
  const [cursor, setCursor] = useState(c.combat.initiative);
  const powers = characterEntries(c)
    .filter(
      (e) =>
        usageFor(c, e).active &&
        (c.favorites.includes(e.id) ||
          c.acquisitions.some((a) => a.entryId === e.id && a.favorite)),
    )
    .slice(0, 8);
  return (
    <>
      <Resources onResource={onResource} />
      <div className="combat-layout">
        <div className="stack">
          <section className="panel turn-panel">
            <div className="battle-heading" aria-hidden="true">
              <Swords size={26} strokeWidth={1.3} />
              <span>
                {c.combat.active
                  ? "A BATALHA CONTINUA"
                  : "PREPARE-SE PARA A BATALHA"}
              </span>
            </div>
            <div className="panel-heading">
              <h3>
                <Clock3 size={17} />
                Seu turno
              </h3>
              <Pill tone={c.combat.active ? "red" : "neutral"}>
                {c.combat.active
                  ? `Rodada ${c.combat.round}`
                  : "Fora de combate"}
              </Pill>
            </div>
            {!c.combat.active ? (
              <div className="combat-start">
                <p>
                  Informe sua iniciativa para acompanhar ações, recursos e
                  durações.
                </p>
                <div className="row">
                  <NumberField
                    label="Iniciativa"
                    value={initiative}
                    onChange={setInitiative}
                  />
                  <button
                    className="button primary"
                    onClick={() =>
                      void commit({ type: "combatStart", initiative })
                    }
                  >
                    <Swords size={16} />
                    Iniciar combate
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="action-slots">
                  <div className={c.combat.standard ? "available" : ""}>
                    <span className="action-dot" />
                    <strong>{c.combat.standard}</strong>
                    <span>Padrão</span>
                  </div>
                  <div className={c.combat.movement ? "available" : ""}>
                    <span className="action-dot" />
                    <strong>{c.combat.movement}</strong>
                    <span>Movimento</span>
                  </div>
                  <div>
                    <strong>∞</strong>
                    <span>Livres e reações</span>
                  </div>
                </div>
                <div className="action-buttons">
                  {(["padrao", "movimento", "completa"] as const).map(
                    (action) => (
                      <button
                        key={action}
                        className="button small"
                        disabled={c.combat.phase !== "turn"}
                        onClick={() =>
                          void commit({
                            type: "action",
                            action,
                            label: `Ação ${ACTION_LABELS[action].toLowerCase()} utilizada`,
                          })
                        }
                      >
                        Usar {ACTION_LABELS[action].toLowerCase()}
                      </button>
                    ),
                  )}
                </div>
                <small className="muted">
                  Uma ação padrão pode ser convertida em movimento. A completa
                  usa ambas.
                </small>
                {c.combat.phase === "before" && (
                  <>
                    {c.effects
                      .filter((e) => e.active && e.maintenance > 0)
                      .map((e) => (
                        <Toggle
                          key={e.id}
                          label={`Sustentar ${e.name} · ${e.maintenance} PM`}
                          checked={sustain.includes(e.id)}
                          onChange={(v) =>
                            setSustain(
                              v
                                ? [...sustain, e.id]
                                : sustain.filter((id) => id !== e.id),
                            )
                          }
                        />
                      ))}
                    <button
                      className="button primary full"
                      onClick={() =>
                        void commit({ type: "turnStart", sustain })
                      }
                    >
                      Iniciar meu turno
                      <ArrowRight size={17} />
                    </button>
                  </>
                )}
                {c.combat.phase === "turn" && (
                  <button
                    className="button primary full"
                    onClick={() => void commit({ type: "turnEnd" })}
                  >
                    Encerrar meu turno
                    <Check size={17} />
                  </button>
                )}
                {c.combat.phase === "after" && (
                  <button
                    className="button primary full"
                    onClick={() => void commit({ type: "roundNext" })}
                  >
                    Avançar para a rodada {c.combat.round + 1}
                    <ArrowRight size={17} />
                  </button>
                )}
                <details className="source-details">
                  <summary>
                    Acontecimentos e iniciativa de outros participantes
                  </summary>
                  <div className="action-buttons">
                    <button
                      className="button small"
                      onClick={() =>
                        void commit({ type: "event", event: "hostile" })
                      }
                    >
                      <Flame size={14} />
                      Recebi efeito hostil
                    </button>
                    <button
                      className="button small"
                      onClick={() =>
                        void commit({ type: "event", event: "attacked" })
                      }
                    >
                      Informar ataque externo
                    </button>
                  </div>
                  <div className="row">
                    <NumberField
                      label="Próxima iniciativa"
                      value={cursor}
                      onChange={setCursor}
                    />
                    <button
                      className="button small"
                      onClick={() =>
                        void commit({
                          type: "initiative",
                          initiative: cursor,
                          edge: "before",
                        })
                      }
                    >
                      Passar antes
                    </button>
                    <button
                      className="button small"
                      onClick={() =>
                        void commit({
                          type: "initiative",
                          initiative: cursor,
                          edge: "after",
                        })
                      }
                    >
                      Passar depois
                    </button>
                  </div>
                  <small>
                    Cursor atual: {c.combat.cursor}. Use ordem decrescente. Os
                    efeitos expiram na iniciativa de origem.
                  </small>
                </details>
                <button
                  className="text-button muted"
                  onClick={() => void commit({ type: "sceneEnd" })}
                >
                  Encerrar a cena e o combate
                </button>
              </>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>
                <Swords size={17} />
                Ataques
              </h3>
              <span className="muted">Ataque · dano · crítico</span>
            </div>
            <AttackList onAttack={onAttack} />
          </section>
          {powers.length > 0 && (
            <section className="panel">
              <div className="panel-heading">
                <h3>
                  <Zap size={17} />
                  Acesso rápido
                </h3>
              </div>
              <div className="quick-powers">
                {powers.map((e) => (
                  <button key={e.id} onClick={() => onUse(e)}>
                    <EntityIcon name={e.name} size={28} />
                    <span>{e.name}</span>
                    <small>
                      {usageFor(c, e).minimum} PM ·{" "}
                      {ACTION_LABELS[usageFor(c, e).action]}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="stack">
          <EffectsList onCondition={onCondition} />
          <section className="panel">
            <div className="panel-heading">
              <h3>Resistências e movimento</h3>
            </div>
            {["fortitude", "reflexos", "vontade", "iniciativa"].map((id) => (
              <Calculation
                key={id}
                label={SKILLS.find((s) => s.id === id)!.name}
                value={d.skills[id]}
                signed
              />
            ))}
            <Calculation label="Deslocamento" value={d.speed} unit="m" />
            <Calculation label="Redução de dano" value={d.rd} />
          </section>
          <button className="button" onClick={() => onResource("rest")}>
            <Moon size={17} />
            Descanso e recuperação
          </button>
        </div>
      </div>
    </>
  );
}
export function ResourceModal({
  mode,
  onClose,
}: {
  mode: "damage" | "hp" | "mp" | "rest";
  onClose: () => void;
}) {
  const { character: c, commit } = useApp();
  const [amount, setAmount] = useState(1);
  const [operation, setOperation] = useState<
    "recover" | "spend" | "set" | "temporary"
  >(mode === "mp" ? "spend" : "recover");
  const [reason, setReason] = useState("");
  const [type, setType] = useState<DamageType>("impacto");
  const [nonlethal, setNonlethal] = useState(false);
  const [loss, setLoss] = useState(false);
  const [save, setSave] = useState<DamageInput["save"]>("none");
  const [half, setHalf] = useState(false);
  const [extraRD, setExtraRD] = useState(0);
  const [magical, setMagical] = useState(false);
  const [quality, setQuality] = useState<
    "poor" | "normal" | "comfortable" | "luxurious"
  >("normal");
  const [specialRest, setSpecialRest] = useState(false);
  const [error, setError] = useState("");
  const input = {
    amount,
    damageType: type,
    nonlethal,
    loss,
    save,
    halfAgain: half,
    extraRD,
    magical,
    reason,
  };
  let preview;
  try {
    preview = previewDamage(c, input);
  } catch {
    /* validation on submit */
  }
  const apply = async () => {
    try {
      if (mode === "damage") await commit({ type: "damage", input });
      else if (mode === "rest")
        await commit({
          type: "rest",
          quality,
          hours: 8,
          specialConditions: specialRest,
        });
      else if (operation === "temporary")
        await commit({
          type: "temporary",
          kind: mode,
          amount,
          source: reason,
          duration: "day",
        });
      else
        await commit({
          type: "resource",
          kind: mode,
          amount,
          mode: operation,
          reason,
        });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={
        mode === "damage"
          ? "Receber dano"
          : mode === "rest"
            ? "Descanso"
            : mode === "hp"
              ? "Pontos de vida"
              : "Pontos de mana"
      }
      subtitle="Recursos do personagem"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton action={apply}>Aplicar alteração</AsyncButton>
        </>
      }
    >
      <ErrorList errors={error ? [error] : []} />
      {mode === "rest" ? (
        <>
          <p className="lead">
            Uma pausa de oito horas para recuperar o fôlego.
          </p>
          <Field label="Condições do descanso">
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as typeof quality)}
            >
              <option value="poor">Ruim · metade do nível</option>
              <option value="normal">Normal · nível</option>
              <option value="comfortable">Confortável · dobro do nível</option>
              <option value="luxurious">Luxuoso · triplo do nível</option>
            </select>
          </Field>
          {c.raceId === "osteon" && (
            <Toggle
              label="Oito horas sob a luz das estrelas ou no subterrâneo"
              checked={specialRest}
              onChange={setSpecialRest}
            />
          )}
          <div className="notice">
            <p>
              Recuperação:{" "}
              {Math.floor(
                c.levels.length *
                  (["golem", "osteon"].includes(c.raceId)
                    ? 1
                    : { poor: 0.5, normal: 1, comfortable: 2, luxurious: 3 }[
                        quality
                      ]),
              )}{" "}
              PV e PM, respeitando os máximos e a natureza da raça.
            </p>
            <small>
              Recursos temporários de um dia expiram. Não há recuperação
              automática até o máximo.
            </small>
          </div>
        </>
      ) : (
        <>
          <div className="form-grid">
            <NumberField
              label={mode === "damage" ? "Dano original" : "Quantidade"}
              value={amount}
              onChange={setAmount}
              min={0}
            />
            {mode === "damage" ? (
              <Field label="Tipo de dano">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as DamageType)}
                >
                  {DAMAGE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Operação">
                <select
                  value={operation}
                  onChange={(e) =>
                    setOperation(e.target.value as typeof operation)
                  }
                >
                  <option value="recover">Recuperar</option>
                  <option value="spend">Gastar</option>
                  <option value="set">Ajustar valor atual</option>
                  <option value="temporary">Conceder temporários</option>
                </select>
              </Field>
            )}
          </div>
          {mode === "damage" && (
            <>
              <div className="form-grid">
                <Toggle
                  label="Dano não letal"
                  checked={nonlethal}
                  onChange={setNonlethal}
                />
                <Toggle
                  label="Perda de vida (ignora RD e temporários)"
                  checked={loss}
                  onChange={setLoss}
                />
                <Toggle
                  label="Dano mágico"
                  checked={magical}
                  onChange={setMagical}
                />
              </div>
              <details className="source-details">
                <summary>Resistência e ajustes de contexto</summary>
                <Field label="Resultado do teste de resistência">
                  <select
                    value={save}
                    onChange={(e) => setSave(e.target.value as typeof save)}
                  >
                    <option value="none">Sem redução</option>
                    <option value="half">Reduz à metade</option>
                    <option value="negates">Anula</option>
                  </select>
                </Field>
                <Toggle
                  label="Aplicar outra redução à metade (ex.: Durão já pago)"
                  checked={half}
                  onChange={setHalf}
                />
                <NumberField
                  label="RD adicional do contexto"
                  value={extraRD}
                  onChange={setExtraRD}
                  min={0}
                />
              </details>
              {preview && (
                <div className="damage-preview">
                  {preview.steps.map((s, i) => (
                    <div key={i}>
                      <span>{s.label}</span>
                      <b>{s.amount}</b>
                    </div>
                  ))}
                  <div className="total">
                    <span>
                      {preview.healing
                        ? "PV recuperados"
                        : nonlethal
                          ? "Dano não letal aplicado"
                          : "PV perdidos"}
                    </span>
                    <strong>
                      {preview.healing ? preview.amount : preview.hpDamage}
                    </strong>
                  </div>
                </div>
              )}
            </>
          )}
          <Field
            label={
              mode === "damage" ? "Origem / observação" : "Origem da alteração"
            }
          >
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ataque, magia, consumível ou ajuste autorizado…"
            />
          </Field>
        </>
      )}
    </Modal>
  );
}
export function AttackModal({
  attackId,
  onClose,
}: {
  attackId: string;
  onClose: () => void;
}) {
  const { character: c, commit } = useApp();
  const [target, setTarget] = useState("");
  const [defense, setDefense] = useState("");
  const [bonus, setBonus] = useState(0);
  const [extra, setExtra] = useState("");
  const [nonlethal, setNonlethal] = useState(attackId === "unarmed");
  const [error, setError] = useState("");
  const [ammo, setAmmo] = useState("");
  const [abilities, setAbilities] = useState<AttackOptions>({});
  const plan = attackPlan(c, attackId, abilities);
  const d = calculate(c, { target });
  const attack = d.attacks.find((a) => a.id === attackId)!;
  return (
    <Modal
      title={attack.name}
      titleIcon={<EntityIcon name={attack.name} size={34} />}
      subtitle="Ataque com dados físicos"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            disabled={!!plan.errors.length}
            action={async () => {
              try {
                await commit({
                  type: "attack",
                  attackId,
                  target,
                  defense: defense === "" ? undefined : Number(defense),
                  bonus,
                  extraDamage: extra,
                  nonlethal,
                  ammoId: ammo || undefined,
                  abilities,
                });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Dices size={17} />
            Registrar ataque
          </AsyncButton>
        </>
      }
    >
      <ErrorList errors={[...(error ? [error] : []), ...plan.errors]} />
      <div className="attack-preview">
        <span>
          1d20
          {sign(
            attack.toHit.total +
              bonus +
              plan.hit -
              ((nonlethal &&
                attackId !== "unarmed" &&
                !has(c, "Ataque Piedoso")) ||
              (!nonlethal &&
                attackId === "unarmed" &&
                !has(c, "Briga") &&
                !has(c, "Estilo Desarmado"))
                ? 5
                : 0),
          )}
        </span>
        <ArrowRight size={20} />
        <span>
          {attack.damageExpression}
          {plan.damage ? sign(plan.damage) : ""}
          {plan.divineDice ? ` + ${plan.divineDice}d${plan.divineSides}` : ""}
        </span>
        <Pill>
          {attack.threat} / ×{attack.critical}
        </Pill>
      </div>
      <Calculation label="Bônus de ataque" value={attack.toHit} signed />
      {(has(c, "Ataque Especial") ||
        has(c, "Golpe Divino") ||
        c.combat.pending.length > 0) && (
        <section className="notice">
          <h3>Habilidades deste ataque · {plan.cost} PM</h3>
          {has(c, "Ataque Especial") && (
            <>
              <Toggle
                label="Ataque Especial"
                checked={!!abilities.special}
                onChange={(enabled) =>
                  setAbilities({
                    ...abilities,
                    special: enabled ? 1 : 0,
                    specialHit: enabled ? 4 : 0,
                  })
                }
              />
              {!!abilities.special && (
                <div className="form-grid">
                  <NumberField
                    label="PM em Ataque Especial"
                    min={1}
                    max={1 + Math.floor((classLevel(c, "guerreiro") - 1) / 4)}
                    value={abilities.special}
                    onChange={(special) =>
                      setAbilities({
                        ...abilities,
                        special,
                        specialHit: special * 4,
                      })
                    }
                  />
                  <NumberField
                    label="Bônus destinado ao acerto (restante no dano)"
                    min={0}
                    max={abilities.special * 4}
                    step={2}
                    value={abilities.specialHit ?? 0}
                    onChange={(specialHit) =>
                      setAbilities({ ...abilities, specialHit })
                    }
                  />
                </div>
              )}
            </>
          )}
          {has(c, "Golpe Divino") && (
            <>
              <Toggle
                label="Golpe Divino"
                checked={!!abilities.divine}
                onChange={(enabled) =>
                  setAbilities({ ...abilities, divine: enabled ? 2 : 0 })
                }
              />
              {!!abilities.divine && (
                <NumberField
                  label="PM em Golpe Divino"
                  min={2}
                  max={2 + Math.floor((classLevel(c, "paladino") - 1) / 4)}
                  value={abilities.divine}
                  onChange={(divine) => setAbilities({ ...abilities, divine })}
                />
              )}
            </>
          )}
          {c.combat.pending.length > 0 && (
            <Field label="Ação utilizada">
              <select
                value={abilities.extra ?? ""}
                onChange={(e) =>
                  setAbilities({
                    ...abilities,
                    extra: (e.target.value ||
                      undefined) as AttackOptions["extra"],
                  })
                }
              >
                <option value="">Ação padrão (agredir)</option>
                {(
                  [
                    ["ataque-extra", "Ataque Extra"],
                    ["frenesi", "Frenesi"],
                    ["golpe-relampago", "Golpe Relâmpago"],
                  ] as const
                )
                  .filter(
                    ([id, name]) =>
                      has(c, name) &&
                      c.combat.pending.includes(id) &&
                      !c.combat.used.includes(`round:${id}`),
                  )
                  .map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </section>
      )}
      <div className="form-grid">
        <Field label="Alvo">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Nome do inimigo"
          />
        </Field>
        <Field label="Defesa do alvo (opcional)">
          <input
            type="number"
            value={defense}
            onChange={(e) => setDefense(e.target.value)}
          />
        </Field>
        <NumberField
          label="Modificador contextual"
          value={bonus}
          onChange={setBonus}
        />
        <Field label="Dano adicional separado">
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Ex.: 1d6 (não multiplica no crítico)"
          />
        </Field>
      </div>
      <Field label="Munição consumida">
        <select value={ammo} onChange={(e) => setAmmo(e.target.value)}>
          <option value="">Não utiliza / controle externo</option>
          {c.inventory
            .filter((i) => i.category === "Munição" && i.quantity > 0)
            .map((i) => (
              <option value={i.id} key={i.id}>
                {i.name} · {i.quantity}
              </option>
            ))}
        </select>
      </Field>
      <Toggle
        label="Causar dano não letal"
        checked={nonlethal}
        onChange={setNonlethal}
      />
      <small className="muted">
        Consulte os bônus e role na mesa. Para registrar o ataque, informe os
        dados físicos de acerto e dano nas próximas etapas. Sem a Defesa do
        alvo, confirme o acerto na mesa. Os recursos são gastos ao concluir o
        registro.
      </small>
    </Modal>
  );
}
export function ConditionModal({ onClose }: { onClose: () => void }) {
  const { character: c, commit } = useApp();
  const [tab, setTab] = useState("condition");
  const [query, setQuery] = useState("");
  const [condition, setCondition] = useState("abalado");
  const [duration, setDuration] = useState("cena");
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("defense");
  const [amount, setAmount] = useState(0);
  const [sourceKind, setSourceKind] = useState<Effect["source"]>("ajuste");
  const [error, setError] = useState("");
  return (
    <Modal
      title="Condições e efeitos"
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            action={async () => {
              try {
                if (tab === "condition")
                  await commit({
                    type: "condition",
                    condition,
                    duration,
                    source,
                  });
                else {
                  if (!name.trim() || !source.trim())
                    throw new Error("Informe nome, origem e motivo do efeito.");
                  const effect: Effect = {
                    id: uid(),
                    name,
                    source: sourceKind,
                    description: source,
                    modifiers: [
                      {
                        id: uid(),
                        label: name,
                        target,
                        value: amount,
                        source: sourceKind,
                        sourceId: slug(source),
                      },
                    ],
                    duration: durationFor(duration, c.combat.cursor),
                    active: true,
                    startedRound: c.combat.round,
                    startedTurn: c.combat.turn,
                    maintenance: duration === "sustentada" ? 1 : 0,
                  };
                  await commit({ type: "effect", effect });
                }
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Aplicar efeito
          </AsyncButton>
        </>
      }
    >
      <div className="tabs">
        <button
          className={tab === "condition" ? "active" : ""}
          onClick={() => setTab("condition")}
        >
          Condição do livro
        </button>
        <button
          className={tab === "custom" ? "active" : ""}
          onClick={() => setTab("custom")}
        >
          Efeito personalizado
        </button>
      </div>
      <ErrorList errors={error ? [error] : []} />
      {tab === "condition" ? (
        <>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Pesquisar condição…"
          />
          <div className="condition-select">
            {CONDITIONS.filter((e) => slug(e.name).includes(slug(query))).map(
              (e) => (
                <button
                  className={condition === slug(e.name) ? "selected" : ""}
                  key={e.id}
                  onClick={() => setCondition(slug(e.name))}
                >
                  <EntityIcon name={e.name} size={23} />
                  {e.name}
                </button>
              ),
            )}
          </div>
          <p className="source-text">
            {CONDITIONS.find((e) => slug(e.name) === condition)?.description}
          </p>
        </>
      ) : (
        <>
          <Field label="Nome do efeito">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bônus concedido pelo mestre"
            />
          </Field>
          <div className="form-grid">
            <Field label="Tipo de fonte">
              <select
                value={sourceKind}
                onChange={(e) =>
                  setSourceKind(e.target.value as Effect["source"])
                }
              >
                {[
                  "ajuste",
                  "habilidade",
                  "magia",
                  "item",
                  "parceiro",
                  "ambiente",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Valor afetado">
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {[
                  ["defense", "Defesa"],
                  ["hp", "PV máximos"],
                  ["mp", "PM máximos"],
                  ["attack", "Ataques"],
                  ["damage", "Dano"],
                  ["speed", "Deslocamento"],
                  ["rd", "Redução de dano"],
                  ["skills", "Todas as perícias"],
                  ...ATTRIBUTES.map((a) => [`attribute:${a.id}`, a.name]),
                  ...SKILLS.map((s) => [`skill:${s.id}`, s.name]),
                ].map(([v, n]) => (
                  <option value={v} key={v}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <NumberField
              label="Bônus ou penalidade"
              value={amount}
              onChange={setAmount}
            />
          </div>
        </>
      )}
      <Field label="Duração">
        <select value={duration} onChange={(e) => setDuration(e.target.value)}>
          {[
            "cena",
            "1 rodada",
            "2 rodadas",
            "3 rodadas",
            "5 rodadas",
            "10 rodadas",
            "1 minuto",
            "10 minutos",
            "1 hora",
            "1 dia",
            "sustentada",
            "permanente",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <Field label="Origem e motivo">
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={2}
          placeholder="Habilidade, acontecimento ou mestre que autorizou…"
        />
      </Field>
      <small className="muted">
        Efeitos com a mesma fonte respeitam as regras de acúmulo. Ajustes
        personalizados permanecem identificados.
      </small>
    </Modal>
  );
}
export function UseModal({
  entry,
  onClose,
  onAttack,
}: {
  entry: CatalogEntry;
  onClose: () => void;
  onAttack: (id: string) => void;
}) {
  const { character: c, commit, openBook } = useApp();
  const coverage = coverageFor(entry),
    attackAbility = ATTACK_ABILITIES.includes(entry.name);
  const [attackId, setAttackId] = useState(
    calculate(c).attacks[0]?.id ?? "unarmed",
  );
  const acs = c.acquisitions.filter((a) => a.entryId === entry.id);
  const [acId, setAcId] = useState(acs[0]?.id ?? "");
  const ac = acs.find((a) => a.id === acId);
  const sourceClass =
    ac?.source ?? (entry.kind === "spell" ? "Raça" : slug(entry.group));
  const usage = usageFor(c, entry);
  const [cost, setCost] = useState(usage.minimum);
  const [target, setTarget] = useState(c.name);
  const [self, setSelf] = useState(true);
  const [enh, setEnh] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [castingContext, setCastingContext] = useState<CastingContext>({});
  const [choices, setChoices] = useState<Record<string, string>>({
    attribute: slug(entry.name) === "mente-divina" ? "int" : "for",
    form: "feroz",
    tier: "base",
  });
  const casting =
    entry.kind === "spell"
      ? magicPlan(c, entry, ac, sourceClass, enh, castingContext)
      : undefined;
  const effect = createEffect(
    c,
    entry,
    casting?.cost ?? cost,
    sourceClass,
    target,
    enh,
    choices,
  );
  const form =
    entry.name === "Forma Selvagem" ? formPlan(c, choices) : undefined;
  return (
    <Modal
      title={entry.name}
      titleIcon={<EntityIcon name={entry.name} size={34} />}
      subtitle={
        entry.kind === "spell"
          ? `${entry.magicType} · ${entry.circle}º círculo · ${entry.school}`
          : entry.group || "Habilidade"
      }
      onClose={onClose}
      footer={
        <>
          <span className="cost-summary">
            <Sparkles size={17} />
            {casting?.cost ?? cost} PM{" "}
            <small>· {ACTION_LABELS[casting?.action ?? usage.action]}</small>
          </span>
          <AsyncButton
            disabled={!!casting?.errors.length || !!form?.errors.length}
            action={async () => {
              if (attackAbility) {
                onAttack(attackId);
                return;
              }
              try {
                await commit({
                  type: "use",
                  entryId: entry.id,
                  acquisitionId: ac?.id,
                  cost: casting?.cost ?? cost,
                  target,
                  enhancements: enh,
                  sourceClass,
                  applyToSelf: self,
                  choices,
                  casting: castingContext,
                });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {attackAbility
              ? "Configurar ataque"
              : entry.kind === "spell"
                ? "Lançar magia"
                : "Usar habilidade"}
          </AsyncButton>
        </>
      }
    >
      <ErrorList
        errors={[
          ...(error ? [error] : []),
          ...(casting?.errors ?? []),
          ...(form?.errors ?? []),
        ]}
      />
      <details className="source-details">
        <summary>{coverage.label} · cobertura desta regra</summary>
        <p>{coverage.available}</p>
        <p>{coverage.pending}</p>
      </details>
      {attackAbility && (
        <Field label="Ataque que usará a habilidade">
          <select
            value={attackId}
            onChange={(e) => setAttackId(e.target.value)}
          >
            {calculate(c).attacks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <small>
            Ative a habilidade na janela de ataque e confira o custo antes de
            rolar.
          </small>
        </Field>
      )}
      {form && (
        <div className="form-grid">
          <Field label="Forma selvagem">
            <select
              value={choices.form}
              onChange={(e) => setChoices({ ...choices, form: e.target.value })}
            >
              {WILD_FORMS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Patamar da transformação">
            <select
              value={choices.tier}
              onChange={(e) => {
                setChoices({
                  ...choices,
                  tier: e.target.value,
                  movement: e.target.value === "superior" ? "flight" : "speed",
                });
                setCost(
                  { base: 3, aprimorada: 6, superior: 10 }[e.target.value] ?? 3,
                );
              }}
            >
              <option value="base">Básica · 3 PM</option>
              {has(c, "Forma Selvagem Aprimorada") && (
                <option value="aprimorada">Aprimorada · 6 PM</option>
              )}
              {has(c, "Forma Selvagem Superior") && (
                <option value="superior">Superior · 10 PM</option>
              )}
            </select>
          </Field>
          {choices.form === "veloz" && (
            <Field label="Deslocamento escolhido">
              <select
                value={choices.movement ?? "speed"}
                onChange={(e) =>
                  setChoices({ ...choices, movement: e.target.value })
                }
              >
                {(choices.tier === "superior"
                  ? ["swim", "flight"]
                  : ["speed", "climb", "swim"]
                ).map((id) => (
                  <option key={id} value={id}>
                    {
                      {
                        speed: "Terrestre",
                        climb: "Escalada",
                        swim: "Natação",
                        flight: "Voo",
                      }[id]
                    }
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}
      {acs.length > 1 && (
        <Field label="Origem de aprendizagem">
          <select value={acId} onChange={(e) => setAcId(e.target.value)}>
            {acs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.source} · {a.mode ?? "habilidade"}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="spell-meta">
        <Pill>{ACTION_LABELS[casting?.action ?? usage.action]}</Pill>
        <Pill>{entry.range ?? "Veja descrição"}</Pill>
        <Pill>{durationLabel(effect.duration)}</Pill>
        {entry.resistance && <Pill>{entry.resistance}</Pill>}
        {casting && (
          <Pill tone="blue">
            CD {casting.dc} · {casting.attribute.toUpperCase()}
          </Pill>
        )}
      </div>
      <div className="form-grid">
        <Field label="Alvo / referência">
          <input value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        {entry.kind !== "spell" && (
          <NumberField
            label={`Custo em PM (${usage.minimum}–${usage.maximum})`}
            value={cost}
            onChange={setCost}
            min={usage.minimum}
            max={usage.maximum}
          />
        )}
      </div>
      <Toggle
        label="Aplicar ao meu personagem"
        checked={self}
        onChange={setSelf}
      />
      {["mente-divina", "fisico-divino"].includes(slug(entry.name)) && (
        <Field label="Atributo fortalecido">
          <select
            value={choices.attribute}
            onChange={(e) =>
              setChoices({ ...choices, attribute: e.target.value })
            }
          >
            {ATTRIBUTES.filter((a) =>
              (slug(entry.name) === "mente-divina"
                ? ["int", "sab", "car"]
                : ["for", "des", "con"]
              ).includes(a.id),
            ).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {casting && (
        <details className="source-details">
          <summary>Condições de conjuração e componentes</summary>
          <Field label="Concentração">
            <select
              value={castingContext.concentration ?? "normal"}
              onChange={(e) =>
                setCastingContext({
                  ...castingContext,
                  concentration: e.target
                    .value as CastingContext["concentration"],
                })
              }
            >
              <option value="normal">Condições normais</option>
              <option value="bad">Condição ruim (CD 15 + PM)</option>
              <option value="terrible">Condição terrível (CD 20 + PM)</option>
              <option value="damage">Dano durante a conjuração</option>
            </select>
          </Field>
          {castingContext.concentration === "damage" && (
            <NumberField
              label="Dano durante a execução"
              value={castingContext.damage ?? 0}
              onChange={(damage) =>
                setCastingContext({ ...castingContext, damage })
              }
              min={0}
            />
          )}
          <Toggle
            label="Impedido de falar"
            checked={!!castingContext.silent}
            onChange={(silent) =>
              setCastingContext({ ...castingContext, silent })
            }
          />
          <Toggle
            label="Impedido de gesticular"
            checked={!!castingContext.bound}
            onChange={(bound) =>
              setCastingContext({ ...castingContext, bound })
            }
          />
          {has(c, "Magia Discreta") && (
            <Toggle
              label="Magia Discreta (+2 PM)"
              checked={!!castingContext.discreet}
              onChange={(discreet) =>
                setCastingContext({ ...castingContext, discreet })
              }
            />
          )}
          {has(c, "Magia Acelerada") && (
            <Toggle
              label="Magia Acelerada (+4 PM)"
              checked={!!castingContext.accelerated}
              onChange={(accelerated) =>
                setCastingContext({ ...castingContext, accelerated })
              }
            />
          )}
          {c.raceId === "qareen" && (
            <Toggle
              label="Outra pessoa pediu esta magia (Desejos)"
              checked={!!castingContext.wish}
              onChange={(wish) =>
                setCastingContext({ ...castingContext, wish })
              }
            />
          )}
          <Toggle
            label="Componentes materiais separados e em mãos"
            checked={!!castingContext.materialsReady}
            onChange={(materialsReady) =>
              setCastingContext({ ...castingContext, materialsReady })
            }
          />
          {casting.gold > 0 && (
            <p>Componentes consumidos: T$ {casting.gold}.</p>
          )}
          {casting.checks.map((check) => (
            <p key={check.label}>
              {check.label}: 1d20{sign(check.bonus)} contra CD {check.dc}. Falha
              consome ações, PM e componentes.
            </p>
          ))}
        </details>
      )}
      {effect.modifiers.length > 0 && (
        <div className="notice">
          <strong>Efeitos calculados</strong>
          {effect.modifiers.map((m) => (
            <p key={m.id}>
              {m.target}: {sign(m.value)}
              {m.condition ? " · depende do alvo" : ""}
            </p>
          ))}
        </div>
      )}
      <details className="source-details">
        <summary>Descrição completa · p. {entry.page}</summary>
        <p className="source-text">{entry.description}</p>
      </details>
      {entry.enhancements && entry.enhancements.length > 0 && (
        <section>
          <h3>Aprimoramentos</h3>
          <div className="enhancements">
            {entry.enhancements.map((h) => (
              <div key={h.id}>
                <div className="enhancement-controls">
                  <Pill tone="blue">
                    {h.trick ? "Truque" : `+${h.cost} PM`}
                  </Pill>
                  {h.repeatable ? (
                    <input
                      aria-label={`Quantidade: ${h.text}`}
                      type="number"
                      min={0}
                      max={20}
                      value={enh[h.id] ?? 0}
                      onChange={(e) =>
                        setEnh({ ...enh, [h.id]: Number(e.target.value) })
                      }
                    />
                  ) : (
                    <input
                      aria-label={h.text}
                      type="checkbox"
                      checked={!!enh[h.id]}
                      onChange={(e) =>
                        setEnh({ ...enh, [h.id]: e.target.checked ? 1 : 0 })
                      }
                    />
                  )}
                </div>
                <p>{h.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <SourceButton page={entry.page} onClick={() => openBook(entry.page)} />
    </Modal>
  );
}
