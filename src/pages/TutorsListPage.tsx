import { useEffect, useState } from "react";
import { PencilIcon, SearchIcon } from "../components/icons";
import { fetchTutors } from "../lib/api";
import { formatDate, getInitials } from "../lib/format";
import { Link } from "../lib/navigation";
import { useFlashMessage } from "../lib/useFlashMessage";
import type { AuthUser } from "../types/auth";
import type { RegistryStatusFilter, Tutor } from "../types/registry";
import "./UsersPage.css";

type TutorsListPageProps = {
  user: AuthUser;
};

export default function TutorsListPage({ user }: TutorsListPageProps) {
  const canRead = user.permissions.includes("tutors.read");
  const canWrite = user.permissions.includes("tutors.write");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<RegistryStatusFilter>("");
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [flash, setFlash] = useFlashMessage();

  const hasFilters =
    search.trim().length > 0 || status.length > 0;
  const countLabel = isLoading
    ? "Carregando..."
    : `${tutors.length} ${tutors.length === 1 ? "tutor" : "tutores"}`;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError(null);

    fetchTutors({ q: debouncedSearch, status })
      .then((data) => {
        if (isActive) {
          setTutors(data);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os tutores.",
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
  }, [canRead, debouncedSearch, status, reloadToken]);

  function clearFilters() {
    setSearch("");
    setStatus("");
  }

  if (!canRead) {
    return (
      <div className="users-page">
        <div className="users-error" role="alert">
          Você não tem permissão para consultar tutores.
        </div>
      </div>
    );
  }

  return (
    <div className="users-page">
      <header className="users-page__header">
        <div>
          <p className="users-page__eyebrow">Cadastros</p>
          <p className="users-page__description">
            Consulte os tutores responsáveis pelos animais da clínica.
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

      <section
        className="users-filters users-filters--compact"
        aria-label="Filtros de tutores"
      >
        <label className="filter-field filter-field--search">
          <span className="filter-field__label">Buscar</span>
          <span className="filter-search">
            <SearchIcon />
            <input
              className="filter-input"
              type="search"
              placeholder="Nome, CPF, e-mail ou telefone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Situação</span>
          <select
            className="filter-select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as RegistryStatusFilter)
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
          <h2>Tutores</h2>
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
            <strong>Carregando tutores...</strong>
          </div>
        ) : tutors.length === 0 ? (
          <div className="users-state">
            <strong>Nenhum tutor encontrado.</strong>
            <p>Ajuste os filtros ou cadastre o primeiro tutor.</p>
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
                  <th scope="col">Tutor</th>
                  <th scope="col">Contato</th>
                  <th scope="col">Pets</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Criado em</th>
                  {canWrite ? (
                    <th scope="col" className="users-table__actions">
                      Ações
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {tutors.map((tutor) => (
                  <tr key={tutor.id}>
                    <td>
                      <div className="user-cell">
                        <span className="user-avatar" aria-hidden="true">
                          {getInitials(tutor.name)}
                        </span>
                        <span className="user-cell__text">
                          <strong>{tutor.name}</strong>
                          <span>{tutor.cpf ?? "CPF não informado"}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="user-cell__text">
                        <strong>{tutor.email ?? "E-mail não informado"}</strong>
                        <span>{tutor.phone ?? "Telefone não informado"}</span>
                      </span>
                    </td>
                    <td>{tutor.animalCount}</td>
                    <td>
                      <span
                        className={`status-badge status-badge--${tutor.isActive ? "active" : "inactive"}`}
                      >
                        <span
                          className="status-badge__dot"
                          aria-hidden="true"
                        />
                        {tutor.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>{formatDate(tutor.createdAt)}</td>
                    {canWrite ? (
                      <td className="users-table__actions">
                        <Link
                          className="user-edit-button"
                          to={`/tutores/${tutor.id}/editar`}
                          aria-label={`Editar ${tutor.name}`}
                        >
                          <PencilIcon />
                          <span>Editar</span>
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canWrite ? (
        <Link className="users-fab" to="/tutores/novo">
          <span className="users-fab__icon" aria-hidden="true">
            +
          </span>
          <span>Novo tutor</span>
        </Link>
      ) : null}
    </div>
  );
}
