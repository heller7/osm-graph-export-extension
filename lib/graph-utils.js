/**
 * Pure utility functions for OSM graph operations.
 * Extracted for testability and reuse.
 */

const DEFAULT_TIMEOUT = 25;

/**
 * Converts degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
export function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Calculates distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Validates bounding box coordinates
 * @param {Object} bounds - {north, south, east, west}
 * @throws {Error} If bounds are invalid
 */
export function validateBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') {
        throw new Error('Bounds must be an object');
    }

    const { north, south, east, west } = bounds;

    for (const [name, value] of Object.entries({ north, south, east, west })) {
        if (typeof value !== 'number' || isNaN(value)) {
            throw new Error(`${name} must be a valid number`);
        }
    }

    if (north <= south) {
        throw new Error('North must be greater than south');
    }

    if (north > 90 || north < -90 || south > 90 || south < -90) {
        throw new Error('Latitude must be between -90 and 90');
    }

    if (east > 180 || east < -180 || west > 180 || west < -180) {
        throw new Error('Longitude must be between -180 and 180');
    }

    if (east <= west) {
        throw new Error('East must be greater than west');
    }
}

/**
 * Builds an Overpass QL query string for fetching road data
 * @param {Object} bounds - Bounding box coordinates {north, south, east, west}
 * @returns {string} Formatted Overpass QL query
 * @throws {Error} If bounds are invalid
 */
export function buildOverpassQuery(bounds) {
    validateBounds(bounds);
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
 * Converts raw OSM data into a graph structure
 * @param {Object} osmData - Raw data from Overpass API
 * @returns {Object} Graph with nodes and edges arrays
 */
export function convertToGraph(osmData) {
    const nodes = new Map();
    const edges = [];

    if (!osmData || !Array.isArray(osmData.elements)) {
        return { nodes: [], edges: [] };
    }

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
        if (element.type === 'way' && Array.isArray(element.nodes)) {
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
 * Converts graph data to GraphML format
 * @param {Object} graph - Graph data with nodes and edges
 * @returns {string} GraphML formatted XML string
 */
export function convertToGraphML(graph) {
    let graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
    <key id="lat" for="node" attr.name="latitude" attr.type="double"/>
    <key id="lon" for="node" attr.name="longitude" attr.type="double"/>
    <key id="weight" for="edge" attr.name="weight" attr.type="double"/>
    <key id="wayId" for="edge" attr.name="wayId" attr.type="long"/>
    <graph id="G" edgedefault="undirected">
`;

    graph.nodes.forEach(node => {
        graphml += `        <node id="n${node.id}">
            <data key="lat">${node.lat}</data>
            <data key="lon">${node.lon}</data>
        </node>\n`;
    });

    graph.edges.forEach((edge, index) => {
        graphml += `        <edge id="e${index}" source="n${edge.source}" target="n${edge.target}">
            <data key="weight">${edge.weight}</data>
            <data key="wayId">${edge.wayId}</data>
        </edge>\n`;
    });

    graphml += '    </graph>\n</graphml>';
    return graphml;
}
