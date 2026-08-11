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
  .merk {
    font-family:'Fraunces',Georgia,serif; font-size:1.35rem; font-weight:700;
    letter-spacing:.12em; color:var(--ink); text-decoration:none;
  }
  .merk span { color:var(--gold-deep); }
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
  @media (max-width:560px) {
    .kop nav { gap:12px; font-size:.85rem; }
    .kaart { padding:20px; }
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
    <a class="merk" href="/">LUMA<span>DAK</span></a>
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

module.exports = {
  STATUS_TEKST, STATUS_KLEUR, esc, euro, datum, schil, melding, badge,
  inloggen, wachtwoordVergeten, wachtwoordInstellen, account, bestellingKaart,
};
