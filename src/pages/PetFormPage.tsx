import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createAnimal, fetchAnimal, fetchTutors, updateAnimal } from "../lib/api";
import { Link, navigate, setFlash } from "../lib/navigation";
import type { AuthUser } from "../types/auth";
import type { AnimalSex, Tutor } from "../types/registry";
import "./UsersPage.css";

type PetFormPageProps = {
  user: AuthUser;
  mode: "create" | "edit";
  animalId?: string;
};

type FormErrors = Record<string, string>;

const SEX_OPTIONS: { value: AnimalSex; label: string }[] = [
  { value: "male", label: "Macho" },
  { value: "female", label: "Fêmea" },
  { value: "unknown", label: "Não informado" },
];

export default function PetFormPage({
  user,
  mode,
  animalId,
}: PetFormPageProps) {
  const isEdit = mode === "edit";
  const canWrite = user.permissions.includes("animals.write");

  const [tutorId, setTutorId] = useState("");
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<AnimalSex>("unknown");
  const [birthDate, setBirthDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!canWrite) {
      setIsLoadingData(false);
      return;
    }

    if (isEdit && !animalId) {
      setLoadError("Pet não informado.");
      setIsLoadingData(false);
      return;
    }

    let isActiveRequest = true;
    setIsLoadingData(true);
    setLoadError(null);

    const animalRequest =
      isEdit && animalId ? fetchAnimal(animalId) : Promise.resolve(null);

    Promise.all([fetchTutors(), animalRequest])
      .then(([tutorData, animal]) => {
        if (!isActiveRequest) {
          return;
        }

        setTutors(tutorData);

        if (animal) {
          setTutorId(animal.tutorId);
          setName(animal.name);
          setSpecies(animal.species);
          setBreed(animal.breed ?? "");
          setSex(animal.sex);
          setBirthDate(animal.birthDate ?? "");
          setNotes(animal.notes ?? "");
          setIsActive(animal.isActive);
        }
      })
      .catch((error) => {
        if (isActiveRequest) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o pet.",
          );
        }
      })
      .finally(() => {
        if (isActiveRequest) {
          setIsLoadingData(false);
        }
      });

    return () => {
      isActiveRequest = false;
    };
  }, [canWrite, isEdit, animalId]);

  function clearError(field: string) {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || isLoadingData || loadError) {
      return;
    }

    const nextErrors: FormErrors = {};
    const normalizedName = name.trim();
    const normalizedSpecies = species.trim();

    if (!tutorId) {
      nextErrors.tutorId = "Selecione o tutor do pet.";
    }

    if (normalizedName.length < 1 || normalizedName.length > 120) {
      nextErrors.name = "Informe um nome entre 1 e 120 caracteres.";
    }

    if (normalizedSpecies.length < 1 || normalizedSpecies.length > 80) {
      nextErrors.species = "Informe a espécie do pet.";
    }

    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      nextErrors.birthDate = "Informe uma data válida.";
    }

    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const input = {
        tutorId,
        name: normalizedName,
        species: normalizedSpecies,
        breed: breed.trim() || null,
        sex,
        birthDate: birthDate || null,
        notes: notes.trim() || null,
        isActive,
      };

      if (isEdit && animalId) {
        await updateAnimal(animalId, input);
        setFlash("Pet atualizado com sucesso.");
      } else {
        await createAnimal(input);
        setFlash("Pet criado com sucesso.");
      }

      navigate("/pets");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "tutor_not_found") {
          setErrors({ tutorId: error.message });
        } else if (
          error.code === "invalid_sex" ||
          error.code === "invalid_birth_date"
        ) {
          setErrors({
            [error.code === "invalid_sex" ? "sex" : "birthDate"]:
              error.message,
          });
        } else {
          setSubmitError(error.message);
        }
      } else {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o pet.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canWrite) {
    return (
      <div className="user-form-page">
        <div className="users-error" role="alert">
          Você não tem permissão para gerenciar pets.
        </div>
      </div>
    );
  }

  if (isLoadingData) {
    return (
      <div className="user-form-page">
        <Link className="back-link" to="/pets">
          ← Voltar para pets
        </Link>
        <section className="user-form-card">
          <div className="users-state" role="status">
            <strong>Carregando pet...</strong>
          </div>
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="user-form-page">
        <Link className="back-link" to="/pets">
          ← Voltar para pets
        </Link>
        <div className="users-error" role="alert">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="user-form-page">
      <Link className="back-link" to="/pets">
        ← Voltar para pets
      </Link>

      <section className="user-form-card" aria-labelledby="pet-form-title">
        <header className="user-form-card__header">
          <h2 id="pet-form-title">
            {isEdit ? "Editar pet" : "Dados do pet"}
          </h2>
          <p>
            {isEdit
              ? "Atualize os dados do animal, o tutor e a situação."
              : "Cadastre o animal e vincule-o a um tutor."}
          </p>
        </header>

        {tutors.length === 0 ? (
          <div className="form-alert" role="alert">
            Nenhum tutor cadastrado. Cadastre um tutor antes de criar um pet.{" "}
            <Link className="table-link" to="/tutores/novo">
              Cadastrar tutor
            </Link>
          </div>
        ) : null}

        <form className="user-form" noValidate onSubmit={handleSubmit}>
          {submitError ? (
            <div className="form-alert" role="alert">
              {submitError}
            </div>
          ) : null}

          <div className="form-field form-field--full">
            <label htmlFor="pet-tutor">Tutor responsável</label>
            <select
              id="pet-tutor"
              value={tutorId}
              aria-invalid={Boolean(errors.tutorId)}
              onChange={(event) => {
                setTutorId(event.target.value);
                clearError("tutorId");
              }}
            >
              <option value="">Selecione um tutor</option>
              {tutors.map((tutor) => (
                <option value={tutor.id} key={tutor.id}>
                  {tutor.name}
                  {tutor.isActive ? "" : " (inativo)"}
                </option>
              ))}
            </select>
            {errors.tutorId ? (
              <p className="form-error" role="alert">
                {errors.tutorId}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="pet-name">Nome</label>
            <input
              id="pet-name"
              type="text"
              placeholder="Ex.: Thor"
              value={name}
              aria-invalid={Boolean(errors.name)}
              onChange={(event) => {
                setName(event.target.value);
                clearError("name");
              }}
            />
            {errors.name ? (
              <p className="form-error" role="alert">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="pet-species">Espécie</label>
            <input
              id="pet-species"
              type="text"
              placeholder="Ex.: Cão, Gato"
              value={species}
              aria-invalid={Boolean(errors.species)}
              onChange={(event) => {
                setSpecies(event.target.value);
                clearError("species");
              }}
            />
            {errors.species ? (
              <p className="form-error" role="alert">
                {errors.species}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="pet-breed">Raça</label>
            <input
              id="pet-breed"
              type="text"
              placeholder="Ex.: SRD"
              value={breed}
              onChange={(event) => setBreed(event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="pet-sex">Sexo</label>
            <select
              id="pet-sex"
              value={sex}
              aria-invalid={Boolean(errors.sex)}
              onChange={(event) => {
                setSex(event.target.value as AnimalSex);
                clearError("sex");
              }}
            >
              {SEX_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.sex ? (
              <p className="form-error" role="alert">
                {errors.sex}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="pet-birth-date">Data de nascimento</label>
            <input
              id="pet-birth-date"
              type="date"
              value={birthDate}
              aria-invalid={Boolean(errors.birthDate)}
              onChange={(event) => {
                setBirthDate(event.target.value);
                clearError("birthDate");
              }}
            />
            {errors.birthDate ? (
              <p className="form-error" role="alert">
                {errors.birthDate}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="pet-status">Situação</label>
            <select
              id="pet-status"
              value={isActive ? "active" : "inactive"}
              onChange={(event) => setIsActive(event.target.value === "active")}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>

          <div className="form-field form-field--full">
            <label htmlFor="pet-notes">Observações</label>
            <textarea
              id="pet-notes"
              rows={3}
              placeholder="Alergias, comportamento, cuidados especiais..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div className="form-actions">
            <Link className="button button--ghost" to="/pets">
              Cancelar
            </Link>
            <button
              className="button button--primary"
              type="submit"
              disabled={isSubmitting || tutors.length === 0}
            >
              {isSubmitting
                ? isEdit
                  ? "Salvando..."
                  : "Criando..."
                : isEdit
                  ? "Salvar alterações"
                  : "Criar pet"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
