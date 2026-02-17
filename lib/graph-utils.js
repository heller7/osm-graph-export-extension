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
 * Splits a bounding box into smaller tiles for pagination
 * @param {Object} bounds - {north, south, east, west}
 * @param {number} maxDeg - Maximum tile size in degrees (default 0.05 ≈ 5km)
 * @returns {Object[]} Array of tile bounds
 */
export function splitBounds(bounds, maxDeg = 0.05) {
    const tiles = [];
    const overlap = maxDeg * 0.1;

    for (let s = bounds.south; s < bounds.north; s += maxDeg) {
        for (let w = bounds.west; w < bounds.east; w += maxDeg) {
            tiles.push({
                south: Math.max(s - overlap, -90),
                north: Math.min(s + maxDeg + overlap, 90),
                west: Math.max(w - overlap, -180),
                east: Math.min(w + maxDeg + overlap, 180)
            });
        }
    }

    return tiles;
}

/**
 * Merges multiple Overpass API responses, deduplicating by element type+id
 * @param {Object[]} results - Array of Overpass API response objects
 * @returns {Object} Merged response with deduplicated elements
 */
export function mergeOsmData(results) {
    const elements = [];
    const seen = new Set();

    for (const result of results) {
        if (!result || !Array.isArray(result.elements)) continue;
        for (const element of result.elements) {
            const key = `${element.type}-${element.id}`;
            if (!seen.has(key)) {
                seen.add(key);
                elements.push(element);
            }
        }
    }

    return { elements };
}

/**
 * Converts raw OSM data into a directed graph structure.
 * Respects one-way tags: two-way roads get edges in both directions,
 * one-way roads get a single directed edge.
 * Includes highway type and road name from way tags.
 * @param {Object} osmData - Raw data from Overpass API
 * @returns {Object} Graph with nodes and edges arrays (NetworkX node-link format)
 */
export function convertToGraph(osmData) {
    const nodes = new Map();
    const edges = [];

    if (!osmData || !Array.isArray(osmData.elements)) {
        return { directed: true, multigraph: false, graph: {}, nodes: [], edges: [] };
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
            const tags = element.tags || {};
            const highway = tags.highway || '';
            const name = tags.name || '';
            const oneway = tags.oneway;

            for (let i = 0; i < element.nodes.length - 1; i++) {
                const fromNode = nodes.get(element.nodes[i]);
                const toNode = nodes.get(element.nodes[i + 1]);

                if (fromNode && toNode) {
                    const weight = calculateDistance(
                        fromNode.lat, fromNode.lon,
                        toNode.lat, toNode.lon
                    );

                    const edgeAttrs = {
                        wayId: element.id,
                        weight,
                        highway,
                        name,
                    };

                    // Forward edge (unless oneway=-1 which means reverse-only)
                    if (oneway !== '-1') {
                        edges.push({ source: fromNode.id, target: toNode.id, ...edgeAttrs });
                    }

                    // Reverse edge (unless explicitly one-way forward)
                    if (oneway !== 'yes' && oneway !== 'true' && oneway !== '1') {
                        edges.push({ source: toNode.id, target: fromNode.id, ...edgeAttrs });
                    }
                }
            }
        }
    });

    return {
        directed: true,
        multigraph: false,
        graph: {},
        nodes: Array.from(nodes.values()),
        edges: edges
    };
}

/**
 * Escapes a value for safe XML attribute/content use
 * @param {*} value - Value to escape
 * @returns {string} XML-safe string
 */
export function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Converts graph data to GraphML format (directed)
 * @param {Object} graph - Graph data with nodes and edges
 * @returns {string} GraphML formatted XML string
 */
export function convertToGraphML(graph) {
    let graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
    <key id="lat" for="node" attr.name="lat" attr.type="double"/>
    <key id="lon" for="node" attr.name="lon" attr.type="double"/>
    <key id="weight" for="edge" attr.name="weight" attr.type="double"/>
    <key id="wayId" for="edge" attr.name="wayId" attr.type="long"/>
    <key id="highway" for="edge" attr.name="highway" attr.type="string"/>
    <key id="name" for="edge" attr.name="name" attr.type="string"/>
    <graph id="G" edgedefault="directed">
`;

    graph.nodes.forEach(node => {
        graphml += `        <node id="${escapeXml(node.id)}">
            <data key="lat">${escapeXml(node.lat)}</data>
            <data key="lon">${escapeXml(node.lon)}</data>
        </node>\n`;
    });

    graph.edges.forEach((edge, index) => {
        graphml += `        <edge id="e${index}" source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}">
            <data key="weight">${escapeXml(edge.weight)}</data>
            <data key="wayId">${escapeXml(edge.wayId)}</data>
            <data key="highway">${escapeXml(edge.highway || '')}</data>
            <data key="name">${escapeXml(edge.name || '')}</data>
        </edge>\n`;
    });

    graphml += '    </graph>\n</graphml>';
    return graphml;
}

/**
 * Escapes a value for CSV output (RFC 4180)
 * @param {*} value - Value to escape
 * @returns {string} CSV-safe string
 */
function csvEscape(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * Converts graph data to CSV edge list format
 * @param {Object} graph - Graph data with nodes and edges
 * @returns {string} CSV string with header row
 */
export function convertToCSV(graph) {
    const header = 'source,target,weight,highway,name,wayId';
    const rows = graph.edges.map(edge =>
        [
            csvEscape(edge.source),
            csvEscape(edge.target),
            csvEscape(edge.weight),
            csvEscape(edge.highway || ''),
            csvEscape(edge.name || ''),
            csvEscape(edge.wayId)
        ].join(',')
    );
    return [header, ...rows].join('\n');
}

/**
 * Escapes a string for safe use in LaTeX
 * @param {*} value - Value to escape
 * @returns {string} LaTeX-safe string
 */
function latexEscape(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[&%$#_{}~^]/g, m => '\\' + m);
}

/**
 * Converts graph data to a LaTeX TikZ standalone document.
 * Node positions are projected from lat/lon to a local coordinate system in cm.
 * @param {Object} graph - Graph data with nodes and edges
 * @returns {string} Complete LaTeX document string
 */
export function convertToTikZ(graph) {
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];

    if (nodes.length === 0) {
        return `\\documentclass[tikz]{standalone}
\\begin{document}
\\begin{tikzpicture}
  % empty graph
\\end{tikzpicture}
\\end{document}`;
    }

    // Compute bounding box
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const n of nodes) {
        if (n.lat < minLat) minLat = n.lat;
        if (n.lat > maxLat) maxLat = n.lat;
        if (n.lon < minLon) minLon = n.lon;
        if (n.lon > maxLon) maxLon = n.lon;
    }

    // Scale so the longer axis fits in 10 cm
    const latRange = maxLat - minLat || 1;
    const lonRange = maxLon - minLon || 1;
    const scale = 10 / Math.max(latRange, lonRange);

    // Build node id→index map for TikZ node names
    const idToIdx = new Map();
    nodes.forEach((n, i) => idToIdx.set(n.id, i));

    // Coordinate lines: x from lon, y from lat (origin at minLon, minLat)
    const coordLines = nodes.map(n => {
        const x = ((n.lon - minLon) * scale).toFixed(4);
        const y = ((n.lat - minLat) * scale).toFixed(4);
        return `  \\node[vertex] (n${idToIdx.get(n.id)}) at (${x},${y}) {};`;
    });

    // Deduplicate edges: for directed graph with bidirectional edges, draw once without arrow
    const edgeSet = new Set();
    const edgeLines = [];
    for (const e of edges) {
        const si = idToIdx.get(e.source);
        const ti = idToIdx.get(e.target);
        if (si === undefined || ti === undefined) continue;

        // Canonical key for dedup (undirected drawing)
        const lo = Math.min(si, ti);
        const hi = Math.max(si, ti);
        const key = `${lo}-${hi}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);

        edgeLines.push(`  \\draw[edge] (n${si}) -- (n${ti});`);
    }

    return `\\documentclass[tikz]{standalone}
\\usepackage{tikz}
\\begin{document}
\\begin{tikzpicture}[
  vertex/.style={circle, fill=black, inner sep=0pt, minimum size=1.5pt},
  edge/.style={draw, thin, black!40},
]
${coordLines.join('\n')}
${edgeLines.join('\n')}
\\end{tikzpicture}
\\end{document}`;
}
