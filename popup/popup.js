document.addEventListener('DOMContentLoaded', () => {
    const graphStatus = document.getElementById('graphStatus');
    const exportFormat = document.getElementById('exportFormat');
    const exportButton = document.getElementById('exportGraph');
    
    // Check if there's any graph data available
    chrome.runtime.sendMessage({ type: 'GET_GRAPH' }, response => {
        if (response.success && response.data) {
            const graph = response.data;
            graphStatus.textContent = `Graph contains ${graph.nodes.length} nodes and ${graph.edges.length} edges`;
            exportButton.disabled = false;
        }
    });

    // Handle export
    exportButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({
            type: 'EXPORT_GRAPH',
            format: exportFormat.value
        }, response => {
            if (response.success) {
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
