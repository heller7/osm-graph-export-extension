// map-overlay.js — Runs in the MAIN world (page context) at document_start.
// Intercepts L.Map creation to capture the map instance, then listens
// for postMessage commands from the content script to:
//   - show/hide graph overlays
//   - enter/exit bounding-box draw mode

(function () {
  let leafletMap = null;
  let graphLayer = null;
  let drawState = null; // { active, startLatLng, rect }

  // ── Capture the Leaflet map instance ──────────────────────────────
  function patchLeaflet(L) {
    const origInit = L.Map.prototype.initialize;
    L.Map.prototype.initialize = function (...args) {
      origInit.apply(this, args);
      if (this._container && this._container.id === 'map') {
        leafletMap = this;
        console.log('[ogee] Captured Leaflet map instance');
      }
    };
  }

  if (window.L && window.L.Map) {
    patchLeaflet(window.L);
  } else {
    let _L = window.L;
    Object.defineProperty(window, 'L', {
      configurable: true,
      get() { return _L; },
      set(val) {
        _L = val;
        if (val && val.Map && val.Map.prototype) {
          patchLeaflet(val);
          Object.defineProperty(window, 'L', {
            configurable: true,
            writable: true,
            enumerable: true,
            value: val
          });
        }
      }
    });
  }

  // ── Draw-mode handlers ────────────────────────────────────────────
  function onDrawMouseDown(e) {
    if (!drawState || !drawState.active) return;
    // Prevent map drag while drawing
    leafletMap.dragging.disable();
    drawState.startLatLng = e.latlng;
    // Create initial zero-size rectangle
    const bounds = L.latLngBounds(e.latlng, e.latlng);
    drawState.rect = L.rectangle(bounds, {
      color: '#0074d9',
      weight: 2,
      fillOpacity: 0.15,
      dashArray: '6 4'
    }).addTo(leafletMap);
  }

  function onDrawMouseMove(e) {
    if (!drawState || !drawState.active || !drawState.startLatLng || !drawState.rect) return;
    drawState.rect.setBounds(L.latLngBounds(drawState.startLatLng, e.latlng));
  }

  function onDrawMouseUp(e) {
    if (!drawState || !drawState.active || !drawState.startLatLng) return;
    leafletMap.dragging.enable();

    const b = L.latLngBounds(drawState.startLatLng, e.latlng);
    const bounds = {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest()
    };

    // Only accept if the rectangle has some minimum size
    if (Math.abs(bounds.north - bounds.south) < 0.0001 || Math.abs(bounds.east - bounds.west) < 0.0001) {
      // Too small — treat as a click, ignore
      if (drawState.rect) {
        leafletMap.removeLayer(drawState.rect);
        drawState.rect = null;
      }
      drawState.startLatLng = null;
      return;
    }

    // Send bounds back to content script
    window.postMessage({
      type: 'OSM_GRAPH_BOUNDS_DRAWN',
      bounds: bounds
    }, '*');

    // Exit draw mode automatically
    exitDrawMode();
  }

  function enterDrawMode() {
    if (!leafletMap) return;
    // Clean up any previous draw rectangle
    if (drawState && drawState.rect) {
      leafletMap.removeLayer(drawState.rect);
    }
    drawState = { active: true, startLatLng: null, rect: null };

    // Change cursor to crosshair
    leafletMap.getContainer().style.cursor = 'crosshair';

    // Bind events
    leafletMap.on('mousedown', onDrawMouseDown);
    leafletMap.on('mousemove', onDrawMouseMove);
    leafletMap.on('mouseup', onDrawMouseUp);

    console.log('[ogee] Draw mode entered');
  }

  function exitDrawMode() {
    if (!leafletMap) return;
    leafletMap.getContainer().style.cursor = '';
    leafletMap.off('mousedown', onDrawMouseDown);
    leafletMap.off('mousemove', onDrawMouseMove);
    leafletMap.off('mouseup', onDrawMouseUp);
    leafletMap.dragging.enable();

    if (drawState && drawState.rect) {
      // Keep the rectangle visible so user sees what they drew
    }
    drawState = { active: false, startLatLng: null, rect: drawState ? drawState.rect : null };
    console.log('[ogee] Draw mode exited');
  }

  // ── Message handler ───────────────────────────────────────────────
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data) return;

    // Graph overlay messages
    if (event.data.type === 'OSM_GRAPH_OVERLAY') {
      if (!leafletMap) {
        console.error('[ogee] Leaflet map not captured yet');
        return;
      }

      const action = event.data.action;

      if (action === 'show') {
        if (graphLayer) {
          leafletMap.removeLayer(graphLayer);
          graphLayer = null;
        }

        const graph = event.data.graph;
        if (!graph || !graph.nodes || !graph.edges) return;

        const nodeMap = {};
        for (const n of graph.nodes) {
          nodeMap[n.id] = [n.lat, n.lon];
        }

        const layers = [];

        const edgeSeen = new Set();
        for (const e of graph.edges) {
          const key = Math.min(e.source, e.target) + '-' + Math.max(e.source, e.target);
          if (edgeSeen.has(key)) continue;
          edgeSeen.add(key);
          const a = nodeMap[e.source];
          const b = nodeMap[e.target];
          if (a && b) {
            layers.push(L.polyline([a, b], {
              color: '#e63946',
              weight: 3,
              opacity: 0.7
            }));
          }
        }

        for (const n of graph.nodes) {
          layers.push(L.circleMarker([n.lat, n.lon], {
            radius: 4,
            fillColor: '#1d3557',
            color: '#f1faee',
            weight: 1.5,
            fillOpacity: 0.9
          }));
        }

        graphLayer = L.layerGroup(layers);
        graphLayer.addTo(leafletMap);
        console.log('[ogee] Graph overlay added:', graph.nodes.length, 'nodes,', edgeSeen.size, 'edges');
      }

      if (action === 'hide') {
        if (graphLayer) {
          leafletMap.removeLayer(graphLayer);
          graphLayer = null;
          console.log('[ogee] Graph overlay removed');
        }
      }
    }

    // Draw-mode messages
    if (event.data.type === 'OSM_GRAPH_DRAW') {
      if (!leafletMap) {
        console.error('[ogee] Leaflet map not captured yet');
        return;
      }

      if (event.data.action === 'start') {
        enterDrawMode();
      }
      if (event.data.action === 'cancel') {
        if (drawState && drawState.rect) {
          leafletMap.removeLayer(drawState.rect);
        }
        exitDrawMode();
      }
      if (event.data.action === 'clear') {
        // Remove the drawn rectangle from the map
        if (drawState && drawState.rect) {
          leafletMap.removeLayer(drawState.rect);
          drawState.rect = null;
        }
      }
    }
  });

  console.log('[ogee] Map overlay script loaded (MAIN world, document_start)');
})();
