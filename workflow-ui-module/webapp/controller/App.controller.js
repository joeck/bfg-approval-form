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

          // Header level with confidence data
          const poNumberData = this._valWithConfidence(headerMap, "documentNumber");
          const docDateData = this._valWithConfidence(headerMap, "documentDate");
          const netAmountData = this._valWithConfidence(headerMap, "netAmount");
          const currencyData = this._valWithConfidence(headerMap, "currencyCode");
          const deliveryDate = this._valWithConfidence(headerMap, "deliveryDate");

          contextData.documentTitle = poNumberData.rawValue ? `Sales Order ${poNumberData.rawValue}` : "Sales Order";
          contextData.PurchaseOrder = poNumberData.rawValue || "";
          contextData.PurchaseOrderDate = docDateData.rawValue || "";
          contextData.Amount = netAmountData.rawValue || "";
          contextData.Currency = currencyData.rawValue || "";
          contextData.DeliveryDate = deliveryDate.rawValue || "";

          // Add confidence data for header fields
          contextData.PurchaseOrderConfidence = poNumberData.confidence;
          contextData.PurchaseOrderDateConfidence = docDateData.confidence;
          contextData.AmountConfidence = netAmountData.confidence;
          contextData.CurrencyConfidence = currencyData.confidence;
          contextData.DeliveryDateConfidence = deliveryDate.confidence;

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
          // Map name -> full object (including rawValue and confidence)
          return headerDataArr.reduce((acc, item) => {
            if (item && item.name) {
              acc[item.name] = {
                rawValue: item.rawValue,
                confidence: item.confidence || 1.0 // default to 1.0 if missing
              };
            }
            return acc;
          }, {});
        },

        _val(headerMap, key) {
          const item = headerMap[key];
          return item ? item.rawValue || "" : "";
        },

        _valWithConfidence(headerMap, key) {
          return headerMap[key] || { rawValue: "", confidence: 1.0 };
        },

        /**
         * Formatter function to convert confidence values to UI5 state
         * @param {number} confidence - Confidence value (0-1)
         * @param {string} value - The actual field value
         * @returns {string} - UI5 state: "Warning" for < 0.8, "Success" for >= 0.8, "None" for empty values
         */
        formatConfidenceState: function(confidence, value) {
          if (!value || value.toString().trim() === "") {
            return "None";
          }
          
          if (typeof confidence !== 'number') {
            return "Success";
          }
          return confidence < 0.8 ? "Warning" : "Success";
        },

        /**
         * Formatter function to convert confidence values to UI5 valueState for Input controls
         * @param {number} confidence - Confidence value (0-1)
         * @param {string} value - The actual field value
         * @returns {string} - UI5 valueState: "Warning" for < 0.8, "Success" for >= 0.8, "None" for empty values
         */
        formatConfidenceValueState: function(confidence, value) {
          if (!value || value.toString().trim() === "") {
            return "None";
          }
          
          if (typeof confidence !== 'number') {
            return "Success";
          }
          return confidence < 0.8 ? "Warning" : "Success";
        },

        /**
         * Formatter function to check if enrichment data exists
         * @param {object} enrichment - Enrichment object
         * @param {string} name - Enrichment name
         * @returns {boolean} - True if enrichment data exists
         */
        hasEnrichmentData: function(enrichment, name) {
          return !!(enrichment && name && name.toString().trim() !== "");
        },

        /**
         * Formatter function to check if no enrichment data exists
         * @param {object} enrichment - Enrichment object
         * @param {string} name - Enrichment name
         * @returns {boolean} - True if no enrichment data exists
         */
        hasNoEnrichmentData: function(enrichment, name) {
          return !(enrichment && name && name.toString().trim() !== "");
        },

        /**
         * Dynamic SoldTo title formatter
         * @param {object} enrichment - Enrichment object
         * @param {string} name - Enrichment name
         * @returns {string} - Dynamic title text
         */
        getSoldToTitle: function(enrichment, name) {
          if (enrichment && name && name.toString().trim() !== "") {
            return "Sold-To (S/4 Master Data)";
          }
          return "Sold-To";
        },

        /**
         * Dynamic SoldTo icon formatter
         * @param {object} enrichment - Enrichment object
         * @param {string} name - Enrichment name
         * @returns {string} - Icon name
         */
        getSoldToIcon: function(enrichment, name) {
          if (enrichment && name && name.toString().trim() !== "") {
            return "sap-icon://accept";
          }
          return "sap-icon://warning";
        },

        /**
         * Dynamic SoldTo icon color formatter
         * @param {object} enrichment - Enrichment object
         * @param {string} name - Enrichment name
         * @returns {string} - Icon color
         */
        getSoldToIconColor: function(enrichment, name) {
          if (enrichment && name && name.toString().trim() !== "") {
            return "#2B7D2B"; // Green for success
          }
          return "#E9730C"; // Orange for warning
        },

        /**
         * Dynamic SoldTo tooltip formatter
         * @param {object} enrichment - Enrichment object
         * @param {string} name - Enrichment name
         * @returns {string} - Tooltip text
         */
        getSoldToTooltip: function(enrichment, name) {
          if (enrichment && name && name.toString().trim() !== "") {
            return "Master data found in S/4 system";
          }
          return "No master data found in S/4 system - please verify data";
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

          // Get confidence data for each field
          const nameConfidence = cfg.namePreferred ? 
            this._valWithConfidence(headerMap, cfg.namePreferred).confidence : 
            this._valWithConfidence(headerMap, cfg.nameKey).confidence;
          
          const streetConfidences = (cfg.streetKeys || [])
            .map(k => this._valWithConfidence(headerMap, k).confidence);
          const streetConfidence = streetConfidences.length > 0 ? 
            Math.min(...streetConfidences) : 1.0; // Use lowest confidence for combined fields
          
          const cityConfidence = this._valWithConfidence(headerMap, cfg.cityKey).confidence;
          const stateConfidence = this._valWithConfidence(headerMap, cfg.stateKey).confidence;
          const postalConfidence = this._valWithConfidence(headerMap, cfg.postalKey).confidence;

          return {
            Name: name || fallbackName || "",
            CityState: [city, state].filter(Boolean).join(state && city ? ", " : ""),
            Street: street,
            PostalCode: postal,
            // Confidence data
            NameConfidence: nameConfidence,
            CityStateConfidence: Math.min(cityConfidence, stateConfidence), // Use lowest confidence for combined field
            StreetConfidence: streetConfidence,
            PostalCodeConfidence: postalConfidence
          };
        },

        _buildPartyEnrichment(enrichmentData) {
          return {
            ID: enrichmentData.id,
            Name: enrichmentData.name,
            CityState: [enrichmentData.city, enrichmentData.state].filter(Boolean).join(enrichmentData.state && enrichmentData.city ? ", " : ""),
            Street: enrichmentData.address1,
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
            const get = (o, k) => (o && o[k] && o[k].value) ? o[k].value : (o && o[k] && o[k].rawValue) ? o[k].rawValue : "";
            const getConfidence = (o, k) => (o && o[k] && typeof o[k].confidence === 'number') ? o[k].confidence : 1.0;
            
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
              UnitOfMeasure: get(li, "unitOfMeasure"),
              // Confidence data
              DescriptionConfidence: getConfidence(li, "description"),
              NetAmountConfidence: getConfidence(li, "netAmount"),
              QuantityConfidence: getConfidence(li, "quantity"),
              UnitPriceConfidence: getConfidence(li, "unitPrice"),
              DocumentDateConfidence: getConfidence(li, "documentDate"),
              ItemNumberConfidence: getConfidence(li, "itemNumber"),
              CurrencyCodeConfidence: getConfidence(li, "currencyCode"),
              SupplierMaterialNumberConfidence: getConfidence(li, "supplierMaterialNumber"),
              CustomerMaterialNumberConfidence: getConfidence(li, "customerMaterialNumber"),
              UnitOfMeasureConfidence: getConfidence(li, "unitOfMeasure")
            };
          });
        }
      });
    }
  );
  