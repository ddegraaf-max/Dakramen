// Server-side gerenderde pagina's (inloggen, account, beheer).
//
// Bewust geen template-engine: dat scheelt een dependency en het zijn maar een
// handvol schermen. De stijl volgt index.html, zodat het één winkel blijft.

const STATUS_TEKST = {
  betaald: 'Betaald',
  in_behandeling: 'In behandeling',
  verzonden: 'Verzonden',
  geleverd: 'Geleverd',
  geannuleerd: 'Geannuleerd',
};

const STATUS_KLEUR = {
  betaald: '#e8b53d',
  in_behandeling: '#e8b53d',
  verzonden: '#4a90d9',
  geleverd: '#4a9b5e',
  geannuleerd: '#b04a4a',
};

function esc(waarde) {
  return String(waarde == null ? '' : waarde)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function euro(cent) {
  return '€ ' + (cent / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function datum(waarde) {
  try {
    return new Date(waarde).toLocaleDateString('nl-NL',
      { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
}

const STIJL = `
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --bg:#fbfaf7; --bg-warm:#f3f0e8; --ink:#1f2329; --ink-soft:#5a5e66;
    --gold:#e8b53d; --gold-deep:#cf9a22; --line:#e7e2d6; --white:#fff; --r:14px;
  }
  body {
    margin:0; background:var(--bg); color:var(--ink);
    font-family:'Outfit',system-ui,sans-serif; font-size:16px; line-height:1.6;
    -webkit-font-smoothing:antialiased;
  }
  a { color:var(--gold-deep); }
  .kop {
    background:var(--white); border-bottom:1px solid var(--line);
    padding:16px 0; position:sticky; top:0; z-index:10;
  }
  .wrap { max-width:860px; margin:0 auto; padding:0 22px; }
  .kop .wrap { display:flex; align-items:center; justify-content:space-between; gap:16px; }
  /* Zelfde logo en zelfde hoogte als de winkel: 62px beeld + 2×16px padding
     komt uit op de 94px die de kop van index.html ook heeft. */
  .merk { display:flex; align-items:center; text-decoration:none; flex:none; }
  .merk img { height:62px; width:auto; display:block; }
  .kop nav { display:flex; align-items:center; gap:18px; font-size:.92rem; }
  .kop nav a { color:var(--ink-soft); text-decoration:none; }
  .kop nav a:hover { color:var(--ink); }
  main { padding:40px 0 64px; }
  h1 { font-family:'Fraunces',Georgia,serif; font-size:clamp(1.7rem,3.4vw,2.3rem); margin:0 0 8px; font-weight:600; }
  .lead { color:var(--ink-soft); margin:0 0 28px; }
  .kaart {
    background:var(--white); border:1px solid var(--line); border-radius:var(--r);
    padding:26px; margin-bottom:18px;
  }
  .smal { max-width:430px; margin:0 auto; }
  label { display:block; font-size:.88rem; font-weight:500; margin:14px 0 6px; }
  input[type=email], input[type=password], input[type=text], select, textarea {
    width:100%; padding:11px 13px; border:1.5px solid var(--line); border-radius:9px;
    font-family:inherit; font-size:1rem; background:var(--white); color:var(--ink);
  }
  input:focus, select:focus, textarea:focus { outline:2px solid var(--gold); outline-offset:1px; border-color:var(--gold); }
  .knop {
    display:inline-block; width:100%; margin-top:20px; padding:13px 24px;
    background:var(--ink); color:var(--white); border:none; border-radius:50px;
    font-family:inherit; font-size:1rem; font-weight:500; cursor:pointer;
    transition:background .2s;
  }
  .knop:hover { background:var(--gold); color:var(--ink); }
  .knop.smalletjes { width:auto; margin:0; padding:8px 18px; font-size:.88rem; }
  .melding { padding:12px 15px; border-radius:9px; margin-bottom:18px; font-size:.93rem; }
  .melding.fout { background:#fdeaea; border:1px solid #f0c2c2; color:#8d2b2b; }
  .melding.goed { background:#eaf6ee; border:1px solid #bfe0c9; color:#22623a; }
  .hint { font-size:.85rem; color:var(--ink-soft); margin-top:14px; }
  .tussen { text-align:center; margin-top:18px; font-size:.9rem; }
  .badge {
    display:inline-block; padding:4px 12px; border-radius:50px;
    font-size:.76rem; font-weight:600; color:#fff;
  }
  .bestelling-kop {
    display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between;
    gap:10px; margin-bottom:14px;
  }
  .bestelnr { font-family:'Fraunces',Georgia,serif; font-size:1.15rem; font-weight:600; }
  .meta { color:var(--ink-soft); font-size:.86rem; }
  table.regels { width:100%; border-collapse:collapse; margin-top:6px; }
  table.regels td { padding:8px 0; border-bottom:1px solid var(--line); font-size:.94rem; }
  table.regels td:last-child { text-align:right; white-space:nowrap; }
  table.regels tr:last-child td { border-bottom:none; font-weight:600; border-top:2px solid var(--ink); }
  .leeg { text-align:center; padding:44px 20px; color:var(--ink-soft); }
  .adres { color:var(--ink-soft); font-size:.88rem; margin-top:10px; }
  /* statusbalk op /account */
  .traject { display:flex; list-style:none; margin:20px 0 4px; padding:0; }
  .traject li { flex:1; position:relative; text-align:center; padding-top:26px; }
  .traject li::before {
    content:''; position:absolute; top:9px; left:-50%; width:100%; height:3px;
    background:var(--line); border-radius:2px;
  }
  .traject li:first-child::before { display:none; }
  .traject li.af::before { background:var(--gold); }
  .punt {
    position:absolute; top:2px; left:50%; transform:translateX(-50%);
    width:17px; height:17px; border-radius:50%;
    background:var(--white); border:3px solid var(--line);
  }
  .traject li.af .punt { background:var(--gold); border-color:var(--gold); }
  .traject li.nu .punt { box-shadow:0 0 0 5px var(--gold-soft); }
  .etiket { display:block; font-size:.78rem; line-height:1.35; color:var(--ink-soft); padding:0 3px; }
  .traject li.nu .etiket { color:var(--ink); font-weight:600; }
  .traject-uitleg {
    background:var(--bg-warm); border-radius:9px; padding:12px 15px;
    margin:16px 0 4px; font-size:.9rem; color:var(--ink);
  }
  .geannuleerd-blok {
    background:#fdeaea; border:1px solid #f0c2c2; color:#8d2b2b;
    border-radius:9px; padding:12px 15px; margin:16px 0 4px; font-size:.9rem;
  }
  .bijgewerkt { font-size:.8rem; color:var(--ink-soft); margin-top:10px; }
  @media (max-width:460px) {
    .etiket { font-size:.7rem; }
  }

  /* beheerpaneel */
  .filterbalk { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
  .filter {
    background:var(--white); border:1.5px solid var(--line); border-radius:50px;
    padding:7px 15px; font-size:.86rem; color:var(--ink-soft); text-decoration:none;
  }
  .filter:hover { border-color:var(--gold); color:var(--ink); }
  .filter.actief { background:var(--ink); border-color:var(--ink); color:var(--white); }
  .telling { opacity:.6; font-size:.8em; margin-left:3px; }
  .zoekbalk { display:flex; gap:8px; margin-bottom:22px; }
  .zoekbalk input { flex:1; }
  .leeg-knop {
    background:var(--white); color:var(--ink-soft); border:1.5px solid var(--line);
    text-decoration:none; display:inline-flex; align-items:center;
  }
  .beheer-grid {
    display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
    gap:18px; padding:16px 0; border-top:1px solid var(--line);
  }
  .veldkop {
    font-size:.72rem; text-transform:uppercase; letter-spacing:.06em;
    color:var(--ink-soft); font-weight:600; margin-bottom:5px;
  }
  .montage { color:var(--gold-deep); font-weight:600; font-size:.86rem; margin-top:6px; }
  .beheer-form {
    display:flex; flex-wrap:wrap; gap:10px; align-items:center;
    border-top:1px solid var(--line); padding-top:15px;
  }
  .beheer-form select { width:auto; flex:1; min-width:150px; padding:8px 11px; font-size:.9rem; }
  .vinkje { display:flex; align-items:center; gap:6px; margin:0; font-size:.86rem; color:var(--ink-soft); }
  .vinkje input { width:auto; }
  @media (max-width:560px) {
    .kop { padding:12px 0; }
    .merk img { height:44px; }
    .kop nav { gap:12px; font-size:.85rem; }
    .kaart { padding:20px; }
    .beheer-form select { min-width:0; }
  }
`;

function schil({ titel, inhoud, klant, beheerder }) {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${esc(titel)} — LumaDak</title>
<link rel="icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${STIJL}</style>
</head>
<body>
<header class="kop">
  <div class="wrap">
    <a class="merk" href="/">
      <!-- Kleine variant van logo.png (14 KB i.p.v. 325 KB); ruim scherp genoeg
           voor 62px hoogte en wordt ook in de e-mails gebruikt. -->
      <img src="/logo-email.png" alt="LumaDak — Meer licht. Meer leven.">
    </a>
    <nav>
      <a href="/">Winkel</a>
      ${klant ? `
        <a href="/account">Mijn bestellingen</a>
        ${beheerder ? '<a href="/beheer">Beheer</a>' : ''}
        <form method="post" action="/uitloggen" style="display:inline;">
          <button class="knop smalletjes" type="submit">Uitloggen</button>
        </form>`
      : '<a href="/inloggen">Inloggen</a>'}
    </nav>
  </div>
</header>
<main><div class="wrap">${inhoud}</div></main>
</body>
</html>`;
}

function melding(soort, tekst) {
  if (!tekst) return '';
  return `<div class="melding ${soort}">${esc(tekst)}</div>`;
}

function badge(status) {
  return `<span class="badge" style="background:${STATUS_KLEUR[status] || '#5a5e66'};">
    ${esc(STATUS_TEKST[status] || status)}</span>`;
}

// ---------- Schermen ----------

function inloggen({ fout, gelukt, email, terug, csrf }) {
  const inhoud = `
    <div class="smal">
      <h1>Inloggen</h1>
      <p class="lead">Bekijk de status van je bestellingen.</p>
      <div class="kaart">
        ${melding('fout', fout)}${melding('goed', gelukt)}
        <form method="post" action="/inloggen">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <input type="hidden" name="terug" value="${esc(terug || '')}">
          <label for="email">E-mailadres</label>
          <input id="email" name="email" type="email" required autocomplete="email"
                 autofocus value="${esc(email || '')}">
          <label for="wachtwoord">Wachtwoord</label>
          <input id="wachtwoord" name="wachtwoord" type="password" required autocomplete="current-password">
          <button class="knop" type="submit">Inloggen</button>
        </form>
        <p class="tussen"><a href="/wachtwoord-vergeten">Wachtwoord vergeten?</a></p>
      </div>
      <p class="hint">Nog geen account? Je krijgt er automatisch één zodra je een
         bestelling plaatst — je hoeft je vooraf nergens voor aan te melden.</p>
    </div>`;
  return schil({ titel: 'Inloggen', inhoud });
}

function wachtwoordVergeten({ fout, gelukt, csrf }) {
  const inhoud = `
    <div class="smal">
      <h1>Wachtwoord vergeten</h1>
      <p class="lead">We sturen je een link om een nieuw wachtwoord in te stellen.</p>
      <div class="kaart">
        ${melding('fout', fout)}${melding('goed', gelukt)}
        ${gelukt ? '' : `
        <form method="post" action="/wachtwoord-vergeten">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <label for="email">E-mailadres</label>
          <input id="email" name="email" type="email" required autocomplete="email" autofocus>
          <button class="knop" type="submit">Stuur mij een link</button>
        </form>`}
        <p class="tussen"><a href="/inloggen">Terug naar inloggen</a></p>
      </div>
    </div>`;
  return schil({ titel: 'Wachtwoord vergeten', inhoud });
}

function wachtwoordInstellen({ fout, token, nieuw, minLengte, csrf }) {
  const inhoud = `
    <div class="smal">
      <h1>${nieuw ? 'Kies een wachtwoord' : 'Nieuw wachtwoord'}</h1>
      <p class="lead">${nieuw
        ? 'Nog één stap en je kunt je bestellingen volgen.'
        : 'Kies hieronder je nieuwe wachtwoord.'}</p>
      <div class="kaart">
        ${melding('fout', fout)}
        <form method="post" action="/wachtwoord-instellen">
          <input type="hidden" name="_csrf" value="${esc(csrf)}">
          <input type="hidden" name="token" value="${esc(token)}">
          <label for="wachtwoord">Wachtwoord</label>
          <input id="wachtwoord" name="wachtwoord" type="password" required
                 autocomplete="new-password" minlength="${minLengte}" autofocus>
          <label for="herhaal">Herhaal wachtwoord</label>
          <input id="herhaal" name="herhaal" type="password" required
                 autocomplete="new-password" minlength="${minLengte}">
          <button class="knop" type="submit">Opslaan en inloggen</button>
        </form>
        <p class="hint">Minimaal ${minLengte} tekens.</p>
      </div>
    </div>`;
  return schil({ titel: 'Wachtwoord instellen', inhoud });
}

// Dezelfde vier stappen als in de bestelmail, zodat de klant hetzelfde verhaal
// ziet of hij nu in zijn mailbox kijkt of op zijn account.
const TRAJECT = [
  ['betaald', 'Betaald', 'We hebben je betaling ontvangen en gaan aan de slag.'],
  ['in_behandeling', 'Klaarmaken', 'We maken je bestelling klaar voor verzending.'],
  ['verzonden', 'Onderweg', 'Je bestelling is onderweg. De bezorger belt je voor een bezorgmoment.'],
  ['geleverd', 'Geleverd', 'Je bestelling is bezorgd. Veel plezier ermee!'],
];

function statusBalk(status) {
  if (status === 'geannuleerd') {
    return `<div class="geannuleerd-blok">
      <strong>Deze bestelling is geannuleerd.</strong>
      Vragen hierover? Bel <a href="tel:+31646150160">06 46 15 01 60</a> of mail
      <a href="mailto:info@lumadak.nl">info@lumadak.nl</a>.</div>`;
  }

  const nu = Math.max(0, TRAJECT.findIndex(([w]) => w === status));

  const stappen = TRAJECT.map(([, kort], i) => {
    const klassen = [i <= nu ? 'af' : '', i === nu ? 'nu' : ''].filter(Boolean).join(' ');
    return `<li class="${klassen}"><span class="punt"></span><span class="etiket">${esc(kort)}</span></li>`;
  }).join('');

  return `
    <ol class="traject">${stappen}</ol>
    <div class="traject-uitleg">${esc(TRAJECT[nu][2])}</div>`;
}

function bestellingKaart(b) {
  const regels = (b.regels || []).map(r => `
    <tr><td>${esc(r.naam)} <span class="meta">× ${Number(r.aantal)}</span></td>
        <td>${euro(r.stuksprijs_cent * r.aantal)}</td></tr>`).join('');

  const a = b.adres || {};
  const adres = [a.line1, a.line2, `${a.postal_code || ''} ${a.city || ''}`.trim(), a.country]
    .filter(Boolean).join(', ');

  return `
    <div class="kaart">
      <div class="bestelling-kop">
        <div>
          <div class="bestelnr">${esc(b.bestelnummer)}</div>
          <div class="meta">Besteld op ${esc(datum(b.aangemaakt_op))}</div>
        </div>
        ${badge(b.status)}
      </div>

      ${statusBalk(b.status)}

      ${b.bijgewerkt_op && b.status !== 'betaald'
        ? `<div class="bijgewerkt">Laatst bijgewerkt op ${esc(datum(b.bijgewerkt_op))}</div>` : ''}

      <table class="regels">
        ${regels}
        <tr><td>Bezorging</td><td>${b.verzendkosten_cent > 0 ? euro(b.verzendkosten_cent) : 'gratis'}</td></tr>
        <tr><td>Totaal</td><td>${euro(b.bedrag_cent)}</td></tr>
      </table>
      ${adres ? `<div class="adres">Bezorgadres: ${esc(adres)}</div>` : ''}
      ${b.montage ? '<div class="adres">Montage aangevraagd — we nemen contact op voor een prijsafspraak.</div>' : ''}
    </div>`;
}

function account({ klant, bestellingen, beheerder, gelukt }) {
  const voornaam = String(klant.naam || '').split(' ')[0];
  const inhoud = `
    <h1>${voornaam ? `Hallo ${esc(voornaam)}` : 'Mijn bestellingen'}</h1>
    <p class="lead">Hier zie je de status van al je bestellingen.</p>
    ${melding('goed', gelukt)}
    ${bestellingen.length
      ? bestellingen.map(bestellingKaart).join('')
      : `<div class="kaart"><div class="leeg">
           <p>Je hebt nog geen bestellingen.</p>
           <p><a href="/">Naar de winkel</a></p>
         </div></div>`}`;
  return schil({ titel: 'Mijn bestellingen', inhoud, klant, beheerder });
}

// ---------- Beheerpaneel ----------

function beheerRij(b, csrf) {
  const a = b.adres || {};
  const adres = [a.line1, a.line2, `${a.postal_code || ''} ${a.city || ''}`.trim()]
    .filter(Boolean).join(', ');
  const regels = (b.regels || [])
    .map(r => `${Number(r.aantal)}× ${esc(r.naam)}`).join('<br>');

  const opties = Object.entries(STATUS_TEKST)
    .map(([w, t]) => `<option value="${w}"${b.status === w ? ' selected' : ''}>${esc(t)}</option>`)
    .join('');

  return `
    <div class="kaart">
      <div class="bestelling-kop">
        <div>
          <div class="bestelnr">${esc(b.bestelnummer)}</div>
          <div class="meta">${esc(datum(b.aangemaakt_op))} · ${euro(b.bedrag_cent)}</div>
        </div>
        ${badge(b.status)}
      </div>

      <div class="beheer-grid">
        <div>
          <div class="veldkop">Klant</div>
          <div>${esc(b.naam || '—')}</div>
          <div class="meta"><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></div>
          <div class="meta">${esc(b.telefoon || 'geen telefoonnummer')}</div>
        </div>
        <div>
          <div class="veldkop">Bezorgen naar</div>
          <div class="meta">${esc(adres || '—')}</div>
          ${b.montage ? '<div class="montage">Montage gewenst</div>' : ''}
        </div>
        <div>
          <div class="veldkop">Bestelling</div>
          <div class="meta">${regels || '—'}</div>
          ${b.verzendkosten_cent > 0
            ? `<div class="meta">Bezorging: ${euro(b.verzendkosten_cent)}</div>` : ''}
        </div>
      </div>

      <form method="post" action="/beheer/status" class="beheer-form">
        <input type="hidden" name="_csrf" value="${esc(csrf)}">
        <input type="hidden" name="id" value="${Number(b.id)}">
        <select name="status" aria-label="Status">${opties}</select>
        <label class="vinkje">
          <input type="checkbox" name="mail" value="1" checked> klant mailen
        </label>
        <button class="knop smalletjes" type="submit">Opslaan</button>
      </form>
    </div>`;
}

function beheer({ klant, bestellingen, status, zoek, gelukt, fout, csrf, aantallen }) {
  const filters = ['', ...Object.keys(STATUS_TEKST)].map(w => {
    const actief = (status || '') === w;
    const label = w === '' ? 'Alle' : STATUS_TEKST[w];
    const n = w === '' ? aantallen.totaal : (aantallen[w] || 0);
    return `<a class="filter${actief ? ' actief' : ''}"
              href="/beheer?status=${encodeURIComponent(w)}${zoek ? `&zoek=${encodeURIComponent(zoek)}` : ''}">
              ${esc(label)} <span class="telling">${n}</span></a>`;
  }).join('');

  const inhoud = `
    <h1>Bestellingen</h1>
    <p class="lead">Wijzig de status en houd je klanten op de hoogte.</p>
    ${melding('goed', gelukt)}${melding('fout', fout)}

    <div class="filterbalk">${filters}</div>

    <form method="get" action="/beheer" class="zoekbalk">
      ${status ? `<input type="hidden" name="status" value="${esc(status)}">` : ''}
      <input type="text" name="zoek" placeholder="Zoek op bestelnummer, naam of e-mail"
             value="${esc(zoek || '')}">
      <button class="knop smalletjes" type="submit">Zoeken</button>
      ${zoek ? '<a class="knop smalletjes leeg-knop" href="/beheer">Wissen</a>' : ''}
    </form>

    ${bestellingen.length
      ? bestellingen.map(b => beheerRij(b, csrf)).join('')
      : `<div class="kaart"><div class="leeg">Geen bestellingen gevonden.</div></div>`}`;

  return schil({ titel: 'Beheer', inhoud, klant, beheerder: true });
}

module.exports = {
  STATUS_TEKST, STATUS_KLEUR, esc, euro, datum, schil, melding, badge,
  inloggen, wachtwoordVergeten, wachtwoordInstellen, account, bestellingKaart,
  beheer,
};
