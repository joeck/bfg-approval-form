sap.ui.define(
    [
      "sap/ui/core/mvc/Controller",
      "sap/ui/model/json/JSONModel"
    ],
    function(BaseController, JSONModel) {
      "use strict";
  
      return BaseController.extend("bfgmgntappr.workflowuimodule.controller.App", {
        onInit() {
          console.log("Hello form App.controller");
          const oRawDataObject = this.getOwnerComponent().getModel("context").getData();
          this.setExtractionData(oRawDataObject);
        },

        /**
         * Public method to inject raw extraction JSON (the structure you posted).
         * @param {object} rawData
         */
        setExtractionData(rawData) {
          if (!rawData) return;

          const headerMap = this._indexHeaderData(rawData.headerData || []);
          const contextData = {};

          // Header level
          const poNumber = this._val(headerMap, "documentNumber");
          const docDate = this._val(headerMap, "documentDate");
          const netAmount = this._val(headerMap, "netAmount");
          const currency = this._val(headerMap, "currencyCode");

          contextData.documentTitle = poNumber ? `Sales Order ${poNumber}` : "Sales Order";
          contextData.PurchaseOrder = poNumber || "";
          contextData.PurchaseOrderDate = docDate || "";
          contextData.Amount = netAmount || "";
          contextData.Currency = currency || "";

          // Sold-To (sender)
          contextData.SoldTo = this._buildParty("sender", headerMap, {
            nameKey: "senderName",
            namePreferred: null, // (not present in sample)
            streetKeys: ["senderStreet", "senderHouseNumber", "senderExtraAddressPart"],
            cityKey: "senderCity",
            stateKey: "senderState",
            postalKey: "senderPostalCode"
          });
          
          if (rawData.enrichment?.sender){
            // Sold-To (sender enrichment)
            contextData.SoldTo.Enrichment = this._buildPartyEnrichment(rawData.enrichment.sender);
          }

          // Ship-To
          contextData.ShipTo = this._buildParty("shipTo", headerMap, {
            nameKey: "shipToName",
            streetKeys: ["shipToStreet", "shipToHouseNumber"],
            cityKey: "shipToCity",
            stateKey: "shipToState",
            postalKey: "shipToPostalCode"
          });

          // Comments
          const commentRaw = this._val(headerMap, "comment");
          if (commentRaw && typeof commentRaw === "string") {
            const lines = commentRaw
              .split(/\r?\n/)
              .map(l => l.trim())
              .filter(l => l.length);
            contextData.Comments = lines.length > 1 ? lines : commentRaw; // array or single string
          } else {
            contextData.Comments = "";
          }

          // Line Items
          contextData.LineItems = this._mapLineItems(rawData.lineItems);

          // // File related (optional if you want to show later)
          // contextData.FileName = rawData.fileName || rawData.file_name || "";
          // contextData.CreatedDate = rawData.createdDate || "";
          // contextData.PdfAvailable = false;
          // // New: PDF (base64) source
          // if (rawData.dms_file) {
          //   //  contextData.PdfSource = "data:application/pdf;base64," + rawData.dms_file;
          //   contextData.PdfAvailable = true;
          //   try {
          //     const blob = this._base64ToPdfBlob(rawData.dms_file);
          //     if (this._pdfObjectUrl) {
          //       URL.revokeObjectURL(this._pdfObjectUrl);
          //     }
          //     // create object URL
          //     this._pdfObjectUrl = URL.createObjectURL(blob);
          //     contextData.PdfSource = this._pdfObjectUrl;
          //   } catch (e) {
          //     // fallback to data URI if blob fails
          //     contextData.PdfSource = "data:application/pdf;base64," + rawData.dms_file;
          //   }
          // }


          // Enrichment
          contextData.enrichment = rawData.enrichment
          this.getOwnerComponent().getModel("context").setProperty("/edit", contextData);

          console.log(contextData);
          const model = new JSONModel(contextData);
          this.getView().setModel(model, "viewContextModel");
          this.getOwnerComponent().setModel(model, "viewData");
        },

        _indexHeaderData(headerDataArr) {
          // Map name -> rawValue (last wins if duplicates)
          return headerDataArr.reduce((acc, item) => {
            if (item && item.name) {
              acc[item.name] = item.rawValue;
            }
            return acc;
          }, {});
        },

        _val(headerMap, key) {
          return headerMap[key] || "";
        },

        _cleanPart(str) {
          return (str || "").toString().replace(/[,\s]+$/g, "").trim();
        },

        _buildParty(prefix, headerMap, cfg) {
          // cfg: { nameKey, namePreferred?, streetKeys[], cityKey, stateKey, postalKey }
          const name = cfg.namePreferred ? this._val(headerMap, cfg.namePreferred) : "";
          const fallbackName = this._val(headerMap, cfg.nameKey);
          const street = (cfg.streetKeys || [])
            .map(k => this._cleanPart(this._val(headerMap, k)))
            .filter(Boolean)
            .join(" ");
          const city = this._cleanPart(this._val(headerMap, cfg.cityKey));
          const state = this._cleanPart(this._val(headerMap, cfg.stateKey));
          const postal = this._cleanPart(this._val(headerMap, cfg.postalKey));

          return {
            Name: name || fallbackName || "",
            CityState: [city, state].filter(Boolean).join(state && city ? ", " : ""),
            Street: street,
            PostalCode: postal
          };
        },

        _buildPartyEnrichment(enrichmentData) {
          return {
            ID: enrichmentData.id,
            Name: enrichmentData.name,
            CityState: [enrichmentData.city, enrichmentData.state].filter(Boolean).join(enrichmentData.state && enrichmentData.city ? ", " : ""),
            Street: enrichmentData.Adress1,
            PostalCode: enrichmentData.postalCode
          };
        },

        _mapLineItems(lineItemsRaw) {
          if (!lineItemsRaw) return [];
          let arr;
          if (Array.isArray(lineItemsRaw)) {
            arr = lineItemsRaw;
          } else if (typeof lineItemsRaw === "string") {
            try {
              arr = JSON.parse(lineItemsRaw);
            } catch (e) {
              /* invalid JSON string */
              return [];
            }
          } else {
            return [];
          }

          return arr.map(li => {
            const get = (o, k) => (o && o[k] && o[k].rawValue) ? o[k].rawValue : "";
            return {
              Description: get(li, "description"),
              NetAmount: get(li, "netAmount"),
              Quantity: get(li, "quantity"),
              UnitPrice: get(li, "unitPrice"),
              DocumentDate: get(li, "documentDate"),
              ItemNumber: get(li, "itemNumber"),
              CurrencyCode: get(li, "currencyCode"),
              SupplierMaterialNumber: get(li, "supplierMaterialNumber"),
              CustomerMaterialNumber: get(li, "customerMaterialNumber"),
              UnitOfMeasure: get(li, "unitOfMeasure")
            };
          });
        }
      });
    }
  );
  