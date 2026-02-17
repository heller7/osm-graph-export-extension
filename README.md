# osm-graph-export-extension (ogee)

A Chrome extension that generates graph representations of OpenStreetMap road networks. Select an area on OpenStreetMap and export the road network as a graph — ready to import into [NetworkX](https://networkx.org/).

## Features

- Direct integration with the OpenStreetMap interface
- Dynamic bounding box selection based on map view
- Filters out minor roads (footways, service roads, etc.)
- Generates weighted, directed graphs from road networks
- Respects one-way street tags (forward, reverse, bidirectional)
- Edge weights are real-world distances (km) via the Haversine formula
- Edges include road type (`highway`) and street name (`name`)
- Exports to JSON, GraphML, CSV, and LaTeX TikZ
- In-browser graph preview before exporting
- Automatic tiling for large areas (fetches in chunks to avoid API timeouts)

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/heller7/osm-graph-export-extension.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the extension directory

## Usage

1. Visit [OpenStreetMap](https://www.openstreetmap.org)

2. Click "Export" in the navigation bar (added by the extension, next to the existing nav items)

3. The sidebar opens with the graph generation panel:
   - Coordinates are automatically set based on your current map view
   - Adjust the bounding box if needed
   - Click "Generate Graph" to fetch the road network

4. A preview of the graph is displayed on a canvas in the sidebar

5. Choose a format (JSON, GraphML, CSV, or LaTeX TikZ) and click "Export Graph" to download

## NetworkX Import

All three export formats can be loaded directly into [NetworkX](https://networkx.org/).

### JSON

```python
import json
import networkx as nx
from networkx.readwrite import json_graph

with open("osm-graph.json") as f:
    data = json.load(f)

G = json_graph.node_link_graph(data)

# Nodes have 'lat' and 'lon' attributes
for node, attrs in G.nodes(data=True):
    print(f"Node {node}: ({attrs['lat']}, {attrs['lon']})")

# Edges have 'weight' (km), 'wayId', 'highway' (road type), and 'name' (street name)
for u, v, attrs in G.edges(data=True):
    print(f"{u} -> {v}: {attrs['weight']:.3f} km ({attrs.get('highway', '')}, {attrs.get('name', '')})")
```

### GraphML

```python
import networkx as nx

G = nx.read_graphml("osm-graph.graphml")

for node, attrs in G.nodes(data=True):
    print(f"Node {node}: ({attrs['lat']}, {attrs['lon']})")

for u, v, attrs in G.edges(data=True):
    print(f"{u} -> {v}: {attrs['weight']:.3f} km")
```

**Note:** GraphML node IDs are loaded as strings by default. To use integer IDs, pass `node_type=int`:

```python
G = nx.read_graphml("osm-graph.graphml", node_type=int)
```

### CSV

```python
import networkx as nx
import csv

G = nx.DiGraph()
with open("osm-graph.csv") as f:
    reader = csv.DictReader(f)
    for row in reader:
        G.add_edge(
            int(row["source"]), int(row["target"]),
            weight=float(row["weight"]),
            highway=row["highway"],
            name=row["name"],
            wayId=int(row["wayId"]),
        )
```

### Plotting example

```python
import networkx as nx
import matplotlib.pyplot as plt
from networkx.readwrite import json_graph
import json

with open("osm-graph.json") as f:
    G = json_graph.node_link_graph(json.load(f))

pos = {n: (d["lon"], d["lat"]) for n, d in G.nodes(data=True)}
nx.draw(G, pos, node_size=5, width=0.5)
plt.title("OSM Road Network")
plt.axis("equal")
plt.show()
```

## Graph Format

### JSON structure

```json
{
  "directed": true,
  "multigraph": false,
  "graph": {},
  "nodes": [
    { "id": 123456, "lat": 52.52, "lon": 13.405 }
  ],
  "edges": [
    { "source": 123456, "target": 789012, "wayId": 98765, "weight": 0.342, "highway": "residential", "name": "Beispielstraße" }
  ]
}
```

### GraphML structure

Nodes carry `lat`/`lon` attributes, edges carry `weight` (km), `wayId`, `highway` (road type), and `name` (street name). The graph is declared as `directed`.

### CSV structure

Edge list with header row: `source,target,weight,highway,name,wayId`. Values are escaped per RFC 4180.

### LaTeX TikZ

The TikZ export produces a standalone LaTeX document that renders the graph. Node positions are projected from lat/lon to a local coordinate system scaled to fit in 10 cm. Bidirectional edges are drawn once to avoid overlapping lines.

Compile with:

```bash
pdflatex osm-graph.tex
```

## Development

### Project Structure

```
osm-graph-export-extension/
├── manifest.json
├── background/
│   └── background.js        # Service worker: API calls, graph conversion
├── content/
│   └── content.js            # Injected into openstreetmap.org
├── popup/
│   ├── popup.html
│   └── popup.js              # Extension popup UI
├── lib/
│   └── graph-utils.js        # Pure functions (testable, shared)
├── styles/
│   ├── content.css
│   └── popup.css
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── tests/
    └── graph-utils.test.js
```

### Running Tests

```bash
npm install
npm test
```

## License

This project is licensed under the MIT License.

## Acknowledgments

- [OpenStreetMap](https://www.openstreetmap.org) for providing the map data
- [Overpass API](https://overpass-api.de/) for data access
