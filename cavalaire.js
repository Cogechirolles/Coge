/* ============================================================
   COGE – Cavalaire
   VERSION : 2025-12-17 16:20
============================================================ */
console.log("COGE Cavalaire JS chargé – VERSION 2025-12-17 16:20");

document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.getElementById("calendar");

  /* ============================================================
     CONFIG AIRTABLE
  ============================================================ */
  const token = "pat0NPQWRy7XD1hVk.1325bef1bcbdd202035cedcf62ebb69835ee997bfd5864b53e6224df2f596e6e";
  const baseId = "appBJ1MeKJnAOKwoy";

  const reservationsUrlBase =
    `https://api.airtable.com/v0/${baseId}/Réservations` +
    `?pageSize=100` +
    `&filterByFormula=${encodeURIComponent(`{Appartement}="Cavalaire"`)}&view=Grid%20view`;

  const vacancesUrlBase =
    `https://api.airtable.com/v0/${baseId}/Vacances%20scolaires?pageSize=100`;

  /* ============================================================
     PARAMÈTRES AFFICHAGE
  ============================================================ */
  const LANE_H = 16;
  const LANE_GAP = 2;
  const LABEL_WIDTH_PX = 420;

  /* ============================================================
     HELPERS DATES (ULTRA ROBUSTES)
  ============================================================ */
  function parseDateOnlyLocal(value) {
    if (!value) return null;

    // Déjà une Date
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    // Timestamp
    if (typeof value === "number") {
      const d = new Date(value);
      if (isNaN(d)) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    // String
    if (typeof value === "string") {
      const clean = value.includes("T") ? value.split("T")[0] : value;

      if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        const [y, m, d] = clean.split("-").map(Number);
        return new Date(y, m - 1, d);
      }

      const d = new Date(value);
      if (isNaN(d)) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    // Fallback
    const d = new Date(value);
    if (isNaN(d)) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

  /* ============================================================
     STATUT → COULEUR
  ============================================================ */
  function statutToClass(statut) {
    const s = (statut || "").toLowerCase();
    if (s.includes("valid")) return "coge-validee";
    if (s.includes("refus")) return "coge-refusee";
    return "coge-attente";
  }

  /* ============================================================
     CALQUES DOM
  ============================================================ */
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

  /* ============================================================
     FETCH AIRTABLE (pagination)
  ============================================================ */
  async function fetchAllAirtableRecords(urlBase) {
    const all = [];
    let url = urlBase;

    while (true) {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) throw new Error("Airtable error " + resp.status);

      const data = await resp.json();
      if (Array.isArray(data.records)) all.push(...data.records);

      if (data.offset) {
        const sep = urlBase.includes("?") ? "&" : "?";
        url = `${urlBase}${sep}offset=${encodeURIComponent(data.offset)}`;
      } else break;
    }
    return all;
  }

  /* ============================================================
     AIRTABLE → RÉSERVATIONS
  ============================================================ */
  function airtableToReservations(records) {
    return records.flatMap((rec) => {
      const f = rec.fields || {};
      const a = parseDateOnlyLocal(f["Date de début"]);
      const d = parseDateOnlyLocal(f["Date de fin"]);
      if (!a || !d || d < a) return [];

      const nomAbonne = f["Nom de l'abonné"] || "";
      const nomExt = f["Nom de l’Extérieur"] || "";
      const title = nomExt ? `${nomExt} (extérieur : ${nomAbonne})` : nomAbonne;

      let statut = f["Statut de la demande"];
      if (Array.isArray(statut)) statut = statut[0];

      return [{
        id: rec.id,
        title: title || "(Sans nom)",
        arrivee: toYMD(a),
        depart: toYMD(d),
        aDay: a,
        dDay: d,
        endExcl: addDays(d, 1),
        cls: statutToClass(statut),
      }];
    });
  }

  /* ============================================================
     LANE ASSIGNMENT
  ============================================================ */
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

  /* ============================================================
     RENDER RÉSERVATIONS
  ============================================================ */
  function renderReservations(calendarRoot, viewStart, viewEnd, reservations) {
    clearCustom(calendarRoot);

    const visible = reservations.filter((r) =>
      overlaps(r.aDay, r.endExcl, viewStart, viewEnd)
    );
    const lanes = assignLanes(visible);

    const labelDay = new Map();
    visible.forEach((r) => {
      const first = r.aDay < viewStart ? viewStart : r.aDay;
      labelDay.set(r.id, toYMD(first));
    });

    visible.forEach((r) => {
      const lane = lanes.get(r.id);
      const top = lane * (LANE_H + LANE_GAP);

      for (let d = new Date(r.aDay); d <= r.dDay; d = addDays(d, 1)) {
        if (d < viewStart || d >= viewEnd) continue;

        const ymd = toYMD(d);
        const cell = calendarRoot.querySelector(
          `.fc-daygrid-day[data-date="${ymd}"]`
        );
        if (!cell) continue;

        ensureLayers(cell);
        const frame = cell.querySelector(".coge-lanes");
        const labels = cell.querySelector(".coge-label-layer");

        const bar = document.createElement("div");
        bar.className = `coge-bar ${r.cls}`;
        bar.style.top = `${top}px`;

        if (ymd === r.arrivee) bar.classList.add("coge-right", "coge-start");
        else if (ymd === r.depart) bar.classList.add("coge-left", "coge-end");
        else bar.classList.add("coge-full", "coge-mid");

        frame.appendChild(bar);

        if (labelDay.get(r.id) === ymd) {
          const label = document.createElement("div");
          label.className = "coge-label";
          label.style.top = `${top}px`;
          label.style.width = `${LABEL_WIDTH_PX}px`;
          label.textContent = r.title;
          label.classList.add(
            ymd === r.arrivee ? "coge-label-right" : "coge-label-full"
          );
          labels.appendChild(label);
        }
      }
    });
  }

  /* ============================================================
     VACANCES SCOLAIRES (CORRIGÉES)
  ============================================================ */
  function addVacancesToCalendar(calendar, records) {
    records.forEach((rec) => {
      const f = rec.fields || {};
      const debut = parseDateOnlyLocal(f["Date de début"]);
      const fin = parseDateOnlyLocal(f["Date de fin"]);
      const tirage = parseDateOnlyLocal(f["Date de tirage au sort"]);
      const nom = f["Nom de la période"] || "Vacances scolaires";

      if (debut && fin) {
        calendar.addEvent({
          start: toYMD(debut),
          end: toYMD(addDays(fin, 1)),
          display: "background",
          allDay: true,
          color: "#fff3b0",
          tooltip: `Période : ${nom} du ${formatDateFR(debut)} au ${formatDateFR(fin)}`,
        });
      }

      if (tirage) {
        calendar.addEvent({
          title: "🎲",
          start: toYMD(tirage),
          allDay: true,
          color: "#f4a261",
          tooltip: `Tirage au sort : ${nom} - ${formatDateFR(tirage)}`,
        });
      }
    });
  }

  /* ============================================================
     FULLCALENDAR INIT
  ============================================================ */
  let RESA_CACHE = [];

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    locale: "fr",
    firstDay: 1,
    height: "auto",
    datesSet: (info) =>
      renderReservations(calendarEl, info.view.activeStart, info.view.activeEnd, RESA_CACHE),
  });

  calendar.render();

  /* ============================================================
     CHARGEMENT AIRTABLE
  ============================================================ */
  (async () => {
    try {
      RESA_CACHE = airtableToReservations(
        await fetchAllAirtableRecords(reservationsUrlBase)
      );

      addVacancesToCalendar(
        calendar,
        await fetchAllAirtableRecords(vacancesUrlBase)
      );

      renderReservations(
        calendarEl,
        calendar.view.activeStart,
        calendar.view.activeEnd,
        RESA_CACHE
      );

      console.log("Cavalaire OK – données chargées");
    } catch (e) {
      console.error("Erreur Airtable", e);
      alert("Erreur Airtable – voir console");
    }
  })();
});
