import { useState, type ReactNode } from "react";
import { getFirstName, getInitials } from "../lib/format";
import { Link } from "../lib/navigation";
import type { AuthUser } from "../types/auth";
import "./AppShell.css";

type AppShellProps = {
  user: AuthUser;
  title: string;
  activeNav: "inicio" | "usuarios";
  isLoggingOut: boolean;
  onLogout: () => Promise<void>;
  children: ReactNode;
};

type NavItem = {
  key: string;
  label: string;
  icon: string;
  to?: string;
  permission?: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: "inicio", label: "Início", icon: "I", to: "/" },
  { key: "agenda", label: "Minha Agenda", icon: "M" },
  { key: "historico", label: "Histórico", icon: "H" },
  { key: "tutores", label: "Tutores", icon: "T" },
  { key: "pets", label: "Pets", icon: "P" },
  {
    key: "usuarios",
    label: "Usuários",
    icon: "U",
    to: "/usuarios",
    permission: "users.read",
  },
];

export default function AppShell({
  user,
  title,
  activeNav,
  isLoggingOut,
  onLogout,
  children,
}: AppShellProps) {
  const [isSubmittingLogout, setIsSubmittingLogout] = useState(false);
  const isLeaving = isLoggingOut || isSubmittingLogout;
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || user.permissions.includes(item.permission),
  );
  const firstName = getFirstName(user.name);
  const roleLabel =
    user.roles.map((role) => role.name).join(" • ") || "Usuário";
  const initials = getInitials(user.name);

  async function handleLogout() {
    if (isLeaving) {
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
    <div className="home">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden="true">
            V
          </span>
          <span className="sidebar__brand-name">VetCare</span>
        </div>

        <div className="sidebar__menu-row">
          <span className="sidebar__menu-label">MENU</span>
          <span className="sidebar__collapse" aria-hidden="true">
            ←
          </span>
        </div>

        <nav className="sidebar__nav" aria-label="Navegação principal">
          {visibleItems.map((item) => {
            const isActive = activeNav === item.key;
            const itemClassName = `sidebar__nav-item${isActive ? " is-active" : ""}${item.to ? "" : " is-placeholder"}`;
            const iconClassName = `sidebar__nav-icon${isActive ? " is-active" : ""}`;
            const content = (
              <>
                <span className={iconClassName} aria-hidden="true">
                  {item.icon}
                </span>
                <span className="sidebar__nav-label">{item.label}</span>
              </>
            );

            if (item.to) {
              return (
                <Link
                  className={itemClassName}
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  key={item.key}
                >
                  {content}
                </Link>
              );
            }

            return (
              <span
                className={itemClassName}
                aria-disabled="true"
                title="Disponível em uma próxima etapa"
                key={item.key}
              >
                {content}
              </span>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <span>VetCare v1.0</span>
          <button
            className="sidebar__logout"
            type="button"
            disabled={isLeaving}
            onClick={handleLogout}
          >
            {isLeaving ? "Saindo..." : "Sair"}
          </button>
        </div>
      </aside>

      <div className="home__content">
        <header className="topbar">
          <h1 className="topbar__title">{title}</h1>

          <div className="topbar__account">
            <div className="topbar__identity">
              <strong title={user.name}>{firstName}</strong>
              <span>{roleLabel}</span>
            </div>
            <span className="topbar__avatar" aria-hidden="true">
              {initials}
            </span>
          </div>
        </header>

        <main className="home__main">{children}</main>
      </div>
    </div>
  );
}
