import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from "react";
import {
  loginWithGoogle,
  loginWithPassword,
  register,
  requestOtp,
  type Session,
  setToken,
  verifyOtp,
} from "./api";

// Google sign-in needs the OAuth client id the server verifies tokens against; without it the button
// is replaced by a hint. Vite exposes only VITE_-prefixed env (see .env.example / web README).
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

interface GoogleIdConfig {
  readonly client_id: string;
  readonly callback: (response: { readonly credential: string }) => void;
}
interface GoogleAccountsId {
  initialize(config: GoogleIdConfig): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let gisPromise: Promise<void> | null = null;
/** Load the Google Identity Services client script once, lazily. */
function loadGis(): Promise<void> {
  if (gisPromise) {
    return gisPromise;
  }
  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google Identity Services."));
    document.head.appendChild(script);
  });
  return gisPromise;
}

/** Render the official Google button and hand its ID token back through `onCredential`. */
function GoogleButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }
    let cancelled = false;
    void loadGis().then(() => {
      if (cancelled || !ref.current || !window.google) {
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large" });
    });
    return () => {
      cancelled = true;
    };
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <p style={styles.hint}>
        Google sign-in needs <code>VITE_GOOGLE_CLIENT_ID</code> set at build time.
      </p>
    );
  }
  return <div ref={ref} />;
}

type Mode = "signin" | "signup";
type Method = "password" | "otp" | "google";

/**
 * The login / signup screen (ADR-0019, web 6-ui). Wires all three sign-in methods — email +
 * password, phone OTP (two-step), and Google — plus firm registration. On success it stores the
 * bearer token and hands the session up so the app swaps to the workspace.
 */
export function Login({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [method, setMethod] = useState<Method>("password");
  const [firmName, setFirmName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function succeed(session: Session) {
    setToken(session.token);
    onAuthenticated(session);
  }

  /** Run an auth call with shared busy/error handling. */
  async function attempt(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const onSignUp = (event: FormEvent) => {
    event.preventDefault();
    if (!firmName.trim() || !name.trim()) {
      setError("Firm name and your name are required.");
      return;
    }
    if (!password && !phone.trim()) {
      setError("Set a password or a phone number to sign in with.");
      return;
    }
    void attempt(async () =>
      succeed(
        await register({
          firmName: firmName.trim(),
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          password: password || undefined,
        }),
      ),
    );
  };

  const onPasswordLogin = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => succeed(await loginWithPassword(email.trim(), password)));
  };

  const onRequestOtp = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      await requestOtp(phone.trim());
      setOtpSent(true);
      setInfo("If that number is registered, a code is on its way (dev: it's logged server-side).");
    });
  };

  const onVerifyOtp = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => succeed(await verifyOtp(phone.trim(), code.trim())));
  };

  const onGoogleCredential = (idToken: string) =>
    void attempt(async () => succeed(await loginWithGoogle(idToken)));

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <h1 style={styles.brand}>NowLez</h1>
        <p style={styles.tagline}>
          {mode === "signin" ? "Sign in to your firm" : "Create your firm"}
        </p>

        {mode === "signin" ? (
          <>
            <div style={styles.tabs}>
              {(["password", "otp", "google"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMethod(m);
                    setError(null);
                    setInfo(null);
                  }}
                  style={m === method ? styles.tabActive : styles.tab}
                >
                  {m === "password" ? "Password" : m === "otp" ? "Phone OTP" : "Google"}
                </button>
              ))}
            </div>

            {method === "password" ? (
              <form onSubmit={onPasswordLogin} style={styles.form}>
                <input
                  aria-label="Email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                />
                <input
                  aria-label="Password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                />
                <button type="submit" disabled={busy} style={styles.primary}>
                  {busy ? "…" : "Sign in"}
                </button>
              </form>
            ) : null}

            {method === "otp" ? (
              <form onSubmit={otpSent ? onVerifyOtp : onRequestOtp} style={styles.form}>
                <input
                  aria-label="Phone"
                  type="tel"
                  placeholder="Phone (e.g. 919812345678)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={styles.input}
                />
                {otpSent ? (
                  <input
                    aria-label="Code"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    style={styles.input}
                  />
                ) : null}
                <button type="submit" disabled={busy} style={styles.primary}>
                  {busy ? "…" : otpSent ? "Verify code" : "Send code"}
                </button>
                {otpSent ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setCode("");
                      setInfo(null);
                    }}
                    style={styles.link}
                  >
                    Use a different number
                  </button>
                ) : null}
              </form>
            ) : null}

            {method === "google" ? (
              <div style={styles.form}>
                <GoogleButton onCredential={onGoogleCredential} />
              </div>
            ) : null}
          </>
        ) : (
          <form onSubmit={onSignUp} style={styles.form}>
            <input
              aria-label="Firm name"
              placeholder="Firm name"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              style={styles.input}
            />
            <input
              aria-label="Your name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
            />
            <input
              aria-label="Email"
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
            <input
              aria-label="Password"
              type="password"
              placeholder="Password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />
            <input
              aria-label="Phone"
              type="tel"
              placeholder="Phone (optional, e.g. 919812345678)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={styles.input}
            />
            <button type="submit" disabled={busy} style={styles.primary}>
              {busy ? "…" : "Create firm"}
            </button>
          </form>
        )}

        {error ? <p style={styles.error}>{error}</p> : null}
        {info ? <p style={styles.info}>{info}</p> : null}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
            setOtpSent(false);
          }}
          style={styles.link}
        >
          {mode === "signin" ? "New to NowLez? Create your firm" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f5f7ff",
    fontFamily: "system-ui, sans-serif",
    color: "#1a1a1a",
  },
  card: {
    width: "320px",
    background: "#fff",
    border: "1px solid #e5e5e5",
    borderRadius: "8px",
    padding: "28px 24px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  brand: { fontSize: "24px", margin: "0 0 4px", textAlign: "center" },
  tagline: { color: "#777", fontSize: "14px", textAlign: "center", margin: "0 0 20px" },
  tabs: { display: "flex", gap: "4px", marginBottom: "16px" },
  tab: {
    flex: 1,
    padding: "6px 8px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    background: "#fff",
    cursor: "pointer",
    fontSize: "13px",
  },
  tabActive: {
    flex: 1,
    padding: "6px 8px",
    border: "1px solid #1a4ed8",
    borderRadius: "4px",
    background: "#f5f7ff",
    color: "#1a4ed8",
    cursor: "pointer",
    fontSize: "13px",
  },
  form: { display: "flex", flexDirection: "column", gap: "10px" },
  input: { padding: "8px 10px", border: "1px solid #ccc", borderRadius: "4px", fontSize: "14px" },
  primary: {
    padding: "9px 10px",
    border: "none",
    borderRadius: "4px",
    background: "#1a4ed8",
    color: "#fff",
    cursor: "pointer",
    fontSize: "14px",
  },
  link: {
    marginTop: "14px",
    background: "none",
    border: "none",
    padding: 0,
    color: "#1a4ed8",
    cursor: "pointer",
    font: "inherit",
    fontSize: "13px",
    textAlign: "center",
    width: "100%",
  },
  hint: { color: "#777", fontSize: "13px", margin: 0 },
  error: { color: "#b00020", fontSize: "13px", marginTop: "12px" },
  info: { color: "#1a7f37", fontSize: "13px", marginTop: "12px" },
};
