document.addEventListener('DOMContentLoaded', () => {
    const graphStatus = document.getElementById('graphStatus');
    const exportFormat = document.getElementById('exportFormat');
    const exportButton = document.getElementById('exportGraph');

    let graphData = null;

    // Check if there's any graph data available
    chrome.runtime.sendMessage({ type: 'GET_GRAPH' }, response => {
        if (chrome.runtime.lastError) {
            graphStatus.textContent = 'Could not reach extension';
            return;
        }
        if (response && response.success && response.data &&
            Array.isArray(response.data.nodes) && Array.isArray(response.data.edges)) {
            graphData = response.data;
            graphStatus.textContent = `Graph contains ${graphData.nodes.length} nodes and ${graphData.edges.length} edges`;
            exportButton.disabled = false;
        }
    });

    // Handle export
    exportButton.addEventListener('click', () => {
        if (!graphData) {
            graphStatus.textContent = 'No graph data available to export';
            return;
        }

        chrome.runtime.sendMessage({
            type: 'EXPORT_GRAPH',
            format: exportFormat.value,
            data: graphData
        }, response => {
            if (chrome.runtime.lastError) {
                graphStatus.textContent = 'Extension error: ' + chrome.runtime.lastError.message;
                return;
            }
            if (response && response.success) {
                // Create and trigger download
                const blob = new Blob([response.data], {
                    type: exportFormat.value === 'json'
                        ? 'application/json'
                        : 'application/xml'
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `osm-graph.${exportFormat.value}`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                graphStatus.textContent = response ? response.error : 'Export failed';
            }
        });
    });

    // Handle settings changes
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            chrome.storage.sync.set({
                [checkbox.id]: checkbox.checked
            });
        });

        // Load saved settings
        chrome.storage.sync.get(checkbox.id, result => {
            checkbox.checked = result[checkbox.id] || false;
        });
    });
});
