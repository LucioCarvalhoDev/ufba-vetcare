import { useEffect, useState } from "react";
import AppShell from "./components/AppShell";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import UserCreatePage from "./pages/UserCreatePage";
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
        <UserCreatePage user={user} />
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
