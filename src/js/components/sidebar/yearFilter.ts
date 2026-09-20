import { DualRangeSlider } from "../yearSlider.js";
import { CONFIG } from "../../constants.js";
import { debounce, triggerHapticFeedback, parseYearRangeRaw } from "../../utils.js";
import { getActiveFilters, appEvents } from "../../state.js";
import { dom, isMobileLayout, sidebarUnsubscribers } from "./context.js";

declare module "../../state.js" {
  interface AppEventPayloads {
    'sidebar:requestCloseDrawer': undefined;
    'sidebar:applyYearFilter': { value: string };
  }
}

// --- Estado de Interacción del Año ---
let yearInteractionState = { start: false, end: false };
let yearSliderInstance: DualRangeSlider | null = null;

export function destroyYearSlider(): void {
  if (yearSliderInstance) {
    yearSliderInstance.destroy();
    yearSliderInstance = null;
  }
}

// Guarda el año si has tocado las casillas manuales
export function applyPendingYearFilters(): void {
  if (!dom.yearStartInput || !dom.yearEndInput) return;

  const currentStart = parseInt(dom.yearStartInput.value, 10);
  const currentEnd = parseInt(dom.yearEndInput.value, 10);

  if (isNaN(currentStart) || isNaN(currentEnd)) return;

  const activeFilters = getActiveFilters();
  const [globalStart, globalEnd] = parseYearRangeRaw(activeFilters.year);

  if (currentStart !== globalStart || currentEnd !== globalEnd) {
    const value = currentStart === currentEnd ? `${currentStart}` : `${currentStart}-${currentEnd}`;
    appEvents.emit("sidebar:applyYearFilter", { value });
  }
}

export function initYearSlider(): void {
  if (yearSliderInstance) {
    yearSliderInstance.destroy();
    yearSliderInstance = null;
  }

  if (!dom.yearSlider || !dom.yearStartInput || !dom.yearEndInput) return;
  const yearInputs = [dom.yearStartInput, dom.yearEndInput];

  const pivotYear = 2000;

  const currentFilters = getActiveFilters();
  let initialYears = (currentFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`).split("-").map(Number);
  if (initialYears.length === 1) initialYears = [initialYears[0], initialYears[0]];

  yearSliderInstance = new DualRangeSlider(dom.yearSlider, {
    min: CONFIG.YEAR_MIN,
    max: CONFIG.YEAR_MAX,
    pivotYear: pivotYear,
    start: initialYears,
  });

  const slider = yearSliderInstance;

  sidebarUnsubscribers.push(() => {
    if (yearSliderInstance === slider) {
      yearSliderInstance.destroy();
      yearSliderInstance = null;
    }
  });

  slider.on("update", (values, handle) => {
    if (yearInputs[handle]) {
      const yearVal = Number(values[handle]);
      yearInputs[handle]!.value = String(yearVal);
    }
  });

  const updateSliderFilter = (values: (string | number)[], handle: number, autoClose = true) => {
    let [start, end] = values.map(Number);
    if (start > end) {
      if (handle === 0) end = start; else start = end;
    }
    const yearFilter = start === end ? `${start}` : `${start}-${end}`;

    if (isMobileLayout()) {
      if (autoClose && yearInteractionState.start && yearInteractionState.end) {
        appEvents.emit("sidebar:requestCloseDrawer");
      }
    } else {
      appEvents.emit("sidebar:applyYearFilter", { value: yearFilter });
    }
  };

  const debouncedUpdate = debounce(updateSliderFilter, 500);

  sidebarUnsubscribers.push(() => {
    debouncedUpdate.cancel();
  });

  slider.on("set", (values, handle) => {
    triggerHapticFeedback("light");
    const h = Number(handle);
    if (h === 0) yearInteractionState.start = true;
    if (h === 1) yearInteractionState.end = true;
    debouncedUpdate(values, handle, true);
  });

  yearInputs.forEach((input, index) => {
    const onInputChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const cleanVal = target.value.replace(/[^0-9]/g, "");
      const newValue = parseFloat(cleanVal);
      if (isNaN(newValue)) return;
      const currentValues = slider.get();

      const triggerUpdate = (vals: Array<string | number>) => {
        if (index === 0) yearInteractionState.start = true;
        if (index === 1) yearInteractionState.end = true;
        debouncedUpdate(vals, index, false);
      };

      if (currentValues[0] === currentValues[1]) {
        if (index === 0 && newValue > currentValues[0]) { slider.set([newValue, newValue], false); triggerUpdate([newValue, newValue]); return; }
        if (index === 1 && newValue < currentValues[1]) { slider.set([newValue, newValue], false); triggerUpdate([newValue, newValue]); return; }
      }
      const values: Array<number | null> = [null, null];
      values[index] = newValue;
      slider.set(values, false);
      triggerUpdate(slider.get());
    };

    input.addEventListener("change", onInputChange);
    sidebarUnsubscribers.push(() => input.removeEventListener("change", onInputChange));
  });

  sidebarUnsubscribers.push(
    appEvents.on("updateSidebarUI", () => {
      debouncedUpdate.cancel();
      const currentFilters = getActiveFilters();
      const years = parseYearRangeRaw(currentFilters.year);
      slider.set(years, false);
    }),
    appEvents.on("sidebar:drawerOpened", () => {
      yearInteractionState = { start: false, end: false };
    }),
    appEvents.on("sidebar:drawerClosed", () => {
      applyPendingYearFilters();
    })
  );
}

export function setupYearInputSteppers(): void {
  document.querySelectorAll(".year-input-wrapper").forEach((wrapper) => {
    const input = wrapper.querySelector(".year-input") as HTMLInputElement | null;
    const stepperUp = wrapper.querySelector(".stepper-btn.stepper-up") as HTMLButtonElement | null;
    const stepperDown = wrapper.querySelector(".stepper-btn.stepper-down") as HTMLButtonElement | null;
    if (!input || !stepperUp || !stepperDown) return;

    const updateYearValue = (increment: number) => {
      triggerHapticFeedback('medium');
      const cleanVal = input.value.replace(/[^0-9]/g, "");
      let currentValue = parseInt(cleanVal, 10);
      if (isNaN(currentValue)) currentValue = increment > 0 ? CONFIG.YEAR_MIN : CONFIG.YEAR_MAX;
      const newValue = Math.min(Math.max(currentValue + increment, CONFIG.YEAR_MIN), CONFIG.YEAR_MAX);
      input.value = String(newValue);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const handleUp = () => updateYearValue(1);
    const handleDown = () => updateYearValue(-1);
    stepperUp.addEventListener("click", handleUp);
    stepperDown.addEventListener("click", handleDown);
    sidebarUnsubscribers.push(() => {
      stepperUp.removeEventListener("click", handleUp);
      stepperDown.removeEventListener("click", handleDown);
    });
  });
}
