import { useState, type FormEvent } from "react";
import { login } from "../lib/api";
import { APP_VERSION } from "../lib/version";
import type { AuthUser } from "../types/auth";
import "./LoginPage.css";

type LoginPageProps = {
  onAuthenticated: (user: AuthUser) => void;
};

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError(null);

    if (!identifier.trim() || !password) {
      setError("Informe e-mail/usuário e senha.");
      return;
    }

    setIsSubmitting(true);

    try {
      const user = await login({
        email: identifier.trim(),
        password,
      });
      onAuthenticated(user);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login">
      <aside className="login__brand" aria-labelledby="vetcare-title">
        <div className="brand">
          <span className="brand__logo" aria-hidden="true">
            V
          </span>
          <h1 className="brand__title" id="vetcare-title">
            VetCare
          </h1>
          <p className="brand__tagline">
            Cuidado inteligente para quem
            <br />
            faz parte da sua família.
          </p>
          <p className="brand__support">
            Gestão veterinária simples, segura e acolhedora.
          </p>
        </div>
      </aside>

      <main className="login__main">
        <section className="login__panel" aria-labelledby="login-title">
          <header className="login__header">
            <h2 className="login__title" id="login-title">
              Bem-vindo(a) de volta!
            </h2>
            <p className="login__subtitle">Entre na sua conta para continuar.</p>
          </header>

          <form
            className="login__form"
            noValidate
            aria-busy={isSubmitting}
            onSubmit={handleSubmit}
          >
            {error ? (
              <p className="login__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="field">
              <label className="field__label" htmlFor="login-identifier">
                E-mail ou usuário
              </label>
              <input
                className="field__input"
                id="login-identifier"
                name="identifier"
                type="text"
                placeholder="seu@email.com"
                autoComplete="username"
                spellCheck={false}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="login-password">
                Senha
              </label>
              <input
                className="field__input"
                id="login-password"
                name="password"
                type="password"
                placeholder="Digite sua senha"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <div className="field__action">
                <a className="forgot-link" href="#recuperar-senha">
                  Esqueci minha senha
                </a>
              </div>
            </div>

            <button
              className="submit-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Entrando..." : "Entrar"}
            </button>

            <p className="access-note">
              Acesso restrito a usuários autorizados.
            </p>
          </form>
        </section>

        <footer className="login__footer">
          <p>
            VetCare v{APP_VERSION}{" "}
            <span className="login__footer-separator" aria-hidden="true">
              •
            </span>{" "}
            Segurança e cuidado em um só lugar
          </p>
        </footer>
      </main>
    </div>
  );
}
