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

use OC\AppFramework\Utility\ControllerMethodReflector;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\ContentSecurityPolicy;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Share\Exceptions\ShareNotFound;
use OCP\Share\IAttributes;
use OCP\Share\IShare;
use OCP\Share\IManager;
use Test\TestCase;

class DisplayControllerTest extends TestCase {
	/** @var string */
	private $appName;
	/** @var IRequest */
	private $request;
	/** @var IURLGenerator */
	private $urlGenerator;
	/** @var DisplayController */
	private $controller;
	/** @var IManager */
	private $shareManager;

	public function setUp(): void {
		$this->appName = 'files_pdfviewer';

		$this->request = $this->getMockBuilder(
			'\OCP\IRequest'
		)
			->disableOriginalConstructor()
			->getMock();
		$this->urlGenerator = $this->getMockBuilder(
			'\OCP\IUrlGenerator'
		)
			->disableOriginalConstructor()
			->getMock();

		$this->shareManager = $this->getMockBuilder(
			'\OCP\Share\IManager'
		)
			->disableOriginalConstructor()
			->getMock();

		$this->controller = $this->getMockBuilder('\OCA\Files_PdfViewer\Controller\DisplayController')->setConstructorArgs(
			[
				$this->appName,
				$this->request,
				$this->urlGenerator,
				$this->shareManager
			]
		)->onlyMethods(['getStorage'])->getMock();

		parent::setUp();
	}

	public function testShowPdfViewer() {
		$params = [
			'urlGenerator' => $this->urlGenerator
		];
		$expectedResponse = new TemplateResponse($this->appName, 'viewer', $params, 'blank');
		$policy = new ContentSecurityPolicy();
		$policy->addAllowedChildSrcDomain('\'self\'');
		$policy->addAllowedFontDomain('data:');
		$policy->addAllowedImageDomain('*');
		$policy->addAllowedConnectDomain('blob: data:');
		$policy->allowEvalScript(true);
		$expectedResponse->setContentSecurityPolicy($policy);

		$this->assertEquals($expectedResponse, $this->controller->showPdfViewer());
	}

	/**
	 * Der Betrachter macht <body> nicht per tabindex zum Tab-Halt: Er hätte
	 * keinen sichtbaren Fokus und läge vor dem ersten Bedienelement.
	 */
	public function testViewerBodyIsNoTabStop() {
		$this->urlGenerator->method('linkTo')->willReturn('/apps/files_pdfviewer/js/datei.js');

		$html = $this->controller->showPdfViewer()->render();

		$dokument = new \DOMDocument();
		$vorher = \libxml_use_internal_errors(true);
		$dokument->loadHTML($html);
		\libxml_clear_errors();
		\libxml_use_internal_errors($vorher);
		$body = $dokument->getElementsByTagName('body')->item(0);
		$this->assertNotNull($body);
		$this->assertFalse($body->hasAttribute('tabindex'));
	}

	/**
	 * Die Prüfung für Dateien der angemeldeten Person ist keine öffentliche
	 * Seite: Die Anmeldung (Sitzung oder Basic-Auth) prüft der Kern wie bei
	 * jeder anderen Route, ohne Anmeldung antwortet er mit 401.
	 */
	public function testCanDownloadRequiresLogin() {
		$reflector = new ControllerMethodReflector();
		$reflector->reflect(DisplayController::class, 'canDownload');

		$this->assertFalse($reflector->hasAnnotation('PublicPage'));
		$this->assertTrue($reflector->hasAnnotation('NoAdminRequired'));
	}

	public function testCanDownloadPublicIsPublicPage() {
		$reflector = new ControllerMethodReflector();
		$reflector->reflect(DisplayController::class, 'canDownloadPublic');

		$this->assertTrue($reflector->hasAnnotation('PublicPage'));
	}

	public function testRoutesSeparateLoggedInAndPublicLink() {
		$routes = require __DIR__ . '/../../../appinfo/routes.php';

		$this->assertContains(['name' => 'display#canDownload', 'url' => '/candownload', 'verb' => 'GET'], $routes['routes']);
		$this->assertContains(['name' => 'display#canDownloadPublic', 'url' => '/s/{token}/candownload', 'verb' => 'GET'], $routes['routes']);
	}

	public function testOwnFileCanBeDownloaded() {
		$storage = $this->createMock('\OCP\Files\Storage');
		$storage->method('instanceOfStorage')->willReturn(false);
		$this->controller->expects($this->once())->method('getStorage')->with('/Ordner/test.pdf')->willReturn($storage);

		$expectedResponse = new JSONResponse(['canDownload' => true]);
		$this->assertEquals($expectedResponse, $this->controller->canDownload('/Ordner/test.pdf'));
	}

	public function testSharedFileWithDownloadDisabledCannotBeDownloaded() {
		$attributes = $this->createMock(IAttributes::class);
		$attributes->method('getAttribute')->with('permissions', 'download')->willReturn(false);
		$share = $this->createMock(IShare::class);
		$share->method('getAttributes')->willReturn($attributes);
		$storage = $this->getMockForAbstractClass(SharedStorageDouble::class, [], '', false);
		$storage->method('instanceOfStorage')->with('OCA\Files_Sharing\SharedStorage')->willReturn(true);
		$storage->method('getShare')->willReturn($share);
		$this->controller->expects($this->once())->method('getStorage')->with('/Freigabe/geschuetzt.pdf')->willReturn($storage);

		$expectedResponse = new JSONResponse(['canDownload' => false]);
		$this->assertEquals($expectedResponse, $this->controller->canDownload('/Freigabe/geschuetzt.pdf'));
	}

	public function testSharedFileWithoutAttributesCanBeDownloaded() {
		$share = $this->createMock(IShare::class);
		$share->method('getAttributes')->willReturn(null);
		$storage = $this->getMockForAbstractClass(SharedStorageDouble::class, [], '', false);
		$storage->method('instanceOfStorage')->with('OCA\Files_Sharing\SharedStorage')->willReturn(true);
		$storage->method('getShare')->willReturn($share);
		$this->controller->expects($this->once())->method('getStorage')->with('/Freigabe/offen.pdf')->willReturn($storage);

		$expectedResponse = new JSONResponse(['canDownload' => true]);
		$this->assertEquals($expectedResponse, $this->controller->canDownload('/Freigabe/offen.pdf'));
	}

	/**
	 * Eine Datei, die es (nicht mehr) gibt, ist kein fehlendes Download-Recht.
	 */
	public function testUnknownPathAnswersNotFound() {
		$this->controller->expects($this->once())->method('getStorage')->with('/weg.pdf')->willReturn(null);

		$expectedResponse = new JSONResponse(['canDownload' => false], Http::STATUS_NOT_FOUND);
		$this->assertEquals($expectedResponse, $this->controller->canDownload('/weg.pdf'));
	}

	public function testPublicShareWithDownloadDisabled() {
		$this->controller->expects($this->never())->method('getStorage');

		$attributes = $this->createMock(IAttributes::class);
		$attributes->expects($this->once())->method('getAttribute')->with('permissions', 'download')->willReturn(false);

		$share = $this->createMock(IShare::class);
		$share->expects($this->once())->method('getAttributes')->willReturn($attributes);

		$this->shareManager->expects($this->once())->method('getShareByToken')->with('token')->willReturn($share);

		$expectedResponse = new JSONResponse(['canDownload' => false]);
		$this->assertEquals($expectedResponse, $this->controller->canDownloadPublic('token'));
	}

	public function testPublicShareWithDownloadAllowedByDefault() {
		$this->controller->expects($this->never())->method('getStorage');

		$attributes = $this->createMock(IAttributes::class);
		$attributes->expects($this->once())->method('getAttribute')->with('permissions', 'download')->willReturn(null);

		$share = $this->createMock(IShare::class);
		$share->expects($this->once())->method('getAttributes')->willReturn($attributes);

		$this->shareManager->expects($this->once())->method('getShareByToken')->with('token')->willReturn($share);

		$expectedResponse = new JSONResponse(['canDownload' => true]);
		$this->assertEquals($expectedResponse, $this->controller->canDownloadPublic('token'));
	}

	public function testPublicShareWithoutAttributes() {
		$this->controller->expects($this->never())->method('getStorage');

		$share = $this->createMock(IShare::class);
		$share->expects($this->once())->method('getAttributes')->willReturn(null);

		$this->shareManager->expects($this->once())->method('getShareByToken')->with('token')->willReturn($share);

		$expectedResponse = new JSONResponse(['canDownload' => true]);
		$this->assertEquals($expectedResponse, $this->controller->canDownloadPublic('token'));
	}

	public function testUnknownTokenAnswersNotFound() {
		$this->shareManager->expects($this->once())->method('getShareByToken')->with('gibtsnicht')->willThrowException(new ShareNotFound());

		$expectedResponse = new JSONResponse(['canDownload' => false], Http::STATUS_NOT_FOUND);
		$this->assertEquals($expectedResponse, $this->controller->canDownloadPublic('gibtsnicht'));
	}
}

/**
 * Freigegebener Speicher, wie ihn der Kern liefert: getShare() reicht ein
 * Speicher-Wrapper per __call an OCA\Files_Sharing\SharedStorage durch.
 */
abstract class SharedStorageDouble implements \OCP\Files\Storage {
	public function __construct($parameters) {
	}

	abstract public function getShare();
}
