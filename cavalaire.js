document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.getElementById("calendar");

  // =========================
  // CONFIG AIRTABLE (reprend ta logique)
  // =========================
  const token = "pat0NPQWRy7XD1hVk.1325bef1bcbdd202035cedcf62ebb69835ee997bfd5864b53e6224df2f596e6e";
  const baseId = "appBJ1MeKJnAOKwoy";

  // Réservations Cavalaire
  const reservationsUrlBase =
    `https://api.airtable.com/v0/${baseId}/Réservations` +
    `?pageSize=100` +
    `&filterByFormula=${encodeURIComponent(`{Appartement}="Cavalaire"`)}&view=Grid%20view`;

  // Vacances scolaires
  const vacancesUrlBase =
    `https://api.airtable.com/v0/${baseId}/Vacances%20scolaires?pageSize=100`;

  // =========================
  // PARAMS AFFICHAGE
  // =========================
  const LANE_H = 16;
  const LANE_GAP = 2;
  const LABEL_WIDTH_PX = 420;

  // =========================
  // HELPERS DATES
  // =========================
  function parseDateOnlyLocal(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function formatDateFR(dateStr) {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  // =========================
  // CLASSES COULEURS
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
  // FETCH AIRTABLE (pagination offset)
  // =========================
  async function fetchAllAirtableRecords(urlBase) {
    const all = [];
    let url = urlBase;

    while (true) {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`Airtable error ${resp.status}: ${txt || resp.statusText}`);
      }

      const data = await resp.json();
      if (Array.isArray(data.records)) all.push(...data.records);

      if (data.offset) {
        const sep = urlBase.includes("?") ? "&" : "?";
        url = `${urlBase}${sep}offset=${encodeURIComponent(data.offset)}`;
      } else {
        break;
      }
    }

    return all;
  }

  // =========================
  // TRANSFORM AIRTABLE -> RESERVATIONS (pour notre rendu custom)
  // =========================
  function airtableToReservations(records) {
    const out = [];

    records.forEach((rec) => {
      const f = rec.fields || {};

      const arrivee = f["Date de début"];
      const depart = f["Date de fin"];
      if (!arrivee || !depart) return;

      const aDay = parseDateOnlyLocal(arrivee);
      const dDay = parseDateOnlyLocal(depart);
      if (isNaN(aDay) || isNaN(dDay)) return;
      if (dDay < aDay) return;

      const nomAbonne = f["Nom de l'abonné"] || "";
      const nomExterieur = f["Nom de l’Extérieur"] || "";
      const title = nomExterieur ? `${nomExterieur} (extérieur : ${nomAbonne})` : nomAbonne;

      let statut = f["Statut de la demande"];
      if (Array.isArray(statut)) statut = statut[0];

      out.push({
        id: rec.id,
        title: title || "(Sans nom)",
        arrivee,
        depart,
        aDay,
        dDay,
        endExcl: addDays(dDay, 1), // intervalle [arrivee, depart+1)
        cls: statutToClass(statut),
      });
    });

    return out;
  }

  // =========================
  // LANE ASSIGNMENT STABLE
  // =========================
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function assignLanes(resList) {
    const sorted = [...resList].sort((x, y) => {
      const ax = x.aDay.getTime(), ay = y.aDay.getTime();
      if (ax !== ay) return ax - ay;
      return (x.title || "").localeCompare(y.title || "");
    });

    const lanesEnd = [];
    const laneById = new Map();

    sorted.forEach((r) => {
      let lane = 0;
      while (lane < lanesEnd.length && !(lanesEnd[lane] <= r.aDay)) lane++;
      if (lane === lanesEnd.length) lanesEnd.push(r.endExcl);
      else lanesEnd[lane] = r.endExcl;
      laneById.set(r.id, lane);
    });

    return laneById;
  }

  // =========================
  // RENDER CUSTOM RESERVATIONS
  // =========================
  function renderReservations(calendarRoot, viewStart, viewEnd, reservations) {
    clearCustom(calendarRoot);

    const visible = reservations.filter((r) => overlaps(r.aDay, r.endExcl, viewStart, viewEnd));
    const laneById = assignLanes(visible);

    // label une fois : premier jour visible dans la vue
    const labelDayById = new Map();
    visible.forEach((r) => {
      const first = (r.aDay < viewStart) ? new Date(viewStart) : new Date(r.aDay);
      first.setHours(0, 0, 0, 0);
      labelDayById.set(r.id, toYMD(first));
    });

    visible.forEach((r) => {
      const lane = laneById.get(r.id) ?? 0;
      const topPx = lane * (LANE_H + LANE_GAP);

      let day = new Date(r.aDay); day.setHours(0, 0, 0, 0);
      const last = new Date(r.dDay); last.setHours(0, 0, 0, 0);

      while (day <= last) {
        if (day < viewStart || day >= viewEnd) { day = addDays(day, 1); continue; }

        const ymd = toYMD(day);
        const cell = calendarRoot.querySelector(`.fc-daygrid-day[data-date="${ymd}"]`);
        if (!cell) { day = addDays(day, 1); continue; }

        ensureLayers(cell);

        const frame = cell.querySelector(".fc-daygrid-day-frame");
        const lanes = frame.querySelector(".coge-lanes");
        const labelLayer = cell.querySelector(".coge-label-layer");

        const isStart = (ymd === r.arrivee);
        const isEnd = (ymd === r.depart);

        // --- barres ---
        if (isStart && isEnd) {
          // arrivée+départ même jour (rare) : 2 demi-barres
          const bL = document.createElement("div");
          bL.className = `coge-bar ${r.cls} coge-left coge-start`;
          bL.style.top = `${topPx}px`;
          lanes.appendChild(bL);

          const bR = document.createElement("div");
          bR.className = `coge-bar ${r.cls} coge-right coge-end`;
          bR.style.top = `${topPx}px`;
          lanes.appendChild(bR);
        } else {
          const bar = document.createElement("div");
          bar.className = `coge-bar ${r.cls}`;
          bar.style.top = `${topPx}px`;

          if (isStart) bar.classList.add("coge-right", "coge-start"); // arrivée PM
          else if (isEnd) bar.classList.add("coge-left", "coge-end"); // départ AM
          else bar.classList.add("coge-full", "coge-mid");

          lanes.appendChild(bar);
        }

        // --- label (1 fois) ---
        if (labelDayById.get(r.id) === ymd) {
          const label = document.createElement("div");
          label.className = "coge-label";
          label.style.top = `${topPx}px`;
          label.style.width = `${LABEL_WIDTH_PX}px`;
          label.textContent = r.title;

          // si jour d'arrivée PM, démarre après le blanc
          if (isStart && !isEnd) label.classList.add("coge-label-right");
          else label.classList.add("coge-label-full");

          labelLayer.appendChild(label);
        }

        day = addDays(day, 1);
      }
    });
  }

  // =========================
  // VACANCES -> FullCalendar events (background + 🎲)
  // =========================
  function addVacancesToCalendar(calendar, records) {
    const events = [];

    records.forEach((rec) => {
      const f = rec.fields || {};
      const nom = f["Nom de la période"] || "Vacances scolaires";
      const debut = f["Date de début"];
      const fin = f["Date de fin"];
      const tirage = f["Date de tirage au sort"];

      if (debut && fin) {
        const finPlusUn = new Date(fin);
        finPlusUn.setDate(finPlusUn.getDate() + 1);

        events.push({
          start: debut,
          end: finPlusUn.toISOString().split("T")[0],
          display: "background",
          color: "#fff3b0",
          tooltip: `Période : ${nom} du ${formatDateFR(debut)} au ${formatDateFR(fin)}`,
        });
      }

      if (tirage) {
        events.push({
          title: "🎲",
          start: tirage,
          allDay: true,
          color: "#f4a261",
          tooltip: `Tirage au sort : ${nom} - ${formatDateFR(tirage)}`,
        });
      }
    });

    events.forEach((e) => calendar.addEvent(e));
  }

  // =========================
  // FULLCALENDAR INIT
  // =========================
  let RESA_CACHE = []; // reservations pour le rendu custom

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

    // Tooltips pour vacances (events FullCalendar)
    eventDidMount: function (info) {
      if (info.event.extendedProps && info.event.extendedProps.tooltip) {
        tippy(info.el, {
          content: info.event.extendedProps.tooltip,
          placement: "top",
          theme: "light-border",
        });
      }
    },

    dayCellDidMount: function (info) {
      ensureLayers(info.el);
    },

    datesSet: function (info) {
      // redessine les réservations custom quand on change de mois
      renderReservations(calendarEl, info.view.activeStart, info.view.activeEnd, RESA_CACHE);
    },
  });

  calendar.render();

  // Appliquer un fond orange pâle à la date du jour (comme ton ancienne version)
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  setTimeout(() => {
    const todayCell = document.querySelector(`.fc-daygrid-day[data-date="${todayStr}"]`);
    if (todayCell) todayCell.style.backgroundColor = "#fff3b0";
  }, 100);

  // =========================
  // CHARGEMENT AIRTABLE
  // =========================
  (async () => {
    try {
      // 1) Réservations (custom)
      const resRecords = await fetchAllAirtableRecords(reservationsUrlBase);
      RESA_CACHE = airtableToReservations(resRecords);

      // 2) Vacances (FullCalendar events background)
      const vacRecords = await fetchAllAirtableRecords(vacancesUrlBase);
      addVacancesToCalendar(calendar, vacRecords);

      // 3) Premier rendu sur la vue courante
      renderReservations(calendarEl, calendar.view.activeStart, calendar.view.activeEnd, RESA_CACHE);

      console.log(`OK Cavalaire: ${RESA_CACHE.length} réservations chargées / ${vacRecords.length} vacances.`);
    } catch (e) {
      console.error("Erreur Airtable:", e);
      alert("Erreur Airtable : vérifie la connexion / token / baseId / noms de champs.");
    }
  })();
});
