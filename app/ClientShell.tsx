"use client";

import { useEffect, useRef } from "react";

type VanillaApp = { unmount: () => void };
type VanillaModule = { mount: (root: HTMLElement | null) => VanillaApp };

export default function ClientShell() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let app: VanillaApp | undefined;

    import("@/vanilla/main.js")
      .then((module: VanillaModule) => {
        if (disposed) return;
        app = module.mount(rootRef.current);
      })
      .catch(() => {
        const root = rootRef.current;
        if (root) {
          root.innerHTML =
            '<div class="fatal"><h1>AdPulse could not start</h1><p>Reload the page. If it still fails, check the server log.</p></div>';
        }
      });

    return () => {
      disposed = true;
      app?.unmount();
    };
  }, []);

  return <div id="app" ref={rootRef} />;
}
