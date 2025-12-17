/* =========================
   Cavalaire.js (COGE)
   Vue mois + demi-journées
   Arrivée 12:00 -> Départ 12:00 (jour de sortie)
   ========================= */

(function () {
  // ====== 1) TES RÉSERVATIONS (à remplacer par tes vraies données) ======
  // Convention : depart = jour de sortie (départ à midi)
  // Exemple : arrivee "2025-08-02", depart "2025-08-09" => occupe du 02 12:00 au 09 12:00
  const RESERVATIONS = [
    { nom: "SCHWARTZ Sébastien", arrivee: "2025-07-28", depart: "2025-08-04", statut: "Validée" },
    { nom: "MOURIER Alexandre",  arrivee: "2025-08-04", depart: "2025-08-11", statut: "Validée" },
    { nom: "VITIELLO Sébastien", arrivee: "2025-08-11", depart: "2025-08-18", statut: "Validée" },
    { nom: "RACHEL Florent",     arrivee: "2025-08-18", depart: "2025-08-25", statut: "Validée" },
    { nom: "ROLLAND Camille",    arrivee: "2025-08-25", depart: "2025-09-01", statut: "Validée" },

    // Pour tester les couleurs :
    // { nom: "TEST Attente", arrivee: "2025-08-10", depart: "2025-08-12", statut: "En attente" },
    // { nom: "TEST Refus",   arrivee: "2025-08-20", depart: "2025-08-22", statut: "Refusée" },
  ];

  // ====== Helpers dates (locales, sans décalage UTC) ======
  function parseDateOnly(dateStr) {
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
  function statutClass(statut) {
    const s = (statut || "").toLowerCase();
    if (s.includes("refus")) return "coge-refusee";
    if (s.includes("valid")) return "coge-validee";
    return "coge-attente";
  }

  // ====== 2) Transformer une réservation en segments JOURNALIERS ======
  // Segments:
  // - start : PM du jour d'arrivée
  // - middle: jour complet
  // - end   : AM du jour de départ
  function reservationToSegments(res, idx) {
    const arrDate = parseDateOnly(res.arrivee);
    const depDate = parseDateOnly(res.depart);

    const startDT = atHour(arrDate, 12); // arrivée midi
    const endDT   = atHour(depDate, 12); // départ midi

    if (endDT <= startDT) return [];

    const colorClass = statutClass(res.statut);
    const groupId = `res-${idx}`;

    let segments = [];
    let day = new Date(arrDate); day.setHours(0,0,0,0);
    const lastDay = new Date(depDate); lastDay.setHours(0,0,0,0);

    while (day <= lastDay) {
      const day0  = atHour(day, 0);
      const day12 = atHour(day, 12);
      const next0 = atHour(addDays(day, 1), 0);

      let part = "middle";
      let segStart = day0;
      let segEnd = next0;

      if (sameDay(day, arrDate)) {
        part = "start";
        segStart = day12; // PM
        segEnd = next0;
      } else if (sameDay(day, depDate)) {
        part = "end";
        segStart = day0;  // AM
        segEnd = day12;
      }

      // tronquage sécurité
      if (segStart < startDT) segStart = startDT;
      if (segEnd > endDT) segEnd = endDT;

      if (segEnd > segStart) {
        segments.push({
          title: res.nom || "Réservation",
          start: segStart,
          end: segEnd,
          allDay: false,
          classNames: [colorClass],
          extendedProps: {
            groupId,
            part,              // start / middle / end
            statut: res.statut || "En attente"
          }
        });
      }

      day = addDays(day, 1);
    }

    return segments;
  }

  function buildAllSegments() {
    let out = [];
    RESERVATIONS.forEach((r, i) => {
      out.push(...reservationToSegments(r, i));
    });
    return out;
  }

  // ====== 3) Rendu demi-journée dans les cases ======
  function ensureHalves(dayCellEl) {
    const frame = dayCellEl.querySelector(".fc-daygrid-day-frame");
    if (!frame) return;

    // évite doublons
    if (frame.querySelector(".coge-halves")) return;

    frame.style.position = "relative";

    const halves = document.createElement("div");
    halves.className = "coge-halves";

    const am = document.createElement("div");
    am.className = "coge-half coge-am";
    am.setAttribute("data-half", "AM");

    const pm = document.createElement("div");
    pm.className = "coge-half coge-pm";
    pm.setAttribute("data-half", "PM");

    halves.appendChild(am);
    halves.appendChild(pm);
    frame.appendChild(halves);
  }

  function renderSegmentIntoCell(info) {
    // On place nos segments dans AM / PM / FULL
    // - part=start  -> PM
    // - part=end    -> AM
    // - part=middle -> AM + PM (barre sur les deux)
    const part = info.event.extendedProps?.part || "middle";
    const statut = info.event.extendedProps?.statut || "En attente";

    // On récupère la cellule du jour correspondant au segment
    const dayCell = info.el.closest(".fc-daygrid-day");
    if (!dayCell) return;

    ensureHalves(dayCell);

    const am = dayCell.querySelector(".coge-am");
    const pm = dayCell.querySelector(".coge-pm");
    if (!am || !pm) return;

    const bar = document.createElement("div");
    bar.className = "coge-bar";

    // couleur
    const cls = (info.event.classNames && info.event.classNames[0]) ? info.event.classNames[0] : "coge-attente";
    bar.classList.add(cls);

    // extrémités arrondies (pour effet “barre continue”)
    if (part === "start") bar.classList.add("coge-start");
    else if (part === "end") bar.classList.add("coge-end");
    else bar.classList.add("coge-middle");

    // texte : tu peux le simplifier si tu veux (ex: juste NOM)
    bar.textContent = info.event.title;

    if (part === "start") {
      pm.appendChild(bar);
    } else if (part === "end") {
      am.appendChild(bar);
    } else {
      // middle : on met une barre dans AM et une barre dans PM
      const bar2 = bar.cloneNode(true);
      am.appendChild(bar);
      pm.appendChild(bar2);
    }
  }

  // ====== 4) Initialisation FullCalendar ======
  document.addEventListener("DOMContentLoaded", function () {
    const el = document.getElementById("calendar");
    if (!el) {
      console.error("Erreur: #calendar introuvable");
      return;
    }

    const events = buildAllSegments();

    const calendar = new FullCalendar.Calendar(el, {
      locale: "fr",
      firstDay: 1,
      initialView: "dayGridMonth",
      height: "auto",

      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth"
      },

      editable: false,
      selectable: false,
      displayEventTime: false,

      events: events,

      // On injecte AM/PM dans chaque case jour
      dayCellDidMount: function (info) {
        ensureHalves(info.el);
      },

      // On rend nos “barres” custom, et on ignore le rendu natif (caché par CSS)
      eventDidMount: function (info) {
        renderSegmentIntoCell(info);
      }
    });

    calendar.render();
  });
})();
