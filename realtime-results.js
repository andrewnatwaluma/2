[file name]: realtime-results.js
[file content begin]
// realtime-results.js - Complete Real-time Results System
const SUPABASE_URL = 'https://iaenttkokcxtiauzjtgw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhZW50dGtva2N4dGlhdXpqdGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDQ2NDksImV4cCI6MjA3MzQyMDY0OX0.u6ZBX-d_CTNlA94OM7h2JerNpmhuHZxYSXmj0OxRhRI';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state for results
window.resultsApp = {
    currentResults: [],
    chart: null,
    autoRefreshInterval: null,
    isChartView: false,
    electionEndTime: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
};

// Initialize results page
document.addEventListener('DOMContentLoaded', function() {
    initializeResultsPage();
});

// Main initialization function
async function initializeResultsPage() {
    initializeElectionTimer();
    await loadResults();
    setupRealtimeUpdates();
    setupAutoRefresh();
    populatePositionFilter();
}

// Initialize election timer
function initializeElectionTimer() {
    const timerElement = document.getElementById('electionTimer');
    const countdownElement = document.getElementById('countdown');
    
    function updateTimer() {
        const now = new Date().getTime();
        const distance = window.resultsApp.electionEndTime - now;
        
        if (distance < 0) {
            timerElement.classList.add('closed');
            countdownElement.textContent = 'ELECTION CLOSED - FINAL RESULTS';
            return;
        }
        
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        countdownElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
        timerElement.style.display = 'block';
    }
    
    updateTimer();
    setInterval(updateTimer, 1000);
}

// Load and display results
async function loadResults() {
    showLoadingState();
    
    try {
        // Load summary statistics
        const [{ count: totalVoters }, { count: votedCount }, { data: results }] = await Promise.all([
            supabase.from('voters').select('*', { count: 'exact', head: true }),
            supabase.from('voters').select('*', { count: 'exact', head: true }).eq('has_voted', true),
            supabase.from('vote_results').select('*').order('position_title')
        ]);

        // Update summary statistics
        updateSummaryStats(totalVoters || 0, votedCount || 0, results?.length || 0);

        if (!results || results.length === 0) {
            showNoResults();
            return;
        }

        window.resultsApp.currentResults = results;
        displayResults(results);
        updateLastUpdated();

        // Update chart if in chart view
        if (window.resultsApp.isChartView) {
            updateChart(results);
        }

    } catch (error) {
        console.error('Error loading results:', error);
        showErrorState('Failed to load results. Please try again.');
    }
}

// Update summary statistics
function updateSummaryStats(totalVoters, votedCount, totalPositions) {
    const turnout = totalVoters > 0 ? Math.round((votedCount / totalVoters) * 100) : 0;
    
    document.getElementById('totalVoters').textContent = totalVoters;
    document.getElementById('votedCount').textContent = votedCount;
    document.getElementById('turnout').textContent = turnout + '%';
    document.getElementById('totalPositions').textContent = totalPositions;
}

// Display results in the container
function displayResults(results) {
    const container = document.getElementById('resultsContainer');
    
    if (!results || results.length === 0) {
        container.innerHTML = '<p class="message info">No results available yet.</p>';
        return;
    }

    // Group results by position
    const resultsByPosition = {};
    results.forEach(result => {
        if (!resultsByPosition[result.position_title]) {
            resultsByPosition[result.position_title] = [];
        }
        resultsByPosition[result.position_title].push(result);
    });

    let resultsHTML = '';

    for (const [positionTitle, candidates] of Object.entries(resultsByPosition)) {
        const totalVotes = candidates.reduce((sum, cand) => sum + cand.vote_count, 0);
        const leadingCandidate = candidates.reduce((leading, current) => 
            current.vote_count > leading.vote_count ? current : leading
        );

        resultsHTML += `
            <div class="position-results" data-position="${positionTitle}">
                <div class="position-header">
                    <h3>${positionTitle}</h3>
                    <span class="total-votes">${totalVotes} total votes</span>
                </div>
                <div class="position-leader">
                    <i class="fas fa-crown" style="color: gold;"></i>
                    <strong>Current Leader:</strong> ${leadingCandidate.candidate_name} 
                    (${Math.round((leadingCandidate.vote_count / totalVotes) * 100)}%)
                </div>
                <div class="candidates-list">
        `;

        // Sort candidates by vote count (descending)
        candidates.sort((a, b) => b.vote_count - a.vote_count)
                 .forEach((candidate, index) => {
            const percentage = totalVotes > 0 ? Math.round((candidate.vote_count / totalVotes) * 100) : 0;
            const isLeading = index === 0;
            
            resultsHTML += `
                <div class="candidate-result ${isLeading ? 'leading' : ''}">
                    <div class="candidate-info">
                        <span class="candidate-rank">${index + 1}.</span>
                        <span class="candidate-name">${candidate.candidate_name}</span>
                        ${isLeading ? '<span class="leading-badge"><i class="fas fa-crown"></i> Leading</span>' : ''}
                    </div>
                    <div class="candidate-votes">
                        <span class="vote-count">${candidate.vote_count} votes</span>
                        <span class="vote-percentage">${percentage}%</span>
                        <div class="vote-bar">
                            <div class="vote-progress" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                </div>
            `;
        });

        resultsHTML += `
                </div>
            </div>
        `;
    }

    container.innerHTML = resultsHTML;
    document.getElementById('noResultsSection').classList.remove('active');
}

// Update chart visualization
function updateChart(results) {
    const ctx = document.getElementById('resultsChart').getContext('2d');
    
    // Destroy existing chart
    if (window.resultsApp.chart) {
        window.resultsApp.chart.destroy();
    }

    // Group by position and prepare chart data
    const positions = [...new Set(results.map(r => r.position_title))];
    const positionData = positions.map(position => {
        const positionResults = results.filter(r => r.position_title === position);
        const totalVotes = positionResults.reduce((sum, r) => sum + r.vote_count, 0);
        
        return {
            position,
            candidates: positionResults.map(r => r.candidate_name),
            votes: positionResults.map(r => r.vote_count),
            percentages: positionResults.map(r => Math.round((r.vote_count / totalVotes) * 100))
        };
    });

    // For simplicity, show first position or implement tabbed interface
    if (positionData.length > 0) {
        const firstPosition = positionData[0];
        
        window.resultsApp.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: firstPosition.candidates,
                datasets: [{
                    label: `Votes for ${firstPosition.position}`,
                    data: firstPosition.votes,
                    backgroundColor: [
                        '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0',
                        '#00BCD4', '#FFC107', '#795548', '#607D8B', '#8BC34A'
                    ],
                    borderColor: '#333',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `Results for ${firstPosition.position}`
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Votes'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Candidates'
                        }
                    }
                }
            }
        });
    }
}

// Toggle between table and chart view
function toggleView() {
    const toggleButton = document.getElementById('viewToggle');
    const resultsContainer = document.getElementById('resultsContainer');
    const chartContainer = document.getElementById('chartContainer');
    
    window.resultsApp.isChartView = !window.resultsApp.isChartView;
    
    if (window.resultsApp.isChartView) {
        resultsContainer.style.display = 'none';
        chartContainer.style.display = 'block';
        toggleButton.innerHTML = '<i class="fas fa-table"></i> Switch to Table View';
        updateChart(window.resultsApp.currentResults);
    } else {
        resultsContainer.style.display = 'block';
        chartContainer.style.display = 'none';
        toggleButton.innerHTML = '<i class="fas fa-chart-bar"></i> Switch to Chart View';
    }
}

// Filter results by position
function filterResults() {
    const filterValue = document.getElementById('positionFilter').value;
    const allResults = document.querySelectorAll('.position-results');
    
    allResults.forEach(result => {
        if (filterValue === 'all' || result.dataset.position === filterValue) {
            result.style.display = 'block';
        } else {
            result.style.display = 'none';
        }
    });
}

// Populate position filter dropdown
function populatePositionFilter() {
    const filter = document.getElementById('positionFilter');
    const positions = [...new Set(window.resultsApp.currentResults.map(r => r.position_title))];
    
    // Clear existing options except "All"
    filter.innerHTML = '<option value="all">All Positions</option>';
    
    positions.forEach(position => {
        const option = document.createElement('option');
        option.value = position;
        option.textContent = position;
        filter.appendChild(option);
    });
}

// Set up real-time updates
function setupRealtimeUpdates() {
    const subscription = supabase
        .channel('public-results')
        .on('postgres_changes', 
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'votes' 
            }, 
            () => {
                console.log('New vote detected, refreshing results...');
                loadResults();
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Listening for real-time vote updates...');
            }
        });
}

// Set up auto-refresh
function setupAutoRefresh() {
    const autoRefreshCheckbox = document.getElementById('autoRefresh');
    
    function startAutoRefresh() {
        window.resultsApp.autoRefreshInterval = setInterval(() => {
            if (autoRefreshCheckbox.checked) {
                loadResults();
            }
        }, 30000); // 30 seconds
    }
    
    function stopAutoRefresh() {
        if (window.resultsApp.autoRefreshInterval) {
            clearInterval(window.resultsApp.autoRefreshInterval);
        }
    }
    
    autoRefreshCheckbox.addEventListener('change', function() {
        if (this.checked) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });
    
    // Start auto-refresh initially
    startAutoRefresh();
}

// UI State Management
function showLoadingState() {
    document.getElementById('resultsContainer').innerHTML = `
        <div class="loading-results">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading latest results...</p>
        </div>
    `;
}

function showNoResults() {
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('noResultsSection').classList.add('active');
}

function showErrorState(message) {
    document.getElementById('resultsContainer').innerHTML = `
        <div class="message error">
            <i class="fas fa-exclamation-triangle"></i>
            ${message}
        </div>
    `;
}

function updateLastUpdated() {
    const now = new Date();
    document.getElementById('updateTime').textContent = now.toLocaleString();
}

// Refresh results manually
function refreshResults() {
    loadResults();
    showMessage('Results refreshed successfully!', 'success');
}

function showMessage(message, type) {
    // Create temporary message display
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} temporary-message`;
    messageDiv.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
    
    const container = document.querySelector('main');
    container.insertBefore(messageDiv, container.firstChild);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// Make functions globally available
window.toggleView = toggleView;
window.filterResults = filterResults;
window.refreshResults = refreshResults;

// Add some custom CSS for results page
const additionalCSS = `
.temporary-message {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    max-width: 300px;
}

.loading-results {
    text-align: center;
    padding: 40px;
    color: #666;
}

.loading-results i {
    font-size: 2em;
    margin-bottom: 10px;
}

.position-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 2px solid #eee;
}

.position-leader {
    background: #fff3cd;
    padding: 10px;
    border-radius: 5px;
    margin-bottom: 15px;
    border-left: 4px solid #ffc107;
}

.candidate-result {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px;
    margin: 10px 0;
    background: white;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
    transition: all 0.3s;
}

.candidate-result.leading {
    border-color: #4CAF50;
    background: #f0fff0;
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
}

.candidate-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
}

.candidate-rank {
    font-weight: bold;
    color: #666;
    min-width: 30px;
}

.leading-badge {
    background: #4CAF50;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
}

.candidate-votes {
    text-align: right;
    min-width: 150px;
}

.vote-bar {
    width: 100px;
    height: 8px;
    background: #f0f0f0;
    border-radius: 4px;
    margin-top: 5px;
    overflow: hidden;
}

.vote-progress {
    height: 100%;
    background: #4CAF50;
    transition: width 0.5s ease;
}

.results-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 20px 0;
    flex-wrap: wrap;
    gap: 15px;
}

.filter-group, .view-options {
    display: flex;
    align-items: center;
    gap: 10px;
}

.last-updated {
    text-align: center;
    margin: 20px 0;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 8px;
}

.auto-refresh {
    margin-top: 10px;
}

.results-navigation {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-top: 30px;
}

.no-results {
    text-align: center;
    padding: 60px 20px;
    color: #666;
}

.no-results i {
    margin-bottom: 20px;
}

@media (max-width: 768px) {
    .candidate-result {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }
    
    .candidate-votes {
        text-align: left;
        width: 100%;
    }
    
    .results-controls {
        flex-direction: column;
        align-items: stretch;
    }
    
    .filter-group, .view-options {
        justify-content: space-between;
    }
}
`;

// Inject additional CSS
const style = document.createElement('style');
style.textContent = additionalCSS;
document.head.appendChild(style);
[file content end]
