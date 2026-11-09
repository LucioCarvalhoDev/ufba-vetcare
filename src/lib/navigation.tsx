import {
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

const FLASH_STORAGE_KEY = "vetcare:flash";

export function usePathname() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return pathname;
}

export function navigate(
  to: string,
  { replace = false }: { replace?: boolean } = {},
) {
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (current === to) {
    return;
  }

  if (replace) {
    window.history.replaceState(null, "", to);
  } else {
    window.history.pushState(null, "", to);
  }

  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, left: 0 });
}

type LinkProps = {
  to: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigate(to);
  }

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

export function setFlash(message: string) {
  try {
    window.sessionStorage.setItem(FLASH_STORAGE_KEY, message);
  } catch {
    // sessionStorage pode estar indisponível; o fluxo segue normalmente.
  }
}

export function consumeFlash() {
  try {
    const message = window.sessionStorage.getItem(FLASH_STORAGE_KEY);

    if (message) {
      window.sessionStorage.removeItem(FLASH_STORAGE_KEY);
    }

    return message;
  } catch {
    return null;
  }
}
