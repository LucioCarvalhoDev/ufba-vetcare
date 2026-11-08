import "./LoginPage.css";

export default function LoginPage() {
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
            onSubmit={(event) => event.preventDefault()}
          >
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
              />
              <div className="field__action">
                <a className="forgot-link" href="#recuperar-senha">
                  Esqueci minha senha
                </a>
              </div>
            </div>

            <button className="submit-button" type="submit">
              Entrar
            </button>

            <p className="access-note">
              Acesso restrito a usuários autorizados.
            </p>
          </form>
        </section>

        <footer className="login__footer">
          <p>
            VetCare v1.0{" "}
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
