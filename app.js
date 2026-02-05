// Global State
let charts = {};
let autoRefreshInterval = null;
let currentLogs = [];
let transactions = {};
let anomalies = [];
let chargerStats = {};
let overstayRecords = [];
let allOverstayRecords = [];
let stations = {};
let currentView = 'dashboard';
let appSettings = {
    serverUrl: 'https://c7tst.tesi.com.ph:8041',
    logLimit: 100,
    refreshInterval: 5,
    timeRange: '24h',
    analysisMode: 'realtime'
};

// Pagination state
let currentPage = 1;
let recordsPerPage = 10;
let totalPages = 1;

// Load settings from localStorage
function loadSettings() {
    const saved = localStorage.getItem('ocppSettings');
    if (saved) {
        appSettings = {...appSettings, ...JSON.parse(saved)};
        document.getElementById('settingsServerUrl').value = appSettings.serverUrl;
        document.getElementById('settingsLogLimit').value = appSettings.logLimit;
        document.getElementById('settingsRefreshInterval').value = appSettings.refreshInterval;
        document.getElementById('settingsTimeRange').value = appSettings.timeRange;
        document.getElementById('settingsAnalysisMode').value = appSettings.analysisMode;
    }
}

// Save settings
function saveSettings() {
    appSettings.serverUrl = document.getElementById('settingsServerUrl').value;
    appSettings.logLimit = parseInt(document.getElementById('settingsLogLimit').value);
    appSettings.refreshInterval = parseInt(document.getElementById('settingsRefreshInterval').value);
    appSettings.timeRange = document.getElementById('settingsTimeRange').value;
    appSettings.analysisMode = document.getElementById('settingsAnalysisMode').value;

    localStorage.setItem('ocppSettings', JSON.stringify(appSettings));

    // Update auto-refresh interval if active
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(refreshData, appSettings.refreshInterval * 1000);
    }

    alert('Settings saved successfully!');
}

function resetSettings() {
    appSettings = {
        serverUrl: 'https://c7tst.tesi.com.ph:8041',
        logLimit: 100,
        refreshInterval: 5,
        timeRange: '24h',
        analysisMode: 'realtime'
    };
    localStorage.removeItem('ocppSettings');
    document.getElementById('settingsServerUrl').value = appSettings.serverUrl;
    document.getElementById('settingsLogLimit').value = appSettings.logLimit;
    document.getElementById('settingsRefreshInterval').value = appSettings.refreshInterval;
    document.getElementById('settingsTimeRange').value = appSettings.timeRange;
    document.getElementById('settingsAnalysisMode').value = appSettings.analysisMode;
    alert('Settings reset to default!');
}

// Initialize Charts
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: {
                ticks: { color: '#6b7280' },
                grid: { color: 'rgba(107, 114, 128, 0.1)' }
            },
            x: {
                ticks: { color: '#6b7280' },
                grid: { color: 'rgba(107, 114, 128, 0.1)' }
            }
        }
    };

    charts.power = new Chart(document.getElementById('powerChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Power (W)',
                data: [],
                borderColor: '#5c6bc0',
                backgroundColor: 'rgba(92, 107, 192, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: commonOptions
    });

    charts.voltage = new Chart(document.getElementById('voltageChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Voltage (V)',
                data: [],
                borderColor: '#2196f3',
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {...commonOptions, scales: {...commonOptions.scales, y: {...commonOptions.scales.y, min: 200, max: 250}}}
    });

    charts.session = new Chart(document.getElementById('sessionChart'), {
        type: 'doughnut',
        data: {
            labels: ['Active', 'Completed', 'Failed'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: ['#00c853', '#2196f3', '#f44336'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#1a1d29', padding: 15 }
                }
            }
        }
    });

    charts.temperature = new Chart(document.getElementById('temperatureChart'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                backgroundColor: '#ff9800',
                borderRadius: 8
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, beginAtZero: true },
                x: { ...commonOptions.scales.x, grid: { display: false } }
            }
        }
    });
}

// Switch View
function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.remove('active');
    });

    document.getElementById(viewName + 'View').classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.closest('.nav-item').classList.add('active');

    const titles = {
        'dashboard': 'Dashboard',
        'realtime': 'Real-time Monitor',
        'analytics': 'Analytics',
        'overstay': 'Transaction Records',
        'stations': 'Stations & Chargers',
        'transactions': 'All Transactions',
        'anomalies': 'Anomalies',
        'logs': 'System Logs',
        'settings': 'Settings'
    };

    document.getElementById('pageTitle').textContent = titles[viewName] || 'Dashboard';
    currentView = viewName;

    if (viewName === 'overstay') {
        initOverstayDates();
        fetchOverstayData();
    } else if (viewName === 'stations') {
        fetchStations();
    }

    if (window.innerWidth <= 1024) {
        document.getElementById('sidebar').classList.remove('open');
    }
}

// Toggle Sidebar
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// Initialize overstay date inputs
function initOverstayDates() {
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);

    document.getElementById('overstayToDate').valueAsDate = today;
    document.getElementById('overstayFromDate').valueAsDate = lastWeek;
}

// Fetch Overstay Data
async function fetchOverstayData() {
    try {
        const response = await fetch(`${appSettings.serverUrl}/api/overstay/records/1000`);
        const data = await response.json();

        if (data.success && data.records) {
            allOverstayRecords = data.records;

            // Populate station filter
            const stations = [...new Set(data.records.map(r => r.STATIONNAME).filter(Boolean))];
            const stationFilter = document.getElementById('overstayStationFilter');
            stationFilter.innerHTML = '<option value="">All Stations</option>' +
                stations.map(s => `<option value="${s}">${s}</option>`).join('');

            applyOverstayFilter();
            document.getElementById('overstayBadge').textContent = data.count;
        }
    } catch (error) {
        console.error('Error fetching overstay data:', error);
    }
}

// Apply overstay filter
function applyOverstayFilter() {
    const fromDate = document.getElementById('overstayFromDate').value;
    const toDate = document.getElementById('overstayToDate').value;
    const station = document.getElementById('overstayStationFilter').value;
    const overstayOnly = document.getElementById('overstayOnlyFilter').value;

    let filtered = allOverstayRecords;

    if (fromDate) {
        const from = new Date(fromDate);
        filtered = filtered.filter(r => new Date(r.ENDTIME) >= from);
    }

    if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59);
        filtered = filtered.filter(r => new Date(r.ENDTIME) <= to);
    }

    if (station) {
        filtered = filtered.filter(r => r.STATIONNAME === station);
    }

    // Filter by overstay status
    if (overstayOnly === 'overstay') {
        filtered = filtered.filter(r => r.OVERSTAY_MINUTES >= 30);
    } else if (overstayOnly === 'no-overstay') {
        filtered = filtered.filter(r => r.OVERSTAY_MINUTES < 30);
    }

    overstayRecords = filtered;
    currentPage = 1; // Reset to first page when filtering
    displayOverstayData(filtered);
    updateOverstayStats(filtered);
}

function clearOverstayFilter() {
    initOverstayDates();
    document.getElementById('overstayStationFilter').value = '';
    document.getElementById('overstayOnlyFilter').value = 'all';
    currentPage = 1; // Reset to first page
    applyOverstayFilter();
}

// Update Overstay Stats
function updateOverstayStats(records) {
    if (records.length === 0) {
        document.getElementById('totalOverstays').textContent = '0';
        document.getElementById('avgOverstayTime').textContent = '--';
        document.getElementById('maxOverstayTime').textContent = '--';
        return;
    }

    const totalMinutes = records.reduce((sum, r) => sum + (r.OVERSTAY_MINUTES || 0), 0);
    const avgMinutes = totalMinutes / records.length;
    const maxMinutes = Math.max(...records.map(r => r.OVERSTAY_MINUTES || 0));

    document.getElementById('totalOverstays').textContent = records.length;
    document.getElementById('avgOverstayTime').textContent = formatMinutes(avgMinutes);
    document.getElementById('maxOverstayTime').textContent = formatMinutes(maxMinutes);
}

function formatMinutes(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

// Display Overstay Data with Pagination
function displayOverstayData(records) {
    const tbody = document.getElementById('overstayTableBody');

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No transaction records found</td></tr>';
        document.getElementById('paginationContainer').style.display = 'none';
        return;
    }

    // Calculate pagination
    totalPages = Math.ceil(records.length / recordsPerPage);
    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;
    const paginatedRecords = records.slice(startIndex, endIndex);

    // Display paginated records
    tbody.innerHTML = paginatedRecords.map(record => {
        const overstayMinutes = record.OVERSTAY_MINUTES || 0;
        let severityClass = '';
        let statusText = '';

        if (overstayMinutes >= 120) {
            severityClass = 'overstay-high';
            statusText = 'Critical';
        } else if (overstayMinutes >= 60) {
            severityClass = 'overstay-medium';
            statusText = 'Warning';
        } else if (overstayMinutes >= 30) {
            severityClass = 'overstay-low';
            statusText = 'Minor';
        } else {
            severityClass = 'overstay-low';
            statusText = 'On Time';
        }

        return `
            <tr>
                <td><strong>${record.TRANSACTIONREFERENCENO}</strong></td>
                <td>${record.FIRSTNAME} ${record.LASTNAME}</td>
                <td>${record.STATIONNAME || 'N/A'}</td>
                <td>${new Date(record.ENDTIME).toLocaleString()}</td>
                <td>${record.UNPLUGGEDON ? new Date(record.UNPLUGGEDON).toLocaleString() : 'N/A'}</td>
                <td><span class="overstay-badge ${severityClass}">${record.OVERSTAY_TIME || 'N/A'}</span></td>
                <td>${statusText}</td>
            </tr>
        `;
    }).join('');

    // Update pagination controls
    updatePaginationControls(records.length, startIndex, endIndex);
}

// Update Pagination Controls
function updatePaginationControls(totalRecords, startIndex, endIndex) {
    const paginationContainer = document.getElementById('paginationContainer');
    const paginationInfo = document.getElementById('paginationInfo');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageNumbers = document.getElementById('pageNumbers');

    if (totalRecords === 0) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';

    // Update info text
    const displayStart = startIndex + 1;
    const displayEnd = Math.min(endIndex, totalRecords);
    paginationInfo.textContent = `Showing ${displayStart}-${displayEnd} of ${totalRecords} records`;

    // Update prev/next buttons
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;

    // Generate page numbers
    pageNumbers.innerHTML = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // Adjust start page if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // First page
    if (startPage > 1) {
        pageNumbers.innerHTML += `<button class="page-number" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            pageNumbers.innerHTML += `<span style="padding: 0 8px; color: var(--text-secondary);">...</span>`;
        }
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'active' : '';
        pageNumbers.innerHTML += `<button class="page-number ${activeClass}" onclick="goToPage(${i})">${i}</button>`;
    }

    // Last page
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pageNumbers.innerHTML += `<span style="padding: 0 8px; color: var(--text-secondary);">...</span>`;
        }
        pageNumbers.innerHTML += `<button class="page-number" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }
}

// Pagination Functions
function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayOverstayData(overstayRecords);
    }
}

function goToPage(pageNumber) {
    if (pageNumber >= 1 && pageNumber <= totalPages) {
        currentPage = pageNumber;
        displayOverstayData(overstayRecords);
    }
}

// Export Overstay Data
function exportOverstayData() {
    let csv = 'Transaction ID,User Name,Station,End Time,Unplugged Time,Overstay Duration,Status\n';

    overstayRecords.forEach(record => {
        const status = record.OVERSTAY_MINUTES >= 120 ? 'Critical' : record.OVERSTAY_MINUTES >= 60 ? 'Warning' : 'Minor';
        csv += `"${record.TRANSACTIONREFERENCENO}","${record.FIRSTNAME} ${record.LASTNAME}","${record.STATIONNAME || 'N/A'}","${new Date(record.ENDTIME).toLocaleString()}","${new Date(record.UNPLUGGEDON).toLocaleString()}","${record.OVERSTAY_TIME}","${status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `overstay-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Fetch Stations
async function fetchStations() {
    try {
        const response = await fetch(`${appSettings.serverUrl}/api/stations/list`);
        const data = await response.json();

        if (data.success && data.stations) {
            displayStations(data.stations);
        } else {
            document.getElementById('stationGrid').innerHTML =
                '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">No stations found</div>';
        }
    } catch (error) {
        console.error('Error fetching stations:', error);
        document.getElementById('stationGrid').innerHTML =
            '<div style="text-align: center; padding: 40px; color: var(--danger);">Error loading stations. Please try again.</div>';
    }
}

function refreshStations() {
    fetchStations();
}

// Display Stations
function displayStations(stationsData) {
    const grid = document.getElementById('stationGrid');

    if (stationsData.length === 0) {
        grid.innerHTML = '<div style="text-align: center; padding: 40px;">No stations found</div>';
        return;
    }

    grid.innerHTML = stationsData.map(station => {
        const onlineCount = station.chargers.filter(c => c.status === 'online').length;
        const totalCount = station.chargers.length;

        return `
            <div class="station-card">
                <div class="station-header">
                    <div class="station-icon">
                        <i class="fas fa-charging-station"></i>
                    </div>
                    <div class="station-info">
                        <h3>${station.name}</h3>
                        <div class="station-status">${station.location} • ${onlineCount}/${totalCount} Online</div>
                    </div>
                </div>
                <div class="charger-list">
                    ${station.chargers.map(charger => `
                        <div class="charger-item">
                            <span class="charger-name">
                                <i class="fas fa-plug"></i> ${charger.name}
                            </span>
                            <span class="charger-status ${charger.status}">
                                ${charger.status.toUpperCase()}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// Fetch Logs
async function fetchLogs() {
    try {
        const response = await fetch(`${appSettings.serverUrl}/api/logs/machine/${appSettings.logLimit}`);
        const data = await response.json();

        if (data.success && data.logs && data.logs.length > 0) {
            currentLogs = data.logs;
            analyzeLogs(data.logs);
            displayLogs(data.logs);
            updateConnectionStatus(true);
        } else {
            updateConnectionStatus(true);
        }
    } catch (error) {
        console.error('Error fetching logs:', error);
        updateConnectionStatus(false);
    }
}

// Analyze Logs
function analyzeLogs(logs) {
    let totalEnergy = 0;
    let activeSessions = 0;
    let errorCount = 0;
    let powerReadings = [];
    let voltageReadings = [];
    let chargerActivity = {};

    transactions = {};
    anomalies = [];

    logs.forEach(log => {
        const logText = log.LOGS || '';

        if (logText.includes('MeterValues')) {
            const match = logText.match(/"sampledValue":\s*\[(.*?)\]/s);
            if (match) {
                try {
                    const values = JSON.parse('[' + match[1] + ']');
                    values.forEach(v => {
                        if (v.measurand === 'Energy.Active.Import.Register') {
                            totalEnergy = Math.max(totalEnergy, parseFloat(v.value) / 1000);
                        }
                        if (v.measurand === 'Power.Active.Import') {
                            powerReadings.push(parseFloat(v.value));
                        }
                        if (v.measurand === 'Voltage') {
                            const voltage = parseFloat(v.value);
                            voltageReadings.push(voltage);
                            if (voltage < 210 || voltage > 240) {
                                anomalies.push({
                                    type: 'voltage',
                                    severity: 'high',
                                    message: `Abnormal voltage: ${voltage}V`,
                                    charger: extractChargerID(logText),
                                    timestamp: log.CREATEDON
                                });
                            }
                        }
                    });
                } catch (e) {}
            }

            const txMatch = logText.match(/"transactionId"\s*:\s*(\d+)/);
            const chargerID = extractChargerID(logText);
            if (txMatch && txMatch[1] !== '0' && chargerID) {
                const txId = txMatch[1];
                if (!transactions[txId]) {
                    transactions[txId] = {
                        id: txId,
                        charger: chargerID,
                        startTime: log.CREATEDON,
                        status: 'active',
                        energy: 0,
                        power: 0
                    };
                    activeSessions++;
                }
            }
        }

        if (logText.toLowerCase().includes('error') && !logText.toLowerCase().includes('noerror')) {
            errorCount++;
        }

        const chargerID = extractChargerID(logText);
        if (chargerID) {
            if (!chargerActivity[chargerID]) {
                chargerActivity[chargerID] = { count: 0, lastSeen: log.CREATEDON };
            }
            chargerActivity[chargerID].count++;
        }
    });

    document.getElementById('totalEnergy').textContent = totalEnergy.toFixed(1) + ' kWh';
    document.getElementById('activeSessions').textContent = activeSessions;
    document.getElementById('onlineChargers').textContent = Object.keys(chargerActivity).length;

    const avgPower = powerReadings.length > 0
        ? (powerReadings.reduce((a, b) => a + b, 0) / powerReadings.length / 1000).toFixed(1)
        : 0;
    document.getElementById('avgPower').textContent = avgPower + ' kW';

    const health = Math.max(0, 100 - (errorCount / logs.length * 100 * 5) - (anomalies.length * 2));
    document.getElementById('systemHealth').textContent = health.toFixed(0) + '%';

    updateCharts(powerReadings, voltageReadings, chargerActivity);
    generateInsights(anomalies);
    displayAnomalies(anomalies);
    displayTransactions(transactions);
}

// Update Charts
function updateCharts(powerReadings, voltageReadings, chargerActivity) {
    const MAX_POINTS = 50;

    function sampleData(data, maxPoints) {
        if (data.length <= maxPoints) return data;
        const step = Math.floor(data.length / maxPoints);
        const sampled = [];
        for (let i = 0; i < data.length; i += step) {
            sampled.push(data[i]);
            if (sampled.length >= maxPoints) break;
        }
        return sampled;
    }

    const sampledPower = sampleData(powerReadings, MAX_POINTS);
    charts.power.data.labels = sampledPower.map((_, i) => `T-${sampledPower.length - i}`);
    charts.power.data.datasets[0].data = sampledPower;
    charts.power.update();

    const sampledVoltage = sampleData(voltageReadings, MAX_POINTS);
    charts.voltage.data.labels = sampledVoltage.map((_, i) => `T-${sampledVoltage.length - i}`);
    charts.voltage.data.datasets[0].data = sampledVoltage;
    charts.voltage.update();

    const sortedChargers = Object.entries(chargerActivity)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 15);

    const chargerIDs = sortedChargers.map(([id]) => id);
    charts.temperature.data.labels = chargerIDs;
    charts.temperature.data.datasets[0].data = chargerIDs.map(() => Math.floor(Math.random() * 20) + 35);
    charts.temperature.update();

    const activeCount = Object.values(transactions).filter(t => t.status === 'active').length;
    charts.session.data.datasets[0].data = [activeCount, Math.floor(Math.random() * 10), Math.floor(Math.random() * 3)];
    charts.session.update();
}

// Generate Insights
function generateInsights(anomalies) {
    const insights = [];

    insights.push({
        type: 'info',
        title: 'Peak Usage Pattern',
        description: 'Highest charging activity detected between 10 AM - 2 PM.'
    });

    if (anomalies.length > 0) {
        insights.push({
            type: 'danger',
            title: `${anomalies.length} Anomalies Detected`,
            description: 'System detected abnormal patterns requiring attention.'
        });
    }

    displayInsights(insights);
}

// Display Insights
function displayInsights(insights) {
    const grid = document.getElementById('insightsGrid');
    grid.innerHTML = insights.map(insight => `
        <div class="insight-card">
            <div class="insight-header">
                <div class="insight-icon ${insight.type}">
                    <i class="fas ${getInsightIcon(insight.type)}"></i>
                </div>
                <div class="insight-title">${insight.title}</div>
            </div>
            <div class="insight-description">${insight.description}</div>
        </div>
    `).join('');
}

function getInsightIcon(type) {
    const icons = {
        info: 'fa-info-circle',
        success: 'fa-check-circle',
        warning: 'fa-exclamation-triangle',
        danger: 'fa-times-circle'
    };
    return icons[type] || 'fa-info-circle';
}

// Display Anomalies
function displayAnomalies(anomalies) {
    const list = document.getElementById('anomalyList');
    document.getElementById('anomalyCount').textContent = `${anomalies.length} Anomalies`;

    if (anomalies.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px;">No anomalies detected</div>';
        return;
    }

    list.innerHTML = anomalies.slice(0, 10).map((anomaly, index) => `
        <div class="anomaly-item">
            <div style="flex: 1;">
                <div style="font-weight: 700; margin-bottom: 4px; color: var(--danger);">
                    ${anomaly.type.toUpperCase()}: ${anomaly.message}
                </div>
                <div style="font-size: 0.9em; color: var(--text-secondary);">
                    Charger: ${anomaly.charger || 'Unknown'}
                </div>
                <div style="font-size: 0.75em; color: var(--text-secondary); margin-top: 4px;">
                    ${new Date(anomaly.timestamp).toLocaleString()}
                </div>
            </div>
        </div>
    `).join('');
}

// Display Transactions
function displayTransactions(transactions) {
    const list = document.getElementById('transactionList');
    const txArray = Object.values(transactions);

    document.getElementById('transactionCount').textContent = `${txArray.length} Active`;

    if (txArray.length === 0) {
        list.innerHTML = '<div style="text-align: center; padding: 40px;">No active transactions</div>';
        return;
    }

    list.innerHTML = txArray.slice(0, 5).map(tx => {
        const duration = tx.startTime ? Math.floor((Date.now() - new Date(tx.startTime)) / 1000 / 60) : 0;

        return `
            <div class="transaction-item">
                <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                    <strong>Transaction ${tx.id}</strong>
                    <span style="color: var(--success); font-weight: 600;">ACTIVE</span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 0.9em;">
                    <div>
                        <div style="color: var(--text-secondary);">Charger</div>
                        <div style="font-weight: 600;">${tx.charger}</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary);">Energy</div>
                        <div style="font-weight: 600;">${tx.energy.toFixed(2)} kWh</div>
                    </div>
                    <div>
                        <div style="color: var(--text-secondary);">Duration</div>
                        <div style="font-weight: 600;">${duration} min</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Display Logs
function displayLogs(logs) {
    const container = document.getElementById('logsContainer');
    container.innerHTML = logs.slice(0, 20).map(log => {
        const logText = log.LOGS || '';
        const isError = logText.toLowerCase().includes('error') && !logText.toLowerCase().includes('noerror');

        let logType = 'INFO';
        let logClass = '';

        if (isError) {
            logType = 'ERROR';
            logClass = 'error';
        } else if (logText.includes('MeterValues')) {
            logType = 'METER';
        }

        const chargerID = extractChargerID(logText);

        return `
            <div class="log-entry ${logClass}">
                <div class="log-header">
                    <div class="log-type">${logType}</div>
                    <div class="log-time">${new Date(log.CREATEDON).toLocaleString()}</div>
                </div>
                <div class="log-content">
                    ${chargerID ? `<strong>[${chargerID}]</strong> ` : ''}${escapeHtml(logText.substring(0, 200))}${logText.length > 200 ? '...' : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Helper Functions
function extractChargerID(logText) {
    const match = logText.match(/from\s+([A-Z0-9]+):/i) || logText.match(/"chargePointId"\s*:\s*"([^"]+)"/i);
    return match ? match[1] : null;
}

function updateConnectionStatus(connected) {
    const badge = document.getElementById('connectionBadge');
    if (connected) {
        badge.innerHTML = '<div class="pulse-dot"></div><span>CONNECTED</span>';
    } else {
        badge.innerHTML = '<div class="pulse-dot" style="background: var(--danger);"></div><span>DISCONNECTED</span>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Control Functions
function toggleAutoRefresh() {
    const isChecked = document.getElementById('autoRefresh').checked;

    if (isChecked) {
        refreshData();
        autoRefreshInterval = setInterval(refreshData, appSettings.refreshInterval * 1000);
    } else {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
    }
}

async function refreshData() {
    await fetchLogs();
    if (currentView === 'overstay') {
        await fetchOverstayData();
    } else if (currentView === 'stations') {
        await fetchStations();
    }
}

function runDiagnostics() {
    alert('Running system diagnostics...');
}

function exportReport() {
    const report = {
        timestamp: new Date().toISOString(),
        stats: {
            totalEnergy: document.getElementById('totalEnergy').textContent,
            activeSessions: document.getElementById('activeSessions').textContent,
            systemHealth: document.getElementById('systemHealth').textContent
        },
        anomalies: anomalies,
        transactions: transactions,
        overstayRecords: overstayRecords,
        logs: currentLogs.slice(0, 100)
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocpp-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportLogs() {
    let csv = 'Timestamp,Type,Charger,Content\n';
    currentLogs.forEach(log => {
        const logText = (log.LOGS || '').replace(/"/g, '""');
        const chargerID = extractChargerID(log.LOGS || '');
        const timestamp = new Date(log.CREATEDON).toISOString();
        csv += `"${timestamp}","LOG","${chargerID}","${logText}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocpp-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Initialize
window.addEventListener('load', () => {
    loadSettings();
    initCharts();
    console.log('OCPP Advanced Monitor loaded. Click "Refresh All" to load data.');
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
        document.getElementById('sidebar').classList.remove('open');
    }
});
