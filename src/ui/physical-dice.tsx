import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { diceSides, physicalRoll } from "../domain/dice";
import type { RollResult } from "../domain/types";
import { Field, Modal } from "./shared";

export type RequestDice = (
  expression: string,
  label: string,
) => Promise<RollResult | null>;

export function usePhysicalDice() {
  const [pending, setPending] = useState<{
    id: number;
    expression: string;
    label: string;
  }>();
  const sequence = useRef(0);
  const resolver = useRef<((result: RollResult | null) => void) | undefined>(
    undefined,
  );
  const requestDice: RequestDice = useCallback((expression, label) => {
    if (!diceSides(expression).length)
      return Promise.resolve(physicalRoll(expression, []));
    if (resolver.current)
      throw new Error("Conclua o registro de dados em andamento.");
    return new Promise((resolve) => {
      resolver.current = resolve;
      setPending({ id: ++sequence.current, expression, label });
    });
  }, []);
  useEffect(
    () => () => {
      resolver.current?.(null);
    },
    [],
  );
  const finish = (result: RollResult | null) => {
    const resolve = resolver.current;
    resolver.current = undefined;
    setPending(undefined);
    resolve?.(result);
  };
  return {
    requestDice,
    diceDialog: pending ? (
      <PhysicalDiceModal key={pending.id} {...pending} onFinish={finish} />
    ) : null,
  };
}

function PhysicalDiceModal({
  expression,
  label,
  onFinish,
}: {
  expression: string;
  label: string;
  onFinish: (result: RollResult | null) => void;
}) {
  const sides = diceSides(expression);
  const [values, setValues] = useState(() => sides.map(() => ""));
  const valid = values.every(
    (value, i) =>
      value.trim() !== "" &&
      Number.isInteger(Number(value)) &&
      Number(value) >= 1 &&
      Number(value) <= sides[i],
  );
  const result = valid
    ? physicalRoll(expression, values.map(Number))
    : undefined;
  return (
    <Modal
      title={label}
      subtitle="Dados da mesa"
      className="physical-dice-modal"
      onClose={() => onFinish(null)}
      footer={
        <>
          <button className="button" onClick={() => onFinish(null)}>
            Cancelar registro
          </button>
          <button
            className="button primary"
            disabled={!result}
            onClick={() => result && onFinish(result)}
          >
            <Check size={17} /> Confirmar dados
          </button>
        </>
      }
    >
      <p>
        Role <strong>{expression}</strong> na mesa e informe cada dado, sem
        somar os bônus.
      </p>
      <div className="form-grid">
        {sides.map((side, i) => (
          <Field
            key={i}
            label={`Dado ${i + 1} (d${side})`}
            hint={`De 1 a ${side}`}
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={side}
              step={1}
              value={values[i]}
              autoFocus={i === 0}
              onChange={(event) =>
                setValues(
                  values.map((value, index) =>
                    index === i ? event.target.value : value,
                  ),
                )
              }
            />
          </Field>
        ))}
      </div>
      {result && (
        <div className="notice" role="status">
          <strong>Total: {result.total}</strong>
          <p>
            {result.dice
              .map(
                (die) =>
                  `d${die.sides}: ${die.kept.map((index) => die.values[index]).join(" + ")}`,
              )
              .join(" · ")}{" "}
            · modificador {result.constant >= 0 ? "+" : ""}
            {result.constant}
          </p>
        </div>
      )}
      <p className="muted">
        Os valores serão usados no cálculo e no histórico. O app não sorteia os
        dados.
      </p>
    </Modal>
  );
}
