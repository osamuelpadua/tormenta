import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
} from "react";
import { BookOpen, Check, ChevronDown, Search, X } from "lucide-react";
import type { Command } from "../domain/commands";
import type { Character, DerivedValue, CatalogEntry } from "../domain/types";
import { sign } from "../data/rules";
export interface UIContext {
  character: Character;
  commit: (command: Command) => Promise<void>;
  notify: (text: string) => void;
  openEntry: (entry: CatalogEntry) => void;
  openBook: (page: number) => void;
}
export const AppContext = createContext<UIContext>(null!);
export const useApp = () => useContext(AppContext);
let openModals = 0;
let previousOverflow = "";
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  footer,
  className = "",
  toolbar,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  footer?: ReactNode;
  className?: string;
  toolbar?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current!;
    const previous = document.activeElement as HTMLElement;
    el.showModal();
    if (openModals++ === 0) previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const resize = () =>
      el.style.setProperty(
        "--dialog-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    resize();
    viewport?.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      el.close();
      if (--openModals === 0) document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "modal-wide" : ""} ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-shell">
        <header className="modal-heading">
          <div>
            {subtitle && <span className="eyebrow">{subtitle}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={21} />
          </button>
        </header>
        {toolbar}
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const labelId = useId();
  return (
    <label className={`field ${className}`}>
      <span id={labelId}>{label}</span>
      {Children.map(children, (child) => {
        if (
          !isValidElement(child) ||
          typeof child.type !== "string" ||
          !["input", "select", "textarea"].includes(child.type)
        )
          return child;
        const element = child as ReactElement<Record<string, unknown>>;
        return element.props["aria-label"]
          ? element
          : cloneElement(element, { "aria-labelledby": labelId });
      })}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
      />
    </Field>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`check-label ${disabled ? "disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Pesquisar…",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="searchbox">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Limpar pesquisa" onClick={() => onChange("")}>
          <X size={15} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  icon,
  heading,
  children,
  action,
}: {
  icon?: ReactNode;
  heading: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{heading}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Calculation({
  label,
  value,
  signed = false,
  unit = "",
  compact = false,
  icon,
}: {
  label: string;
  value: DerivedValue;
  signed?: boolean;
  unit?: string;
  compact?: boolean;
  icon?: ReactNode;
}) {
  return (
    <details className={`calculation ${compact ? "compact" : ""}`}>
      <summary>
        {icon && (
          <i className="attribute-symbol" aria-hidden="true">
            {icon}
          </i>
        )}
        <span>{label}</span>
        <strong>
          {signed ? sign(value.total) : value.total}
          {unit && <small> {unit}</small>}
        </strong>
        <ChevronDown size={13} />
      </summary>
      <div className="calculation-breakdown">
        {value.components.map((c, i) => (
          <div key={i} className={c.applied ? "" : "discarded"}>
            <span>
              {c.label}
              {c.page && <small>p. {c.page}</small>}
              {c.reason && <small>{c.reason}</small>}
            </span>
            <b>{sign(c.value)}</b>
          </div>
        ))}
        <div className="calculation-total">
          <span>Total</span>
          <b>
            {signed ? sign(value.total) : value.total}
            {unit}
          </b>
        </div>
      </div>
    </details>
  );
}
export function ErrorList({ errors }: { errors: string[] }) {
  return errors.length ? (
    <div className="notice danger" role="alert">
      <strong>Confira antes de continuar</strong>
      <ul>
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  ) : null;
}
export function SourceButton({
  page,
  onClick,
}: {
  page: number;
  onClick: () => void;
}) {
  return (
    <button className="source-link" onClick={onClick}>
      <BookOpen size={13} />
      Jogo do Ano · p. {page}
    </button>
  );
}
export function AsyncButton({
  action,
  children,
  className = "button primary",
  disabled = false,
}: {
  action: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  return (
    <>
      <button
        disabled={busy || disabled}
        className={className}
        onClick={async () => {
          setBusy(true);
          setFailure("");
          try {
            await action();
          } catch (error) {
            setFailure(
              error instanceof Error
                ? error.message
                : "Não foi possível concluir esta operação.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Salvando…" : children}
      </button>
      {failure && (
        <p role="alert" className="error-text">
          {failure}
        </p>
      )}
    </>
  );
}
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "red" | "green" | "blue" | "gold";
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
export function ChoiceCard({
  selected,
  onClick,
  title,
  description,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <button
      className={`choice-card ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="row between">
        <strong>{title}</strong>
        {selected && <Check size={17} />}
      </div>
      {description && <small>{description}</small>}
      {children}
    </button>
  );
}
