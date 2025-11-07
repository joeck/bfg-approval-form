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

          const approveOutcomeId = "approve";
          this.getInboxAPI().addAction(
            {
              action: "APPROVE",
              label: "Approve",
              type: "accept", // (Optional property) Define for positive appearance
            },
            function () {
              this.completeTask(true, approveOutcomeId);
            },
            this
          );

          const rejectOutcomeId = "reject";
          this.getInboxAPI().addAction(
            {
              action: "REJECT",
              label: "Reject",
              type: "reject", // (Optional property) Define for negative appearance
            },
            function () {
              this.completeTask(false, rejectOutcomeId);
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

        completeTask: function (approvalStatus, outcomeId) {
          this.getModel("context").setProperty("/approved", approvalStatus);
          this._patchTaskInstance(outcomeId);
          this._refreshTaskList();
        },

        _patchTaskInstance: function (outcomeId) {
          var contextData = this.getModel("context").getData();
          var enrichment = contextData.edit.enrichment
          var items = contextData.edit.LineItems.map(item => ({
            // SalesOrderItem: "10", // generated ID
            PurchaseOrderByCustomer: contextData.edit.PurchaseOrder,
            Material: item.SupplierMaterialNumber, // TODO enrichment
            ExternalItemID : item.CustomerMaterialNumber,
            RequestedQuantity: item.Quantity,
            RequestedQuantityUnit: item.UnitOfMeasure,
            // ProductionPlant: "5200", // determined by material number 
            // StorageLocation: "6020", // determined by material number 
            // ShippingPoint: "5205", // determined by material number 
            // NetAmount: "500.00", // calculated by pricing terms
            // DeliveryPriority: "",
            // DeliveryDateQuantityIsFixed: false,
            // MatlAccountAssignmentGroup: "03", // not mandatory
            // CustomerPaymentTerms: "0004" // not mandatory
          }))

          var data = {
            status: "COMPLETED",
            decision: outcomeId,
            context: {
              ...contextData,
              comment: contextData.comment || '',
              lineItems: JSON.stringify(contextData.edit.LineItems),
              salesOrder: {
                "SalesOrderType": "ZNOA", // Constant
                "SalesOrganization": "1000", // Constant
                "DistributionChannel": "30", // Constant 30 (externnal) or 50 (internal)
                "OrganizationDivision": "01", // Constant
                "SoldToParty": enrichment?.sender?.id || contextData.edit.SoldTo.ID,
                // "TotalNetAmount": undefined, // calculated on S/4 side
                "PurchaseOrderByCustomer": contextData.edit.PurchaseOrder,
                "TransactionCurrency": contextData.edit.Currency,
                "RequestedDeliveryDate" : this._convertDDMMYYYYToMSJSONDate(contextData.edit.DeliveryDate),
                // "CustomerPaymentTerms": "0004", // not mandatory
                "to_Item": {
                  "results": items
                }
              }
            }
          };

          delete data.context.edit; // remove edit object before sending

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

        /**
         * Converts a date string from various Swiss formats to Microsoft JSON date format \/Date(timestamp)\/
         * Supports formats: 
         * - DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YY, DD/MM/YY, DD-MM-YY
         * - DD. Monat YYYY, DD Monat YYYY (e.g., "21. Oktober 2025", "21 Okt 2025")
         * - YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD (ISO and variants)
         * Uses CET timezone (Central European Time) for delivery dates
         * @param {string} dateString - Date string in various Swiss formats
         * @returns {string|null} - Microsoft JSON date format "\/Date(timestamp)\/" or "" if invalid
         */
        _convertDDMMYYYYToMSJSONDate: function (dateString) {
          if (!dateString) {
            return "";
          }
          
          try {
            const trimmedDate = dateString.trim();
            
            // German/Swiss month names mapping
            const monthNames = {
              'januar': 0, 'jan': 0, 'jänner': 0,
              'februar': 1, 'feb': 1, 'feber': 1,
              'märz': 2, 'mär': 2, 'maerz': 2,
              'april': 3, 'apr': 3,
              'mai': 4,
              'juni': 5, 'jun': 5,
              'juli': 6, 'jul': 6,
              'august': 7, 'aug': 7,
              'september': 8, 'sep': 8, 'sept': 8,
              'oktober': 9, 'okt': 9,
              'november': 10, 'nov': 10,
              'dezember': 11, 'dez': 11
            };
            
            let day, month, year;
            
            // Check for written month formats (DD. Monat YYYY or DD Monat YYYY)
            const writtenMonthPattern = /^(\d{1,2})\.?\s+(\w+)\s+(\d{2,4})$/i;
            const writtenMonthMatch = trimmedDate.match(writtenMonthPattern);
            
            if (writtenMonthMatch) {
              day = parseInt(writtenMonthMatch[1], 10);
              const monthName = writtenMonthMatch[2].toLowerCase();
              month = monthNames[monthName];
              year = parseInt(writtenMonthMatch[3], 10);
              
              if (month === undefined) {
                return ""; // Unknown month name
              }
            }
            // Check for YYYY-first formats (YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD)
            else if (/^\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2}$/.test(trimmedDate)) {
              const yearFirstParts = trimmedDate.split(/[\.\-\/]/);
              year = parseInt(yearFirstParts[0], 10);
              month = parseInt(yearFirstParts[1], 10) - 1; // 0-based
              day = parseInt(yearFirstParts[2], 10);
            }
            // Standard DD.MM.YYYY formats with various separators
            else {
              // Normalize separators to dots
              let normalizedDate = trimmedDate.replace(/[\/\-]/g, '.');
              const parts = normalizedDate.split('.');
              
              if (parts.length !== 3) {
                return "";
              }
              
              day = parseInt(parts[0], 10);
              month = parseInt(parts[1], 10) - 1; // 0-based
              year = parseInt(parts[2], 10);
            }
            
            // Handle 2-digit years (always assume 21st century: 2000-2099)
            if (year < 100) {
              year += 2000;
            }
            
            // Validate the parsed values
            if (isNaN(day) || isNaN(month) || isNaN(year) || 
                day < 1 || day > 31 || month < 0 || month > 11 || year < 1900 || year > 2100) {
              return "";
            }
            
            // Create date object in CET timezone
            // CET is UTC+1, CEST (summer time) is UTC+2
            // Create date in local time first, then adjust to CET
            const date = new Date(year, month, day);
            if (isNaN(date.getTime())) {
              return "";
            }
            
            // Additional validation: check if the date is valid (e.g., not Feb 30th)
            if (date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) {
              return "";
            }
            
            // Convert to CET timezone explicitly
            // CET is UTC+1 (winter) or UTC+2 (summer/CEST)
            // Create the date in CET by adjusting from UTC
            const utcDate = new Date(Date.UTC(year, month, day, 12, 0, 0)); // Noon UTC
            
            // Determine if the date falls in CET (UTC+1) or CEST (UTC+2)
            // CEST runs from last Sunday in March to last Sunday in October
            const isCEST = this._isCEST(utcDate);
            const cetOffsetHours = isCEST ? 2 : 1; // UTC+2 for CEST, UTC+1 for CET
            
            // Adjust to CET/CEST
            const cetTimestamp = utcDate.getTime() + (cetOffsetHours * 60 * 60 * 1000);
            
            return "\\/Date(" + cetTimestamp + ")\\/";
          } catch (e) {
            return "";
          }
        },

        /**
         * Determine if a given date falls within CEST (Central European Summer Time)
         * CEST runs from last Sunday in March to last Sunday in October
         * @param {Date} date - The date to check
         * @returns {boolean} - True if date is in CEST period
         */
        _isCEST: function(date) {
          const year = date.getUTCFullYear();
          
          // Find last Sunday in March
          const marchLastSunday = this._getLastSundayOfMonth(year, 2); // March = 2
          
          // Find last Sunday in October  
          const octoberLastSunday = this._getLastSundayOfMonth(year, 9); // October = 9
          
          return date >= marchLastSunday && date < octoberLastSunday;
        },

        /**
         * Get the last Sunday of a given month/year
         * @param {number} year - The year
         * @param {number} month - The month (0-based, so March = 2)
         * @returns {Date} - Date object for the last Sunday
         */
        _getLastSundayOfMonth: function(year, month) {
          // Get the last day of the month
          const lastDay = new Date(Date.UTC(year, month + 1, 0));
          
          // Find the last Sunday (day 0 = Sunday)
          const dayOfWeek = lastDay.getUTCDay();
          const daysToSubtract = dayOfWeek === 0 ? 0 : dayOfWeek;
          
          const lastSunday = new Date(Date.UTC(year, month + 1, 0 - daysToSubtract, 2, 0, 0)); // 2 AM UTC
          return lastSunday;
        },
      }
    );
  }
);
