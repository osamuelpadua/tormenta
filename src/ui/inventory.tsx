import { useState } from "react";
import { EntityIcon } from "./entity-icon";
import { itemSource } from "./book-reference";
import { BookEntryButton } from "./entry-readout";
import { Backpack, Coins, Hammer, Pencil, Plus, Trash2 } from "lucide-react";
import { CATALOG, DAMAGE_TYPES, ENTRY_MAP, newItem, slug } from "../data/rules";
import { calculate, itemBenefits } from "../domain/calculate";
import { ITEM_TEMPLATES, itemFromTemplate, uid } from "../domain/character";
import type { DamageType, Item } from "../domain/types";
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
  Toggle,
  useApp,
} from "./shared";
const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
export function Inventory({
  onItem,
  onAdd,
  onCoins,
}: {
  onItem: (i: Item) => void;
  onAdd: () => void;
  onCoins: () => void;
}) {
  const { character: c, commit } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const d = calculate(c);
  const entries = c.inventory.filter(
    (i) =>
      slug(i.name).includes(slug(query)) &&
      (filter === "all" ||
        (filter === "equipped" && ["wielded", "worn"].includes(i.state)) ||
        filter === i.category),
  );
  return (
    <>
      <div className="inventory-summary">
        <section className="panel">
          <Backpack size={22} />
          <div>
            <span>Carga transportada</span>
            <strong>
              {d.load.total}
              <small> / {d.capacity.total} espaços</small>
            </strong>
          </div>
          <div className="load-meter">
            <div
              style={{
                width: `${Math.min(100, (d.load.total / d.capacity.total) * 100)}%`,
              }}
            />
          </div>
          {d.load.total > d.capacity.total && (
            <Pill tone="red">Sobrecarregado</Pill>
          )}
        </section>
        <button className="panel coin-summary" onClick={onCoins}>
          <Coins size={24} />
          <div>
            <span>Seus tibares</span>
            <strong>
              T$ {currency(c.coins.ts + c.coins.tc / 10 + c.coins.to * 10)}
            </strong>
            <small>
              {c.coins.to} TO · {c.coins.ts} T$ · {c.coins.tc} TC
            </small>
          </div>
          <Pencil size={16} />
        </button>
      </div>
      <div className="library-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Pesquisar inventário…"
        />
        <select
          aria-label="Filtrar inventário"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todos os itens</option>
          <option value="equipped">Em uso</option>
          {[...new Set(c.inventory.map((i) => i.category))].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <button className="button primary" onClick={onAdd}>
          <Plus size={16} />
          Adicionar item
        </button>
      </div>
      {entries.length ? (
        <section className="panel inventory-table">
          <div className="inventory-table-head">
            <span>Item</span>
            <span>Quantidade</span>
            <span>Espaços</span>
            <span>Situação</span>
            <span />
          </div>
          {entries.map((i) => (
            <div
              className="inventory-row"
              data-equipped={i.state === "wielded" || i.state === "worn"}
              key={i.id}
            >
              <button className="item-name" onClick={() => onItem(i)}>
                <span className="item-icon">
                  <EntityIcon name={i.name} size={33} />
                </span>
                <span>
                  <strong>{i.name}</strong>
                  <small>
                    {i.category} · {itemBenefits(i)}
                  </small>
                  {i.improvements.length > 0 && (
                    <small>{i.improvements.join(", ")}</small>
                  )}
                </span>
              </button>
              <span className="quantity">{i.quantity}</span>
              <span className="spaces">{i.quantity * i.spaces}</span>
              <select
                aria-label={`Situação de ${i.name}`}
                value={i.state}
                onChange={(e) =>
                  void commit({
                    type: "equip",
                    itemId: i.id,
                    state: e.target.value as Item["state"],
                    benefit: i.benefit,
                  })
                }
              >
                <option value="stored">Guardado</option>
                <option value="carried">Carregado</option>
                <option value="worn">Vestido</option>
                <option value="wielded">Empunhado</option>
              </select>
              <button
                className="icon-button"
                aria-label={`Editar ${i.name}`}
                onClick={() => onItem(i)}
              >
                <Pencil size={16} />
              </button>
              {itemSource(i) && (
                <div className="inventory-book-reference">
                  <BookEntryButton entry={itemSource(i)!} />
                </div>
              )}
            </div>
          ))}
        </section>
      ) : (
        <Empty
          icon={<Backpack />}
          heading="Espaço para novas descobertas"
          action={
            <button className="button primary" onClick={onAdd}>
              <Plus size={16} />
              Adicionar item
            </button>
          }
        >
          Armas, equipamentos e tesouros da sua jornada ficam aqui.
        </Empty>
      )}
      <div className="notice inventory-help">
        <strong>Possuir, carregar e usar</strong>
        <p>
          Itens guardados não entram na carga. Para conceder benefícios, um item
          deve estar vestido ou empunhado. Armas empunhadas aparecem nos
          ataques. O limite normal é de quatro itens vestidos com benefícios.
        </p>
      </div>
    </>
  );
}
export function ItemModal({
  item,
  onClose,
}: {
  item?: Item;
  onClose: () => void;
}) {
  const { character: c, commit } = useApp();
  const [draft, setDraft] = useState<Item>(
    item ? structuredClone(item) : newItem(),
  );
  const [stage, setStage] = useState(item ? "edit" : "catalog");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"owned" | "buy" | "craft">("owned");
  const [skill, setSkill] = useState(
    c.trained.find((t) => t.id.startsWith("oficio-"))?.id ?? "",
  );
  const [dc, setDC] = useState(15);
  const [days, setDays] = useState(7);
  const [cost, setCost] = useState(0);
  const [take10, setTake10] = useState(true);
  const [consume, setConsume] = useState(false);
  const [restore, setRestore] = useState<"hp" | "mp">("hp");
  const [expression, setExpression] = useState("");
  const [remove, setRemove] = useState(false);
  const set = (partial: Partial<Item>) =>
    setDraft((d) => ({ ...d, ...partial }));
  const buy = (i: Item) => {
    setDraft(i);
    setCost(i.price);
    setStage("edit");
  };
  const save = async () => {
    try {
      if (remove && item) {
        await commit({
          type: "edit",
          character: {
            ...c,
            inventory: c.inventory.filter((i) => i.id !== item.id),
            attacks: c.attacks.filter((a) => a.itemId !== item.id),
          },
          reason: `Item removido: ${item.name}`,
        });
      } else if (consume && item) {
        await commit({
          type: "consume",
          itemId: item.id,
          quantity: 1,
          effect: expression ? { kind: restore, expression } : undefined,
        });
      } else if (mode === "craft") {
        await commit({
          type: "craft",
          item: draft,
          cost,
          days,
          skill,
          dc,
          take10,
        });
      } else {
        if (!draft.name.trim()) throw new Error("Informe o nome do item.");
        let coins = c.coins;
        if (mode === "buy") {
          const total = coins.ts + coins.tc / 10 + coins.to * 10;
          const price = draft.price * draft.quantity;
          if (price > total)
            throw new Error("Tibares insuficientes para esta compra.");
          const remainder = Math.round((total - price) * 10);
          coins = { to: 0, ts: Math.floor(remainder / 10), tc: remainder % 10 };
        }
        await commit({
          type: "edit",
          character: {
            ...c,
            coins,
            inventory: item
              ? c.inventory.map((i) => (i.id === item.id ? draft : i))
              : [...c.inventory, draft],
          },
          reason: `${item ? "Item atualizado" : mode === "buy" ? "Compra" : "Item adicionado"}: ${draft.name}`,
        });
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={
        item
          ? item.name
          : stage === "catalog"
            ? "Equipar a jornada"
            : draft.name
      }
      subtitle="Inventário"
      onClose={onClose}
      wide={stage === "catalog"}
      footer={
        <>
          <button
            className="button"
            onClick={() =>
              !item && stage === "edit" ? setStage("catalog") : onClose()
            }
          >
            {!item && stage === "edit" ? "Voltar ao catálogo" : "Cancelar"}
          </button>
          {stage === "edit" && (
            <AsyncButton action={save}>
              {remove
                ? "Remover item"
                : consume
                  ? "Consumir item"
                  : mode === "craft"
                    ? "Fabricar"
                    : "Salvar item"}
            </AsyncButton>
          )}
        </>
      }
    >
      <ErrorList errors={error ? [error] : []} />
      {stage === "edit" && itemSource(draft) && (
        <div className="item-source-reference">
          <BookEntryButton entry={itemSource(draft)!} />
        </div>
      )}
      {stage === "catalog" ? (
        <>
          <div className="row between">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Pesquisar equipamento…"
            />
            <button
              className="button"
              onClick={() => {
                setDraft(newItem());
                setStage("edit");
              }}
            >
              <Plus size={16} />
              Item personalizado
            </button>
          </div>
          <div className="equipment-catalog">
            {ITEM_TEMPLATES.filter((i) =>
              slug(i.name).includes(slug(query)),
            ).map((i) => (
              <button key={i.id} onClick={() => buy(itemFromTemplate(i.id))}>
                <span className="item-icon">
                  <EntityIcon name={i.name} size={30} />
                </span>
                <span>
                  <strong>{i.name}</strong>
                  <small>
                    {i.category} · {itemBenefits(i)}
                  </small>
                </span>
                <b>T$ {currency(i.price)}</b>
                <Plus size={16} />
              </button>
            ))}
          </div>
          <details className="source-details">
            <summary>Itens mágicos e materiais especiais</summary>
            <div className="equipment-catalog">
              {CATALOG.filter(
                (e) =>
                  e.kind === "magicItem" && slug(e.name).includes(slug(query)),
              )
                .slice(0, 50)
                .map((e) => (
                  <button
                    key={e.id}
                    onClick={() =>
                      buy({
                        ...newItem(e.name),
                        entryId: e.id,
                        category: "Item mágico",
                        notes: e.description,
                      })
                    }
                  >
                    <EntityIcon name={e.name} />
                    <span>
                      <strong>{e.name}</strong>
                      <small>
                        p. {e.page} · configurar propriedades da peça
                      </small>
                    </span>
                    <Plus size={15} />
                  </button>
                ))}
            </div>
          </details>
        </>
      ) : (
        <>
          <div className="form-grid">
            <Field label="Nome">
              <input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Categoria">
              <input
                value={draft.category}
                onChange={(e) => set({ category: e.target.value })}
                list="item-categories"
              />
              <datalist id="item-categories">
                {[
                  "Arma",
                  "Armadura leve",
                  "Armadura pesada",
                  "Escudo",
                  "Munição",
                  "Equipamento de aventura",
                  "Vestuário",
                  "Esotérico",
                  "Alquímico",
                  "Item mágico",
                  "Animal",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </datalist>
            </Field>
            <NumberField
              label="Quantidade"
              value={draft.quantity}
              onChange={(quantity) => set({ quantity })}
              min={0}
            />
            <NumberField
              label="Espaços por unidade"
              value={draft.spaces}
              onChange={(spaces) => set({ spaces })}
              min={0}
              step={0.5}
            />
            <NumberField
              label="Preço por unidade (T$)"
              value={draft.price}
              onChange={(price) => set({ price })}
              min={0}
              step={0.1}
            />
            <NumberField
              label="Mãos necessárias"
              value={draft.hands}
              onChange={(hands) => set({ hands })}
              min={0}
              max={2}
            />
          </div>
          <Toggle
            label="Concede benefícios quando vestido ou empunhado"
            checked={draft.benefit}
            onChange={(benefit) => set({ benefit })}
          />
          <details
            className="source-details"
            open={!!draft.defense || !!draft.damage}
          >
            <summary>Propriedades de combate</summary>
            <div className="form-grid">
              <NumberField
                label="Bônus na Defesa"
                value={draft.defense}
                onChange={(defense) => set({ defense })}
              />
              <NumberField
                label="Penalidade de armadura"
                value={draft.penalty}
                onChange={(penalty) => set({ penalty })}
                max={0}
              />
              <Field label="Dano básico">
                <input
                  value={draft.damage}
                  onChange={(e) => set({ damage: e.target.value })}
                  placeholder="1d8"
                />
              </Field>
              <Field label="Tipo de dano">
                <select
                  value={draft.damageType}
                  onChange={(e) =>
                    set({ damageType: e.target.value as DamageType })
                  }
                >
                  {DAMAGE_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <NumberField
                label="Margem de ameaça"
                value={draft.threat}
                onChange={(threat) => set({ threat })}
                min={1}
                max={20}
              />
              <NumberField
                label="Multiplicador crítico"
                value={draft.critical}
                onChange={(critical) => set({ critical })}
                min={1}
                max={10}
              />
              <Field label="Tipo de ataque">
                <select
                  value={draft.attackType}
                  onChange={(e) =>
                    set({ attackType: e.target.value as Item["attackType"] })
                  }
                >
                  <option value="melee">Corpo a corpo</option>
                  <option value="ranged">Disparo</option>
                  <option value="thrown">Arremesso</option>
                </select>
              </Field>
              <Field label="Proficiência exigida">
                <select
                  value={draft.proficiency}
                  onChange={(e) => set({ proficiency: e.target.value })}
                >
                  <option value="">Nenhuma</option>
                  {[
                    "simples",
                    "marciais",
                    "exoticas",
                    "fogo",
                    "leves",
                    "pesadas",
                    "escudos",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Alcance">
                <input
                  value={draft.range}
                  onChange={(e) => set({ range: e.target.value })}
                />
              </Field>
            </div>
            <Toggle
              label="Armadura pesada"
              checked={draft.heavy}
              onChange={(heavy) => set({ heavy })}
            />
          </details>
          <details className="source-details">
            <summary>Melhorias, encantos e modificadores</summary>
            <Field label="Melhorias (separadas por vírgula)">
              <input
                value={draft.improvements.join(", ")}
                onChange={(e) =>
                  set({
                    improvements: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
            <Field label="Encantos (separados por vírgula)">
              <input
                value={draft.enchantments.join(", ")}
                onChange={(e) =>
                  set({
                    enchantments: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
            {draft.modifiers.map((m, index) => (
              <div className="modifier-row" key={m.id}>
                <input
                  aria-label="Valor afetado pelo item"
                  value={m.target}
                  placeholder="skill:furtividade"
                  onChange={(e) =>
                    set({
                      modifiers: draft.modifiers.map((x, i) =>
                        i === index ? { ...x, target: e.target.value } : x,
                      ),
                    })
                  }
                />
                <input
                  aria-label="Bônus do item"
                  type="number"
                  value={m.value}
                  onChange={(e) =>
                    set({
                      modifiers: draft.modifiers.map((x, i) =>
                        i === index
                          ? { ...x, value: Number(e.target.value) }
                          : x,
                      ),
                    })
                  }
                />
                <button
                  className="icon-button"
                  aria-label="Remover modificador"
                  onClick={() =>
                    set({
                      modifiers: draft.modifiers.filter((x) => x.id !== m.id),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button
              className="button small"
              onClick={() =>
                set({
                  modifiers: [
                    ...draft.modifiers,
                    {
                      id: uid(),
                      label: draft.name,
                      target: "defense",
                      value: 0,
                      source: "item",
                      sourceId: draft.id,
                    },
                  ],
                })
              }
            >
              <Plus size={15} />
              Modificador do item
            </button>
          </details>
          <Field label="Descrição e observações">
            <textarea
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={5}
            />
          </Field>
          {!item && (
            <>
              <Field label="Forma de aquisição">
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as typeof mode);
                    setCost(
                      e.target.value === "craft"
                        ? Math.round((draft.price / 3) * 10) / 10
                        : draft.price,
                    );
                  }}
                >
                  <option value="owned">
                    Já possuo / equipamento inicial / recompensa
                  </option>
                  <option value="buy">Comprar e descontar tibares</option>
                  <option value="craft">Fabricar com Ofício</option>
                </select>
              </Field>
              {mode === "craft" && (
                <div className="form-grid">
                  <Field label="Ofício utilizado">
                    <select
                      value={skill}
                      onChange={(e) => setSkill(e.target.value)}
                    >
                      {c.trained
                        .filter((t) => t.id.startsWith("oficio-"))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.id.replace("oficio-", "")}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <NumberField
                    label="Materiais (T$)"
                    value={cost}
                    onChange={setCost}
                    min={0}
                    step={0.1}
                  />
                  <NumberField
                    label="CD da fabricação"
                    value={dc}
                    onChange={setDC}
                  />
                  <NumberField
                    label="Dias de trabalho"
                    value={days}
                    onChange={setDays}
                    min={1}
                  />
                  <Toggle
                    label="Escolher 10 no teste, sem ameaça ou distração"
                    checked={take10}
                    onChange={setTake10}
                  />
                </div>
              )}
            </>
          )}
          {item && (
            <>
              <Toggle
                label="Consumir uma unidade agora (ação padrão)"
                checked={consume}
                onChange={(v) => {
                  setConsume(v);
                  setRemove(false);
                }}
              />
              {consume && (
                <div className="form-grid">
                  <Field label="Recuperação do consumível">
                    <select
                      value={restore}
                      onChange={(e) =>
                        setRestore(e.target.value as typeof restore)
                      }
                    >
                      <option value="hp">PV</option>
                      <option value="mp">PM</option>
                    </select>
                  </Field>
                  <Field label="Expressão da recuperação (opcional)">
                    <input
                      value={expression}
                      onChange={(e) => setExpression(e.target.value)}
                      placeholder="2d4+2"
                    />
                  </Field>
                </div>
              )}
              <Toggle
                label="Remover este item do inventário"
                checked={remove}
                onChange={(v) => {
                  setRemove(v);
                  setConsume(false);
                }}
              />
            </>
          )}
        </>
      )}
    </Modal>
  );
}
export function CoinsModal({ onClose }: { onClose: () => void }) {
  const { character: c, commit } = useApp();
  const [coins, setCoins] = useState(c.coins);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal
      title="Seus tibares"
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
                  throw new Error("Informe a origem da alteração.");
                await commit({
                  type: "edit",
                  character: { ...c, coins },
                  reason: `Tibares: ${reason}`,
                });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Salvar moedas
          </AsyncButton>
        </>
      }
    >
      <ErrorList errors={error ? [error] : []} />
      <div className="form-grid">
        {(["to", "ts", "tc"] as const).map((k) => (
          <NumberField
            key={k}
            label={
              {
                to: "Tibar de ouro (TO)",
                ts: "Tibar de prata (T$)",
                tc: "Tibar de cobre (TC)",
              }[k]
            }
            value={coins[k]}
            onChange={(n) => setCoins({ ...coins, [k]: n })}
            min={0}
          />
        ))}
      </div>
      <p className="notice">
        1 TO = 10 T$ · 1 T$ = 10 TC. Total: T${" "}
        {currency(coins.to * 10 + coins.ts + coins.tc / 10)}.
      </p>
      <Field label="Origem / motivo">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Recompensa, venda, pagamento…"
        />
      </Field>
    </Modal>
  );
}
