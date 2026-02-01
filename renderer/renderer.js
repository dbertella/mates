const API_BASE =
  "https://nestjs-production-fargate.padelmates.io/webportal/getClubActivityRecordsWithoutAuth";
const CLUB_URL_BASE = "https://padelmates.se/club";

/** Clubs: name + club ID for API and website link. */
const CLUBS = [
  { id: "ilford", name: "Ilford", clubId: "788fa2c66535421aabc60fd27f941c42" },
  {
    id: "raketeer",
    name: "Raketeer center",
    clubId: "5111764d9bb14be3adbdb8e133e8bd80",
  },
  {
    id: "beckton",
    name: "Beckton",
    clubId: "f953765495194a299e49f49674d69a41",
  },
];

const MY_EMAIL = "daniele.bertella"; // highlight when this appears in participants
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Activity types: name (substring match) + day of week (0 = Sunday, 3 = Wednesday). */
const ACTIVITY_TYPES = [
  { id: "sunday-americano", name: "Sunday Americano", dayOfWeek: 0 },
  { id: "lunchtime-masterclass", name: "Lunchtime Masterclass", dayOfWeek: 3 },
];

const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const activitiesEl = document.getElementById("activities");
const searchFilterEl = document.getElementById("search-filter");
const clubSelectEl = document.getElementById("club-select");
const websiteLinkEl = document.getElementById("website-link");
const filterTabsEl = document.getElementById("filter-tabs");
const filterBothEl = document.getElementById("filter-both");
const filterAllEventsEl = document.getElementById("filter-all-events");
const filterSundayEl = document.getElementById("filter-sunday");
const filterLunchtimeEl = document.getElementById("filter-lunchtime");
const authTokenInputEl = document.getElementById("auth-token-input");
const authTokenSaveEl = document.getElementById("auth-token-save");
const authTokenClearEl = document.getElementById("auth-token-clear");
const authTokenStatusEl = document.getElementById("auth-token-status");

/** Selected club ID (from CLUBS[].id). */
let selectedClubId = "ilford";
/** Current filter: 'both' | 'all-events' | 'sunday-americano' | 'lunchtime-masterclass' */
let selectedFilter = "both";
/** Free-text search (filters list by title). */
let searchText = "";
/** Full list from API (all events); re-filtered by selectedFilter and searchText when rendering. */
let allEvents = [];

function getSelectedClub() {
  return CLUBS.find((c) => c.id === selectedClubId) ?? CLUBS[0];
}

function getApiUrl() {
  return `${API_BASE}/${getSelectedClub().clubId}`;
}

function getClubPageUrl() {
  return `${CLUB_URL_BASE}/${getSelectedClub().clubId}`;
}

function updateWebsiteLink() {
  if (websiteLinkEl) websiteLinkEl.href = getClubPageUrl();
}

function isIlford() {
  return selectedClubId === "ilford";
}

function updateTabsVisibility() {
  const show = isIlford();
  if (filterTabsEl) {
    filterTabsEl.classList.toggle("filter-tabs--hidden", !show);
    filterTabsEl.hidden = !show;
  }
  if (!show) selectedFilter = "all-events";
}

/** Set of activity keys we've already seen (so we only notify for new ones). */
let knownActivityKeys = new Set();
let hasLoadedOnce = false;

function showLoading() {
  loadingEl.hidden = false;
  errorEl.hidden = true;
  activitiesEl.hidden = true;
  searchFilterEl.hidden = true;
}

function showError(message) {
  loadingEl.hidden = true;
  errorEl.hidden = false;
  activitiesEl.hidden = true;
  searchFilterEl.hidden = true;
  errorEl.textContent = message;
}

/** Get display date from item (API uses start_datetime as Unix ms). */
function getDisplayDate(item) {
  const ms =
    item.start_datetime ?? item.startDate ?? item.date ?? item.dateTime;
  if (ms == null) return null;
  const d = new Date(typeof ms === "number" ? ms : Number(ms));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Get time range from start_datetime / stop_datetime (Unix ms). */
function getDisplayTime(item) {
  const start = item.start_datetime ?? item.startTime;
  const stop = item.stop_datetime ?? item.endTime;
  if (start == null)
    return item.time ?? item.startTime ?? item.timeSlot ?? null;
  const startDate = new Date(typeof start === "number" ? start : Number(start));
  if (Number.isNaN(startDate.getTime())) return String(start);
  const startStr = startDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (stop == null) return startStr;
  const stopDate = new Date(typeof stop === "number" ? stop : Number(stop));
  if (Number.isNaN(stopDate.getTime())) return startStr;
  const stopStr = stopDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startStr} – ${stopStr}`;
}

/** Get participants: API has players[], current_no_of_players, no_of_players. Marks entries where email contains MY_EMAIL. */
function getParticipantsDisplay(item) {
  const players = item.players ?? item.participants ?? item.attendees;
  const current =
    item.current_no_of_players ??
    (Array.isArray(players) ? players.length : null);
  const max = item.no_of_players ?? item.max_players;
  const countText =
    current != null && max != null
      ? `${current} / ${max} players`
      : current != null
        ? `${current} player${current !== 1 ? "s" : ""}`
        : null;
  if (!Array.isArray(players) || players.length === 0)
    return { countText, entries: [] };
  const entries = players
    .map((p) => {
      if (typeof p === "string") return { display: p, isMe: false };
      const n = p?.name ?? p?.displayName;
      const display =
        n && String(n).trim()
          ? String(n).trim()
          : p?.email
            ? p.email.replace(/^(.{2}).*@/, "$1…@")
            : null;
      const email = (p?.email ?? "").toLowerCase();
      const isMe = email.includes(MY_EMAIL.toLowerCase());
      return { display: display || null, isMe };
    })
    .filter((e) => e.display);
  return { countText, entries };
}

function showActivities(items) {
  loadingEl.hidden = true;
  errorEl.hidden = true;
  activitiesEl.hidden = false;
  searchFilterEl.hidden = false;
  activitiesEl.innerHTML = "";

  const emptyMessages = {
    both: "No Sunday Americano or Lunchtime Masterclass found.",
    "all-events": "No events found.",
    "sunday-americano": "No Sunday Americano found.",
    "lunchtime-masterclass": "No Lunchtime Masterclass found.",
  };
  if (!items.length) {
    activitiesEl.innerHTML = `<p class="empty">${emptyMessages[selectedFilter] ?? "No events found."}</p>`;
    return;
  }

  for (const item of items) {
    const participantsDisplay = getParticipantsDisplay(item);
    const hasMe =
      participantsDisplay.entries &&
      participantsDisplay.entries.some((e) => e.isMe);

    const card = document.createElement("div");
    card.className = "activity-card" + (hasMe ? " activity-card--you" : "");
    const name =
      item.title ?? item.name ?? item.activityName ?? item.label ?? "Unnamed";
    const displayDate = getDisplayDate(item);
    const timeStr = getDisplayTime(item);

    const inlineParts = [displayDate, timeStr]
      .filter(Boolean)
      .map((s) => escapeHtml(String(s)));
    const inlineMeta = inlineParts.length ? inlineParts.join(" · ") : null;

    const spaceIcon = hasSpace(item) ? "✅" : "❌";
    const spaceTitle = hasSpace(item) ? "Has space" : "Full";
    card.innerHTML = `<p class="activity-name"><span class="activity-space-icon" title="${escapeHtml(spaceTitle)}" aria-label="${escapeHtml(spaceTitle)}">${spaceIcon}</span> ${escapeHtml(name)}</p>`;
    if (inlineMeta)
      card.innerHTML += `<p class="activity-meta activity-inline-meta">${inlineMeta}</p>`;
    if (participantsDisplay !== null) {
      if (participantsDisplay.countText)
        card.innerHTML += `<p class="activity-meta activity-participants">${escapeHtml(participantsDisplay.countText)}</p>`;
      if (participantsDisplay.entries && participantsDisplay.entries.length) {
        const listHtml = participantsDisplay.entries
          .map((e) =>
            e.isMe
              ? `<span class="participant-me">${escapeHtml(e.display)}</span>`
              : escapeHtml(e.display),
          )
          .join(", ");
        card.innerHTML += `<p class="activity-meta activity-participants-list">${listHtml}</p>`;
      }
    }
    if (item.description)
      card.innerHTML += `<p class="activity-meta">${escapeHtml(String(item.description))}</p>`;
    activitiesEl.appendChild(card);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Returns activity type id if record matches one of ACTIVITY_TYPES, else null. */
function getActivityTypeId(record) {
  const name =
    (record &&
      (record.title ?? record.name ?? record.activityName ?? record.label)) ||
    "";
  const ms = record?.start_datetime ?? record?.startDate ?? record?.date;
  if (ms == null) return null;
  const d = new Date(typeof ms === "number" ? ms : Number(ms));
  const day = d.getDay();
  const lower = String(name).trim().toLowerCase();
  for (const t of ACTIVITY_TYPES) {
    if (lower.includes(t.name.toLowerCase()) && day === t.dayOfWeek)
      return t.id;
  }
  return null;
}

function isAllowed(record) {
  return getActivityTypeId(record) != null;
}

function applyViewFilter(items) {
  if (!isIlford()) return items; // Raketeer & Beckton: only all events
  if (selectedFilter === "both") return items.filter(isAllowed);
  if (selectedFilter === "all-events") return items;
  return items.filter((item) => getActivityTypeId(item) === selectedFilter);
}

/** Activity name/title only (for free-text filter). */
function getSearchableString(item) {
  const name = item.title ?? item.name ?? item.activityName ?? item.label ?? "";
  return String(name).trim().toLowerCase();
}

function applySearchFilter(items) {
  const q = searchText.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => getSearchableString(item).includes(q));
}

/** Event still has space when current < max players. */
function hasSpace(item) {
  const current = item.current_no_of_players ?? (Array.isArray(item.players) ? item.players.length : null);
  const max = item.no_of_players ?? item.max_players;
  if (max == null) return true;
  if (current == null) return true;
  return Number(current) < Number(max);
}

function sortBySpaceThenDate(items) {
  return [...items].sort((a, b) => {
    const aSpace = hasSpace(a);
    const bSpace = hasSpace(b);
    if (aSpace !== bSpace) return aSpace ? -1 : 1; // has space first
    const aMs = a.start_datetime ?? 0;
    const bMs = b.start_datetime ?? 0;
    return aMs - bMs; // then by start time
  });
}

function refreshList() {
  const filtered = applySearchFilter(applyViewFilter(allEvents));
  showActivities(sortBySpaceThenDate(filtered));
}

/** Build a stable key for an activity (for deduplication and "new" detection). */
function getActivityKey(item) {
  if (item && (item._id != null || item.id != null))
    return String(item._id ?? item.id);
  const name = item.title ?? item.name ?? item.activityName ?? item.label ?? "";
  const date = item.start_datetime ?? item.date ?? "";
  const time = item.time ?? "";
  return `${name}|${date}|${time}`;
}

async function notifyNewActivities(filtered) {
  if (!window.electronAPI?.showNotification) return;
  for (const item of filtered) {
    const key = getActivityKey(item);
    if (knownActivityKeys.has(key)) continue;
    knownActivityKeys.add(key);
    // Only show desktop notification after the first load (so we don't notify for existing activities).
    if (hasLoadedOnce) {
      const name =
        item.name ??
        item.activityName ??
        item.title ??
        item.label ??
        "New activity";
      const sub =
        item.date || item.time
          ? [item.date, item.time].filter(Boolean).join(" · ")
          : "";
      const body = sub ? `${name} — ${sub}` : name;
      await window.electronAPI.showNotification("New activity added", body);
      if (window.electronAPI?.sendEmail) {
        const res = await window.electronAPI.sendEmail("New activity added", body);
        if (!res?.ok && res?.error) console.warn("Email send failed:", res.error);
      }
    }
  }
}

const AUTH_TOKEN_KEY = "padelmates_auth_token";

/** Headers to match browser/cURL so the API returns the same data (e.g. levels). Auth token optional. */
function getApiHeaders() {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.6",
    Origin: "https://padelmates.se",
    Referer: "https://padelmates.se/",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  };
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token && token.trim())
    headers.Authorization = `PadelMates ${token.trim()}`;
  return headers;
}

/** Fetch all events from API (no activity-type filter). */
async function fetchAllEvents() {
  const res = await fetch(getApiUrl(), { headers: getApiHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data)
    ? data
    : (data?.data ?? data?.records ?? data?.activities ?? []);
}

function setFilter(filter) {
  selectedFilter = filter;
  filterBothEl?.classList.toggle("filter-btn--active", filter === "both");
  filterAllEventsEl?.classList.toggle(
    "filter-btn--active",
    filter === "all-events",
  );
  filterSundayEl?.classList.toggle(
    "filter-btn--active",
    filter === "sunday-americano",
  );
  filterLunchtimeEl?.classList.toggle(
    "filter-btn--active",
    filter === "lunchtime-masterclass",
  );
  filterBothEl?.setAttribute("aria-selected", filter === "both");
  filterAllEventsEl?.setAttribute("aria-selected", filter === "all-events");
  filterSundayEl?.setAttribute("aria-selected", filter === "sunday-americano");
  filterLunchtimeEl?.setAttribute(
    "aria-selected",
    filter === "lunchtime-masterclass",
  );
  refreshList();
}

async function load() {
  if (!hasLoadedOnce) showLoading();
  try {
    const list = await fetchAllEvents();
    allEvents = list;
    if (isIlford()) {
      const filtered = list.filter(isAllowed);
      await notifyNewActivities(filtered);
    }
    refreshList();
    hasLoadedOnce = true;
  } catch (err) {
    showError(err.message || "Failed to load activities.");
  }
}

load();
setInterval(load, POLL_INTERVAL_MS);

websiteLinkEl?.addEventListener("click", (e) => {
  e.preventDefault();
  const url = e.currentTarget?.href;
  if (url && window.electronAPI?.openExternal)
    window.electronAPI.openExternal(url);
});

clubSelectEl?.addEventListener("change", () => {
  selectedClubId = clubSelectEl.value;
  updateWebsiteLink();
  updateTabsVisibility();
  knownActivityKeys.clear();
  hasLoadedOnce = false;
  load();
});

filterBothEl?.addEventListener("click", () => setFilter("both"));
filterAllEventsEl?.addEventListener("click", () => setFilter("all-events"));
filterSundayEl?.addEventListener("click", () => setFilter("sunday-americano"));
filterLunchtimeEl?.addEventListener("click", () =>
  setFilter("lunchtime-masterclass"),
);

searchFilterEl?.addEventListener("input", () => {
  searchText = searchFilterEl.value;
  refreshList();
});

function setAuthTokenStatus(text) {
  if (authTokenStatusEl) authTokenStatusEl.textContent = text;
}

authTokenSaveEl?.addEventListener("click", () => {
  const value = authTokenInputEl?.value?.trim() ?? "";
  if (value) {
    localStorage.setItem(AUTH_TOKEN_KEY, value);
    if (authTokenInputEl) authTokenInputEl.value = "";
    setAuthTokenStatus("Saved. Reloading…");
    knownActivityKeys.clear();
    hasLoadedOnce = false;
    load();
    setAuthTokenStatus("Using your token. Levels should match the website.");
  } else {
    setAuthTokenStatus("Enter a token first.");
  }
});

authTokenClearEl?.addEventListener("click", () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  if (authTokenInputEl) authTokenInputEl.value = "";
  setAuthTokenStatus("Cleared. Reloading…");
  knownActivityKeys.clear();
  hasLoadedOnce = false;
  load();
  setAuthTokenStatus("");
});

if (authTokenStatusEl && localStorage.getItem(AUTH_TOKEN_KEY)) {
  setAuthTokenStatus("Using your token.");
}

// Sync club from dropdown and show/hide tabs
selectedClubId = clubSelectEl?.value || "ilford";
updateTabsVisibility();
setFilter(isIlford() ? "both" : "all-events");
updateWebsiteLink();
