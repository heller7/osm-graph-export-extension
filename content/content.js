// content.js

console.log("Content script loaded");

if (window.location.hostname === "www.openstreetmap.org") {
  console.log("On OpenStreetMap website");

  /**
   * Main class for handling the OSM Graph Generator extension functionality
   */
  class OSMGraphSelector {
    /**
     * Initialize class properties
     * @constructor
     */
    constructor() {
      this.generateButton = null;      // Button in the navigation bar
      this.settingsPanel = null;       // Panel containing settings and controls
      this.graphData = null;           // Store generated graph data
    }

    /**
     * Initialize the extension
     */
    init() {
      console.log("Initializing OSMGraphSelector");
      this.setupInterface();           // Create and add the UI button
      this.createSettingsPanel();      // Create the settings panel
      this.setupMapChangeListener();    // Setup listeners for map changes
    }

    /**
     * Set up listeners for map coordinate changes
     */
    setupMapChangeListener() {
      window.addEventListener('hashchange', () => {
        this.updateCoordinates();
      });
    }

    /**
     * Create and add the extension button to OSM's navigation bar
     */
    setupInterface() {
      // Find OSM's secondary navigation list (History, Export, etc.)
      const navList = document.querySelector("nav.secondary ul#secondary-nav-menu");
      if (!navList) {
        console.error("Secondary navigation not found");
        return;
      }

      // Create nav item matching OSM's structure: <li class="nav-item"><a class="nav-link text-secondary">
      const listItem = document.createElement("li");
      listItem.className = "nav-item";

      this.generateButton = document.createElement("a");
      this.generateButton.textContent = "Export";
      this.generateButton.className = "nav-link text-secondary";
      this.generateButton.href = "#";
      this.generateButton.addEventListener("click", (e) => {
        e.preventDefault();
        this.toggleSettingsPanel();
      });

      listItem.appendChild(this.generateButton);
      navList.appendChild(listItem);
    }

    /**
     * Create the settings panel with coordinate inputs and export options
     */
    createSettingsPanel() {
      // Get current coordinates from URL
      const urlParams = new URLSearchParams(window.location.hash.slice(1));
      const mapParam = urlParams.get('map');
      
      let coords = {
        north: 52.52,
        south: 52.50,
        east: 13.41,
        west: 13.39
      };

      if (mapParam) {
        const [zoom, lat, lon] = mapParam.split('/');
        // Use the current view as center and create a bounding box
        const offset = 0.01; // roughly 1km
        coords = {
          north: parseFloat(lat) + offset,
          south: parseFloat(lat) - offset,
          east: parseFloat(lon) + offset,
          west: parseFloat(lon) - offset
        };
      }

      this.settingsPanel = document.createElement("div");
      this.settingsPanel.className = "osm-graph-settings-panel";
      this.settingsPanel.style.cssText = `
        position: relative;
        z-index: 10000;
        width: 100%;
        background: white;
        padding: 20px;
        box-sizing: border-box;
        display: none;
        border-bottom: 1px solid #ccc;
        overflow-y: auto;
    `;

      this.settingsPanel.innerHTML = `
        <div style="position: relative;">
            <h3 style="margin-top: 0; padding-right: 30px;">Graph Generation Settings</h3>
            <button class="close-button" style="
                position: absolute;
                top: 0;
                right: 0;
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                padding: 5px;
                color: #666;
                line-height: 1;
            ">×</button>
        </div>
        <div class="settings-section">
            <h4>Bounding Box</h4>
            <div class="bounding-box-container">
                <!-- North input -->
                <div class="coord-input north">
                    <input type="number" id="north" step="0.0001" value="${coords.north.toFixed(4)}">
                    <label for="north">North</label>
                </div>
                
                <div class="box-center">
                    <!-- West input -->
                    <div class="coord-input west">
                        <input type="number" id="west" step="0.0001" value="${coords.west.toFixed(4)}">
                        <label for="west">West</label>
                    </div>

                    <!-- Visual box -->
                    <div class="visual-box"></div>

                    <!-- East input -->
                    <div class="coord-input east">
                        <input type="number" id="east" step="0.0001" value="${coords.east.toFixed(4)}">
                        <label for="east">East</label>
                    </div>
                </div>

                <!-- South input -->
                <div class="coord-input south">
                    <input type="number" id="south" step="0.0001" value="${coords.south.toFixed(4)}">
                    <label for="south">South</label>
                </div>
            </div>
        </div>
        <div class="settings-section">
            <button id="generateGraph" class="settings-button">Generate Graph</button>
            <div id="graphPreview" style="display:none; margin-top:10px;">
                <canvas id="previewCanvas" width="260" height="180" style="
                    width:100%; border:1px solid #ccc; border-radius:4px; background:#f9f9f9;
                "></canvas>
                <div id="graphStats" style="font-size:12px; color:#666; margin-top:4px;"></div>
            </div>
        </div>
        <div class="settings-section">
            <h4>Export Options</h4>
            <select id="exportFormat" style="width: 100%; margin-bottom: 10px;">
                <option value="json">JSON</option>
                <option value="graphml">GraphML</option>
                <option value="csv">CSV (edge list)</option>
                <option value="tikz">LaTeX TikZ</option>
            </select>
            <button id="exportGraph" class="settings-button">Export Graph</button>
        </div>
    `;

      // Find the sidebar (use #sidebar, not #sidebar_content, to match toggleSettingsPanel)
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
          // Insert the panel at the top of the sidebar
          if (sidebar.firstChild) {
              sidebar.insertBefore(this.settingsPanel, sidebar.firstChild);
          } else {
              sidebar.appendChild(this.settingsPanel);
          }
      } else {
          console.error('Sidebar not found');
          return;
      }

      // Add close button event listener
      const closeButton = this.settingsPanel.querySelector('.close-button');
      closeButton.addEventListener('click', () => {
          this.toggleSettingsPanel();
      });

      // Add hover effect for close button
      closeButton.addEventListener('mouseover', () => {
          closeButton.style.color = '#ff4136';
      });
      closeButton.addEventListener('mouseout', () => {
          closeButton.style.color = '#666';
      });

      // Update the styles
      const style = document.createElement("style");
      style.textContent = `
                .settings-section {
                    margin-bottom: 20px;
                }
                .settings-section h4 {
                    margin: 10px 0;
                    color: #666;
                }
                .settings-button {
                    width: 100%;
                    padding: 8px;
                    margin: 5px 0;
                    background: #0074d9;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .settings-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .settings-button:hover:not(:disabled) {
                    background: #0056b3;
                }
                .bounding-box-container {
                    position: relative;
                    padding: 60px 20px;
                    margin: 20px 0;
                }
                .visual-box {
                    border: 2px solid #0074d9;
                    background: rgba(0, 116, 217, 0.1);
                    border-radius: 4px;
                    width: 120px;
                    height: 120px;
                    margin: 0 auto;
                }
                .coord-input {
                    position: absolute;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                }
                .coord-input input {
                    width: 90px;
                    padding: 4px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    text-align: center;
                    font-size: 12px;
                }
                .coord-input label {
                    font-size: 12px;
                    color: #666;
                }
                .north {
                    top: 0;
                    left: 50%;
                    transform: translateX(-50%);
                }
                .south {
                    bottom: 0;
                    left: 50%;
                    transform: translateX(-50%);
                }
                .east {
                    right: 0;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .west {
                    left: 0;
                    top: 50%;
                    transform: translateY(-50%);
                }
                .box-center {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 20px;
                }
                select {
                    padding: 6px;
                    border-radius: 4px;
                    border: 1px solid #ccc;
                    background: white;
                }
                select:focus {
                    border-color: #0074d9;
                    outline: none;
                }
            `;

      document.head.appendChild(style);

      // Add event listeners
      this.settingsPanel
        .querySelector("#generateGraph")
        .addEventListener("click", () => {
          this.generateGraph();
        });

      this.settingsPanel
        .querySelector("#exportGraph")
        .addEventListener("click", () => {
          const format =
            this.settingsPanel.querySelector("#exportFormat").value;
          this.exportGraph(format);
        });

      // Initially disable the export button
      const exportButton = this.settingsPanel.querySelector("#exportGraph");
      exportButton.disabled = true;
      exportButton.style.opacity = "0.5";
    }

    /**
     * Generate graph from current coordinate bounds
     * Communicates with background script via Chrome extension API
     */
    generateGraph() {
      // Get current coordinates from inputs
      const coords = {
        north: parseFloat(this.settingsPanel.querySelector('#north').value),
        south: parseFloat(this.settingsPanel.querySelector('#south').value),
        east: parseFloat(this.settingsPanel.querySelector('#east').value),
        west: parseFloat(this.settingsPanel.querySelector('#west').value)
      };

      // Validate coordinates
      if (Object.values(coords).some(v => isNaN(v))) {
        this.showToast("Error: All coordinates must be valid numbers", "error");
        return;
      }
      if (coords.north <= coords.south) {
        this.showToast("Error: North must be greater than South", "error");
        return;
      }
      if (coords.east <= coords.west) {
        this.showToast("Error: East must be greater than West", "error");
        return;
      }

      const generateButton = this.settingsPanel.querySelector("#generateGraph");

      this.showToast("Generating graph...");

      // Disable button during request
      if (generateButton) {
        generateButton.disabled = true;
      }

      // Check for Chrome extension API availability
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          // Request graph generation from background script
          chrome.runtime.sendMessage({
            type: "FETCH_OSM_DATA",
            bounds: coords
          }, response => {
            // Re-enable generate button
            if (generateButton) {
              generateButton.disabled = false;
            }

            if (chrome.runtime.lastError) {
              this.showToast("Extension error: " + chrome.runtime.lastError.message, "error");
              return;
            }

            // Handle response
            if (response && response.success) {
              this.graphData = response.data;
              this.showToast("Graph generated successfully!");
              this.renderPreview(response.data);

              // Enable export functionality
              const exportButton = this.settingsPanel.querySelector("#exportGraph");
              if (exportButton) {
                exportButton.disabled = false;
                exportButton.style.opacity = "1";
              }
            } else {
              const errorMessage = response ? response.error : "Unknown error occurred";
              this.showToast("Error generating graph: " + errorMessage, "error");
            }
          });
        } catch (error) {
          if (generateButton) {
            generateButton.disabled = false;
          }
          console.error("Message sending error:", error);
          this.showToast("Error: Could not communicate with extension", "error");
        }
      } else {
        if (generateButton) {
          generateButton.disabled = false;
        }
        console.error("Chrome extension API not available");
        this.showToast("Error: Extension context not available", "error");
      }
    }

    /**
     * Export generated graph in specified format
     * @param {string} format - Either 'json' or 'graphml'
     */
    exportGraph(format) {
      // Check if we have graph data to export
      if (!this.graphData) {
        this.showToast("Please generate a graph first", "error");
        return;
      }

      // Check for Chrome extension API availability
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          // Request graph export from background script
          chrome.runtime.sendMessage({
            type: "EXPORT_GRAPH",
            format: format,
            data: this.graphData
          }, response => {
            if (chrome.runtime.lastError) {
              this.showToast("Extension error: " + chrome.runtime.lastError.message, "error");
              return;
            }
            if (response && response.success) {
              // Create and trigger download
              const mimeTypes = { json: "application/json", graphml: "application/xml", csv: "text/csv", tikz: "application/x-tex" };
              const blob = new Blob([response.data], {
                type: mimeTypes[format] || "text/plain"
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const extensions = { tikz: 'tex' };
              a.download = `osm-graph.${extensions[format] || format}`;
              a.click();
              URL.revokeObjectURL(url);
              this.showToast("Graph exported successfully!");
            } else {
              const errorMessage = response ? response.error : "Unknown error occurred";
              this.showToast("Export failed: " + errorMessage, "error");
            }
          });
        } catch (error) {
          console.error("Export error:", error);
          this.showToast("Error: Could not communicate with extension", "error");
        }
      } else {
        console.error("Chrome extension API not available");
        this.showToast("Error: Extension context not available", "error");
      }
    }

    /**
     * Toggle visibility of settings panel and handle sidebar state
     */
    toggleSettingsPanel() {
      // Use actual DOM state instead of a flag to avoid desync
      const isCurrentlyVisible = this.settingsPanel.style.display !== "none";

      const sidebar = document.getElementById('sidebar');
      const sidebarButton = document.querySelector('#sidebar .hide_sidebar_button');

      if (!isCurrentlyVisible) {
        // Show sidebar if it's hidden
        if (sidebar && sidebar.classList.contains('closed')) {
          if (sidebarButton) {
            sidebarButton.click();
          } else {
            sidebar.classList.remove('closed');
            const map = document.getElementById('map');
            if (map) {
              map.classList.remove('sidebar_closed');
            }
          }
        }

        // Refresh coordinate inputs before showing
        this.updateCoordinates();

        // Show and position our panel
        this.settingsPanel.style.display = "block";
        if (sidebar && sidebar.firstChild !== this.settingsPanel) {
          sidebar.insertBefore(this.settingsPanel, sidebar.firstChild);
        }
      } else {
        this.settingsPanel.style.display = "none";
      }
    }

    /**
     * Render a mini-map preview of the graph on the canvas
     * @param {Object} graph - Graph data with nodes and edges
     */
    renderPreview(graph) {
      const container = this.settingsPanel.querySelector('#graphPreview');
      const canvas = this.settingsPanel.querySelector('#previewCanvas');
      const stats = this.settingsPanel.querySelector('#graphStats');
      if (!canvas || !container) return;

      container.style.display = 'block';

      const uniqueEdges = graph.directed ? Math.floor(graph.edges.length / 2) : graph.edges.length;
      stats.textContent = `${graph.nodes.length} nodes, ${graph.edges.length} edges`;

      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (graph.nodes.length === 0) return;

      // Compute bounds for mapping lat/lon to canvas pixels
      let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
      for (const n of graph.nodes) {
        if (n.lat < minLat) minLat = n.lat;
        if (n.lat > maxLat) maxLat = n.lat;
        if (n.lon < minLon) minLon = n.lon;
        if (n.lon > maxLon) maxLon = n.lon;
      }

      const pad = 10;
      const latRange = maxLat - minLat || 1;
      const lonRange = maxLon - minLon || 1;
      const scaleX = (w - 2 * pad) / lonRange;
      const scaleY = (h - 2 * pad) / latRange;
      const scale = Math.min(scaleX, scaleY);
      const offX = pad + ((w - 2 * pad) - lonRange * scale) / 2;
      const offY = pad + ((h - 2 * pad) - latRange * scale) / 2;

      const toX = lon => offX + (lon - minLon) * scale;
      const toY = lat => offY + (maxLat - lat) * scale; // flip Y

      // Build node position lookup
      const pos = new Map();
      for (const n of graph.nodes) {
        pos.set(n.id, { x: toX(n.lon), y: toY(n.lat) });
      }

      // Draw edges
      ctx.strokeStyle = 'rgba(0, 116, 217, 0.15)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const e of graph.edges) {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (a && b) {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
      }
      ctx.stroke();

      // Draw nodes
      ctx.fillStyle = '#0074d9';
      const r = graph.nodes.length > 500 ? 1 : 2;
      for (const n of graph.nodes) {
        const p = pos.get(n.id);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /**
     * Display a temporary notification message
     * @param {string} message - Message to display
     * @param {string} type - Message type ('error', 'info', or 'success')
     */
    showToast(message, type = "info") {
      // Remove any existing toast
      const existingToast = document.querySelector(".osm-graph-toast");
      if (existingToast) {
        existingToast.remove();
      }

      // Create and style new toast
      const toast = document.createElement("div");
      toast.className = "osm-graph-toast";
      toast.textContent = message;
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: ${
          type === "error"
            ? "#ff4136"
            : type === "info"
            ? "#0074d9"
            : "#2ecc40"
        };
        color: white;
        border-radius: 4px;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;

      // Add toast to page and remove after delay
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.remove();
      }, 3000);
    }

    /**
     * Update coordinate inputs based on current map position
     */
    updateCoordinates() {
      console.log('Updating coordinates...');
      const urlParams = new URLSearchParams(window.location.hash.slice(1));
      const mapParam = urlParams.get('map');
      
      if (mapParam && this.settingsPanel) {
        console.log('Map parameters found:', mapParam);
        const [zoom, lat, lon] = mapParam.split('/');
        const offset = 0.01; // roughly 1km
        
        // Calculate bounding box
        const coords = {
          north: parseFloat(lat) + offset,
          south: parseFloat(lat) - offset,
          east: parseFloat(lon) + offset,
          west: parseFloat(lon) - offset
        };

        // Update input fields with new coordinates
        const northInput = this.settingsPanel.querySelector('#north');
        const southInput = this.settingsPanel.querySelector('#south');
        const eastInput = this.settingsPanel.querySelector('#east');
        const westInput = this.settingsPanel.querySelector('#west');

        if (northInput && southInput && eastInput && westInput) {
          northInput.value = coords.north.toFixed(4);
          southInput.value = coords.south.toFixed(4);
          eastInput.value = coords.east.toFixed(4);
          westInput.value = coords.west.toFixed(4);
          console.log('Coordinates updated in inputs');
        } else {
          console.error('Could not find coordinate inputs');
        }
      } else {
        console.log('No map parameters found in URL');
      }
    }
  }

  // Initialize the extension
  const osmGraphSelector = new OSMGraphSelector();
  osmGraphSelector.init();
}
