import { useEffect, useState } from "react";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import { fetchCurrentUser, logout } from "./lib/api";
import type { AuthUser } from "./types/auth";

export default function App() {
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
    }
  }

  if (isRestoringSession) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        Carregando sessão...
      </div>
    );
  }

  if (user) {
    return (
      <DashboardPage
        user={user}
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      />
    );
  }

  return <LoginPage onAuthenticated={setUser} />;
}
