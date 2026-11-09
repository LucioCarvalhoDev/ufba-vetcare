import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createTutor, fetchTutor, updateTutor } from "../lib/api";
import { Link, navigate, setFlash } from "../lib/navigation";
import type { AuthUser } from "../types/auth";
import "./UsersPage.css";

type TutorFormPageProps = {
  user: AuthUser;
  mode: "create" | "edit";
  tutorId?: string;
};

type FormErrors = Record<string, string>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TutorFormPage({
  user,
  mode,
  tutorId,
}: TutorFormPageProps) {
  const isEdit = mode === "edit";
  const canWrite = user.permissions.includes("tutors.write");

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
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

    if (isEdit && !tutorId) {
      setLoadError("Tutor não informado.");
      setIsLoadingData(false);
      return;
    }

    let isActiveRequest = true;
    setIsLoadingData(true);
    setLoadError(null);

    const request = isEdit && tutorId ? fetchTutor(tutorId) : Promise.resolve(null);

    request
      .then((tutor) => {
        if (!isActiveRequest || !tutor) {
          return;
        }

        setName(tutor.name);
        setCpf(tutor.cpf ?? "");
        setEmail(tutor.email ?? "");
        setPhone(tutor.phone ?? "");
        setAddress(tutor.address ?? "");
        setNotes(tutor.notes ?? "");
        setIsActive(tutor.isActive);
      })
      .catch((error) => {
        if (isActiveRequest) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o tutor.",
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
  }, [canWrite, isEdit, tutorId]);

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
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 1 || normalizedName.length > 120) {
      nextErrors.name = "Informe um nome entre 1 e 120 caracteres.";
    }

    if (normalizedEmail && !EMAIL_PATTERN.test(normalizedEmail)) {
      nextErrors.email = "Informe um e-mail válido.";
    }

    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const input = {
        name: normalizedName,
        cpf: cpf.trim() || null,
        email: normalizedEmail || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        isActive,
      };

      if (isEdit && tutorId) {
        await updateTutor(tutorId, input);
        setFlash("Tutor atualizado com sucesso.");
      } else {
        await createTutor(input);
        setFlash("Tutor criado com sucesso.");
      }

      navigate("/tutores");
    } catch (error) {
      if (error instanceof ApiError && error.code === "cpf_in_use") {
        setErrors({ cpf: error.message });
      } else {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o tutor.",
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
          Você não tem permissão para gerenciar tutores.
        </div>
      </div>
    );
  }

  if (isLoadingData) {
    return (
      <div className="user-form-page">
        <Link className="back-link" to="/tutores">
          ← Voltar para tutores
        </Link>
        <section className="user-form-card">
          <div className="users-state" role="status">
            <strong>Carregando tutor...</strong>
          </div>
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="user-form-page">
        <Link className="back-link" to="/tutores">
          ← Voltar para tutores
        </Link>
        <div className="users-error" role="alert">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="user-form-page">
      <Link className="back-link" to="/tutores">
        ← Voltar para tutores
      </Link>

      <section className="user-form-card" aria-labelledby="tutor-form-title">
        <header className="user-form-card__header">
          <h2 id="tutor-form-title">
            {isEdit ? "Editar tutor" : "Dados do tutor"}
          </h2>
          <p>
            {isEdit
              ? "Atualize os dados de contato e a situação do tutor."
              : "Cadastre o tutor responsável pelo animal."}
          </p>
        </header>

        <form className="user-form" noValidate onSubmit={handleSubmit}>
          {submitError ? (
            <div className="form-alert" role="alert">
              {submitError}
            </div>
          ) : null}

          <div className="form-field">
            <label htmlFor="tutor-name">Nome completo</label>
            <input
              id="tutor-name"
              type="text"
              autoComplete="name"
              placeholder="Ex.: Mariana Souza"
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
            <label htmlFor="tutor-cpf">CPF</label>
            <input
              id="tutor-cpf"
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              aria-invalid={Boolean(errors.cpf)}
              onChange={(event) => {
                setCpf(event.target.value);
                clearError("cpf");
              }}
            />
            {errors.cpf ? (
              <p className="form-error" role="alert">
                {errors.cpf}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="tutor-email">E-mail</label>
            <input
              id="tutor-email"
              type="email"
              autoComplete="email"
              placeholder="tutor@email.com"
              value={email}
              aria-invalid={Boolean(errors.email)}
              onChange={(event) => {
                setEmail(event.target.value);
                clearError("email");
              }}
            />
            {errors.email ? (
              <p className="form-error" role="alert">
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="tutor-phone">Telefone</label>
            <input
              id="tutor-phone"
              type="tel"
              autoComplete="tel"
              placeholder="(71) 99999-0000"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>

          <div className="form-field form-field--full">
            <label htmlFor="tutor-address">Endereço</label>
            <input
              id="tutor-address"
              type="text"
              autoComplete="street-address"
              placeholder="Rua, número, bairro, cidade"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>

          <div className="form-field form-field--full">
            <label htmlFor="tutor-notes">Observações</label>
            <textarea
              id="tutor-notes"
              rows={3}
              placeholder="Preferências de contato, observações administrativas..."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div className="form-field form-field--full">
            <label htmlFor="tutor-status">Situação</label>
            <select
              id="tutor-status"
              value={isActive ? "active" : "inactive"}
              onChange={(event) => setIsActive(event.target.value === "active")}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>

          <div className="form-actions">
            <Link className="button button--ghost" to="/tutores">
              Cancelar
            </Link>
            <button
              className="button button--primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? isEdit
                  ? "Salvando..."
                  : "Criando..."
                : isEdit
                  ? "Salvar alterações"
                  : "Criar tutor"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
