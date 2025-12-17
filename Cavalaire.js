document.addEventListener("DOMContentLoaded", function () {
  // ======= A REMPLACER par tes vraies valeurs (ou mets-les en window.xxx) =======
  const token = window.AIRTABLE_TOKEN || "XXX";
  const reservationsUrl = window.RESERVATIONS_URL || "XXX";
  const vacancesUrl = window.VACANCES_URL || "XXX";

  // ======= Utils =======
  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("fr-FR");
  }

  function parseDateOnlyLocal(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  function atHour(d, hour) {
    const x = new Date(d);
    x.setHours(hour, 0, 0, 0);
    return x;
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }
  function toYMD(d) {
    // d = Date locale
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function statutToClass(statut) {
    const s = (statut || "").toLowerCase();
    if (s.includes("valid")) return "coge-validee";
    if (s.includes("refus")) return "coge-refusee";
    return "coge-attente";
  }

  // ======= On DESSINE les réservations nous-mêmes (pas d'events FC pour ça) =======
  let reservationSegments = []; // [{date:'YYYY-MM-DD', part:'start|middle|end', title, statutClass, tooltip}]

  function ensureHalves(dayCellEl) {
    const frame = dayCellEl.querySelector(".fc-daygrid-day-frame");
    if (!frame) return;

    // évite doublons
    if (!frame.querySelector(".coge-halves")) {
      const halves = document.createElement("div");
      halves.className = "coge-halves";

      const am = document.createElement("div");
      am.className = "coge-half coge-am";

      const pm = document.createElement("div");
      pm.className = "coge-half coge-pm";

      halves.appendChild(am);
      halves.appendChild(pm);
      frame.appendChild(halves);
    }

    if (!frame.querySelector(".coge-full")) {
      const full = document.createElement("div");
      full.className = "coge-full";
      frame.appendChild(full);
    }
  }

  function clearAllBars(calendarEl) {
    calendarEl.querySelectorAll(".coge-bar").forEach(el => el.remove());
  }

  function renderReservationsOnView(calendarEl, viewStart, viewEnd) {
    // Nettoie puis redessine (évite les doublons)
    clearAllBars(calendarEl);

    // Pour chaque segment, on cherche la cellule du jour correspondant
    reservationSegments.forEach(seg => {
      // Filtre sur la plage visible (optionnel mais propre)
      // viewStart / viewEnd sont des Dates
      const segDate = parseDateOnlyLocal(seg.date);
      if (segDate < viewStart || segDate >= viewEnd) return;

      const cell = calendarEl.querySelector(`.fc-daygrid-day[data-date="${seg.date}"]`);
      if (!cell) return;

      ensureHalves(cell);

      const frame = cell.querySelector(".fc-daygrid-day-frame");
      const am = frame.querySelector(".coge-am");
      const pm = frame.querySelector(".coge-pm");
      const full = frame.querySelector(".coge-full");

      const bar = document.createElement("div");
      bar.className = `coge-bar ${seg.statutClass}`;
      if (seg.part === "start") bar.classList.add("coge-start");
      else if (seg.part === "end") bar.classList.add("coge-end");
      else bar.classList.add("coge-middle");

      bar.textContent = seg.title;

      if (seg.tooltip) {
        tippy(bar, {
          content: seg.tooltip,
          placement: "top",
          theme: "light-border",
        });
      }

      if (seg.part === "start") {
        pm.appendChild(bar);   // arrivée => PM
      } else if (seg.part === "end") {
        am.appendChild(bar);   // départ => AM
      } else {
        full.appendChild(bar); // jours pleins => une seule barre
      }
    });
  }

  function recordToSegments(fields) {
    const startRaw = fields["Date de début"];
    const endRaw = fields["Date de fin"];
    if (!startRaw || !endRaw) return [];

    const nomAbonne = fields["Nom de l'abonné"] || "";
    const nomExterieur = fields["Nom de l’Extérieur"] || "";
    const title = nomExterieur ? `${nomExterieur} (extérieur : ${nomAbonne})` : nomAbonne;

    let statut = fields["Statut de la demande"];
    if (Array.isArray(statut)) statut = statut[0];

    const statutClass = statutToClass(statut);

    // Convention confirmée : Date de fin = jour de sortie (départ midi)
    // période occupée = [arrivée 12:00 ; départ 12:00)
    const arrDate = parseDateOnlyLocal(startRaw);
    const depDate = parseDateOnlyLocal(endRaw);

    const startDT = atHour(arrDate, 12);
    const endDT = atHour(depDate, 12);

    if (endDT <= startDT) return []; // sécurité

    const tooltip =
      `Statut : ${statut || "En attente"}<br>` +
      `Arrivée : ${formatDate(startRaw)} (midi)<br>` +
      `Départ : ${formatDate(endRaw)} (midi)`;

    const segments = [];

    let day = new Date(arrDate); day.setHours(0,0,0,0);
    const lastDay = new Date(depDate); lastDay.setHours(0,0,0,0);

    while (day <= lastDay) {
      let part = "middle";
      if (sameDay(day, arrDate)) part = "start";
      else if (sameDay(day, depDate)) part = "end";

      segments.push({
        date: toYMD(day),
        part,
        title,
        statutClass,
        tooltip
      });

      day = addDays(day, 1);
    }

    return segments;
  }

  // ======= FullCalendar (servira surtout pour la grille + vacances + 🎲) =======
  const calendarEl = document.getElementById("calendar");

  const calendar = new FullCalendar.Calendar(calendarEl, {
    locale: "fr",
    firstDay: 1,
    initialView: "dayGridMonth",
    height: "auto",

    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth"
    },

    // Force le texte en français même si le locale ne charge pas
    buttonText: {
      today: "Aujourd'hui",
      month: "Mois"
    },

    editable: false,
    selectable: false,
    displayEventTime: false,

    dayCellDidMount: function (info) {
      ensureHalves(info.el);
    },

    datesSet: function (info) {
      // Redessine les réservations à chaque changement de mois
      renderReservationsOnView(calendarEl, info.view.activeStart, info.view.activeEnd);
    },

    eventDidMount: function (info) {
      // Tooltips sur les events FullCalendar (vacances / 🎲)
      const tip = info.event.extendedProps?.tooltip;
      if (tip) {
        tippy(info.el, {
          content: tip,
          placement: "top",
          theme: "light-border",
        });
      }
    }
  });

  calendar.render();

  // ======= Charger les réservations Airtable =======
  fetch(reservationsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.json())
    .then(data => {
      reservationSegments = [];
      const records = data.records || [];

      records.forEach(record => {
        const fields = record.fields || {};
        reservationSegments.push(...recordToSegments(fields));
      });

      // Dessine immédiatement sur la vue courante
      renderReservationsOnView(calendarEl, calendar.view.activeStart, calendar.view.activeEnd);
    })
    .catch(err => console.error("Erreur réservations:", err));

  // ======= Charger les vacances scolaires (background) + 🎲 =======
  fetch(vacancesUrl, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(r => r.json())
    .then(data => {
      const records = data.records || [];

      records.forEach(record => {
        const fields = record.fields || {};
        const nom = fields["Nom de la période"] || "Vacances scolaires";
        const debut = fields["Date de début"];
        const fin = fields["Date de fin"];
        const tirage = fields["Date de tirage au sort"];

        if (debut && fin) {
          const finPlusUn = parseDateOnlyLocal(fin);
          finPlusUn.setDate(finPlusUn.getDate() + 1);

          calendar.addEvent({
            start: debut,
            end: finPlusUn.toISOString().split("T")[0],
            display: "background",
            color: "#fff3b0",
            extendedProps: {
              tooltip: `Période : ${nom} du ${formatDate(debut)} au ${formatDate(fin)}`
            }
          });
        }

        if (tirage) {
          calendar.addEvent({
            title: "🎲",
            start: tirage,
            allDay: true,
            color: "#f4a261",
            extendedProps: {
              tooltip: `Tirage au sort : ${nom} - ${formatDate(tirage)}`
            }
          });
        }
      });
    })
    .catch(err => console.error("Erreur vacances:", err));
});
