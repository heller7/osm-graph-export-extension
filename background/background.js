/**
 * Background script for OSM Graph Generator Extension
 * Handles data fetching, graph generation, and format conversion
 */

// Constants for API endpoints and settings
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const DEFAULT_TIMEOUT = 25; // seconds for Overpass API requests

// Cache for storing temporary graph data between operations
let graphCache = null;

/**
 * Builds an Overpass QL query string for fetching road data
 * Excludes minor road types like footways and service roads
 * @param {Object} bounds - Bounding box coordinates {north, south, east, west}
 * @returns {string} Formatted Overpass QL query
 */
function buildOverpassQuery(bounds) {
    return `
        [out:json][timeout:${DEFAULT_TIMEOUT}];
        (
            way["highway"]
                [highway!~"footway|cycleway|path|service|track"]
                (${bounds.south},${bounds.west},${bounds.north},${bounds.east});
        );
        out body;
        >;
        out skel qt;
    `;
}

/**
 * Fetches OSM data using the Overpass API
 * @param {Object} bounds - Bounding box coordinates
 * @returns {Promise<Object>} JSON response from Overpass API
 * @throws {Error} If the fetch request fails
 */
async function fetchOsmData(bounds) {
    try {
        const query = buildOverpassQuery(bounds);
        const response = await fetch(OVERPASS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: query
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching OSM data:', error);
        throw error;
    }
}

/**
 * Converts raw OSM data into a graph structure
 * @param {Object} osmData - Raw data from Overpass API
 * @returns {Object} Graph with nodes and edges arrays
 */
function convertToGraph(osmData) {
    const nodes = new Map(); // Use Map for efficient node lookup
    const edges = [];

    // First pass: collect all nodes with their coordinates
    osmData.elements.forEach(element => {
        if (element.type === 'node') {
            nodes.set(element.id, {
                id: element.id,
                lat: element.lat,
                lon: element.lon
            });
        }
    });

    // Second pass: create edges from ways
    osmData.elements.forEach(element => {
        if (element.type === 'way') {
            // Create edges between consecutive nodes in the way
            for (let i = 0; i < element.nodes.length - 1; i++) {
                const fromNode = nodes.get(element.nodes[i]);
                const toNode = nodes.get(element.nodes[i + 1]);
                
                if (fromNode && toNode) {
                    edges.push({
                        source: fromNode.id,
                        target: toNode.id,
                        wayId: element.id,
                        weight: calculateDistance(
                            fromNode.lat, fromNode.lon,
                            toNode.lat, toNode.lon
                        )
                    });
                }
            }
        }
    });

    return {
        nodes: Array.from(nodes.values()),
        edges: edges
    };
}

/**
 * Calculates distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Converts degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Handle messages from content script
 * Supports two operations:
 * 1. FETCH_OSM_DATA: Fetches and converts OSM data to graph
 * 2. EXPORT_GRAPH: Exports graph in specified format
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request.type);

    if (request.type === 'FETCH_OSM_DATA') {
        // Handle data fetching and graph generation
        fetchOsmData(request.bounds)
            .then(data => {
                graphCache = convertToGraph(data);
                console.log('Graph generated:', graphCache);
                sendResponse({ success: true, data: graphCache });
            })
            .catch(error => {
                console.error('Error:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response

    } else if (request.type === 'EXPORT_GRAPH') {
        // Handle graph export in specified format
        try {
            const graphData = request.data;
            if (!graphData) {
                sendResponse({ success: false, error: 'No graph data available' });
                return false;
            }

            let exportData;
            if (request.format === 'json') {
                exportData = JSON.stringify(graphData, null, 2);
            } else if (request.format === 'graphml') {
                exportData = convertToGraphML(graphData);
            } else {
                sendResponse({ success: false, error: 'Unsupported format' });
                return false;
            }
            
            sendResponse({ success: true, data: exportData });
        } catch (error) {
            console.error('Export error:', error);
            sendResponse({ success: false, error: error.message });
        }
        return false;
    }

    sendResponse({ success: false, error: 'Unknown request type' });
    return false;
});

/**
 * Converts graph data to GraphML format
 * GraphML is an XML-based format for graphs
 * @param {Object} graph - Graph data with nodes and edges
 * @returns {string} GraphML formatted XML string
 */
function convertToGraphML(graph) {
    // Define GraphML schema and attributes
    let graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
    <key id="lat" for="node" attr.name="latitude" attr.type="double"/>
    <key id="lon" for="node" attr.name="longitude" attr.type="double"/>
    <key id="weight" for="edge" attr.name="weight" attr.type="double"/>
    <key id="wayId" for="edge" attr.name="wayId" attr.type="long"/>
    <graph id="G" edgedefault="undirected">
`;

    // Add all nodes with their coordinates
    graph.nodes.forEach(node => {
        graphml += `        <node id="n${node.id}">
            <data key="lat">${node.lat}</data>
            <data key="lon">${node.lon}</data>
        </node>\n`;
    });

    // Add all edges with their properties
    graph.edges.forEach((edge, index) => {
        graphml += `        <edge id="e${index}" source="n${edge.source}" target="n${edge.target}">
            <data key="weight">${edge.weight}</data>
            <data key="wayId">${edge.wayId}</data>
        </edge>\n`;
    });

    graphml += '    </graph>\n</graphml>';
    return graphml;
} 