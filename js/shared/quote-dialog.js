import { buildWhatsAppUrl, cleanField } from "./contact.js";

const UNKNOWN_VALUE = "Henüz net değil";
const stepOrder = ["date", "city", "package"];

function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function canOpenDialog(dialog, view) {
  const Dialog = view?.HTMLDialogElement;
  return (
    typeof Dialog === "function" &&
    dialog instanceof Dialog &&
    typeof Dialog.prototype.showModal === "function"
  );
}

function setServiceValue(select, requestedService) {
  const service = cleanField(requestedService, 100);
  if (!service) return;

  const matchingOption = [...select.options].find(
    (option) => cleanField(option.value || option.textContent, 100) === service,
  );

  if (matchingOption) select.value = matchingOption.value;
}

function setInlineError(step, message, target) {
  const error = step?.querySelector("[data-quote-error]");

  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }

  step?.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
    field.removeAttribute("aria-invalid");
  });

  if (!message || !target) return;

  target.setAttribute("aria-invalid", "true");
  target.focus();
}

function readFields(elements) {
  return {
    city: elements.cityUnknown.checked ? UNKNOWN_VALUE : cleanField(elements.city.value, 100),
    eventDate: elements.dateUnknown.checked
      ? UNKNOWN_VALUE
      : cleanField(elements.date.value, 40),
    service: cleanField(elements.service.value, 100),
  };
}

function validateStep(stepName, step, elements) {
  const fields = readFields(elements);

  if (stepName === "date") {
    const hasValidDate = Boolean(fields.eventDate) && elements.date.checkValidity();
    if (elements.dateUnknown.checked || hasValidDate) {
      setInlineError(step, "", elements.date);
      return true;
    }

    setInlineError(
      step,
      "Lütfen etkinlik tarihini seçin veya Henüz net değil seçeneğini işaretleyin.",
      elements.date,
    );
    return false;
  }

  if (stepName === "city") {
    if (elements.cityUnknown.checked || fields.city) {
      setInlineError(step, "", elements.city);
      return true;
    }

    setInlineError(
      step,
      "Lütfen şehri yazın veya Henüz net değil seçeneğini işaretleyin.",
      elements.city,
    );
    return false;
  }

  if (fields.service) {
    setInlineError(step, "", elements.service);
    return true;
  }

  setInlineError(step, "Lütfen bir paket seçin veya Kararsızım seçeneğini kullanın.", elements.service);
  return false;
}

function syncUnknownChoice(input, checkbox) {
  input.disabled = checkbox.checked;
  if (checkbox.checked) input.value = "";
}

export function bootQuoteDialog(root = document) {
  const dialog = root.querySelector("[data-quote-dialog]");
  const view = root.defaultView ?? globalThis.window;

  if (!dialog || dialog.dataset.quoteEnhanced === "true" || !canOpenDialog(dialog, view)) return;

  const form = dialog.querySelector("[data-quote-form]");
  const steps = stepOrder.map((name) => dialog.querySelector(`[data-quote-step="${name}"]`));
  const elements = {
    city: dialog.querySelector("[data-quote-city]"),
    cityUnknown: dialog.querySelector("[data-quote-city-unknown]"),
    date: dialog.querySelector("[data-quote-date]"),
    dateUnknown: dialog.querySelector("[data-quote-date-unknown]"),
    service: dialog.querySelector("[data-quote-service]"),
  };
  const progress = dialog.querySelector("[data-quote-progress]");
  const progressLabel = dialog.querySelector("[data-quote-progress-label]");
  const whatsappLink = dialog.querySelector("[data-quote-whatsapp]");
  const requiredElements = [form, ...steps, ...Object.values(elements), progress, whatsappLink];

  if (requiredElements.some((element) => !element)) return;

  dialog.dataset.quoteEnhanced = "true";
  dialog.classList.add("is-enhanced");
  elements.date.min = localIsoDate();
  whatsappLink.target = "_blank";
  whatsappLink.rel = "noopener noreferrer";

  let activeStepIndex = 0;
  let opener = null;

  function updateWhatsAppLink() {
    whatsappLink.href = buildWhatsAppUrl(readFields(elements));
  }

  function showStep(index, { focus = true } = {}) {
    activeStepIndex = Math.min(Math.max(index, 0), steps.length - 1);
    const progressText = `${activeStepIndex + 1} / ${steps.length}`;

    steps.forEach((step, stepIndex) => {
      const active = stepIndex === activeStepIndex;
      step.hidden = !active;
      step.toggleAttribute("data-active", active);
      step.setAttribute("aria-hidden", String(!active));
    });

    if (progress.tagName === "PROGRESS") {
      progress.max = steps.length;
      progress.value = activeStepIndex + 1;
      progress.textContent = progressText;
      progress.setAttribute("aria-valuetext", progressText);
    } else {
      progress.textContent = String(activeStepIndex + 1);
      progress.removeAttribute("aria-valuetext");
    }
    if (progressLabel) progressLabel.textContent = progressText;
    updateWhatsAppLink();

    if (!focus) return;

    const focusTarget = steps[activeStepIndex].querySelector(
      "input:not(:disabled), select:not(:disabled), button:not(:disabled), a[href]",
    );
    focusTarget?.focus();
  }

  function resetDialog(service) {
    form.reset();
    elements.date.min = localIsoDate();
    steps.forEach((step) => setInlineError(step, ""));
    syncUnknownChoice(elements.date, elements.dateUnknown);
    syncUnknownChoice(elements.city, elements.cityUnknown);
    setServiceValue(elements.service, service || dialog.dataset.defaultService);
    showStep(0, { focus: false });
  }

  root.querySelectorAll("[data-quote-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      event.preventDefault();
      opener = trigger;
      resetDialog(trigger.dataset.quoteService);
      dialog.showModal();
      view.requestAnimationFrame(() => showStep(0));
    });
  });

  dialog.querySelectorAll("[data-quote-close]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });

  dialog.querySelectorAll("[data-quote-next]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!validateStep(stepOrder[activeStepIndex], steps[activeStepIndex], elements)) return;
      showStep(activeStepIndex + 1);
    });
  });

  dialog.querySelectorAll("[data-quote-back]").forEach((button) => {
    button.addEventListener("click", () => showStep(activeStepIndex - 1));
  });

  elements.dateUnknown.addEventListener("change", () => {
    syncUnknownChoice(elements.date, elements.dateUnknown);
    setInlineError(steps[0], "");
    updateWhatsAppLink();
  });

  elements.cityUnknown.addEventListener("change", () => {
    syncUnknownChoice(elements.city, elements.cityUnknown);
    setInlineError(steps[1], "");
    updateWhatsAppLink();
  });

  [elements.date, elements.city].forEach((input, index) => {
    const unknown = index === 0 ? elements.dateUnknown : elements.cityUnknown;
    input.addEventListener("input", () => {
      if (input.value) unknown.checked = false;
      syncUnknownChoice(input, unknown);
      setInlineError(steps[index], "");
      updateWhatsAppLink();
    });
  });

  elements.service.addEventListener("change", () => {
    setInlineError(steps[2], "");
    updateWhatsAppLink();
  });

  whatsappLink.addEventListener("click", (event) => {
    if (!validateStep("package", steps[2], elements)) {
      event.preventDefault();
      return;
    }

    updateWhatsAppLink();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!validateStep(stepOrder[activeStepIndex], steps[activeStepIndex], elements)) return;

    if (activeStepIndex < steps.length - 1) {
      showStep(activeStepIndex + 1);
      return;
    }

    updateWhatsAppLink();
    whatsappLink.click();
  });

  dialog.addEventListener("close", () => {
    opener?.focus();
    opener = null;
  });

  resetDialog();
}
