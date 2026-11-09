import { useState } from "react";
import type { AuthUser } from "../types/auth";
import "./DashboardPage.css";

type DashboardPageProps = {
  user: AuthUser;
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
};

export default function DashboardPage({
  user,
  isLoggingOut,
  onLogout,
}: DashboardPageProps) {
  const [isSubmittingLogout, setIsSubmittingLogout] = useState(false);
  const firstName = user.name.split(" ")[0] ?? user.name;
  const roleNames = user.roles.map((role) => role.name).join(", ");

  async function handleLogout() {
    if (isSubmittingLogout) {
      return;
    }

    setIsSubmittingLogout(true);

    try {
      await onLogout();
    } finally {
      setIsSubmittingLogout(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__brand">
          <span className="dashboard__logo" aria-hidden="true">
            V
          </span>
          <span className="dashboard__brand-name">VetCare</span>
        </div>

        <div className="dashboard__account">
          <div className="dashboard__identity">
            <strong>{user.name}</strong>
            <span>{roleNames}</span>
          </div>

          <button
            className="dashboard__logout"
            type="button"
            disabled={isLoggingOut || isSubmittingLogout}
            onClick={handleLogout}
          >
            {isLoggingOut || isSubmittingLogout ? "Saindo..." : "Sair"}
          </button>
        </div>
      </header>

      <main className="dashboard__main">
        <section
          className="dashboard__placeholder"
          aria-labelledby="dashboard-title"
        >
          <p className="dashboard__eyebrow">Área autenticada</p>
          <h1 className="dashboard__title" id="dashboard-title">
            Bem-vindo(a), {firstName}!
          </h1>
          <p className="dashboard__description">
            O dashboard do VetCare está pronto. Os módulos da clínica serão
            adicionados nas próximas etapas.
          </p>
        </section>
      </main>

      <footer className="dashboard__footer">
        <span>VetCare v1.0</span>
        <span aria-hidden="true">•</span>
        <span>Sessão autenticada com segurança</span>
      </footer>
    </div>
  );
}
