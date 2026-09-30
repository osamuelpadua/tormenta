import { useState, type ReactNode } from "react";
import {
  Archive,
  Backpack,
  ChevronDown,
  Coins,
  FlaskConical,
  Hand,
  Pencil,
  Plus,
  Search,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { slug } from "../data/rules";
import { calculate, itemBenefits } from "../domain/calculate";
import type { Item } from "../domain/types";
import { itemSource } from "./book-reference";
import { EntityIcon } from "./entity-icon";
import { BookEntryButton } from "./entry-readout";
import { Modal, Pill, useAccess, useApp } from "./shared";
import "./inventory-game.css";

const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
const isArmor = (i: Item) => i.category.startsWith("Armadura");
const isShield = (i: Item) => i.category === "Escudo";
const wieldable = (i: Item) =>
  i.category === "Arma" || isShield(i) || !!i.damage || i.hands > 0;
export const consumable = (i: Item) =>
  ["Alquímico", "Alimentação"].includes(i.category) ||
  /poção|elixir|óleo|bálsamo/i.test(i.name);
const wearable = (i: Item) =>
  !wieldable(i) &&
  !consumable(i) &&
  !isArmor(i) &&
  !["Munição", "Animal", "Veículo"].includes(i.category);
// What is usually worn on the body, offered first when filling a slot.
const likelyWorn = (i: Item) =>
  wearable(i) &&
  (["Vestuário", "Esotérico", "Item mágico"].includes(i.category) ||
    i.modifiers.length > 0 ||
    i.enchantments.length > 0 ||
    /anel|amuleto|colar|manto|capa|bota|luva|elmo|chap[eé]u|cinto|bracelete|bra[cç]adeira|bandoleira|traje|uniforme|veste|robe|m[aá]scara|coroa|tiara|brinco|insígnia/i.test(
      i.name,
    ));
const magical = (i: Item) =>
  i.category === "Item mágico" || i.enchantments.length > 0;
const owned = (i: Item) => i.quantity > 0;

type SlotKind = "main" | "off" | "armor" | "worn";
const SLOT_LABEL: Record<SlotKind, string> = {
  main: "Mão principal",
  off: "Mão secundária",
  armor: "Armadura",
  worn: "Item vestido",
};
const STATES: [Item["state"], string][] = [
  ["stored", "Guardado"],
  ["carried", "Mochila"],
  ["worn", "Vestido"],
  ["wielded", "Empunhado"],
];

// Equipment laid out on the body, a backpack of slots and a chest of stored
// things: an RPG inventory that stays usable with a thumb.
export function Inventory({
  onItem,
  onAdd,
  onCoins,
  onUse,
}: {
  onItem: (i: Item) => void;
  onAdd: () => void;
  onCoins: () => void;
  onUse?: (i: Item) => void;
}) {
  const { character: c } = useApp();
  const { owner } = useAccess();
  const d = calculate(c);
  const [open, setOpen] = useState<Item>();
  const [picking, setPicking] = useState<SlotKind>();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const items = c.inventory.filter(owned);
  const wielded = items
    .filter((i) => i.state === "wielded")
    .sort((a, b) => Number(isShield(a)) - Number(isShield(b)));
  const main = wielded[0];
  const off = main && main.hands >= 2 ? undefined : wielded[1];
  const twoHanded = !!main && main.hands >= 2;
  const worn = items.filter((i) => i.state === "worn");
  const armor = worn.find(isArmor);
  const accessories = worn.filter((i) => i !== armor);
  const matches = (i: Item) => slug(i.name).includes(slug(query));
  const carried = items.filter((i) => i.state === "carried" && matches(i));
  const stored = items.filter((i) => i.state === "stored" && matches(i));
  const coins = c.coins.ts + c.coins.tc / 10 + c.coins.to * 10;
  const current = open && c.inventory.find((i) => i.id === open.id);
  return (
    <div className="inv">
      <div className="inv-top">
        <button className="inv-purse" onClick={onCoins} disabled={!owner}>
          <Coins size={22} />
          <span>
            <strong>T$ {currency(coins)}</strong>
            <small>
              {c.coins.to} TO · {c.coins.ts} T$ · {c.coins.tc} TC
            </small>
          </span>
        </button>
        <LoadBar load={d.load.total} capacity={d.capacity.total} />
      </div>
      <div className="inv-layout">
        <section className="inv-body" aria-label="Equipamento no corpo">
          <h2 className="inv-heading">
            <Shield size={17} />
            Equipamento
            <span>Defesa {d.defense.total}</span>
          </h2>
          <div className="inv-doll">
            <Ornaments />
            <div className="inv-doll-side">
              <Slot
                kind="worn"
                item={accessories[0]}
                onOpen={setOpen}
                onPick={setPicking}
              />
              <Slot
                kind="armor"
                item={armor}
                onOpen={setOpen}
                onPick={setPicking}
              />
              <Slot
                kind="main"
                item={main}
                onOpen={setOpen}
                onPick={setPicking}
              />
            </div>
            <div className="inv-figure">
              <Figure raceId={c.raceId} name={c.name} />
            </div>
            <div className="inv-doll-side">
              <Slot
                kind="worn"
                item={accessories[1]}
                onOpen={setOpen}
                onPick={setPicking}
              />
              <Slot
                kind="worn"
                item={accessories[2]}
                onOpen={setOpen}
                onPick={setPicking}
              />
              {twoHanded ? (
                <div
                  className="inv-slot inv-slot-busy"
                  aria-label={`Mão secundária ocupada por ${main!.name}`}
                >
                  <span className="inv-slot-frame">
                    <EntityIcon name={main!.name} size={34} />
                  </span>
                  <small>Duas mãos</small>
                </div>
              ) : (
                <Slot
                  kind="off"
                  item={off}
                  onOpen={setOpen}
                  onPick={setPicking}
                />
              )}
            </div>
            <div className="inv-doll-foot">
              <Slot
                kind="worn"
                item={accessories[3]}
                onOpen={setOpen}
                onPick={setPicking}
              />
            </div>
          </div>
          {accessories.length > 4 && (
            <div className="inv-extra">
              {accessories.slice(4).map((i) => (
                <ItemTile key={i.id} item={i} onOpen={setOpen} />
              ))}
            </div>
          )}
        </section>
        <section className="inv-pack" aria-label="Mochila">
          <h2 className="inv-heading">
            <Backpack size={17} />
            Mochila
            <span>
              {carried.length} {carried.length === 1 ? "item" : "itens"}
            </span>
            <button
              className="icon-button"
              aria-label="Buscar no inventário"
              aria-pressed={searching}
              onClick={() => {
                setSearching(!searching);
                setQuery("");
              }}
            >
              {searching ? <X size={17} /> : <Search size={17} />}
            </button>
          </h2>
          {searching && (
            <label className="inv-search">
              <Search size={16} />
              <input
                autoFocus
                type="search"
                value={query}
                placeholder="Buscar item…"
                aria-label="Buscar item"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          )}
          <div className="inv-grid">
            {carried.map((i) => (
              <ItemTile key={i.id} item={i} onOpen={setOpen} />
            ))}
            {owner && !query && (
              <button
                className="inv-tile inv-tile-add"
                onClick={onAdd}
                aria-label="Adicionar item"
              >
                <span className="inv-tile-frame">
                  <Plus size={26} />
                </span>
                <span className="inv-tile-name">Adicionar</span>
              </button>
            )}
          </div>
          {!carried.length && query && (
            <p className="muted inv-empty">
              Nenhum item na mochila com esse nome.
            </p>
          )}
          <details className="inv-chest" open={!!query && stored.length > 0}>
            <summary>
              <Archive size={17} />
              Guardados
              <span>{stored.length}</span>
              <small>fora da mochila · não contam na carga</small>
              <ChevronDown size={16} />
            </summary>
            {stored.length ? (
              <div className="inv-grid">
                {stored.map((i) => (
                  <ItemTile key={i.id} item={i} onOpen={setOpen} />
                ))}
              </div>
            ) : (
              <p className="muted inv-empty">
                Itens que ficaram na estalagem, no navio ou no baú aparecem
                aqui.
              </p>
            )}
          </details>
        </section>
      </div>
      {current && (
        <ItemSheet
          item={current}
          onClose={() => setOpen(undefined)}
          onEdit={() => {
            setOpen(undefined);
            onItem(current);
          }}
          onUse={
            onUse && consumable(current)
              ? () => {
                  setOpen(undefined);
                  onUse(current);
                }
              : undefined
          }
        />
      )}
      {picking && (
        <SlotPicker
          kind={picking}
          onClose={() => setPicking(undefined)}
          onAdd={() => {
            setPicking(undefined);
            onAdd();
          }}
        />
      )}
    </div>
  );
}

function LoadBar({ load, capacity }: { load: number; capacity: number }) {
  const cells = Math.max(capacity, load);
  const segmented = cells <= 40;
  return (
    <div className="inv-load" data-over={load > capacity || undefined}>
      <div className="inv-load-text">
        <Backpack size={18} />
        <strong>{load}</strong>
        <span>/ {capacity} espaços</span>
        {load > capacity && <Pill tone="red">Sobrecarregado</Pill>}
      </div>
      <div
        className="inv-load-bar"
        role="progressbar"
        aria-label="Carga transportada"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={load}
      >
        {segmented ? (
          Array.from({ length: cells }, (_, n) => (
            <i
              key={n}
              data-fill={n < load ? (n < capacity ? "ok" : "over") : undefined}
            />
          ))
        ) : (
          <b style={{ width: `${Math.min(100, (load / capacity) * 100)}%` }} />
        )}
      </div>
    </div>
  );
}

function Slot({
  kind,
  item,
  onOpen,
  onPick,
}: {
  kind: SlotKind;
  item?: Item;
  onOpen: (i: Item) => void;
  onPick: (k: SlotKind) => void;
}) {
  const { owner } = useAccess();
  if (item)
    return (
      <button
        className={`inv-slot filled${magical(item) ? " magical" : ""}`}
        data-item-name={item.name}
        onClick={() => onOpen(item)}
        aria-label={`${SLOT_LABEL[kind]}: ${item.name}`}
      >
        <span className="inv-slot-frame">
          <EntityIcon name={item.name} size={36} />
        </span>
        <small>{item.name}</small>
      </button>
    );
  return (
    <button
      className="inv-slot empty"
      onClick={() => onPick(kind)}
      disabled={!owner}
      aria-label={`${SLOT_LABEL[kind]}: vazio. Escolher item`}
    >
      <span className="inv-slot-frame">
        {kind === "armor" ? (
          <Shield size={22} />
        ) : kind === "worn" ? (
          <Sparkles size={20} />
        ) : (
          <Hand size={22} />
        )}
      </span>
      <small>{SLOT_LABEL[kind]}</small>
    </button>
  );
}

function ItemTile({ item, onOpen }: { item: Item; onOpen: (i: Item) => void }) {
  const spaces = item.quantity * item.spaces;
  return (
    <button
      className={`inv-tile${magical(item) ? " magical" : ""}`}
      data-item-name={item.name}
      onClick={() => onOpen(item)}
      aria-label={`${item.name}${item.quantity > 1 ? `, ${item.quantity} unidades` : ""}, ${spaces} ${spaces === 1 ? "espaço" : "espaços"}`}
    >
      <span className="inv-tile-frame">
        <EntityIcon name={item.name} size={38} />
        {item.quantity > 1 && <b className="inv-qty">×{item.quantity}</b>}
        {spaces > 0 && (
          <i className="inv-spaces" aria-hidden="true">
            <Backpack size={9} />
            {spaces}
          </i>
        )}
        {consumable(item) && (
          <FlaskConical className="inv-use-mark" size={12} aria-hidden="true" />
        )}
      </span>
      <span className="inv-tile-name">{item.name}</span>
    </button>
  );
}

// The hero at the centre of the equipment screen: a painted figure for each
// race (public/art/figures), with a drawn outline if the art is unavailable.
const FIGURES = new Set([
  "humano",
  "anao",
  "dahllan",
  "elfo",
  "goblin",
  "lefou",
  "minotauro",
  "qareen",
  "golem",
  "hynne",
  "kliren",
  "medusa",
  "osteon",
  "sereia-tritao",
  "silfide",
  "suraggel",
  "trog",
]);
function Figure({ raceId, name }: { raceId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const race = FIGURES.has(raceId) ? raceId : "humano";
  return (
    <>
      <span className="inv-figure-pedestal" aria-hidden="true" />
      {failed ? (
        <Outline />
      ) : (
        <img
          className="inv-figure-art"
          src={`/art/figures/${race}.webp`}
          alt={`Figura de ${name}`}
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </>
  );
}
function Outline() {
  return (
    <svg
      className="inv-figure-outline"
      viewBox="0 0 120 230"
      aria-hidden="true"
    >
      <g
        fill="#1c211a"
        stroke="#8a7245"
        strokeWidth="1.6"
        strokeLinejoin="round"
      >
        <circle cx="60" cy="28" r="17" />
        <path d="M60 47c-9 0-15 3-20 7l-15 10c-6 4-8 10-8 16l-2 42c0 5 3 8 7 8s6-3 6-7l3-34 4-3v44l-4 58c0 6 4 10 9 10s8-3 9-9l7-54h4l7 54c1 6 4 9 9 9s9-4 9-10l-4-58V88l4 3 3 34c0 4 2 7 6 7s7-3 7-8l-2-42c0-6-2-12-8-16L80 54c-5-4-11-7-20-7Z" />
      </g>
    </svg>
  );
}
// Gilded filigree for the four corners of the equipment frame.
function Ornaments() {
  const corner = (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M2 62V14C2 7 7 2 14 2h48M8 62V18c0-6 4-10 10-10h44"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M14 22c0-5 3-8 8-8M22 14c6 0 9 4 9 9 0 3-2 5-5 5s-4-2-4-4 1-3 3-3M14 22c0 6 4 9 9 9 3 0 5-2 5-5s-2-4-4-4-3 1-3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="3" fill="currentColor" />
    </svg>
  );
  return (
    <span className="inv-ornaments" aria-hidden="true">
      <i>{corner}</i>
      <i>{corner}</i>
      <i>{corner}</i>
      <i>{corner}</i>
    </span>
  );
}

function ItemSheet({
  item,
  onClose,
  onEdit,
  onUse,
}: {
  item: Item;
  onClose: () => void;
  onEdit: () => void;
  onUse?: () => void;
}) {
  const { commit } = useApp();
  const { owner } = useAccess();
  const [busy, setBusy] = useState(false);
  const source = itemSource(item);
  const description = item.notes.trim() || source?.description?.trim() || "";
  const move = async (state: Item["state"]) => {
    if (state === item.state || busy) return;
    setBusy(true);
    try {
      await commit({
        type: "equip",
        itemId: item.id,
        state,
        benefit: item.benefit,
      });
    } catch {
      // commit already reports the reason.
    } finally {
      setBusy(false);
    }
  };
  const stats: [string, ReactNode][] = [];
  if (item.damage) stats.push(["Dano", `${item.damage} ${item.damageType}`]);
  if (item.damage)
    stats.push([
      "Crítico",
      `${item.threat === 20 ? "20" : `${item.threat}–20`} / ×${item.critical}`,
    ]);
  if (item.defense) stats.push(["Defesa", `+${item.defense}`]);
  if (item.penalty) stats.push(["Penalidade", `−${Math.abs(item.penalty)}`]);
  if (item.hands) stats.push(["Mãos", item.hands === 1 ? "Uma" : "Duas"]);
  if (item.range) stats.push(["Alcance", item.range]);
  stats.push(["Espaços", item.quantity * item.spaces]);
  if (item.quantity > 1) stats.push(["Quantidade", item.quantity]);
  if (item.price) stats.push(["Valor", `T$ ${currency(item.price)}`]);
  return (
    <Modal
      title={item.name}
      subtitle={item.category}
      onClose={onClose}
      className="inv-sheet"
    >
      <div className={`inv-sheet-hero${magical(item) ? " magical" : ""}`}>
        <span className="inv-tile-frame">
          <EntityIcon name={item.name} size={58} />
        </span>
        <div>
          <strong>{itemBenefits(item)}</strong>
          {item.improvements.length > 0 && (
            <small>Melhorias: {item.improvements.join(", ")}</small>
          )}
          {item.enchantments.length > 0 && (
            <small>Encantos: {item.enchantments.join(", ")}</small>
          )}
        </div>
      </div>
      <dl className="inv-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {owner && (
        <div
          className="inv-states"
          role="radiogroup"
          aria-label="Onde está o item"
        >
          {STATES.map(([state, label]) => (
            <button
              key={state}
              role="radio"
              aria-checked={item.state === state}
              className={item.state === state ? "active" : ""}
              disabled={busy}
              onClick={() => void move(state)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {description && <p className="inv-description">{description}</p>}
      {source && (
        <div className="inv-source">
          <BookEntryButton entry={source} />
        </div>
      )}
      {owner && (
        <div className="inv-actions">
          {onUse && (
            <button className="button primary" onClick={onUse}>
              <FlaskConical size={16} />
              Usar
            </button>
          )}
          <button className="button" onClick={onEdit}>
            <Pencil size={16} />
            Editar item
          </button>
        </div>
      )}
    </Modal>
  );
}

// Chooses what goes into an empty slot, from what the character owns.
function SlotPicker({
  kind,
  onClose,
  onAdd,
}: {
  kind: SlotKind;
  onClose: () => void;
  onAdd: () => void;
}) {
  const { character: c, commit } = useApp();
  const [all, setAll] = useState(false);
  const fits = c.inventory.filter(
    (i) =>
      owned(i) &&
      (kind === "armor"
        ? isArmor(i) && i.state !== "worn"
        : kind === "worn"
          ? wearable(i) && i.state !== "worn"
          : wieldable(i) && i.state !== "wielded"),
  );
  const suggested = kind === "worn" ? fits.filter(likelyWorn) : fits;
  const candidates = all || !suggested.length ? fits : suggested;
  const hidden = fits.length - candidates.length;
  const state: Item["state"] =
    kind === "armor" || kind === "worn" ? "worn" : "wielded";
  return (
    <Modal
      title={SLOT_LABEL[kind]}
      subtitle={state === "worn" ? "Vestir" : "Empunhar"}
      onClose={onClose}
      className="inv-sheet"
    >
      {candidates.length ? (
        <div className="inv-picker">
          {candidates.map((i) => (
            <button
              key={i.id}
              onClick={async () => {
                try {
                  await commit({
                    type: "equip",
                    itemId: i.id,
                    state,
                    benefit: i.benefit,
                  });
                  onClose();
                } catch {
                  // commit already reports the reason.
                }
              }}
            >
              <span className="inv-tile-frame">
                <EntityIcon name={i.name} size={30} />
              </span>
              <span>
                <strong>{i.name}</strong>
                <small>
                  {itemBenefits(i)}
                  {i.hands >= 2 ? " · duas mãos" : ""}
                  {i.state === "stored" ? " · guardado" : ""}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">
          {kind === "armor"
            ? "Nenhuma armadura no inventário."
            : kind === "worn"
              ? "Nenhum item para vestir. Roupas, amuletos, anéis e itens mágicos aparecem aqui."
              : "Nenhuma arma ou escudo livre no inventário."}
        </p>
      )}
      {hidden > 0 && (
        <button
          className="text-button inv-picker-more"
          onClick={() => setAll(true)}
        >
          Mostrar todos os itens ({hidden} a mais)
        </button>
      )}
      <button className="button inv-picker-add" onClick={onAdd}>
        <Plus size={16} />
        Adicionar item ao inventário
      </button>
    </Modal>
  );
}
