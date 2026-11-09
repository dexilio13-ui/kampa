export function createCursor(ring, pointer, reducedMotion = false) {
  if (!ring || window.matchMedia("(pointer: coarse)").matches) {
    return { destroy() {} };
  }

  let targetX = -100;
  let targetY = -100;
  let x = -100;
  let y = -100;
  let raf = null;
  let active = false;
  let still = reducedMotion;

  function move(event) {
    targetX = event.clientX;
    targetY = event.clientY;
    if (!active) {
      active = true;
      pointer.active = true;
      x = targetX;
      y = targetY;
      ring.dataset.visible = "true";
    }
    if (!still) start();
    else place();
  }

  function place() {
    x = targetX;
    y = targetY;
    ring.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }

  function start() {
    if (raf) return;
    const tick = () => {
      x += (targetX - x) * 0.18;
      y += (targetY - y) * 0.18;
      ring.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      pointer.x = x;
      pointer.y = y;
      if (Math.abs(targetX - x) > 0.3 || Math.abs(targetY - y) > 0.3) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
      }
    };
    raf = requestAnimationFrame(tick);
  }

  function down() {
    ring.dataset.press = "true";
    setTimeout(() => {
      delete ring.dataset.press;
    }, 430);
  }

  function leave() {
    active = false;
    pointer.active = false;
    ring.dataset.visible = "false";
  }

  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerdown", down, { passive: true });
  document.addEventListener("mouseleave", leave);

  return {
    setReducedMotion(value) {
      still = Boolean(value);
      if (still && raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (still) place();
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      document.removeEventListener("mouseleave", leave);
      pointer.active = false;
    },
  };
}
