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
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Share\IManager;

class DisplayController extends Controller {
	/** @var IURLGenerator */
	private $urlGenerator;

	/** @var IManager */
	private $shareManager;

	/**
	 * @param string $AppName
	 * @param IRequest $request
	 * @param IURLGenerator $urlGenerator
	 * @param IManager $shareManager
	 */
	public function __construct(
		$AppName,
		IRequest $request,
		IURLGenerator $urlGenerator,
		IManager $shareManager
	) {
		parent::__construct($AppName, $request);
		$this->urlGenerator = $urlGenerator;
		$this->shareManager = $shareManager;
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
		$policy->allowEvalScript(true);
		$response->setContentSecurityPolicy($policy);

		return $response;
	}

	/**
	 * @PublicPage
	 * @NoCSRFRequired
	 * @return JSONResponse
	 */

	public function canDownload() {
		$canDownload = true;
		$params = $this->request->getParams();

		if (!empty($params['sharingToken'])) {
			return new JSONResponse([
				'canDownload' => $this->canDownloadShareByToken($params['sharingToken'])
			]);
		}

		$storage = $this->getStorage($params);
		if ($storage === null) {
			return new JSONResponse(['canDownload' => false]);
		}

		if (!$storage->instanceOfStorage('OCA\Files_Sharing\SharedStorage')) {
			return new JSONResponse(['canDownload' => $canDownload]);
		}

		/** @var \OCA\Files_Sharing\SharedStorage $storage */
		'@phan-var \OCA\Files_Sharing\SharedStorage $storage';  /* @phpstan-ignore-line */
		$share = $storage->getShare();
		$canDownload = $this->canDownloadShare($share);

		return new JSONResponse(['canDownload' => $canDownload]);
	}

	private function canDownloadShareByToken($token) {
		try {
			$share = $this->shareManager->getShareByToken($token);
			return $this->canDownloadShare($share);
		} catch (\Throwable $e) {
			return false;
		}
	}

	private function canDownloadShare($share) {
		$attributes = $share->getAttributes();
		if ($attributes === null) {
			return true;
		}

		$downloadPermission = $attributes->getAttribute('permissions', 'download');

		return $downloadPermission === null || $downloadPermission === true;
	}

	protected function getStorage($params) {
		try {
			if (!empty($params['sharingToken'])) {
				$share = $this->shareManager->getShareByToken($params['sharingToken']);
				return $share->getNode()->getStorage();
			}

			if (empty($params['path'])) {
				return null;
			}

			$fileInfo = Filesystem::getFileInfo($params['path']);
			if ($fileInfo === null || $fileInfo === false) {
				return null;
			}

			return $fileInfo->getStorage();
		} catch (\Throwable $e) {
			return null;
		}
	}
}
