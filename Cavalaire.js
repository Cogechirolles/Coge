/* =========================
   Cavalaire.js (COGE)
   FullCalendar - Month grid
   Affichage demi-journée:
   Arrivée = 12:00 (PM)
   Départ  = 12:00 (AM) (jour de sortie)
   ========================= */

document.addEventListener("DOMContentLoaded", function () {
  /* ========= A CONFIGURER (tes variables existantes) =========
     Si tu as déjà ces variables plus haut dans ton fichier actuel,
     garde-les et supprime ce bloc.
  */
  const token = window.AIRTABLE_TOKEN || "XXX"; // ⚠️ évite de laisser une vraie clé dans un JS public
  const reservationsUrl = window.RESERVATIONS_URL || "XXX";
  const vacancesUrl = window.VACANCES_URL || "XXX";

  function formatDate(dateStr) {
    // dateStr: "YYYY-MM-DD"
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("fr-FR");
  }

  /* ========= Helpers dates (locales) ========= */
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

  function statutToClass(statut) {
    const s = (statut || "").toLowerCase();
    if (s.includes("valid")) return "coge-validee";
    if (s.includes("refus")) return "coge-refusee";
    return "coge-attente";
  }

  /* ========= Demi-journées dans les cellules ========= */
  function ensureHalves(dayCellEl) {
    const frame = dayCellEl.querySelector(".fc-daygrid-day-frame");
    if (!frame) return;
    if (frame.querySelector(".coge-halves")) return;

    frame.style.position = "relative";

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

  function clearCustomBars(calendarEl) {
    calendarEl.querySelectorAll(".coge-bar").forEach(el => el.remove());
  }

  function placeBar(info) {
    // On n’affiche en custom que les réservations
    if (info.event.extendedProps?.kind !== "reservation") return;

    // On cache l’event natif (mais pas les backgrounds vacances)
    info.el.classList.add("coge-hide-native");

    const part = info.event.extendedProps?.part || "middle"; // start/middle/end
    const dayCell = info.el.closest(".fc-daygrid-day");
    if (!dayCell) return;

    ensureHalves(dayCell);

    const am = dayCell.querySelector(".coge-am");
    const pm = dayCell.querySelector(".coge-pm");
    if (!am || !pm) return;

    const statutClass = info.event.extendedProps?.statutClass || "coge-attente";

    const makeBar = () => {
      const bar = document.createElement("div");
      bar.className = `coge-bar ${statutClass}`;
      if (part === "start") bar.classList.add("coge-start");
      else if (part === "end") bar.classList.add("coge-end");
      else bar.classList.add("coge-middle");

      bar.textContent = info.event.title;

      // Tooltip (tippy) : utile pour afficher statut / dates
      const tip = info.event.extendedProps?.tooltip;
      if (tip) {
        tippy(bar, {
          content: tip,
          placement: "top",
          theme: "light-border",
        });
      }
      return bar;
    };

    if (part === "start") {
      pm.appendChild(makeBar());
    } else if (part === "end") {
      am.appendChild(makeBar());
    } else {
      // middle : une barre en AM + une en PM pour faire “plein jour”
      const b1 = makeBar();
      const b2 = makeBar();
      am.appendChild(b1);
      pm.appendChild(b2);
    }
  }

  /* ========= Conversion 1 réservation Airtable -> segments start/middle/end =========
     Convention confirmée: "Date de fin" = jour de sortie (départ midi)
     => occupation: [arrivée 12:00 ; départ 12:00)
  */
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

    const arrDate = parseDateOnlyLocal(startRaw);
    const depDate = parseDateOnlyLocal(endRaw);

    let startDT = atHour(arrDate, 12);
    let endDT = atHour(depDate, 12);

    // Sécurité si données incohérentes (évite end<=start)
    if (endDT <= startDT) {
      endDT = atHour(addDays(depDate, 1), 12);
    }

    const tooltipBase =
      `Statut : ${statut || "En attente"}<br>` +
      `Arrivée : ${formatDate(startRaw)} (midi)<br>` +
      `Départ : ${formatDate(endRaw)} (midi)`;

    let segments = [];
    let day = new Date(arrDate); day.setHours(0, 0, 0, 0);
    const lastDay = new Date(depDate); lastDay.setHours(0, 0, 0, 0);

    while (day <= lastDay) {
      const day0 = atHour(day, 0);
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

      // Tronquer dans [startDT; endDT)
      if (segStart < startDT) segStart = startDT;
      if (segEnd > endDT) segEnd = endDT;

      if (segEnd > segStart) {
        segments.push({
          title,
          start: segStart,
          end: segEnd,
          allDay: false,
          extendedProps: {
            kind: "reservation",
            part,
            statutClass,
            tooltip: tooltipBase
          }
        });
      }

      day = addDays(day, 1);
    }

    return segments;
  }

  /* ========= Calendar init ========= */
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

    editable: false,
    selectable: false,
    displayEventTime: false,

    dayCellDidMount: function (info) {
      ensureHalves(info.el);
    },

    datesSet: function () {
      // Quand on change de mois: on nettoie nos barres custom (sinon doublons)
      clearCustomBars(calendarEl);
    },

    eventDidMount: function (info) {
      placeBar(info);
    }
  });

  calendar.render();

  /* ========= Charger les réservations ========= */
  fetch(reservationsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((response) => response.json())
    .then((data) => {
      const records = data.records || [];

      records.forEach((record) => {
        const fields = record.fields || {};
        const segs = recordToSegments(fields);

        segs.forEach(seg => calendar.addEvent(seg));
      });
    })
    .catch((error) => {
      console.error("Erreur lors de la récupération des événements:", error);
    });

  /* ========= Charger les périodes de vacances scolaires ========= */
  fetch(vacancesUrl, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(response => response.json())
    .then(data => {
      const records = data.records || [];

      records.forEach(record => {
        const fields = record.fields || {};
        const nom = fields["Nom de la période"] || "Vacances scolaires";
        const debut = fields["Date de début"];
        const fin = fields["Date de fin"];
        const tirage = fields["Date de tirage au sort"];

        // Vacances en fond
        if (debut && fin) {
          const finPlusUn = parseDateOnlyLocal(fin);
          finPlusUn.setDate(finPlusUn.getDate() + 1);

          calendar.addEvent({
            start: debut,
            end: finPlusUn.toISOString().split("T")[0],
            display: "background",
            color: "#fff3b0",
            extendedProps: {
              kind: "vacances",
              tooltip: `Période : ${nom} du ${formatDate(debut)} au ${formatDate(fin)}`
            }
          });
        }

        // Tirage au sort (emoji)
        if (tirage) {
          calendar.addEvent({
            title: "🎲",
            start: tirage,
            allDay: true,
            color: "#f4a261",
            extendedProps: {
              kind: "tirage",
              tooltip: `Tirage au sort : ${nom} - ${formatDate(tirage)}`
            }
          });
        }
      });

      // Tooltips sur événements vacances / tirage (optionnel)
      // Ici on se contente du tooltip sur les barres custom, mais tu peux aussi en mettre sur les events natifs.
    })
    .catch(error => {
      console.error("Erreur lors du chargement des vacances scolaires :", error);
    });
});
