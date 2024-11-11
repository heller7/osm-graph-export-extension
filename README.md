# osm-graph-export-extension (ogee) - an OSM Graph Generator Chrome Extension

A Chrome extension that generates graph representations of OpenStreetMap road networks. This tool allows users to select an area on OpenStreetMap and export the road network as a graph in various formats.

## Features

- 🗺️ Direct integration with OpenStreetMap interface
- 📍 Dynamic bounding box selection based on map view
- 🛣️ Filters out minor roads (footways, service roads, etc.)
- 📊 Generates weighted graphs from road networks
- 💾 Exports to multiple formats (JSON, GraphML)
- 📏 Edge weights based on real-world distances
- 🔄 Real-time coordinate updates as you navigate the map

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/osm-graph-generator.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked" and select the extension directory

## Usage

1. Visit [OpenStreetMap](https://www.openstreetmap.org)

2. Click the "Generate Graph" button in the navigation bar

3. The sidebar will open with the graph generation panel:
   - Coordinates are automatically set based on your current map view
   - Adjust the bounding box coordinates if needed
   - Click "Generate Graph" to create the network

4. Once generated, you can:
   - Export as JSON for further processing
   - Export as GraphML for visualization in tools like Gephi

## Graph Format

### JSON Structure

```
json
{
"nodes": [
{
"id": "node_id",
"lat": latitude,
"lon": longitude
}
],
"edges": [
{
"source": "source_node_id",
"target": "target_node_id",
"wayId": "osm_way_id",
"weight": distance_in_km
}
]
}
```


### GraphML Structure
- Nodes include latitude and longitude attributes
- Edges include weight (distance) and OSM way ID
- Compatible with graph visualization software

## Technical Details

- Uses Overpass API to fetch OSM data
- Implements Haversine formula for distance calculations
- Generates undirected weighted graphs
- Excludes minor road types for cleaner network representation

## Development

### Project Structure

osm-graph-exporter/
├── manifest.json
├── background/
│ └── background.js
├── content/
│ └── content.js
└── icons/
├── icon-48.png
└── icon-128.png


### Key Components

- **Content Script**: Handles UI integration with OpenStreetMap
- **Background Script**: Manages data fetching and graph generation
- **Message Passing**: Coordinates between content and background scripts

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Acknowledgments

- [OpenStreetMap](https://www.openstreetmap.org) for providing the map data
- [Overpass API](https://overpass-api.de/) for data access
- GraphML format specification


## Future Improvements

- [ ] Add support for directed graphs
- [ ] Include additional road attributes
- [ ] Implement more export formats
- [ ] Add graph visualization preview
- [ ] Support for larger areas with pagination
