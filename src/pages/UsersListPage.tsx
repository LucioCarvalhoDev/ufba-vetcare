import { useEffect, useRef, useState } from "react";
import { fetchRoles, fetchUsers } from "../lib/api";
import { getInitials, formatDate } from "../lib/format";
import { consumeFlash, Link } from "../lib/navigation";
import type { AuthUser, Role } from "../types/auth";
import type { ManagedUser, UserStatusFilter } from "../types/users";
import "./UsersPage.css";

type UsersListPageProps = {
  user: AuthUser;
};

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <circle cx="8.5" cy="8.5" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m12.5 12.5 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function UsersListPage({ user }: UsersListPageProps) {
  const canRead = user.permissions.includes("users.read");
  const canWrite = user.permissions.includes("users.write");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<UserStatusFilter>("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const hasConsumedFlash = useRef(false);

  const hasFilters =
    search.trim().length > 0 || role.length > 0 || status.length > 0;
  const countLabel = isLoading
    ? "Carregando..."
    : `${users.length} ${users.length === 1 ? "usuário" : "usuários"}`;

  useEffect(() => {
    if (hasConsumedFlash.current) {
      return;
    }

    hasConsumedFlash.current = true;
    setFlash(consumeFlash());
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!canRead) {
      return;
    }

    let isActive = true;
    setRolesError(null);

    fetchRoles()
      .then((data) => {
        if (isActive) {
          setRoles(data);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setRoles([]);
          setRolesError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os papéis.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, [canRead]);

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError(null);

    fetchUsers({ q: debouncedSearch, role, status })
      .then((data) => {
        if (isActive) {
          setUsers(data);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os usuários.",
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [canRead, debouncedSearch, role, status, reloadToken]);

  function clearFilters() {
    setSearch("");
    setRole("");
    setStatus("");
  }

  if (!canRead) {
    return (
      <div className="users-page">
        <header className="users-page__header">
          <div>
            <p className="users-page__eyebrow">Administração</p>
            <p className="users-page__description">
              Gerencie acessos, papéis e situação da equipe.
            </p>
          </div>
        </header>
        <div className="users-error" role="alert">
          Você não tem permissão para consultar usuários.
          <div>
            <Link className="back-link" to="/">
              ← Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="users-page">
      <header className="users-page__header">
        <div>
          <p className="users-page__eyebrow">Administração</p>
          <p className="users-page__description">
            Gerencie acessos, papéis e situação da equipe.
          </p>
        </div>
      </header>

      {flash ? (
        <div className="users-flash" role="status">
          <span>{flash}</span>
          <button
            className="users-flash__close"
            type="button"
            aria-label="Fechar mensagem"
            onClick={() => setFlash(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      <section className="users-filters" aria-label="Filtros de usuários">
        <label className="filter-field filter-field--search">
          <span className="filter-field__label">Buscar</span>
          <span className="filter-search">
            <SearchIcon />
            <input
              className="filter-input"
              type="search"
              placeholder="Nome ou e-mail"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Papel</span>
          <select
            className="filter-select"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">Todos os papéis</option>
            {roles.map((item) => (
              <option value={item.slug} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {rolesError ? (
            <span className="form-error" role="alert">
              {rolesError}
            </span>
          ) : null}
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Situação</span>
          <select
            className="filter-select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as UserStatusFilter)
            }
          >
            <option value="">Todas</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>

        <button
          className="filters-clear"
          type="button"
          disabled={!hasFilters}
          onClick={clearFilters}
        >
          Limpar
        </button>
      </section>

      <section className="users-card" aria-busy={isLoading}>
        <header className="users-card__header">
          <h2>Equipe</h2>
          <span className="users-count">{countLabel}</span>
        </header>

        {error ? (
          <div className="users-error" role="alert">
            {error}
            <div>
              <button
                className="users-error__retry"
                type="button"
                onClick={() => setReloadToken((current) => current + 1)}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="users-state" role="status">
            <strong>Carregando usuários...</strong>
          </div>
        ) : users.length === 0 ? (
          <div className="users-state">
            <strong>Nenhum usuário encontrado.</strong>
            <p>
              Ajuste os filtros ou cadastre um novo usuário para começar.
            </p>
            {hasFilters ? (
              <button
                className="button button--ghost users-state__action"
                type="button"
                onClick={clearFilters}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th scope="col">Usuário</th>
                  <th scope="col">Papel</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {users.map((managedUser) => (
                  <tr key={managedUser.id}>
                    <td>
                      <div className="user-cell">
                        <span className="user-avatar" aria-hidden="true">
                          {getInitials(managedUser.name)}
                        </span>
                        <span className="user-cell__text">
                          <strong>{managedUser.name}</strong>
                          <span>{managedUser.email}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="role-list">
                        {managedUser.roles.map((userRole) => (
                          <span className="role-badge" key={userRole.id}>
                            {userRole.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-badge status-badge--${managedUser.isActive ? "active" : "inactive"}`}
                      >
                        <span
                          className="status-badge__dot"
                          aria-hidden="true"
                        />
                        {managedUser.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>{formatDate(managedUser.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canWrite ? (
        <Link className="users-fab" to="/usuarios/novo">
          <span className="users-fab__icon" aria-hidden="true">
            +
          </span>
          <span>Novo usuário</span>
        </Link>
      ) : null}
    </div>
  );
}
