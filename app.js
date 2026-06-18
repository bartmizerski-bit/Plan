// =========================================================================
//  Rozkład zajęć — APOL (PWA)
//  Logika: pobranie, filtrowanie, rysowanie na <canvas>, zapis/PNG.
// =========================================================================

const ENDPOINT = "https://wu.apol.edu.pl/wsrest/rest/phz/harmonogram/zajecia";
// Lista publicznych proxy CORS – aplikacja próbuje je po kolei jako fallback.
// Jeśli żaden nie zadziała, użytkownik dostaje URL do skopiowania (zawsze działa).
const PROXY_LISTA = [
  (u) => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u) => "https://cors.lol/?url=" + encodeURIComponent(u),
];

// Komplet grup Twojego rocznika (Kryminologia 2024II)
const GROUP_IDS = [
  20681,20683,20679,20675,20677,20673,21755,21756,21759,21769,21974,21977,
  23108,23110,23106,23114,23112,18283,18285,18284,18286,18287,18289,19283,
  19418,21134,20518,21135,20802,19287,19285,19279,20513,19277,17312,17313,
  17317,17314,17316,17315,16699,17678,18555,18552,18564,18559,18702,19981,
  22398,16700,16701,17679,18553,17680,18554,18556,18557,18563,18566,18565,
  18560,18561,18703,18704,19982,19983,21206,21208,22396,22397,16698,17677,
  18562,18558,18701,19980,21210,22395,23065,
];

const DNI_PL = ["poniedziałek","wtorek","środa","czwartek","piątek","sobota","niedziela"];

// ----------------------------- UI bootstrap -------------------------------
const $ = (id) => document.getElementById(id);
const dzis = new Date();
const za7 = new Date(dzis.getTime() + 6*24*3600*1000);
$("d-od").value = dzis.toISOString().slice(0,10);
$("d-do").value = za7.toISOString().slice(0,10);

$("zrodlo").addEventListener("change", () => {
  $("paste-card").style.display = $("zrodlo").value === "paste" ? "" : "none";
  if ($("zrodlo").value === "paste") $("url-out").value = budujUrl($("d-od").value, $("d-do").value);
});

$("gen").addEventListener("click", generuj);
$("paste-go").addEventListener("click", () => {
  try {
    const surowe = JSON.parse($("paste").value);
    const lista = surowe.result || surowe;
    if (!Array.isArray(lista)) throw new Error("Oczekiwano tablicy „result”.");
    pokaz(lista);
  } catch (e) { ustaw_blad("Nie udało się odczytać JSON: " + e.message); }
});

$("url-open").addEventListener("click", () => {
  const u = $("url-out").value || budujUrl($("d-od").value, $("d-do").value);
  $("url-out").value = u;
  window.open(u, "_blank", "noopener");
});

$("url-copy").addEventListener("click", async () => {
  const u = $("url-out").value || budujUrl($("d-od").value, $("d-do").value);
  $("url-out").value = u;
  try {
    await navigator.clipboard.writeText(u);
    ustaw_status("URL skopiowany do schowka.");
  } catch {
    $("url-out").select();
    ustaw_status("Zaznacz tekst URL i skopiuj ręcznie (Ctrl/Cmd+C).");
  }
});

$("paste-from-clip").addEventListener("click", async () => {
  try {
    const txt = await navigator.clipboard.readText();
    if (!txt) return ustaw_blad("Schowek jest pusty.");
    $("paste").value = txt;
    ustaw_status("Wklejono. Kliknij „Użyj JSON”.");
  } catch (e) {
    ustaw_blad("Przeglądarka nie pozwoliła odczytać schowka. Wklej ręcznie: przytrzymaj palec w polu poniżej → „Wklej”.");
  }
});

$("save").addEventListener("click", zapiszPNG);
$("share").addEventListener("click", udostepnij);

// ----------------------------- pobieranie ---------------------------------
function budujUrl(dataOd, dataDo) {
  const p = new URLSearchParams();
  p.set("_dc", Date.now().toString());
  GROUP_IDS.forEach(g => p.append("idGrupa", g));
  p.set("idNauczyciel","0");
  p.set("idJednostkaPanelJednostka","0");
  p.set("dataOd", dataOd + "T00:00:00");
  p.set("dataDo", dataDo + "T00:00:00");
  p.set("widok","STUDENT");
  p.set("authUzytkownikId","0");
  p.set("page","1");
  p.set("start","0");
  p.set("limit","2000");
  return ENDPOINT + "?" + p.toString();
}

async function pobierz(url) {
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j && j.success === false) throw new Error("API: " + (j.operationMessageList || "błąd"));
  return j.result || [];
}

async function generuj() {
  const dOd = $("d-od").value, dDo = $("d-do").value;
  if (!dOd || !dDo) return ustaw_blad("Podaj obie daty.");
  if (dDo < dOd)    return ustaw_blad("„Data do” jest wcześniejsza niż „Data od”.");

  const zrodlo = $("zrodlo").value;
  if (zrodlo === "paste") {
    $("url-out").value = budujUrl(dOd, dDo);
    $("paste-card").style.display = "";
    $("paste-card").scrollIntoView({ behavior: "smooth", block: "start" });
    ustaw_status("Stuknij „Otwórz w nowej karcie”, skopiuj odpowiedź i wróć tu.");
    return;
  }

  $("gen").disabled = true;
  const url = budujUrl(dOd, dDo);
  let dane = null, bledy = [];

  if (zrodlo === "direct" || zrodlo === "auto") {
    ustaw_status("Pobieranie z uczelni…");
    try { dane = await pobierz(url); }
    catch (e) { bledy.push("bezpośrednio: " + e.message); }
  }
  if (!dane && (zrodlo === "proxy" || zrodlo === "auto")) {
    for (let i = 0; i < PROXY_LISTA.length && !dane; i++) {
      ustaw_status(`Próba przez proxy ${i+1}/${PROXY_LISTA.length}…`);
      try { dane = await pobierz(PROXY_LISTA[i](url)); }
      catch (e) { bledy.push(`proxy ${i+1}: ` + e.message); }
    }
  }

  $("gen").disabled = false;
  if (!dane) {
    // Automatyczne przejście do trybu „wklej JSON” – zawsze działa.
    $("zrodlo").value = "paste";
    $("paste-card").style.display = "";
    $("url-out").value = url;
    ustaw_blad(
      "Bezpośrednio i przez proxy się nie udało:\n" + bledy.join("\n") +
      "\n\nPrzełączyłem na tryb „Wklej JSON” — kliknij „Otwórz URL w nowej karcie” poniżej."
    );
    return;
  }
  pokaz(dane);
}

// ----------------------------- filtrowanie --------------------------------
function czyZostawic(ev, grupaCw, semKlucz) {
  const typ = ev.typPrzedmiotu || "";
  const grupa = (ev.grupa || "").trim();
  const dyd = ev.dydaktyk || "";
  const przed = ev.przedmiot || "";

  if (grupa.startsWith("SD_") || przed.includes("Seminarium")) {
    const k = (semKlucz || "").trim().toLowerCase();
    return !!k && (grupa.toLowerCase().includes(k) || dyd.toLowerCase().includes(k));
  }
  if (typ.startsWith("Wykład")) return true;
  return grupa === grupaCw.trim();
}

function filtruj(lista, grupaCw, semKlucz) {
  const w = lista.filter(e => czyZostawic(e, grupaCw, semKlucz));
  w.sort((a,b) => (a.dataZajec+a.godzinaOd).localeCompare(b.dataZajec+b.godzinaOd));
  return w;
}

// ----------------------------- prezentacja --------------------------------
let _img = null;     // Blob ostatniego PNG (do share/save)
let _nazwa = "rozklad.png";

function pokaz(surowe) {
  const wy = filtruj(surowe, $("grupa").value, $("sem").value);
  const tytul =
    "Rozkład zajęć  " + $("grupa").value + "  (" +
    fmtPL($("d-od").value) + " – " + fmtPL($("d-do").value) + ")";
  _nazwa = "rozklad_" + $("d-od").value + ".png";

  rysuj(wy, tytul);
  $("wynik-card").style.display = "";
  ustaw_status("Pobrano " + surowe.length + " zajęć rocznika; po odfiltrowaniu: " + wy.length + ".");
}

function fmtPL(iso) { const [y,m,d] = iso.split("-"); return d+"."+m+"."+y; }

// ----------------------------- rysowanie ----------------------------------
const KOL = {
  wyk: { obw:"#2563eb", wyp:"#dbeafe" },
  cw:  { obw:"#16a34a", wyp:"#dcfce7" },
  sem: { obw:"#9333ea", wyp:"#f3e8ff" },
};
const NAZWA_KAT = { wyk:"Wykład", cw:"Ćwiczenia", sem:"Seminarium" };

function kategoria(e) {
  if ((e.przedmiot||"").includes("Seminarium")) return "sem";
  if ((e.typPrzedmiotu||"").startsWith("Wykład")) return "wyk";
  return "cw";
}

function minOdPolnocy(hhmm) { const [h,m]=hhmm.split(":"); return +h*60+ +m; }

function rozlozPasy(events) {
  events.sort((a,b)=>minOdPolnocy(a.godzinaOd)-minOdPolnocy(b.godzinaOd));
  const pasy = []; const przyd = new Map();
  for (const e of events) {
    const s = minOdPolnocy(e.godzinaOd), k = minOdPolnocy(e.godzinaDo);
    let ok = false;
    for (let i=0;i<pasy.length;i++) if (s>=pasy[i]) { pasy[i]=k; przyd.set(e,i); ok=true; break; }
    if (!ok) { pasy.push(k); przyd.set(e, pasy.length-1); }
  }
  return { przyd, n: Math.max(1, pasy.length) };
}

// zawijanie z twardym podziałem zbyt długiego pojedynczego słowa
function zawijaj(ctx, tekst, maxW) {
  const linie = []; let biez = "";
  for (let w of tekst.split(/\s+/).filter(Boolean)) {
    while (ctx.measureText(w).width > maxW && w.length > 1) {
      let i = w.length;
      while (i>1 && ctx.measureText(w.slice(0,i)).width > maxW) i--;
      if (biez) { linie.push(biez); biez = ""; }
      linie.push(w.slice(0,i));
      w = w.slice(i);
    }
    const prob = (biez ? biez + " " : "") + w;
    if (ctx.measureText(prob).width <= maxW) biez = prob;
    else { if (biez) linie.push(biez); biez = w; }
  }
  if (biez) linie.push(biez);
  return linie;
}

function ukladTytulu(ctx, tekst, maxW, dostH) {
  const rozmiary = [13, 12, 11, 10];
  for (const r of rozmiary) {
    ctx.font = "bold " + r + "px system-ui, Arial, sans-serif";
    const lh = r + 3;
    if (dostH < lh) break;
    const linie = zawijaj(ctx, tekst, maxW);
    if (linie.length * lh <= dostH) return { font: ctx.font, lh, linie, ellip:false };
  }
  const r = 10;
  ctx.font = "bold " + r + "px system-ui, Arial, sans-serif";
  const lh = r + 3;
  const maks = Math.floor(dostH / lh);
  if (maks < 1) return { font: ctx.font, lh, linie:[], ellip:true };
  const linie = zawijaj(ctx, tekst, maxW).slice(0, maks);
  let ost = linie[linie.length-1] || "";
  while (ost && ctx.measureText(ost + "…").width > maxW) ost = ost.slice(0,-1).trimEnd();
  linie[linie.length-1] = ost ? ost + "…" : "…";
  return { font: ctx.font, lh, linie, ellip:true };
}

function skrocLinie(ctx, tekst, maxW) {
  if (ctx.measureText(tekst).width <= maxW) return tekst;
  while (tekst && ctx.measureText(tekst + "…").width > maxW) tekst = tekst.slice(0,-1);
  return (tekst.trimEnd() || "") + "…";
}

function rysuj(zajecia, tytul) {
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  const DPR = Math.min(window.devicePixelRatio || 1, 3);

  if (!zajecia.length) {
    cv.width = 800*DPR; cv.height = 200*DPR;
    cv.style.width = "800px"; cv.style.height = "200px";
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,800,200);
    ctx.fillStyle = "#111827"; ctx.font = "20px system-ui, Arial";
    ctx.fillText("Brak zajęć w wybranym zakresie dat.", 24, 100);
    _img = null;
    return;
  }

  const dni = [...new Set(zajecia.map(e=>e.dataZajec))].sort();
  const minS = Math.min(...zajecia.map(e=>minOdPolnocy(e.godzinaOd)));
  const maxK = Math.max(...zajecia.map(e=>minOdPolnocy(e.godzinaDo)));
  const startH = Math.floor(minS/60)*60;
  const koncH  = Math.ceil(maxK/60)*60;

  const PX_MIN = 1.5, LEWY = 70, GORA = 96, KOL_W = 300, PAD = 6;
  const LH_G = 15, BADGE_H = 18, POLE_H = 14;
  const gridH = (koncH - startH) * PX_MIN;

  // szerokość obrazu = max(siatka, tytuł)
  ctx.font = "bold 24px system-ui, Arial";
  const tytulW = Math.ceil(ctx.measureText(tytul).width) + 2*(PAD+4);
  const W = Math.max(LEWY + KOL_W*dni.length + PAD, tytulW);

  function yOf(m) { return GORA + (m - startH) * PX_MIN; }

  // 1) geometria kafelków
  const kafelki = [];
  for (let i=0;i<dni.length;i++) {
    const dzien = dni[i];
    const ev = zajecia.filter(e=>e.dataZajec===dzien);
    const { przyd, n } = rozlozPasy(ev);
    const kolX = LEWY + i*KOL_W;
    const szerPas = (KOL_W - 6) / n;
    for (const e of ev) {
      const k = kategoria(e), c = KOL[k];
      const pas = przyd.get(e);
      const x0 = kolX + 3 + pas * szerPas;
      const x1 = x0 + szerPas - 3;
      const y0 = yOf(minOdPolnocy(e.godzinaOd)) + 1;
      const y1 = yOf(minOdPolnocy(e.godzinaDo)) - 1;
      const status = (e.status || "").toLowerCase();
      const sala = (e.nazwaSali || "").trim();
      const sala_txt = sala && !sala.toLowerCase().includes("brak") ? "sala " + sala : null;
      const nazwa = (e.przedmiot||"").replace(" - Ćwiczenia","").replace(" - Wykład","").trim();
      const innerX = x0 + 9, innerW = (x1 - innerX) - 6;
      kafelki.push({
        e, x0,x1,y0,y1, obw:c.obw, wyp:c.wyp,
        nieodbyte: status.includes("nieodbyt"),
        zastepstwo: status.includes("zastęp") || status.includes("zastep"),
        nazwa, dyd: (e.dydaktyk||"").trim(), sala_txt, innerX, innerW,
      });
    }
  }

  // 2) pre-pass: dopasowanie nazwy + zebranie przypisów
  const przypisy = [];
  for (const k of kafelki) {
    let top = k.y0 + 5 + LH_G;
    if (k.zastepstwo || k.nieodbyte) top += BADGE_H;
    const nDol = (k.dyd?1:0) + (k.sala_txt?1:0);
    k.title_top = top;
    k.dol_start = (k.y1 - 4) - nDol*POLE_H;
    const u = ukladTytulu(ctx, k.nazwa, k.innerW, k.dol_start - top);
    k.tFont = u.font; k.lh = u.lh; k.linie = u.linie; k.ellip = u.ellip;
    if (u.ellip) { przypisy.push(k.nazwa); k.przypis = przypisy.length; } else k.przypis = null;
  }

  // 3) wysokość stopki
  ctx.font = "11px system-ui, Arial";
  const LEGENDA_H = 44, lhFn = 15;
  const przypisyLinie = [];
  for (let i=0;i<przypisy.length;i++)
    przypisyLinie.push(...zawijaj(ctx, (i+1)+". "+przypisy[i], W - 2*(PAD+4)));
  const przypisyH = przypisy.length ? (24 + przypisyLinie.length*lhFn) : 0;
  const H = GORA + gridH + LEGENDA_H + przypisyH;

  // 4) skala HiDPI
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  cv.style.width = W + "px"; cv.style.height = H + "px";
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fff"; ctx.fillRect(0,0,W,H);

  // tytuł
  ctx.font = "bold 24px system-ui, Arial";
  ctx.fillStyle = "#111827";
  ctx.fillText(tytul, PAD+4, 14);

  // siatka godzin
  for (let m=startH; m<=koncH; m+=60) {
    const y = yOf(m);
    ctx.strokeStyle = "#e5e7eb"; ctx.beginPath(); ctx.moveTo(LEWY,y); ctx.lineTo(W-PAD,y); ctx.stroke();
    ctx.fillStyle = "#6b7280"; ctx.font = "13px system-ui, Arial";
    ctx.fillText(String(Math.floor(m/60)).padStart(2,"0")+":00", 8, y-7);
  }
  for (let m=startH+30; m<koncH; m+=60) {
    const y = yOf(m);
    ctx.strokeStyle = "#f3f4f6"; ctx.beginPath(); ctx.moveTo(LEWY,y); ctx.lineTo(W-PAD,y); ctx.stroke();
  }

  // nagłówki dni + pionowe linie
  ctx.font = "bold 16px system-ui, Arial"; ctx.fillStyle = "#1f2937";
  for (let i=0;i<dni.length;i++) {
    const x = LEWY + i*KOL_W;
    ctx.strokeStyle = "#d1d5db"; ctx.beginPath(); ctx.moveTo(x,GORA); ctx.lineTo(x,GORA+gridH); ctx.stroke();
    const dt = new Date(dni[i]+"T00:00:00");
    const dz = DNI_PL[(dt.getDay()+6)%7];
    const et = dz + "  " + String(dt.getDate()).padStart(2,"0") + "." + String(dt.getMonth()+1).padStart(2,"0");
    ctx.fillText(et, x+10, GORA-26);
  }
  ctx.strokeStyle = "#d1d5db"; ctx.beginPath(); ctx.moveTo(W-PAD,GORA); ctx.lineTo(W-PAD,GORA+gridH); ctx.stroke();

  // 5) kafelki
  for (const k of kafelki) {
    const fill = k.nieodbyte ? "#f3f4f6" : k.wyp;
    rrect(ctx, k.x0, k.y0, k.x1-k.x0, k.y1-k.y0, 6); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = k.obw; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = k.obw; ctx.fillRect(k.x0, k.y0, 4, k.y1-k.y0);

    let cur = k.y0 + 5;
    ctx.font = "11px system-ui, Arial"; ctx.fillStyle = "#374151";
    ctx.fillText(k.e.godzinaOd + "–" + k.e.godzinaDo, k.innerX, cur);
    cur += LH_G;

    if (k.zastepstwo || k.nieodbyte) {
      const txt = k.zastepstwo ? "ZASTĘPSTWO" : "ODWOŁANE";
      const bcol = k.zastepstwo ? "#ea580c" : "#dc2626";
      ctx.font = "11px system-ui, Arial";
      const tw = ctx.measureText(txt).width;
      rrect(ctx, k.innerX, cur, tw+8, 15, 4); ctx.fillStyle = bcol; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(txt, k.innerX+4, cur+2);
    }

    // tytuł (z pre-passu)
    ctx.font = k.tFont; ctx.fillStyle = "#111827";
    let ty = k.title_top;
    for (const ln of k.linie) { ctx.fillText(ln, k.innerX, ty); ty += k.lh; }

    if (k.przypis) {
      ctx.font = "bold 11px system-ui, Arial"; ctx.fillStyle = k.obw;
      const t = "["+k.przypis+"]";
      const mw = ctx.measureText(t).width;
      ctx.fillText(t, k.x1 - mw - 6, k.y0 + 4);
    }

    // prowadzący + sala (zakotwiczone u dołu)
    let fy = k.dol_start;
    ctx.font = "12px system-ui, Arial";
    if (k.dyd)      { ctx.fillStyle = "#4b5563"; ctx.fillText(skrocLinie(ctx, k.dyd, k.innerW), k.innerX, fy); fy += POLE_H; }
    if (k.sala_txt) { ctx.fillStyle = "#6b7280"; ctx.fillText(skrocLinie(ctx, k.sala_txt, k.innerW), k.innerX, fy); }
  }

  // 6) legenda
  let ly = GORA + gridH + 22, lx = PAD + 4;
  ctx.font = "bold 13px system-ui, Arial"; ctx.fillStyle = "#1f2937";
  ctx.fillText("Legenda:", lx, ly - 16);
  ctx.font = "13px system-ui, Arial";
  for (const kat of ["wyk","cw","sem"]) {
    const c = KOL[kat];
    rrect(ctx, lx, ly, 22, 16, 4); ctx.fillStyle = c.wyp; ctx.fill();
    ctx.strokeStyle = c.obw; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#374151"; ctx.fillText(NAZWA_KAT[kat], lx+30, ly);
    lx += 30 + Math.ceil(ctx.measureText(NAZWA_KAT[kat]).width) + 28;
  }
  ctx.font = "11px system-ui, Arial"; ctx.fillStyle = "#6b7280";
  ctx.fillText("pomarańcz. = zastępstwo   ·   czerwony/szary = odwołane", lx, ly);

  // 7) przypisy
  if (przypisy.length) {
    let py = GORA + gridH + LEGENDA_H;
    ctx.strokeStyle = "#e5e7eb"; ctx.beginPath(); ctx.moveTo(PAD+4,py); ctx.lineTo(W-PAD-4,py); ctx.stroke();
    py += 6;
    ctx.font = "bold 12px system-ui, Arial"; ctx.fillStyle = "#1f2937";
    ctx.fillText("Pełne nazwy skróconych przedmiotów:", PAD+4, py);
    py += 18;
    ctx.font = "11px system-ui, Arial"; ctx.fillStyle = "#4b5563";
    for (const ln of przypisyLinie) { ctx.fillText(ln, PAD+4, py); py += lhFn; }
  }

  cv.toBlob((b) => { _img = b; }, "image/png");
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
}

// ----------------------------- akcje plików -------------------------------
function zapiszPNG() {
  if (!_img) return;
  const url = URL.createObjectURL(_img);
  const a = document.createElement("a");
  a.href = url; a.download = _nazwa;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

async function udostepnij() {
  if (!_img) return;
  const f = new File([_img], _nazwa, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files:[f] })) {
    try { await navigator.share({ files:[f], title: "Rozkład zajęć" }); }
    catch (_) {}
  } else {
    zapiszPNG();
  }
}

// ----------------------------- pomocnicze ---------------------------------
function ustaw_status(t)  { const s = $("status"); s.className = "status";     s.textContent = t; }
function ustaw_blad(t)    { const s = $("status"); s.className = "status err"; s.textContent = t; }
    const surowe = JSON.parse($("paste").value);
    const lista = surowe.result || surowe;
    if (!Array.isArray(lista)) throw new Error("Oczekiwano tablicy „result”.");
    pokaz(lista);
  } catch (e) { ustaw_blad("Nie udało się odczytać JSON: " + e.message); }
});

$("save").addEventListener("click", zapiszPNG);
$("share").addEventListener("click", udostepnij);

// ----------------------------- pobieranie ---------------------------------
function budujUrl(dataOd, dataDo) {
  const p = new URLSearchParams();
  p.set("_dc", Date.now().toString());
  GROUP_IDS.forEach(g => p.append("idGrupa", g));
  p.set("idNauczyciel","0");
  p.set("idJednostkaPanelJednostka","0");
  p.set("dataOd", dataOd + "T00:00:00");
  p.set("dataDo", dataDo + "T00:00:00");
  p.set("widok","STUDENT");
  p.set("authUzytkownikId","0");
  p.set("page","1");
  p.set("start","0");
  p.set("limit","2000");
  return ENDPOINT + "?" + p.toString();
}

async function pobierz(url) {
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  if (j && j.success === false) throw new Error("API: " + (j.operationMessageList || "błąd"));
  return j.result || [];
}

async function generuj() {
  const dOd = $("d-od").value, dDo = $("d-do").value;
  if (!dOd || !dDo) return ustaw_blad("Podaj obie daty.");
  if (dDo < dOd)    return ustaw_blad("„Data do” jest wcześniejsza niż „Data od”.");

  const zrodlo = $("zrodlo").value;
  if (zrodlo === "paste") {
    $("url-out").value = budujUrl(dOd, dDo);
    $("paste-card").style.display = "";
    ustaw_status("Skopiuj URL, otwórz w przeglądarce, skopiuj odpowiedź i wklej powyżej.");
    return;
  }

  $("gen").disabled = true;
  const url = budujUrl(dOd, dDo);
  let dane = null, ostatniBlad = null;

  if (zrodlo === "direct" || zrodlo === "auto") {
    ustaw_status("Pobieranie z uczelni…");
    try { dane = await pobierz(url); }
    catch (e) { ostatniBlad = e; }
  }
  if (!dane && (zrodlo === "proxy" || zrodlo === "auto")) {
    ustaw_status("Bezpośrednie pobranie nie powiodło się — próba przez proxy…");
    try { dane = await pobierz(PROXY + encodeURIComponent(url)); }
    catch (e) { ostatniBlad = e; }
  }

  $("gen").disabled = false;
  if (!dane) {
    return ustaw_blad(
      "Nie udało się pobrać danych: " + (ostatniBlad ? ostatniBlad.message : "nieznany błąd") +
      "\nSpróbuj zmienić źródło danych w „Ustawieniach”."
    );
  }
  pokaz(dane);
}

// ----------------------------- filtrowanie --------------------------------
function czyZostawic(ev, grupaCw, semKlucz) {
  const typ = ev.typPrzedmiotu || "";
  const grupa = (ev.grupa || "").trim();
  const dyd = ev.dydaktyk || "";
  const przed = ev.przedmiot || "";

  if (grupa.startsWith("SD_") || przed.includes("Seminarium")) {
    const k = (semKlucz || "").trim().toLowerCase();
    return !!k && (grupa.toLowerCase().includes(k) || dyd.toLowerCase().includes(k));
  }
  if (typ.startsWith("Wykład")) return true;
  return grupa === grupaCw.trim();
}

function filtruj(lista, grupaCw, semKlucz) {
  const w = lista.filter(e => czyZostawic(e, grupaCw, semKlucz));
  w.sort((a,b) => (a.dataZajec+a.godzinaOd).localeCompare(b.dataZajec+b.godzinaOd));
  return w;
}

// ----------------------------- prezentacja --------------------------------
let _img = null;     // Blob ostatniego PNG (do share/save)
let _nazwa = "rozklad.png";

function pokaz(surowe) {
  const wy = filtruj(surowe, $("grupa").value, $("sem").value);
  const tytul =
    "Rozkład zajęć  " + $("grupa").value + "  (" +
    fmtPL($("d-od").value) + " – " + fmtPL($("d-do").value) + ")";
  _nazwa = "rozklad_" + $("d-od").value + ".png";

  rysuj(wy, tytul);
  $("wynik-card").style.display = "";
  ustaw_status("Pobrano " + surowe.length + " zajęć rocznika; po odfiltrowaniu: " + wy.length + ".");
}

function fmtPL(iso) { const [y,m,d] = iso.split("-"); return d+"."+m+"."+y; }

// ----------------------------- rysowanie ----------------------------------
const KOL = {
  wyk: { obw:"#2563eb", wyp:"#dbeafe" },
  cw:  { obw:"#16a34a", wyp:"#dcfce7" },
  sem: { obw:"#9333ea", wyp:"#f3e8ff" },
};
const NAZWA_KAT = { wyk:"Wykład", cw:"Ćwiczenia", sem:"Seminarium" };

function kategoria(e) {
  if ((e.przedmiot||"").includes("Seminarium")) return "sem";
  if ((e.typPrzedmiotu||"").startsWith("Wykład")) return "wyk";
  return "cw";
}

function minOdPolnocy(hhmm) { const [h,m]=hhmm.split(":"); return +h*60+ +m; }

function rozlozPasy(events) {
  events.sort((a,b)=>minOdPolnocy(a.godzinaOd)-minOdPolnocy(b.godzinaOd));
  const pasy = []; const przyd = new Map();
  for (const e of events) {
    const s = minOdPolnocy(e.godzinaOd), k = minOdPolnocy(e.godzinaDo);
    let ok = false;
    for (let i=0;i<pasy.length;i++) if (s>=pasy[i]) { pasy[i]=k; przyd.set(e,i); ok=true; break; }
    if (!ok) { pasy.push(k); przyd.set(e, pasy.length-1); }
  }
  return { przyd, n: Math.max(1, pasy.length) };
}

// zawijanie z twardym podziałem zbyt długiego pojedynczego słowa
function zawijaj(ctx, tekst, maxW) {
  const linie = []; let biez = "";
  for (let w of tekst.split(/\s+/).filter(Boolean)) {
    while (ctx.measureText(w).width > maxW && w.length > 1) {
      let i = w.length;
      while (i>1 && ctx.measureText(w.slice(0,i)).width > maxW) i--;
      if (biez) { linie.push(biez); biez = ""; }
      linie.push(w.slice(0,i));
      w = w.slice(i);
    }
    const prob = (biez ? biez + " " : "") + w;
    if (ctx.measureText(prob).width <= maxW) biez = prob;
    else { if (biez) linie.push(biez); biez = w; }
  }
  if (biez) linie.push(biez);
  return linie;
}

function ukladTytulu(ctx, tekst, maxW, dostH) {
  const rozmiary = [13, 12, 11, 10];
  for (const r of rozmiary) {
    ctx.font = "bold " + r + "px system-ui, Arial, sans-serif";
    const lh = r + 3;
    if (dostH < lh) break;
    const linie = zawijaj(ctx, tekst, maxW);
    if (linie.length * lh <= dostH) return { font: ctx.font, lh, linie, ellip:false };
  }
  const r = 10;
  ctx.font = "bold " + r + "px system-ui, Arial, sans-serif";
  const lh = r + 3;
  const maks = Math.floor(dostH / lh);
  if (maks < 1) return { font: ctx.font, lh, linie:[], ellip:true };
  const linie = zawijaj(ctx, tekst, maxW).slice(0, maks);
  let ost = linie[linie.length-1] || "";
  while (ost && ctx.measureText(ost + "…").width > maxW) ost = ost.slice(0,-1).trimEnd();
  linie[linie.length-1] = ost ? ost + "…" : "…";
  return { font: ctx.font, lh, linie, ellip:true };
}

function skrocLinie(ctx, tekst, maxW) {
  if (ctx.measureText(tekst).width <= maxW) return tekst;
  while (tekst && ctx.measureText(tekst + "…").width > maxW) tekst = tekst.slice(0,-1);
  return (tekst.trimEnd() || "") + "…";
}

function rysuj(zajecia, tytul) {
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  const DPR = Math.min(window.devicePixelRatio || 1, 3);

  if (!zajecia.length) {
    cv.width = 800*DPR; cv.height = 200*DPR;
    cv.style.width = "800px"; cv.style.height = "200px";
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,800,200);
    ctx.fillStyle = "#111827"; ctx.font = "20px system-ui, Arial";
    ctx.fillText("Brak zajęć w wybranym zakresie dat.", 24, 100);
    _img = null;
    return;
  }

  const dni = [...new Set(zajecia.map(e=>e.dataZajec))].sort();
  const minS = Math.min(...zajecia.map(e=>minOdPolnocy(e.godzinaOd)));
  const maxK = Math.max(...zajecia.map(e=>minOdPolnocy(e.godzinaDo)));
  const startH = Math.floor(minS/60)*60;
  const koncH  = Math.ceil(maxK/60)*60;

  const PX_MIN = 1.5, LEWY = 70, GORA = 96, KOL_W = 300, PAD = 6;
  const LH_G = 15, BADGE_H = 18, POLE_H = 14;
  const gridH = (koncH - startH) * PX_MIN;

  // szerokość obrazu = max(siatka, tytuł)
  ctx.font = "bold 24px system-ui, Arial";
  const tytulW = Math.ceil(ctx.measureText(tytul).width) + 2*(PAD+4);
  const W = Math.max(LEWY + KOL_W*dni.length + PAD, tytulW);

  function yOf(m) { return GORA + (m - startH) * PX_MIN; }

  // 1) geometria kafelków
  const kafelki = [];
  for (let i=0;i<dni.length;i++) {
    const dzien = dni[i];
    const ev = zajecia.filter(e=>e.dataZajec===dzien);
    const { przyd, n } = rozlozPasy(ev);
    const kolX = LEWY + i*KOL_W;
    const szerPas = (KOL_W - 6) / n;
    for (const e of ev) {
      const k = kategoria(e), c = KOL[k];
      const pas = przyd.get(e);
      const x0 = kolX + 3 + pas * szerPas;
      const x1 = x0 + szerPas - 3;
      const y0 = yOf(minOdPolnocy(e.godzinaOd)) + 1;
      const y1 = yOf(minOdPolnocy(e.godzinaDo)) - 1;
      const status = (e.status || "").toLowerCase();
      const sala = (e.nazwaSali || "").trim();
      const sala_txt = sala && !sala.toLowerCase().includes("brak") ? "sala " + sala : null;
      const nazwa = (e.przedmiot||"").replace(" - Ćwiczenia","").replace(" - Wykład","").trim();
      const innerX = x0 + 9, innerW = (x1 - innerX) - 6;
      kafelki.push({
        e, x0,x1,y0,y1, obw:c.obw, wyp:c.wyp,
        nieodbyte: status.includes("nieodbyt"),
        zastepstwo: status.includes("zastęp") || status.includes("zastep"),
        nazwa, dyd: (e.dydaktyk||"").trim(), sala_txt, innerX, innerW,
      });
    }
  }

  // 2) pre-pass: dopasowanie nazwy + zebranie przypisów
  const przypisy = [];
  for (const k of kafelki) {
    let top = k.y0 + 5 + LH_G;
    if (k.zastepstwo || k.nieodbyte) top += BADGE_H;
    const nDol = (k.dyd?1:0) + (k.sala_txt?1:0);
    k.title_top = top;
    k.dol_start = (k.y1 - 4) - nDol*POLE_H;
    const u = ukladTytulu(ctx, k.nazwa, k.innerW, k.dol_start - top);
    k.tFont = u.font; k.lh = u.lh; k.linie = u.linie; k.ellip = u.ellip;
    if (u.ellip) { przypisy.push(k.nazwa); k.przypis = przypisy.length; } else k.przypis = null;
  }

  // 3) wysokość stopki
  ctx.font = "11px system-ui, Arial";
  const LEGENDA_H = 44, lhFn = 15;
  const przypisyLinie = [];
  for (let i=0;i<przypisy.length;i++)
    przypisyLinie.push(...zawijaj(ctx, (i+1)+". "+przypisy[i], W - 2*(PAD+4)));
  const przypisyH = przypisy.length ? (24 + przypisyLinie.length*lhFn) : 0;
  const H = GORA + gridH + LEGENDA_H + przypisyH;

  // 4) skala HiDPI
  cv.width = Math.round(W*DPR); cv.height = Math.round(H*DPR);
  cv.style.width = W + "px"; cv.style.height = H + "px";
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fff"; ctx.fillRect(0,0,W,H);

  // tytuł
  ctx.font = "bold 24px system-ui, Arial";
  ctx.fillStyle = "#111827";
  ctx.fillText(tytul, PAD+4, 14);

  // siatka godzin
  for (let m=startH; m<=koncH; m+=60) {
    const y = yOf(m);
    ctx.strokeStyle = "#e5e7eb"; ctx.beginPath(); ctx.moveTo(LEWY,y); ctx.lineTo(W-PAD,y); ctx.stroke();
    ctx.fillStyle = "#6b7280"; ctx.font = "13px system-ui, Arial";
    ctx.fillText(String(Math.floor(m/60)).padStart(2,"0")+":00", 8, y-7);
  }
  for (let m=startH+30; m<koncH; m+=60) {
    const y = yOf(m);
    ctx.strokeStyle = "#f3f4f6"; ctx.beginPath(); ctx.moveTo(LEWY,y); ctx.lineTo(W-PAD,y); ctx.stroke();
  }

  // nagłówki dni + pionowe linie
  ctx.font = "bold 16px system-ui, Arial"; ctx.fillStyle = "#1f2937";
  for (let i=0;i<dni.length;i++) {
    const x = LEWY + i*KOL_W;
    ctx.strokeStyle = "#d1d5db"; ctx.beginPath(); ctx.moveTo(x,GORA); ctx.lineTo(x,GORA+gridH); ctx.stroke();
    const dt = new Date(dni[i]+"T00:00:00");
    const dz = DNI_PL[(dt.getDay()+6)%7];
    const et = dz + "  " + String(dt.getDate()).padStart(2,"0") + "." + String(dt.getMonth()+1).padStart(2,"0");
    ctx.fillText(et, x+10, GORA-26);
  }
  ctx.strokeStyle = "#d1d5db"; ctx.beginPath(); ctx.moveTo(W-PAD,GORA); ctx.lineTo(W-PAD,GORA+gridH); ctx.stroke();

  // 5) kafelki
  for (const k of kafelki) {
    const fill = k.nieodbyte ? "#f3f4f6" : k.wyp;
    rrect(ctx, k.x0, k.y0, k.x1-k.x0, k.y1-k.y0, 6); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = k.obw; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = k.obw; ctx.fillRect(k.x0, k.y0, 4, k.y1-k.y0);

    let cur = k.y0 + 5;
    ctx.font = "11px system-ui, Arial"; ctx.fillStyle = "#374151";
    ctx.fillText(k.e.godzinaOd + "–" + k.e.godzinaDo, k.innerX, cur);
    cur += LH_G;

    if (k.zastepstwo || k.nieodbyte) {
      const txt = k.zastepstwo ? "ZASTĘPSTWO" : "ODWOŁANE";
      const bcol = k.zastepstwo ? "#ea580c" : "#dc2626";
      ctx.font = "11px system-ui, Arial";
      const tw = ctx.measureText(txt).width;
      rrect(ctx, k.innerX, cur, tw+8, 15, 4); ctx.fillStyle = bcol; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(txt, k.innerX+4, cur+2);
    }

    // tytuł (z pre-passu)
    ctx.font = k.tFont; ctx.fillStyle = "#111827";
    let ty = k.title_top;
    for (const ln of k.linie) { ctx.fillText(ln, k.innerX, ty); ty += k.lh; }

    if (k.przypis) {
      ctx.font = "bold 11px system-ui, Arial"; ctx.fillStyle = k.obw;
      const t = "["+k.przypis+"]";
      const mw = ctx.measureText(t).width;
      ctx.fillText(t, k.x1 - mw - 6, k.y0 + 4);
    }

    // prowadzący + sala (zakotwiczone u dołu)
    let fy = k.dol_start;
    ctx.font = "12px system-ui, Arial";
    if (k.dyd)      { ctx.fillStyle = "#4b5563"; ctx.fillText(skrocLinie(ctx, k.dyd, k.innerW), k.innerX, fy); fy += POLE_H; }
    if (k.sala_txt) { ctx.fillStyle = "#6b7280"; ctx.fillText(skrocLinie(ctx, k.sala_txt, k.innerW), k.innerX, fy); }
  }

  // 6) legenda
  let ly = GORA + gridH + 22, lx = PAD + 4;
  ctx.font = "bold 13px system-ui, Arial"; ctx.fillStyle = "#1f2937";
  ctx.fillText("Legenda:", lx, ly - 16);
  ctx.font = "13px system-ui, Arial";
  for (const kat of ["wyk","cw","sem"]) {
    const c = KOL[kat];
    rrect(ctx, lx, ly, 22, 16, 4); ctx.fillStyle = c.wyp; ctx.fill();
    ctx.strokeStyle = c.obw; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#374151"; ctx.fillText(NAZWA_KAT[kat], lx+30, ly);
    lx += 30 + Math.ceil(ctx.measureText(NAZWA_KAT[kat]).width) + 28;
  }
  ctx.font = "11px system-ui, Arial"; ctx.fillStyle = "#6b7280";
  ctx.fillText("pomarańcz. = zastępstwo   ·   czerwony/szary = odwołane", lx, ly);

  // 7) przypisy
  if (przypisy.length) {
    let py = GORA + gridH + LEGENDA_H;
    ctx.strokeStyle = "#e5e7eb"; ctx.beginPath(); ctx.moveTo(PAD+4,py); ctx.lineTo(W-PAD-4,py); ctx.stroke();
    py += 6;
    ctx.font = "bold 12px system-ui, Arial"; ctx.fillStyle = "#1f2937";
    ctx.fillText("Pełne nazwy skróconych przedmiotów:", PAD+4, py);
    py += 18;
    ctx.font = "11px system-ui, Arial"; ctx.fillStyle = "#4b5563";
    for (const ln of przypisyLinie) { ctx.fillText(ln, PAD+4, py); py += lhFn; }
  }

  cv.toBlob((b) => { _img = b; }, "image/png");
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
}

// ----------------------------- akcje plików -------------------------------
function zapiszPNG() {
  if (!_img) return;
  const url = URL.createObjectURL(_img);
  const a = document.createElement("a");
  a.href = url; a.download = _nazwa;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

async function udostepnij() {
  if (!_img) return;
  const f = new File([_img], _nazwa, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files:[f] })) {
    try { await navigator.share({ files:[f], title: "Rozkład zajęć" }); }
    catch (_) {}
  } else {
    zapiszPNG();
  }
}

// ----------------------------- pomocnicze ---------------------------------
function ustaw_status(t)  { const s = $("status"); s.className = "status";     s.textContent = t; }
function ustaw_blad(t)    { const s = $("status"); s.className = "status err"; s.textContent = t; }
