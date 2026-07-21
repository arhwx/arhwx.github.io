const KEY = "arhwx-timetable-v1";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PALETTE = [
  { c: "#e05252", s: "#382226", p: "#f6e2e2" },
  { c: "#5a8fe0", s: "#232a39", p: "#e2e9f9" },
  { c: "#7fbf4d", s: "#283321", p: "#eaf4df" },
  { c: "#e08e39", s: "#372c1f", p: "#f8ecdd" },
  { c: "#c06ad0", s: "#322339", p: "#f3e4f6" },
  { c: "#46b58a", s: "#20322b", p: "#def1e9" },
  { c: "#d86a9c", s: "#362129", p: "#f7e4ec" },
  { c: "#d9c33c", s: "#373320", p: "#f7f2d8" },
  { c: "#3fb3c4", s: "#203136", p: "#def0f3" },
  { c: "#8a7ce0", s: "#292539", p: "#e8e6f9" },
  { c: "#a08b62", s: "#312d23", p: "#f0ece2" },
  { c: "#7d8fa3", s: "#272b31", p: "#e7eaee" },
];

function defaultState() {
  return {
    school: "",
    term: "",
    days: [true, true, true, true, true, false, false],
    periods: 6,
    dayStart: "08:30",
    lessonMin: 40,
    breaks: [],
    subjects: [],
    teachers: [],
    classes: [],
    view: "c",
    result: null,
    seq: 1,
  };
}

function clamp(v, lo, hi, def) {
  v = v | 0 || def;
  return Math.min(hi, Math.max(lo, v));
}

function normalize(raw) {
  const s = Object.assign(defaultState(), raw && typeof raw === "object" ? raw : {});
  if (!Array.isArray(s.days) || s.days.length !== 7 || !s.days.some(Boolean)) s.days = defaultState().days;
  s.days = s.days.map(Boolean);
  s.periods = clamp(s.periods, 1, 12, 6);
  if (typeof s.dayStart !== "string" || (s.dayStart && !/^\d{1,2}:\d{2}$/.test(s.dayStart))) s.dayStart = "08:30";
  s.lessonMin = clamp(s.lessonMin, 5, 240, 40);
  s.breaks = (Array.isArray(s.breaks) ? s.breaks : []).filter(b => b && b.id != null).map(b => ({
    id: +b.id,
    after: clamp(b.after, 1, Math.max(1, s.periods - 1), 1),
    label: String(b.label || ""),
    min: clamp(b.min, 5, 180, 20),
  })).sort((a, b) => a.after - b.after);
  s.subjects = (Array.isArray(s.subjects) ? s.subjects : []).filter(x => x && x.id != null).map(x => ({
    id: +x.id, name: String(x.name || ""), color: Math.abs(x.color | 0) % PALETTE.length,
  }));
  s.teachers = (Array.isArray(s.teachers) ? s.teachers : []).filter(x => x && x.id != null).map(x => ({
    id: +x.id, name: String(x.name || ""), maxPerDay: Math.max(0, x.maxPerDay | 0),
    off: x.off && typeof x.off === "object" ? x.off : {},
  }));
  const sids = new Set(s.subjects.map(x => x.id));
  const tids = new Set(s.teachers.map(x => x.id));
  s.classes = (Array.isArray(s.classes) ? s.classes : []).filter(x => x && x.id != null).map(c => ({
    id: +c.id, name: String(c.name || ""),
    lessons: (Array.isArray(c.lessons) ? c.lessons : []).filter(l => l && l.id != null).map(l => ({
      id: +l.id,
      s: l.s != null && l.s !== "" && sids.has(+l.s) ? +l.s : "",
      t: l.t != null && l.t !== "" && tids.has(+l.t) ? +l.t : "",
      n: clamp(l.n, 1, 40, 1),
      m: Math.max(0, l.m | 0),
      pr: l.pr === "h" || l.pr === "l" ? l.pr : "n",
    })),
  }));
  s.view = s.view === "t" ? "t" : "c";
  if (s.result && !(Array.isArray(s.result.placed) && Array.isArray(s.result.un))) s.result = null;
  let top = 0;
  for (const x of [...s.subjects, ...s.teachers, ...s.classes, ...s.breaks]) top = Math.max(top, x.id);
  for (const c of s.classes) for (const l of c.lessons) top = Math.max(top, l.id);
  s.seq = top + 1;
  delete s.periodLabels;
  return s;
}

let state = defaultState();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {}
  return defaultState();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

function uid() { return state.seq++; }

function hasData() {
  return !!(state.subjects.length || state.teachers.length || state.classes.length || state.school);
}

function activeDays() {
  const out = [];
  for (let i = 0; i < 7; i++) if (state.days[i]) out.push(i);
  return out;
}

function fmtMin(x) {
  return (Math.floor(x / 60) % 24) + ":" + String(x % 60).padStart(2, "0");
}

function computeTimes() {
  const m = /^(\d{1,2}):(\d{2})$/.exec(state.dayStart || "");
  if (!m) return null;
  let cur = +m[1] * 60 + +m[2];
  const lessons = [];
  for (let p = 0; p < state.periods; p++) {
    lessons.push({ start: fmtMin(cur), end: fmtMin(cur + state.lessonMin) });
    cur += state.lessonMin;
    for (const b of state.breaks) if (b.after === p + 1) cur += b.min;
  }
  return lessons;
}

function countValidLessons() {
  let n = 0;
  for (const c of state.classes) for (const l of c.lessons) if (l.s !== "" && l.t !== "") n += l.n;
  return n;
}

function teacherAssigned(id) {
  let n = 0;
  for (const c of state.classes) for (const l of c.lessons) if (l.t === id && l.s !== "") n += l.n;
  return n;
}

function teacherAvail(tr) {
  const D = activeDays();
  let n = 0;
  for (const d of D) for (let p = 0; p < state.periods; p++) if (!tr.off[d + "-" + p]) n++;
  if (tr.maxPerDay > 0) n = Math.min(n, tr.maxPerDay * D.length);
  return n;
}

function workDays(tr) {
  let n = 0;
  for (const d of activeDays()) {
    for (let p = 0; p < state.periods; p++) {
      if (!tr.off[d + "-" + p]) { n++; break; }
    }
  }
  return n;
}

function lessonMax(l, days) {
  return l.m > 0 ? l.m : Math.max(1, Math.ceil(l.n / Math.max(1, days)));
}

function setupKey() {
  const off = t => Object.keys(t.off).filter(k => state.days[k.split("-")[0]] && +k.split("-")[1] < state.periods).sort();
  return JSON.stringify([state.days, state.periods,
    state.teachers.map(t => [t.id, t.maxPerDay, off(t)]),
    state.classes.map(c => [c.id, c.lessons.map(l => [l.s, l.t, l.n, l.m, l.pr])])]);
}

function warnings() {
  const out = [];
  const D = activeDays();
  const cap = D.length * state.periods;
  const teachMap = new Map(state.teachers.map(x => [x.id, x]));
  const subjName = id => {
    const x = state.subjects.find(s => s.id === id);
    return x ? x.name || "unnamed subject" : "?";
  };
  let skipped = 0;
  for (const c of state.classes) {
    const cname = c.name || "unnamed class";
    let tot = 0;
    for (const l of c.lessons) {
      if (l.s === "" || l.t === "") { skipped++; continue; }
      tot += l.n;
      const tr = teachMap.get(l.t);
      const days = workDays(tr);
      if (days === 0) {
        out.push(cname + ", " + subjName(l.s) + ": " + (tr.name || "the teacher") + " has no free time at all.");
        continue;
      }
      const m = lessonMax(l, days);
      if (m * days < l.n)
        out.push(cname + ", " + subjName(l.s) + ": " + l.n + " a week won't fit, " + (tr.name || "the teacher") +
          " only works " + days + (days === 1 ? " day" : " days") + " at up to " + m + " a day.");
    }
    if (tot > cap)
      out.push(cname + " has " + tot + " lessons a week but the week only has " + cap + " slots.");
  }
  for (const tr of state.teachers) {
    const asg = teacherAssigned(tr.id);
    const av = teacherAvail(tr);
    if (asg > av)
      out.push((tr.name || "unnamed teacher") + " has " + asg + " lessons but only " + av + " free slots.");
  }
  if (skipped === 1) out.push("One lesson row still needs a subject or teacher, it gets skipped.");
  else if (skipped) out.push(skipped + " lesson rows still need a subject or teacher, they get skipped.");
  return out;
}

function solve() {
  const D = activeDays();
  const P = state.periods;
  const teachers = new Map(state.teachers.map(t => [t.id, t]));
  const entries = [];
  for (const c of state.classes) {
    for (const l of c.lessons) {
      if (l.s === "" || l.t === "") continue;
      entries.push({
        id: entries.length,
        c: c.id, s: l.s, t: l.t, n: l.n,
        m: lessonMax(l, workDays(teachers.get(l.t))),
        pr: l.pr,
      });
    }
  }
  if (!entries.length || !D.length) return { placed: [], un: [], key: setupKey() };

  const deadline = Date.now() + 900;
  let best = null;
  let tries = 0;
  do {
    const res = attempt(entries, D, P, teachers);
    if (!best || res.placed.length > best.placed.length ||
      (res.placed.length === best.placed.length && res.gaps < best.gaps)) best = res;
    tries++;
  } while ((best.un.length || best.gaps) && tries < 400 && Date.now() < deadline);

  return {
    placed: best.placed.map(r => ({ c: r.e.c, s: r.e.s, t: r.e.t, d: r.d, p: r.p })),
    un: best.un,
    key: setupKey(),
  };
}

function attempt(entries, D, P, teachers) {
  const classAt = new Map(), teachAt = new Map();
  const perDay = new Map(), tDay = new Map(), cDay = new Map();
  const placed = [];
  const off = (th, d, p) => !!th.off[d + "-" + p];

  const freeCount = new Map();
  for (const [id, th] of teachers) {
    let n = 0;
    for (const d of D) for (let p = 0; p < P; p++) if (!off(th, d, p)) n++;
    freeCount.set(id, n);
  }
  const loadOf = new Map();
  for (const e of entries) loadOf.set(e.t, (loadOf.get(e.t) || 0) + e.n);

  const prioRank = { h: 0, n: 1, l: 2 };
  const order = entries
    .map(e => ({ e, r: Math.random() }))
    .sort((a, b) =>
      prioRank[a.e.pr] - prioRank[b.e.pr] ||
      (freeCount.get(a.e.t) - loadOf.get(a.e.t)) - (freeCount.get(b.e.t) - loadOf.get(b.e.t)) ||
      b.e.n - a.e.n ||
      a.r - b.r)
    .map(x => x.e);

  function canPlace(e, d, p) {
    if (classAt.has(e.c + "|" + d + "|" + p)) return false;
    if (teachAt.has(e.t + "|" + d + "|" + p)) return false;
    const th = teachers.get(e.t);
    if (off(th, d, p)) return false;
    if (th.maxPerDay > 0 && (tDay.get(e.t + "|" + d) || 0) >= th.maxPerDay) return false;
    if ((perDay.get(e.id + "|" + d) || 0) >= e.m) return false;
    return true;
  }
  function place(e, d, p) {
    const rec = { e, d, p };
    classAt.set(e.c + "|" + d + "|" + p, rec);
    teachAt.set(e.t + "|" + d + "|" + p, rec);
    perDay.set(e.id + "|" + d, (perDay.get(e.id + "|" + d) || 0) + 1);
    tDay.set(e.t + "|" + d, (tDay.get(e.t + "|" + d) || 0) + 1);
    cDay.set(e.c + "|" + d, (cDay.get(e.c + "|" + d) || 0) + 1);
    placed.push(rec);
  }
  function unplace(rec) {
    classAt.delete(rec.e.c + "|" + rec.d + "|" + rec.p);
    teachAt.delete(rec.e.t + "|" + rec.d + "|" + rec.p);
    perDay.set(rec.e.id + "|" + rec.d, perDay.get(rec.e.id + "|" + rec.d) - 1);
    tDay.set(rec.e.t + "|" + rec.d, tDay.get(rec.e.t + "|" + rec.d) - 1);
    cDay.set(rec.e.c + "|" + rec.d, cDay.get(rec.e.c + "|" + rec.d) - 1);
    placed.splice(placed.indexOf(rec), 1);
  }

  const unplaced = [];
  for (const e of order) {
    for (let i = 0; i < e.n; i++) {
      let bs = null, bScore = Infinity;
      for (const d of D) {
        if ((perDay.get(e.id + "|" + d) || 0) >= e.m) continue;
        for (let p = 0; p < P; p++) {
          if (!canPlace(e, d, p)) continue;
          const sameDay = perDay.get(e.id + "|" + d) || 0;
          const clsLoad = cDay.get(e.c + "|" + d) || 0;
          const score = sameDay * 100 + clsLoad * 3 + p * 2 + Math.random() * 2;
          if (score < bScore) { bScore = score; bs = [d, p]; }
        }
      }
      if (bs) place(e, bs[0], bs[1]); else unplaced.push(e);
    }
  }

  function findSlot(e, xd, xp) {
    for (const d of D) {
      for (let p = 0; p < P; p++) {
        if (d === xd && p === xp) continue;
        if (canPlace(e, d, p)) return [d, p];
      }
    }
    return null;
  }
  function tryRepair(e) {
    const th = teachers.get(e.t);
    for (const d of D) {
      if ((perDay.get(e.id + "|" + d) || 0) >= e.m) continue;
      for (let p = 0; p < P; p++) {
        if (off(th, d, p)) continue;
        if (canPlace(e, d, p)) { place(e, d, p); return true; }
        const bc = classAt.get(e.c + "|" + d + "|" + p);
        const bt = teachAt.get(e.t + "|" + d + "|" + p);
        const blockers = new Set();
        if (bc) blockers.add(bc);
        if (bt) blockers.add(bt);
        if (blockers.size !== 1) continue;
        const b = blockers.values().next().value;
        unplace(b);
        if (canPlace(e, d, p)) {
          const alt = findSlot(b.e, d, p);
          if (alt) { place(e, d, p); place(b.e, alt[0], alt[1]); return true; }
        }
        place(b.e, b.d, b.p);
      }
    }
    return false;
  }
  let progress = true;
  while (progress && unplaced.length) {
    progress = false;
    for (let i = unplaced.length - 1; i >= 0; i--) {
      if (tryRepair(unplaced[i])) { unplaced.splice(i, 1); progress = true; }
    }
  }

  const classIds = [...new Set(entries.map(e => e.c))];
  function lastOf(cid, d) {
    for (let p = P - 1; p >= 0; p--) {
      const rec = classAt.get(cid + "|" + d + "|" + p);
      if (rec) return rec;
    }
    return null;
  }
  function countOf(cid, d) {
    let n = 0;
    for (let p = 0; p < P; p++) if (classAt.has(cid + "|" + d + "|" + p)) n++;
    return n;
  }
  let moved = true;
  while (moved) {
    moved = false;
    for (const cid of classIds) {
      for (const d of D) {
        const last = lastOf(cid, d);
        if (!last) continue;
        for (let p = 0; p < last.p && !moved; p++) {
          if (classAt.has(cid + "|" + d + "|" + p)) continue;
          const pulls = [last];
          for (let q = p + 1; q < last.p; q++) {
            const rec = classAt.get(cid + "|" + d + "|" + q);
            if (rec) pulls.push(rec);
          }
          for (const d2 of [...D].sort((a, b) => countOf(cid, b) - countOf(cid, a))) {
            if (d2 === d) continue;
            const r2 = lastOf(cid, d2);
            if (r2) pulls.push(r2);
          }
          for (const rec of pulls) {
            unplace(rec);
            if (canPlace(rec.e, d, p)) { place(rec.e, d, p); moved = true; break; }
            place(rec.e, rec.d, rec.p);
          }
        }
      }
    }
  }
  let gaps = 0;
  for (const cid of classIds) {
    for (const d of D) {
      const last = lastOf(cid, d);
      if (last) gaps += last.p + 1 - countOf(cid, d);
    }
  }

  const agg = new Map();
  for (const e of unplaced) {
    const g = agg.get(e.id) || { c: e.c, s: e.s, t: e.t, n: 0 };
    g.n++;
    agg.set(e.id, g);
  }
  return { placed, un: [...agg.values()], gaps };
}

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.indexOf("on") === 0 && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}

let app = null;
let resultBox = null;
const openAvail = new Set();

function refresh() {
  renderResult();
  refreshBadges();
}

function renderAll() {
  app.replaceChildren(
    toolbarEl(), introEl(),
    stepSchool(), stepSubjects(), stepTeachers(), stepClasses(), stepGenerate()
  );
  refresh();
}

function toolbarEl() {
  const file = h("input", { type: "file", accept: "application/json,.json", style: "display:none", onchange: importFile });
  return h("div", { class: "toolbar no-print" },
    h("button", { onclick: loadExample }, "load example"),
    h("button", { onclick: exportFile }, "save file"),
    h("button", { onclick: () => file.click() }, "open file"),
    h("button", { class: "danger", onclick: resetAll }, "erase everything"),
    file);
}

function introEl() {
  return h("p", { class: "intro no-print" },
    "Add subjects, teachers and classes, then generate the timetable.");
}

function stepSchool() {
  const maxAfter = Math.max(1, state.periods - 1);
  const breakRows = state.breaks.map(b => {
    const afterSel = h("select", {
      onchange: ev => { b.after = ev.target.value | 0; state.breaks.sort((x, y) => x.after - y.after); save(); renderAll(); },
    }, Array.from({ length: maxAfter }, (_, i) => h("option", { value: i + 1 }, "after lesson " + (i + 1))));
    afterSel.value = String(Math.min(b.after, maxAfter));
    return h("div", { class: "bgrid" },
      afterSel,
      h("input", {
        type: "text", value: b.label, placeholder: "break",
        oninput: ev => { b.label = ev.target.value; save(); refresh(); },
      }),
      h("input", {
        type: "number", min: 5, max: 180, value: b.min,
        oninput: ev => { b.min = clamp(ev.target.value, 5, 180, 20); save(); refresh(); },
      }),
      h("button", {
        class: "x", title: "remove",
        onclick: () => { state.breaks = state.breaks.filter(x => x.id !== b.id); save(); renderAll(); },
      }, "✕"));
  });
  return h("section", { class: "step no-print" },
    h("h2", {}, "school & week"),
    h("div", { class: "fields" },
      h("label", { class: "field" }, h("span", {}, "school name"),
        h("input", {
          type: "text", value: state.school, placeholder: "goes on the printed sheets",
          oninput: ev => { state.school = ev.target.value; save(); refresh(); },
        })),
      h("label", { class: "field small" }, h("span", {}, "year or term"),
        h("input", {
          type: "text", value: state.term, placeholder: "2026-2027",
          oninput: ev => { state.term = ev.target.value; save(); refresh(); },
        }))),
    h("div", { class: "fields" },
      h("label", { class: "field small" }, h("span", {}, "lessons per day"),
        h("input", {
          type: "number", min: 1, max: 12, value: state.periods,
          onchange: ev => {
            state.periods = clamp(ev.target.value, 1, 12, 6);
            for (const b of state.breaks) b.after = Math.min(b.after, Math.max(1, state.periods - 1));
            save(); renderAll();
          },
        })),
      h("label", { class: "field small" }, h("span", {}, "first lesson starts"),
        h("input", {
          type: "time", value: state.dayStart,
          oninput: ev => { state.dayStart = ev.target.value; save(); refresh(); },
        })),
      h("label", { class: "field small" }, h("span", {}, "minutes per lesson"),
        h("input", {
          type: "number", min: 5, max: 240, value: state.lessonMin,
          oninput: ev => { state.lessonMin = clamp(ev.target.value, 5, 240, 40); save(); refresh(); },
        }))),
    h("div", { class: "daypills" }, DAYS.map((name, i) =>
      h("button", { "aria-pressed": String(state.days[i]), onclick: () => toggleDay(i) }, name))),
    h("div", { class: "breaks" },
      breakRows.length ? h("div", { class: "bgrid bhead" },
        h("span", {}, "after"), h("span", {}, "name"), h("span", {}, "minutes"), h("span", {}, "")) : null,
      breakRows,
      h("div", { class: "add-row" }, h("button", { onclick: addBreak }, "+ add a break"))));
}

function toggleDay(i) {
  if (state.days[i] && state.days.filter(Boolean).length === 1) return;
  state.days[i] = !state.days[i];
  save(); renderAll();
}

function addBreak() {
  const maxAfter = Math.max(1, state.periods - 1);
  const last = state.breaks[state.breaks.length - 1];
  state.breaks.push({
    id: uid(),
    after: last ? Math.min(last.after + 2, maxAfter) : Math.min(2, maxAfter),
    label: "",
    min: 20,
  });
  save(); renderAll();
}

function stepSubjects() {
  const list = state.subjects.length
    ? h("ul", { class: "subjects" }, state.subjects.map(s =>
        h("li", {},
          h("span", { class: "dot", style: "background:" + PALETTE[s.color].c }),
          h("input", {
            type: "text", value: s.name,
            oninput: ev => { s.name = ev.target.value; save(); refresh(); },
          }),
          h("button", { class: "x", title: "delete", onclick: () => delSubject(s.id) }, "✕"))))
    : h("p", { class: "empty" }, "No subjects yet.");
  return h("section", { class: "step no-print" },
    h("h2", {}, "subjects"),
    list,
    h("div", { class: "add-row" },
      h("input", {
        type: "text", id: "addSubj", placeholder: "new subject",
        onkeydown: ev => { if (ev.key === "Enter") addSubject(); },
      }),
      h("button", { onclick: addSubject }, "add")));
}

function pickColor() {
  const used = new Array(PALETTE.length).fill(0);
  for (const s of state.subjects) used[s.color]++;
  let best = 0;
  for (let i = 1; i < PALETTE.length; i++) if (used[i] < used[best]) best = i;
  return best;
}

function addFrom(id, make) {
  const name = document.getElementById(id).value.trim();
  if (!name) return;
  make(name);
  save(); renderAll();
  document.getElementById(id).focus();
}

function addSubject() {
  addFrom("addSubj", name => state.subjects.push({ id: uid(), name, color: pickColor() }));
}

function delSubject(id) {
  const used = state.classes.some(c => c.lessons.some(l => l.s === id));
  if (used && !confirm("Delete this subject? Lessons using it get deleted too.")) return;
  state.subjects = state.subjects.filter(s => s.id !== id);
  for (const c of state.classes) c.lessons = c.lessons.filter(l => l.s !== id);
  save(); renderAll();
}

function stepTeachers() {
  const list = state.teachers.length
    ? state.teachers.map(teacherCard)
    : [h("p", { class: "empty" }, "No teachers yet.")];
  return h("section", { class: "step no-print" },
    h("h2", {}, "teachers"),
    list,
    h("div", { class: "add-row" },
      h("input", {
        type: "text", id: "addTeach", placeholder: "teacher name",
        onkeydown: ev => { if (ev.key === "Enter") addTeacher(); },
      }),
      h("button", { onclick: addTeacher }, "add")));
}

function teacherCard(tr) {
  const D = activeDays();
  const P = state.periods;
  const times = computeTimes();
  const headRow = h("div", { class: "avrow avhead" },
    h("span", { class: "avday" }, ""),
    Array.from({ length: P }, (_, p) => h("span", { class: "avcol" },
      h("b", {}, String(p + 1)),
      h("span", { "data-avtime": p }, times ? times[p].start : ""))));
  const rows = D.map(d => h("div", { class: "avrow" },
    h("span", { class: "avday" }, DAYS[d]),
    Array.from({ length: P }, (_, p) => {
      const k = d + "-" + p;
      const isOff = !!tr.off[k];
      return h("button", {
        class: "av" + (isOff ? " offc" : ""),
        title: DAYS[d] + (times ? " " + times[p].start : ""),
        onclick: ev => {
          if (tr.off[k]) delete tr.off[k]; else tr.off[k] = 1;
          const nowOff = !!tr.off[k];
          ev.currentTarget.className = "av" + (nowOff ? " offc" : "");
          ev.currentTarget.textContent = nowOff ? "✕" : "✓";
          save(); refresh();
        },
      }, isOff ? "✕" : "✓");
    })));
  const maxSel = h("select", {
    onchange: ev => { tr.maxPerDay = ev.target.value | 0; save(); refresh(); },
  },
    h("option", { value: 0 }, "no limit"),
    Array.from({ length: P }, (_, i) => h("option", { value: i + 1 }, String(i + 1))));
  maxSel.value = String(tr.maxPerDay > 0 && tr.maxPerDay <= P ? tr.maxPerDay : 0);
  return h("div", { class: "tcard" },
    h("div", { class: "trow" },
      h("input", {
        class: "nm", type: "text", value: tr.name,
        oninput: ev => { tr.name = ev.target.value; save(); refresh(); },
      }),
      h("span", { class: "badge", "data-tload": tr.id }),
      h("button", { class: "x", title: "delete", onclick: () => delTeacher(tr.id) }, "✕")),
    h("details", {
      class: "avail", open: openAvail.has(tr.id),
      ontoggle: ev => { if (ev.target.open) openAvail.add(tr.id); else openAvail.delete(tr.id); },
    },
      h("summary", {}, "when they're free"),
      h("div", { class: "avwrap" }, headRow, rows),
      h("div", { class: "avfoot" },
        h("span", { class: "lbl" }, "max lessons per day"), maxSel)));
}

function addTeacher() {
  addFrom("addTeach", name => state.teachers.push({ id: uid(), name, maxPerDay: 0, off: {} }));
}

function delTeacher(id) {
  const used = state.classes.some(c => c.lessons.some(l => l.t === id));
  if (used && !confirm("Delete this teacher? Their lessons get deleted too.")) return;
  state.teachers = state.teachers.filter(t => t.id !== id);
  for (const c of state.classes) c.lessons = c.lessons.filter(l => l.t !== id);
  openAvail.delete(id);
  save(); renderAll();
}

function stepClasses() {
  const list = state.classes.length
    ? state.classes.map(classCard)
    : [h("p", { class: "empty" }, "No classes yet.")];
  return h("section", { class: "step no-print" },
    h("h2", {}, "classes & lessons"),
    list,
    h("div", { class: "add-row" },
      h("input", {
        type: "text", id: "addCls", placeholder: "class name",
        onkeydown: ev => { if (ev.key === "Enter") addClass(); },
      }),
      h("button", { onclick: addClass }, "add")));
}

function lessonRow(c, l) {
  const P = state.periods;
  const subjSel = h("select", {
    class: l.s === "" ? "missing" : "",
    onchange: ev => {
      l.s = ev.target.value === "" ? "" : +ev.target.value;
      ev.target.classList.toggle("missing", l.s === "");
      save(); refresh();
    },
  },
    h("option", { value: "" }, "subject"),
    state.subjects.map(s => h("option", { value: s.id }, s.name || "(unnamed)")));
  subjSel.value = l.s === "" ? "" : String(l.s);
  const teachSel = h("select", {
    class: l.t === "" ? "missing" : "",
    onchange: ev => {
      l.t = ev.target.value === "" ? "" : +ev.target.value;
      ev.target.classList.toggle("missing", l.t === "");
      save(); refresh();
    },
  },
    h("option", { value: "" }, "teacher"),
    state.teachers.map(t => h("option", { value: t.id }, t.name || "(unnamed)")));
  teachSel.value = l.t === "" ? "" : String(l.t);
  const nInp = h("input", {
    type: "number", min: 1, max: 40, value: l.n,
    oninput: ev => { l.n = clamp(ev.target.value, 1, 40, 1); save(); refresh(); },
  });
  const maxSel = h("select", {
    onchange: ev => { l.m = ev.target.value | 0; save(); refresh(); },
  },
    h("option", { value: 0 }, "auto"),
    Array.from({ length: P }, (_, i) => h("option", { value: i + 1 }, String(i + 1))));
  maxSel.value = String(l.m > 0 && l.m <= P ? l.m : 0);
  const prSel = h("select", {
    onchange: ev => { l.pr = ev.target.value; save(); refresh(); },
  },
    h("option", { value: "n" }, "normal"),
    h("option", { value: "h" }, "high (early)"),
    h("option", { value: "l" }, "low (late)"));
  prSel.value = l.pr;
  return h("div", { class: "lgrid" },
    subjSel, teachSel, nInp, maxSel, prSel,
    h("button", {
      class: "x", title: "remove",
      onclick: () => { c.lessons = c.lessons.filter(x => x.id !== l.id); save(); renderAll(); },
    }, "✕"));
}

function classCard(c) {
  const ready = state.subjects.length && state.teachers.length;
  const body = [];
  if (c.lessons.length) {
    body.push(h("div", { class: "lwrap" },
      h("div", { class: "lgrid lhead" },
        h("span", {}, "subject"), h("span", {}, "teacher"), h("span", {}, "per week"),
        h("span", {}, "max per day"), h("span", {}, "priority"), h("span", {}, "")),
      c.lessons.map(l => lessonRow(c, l))));
  }
  body.push(ready
    ? h("div", { class: "add-row" }, h("button", { onclick: () => addLesson(c) }, "+ add lesson"))
    : h("p", { class: "empty" }, "Add some subjects and teachers first."));
  return h("div", { class: "tcard" },
    h("div", { class: "trow" },
      h("input", {
        class: "nm", type: "text", value: c.name,
        oninput: ev => { c.name = ev.target.value; save(); refresh(); },
      }),
      h("span", { class: "badge", "data-cls-total": c.id }),
      h("button", { class: "minibtn", onclick: () => dupClass(c) }, "duplicate"),
      h("button", { class: "x", title: "delete", onclick: () => delClass(c.id) }, "✕")),
    body);
}

function addClass() {
  addFrom("addCls", name => state.classes.push({ id: uid(), name, lessons: [] }));
}

function delClass(id) {
  const c = state.classes.find(x => x.id === id);
  if (c && c.lessons.length && !confirm("Delete this class and its lessons?")) return;
  state.classes = state.classes.filter(x => x.id !== id);
  save(); renderAll();
}

function dupClass(c) {
  state.classes.push({
    id: uid(),
    name: c.name ? c.name + " copy" : "",
    lessons: c.lessons.map(l => ({ id: uid(), s: l.s, t: l.t, n: l.n, m: l.m, pr: l.pr })),
  });
  save(); renderAll();
}

function addLesson(c) {
  const used = new Set(c.lessons.map(l => l.s));
  const sug = state.subjects.find(s => !used.has(s.id));
  c.lessons.push({ id: uid(), s: sug ? sug.id : "", t: "", n: 1, m: 0, pr: "n" });
  save(); renderAll();
}

function stepGenerate() {
  const ul = h("ul", { class: "warnings no-print", "data-warnings": "1", hidden: true });
  const btn = h("button", { class: "gen-btn no-print", "data-gen": "1", onclick: generate }, "generate");
  const note = h("p", { class: "gen-note no-print", "data-gennote": "1", hidden: true },
    "Add a class with at least one lesson first.");
  resultBox = h("div", {});
  return h("section", { class: "step" }, ul, btn, note, resultBox);
}

function generate() {
  const btn = document.querySelector("[data-gen]");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = "working...";
  setTimeout(() => {
    state.result = solve();
    save();
    btn.textContent = "generate";
    btn.disabled = false;
    refresh();
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 30);
}

function setView(v) {
  state.view = v;
  save();
  renderResult();
}

function renderResult() {
  if (!resultBox) return;
  resultBox.replaceChildren();
  const r = state.result;
  if (!r || (!r.placed.length && !r.un.length)) return;
  const subj = new Map(state.subjects.map(s => [s.id, s]));
  const teach = new Map(state.teachers.map(t => [t.id, t]));
  const cls = new Map(state.classes.map(c => [c.id, c]));
  const nameOf = (map, id) => {
    const x = map.get(id);
    return x ? x.name || "(unnamed)" : "(deleted)";
  };

  resultBox.append(h("div", { class: "stalebanner", "data-stale": "1", hidden: r.key === setupKey() },
    "The setup changed after this table was made. Generate again to update it."));

  const missing = r.un.reduce((a, u) => a + u.n, 0);
  if (!missing) {
    resultBox.append(h("p", { class: "status ok no-print" }, "All " + r.placed.length + " lessons fit."));
  } else {
    resultBox.append(
      h("p", { class: "status part no-print" },
        r.placed.length + " of " + (r.placed.length + missing) + " lessons fit. No room for:"),
      h("ul", { class: "unlist no-print" }, r.un.map(u =>
        h("li", {}, nameOf(cls, u.c) + ", " + nameOf(subj, u.s) + " (" + nameOf(teach, u.t) + "): " + u.n))),
      h("p", { class: "hint no-print" },
        "Free up some teacher time or lower a few weekly counts, then generate again."));
  }

  resultBox.append(h("div", { class: "tabs no-print" },
    h("button", { "aria-pressed": String(state.view === "c"), onclick: () => setView("c") }, "by class"),
    h("button", { "aria-pressed": String(state.view === "t"), onclick: () => setView("t") }, "by teacher"),
    h("button", { class: "printbtn", onclick: () => window.print() }, "print")));

  const D = activeDays();
  const P = state.periods;
  const times = computeTimes();
  const sub = [state.school.trim(), state.term.trim()].filter(Boolean).join(", ");
  const brkAt = [];
  for (let p = 0; p < P; p++) brkAt.push(state.breaks.filter(b => Math.min(b.after, P - 1) === p + 1));

  const table = cellFor => {
    const head = [h("th", {}, "")];
    for (let p = 0; p < P; p++) {
      head.push(h("th", {}, String(p + 1),
        times ? h("span", { class: "pt" }, times[p].start + "-" + times[p].end) : null));
      for (const b of brkAt[p]) {
        head.push(h("th", { class: "brkh" }, b.label.trim() || "break",
          h("span", { class: "pt" }, b.min + " min")));
      }
    }
    const body = D.map((d, di) => {
      const cells = [h("th", {}, DAYS[d])];
      for (let p = 0; p < P; p++) {
        cells.push(cellFor(d, p));
        if (di === 0) for (const b of brkAt[p]) {
          cells.push(h("td", { class: "brkcell", rowspan: D.length }));
        }
      }
      return h("tr", {}, cells);
    });
    return h("div", { class: "scroll-x" }, h("table", { class: "tt" },
      h("thead", {}, h("tr", {}, head)), h("tbody", {}, body)));
  };

  const chip = (top, bottom, colorIdx) => {
    const pal = PALETTE[colorIdx] || PALETTE[PALETTE.length - 1];
    return h("div", { class: "chip", style: "--cc:" + pal.c + ";--cs:" + pal.s + ";--cp:" + pal.p },
      h("div", { class: "cn" }, top), h("div", { class: "ct" }, bottom));
  };

  if (state.view === "c") {
    const byC = new Map();
    for (const rec of r.placed) {
      if (!byC.has(rec.c)) byC.set(rec.c, new Map());
      byC.get(rec.c).set(rec.d + "|" + rec.p, rec);
    }
    for (const c of state.classes) {
      const grid = byC.get(c.id);
      if (!grid) continue;
      resultBox.append(h("div", { class: "sheet" },
        h("div", { class: "shead" },
          h("span", { class: "sname" }, c.name || "(unnamed)"),
          sub ? h("span", { class: "sschool" }, sub) : null),
        table((d, p) => {
          const rec = grid.get(d + "|" + p);
          if (!rec) return h("td", {});
          const s = subj.get(rec.s);
          return h("td", {}, chip(nameOf(subj, rec.s), nameOf(teach, rec.t), s ? s.color : PALETTE.length - 1));
        })));
    }
  } else {
    const byT = new Map();
    for (const rec of r.placed) {
      if (!byT.has(rec.t)) byT.set(rec.t, new Map());
      byT.get(rec.t).set(rec.d + "|" + rec.p, rec);
    }
    for (const tr of state.teachers) {
      const grid = byT.get(tr.id);
      if (!grid) continue;
      resultBox.append(h("div", { class: "sheet" },
        h("div", { class: "shead" },
          h("span", { class: "sname" }, tr.name || "(unnamed)"),
          sub ? h("span", { class: "sschool" }, sub) : null),
        table((d, p) => {
          const rec = grid.get(d + "|" + p);
          if (rec) {
            const s = subj.get(rec.s);
            return h("td", {}, chip(nameOf(cls, rec.c), nameOf(subj, rec.s), s ? s.color : PALETTE.length - 1));
          }
          if (tr.off[d + "-" + p]) return h("td", { class: "offx", title: "not free" }, "✕");
          return h("td", {});
        })));
    }
  }
}

function refreshBadges() {
  const cap = activeDays().length * state.periods;
  document.querySelectorAll("[data-cls-total]").forEach(el => {
    const c = state.classes.find(x => x.id === +el.dataset.clsTotal);
    if (!c) return;
    let n = 0;
    for (const l of c.lessons) if (l.s !== "" && l.t !== "") n += l.n;
    el.textContent = n + " of " + cap + " slots";
    el.classList.toggle("over", n > cap);
  });
  document.querySelectorAll("[data-tload]").forEach(el => {
    const tr = state.teachers.find(x => x.id === +el.dataset.tload);
    if (!tr) return;
    const asg = teacherAssigned(tr.id);
    const av = teacherAvail(tr);
    el.textContent = asg + " lessons, " + av + " free";
    el.classList.toggle("over", asg > av);
  });
  const times = computeTimes();
  document.querySelectorAll("[data-avtime]").forEach(el => {
    const p = +el.dataset.avtime;
    el.textContent = times && times[p] ? times[p].start : "";
  });
  const st = document.querySelector("[data-stale]");
  if (st) st.hidden = !state.result || state.result.key === setupKey();
  const items = warnings();
  const ul = document.querySelector("[data-warnings]");
  if (ul) {
    ul.replaceChildren(...items.map(w => h("li", {}, w)));
    ul.hidden = !items.length;
  }
  const ok = countValidLessons() > 0;
  const btn = document.querySelector("[data-gen]");
  if (btn) btn.disabled = !ok;
  const note = document.querySelector("[data-gennote]");
  if (note) note.hidden = ok;
}

function exportFile() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: "timetable.json" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importFile(ev) {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = "";
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const data = JSON.parse(rd.result);
      if (!data || typeof data !== "object" || !Array.isArray(data.classes)) throw new Error("bad file");
      if (hasData() && !confirm("This replaces what you have now. Continue?")) return;
      state = normalize(data);
      save(); renderAll();
    } catch (e) {
      alert("Could not read that file.");
    }
  };
  rd.readAsText(f);
}

function resetAll() {
  if (!confirm("This erases everything. Sure?")) return;
  state = defaultState();
  save(); renderAll();
}

function loadExample() {
  if (hasData() && !confirm("Load the example over your current data?")) return;
  fetch("/data/timetable-example.json")
    .then(r => r.json())
    .then(data => { state = normalize(data); save(); renderAll(); })
    .catch(() => alert("Could not load the example."));
}

state = load();
app = document.getElementById("app");
renderAll();
