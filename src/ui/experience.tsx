import { useState } from "react";
import { Sparkles, Star, TrendingUp } from "lucide-react";
import { XP } from "../data/rules";
import type { Character } from "../domain/types";
import {
  AsyncButton,
  ErrorList,
  Field,
  Modal,
  NumberField,
  useAccess,
  useApp,
} from "./shared";

// XP[n] is the total needed to reach level n + 1.
export function experience(c: Character) {
  const level = c.levels.length;
  const floor = XP[level - 1] ?? 0;
  const next = level < 20 ? XP[level] : undefined;
  const progress =
    next === undefined
      ? 1
      : Math.max(0, Math.min(1, (c.xp - floor) / (next - floor)));
  return { level, next, progress, ready: next !== undefined && c.xp >= next };
}
const format = (n: number) => n.toLocaleString("pt-BR");

export function ExperienceBar({ onEvolve }: { onEvolve?: () => void }) {
  const { character: c } = useApp();
  const { owner, effects } = useAccess();
  const [open, setOpen] = useState(false);
  const xp = experience(c);
  return (
    <section className="xp-strip" aria-label="Experiência">
      <div className="xp-strip-level" aria-hidden="true">
        <Star size={15} />
        <strong>{xp.level}</strong>
      </div>
      <div className="xp-strip-body">
        <div className="xp-strip-text">
          <strong>{format(c.xp)} XP</strong>
          <span>
            {xp.next === undefined
              ? "Nível máximo"
              : xp.ready
                ? "Pronto para evoluir!"
                : `${format(xp.next - c.xp)} para o nível ${xp.level + 1}`}
            {c.advancement === "milestones" && " · evolução por marcos"}
          </span>
        </div>
        <div
          className="xp-track"
          role="progressbar"
          aria-label="Progresso até o próximo nível"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(xp.progress * 100)}
          data-ready={xp.ready || undefined}
        >
          <div style={{ width: `${xp.progress * 100}%` }} />
        </div>
      </div>
      {xp.ready && owner && onEvolve && (
        <button className="button primary small" onClick={onEvolve}>
          <TrendingUp size={15} />
          Evoluir
        </button>
      )}
      {effects && (
        <button className="button small" onClick={() => setOpen(true)}>
          <Sparkles size={15} />
          {owner ? "Registrar XP" : "Dar XP"}
        </button>
      )}
      {open && <ExperienceModal onClose={() => setOpen(false)} />}
    </section>
  );
}

export function ExperienceModal({ onClose }: { onClose: () => void }) {
  const { character: c, commit } = useApp();
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal
      title="Experiência"
      subtitle={c.name}
      onClose={onClose}
      footer={
        <>
          <button className="button" onClick={onClose}>
            Cancelar
          </button>
          <AsyncButton
            action={async () => {
              try {
                await commit({ type: "xp", amount, reason });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Registrar
          </AsyncButton>
        </>
      }
    >
      <ErrorList errors={error ? [error] : []} />
      <p className="muted">
        Atual: {format(c.xp)} XP. Use um valor negativo para corrigir.
      </p>
      <XpAmount value={amount} onChange={setAmount} />
      <Field label="Motivo">
        <input
          value={reason}
          maxLength={200}
          placeholder="Derrotou o ogro da ponte"
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

// Amount with quick picks: typing large numbers on a phone is tedious.
export function XpAmount({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <>
      <NumberField
        label="Quantidade de XP"
        value={value}
        onChange={onChange}
        min={-1000000}
        max={1000000}
      />
      <div className="xp-quick" role="group" aria-label="Valores rápidos">
        {[50, 100, 250, 500, 1000].map((n) => (
          <button
            key={n}
            type="button"
            className={`button small${value === n ? " selected" : ""}`}
            onClick={() => onChange(n)}
          >
            {format(n)}
          </button>
        ))}
      </div>
    </>
  );
}
