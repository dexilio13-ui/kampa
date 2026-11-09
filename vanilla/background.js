/**
 * Animated "Funnel Flow" background.
 * Particles drift down a wide-to-narrow funnel; a faint rising line traces
 * performance. No external assets, no shadows, and the loop stops when hidden.
 */
export function createBackground(canvas, pointer, options = {}) {
  if (!canvas) return { destroy() {}, refresh() {}, setReducedMotion() {}, setPointer() {} };
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return { destroy() {}, refresh() {}, setReducedMotion() {}, setPointer() {} };

  let width = 0;
  let height = 0;
  let raf = null;
  let last = 0;
  let reduced = Boolean(options.reducedMotion);
  let running = false;
  let colors = readColors();
  let particles = [];
  let ripples = [];
  let frame = 0;

  function readColors() {
    const style = getComputedStyle(document.body);
    const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    return {
      funnel: read("--funnel", "#8e877b"),
      soft: read("--funnel-soft", "#b8b0a2"),
      accent: read("--accent", "#232629"),
      accent2: read("--accent-2", "#8a6a3f"),
      text: read("--text", "#1b1d1f"),
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildParticles();
    if (!running) draw(0);
  }

  function particleCount() {
    if (width < 640) return 22;
    if (width < 1100) return 38;
    return 60;
  }

  function buildParticles() {
    particles = Array.from({ length: particleCount() }, (_, index) => spawn(index));
  }

  function funnelGeometry() {
    return {
      cx: width / 2,
      top: height * 0.46,
      bottom: height * 0.92,
      topHalf: width * 0.34,
      waist: width * 0.07,
    };
  }

  function spawn(index = 0, initial = false) {
    const geo = funnelGeometry();
    const kind = Math.random() < 0.12 ? "conversion" : Math.random() < 0.55 ? "click" : "impression";
    return {
      x: geo.cx + (Math.random() * 2 - 1) * geo.topHalf * 0.95,
      y: initial ? Math.random() * geo.bottom : geo.top - Math.random() * height * 0.35,
      vy: 8 + Math.random() * 16,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.3 + Math.random() * 0.5,
      radius: kind === "conversion" ? 2.1 : 1 + Math.random() * 1.2,
      kind,
      alpha: 0.22 + Math.random() * 0.38,
      index,
    };
  }

  function draw(dt) {
    ctx.clearRect(0, 0, width, height);
    const geo = funnelGeometry();
    frame += 1;

    // Faint funnel outline.
    ctx.save();
    ctx.strokeStyle = colors.funnel;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(geo.cx - geo.topHalf, geo.top);
    ctx.bezierCurveTo(geo.cx - geo.topHalf * 0.55, geo.top + height * 0.2, geo.cx - geo.waist * 1.3, height * 0.7, geo.cx - geo.waist, geo.bottom);
    ctx.lineTo(geo.cx + geo.waist, geo.bottom);
    ctx.bezierCurveTo(geo.cx + geo.waist * 1.3, height * 0.7, geo.cx + geo.topHalf * 0.55, geo.top + height * 0.2, geo.cx + geo.topHalf, geo.top);
    ctx.stroke();

    ctx.globalAlpha = 0.07;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(geo.cx - geo.topHalf * 0.62, geo.top + height * 0.13);
    ctx.lineTo(geo.cx - geo.waist * 1.15, height * 0.76);
    ctx.moveTo(geo.cx + geo.topHalf * 0.62, geo.top + height * 0.13);
    ctx.lineTo(geo.cx + geo.waist * 1.15, height * 0.76);
    ctx.stroke();
    ctx.restore();

    // Rising line-chart trace, extremely faint.
    const segments = 44;
    ctx.save();
    ctx.strokeStyle = colors.soft;
    ctx.globalAlpha = 0.17;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= segments; i += 1) {
      const x = (i / segments) * width;
      const wave = Math.sin(i * 0.34 + frame * 0.004) * height * 0.018;
      const y = height * 0.27 - (i / segments) * height * 0.16 + wave;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Particles.
    const pointerActive = pointer && pointer.active;
    for (const particle of particles) {
      if (dt > 0) {
        particle.y += particle.vy * dt;
        particle.wobble += particle.wobbleSpeed * dt;
        const progress = Math.max(0, Math.min(1, (particle.y - geo.top) / Math.max(1, geo.bottom - geo.top)));
        const targetHalf = geo.topHalf * (1 - progress) + geo.waist * progress;
        const targetX = geo.cx + (particle.x - geo.cx) * 0.985;
        particle.x += (targetX - particle.x) * 0.012 + Math.sin(particle.wobble) * 0.12;
        if (Math.abs(particle.x - geo.cx) > targetHalf) {
          particle.x += (geo.cx - particle.x) * 0.018;
        }

        if (pointerActive) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 130 && dist > 1) {
            const push = ((130 - dist) / 130) * 22 * dt;
            particle.x += (dx / dist) * push;
            particle.y += (dy / dist) * push;
          }
        }

        if (particle.y > geo.bottom + 8) {
          if (particle.kind === "conversion" && ripples.length < 5) {
            ripples.push({ x: geo.cx, y: geo.bottom, r: 2, alpha: 0.5 });
          }
          Object.assign(particle, spawn(particle.index));
        }
      }

      const progress = Math.max(0, Math.min(1, (particle.y - geo.top) / Math.max(1, geo.bottom - geo.top)));
      const alpha = particle.alpha * (0.35 + progress * 0.65);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.kind === "conversion" ? colors.accent2 : particle.kind === "click" ? colors.accent : colors.funnel;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Conversion ripples at the spout.
    ripples = ripples.filter((ripple) => {
      ripple.r += 18 * dt;
      ripple.alpha -= 0.35 * dt;
      if (ripple.alpha <= 0) return false;
      ctx.globalAlpha = Math.max(0, ripple.alpha);
      ctx.strokeStyle = colors.accent2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
      ctx.stroke();
      return true;
    });

    ctx.globalAlpha = 1;
  }

  function loop(timestamp) {
    if (!running) return;
    if (document.hidden) {
      running = false;
      return;
    }
    const dt = last ? Math.min((timestamp - last) / 1000, 0.05) : 0;
    last = timestamp;
    draw(dt);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (reduced || running) {
      if (reduced) draw(0);
      return;
    }
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  function onResize() {
    resize();
    start();
  }

  function setReducedMotion(value) {
    reduced = Boolean(value);
    stop();
    if (reduced) draw(0);
    else start();
  }

  resize();
  start();
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);

  return {
    refresh() {
      colors = readColors();
      if (reduced) draw(0);
    },
    setReducedMotion,
    setPointer() {},
    destroy() {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
