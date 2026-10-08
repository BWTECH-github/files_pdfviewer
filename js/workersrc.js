/**
 * Checks if the page is displayed in an iframe. If not redirect to /.
 **/

/**
 * Der Wert des Abfrageparameters "file", gelesen wie pdf.js ihn liest
 * (parseQueryString in web/viewer.js): Schlüssel kleingeschrieben, bei
 * mehrfachem Vorkommen zählt der letzte, alles ab einem zweiten "=" fällt weg.
 *
 * Eine lockerere Lesart ("file=blob" irgendwo im Abfrageteil) ließe sich mit
 * "?file=/pfad/zur.pdf&x=file=blob" überlisten: Die Rahmenprüfung sähe die
 * Blob-Ansicht, pdf.js lüde den fremden Pfad (Nacharbeit 24.09.2026).
 */
function dateiParameter() {
	var teile = location.search.substring(1).split('&');
	var wert = null;
	for (var i = 0; i < teile.length; i++) {
		var paar = teile[i].split('=');
		try {
			if (decodeURIComponent(paar[0].toLowerCase()) !== 'file') {
				continue;
			}
			wert = paar.length > 1 ? decodeURIComponent(paar[1]) : null;
		} catch (e) {
			// Kaputte Kodierung: pdf.js wirft an derselben Stelle und lädt
			// nichts. Hier gilt das als "keine Blob-Ansicht".
			wert = null;
		}
	}
	return wert;
}

/**
 * Ist das die Blob-Ansicht (eigenes Fenster statt Rahmen)?
 *
 * location.search statt location.href: bei einem Anhaengsel wie
 * "...#?file=blob" enthaelt href die Zeichenkette ebenfalls, obwohl gar kein
 * Abfrageteil vorliegt. Damit liess sich der Rahmenschutz unten von aussen
 * aushebeln und der Betrachter auf oberster Ebene oeffnen.
 *
 * Die Rahmenprüfung ist keine Sicherheitsgrenze: Die Schutzvorgaben in
 * deferredViewerConfig gelten in jeder Ansicht, auch auf oberster Ebene. Sie
 * sorgt nur dafür, dass der Betrachter innerhalb der Anwendung läuft.
 */
function istBlobAnsicht() {
	return dateiParameter() === 'blob';
}

function redirectIfNotDisplayedInFrame () {
	try {
		if (window.frameElement || istBlobAnsicht()) {
			return;
		}
	} catch (e) {}

	window.location.href = '/';
}
redirectIfNotDisplayedInFrame();

function deferredViewerConfig() {
	if (istBlobAnsicht()) {
		document.getElementById('secondaryToolbarClose').addEventListener(
			'click',
			function() {
				window.close();
			}
		);
	}
	try {
		var head = document.getElementsByTagName('head')[0]
		// Die sicherheitsrelevanten Vorgaben ZUERST.
		//
		// pdf.js fuehrt fuer beide "true" als Standard. isEvalSupported=false
		// ist die Gegenmassnahme zu CVE-2024-4367: ohne sie kann eine
		// praeparierte PDF ueber ein Schriftartobjekt beliebiges JavaScript im
		// Ursprung der Anwendung ausfuehren.
		//
		// Frueher standen beide Zeilen am ENDE dieses Blocks, hinter
		// getSanitizedCurrentLocale(). Diese Funktion greift auf parent.OC zu
		// und wirft, sobald der Betrachter nicht im Rahmen der Anwendung
		// laeuft. Der leere catch unten verschluckte den Wurf - und mit ihm
		// alle Zeilen danach, also genau die zwei, auf die es ankommt.
		// Gemessen: oberste Ebene mit Anhaengsel "#?file=blob" lieferte
		// isEvalSupported=true und enableScripting=true.
		PDFViewerApplicationOptions.set('isEvalSupported', false);
		PDFViewerApplicationOptions.set('enableScripting', head.getAttribute('data-enableScripting') === 'true');
		PDFViewerApplicationOptions.set('disablePreferences', true);
		PDFViewerApplicationOptions.set('workerSrc', head.getAttribute('data-workersrc'));
		PDFViewerApplicationOptions.set('cMapUrl', head.getAttribute('data-cmapurl'));
		PDFViewerApplicationOptions.set('sandboxBundleSrc', head.getAttribute('data-sandbox'));
		PDFViewerApplicationOptions.set('printResolution', 300);
		PDFViewerApplicationOptions.set('externalLinkTarget', pdfjsLib.LinkTarget.BLANK);
		PDFViewerApplicationOptions.set('locale', getSanitizedCurrentLocale());
	} catch (e) {
	}
}

/**
 * Die Sprache der Anwendung - wurffest.
 *
 * parent.OC gibt es nur, wenn der Betrachter im Rahmen von owncloud.online
 * laeuft. Ausserhalb wirft der Zugriff; frueher riss das die ganze
 * Einstellungsfolge mit. Der Rueckfall auf die Browsersprache liefert dann
 * eine brauchbare Angabe, statt gar keine.
 */
function getSanitizedCurrentLocale(){
	try {
		var sprache = parent.OC.getLocale();
		if (sprache) {
			return String(sprache).replace('_', '-');
		}
	} catch (e) {}
	return String(navigator.language || 'en').replace('_', '-');
}

// Wait until viewer is ready and patch it on the fly
try {
	parent.document.addEventListener('webviewerloaded', deferredViewerConfig, true);
	parent.document.documentElement.lang = getSanitizedCurrentLocale();
} catch (e) {
	// Kein Zugriff auf das umgebende Dokument (oberste Ebene oder fremder
	// Ursprung). Dann bleibt es beim eigenen Dokument - die Vorgaben oben
	// setzt der Betrachter trotzdem, sobald er geladen ist.
	document.addEventListener('webviewerloaded', deferredViewerConfig, true);
}
