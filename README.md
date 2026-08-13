files_pdfviewer
======

<!-- Modified by BW-Tech GmbH for owncloud.online PHP 8.4 compatibility. -->

This application integrates the [PDF.js](https://mozilla.github.io/pdf.js/) library into owncloud.online. Using this application users can view their PDF files online without downloading the file.

Modified by BW-Tech GmbH for owncloud.online. This fork keeps the original owncloud.online files_pdfviewer behavior and targets PHP 8.4.

Instructions to update pdfjs
===========
1. Prerequisites
- Install npm
- Install bower
- Install gulp

2. Update pdfjs version in bower.json

3. Run `make rebuild-pdfjs`

4. New version of the library will be in `js/vendor/pdfjs`

5. Check if `templates/viewer.php` needs to be updated to match `js/vendor/pdfjs/web/viewer.html`

6. Test the app ;)

Maintainers
===========
- [Lukas Reschke](https://github.com/LukasReschke)
