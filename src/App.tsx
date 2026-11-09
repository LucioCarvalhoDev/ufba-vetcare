import { useEffect, useState } from "react";
import AppShell from "./components/AppShell";
import HomePage from "./pages/HomePage";
import PetsListPage from "./pages/PetsListPage";
import PetFormPage from "./pages/PetFormPage";
import TutorFormPage from "./pages/TutorFormPage";
import TutorsListPage from "./pages/TutorsListPage";
import LoginPage from "./pages/LoginPage";
import UserFormPage from "./pages/UserFormPage";
import UsersListPage from "./pages/UsersListPage";
import { fetchCurrentUser, logout } from "./lib/api";
import { navigate, usePathname } from "./lib/navigation";
import type { AuthUser } from "./types/auth";

export default function App() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isActive = true;

    fetchCurrentUser()
      .then((currentUser) => {
        if (isActive) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (isActive) {
          setUser(null);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsRestoringSession(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await logout();
    } catch {
      // A sessão local é encerrada mesmo se a API estiver indisponível.
    } finally {
      setUser(null);
      setIsLoggingOut(false);
      navigate("/");
    }
  }

  if (isRestoringSession) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        Carregando sessão...
      </div>
    );
  }

  if (!user) {
    return <LoginPage onAuthenticated={setUser} />;
  }

  if (pathname === "/tutores") {
    return (
      <AppShell
        user={user}
        title="Tutores"
        activeNav="tutores"
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      >
        <TutorsListPage user={user} />
      </AppShell>
    );
  }

  if (pathname === "/tutores/novo") {
    return (
      <AppShell
        user={user}
        title="Novo tutor"
        activeNav="tutores"
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      >
        <TutorFormPage key="tutor-create" user={user} mode="create" />
      </AppShell>
    );
  }

  const editTutorMatch = pathname.match(/^\/tutores\/([^/]+)\/editar$/);

  if (editTutorMatch) {
    const tutorId = editTutorMatch[1];

    return (
      <AppShell
        user={user}
        title="Editar tutor"
        activeNav="tutores"
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      >
        <TutorFormPage
          key={`tutor-edit-${tutorId}`}
          user={user}
          mode="edit"
          tutorId={tutorId}
        />
      </AppShell>
    );
  }

  if (pathname === "/pets") {
    return (
      <AppShell
        user={user}
        title="Pets"
        activeNav="pets"
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      >
        <PetsListPage user={user} />
      </AppShell>
    );
  }

  if (pathname === "/pets/novo") {
    return (
      <AppShell
        user={user}
        title="Novo pet"
        activeNav="pets"
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      >
        <PetFormPage key="pet-create" user={user} mode="create" />
      </AppShell>
    );
  }

  const editPetMatch = pathname.match(/^\/pets\/([^/]+)\/editar$/);

  if (editPetMatch) {
    const animalId = editPetMatch[1];

    return (
      <AppShell
        user={user}
        title="Editar pet"
        activeNav="pets"
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      >
        <PetFormPage
          key={`pet-edit-${animalId}`}
          user={user}
          mode="edit"
          animalId={animalId}
        />
      </AppShell>
    );
  }

  if (pathname === "/usuarios") {
    return (
      <AppShell
        user={user}
        title="Usuários"
        activeNav="usuarios"
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      >
        <UsersListPage user={user} />
      </AppShell>
    );
  }

  if (pathname === "/usuarios/novo") {
    return (
      <AppShell
        user={user}
        title="Novo usuário"
        activeNav="usuarios"
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      >
        <UserFormPage key="create" user={user} mode="create" />
      </AppShell>
    );
  }

  const editUserMatch = pathname.match(/^\/usuarios\/([^/]+)\/editar$/);

  if (editUserMatch) {
    const userId = editUserMatch[1];

    return (
      <AppShell
        user={user}
        title="Editar usuário"
        activeNav="usuarios"
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      >
        <UserFormPage
          key={`edit-${userId}`}
          user={user}
          mode="edit"
          userId={userId}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      user={user}
      title="Início"
      activeNav="inicio"
      isLoggingOut={isLoggingOut}
      onLogout={handleLogout}
    >
      <HomePage />
    </AppShell>
  );
}
