'use strict';

/* =========================================================================
   Wordle month stats
   Veškeré hodnoty se počítají z raw.csv (sloupce: číslo Wordlu, jméno, výsledek).
   Výsledek 1–6 = dohráno, 7 = nedohráno.
   ========================================================================= */

const MONTH_NAMES = ['leden','únor','březen','duben','květen','červen',
                     'červenec','srpen','září','říjen','listopad','prosinec'];

/* Kotva: Wordle č. 1657 = 1. ledna 2026 (dané rozsahy: leden 1657–1687,
   únor 1688–1715, červen 1808–1837). Každý další den = +1 k číslu Wordlu. */
const ANCHOR_NUM  = 1657;
const ANCHOR_DATE = Date.UTC(2026, 0, 1);
const DAY_MS = 86400000;

const numToDate = n => new Date(ANCHOR_DATE + (n - ANCHOR_NUM) * DAY_MS);
const dateToNum = d => Math.round((d - ANCHOR_DATE) / DAY_MS) + ANCHOR_NUM;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12

/* Sloupce tabulky. `best` značí, která hodnota se v řádku zvýrazní. */
const COLS = [
  {key:'finished',   label:'Finished',                type:'int'},
  {key:'unfinished', label:'Unfinished',              type:'int'},
  {key:'success',    label:'Success rate',            type:'pct', best:'high'},
  {key:'notattend',  label:'Not attend',              type:'int'},
  {key:'attendance', label:'Attendance',              type:'pct', best:'high'},
  {key:'completion', label:'Completion rate',         type:'pct', best:'high'},
  {key:'avg',        label:'Average In when finished',type:'dec', best:'low'},
  {key:'in1',        label:'In 1',                    type:'int'},
  {key:'in2',        label:'In 2',                    type:'int'},
  {key:'in3',        label:'In 3',                    type:'int'},
  {key:'in4',        label:'In 4',                    type:'int'},
  {key:'in5',        label:'In 5',                    type:'int'},
  {key:'in6',        label:'In 6',                    type:'int'},
  {key:'lowest',     label:'Lowest In',               type:'int', best:'low'},
  {key:'victories',  label:'Victories',               type:'int', best:'high'},
  {key:'diff',       label:'Average diff from lowest',type:'dec', best:'low'},
];

const cz = n => String(n).replace('.', ',');
function fmt(v, type){
  if(type === 'pct') return cz(v.toFixed(2)) + ' %';
  if(type === 'dec') return cz(v.toFixed(2));
  return String(v);
}

/* ---------- CSV parsing ---------- */
function parseCsv(text){
  const rows = [];
  for(const raw of text.split(/\r?\n/)){
    const line = raw.trim();
    if(!line) continue;
    const [numStr, name, resStr] = line.split(',');
    const num = parseInt(numStr, 10);
    const res = parseInt(resStr, 10);
    if(Number.isNaN(num) || Number.isNaN(res) || !name) continue;
    rows.push({num, name: name.trim(), res});
  }
  return rows;
}

/* ---------- Statistiky jednoho měsíce ---------- */
function computeMonth(rows, year, month){
  const days     = daysInMonth(year, month);
  const firstNum = dateToNum(new Date(Date.UTC(year, month - 1, 1)));
  const lastNum  = firstNum + days - 1;

  const entries = rows.filter(r => r.num >= firstNum && r.num <= lastNum);
  if(!entries.length) return null;

  /* nejnižší (nejlepší) výsledek dne — počítají se jen dohrané (1–6) */
  const dayLow = {};
  for(const {num, res} of entries){
    if(res >= 1 && res <= 6){
      if(dayLow[num] === undefined || res < dayLow[num]) dayLow[num] = res;
    }
  }

  const names = [...new Set(entries.map(e => e.name))];
  const players = [];

  for(const name of names){
    const mine = entries.filter(e => e.name === name);
    const solved = mine.filter(e => e.res >= 1 && e.res <= 6);
    const finished   = solved.length;
    const unfinished = mine.filter(e => e.res === 7).length;
    const attended   = finished + unfinished;
    if(attended === 0) continue;               // v tomto měsíci nehrál/a → nezobrazí se

    const ins = {in1:0, in2:0, in3:0, in4:0, in5:0, in6:0};
    for(const e of solved) ins['in' + e.res]++;

    const attemptSum = solved.reduce((s, e) => s + e.res, 0);
    const victories  = solved.filter(e => e.res === dayLow[e.num]).length;
    const diffSum    = solved.reduce((s, e) => s + (e.res - dayLow[e.num]), 0);

    players.push({
      name,
      finished,
      unfinished,
      success:    (finished + unfinished) ? finished / (finished + unfinished) * 100 : 0,
      notattend:  days - attended,
      attendance: attended / days * 100,
      completion: finished / days * 100,
      avg:        finished ? attemptSum / finished : 0,
      ...ins,
      lowest:     finished ? Math.min(...solved.map(e => e.res)) : 0,
      victories,
      diff:       finished ? diffSum / finished : 0,
    });
  }

  return {year, month, days, players};
}

/* Sestaví seznam zobrazitelných měsíců: měsíc se zobrazí, jen když celý jeho
   rozsah čísel Wordlů leží uvnitř dostupných dat (tj. je kompletní). Tím se
   automaticky vynechají oříznuté okrajové měsíce (neúplný začátek/konec). */
function buildMonths(rows){
  const nums = rows.map(r => r.num);
  const minNum = Math.min(...nums), maxNum = Math.max(...nums);

  const months = [];
  const seen = new Set();
  for(let n = minNum; n <= maxNum; n++){
    const d = numToDate(n);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const key = y + '-' + m;
    if(seen.has(key)) continue;
    seen.add(key);

    const first = dateToNum(new Date(Date.UTC(y, m - 1, 1)));
    const last  = first + daysInMonth(y, m) - 1;
    if(first >= minNum && last <= maxNum){
      const stats = computeMonth(rows, y, m);
      if(stats) months.push(stats);
    }
  }
  months.sort((a, b) => (a.year - b.year) || (a.month - b.month));
  return months;
}

/* ========================================================================= */

let MONTHS = [];
let idx = 0;              // index aktuálního měsíce v MONTHS
let PLAYERS = [];         // hráči aktuálního měsíce
let bestVal = {};         // nejlepší hodnota na sloupec (pro zvýraznění)

let sortKey = 'victories';
let sortDir = 'desc';

/* ---------- competition ranking helper ---------- */
function ranked(key, dir){
  const arr = [...PLAYERS].sort((a, b) => dir === 'high' ? b[key] - a[key] : a[key] - b[key]);
  let rank = 0, prev = null, i = 0;
  return arr.map(p => {
    i++;
    if(prev === null || p[key] !== prev){ rank = i; prev = p[key]; }
    return Object.assign({}, p, {_rank: rank});
  });
}
const badgeClass = r => 'badge ' + (r === 1 ? 'r1' : r === 2 ? 'r2' : r === 3 ? 'r3' : 'rx');

/* ---------- Hero board: Victories ---------- */
function heroBoard(){
  const el = document.getElementById('board-vic');
  const rows = ranked('victories', 'high');
  if(!rows.length){ el.innerHTML = ''; return; }
  const max = Math.max(...rows.map(r => r.victories));
  const lead = rows[0].victories;
  el.innerHTML = rows.map(r => {
    const pct = (max ? r.victories / max * 100 : 0).toFixed(1) + '%';
    const isLead = r.victories === lead;
    return `<li class="brow${isLead ? ' lead' : ''}">
      <span class="${badgeClass(r._rank)}">${r._rank}</span>
      <span class="pname">${r.name}</span>
      <span class="bar-track"><span class="bar-fill" style="--w:${pct}"></span></span>
      <span class="pval">${r.victories}${isLead ? '<span class="crown"> ★</span>' : ''}</span>
    </li>`;
  }).join('');
}

/* ---------- Mini boards ---------- */
function miniBoard(id, key, suffix){
  const el = document.getElementById(id);
  const rows = ranked(key, 'low');
  if(!rows.length){ el.innerHTML = ''; return; }
  const best = rows[0][key];
  el.innerHTML = rows.map(r => {
    const isLead = r[key] === best;
    return `<li class="mrow${isLead ? ' lead' : ''}">
      <span class="${badgeClass(r._rank)}">${r._rank}</span>
      <span class="pname">${r.name}</span>
      <span class="mval">${cz(r[key].toFixed(2))}${suffix}</span>
    </li>`;
  }).join('');
}

/* ---------- Vertical table: metriky = řádky, hráči = sloupce ---------- */
function sortedPlayers(){
  if(sortKey === 'name'){
    const r = [...PLAYERS].sort((a, b) => String(a.name).localeCompare(String(b.name), 'cs'));
    return sortDir === 'asc' ? r : r.reverse();
  }
  const r = [...PLAYERS].sort((a, b) => a[sortKey] - b[sortKey]);
  return sortDir === 'asc' ? r : r.reverse();
}

function renderTable(){
  const players = sortedPlayers();
  const nameArrow = sortKey === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : '▲';

  /* hlavička: rohová buňka (řadí podle jména) + jména hráčů */
  document.getElementById('thead-row').innerHTML =
    `<th class="corner" data-key="name" tabindex="0" role="columnheader"
         aria-sort="${sortKey === 'name' ? sortDir : 'none'}">
       <span class="lab">Hráč<span class="arrow">${sortKey === 'name' ? nameArrow : ''}</span></span>
     </th>` +
    players.map(p => `<th class="player">${p.name}</th>`).join('');

  /* tělo: jeden řádek na metriku */
  document.getElementById('tbody').innerHTML = COLS.map(c => {
    const isSort = c.key === sortKey;
    const arr = isSort ? (sortDir === 'asc' ? '▲' : '▼') : '▲';
    const cells = players.map(p => {
      const best = c.best && p[c.key] === bestVal[c.key] ? ' class="best"' : '';
      return `<td${best}>${fmt(p[c.key], c.type)}</td>`;
    }).join('');
    return `<tr aria-sort="${isSort ? sortDir : 'none'}">
      <th class="metric" data-key="${c.key}" tabindex="0" role="rowheader" scope="row">
        <span class="lab">${c.label}<span class="arrow">${arr}</span></span>
      </th>${cells}</tr>`;
  }).join('');

  /* posluchače řazení */
  document.querySelectorAll('#bigtable [data-key]').forEach(el => {
    const k = el.dataset.key;
    el.addEventListener('click', () => onSort(k));
    el.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); onSort(k); }
    });
  });
}

function onSort(key){
  if(key === sortKey){
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey = key;
    sortDir = key === 'name' ? 'asc' : 'desc';
  }
  renderTable();
}

/* ---------- Přepínání měsíců ---------- */
function setMonth(i){
  idx = i;
  const M = MONTHS[idx];
  PLAYERS = M.players;

  bestVal = {};
  COLS.forEach(c => {
    if(!c.best) return;
    const vals = PLAYERS.map(p => p[c.key]);
    bestVal[c.key] = c.best === 'high' ? Math.max(...vals) : Math.min(...vals);
  });

  const label = MONTH_NAMES[M.month - 1] + ' ' + M.year;
  document.getElementById('m-label').textContent = label;
  document.getElementById('foot-label').textContent = label;
  document.title = 'Wordle — výsledky · ' + label;
  document.getElementById('days-count').textContent = M.days;
  document.getElementById('m-prev').disabled = idx <= 0;
  document.getElementById('m-next').disabled = idx >= MONTHS.length - 1;

  heroBoard();
  miniBoard('board-avg', 'avg', '<small>pokusů</small>');
  miniBoard('board-diff', 'diff', '');
  renderTable();

  /* restart animace pruhů */
  document.body.classList.remove('is-on');
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('is-on')));
}

/* ---------- Dark mode ---------- */
function initDarkMode(){
  const root = document.documentElement;
  const btn  = document.getElementById('dm-toggle');
  const icon = document.getElementById('dm-icon');
  const lbl  = document.getElementById('dm-label');
  const mq   = window.matchMedia('(prefers-color-scheme: dark)');

  const saved = localStorage.getItem('dm');
  let isDark = saved === 'dark' || (saved === null && mq.matches);

  function paint(){
    icon.textContent = isDark ? '☼' : '☾';
    lbl.textContent  = isDark ? 'Světlý' : 'Tmavý';
    btn.setAttribute('aria-label', isDark ? 'Přepnout světlý režim' : 'Přepnout tmavý režim');
  }
  if(saved !== null){
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
  }
  paint();

  btn.addEventListener('click', () => {
    isDark = !isDark;
    localStorage.setItem('dm', isDark ? 'dark' : 'light');
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
    paint();
  });

  mq.addEventListener('change', e => {
    if(localStorage.getItem('dm') === null){ isDark = e.matches; paint(); }
  });
}

/* ---------- Start ---------- */
async function init(){
  initDarkMode();

  document.getElementById('m-prev').addEventListener('click', () => { if(idx > 0) setMonth(idx - 1); });
  document.getElementById('m-next').addEventListener('click', () => { if(idx < MONTHS.length - 1) setMonth(idx + 1); });

  try{
    const resp = await fetch('raw.csv', {cache: 'no-store'});
    if(!resp.ok) throw new Error('HTTP ' + resp.status);
    const rows = parseCsv(await resp.text());
    MONTHS = buildMonths(rows);
    if(!MONTHS.length) throw new Error('žádná kompletní data');

    document.getElementById('load-msg').style.display = 'none';
    document.getElementById('main').hidden = false;
    setMonth(MONTHS.length - 1);   // nejnovější měsíc
  } catch(err){
    document.getElementById('load-msg').textContent =
      'Nepodařilo se načíst data (raw.csv). ' + err.message;
  }
}

document.addEventListener('DOMContentLoaded', init);
