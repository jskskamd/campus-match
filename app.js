const tg = window.Telegram ? window.Telegram.WebApp : null;
if (tg) {
  tg.ready();
  tg.expand();
  // Stop a downward card drag from closing the Mini App on mobile.
  if (tg.isVersionAtLeast && tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes();
}

const STORE_KEY = "campusmatch:v1";
const SCHOOLS = ["Engineering", "Sciences & Humanities", "Medicine", "Mining & Geosciences",
  "Business", "Education", "Public Policy", "Foundation"];
const YEARS = ["Foundation", "1st year", "2nd year", "3rd year", "4th year", "Master's", "PhD"];
const INTERESTS = ["Coffee", "Hiking", "Gaming", "Music", "Movies", "Anime", "Books", "Sport",
  "Gym", "Coding", "Art", "Photography", "Travel", "Cooking", "Dancing", "Chess", "Startups",
  "Volunteering", "Debate", "K-pop"];
const MAX_INTERESTS = 5;
const GRADIENTS = [
  ["#ff9a9e", "#fecfef"], ["#f6d365", "#fda085"], ["#84fab0", "#8fd3f4"], ["#a18cd1", "#fbc2eb"],
  ["#fccb90", "#d57eeb"], ["#e0c3fc", "#8ec5fc"], ["#43e97b", "#38f9d7"], ["#fa709a", "#fee140"],
  ["#30cfd0", "#330867"], ["#c79081", "#dfa579"], ["#667eea", "#764ba2"], ["#ff758c", "#ff7eb3"],
];

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- State (saved in this device's browser storage) ----------

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { profile: null, swipes: {}, matches: [] };
}

let state = loadState();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

function haptic(kind) {
  try {
    if (!tg || !tg.HapticFeedback) return;
    if (kind === "match") tg.HapticFeedback.notificationOccurred("success");
    else tg.HapticFeedback.impactOccurred(kind);
  } catch (e) {}
}

function avatarBg(p) {
  const [a, b] = GRADIENTS[p.gradient % GRADIENTS.length];
  return `background: linear-gradient(135deg, ${a}, ${b})`;
}

function me() {
  return { ...state.profile, emoji: "🙂", gradient: 0 };
}

// ---------- Cards ----------

function makeCard(p) {
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <div class="card-photo" style="${avatarBg(p)}">
      <span class="card-emoji">${p.emoji}</span>
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
  const showMe = state.profile.showMe;
  return PROFILES.filter((p) =>
    !(p.id in state.swipes) &&
    !state.matches.includes(p.id) &&
    (showMe === "everyone" || (showMe === "women" ? p.gender === "woman" : p.gender === "man")));
}

function renderDeck() {
  const deck = $("#deck");
  const list = candidates();
  deck.innerHTML = "";
  $("#deck-actions").hidden = list.length === 0;

  if (!list.length) {
    deck.innerHTML = `
      <div class="empty">
        <div class="empty-emoji">🎉</div>
        <h3>You've seen everyone</h3>
        <p class="hint">That's all the sample profiles for now.</p>
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

function showMatch(p) {
  const m = me();
  $("#match-me").style.cssText = avatarBg(m);
  $("#match-me").textContent = m.emoji;
  $("#match-them").style.cssText = avatarBg(p);
  $("#match-them").textContent = p.emoji;
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
        <span class="avatar" style="${avatarBg(p)}">${p.emoji}</span>
        <span class="match-info">
          <strong>${esc(p.name)}, ${p.age}</strong>
          <small>${esc(p.school)} · ${esc(p.year)}</small>
        </span>
        <span class="chevron">›</span>
      </button>
    </li>`).join("");
}

$("#match-list").addEventListener("click", (e) => {
  const row = e.target.closest(".match-row");
  if (!row) return;
  const p = PROFILES.find((x) => x.id === Number(row.dataset.id));
  const holder = $("#profile-modal-card");
  holder.innerHTML = "";
  holder.appendChild(makeCard(p));
  $("#profile-modal").hidden = false;
});

// ---------- My profile ----------

function renderMyProfile() {
  const holder = $("#my-card");
  holder.innerHTML = "";
  holder.appendChild(makeCard(me()));
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
  state = { profile: null, swipes: {}, matches: [] };
  save();
  showOnboarding();
});

$("#btn-edit").addEventListener("click", showOnboarding);

// ---------- Sign-up form ----------

let pickedInterests = new Set();

function setupForm() {
  const el = $("#profile-form").elements;
  el.age.innerHTML = `<option value="">Choose…</option>` +
    Array.from({ length: 18 }, (_, i) => `<option>${18 + i}</option>`).join("");
  el.school.innerHTML = `<option value="">Choose…</option>` +
    SCHOOLS.map((s) => `<option>${esc(s)}</option>`).join("");
  el.year.innerHTML = `<option value="">Choose…</option>` +
    YEARS.map((y) => `<option>${esc(y)}</option>`).join("");
}

function renderInterestPicker() {
  $("#interest-picker").innerHTML = INTERESTS.map((i) =>
    `<button type="button" class="chip${pickedInterests.has(i) ? " on" : ""}" data-interest="${esc(i)}">${esc(i)}</button>`
  ).join("");
  $("#interest-count").textContent = `(${pickedInterests.size}/${MAX_INTERESTS})`;
}

$("#interest-picker").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-interest]");
  if (!chip) return;
  const name = chip.dataset.interest;
  if (pickedInterests.has(name)) pickedInterests.delete(name);
  else if (pickedInterests.size < MAX_INTERESTS) pickedInterests.add(name);
  else return haptic("rigid");
  haptic("light");
  renderInterestPicker();
});

function fillForm() {
  const el = $("#profile-form").elements;
  const p = state.profile || {};
  const tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  el.displayName.value = p.name || (tgUser && tgUser.first_name) || "";
  el.age.value = p.age || "";
  el.gender.value = p.gender || "";
  el.showMe.value = p.showMe || "";
  el.school.value = p.school || "";
  el.year.value = p.year || "";
  el.bio.value = p.bio || "";
  el.adult.checked = el.ack.checked = !!state.profile;
  pickedInterests = new Set(p.interests || []);
  renderInterestPicker();
  $("#form-error").textContent = "";

  const editing = !!state.profile;
  $("#form-title").textContent = editing ? "Edit profile" : "💘 Campus Match";
  $("#form-subtitle").textContent = editing
    ? "Update how other students see you."
    : "Meet other students. Create your profile to start.";
  $("#form-submit").textContent = editing ? "Save" : "Start matching";
  $("#form-cancel").hidden = !editing;
}

$("#profile-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const el = e.target.elements;
  const error = (msg) => { $("#form-error").textContent = msg; haptic("rigid"); };

  const profile = {
    name: el.displayName.value.trim(),
    age: Number(el.age.value),
    gender: el.gender.value,
    showMe: el.showMe.value,
    school: el.school.value,
    year: el.year.value,
    bio: el.bio.value.trim(),
    interests: [...pickedInterests],
  };

  if (!profile.name) return error("Please enter your name.");
  if (!profile.age || !profile.gender || !profile.showMe || !profile.school || !profile.year) {
    return error("Please fill in age, gender, who to show, school and year.");
  }
  if (profile.age < 18 || !el.adult.checked) return error("Campus Match is for students 18 and older.");
  if (!el.ack.checked) return error("Please confirm you understand this is a prototype.");

  const firstTime = !state.profile;
  state.profile = profile;
  save();
  showApp();
  if (firstTime) switchTab("discover");
});

$("#form-cancel").addEventListener("click", showApp);

// ---------- Screens & tabs ----------

function showOnboarding() {
  fillForm();
  $("#app").hidden = true;
  $("#onboarding").hidden = false;
  window.scrollTo(0, 0);
}

function showApp() {
  $("#onboarding").hidden = true;
  $("#app").hidden = false;
  renderDeck();
  renderMatches();
  renderMyProfile();
}

function switchTab(name) {
  document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
  document.querySelectorAll(".tabs button").forEach((b) => {
    if (b.dataset.tab === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  haptic("light");
}

document.querySelector(".tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (btn) switchTab(btn.dataset.tab);
});

$("#btn-like").addEventListener("click", () => swipe(candidates()[0], "like"));
$("#btn-pass").addEventListener("click", () => swipe(candidates()[0], "pass"));
$("#match-continue").addEventListener("click", () => { $("#match-modal").hidden = true; });
$("#match-chat").addEventListener("click", () => { $("#match-modal").hidden = true; switchTab("matches"); });
$("#profile-modal-close").addEventListener("click", () => { $("#profile-modal").hidden = true; });

setupForm();
if (state.profile) showApp();
else showOnboarding();
