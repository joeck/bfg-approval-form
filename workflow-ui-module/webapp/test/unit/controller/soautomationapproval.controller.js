/*global QUnit*/

sap.ui.define([
	"bfgmgntappr/workflow-ui-module/controller/soautomationapproval.controller"
], function (Controller) {
	"use strict";

	QUnit.module("soautomationapproval Controller");

	QUnit.test("I should test the soautomationapproval controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
