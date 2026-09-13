import { useEffect, useRef, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Modal } from "./shared";
import "./install.css";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const preferenceKey = "tormenta-install-recommendation";
function preference() {
  try {
    return localStorage.getItem(preferenceKey);
  } catch {
    return null;
  }
}
function remember(value: string) {
  try {
    localStorage.setItem(preferenceKey, value);
  } catch {
    /* Session state still works. */
  }
}
function standalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useAppInstall(notify: (message: string) => void) {
  const pending = useRef<InstallEvent | null>(null);
  const busyRef = useRef(false);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const [installed, setInstalled] = useState(
    () => standalone() || preference() === "installed",
  );
  const [dismissed, setDismissed] = useState(() => preference() !== null);
  const [error, setError] = useState("");
  const dismiss = () => {
    setDismissed(true);
    remember("dismissed");
  };

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      if (standalone()) return;
      pending.current = event as InstallEvent;
      setAvailable(true);
      setRequested(false);
      if (preference() === "installed") remember("dismissed");
      // A fresh offer also allows reinstalling after an uninstall.
      setInstalled(false);
    };
    const markInstalled = () => {
      pending.current = null;
      setAvailable(false);
      setInstalled(true);
      setDismissed(true);
      remember("installed");
    };
    const onInstalled = () => {
      markInstalled();
      notify(
        "Tormenta Wiki instalado. Abra pelo ícone do app no seu dispositivo.",
      );
    };
    const display = window.matchMedia("(display-mode: standalone)");
    const onDisplay = () => {
      if (standalone()) markInstalled();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    display.addEventListener("change", onDisplay);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      display.removeEventListener("change", onDisplay);
    };
  }, [notify]);

  const install = async (showInstructions: () => void) => {
    if (busyRef.current || installed) return;
    const event = pending.current;
    if (!event) {
      showInstructions();
      return;
    }
    pending.current = null; // Each browser event can only be used once.
    busyRef.current = true;
    setBusy(true);
    setAvailable(false);
    setError("");
    try {
      // Keep this call before any await to preserve the user's click activation.
      await event.prompt();
      const choice = await event.userChoice;
      setRequested(choice.outcome === "accepted");
      setDismissed(true);
      // appinstalled is the source of truth for installation completion.
      if (preference() !== "installed") remember("dismissed");
      if (choice.outcome === "dismissed") {
        notify("Você pode instalar depois pelo menu Instalar app.");
      }
    } catch {
      setError(
        "Não foi possível abrir a instalação. Use o menu do navegador seguindo os passos abaixo.",
      );
      showInstructions();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return {
    available,
    busy,
    requested,
    installed,
    error,
    dismiss,
    install,
    recommend: !installed && !dismissed,
  };
}

type Installation = ReturnType<typeof useAppInstall>;

export function InstallRecommendation({
  installation,
  onInstall,
}: {
  installation: Installation;
  onInstall: () => void;
}) {
  if (!installation.recommend) return null;
  return (
    <section
      className="install-recommendation"
      aria-labelledby="install-recommendation-title"
    >
      <img src="/icon.svg" alt="" width="56" height="56" />
      <div className="install-recommendation-copy">
        <h2 id="install-recommendation-title">Leve Tormenta Wiki com você</h2>
        <p>
          Adicione o ícone ao seu dispositivo e abra sua aventura como um app.
        </p>
      </div>
      <div className="install-recommendation-actions">
        <button
          className="button primary"
          disabled={installation.busy}
          onClick={onInstall}
        >
          <Download size={17} />
          {installation.busy ? "Aguarde…" : "Instalar app"}
        </button>
        <button className="button" onClick={installation.dismiss}>
          Agora não
        </button>
      </div>
    </section>
  );
}

export function InstallDialog({
  installation,
  onClose,
}: {
  installation: Installation;
  onClose: () => void;
}) {
  const appleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(navigator.userAgent);
  return (
    <Modal
      title="Instalar Tormenta Wiki"
      subtitle="Sua aventura a um toque"
      onClose={onClose}
      className="install-dialog"
      footer={
        <button className="button" onClick={onClose}>
          Entendi
        </button>
      }
    >
      <div className="install-intro">
        <img src="/icon.svg" alt="" width="72" height="72" />
        <p>
          Tenha um ícone próprio para abrir sua ficha, poderes, magias e o livro
          de referência.
        </p>
      </div>
      {installation.installed ? (
        <p role="status">Tormenta Wiki já está instalado neste dispositivo.</p>
      ) : (
        <>
          {installation.error && (
            <p className="notice" role="alert">
              {installation.error}
            </p>
          )}
          {installation.requested ? (
            <p role="status">
              Instalação solicitada. Aguarde o navegador concluir para abrir
              pelo ícone do app.
            </p>
          ) : installation.available || installation.busy ? (
            <>
              <p>
                Confirme a instalação na janela do navegador para adicionar o
                app ao dispositivo.
              </p>
              <button
                className="button primary"
                disabled={installation.busy}
                onClick={() => void installation.install(() => {})}
              >
                <Download size={18} />
                {installation.busy ? "Aguarde…" : "Instalar agora"}
              </button>
            </>
          ) : appleMobile ? (
            <>
              <h3>
                <Smartphone size={19} /> No iPhone ou iPad
              </h3>
              <ol>
                <li>
                  Abra este endereço no <strong>Safari</strong>.
                </li>
                <li>
                  Toque em <strong>Compartilhar</strong>{" "}
                  <Share size={16} aria-label="ícone de compartilhar" /> no menu
                  do navegador.
                </li>
                <li>
                  Escolha <strong>Adicionar à Tela de Início</strong>.
                </li>
                <li>
                  Se aparecer, mantenha <strong>Abrir como App</strong> ativado
                  e toque em <strong>Adicionar</strong>.
                </li>
              </ol>
            </>
          ) : android ? (
            <>
              <h3>
                <Smartphone size={19} /> No Android
              </h3>
              <ol>
                <li>
                  Abra este endereço no <strong>Chrome</strong>.
                </li>
                <li>
                  Toque no menu de <strong>três pontos</strong> do navegador.
                </li>
                <li>
                  Escolha <strong>Instalar aplicativo</strong> ou{" "}
                  <strong>Adicionar à tela inicial</strong> e confirme.
                </li>
              </ol>
            </>
          ) : (
            <>
              <h3>
                <Download size={19} /> No computador
              </h3>
              <p>
                No Chrome ou Edge, procure a opção de instalar este site na
                barra de endereços ou no menu do navegador. No Safari do Mac,
                use <strong>Arquivo → Adicionar ao Dock</strong>, quando
                disponível.
              </p>
              <p>
                Se estiver em um navegador dentro de outro aplicativo, abra o
                endereço no navegador do dispositivo para instalar.
              </p>
            </>
          )}
          <p className="install-note">
            A confirmação final é feita pelo navegador. Depois de carregar todo
            o conteúdo e aparecer o aviso de uso offline, você também poderá
            consultar sem internet.
          </p>
        </>
      )}
    </Modal>
  );
}
