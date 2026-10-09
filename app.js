const sessions = [
  { number: 1, dates: ['2026-10-09', '2026-10-10', '2026-10-11'] },
  { number: 2, dates: ['2026-10-23', '2026-10-24', '2026-10-25'] },
  { number: 3, dates: ['2026-11-06', '2026-11-07', '2026-11-08'] },
  { number: 4, dates: ['2026-11-20', '2026-11-21', '2026-11-22'] },
  { number: 5, dates: ['2026-12-04', '2026-12-05', '2026-12-06'] },
  { number: 6, dates: ['2026-12-18', '2026-12-19', '2026-12-20'] },
  { number: 7, dates: ['2027-01-15', '2027-01-16', '2027-01-17'] },
  { number: 8, dates: ['2027-01-22', '2027-01-23', '2027-01-24'] },
];

const days = [
  { name: 'Piątek', short: 'PT' },
  { name: 'Sobota', short: 'SO' },
  { name: 'Niedziela', short: 'ND' },
];

const primaryGroup = '301';

const dateFormatter = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
});
const dateRangeFormatter = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
});

const state = {
  schedule: null,
  selectedSession: 1,
  search: '',
};

const elements = {
  sessionList: document.querySelector('#session-list'),
  dayGrid: document.querySelector('#day-grid'),
  searchInput: document.querySelector('#search-input'),
  announcementList: document.querySelector('#announcement-list'),
  announcementStatus: document.querySelector('#announcements-status'),
  errorBanner: document.querySelector('#error-banner'),
};

function localDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(isoDate) {
  return dateFormatter.format(localDate(isoDate));
}

function formatRange(start, end) {
  const first = localDate(start);
  const last = localDate(end);
  return dateRangeFormatter.formatRange(first, last);
}

function initialSession() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return sessions.find((session) => localDate(session.dates[2]) >= today)?.number ?? sessions.at(-1).number;
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function renderAnnouncement(item) {
  const card = document.createElement('article');
  const isRelevant = item.groups.includes(primaryGroup) || item.groups.length === 0;
  card.className = `announcement-card${isRelevant ? ' is-relevant' : ' is-other-group'}`;

  const header = document.createElement('div');
  header.className = 'announcement-card-header';
  const date = document.createElement('time');
  date.className = 'announcement-date';
  date.dateTime = item.publishedAt;
  date.textContent = new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(item.publishedAt));
  const scope = document.createElement('span');
  scope.className = `announcement-scope${isRelevant ? ' is-relevant' : ''}`;
  scope.textContent = item.scope;
  header.append(date, scope);
  card.append(header);

  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = item.title;
  title.append(link);
  card.append(title);

  if (item.description) {
    const description = document.createElement('p');
    description.textContent = item.description;
    card.append(description);
  }
  return card;
}

function renderAnnouncementMessage(message, isError = false) {
  const empty = document.createElement('p');
  empty.className = `announcement-empty${isError ? ' is-error' : ''}`;
  empty.textContent = message;
  elements.announcementList.replaceChildren(empty);
}

function announcementCount(count) {
  if (count === 1) return '1 komunikat';
  const lastTwo = count % 100;
  const lastDigit = count % 10;
  const noun = lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)
    ? 'komunikaty'
    : 'komunikatów';
  return `${count} ${noun}`;
}

async function loadAnnouncements() {
  try {
    const response = await fetch('./data/announcements.json');
    if (!response.ok) {
      throw new Error(`Nie udało się wczytać komunikatów z wdrożenia (${response.status}).`);
    }
    const result = await response.json();
    if (!Array.isArray(result.items) || !result.fetchedAt) {
      throw new Error('Otrzymano nieprawidłowe dane komunikatów.');
    }

    const cards = result.items.map(renderAnnouncement);
    elements.announcementList.replaceChildren(...cards);
    const updateTime = new Intl.DateTimeFormat('pl-PL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(result.fetchedAt));
    elements.announcementStatus.textContent =
      `Dane z builda: ${updateTime} · ${announcementCount(result.items.length)}`;
  } catch (error) {
    console.error('Błąd wczytywania komunikatów:', error);
    elements.announcementStatus.textContent = 'Nie udało się wczytać komunikatów z wdrożenia.';
    renderAnnouncementMessage(
      error instanceof TypeError
        ? 'Nie można połączyć się z plikiem komunikatów. Sprawdź adres wdrożenia.'
        : error instanceof Error
          ? error.message
          : 'Sprawdź wdrożenie witryny statycznej.',
      true,
    );
  }
}

function splitCourses(description) {
  return description
    .split(/(?<=\))\/(?=["'“”]?[A-ZĄĆĘŁŃÓŚŹŻ])/u)
    .map((part) => part.trim().replace(/^['"“”]|['"“”]$/g, '').trim())
    .filter(Boolean);
}

function meetingNumbers(description) {
  const match = description.match(/zjazd(?:y)?\s*([0-9]+(?:\s*[-–]\s*[0-9]+)?(?:\s*,\s*[0-9]+(?:\s*[-–]\s*[0-9]+)?)*)/i);
  if (!match) return null;

  const numbers = new Set();
  for (const part of match[1].split(',')) {
    const range = part.match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let number = Math.min(start, end); number <= Math.max(start, end); number += 1) {
        numbers.add(number);
      }
    } else {
      const number = Number(part.trim());
      if (Number.isInteger(number)) numbers.add(number);
    }
  }
  return numbers;
}

function parseCourse(description, room, sessionNumber) {
  const titleAndType = description.match(/\s+(wykł|wyk|lab|ćw)\.?\b/i);
  const rawType = titleAndType?.[1].toLocaleLowerCase('pl-PL');
  const type = rawType?.startsWith('wyk') ? 'wykład' : rawType ?? '';
  const titleEnd = titleAndType?.index ?? description.indexOf(' - ');
  const title = (titleEnd < 0 ? description : description.slice(0, titleEnd)).trim().replace(/[.,;:]+$/, '');
  const teacherMatch = description.match(/\s+(?:wykł|wyk|lab|ćw)\.?\s*-\s*(.+)$/i)
    ?? description.match(/\s+-\s+(.+)$/);
  const teacher = teacherMatch?.[1]
    ?.replace(/\s*\(zjazd(?:y)?[^)]*\)/i, '')
    .replace(/\/+$/, '')
    .replace(/^\s*[-–]\s*/, '')
    .trim() ?? '';
  const meetings = meetingNumbers(description);

  if (meetings && !meetings.has(sessionNumber)) return null;
  return { title: title || description, type, teacher, room };
}

function matchingCourses(description, room, sessionNumber) {
  return splitCourses(description)
    .map((part) => parseCourse(part, room, sessionNumber))
    .filter(Boolean);
}

function normalizedTitle(title) {
  return title.toLocaleLowerCase('pl-PL').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function getCourseEvents(entry, sessionNumber) {
  const events = new Map();
  for (const group of state.schedule.groups) {
    const groupEntry = entry.groups[group];
    if (!groupEntry) continue;

    for (const course of matchingCourses(groupEntry.description, groupEntry.room, sessionNumber)) {
      const key = `${normalizedTitle(course.title)}|${course.type}`;
      if (!events.has(key)) {
        events.set(key, { ...course, groups: [] });
      }
      const event = events.get(key);
      if (!event.groups.some((item) => item.name === group)) {
        event.groups.push({ name: group, room: course.room });
      }
    }
  }
  return [...events.values()].filter((event) =>
    event.groups.some((group) => group.name === primaryGroup),
  );
}

function renderSessions() {
  elements.sessionList.replaceChildren();
  for (const session of sessions) {
    const button = document.createElement('button');
    const dateText = formatRange(session.dates[0], session.dates[2]);
    button.type = 'button';
    button.className = `session-card${session.number === state.selectedSession ? ' is-selected' : ''}`;
    button.setAttribute('aria-pressed', String(session.number === state.selectedSession));
    button.setAttribute('aria-label', `Zjazd ${session.number}, ${dateText}`);
    button.innerHTML = `
      <span class="session-number">${String(session.number).padStart(2, '0')}</span>
      <span class="session-date">${dateText}</span>
      <span class="session-status">${session.number === state.selectedSession ? 'WYBRANY' : 'ZJAZD'}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedSession = session.number;
      render();
    });
    elements.sessionList.append(button);
  }
}

function matchesSearch(event, query) {
  if (!query) return true;
  const haystack = [
    event.title,
    event.teacher,
    event.type,
    ...event.groups.flatMap((group) => [`Z${group.name}`, group.room]),
  ].join(' ').toLocaleLowerCase('pl-PL');
  return haystack.includes(query);
}

function renderCourseCard(course) {
  const card = document.createElement('article');
  card.className = 'class-card';
  const heading = document.createElement('div');
  heading.className = 'class-card-heading';
  const title = document.createElement('h4');
  title.textContent = course.title;
  heading.append(title);
  card.append(heading);

  const details = document.createElement('p');
  details.className = 'class-details';
  const detailParts = [course.type, course.teacher].filter(Boolean);
  details.textContent = detailParts.join(' · ') || 'Zajęcia';
  card.append(details);

  const groupInfo = document.createElement('p');
  groupInfo.className = 'group-info';
  groupInfo.textContent = `Grupa ${course.groups.map((group) => `Z${group.name}`).join(' · ')}`;
  card.append(groupInfo);

  const tags = document.createElement('div');
  tags.className = 'class-tags';
  const rooms = [...new Set(course.groups.map((group) => group.room).filter(Boolean))];
  if (rooms.length) {
    const room = document.createElement('span');
    room.className = 'room-tag';
    room.innerHTML = '<span aria-hidden="true">⌖</span> ';
    room.append(document.createTextNode(rooms.join(' / ')));
    tags.append(room);
  }
  card.append(tags);
  return card;
}

function renderDay(day, dayIndex, session) {
  const column = document.createElement('section');
  column.className = 'day-column';
  const header = document.createElement('div');
  header.className = 'day-heading';
  const name = document.createElement('div');
  name.className = 'day-name';
  const short = document.createElement('span');
  short.className = 'day-short';
  short.textContent = day.short;
  const title = document.createElement('h3');
  title.textContent = day.name;
  name.append(short, title);
  const date = document.createElement('span');
  date.className = 'day-date';
  date.textContent = formatDate(session.dates[dayIndex]);
  header.append(name, date);
  column.append(header);

  const dayEntries = state.schedule.entries
    .filter((entry) => entry.day === day.name)
    .sort((a, b) => a.period - b.period);
  let visibleCount = 0;
  for (const entry of dayEntries) {
    const courses = getCourseEvents(entry, session.number).filter((course) => matchesSearch(course, state.search));
    if (!courses.length) continue;
    visibleCount += courses.length;
    const slot = document.createElement('div');
    slot.className = 'time-slot';
    const time = document.createElement('div');
    time.className = 'time-label';
    time.textContent = entry.time.replace(/\./g, ':');
    const cards = document.createElement('div');
    cards.className = 'slot-cards';
    courses.forEach((course) => cards.append(renderCourseCard(course)));
    slot.append(time, cards);
    column.append(slot);
  }

  if (!visibleCount) {
    const empty = document.createElement('div');
    empty.className = 'empty-day';
    empty.innerHTML = '<span aria-hidden="true">✳</span>';
    const message = document.createElement('strong');
    const sourceHasNoEntry = session.number === 8;
    message.textContent = state.search
      ? 'Brak wyników'
      : sourceHasNoEntry
        ? 'Brak danych w arkuszu'
        : 'Dzień bez zajęć';
    const hint = document.createElement('p');
    hint.textContent = state.search
      ? 'Zmień frazę wyszukiwania lub sprawdź inny termin.'
      : sourceHasNoEntry
        ? 'Arkusz obejmuje zjazdy 1–7. Sprawdź komunikaty uczelni dla tego terminu.'
        : 'Możesz wykorzystać ten czas na odpoczynek.';
    empty.append(message, hint);
    column.append(empty);
  }
  return { column, count: visibleCount };
}

function renderSchedule() {
  const session = sessions.find((item) => item.number === state.selectedSession);
  elements.dayGrid.replaceChildren();
  let totalCourses = 0;
  for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
    const { column, count } = renderDay(days[dayIndex], dayIndex, session);
    totalCourses += count;
    elements.dayGrid.append(column);
  }
  setText('#overview-session', `Zjazd ${session.number} / 8`);
  setText('#class-count', String(totalCourses));
  setText('#schedule-date-range', `Plan na ${formatRange(session.dates[0], session.dates[2])}`);
  setText('#schedule-heading', `Plan Z301 · zjazd ${session.number}`);
  renderSessions();
}

function renderHero() {
  const nextSession = sessions.find((session) => session.number === state.selectedSession);
  setText('#next-session-date', formatRange(nextSession.dates[0], nextSession.dates[2]));
  setText('#next-session-name', `Zjazd ${nextSession.number} · Semestr I`);
}

function render() {
  renderHero();
  renderSchedule();
}

async function start() {
  try {
    const response = await fetch('./data/schedule.json');
    if (!response.ok) throw new Error(`Nie udało się pobrać danych planu (${response.status}).`);
    const schedule = await response.json();
    if (!Array.isArray(schedule.groups) || !Array.isArray(schedule.entries) || schedule.groups.length === 0) {
      throw new Error('Plik planu ma nieprawidłową strukturę.');
    }
    state.schedule = schedule;
    state.selectedSession = initialSession();
    elements.searchInput.addEventListener('input', () => {
      state.search = elements.searchInput.value.trim().toLocaleLowerCase('pl-PL');
      renderSchedule();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        event.preventDefault();
        elements.searchInput.focus();
      }
    });
    render();
    void loadAnnouncements();
  } catch (error) {
    console.error('Błąd wczytywania planu:', error);
    elements.errorBanner.hidden = false;
  }
}

start();
