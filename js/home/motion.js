const reducedMotionQuery = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false };

export function initMotion(root = document) {
  if (typeof document === "undefined") return;

  document.documentElement.classList.add("motion-ready");

  if (reducedMotionQuery.matches) {
    document.documentElement.setAttribute("data-ready", "true");
    return;
  }

  window.requestAnimationFrame(() => {
    document.documentElement.setAttribute("data-ready", "true");
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    const observeTargets = root.querySelectorAll(".service-card, .proof-strip__item, .step-card");
    observeTargets.forEach((target) => observer.observe(target));
  }
}

initMotion();
