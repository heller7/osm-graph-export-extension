import { describe, test, expect } from '@jest/globals';
import {
    toRad,
    calculateDistance,
    validateBounds,
    buildOverpassQuery,
    convertToGraph,
    convertToGraphML
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
        expect(distance).toBeCloseTo(343, -1); // within ~10 km
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

describe('convertToGraph', () => {
    test('returns empty graph for null input', () => {
        const result = convertToGraph(null);
        expect(result).toEqual({ nodes: [], edges: [] });
    });

    test('returns empty graph for missing elements', () => {
        const result = convertToGraph({});
        expect(result).toEqual({ nodes: [], edges: [] });
    });

    test('returns empty graph for empty elements array', () => {
        const result = convertToGraph({ elements: [] });
        expect(result).toEqual({ nodes: [], edges: [] });
    });

    test('collects nodes only (no edges without ways)', () => {
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

    test('creates edges from a single way', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'node', id: 2, lat: 52.53, lon: 13.406 },
                { type: 'node', id: 3, lat: 52.54, lon: 13.407 },
                { type: 'way', id: 100, nodes: [1, 2, 3] }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.nodes).toHaveLength(3);
        expect(result.edges).toHaveLength(2);
        expect(result.edges[0].source).toBe(1);
        expect(result.edges[0].target).toBe(2);
        expect(result.edges[0].wayId).toBe(100);
        expect(result.edges[0].weight).toBeGreaterThan(0);
        expect(result.edges[1].source).toBe(2);
        expect(result.edges[1].target).toBe(3);
    });

    test('creates edges from multiple ways', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'node', id: 2, lat: 52.53, lon: 13.406 },
                { type: 'node', id: 3, lat: 52.54, lon: 13.407 },
                { type: 'way', id: 100, nodes: [1, 2] },
                { type: 'way', id: 101, nodes: [2, 3] }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.edges).toHaveLength(2);
        expect(result.edges[0].wayId).toBe(100);
        expect(result.edges[1].wayId).toBe(101);
    });

    test('skips edges with missing node references', () => {
        const osmData = {
            elements: [
                { type: 'node', id: 1, lat: 52.52, lon: 13.405 },
                { type: 'way', id: 100, nodes: [1, 999] }
            ]
        };
        const result = convertToGraph(osmData);
        expect(result.nodes).toHaveLength(1);
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
        expect(result.nodes).toHaveLength(1);
        expect(result.edges).toHaveLength(0);
    });
});

describe('convertToGraphML', () => {
    const simpleGraph = {
        nodes: [
            { id: 1, lat: 52.52, lon: 13.405 },
            { id: 2, lat: 52.53, lon: 13.406 }
        ],
        edges: [
            { source: 1, target: 2, wayId: 100, weight: 1.234 }
        ]
    };

    test('produces valid XML header', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<graphml');
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

    test('includes node coordinates as data attributes', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('<data key="lat">52.52</data>');
        expect(xml).toContain('<data key="lon">13.405</data>');
    });

    test('includes edge weight and wayId', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('<data key="weight">1.234</data>');
        expect(xml).toContain('<data key="wayId">100</data>');
    });

    test('edge references correct nodes', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('source="n1"');
        expect(xml).toContain('target="n2"');
    });

    test('handles empty graph', () => {
        const xml = convertToGraphML({ nodes: [], edges: [] });
        expect(xml).toContain('<graphml');
        expect(xml).toContain('</graphml>');
        expect(xml).not.toContain('<node');
        expect(xml).not.toContain('<edge');
    });

    test('declares graph as undirected', () => {
        const xml = convertToGraphML(simpleGraph);
        expect(xml).toContain('edgedefault="undirected"');
    });
});
