// ─── UTILS ────────────────────────────────────────────────────────────────────

// Simple CSV parser (handles quoted fields)
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines.shift().split(",").map(h => h.trim());
  return lines.map(line => {
    // match either "quoted,field,with,commas" OR any run of characters except comma or quote
    const cols = line
      .match(/(".*?"|[^",]+)(?=,|$)/g)
      .map(c => c.replace(/^"|"$/g, "").trim());
    const obj = {};
    headers.forEach((h,i) => obj[h] = cols[i] || "");
    return obj;
  });
}


// Robust parser for alltimerecords.csv (key → rest-of-line)
function parseRecords(raw) {
  const rec = {};
  raw
    .trim()
    .split("\n")
    .filter(line => line.trim())
    .forEach(line => {
      const parts = line.split(/,(.+)/);
      if (parts.length < 2) return;
      const key = parts[0].trim().toLowerCase();
      rec[key] = parts[1].trim();
    });
  return rec;
}

// Extract [name, year] pairs from Python-style lists
function extractPairs(str) {
  const re = /\['([^']+)',\s*(\d{4})\]/g;
  const arr = [];
  let m;
  while ((m = re.exec(str))) {
    arr.push([m[1], +m[2]]);
  }
  return arr;
}

// Tally years per player
function tallyYears(pairs) {
  const tally = {};
  pairs.forEach(([name, yr]) => {
    if (!tally[name]) tally[name] = [];
    tally[name].push(yr);
  });
  return Object.entries(tally).sort((a, b) => b[1].length - a[1].length);
}

// Render a top-3 list with tie-labels (T2., T3., etc)
function renderTopThree(arr, selector) {
  const container = document.querySelector(selector);
  container.innerHTML = "";
  const top3 = arr.slice(0, 3);
  const values = top3.map(e => e.value);
  const counts = values.reduce((acc, v) => {
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
  const uniqueVals = [...new Set(values)];
  const rankMap = uniqueVals.reduce((acc, v, i) => {
    acc[v] = i + 1;
    return acc;
  }, {});

  top3.forEach(entry => {
    const val = entry.value;
    const rank = rankMap[val];
    const label = counts[val] > 1 ? `T${rank}.` : `${rank}.`;
    const div = document.createElement("div");
    div.textContent = `${label} ${entry.name} — ${val}`;
    container.appendChild(div);
  });
}

// ─── CAREER STATS ───────────────────────────────────────────────────────────

let careerData = [];
let sortKey = "";   // empty so first sort sets desc
let sortDir = -1;   // -1 = desc, +1 = asc

function renderCareer() {
  const tbody = document.querySelector("#career-table tbody");
  tbody.innerHTML = "";
  careerData.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.player_name}</td>
      <td>${p.number_of_seasons}</td>
      <td>${p.average_finish}</td>
      <td>${p.record}</td>
      <td>${(p.career_win_percentage * 100).toFixed(2)}%</td>
      <td>${p.total_points_for}</td>
    `;
    tbody.appendChild(tr);
  });
}

function sortCareer(key) {
  if (sortKey === key) {
    sortDir = -sortDir;
  } else {
    sortKey = key;
    sortDir = -1;
  }
  document.querySelectorAll("#career-table th").forEach(th => {
    th.classList.remove("sorted-asc","sorted-desc");
    if (th.dataset.key === key) {
      th.classList.add(sortDir>0?"sorted-asc":"sorted-desc");
    }
  });
  careerData.sort((a,b)=>{
    if (key==="player_name") {
      return a.player_name.localeCompare(b.player_name)*sortDir;
    }
    return (parseFloat(a[key]) - parseFloat(b[key]))*sortDir;
  });
  renderCareer();
}

function initCareer() {
  fetch("career_stats.csv")
    .then(r=>r.text())
    .then(txt=>{
      careerData = parseCSV(txt).map(r=>{
        const [w] = r.career_record.split("-").map(n=>+n);
        return {
          ...r,
          wins: w,
          career_win_percentage: parseFloat(r.career_win_percentage),
          average_finish: parseFloat(r.average_finish),
          total_points_for: parseFloat(r.total_points_for),
          number_of_seasons: parseInt(r.number_of_seasons,10),
          record: r.career_record
        };
      });
      document.querySelectorAll("#career-table th").forEach(th=>{
        th.addEventListener("click", ()=>sortCareer(th.dataset.key));
      });
      sortCareer("wins"); // default desc by wins
    });
}

// ─── RECORD BOOK ─────────────────────────────────────────────────────────────

function initRecords() {
  Promise.all([
    fetch("career_stats.csv").then(r=>r.text()).then(parseCSV),
    fetch("alltimerecords.csv").then(r=>r.text())
  ]).then(([careerRows, allRaw])=>{
    const rec = parseRecords(allRaw);

    // Championships
    const champs = tallyYears(extractPairs(rec.championships));
    const cdiv = document.querySelector("#cell-champs .content");
    const counts = champs.map(([,yrs])=>yrs.length);
    const maxC = Math.max(...counts), minC = Math.min(...counts);
    champs.forEach(([name,yrs])=>{
      const cnt = yrs.length;
      let size = "1rem";
      if (maxC!==minC) {
        size = (1.2 - ((maxC-cnt)/(maxC-minC))*0.4).toFixed(2)+"rem";
      }
      const d = document.createElement("div");
      d.style.fontSize = size;
      d.textContent = `${name}: ${cnt} (${yrs.join(", ")})`;
      cdiv.appendChild(d);
    });

    // Most Wins (Career)
    const winsArr = careerRows
      .map(r=>({name:r.player_name, value:+r.career_record.split("-")[0]}))
      .sort((a,b)=>b.value-a.value);
    renderTopThree(winsArr, "#cell-mostwins-career .content");

    // Regular Season Champion
    const reg = tallyYears(extractPairs(rec.seasonswith_mostwins));
    const rdiv = document.querySelector("#cell-regseason .content");
    const rc = reg.map(([,yrs])=>yrs.length);
    const maxR = Math.max(...rc), minR = Math.min(...rc);
    reg.forEach(([name,yrs])=>{
      const cnt = yrs.length;
      let size = "1rem";
      if (maxR!==minR) {
        size = (1.2 - ((maxR-cnt)/(maxR-minR))*0.4).toFixed(2)+"rem";
      }
      const d = document.createElement("div");
      d.style.fontSize = size;
      d.textContent = `${name}: ${cnt} (${yrs.join(", ")})`;
      rdiv.appendChild(d);
    });

    // Most Points Scored (Career)
    const ptsArr = careerRows
      .map(r=>({name:r.player_name, value:+r.total_points_for}))
      .sort((a,b)=>b.value-a.value);
    renderTopThree(ptsArr, "#cell-points-career .content");

    // Best Avg. Finish
    const avgArr = careerRows
      .map(r=>({name:r.player_name, value:+r.average_finish}))
      .sort((a,b)=>a.value-b.value);
    renderTopThree(avgArr, "#cell-best-avg .content");

    // Most Wins (Single Season)
    const sdiv = document.querySelector("#cell-mostwins-single .content");
    sdiv.innerHTML = `<div>Record: 11 Wins</div>`;
    tallyYears(extractPairs(rec.most_singleseason_wins))
      .forEach(([name,yrs])=>{
        const d = document.createElement("div");
        d.textContent = `${name}: ${yrs.length} (${yrs.join(", ")})`;
        sdiv.appendChild(d);
      });

    // Longest Win Streak
    const ldiv = document.querySelector("#cell-longest-streak .content");
    ldiv.innerHTML = `<div>Record: 9 Wins</div>`;
    extractPairs(rec.longest_winstreak)
      .forEach(([name,yr])=>{
        const d = document.createElement("div");  
        d.textContent = `${name} — ${yr}`;
        ldiv.appendChild(d);
      });

    // Best Scoring Season
    const bdiv = document.querySelector("#cell-best-scoring .content");
    const bs = rec.bestscoringseason.split(",");
    const diff = (+bs[2] - +bs[3]).toFixed(2);
    bdiv.innerHTML = `
      <div>${bs[0]}, ${bs[1]}</div>
      <div>Points Scored: ${bs[2]}</div>
      <div>League Average: ${bs[3]}</div>
      <div>Differential: ${bs[4] || diff}</div>
    `;

    // Biggest Blowout (user’s own parsing logic)
    const bb = rec["biggest blowout"].split(",");
    const blow = document.querySelector("#cell-blowout .content");
    const wpts = +bb[2], lpts = +bb[5];
    blow.innerHTML = `
      <div>${bb[1]} def. ${bb[4]}</div>
      <div>${wpts} - ${lpts}</div>
      <div>Differential: ${(wpts-lpts).toFixed(2)}</div>
      <div>${bb[7]}</div>
    `;
  });
}

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────

document.getElementById("tab-career").addEventListener("click", () => {
  document.getElementById("career-section").hidden = false;
  document.getElementById("records-section").hidden = true;
  document.getElementById("tab-career").classList.add("active");
  document.getElementById("tab-records").classList.remove("active");
});
document.getElementById("tab-records").addEventListener("click", () => {
  document.getElementById("career-section").hidden = true;
  document.getElementById("records-section").hidden = false;
  document.getElementById("tab-records").classList.add("active");
  document.getElementById("tab-career").classList.remove("active");
});

// ─── INITIALIZE ──────────────────────────────────────────────────────────────

initCareer();
initRecords();
