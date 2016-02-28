/////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////--------Legend.js-------//////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////
// 
// Version: 2.1
// Author: Joseph Rogan (joseph.rogan@forces.gc.ca canadajebus@gmail.com)
// 
// 
// This reusable widget creates a legend for map layers, including visibility toggle checkboxes.
// 
// 
// When layers have all been added to the map
// on(mainMap, "layers-add-result", function() {
//
    // Legend widget
    // var legend = new Legend({
        // layers: [
            // {
            // layer: featureLayer1,
            // title: "UTM Zones"},
            // {
            // layer: dynamicLayer1,
            // title: "Hurricanes (Sample layer)"}]
        // }, "LegendWindow");
    // legend.startup();
    //
// });
//
// 
// 
// Changes:
// Version 3.0
//  -Major code overhaul.
//  -Added support for layers to be added in any order.
//  -Added support for layers that use a simple single renderer that does not have to be requested.
// Version 2.1
//  -Added support for skipping group layers in an ArcGISDynamicMapServiceLayer
//  -Fixed <> characters in labels. eg: <null> or <all other values>
//  -Added layer name when multiple renderers exist for a layer
// Version 2.0
//  -Added support for multiple layers of same type using dojo.promise.all
//  -Added support for esri.layers.FeatureLayer
// 
/////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

define([
    "dijit/_WidgetBase", 
    "dijit/_TemplatedMixin", 
    
    "dojo/_base/declare",
    "dojo/_base/lang", 
    "dojo/promise/all", 
    "dojo/on",
    "require",
    
    "dojox/gfx", 
    
    "esri/request", 
    "esri/symbols/jsonUtils", 
    
    "dojo/text!./Legend/templates/Legend.html",
    
    "dojo/dom", 
    "dojo/dom-construct", 
    "dojo/domReady!"

], function(_WidgetBase, _TemplatedMixin, 
    declare, lang, promise, on, require, 
    gfx, 
    esriRequest, jsonUtils, 
    dijitTemplate, 
    dom, domConstruct)
{
    
    return declare([_WidgetBase, _TemplatedMixin], {
        
        // Set the template .html file
        templateString: dijitTemplate,
        
        // Path to the templates .css file
        css_path: require.toUrl("./Legend/css/Legend.css"),
        
        
        // The defaults
        defaults: {
            layers: [{
                layer: null,
                title: ""}], 
            theme: "legendWidget",
        },
        
        // Vars
        layerDivs: [], 
        legendRequests: [], 
        extraPaddingLeft: 19,
        
        // Called when the widget is declared as new object
        constructor: function(options) {
            // Mix in the given options with the defaults
            var properties = lang.mixin({}, this.defaults, options);
            this.set(properties);
            
            this.css = {
                legendDiv: "legendDiv", 
                legendLayer: "legendLayer", 
                legendSubLayer: "legendSubLayer", 
                legendImage: "legendImage"
            };
            
        },
        
        
        // Called after the widget is created
        postCreate: function() {
            this.inherited(arguments);
            
            
            // Loop through each layer
            for (var i in this.layers)
            {
                // The layer
                var layer = this.layers[i].layer;
                var title = this.layers[i].title;
                // Var for deciding if a legend request for the layer will be done
                var doRequest = true;
                
                // Create a div to hold it
                this.layerDivs[i] = dojo.create("div", { id: "layerDiv" + i }, this.legendDiv);
                
                // Apply html for the layers title
                this.layerDivs[i].innerHTML += "<input type='checkbox' class='layerItem' " + 
                        (layer.visible ? "checked=checked" : "") + " id='legendLayer" + i + "' />" + 
                        "<label for='legendLayer" + i + "' class='legendLayer'>" + title + "</label><br />"
                
                
                // If the layer has a renderer
                if (layer.renderer)
                {
                    var html = "<div class='legendSubLayerDiv'>";
                    
                    // If there is an array of symbols
                    if (layer.renderer._symbols)
                    {
                        // Loop through each symbol
                        for (s in layer.renderer._symbols)
                        {
                            // If the symbol does NOT have the contentType property, do not do a request
                            if (layer.renderer._symbols[s].symbol.contentType)
                            {
                            }
                            else
                            {
                                doRequest = false;
                            }
                        }
                    }
                    else // Single symbol
                    {
                        var symbol = layer.renderer.getSymbol();
                        
                        // If the symbol does NOT have the contentType property, do not do a request
                        if (symbol.contentType)
                        {
                        }
                        else
                        {
                            // Create a div for the surface
                            var legendLayerSurfaceDiv = dojo.create("div", { id: "legendLayerSurfaceDiv" + i, style: "padding-left: " + this.extraPaddingLeft + "px; width:20px; height:20px; border: 0px solid black;" }, this.layerDivs[i]);
                            // Create the surface
                            var surface = gfx.createSurface(dom.byId("legendLayerSurfaceDiv" + i), 20, 20);
                            var descriptors = jsonUtils.getShapeDescriptors(symbol);
                            var shape = surface.createShape(descriptors.defaultShape).setFill(descriptors.fill).setStroke(descriptors.stroke);
                            shape.applyTransform({ dx: 10, dy: 10 });
                        
                            doRequest = false;
                        }
                            
                    }
                    
                    html += "</div>";
                    
                    if (!doRequest) this.layerDivs[i].innerHTML += html;
                    
                }
                
                // If a legend request should be done
                if (doRequest)
                {
                    // Create the request object for the legend JSON object
                    this.legendRequests[i] = esriRequest({
                        url: this.layers[i].layer.url + "/legend",
                        content: {f: "json"},
                        handleAs: "json",
                        callbackParamName: "callback"
                        });
                }
                else
                {
                    this.legendRequests[i] = false;
                }
            }
            
            // Vars to move this into the then event scope
            var _this = this;
            
            // Use dojo promises to return the ascyn results in the same order
            var promises = promise(this.legendRequests);
            promises.then( function(results)
            {
                // Loop through each result from the dojo promises
                for (r in results)
                {
                    
                    // If a request was sent
                    if (_this.legendRequests[r] != false)
                    {
                    
                        // If it's a ArcGISDynamicMapServiceLayer layer object
                        if (_this.layers[r].layer.declaredClass == "esri.layers.ArcGISDynamicMapServiceLayer")
                        {
                            
                            var groupLayerCount = 0;
                            
                            
                            // Loop through each sub layer
                            for (var ii in _this.layers[r].layer.layerInfos)
                            {
                                // If there are still results left.  There can be less results returned because group layers are not returned.
                                if (results[r].layers[ii-groupLayerCount])
                                {
                                    // If the name of the layer matches the name of the layer in the legend result.  Group layers are not returned so must be skipped.
                                    if (_this.layers[r].layer.layerInfos[ii].name != results[r].layers[ii-groupLayerCount].layerName)
                                    {
                                        groupLayerCount++;
                                    }
                                    else
                                    {
                                        var legendResult = results[r].layers[ii-groupLayerCount].legend;
                                        
                                        var html = "<div class='legendSubLayerDiv'>" + 
                                                "<input type='checkbox' checked=checked" + " id='" + r + "_" + ii + "' class='legendCheckbox' />" + 
                                                "<label for='" + r + "_" + ii + "'>";
                                        
                                        
                                        // If theres more than one legend item (renderer), add the layer name
                                        if (legendResult.length > 1)
                                        {
                                            html += "<b>" + results[r].layers[ii-groupLayerCount].layerName + "</b></br>";
                                        }
                                        
                                        // Loop through each sub layer
                                        for (var iii in legendResult)
                                        {
                                            // Get details from the legend JSON object
                                            var legendLabel = legendResult[iii].label.replace("<", "&lt;").replace(">", "&gt;");
                                            
                                            // If it's the only item
                                            if (legendResult.length == 1)
                                            {
                                                // If there's no label use the layer name
                                                if (legendLabel == "") legendLabel = results[r].layers[ii-groupLayerCount].layerName;
                                                // Add bold tags
                                                legendLabel = "<b>" + legendLabel + "</b>";
                                            }
                                            
                                            // Determine if extra left padding
                                            var extraPaddingLeft = false;
                                            if (iii > 0 | legendResult.length > 1) extraPaddingLeft = true;
                                            
                                            // Set html of the sub item
                                            if (iii > 0) html += "</br>";
                                            html += _this._symbol2Img(legendResult[iii], extraPaddingLeft) + legendLabel;
                                            
                                        }
                                        
                                        html += "</label></div>";
                                        _this.layerDivs[r].innerHTML += html;
                                        
                                    }
                                }
                            }
                        }
                        // If it's a FeatureLayer layer object
                        else if (_this.layers[r].layer.declaredClass == "esri.layers.FeatureLayer")
                        {
                            var html = "<div class='legendSubLayerDiv'>";
                            var renderer = results[r].drawingInfo.renderer;
                            
                            // If the layer is symbolized with unique values
                            if (renderer.type == "uniqueValue");
                            {
                                // Create an array for each item
                                for (uid in renderer.uniqueValueInfos)
                                {
                                    // Get details from the legend JSON object
                                    var legendLabel = renderer.uniqueValueInfos[uid].label.replace("<", "&lt;").replace(">", "&gt;");
                                    
                                    // Set html of the sub item
                                    if (uid > 0) html += "</br>";
                                    html += _this._symbol2Img(renderer.uniqueValueInfos[uid].symbol, 0) + legendLabel;
                                }
                                
                                html += "</div>";
                                _this.layerDivs[r].innerHTML += html;
                                
                            }
                        }
                    }
                    
                }
                
            });
            
            // Loop through each layer
            for (var i in this.layers)
            {
                // Wire event for when a layer's div is clicked to update it's visibility
                on(this.layerDivs[i], "click", function() {
                    _this.updateLayerVisibility(this.id.replace("layerDiv", ""));
                });
            }
            
        },
        
        
        // Called when the widget.startup() is used to view the widget
        startup: function() {
            this.inherited(arguments);
            
        },
        
        // Updates a layers visibility
        updateLayerVisibility: function(layerId) {
            
            // Get the layer
            var layer = this.layers[layerId].layer;
            
            // Set visibility of the layer
            layer.setVisibility(dom.byId("legendLayer" + layerId).checked);
            
            // If it's a ArcGISDynamicMapServiceLayer layer object
            if (layer.declaredClass == "esri.layers.ArcGISDynamicMapServiceLayer")
            {
                var visibleLayers = [];
                var currentVisibleLayers = layer.visibleLayers;
                // Loop through each sub layer
                for (var ii in layer.layerInfos)
                {
                    
                    var checkbox = dom.byId(layerId  + "_" + ii);
                    // Make sure the checkbox exists
                    if (checkbox)
                    {
                        // If that items checkbox is checked, put in the visible array that items id
                        if (checkbox.checked) visibleLayers.push(parseInt(ii));
                    }
                }
                // Set and refresh the layer visibility only if there was a change made.
                // Prevents action on a double event firing when the checkbox label is click.
                if (visibleLayers.length != currentVisibleLayers.length)
                {
                    layer.setVisibleLayers(visibleLayers);
                    layer.refresh();
                }
            }
            
        }, 
        
        
        // Given a symbol object, returns html to draw it in the legend
        _symbol2Img: function(symbol, extraPaddingLeft) {
            
            // Get details from the legend JSON object
            var src = "data:" + symbol.contentType + ";base64," + symbol.imageData;
            
            // Calculate the padding
            var paddingLeft = (30 - symbol.width) / 2 + (extraPaddingLeft ? this.extraPaddingLeft : 0);
            var paddingRight = (30 - symbol.width) / 2;
            
            // Return it
            return "<img src='" + src + "' height='" + symbol.height + "' width='" + symbol.width + "' " + 
                    "style='padding-left: " + paddingLeft + "px; padding-right: " + paddingRight + "px;' class='legendImage' /> ";
            
        }
        
        // console.log(Object.getOwnPropertyNames());
        
        
    });

});