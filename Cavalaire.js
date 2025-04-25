document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.getElementById("calendar");

  const token = "pat0NPQWRy7XD1hVk.1325bef1bcbdd202035cedcf62ebb69835ee997bfd5864b53e6224df2f596e6e";
  const baseId = "appBJ1MeKJnAOKwoy";

  const reservationsUrl = `https://api.airtable.com/v0/${baseId}/Réservations?pageSize=100&filterByFormula=${encodeURIComponent(
    `{Appartement}="Cavalaire"` 
  )}&view=Grid%20view`;

  const vacancesUrl = `https://api.airtable.com/v0/${baseId}/Vacances%20scolaires?pageSize=100`;

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
    events: [],
    buttonText: {
      today: "Aujourd'hui",
      month: "Mois",
    },
    allDayText: "Toute la journée",
    eventTimeFormat: {
      hour: "2-digit",
      minute: "2-digit",
      meridiem: false
    },
    eventLabelText: "Réservation",
    eventDidMount: function(info) {
      if (info.event.extendedProps.tooltip) {
        // Ajouter une info-bulle personnalisée
        tippy(info.el, {
          content: info.event.extendedProps.tooltip,
          placement: 'top',
          theme: 'light-border',
        });
      }
    }
  });

  calendar.render();

  // Appliquer un fond orange pâle à la date du jour après le rendu du calendrier
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // Format YYYY-MM-DD

  // Attendre que le calendrier soit entièrement chargé avant de cibler la date du jour
  setTimeout(() => {
    const todayCell = document.querySelector(`.fc-day[data-date="${todayStr}"]`);
    if (todayCell) {
      todayCell.style.backgroundColor = "#fff3b0"; // Orange pâle
    }
  }, 100); // Délai pour s'assurer que le calendrier est bien rendu

  // Fonction pour formater les dates en JJ-MM-AAAA
  function formatDate(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0'); // Les mois commencent à 0
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  // Charger les réservations
  fetch(reservationsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      const events = data.records
        .map((record) => {
          const fields = record.fields;

          const start = fields["Date de début"];
          const endRaw = fields["Date de fin"];

          if (!start || !endRaw) {
            console.warn("Date manquante pour l'enregistrement :", record);
            return null;
          }

          const end = new Date(endRaw);
          end.setDate(end.getDate() + 1);

          const nomAbonne = fields["Nom de l'abonné"] || "";
          const nomExterieur = fields["Nom de l’Extérieur"] || "";
          let title = nomExterieur ? `${nomExterieur} (extérieur : ${nomAbonne})` : nomAbonne;

          let statut = fields["Statut de la demande"];
          let color = "#3788d8";

          if (Array.isArray(statut)) {
            statut = statut[0];
          }

          if (statut === "Validée") {
            color = "#a8e6a2";
          } else if (statut === "En attente") {
            color = "#add8e6";
          } else if (statut === "Refusée") {
            color = "#f7b2b0";
          }

          return {
            title: title,
            start: start,
            end: end.toISOString().split("T")[0],
            color: color,
          };
        })
        .filter((event) => event !== null);

      events.forEach((e) => calendar.addEvent(e));
    })
    .catch((error) => {
      console.error("Erreur lors de la récupération des événements:", error);
    });

  // Charger les périodes de vacances scolaires
  fetch(vacancesUrl, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then(response => response.json())
    .then(data => {
      const eventsVacances = [];

      data.records.forEach(record => {
        const fields = record.fields;
        const nom = fields["Nom de la période"] || "Vacances scolaires";
        const debut = fields["Date de début"];
        const fin = fields["Date de fin"];
        const tirage = fields["Date de tirage au sort"];

        if (debut && fin) {
          const finPlusUn = new Date(fin);
          finPlusUn.setDate(finPlusUn.getDate() + 1);

          eventsVacances.push({
            start: debut,
            end: finPlusUn.toISOString().split("T")[0],
            display: "background",
            color: "#fff3b0",
            tooltip: `Période : ${nom} du ${formatDate(debut)} au ${formatDate(fin)}`,
          });
        }

        if (tirage) {
          eventsVacances.push({
            title: "🎲",
            start: tirage,
            color: "#f4a261",
            allDay: true,
            tooltip: `Tirage au sort : ${nom} - ${formatDate(tirage)}`
          });
        }
      });

      // Ajouter les événements de vacances et appliquer les info-bulles
      eventsVacances.forEach((event) => {
        const calendarEvent = calendar.addEvent(event);

        // Ajouter info-bulle pour les événements de vacances
        if (event.tooltip) {
          const eventEl = calendarEvent.el;
          tippy(eventEl, {
            content: event.tooltip,
            placement: 'top',
            theme: 'light-border',
          });
        }
      });
    })
    .catch(error => {
      console.error("Erreur lors du chargement des vacances scolaires :", error);
    });
});
