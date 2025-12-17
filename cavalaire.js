/* ============================================================
   COGE – Cavalaire
   VERSION : 2025-12-17 15:40
   (si tu ne vois pas ce log dans la console, le fichier n’est
    PAS celui-ci → cache GitHub / navigateur)
============================================================ */
console.log("COGE Cavalaire JS chargé – VERSION 2025-12-17 15:40");

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
     HELPERS DATES (ROBUSTES)
  ============================================================ */
  function parseDateOnlyLocal(dateStr) {
    if (!dateStr) return null;
    if (typeof dateStr === "string" && dateStr.includes("T")) {
      dateStr = dateStr.split("T")[0];
    }
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
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

  function formatDateFR(dateStr) {
    const d = parseDateOnlyLocal(dateStr);
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
    calendarRoot
      .querySelectorAll(".coge-bar, .coge-label")
      .forEach((el) => el.remove());
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

      if (!resp.ok) {
        throw new Error("Airtable error " + resp.status);
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

  /* ============================================================
     AIRTABLE → RÉSERVATIONS
  ============================================================ */
  function airtableToReservations(records) {
    const out = [];

    records.forEach((rec) => {
      const f = rec.fields || {};
      const arrivee = f["Date de début"];
      const depart = f["Date de fin"];
      if (!arrivee || !depart) return;

      const aDay = parseDateOnlyLocal(arrivee);
      const dDay = parseDateOnlyLocal(depart);
      if (!aDay || !dDay || dDay < aDay) return;

      const nomAbonne = f["Nom de l'abonné"] || "";
      const nomExterieur = f["Nom de l’Extérieur"] || "";
      const title = nomExterieur
        ? `${nomExterieur} (extérieur : ${nomAbonne})`
        : nomAbonne;

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
      });
    });
    return out;
  }

  /* ============================================================
     LANE ASSIGNMENT
  ============================================================ */
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function assignLanes(resList) {
    const sorted = [...resList].sort((x, y) => x.aDay - y.aDay);
    const lanesEnd = [];
    const laneById = new Map();

    sorted.forEach((r) => {
      let lane = 0;
      while (lane < lanesEnd.length && lanesEnd[lane] > r.aDay) lane++;
      if (lane === lanesEnd.length) lanesEnd.push(r.endExcl);
      else lanesEnd[lane] = r.endExcl;
      laneById.set(r.id, lane);
    });
    return laneById;
  }

  /* ============================================================
     RENDER RÉSERVATIONS
  ============================================================ */
  function renderReservations(calendarRoot, viewStart, viewEnd, reservations) {
    clearCustom(calendarRoot);

    const visible = reservations.filter((r) =>
      overlaps(r.aDay, r.endExcl, viewStart, viewEnd)
    );
    const laneById = assignLanes(visible);

    const labelDayById = new Map();
    visible.forEach((r) => {
      const first = r.aDay < viewStart ? viewStart : r.aDay;
      labelDayById.set(r.id, toYMD(first));
    });

    visible.forEach((r) => {
      const lane = laneById.get(r.id);
      const topPx = lane * (LANE_H + LANE_GAP);

      let day = new Date(r.aDay);
      while (day <= r.dDay) {
        if (day >= viewStart && day < viewEnd) {
          const ymd = toYMD(day);
          const cell = calendarRoot.querySelector(
            `.fc-daygrid-day[data-date="${ymd}"]`
          );
          if (cell) {
            ensureLayers(cell);
            const frame = cell.querySelector(".coge-lanes");
            const labelLayer = cell.querySelector(".coge-label-layer");

            const bar = document.createElement("div");
            bar.className = `coge-bar ${r.cls}`;
            bar.style.top = `${topPx}px`;

            if (ymd === r.arrivee)
              bar.classList.add("coge-right", "coge-start");
            else if (ymd === r.depart)
              bar.classList.add("coge-left", "coge-end");
            else bar.classList.add("coge-full", "coge-mid");

            frame.appendChild(bar);

            if (labelDayById.get(r.id) === ymd) {
              const label = document.createElement("div");
              label.className = "coge-label";
              label.style.top = `${topPx}px`;
              label.style.width = `${LABEL_WIDTH_PX}px`;
              label.textContent = r.title;
              if (ymd === r.arrivee)
                label.classList.add("coge-label-right");
              else label.classList.add("coge-label-full");
              labelLayer.appendChild(label);
            }
          }
        }
        day = addDays(day, 1);
      }
    });
  }

  /* ============================================================
     VACANCES SCOLAIRES – CORRIGÉ (PLEINE PÉRIODE)
  ============================================================ */
  function addVacancesToCalendar(calendar, records) {
    records.forEach((rec) => {
      const f = rec.fields || {};
      const debut = parseDateOnlyLocal(f["Date de début"]);
      const fin = parseDateOnlyLocal(f["Date de fin"]);
      const tirage = parseDateOnlyLocal(f["Date de tirage au sort"]);
      const nom = f["Nom de la période"] || "Vacances scolaires";

      if (debut && fin) {
        const endBg = toYMD(addDays(fin, 1));

        calendar.addEvent({
          start: toYMD(debut),
          end: endBg,
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
      renderReservations(
        calendarEl,
        info.view.activeStart,
        info.view.activeEnd,
        RESA_CACHE
      ),
  });

  calendar.render();

  /* ============================================================
     CHARGEMENT AIRTABLE
  ============================================================ */
  (async () => {
    try {
      const resRecords = await fetchAllAirtableRecords(reservationsUrlBase);
      RESA_CACHE = airtableToReservations(resRecords);

      const vacRecords = await fetchAllAirtableRecords(vacancesUrlBase);
      addVacancesToCalendar(calendar, vacRecords);

      renderReservations(
        calendarEl,
        calendar.view.activeStart,
        calendar.view.activeEnd,
        RESA_CACHE
      );

      console.log(
        `Cavalaire OK : ${RESA_CACHE.length} réservations / ${vacRecords.length} vacances`
      );
    } catch (e) {
      console.error("Erreur Airtable", e);
      alert("Erreur Airtable – voir console");
    }
  })();
});
