import { useEffect, useRef, useState, type ReactNode } from "react";
import { getFirstName, getInitials } from "../lib/format";
import { Link, usePathname } from "../lib/navigation";
import type { AuthUser } from "../types/auth";
import "./AppShell.css";

type AppShellProps = {
  user: AuthUser;
  title: string;
  activeNav: "inicio" | "tutores" | "pets" | "usuarios";
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
  {
    key: "tutores",
    label: "Tutores",
    icon: "T",
    to: "/tutores",
    permission: "tutors.read",
  },
  {
    key: "pets",
    label: "Pets",
    icon: "P",
    to: "/pets",
    permission: "animals.read",
  },
  {
    key: "usuarios",
    label: "Usuários",
    icon: "U",
    to: "/usuarios",
    permission: "users.read",
  },
];

function ProfileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 16c.7-2.5 2.7-4 5.5-4s4.8 1.5 5.5 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IncidentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6.75v3.75m0 2.5v.25"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path
        d="M5.25 8.25a4.75 4.75 0 0 1 9.5 0c0 2.1.6 3.35 1.25 4.05H4c.65-.7 1.25-1.95 1.25-4.05Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8.25 14.5a1.9 1.9 0 0 0 3.5 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path
        d="M8 4.5H5.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H8m4-3 3-2.5L12 7.5M8 10h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AppShell({
  user,
  title,
  activeNav,
  isLoggingOut,
  onLogout,
  children,
}: AppShellProps) {
  const [isSubmittingLogout, setIsSubmittingLogout] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isLeaving = isLoggingOut || isSubmittingLogout;
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || user.permissions.includes(item.permission),
  );
  const firstName = getFirstName(user.name);
  const roleLabel =
    user.roles.map((role) => role.name).join(" • ") || "Usuário";
  const initials = getInitials(user.name);
  const primaryRole = user.roles[0]?.name ?? "Usuário";
  const menuTitle =
    firstName === primaryRole ? user.name : `${firstName} - ${primaryRole}`;

  useEffect(() => {
    setIsUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }

      setIsUserMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }

      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );

      if (items.length === 0) {
        return;
      }

      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      if (event.key === "Home") {
        items[0].focus();
        return;
      }

      if (event.key === "End") {
        items[items.length - 1].focus();
        return;
      }

      if (event.key === "ArrowDown") {
        const nextIndex =
          currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
        items[nextIndex].focus();
        return;
      }

      const previousIndex =
        currentIndex < 0
          ? items.length - 1
          : (currentIndex - 1 + items.length) % items.length;
      items[previousIndex].focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUserMenuOpen]);

  function closeUserMenu(restoreFocus = false) {
    setIsUserMenuOpen(false);

    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

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

  function handleMenuLogout() {
    closeUserMenu();
    void handleLogout();
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
            <button
              className="topbar__user-trigger"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
              aria-controls="user-menu"
              ref={triggerRef}
              onClick={() => setIsUserMenuOpen((isOpen) => !isOpen)}
            >
              <span className="topbar__identity">
                <strong title={user.name}>{firstName}</strong>
                <span>{roleLabel}</span>
              </span>
              <span className="topbar__avatar" aria-hidden="true">
                {initials}
              </span>
            </button>

            {isUserMenuOpen ? (
              <div
                className="user-menu"
                id="user-menu"
                role="menu"
                aria-label="Menu do usuário"
                ref={menuRef}
              >
                <div className="user-menu__header">
                  <span className="user-menu__avatar" aria-hidden="true">
                    {initials}
                  </span>
                  <span className="user-menu__identity">
                    <strong>{menuTitle}</strong>
                    <span>{user.email}</span>
                  </span>
                </div>

                <div className="user-menu__list">
                  <button
                    className="user-menu__item"
                    type="button"
                    role="menuitem"
                    onClick={() => closeUserMenu(true)}
                  >
                    <span className="user-menu__icon" aria-hidden="true">
                      <ProfileIcon />
                    </span>
                    <span>Meu Perfil</span>
                  </button>

                  <button
                    className="user-menu__item"
                    type="button"
                    role="menuitem"
                    onClick={() => closeUserMenu(true)}
                  >
                    <span className="user-menu__icon" aria-hidden="true">
                      <IncidentIcon />
                    </span>
                    <span>Abrir Incidente</span>
                  </button>

                  <button
                    className="user-menu__item"
                    type="button"
                    role="menuitem"
                    onClick={() => closeUserMenu(true)}
                  >
                    <span className="user-menu__icon" aria-hidden="true">
                      <BellIcon />
                    </span>
                    <span>Central Notificações</span>
                  </button>
                </div>

                <div className="user-menu__footer">
                  <button
                    className="user-menu__item user-menu__item--danger"
                    type="button"
                    role="menuitem"
                    onClick={handleMenuLogout}
                  >
                    <span
                      className="user-menu__icon user-menu__icon--danger"
                      aria-hidden="true"
                    >
                      <LogoutIcon />
                    </span>
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <main className="home__main">{children}</main>
      </div>
    </div>
  );
}
