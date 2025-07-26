// Helper function to format time for HTML time input (HH:MM format)
function formatTimeForInput(timeString) {
  if (!timeString || timeString.length !== 4) return '08:00';
  return timeString.substring(0, 2) + ':' + timeString.substring(2);
}





// Global variables
let calendar;
let sergeantAfspStatus = {}; // Track AFSP status for each sergeant

document.addEventListener('DOMContentLoaded', function () {
  const calendarEl = document.getElementById('calendar');

  if (!calendarEl) {
    return;
  }

  // Create single continuous timeline calendar
  calendarEl.innerHTML = '';
  const timelineDiv = document.createElement('div');
  timelineDiv.className = 'timeline-calendar';
  timelineDiv.id = 'timeline-calendar';
  calendarEl.appendChild(timelineDiv);

  // Create single continuous calendar
  try {
    calendar = new FullCalendar.Calendar(timelineDiv, {
      initialView: 'dayGridMonth',
      initialDate: '2025-08-01',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,dayGridWeek'
      },
      editable: true,
      selectable: true,
      eventColor: '#378006',
      events: [],
      dayMaxEvents: false,
      height: 'auto',
      aspectRatio: 2.5,
      validRange: {
        start: '2025-08-01',
        end: '2026-01-01'
      },
      views: {
        dayGridMonth: {
          dayMaxEvents: 8,
          moreLinkClick: 'popover'
        },
        dayGridWeek: {
          dayMaxEvents: 4
        }
      },
      eventDisplay: 'block',
      eventTimeFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }
    });

    calendar.render();
  } catch (error) {
    // Fallback: create a simple div to show the error
    timelineDiv.innerHTML = '<div style="padding: 2rem; text-align: center; color: red;">Fejl ved oprettelse af kalender: ' + error.message + '</div>';
  }

  // Store calendar globally for event management
  window.allCalendars = [calendar];

  document.getElementById('generateBtn').addEventListener('click', generateAKOS);
  document.getElementById('importAkosBtn').addEventListener('click', importFromOtherENH);
  document.getElementById('generateSkemaBtn').addEventListener('click', generateSkema);

  // Initialize sergeant AFSP status
  initializeSergeantAfspStatus();

  // Populate week selector
  populateWeekSelector();

  // Update week selector when dates change
  document.getElementById('startDate').addEventListener('change', populateWeekSelector);
  document.getElementById('endDate').addEventListener('change', populateWeekSelector);

  // Load saved events from localStorage
  const savedEvents = localStorage.getItem('planops_events');
  if (savedEvents) {
    const events = JSON.parse(savedEvents);
    events.forEach(event => {
      calendar.addEvent({
        title: event.title,
        start: event.start,
        allDay: true,
        backgroundColor: event.backgroundColor || '#378006',
        borderColor: event.borderColor || '#378006'
      });
    });
    computeHours();
  }
});

async function generateAKOS() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  if (!startDate || !endDate) {
    alert('Vælg start- og slutdato.');
    return;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end <= start) {
    alert('Slutdato skal være efter startdato.');
    return;
  }

  // hent plukark-data
  const response = await fetch('plukark.json');
  const plukarkData = await response.json();

  // samle valgte fag og deres lektioner
  const selectedSubjects = {};
  const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked');
  checkboxes.forEach(checkbox => {
    const subjectName = checkbox.id;
    const lessons = plukarkData[subjectName];
    if (lessons) {
      selectedSubjects[subjectName] = lessons.map(lesson => ({
        title: `${subjectName}: ${lesson}`,
        subject: subjectName,
        color: getSubjectColor(subjectName)
      }));
    }
  });

  // ryd eksisterende events fra kalenderen
  calendar.getEvents().forEach(event => event.remove());

  // Beregn uge 1-3 datoer (første 3 uger fra startdato)
  const week1Start = new Date(start);
  const week3End = new Date(start);
  week3End.setDate(week3End.getDate() + 20); // 3 uger = 21 dage (0-20)

  let currentDate = new Date(start);

  // Først: Læg BT lektioner i uge 1-3
  if (selectedSubjects['Basisteori']) {
    let btIndex = 0;
    const btLessons = selectedSubjects['Basisteori'];

    while (currentDate <= week3End && btIndex < btLessons.length) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // kun hverdage
        const lesson = btLessons[btIndex];

        // Tilføj event til kalenderen
        calendar.addEvent({
          title: lesson.title,
          start: currentDate.toISOString().split('T')[0],
          allDay: true,
          backgroundColor: lesson.color,
          borderColor: lesson.color
        });
        btIndex++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // Dernæst: Håndter feltøvelser (hele uger) først
  currentDate = new Date(week3End);
  currentDate.setDate(currentDate.getDate() + 1); // Start efter uge 3

  const fieldExercises = selectedSubjects['Feltøvelser'] || [];
  let fieldIndex = 0;

  while (currentDate <= end && fieldIndex < fieldExercises.length) {
    // Find mandag i den aktuelle uge
    const dayOfWeek = currentDate.getDay();
    const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek); // Hvis søndag, gå til mandag, ellers gå til næste mandag
    currentDate.setDate(currentDate.getDate() + daysToMonday);

    if (currentDate > end) break;

    const exercise = fieldExercises[fieldIndex];

    // Læg øvelsen på hele ugen (mandag til fredag)
    for (let day = 0; day < 5; day++) {
      const exerciseDate = new Date(currentDate);
      exerciseDate.setDate(exerciseDate.getDate() + day);

      if (exerciseDate <= end) {
        calendar.addEvent({
          title: exercise.title,
          start: exerciseDate.toISOString().split('T')[0],
          allDay: true,
          backgroundColor: exercise.color,
          borderColor: exercise.color
        });
      }
    }

    fieldIndex++;
    // Gå til næste uge efter øvelsen
    currentDate.setDate(currentDate.getDate() + 7);
  }

  // Til sidst: Læg de andre fag (undtagen Basisteori og Feltøvelser)
  const otherLessons = [];
  Object.keys(selectedSubjects).forEach(subject => {
    if (subject !== 'Basisteori' && subject !== 'Feltøvelser') {
      selectedSubjects[subject].forEach(lesson => {
        otherLessons.push(lesson);
      });
    }
  });

  // Reset currentDate til efter feltøvelser eller uge 3, afhængigt af hvad der kommer først
  currentDate = new Date(week3End);
  currentDate.setDate(currentDate.getDate() + 1);

  // Spring over feltøvelser uger hvis de findes
  if (fieldExercises.length > 0) {
    // Find første feltøvelse position og spring til efter den sidste
    let fieldEndDate = new Date(currentDate);
    let weekCount = 0;
    while (fieldEndDate <= end && weekCount < fieldExercises.length) {
      // Find mandag i aktuelle uge
      const dayOfWeek = fieldEndDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
      fieldEndDate.setDate(fieldEndDate.getDate() + daysToMonday);
      
      if (fieldEndDate > end) break;
      
      // Spring til efter denne uge (fredag + 3 dage = mandag)
      fieldEndDate.setDate(fieldEndDate.getDate() + 7);
      weekCount++;
    }
    currentDate = new Date(fieldEndDate);
  }

  let otherIndex = 0;
  
  // Første runde: Læg lektioner fra otherLessons
  while (currentDate <= end && otherIndex < otherLessons.length) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // kun hverdage

      // Læg 2-4 lektioner på hver hverdag for at gøre det mere realistisk
      const lessonsPerDay = Math.min(Math.floor(Math.random() * 3) + 2, otherLessons.length - otherIndex, 4);

      for (let i = 0; i < lessonsPerDay && otherIndex < otherLessons.length; i++) {
        const lesson = otherLessons[otherIndex];

        // Tilføj event til kalenderen
        const timeSlots = ['08:00-10:00', '10:15-12:15', '13:00-15:00', '15:15-17:15'];
        const timeSlot = timeSlots[i] || `${8 + i * 2}:00-${10 + i * 2}:00`;
        
        calendar.addEvent({
          title: `${timeSlot}: ${lesson.title}`,
          start: currentDate.toISOString().split('T')[0],
          allDay: true,
          backgroundColor: lesson.color,
          borderColor: lesson.color
        });
        otherIndex++;
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Anden runde: Fyld tomme dage med gentagelser af lektioner
  currentDate = new Date(start);
  
  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // kun hverdage
      
      // Tjek om der allerede er events på denne dag
      const existingEvents = calendar.getEvents().filter(event => {
        const eventDate = new Date(event.start);
        return eventDate.toDateString() === currentDate.toDateString();
      });

      // Hvis der er færre end 2 events på dagen, tilføj flere
      const targetEventsPerDay = Math.floor(Math.random() * 3) + 2; // 2-4 events per dag
      const additionalEventsNeeded = Math.max(0, targetEventsPerDay - existingEvents.length);

      for (let i = 0; i < additionalEventsNeeded; i++) {
        // Vælg en tilfældig lektion fra alle tilgængelige lektioner
        const allAvailableLessons = [];
        Object.keys(selectedSubjects).forEach(subject => {
          if (subject !== 'Feltøvelser') { // Undtag feltøvelser fra fylde-lektioner
            selectedSubjects[subject].forEach(lesson => {
              allAvailableLessons.push(lesson);
            });
          }
        });

        if (allAvailableLessons.length > 0) {
          const randomLesson = allAvailableLessons[Math.floor(Math.random() * allAvailableLessons.length)];
          const timeSlots = ['08:00-10:00', '10:15-12:15', '13:00-15:00', '15:15-17:15'];
          const timeSlot = timeSlots[(existingEvents.length + i) % timeSlots.length];

          calendar.addEvent({
            title: `${timeSlot}: ${randomLesson.title}`,
            start: currentDate.toISOString().split('T')[0],
            allDay: true,
            backgroundColor: randomLesson.color,
            borderColor: randomLesson.color
          });
        }
      }
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // gem events og opdater timeregnskab
  saveEventsToStorage();
  computeHours();
  updateAkosStatus();
}

// funktion til at give forskellige farver til forskellige fag
function getSubjectColor(subject) {
  const colors = {
    'Basisteori': '#378006',
    'Hvervning': '#FF6B6B',
    'CBRN': '#4ECDC4',
    'Skydning': '#45B7D1',
    'Våbenuddannelse': '#96CEB4',
    'Fysisk træning': '#FFEAA7',
    'Eksercits': '#DDA0DD',
    'Feltøvelser': '#8B4513'
  };
  return colors[subject] || '#378006';
}



// Main tab functionality
function showMainTab(tabName) {
  // Hide all main tab contents
  document.querySelectorAll('.main-tab-content').forEach(content => {
    content.classList.remove('active');
  });

  // Remove active class from all main tab buttons
  document.querySelectorAll('.main-tab-button').forEach(button => {
    button.classList.remove('active');
  });

  // Show selected tab content
  const selectedTab = document.getElementById(tabName + '-tab');
  if (selectedTab) {
    selectedTab.classList.add('active');
  }

  // Add active class to clicked button
  if (event && event.target) {
    event.target.classList.add('active');
  }
}

// Recompute hours table whenever events change
function computeHours() {
  const weeks = {};

  // Collect events from calendar
  if (calendar) {
    calendar.getEvents().forEach(event => {
      const date = new Date(event.start);
      const onejan = new Date(date.getFullYear(), 0, 1);
      const weekNumber = Math.ceil((((date - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      if (!weeks[weekNumber]) weeks[weekNumber] = 0;
      weeks[weekNumber] += 8; // Each event assumed 8 hours
    });
  }

  const tbody = document.querySelector('#hoursTable tbody');
  tbody.innerHTML = '';

  Object.keys(weeks).sort((a, b) => a - b).forEach(week => {
    const hours = weeks[week];
    const status = hours > 37 ? 'Overtid' : hours < 37 ? 'Under' : 'OK';
    const row = document.createElement('tr');
    row.innerHTML = `<td>${week}</td><td>${hours}</td><td>${status}</td>`;
    tbody.appendChild(row);
  });

  // Update KMP and DEL tables
  updateKmpTable(weeks);
  updateDelTable(weeks);
}

// Update KMP table with DEL totals - safer with null checks
function updateKmpTable(weeks) {
  const totalHours = Object.values(weeks).reduce((sum, hours) => sum + hours, 0);

  // Only update if elements exist
  const del1HoursEl = document.getElementById('del1-hours');
  const del2HoursEl = document.getElementById('del2-hours');
  const del3HoursEl = document.getElementById('del3-hours');

  if (del1HoursEl && del2HoursEl && del3HoursEl) {
    // Distribute hours across 3 DELs
    const del1Hours = Math.floor(totalHours * 0.4);
    const del2Hours = Math.floor(totalHours * 0.35);
    const del3Hours = totalHours - del1Hours - del2Hours;

    del1HoursEl.textContent = del1Hours;
    del2HoursEl.textContent = del2Hours;
    del3HoursEl.textContent = del3Hours;
  }
}

// Show sergeant detail view
function showSergeantDetail(sergeantId, sergeantName) {
  // Hide main ARBEJDSTID content
  const mainContent = document.querySelector('#arbtid-tab');
  const existingDetail = document.getElementById('sergeant-detail-view');

  if (existingDetail) {
    existingDetail.remove();
  }

  // Get sergeant detailed data
  const sergeantDetailData = getSergeantDetailData(sergeantId);

  // Create detail view
  const detailView = document.createElement('div');
  detailView.id = 'sergeant-detail-view';
  detailView.innerHTML = `
    <div style="margin-bottom: 1rem; padding: 1rem; background-color: #fff; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <button onclick="hideSergeantDetail()" style="background-color: #95a5a6;">← Tilbage til oversigt</button>
      <h3 style="margin-top: 1rem;">${sergeantName} - Arbejdstidsdetaljer</h3>
    </div>

    <div style="margin-bottom: 2rem; padding: 1rem; background-color: #fff; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h4>Detaljerede oplysninger for ${sergeantName}</h4>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="border: 1px solid #dee2e6; padding: 8px;">Tj.oml. 3m</th>
            <th style="border: 1px solid #dee2e6; padding: 8px;">Tj.oml. 12m</th>
            <th style="border: 1px solid #dee2e6; padding: 8px;">Konv.opsp.</th>
            <th style="border: 1px solid #dee2e6; padding: 8px;">Fridage</th>
            <th style="border: 1px solid #dee2e6; padding: 8px;">Øvelses-døgn</th>
            <th style="border: 1px solid #dee2e6; padding: 8px;">Ferie-fridage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${sergeantDetailData.tjoml3m}</td>
            <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${sergeantDetailData.tjoml12m}</td>
            <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${sergeantDetailData.konvopsp}</td>
            <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${sergeantDetailData.fridage}</td>
            <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${sergeantDetailData.ovelsesdogn}</td>
            <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${sergeantDetailData.feriefridage}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div id="sergeant-calendar-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-bottom: 2rem;">
      <!-- Calendars will be inserted here -->
    </div>

    <div style="padding: 1rem; background-color: #fff; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h4>Foreslået afspadsering (sort farve = afspadsering for at nå 0 timer)</h4>
      <div id="afspadsering-info">
        <p>Nuværende overtimer: <span id="current-overtime">0</span></p>
        <p>Foreslåede afspadseringsdage: <span id="suggested-days">0</span></p>
      </div>
    </div>
  `;

  mainContent.appendChild(detailView);

  // Hide main tables
  document.querySelectorAll('#arbtid-tab > h3, #arbtid-tab > h4, #arbtid-tab > table').forEach(el => {
    el.style.display = 'none';
  });

  // Generate sergeant calendar
  generateSergeantCalendar(sergeantId, sergeantName);
}

// Hide sergeant detail view
function hideSergeantDetail() {
  const detailView = document.getElementById('sergeant-detail-view');
  if (detailView) {
    detailView.remove();
  }

  // Show main tables again
  document.querySelectorAll('#arbtid-tab > h3, #arbtid-tab > h4, #arbtid-tab > table').forEach(el => {
    el.style.display = '';
  });
}

// Get detailed data for sergeant
function getSergeantDetailData(sergeantId) {
  const detailData = {
    'sgt-a1': { tjoml3m: 3, tjoml12m: 3, konvopsp: 20, fridage: 0, ovelsesdogn: 2, feriefridage: 3 },
    'sgt-a2': { tjoml3m: 2, tjoml12m: 3, konvopsp: 15, fridage: 1, ovelsesdogn: 3, feriefridage: 2 },
    'sgt-a3': { tjoml3m: 1, tjoml12m: 2, konvopsp: 8, fridage: 0, ovelsesdogn: 1, feriefridage: 4 },
    'sgt-a4': { tjoml3m: 4, tjoml12m: 4, konvopsp: 28, fridage: 0, ovelsesdogn: 4, feriefridage: 1 },
    'sgt-a5': { tjoml3m: 2, tjoml12m: 3, konvopsp: 12, fridage: 1, ovelsesdogn: 2, feriefridage: 3 },
    'sgt-b1': { tjoml3m: 2, tjoml12m: 3, konvopsp: 18, fridage: 0, ovelsesdogn: 3, feriefridage: 2 },
    'sgt-b2': { tjoml3m: 3, tjoml12m: 4, konvopsp: 22, fridage: 1, ovelsesdogn: 2, feriefridage: 3 },
    'sgt-b3': { tjoml3m: 1, tjoml12m: 2, konvopsp: 10, fridage: 0, ovelsesdogn: 1, feriefridage: 2 },
    'sgt-b4': { tjoml3m: 3, tjoml12m: 4, konvopsp: 25, fridage: 0, ovelsesdogn: 4, feriefridage: 2 },
    'sgt-b5': { tjoml3m: 2, tjoml12m: 2, konvopsp: 5, fridage: 2, ovelsesdogn: 1, feriefridage: 4 },
    'sgt-c1': { tjoml3m: 2, tjoml12m: 3, konvopsp: 16, fridage: 0, ovelsesdogn: 2, feriefridage: 3 },
    'sgt-c2': { tjoml3m: 3, tjoml12m: 3, konvopsp: 19, fridage: 1, ovelsesdogn: 3, feriefridage: 2 },
    'sgt-c3': { tjoml3m: 2, tjoml12m: 3, konvopsp: 14, fridage: 0, ovelsesdogn: 2, feriefridage: 3 },
    'sgt-c4': { tjoml3m: 3, tjoml12m: 4, konvopsp: 23, fridage: 0, ovelsesdogn: 3, feriefridage: 2 },
    'sgt-c5': { tjoml3m: 1, tjoml12m: 2, konvopsp: 7, fridage: 1, ovelsesdogn: 1, feriefridage: 4 },
    'sgt-d1': { tjoml3m: 3, tjoml12m: 4, konvopsp: 24, fridage: 0, ovelsesdogn: 3, feriefridage: 2 },
    'sgt-d2': { tjoml3m: 2, tjoml12m: 3, konvopsp: 17, fridage: 1, ovelsesdogn: 2, feriefridage: 3 },
    'sgt-d3': { tjoml3m: 1, tjoml12m: 2, konvopsp: 6, fridage: 0, ovelsesdogn: 1, feriefridage: 3 },
    'sgt-d4': { tjoml3m: 4, tjoml12m: 4, konvopsp: 26, fridage: 0, ovelsesdogn: 4, feriefridage: 1 },
    'sgt-d5': { tjoml3m: 1, tjoml12m: 2, konvopsp: 4, fridage: 2, ovelsesdogn: 1, feriefridage: 4 }
  };

  return detailData[sergeantId] || { tjoml3m: 0, tjoml12m: 0, konvopsp: 0, fridage: 0, ovelsesdogn: 0, feriefridage: 0 };
}

// Initialize AFSP status for all sergeants
function initializeSergeantAfspStatus() {
  const sergeantIds = [
    'sgt-a1', 'sgt-a2', 'sgt-a3', 'sgt-a4', 'sgt-a5',
    'sgt-b1', 'sgt-b2', 'sgt-b3', 'sgt-b4', 'sgt-b5',
    'sgt-c1', 'sgt-c2', 'sgt-c3', 'sgt-c4', 'sgt-c5',
    'sgt-d1', 'sgt-d2', 'sgt-d3', 'sgt-d4', 'sgt-d5'
  ];

  sergeantIds.forEach(id => {
    sergeantAfspStatus[id] = {
      current: true,
      preview: false,
      active: false
    };
  });
}

// AFSP Plan functions for individual sergeants
function showCurrentStatus(sergeantId) {
  sergeantAfspStatus[sergeantId] = {
    current: true,
    preview: false,
    active: false
  };

  updateIndividualSergeant(sergeantId);
  updateButtonStyles(sergeantId);
}

function showAfspStatus(sergeantId) {
  sergeantAfspStatus[sergeantId] = {
    current: false,
    preview: true,
    active: false
  };

  updateIndividualSergeant(sergeantId);
  updateButtonStyles(sergeantId);

  // If sergeant detail view is open, refresh it to show AFSP changes
  const detailView = document.getElementById('sergeant-detail-view');
  if (detailView) {
    const detailTitle = detailView.querySelector('h3');
    if (detailTitle) {
      const titleText = detailTitle.textContent || '';
      const sergeantNameFromTitle = titleText.split(' - ')[0].trim();
      if (sergeantNameFromTitle) {
        generateSergeantCalendar(sergeantId, sergeantNameFromTitle);
      } else {
        // Fallback: try to regenerate with just the sergeantId
        generateSergeantCalendar(sergeantId, sergeantId);
      }
    } else {
      // Fallback: try to regenerate with just the sergeantId
      generateSergeantCalendar(sergeantId, sergeantId);
    }
  }
}

function activateAfspPlan(sergeantId) {
  sergeantAfspStatus[sergeantId] = {
    current: false,
    preview: false,
    active: true
  };

  updateIndividualSergeant(sergeantId);
  updateButtonStyles(sergeantId);

  alert(`AFSP plan er nu aktiveret for ${sergeantId}. Overtimer er reduceret med afspadsering.`);
}

function updateButtonStyles(sergeantId) {
  // Since buttons are inline, we'll update them through the row
  const row = document.querySelector(`#${sergeantId}-hours`).closest('tr');
  const buttons = row.querySelectorAll('button');

  // Reset all button styles
  buttons[1].style.backgroundColor = '#3498db'; // Aktuel Status
  buttons[2].style.backgroundColor = '#e67e22'; // Status med AFSP
  buttons[3].style.backgroundColor = '#27ae60'; // Aktivér AFSP

  // Highlight active button
  if (sergeantAfspStatus[sergeantId].current) {
    buttons[1].style.backgroundColor = '#2980b9';
  } else if (sergeantAfspStatus[sergeantId].preview) {
    buttons[2].style.backgroundColor = '#d35400';
  } else if (sergeantAfspStatus[sergeantId].active) {
    buttons[3].style.backgroundColor = '#2ecc71';
  }
}

function updateIndividualSergeant(sergeantId) {
  // Original sergeant data
  const originalData = {
    'sgt-a1': { hours: 158, overtime: 21 },
    'sgt-a2': { hours: 142, overtime: 5 },
    'sgt-a3': { hours: 135, overtime: 0 },
    'sgt-a4': { hours: 159, overtime: 22 },
    'sgt-a5': { hours: 139, overtime: 2 },
    'sgt-b1': { hours: 160, overtime: 23 },
    'sgt-b2': { hours: 140, overtime: 3 },
    'sgt-b3': { hours: 138, overtime: 1 },
    'sgt-b4': { hours: 158, overtime: 21 },
    'sgt-b5': { hours: 132, overtime: 0 },
    'sgt-c1': { hours: 143, overtime: 6 },
    'sgt-c2': { hours: 162, overtime: 25 },
    'sgt-c3': { hours: 137, overtime: 0 },
    'sgt-c4': { hours: 158, overtime: 21 },
    'sgt-c5': { hours: 134, overtime: 0 },
    'sgt-d1': { hours: 161, overtime: 24 },
    'sgt-d2': { hours: 144, overtime: 7 },
    'sgt-d3': { hours: 136, overtime: 0 },
    'sgt-d4': { hours: 159, overtime: 22 },
    'sgt-d5': { hours: 133, overtime: 0 }
  };

  const data = originalData[sergeantId];
  if (!data) return;

  let overtime = data.overtime;

  // Apply AFSP reduction if preview or active
  if ((sergeantAfspStatus[sergeantId].preview || sergeantAfspStatus[sergeantId].active) && overtime >= 21) {
    overtime = Math.max(0, overtime - 15);
  }

  updateSergeantTotalHours(sergeantId, data.hours, overtime);
}

// Generate calendar for individual sergeant
function generateSergeantCalendar(sergeantId, sergeantName) {
  const container = document.getElementById('sergeant-calendar-container');
  if (!container) return;

  // Ensure sergeantName is defined, get from detail view if not provided
  if (!sergeantName) {
    const detailView = document.getElementById('sergeant-detail-view');
    if (detailView) {
      const detailTitle = detailView.querySelector('h3');
      if (detailTitle) {
        const titleText = detailTitle.textContent || '';
        sergeantName = titleText.split(' - ')[0].trim();
      }
    }
    // Fallback if still no name
    if (!sergeantName) {
      sergeantName = sergeantId;
    }
  }

  container.innerHTML = '';

  const months = [
    { name: 'August 2025', date: '2025-08-01' },
    { name: 'September 2025', date: '2025-09-01' },
    { name: 'Oktober 2025', date: '2025-10-01' },
    { name: 'November 2025', date: '2025-11-01' },
    { name: 'December 2025', date: '2025-12-01' }
  ];

  const sergeantCalendars = [];
  let totalWorkDays = 0;
  let totalWorkHours = 0;
  let totalOvertimeHours = 0;

  months.forEach((month, index) => {
    const monthDiv = document.createElement('div');
    monthDiv.className = 'month-calendar';
    monthDiv.id = `sergeant-calendar-${index}`;
    container.appendChild(monthDiv);

    const monthCalendar = new FullCalendar.Calendar(monthDiv, {
      initialView: 'dayGridMonth',
      initialDate: month.date,
      headerToolbar: {
        left: '',
        center: 'title',
        right: ''
      },
      height: 350,
      aspectRatio: 1.2,
      validRange: {
        start: month.date,
        end: index === 4 ? '2026-01-01' : months[index + 1].date
      },
      dateClick: function(info) {
        const dayOfWeek = info.date.getDay();
        // Only allow editing weekdays
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          editWorkHours(sergeantId, info.date, info.dayEl);
        }
      },
      dayCellDidMount: function(info) {
        const date = info.date;
        const dayOfWeek = date.getDay();

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          info.el.style.backgroundColor = '#f8f9fa';
          return;
        }

        // Get saved work hours or generate default pattern
        const savedHours = getSergeantWorkHours(sergeantId, date);
        const workPattern = savedHours || generateWorkPattern(sergeantId, date);

        if (workPattern.isWorking && workPattern.startTime && workPattern.endTime) {
          info.el.style.backgroundColor = '#d4edda'; // Green for working
          info.el.style.color = '#155724';
          info.el.style.cursor = 'pointer';

          // Format time display
          const startFormatted = workPattern.startTime.substring(0,2) + ':' + workPattern.startTime.substring(2);
          const endFormatted = workPattern.endTime.substring(0,2) + ':' + workPattern.endTime.substring(2);
          info.el.title = `${startFormatted}-${endFormatted} (${workPattern.hours} timer)`;

          // Add time display to the cell
          const timeDisplay = document.createElement('div');
          timeDisplay.style.fontSize = '10px';
          timeDisplay.style.fontWeight = 'bold';
          timeDisplay.textContent = `${startFormatted}-${endFormatted}`;
          info.el.appendChild(timeDisplay);

          totalWorkDays++;
          totalWorkHours += workPattern.hours;
          if (workPattern.hours > 8) {
            totalOvertimeHours += (workPattern.hours - 8);
          }
        } else if (workPattern.isWorking) {
          info.el.style.backgroundColor = '#d4edda'; // Green for working
          info.el.style.color = '#155724';
          info.el.style.cursor = 'pointer';
          info.el.title = `Arbejdsdag - ${workPattern.hours} timer`;
          totalWorkDays++;
          totalWorkHours += workPattern.hours;
          if (workPattern.hours > 8) {
            totalOvertimeHours += (workPattern.hours - 8);
          }
        } else {
          info.el.style.backgroundColor = '#f8d7da'; // Red for not working
          info.el.style.color = '#721c24';
          info.el.style.cursor = 'pointer';
          info.el.title = 'Fridag - Klik for at redigere';
        }

        // Add proposed time off (black for afspadsering)
        if (workPattern.isTimeOff) {
          info.el.style.backgroundColor = '#343a40'; // Black for time off
          info.el.style.color = '#ffffff';
          info.el.title = 'Foreslået afspadsering';
        }
      }
    });

    monthCalendar.render();
    sergeantCalendars.push(monthCalendar);
  });

  // Calculate and display overtime info
  const currentOvertimeEl = document.getElementById('current-overtime');
  const suggestedDaysEl = document.getElementById('suggested-days');

  if (currentOvertimeEl && suggestedDaysEl) {
    currentOvertimeEl.textContent = totalOvertimeHours.toFixed(1);
    const suggestedDays = Math.ceil(totalOvertimeHours / 8);
    suggestedDaysEl.textContent = suggestedDays;
  }

  // Also update the afspadsering info div if it exists
  const afspadseringInfo = document.getElementById('afspadsering-info');
  if (afspadseringInfo) {
    const existingOvertimeSpan = afspadseringInfo.querySelector('#current-overtime');
    const existingDaysSpan = afspadseringInfo.querySelector('#suggested-days');
    
    if (existingOvertimeSpan) {
      existingOvertimeSpan.textContent = totalOvertimeHours.toFixed(1);
    }
    if (existingDaysSpan) {
      const suggestedDays = Math.ceil(totalOvertimeHours / 8);
      existingDaysSpan.textContent = suggestedDays;
    }
  }

  // Update the main arbejdstid table with new totals
  updateSergeantTotalHours(sergeantId, totalWorkHours, totalOvertimeHours);
}

// Generate work pattern for sergeant
function generateWorkPattern(sergeantId, date) {
  const day = date.getDate();
  const month = date.getMonth();
  const dayOfWeek = date.getDay();

  // Skip weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isWorking: false, hours: 0, isTimeOff: false };
  }

  // Simulate different work patterns for different sergeants
  let isWorking = true;
  let hours = 8;
  let isTimeOff = false;
  let startTime = '0800';
  let endTime = '1600';

  // Simulate some days off and overtime based on sergeant ID and date
  const sergeantNum = parseInt(sergeantId.slice(-1)) || 1;
  const pattern = (day + sergeantNum + month) % 10;

  if (pattern === 0) {
    isWorking = false; // Regular day off
  } else if (pattern === 1 || pattern === 2) {
    hours = 10; // Overtime day
    startTime = '0730';
    endTime = '1730';
  } else if (pattern === 9) {
    isTimeOff = true; // Proposed time off for afspadsering
    isWorking = false;
  }

  // Add some field exercise days (longer hours)
  if (pattern === 7 || pattern === 8) {
    hours = 12; // Field exercise day
    startTime = '0700';
    endTime = '1900';
  }

  return { isWorking, hours, isTimeOff, startTime, endTime };
}

// Edit work hours for a specific day
function editWorkHours(sergeantId, date, dayEl) {
  const dateKey = date.toISOString().split('T')[0];
  const currentData = getSergeantWorkHours(sergeantId, date) || generateWorkPattern(sergeantId, date);

  // Create modal dialog
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: white;
    padding: 2rem;
    border-radius: 8px;
    width: 300px;
    max-width: 90vw;
  `;

  modalContent.innerHTML = `
    <h4>Rediger arbejdstid - ${date.toLocaleDateString('da-DK')}</h4>
    <div style="margin-bottom: 1rem;">
      <label style="display: block; margin-bottom: 0.5rem;">
        <input type="radio" name="workType" value="working" ${currentData.isWorking ? 'checked' : ''}> Arbejdsdag
      </label>
      <label style="display: block; margin-bottom: 0.5rem;">
        <input type="radio" name="workType" value="dayOff" ${!currentData.isWorking && !currentData.isTimeOff ? 'checked' : ''}> Fridag
      </label>
      <label style="display: block; margin-bottom: 1rem;">
        <input type="radio" name="workType" value="timeOff" ${currentData.isTimeOff ? 'checked' : ''}> Afspadsering
      </label>
    </div>
    <div id="timeInputs" style="margin-bottom: 1rem; ${!currentData.isWorking ? 'display: none;' : ''}">
      <label style="display: block; margin-bottom: 0.5rem;">
        Start tid:
        <input type="time" id="startTime" value="${formatTimeForInput(currentData.startTime || '0800')}" style="margin-left: 0.5rem;">
      </label>
      <label style="display: block; margin-bottom: 0.5rem;">
        Slut tid:
        <input type="time" id="endTime" value="${formatTimeForInput(currentData.endTime || '1600')}" style="margin-left: 0.5rem;">
      </label>
    </div>
    <div style="text-align: right;">
      <button id="cancelBtn" style="background-color: #95a5a6; margin-right: 0.5rem;">Annuller</button>
      <button id="saveBtn" style="background-color: #27ae60;">Gem</button>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Handle work type change
  const workTypeInputs = modalContent.querySelectorAll('input[name="workType"]');
  const timeInputs = document.getElementById('timeInputs');

  workTypeInputs.forEach(input => {
    input.addEventListener('change', function() {
      if (this.value === 'working') {
        timeInputs.style.display = 'block';
      } else {
        timeInputs.style.display = 'none';
      }
    });
  });

  // Handle save
  document.getElementById('saveBtn').addEventListener('click', function() {
    const workType = modalContent.querySelector('input[name="workType"]:checked').value;
    const startTimeValue = document.getElementById('startTime').value;
    const endTimeValue = document.getElementById('endTime').value;
    const startTime = startTimeValue.replace(':', '');
    const endTime = endTimeValue.replace(':', '');

    let workData = {
      isWorking: workType === 'working',
      isTimeOff: workType === 'timeOff',
      startTime: workType === 'working' ? startTime : null,
      endTime: workType === 'working' ? endTime : null,
      hours: 0
    };

    if (workType === 'working' && startTimeValue && endTimeValue) {
      // Calculate hours - improved calculation
      const startHour = parseInt(startTime.substring(0, 2));
      const startMin = parseInt(startTime.substring(2));
      const endHour = parseInt(endTime.substring(0, 2));
      const endMin = parseInt(endTime.substring(2));

      const startDecimal = startHour + startMin / 60;
      const endDecimal = endHour + endMin / 60;

      workData.hours = Math.max(0, endDecimal - startDecimal);
    }

    saveSergeantWorkHours(sergeantId, dateKey, workData);
    modal.remove();

    // Refresh calendar with updated data - get sergeant name from current detail view
    const detailView = document.getElementById('sergeant-detail-view');
    if (detailView) {
      const detailTitle = detailView.querySelector('h3');
      if (detailTitle) {
        const titleText = detailTitle.textContent || '';
        const sergeantNameFromTitle = titleText.split(' - ')[0].trim();
        if (sergeantNameFromTitle) {
          generateSergeantCalendar(sergeantId, sergeantNameFromTitle);
        }
      }
    }
  });

  // Handle cancel
  document.getElementById('cancelBtn').addEventListener('click', function() {
    modal.remove();
  });

  // Handle click outside modal
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Get saved work hours for sergeant
function getSergeantWorkHours(sergeantId, date) {
  const dateKey = date.toISOString().split('T')[0];
  const savedData = localStorage.getItem(`sergeant_hours_${sergeantId}`);
  if (savedData) {
    const hours = JSON.parse(savedData);
    return hours[dateKey];
  }
  return null;
}

// Save work hours for sergeant
function saveSergeantWorkHours(sergeantId, dateKey, workData) {
  const savedData = localStorage.getItem(`sergeant_hours_${sergeantId}`);
  let hours = savedData ? JSON.parse(savedData) : {};
  hours[dateKey] = workData;
  localStorage.setItem(`sergeant_hours_${sergeantId}`, JSON.stringify(hours));
}

// Update sergeant total hours in main arbejdstid table
function updateSergeantTotalHours(sergeantId, totalHours, overtimeHours) {
  const hoursEl = document.getElementById(`${sergeantId}-hours`);
  const overtimeEl = document.getElementById(`${sergeantId}-overtime`);
  const statusEl = document.getElementById(`${sergeantId}-status`);

  if (hoursEl && overtimeEl && statusEl) {
    hoursEl.textContent = Math.round(totalHours);
    overtimeEl.textContent = Math.round(overtimeHours);

    if (overtimeHours >= 21) {
      statusEl.textContent = 'Kritisk Overtid';
      statusEl.parentElement.style.backgroundColor = '#dc3545'; // Red background
      statusEl.parentElement.style.color = '#ffffff'; // White text
    } else if (overtimeHours > 10) {
      statusEl.textContent = 'Overtid';
      statusEl.parentElement.style.backgroundColor = '#ffcccb';
      statusEl.parentElement.style.color = '#721c24';
    } else if (totalHours < 130) {
      statusEl.textContent = 'Under';
      statusEl.parentElement.style.backgroundColor = '#fff3cd';
      statusEl.parentElement.style.color = '#856404';
    } else {
      statusEl.textContent = 'OK';
      statusEl.parentElement.style.backgroundColor = '';
      statusEl.parentElement.style.color = '';
    }
  }
}

// Update DEL table with sergeant details - safer with null checks
function updateDelTable(weeks) {
  // This function is kept for compatibility but doesn't update anything
  // since the HTML tables are already populated with static data
}

// Populate week selector based on AKOS date range
function populateWeekSelector() {
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  if (!startDate || !endDate) return;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const weekSelect = document.getElementById('weekSelect');

  weekSelect.innerHTML = '<option value="">Vælg uge...</option>';

  let currentDate = new Date(start);
  let weekNumber = 1;

  while (currentDate <= end) {
    const weekStart = new Date(currentDate);
    const weekEnd = new Date(currentDate);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const option = document.createElement('option');
    option.value = weekNumber;
    option.textContent = `Uge ${weekNumber} (${weekStart.toLocaleDateString('da-DK')} - ${weekEnd.toLocaleDateString('da-DK')})`;
    weekSelect.appendChild(option);

    currentDate.setDate(currentDate.getDate() + 7);
    weekNumber++;
  }
}



// Import AKOS from another ENH
function importFromOtherENH() {
  const savedAkosKeys = Object.keys(localStorage).filter(key => key.startsWith('planops_events_'));

  if (savedAkosKeys.length === 0) {
    alert('Ingen andre AKOS fundet at importere fra.');
    return;
  }

  let options = 'Vælg AKOS at importere:\n\n';
  savedAkosKeys.forEach((key, index) => {
    const enhName = key.replace('planops_events_', '');
    options += `${index + 1}. ${enhName}\n`;
  });

  const choice = prompt(options + '\nIndtast nummer:');
  if (choice && !isNaN(choice)) {
    const selectedKey = savedAkosKeys[parseInt(choice) - 1];
    if (selectedKey) {
      const importedEvents = JSON.parse(localStorage.getItem(selectedKey));

      // Add imported events to current calendar
      importedEvents.forEach(event => {
        calendar.addEvent({
          title: `[IMPORT] ${event.title}`,
          start: event.start,
          allDay: true,
          backgroundColor: event.backgroundColor || '#FF6B6B',
          borderColor: event.borderColor || '#FF6B6B'
        });
      });

      saveEventsToStorage();
      updateAkosStatus();
      alert('AKOS importeret succesfuldt!');
    }
  }
}

// Update AKOS status and show warnings
function updateAkosStatus() {
  const statusDiv = document.getElementById('akosStatus');
  const missingDiv = document.getElementById('missingLessons');
  const sequenceDiv = document.getElementById('sequenceWarnings');

  statusDiv.style.display = 'block';

  // Check for missing lessons
  const allEvents = [];
  if (calendar) {
    calendar.getEvents().forEach(event => {
      allEvents.push(event.title);
    });
  }

  // Check against plukark
  const response = fetch('plukark.json')
    .then(response => response.json())
    .then(plukarkData => {
      const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked');
      const missingLessons = [];

      checkboxes.forEach(checkbox => {
        const subjectName = checkbox.id;
        const lessons = plukarkData[subjectName];
        if (lessons) {
          lessons.forEach(lesson => {
            const lessonTitle = `${subjectName}: ${lesson}`;
            if (!allEvents.some(event => event.includes(lesson))) {
              missingLessons.push(lessonTitle);
            }
          });
        }
      });

      if (missingLessons.length > 0) {
        missingDiv.innerHTML = `<strong>Manglende lektioner:</strong><br>${missingLessons.slice(0, 5).join('<br>')}`;
        if (missingLessons.length > 5) {
          missingDiv.innerHTML += `<br>... og ${missingLessons.length - 5} flere`;
        }
      } else {
        missingDiv.innerHTML = '<strong style="color: green;">✓ Alle valgte lektioner er planlagt</strong>';
      }

      // Check BT sequence
      const btEvents = allEvents.filter(event => event.includes('Basisteori')).sort();
      const sequenceIssues = [];

      // Simple sequence check for BT
      for (let i = 1; i <= 18; i++) {
        const expectedLesson = `Basisteori: BT ${i}`;
        if (!btEvents.some(event => event.includes(`BT ${i}`))) {
          if (i <= 10) { // Only check first 10 for sequence
            sequenceIssues.push(`BT ${i} mangler eller er ude af rækkefølge`);
          }
        }
      }

      if (sequenceIssues.length > 0) {
        sequenceDiv.innerHTML = `<strong style="color: orange;">⚠ Rækkefølge advarsler:</strong><br>${sequenceIssues.slice(0, 3).join('<br>')}`;
      } else {
        sequenceDiv.innerHTML = '<strong style="color: green;">✓ Basisteori rækkefølge OK</strong>';
      }
    });
}

// Save events to storage with ENH identifier
function saveEventsToStorage() {
  const enhType = document.getElementById('enhSelect').value;
  const allEvents = [];

  if (calendar) {
    calendar.getEvents().forEach(e => {
      allEvents.push({
        title: e.title, 
        start: e.startStr, 
        backgroundColor: e.backgroundColor,
        borderColor: e.borderColor 
      });
    });
  }

  localStorage.setItem('planops_events', JSON.stringify(allEvents));
  localStorage.setItem(`planops_events_${enhType}_${Date.now()}`, JSON.stringify(allEvents));
}

// Generate SKEMA based on selected week and AKOS data
function generateSkema() {
  const selectedWeek = document.getElementById('weekSelect').value;
  if (!selectedWeek) {
    alert('Vælg en uge først.');
    return;
  }

  // Get events for the selected week from calendar
  const weekEvents = [];
  if (calendar) {
    calendar.getEvents().forEach(event => {
      const eventDate = new Date(event.start);
      const startDate = new Date(document.getElementById('startDate').value);
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + (selectedWeek - 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      if (eventDate >= weekStart && eventDate <= weekEnd) {
        weekEvents.push({
          title: event.title,
          date: eventDate,
          dayOfWeek: eventDate.getDay(),
          backgroundColor: event.backgroundColor || '#378006'
        });
      }
    });
  }

  // Generate time slots and populate SKEMA table
  const skemaTable = document.getElementById('skemaTable');
  const tbody = skemaTable.querySelector('tbody');
  tbody.innerHTML = '';

  // Define proper time slots
  const timeSlots = [
    '0800-0805',
    '0805-0900', 
    '0900-0930',
    '0930-1000',
    '1000-1030',
    '1030-1100',
    '1100-1130',
    '1130-1200',
    '1200-1230',
    '1230-1300',
    '1300-1330',
    '1330-1400',
    '1400-1430',
    '1430-1500',
    '1500-1530',
    '1530-1600'
  ];

  // Create empty schedule grid
  const scheduleGrid = {};
  for (let day = 1; day <= 6; day++) { // Monday=1, Sunday=6
    scheduleGrid[day] = {};
    timeSlots.forEach((slot, index) => {
      scheduleGrid[day][index] = null;
    });
  }

  // Sort events by day for better placement
  const eventsByDay = {};
  weekEvents.forEach(event => {
    const dayKey = event.dayOfWeek === 0 ? 6 : event.dayOfWeek; // Sunday = 6
    if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
    eventsByDay[dayKey].push(event);
  });

  // Place events in schedule grid
  Object.keys(eventsByDay).forEach(dayKey => {
    const dayEvents = eventsByDay[dayKey];
    let currentSlot = 1; // Start after BM appel (0800-0805)

    dayEvents.forEach(event => {
      // Find next available slot for this day
      while (currentSlot < timeSlots.length && scheduleGrid[dayKey][currentSlot] !== null) {
        currentSlot++;
      }

      if (currentSlot < timeSlots.length) {
        scheduleGrid[dayKey][currentSlot] = {
          title: event.title,
          backgroundColor: event.backgroundColor
        };
        currentSlot++;
      }
    });
  });

  // Generate table rows
  timeSlots.forEach((timeSlot, index) => {
    const row = document.createElement('tr');

    // Time column
    const timeCell = document.createElement('td');
    timeCell.className = 'time-slot';
    timeCell.textContent = timeSlot;
    row.appendChild(timeCell);

    // Day columns (Monday to Sunday)
    for (let day = 1; day <= 6; day++) {
      const cell = document.createElement('td');
      const event = scheduleGrid[day][index];

      if (event) {
        // Clean up title - remove subject prefix for display
        let displayTitle = event.title;
        if (displayTitle.includes(':')) {
          displayTitle = displayTitle.split(':')[1].trim();
        }
        if (displayTitle.startsWith('[IMPORT]')) {
          displayTitle = displayTitle.replace('[IMPORT]', '').trim();
        }

        cell.textContent = displayTitle;
        cell.style.backgroundColor = event.backgroundColor;
        cell.style.color = '#fff';
        cell.style.fontWeight = 'bold';
        cell.style.padding = '8px';
        cell.style.textAlign = 'center';
      }

      row.appendChild(cell);
    }

    tbody.appendChild(row);
  });

  // Add BM appel to first slot of Monday if no events there
  const firstRow = tbody.querySelector('tr');
  if (firstRow) {
    const mondayCell = firstRow.cells[1]; // Monday column
    if (!mondayCell.textContent.trim()) {
      mondayCell.textContent = 'BM appel';
      mondayCell.style.backgroundColor = '#34495e';
      mondayCell.style.color = '#fff';
      mondayCell.style.fontWeight = 'bold';
      mondayCell.style.textAlign = 'center';
    }
  }
}