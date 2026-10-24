const tg = window.Telegram ? window.Telegram.WebApp : null;

if (tg) {
  tg.ready();
  tg.expand();
  try {
    // Stop a downward card drag from closing the Mini App on mobile.
    if (tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes();
  } catch (e) {}
}

const STORE_KEY = "campusmatch:v1";
const SCHOOLS = ["Engineering", "Sciences & Humanities", "Medicine", "Mining & Geosciences",
  "Business", "Education", "Public Policy", "Foundation"];
const YEARS = ["Foundation", "1st year", "2nd year", "3rd year", "4th year", "Master's", "PhD"];
const INTERESTS = ["Coffee", "Hiking", "Gaming", "Music", "Movies", "Anime", "Books", "Sport",
  "Gym", "Coding", "Art", "Photography", "Travel", "Cooking", "Dancing", "Chess", "Startups",
  "Volunteering", "Debate", "K-pop"];
const MAX_INTERESTS = 5;
const MIN_AGE = 18;
const MAX_AGE = 35;
const PHOTO_MAX_SIDE = 720; // px; keeps a photo around 100 KB so it fits in browser storage
const GRADIENTS = [
  ["#ff9a9e", "#fecfef"], ["#f6d365", "#fda085"], ["#84fab0", "#8fd3f4"], ["#a18cd1", "#fbc2eb"],
  ["#fccb90", "#d57eeb"], ["#e0c3fc", "#8ec5fc"], ["#43e97b", "#38f9d7"], ["#fa709a", "#fee140"],
  ["#a1c4fd", "#c2e9fb"], ["#fbc2eb", "#a6c1ee"], ["#d4fc79", "#96e6a1"], ["#ff758c", "#ff7eb3"],
];
// [main colour, soft tint on light theme, soft tint on dark theme]
const ACCENTS = {
  rose: ["#f06b8b", "#fde8ee", "#41242f"],
  coral: ["#ff7f61", "#ffece6", "#432a21"],
  lavender: ["#9b7ede", "#efe9fb", "#2f2742"],
  mint: ["#2fb38c", "#e2f6ef", "#1b352e"],
  sky: ["#4a9de0", "#e5f1fb", "#1d2f41"],
  peach: ["#f29a3f", "#fdf0e2", "#3e2d1b"],
};
// Page and bar colours per theme; must match --bg and --surface in style.css.
const THEME_COLORS = {
  light: { bg: "#fff8fa", surface: "#ffffff" },
  dark: { bg: "#151218", surface: "#211c25" },
};
const DEFAULT_SETTINGS = {
  theme: "light",
  accent: "rose",
  textSize: "normal",
  ageMin: MIN_AGE,
  ageMax: MAX_AGE,
  sameSchool: false,
  shareTelegram: true,
  haptics: true,
};
const USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const tgUser = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;

// ---------- State (saved in this device's browser storage) ----------

function freshState() {
  return { profile: null, swipes: {}, matches: [], settings: { ...DEFAULT_SETTINGS } };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
      return s;
    }
  } catch (e) {}
  return freshState();
}

let state = loadState();

// Returns false if the browser refused to store the data (usually a full storage quota).
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

function haptic(kind) {
  try {
    if (!state.settings.haptics || !tg || !tg.HapticFeedback) return;
    if (kind === "match") tg.HapticFeedback.notificationOccurred("success");
    else if (kind === "select") tg.HapticFeedback.selectionChanged();
    else tg.HapticFeedback.impactOccurred(kind);
  } catch (e) {}
}

function gradientBg(p) {
  const [a, b] = GRADIENTS[(p.gradient || 0) % GRADIENTS.length];
  return `background: linear-gradient(135deg, ${a}, ${b})`;
}

function initial(p) {
  return (p.name || "?").trim().charAt(0).toUpperCase();
}

// Round picture: the person's photo, or their initial on a soft colour.
function avatarHTML(p, cls = "") {
  return p.photo
    ? `<span class="avatar ${cls}"><img src="${esc(p.photo)}" alt=""></span>`
    : `<span class="avatar ${cls}" style="${gradientBg(p)}">${esc(initial(p))}</span>`;
}

function me() {
  return { ...state.profile, gradient: 0 };
}

// ---------- Theme & appearance ----------

const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function resolvedTheme() {
  const choice = state.settings.theme;
  if (choice === "light" || choice === "dark") return choice;
  if (tg && tg.colorScheme) return tg.colorScheme;
  return systemDark && systemDark.matches ? "dark" : "light";
}

function applyAppearance() {
  const theme = resolvedTheme();
  const root = document.documentElement;
  root.dataset.theme = theme;
  const [main, softLight, softDark] = ACCENTS[state.settings.accent] || ACCENTS.rose;
  root.style.setProperty("--accent", main);
  root.style.setProperty("--accent-soft", theme === "dark" ? softDark : softLight);
  document.body.classList.toggle("large-text", state.settings.textSize === "large");

  // Sign-up theme button: sun on light, moon on dark.
  $("#theme-toggle use").setAttribute("href", theme === "dark" ? "#i-moon" : "#i-sun");
  $("#theme-toggle").setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);

  // Match Telegram's own header and background to the app.
  if (!tg) return;
  const colors = THEME_COLORS[theme];
  try {
    if (tg.isVersionAtLeast("6.1")) {
      tg.setHeaderColor(colors.bg);
      tg.setBackgroundColor(colors.bg);
    }
    if (tg.isVersionAtLeast("7.10")) tg.setBottomBarColor(colors.surface);
  } catch (e) {}
}

$("#theme-toggle").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  state.settings.theme = resolvedTheme() === "dark" ? "light" : "dark";
  save();
  applyAppearance();
  btn.classList.remove("spin");
  void btn.offsetWidth; // restart the spin animation
  btn.classList.add("spin");
  haptic("light");
});

// "Auto" follows Telegram's theme (or the device's, outside Telegram).
if (tg) tg.onEvent("themeChanged", () => { if (state.settings.theme === "system") applyAppearance(); });
if (systemDark && systemDark.addEventListener) {
  systemDark.addEventListener("change", () => { if (state.settings.theme === "system") applyAppearance(); });
}

// ---------- Cards ----------

function makeCard(p) {
  const card = document.createElement("article");
  card.className = "card";
  const picture = p.photo
    ? `<img class="card-img" src="${esc(p.photo)}" alt="" draggable="false">`
    : `<span class="card-initial">${esc(initial(p))}</span>`;
  card.innerHTML = `
    <div class="card-photo" style="${gradientBg(p)}">
      ${picture}
      <span class="stamp like">LIKE</span>
      <span class="stamp nope">NOPE</span>
    </div>
    <div class="card-body">
      <h3>${esc(p.name)}, ${p.age}</h3>
      <p class="meta">${esc(p.school)} · ${esc(p.year)}</p>
      ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}
      <div class="chips">${(p.interests || []).map((i) => `<span class="chip">${esc(i)}</span>`).join("")}</div>
    </div>`;
  return card;
}

function candidates() {
  const { showMe, school } = state.profile;
  const { ageMin, ageMax, sameSchool } = state.settings;
  return PROFILES.filter((p) =>
    !(p.id in state.swipes) &&
    !state.matches.includes(p.id) &&
    (showMe === "everyone" || (showMe === "women" ? p.gender === "woman" : p.gender === "man")) &&
    p.age >= ageMin && p.age <= ageMax &&
    (!sameSchool || p.school === school));
}

function renderDeck() {
  const deck = $("#deck");
  const list = candidates();
  deck.innerHTML = "";
  $("#deck-actions").hidden = list.length === 0;

  if (!list.length) {
    const filtered = state.settings.sameSchool ||
      state.settings.ageMin > MIN_AGE || state.settings.ageMax < MAX_AGE;
    deck.innerHTML = `
      <div class="empty">
        <h3>You've seen everyone</h3>
        <p class="hint">${filtered
          ? "Try widening your age range or school filter in Settings."
          : "That's all the sample profiles for now."}</p>
        <button class="primary" id="reset-swipes">Start over</button>
      </div>`;
    $("#reset-swipes").onclick = () => { state.swipes = {}; save(); renderDeck(); };
    return;
  }

  // Draw up to 3 cards, with the first candidate on top.
  list.slice(0, 3).reverse().forEach((p, i, arr) => {
    const card = makeCard(p);
    if (i === arr.length - 1) {
      card.classList.add("top");
      attachDrag(card, p);
    }
    deck.appendChild(card);
  });
}

function attachDrag(card, p) {
  const like = card.querySelector(".stamp.like");
  const nope = card.querySelector(".stamp.nope");
  let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;

  card.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    card.setPointerCapture(e.pointerId);
    card.style.transition = "none";
  });

  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 15}deg)`;
    like.style.opacity = Math.min(1, Math.max(0, dx / 100));
    nope.style.opacity = Math.min(1, Math.max(0, -dx / 100));
  });

  const end = () => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = "";
    if (Math.abs(dx) > 100) {
      swipe(p, dx > 0 ? "like" : "pass", card);
    } else {
      card.style.transform = "";
      like.style.opacity = nope.style.opacity = 0;
    }
    dx = dy = 0;
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

let busy = false;

function swipe(p, dir, card) {
  if (busy || !p) return;
  busy = true;
  card = card || $("#deck .card.top");
  const x = dir === "like" ? 1 : -1;
  card.querySelector(`.stamp.${dir === "like" ? "like" : "nope"}`).style.opacity = 1;
  card.style.transition = "transform .35s ease-out, opacity .35s";
  card.style.transform = `translate(${x * (window.innerWidth + 200)}px, -40px) rotate(${x * 30}deg)`;
  card.style.opacity = "0";

  state.swipes[p.id] = dir;
  const matched = dir === "like" && p.likesYou;
  if (matched) state.matches.unshift(p.id);
  save();
  haptic(dir === "like" ? "medium" : "light");

  setTimeout(() => {
    busy = false;
    renderDeck();
    renderMatches();
    if (matched) showMatch(p);
  }, 300);
}

// ---------- Matches ----------

let lastMatch = null;

function showMatch(p) {
  lastMatch = p;
  $("#match-avatars").innerHTML = avatarHTML(me(), "big") + avatarHTML(p, "big");
  $("#match-text").textContent = `You and ${p.name} liked each other.`;
  $("#match-modal").hidden = false;
  haptic("match");
}

function renderMatches() {
  const matches = state.matches.map((id) => PROFILES.find((p) => p.id === id)).filter(Boolean);
  const badge = $("#match-badge");
  badge.hidden = matches.length === 0;
  badge.textContent = matches.length;

  const list = $("#match-list");
  if (!matches.length) {
    list.innerHTML = `<li class="hint empty-small">No matches yet. Keep swiping!</li>`;
    return;
  }
  list.innerHTML = matches.map((p) => `
    <li>
      <button class="match-row" data-id="${p.id}">
        ${avatarHTML(p)}
        <span class="match-info">
          <strong>${esc(p.name)}, ${p.age}</strong>
          <small>${p.username ? `@${esc(p.username)}` : `${esc(p.school)} · ${esc(p.year)}`}</small>
        </span>
        <span class="say-hi"><svg class="icon"><use href="#i-chat"/></svg></span>
      </button>
    </li>`).join("");
}

function openMatch(p) {
  const holder = $("#profile-modal-card");
  holder.innerHTML = "";
  holder.appendChild(makeCard(p));

  const btn = $("#btn-message");
  const hint = $("#message-hint");
  if (p.username) {
    btn.disabled = false;
    btn.textContent = `Message @${p.username}`;
    hint.textContent = "Opens a private chat with them in Telegram.";
  } else {
    btn.disabled = true;
    btn.textContent = "Message on Telegram";
    hint.textContent = "This is a sample profile, so there's no one to message. " +
      "With real students, this opens a Telegram chat with them.";
  }
  btn.onclick = () => p.username && openTelegramChat(p.username);
  $("#profile-modal").hidden = false;
}

function openTelegramChat(username) {
  const url = `https://t.me/${encodeURIComponent(username)}`;
  haptic("light");
  if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

$("#match-list").addEventListener("click", (e) => {
  const row = e.target.closest(".match-row");
  if (row) openMatch(PROFILES.find((x) => x.id === Number(row.dataset.id)));
});

// ---------- My profile ----------

function renderMyProfile() {
  const holder = $("#my-card");
  holder.innerHTML = "";
  holder.appendChild(makeCard(me()));

  const status = $("#contact-status");
  const { username } = state.profile;
  if (!state.settings.shareTelegram) {
    status.textContent = "Matches can't message you. You can turn this on in Settings.";
  } else if (username) {
    status.textContent = `Matches can message you at @${username}`;
  } else {
    status.textContent = "Add your Telegram username in Settings so matches can message you.";
  }
}

$("#btn-edit").addEventListener("click", showOnboarding);

// ---------- Settings ----------

function renderSettings() {
  const s = state.settings;

  document.querySelectorAll("#theme-choice button").forEach((b) =>
    b.classList.toggle("on", b.dataset.themeChoice === s.theme));
  $("#accent-swatches").innerHTML = Object.entries(ACCENTS).map(([name, [main]]) =>
    `<button class="swatch${s.accent === name ? " on" : ""}" data-accent="${name}"
       style="background:${main}" aria-label="${name}"></button>`).join("");
  document.querySelectorAll("#text-size button").forEach((b) =>
    b.classList.toggle("on", b.dataset.size === s.textSize));

  $("#set-showme").value = state.profile.showMe;
  $("#set-agemin").value = s.ageMin;
  $("#set-agemax").value = s.ageMax;
  $("#set-sameschool").checked = s.sameSchool;
  $("#set-share").checked = s.shareTelegram;
  $("#set-haptics").checked = s.haptics;
  $("#set-username").value = state.profile.username || "";
  $("#set-username").disabled = !s.shareTelegram;
  renderUsernameHint();
}

function renderUsernameHint() {
  const value = $("#set-username").value.trim();
  const hint = $("#username-hint");
  hint.classList.remove("error");
  if (!state.settings.shareTelegram) {
    hint.textContent = "Matches won't see your username.";
  } else if (!value) {
    hint.textContent = "No username yet? Set one in Telegram: Settings → Username.";
  } else if (!USERNAME_RE.test(value)) {
    hint.textContent = "Usernames are 5–32 letters, numbers or underscores.";
    hint.classList.add("error");
  } else {
    hint.textContent = "Only people you match with will see this.";
  }
}

// Re-render everything that depends on settings after a change.
function settingsChanged() {
  save();
  applyAppearance();
  renderSettings();
  renderDeck();
  renderMyProfile();
  haptic("select");
}

function setupSettings() {
  const ages = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => `<option>${MIN_AGE + i}</option>`).join("");
  $("#set-agemin").innerHTML = ages;
  $("#set-agemax").innerHTML = ages;

  $("#theme-choice").addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme-choice]");
    if (b) { state.settings.theme = b.dataset.themeChoice; settingsChanged(); }
  });
  $("#accent-swatches").addEventListener("click", (e) => {
    const b = e.target.closest("[data-accent]");
    if (b) { state.settings.accent = b.dataset.accent; settingsChanged(); }
  });
  $("#text-size").addEventListener("click", (e) => {
    const b = e.target.closest("[data-size]");
    if (b) { state.settings.textSize = b.dataset.size; settingsChanged(); }
  });
  $("#set-showme").addEventListener("change", (e) => {
    state.profile.showMe = e.target.value;
    settingsChanged();
  });
  $("#set-agemin").addEventListener("change", (e) => {
    state.settings.ageMin = Number(e.target.value);
    if (state.settings.ageMax < state.settings.ageMin) state.settings.ageMax = state.settings.ageMin;
    settingsChanged();
  });
  $("#set-agemax").addEventListener("change", (e) => {
    state.settings.ageMax = Number(e.target.value);
    if (state.settings.ageMin > state.settings.ageMax) state.settings.ageMin = state.settings.ageMax;
    settingsChanged();
  });
  $("#set-sameschool").addEventListener("change", (e) => {
    state.settings.sameSchool = e.target.checked;
    settingsChanged();
  });
  $("#set-share").addEventListener("change", (e) => {
    state.settings.shareTelegram = e.target.checked;
    settingsChanged();
  });
  $("#set-haptics").addEventListener("change", (e) => {
    state.settings.haptics = e.target.checked;
    settingsChanged();
  });

  const username = $("#set-username");
  username.addEventListener("input", () => {
    username.value = username.value.replace(/^@+/, "").replace(/\s/g, "");
    renderUsernameHint();
  });
  username.addEventListener("change", () => {
    const value = username.value.trim();
    if (value && !USERNAME_RE.test(value)) return;
    state.profile.username = value;
    save();
    renderMyProfile();
  });
}

let resetArmed = null;
$("#btn-reset").addEventListener("click", (e) => {
  const btn = e.currentTarget;
  if (!resetArmed) {
    btn.textContent = "Tap again to erase everything";
    resetArmed = setTimeout(() => { btn.textContent = "Reset prototype data"; resetArmed = null; }, 3000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = null;
  btn.textContent = "Reset prototype data";
  state = freshState();
  save();
  applyAppearance();
  showOnboarding();
});

// ---------- Sign-up wizard ----------

const STEPS = ["name", "age", "gender", "showMe", "school", "year", "photo", "bio", "interests", "ack"];
const CHOICES = {
  gender: [["woman", "Woman"], ["man", "Man"], ["nonbinary", "Non-binary"]],
  showMe: [["women", "Women"], ["men", "Men"], ["everyone", "Everyone"]],
  school: SCHOOLS.map((s) => [s, s]),
  year: YEARS.map((y) => [y, y]),
};
const OPTIONAL_STEPS = { photo: "photo", bio: "bio", interests: "interests" };

let draft = null;    // profile being created or edited
let stepIndex = 0;
let editing = false; // true: every question on one page; false: one question per screen
let advanceTimer = null;

function newDraft() {
  const p = state.profile;
  if (p) return { ...p, interests: [...(p.interests || [])], adult: true, ack: true };
  return {
    name: (tgUser && tgUser.first_name) || "",
    age: 0, adult: false, gender: "", showMe: "", school: "", year: "",
    photo: null, bio: "", interests: [], ack: false,
    username: (tgUser && tgUser.username) || "",
  };
}

function stepError(step) {
  switch (step) {
    case "name": return draft.name.trim() ? "" : "Please enter your name.";
    case "age":
      if (!draft.age) return "Please choose your age.";
      return draft.adult ? "" : "Please confirm you're 18 or older.";
    case "gender": case "showMe": case "school": case "year":
      return draft[step] ? "" : "Please choose one option.";
    case "ack": return draft.ack ? "" : "Please confirm to continue.";
    default: return "";
  }
}

function stepIsEmpty(step) {
  if (step === "photo") return !draft.photo;
  if (step === "bio") return !draft.bio.trim();
  if (step === "interests") return draft.interests.length === 0;
  return false;
}

function updateNav() {
  const step = STEPS[stepIndex];
  const next = $("#wiz-next");
  if (editing) {
    next.textContent = "Save";
    next.disabled = false;
    return;
  }
  next.textContent = step === "ack" ? "Start matching"
    : (OPTIONAL_STEPS[step] && stepIsEmpty(step)) ? "Skip for now" : "Continue";
  next.disabled = !!stepError(step);
}

function renderWizard(direction) {
  const current = STEPS[stepIndex];
  document.querySelectorAll("#profile-form .step").forEach((s) => {
    const name = s.dataset.step;
    s.hidden = editing ? name === "ack" : name !== current;
    s.classList.remove("enter-forward", "enter-back");
  });
  $("#onboarding").classList.toggle("editing", editing);
  $("#form-cancel").hidden = !editing;
  $("#form-error").textContent = "";

  if (!editing) {
    $("#wiz-progress").style.width = `${((stepIndex + 1) / STEPS.length) * 100}%`;
    $("#wiz-count").textContent = `${stepIndex + 1}/${STEPS.length}`;
    $("#wiz-back").style.visibility = stepIndex > 0 ? "visible" : "hidden";
    const section = document.querySelector(`.step[data-step="${current}"]`);
    if (direction) {
      void section.offsetWidth; // restart the slide-in animation
      section.classList.add(direction === "back" ? "enter-back" : "enter-forward");
    }
    if (current === "name") setTimeout(() => $("#f-name").focus(), 50);
  }
  $("#wizard-body").scrollTop = 0;
  updateNav();
}

function renderOptions(field) {
  const box = document.querySelector(`.options[data-field="${field}"]`);
  box.innerHTML = CHOICES[field].map(([value, label]) => `
    <button type="button" class="option${draft[field] === value ? " on" : ""}" data-value="${esc(value)}">
      <span>${esc(label)}</span>
      <svg class="icon"><use href="#i-check"/></svg>
    </button>`).join("");
}

function renderInterestPicker() {
  $("#interest-picker").innerHTML = INTERESTS.map((i) =>
    `<button type="button" class="chip${draft.interests.includes(i) ? " on" : ""}" data-interest="${esc(i)}">${esc(i)}</button>`
  ).join("");
  $("#interest-count").textContent = `(${draft.interests.length}/${MAX_INTERESTS})`;
}

function renderBioCount() {
  $("#bio-count").textContent = `${draft.bio.length}/200`;
}

function fillWizard() {
  $("#f-name").value = draft.name;
  $("#f-age").value = draft.age || "";
  $("#f-adult").checked = draft.adult;
  $("#f-bio").value = draft.bio;
  $("#f-ack").checked = draft.ack;
  Object.keys(CHOICES).forEach(renderOptions);
  renderInterestPicker();
  renderPhotoPicker();
  renderBioCount();
}

function nextStep() {
  clearTimeout(advanceTimer);
  if (editing) return saveDraft();
  const err = stepError(STEPS[stepIndex]);
  if (err) {
    $("#form-error").textContent = err;
    haptic("rigid");
    return;
  }
  if (stepIndex === STEPS.length - 1) return saveDraft();
  stepIndex++;
  haptic("light");
  renderWizard("forward");
}

function prevStep() {
  clearTimeout(advanceTimer);
  if (editing || stepIndex === 0) return;
  stepIndex--;
  renderWizard("back");
}

function saveDraft() {
  if (editing) {
    const bad = STEPS.find((s) => s !== "ack" && stepError(s));
    if (bad) {
      $("#form-error").textContent = stepError(bad);
      document.querySelector(`.step[data-step="${bad}"]`).scrollIntoView({ behavior: "smooth", block: "center" });
      haptic("rigid");
      return;
    }
  }

  const profile = {
    name: draft.name.trim(),
    age: draft.age,
    gender: draft.gender,
    showMe: draft.showMe,
    school: draft.school,
    year: draft.year,
    bio: draft.bio.trim(),
    interests: draft.interests,
    photo: draft.photo,
    username: draft.username || "",
  };

  const previous = state.profile;
  state.profile = profile;
  if (!save()) {
    state.profile = previous;
    $("#form-error").textContent = "Your phone couldn't store this photo. Try a different one.";
    return;
  }
  showApp();
  if (!previous) switchTab("discover");
}

function setupWizard() {
  $("#f-age").innerHTML = `<option value="">Choose your age</option>` +
    Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => `<option>${MIN_AGE + i}</option>`).join("");

  $("#f-name").addEventListener("input", (e) => { draft.name = e.target.value; updateNav(); });
  $("#f-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); nextStep(); }
  });
  $("#f-age").addEventListener("change", (e) => { draft.age = Number(e.target.value) || 0; updateNav(); });
  $("#f-adult").addEventListener("change", (e) => { draft.adult = e.target.checked; updateNav(); });
  $("#f-bio").addEventListener("input", (e) => { draft.bio = e.target.value; renderBioCount(); updateNav(); });
  $("#f-ack").addEventListener("change", (e) => { draft.ack = e.target.checked; updateNav(); });

  // Single-choice questions: tapping an answer moves on to the next screen.
  document.querySelectorAll(".options").forEach((box) => {
    box.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-value]");
      if (!opt) return;
      const field = box.dataset.field;
      draft[field] = opt.dataset.value;
      renderOptions(field);
      updateNav();
      haptic("select");
      if (!editing) {
        const from = stepIndex;
        clearTimeout(advanceTimer);
        advanceTimer = setTimeout(() => { if (stepIndex === from) nextStep(); }, 250);
      }
    });
  });

  $("#interest-picker").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-interest]");
    if (!chip) return;
    const name = chip.dataset.interest;
    const i = draft.interests.indexOf(name);
    if (i >= 0) draft.interests.splice(i, 1);
    else if (draft.interests.length < MAX_INTERESTS) draft.interests.push(name);
    else return haptic("rigid");
    haptic("select");
    renderInterestPicker();
    updateNav();
  });

  $("#profile-form").addEventListener("submit", (e) => { e.preventDefault(); nextStep(); });
  $("#wiz-next").addEventListener("click", nextStep);
  $("#wiz-back").addEventListener("click", prevStep);
  $("#form-cancel").addEventListener("click", showApp);
}

// ---------- Photo upload ----------

// Shrinks the chosen image and re-encodes it as JPEG so it fits in browser storage.
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function renderPhotoPicker() {
  const preview = $("#photo-preview");
  preview.hidden = !draft.photo;
  if (draft.photo) preview.src = draft.photo;
  else preview.removeAttribute("src");
  $("#photo-empty").hidden = !!draft.photo;
  $("#photo-change").hidden = !draft.photo;
  $("#photo-remove").hidden = !draft.photo;
}

$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // lets the same file be picked again
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    $("#form-error").textContent = "Please choose an image file.";
    return;
  }
  try {
    draft.photo = await readPhoto(file);
    $("#form-error").textContent = "";
    haptic("light");
  } catch (err) {
    $("#form-error").textContent = "That photo couldn't be opened. Try a different one.";
  }
  renderPhotoPicker();
  updateNav();
});

$("#photo-change").addEventListener("click", () => $("#photo-input").click());
$("#photo-remove").addEventListener("click", () => {
  draft.photo = null;
  renderPhotoPicker();
  updateNav();
});

// ---------- Screens & tabs ----------

function showOnboarding() {
  editing = !!state.profile;
  draft = newDraft();
  stepIndex = 0;
  fillWizard();
  $("#app").hidden = true;
  $("#onboarding").hidden = false;
  renderWizard();
}

function showApp() {
  $("#onboarding").hidden = true;
  $("#app").hidden = false;
  renderDeck();
  renderMatches();
  renderMyProfile();
  renderSettings();
}

function switchTab(name) {
  document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
  document.querySelectorAll(".tabs button").forEach((b) => {
    if (b.dataset.tab === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $("main").scrollTop = 0;
  haptic("select");
}

document.querySelector(".tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (btn) switchTab(btn.dataset.tab);
});

$("#btn-like").addEventListener("click", () => swipe(candidates()[0], "like"));
$("#btn-pass").addEventListener("click", () => swipe(candidates()[0], "pass"));
$("#match-continue").addEventListener("click", () => { $("#match-modal").hidden = true; });
$("#match-chat").addEventListener("click", () => {
  $("#match-modal").hidden = true;
  if (lastMatch) openMatch(lastMatch);
});
$("#profile-modal-close").addEventListener("click", () => { $("#profile-modal").hidden = true; });

setupWizard();
setupSettings();
applyAppearance();
if (state.profile) showApp();
else showOnboarding();
