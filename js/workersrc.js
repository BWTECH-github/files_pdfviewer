/**
 * Checks if the page is displayed in an iframe. If not redirect to /.
 **/

/**
 * Ist das die Blob-Ansicht (eigenes Fenster statt Rahmen)?
 *
 * location.search statt location.href: bei einem Anhaengsel wie
 * "...#?file=blob" enthaelt href die Zeichenkette ebenfalls, obwohl gar kein
 * Abfrageteil vorliegt. Damit liess sich der Rahmenschutz unten von aussen
 * aushebeln und der Betrachter auf oberster Ebene oeffnen.
 */
function istBlobAnsicht() {
	return location.search.indexOf('file=blob') !== -1;
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
