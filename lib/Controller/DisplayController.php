<?php
/**
 * @author Lukas Reschke
 * @copyright 2014 Lukas Reschke lukas@owncloud.com
 *
 * This file is licensed under the Affero General Public License version 3 or
 * later.
 * See the COPYING-README file.
 *
 * Modified by BW-Tech GmbH for owncloud.online PHP 8.4 compatibility.
 */

namespace OCA\Files_PdfViewer\Controller;

use OC\Files\Filesystem;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Share\Exceptions\ShareNotFound;
use OCP\Share\IManager;

class DisplayController extends Controller {
	/** @var IURLGenerator */
	private $urlGenerator;

	/** @var IManager */
	private $shareManager;

	/** @var IConfig */
	private $config;

	/**
	 * @param string $AppName
	 * @param IRequest $request
	 * @param IURLGenerator $urlGenerator
	 * @param IManager $shareManager
	 * @param IConfig $config
	 */
	public function __construct(
		$AppName,
		IRequest $request,
		IURLGenerator $urlGenerator,
		IManager $shareManager,
		IConfig $config
	) {
		parent::__construct($AppName, $request);
		$this->urlGenerator = $urlGenerator;
		$this->shareManager = $shareManager;
		$this->config = $config;
	}

	/**
	 * @PublicPage
	 * @NoCSRFRequired
	 *
	 * @return TemplateResponse
	 */
	public function showPdfViewer() {
		$params = [
			'urlGenerator' => $this->urlGenerator,
		];

		$response = new TemplateResponse($this->appName, 'viewer', $params, 'blank');

		$policy = new ContentSecurityPolicy();
		$policy->addAllowedChildSrcDomain('\'self\'');
		$policy->addAllowedFontDomain('data:');
		$policy->addAllowedImageDomain('*');
		$policy->addAllowedConnectDomain('blob: data:');
		// Kein 'unsafe-eval': workersrc.js setzt isEvalSupported=false, pdf.js
		// braucht dann kein eval (Gegenmaßnahme zu CVE-2024-4367). Nur die
		// Sandbox für PDF-Skripte (WebAssembly) braucht es; die gibt es nur mit
		// files_pdfviewer.enableScripting = 'yes', wie in templates/viewer.php.
		$enableScripting = $this->config->getSystemValue('files_pdfviewer.enableScripting', false) === 'yes';
		$policy->allowEvalScript($enableScripting);
		$response->setContentSecurityPolicy($policy);

		return $response;
	}

	/**
	 * Darf die angemeldete Person die Datei herunterladen?
	 *
	 * Keine öffentliche Seite: Nur dann meldet der Kern die Person vor dem
	 * Aufruf auch per Basic-Auth oder App-Passwort an (SecurityMiddleware,
	 * OC::handleLogin). Auf einer öffentlichen Seite bliebe eine solche
	 * Anfrage anonym, ohne Dateibereich. Ohne Anmeldung antwortet der Kern
	 * mit 401.
	 *
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 *
	 * @param string $path Pfad im Dateibereich der angemeldeten Person
	 * @return JSONResponse
	 */
	public function canDownload($path = '') {
		$storage = $this->getStorage($path);
		if ($storage === null) {
			// Eine Datei, die es nicht (mehr) gibt, ist kein fehlendes Recht
			return new JSONResponse(['canDownload' => false], Http::STATUS_NOT_FOUND);
		}

		if (!$storage->instanceOfStorage('OCA\Files_Sharing\SharedStorage')) {
			return new JSONResponse(['canDownload' => true]);
		}

		/** @var \OCA\Files_Sharing\SharedStorage $storage */
		'@phan-var \OCA\Files_Sharing\SharedStorage $storage';  /* @phpstan-ignore-line */
		return new JSONResponse(['canDownload' => $this->canDownloadShare($storage->getShare())]);
	}

	/**
	 * Darf über den öffentlichen Link heruntergeladen werden? Es zählt allein
	 * die Freigabe hinter dem Token.
	 *
	 * @PublicPage
	 * @NoCSRFRequired
	 *
	 * @param string $token
	 * @return JSONResponse
	 */
	public function canDownloadPublic($token) {
		try {
			$share = $this->shareManager->getShareByToken($token);
		} catch (ShareNotFound $e) {
			return new JSONResponse(['canDownload' => false], Http::STATUS_NOT_FOUND);
		}

		return new JSONResponse(['canDownload' => $this->canDownloadShare($share)]);
	}

	private function canDownloadShare($share) {
		$attributes = $share->getAttributes();
		if ($attributes === null) {
			return true;
		}

		$downloadPermission = $attributes->getAttribute('permissions', 'download');

		return $downloadPermission === null || $downloadPermission === true;
	}

	/**
	 * Speicher der Datei im Dateibereich der angemeldeten Person.
	 *
	 * @param string $path
	 * @return \OCP\Files\Storage|null null, wenn es die Datei dort nicht gibt
	 */
	protected function getStorage($path) {
		if (!\is_string($path) || $path === '') {
			return null;
		}

		try {
			$fileInfo = Filesystem::getFileInfo($path);
		} catch (\Throwable $e) {
			return null;
		}
		if ($fileInfo === null || $fileInfo === false) {
			return null;
		}

		return $fileInfo->getStorage();
	}
}
