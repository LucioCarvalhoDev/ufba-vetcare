import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  createManagedUser,
  fetchRoles,
  fetchUser,
  updateManagedUser,
} from "../lib/api";
import { Link, navigate, setFlash } from "../lib/navigation";
import type { AuthUser, Role } from "../types/auth";
import "./UsersPage.css";

type UserFormMode = "create" | "edit";

type UserFormPageProps = {
  user: AuthUser;
  mode: UserFormMode;
  userId?: string;
};

type FormErrors = Record<string, string>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function UserFormPage({
  user,
  mode,
  userId,
}: UserFormPageProps) {
  const isEdit = mode === "edit";
  const canWrite = user.permissions.includes("users.write");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [roleSlugs, setRoleSlugs] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
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

    if (isEdit && !userId) {
      setLoadError("Usuário não informado.");
      setIsLoadingData(false);
      return;
    }

    let isActiveRequest = true;
    setIsLoadingData(true);
    setLoadError(null);

    const userRequest =
      isEdit && userId ? fetchUser(userId) : Promise.resolve(null);

    Promise.all([fetchRoles(), userRequest])
      .then(([rolesData, managedUser]) => {
        if (!isActiveRequest) {
          return;
        }

        setRoles(rolesData);

        if (managedUser) {
          setName(managedUser.name);
          setEmail(managedUser.email);
          setRoleSlugs(managedUser.roles.map((role) => role.slug));
          setIsActive(managedUser.isActive);
          setPassword("");
          setConfirmPassword("");
        } else {
          setName("");
          setEmail("");
          setRoleSlugs([]);
          setIsActive(true);
          setPassword("");
          setConfirmPassword("");
        }
      })
      .catch((error) => {
        if (isActiveRequest) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os dados do usuário.",
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
  }, [canWrite, isEdit, userId]);

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

  function toggleRole(slug: string) {
    setRoleSlugs((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    );
    clearError("roles");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || isLoadingData || loadError) {
      return;
    }

    const nextErrors: FormErrors = {};
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const shouldValidatePassword =
      !isEdit || password.length > 0 || confirmPassword.length > 0;

    if (normalizedName.length < 3 || normalizedName.length > 120) {
      nextErrors.name = "Informe um nome entre 3 e 120 caracteres.";
    }

    if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) {
      nextErrors.email = "Informe um e-mail válido.";
    }

    if (shouldValidatePassword) {
      if (password.length < 8 || password.length > 128) {
        nextErrors.password = "A senha deve ter entre 8 e 128 caracteres.";
      }

      if (confirmPassword !== password) {
        nextErrors.confirmPassword = "As senhas não conferem.";
      }
    }

    if (roleSlugs.length === 0) {
      nextErrors.roles = "Selecione ao menos um papel.";
    }

    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEdit && userId) {
        await updateManagedUser(userId, {
          name: normalizedName,
          email: normalizedEmail,
          roleSlugs,
          isActive,
          ...(shouldValidatePassword ? { password } : {}),
        });
        setFlash("Usuário atualizado com sucesso.");
      } else {
        await createManagedUser({
          name: normalizedName,
          email: normalizedEmail,
          password,
          roleSlugs,
          isActive,
        });
        setFlash("Usuário criado com sucesso.");
      }

      navigate("/usuarios");
    } catch (error) {
      if (error instanceof ApiError && error.code === "email_in_use") {
        setErrors({ email: error.message });
      } else {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o usuário.",
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
          Você não tem permissão para gerenciar usuários.
          <div>
            <Link className="back-link" to="/usuarios">
              ← Voltar para usuários
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingData) {
    return (
      <div className="user-form-page">
        <Link className="back-link" to="/usuarios">
          ← Voltar para usuários
        </Link>
        <section className="user-form-card">
          <div className="users-state" role="status">
            <strong>Carregando dados do usuário...</strong>
          </div>
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="user-form-page">
        <Link className="back-link" to="/usuarios">
          ← Voltar para usuários
        </Link>
        <div className="users-error" role="alert">
          {loadError}
          <div>
            <Link className="back-link" to="/usuarios">
              ← Voltar para a lista
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-form-page">
      <Link className="back-link" to="/usuarios">
        ← Voltar para usuários
      </Link>

      <section className="user-form-card" aria-labelledby="user-form-title">
        <header className="user-form-card__header">
          <h2 id="user-form-title">
            {isEdit ? "Editar usuário" : "Dados do usuário"}
          </h2>
          <p>
            {isEdit
              ? "Atualize os dados de acesso, os papéis e a situação do usuário."
              : "Cadastre o acesso, defina os papéis e informe a senha inicial."}
          </p>
        </header>

        <form className="user-form" noValidate onSubmit={handleSubmit}>
          {submitError ? (
            <div className="form-alert" role="alert">
              {submitError}
            </div>
          ) : null}

          <div className="form-field">
            <label htmlFor="user-name">Nome completo</label>
            <input
              id="user-name"
              name="name"
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
            <label htmlFor="user-email">E-mail</label>
            <input
              id="user-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="nome@vetcare.com"
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
            <label htmlFor="user-password">
              {isEdit ? "Nova senha (opcional)" : "Senha inicial"}
            </label>
            <input
              id="user-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder={
                isEdit ? "Deixe em branco para manter" : "Mínimo de 8 caracteres"
              }
              value={password}
              aria-invalid={Boolean(errors.password)}
              onChange={(event) => {
                setPassword(event.target.value);
                clearError("password");
              }}
            />
            <p className="form-hint">
              {isEdit
                ? "Preencha apenas se quiser redefinir a senha."
                : "Use uma senha forte e compartilhe apenas com o usuário."}
            </p>
            {errors.password ? (
              <p className="form-error" role="alert">
                {errors.password}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="user-confirm-password">
              {isEdit ? "Confirmar nova senha" : "Confirmar senha"}
            </label>
            <input
              id="user-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder={
                isEdit ? "Repita a nova senha" : "Repita a senha inicial"
              }
              value={confirmPassword}
              aria-invalid={Boolean(errors.confirmPassword)}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                clearError("confirmPassword");
              }}
            />
            {errors.confirmPassword ? (
              <p className="form-error" role="alert">
                {errors.confirmPassword}
              </p>
            ) : null}
          </div>

          <div className="user-form__section">
            <h3 className="user-form__section-title">Acesso e permissões</h3>
            <p className="user-form__section-description">
              Um usuário pode acumular mais de um papel.
            </p>
          </div>

          <div className="form-field form-field--full">
            <fieldset>
              <legend>Papéis</legend>
              <div className="role-options">
                {roles.map((role) => (
                  <label className="role-option" key={role.id}>
                    <input
                      type="checkbox"
                      name="roleSlugs"
                      value={role.slug}
                      checked={roleSlugs.includes(role.slug)}
                      onChange={() => toggleRole(role.slug)}
                    />
                    <span className="role-option__text">
                      <strong>{role.name}</strong>
                      <small>{role.description}</small>
                    </span>
                  </label>
                ))}
              </div>
              {errors.roles ? (
                <p className="form-error" role="alert">
                  {errors.roles}
                </p>
              ) : null}
            </fieldset>
          </div>

          <div className="form-field form-field--full">
            <label htmlFor="user-status">Situação</label>
            <select
              id="user-status"
              name="isActive"
              value={isActive ? "active" : "inactive"}
              onChange={(event) => setIsActive(event.target.value === "active")}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
            <p className="form-hint">
              Usuários inativos não conseguem iniciar sessão.
            </p>
          </div>

          <div className="form-actions">
            <Link className="button button--ghost" to="/usuarios">
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
                  : "Criar usuário"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
