sap.ui.define(
  [
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "bfgmgntappr/workflowuimodule/model/models",
  ],
  function (UIComponent, Device, models) {
    "use strict";

    return UIComponent.extend(
      "bfgmgntappr.workflowuimodule.Component",
      {
        metadata: {
          manifest: "json",
        },

        /**
         * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
         * @public
         * @override
         */
        init: function () {
          // call the base component's init function
          UIComponent.prototype.init.apply(this, arguments);

          // enable routing
          this.getRouter().initialize();

          // set the device model
          this.setModel(models.createDeviceModel(), "device");

          this.setTaskModels();

          this.getInboxAPI().addAction(
            {
              action: "APPROVE",
              label: "Approve",
              type: "accept", // (Optional property) Define for positive appearance
            },
            function () {
              this.completeTask(true);
            },
            this
          );

          this.getInboxAPI().addAction(
            {
              action: "REJECT",
              label: "Reject",
              type: "reject", // (Optional property) Define for negative appearance
            },
            function () {
              this.completeTask(false);
            },
            this
          );
        },

        setTaskModels: function () {
          // set the task model
          var startupParameters = this.getComponentData().startupParameters;
          this.setModel(startupParameters.taskModel, "task");

          // set the task context model
          var taskContextModel = new sap.ui.model.json.JSONModel(
            this._getTaskInstancesBaseURL() + "/context"
          );
          this.setModel(taskContextModel, "context");
        },

        _getTaskInstancesBaseURL: function () {
          return (
            this._getWorkflowRuntimeBaseURL() +
            "/task-instances/" +
            this.getTaskInstanceID()
          );
        },

        _getWorkflowRuntimeBaseURL: function () {
          var appId = this.getManifestEntry("/sap.app/id");
          var appPath = appId.replaceAll(".", "/");
          var appModulePath = jQuery.sap.getModulePath(appPath);

          return appModulePath + "/bpmworkflowruntime/v1";
        },

        getTaskInstanceID: function () {
          return this.getModel("task").getData().InstanceID;
        },

        getInboxAPI: function () {
          var startupParameters = this.getComponentData().startupParameters;
          return startupParameters.inboxAPI;
        },

        completeTask: function (approvalStatus) {
          this.getModel("context").setProperty("/approved", approvalStatus);
          this._patchTaskInstance();
          this._refreshTaskList();
        },

        _patchTaskInstance: function () {
          var contextData = this.getModel("context").getData();
          var enrichment = contextData.enrichment
          var items = contextData.LineItems.map(item => ({
            // SalesOrderItem: "10", // generated ID
            PurchaseOrderByCustomer: enrichment.partner.id,
            Material: item.SupplierMaterialNumber, // TODO enrichment
            ExternalItemID : item.CustomerMaterialNumber,
            RequestedQuantity: item.Quantity,
            RequestedQuantityUnit: item.UnitOfMeasure,
            // ProductionPlant: "5200", // determined by material number 
            // StorageLocation: "6020", // determined by material number 
            // ShippingPoint: "5205", // determined by material number 
            // NetAmount: "500.00", // calculated by pricing terms
            DeliveryPriority: "",
            DeliveryDateQuantityIsFixed: false,
            // MatlAccountAssignmentGroup: "03", // not mandatory
            // CustomerPaymentTerms: "0004" // not mandatory
          }))

          var data = {
            status: "COMPLETED",
            context: {
              ...contextData,
              salesOrder: {
                "SalesOrderType": "ZNOA", // Constant
                "SalesOrganization": "1000", // Constant
                "DistributionChannel": "30", // Constant 30 (externnal) or 50 (internal)
                "OrganizationDivision": "01", // Constant
                "SoldToParty": enrichment.partner.id,
                // "TotalNetAmount": undefined, // calculated on S/4 side
                "PurchaseOrderByCustomer": contextData.documentNumber,
                "TransactionCurrency": contextData.Currency,
                "RequestedDeliveryDate" : contextData.deliveryDate,
                // "CustomerPaymentTerms": "0004", // not mandatory
                "to_Item": {
                  "results": items
                }
              }
            }
          };

          jQuery.ajax({
            url: this._getTaskInstancesBaseURL(),
            method: "PATCH",
            contentType: "application/json",
            async: false,
            data: JSON.stringify(data),
            headers: {
              "X-CSRF-Token": this._fetchToken(),
            },
          });
        },

        _fetchToken: function () {
          var fetchedToken;

          jQuery.ajax({
            url: this._getWorkflowRuntimeBaseURL() + "/xsrf-token",
            method: "GET",
            async: false,
            headers: {
              "X-CSRF-Token": "Fetch",
            },
            success(result, xhr, data) {
              fetchedToken = data.getResponseHeader("X-CSRF-Token");
            },
          });
          return fetchedToken;
        },

        _refreshTaskList: function () {
          this.getInboxAPI().updateTask("NA", this.getTaskInstanceID());
        },
      }
    );
  }
);
