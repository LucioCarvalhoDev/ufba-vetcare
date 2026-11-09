import { useEffect, useState } from "react";
import { PencilIcon, SearchIcon } from "../components/icons";
import { fetchAnimals, fetchTutors } from "../lib/api";
import { formatDate, formatDateOnly, getInitials } from "../lib/format";
import { Link } from "../lib/navigation";
import { useFlashMessage } from "../lib/useFlashMessage";
import type { AuthUser } from "../types/auth";
import type { Animal, RegistryStatusFilter, Tutor } from "../types/registry";
import "./UsersPage.css";

type PetsListPageProps = {
  user: AuthUser;
};

const SEX_LABELS = {
  male: "Macho",
  female: "Fêmea",
  unknown: "Não informado",
};

export default function PetsListPage({ user }: PetsListPageProps) {
  const canRead = user.permissions.includes("animals.read");
  const canWrite = user.permissions.includes("animals.write");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tutorId, setTutorId] = useState("");
  const [status, setStatus] = useState<RegistryStatusFilter>("");
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [tutorsError, setTutorsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [flash, setFlash] = useFlashMessage();

  const hasFilters =
    search.trim().length > 0 || tutorId.length > 0 || status.length > 0;
  const countLabel = isLoading
    ? "Carregando..."
    : `${animals.length} ${animals.length === 1 ? "pet" : "pets"}`;

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
    setTutorsError(null);

    fetchTutors()
      .then((data) => {
        if (isActive) {
          setTutors(data);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setTutors([]);
          setTutorsError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os tutores.",
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

    fetchAnimals({ q: debouncedSearch, tutorId, status })
      .then((data) => {
        if (isActive) {
          setAnimals(data);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os pets.",
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
  }, [canRead, debouncedSearch, tutorId, status, reloadToken]);

  function clearFilters() {
    setSearch("");
    setTutorId("");
    setStatus("");
  }

  if (!canRead) {
    return (
      <div className="users-page">
        <div className="users-error" role="alert">
          Você não tem permissão para consultar os pets.
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
            Consulte os animais atendidos e seus tutores.
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

      <section className="users-filters" aria-label="Filtros de pets">
        <label className="filter-field filter-field--search">
          <span className="filter-field__label">Buscar</span>
          <span className="filter-search">
            <SearchIcon />
            <input
              className="filter-input"
              type="search"
              placeholder="Nome ou raça"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Tutor</span>
          <select
            className="filter-select"
            value={tutorId}
            onChange={(event) => setTutorId(event.target.value)}
          >
            <option value="">Todos os tutores</option>
            {tutors.map((tutor) => (
              <option value={tutor.id} key={tutor.id}>
                {tutor.name}
                {tutor.isActive ? "" : " (inativo)"}
              </option>
            ))}
          </select>
          {tutorsError ? (
            <span className="form-error" role="alert">
              {tutorsError}
            </span>
          ) : null}
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
          <h2>Pets</h2>
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
            <strong>Carregando pets...</strong>
          </div>
        ) : animals.length === 0 ? (
          <div className="users-state">
            <strong>Nenhum pet encontrado.</strong>
            <p>Ajuste os filtros ou cadastre o primeiro pet.</p>
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
                  <th scope="col">Pet</th>
                  <th scope="col">Tutor</th>
                  <th scope="col">Sexo</th>
                  <th scope="col">Nascimento</th>
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
                {animals.map((animal) => (
                  <tr key={animal.id}>
                    <td>
                      <div className="user-cell">
                        <span className="user-avatar" aria-hidden="true">
                          {getInitials(animal.name)}
                        </span>
                        <span className="user-cell__text">
                          <strong>{animal.name}</strong>
                          <span>
                            {animal.species}
                            {animal.breed ? ` • ${animal.breed}` : ""}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>{animal.tutorName}</td>
                    <td>
                      <span className="role-badge">
                        {SEX_LABELS[animal.sex] ?? animal.sex}
                      </span>
                    </td>
                    <td>{formatDateOnly(animal.birthDate)}</td>
                    <td>
                      <span
                        className={`status-badge status-badge--${animal.isActive ? "active" : "inactive"}`}
                      >
                        <span
                          className="status-badge__dot"
                          aria-hidden="true"
                        />
                        {animal.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>{formatDate(animal.createdAt)}</td>
                    {canWrite ? (
                      <td className="users-table__actions">
                        <Link
                          className="user-edit-button"
                          to={`/pets/${animal.id}/editar`}
                          aria-label={`Editar ${animal.name}`}
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
        <Link className="users-fab" to="/pets/novo">
          <span className="users-fab__icon" aria-hidden="true">
            +
          </span>
          <span>Novo pet</span>
        </Link>
      ) : null}
    </div>
  );
}
