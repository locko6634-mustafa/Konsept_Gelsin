export function initNavigation(root = document) {
  const header = root.querySelector(".site-header");
  if (header) {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 20;
      header.classList.toggle("is-scrolled", isScrolled);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
  }

  const anchorLinks = root.querySelectorAll('a[href^="#"]:not([href="#"])');
  anchorLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");
      if (!targetId || targetId === "#") return;
      const targetElement = root.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

initNavigation();
