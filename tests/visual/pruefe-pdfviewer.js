/**
 * PDF-Betrachter im Redesign: alle Wege, auf denen er sich öffnet, und seine
 * Bedienung.
 *
 * Legt selbst an und räumt am Ende weg: PDF-Probe/probe.pdf (zwei Seiten),
 * öffentliche Links auf die Datei und den Ordner, Nutzer "pdfprobe" mit einer
 * Freigabe ohne Download-Recht.
 *
 * Geprüft wird:
 *   - Dateiliste: Klick öffnet den Betrachter, sichtbar und nicht von der
 *     Kopfzeile verdeckt; zwei Seiten, Text; Blättern, Vergrößern, Suche,
 *     Herunterladen (echter Download), Drucken vorhanden
 *   - Schutz gegen CVE-2024-4367 aktiv (isEvalSupported=false)
 *   - Schließen per Knopf und per Escape führt zurück zur Liste
 *   - Favoriten (direkt und nach Ansichtswechsel), "Per Link geteilt":
 *     Klick öffnet, Escape schließt ohne Fehler
 *   - Ansichtswechsel bei offenem Betrachter schließt ihn ohne Fehler
 *   - öffentlicher Link auf die PDF: Betrachter öffnet sofort, ohne Schließen,
 *     und nutzt die Fläche unter der Kopfleiste
 *   - öffentlicher Link auf den Ordner: Klick öffnet den Betrachter, ganze Fläche
 *   - Freigabe ohne Download-Recht: Hinweis statt Betrachter
 *   - 400 px: Betrachter füllt den Inhaltsbereich; keine Konsolenfehler
 *
 * Aufruf: OC_PASSWORD=... node tests/visual/pruefe-pdfviewer.js
 *
 * @copyright Copyright (c) 2026, BW-Tech GmbH
 * @license AGPL-3.0
 */
'use strict';

let chromium;
try {
	({ chromium } = require('playwright'));
} catch (e) {
	({ chromium } = require('C:/git/owncloud.online-redesign/node_modules/playwright'));
}

const BASIS = process.env.OC_URL || 'http://127.0.0.1:18130';
const PASSWORT = process.env.OC_PASSWORD;
const PROBE_NUTZER = 'pdfprobe';
const PROBE_PASSWORT = 'Pdf-Probe-2026!x';
if (!PASSWORT) {
	console.error('OC_PASSWORD fehlt.');
	process.exit(2);
}

const ergebnisse = [];
function pruefe(name, ok, zusatz) {
	ergebnisse.push({ name, ok: ok === true, zusatz: zusatz === undefined ? '' : String(zusatz) });
}

/** Kleinste gültige PDF mit einer Textzeile je Seite (nur ASCII) */
function pdf(seiten) {
	const objekte = [];
	objekte.push('<< /Type /Catalog /Pages 2 0 R >>');
	objekte.push('<< /Type /Pages /Kids [' + seiten.map((_, i) => (4 + i * 2) + ' 0 R').join(' ') + '] /Count ' + seiten.length + ' >>');
	objekte.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
	seiten.forEach((text, i) => {
		const strom = 'BT /F1 24 Tf 72 720 Td (' + text + ') Tj ET';
		objekte.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>');
		objekte.push('<< /Length ' + strom.length + ' >>\nstream\n' + strom + '\nendstream');
	});
	let aus = '%PDF-1.4\n';
	const stellen = [];
	objekte.forEach((o, i) => {
		stellen.push(aus.length);
		aus += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
	});
	const xref = aus.length;
	aus += 'xref\n0 ' + (objekte.length + 1) + '\n0000000000 65535 f \n' + stellen.map((s) => String(s).padStart(10, '0') + ' 00000 n \n').join('');
	aus += 'trailer\n<< /Size ' + (objekte.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
	return aus;
}

async function anmelden(browser, nutzer, passwort, breite) {
	const kontext = await browser.newContext({ locale: 'de-DE', viewport: { width: breite || 1440, height: 900 }, acceptDownloads: true });
	const seite = await kontext.newPage();
	await seite.goto(BASIS + '/index.php/login', { waitUntil: 'domcontentloaded' });
	await seite.fill('#user', nutzer);
	await seite.fill('#password', passwort);
	await Promise.all([seite.waitForNavigation({ timeout: 60000 }).catch(() => {}), seite.click('#submit, button[type=submit], input[type=submit]')]);
	return { kontext, seite };
}

/** Rahmen des Betrachters und PDFViewerApplication darin */
async function betrachter(seite) {
	await seite.waitForSelector('#pdframe', { timeout: 30000 });
	// Der Rahmen trägt direkt nach dem Einfügen noch about:blank
	let rahmen = null;
	for (let i = 0; i < 60 && !rahmen; i++) {
		rahmen = seite.frames().find((f) => /files_pdfviewer/.test(f.url())) || null;
		if (!rahmen) {
			await seite.waitForTimeout(250);
		}
	}
	if (!rahmen) {
		return null;
	}
	await rahmen.waitForFunction(() => window.PDFViewerApplication && PDFViewerApplication.pdfDocument && PDFViewerApplication.pagesCount > 0, null, { timeout: 30000 }).catch(() => {});
	await rahmen.waitForFunction(() => document.querySelector('.textLayer') && document.querySelector('.textLayer').textContent.length > 0, null, { timeout: 15000 }).catch(() => {});
	return rahmen;
}

async function zeileAnklicken(seite, name) {
	const zeile = seite.locator('#fileList tr[data-file="' + name + '"]');
	await zeile.waitFor({ timeout: 30000 });
	// Willkommensdialog des Einrichtungsassistenten liegt sonst über der Liste
	await seite.evaluate(() => {
		if (window.jQuery && jQuery.colorbox && document.getElementById('colorbox') && document.getElementById('colorbox').getClientRects().length) {
			jQuery.colorbox.close();
		}
	});
	await seite.waitForTimeout(300);
	// .nametext statt a.name: die Mitte des Ankers liegt auf den Aktionssymbolen
	await zeile.locator('.nametext').first().click();
}

(async () => {
	const browser = await chromium.launch();
	const konsole = [];
	const admin = await anmelden(browser, 'admin', PASSWORT);
	await admin.seite.goto(BASIS + '/index.php/apps/files/', { waitUntil: 'load' });

	// Testdaten: PDF, Links, Nutzer mit Freigabe ohne Download-Recht
	const daten = await admin.seite.evaluate(async ([inhalt, probeNutzer, probePasswort]) => {
		const h = { requesttoken: OC.requestToken };
		const dav = OC.linkToRemoteBase('dav');
		const ocs = (pfad) => OC.linkToOCS(pfad, 2);
		const aus = {};
		// Reste eines abgebrochenen Laufs zuerst entfernen (Ordner samt Freigaben, Nutzer)
		await fetch(dav + '/files/admin/PDF-Probe', { method: 'DELETE', headers: h });
		await fetch(ocs('cloud') + 'users/' + probeNutzer, { method: 'DELETE', headers: Object.assign({ 'OCS-APIRequest': 'true' }, h) });
		await fetch(dav + '/files/admin/PDF-Probe', { method: 'MKCOL', headers: h });
		aus.put = (await fetch(dav + '/files/admin/PDF-Probe/probe.pdf', { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/pdf' }, h), body: inhalt })).status;
		const teilen = async (felder) => {
			const r = await fetch(ocs('apps/files_sharing/api/v1') + 'shares?format=json', {
				method: 'POST', headers: Object.assign({ 'OCS-APIRequest': 'true', 'Content-Type': 'application/x-www-form-urlencoded' }, h), body: new URLSearchParams(felder),
			});
			const j = await r.json();
			return { status: r.status, meta: j.ocs.meta, id: j.ocs.data && j.ocs.data.id, token: j.ocs.data && j.ocs.data.token };
		};
		aus.linkDatei = await teilen({ path: '/PDF-Probe/probe.pdf', shareType: '3', permissions: '1' });
		aus.linkOrdner = await teilen({ path: '/PDF-Probe', shareType: '3', permissions: '1' });
		const nutzer = await fetch(ocs('cloud') + 'users?format=json', {
			method: 'POST', headers: Object.assign({ 'OCS-APIRequest': 'true', 'Content-Type': 'application/x-www-form-urlencoded' }, h), body: new URLSearchParams({ userid: probeNutzer, password: probePasswort }),
		});
		aus.nutzer = (await nutzer.json()).ocs.meta;
		aus.freigabe = await teilen({
			path: '/PDF-Probe/probe.pdf', shareType: '0', shareWith: probeNutzer, permissions: '1',
			'attributes[0][scope]': 'permissions', 'attributes[0][key]': 'download', 'attributes[0][enabled]': 'false',
		});
		return aus;
	}, [pdf(['Probe Seite eins', 'Probe Seite zwei']), PROBE_NUTZER, PROBE_PASSWORT]);
	// Konsole erst ab hier: das Aufräumen vorab erzeugt erwartete 404/400
	admin.seite.on('console', (m) => {
		// Vorschaufehler fremder Dateien (etwa in "Per Link geteilt") gehören
		// nicht zum Betrachter; sie laufen über den Vorschau-Endpunkt des Kerns
		const quelle = m.location().url || '';
		if (/[?&]preview=1/.test(quelle) && !/PDF-Probe/.test(quelle)) {
			return;
		}
		if (m.type() === 'error') { konsole.push('admin: ' + m.text().slice(0, 160) + ' @ ' + quelle.slice(0, 100)); }
	});
	admin.seite.on('pageerror', (e) => konsole.push('admin Seitenfehler: ' + e.message.slice(0, 160)));
	pruefe('Testdaten angelegt (PDF, zwei Links, Nutzer, Freigabe ohne Download)', daten.put === 201 && !!daten.linkDatei.token && !!daten.linkOrdner.token && !!daten.freigabe.id, JSON.stringify(daten));

	// 1. Dateiliste
	await admin.seite.goto(BASIS + '/index.php/apps/files/?dir=%2FPDF-Probe', { waitUntil: 'load' });
	await zeileAnklicken(admin.seite, 'probe.pdf');
	const rahmen = await betrachter(admin.seite);
	pruefe('Klick in der Dateiliste öffnet den Betrachter', !!rahmen);
	if (rahmen) {
		const lage = await admin.seite.evaluate(() => {
			const r = document.getElementById('pdframe').getBoundingClientRect();
			const oben = document.elementFromPoint(r.left + 40, r.top + 15);
			const mitte = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			return { breite: Math.round(r.width), hoehe: Math.round(r.height), top: Math.round(r.top), obenFrei: oben && oben.id === 'pdframe', mitteFrei: mitte && mitte.id === 'pdframe' };
		});
		pruefe('Betrachter sichtbar, Werkzeugleiste nicht verdeckt', lage.breite > 600 && lage.hoehe > 400 && lage.obenFrei && lage.mitteFrei, JSON.stringify(lage));
		const inhalt = await rahmen.evaluate(() => ({
			seiten: PDFViewerApplication.pagesCount,
			text: Array.from(document.querySelectorAll('.textLayer')).map((t) => t.textContent).join(' | '),
			eval: PDFViewerApplicationOptions.get('isEvalSupported'),
			scripting: PDFViewerApplicationOptions.get('enableScripting'),
		}));
		pruefe('zwei Seiten, Text der ersten Seite', inhalt.seiten === 2 && /Probe Seite eins/.test(inhalt.text), JSON.stringify(inhalt));
		pruefe('Schutz CVE-2024-4367: isEvalSupported=false', inhalt.eval === false, JSON.stringify(inhalt));

		await rahmen.click('#next');
		await rahmen.waitForFunction(() => PDFViewerApplication.page === 2, null, { timeout: 5000 }).catch(() => {});
		pruefe('Blättern auf Seite 2', await rahmen.evaluate(() => PDFViewerApplication.page) === 2);

		const skalaVorher = await rahmen.evaluate(() => PDFViewerApplication.pdfViewer.currentScale);
		await rahmen.click('#zoomIn');
		await rahmen.waitForTimeout(500);
		const skalaNachher = await rahmen.evaluate(() => PDFViewerApplication.pdfViewer.currentScale);
		pruefe('Vergrößern', skalaNachher > skalaVorher, skalaVorher + ' -> ' + skalaNachher);

		await rahmen.click('#viewFind');
		await rahmen.fill('#findInput', 'zwei');
		await rahmen.press('#findInput', 'Enter');
		await rahmen.waitForTimeout(1200);
		const suche = await rahmen.evaluate(() => {
			const fc = PDFViewerApplication.findController;
			return { treffer: fc && fc._matchesCountTotal, seite: PDFViewerApplication.page };
		});
		pruefe('Suche findet "zwei"', suche.treffer >= 1, JSON.stringify(suche));

		const knoepfe = await rahmen.evaluate(() => ['download', 'print', 'secondaryToolbarToggle'].map((id) => {
			const k = document.getElementById(id);
			return id + ':' + (k && k.getClientRects().length > 0);
		}));
		pruefe('Herunterladen, Drucken, weitere Werkzeuge sichtbar', knoepfe.every((k) => /:true$/.test(k)), knoepfe.join(', '));

		const [download] = await Promise.all([
			admin.seite.waitForEvent('download', { timeout: 15000 }).catch(() => null),
			rahmen.click('#download'),
		]);
		pruefe('Herunterladen liefert die PDF', !!download && /\.pdf$/i.test(download.suggestedFilename()), download ? download.suggestedFilename() : 'kein Download');

		// Schließen per Knopf (weitere Werkzeuge -> Schließen)
		await rahmen.click('#secondaryToolbarToggle');
		await rahmen.waitForTimeout(300);
		const schliessenSichtbar = await rahmen.evaluate(() => {
			const k = document.getElementById('secondaryToolbarClose');
			return !!k && k.getClientRects().length > 0 && !k.classList.contains('hidden');
		});
		pruefe('Knopf "Schließen" vorhanden', schliessenSichtbar);
		await rahmen.click('#secondaryToolbarClose').catch(() => {});
		await admin.seite.waitForFunction(() => !document.getElementById('pdframe'), null, { timeout: 10000 }).catch(() => {});
		const zu = await admin.seite.evaluate(() => ({ rahmen: !!document.getElementById('pdframe'), liste: !!document.querySelector('#fileList tr[data-file="probe.pdf"]'), hash: location.hash }));
		pruefe('Schließen führt zurück zur Liste', zu.rahmen === false && zu.liste && zu.hash !== '#pdfviewer', JSON.stringify(zu));

		// Schließen per Escape
		await zeileAnklicken(admin.seite, 'probe.pdf');
		await betrachter(admin.seite);
		await admin.seite.keyboard.press('Escape');
		await admin.seite.waitForFunction(() => !document.getElementById('pdframe'), null, { timeout: 10000 }).catch(() => {});
		pruefe('Escape schließt den Betrachter', await admin.seite.evaluate(() => !document.getElementById('pdframe')));
	}

	// 1b. andere Dateiansichten: Favoriten (direkt und nach Wechsel), per Link geteilt
	await admin.seite.evaluate(async () => {
		await fetch(OC.linkToRemoteBase('dav') + '/files/admin/PDF-Probe/probe.pdf', {
			method: 'PROPPATCH',
			headers: { requesttoken: OC.requestToken, 'Content-Type': 'application/xml' },
			body: '<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:set><d:prop><oc:favorite>1</oc:favorite></d:prop></d:set></d:propertyupdate>',
		});
	});
	for (const [ansicht, direkt] of [['favorites', true], ['favorites', false], ['sharinglinks', true]]) {
		if (direkt) {
			await admin.seite.goto(BASIS + '/index.php/apps/files/?view=' + ansicht, { waitUntil: 'load' });
		} else {
			await admin.seite.goto(BASIS + '/index.php/apps/files/?dir=%2FPDF-Probe', { waitUntil: 'load' });
			await admin.seite.waitForSelector('#fileList tr[data-file="probe.pdf"]', { timeout: 30000 }).catch(() => {});
			await admin.seite.locator('#app-navigation li[data-id="' + ansicht + '"] a').first().click({ timeout: 10000 }).catch(() => {});
			await admin.seite.waitForTimeout(1500);
		}
		const vorher = konsole.length;
		// Redesign: alle Ansichten teilen sich #app-content-view; die sichtbare Liste zählt
		const liste = '#fileList tr[data-file="probe.pdf"]:visible';
		await admin.seite.waitForSelector(liste, { timeout: 30000 }).catch(() => {});
		await admin.seite.locator(liste + ' .nametext').first().click({ timeout: 10000 }).catch(() => {});
		const r = await betrachter(admin.seite).catch(() => null);
		const seiten = r ? await r.evaluate(() => PDFViewerApplication.pagesCount) : null;
		const fehler = konsole.slice(vorher);
		pruefe('Ansicht "' + ansicht + '" (' + (direkt ? 'direkt' : 'nach Wechsel') + '): Klick öffnet den Betrachter', seiten === 2 && fehler.length === 0, seiten + ' ' + fehler.join(' | '));
		if (r) {
			await admin.seite.keyboard.press('Escape');
			await admin.seite.waitForFunction(() => !document.getElementById('pdframe'), null, { timeout: 10000 }).catch(() => {});
			const zu = await admin.seite.evaluate(() => !document.getElementById('pdframe'));
			pruefe('Ansicht "' + ansicht + '" (' + (direkt ? 'direkt' : 'nach Wechsel') + '): Escape schließt ohne Fehler', zu && konsole.length === vorher, konsole.slice(vorher).join(' | '));
		}
	}

	// 1c. Ansichtswechsel bei offenem Betrachter
	await admin.seite.goto(BASIS + '/index.php/apps/files/?dir=%2FPDF-Probe', { waitUntil: 'load' });
	await zeileAnklicken(admin.seite, 'probe.pdf');
	if (await betrachter(admin.seite).catch(() => null)) {
		const vorher = konsole.length;
		await admin.seite.locator('#app-navigation li[data-id="favorites"] a').first().click({ timeout: 10000 }).catch(() => {});
		await admin.seite.waitForTimeout(1500);
		const nachWechsel = await admin.seite.evaluate(() => ({
			rahmen: !!document.getElementById('pdframe'),
			liste: Array.from(document.querySelectorAll('#fileList tr[data-file="probe.pdf"]')).some((z) => z.getClientRects().length > 0) && /favorites/.test(location.search),
		}));
		pruefe('Ansichtswechsel bei offenem Betrachter: Betrachter zu, neue Ansicht sichtbar, kein Fehler', !nachWechsel.rahmen && nachWechsel.liste && konsole.length === vorher, JSON.stringify(nachWechsel) + ' ' + konsole.slice(vorher).join(' | '));
	}

	// Größe des Betrachters auf einer Linkseite
	const linkLage = (seite) => seite.evaluate(() => {
		const f = document.getElementById('pdframe');
		if (!f) {
			return null;
		}
		const r = f.getBoundingClientRect();
		return { breite: Math.round(r.width), hoehe: Math.round(r.height), top: Math.round(r.top), fensterB: window.innerWidth, fensterH: window.innerHeight };
	});

	// 2. öffentlicher Link auf die Datei
	{
		const kontext = await browser.newContext({ locale: 'de-DE', viewport: { width: 1440, height: 900 } });
		const seite = await kontext.newPage();
		seite.on('console', (m) => { if (m.type() === 'error') { konsole.push('link: ' + m.text().slice(0, 160)); } });
		await seite.goto(BASIS + '/index.php/s/' + daten.linkDatei.token, { waitUntil: 'load' });
		const r = await betrachter(seite).catch(() => null);
		const info = r ? await r.evaluate(() => ({ seiten: PDFViewerApplication.pagesCount, schliessen: !!document.getElementById('secondaryToolbarClose') && !document.getElementById('secondaryToolbarClose').classList.contains('hidden') })) : null;
		pruefe('öffentlicher Link auf die PDF: Betrachter öffnet sofort, ohne Schließen', !!info && info.seiten === 2 && info.schliessen === false, JSON.stringify(info));
		const lage = await linkLage(seite);
		pruefe('öffentlicher Link auf die PDF: Betrachter nutzt die Fläche unter der Kopfleiste', !!lage && lage.breite >= lage.fensterB * 0.9 && lage.hoehe >= (lage.fensterH - lage.top) * 0.9 && lage.hoehe >= 600, JSON.stringify(lage));
		await kontext.close();
	}

	// 3. öffentlicher Link auf den Ordner
	{
		const kontext = await browser.newContext({ locale: 'de-DE', viewport: { width: 1440, height: 900 } });
		const seite = await kontext.newPage();
		seite.on('console', (m) => { if (m.type() === 'error') { konsole.push('ordnerlink: ' + m.text().slice(0, 160)); } });
		await seite.goto(BASIS + '/index.php/s/' + daten.linkOrdner.token, { waitUntil: 'load' });
		await zeileAnklicken(seite, 'probe.pdf').catch(() => {});
		const r = await betrachter(seite).catch(() => null);
		const seiten = r ? await r.evaluate(() => PDFViewerApplication.pagesCount) : null;
		pruefe('öffentlicher Ordner-Link: Klick öffnet den Betrachter', seiten === 2, seiten);
		const lage = await linkLage(seite);
		pruefe('öffentlicher Ordner-Link: Betrachter nutzt die Fläche unter der Kopfleiste', !!lage && lage.breite >= lage.fensterB * 0.9 && lage.hoehe >= (lage.fensterH - lage.top) * 0.9 && lage.hoehe >= 600, JSON.stringify(lage));
		await kontext.close();
	}

	// 4. Freigabe ohne Download-Recht
	{
		const probe = await anmelden(browser, PROBE_NUTZER, PROBE_PASSWORT);
		// ausstehende Freigaben annehmen, falls der Server nicht automatisch annimmt
		await probe.seite.goto(BASIS + '/index.php/apps/files/', { waitUntil: 'load' });
		await probe.seite.evaluate(async () => {
			const h = { requesttoken: OC.requestToken, 'OCS-APIRequest': 'true' };
			const r = await fetch(OC.linkToOCS('apps/files_sharing/api/v1', 2) + 'shares/pending?format=json', { headers: h });
			const j = await r.json().catch(() => null);
			for (const s of (j && j.ocs && j.ocs.data) || []) {
				await fetch(OC.linkToOCS('apps/files_sharing/api/v1', 2) + 'shares/pending/' + s.id + '?format=json', { method: 'POST', headers: h });
			}
		});
		await probe.seite.goto(BASIS + '/index.php/apps/files/', { waitUntil: 'load' });
		await probe.seite.waitForSelector('#fileList tr[data-file]', { timeout: 30000 }).catch(() => {});
		const name = await probe.seite.evaluate(() => {
			const z = Array.from(document.querySelectorAll('#fileList tr[data-file]')).find((t) => /probe.*\.pdf$/.test(t.getAttribute('data-file')));
			return z ? z.getAttribute('data-file') : null;
		});
		if (name) {
			await zeileAnklicken(probe.seite, name);
			await probe.seite.waitForTimeout(2500);
			const z = await probe.seite.evaluate(() => ({
				rahmen: !!document.getElementById('pdframe'),
				hinweis: Array.from(document.querySelectorAll('#notification, .toastify, .row')).map((e) => e.textContent).join(' ').slice(0, 200),
			}));
			pruefe('ohne Download-Recht: kein Betrachter, Hinweis', z.rahmen === false && /download permission|Download-Berechtigung|secure view/i.test(z.hinweis), JSON.stringify(z));
		} else {
			pruefe('ohne Download-Recht: Freigabe beim Empfänger sichtbar', false, 'probe.pdf fehlt in der Liste');
		}
		await probe.kontext.close();
	}

	// 5. schmal
	{
		const schmal = await anmelden(browser, 'admin', PASSWORT, 400);
		await schmal.seite.goto(BASIS + '/index.php/apps/files/?dir=%2FPDF-Probe', { waitUntil: 'load' });
		await zeileAnklicken(schmal.seite, 'probe.pdf').catch(() => {});
		const r = await betrachter(schmal.seite).catch(() => null);
		const lage = r ? await schmal.seite.evaluate(() => {
			const b = document.getElementById('pdframe').getBoundingClientRect();
			const oben = document.elementFromPoint(b.left + 20, b.top + 15);
			return { breite: Math.round(b.width), rechts: Math.round(b.right), fenster: window.innerWidth, obenFrei: oben && oben.id === 'pdframe', querrollen: document.documentElement.scrollWidth > window.innerWidth + 1 };
		}) : null;
		pruefe('400 px: Betrachter über die volle Breite, Leiste frei, kein Querrollen', !!lage && lage.breite >= 360 && lage.rechts <= lage.fenster && lage.obenFrei && !lage.querrollen, JSON.stringify(lage));
		await schmal.kontext.close();
	}

	// aufräumen
	await admin.seite.goto(BASIS + '/index.php/apps/files/', { waitUntil: 'load' });
	await admin.seite.evaluate(async ([ids, probeNutzer]) => {
		const h = { requesttoken: OC.requestToken, 'OCS-APIRequest': 'true' };
		for (const id of ids) {
			if (id) {
				await fetch(OC.linkToOCS('apps/files_sharing/api/v1', 2) + 'shares/' + id, { method: 'DELETE', headers: h });
			}
		}
		await fetch(OC.linkToOCS('cloud', 2) + 'users/' + probeNutzer, { method: 'DELETE', headers: h });
		await fetch(OC.linkToRemoteBase('dav') + '/files/admin/PDF-Probe', { method: 'DELETE', headers: { requesttoken: OC.requestToken } });
	}, [[daten.linkDatei.id, daten.linkOrdner.id, daten.freigabe.id], PROBE_NUTZER]);

	pruefe('keine Konsolenfehler', konsole.length === 0, konsole.join(' | '));
	await browser.close();

	let fehler = 0;
	for (const e of ergebnisse) {
		console.log((e.ok ? 'OK    ' : 'FEHL  ') + e.name + (e.zusatz ? '  (' + e.zusatz + ')' : ''));
		if (!e.ok) {
			fehler++;
		}
	}
	console.log('\n' + (ergebnisse.length - fehler) + '/' + ergebnisse.length + ' bestanden');
	process.exit(fehler === 0 ? 0 : 1);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
