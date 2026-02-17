import { describe, test, expect } from '@jest/globals';
import {
    toRad,
    calculateDistance,
    validateBounds,
    buildOverpassQuery,
    convertToGraph,
    convertToGraphML,
    convertToCSV,
    convertToTikZ,
    escapeXml,
    splitBounds,
    mergeOsmData
} from '../lib/graph-utils.js';

describe('toRad', () => {
    test('converts 0 degrees to 0 radians', () => {
        expect(toRad(0)).toBe(0);
    });

    test('converts 90 degrees to π/2', () => {
        expect(toRad(90)).toBeCloseTo(Math.PI / 2);
    });

    test('converts 180 degrees to π', () => {
        expect(toRad(180)).toBeCloseTo(Math.PI);
    });

    test('converts 360 degrees to 2π', () => {
        expect(toRad(360)).toBeCloseTo(2 * Math.PI);
    });

    test('converts negative degrees', () => {
        expect(toRad(-90)).toBeCloseTo(-Math.PI / 2);
    });
});

describe('calculateDistance', () => {
    test('same point returns 0', () => {
        expect(calculateDistance(52.52, 13.405, 52.52, 13.405)).toBe(0);
    });

    test('London to Paris ≈ 343 km', () => {
        const distance = calculateDistance(51.5074, -0.1278, 48.8566, 2.3522);
        expect(distance).toBeCloseTo(343, -1);
    });

    test('distance is symmetric', () => {
        const d1 = calculateDistance(51.5074, -0.1278, 48.8566, 2.3522);
        const d2 = calculateDistance(48.8566, 2.3522, 51.5074, -0.1278);
        expect(d1).toBeCloseTo(d2, 10);
    });

    test('antipodal points ≈ 20015 km (half circumference)', () => {
        const distance = calculateDistance(0, 0, 0, 180);
        expect(distance).toBeCloseTo(20015, -2);
    });
});

describe('validateBounds', () => {
    const validBounds = { north: 52.52, south: 52.50, east: 13.41, west: 13.39 };

    test('valid bounds do not throw', () => {
        expect(() => validateBounds(validBounds)).not.toThrow();
    });

    test('throws on null input', () => {
        expect(() => validateBounds(null)).toThrow('Bounds must be an object');
    });

    test('throws on NaN coordinate', () => {
        expect(() => validateBounds({ ...validBounds, north: NaN })).toThrow('north must be a valid number');
    });

    test('throws when north <= south', () => {
        expect(() => validateBounds({ ...validBounds, north: 52.49 })).toThrow('North must be greater than south');
    });

    test('throws when north equals south', () => {
        expect(() => validateBounds({ ...validBounds, north: 52.50 })).toThrow('North must be greater than south');
    });

    test('throws on latitude out of range', () => {
        expect(() => validateBounds({ ...validBounds, north: 91 })).toThrow('Latitude must be between -90 and 90');
    });

    test('throws on longitude out of range', () => {
        expect(() => validateBounds({ ...validBounds, east: 181 })).toThrow('Longitude must be between -180 and 180');
    });

    test('throws when east <= west', () => {
        expect(() => validateBounds({ ...validBounds, east: 13.38 })).toThrow('East must be greater than west');
    });

    test('throws when east equals west', () => {
        expect(() => validateBounds({ ...validBounds, east: 13.39 })).toThrow('East must be greater than west');
    });

    test('throws on missing field', () => {
        expect(() => validateBounds({ north: 52.52, south: 52.50, east: 13.41 })).toThrow('west must be a valid number');
    });
});

describe('buildOverpassQuery', () => {
    const bounds = { north: 52.52, south: 52.50, east: 13.41, west: 13.39 };

    test('contains bbox values in correct order', () => {
        const query = buildOverpassQuery(bounds);
        expect(query).toContain('52.5,13.39,52.52,13.41');
    });

    test('contains [out:json] directive', () => {
        const query = buildOverpassQuery(bounds);
        expect(query).toContain('[out:json]');
    });

    test('contains highway filter', () => {
        const query = buildOverpassQuery(bounds);
        expect(query).toContain('highway!~"footway|cycleway|path|service|track"');
    });

    test('throws on invalid bounds', () => {
        expect(() => buildOverpassQuery({ north: 52.49, south: 52.50, east: 13.41, west: 13.39 })).toThrow();
    });
});

describe('splitBounds', () => {
    test('small area returns single tile', () => {
        const bounds = { north: 52.52, south: 52.50, east: 13.41, west: 13.39 };
        const tiles = splitBounds(bounds);
        expect(tiles.length).toBe(1);
    });

    test('large area returns multiple tiles', () => {
        const bounds = { north: 52.6, south: 52.5, east: 13.5, west: 13.3 };
        const tiles = splitBounds(bounds);
        expect(tiles.length).toBeGreaterThan(1);
    });

    test('tiles cover the entire area', () => {
        const bounds = { north: 52.6, south: 52.5, east: 13.5, west: 13.3 };
        const tiles = splitBounds(bounds);
        const minSouth = Math.min(...tiles.map(t => t.south));
        const maxNorth = Math.max(...tiles.map(t => t.north));
        const minWest = Math.min(...tiles.map(t => t.west));
        const maxEast = Math.max(...tiles.map(t => t.east));
        expect(minSouth).toBeLessThanOrEqual(bounds.south);
        expect(maxNorth).toBeGreaterThanOrEqual(bounds.north);
        expect(minWest).toBeLessThanOrEqual(bounds.west);
        expect(maxEast).toBeGreaterThanOrEqual(bounds.east);
    });

    test('each tile has valid bounds', () => {
        const bounds = { north: 52.6, south: 52.5, east: 13.5, west: 13.3 };
        const tiles = splitBounds(bounds);
        for (const t of tiles) {
            expect(t.north).toBeGreaterThan(t.south);
            expect(t.east).toBeGreaterThan(t.west);
        }
    });
});

describe('mergeOsmData', () => {
    test('merges two results', () => {
        const a = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] };
        const b = { elements: [{ type: 'node', id: 2, lat: 1, lon: 1 }] };
        const merged = mergeOsmData([a, b]);
        expect(merged.elements).toHaveLength(2);
    });

    test('deduplicates by type+id', () => {
        const a = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] };
        const b = { elements: [{ type: 'node', id: 1, lat: 0, lon: 0 }] };
        const merged = mergeOsmData([a, b]);
        expect(merged.elements).toHaveLength(1);
    });

    test('same id with different type is kept', () => {
        const a = { elements: [{ type: 'node', id: 1 }] };
        const b = { elements: [{ type: 'way', id: 1 }] };
        const merged = mergeOsmData([a, b]);
        expect(merged.elements).toHaveLength(2);
    });

    test('skips null/invalid results', () => {
        const a = { elements: [{ type: 'node', id: 1 }] };
        const merged = mergeOsmData([null, a, {}]);
        expect(merged.elements).toHaveLength(1);
    });
});

describe('convertToGraph', () => {
    const emptyGraph = { directed: true, multigraph: false, graph: {}, nodes: [], edges: [] };

    test('returns empty graph for null input', () => {
        expect(convertToGraph(null)).toEqual(emptyGraph);
    });

    test('returns empty graph for missing elements', () => {
        expect(convertToGraph({})).toEqual(emptyGraph);
    });

    test('returns empty graph for empty elements array', () => {
        expect(convertToGraph({ elements: [] })).toEqual(emptyGraph);
    });

    test('output is a directed graph', () => {
        const result = convertToGraph({ elements: [] });
        expect(result.directed).toBe(true);
        expect(result.multigraph).toBe(false);
    });

    test('collects nodes with lat/lon', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'node', id: 2, lat: 52.53, lon: 13.406 }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.nodes).toHaveLength(2);
        expect(result.edges).toHaveLength(0);
    });

    test('two-way road produces edges in both directions', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'node', id: 2, lat: 52.53, lon: 13.406 },
                { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'residential' } }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.edges).toHaveLength(2);
        expect(result.edges[0].source).toBe(1);
        expect(result.edges[0].target).toBe(2);
        expect(result.edges[1].source).toBe(2);
        expect(result.edges[1].target).toBe(1);
    });

    test('oneway=yes produces only forward edges', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'node', id: 2, lat: 52.53, lon: 13.406 },
                { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'primary', oneway: 'yes' } }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.edges).toHaveLength(1);
        expect(result.edges[0].source).toBe(1);
        expect(result.edges[0].target).toBe(2);
    });

    test('oneway=-1 produces only reverse edges', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'node', id: 2, lat: 52.53, lon: 13.406 },
                { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'primary', oneway: '-1' } }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.edges).toHaveLength(1);
        expect(result.edges[0].source).toBe(2);
        expect(result.edges[0].target).toBe(1);
    });

    test('includes highway and name from tags', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'node', id: 2, lat: 52.53, lon: 13.406 },
                { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'tertiary', name: 'Main St' } }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.edges[0].highway).toBe('tertiary');
        expect(result.edges[0].name).toBe('Main St');
    });

    test('missing tags default to empty strings', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'node', id: 2, lat: 52.53, lon: 13.406 },
                { type: 'way', id: 100, nodes: [1, 2] }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.edges[0].highway).toBe('');
        expect(result.edges[0].name).toBe('');
    });

    test('edge weight is positive distance', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'node', id: 2, lat: 52.53, lon: 13.406 },
                { type: 'way', id: 100, nodes: [1, 2] }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.edges[0].weight).toBeGreaterThan(0);
    });

    test('skips edges with missing node references', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'way', id: 100, nodes: [1, 999] }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.edges).toHaveLength(0);
    });

    test('handles way without nodes array', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'way', id: 100 }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.edges).toHaveLength(0);
    });
});

describe('escapeXml', () => {
    test('passes through plain numbers', () => {
        expect(escapeXml(123)).toBe('123');
    });

    test('passes through plain strings', () => {
        expect(escapeXml('hello')).toBe('hello');
    });

    test('escapes ampersand', () => {
        expect(escapeXml('a&b')).toBe('a&amp;b');
    });

    test('escapes angle brackets', () => {
        expect(escapeXml('<script>')).toBe('&lt;script&gt;');
    });

    test('escapes quotes', () => {
        expect(escapeXml('"it\'s"')).toBe('&quot;it&apos;s&quot;');
    });
});

describe('convertToGraphML', () => {
    const simpleGraph = {
        nodes: [
            { id: 1, lat: 52.52, lon: 13.405 },
            { id: 2, lat: 52.53, lon: 13.406 }
        ],
        edges: [
            { source: 1, target: 2, wayId: 100, weight: 1.234, highway: 'residential', name: 'Main St' }
        ]
    };

    test('produces valid XML header', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<graphml');
    });

    test('declares graph as directed', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('edgedefault="directed"');
    });

    test('contains correct number of nodes', () => {
        const xml = convertToGraphML(simpleGraph);
        const nodeMatches = xml.match(/<node /g);
        expect(nodeMatches).toHaveLength(2);
    });

    test('contains correct number of edges', () => {
        const xml = convertToGraphML(simpleGraph);
        const edgeMatches = xml.match(/<edge /g);
        expect(edgeMatches).toHaveLength(1);
    });

    test('includes node coordinates', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('<data key="lat">52.52</data>');
        expect(xml).toContain('<data key="lon">13.405</data>');
    });

    test('includes edge weight, wayId, highway, and name', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('<data key="weight">1.234</data>');
        expect(xml).toContain('<data key="wayId">100</data>');
        expect(xml).toContain('<data key="highway">residential</data>');
        expect(xml).toContain('<data key="name">Main St</data>');
    });

    test('declares highway and name key attributes', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('attr.name="highway"');
        expect(xml).toContain('attr.name="name"');
    });

    test('node IDs use bare numeric values', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('<node id="1">');
        expect(xml).toContain('<node id="2">');
    });

    test('handles empty graph', () => {
        const xml = convertToGraphML({ nodes: [], edges: [] });
        expect(xml).toContain('<graphml');
        expect(xml).toContain('</graphml>');
        expect(xml).not.toContain('<node');
        expect(xml).not.toContain('<edge');
    });
});

describe('convertToCSV', () => {
    test('produces header row', () => {
        const csv = convertToCSV({ nodes: [], edges: [] });
        expect(csv).toBe('source,target,weight,highway,name,wayId');
    });

    test('formats edge data correctly', () => {
        const graph = {
            nodes: [],
            edges: [
                { source: 1, target: 2, weight: 0.5, highway: 'residential', name: 'Main St', wayId: 100 }
            ]
        };
        const csv = convertToCSV(graph);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[1]).toBe('1,2,0.5,residential,Main St,100');
    });

    test('quotes values with commas', () => {
        const graph = {
            nodes: [],
            edges: [
                { source: 1, target: 2, weight: 0.5, highway: 'residential', name: 'A, B Street', wayId: 100 }
            ]
        };
        const csv = convertToCSV(graph);
        expect(csv).toContain('"A, B Street"');
    });

    test('escapes double quotes in values', () => {
        const graph = {
            nodes: [],
            edges: [
                { source: 1, target: 2, weight: 0.5, highway: 'residential', name: 'The "Main" St', wayId: 100 }
            ]
        };
        const csv = convertToCSV(graph);
        expect(csv).toContain('"The ""Main"" St"');
    });

    test('handles multiple edges', () => {
        const graph = {
            nodes: [],
            edges: [
                { source: 1, target: 2, weight: 0.5, highway: 'primary', name: '', wayId: 100 },
                { source: 2, target: 3, weight: 1.0, highway: 'secondary', name: '', wayId: 101 }
            ]
        };
        const csv = convertToCSV(graph);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(3);
    });
});

describe('convertToTikZ', () => {
    const simpleGraph = {
        nodes: [
            { id: 1, lat: 52.52, lon: 13.40 },
            { id: 2, lat: 52.53, lon: 13.41 },
            { id: 3, lat: 52.51, lon: 13.42 }
        ],
        edges: [
            { source: 1, target: 2, weight: 1.0, wayId: 100 },
            { source: 2, target: 1, weight: 1.0, wayId: 100 },
            { source: 2, target: 3, weight: 0.5, wayId: 101 }
        ]
    };

    test('produces standalone LaTeX document', () => {
        const tex = convertToTikZ(simpleGraph);
        expect(tex).toContain('\\documentclass[tikz]{standalone}');
        expect(tex).toContain('\\begin{document}');
        expect(tex).toContain('\\end{document}');
    });

    test('contains tikzpicture environment', () => {
        const tex = convertToTikZ(simpleGraph);
        expect(tex).toContain('\\begin{tikzpicture}');
        expect(tex).toContain('\\end{tikzpicture}');
    });

    test('defines vertex and edge styles', () => {
        const tex = convertToTikZ(simpleGraph);
        expect(tex).toContain('vertex/.style=');
        expect(tex).toContain('edge/.style=');
    });

    test('creates a node for each graph node', () => {
        const tex = convertToTikZ(simpleGraph);
        const nodeMatches = tex.match(/\\node\[vertex\]/g);
        expect(nodeMatches).toHaveLength(3);
    });

    test('deduplicates bidirectional edges', () => {
        const tex = convertToTikZ(simpleGraph);
        // 1↔2 should be drawn once, 2→3 once = 2 draw commands
        const drawMatches = tex.match(/\\draw\[edge\]/g);
        expect(drawMatches).toHaveLength(2);
    });

    test('node coordinates are scaled to cm', () => {
        const tex = convertToTikZ(simpleGraph);
        // All coordinates should be non-negative numbers
        const coords = [...tex.matchAll(/at \(([^,]+),([^)]+)\)/g)];
        expect(coords).toHaveLength(3);
        for (const m of coords) {
            expect(parseFloat(m[1])).toBeGreaterThanOrEqual(0);
            expect(parseFloat(m[2])).toBeGreaterThanOrEqual(0);
        }
    });

    test('handles empty graph', () => {
        const tex = convertToTikZ({ nodes: [], edges: [] });
        expect(tex).toContain('\\begin{tikzpicture}');
        expect(tex).toContain('% empty graph');
        expect(tex).not.toContain('\\node');
        expect(tex).not.toContain('\\draw');
    });

    test('skips edges with missing node references', () => {
        const graph = {
            nodes: [{ id: 1, lat: 0, lon: 0 }, { id: 2, lat: 1, lon: 1 }],
            edges: [
                { source: 1, target: 999, weight: 1.0, wayId: 50 },
                { source: 1, target: 2, weight: 1.0, wayId: 51 }
            ]
        };
        const tex = convertToTikZ(graph);
        const drawMatches = tex.match(/\\draw\[edge\]/g);
        expect(drawMatches).toHaveLength(1);
    });
});
