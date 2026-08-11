// Transactionele e-mail via Resend, in de huisstijl van de site.
//
// E-mailclients zijn geen browsers: geen flexbox, geen webfonts, geen <style>
// waar je op kunt bouwen. Vandaar tabellen, inline stijlen en systeemfonts die
// Fraunces/Outfit zo dicht mogelijk benaderen (Georgia voor koppen, Arial voor
// lopende tekst). Zonder RESEND_API_KEY doet dit bestand niets en draait de
// site gewoon door.

const AFZENDER = 'LumaDak <bestellingen@lumadak.nl>';
const WINKEL_MAIL = 'info@lumadak.nl';          // wat de klant in de voettekst ziet

// Waar de bestelmelding heen gaat. Meerdere adressen mogen, komma-gescheiden:
// BESTELLING_MAIL=d.degraaf@creditline.nl,info@lumadak.nl
function winkelOntvangers() {
  const lijst = String(process.env.BESTELLING_MAIL || WINKEL_MAIL)
    .split(',').map(e => e.trim()).filter(Boolean);
  return lijst.length ? lijst : [WINKEL_MAIL];
}

function siteBasis() {
  return String(process.env.SITE_URL || 'https://lumadak.nl').replace(/\/$/, '');
}

// Huisstijl, gelijk aan de :root-variabelen in index.html
const K = {
  bg: '#fbfaf7', bgWarm: '#f3f0e8', ink: '#1f2329', inkSoft: '#5a5e66',
  goud: '#e8b53d', goudDiep: '#cf9a22', lijn: '#e7e2d6', wit: '#ffffff',
};

const STATUS_TEKST = {
  betaald: 'Betaald — we maken je bestelling klaar',
  in_behandeling: 'In behandeling',
  verzonden: 'Onderweg naar je toe',
  geleverd: 'Geleverd',
  geannuleerd: 'Geannuleerd',
};

// Klantnamen en adressen komen van buiten: altijd escapen voordat ze in HTML belanden.
function esc(waarde) {
  return String(waarde == null ? '' : waarde)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function euro(cent) {
  return '€ ' + (cent / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function adresRegel(adres) {
  const a = adres || {};
  return [a.line1, a.line2, `${a.postal_code || ''} ${a.city || ''}`.trim(), a.country]
    .filter(Boolean).join(', ');
}

// ---------- Bouwstenen ----------

function schil(inhoud, voorvertoning) {
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LumaDak</title></head>
<body style="margin:0;padding:0;background:${K.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(voorvertoning || '')}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${K.bg};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:580px;background:${K.wit};border:1px solid ${K.lijn};border-radius:14px;overflow:hidden;">

        <tr><td style="height:4px;background:${K.goud};font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:26px 32px 8px 32px;">
          <!-- Blokkeert de client afbeeldingen, dan valt de alt-tekst terug op
               de merknaam; daarom is die bewust netjes opgemaakt. -->
          <a href="${siteBasis()}" style="text-decoration:none;">
            <img src="${siteBasis()}/logo-email.png" width="170" height="77" alt="LumaDak"
                 style="display:block;border:0;width:170px;height:auto;
                        font-family:Georgia,serif;font-size:21px;font-weight:bold;
                        letter-spacing:.12em;color:${K.ink};">
          </a>
        </td></tr>

        <tr><td style="padding:20px 32px 30px 32px;">${inhoud}</td></tr>

        <tr><td style="background:${K.bgWarm};border-top:1px solid ${K.lijn};padding:20px 32px;
                       font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:${K.inkSoft};">
          <strong style="color:${K.ink};">LumaDak</strong> — Torenlaan 5A, 1402 AT Bussum<br>
          <a href="tel:+31646150160" style="color:${K.inkSoft};text-decoration:none;">06 46 15 01 60</a> ·
          <a href="mailto:${WINKEL_MAIL}" style="color:${K.inkSoft};text-decoration:none;">${WINKEL_MAIL}</a><br>
          KVK 59683198 · BTW NL853603108B01
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function kop(tekst) {
  return `<h1 style="margin:0 0 14px 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;
             line-height:1.3;font-weight:600;color:${K.ink};">${esc(tekst)}</h1>`;
}

function alinea(html) {
  return `<p style="margin:0 0 15px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;
             line-height:1.65;color:${K.ink};">${html}</p>`;
}

function knop(tekst, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
    <tr><td style="background:${K.ink};border-radius:50px;">
      <a href="${esc(url)}" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;
         font-size:15px;font-weight:bold;color:${K.wit};text-decoration:none;">${esc(tekst)}</a>
    </td></tr></table>`;
}

function statusBadge(status) {
  return `<span style="display:inline-block;background:${K.goud};color:${K.ink};border-radius:50px;
           padding:5px 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;">
           ${esc(STATUS_TEKST[status] || status)}</span>`;
}

// Tabel met bestelregels, verzendkosten en totaal.
function regelTabel(order) {
  const regels = (order.regels || []).map(r => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid ${K.lijn};font-family:Arial,Helvetica,sans-serif;
                 font-size:14px;color:${K.ink};">${esc(r.naam)}
        <span style="color:${K.inkSoft};">× ${Number(r.aantal)}</span></td>
      <td align="right" style="padding:9px 0;border-bottom:1px solid ${K.lijn};font-family:Arial,Helvetica,sans-serif;
                 font-size:14px;color:${K.ink};white-space:nowrap;">${euro(r.stuksprijs_cent * r.aantal)}</td>
    </tr>`).join('');

  const verzend = `
    <tr>
      <td style="padding:9px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${K.inkSoft};">
        Bezorging</td>
      <td align="right" style="padding:9px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;
                 color:${K.inkSoft};white-space:nowrap;">
        ${order.verzendkosten_cent > 0 ? euro(order.verzendkosten_cent) : 'gratis'}</td>
    </tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px 0;">
    ${regels}${verzend}
    <tr>
      <td style="padding:13px 0 0 0;border-top:2px solid ${K.ink};font-family:Arial,Helvetica,sans-serif;
                 font-size:16px;font-weight:bold;color:${K.ink};">Totaal betaald</td>
      <td align="right" style="padding:13px 0 0 0;border-top:2px solid ${K.ink};font-family:Arial,Helvetica,sans-serif;
                 font-size:16px;font-weight:bold;color:${K.ink};white-space:nowrap;">${euro(order.bedrag_cent)}</td>
    </tr>
  </table>`;
}

function gegevensBlok(order) {
  const rij = (label, waarde) => `
    <tr>
      <td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${K.inkSoft};
                 width:100px;vertical-align:top;">${esc(label)}</td>
      <td style="padding:3px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${K.ink};">${esc(waarde || '—')}</td>
    </tr>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${K.bgWarm};border-radius:10px;padding:14px 16px;margin:4px 0 18px 0;">
    ${rij('Bestelnummer', order.bestelnummer)}
    ${rij('Naam', order.naam)}
    ${rij('Telefoon', order.telefoon)}
    ${rij('Bezorgadres', adresRegel(order.adres))}
    ${rij('Montage', order.montage ? 'JA — we nemen contact op voor een prijsafspraak' : 'nee')}
  </table>`;
}

// Toont waar de bestelling in het traject staat. Wie net betaald heeft moet
// meteen zien dat het pakket nog niet onderweg is — dat scheelt telefoontjes.
const TRAJECT = [
  ['betaald', 'Betaling ontvangen', 'Je betaling is binnen en bevestigd.'],
  ['in_behandeling', 'We maken je bestelling klaar', 'Meestal binnen 1 tot 2 werkdagen.'],
  ['verzonden', 'Onderweg naar je toe', 'Onze bezorgpartner belt je voor een bezorgmoment.'],
  ['geleverd', 'Geleverd', 'Klaar om te plaatsen.'],
];

function traject(status) {
  const nu = Math.max(0, TRAJECT.findIndex(([w]) => w === status));

  const rijen = TRAJECT.map(([, titel, uitleg], i) => {
    const klaar = i <= nu;
    const actief = i === nu;
    const bol = klaar
      ? `background:${K.goud};border:2px solid ${K.goud};`
      : `background:${K.wit};border:2px solid ${K.lijn};`;

    return `
      <tr>
        <td width="26" valign="top" style="padding:0 10px 0 0;">
          <div style="width:14px;height:14px;border-radius:9px;margin-top:4px;${bol}">&nbsp;</div>
        </td>
        <td style="padding:0 0 ${i === TRAJECT.length - 1 ? '0' : '13px'} 0;
                   font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:14px;font-weight:${actief ? 'bold' : 'normal'};
                      color:${klaar ? K.ink : K.inkSoft};">${esc(titel)}</div>
          <div style="font-size:12.5px;color:${K.inkSoft};padding-top:2px;">${esc(uitleg)}</div>
        </td>
      </tr>`;
  }).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:${K.bgWarm};border-radius:10px;padding:18px;margin:6px 0 20px 0;">
      <tr><td>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;
                    letter-spacing:.07em;text-transform:uppercase;color:${K.inkSoft};
                    padding-bottom:13px;">Zo staat je bestelling ervoor</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rijen}</table>
      </td></tr>
    </table>`;
}

// ---------- Berichten ----------

function bestelbevestiging(order, wachtwoordLink, siteUrl) {
  const voornaam = String(order.naam || '').split(' ')[0];
  const inhoud = `
    ${kop(voornaam ? `Bedankt voor je bestelling, ${voornaam}!` : 'Bedankt voor je bestelling!')}
    ${alinea('We hebben je betaling ontvangen en gaan meteen aan de slag. '
      + 'Je bestelling is nog <strong>niet verzonden</strong> — zodra dat verandert, hoor je het van ons.')}
    ${traject(order.status || 'betaald')}
    ${gegevensBlok(order)}
    ${regelTabel(order)}
    ${order.montage ? alinea(`<strong>Montage aangevraagd.</strong> We bellen je binnenkort op
        ${esc(order.telefoon || 'het doorgegeven nummer')} om de montage en de prijs af te spreken.`) : ''}
    ${wachtwoordLink ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid ${K.lijn};border-radius:10px;padding:16px 18px;margin:22px 0 4px 0;">
        <tr><td>
          ${alinea('<strong>We hebben alvast een account voor je klaargezet.</strong> Stel een wachtwoord in en je kunt de status van deze en volgende bestellingen altijd zelf volgen.')}
          ${knop('Wachtwoord instellen', wachtwoordLink)}
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${K.inkSoft};">
            Deze link is 7 dagen geldig. Geen zin in een account? Dan hoef je niets te doen —
            je bestelling loopt gewoon door.</p>
        </td></tr>
      </table>` : alinea(`Je kunt de status van je bestelling volgen op
          <a href="${esc(siteUrl)}/account" style="color:${K.goudDiep};">je account</a>.`)}
    ${alinea(`Vragen? Antwoord gerust op deze e-mail of bel <a href="tel:+31646150160" style="color:${K.goudDiep};">06 46 15 01 60</a>.`)}`;

  return {
    subject: `Bestelling ${order.bestelnummer} bevestigd — LumaDak`,
    html: schil(inhoud, `Je bestelling ${order.bestelnummer} is bevestigd.`),
  };
}

function statusUpdate(order, siteUrl) {
  const voornaam = String(order.naam || '').split(' ')[0];
  const bericht = {
    in_behandeling: 'We zijn je bestelling aan het klaarmaken voor verzending.',
    verzonden: 'Goed nieuws: je bestelling is onderweg. Onze bezorgpartner neemt contact met je op over het bezorgmoment.',
    geleverd: 'Je bestelling is geleverd. We hopen dat je er veel plezier van hebt!',
    geannuleerd: 'Je bestelling is geannuleerd. Heb je hier vragen over, neem dan gerust contact met ons op.',
  }[order.status] || 'De status van je bestelling is bijgewerkt.';

  const inhoud = `
    ${kop(voornaam ? `Update over je bestelling, ${voornaam}` : 'Update over je bestelling')}
    <div style="margin:0 0 16px 0;">${statusBadge(order.status)}</div>
    ${alinea(esc(bericht))}
    ${order.status === 'geannuleerd' ? '' : traject(order.status)}
    ${gegevensBlok(order)}
    ${alinea(`Bekijk je bestelling op <a href="${esc(siteUrl)}/account" style="color:${K.goudDiep};">je account</a>.`)}`;

  return {
    subject: `Bestelling ${order.bestelnummer} — ${STATUS_TEKST[order.status] || order.status}`,
    html: schil(inhoud, `Status van ${order.bestelnummer}: ${STATUS_TEKST[order.status] || order.status}`),
  };
}

function wachtwoordReset(naam, link) {
  const voornaam = String(naam || '').split(' ')[0];
  const inhoud = `
    ${kop('Nieuw wachtwoord instellen')}
    ${alinea(voornaam ? `Hallo ${esc(voornaam)}, je vroeg om een nieuw wachtwoord voor je LumaDak-account.`
                      : 'Je vroeg om een nieuw wachtwoord voor je LumaDak-account.')}
    ${knop('Wachtwoord instellen', link)}
    ${alinea(`<span style="font-size:13px;color:${K.inkSoft};">Deze link is 1 uur geldig en werkt één keer.
       Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren — er verandert dan niets.</span>`)}`;

  return {
    subject: 'Nieuw wachtwoord instellen — LumaDak',
    html: schil(inhoud, 'Stel een nieuw wachtwoord in voor je LumaDak-account.'),
  };
}

function interneMelding(order, siteUrl) {
  const inhoud = `
    ${kop(`Nieuwe bestelling — ${euro(order.bedrag_cent)}`)}
    ${gegevensBlok(order)}
    ${regelTabel(order)}
    ${alinea(`<a href="${esc(siteUrl)}/beheer" style="color:${K.goudDiep};">Openen in het beheerpaneel</a>`)}
    ${order.email ? alinea(`<span style="font-size:13px;color:${K.inkSoft};">Klant: ${esc(order.email)}</span>`) : ''}`;

  return {
    subject: `Nieuwe bestelling ${order.bestelnummer} — ${euro(order.bedrag_cent)} — ${order.naam || 'onbekend'}`,
    html: schil(inhoud, `Nieuwe bestelling van ${order.naam || 'een klant'}.`),
  };
}

// ---------- Versturen ----------

async function verstuur({ to, subject, html, replyTo }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[mail] RESEND_API_KEY ontbreekt — bericht niet verstuurd:', subject);
    return false;
  }

  // 3 pogingen met oplopende wachttijd; een tijdelijke storing bij Resend mag
  // geen bestelling kosten.
  for (let poging = 1; poging <= 3; poging++) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: AFZENDER,
          to: Array.isArray(to) ? to : [to],
          subject, html,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });
      if (resp.ok) return true;
      console.warn(`[mail] poging ${poging} mislukt (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    } catch (err) {
      console.warn(`[mail] poging ${poging} mislukt: ${err.message}`);
    }
    if (poging < 3) await new Promise(r => setTimeout(r, poging * 2000));
  }
  console.error('[mail] definitief mislukt:', subject);
  return false;
}

module.exports = {
  WINKEL_MAIL, winkelOntvangers, STATUS_TEKST, euro, adresRegel, esc,
  bestelbevestiging, statusUpdate, wachtwoordReset, interneMelding, verstuur,
};
