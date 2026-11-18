import { ANIMAL_KEYS, ANIMALS, SHARED_CONTROLS, type AnimalKey, type KnobSpec, type Tuning } from "./src";

const animalsEl = document.getElementById("animals")!;
const controlsEl = document.getElementById("controls")!;
const toggleInteractCheckbox = document.getElementById("toggle-interact") as HTMLInputElement;
const toggleVisBtn = document.getElementById("toggle-vis") as HTMLButtonElement;
const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;
const quitBtn = document.getElementById("quit-btn") as HTMLButtonElement;

let currentAnimal: AnimalKey = "butterflies";
let currentTuning: Tuning = { ...ANIMALS.butterflies.defaults };
let overlayVisible = true;
let interactionEnabled = true;
let refreshUI: (() => void)[] = [];

const decimals = (step: number) => (step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step))));

function renderAnimalPills() {
  animalsEl.replaceChildren();
  for (const key of ANIMAL_KEYS) {
    const a = ANIMALS[key];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `animal-pill${key === currentAnimal ? " active" : ""}`;
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = `rgb(${a.swatch.join(",")})`;
    const label = document.createElement("span");
    label.textContent = a.label;
    btn.append(dot, label);
    btn.addEventListener("click", () => {
      if (key === currentAnimal) return;
      currentAnimal = key;
      currentTuning = { ...ANIMALS[key].defaults };
      window.overlayAPI?.setAnimal(key);
      renderAnimalPills();
      renderControls();
    });
    animalsEl.append(btn);
  }
}

function renderControls() {
  controlsEl.replaceChildren();
  refreshUI = [];
  const a = ANIMALS[currentAnimal];
  const hidden = new Set<string>(a.hide ?? []);
  const keep = (specs: KnobSpec[]) => specs.filter((s) => !hidden.has(s.key));

  const groups: [string, KnobSpec[]][] = [
    ["Movement", keep(SHARED_CONTROLS.movement)],
    ...a.controls,
    ["Look", keep(SHARED_CONTROLS.look)],
  ];

  for (const [title, specs] of groups) {
    if (specs.length === 0) continue;
    const section = document.createElement("section");
    section.className = "group";
    const h3 = document.createElement("h3");
    h3.textContent = title;
    section.append(h3);

    for (const spec of specs) {
      const row = document.createElement("label");
      row.className = "row";
      row.title = `${spec.hint} (Double-click label to reset)`;
      const name = document.createElement("span");
      name.textContent = spec.label;

      if ("toggle" in spec) {
        const box = document.createElement("input");
        box.type = "checkbox";
        const sync = () => {
          box.checked = Boolean(currentTuning[spec.key]);
        };
        box.addEventListener("change", () => {
          currentTuning[spec.key] = box.checked;
          window.overlayAPI?.setKnob(spec.key, box.checked);
          refreshUI.forEach((fn) => fn());
        });
        name.addEventListener("dblclick", (e) => {
          e.preventDefault();
          const def = Boolean(a.defaults[spec.key]);
          currentTuning[spec.key] = def;
          window.overlayAPI?.setKnob(spec.key, def);
          refreshUI.forEach((fn) => fn());
        });
        refreshUI.push(sync);
        row.append(name, box);
      } else {
        const out = document.createElement("output");
        out.className = "val";
        const range = document.createElement("input");
        range.type = "range";
        range.min = String(spec.min);
        range.max = String(spec.max);
        range.step = String(spec.step);

        const sync = () => {
          const val = Number(currentTuning[spec.key] ?? a.defaults[spec.key]);
          range.value = String(val);
          out.textContent = val.toFixed(decimals(spec.step));
          range.style.setProperty("--fill", `${((val - spec.min) / (spec.max - spec.min)) * 100}%`);
          const off = spec.disabledWhen ? Boolean(currentTuning[spec.disabledWhen]) : false;
          range.disabled = off;
          row.classList.toggle("off", off);
        };

        range.addEventListener("input", () => {
          const val = Number(range.value);
          currentTuning[spec.key] = val;
          window.overlayAPI?.setKnob(spec.key, val);
          sync();
        });
        name.addEventListener("dblclick", (e) => {
          e.preventDefault();
          const def = Number(a.defaults[spec.key]);
          currentTuning[spec.key] = def;
          window.overlayAPI?.setKnob(spec.key, def);
          sync();
        });
        refreshUI.push(sync);
        row.append(name, out, range);
      }
      section.append(row);
    }
    controlsEl.append(section);
  }
  refreshUI.forEach((fn) => fn());
}

function syncInteractToggle() {
  toggleInteractCheckbox.checked = interactionEnabled;
}

toggleInteractCheckbox.addEventListener("change", () => {
  interactionEnabled = toggleInteractCheckbox.checked;
  window.overlayAPI?.setInteraction(interactionEnabled);
});

toggleVisBtn.addEventListener("click", () => {
  overlayVisible = !overlayVisible;
  toggleVisBtn.textContent = overlayVisible ? "Hide" : "Show";
  window.overlayAPI?.setVisible(overlayVisible);
});

resetBtn.addEventListener("click", () => {
  window.overlayAPI?.resetAnimal();
});

quitBtn.addEventListener("click", () => {
  window.overlayAPI?.quit();
});

renderAnimalPills();
renderControls();

if (window.overlayAPI) {
  window.overlayAPI.onState((state) => {
    const animalChanged = state.animal !== currentAnimal;
    currentAnimal = state.animal;
    currentTuning = { ...state.tuning };
    if (animalChanged) {
      renderAnimalPills();
      renderControls();
    } else {
      refreshUI.forEach((fn) => fn());
    }
  });
  window.overlayAPI.onInteraction((enabled) => {
    interactionEnabled = Boolean(enabled);
    syncInteractToggle();
  });
  window.overlayAPI.requestState();
}
