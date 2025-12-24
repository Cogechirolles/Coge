console.log("COGE Cavalaire JS (LOCAL) – Vacances jaunes + tooltips réservations – 2025-12-20");

document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.getElementById("calendar");

  // =========================
  // CONFIG (via Cloudflare Worker)
  // =========================
  const reservationsUrlBase =
    "https://coge-calendrier.cogechirolles.workers.dev/api/cavalaire?pageSize=100";

  const vacancesUrlBase =
    "https://coge-calendrier.cogechirolles.workers.dev/api/vacances?pageSize=100";

  // =========================
  // PARAMS AFFICHAGE
  // =========================
  const LANE_H = 16;
  const LANE_GAP = 2;
  const LABEL_WIDTH_PX = 520;

  // =========================
  // HELPERS DATES (robustes)
  // =========================
  function parseDateOnlyLocal(value) {
    if (!value) return null;

    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
    }
    if (typeof value === "number") {
      const d = new Date(value);
      if (isNaN(d)) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    }
    if (typeof value === "string") {
      const clean = value.includes("T") ? value.split("T")[0] : value;
      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        const [y, m, d] = clean.split("-").map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
      }
      const d = new Date(value);
      if (isNaN(d)) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    }
    const d = new Date(value);
    if (isNaN(d)) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function toYMD(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function formatDateFR(value) {
    const d = parseDateOnlyLocal(value);
    if (!d) return "";
    return (
      String(d.getDate()).padStart(2, "0") +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      d.getFullYear()
    );
  }

  // =========================
  // STATUT → COULEUR
  // =========================
  function statutToClass(statut) {
    const s = (statut || "").toLowerCase();
    if (s.includes("valid")) return "coge-validee";
    if (s.includes("refus")) return "coge-refusee";
    return "coge-attente";
  }

  // =========================
  // CALQUES DOM
  // =========================
  function ensureLayers(dayCellEl) {
    const frame = dayCellEl.querySelector(".fc-daygrid-day-frame");
    if (!frame) return;

    if (!frame.querySelector(".coge-lanes")) {
      const lanes = document.createElement("div");
      lanes.className = "coge-lanes";
      frame.appendChild(lanes);
    }

    if (!dayCellEl.querySelector(".coge-label-layer")) {
      dayCellEl.style.position = "relative";
      const layer = document.createElement("div");
      layer.className = "coge-label-layer";
      dayCellEl.appendChild(layer);
    }
  }

  function clearCustom(calendarRoot) {
    calendarRoot.querySelectorAll(".coge-bar, .coge-label").forEach((el) => el.remove());
  }

  // =========================
  // FETCH (pagination offset) — via Worker
  // =========================
  async function fetchAllAirtableRecords(urlBase) {
    const all = [];
    let url = urlBase;

    while (true) {
      const resp = await fetch(url);
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`API ${resp.status}: ${txt || resp.statusText}`);
      }

      const data = await resp.json();
      if (Array.isArray(data.records)) all.push(...data.records);

      if (data.offset) {
        const sep = urlBase.includes("?") ? "&" : "?";
        url = `${urlBase}${sep}offset=${encodeURIComponent(data.offset)}`;
      } else break;
    }
    return all;
  }

  // =========================
  // AIRTABLE → RESERVATIONS
  // =========================
  function airtableToReservations(records) {
    const out = [];

    records.forEach((rec) => {
      const f = rec.fields || {};

      // ⚠️ Sécurité : si jamais la vue n’est pas filtrée, on garde uniquement Cavalaire
      const appart = f["Appartement"];
      if (Array.isArray(appart) && !appart.includes("Cavalaire")) return;

      const aDay = parseDateOnlyLocal(f["Date de début"]);
      const dDay = parseDateOnlyLocal(f["Date de fin"]);
      if (!aDay || !dDay || dDay < aDay) return;

      const nomAbonne = f["Nom de l'abonné"] || "";
      const nomExt = f["Nom de l’Extérieur"] || "";
      const title = nomExt ? `${nomExt} (extérieur : ${nomAbonne})` : nomAbonne;

      let statut = f["Statut de la demande"];
      if (Array.isArray(statut)) statut = statut[0];

      out.push({
        id: rec.id,
        title: title || "(Sans nom)",
        arrivee: toYMD(aDay),
        depart: toYMD(dDay),
        aDay,
        dDay,
        endExcl: addDays(dDay, 1),
        cls: statutToClass(statut),
        statut: (Array.isArray(statut) ? (statut[0] || "") : (statut || "")),
      });
    });

    return out;
  }

  // =========================
  // LANE ASSIGNMENT
  // =========================
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function assignLanes(list) {
    const sorted = [...list].sort((x, y) => x.aDay - y.aDay);
    const ends = [];
    const map = new Map();

    sorted.forEach((r) => {
      let lane = 0;
      while (lane < ends.length && ends[lane] > r.aDay) lane++;
      if (lane === ends.length) ends.push(r.endExcl);
      else ends[lane] = r.endExcl;
      map.set(r.id, lane);
    });

    return map;
  }

  // =========================
  // RENDER RESERVATIONS (custom)
  // =========================
  function renderReservations(calendarRoot, viewStart, viewEnd, reservations) {
    clearCustom(calendarRoot);

    const visible = reservations.filter((r) => overlaps(r.aDay, r.endExcl, viewStart, viewEnd));
    const laneById = assignLanes(visible);

    // ✅ LOGIQUE ORIGINALE : 1 label par réservation, sur le 1er jour visible
    const labelDayById = new Map();
    visible.forEach((r) => {
      const first = r.aDay < viewStart ? viewStart : r.aDay;
      labelDayById.set(r.id, toYMD(first));
    });

    visible.forEach((r) => {
      const lane = laneById.get(r.id) ?? 0;
      const topPx = lane * (LANE_H + LANE_GAP);

      for (let d = new Date(r.aDay); d <= r.dDay; d = addDays(d, 1)) {
        if (d < viewStart || d >= viewEnd) continue;

        const ymd = toYMD(d);
        const cell = calendarRoot.querySelector(`.fc-daygrid-day[data-date="${ymd}"]`);
        if (!cell) continue;

        ensureLayers(cell);
        const lanes = cell.querySelector(".coge-lanes");
        const labels = cell.querySelector(".coge-label-layer");

        const bar = document.createElement("div");
        bar.className = `coge-bar ${r.cls}`;
        bar.style.top = `${topPx}px`;

        if (ymd === r.arrivee) bar.classList.add("coge-right", "coge-start"); // arrivée PM
        else if (ymd === r.depart) bar.classList.add("coge-left", "coge-end"); // départ AM
        else bar.classList.add("coge-full", "coge-mid");

        // ✅ Info-bulle sur la barre (sans toucher au texte affiché)
        if (typeof tippy === "function") {
          tippy(bar, {
            content:
              `<strong>${r.title}</strong><br>` +
              `Arrivée : ${formatDateFR(r.aDay)}<br>` +
              `Départ : ${formatDateFR(r.dDay)}<br>` +
              `Statut : ${(r.statut || "—")}`,
            allowHTML: true,
            placement: "top",
            theme: "light-border",
          });
        }

        lanes.appendChild(bar);

        // ✅ Label posé UNE SEULE FOIS (logique d'origine)
        if (labelDayById.get(r.id) === ymd) {
          const label = document.createElement("div");
          label.className = "coge-label";
          label.style.top = `${topPx}px`;
          label.style.width = `${LABEL_WIDTH_PX}px`;
          label.textContent = r.title; // ⚠️ NOM STRICTEMENT IDENTIQUE

          if (ymd === r.arrivee) label.classList.add("coge-label-right");
          else label.classList.add("coge-label-full");

          labels.appendChild(label);
        }
      }
    });
  }

  // =========================
  // VACANCES : map date -> tooltip(s)
  // =========================
  const VAC_CELL_MAP = new Map();

  function addVacancesCells(records) {
    VAC_CELL_MAP.clear();

    records.forEach((rec) => {
      const f = rec.fields || {};
      const nom = f["Nom de la période"] || "Vacances scolaires";
      const debut = parseDateOnlyLocal(f["Date de début"]);
      const fin = parseDateOnlyLocal(f["Date de fin"]);
      const tirage = parseDateOnlyLocal(f["Date de tirage au sort"]);

      // Période (colorier chaque jour)
      if (debut && fin) {
        const tip = `Période : ${nom} du ${formatDateFR(debut)} au ${formatDateFR(fin)}`;

        for (let d = new Date(debut); d <= fin; d = addDays(d, 1)) {
          const key = toYMD(d);
          if (!VAC_CELL_MAP.has(key)) VAC_CELL_MAP.set(key, { tooltips: new Set() });
          VAC_CELL_MAP.get(key).tooltips.add(tip);
        }
      }

      // 🎲 Tirage au sort : event FullCalendar
      if (tirage) {
        calendar.addEvent({
          title: "🎲",
          start: tirage,
          allDay: true,
          color: "#f4a261",
          extendedProps: {
            tooltip: `Tirage au sort : ${nom} - ${formatDateFR(tirage)}`,
          },
        });
      }
    });

    console.log("Vacances (jours marqués):", VAC_CELL_MAP.size);
  }

  // Appliquer le fond jaune + tooltip sur les cellules visibles
  function applyVacancesToVisibleCells(viewStart, viewEnd) {
    for (let d = new Date(viewStart); d < viewEnd; d = addDays(d, 1)) {
      const key = toYMD(d);
      const cell = calendarEl.querySelector(`.fc-daygrid-day[data-date="${key}"]`);
      if (!cell) continue;

      if (!VAC_CELL_MAP.has(key)) {
        cell.classList.remove("coge-vacances");
        continue;
      }

      cell.classList.add("coge-vacances");

      const info = VAC_CELL_MAP.get(key);
      const tooltipText = Array.from(info.tooltips).join("<br>");

      if (cell.dataset.cogeVacTooltip !== tooltipText) {
        cell.dataset.cogeVacTooltip = tooltipText;
        if (cell._tippy) cell._tippy.destroy();

        tippy(cell, {
          content: tooltipText,
          allowHTML: true,
          placement: "top",
          theme: "light-border",
        });
      }
    }
  }

  // =========================
  // FULLCALENDAR INIT + TOOLTIP events
  // =========================
  let RESA_CACHE = [];

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    locale: "fr",
    firstDay: 1,
    height: "auto",

    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth",
    },
    buttonText: { today: "Aujourd'hui", month: "Mois" },

    dayCellDidMount(info) {
      ensureLayers(info.el);
    },

    datesSet(info) {
      renderReservations(calendarEl, info.view.activeStart, info.view.activeEnd, RESA_CACHE);
      applyVacancesToVisibleCells(info.view.activeStart, info.view.activeEnd);
    },

    eventDidMount(info) {
      const tt = info.event.extendedProps && info.event.extendedProps.tooltip;
      if (!tt) return;

      info.el.style.pointerEvents = "auto";
      info.el.style.cursor = "help";

      tippy(info.el, {
        content: tt,
        placement: "top",
        theme: "light-border",
      });
    },
  });

  calendar.render();

  // =========================
  // CHARGEMENT (via Worker)
  // =========================
  (async () => {
    try {
      const resRecords = await fetchAllAirtableRecords(reservationsUrlBase);
      RESA_CACHE = airtableToReservations(resRecords);

      const vacRecords = await fetchAllAirtableRecords(vacancesUrlBase);
      addVacancesCells(vacRecords);

      renderReservations(calendarEl, calendar.view.activeStart, calendar.view.activeEnd, RESA_CACHE);
      applyVacancesToVisibleCells(calendar.view.activeStart, calendar.view.activeEnd);

      console.log(`OK Cavalaire: ${RESA_CACHE.length} réservations / ${vacRecords.length} vacances`);
    } catch (e) {
      console.error("Erreur API:", e);
      alert("Erreur API : voir console.");
    }
  })();
});
