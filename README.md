# PDF-Ansicht

Zeigt PDF-Dateien direkt im Browser an, statt sie herunterzuladen. Ein Klick auf
die Datei öffnet sie in der Ansicht — mit Seitennavigation, Zoom, Suche im
Dokument und Druckfunktion.

Grundlage ist [PDF.js](https://mozilla.github.io/pdf.js/) von Mozilla. Die
Anzeige läuft vollständig im Browser; die Datei wird dafür nicht auf einem
fremden Dienst verarbeitet.

## Was die App tut

* macht sich zur Standardaktion für `application/pdf` in der Dateiliste
* zeigt auch PDF-Dateien an, die über einen **öffentlichen Link** geteilt
  wurden — Empfänger ohne Konto sehen das Dokument, ohne es herunterzuladen
* braucht einen aktuellen Browser; mit dem Internet Explorer und den alten,
  nicht auf Chromium beruhenden Ausgaben von Edge funktioniert sie nicht

## Voraussetzungen

* owncloud.online 11.x
* PHP 8.4

## Installation

Über den Market, oder von Hand:

```bash
cd /var/www/owncloud.online/apps
git clone https://github.com/BWTECH-github/files_pdfviewer.git
chown -R www-data:www-data files_pdfviewer
sudo -u www-data php8.4 ../occ app:enable files_pdfviewer
```

Es gibt nichts einzustellen. Wer die Ansicht nicht möchte, deaktiviert die App —
dann werden PDF-Dateien wieder heruntergeladen.

## Fehlersuche

| Symptom | Ursache | Abhilfe |
| --- | --- | --- |
| PDF wird heruntergeladen statt angezeigt | App ist nicht aktiviert, oder eine andere App hat die Standardaktion übernommen | `occ app:list` prüfen; konkurrierende Vorschau-App deaktivieren |
| Leere Seite in der Ansicht | Browser zu alt, oder die Sicherheitsrichtlinie des Browsers blockiert die Anzeige | aktuellen Browser verwenden; Meldungen in der Browser-Konsole ansehen |
| Öffentlicher Link zeigt keine Vorschau | Die Freigabe erlaubt kein Herunterladen, oder die App war beim Anlegen des Links nicht aktiv | Berechtigungen der Freigabe prüfen |

## PDF.js aktualisieren

Nur für die Entwicklung. Nötig sind `npm`, `bower` und `gulp`.

1. Version in `bower.json` anheben.
2. `make rebuild-pdfjs` ausführen — das Ergebnis landet in `js/vendor/pdfjs`.
3. Prüfen, ob `templates/viewer.php` an `js/vendor/pdfjs/web/viewer.html`
   angeglichen werden muss; die Vorlage weicht bewusst ab, wird aber bei
   größeren Sprüngen sonst inkompatibel.
4. Anzeige, Suche, Druck und einen öffentlichen Link durchprobieren.

## Herkunft

Fork der gleichnamigen ownCloud-App, gepflegt von der BW-Tech GmbH für
owncloud.online und PHP 8.4. Lizenz: AGPLv3.
