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

  // Create multiple month calendars in grid layout
  try {
  const months = [
    { name: 'August 2025', date: '2025-08-01' },
    { name: 'September 2025', date: '2025-09-01' },
    { name: 'Oktober 2025', date: '2025-10-01' },
    { name: 'November 2025', date: '2025-11-01' },
      { name: 'December 2025', date: '2025-12-01' },
      { name: 'Januar 2026', date: '2026-01-01' }
  ];

  const calendars = [];

  months.forEach((month, index) => {
    const monthDiv = document.createElement('div');
    monthDiv.className = 'month-calendar';
    monthDiv.id = `calendar-${index}`;
      
      const titleDiv = document.createElement('div');
      titleDiv.className = 'month-title';
      titleDiv.textContent = month.name;
      monthDiv.appendChild(titleDiv);
      
      const calendarDiv = document.createElement('div');
      calendarDiv.id = `calendar-container-${index}`;
      monthDiv.appendChild(calendarDiv);
      
      timelineDiv.appendChild(monthDiv);

      const monthCalendar = new FullCalendar.Calendar(calendarDiv, {
      initialView: 'dayGridMonth',
      initialDate: month.date,
      headerToolbar: {
        left: '',
          center: '',
        right: ''
      },
      editable: true,
      selectable: true,
      eventColor: '#378006',
      events: [],
      dayMaxEvents: false,
        height: 280,
      aspectRatio: 1.2,
      validRange: {
        start: month.date,
          end: index === 5 ? '2026-02-01' : months[index + 1].date
      }
    });

    monthCalendar.render();
    calendars.push(monthCalendar);
  });

  // Set the main calendar reference to the first one for compatibility
  calendar = calendars[0];

  // Store all calendars globally for event management
  window.allCalendars = calendars;
  } catch (error) {
    // Fallback: create a simple div to show the error
    timelineDiv.innerHTML = '<div style="padding: 2rem; text-align: center; color: red;">Fejl ved oprettelse af kalender: ' + error.message + '</div>';
    // Fallback: create single calendar
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
      aspectRatio: 1.35
    });
    calendar.render();
    window.allCalendars = [calendar];
  }

  document.getElementById('generateBtn').addEventListener('click', generateAKOS);
  document.getElementById('importAkosBtn').addEventListener('click', importFromOtherENH);
  document.getElementById('generateSkemaBtn').addEventListener('click', generateSkema);
  
  // Add event listeners for main tab buttons
  document.querySelectorAll('.main-tab-button').forEach(button => {
    button.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      if (tabName) {
        showMainTab(tabName);
      }
    });
  });
  
  // Add event listener for DEL selector
  const delSelect = document.getElementById('delSelect');
  if (delSelect) {
    delSelect.addEventListener('change', function() {
      showDelSkema(this.value);
    });
  }

  // Initialize DEL selector to show first DEL
  showDelSkema('1');

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
      const eventDate = new Date(event.start);
      const targetCalendar = getCalendarForDate(eventDate);
      if (targetCalendar) {
        targetCalendar.addEvent({
          title: event.title,
          start: event.start,
          allDay: true,
          backgroundColor: event.backgroundColor || '#378006',
          borderColor: event.borderColor || '#378006'
        });
      }
    });
    computeHours();
  }
  
  // Initialize computeHours on page load
  computeHours();

  // Når JSON er indlæst
  fetch("plukark.json")
    .then(res => res.json())
    .then(data => {
      console.log("JSON-data indlæst:", data);
      indsætFagIDetaljeretTid(data);
      enableDragDrop(); // Aktiver drag & drop efter data er indsat
    });

  // Aktiver drag & drop når siden indlæses
  window.addEventListener("load", enableDragDrop);
});

// Get sergeants for a specific DEL
function getDelSergeants(delNumber) {
  const sergeants = {
    1: ['SGT A1', 'SGT A2', 'SGT A3', 'SGT A4', 'SGT A5'],
    2: ['SGT B1', 'SGT B2', 'SGT B3', 'SGT B4', 'SGT B5'],
    3: ['SGT C1', 'SGT C2', 'SGT C3', 'SGT C4', 'SGT C5'],
    4: ['SGT D1', 'SGT D2', 'SGT D3', 'SGT D4', 'SGT D5']
  };
  return sergeants[delNumber] || [];
}

// Calculate sergeant hours for the week
function calculateSergeantHours(delNumber, weekEvents) {
  const delSergeants = getDelSergeants(delNumber);
  const sergeantHours = {};
  
  // Initialize hours for each sergeant
  delSergeants.forEach(sgt => {
    sergeantHours[sgt] = 0;
  });
  
  // Calculate hours from events (assuming 7.4 hours per day for weekdays = 37 hours per week)
  weekEvents.forEach(event => {
    const dayOfWeek = event.dayOfWeek;
    if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Only weekdays
      const dayIndex = dayOfWeek - 1;
      const sergeant = delSergeants[dayIndex] || 'SGT';
      sergeantHours[sergeant] += 7.4; // 7.4 hours per day = 37 hours per week
    }
  });
  
  // Add hours for days without events (standard 7.4 hours per weekday)
  for (let day = 1; day <= 5; day++) {
    const dayIndex = day - 1;
    const sergeant = delSergeants[dayIndex] || 'SGT';
    if (sergeantHours[sergeant] === 0) {
      sergeantHours[sergeant] = 7.4; // Default 7.4 hours per day
    }
  }
  
  // Ensure each sergeant has exactly 37 hours for the week
  delSergeants.forEach(sgt => {
    if (sergeantHours[sgt] < 37) {
      sergeantHours[sgt] = 37;
    }
  });
  
  return sergeantHours;
}

// Show/hide DEL skema
function showDelSkema(delNumber) {
  // Hide all DEL skema divs
  document.querySelectorAll('.del-skema').forEach(div => {
    div.style.display = 'none';
  });

  // Show selected DEL skema
  const selectedDel = document.getElementById(`del${delNumber}-skema`);
  if (selectedDel) {
    selectedDel.style.display = 'block';
  }
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

  // Generate content for specific tabs
  if (tabName === 'detaljeret') {
    loadDetaljeretTid();
  }
}

async function loadDetaljeretTid() {
  const container = document.getElementById("timetable-container");
  container.innerHTML = "";

  try {
    const response = await fetch("detaljeret_tid_semesterplan_cleaned.json");
    const data = await response.json();
    
    createDetaljeretTidTable(data);
  } catch (err) {
    container.innerHTML = "<p>❌ Fejl ved indlæsning.</p>";
    console.error("🚫", err);
  }
}

function getColor(fag) {
    console.log(`getColor kaldt med: "${fag}"`);
    if (!fag) {
        console.log("Ingen fag tekst, returnerer hvid");
        return "#ffffff"; // Hvid for tomme celler
    }
    
    const lowerFag = fag.toLowerCase();
    console.log(`Konverteret til lowercase: "${lowerFag}"`);
    
    // Gul for Basisteori
    if (lowerFag.includes("basisteori") || lowerFag.includes("bt")) {
        console.log("Matcher basisteori, returnerer gul");
        return "#ffff00"; // Gul
    }
    
    // Rød for Fysisk træning og Skydning
    if (lowerFag.includes("fysisk") || lowerFag.includes("mft") || 
        lowerFag.includes("skydning") || lowerFag.includes("skyt")) {
        console.log("Matcher fysisk/skydning, returnerer rød");
        return "#ff4444"; // Rød
    }
    
    // Grå for alle andre fag (CBRN, Hvervning, Våbenuddannelse, Eksercits, Feltøvelser)
    if (lowerFag.includes("cbrn") || lowerFag.includes("hvervning") || 
        lowerFag.includes("våben") || lowerFag.includes("gv") ||
        lowerFag.includes("eksercits") || lowerFag.includes("eks") ||
        lowerFag.includes("felt") || lowerFag.includes("hver")) {
        console.log("Matcher andre fag, returnerer grå");
        return "#cccccc"; // Grå
    }
    
    // Standardfarve for andre aktiviteter
    console.log("Ingen match, returnerer hvid");
    return "#ffffff";
}

function createDetaljeretTidTable(data) {
  const container = document.getElementById("timetable-container");
  container.innerHTML = "";

  const ugedage = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"];
  const deler = ["1. DEL", "2. DEL", "3. DEL", "4. DEL"];

  // Opret eksempel data baseret på plukark.json struktur
  const eksempelData = {
    "Uge 1": {
      "Mandag": [
        "Basisteori: Introduktion",
        "Hvervning: Præsentation",
        "CBRN: Intro",
        "Fysisk træning"
      ],
      "Tirsdag": [
        "Skydning: Teori",
        "Skydning: Praksis",
        "Skydning: Evaluering",
        "Fysisk træning"
      ],
      "Onsdag": [
        "Feltøvelse: Orientering",
        "Basisteori: BT 1",
        "Hvervning: HVER 1",
        "CBRN: CBRN 1"
      ],
      "Torsdag": [
        "Eksercits: EKS 1",
        "Våbenuddannelse: GV 1",
        "Fysisk træning",
        "Skydning: SKYT 1"
      ],
      "Fredag": [
        "Basisteori: BT 2",
        "CBRN: CBRN 2",
        "Eksercits: EKS 2",
        "Fysisk træning"
      ]
    },
    "Uge 2": {
      "Mandag": [
        "Basisteori: BT 3",
        "CBRN: CBRN 3",
        "Fysisk træning",
        "Skydning: SKYT 2"
      ],
      "Tirsdag": [
        "Hvervning: HVER 2",
        "Eksercits: EKS 3",
        "Feltøvelse: FELT 1",
        "Våbenuddannelse: GV 2"
      ],
      "Onsdag": [
        "Basisteori: BT 4",
        "Skydning: SKYT 3",
        "Fysisk træning",
        "CBRN: CBRN 4"
      ],
      "Torsdag": [
        "Eksercits: EKS 4",
        "Våbenuddannelse: GV 3",
        "Skydning: SKYT 4",
        "Fysisk træning"
      ],
      "Fredag": [
        "Hvervning: HVER 3",
        "Basisteori: BT 5",
        "Feltøvelse: FELT 2",
        "Skydning: SKYT 5"
      ]
    },
    "Uge 3": {
      "Mandag": [
        "Basisteori: BT 6",
        "CBRN: CBRN 5",
        "Fysisk træning",
        "Våbenuddannelse: GV 4"
      ],
      "Tirsdag": [
        "Skydning: SKYT 6",
        "Eksercits: EKS 5",
        "Feltøvelse: FELT 3",
        "Skydning: SKYT 7"
      ],
      "Onsdag": [
        "Basisteori: BT 7",
        "Hvervning: HVER 4",
        "CBRN: CBRN 6",
        "Fysisk træning"
      ],
      "Torsdag": [
        "Eksercits: EKS 6",
        "Våbenuddannelse: GV 5",
        "Feltøvelse: FELT 4",
        "Skydning: SKYT 8"
      ],
      "Fredag": [
        "Basisteori: BT 8",
        "CBRN: CBRN 7",
        "Hvervning: HVER 5",
        "Fysisk træning"
      ]
    },
    "Uge 4": {
      "Mandag": [
        "Basisteori: BT 9",
        "Skydning: SKYT 9",
        "Eksercits: EKS 7",
        "Fysisk træning"
      ],
      "Tirsdag": [
        "Feltøvelse: FELT 5",
        "Hvervning: HVER 6",
        "CBRN: CBRN 8",
        "Skydning: SKYT 10"
      ],
      "Onsdag": [
        "Basisteori: Evaluering",
        "Våbenuddannelse: GV 6",
        "Fysisk træning",
        "CBRN: CBRN 9"
      ],
      "Torsdag": [
        "Eksercits: EKS 8",
        "Skydning: SKYT 11",
        "Feltøvelse: FELT 6",
        "Hvervning: HVER 7"
      ],
      "Fredag": [
        "Basisteori: BT 10",
        "Fysisk træning",
        "CBRN: CBRN 10",
        "Skydning: SKYT 12"
      ]
    }
  };

  Object.keys(eksempelData).forEach((ugeKey, ugeIndex) => {
    const ugeData = eksempelData[ugeKey];
    
    // Opret uge header
    const ugeHeader = document.createElement("h3");
    ugeHeader.textContent = ugeKey;
    container.appendChild(ugeHeader);
    
    // Opret tabel
    const table = document.createElement("table");
    table.className = "tidstabel uge-tabel";
    table.id = `uge${ugeIndex + 1}`;
    
    // Øverste række: Dage
    const dagHeaderRow = document.createElement("tr");
    dagHeaderRow.innerHTML = `<th></th>`; // Tom hjørnecelle
    
    ugedage.forEach((dag, dagIndex) => {
      const dayCell = document.createElement("th");
      dayCell.colSpan = 4;
      dayCell.textContent = dag;
      dagHeaderRow.appendChild(dayCell);
    });
    table.appendChild(dagHeaderRow);
    
    // Næste række: DEL headers
    const delHeaderRow = document.createElement("tr");
    delHeaderRow.innerHTML = `<th>Tid</th>`;
    for (let i = 0; i < 5; i++) {
      deler.forEach((del, delIndex) => {
        const delCell = document.createElement("td");
        delCell.textContent = del;
        delCell.className = "delHeader";
        delHeaderRow.appendChild(delCell);
      });
    }
    table.appendChild(delHeaderRow);
    
    // Indholdsrækker: 4 rækker (én per DEL)
    const tidsintervaller = ["08:00-10:00", "10:15-12:00", "13:00-14:45", "15:15-16:00"];
    for (let delIndex = 0; delIndex < 4; delIndex++) {
      const contentRow = document.createElement("tr");
      contentRow.innerHTML = `<td>${tidsintervaller[delIndex]}</td>`;
      
      ugedage.forEach((dag, dagIndex) => {
        const cell = document.createElement("td");
        cell.id = `uge-${ugeIndex + 1}-dag-${dagIndex + 1}-del-${delIndex + 1}`;
        cell.textContent = "";
        contentRow.appendChild(cell);
      });
      table.appendChild(contentRow);
    }
    
    container.appendChild(table);
  });

  // Indsæt data
  indsætFagIDetaljeretTid(eksempelData);
  
  // Aktiver drag & drop efter tabellen er oprettet
  enableDragDrop();
}

function getFarveklasse(fag) {
  if (fag.startsWith("Basisteori")) return "gul";
  if (fag.startsWith("Fysisk træning") || fag.startsWith("Skydning")) return "roed";
  if (fag.startsWith("CBRN") || fag.startsWith("Våbenuddannelse") || fag.startsWith("Eksercits") || fag.startsWith("Feltøvelse") || fag.startsWith("Hvervning")) return "graa";
  return "";
}

function indsætFagIDetaljeretTid(data) {
  const ugedage = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"];
  
  Object.keys(data).forEach((ugeKey, ugeIndex) => {
    const ugeData = data[ugeKey];
    ugedage.forEach((dag, dagIndex) => {
      if (ugeData[dag]) {
        ugeData[dag].forEach((fag, delIndex) => {
          const celle = document.querySelector(`#uge-${ugeIndex + 1}-dag-${dagIndex + 1}-del-${delIndex + 1}`);
          if (celle) {
            celle.textContent = fag;
            celle.className = getFarveklasse(fag);
          }
        });
      }
    });
  });
}



function indsætModuler(jsonData) {
    console.log("indsætModuler kaldt med data:", jsonData);
    const ugeContainer = document.getElementById("timetable-container");
    console.log("ugeContainer fundet:", ugeContainer);

    Object.entries(jsonData).forEach(([ugeNavn, ugeData], ugeIndex) => {
        console.log(`Behandler ${ugeNavn} (index ${ugeIndex})`);
        const ugeElement = ugeContainer.querySelector(`#uge${ugeIndex + 1}`);
        console.log(`Uge element fundet:`, ugeElement);
        if (!ugeElement) {
            console.log(`Kunne ikke finde uge element for index ${ugeIndex + 1}`);
            return;
        }

        Object.entries(ugeData).forEach(([dag, moduler], dagIndex) => {
            console.log(`Behandler ${dag} med ${moduler.length} moduler`);
            moduler.forEach((fagtekst, delIndex) => {
                const cellSelector = `#uge${ugeIndex + 1} .row-${delIndex + 1} .col-${dagIndex + 1}`;
                console.log(`Søger efter celle med selector: ${cellSelector}`);
                const celle = document.querySelector(cellSelector);
                console.log(`Celle fundet:`, celle);
                if (celle) {
                    console.log(`Indsætter "${fagtekst}" i celle`);
                    celle.textContent = fagtekst;
                    const farve = getColor(fagtekst);
                    celle.style.backgroundColor = farve;
                    console.log(`Anvendt farve: ${farve}`);
                    
                    // Tilføj CSS klasser for bedre styling
                    celle.classList.remove('basisteori', 'fysisk', 'skydning', 'cbrn', 'hvervning', 'vaaben', 'eksercits', 'felt');
                    
                    const lowerFag = fagtekst.toLowerCase();
                    if (lowerFag.includes('basisteori') || lowerFag.includes('bt')) {
                        celle.classList.add('basisteori');
                    } else if (lowerFag.includes('fysisk') || lowerFag.includes('mft')) {
                        celle.classList.add('fysisk');
                    } else if (lowerFag.includes('skydning') || lowerFag.includes('skyt')) {
                        celle.classList.add('skydning');
                    } else if (lowerFag.includes('cbrn')) {
                        celle.classList.add('cbrn');
                    } else if (lowerFag.includes('hvervning') || lowerFag.includes('hver')) {
                        celle.classList.add('hvervning');
                    } else if (lowerFag.includes('våben') || lowerFag.includes('gv')) {
                        celle.classList.add('vaaben');
                    } else if (lowerFag.includes('eksercits') || lowerFag.includes('eks')) {
                        celle.classList.add('eksercits');
                    } else if (lowerFag.includes('felt')) {
                        celle.classList.add('felt');
                    }
                } else {
                    console.log(`Kunne ikke finde celle med selector: ${cellSelector}`);
                }
            });
        });
    });
    console.log("indsætModuler færdig");
}

// Klassifikation baseret på nøgleord
function getColorClass(text) {
  const t = text.toLowerCase();
  if (t.includes("fysisk")) return "grøn";
  if (t.includes("basisteori") || t.includes("avanceret teori")) return "gul";
  if (t.includes("cbrn") || t.includes("nærkamp") || t.includes("sky") || t.includes("eksercise")) return "rød";
  if (t.includes("frokost") || t.includes("transport")) return "grå";
  return "";
}

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

  // ryd eksisterende events fra alle kalendere
  window.allCalendars.forEach(cal => {
    cal.getEvents().forEach(event => event.remove());
  });

  // Beregn total antal arbejdsdage
  let totalWorkDays = 0;
  let currentDate = new Date(start);
  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // kun hverdage
      totalWorkDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Beregn uge 1-3 datoer (første 3 uger fra startdato)
  const week1Start = new Date(start);
  const week3End = new Date(start);
  week3End.setDate(week3End.getDate() + 20); // 3 uger = 21 dage (0-20)

  currentDate = new Date(start);

  // FASE 1: Basisteori i uge 1-3 (første 3 uger)
  if (selectedSubjects['Basisteori']) {
    let btIndex = 0;
    const btLessons = selectedSubjects['Basisteori'];

    while (currentDate <= week3End && btIndex < btLessons.length) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // kun hverdage
        const lesson = btLessons[btIndex];

        const targetCalendar = getCalendarForDate(currentDate);
        if (targetCalendar) {
          targetCalendar.addEvent({
            title: lesson.title,
            start: currentDate.toISOString().split('T')[0],
            allDay: true,
            backgroundColor: lesson.color,
            borderColor: lesson.color
          });
        }
        btIndex++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // FASE 2: Feltøvelser (hele uger)
  const fieldExercises = selectedSubjects['Feltøvelser'] || [];
  let fieldIndex = 0;

  // Start efter uge 3
  currentDate = new Date(week3End);
  currentDate.setDate(currentDate.getDate() + 1);

  while (currentDate <= end && fieldIndex < fieldExercises.length) {
    // Find mandag i den aktuelle uge
    const dayOfWeek = currentDate.getDay();
    const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    currentDate.setDate(currentDate.getDate() + daysToMonday);

    if (currentDate > end) break;

    const exercise = fieldExercises[fieldIndex];

    // Læg øvelsen på hele ugen (mandag til fredag)
    for (let day = 0; day < 5; day++) {
      const exerciseDate = new Date(currentDate);
      exerciseDate.setDate(exerciseDate.getDate() + day);

      if (exerciseDate <= end) {
        const targetCalendar = getCalendarForDate(exerciseDate);
        if (targetCalendar) {
          targetCalendar.addEvent({
            title: exercise.title,
            start: exerciseDate.toISOString().split('T')[0],
            allDay: true,
            backgroundColor: exercise.color,
            borderColor: exercise.color
          });
        }
      }
    }

    fieldIndex++;
    // Gå til næste uge efter øvelsen
    currentDate.setDate(currentDate.getDate() + 7);
  }

  // FASE 3: Distribuer andre fag på tværs af alle måneder
  const otherSubjects = Object.keys(selectedSubjects).filter(subject => 
    subject !== 'Basisteori' && subject !== 'Feltøvelser'
  );

  // Beregn hvor mange lektioner der skal fordeles pr. måned
  const remainingWorkDays = totalWorkDays - 15; // 15 dage til BT (3 uger)
  const fieldExerciseWeeks = fieldExercises.length;
  const remainingDaysAfterField = remainingWorkDays - (fieldExerciseWeeks * 5);

  // Saml alle lektioner fra andre fag
  const allOtherLessons = [];
  otherSubjects.forEach(subject => {
      selectedSubjects[subject].forEach(lesson => {
      allOtherLessons.push(lesson);
    });
  });

  // Distribuer lektioner på tværs af alle måneder
  let lessonIndex = 0;
  currentDate = new Date(start);

  // Start efter uge 3
  currentDate = new Date(week3End);
  currentDate.setDate(currentDate.getDate() + 1);

  // Spring over feltøvelser uger
  if (fieldExercises.length > 0) {
    let fieldEndDate = new Date(currentDate);
    let weekCount = 0;
    
    while (fieldEndDate <= end && weekCount < fieldExercises.length) {
      const dayOfWeek = fieldEndDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
      fieldEndDate.setDate(fieldEndDate.getDate() + daysToMonday);
      
      if (fieldEndDate > end) break;
      
      fieldEndDate.setDate(fieldEndDate.getDate() + 7);
      weekCount++;
    }
    currentDate = new Date(fieldEndDate);
  }

  // Distribuer lektioner på resterende dage
  while (currentDate <= end && lessonIndex < allOtherLessons.length) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // kun hverdage

      // Læg 2-4 lektioner per dag
      const lessonsPerDay = Math.min(Math.floor(Math.random() * 3) + 2, allOtherLessons.length - lessonIndex, 4);

      for (let i = 0; i < lessonsPerDay && lessonIndex < allOtherLessons.length; i++) {
        const lesson = allOtherLessons[lessonIndex];

        const targetCalendar = getCalendarForDate(currentDate);
        if (targetCalendar) {
          targetCalendar.addEvent({
            title: lesson.title,
            start: currentDate.toISOString().split('T')[0],
            allDay: true,
            backgroundColor: lesson.color,
            borderColor: lesson.color
          });
        }
        lessonIndex++;
      }
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // FASE 4: Fyld tomme dage med gentagelser
  currentDate = new Date(start);
  
  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // kun hverdage
      
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
          if (subject !== 'Feltøvelser') {
              selectedSubjects[subject].forEach(lesson => {
                allAvailableLessons.push(lesson);
              });
            }
          });

          if (allAvailableLessons.length > 0) {
            const randomLesson = allAvailableLessons[Math.floor(Math.random() * allAvailableLessons.length)];
            const timeSlots = ['08:00-10:00', '10:15-12:15', '13:00-15:00', '15:15-17:15'];
            const timeSlot = timeSlots[(existingEvents.length + i) % timeSlots.length];

          const targetCalendar = getCalendarForDate(currentDate);
          if (targetCalendar) {
            targetCalendar.addEvent({
              title: randomLesson.title,
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

// Hjælpefunktion til at finde den rigtige kalender for en dato
function getCalendarForDate(date) {
  const month = date.getMonth();
  const year = date.getFullYear();
  
  if (year === 2025) {
    return window.allCalendars[month - 7]; // August=7 -> 0, September=8 -> 1, etc.
  } else if (year === 2026 && month === 0) { // Januar 2026
    return window.allCalendars[5]; // Januar 2026 er index 5
  }
  return null;
}

// Recompute hours table whenever events change
function computeHours() {
  const weeks = {};

  // Get date range from AKOS
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate all weeks in the date range
    let currentDate = new Date(start);
    while (currentDate <= end) {
      const onejan = new Date(currentDate.getFullYear(), 0, 1);
      const weekNumber = Math.ceil((((currentDate - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      weeks[weekNumber] = 37; // Always 37 hours per week
      currentDate.setDate(currentDate.getDate() + 7);
    }
  }

  const tbody = document.querySelector('#hoursTable tbody');
  if (tbody) {
  tbody.innerHTML = '';

  Object.keys(weeks).sort((a, b) => a - b).forEach(week => {
    const hours = weeks[week];
      const status = 'OK'; // Always OK since it's exactly 37 hours
    const row = document.createElement('tr');
    row.innerHTML = `<td>${week}</td><td>${hours}</td><td>${status}</td>`;
    tbody.appendChild(row);
  });
  }

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
    // Distribute hours across 3 DELs (40%, 35%, 25%)
    const del1Hours = Math.floor(totalHours * 0.4);
    const del2Hours = Math.floor(totalHours * 0.35);
    const del3Hours = totalHours - del1Hours - del2Hours;

    del1HoursEl.textContent = del1Hours;
    del2HoursEl.textContent = del2Hours;
    del3HoursEl.textContent = del3Hours;
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

  if (!weekSelect) return;

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
        const eventDate = new Date(event.start);
        const targetCalendar = getCalendarForDate(eventDate);
        if (targetCalendar) {
          targetCalendar.addEvent({
            title: `[IMPORT] ${event.title}`,
            start: event.start,
            allDay: true,
            backgroundColor: event.backgroundColor || '#FF6B6B',
            borderColor: event.borderColor || '#FF6B6B'
          });
        }
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

  if (!statusDiv) return;

  statusDiv.style.display = 'block';

  // Check for missing lessons
  const allEvents = [];
  if (window.allCalendars) {
    window.allCalendars.forEach(cal => {
      cal.getEvents().forEach(event => {
        allEvents.push(event.title);
      });
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

      if (missingDiv) {
        if (missingLessons.length > 0) {
          missingDiv.innerHTML = `<strong>Manglende lektioner:</strong><br>${missingLessons.slice(0, 5).join('<br>')}`;
          if (missingLessons.length > 5) {
            missingDiv.innerHTML += `<br>... og ${missingLessons.length - 5} flere`;
          }
        } else {
          missingDiv.innerHTML = '<strong style="color: green;">✓ Alle valgte lektioner er planlagt</strong>';
        }
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

      if (sequenceDiv) {
        if (sequenceIssues.length > 0) {
          sequenceDiv.innerHTML = `<strong style="color: orange;">⚠ Rækkefølge advarsler:</strong><br>${sequenceIssues.slice(0, 3).join('<br>')}`;
        } else {
          sequenceDiv.innerHTML = '<strong style="color: green;">✓ Basisteori rækkefølge OK</strong>';
        }
      }
    });
}

// Save events to storage with ENH identifier
function saveEventsToStorage() {
  const enhType = document.getElementById('enhSelect').value;
  const allEvents = [];

  if (window.allCalendars) {
    window.allCalendars.forEach(cal => {
      cal.getEvents().forEach(e => {
        allEvents.push({
          title: e.title, 
          start: e.startStr, 
          backgroundColor: e.backgroundColor,
          borderColor: e.borderColor 
        });
      });
    });
  }

  localStorage.setItem('planops_events', JSON.stringify(allEvents));
  localStorage.setItem(`planops_events_${enhType}_${Date.now()}`, JSON.stringify(allEvents));
}

// Generate SKEMA based on selected week and AKOS data
function generateSkema() {
  const weekSelect = document.getElementById('weekSelect');
  const delSelect = document.getElementById('delSelect');
  
  if (!weekSelect || !delSelect) {
    console.error('Week or DEL selector not found');
    return;
  }
  
  const selectedWeek = weekSelect.value;
  const selectedDel = delSelect.value;
  
  if (!selectedWeek) {
    alert('Vælg en uge først.');
    return;
  }

  // Get events for the selected week from all calendars
  const weekEvents = [];
  if (window.allCalendars) {
    window.allCalendars.forEach(cal => {
      cal.getEvents().forEach(event => {
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
    });
  }

  // Generate skema for all DELs
  generateDelSkema(1, weekEvents);
  generateDelSkema(2, weekEvents);
  generateDelSkema(3, weekEvents);
  generateDelSkema(4, weekEvents);

  // Show selected DEL
  showDelSkema(selectedDel);
}

function generateSkemaGrid(weekEvents) {
  const tbody = document.getElementById('skemaGridBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  // Define time slots
  const timeSlots = [
    '08:40-09:25',
    '09:45-10:30',
    '10:45-11:30',
    '11:45-12:30',
    '13:00-13:45',
    '14:00-14:45',
    '15:00-15:45',
    '15:55-16:40'
  ];

  // Create rows for each time slot
  timeSlots.forEach(timeSlot => {
    const row = document.createElement('tr');
    
    // Add time slot cell
    const timeCell = document.createElement('td');
    timeCell.className = 'time-slot';
    timeCell.textContent = timeSlot;
    row.appendChild(timeCell);

    // Add cells for each day (5 days) and each DEL (4 DELs per day) = 20 cells
    for (let day = 0; day < 5; day++) {
      for (let del = 0; del < 4; del++) {
        const cell = document.createElement('td');
        
        // Find activity for this time slot, day, and DEL
        const activity = findActivityForTimeSlot(weekEvents, timeSlot, day, del);
        
        if (activity) {
          cell.className = `activity-cell activity-${activity.subject.toLowerCase()}`;
          cell.textContent = activity.title;
        }
        
        row.appendChild(cell);
      }
    }

    tbody.appendChild(row);
  });
}

function findActivityForTimeSlot(weekEvents, timeSlot, day, del) {
  // This is a simplified version - you can enhance this logic
  // to properly match activities based on time, day, and DEL
  
  const dayNames = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
  const dayName = dayNames[day];
  
  // Find events for this day
  const dayEvents = weekEvents.filter(event => {
    const eventDate = new Date(event.start);
    const eventDay = eventDate.getDay();
    return eventDay === (day + 1); // Monday = 1, Tuesday = 2, etc.
  });

  // Simple distribution: assign events to DELs based on index
  if (dayEvents.length > del) {
    return {
      title: dayEvents[del].title,
      subject: dayEvents[del].title.split(':')[0] || 'basisteori'
    };
  }

  // Default activities for empty slots
  const defaultActivities = [
    { title: 'FROKOST', subject: 'frokost' },
    { title: 'Klargøring', subject: 'klargøring' },
    { title: 'Fysisk træning', subject: 'fysisk' },
    { title: 'Eksercits', subject: 'eksercits' }
  ];

  return defaultActivities[del % defaultActivities.length];
}

// Initialize sergeant AFSP status
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

// Show sergeant detail view
function showSergeantDetail(sergeantId, sergeantName) {
  console.log('showSergeantDetail called for:', sergeantId, sergeantName);
  
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

    <div style="margin-bottom: 2rem; padding: 1rem; background-color: #fff; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h4>Interaktiv Timer Oversigt</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
        <div style="padding: 15px; background-color: #e8f5e8; border-radius: 5px; text-align: center;">
          <h5 style="margin: 0 0 10px 0; color: #2d5a2d;">Samlede Timer</h5>
          <div id="total-hours" style="font-size: 24px; font-weight: bold; color: #2d5a2d;">0</div>
    </div>
        <div style="padding: 15px; background-color: #ffe8e8; border-radius: 5px; text-align: center;">
          <h5 style="margin: 0 0 10px 0; color: #8b0000;">Overtid</h5>
          <div id="overtime-hours" style="font-size: 24px; font-weight: bold; color: #8b0000;">0</div>
      </div>
        <div style="padding: 15px; background-color: #e8f4fd; border-radius: 5px; text-align: center;">
          <h5 style="margin: 0 0 10px 0; color: #1e3a8a;">Uger i Perioden</h5>
          <div id="weeks-count" style="font-size: 24px; font-weight: bold; color: #1e3a8a;">0</div>
        </div>
        <div style="padding: 15px; background-color: #fff3cd; border-radius: 5px; text-align: center;">
          <h5 style="margin: 0 0 10px 0; color: #856404;">Gns. Timer/Uge</h5>
          <div id="avg-hours-week" style="font-size: 24px; font-weight: bold; color: #856404;">0</div>
        </div>
      </div>
      <div id="afspadsering-integrated" style="margin-top: 15px;">
        <!-- Afspadsering functionality will be integrated here -->
      </div>
    </div>

    <div id="sergeant-calendar-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-bottom: 2rem;">
      <!-- Calendars will be inserted here -->
    </div>
  `;

  mainContent.appendChild(detailView);

  // Hide main tables
  document.querySelectorAll('#arbtid-tab > h3, #arbtid-tab > h4, #arbtid-tab > table').forEach(el => {
    el.style.display = 'none';
  });

  // Generate sergeant calendar
  generateSergeantCalendar(sergeantId, sergeantName);
  
  // Calculate and display initial hours
  calculateAndDisplayHours(sergeantId);
  
  // Generate integrated afspadsering functionality
  console.log('About to call generateIntegratedAfspadsering for:', sergeantId);
  generateIntegratedAfspadsering(sergeantId);
  console.log('generateIntegratedAfspadsering called');
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
  buttons[3].style.backgroundColor = '#34404B'; // Aktivér AFSP

  // Highlight active button
  if (sergeantAfspStatus[sergeantId].current) {
    buttons[1].style.backgroundColor = '#2980b9';
  } else if (sergeantAfspStatus[sergeantId].preview) {
    buttons[2].style.backgroundColor = '#e67e22'; // Keep same orange color
  } else if (sergeantAfspStatus[sergeantId].active) {
    buttons[3].style.backgroundColor = '#34404B';
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
    'sgt-d3': { hours: 133, overtime: 0 },
    'sgt-d4': { hours: 159, overtime: 22 },
    'sgt-d5': { hours: 131, overtime: 0 }
  };

  const data = originalData[sergeantId] || { hours: 0, overtime: 0 };
  let hours = data.hours;
  let overtime = data.overtime;

  // Apply AFSP status
  if (sergeantAfspStatus[sergeantId].preview) {
    // Reduce overtime by 37 hours (one week of work)
    overtime = Math.max(0, overtime - 37);
    hours = Math.max(0, hours - 37);
  } else if (sergeantAfspStatus[sergeantId].active) {
    // Apply AFSP plan
    overtime = Math.max(0, overtime - 37);
    hours = Math.max(0, hours - 37);
  }

  // Update display
  const hoursEl = document.getElementById(`${sergeantId}-hours`);
  const overtimeEl = document.getElementById(`${sergeantId}-overtime`);
  const statusEl = document.getElementById(`${sergeantId}-status`);

  if (hoursEl) hoursEl.textContent = hours;
  if (overtimeEl) overtimeEl.textContent = overtime;

  // Update status
  if (statusEl) {
    if (overtime === 0) {
      statusEl.textContent = 'OK';
    } else if (overtime > 20) {
      statusEl.textContent = 'Kritisk Overtid';
    } else {
      statusEl.textContent = 'OK';
    }
  }

  // Update row background color
  const row = document.querySelector(`#${sergeantId}-hours`).closest('tr');
  if (row) {
    if (overtime > 20) {
      row.style.backgroundColor = '#dc3545'; // Keep original red background for critical overtime
    } else {
      row.style.backgroundColor = '';
    }
  }
}

// Generate sergeant calendar
function generateSergeantCalendar(sergeantId, sergeantName) {
  const container = document.getElementById('sergeant-calendar-container');
  container.innerHTML = '';

  // Generate calendars for the same period as main AKOS (August 2025 to January 2026)
  const months = [
    { year: 2025, month: 7, name: 'august 2025' },
    { year: 2025, month: 8, name: 'september 2025' },
    { year: 2025, month: 9, name: 'oktober 2025' },
    { year: 2025, month: 10, name: 'november 2025' },
    { year: 2025, month: 11, name: 'december 2025' },
    { year: 2026, month: 0, name: 'januar 2026' }
  ];

  months.forEach(({ year, month, name }) => {
    const calendarDiv = document.createElement('div');
    calendarDiv.style.cssText = `
      background: white;
      border-radius: 5px;
      padding: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;

    const title = document.createElement('h4');
    title.textContent = name;
    title.style.cssText = `
      margin: 0 0 10px 0;
      text-align: center;
      color: #333;
    `;
    calendarDiv.appendChild(title);

    const calendarGrid = generateWorkPatternWithEvents(sergeantId, new Date(year, month, 1));
    calendarDiv.appendChild(calendarGrid);

    container.appendChild(calendarDiv);
  });
}

// Generate work pattern with AKOS events for a month
function generateWorkPatternWithEvents(sergeantId, date) {
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '2px';

  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  // Add day headers
  const dayNames = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
  dayNames.forEach(day => {
    const dayHeader = document.createElement('div');
    dayHeader.textContent = day;
    dayHeader.style.textAlign = 'center';
    dayHeader.style.fontWeight = 'bold';
    dayHeader.style.padding = '5px';
    dayHeader.style.backgroundColor = '#f8f9fa';
    grid.appendChild(dayHeader);
  });

  // Add empty cells for days before the first day of the month
  for (let i = 0; i < firstDayOfMonth; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.style.padding = '5px';
    emptyCell.style.backgroundColor = '#f8f9fa';
    grid.appendChild(emptyCell);
  }

  // Add days of the month with simplified colors
  for (let day = 1; day <= daysInMonth; day++) {
    const dayCell = document.createElement('div');
    dayCell.style.textAlign = 'center';
    dayCell.style.padding = '8px';
    dayCell.style.border = '1px solid #ddd';
    dayCell.style.cursor = 'pointer';
    dayCell.style.minHeight = '40px';
    dayCell.style.fontSize = '12px';
    dayCell.style.display = 'flex';
    dayCell.style.alignItems = 'center';
    dayCell.style.justifyContent = 'center';

    const currentDate = new Date(date.getFullYear(), date.getMonth(), day);
    const dayOfWeek = currentDate.getDay();

    // Add day number
    dayCell.textContent = day;

    // Check if it's a weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      dayCell.style.backgroundColor = '#e9ecef';
      dayCell.style.color = '#6c757d';
    } else {
      // Check saved work hours for this day
      const savedHours = getSergeantWorkHours(sergeantId, currentDate);
      
      if (savedHours) {
        if (savedHours.workType === 'afspadsering') {
          // Black for afspadsering
          dayCell.style.backgroundColor = '#000';
          dayCell.style.color = '#fff';
        } else if (savedHours.workType === 'dayoff') {
          // Gray for day off
          dayCell.style.backgroundColor = '#e9ecef';
          dayCell.style.color = '#6c757d';
        } else {
          // Green for workdays
          dayCell.style.backgroundColor = '#90EE90';
          dayCell.style.color = '#000';
        }
      } else {
        // Green for default workdays
        dayCell.style.backgroundColor = '#90EE90';
        dayCell.style.color = '#000';
      }
    }

    // Add click event to edit hours
    dayCell.addEventListener('click', () => {
      editWorkHours(sergeantId, currentDate, dayCell);
    });

    grid.appendChild(dayCell);
  }

  return grid;
}

// Get events for a specific date from AKOS calendars
function getEventsForDate(date) {
  const events = [];
  const dateString = date.toISOString().split('T')[0];
  
  if (window.allCalendars) {
    window.allCalendars.forEach(calendar => {
      const calendarEvents = calendar.getEvents();
      calendarEvents.forEach(event => {
        if (event.startStr && event.startStr.includes(dateString)) {
          events.push({
            title: event.title,
            backgroundColor: event.backgroundColor || '#378006',
            start: event.startStr
          });
        }
      });
    });
  }
  
  return events;
}

// Edit work hours for a specific day
function editWorkHours(sergeantId, date, dayEl) {
  const currentHours = getSergeantWorkHours(sergeantId, date);

  // Create modal for editing work hours
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '1000';

  const modalContent = document.createElement('div');
  modalContent.style.backgroundColor = '#fff';
  modalContent.style.padding = '20px';
  modalContent.style.borderRadius = '8px';
  modalContent.style.minWidth = '300px';
  modalContent.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';

  const dateString = date.toLocaleDateString('da-DK');
  modalContent.innerHTML = `
    <h3 style="margin-top: 0; margin-bottom: 20px;">Rediger arbejdstid - ${dateString}</h3>
    
    <div style="margin-bottom: 15px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">Arbejdstype:</label>
      <div style="margin-bottom: 10px;">
        <input type="radio" id="workday" name="workType" value="workday" ${!currentHours || currentHours.hours > 0 ? 'checked' : ''}>
        <label for="workday">Arbejdsdag</label>
    </div>
      <div style="margin-bottom: 10px;">
        <input type="radio" id="dayoff" name="workType" value="dayoff" ${currentHours && currentHours.hours === 0 ? 'checked' : ''}>
        <label for="dayoff">Fridag</label>
    </div>
      <div style="margin-bottom: 10px;">
        <input type="radio" id="afspadsering" name="workType" value="afspadsering">
        <label for="afspadsering">Afspadsering</label>
      </div>
    </div>
    
    <div id="timeInputs" style="margin-bottom: 20px;">
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">Start tid:</label>
      <input type="time" id="startTime" value="${currentHours ? currentHours.startTime || '08:00' : '08:00'}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px;">
      
      <label style="display: block; margin-bottom: 5px; font-weight: bold;">Slut tid:</label>
      <input type="time" id="endTime" value="${currentHours ? currentHours.endTime || '16:00' : '16:00'}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
    </div>
    
    <div style="display: flex; gap: 10px; justify-content: flex-end;">
      <button id="cancelBtn" style="padding: 8px 16px; border: 1px solid #ddd; background: #f8f9fa; border-radius: 4px; cursor: pointer;">Annulér</button>
      <button id="saveBtn" style="padding: 8px 16px; border: none; background: #28a745; color: white; border-radius: 4px; cursor: pointer;">Gem</button>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Handle work type changes
  const workTypeInputs = modal.querySelectorAll('input[name="workType"]');
  const timeInputs = modal.querySelector('#timeInputs');

  workTypeInputs.forEach(input => {
    input.addEventListener('change', function() {
      if (this.value === 'dayoff' || this.value === 'afspadsering') {
        timeInputs.style.display = 'none';
      } else {
        timeInputs.style.display = 'block';
      }
    });
  });

  // Handle save button
  modal.querySelector('#saveBtn').addEventListener('click', function() {
    const workType = modal.querySelector('input[name="workType"]:checked').value;
    const startTime = modal.querySelector('#startTime').value;
    const endTime = modal.querySelector('#endTime').value;
    
    let hours = 0;
    let startTimeStr = '';
    let endTimeStr = '';
    
    if (workType === 'workday') {
      // Calculate hours between start and end time
      const start = new Date(`2000-01-01T${startTime}`);
      const end = new Date(`2000-01-01T${endTime}`);
      hours = (end - start) / (1000 * 60 * 60);
      startTimeStr = startTime;
      endTimeStr = endTime;
    } else if (workType === 'afspadsering') {
      hours = -8; // Negative hours for time off
    }
    
    const workData = {
      hours: hours,
      workType: workType,
      startTime: startTimeStr,
      endTime: endTimeStr,
      date: date.toISOString().split('T')[0]
    };
    
    saveSergeantWorkHours(sergeantId, date.toISOString().split('T')[0], workData);
    
    // Update display
    if (workType === 'workday') {
      dayEl.style.backgroundColor = '#90EE90';
      dayEl.style.color = '#000';
    } else if (workType === 'afspadsering') {
      dayEl.style.backgroundColor = '#000';
      dayEl.style.color = '#fff';
    } else {
      dayEl.style.backgroundColor = '#e9ecef';
      dayEl.style.color = '#6c757d';
    }
    
    // Recalculate totals
    updateSergeantTotalHours(sergeantId);
    
    // Close modal
    document.body.removeChild(modal);
  });

  // Handle cancel button
  modal.querySelector('#cancelBtn').addEventListener('click', function() {
    document.body.removeChild(modal);
  });

  // Close modal when clicking outside
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// Get sergeant work hours for a specific date
function getSergeantWorkHours(sergeantId, date) {
  const dateKey = date.toISOString().split('T')[0];
  const saved = localStorage.getItem(`sergeant_${sergeantId}_${dateKey}`);
  if (saved) {
    const data = JSON.parse(saved);
    return data;
  }
  return null;
}

// Save sergeant work hours
function saveSergeantWorkHours(sergeantId, dateKey, workData) {
  localStorage.setItem(`sergeant_${sergeantId}_${dateKey}`, JSON.stringify(workData));
}

// Update sergeant total hours
function updateSergeantTotalHours(sergeantId) {
  // This would recalculate total hours based on saved work data
  // For now, we'll just update the display
  console.log(`Updating total hours for ${sergeantId}`);
}

// Update AFSP info
function updateAfspInfo(sergeantId) {
  const currentOvertimeEl = document.getElementById('current-overtime');
  const suggestedDaysEl = document.getElementById('suggested-days');
  
  if (currentOvertimeEl && suggestedDaysEl) {
  const overtimeEl = document.getElementById(`${sergeantId}-overtime`);
    const currentOvertime = overtimeEl ? parseInt(overtimeEl.textContent) : 0;
    
    currentOvertimeEl.textContent = currentOvertime;
    suggestedDaysEl.textContent = Math.ceil(currentOvertime / 8); // Assuming 8 hours per day
  }
} 

// Calculate and display hours for sergeant
function calculateAndDisplayHours(sergeantId) {
  // Use the same period as the main ARBEJDSTID calculation (August 2025 to January 2026)
  const startDate = new Date(2025, 7, 1); // August 1, 2025
  const endDate = new Date(2026, 0, 31); // January 31, 2026
  
  let totalHours = 0;
  let afspadseringDays = 0;
  
  // Calculate total hours and count afspadsering days
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Weekdays only
      const savedHours = getSergeantWorkHours(sergeantId, d);
      if (savedHours) {
        if (savedHours.workType === 'afspadsering') {
          // Don't count afspadsering days
          afspadseringDays++;
          continue;
        } else if (savedHours.hours > 0) {
          totalHours += savedHours.hours;
    } else {
          totalHours += 8;
        }
      } else {
        totalHours += 8;
      }
    }
  }
  
  const weeksInPeriod = 26; // August 2025 to January 2026 = 26 weeks
  const expectedHours = weeksInPeriod * 37; // 37 hours per week
  const overtime = Math.max(0, totalHours - expectedHours);
  const avgHoursPerWeek = totalHours / weeksInPeriod;
  
  // Update display with error handling
  const totalHoursEl = document.getElementById('total-hours');
  const overtimeHoursEl = document.getElementById('overtime-hours');
  const weeksCountEl = document.getElementById('weeks-count');
  const avgHoursWeekEl = document.getElementById('avg-hours-week');
  
  if (totalHoursEl) totalHoursEl.textContent = Math.round(totalHours);
  if (overtimeHoursEl) overtimeHoursEl.textContent = Math.round(overtime);
  if (weeksCountEl) weeksCountEl.textContent = weeksInPeriod;
  if (avgHoursWeekEl) avgHoursWeekEl.textContent = Math.round(avgHoursPerWeek);
  
  console.log('Calculated values:', { totalHours, afspadseringDays, overtime, expectedHours });
  
  return { totalHours, afspadseringDays, overtime, expectedHours };
}

// Toggle afspadsering plan visibility
function toggleAfspadseringPlan(sergeantId) {
  const container = document.getElementById('afspadsering-plan-container');
  const button = document.getElementById('afspadsering-plan-btn');
  
  if (container.style.display === 'none') {
    container.style.display = 'block';
    button.textContent = 'Skjul Afspadsering Plan';
    generateAfspadseringSchedule(sergeantId);
  } else {
    container.style.display = 'none';
    button.textContent = 'Vis Foreslået Afspadsering Plan';
  }
}

// Generate afspadsering schedule
function generateAfspadseringSchedule(sergeantId) {
  // Use the same period as the main ARBEJDSTID calculation (August 2025 to January 2026)
  const startDate = new Date(2025, 7, 1); // August 1, 2025
  const endDate = new Date(2026, 0, 31); // January 31, 2026
  
  let totalHours = 0;
  let afspadseringDays = 0;
  
  // Calculate total hours and count afspadsering days
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const savedHours = getSergeantWorkHours(sergeantId, d);
      if (savedHours) {
        if (savedHours.workType === 'afspadsering') {
          // Don't count afspadsering days
          afspadseringDays++;
          continue;
        } else if (savedHours.hours > 0) {
          totalHours += savedHours.hours;
        } else {
          totalHours += 8;
        }
      } else {
        totalHours += 8;
      }
    }
  }
  
  const weeksInPeriod = 26; // August 2025 to January 2026 = 26 weeks
  const expectedHours = weeksInPeriod * 37;
  const overtime = Math.max(0, totalHours - expectedHours);
  
  const scheduleContainer = document.getElementById('afspadsering-schedule');
  
  if (afspadseringDays > 0) {
    // Show current afspadsering status
    let statusHTML = `
      <div style="margin-bottom: 20px; padding: 15px; background-color: #e8f5e8; border-radius: 5px; border: 1px solid #c3e6cb;">
        <h5 style="margin: 0 0 10px 0; color: #155724;">Aktuel Afspadsering Status:</h5>
        <p style="margin: 5px 0; color: #155724;"><strong>Afspadseringsdage:</strong> ${afspadseringDays} dage</p>
        <p style="margin: 5px 0; color: #155724;"><strong>Nuværende overtid:</strong> ${Math.round(overtime)} timer</p>
        <button id="cancel-afspadsering-btn" style="background-color: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-size: 14px; margin-top: 10px;">
          Annuller Alle Afspadseringsdage
        </button>
      </div>
    `;
    
    scheduleContainer.innerHTML = statusHTML;
    
    // Add event listener for cancel button
    document.getElementById('cancel-afspadsering-btn').addEventListener('click', function() {
      cancelAfspadsering(sergeantId);
    });
    
  } else if (overtime > 0) {
    const hoursPerDay = 7; // 7 hours per afspadsering day
    const suggestedAfspadseringDays = Math.ceil(overtime / hoursPerDay);
    console.log('Showing apply button for', suggestedAfspadseringDays, 'days (', overtime, 'hours /', hoursPerDay, 'hours per day)');
    
    // Simple apply button integrated in the overview
    scheduleContainer.innerHTML = `
      <div style="padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
        <p style="margin: 0 0 10px 0; font-weight: bold;">Anvend Afspadsering:</p>
        <button id="apply-afspadsering-btn" style="background-color: #34404B; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px;">
          Anvend ${suggestedAfspadseringDays} Afspadseringsdage (${overtime} timer → 0 timer)
        </button>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">
          Dette vil sætte ${suggestedAfspadseringDays} dage til afspadsering (${hoursPerDay} timer per dag) og reducere overtiden fra ${overtime} timer til 0 timer.
        </p>
      </div>
    `;
    
    // Add event listener for apply button
    document.getElementById('apply-afspadsering-btn').addEventListener('click', function() {
      console.log('Apply button clicked!');
      // Generate intelligent schedule when applying
      const schedule = generateIntelligentAfspadseringSchedule(sergeantId, suggestedAfspadseringDays);
      applyAfspadseringPlan(sergeantId, schedule);
    });
  } else {
    scheduleContainer.innerHTML = '<p style="color: green; font-weight: bold;">Ingen overtid - afspadsering er ikke nødvendig.</p>';
  }
}

// Cancel afspadsering
function cancelAfspadsering(sergeantId) {
  console.log('Cancelling afspadsering for', sergeantId);
  
  // Use the same period as the main ARBEJDSTID calculation (August 2025 to January 2026)
  const startDate = new Date(2025, 7, 1); // August 1, 2025
  const endDate = new Date(2026, 0, 31); // January 31, 2026
  
  let cancelledDays = 0;
  
  // Remove afspadsering from all days in the period
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const savedHours = getSergeantWorkHours(sergeantId, d);
      if (savedHours && savedHours.workType === 'afspadsering') {
        const dateKey = d.toISOString().split('T')[0];
        // Remove the saved data (set back to default)
        localStorage.removeItem(`sergeant_${sergeantId}_${dateKey}`);
        cancelledDays++;
      }
    }
  }
  
  console.log('Cancelled afspadsering for', cancelledDays, 'days');
  
  // Force recalculation of hours
  setTimeout(() => {
    // Update hours display first
    calculateAndDisplayHours(sergeantId);
    
    // Update the calendar display to show green squares again
    generateSergeantCalendar(sergeantId, 'Sergent ' + sergeantId.split('-')[1].toUpperCase());
    
    // Update integrated afspadsering functionality
    generateIntegratedAfspadsering(sergeantId);
    
    // Show success message
    const container = document.getElementById('afspadsering-integrated');
    if (container) {
      const successMessage = document.createElement('div');
      successMessage.style.cssText = `
        margin-top: 15px;
        padding: 10px;
        background-color: #d1ecf1;
        color: #0c5460;
        border-radius: 5px;
        border: 1px solid #bee5eb;
      `;
      successMessage.innerHTML = `
        <strong>✓ Afspadsering annulleret!</strong><br>
        ${cancelledDays} afspadseringsdage er fjernet. Timerne er opdateret.
      `;
      
      // Insert success message at the top
      container.insertBefore(successMessage, container.firstChild);
      
      // Remove success message after 5 seconds
      setTimeout(() => {
        if (successMessage.parentNode) {
          successMessage.remove();
        }
      }, 5000);
    }
  }, 100);
}

// Apply afspadsering plan
function applyAfspadseringPlan(sergeantId, schedule) {
  console.log('Applying afspadsering plan for', sergeantId, 'with', schedule.length, 'days');
  
  // Apply afspadsering to each scheduled day
  schedule.forEach(day => {
    const dateKey = day.date.toISOString().split('T')[0];
    const workData = {
      hours: 0,
      workType: 'afspadsering',
      startTime: '00:00',
      endTime: '00:00'
    };
    
    console.log('Setting afspadsering for', dateKey);
    // Save the afspadsering data
    saveSergeantWorkHours(sergeantId, dateKey, workData);
  });
  
  // Force recalculation of hours
  setTimeout(() => {
    // Update hours display first
    calculateAndDisplayHours(sergeantId);
    
    // Update the calendar display to show black squares
    generateSergeantCalendar(sergeantId, 'Sergent ' + sergeantId.split('-')[1].toUpperCase());
    
    // Update integrated afspadsering functionality
    generateIntegratedAfspadsering(sergeantId);
    
    // Show success message
    const container = document.getElementById('afspadsering-integrated');
    if (container) {
      const successMessage = document.createElement('div');
      successMessage.style.cssText = `
        margin-top: 15px;
        padding: 10px;
        background-color: #d4edda;
        color: #155724;
        border-radius: 5px;
        border: 1px solid #c3e6cb;
      `;
      successMessage.innerHTML = `
        <strong>✓ Afspadsering anvendt!</strong><br>
        ${schedule.length} dage er sat til afspadsering. Overtiden er nu 0 timer.
      `;
      
      // Insert success message at the top
      container.insertBefore(successMessage, container.firstChild);
      
      // Remove success message after 5 seconds
      setTimeout(() => {
        if (successMessage.parentNode) {
          successMessage.remove();
        }
      }, 5000);
    }
  }, 100);
}

// Update sergeant total hours (called when editing hours)
function updateSergeantTotalHours(sergeantId) {
  calculateAndDisplayHours(sergeantId);
  
  // Update afspadsering plan if it's visible
  const container = document.getElementById('afspadsering-plan-container');
  if (container && container.style.display !== 'none') {
    generateAfspadseringSchedule(sergeantId);
  }
}

// Generate integrated afspadsering functionality
function generateIntegratedAfspadsering(sergeantId) {
  console.log('generateIntegratedAfspadsering called for:', sergeantId);
  
  // Use the same period as the main ARBEJDSTID calculation (August 2025 to January 2026)
  const startDate = new Date(2025, 7, 1); // August 1, 2025
  const endDate = new Date(2026, 0, 31); // January 31, 2026
  
  let totalHours = 0;
  let afspadseringDays = 0;
  
  // Calculate total hours and count afspadsering days
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const savedHours = getSergeantWorkHours(sergeantId, d);
      if (savedHours) {
        if (savedHours.workType === 'afspadsering') {
          // Don't count afspadsering days
          afspadseringDays++;
          continue;
        } else if (savedHours.hours > 0) {
          totalHours += savedHours.hours;
      } else {
          totalHours += 8;
        }
      } else {
        totalHours += 8;
      }
    }
  }
  
  const weeksInPeriod = 26; // August 2025 to January 2026 = 26 weeks
  const expectedHours = weeksInPeriod * 37;
  const overtime = Math.max(0, totalHours - expectedHours);
  
  console.log('Calculated values:', { totalHours, afspadseringDays, overtime, expectedHours });
  
  const container = document.getElementById('afspadsering-integrated');
  console.log('Container found:', container);
  
  if (!container) {
    console.error('afspadsering-integrated container not found!');
    return;
  }

  if (afspadseringDays > 0) {
    console.log('Showing afspadsering status for', afspadseringDays, 'days');
    // Show current afspadsering status
    container.innerHTML = `
      <div style="padding: 15px; background-color: #e8f5e8; border-radius: 5px; border: 1px solid #c3e6cb;">
        <h5 style="margin: 0 0 10px 0; color: #155724;">Aktuel Afspadsering Status:</h5>
        <p style="margin: 5px 0; color: #155724;"><strong>Afspadseringsdage:</strong> ${afspadseringDays} dage</p>
        <p style="margin: 5px 0; color: #155724;"><strong>Nuværende overtid:</strong> ${Math.round(overtime)} timer</p>
        <button id="cancel-afspadsering-btn" style="background-color: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-size: 14px; margin-top: 10px;">
          Annuller Alle Afspadseringsdage
        </button>
      </div>
    `;
    
    // Add event listener for cancel button
    document.getElementById('cancel-afspadsering-btn').addEventListener('click', function() {
      cancelAfspadsering(sergeantId);
    });
    
  } else if (overtime > 0) {
    const hoursPerDay = 7; // 7 hours per afspadsering day
    const suggestedAfspadseringDays = Math.ceil(overtime / hoursPerDay);
    console.log('Showing apply button for', suggestedAfspadseringDays, 'days (', overtime, 'hours /', hoursPerDay, 'hours per day)');
    
    // Simple apply button integrated in the overview
    container.innerHTML = `
      <div style="padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
        <p style="margin: 0 0 10px 0; font-weight: bold;">Anvend Afspadsering:</p>
        <button id="apply-afspadsering-btn" style="background-color: #34404B; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px;">
          Anvend ${suggestedAfspadseringDays} Afspadseringsdage (${overtime} timer → 0 timer)
        </button>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">
          Dette vil sætte ${suggestedAfspadseringDays} dage til afspadsering (${hoursPerDay} timer per dag) og reducere overtiden fra ${overtime} timer til 0 timer.
        </p>
      </div>
    `;
    
    // Add event listener for apply button
    document.getElementById('apply-afspadsering-btn').addEventListener('click', function() {
      console.log('Apply button clicked!');
      // Generate intelligent schedule when applying
      const schedule = generateIntelligentAfspadseringSchedule(sergeantId, suggestedAfspadseringDays);
      applyAfspadseringPlan(sergeantId, schedule);
    });
  } else {
    console.log('No overtime - showing no afspadsering needed message');
    container.innerHTML = '<p style="color: green; font-weight: bold; text-align: center; padding: 10px;">Ingen overtid - afspadsering er ikke nødvendig.</p>';
  }
}

// Generate intelligent afspadsering schedule
function generateIntelligentAfspadseringSchedule(sergeantId, totalDays) {
  const startDate = new Date(2025, 7, 1); // August 1, 2025
  const endDate = new Date(2026, 0, 31); // January 31, 2026
  
  const schedule = [];
  const usedDates = new Set();
  
  // Phase 1: Prioritize Mondays and Fridays (40% of days)
  const mondayFridays = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if ((dayOfWeek === 1 || dayOfWeek === 5) && // Monday (1) or Friday (5)
        !usedDates.has(d.toDateString()) &&
        !getSergeantWorkHours(sergeantId, d)) {
      mondayFridays.push(new Date(d));
    }
  }
  
  // Add Mondays and Fridays to schedule
  const mondayFridayCount = Math.min(mondayFridays.length, Math.ceil(totalDays * 0.4));
  for (let i = 0; i < mondayFridayCount; i++) {
    const date = mondayFridays[i];
    schedule.push({
      date: date,
      hours: 7
    });
    usedDates.add(date.toDateString());
  }
  
  console.log('Phase 1: Added', mondayFridayCount, 'Mondays/Fridays');
  
  // Phase 2: Add whole weeks if we have enough days left
  const remainingDays = totalDays - schedule.length;
  if (remainingDays >= 5) {
    const wholeWeeks = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 7)) {
      const weekStart = new Date(d);
      const weekEnd = new Date(d);
      weekEnd.setDate(weekEnd.getDate() + 4); // Monday to Friday
      
      // Check if entire week is available
      let weekAvailable = true;
      for (let day = new Date(weekStart); day <= weekEnd; day.setDate(day.getDate() + 1)) {
        if (usedDates.has(day.toDateString()) || getSergeantWorkHours(sergeantId, day)) {
          weekAvailable = false;
          break;
        }
      }
      
      if (weekAvailable) {
        wholeWeeks.push(weekStart);
      }
    }
    
    // Add whole weeks
    const weeksToAdd = Math.min(wholeWeeks.length, Math.floor(remainingDays / 5));
    for (let i = 0; i < weeksToAdd; i++) {
      const weekStart = wholeWeeks[i];
      for (let day = 0; day < 5; day++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + day);
        schedule.push({
          date: date,
          hours: 7
        });
        usedDates.add(date.toDateString());
      }
    }
    console.log('Phase 2: Added', weeksToAdd * 5, 'whole week days');
  }
  
  // Phase 3: Fill remaining days with any available weekdays (less restrictive)
  const remainingDaysAfterWeeks = totalDays - schedule.length;
  if (remainingDaysAfterWeeks > 0) {
    const availableDays = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && // Weekdays only
          !usedDates.has(d.toDateString()) &&
          !getSergeantWorkHours(sergeantId, d)) {
        availableDays.push(new Date(d));
      }
    }
    
    console.log('Phase 3: Found', availableDays.length, 'available days, need', remainingDaysAfterWeeks);
    
    // Add remaining days, trying to avoid consecutive days but not being too strict
    let addedInPhase3 = 0;
    for (let i = 0; i < availableDays.length && addedInPhase3 < remainingDaysAfterWeeks; i++) {
      const date = availableDays[i];
      
      // Check if this would create consecutive afspadsering days
      const prevDay = new Date(date);
      prevDay.setDate(prevDay.getDate() - 1);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const hasConsecutive = usedDates.has(prevDay.toDateString()) || usedDates.has(nextDay.toDateString());
      
      // Be less strict about consecutive days if we're running out of options
      const shouldAdd = !hasConsecutive || (availableDays.length - i < remainingDaysAfterWeeks - addedInPhase3);
      
      if (shouldAdd) {
        schedule.push({
          date: date,
          hours: 7
        });
        usedDates.add(date.toDateString());
        addedInPhase3++;
      }
    }
    
    console.log('Phase 3: Added', addedInPhase3, 'additional days');
  }
  
  // Phase 4: If we still don't have enough days, be even less restrictive
  const finalRemaining = totalDays - schedule.length;
  if (finalRemaining > 0) {
    console.log('Phase 4: Still need', finalRemaining, 'more days, being very flexible');
    
    const allAvailableDays = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && // Weekdays only
          !usedDates.has(d.toDateString()) &&
          !getSergeantWorkHours(sergeantId, d)) {
        allAvailableDays.push(new Date(d));
      }
    }
    
    // Add any remaining available days, even if consecutive
    for (let i = 0; i < Math.min(allAvailableDays.length, finalRemaining); i++) {
      const date = allAvailableDays[i];
      schedule.push({
        date: date,
        hours: 7
      });
      usedDates.add(date.toDateString());
    }
  }
  
  console.log('Generated intelligent afspadsering schedule:', schedule.length, 'days out of', totalDays, 'requested');
  return schedule;
}

// Generate skema for a specific DEL
function generateDelSkema(delNumber, weekEvents) {
  try {
    const skemaTable = document.getElementById(`skemaTable${delNumber}`);
    if (!skemaTable) {
      console.warn(`Skema table ${delNumber} not found`);
      return;
    }

    // Get sergeants for this DEL
    const delSergeants = getDelSergeants(delNumber);
    
    // Calculate sergeant hours for the week
    const sergeantHours = calculateSergeantHours(delNumber, weekEvents);

    const tbody = skemaTable.querySelector('tbody');
    tbody.innerHTML = '';

    // Get week start date
    const selectedWeek = document.getElementById('weekSelect').value;
    const startDate = new Date(document.getElementById('startDate').value);
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + (selectedWeek - 1) * 7);

    // Day names in Danish
    const dayNames = ['', 'MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR', 'SØN'];

    // Collect all activities for the week
    const weekActivities = [];

    // Add events from AKOS calendar
    weekEvents.forEach(event => {
      const dayOfWeek = event.dayOfWeek;
      if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Only weekdays
        const dayIndex = dayOfWeek - 1;
        const sergeant = delSergeants[dayIndex] || 'SGT';
        
        // Clean up title
        let displayTitle = event.title;
        if (displayTitle.includes(':')) {
          displayTitle = displayTitle.split(':')[1].trim();
        }
        if (displayTitle.startsWith('[IMPORT]')) {
          displayTitle = displayTitle.replace('[IMPORT]', '').trim();
        }

        weekActivities.push({
          date: dayNames[dayOfWeek],
          time: '08:00-16:00',
          enh: `${delNumber}. DEL`,
          aktivitet: displayTitle,
          leder: sergeant,
          pakl: 'MTS',
          sted: 'KMP'
        });
      }
    });

    // Group activities by day
    const activitiesByDay = {};
    weekActivities.forEach(activity => {
      if (!activitiesByDay[activity.date]) {
        activitiesByDay[activity.date] = [];
      }
      activitiesByDay[activity.date].push(activity);
    });

    // Generate table rows
    Object.keys(activitiesByDay).forEach(day => {
      const dayActivities = activitiesByDay[day];
      
      // Add day header row
      const dayHeaderRow = document.createElement('tr');
      dayHeaderRow.style.backgroundColor = '#f8f9fa';
      dayHeaderRow.style.fontWeight = 'bold';
      
      const dayHeaderCell = document.createElement('td');
      dayHeaderCell.colSpan = 7;
      dayHeaderCell.textContent = `${day} - ${dayActivities[0].leder}`;
      dayHeaderRow.appendChild(dayHeaderCell);
      tbody.appendChild(dayHeaderRow);

      // Add activity rows
      dayActivities.forEach(activity => {
        const row = document.createElement('tr');
        
        const cells = [
          activity.date,
          activity.time,
          activity.enh,
          activity.aktivitet,
          activity.leder,
          activity.pakl,
          activity.sted
        ];

        cells.forEach(cellText => {
          const cell = document.createElement('td');
          cell.textContent = cellText;
          row.appendChild(cell);
        });

        tbody.appendChild(row);
      });
    });

    // Add week summary row
    const summaryRow = document.createElement('tr');
    summaryRow.style.backgroundColor = '#e9ecef';
    summaryRow.style.fontWeight = 'bold';
    
    const summaryCell = document.createElement('td');
    summaryCell.colSpan = 7;
    summaryCell.textContent = `Uge ${selectedWeek} - ${delNumber}. DEL - Total timer: 37`;
    summaryRow.appendChild(summaryCell);
    tbody.appendChild(summaryRow);

  } catch (error) {
    console.error(`Error generating DEL ${delNumber} skema:`, error);
  }
}

// Drag & Drop funktionalitet
function enableDragDrop() {
  document.querySelectorAll("td").forEach(cell => {
    cell.setAttribute("draggable", true);

    cell.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", cell.textContent);
      e.dataTransfer.effectAllowed = "move";
      cell.classList.add("dragging");
    });

    cell.addEventListener("dragend", () => {
      document.querySelectorAll("td").forEach(c => c.classList.remove("dragging"));
    });

    cell.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });

    cell.addEventListener("drop", e => {
      e.preventDefault();
      const draggedText = e.dataTransfer.getData("text/plain");
      const fromCell = document.querySelector(".dragging");

      const toText = cell.textContent;
      cell.textContent = draggedText;
      fromCell.textContent = toText;

      const fromClass = fromCell.className;
      fromCell.className = cell.className;
      cell.className = fromClass;
    });
  });
}

