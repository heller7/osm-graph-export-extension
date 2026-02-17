/**
 * Background script for OSM Graph Generator Extension
 * Handles data fetching, graph generation, and format conversion
 */

import {
    validateBounds,
    buildOverpassQuery,
    convertToGraph,
    convertToGraphML,
    convertToCSV,
    convertToTikZ,
    splitBounds,
    mergeOsmData
} from '../lib/graph-utils.js';

// Constants for API endpoints
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// Threshold in degrees — areas larger than this get tiled
const TILE_THRESHOLD = 0.1;

// Cache for storing temporary graph data between operations
let graphCache = null;

/**
 * Fetches a single tile of OSM data from Overpass API
 * @param {Object} bounds - Bounding box coordinates for one tile
 * @returns {Promise<Object>} JSON response from Overpass API
 */
async function fetchTile(bounds) {
    const query = buildOverpassQuery(bounds);
    const response = await fetch(OVERPASS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query })
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

/**
 * Fetches OSM data, tiling large areas automatically
 * @param {Object} bounds - Bounding box coordinates
 * @returns {Promise<Object>} JSON response (merged if tiled)
 */
async function fetchOsmData(bounds) {
    try {
        validateBounds(bounds);

        const latSpan = bounds.north - bounds.south;
        const lonSpan = bounds.east - bounds.west;
        const needsTiling = latSpan > TILE_THRESHOLD || lonSpan > TILE_THRESHOLD;

        if (!needsTiling) {
            return await fetchTile(bounds);
        }

        // Split into tiles and fetch sequentially to avoid rate-limiting
        const tiles = splitBounds(bounds);
        console.log(`Fetching ${tiles.length} tiles for large area`);

        const results = [];
        for (const tile of tiles) {
            results.push(await fetchTile(tile));
        }

        return mergeOsmData(results);
    } catch (error) {
        console.error('Error fetching OSM data:', error);
        throw error;
    }
}

/**
 * Handle messages from content script and popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request.type);

    if (request.type === 'FETCH_OSM_DATA') {
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

    } else if (request.type === 'GET_GRAPH') {
        if (graphCache) {
            sendResponse({ success: true, data: graphCache });
        } else {
            sendResponse({ success: false, error: 'No graph data available' });
        }
        return false;

    } else if (request.type === 'EXPORT_GRAPH') {
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
            } else if (request.format === 'csv') {
                exportData = convertToCSV(graphData);
            } else if (request.format === 'tikz') {
                exportData = convertToTikZ(graphData);
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
