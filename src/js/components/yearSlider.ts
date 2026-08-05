// =================================================================
//           LÍNEA DEL TIEMPO NATIVA (Dual Range Slider)
// =================================================================
// Reemplaza nouislider sin dependencias externas.
// Soporta doble tirador, mapeo no lineal (pivote en 50%),
// eventos Pointer (ratón y táctil) y accesibilidad con teclado.
// =================================================================

export interface DualRangeSliderOptions {
  min: number;
  max: number;
  pivotYear?: number;
  start?: number[];
}

export class DualRangeSlider {
  private container: HTMLElement;
  private min: number;
  private max: number;
  private pivotYear: number;
  private values: [number, number];

  private trackEl!: HTMLElement;
  private connectEl!: HTMLElement;
  private handleStartEl!: HTMLElement;
  private handleEndEl!: HTMLElement;

  private updateCallbacks: Array<(values: [number, number], handle: number) => void> = [];
  private setCallbacks: Array<(values: [number, number], handle: number) => void> = [];

  constructor(container: HTMLElement, options: DualRangeSliderOptions) {
    this.container = container;
    this.min = options.min;
    this.max = options.max;
    this.pivotYear = options.pivotYear ?? 2000;

    const startVal = options.start?.[0] ?? this.min;
    const endVal = options.start?.[1] ?? this.max;
    this.values = [
      Math.max(this.min, Math.min(this.max, startVal)),
      Math.max(this.min, Math.min(this.max, endVal)),
    ];
    if (this.values[0] > this.values[1]) {
      this.values[0] = this.values[1];
    }

    this.renderDOM();
    this.bindEvents();
    this.updateUI();
  }

  private renderDOM(): void {
    this.container.innerHTML = "";
    this.container.classList.add("custom-year-slider");

    const track = document.createElement("div");
    track.className = "slider-track";

    const connect = document.createElement("div");
    connect.className = "slider-connect";

    const handleStart = document.createElement("div");
    handleStart.className = "slider-handle handle-start";
    handleStart.tabIndex = 0;
    handleStart.setAttribute("role", "slider");
    handleStart.setAttribute("aria-label", "Año de inicio");
    handleStart.setAttribute("aria-valuemin", String(this.min));
    handleStart.setAttribute("aria-valuemax", String(this.max));

    const handleEnd = document.createElement("div");
    handleEnd.className = "slider-handle handle-end";
    handleEnd.tabIndex = 0;
    handleEnd.setAttribute("role", "slider");
    handleEnd.setAttribute("aria-label", "Año de fin");
    handleEnd.setAttribute("aria-valuemin", String(this.min));
    handleEnd.setAttribute("aria-valuemax", String(this.max));

    track.appendChild(connect);
    this.container.appendChild(track);
    this.container.appendChild(handleStart);
    this.container.appendChild(handleEnd);

    this.trackEl = track;
    this.connectEl = connect;
    this.handleStartEl = handleStart;
    this.handleEndEl = handleEnd;
  }

  private valToPct(val: number): number {
    if (val <= this.pivotYear) {
      const range = this.pivotYear - this.min;
      return range > 0 ? 0.5 * ((val - this.min) / range) : 0;
    } else {
      const range = this.max - this.pivotYear;
      return range > 0 ? 0.5 + 0.5 * ((val - this.pivotYear) / range) : 1;
    }
  }

  private snapYear(rawVal: number): number {
    if (rawVal <= this.pivotYear) {
      if (rawVal < this.min + 2) return this.min;
      const rounded = Math.round(rawVal / 10) * 10;
      return Math.max(this.min, Math.min(this.pivotYear, rounded));
    } else {
      return Math.max(this.pivotYear, Math.min(this.max, Math.round(rawVal)));
    }
  }

  private pctToVal(pct: number): number {
    const clampedPct = Math.max(0, Math.min(1, pct));
    let rawVal: number;
    if (clampedPct <= 0.5) {
      const range = this.pivotYear - this.min;
      rawVal = this.min + (clampedPct / 0.5) * range;
    } else {
      const range = this.max - this.pivotYear;
      rawVal = this.pivotYear + ((clampedPct - 0.5) / 0.5) * range;
    }
    return this.snapYear(rawVal);
  }

  private updateUI(): void {
    const startPct = this.valToPct(this.values[0]) * 100;
    const endPct = this.valToPct(this.values[1]) * 100;
    const isSameYear = this.values[0] === this.values[1];

    if (this.container.classList) {
      if (isSameYear) {
        this.container.classList.add("is-same-year");
      } else if (typeof this.container.classList.remove === "function") {
        this.container.classList.remove("is-same-year");
      }
    }

    this.connectEl.style.left = `${startPct}%`;
    this.connectEl.style.width = `${Math.max(0, endPct - startPct)}%`;

    this.handleStartEl.style.left = `${startPct}%`;
    this.handleStartEl.setAttribute("aria-valuenow", String(this.values[0]));
    if (this.values[0] <= this.min) {
      this.handleStartEl.setAttribute("aria-valuetext", `<${this.min}`);
    } else if (typeof this.handleStartEl.removeAttribute === "function") {
      this.handleStartEl.removeAttribute("aria-valuetext");
    }

    this.handleEndEl.style.left = `${endPct}%`;
    this.handleEndEl.setAttribute("aria-valuenow", String(this.values[1]));
  }

  private getPctFromClientX(clientX: number): number {
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  private bindEvents(): void {
    let activeHandleIndex: number | null = null;

    // Actualiza z-index dinámicamente según la posición del puntero para dar prioridad visual al lado más cercano
    const updateHoverZIndex = (clientX: number) => {
      if (activeHandleIndex !== null) return;
      const pct = this.getPctFromClientX(clientX);
      const startPct = this.valToPct(this.values[0]);
      const endPct = this.valToPct(this.values[1]);

      const distStart = Math.abs(pct - startPct);
      const distEnd = Math.abs(pct - endPct);

      if (distStart <= distEnd) {
        this.handleStartEl.style.zIndex = "5";
        this.handleEndEl.style.zIndex = "2";
      } else {
        this.handleEndEl.style.zIndex = "5";
        this.handleStartEl.style.zIndex = "2";
      }
    };

    this.container.addEventListener("pointermove", (e: PointerEvent) => {
      if (activeHandleIndex === null) {
        updateHoverZIndex(e.clientX);
      }
    });

    // Evitar que los gestos táctiles del slider activen el arrastre del menú lateral móvil
    this.container.addEventListener("touchstart", (e: TouchEvent) => {
      e.stopPropagation();
    }, { passive: true });

    const onPointerMove = (e: PointerEvent) => {
      if (activeHandleIndex === null) return;
      const pct = this.getPctFromClientX(e.clientX);
      const newYear = this.pctToVal(pct);

      let changed = false;

      // Auto-intercambio inteligente cuando ambas agujas están en el mismo año
      if (this.values[0] === this.values[1]) {
        if (activeHandleIndex === 1 && newYear < this.values[0]) {
          activeHandleIndex = 0;
        } else if (activeHandleIndex === 0 && newYear > this.values[1]) {
          activeHandleIndex = 1;
        }
      }

      if (activeHandleIndex === 0) {
        const val = Math.min(newYear, this.values[1]);
        if (val !== this.values[0]) {
          this.values[0] = val;
          changed = true;
        }
      } else {
        const val = Math.max(newYear, this.values[0]);
        if (val !== this.values[1]) {
          this.values[1] = val;
          changed = true;
        }
      }

      if (changed) {
        this.updateUI();
        this.emitUpdate(activeHandleIndex);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activeHandleIndex === null) return;
      const handleIndex = activeHandleIndex;
      activeHandleIndex = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      this.emitSet(handleIndex);
    };

    const startDrag = (handleIndex: number, e: PointerEvent) => {
      activeHandleIndex = handleIndex;
      const handleEl = handleIndex === 0 ? this.handleStartEl : this.handleEndEl;
      if (handleEl.setPointerCapture) {
        try { handleEl.setPointerCapture(e.pointerId); } catch {}
      }
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    };

    const getTargetHandleForClick = (clientX: number): number => {
      const pct = this.getPctFromClientX(clientX);
      const startPct = this.valToPct(this.values[0]);
      const endPct = this.valToPct(this.values[1]);

      const distStart = Math.abs(pct - startPct);
      const distEnd = Math.abs(pct - endPct);

      if (distStart < distEnd) return 0;
      if (distEnd < distStart) return 1;
      return pct < startPct ? 0 : 1;
    };

    this.handleStartEl.addEventListener("pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      const targetHandle = getTargetHandleForClick(e.clientX);
      startDrag(targetHandle, e);
    });

    this.handleEndEl.addEventListener("pointerdown", (e: PointerEvent) => {
      e.stopPropagation();
      const targetHandle = getTargetHandleForClick(e.clientX);
      startDrag(targetHandle, e);
    });

    // Clic en la barra o contenedor
    this.container.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.target === this.handleStartEl || e.target === this.handleEndEl) return;
      const pct = this.getPctFromClientX(e.clientX);
      const year = this.pctToVal(pct);
      const startPct = this.valToPct(this.values[0]);
      const endPct = this.valToPct(this.values[1]);

      const distStart = Math.abs(pct - startPct);
      const distEnd = Math.abs(pct - endPct);

      let chosenHandle = 0;
      if (distEnd < distStart || (distEnd === distStart && pct > startPct)) {
        chosenHandle = 1;
      }

      if (chosenHandle === 0) {
        this.values[0] = Math.min(year, this.values[1]);
      } else {
        this.values[1] = Math.max(year, this.values[0]);
      }

      this.updateUI();
      this.emitUpdate(chosenHandle);
      this.emitSet(chosenHandle);
      startDrag(chosenHandle, e);
    });

    // Accesibilidad mediante teclado
    const handleKey = (handleIndex: number, e: KeyboardEvent) => {
      let dir: 1 | -1 | 0 = 0;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "PageDown") dir = -1;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "PageUp") dir = 1;
      else if (e.key === "Home") {
        if (handleIndex === 0) this.values[0] = this.min;
        else this.values[1] = this.values[0];
      } else if (e.key === "End") {
        if (handleIndex === 1) this.values[1] = this.max;
        else this.values[0] = this.values[1];
      } else return;

      e.preventDefault();

      if (dir !== 0) {
        if (handleIndex === 0) {
          const next = this.getSteppedYear(this.values[0], dir);
          this.values[0] = Math.min(this.values[1], next);
        } else {
          const next = this.getSteppedYear(this.values[1], dir);
          this.values[1] = Math.max(this.values[0], next);
        }
      }

      this.updateUI();
      this.emitUpdate(handleIndex);
      this.emitSet(handleIndex);
    };

    this.handleStartEl.addEventListener("keydown", (e) => handleKey(0, e));
    this.handleEndEl.addEventListener("keydown", (e) => handleKey(1, e));
  }

  private getSteppedYear(current: number, direction: 1 | -1): number {
    if (direction > 0) {
      if (current < this.min) return this.min;
      if (current === this.min) return Math.min(this.pivotYear, Math.max(this.min, 1930));
      if (current < this.pivotYear) {
        const nextDecade = Math.floor(current / 10) * 10 + 10;
        return Math.min(this.pivotYear, nextDecade);
      }
      return Math.min(this.max, current + 1);
    } else {
      if (current > this.max) return this.max;
      if (current > this.pivotYear) return Math.max(this.pivotYear, current - 1);
      if (current === this.pivotYear) return 1990;
      if (current > this.min) {
        const prevDecade = Math.ceil(current / 10) * 10 - 10;
        if (prevDecade <= this.min) return this.min;
        return prevDecade;
      }
      return this.min;
    }
  }

  on(event: "update" | "set", callback: (values: [number, number], handle: number) => void): void {
    if (event === "update") {
      this.updateCallbacks.push(callback);
      // Firing update immediately on registration so inputs get populated instantly
      callback([...this.values], 0);
      callback([...this.values], 1);
    }
    if (event === "set") this.setCallbacks.push(callback);
  }

  get(): [number, number] {
    return [...this.values];
  }

  set(newValues: Array<number | null | string>, fireSet = true): void {
    let [start, end] = newValues;

    if (start !== null && start !== undefined && !isNaN(Number(start))) {
      this.values[0] = Math.max(this.min, Math.min(this.max, Number(start)));
    }
    if (end !== null && end !== undefined && !isNaN(Number(end))) {
      this.values[1] = Math.max(this.min, Math.min(this.max, Number(end)));
    }

    if (this.values[0] > this.values[1]) {
      if (start !== null && start !== undefined) {
        this.values[1] = this.values[0];
      } else {
        this.values[0] = this.values[1];
      }
    }

    this.updateUI();
    this.emitUpdate(0);
    this.emitUpdate(1);
    if (fireSet) {
      this.emitSet(0);
      this.emitSet(1);
    }
  }

  private emitUpdate(handleIndex: number): void {
    this.updateCallbacks.forEach((cb) => cb([...this.values], handleIndex));
  }

  private emitSet(handleIndex: number): void {
    this.setCallbacks.forEach((cb) => cb([...this.values], handleIndex));
  }
}
