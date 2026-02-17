/**
 * Background script for OSM Graph Generator Extension
 * Handles data fetching, graph generation, and format conversion
 */

import {
    validateBounds,
    buildOverpassQuery,
    convertToGraph,
    convertToGraphML
} from '../lib/graph-utils.js';

// Constants for API endpoints
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// Cache for storing temporary graph data between operations
let graphCache = null;

/**
 * Fetches OSM data using the Overpass API
 * @param {Object} bounds - Bounding box coordinates
 * @returns {Promise<Object>} JSON response from Overpass API
 * @throws {Error} If the fetch request fails
 */
async function fetchOsmData(bounds) {
    try {
        validateBounds(bounds);
        const query = buildOverpassQuery(bounds);
        const response = await fetch(OVERPASS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ data: query })
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
 * Handle messages from content script and popup
 * Supports three operations:
 * 1. FETCH_OSM_DATA: Fetches and converts OSM data to graph
 * 2. GET_GRAPH: Returns cached graph data
 * 3. EXPORT_GRAPH: Exports graph in specified format
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
