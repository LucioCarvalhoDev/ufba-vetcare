import { useEffect, useRef, useState } from "react";
import { consumeFlash } from "./navigation";

export function useFlashMessage() {
  const [flash, setFlash] = useState<string | null>(null);
  const hasConsumed = useRef(false);

  useEffect(() => {
    if (hasConsumed.current) {
      return;
    }

    hasConsumed.current = true;
    setFlash(consumeFlash());
  }, []);

  return [flash, setFlash] as const;
}
