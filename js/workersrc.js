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

/**
 * Tastaturfokus in den Ebenen von pdf.js: Werkzeugmenü, Suchleiste und die
 * Dialoge (Passwortabfrage, Dokumenteigenschaften, Druckfortschritt).
 *
 * pdf.js lässt den Fokus beim Schließen einer Ebene auf dem nun unsichtbaren
 * Element stehen, er fiel damit auf <body>. In die Passwortabfrage setzt
 * pdf.js ihn eingebettet gar nicht, und aus einem offenen Dialog lief Tab
 * wegen der positiven tabindex-Werte der Werkzeugleiste auf die verdeckten
 * Knöpfe dahinter.
 *
 * @param {object} app PDFViewerApplication, fertig eingerichtet
 */
function fokusFuehren(app) {
	var dialoge = app.overlayManager;
	if (!dialoge || dialoge.ocoFokus) {
		return;
	}
	dialoge.ocoFokus = true;
	var ausloeser = null;

	function bedienbar(el) {
		return !!(el && el !== document.body && el.isConnected && !el.disabled &&
			el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
	}

	function offenerDialog() {
		return dialoge.active ? document.getElementById(dialoge.active) : null;
	}

	function halte(dialog) {
		return Array.prototype.filter.call(
			dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'),
			bedienbar
		);
	}

	function inDenDialog(dialog) {
		var erster = halte(dialog)[0];
		if (erster) {
			erster.focus();
		}
	}

	// Zurück auf den Auslöser. Lag er in einer inzwischen geschlossenen Ebene,
	// auf den Knopf, der sie öffnet, sonst auf die Dokumentfläche.
	function zurueck(el) {
		var ziel = el;
		if (!bedienbar(ziel)) {
			var ebene = el && el.closest ? el.closest('#secondaryToolbar, #findbar') : null;
			ziel = document.getElementById(ebene ? (ebene.id === 'findbar' ? 'viewFind' : 'secondaryToolbarToggle') : 'viewerContainer');
		}
		if (bedienbar(ziel)) {
			ziel.focus();
		}
	}

	var oeffnen = dialoge.open;
	dialoge.open = function () {
		var vorher = document.activeElement;
		return oeffnen.apply(dialoge, arguments).then(function (wert) {
			ausloeser = vorher;
			var dialog = offenerDialog();
			if (dialog) {
				inDenDialog(dialog);
			}
			return wert;
		});
	};

	var schliessen = dialoge.close;
	dialoge.close = function () {
		return schliessen.apply(dialoge, arguments).then(function (wert) {
			if (!dialoge.active && !bedienbar(document.activeElement)) {
				zurueck(ausloeser);
			}
			ausloeser = null;
			return wert;
		});
	};

	// Tab und Umschalt+Tab bleiben im offenen Dialog
	window.addEventListener('keydown', function (e) {
		var dialog = e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey ? offenerDialog() : null;
		if (!dialog) {
			return;
		}
		e.preventDefault();
		var liste = halte(dialog);
		if (!liste.length) {
			return;
		}
		var i = liste.indexOf(document.activeElement);
		liste[e.shiftKey ? (i > 0 ? i - 1 : liste.length - 1) : (i + 1) % liste.length].focus();
	}, true);

	// Fokus, der hinter einen offenen Dialog gerät (etwa der Startfokus auf
	// der Dokumentfläche, während die Passwortabfrage schon offen ist)
	document.addEventListener('focusin', function (e) {
		var dialog = offenerDialog();
		if (dialog && !dialog.contains(e.target)) {
			inDenDialog(dialog);
		}
	}, true);

	// Werkzeugmenü und Suchleiste: Stand der Fokus darin, geht er beim
	// Schließen auf den Knopf, der sie öffnet
	function knopfNachSchliessen(ebene, leisteId, knopfId) {
		var leiste = document.getElementById(leisteId);
		if (!ebene || !leiste || typeof ebene.close !== 'function') {
			return;
		}
		var schliesseEbene = ebene.close;
		ebene.close = function () {
			var offen = !leiste.classList.contains('hidden');
			var vorher = document.activeElement;
			var ergebnis = schliesseEbene.apply(ebene, arguments);
			// Öffnet ein Menüeintrag einen Dialog, führt der den Fokus
			if (offen && leiste.classList.contains('hidden') && !offenerDialog() &&
				(!vorher || vorher === document.body || leiste.contains(vorher))) {
				zurueck(document.getElementById(knopfId));
			}
			return ergebnis;
		};
	}
	knopfNachSchliessen(app.secondaryToolbar, 'secondaryToolbar', 'secondaryToolbarToggle');
	knopfNachSchliessen(app.findBar, 'findbar', 'viewFind');
}

// viewer.js ist dann geladen; seine Einrichtung läuft asynchron
document.addEventListener('DOMContentLoaded', function () {
	if (window.PDFViewerApplication && PDFViewerApplication.initializedPromise) {
		PDFViewerApplication.initializedPromise.then(function () {
			fokusFuehren(PDFViewerApplication);
		});
	}
});

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
