import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudUpload, LogOut, RefreshCw, UserRound } from "lucide-react";
import { db } from "../../storage/database";
import { backend, engine, useSyncStatus } from "../../sync/backend";
import type { SyncStatus } from "../../sync/sync-engine";
import { AsyncButton, Field, Modal, Pill, Toggle } from "../shared";

export function syncLabel(status: SyncStatus, pending: number) {
  if (status.state === "syncing") return "Sincronizando…";
  if (status.state === "offline")
    return pending
      ? `Sem conexão · ${pending} alteração(ões) aguardando`
      : "Sem conexão · salvo neste dispositivo";
  if (status.state === "error") return "Falha ao sincronizar";
  if (pending) return `${pending} alteração(ões) aguardando envio`;
  return "Sincronizado";
}
export function usePendingCount() {
  return useLiveQuery(() => db.outbox.count(), [], 0);
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!backend) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "signin") {
        await backend.signIn(email, password);
        onDone();
      } else {
        if (!name.trim()) throw new Error("Informe como quer ser chamado.");
        const { session } = await backend.signUp(email, password, name);
        if (session) onDone();
        else setConfirm(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (confirm)
    return (
      <div className="notice" role="status">
        <strong>Confirme seu e-mail</strong>
        <p>
          Enviamos um link para {email}. Depois de confirmar, volte aqui e entre
          com sua senha.
        </p>
        <button className="button" onClick={() => setMode("signin")}>
          Já confirmei
        </button>
      </div>
    );
  return (
    <form className="account-form" onSubmit={submit}>
      <div className="segmented" role="tablist" aria-label="Acesso">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signin"}
          className={mode === "signin" ? "active" : ""}
          onClick={() => setMode("signin")}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={mode === "signup" ? "active" : ""}
          onClick={() => setMode("signup")}
        >
          Criar conta
        </button>
      </div>
      {mode === "signup" && (
        <Field label="Como quer ser chamado" hint="Aparece para o seu grupo.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            maxLength={60}
          />
        </Field>
      )}
      <Field label="E-mail">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </Field>
      <Field
        label="Senha"
        hint={mode === "signup" ? "Ao menos 6 caracteres." : undefined}
      >
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          minLength={6}
          required
        />
      </Field>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
      </button>
      <p className="muted small-print">
        Sem conta, tudo continua funcionando neste aparelho. A conta guarda suas
        fichas na nuvem e permite jogar em campanhas.
      </p>
    </form>
  );
}

// Local-only characters the user can move into the account.
function UploadLocal() {
  const local = useLiveQuery(async () => {
    const linked = new Set(await db.characterSync.toCollection().primaryKeys());
    return (await db.characters.toArray()).filter((c) => !linked.has(c.id));
  }, []);
  const [chosen, setChosen] = useState<string[] | null>(null);
  if (!local?.length || !engine) return null;
  const selected = chosen ?? local.map((c) => c.id);
  return (
    <section className="account-section">
      <h3>
        <CloudUpload size={17} />
        Fichas só deste aparelho
      </h3>
      <p className="muted">
        Envie para a sua conta para usar em outros aparelhos e em campanhas.
      </p>
      {local.map((c) => (
        <Toggle
          key={c.id}
          label={`${c.name} · nível ${c.levels.length}`}
          checked={selected.includes(c.id)}
          onChange={(on) =>
            setChosen(
              on ? [...selected, c.id] : selected.filter((id) => id !== c.id),
            )
          }
        />
      ))}
      <AsyncButton
        disabled={!selected.length}
        action={async () => {
          await engine!.linkCharacters(selected);
          setChosen(null);
        }}
      >
        <CloudUpload size={16} />
        Enviar para minha conta
      </AsyncButton>
    </section>
  );
}

export function AccountModal({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: (text: string) => void;
}) {
  const status = useSyncStatus();
  const pending = usePendingCount();
  const session = status.session;
  const [name, setName] = useState(session?.name ?? "");
  return (
    <Modal
      title={session ? "Sua conta" : "Entrar"}
      subtitle={
        backend?.kind === "demo" ? "Modo demonstração" : "Conta Tormenta Wiki"
      }
      onClose={onClose}
      className="account-dialog"
    >
      {backend?.kind === "demo" && (
        <div className="notice compact-notice">
          Modo demonstração: as contas e campanhas ficam apenas neste navegador.
          Não use para dados reais.
        </div>
      )}
      {!session ? (
        <SignIn
          onDone={() => {
            notify("Bem-vindo de volta à mesa.");
          }}
        />
      ) : (
        <>
          <section className="account-section account-identity">
            <UserRound size={30} />
            <div>
              <strong>{session.name}</strong>
              <small>{session.email}</small>
            </div>
            <Pill tone={status.state === "error" ? "red" : "gold"}>
              {syncLabel(status, pending)}
            </Pill>
          </section>
          {status.error && status.state !== "idle" && (
            <p className="error-text" role="alert">
              {status.error}
            </p>
          )}
          {status.notices.map((notice) => (
            <div className="notice" key={notice}>
              {notice}
            </div>
          ))}
          {status.notices.length > 0 && (
            <button
              className="text-button"
              onClick={() => engine?.dismissNotices()}
            >
              Entendi
            </button>
          )}
          <UploadLocal />
          <section className="account-section">
            <Field label="Nome no grupo">
              <input
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="row">
              <AsyncButton
                className="button"
                disabled={!name.trim() || name.trim() === session.name}
                action={async () => {
                  await backend!.updateProfile(name);
                  notify("Nome atualizado.");
                  await engine?.sync();
                }}
              >
                Salvar nome
              </AsyncButton>
              <AsyncButton className="button" action={() => engine!.sync()}>
                <RefreshCw size={15} />
                Sincronizar agora
              </AsyncButton>
            </div>
          </section>
          <section className="account-section">
            <p className="muted">
              Ao sair, as fichas da conta deixam de aparecer neste aparelho até
              você entrar de novo.
              {pending > 0 &&
                " Há alterações ainda não enviadas: elas serão enviadas quando você entrar novamente."}
            </p>
            <AsyncButton
              className="button"
              action={async () => {
                await engine!.signOut();
                notify("Você saiu da conta.");
                onClose();
              }}
            >
              <LogOut size={15} />
              Sair da conta
            </AsyncButton>
          </section>
        </>
      )}
    </Modal>
  );
}
