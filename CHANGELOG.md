# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/).

## [2.0.0] - 2026-09-17

Redesign-Linie (owncloud.online Redesign 11.1). Nur im Zweig `redesign`.
Keine Änderung am Betrachter nötig: im Redesign-Kern Ende zu Ende geprüft
(tests/visual/pruefe-pdfviewer.js, 18/18) – Öffnen aus der Dateiliste,
Blättern, Vergrößern, Suche, Herunterladen, Drucken, Schließen per Knopf und
Escape, öffentlicher Link auf Datei und Ordner, Freigabe ohne Download-Recht
(Hinweis statt Betrachter), 400 px, Schutz gegen CVE-2024-4367 aktiv.

### Changed

- Keine Links mehr auf Upstream-Domains; tote Upstream-CI (SonarCloud,
  Transifex) entfernt, Paketbau ohne fremde wiederverwendbare Workflows.

## [1.1.1] - 2026-08-13

### Changed

- Produktname, Beschreibung und übersetzte Zeichenketten nennen owncloud.online;
  Verweise auf Fehlerbereich, Repository und Dokumentation zeigen auf das eigene
  Repository. Screenshots aus fremden Repositories entfernt.

## [Unreleased] 

-

## [1.0.2] - 2024-01-16

### Fixes

- Upstream #331 - fix: hardening pdf processing by disabling scripting in pdf viewer


## [1.0.1] - 2021-10-05

### Fixes

- Links doesnt come up in new Tab or Window - Upstream #296
- [Android] links don't work in pdf_viewer v1.0.0rc1 - Upstream #298
- Menu bar is not translated - Upstream #305


## [1.0.0] - 2021-08-05

### Changed
- Update mozilla/pdfj.js lib to 2.9 (support digital signatues) - Upstream #288
- Dropped support for IE11 and (old) non-chromium-based Edge

## [0.12.2] - 2021-07-20

### Fixed

- fix close l10n - Upstream #285
- provide translations in app release - Upstream #280
- Fix typo - Upstream #271
- Added PublicPage and NoCSRFRequired to allow canDownload for users without a session (public share) - Upstream #269

## [0.12.1] - 2021-04-12

### Fixed

- Fix PDF files not viewable in shared folders via a public link - Upstream #266

## [0.12.0] - 2021-04-08

### Changed

- Update pdfjs to 2.5 - Upstream #228
- Add transifex - Upstream #248

### Fixed

- Show Notification if downloading pdf is forbidden - Upstream #234
- Enhance canDownload notification text - Upstream #237
- CSS fix close button - Upstream #262
- Fix wrong locale - Upstream #247


## [0.11.2] - 2020-08-04

### Fixed

- Fix load of character maps to allow proper rendering of some fonts - Upstream #217

### Changed

- Update libraries

## [0.11.1] - 2019-12-06

### Changed

- Drop PHP 7.0 - Upstream #198
- Allow opening pdf attachements - Upstream #196

### Fixed

- Fix close button for attachments - Upstream #205

## [0.11.0] - 2019-04-12

### Changed

- Update pdfjs to 1.10 - Upstream #177

## [0.10.0] - 2018-11-30

### Added

- add PHP 7.2 to stable10 branch - Upstream #159

### Changed

- set max version to 10 because core platform switches to Semver


## [0.9.0] - 2018-07-19

### Added
- Apply current locale to PDF viewer - Upstream #149

### Changed
- Update pdfjs to the most recent stable 1.9.426 - Upstream #146, #152

### Removed
- Removed IE8 support - Upstream #149
- Removed "Open document" from within the viewer - Upstream #149

### Fixed
- Fix missing tool buttons - Upstream #116
- Fix closing of PDF viewer - Upstream #142

## 0.8.2
### Changed
- First marketplace release
