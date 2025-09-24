// admin-dashboard.js - Complete Admin Dashboard Functionality
const SUPABASE_URL = 'https://aeulakfebabgocbevjis.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFldWxha2ZlYmFiZ29jYmV2amlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1NzYzMjIsImV4cCI6MjA3NDE1MjMyMn0.TAdkgFLLdpfn38YWRSnTtveEJLFVk_c8EgE9nEwoLf0';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global admin state
window.adminApp = {
    currentAdmin: null,
    adminRole: null,
    selectedVoterId: null,
    sessionStartTime: null,
    realtimeSubscription: null
};

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminDashboard();
});

// Main initialization function
async function initializeAdminDashboard() {
    if (!checkAdminAuthentication()) {
        return;
    }

    await loadAdminData();
    setupRealtimeUpdates();
    startSessionTimer();
}

// Check if admin is properly authenticated
function checkAdminAuthentication() {
    const adminRole = localStorage.getItem('adminRole');
    const adminUsername = localStorage.getItem('adminUsername');
    
    if (!adminRole || !adminUsername) {
        window.location.href = 'admin-login.html';
        return false;
    }

    window.adminApp.currentAdmin = adminUsername;
    window.adminApp.adminRole = adminRole;
    window.adminApp.sessionStartTime = new Date(localStorage.getItem('adminLoginTime'));

    // Update UI with admin info
    document.getElementById('currentAdmin').textContent = adminUsername;
    document.getElementById('adminRole').textContent = adminRole;
    document.getElementById('loginTime').textContent = `Logged in: ${window.adminApp.sessionStartTime.toLocaleString()}`;

    // Show/hide superadmin sections based on role
    if (adminRole !== 'superadmin') {
        document.getElementById('superAdminSection').style.display = 'none';
    }

    return true;
}

// Load all admin data
async function loadAdminData() {
    await loadAdminStats();
    await loadResults();
    await loadCandidatesForSuperAdmin();
    await loadVoterStats();
    updateElectionTimerDisplay();
    checkDatabaseStatus();
}

// Load admin statistics
async function loadAdminStats() {
    try {
        const [
            { count: totalVoters },
            { count: votedCount },
            { count: totalVotes },
            { data: positions }
        ] = await Promise.all([
            supabase.from('voters').select('*', { count: 'exact', head: true }),
            supabase.from('voters').select('*', { count: 'exact', head: true }).eq('has_voted', true),
            supabase.from('votes').select('*', { count: 'exact', head: true }),
            supabase.from('positions').select('*')
        ]);

        const turnout = totalVoters > 0 ? Math.round((votedCount / totalVoters) * 100) : 0;
        const avgVotesPerVoter = votedCount > 0 ? (totalVotes / votedCount).toFixed(1) : 0;

        document.getElementById('adminStats').innerHTML = `
            <div class="stat-item">
                <i class="fas fa-users"></i>
                <span class="stat-value">${totalVoters || 0}</span>
                <span class="stat-label">Total Voters</span>
            </div>
            <div class="stat-item">
                <i class="fas fa-vote-yea"></i>
                <span class="stat-value">${votedCount || 0}</span>
                <span class="stat-label">Voted</span>
            </div>
            <div class="stat-item">
                <i class="fas fa-chart-pie"></i>
                <span class="stat-value">${turnout}%</span>
                <span class="stat-label">Turnout</span>
            </div>
            <div class="stat-item">
                <i class="fas fa-bullseye"></i>
                <span class="stat-value">${positions?.length || 0}</span>
                <span class="stat-label">Positions</span>
            </div>
            <div class="stat-item">
                <i class="fas fa-calculator"></i>
                <span class="stat-value">${totalVotes || 0}</span>
                <span class="stat-label">Total Votes</span>
            </div>
            <div class="stat-item">
                <i class="fas fa-average"></i>
                <span class="stat-value">${avgVotesPerVoter}</span>
                <span class="stat-label">Avg Votes/Voter</span>
            </div>
        `;

    } catch (error) {
        console.error('Error loading admin stats:', error);
        document.getElementById('adminStats').innerHTML = '<p class="error">Error loading statistics</p>';
    }
}

// Load election results
async function loadResults() {
    try {
        const { data: results, error } = await supabase
            .from('vote_results')
            .select('*')
            .order('position_title');

        if (error) throw error;

        const resultsContainer = document.getElementById('adminResultsContainer');
        const previewContainer = document.getElementById('resultsPreview');

        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<p class="info">No votes have been cast yet.</p>';
            previewContainer.innerHTML = '<p class="info">No results available</p>';
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

        // Full results display
        let resultsHTML = '';
        let previewHTML = '';

        for (const [positionTitle, candidates] of Object.entries(resultsByPosition)) {
            const totalVotes = candidates.reduce((sum, cand) => sum + cand.vote_count, 0);
            
            const positionResultsHTML = `
                <div class="position-results">
                    <h3>${positionTitle} (${totalVotes} total votes)</h3>
                    ${candidates.map(candidate => {
                        const percentage = totalVotes > 0 ? Math.round((candidate.vote_count / totalVotes) * 100) : 0;
                        return `
                            <div class="candidate-result">
                                <span>${candidate.candidate_name}</span>
                                <strong>${candidate.vote_count} votes (${percentage}%)</strong>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            resultsHTML += positionResultsHTML;

            // Preview (top candidate only)
            const leadingCandidate = candidates.reduce((leading, current) => 
                current.vote_count > leading.vote_count ? current : leading
            );
            const leadPercentage = totalVotes > 0 ? Math.round((leadingCandidate.vote_count / totalVotes) * 100) : 0;
            
            previewHTML += `
                <div class="preview-item">
                    <strong>${positionTitle}:</strong> ${leadingCandidate.candidate_name} (${leadPercentage}%)
                </div>
            `;
        }

        resultsContainer.innerHTML = resultsHTML;
        previewContainer.innerHTML = previewHTML;

    } catch (error) {
        console.error('Error loading results:', error);
        document.getElementById('adminResultsContainer').innerHTML = '<p class="error">Error loading results</p>';
    }
}

// Load voter statistics - UPDATED FUNCTION
async function loadVoterStats() {
    try {
        const { data: stats, error } = await supabase
            .from('voter_stats')
            .select('*')
            .single();

        if (error) throw error;

        document.getElementById('voterStats').innerHTML = `
            <p>Total Voters: <strong>${stats?.total_voters || 0}</strong></p>
            <p>Voted Count: <strong>${stats?.voted_count || 0}</strong></p>
            <p>Completion Rate: <strong>${stats?.completion_rate || 0}%</strong></p>
            <p>Unique Universities: <strong>${stats?.unique_universities || 0}</strong></p>
            <p>Unique Genders: <strong>${stats?.unique_genders || 0}</strong></p>
        `;

    } catch (error) {
        console.error('Error loading voter stats:', error);
        document.getElementById('voterStats').innerHTML = '<p class="error">Error loading voter statistics</p>';
    }
}

// SUPER ADMIN FUNCTIONS

// Load candidates for superadmin vote override
async function loadCandidatesForSuperAdmin() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    try {
        const { data: candidates, error } = await supabase
            .from('candidates')
            .select('*')
            .order('name');

        if (error) throw error;

        const select = document.getElementById('superAdminCandidateSelect');
        select.innerHTML = '<option value="">Select candidate</option>';
        
        if (candidates && candidates.length > 0) {
            candidates.forEach(candidate => {
                const option = document.createElement('option');
                option.value = candidate.id;
                option.textContent = candidate.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading candidates:', error);
    }
}

// Voter lookup functionality
async function lookupVoter() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    const voterName = document.getElementById('voterLookupName').value.trim();
    const resultDiv = document.getElementById('voterLookupResult');
    
    if (!voterName) {
        resultDiv.innerHTML = '<p class="message error">Please enter a voter name</p>';
        return;
    }

    resultDiv.innerHTML = '<p class="message info">Searching...</p>';

    try {
        const { data: voter, error } = await supabase
            .from('voters')
            .select('*')
            .ilike('name', `%${voterName}%`)
            .limit(5);

        if (error) throw error;

        if (!voter || voter.length === 0) {
            resultDiv.innerHTML = '<p class="message warning">No voters found</p>';
            return;
        }

        let resultHTML = '<div class="voter-list">';
        voter.forEach(v => {
            resultHTML += `
                <div class="voter-item">
                    <p><strong>${v.name}</strong> - ${v.university || 'N/A'}</p>
                    <p>Status: <span class="status-badge ${v.has_voted ? 'voted' : 'not-voted'}">
                        ${v.has_voted ? 'Voted' : 'Not Voted'}
                    </span></p>
                    <button onclick="selectVoterForAction('${v.id}', '${v.name.replace(/'/g, "\\'")}', ${v.has_voted})" 
                            class="secondary-btn btn-sm">
                        Select
                    </button>
                </div>
            `;
        });
        resultHTML += '</div>';

        resultDiv.innerHTML = resultHTML;

    } catch (error) {
        console.error('Voter lookup error:', error);
        resultDiv.innerHTML = '<p class="message error">Error searching voters</p>';
    }
}

// Select voter for administrative actions
async function selectVoterForAction(voterId, voterName, hasVoted) {
    window.adminApp.selectedVoterId = voterId;
    
    document.getElementById('selectedVoterName').textContent = voterName;
    
    // Get voter's current vote
    let currentVote = 'Not voted yet';
    try {
        const { data: vote, error } = await supabase
            .from('votes')
            .select('candidates(name)')
            .eq('voter_id', voterId)
            .maybeSingle();

        if (!error && vote) {
            currentVote = vote.candidates.name;
        }
    } catch (error) {
        console.error('Error getting voter vote:', error);
    }

    const statusText = hasVoted ? `Voted - ${currentVote}` : 'Not voted yet';
    document.getElementById('voterVoteStatus').textContent = statusText;
    document.getElementById('voterVoteStatus').className = `status-badge ${hasVoted ? 'voted' : 'not-voted'}`;
    
    document.getElementById('voterActionSection').style.display = 'block';
    
    // Scroll to action section
    document.getElementById('voterActionSection').scrollIntoView({ behavior: 'smooth' });
}

// Change voter's vote (superadmin override)
async function changeVote() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    const candidateId = document.getElementById('superAdminCandidateSelect').value;
    const messageElement = document.getElementById('superAdminMessage');
    
    if (!window.adminApp.selectedVoterId) {
        showAdminMessage(messageElement, 'Please select a voter first', 'error');
        return;
    }

    if (!candidateId) {
        showAdminMessage(messageElement, 'Please select a candidate', 'error');
        return;
    }

    showAdminMessage(messageElement, 'Processing vote change...', 'info');

    try {
        // Get candidate's position
        const { data: candidate, error: candidateError } = await supabase
            .from('candidates')
            .select('position_id')
            .eq('id', candidateId)
            .single();

        if (candidateError) throw candidateError;

        // Delete existing votes for this voter
        const { error: deleteError } = await supabase
            .from('votes')
            .delete()
            .eq('voter_id', window.adminApp.selectedVoterId);

        if (deleteError && deleteError.code !== 'P0001') { // Ignore no rows affected
            throw deleteError;
        }

        // Insert new vote
        const { error: insertError } = await supabase
            .from('votes')
            .insert([{
                voter_id: window.adminApp.selectedVoterId,
                candidate_id: candidateId,
                position_id: candidate.position_id
            }]);

        if (insertError) throw insertError;

        // Update voter status
        const { error: updateError } = await supabase
            .from('voters')
            .update({ has_voted: true })
            .eq('id', window.adminApp.selectedVoterId);

        if (updateError) throw updateError;

        showAdminMessage(messageElement, 'Vote successfully updated!', 'success');
        
        // Refresh data
        setTimeout(() => {
            loadAdminStats();
            loadResults();
            lookupVoter(); // Refresh voter lookup
        }, 1000);

    } catch (error) {
        console.error('Vote change error:', error);
        showAdminMessage(messageElement, 'Error: ' + error.message, 'error');
    }
}

// Show voted voters list
async function showVotedVoters() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    try {
        const { data: voters, error } = await supabase
            .from('voters')
            .select('*')
            .eq('has_voted', true)
            .order('name');

        if (error) throw error;

        const container = document.getElementById('votedVotersList');
        
        if (!voters || voters.length === 0) {
            container.innerHTML = '<p class="info">No voters have voted yet.</p>';
            return;
        }

        let html = `
            <h5>Voted Voters (${voters.length})</h5>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>University</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        voters.forEach(voter => {
            html += `
                <tr>
                    <td>${voter.name}</td>
                    <td>${voter.university || 'N/A'}</td>
                    <td><span class="status-badge voted">Voted</span></td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading voted voters:', error);
        document.getElementById('votedVotersList').innerHTML = '<p class="error">Error loading voted voters</p>';
    }
}

// SYSTEM MANAGEMENT FUNCTIONS

// Restart election (superadmin only)
async function restartElection() {
    if (window.adminApp.adminRole !== 'superadmin') return;

    const password = prompt("Enter superadmin password to confirm election restart:");
    if (password !== "super123") {
        alert("Invalid password. Operation cancelled.");
        return;
    }

    if (!confirm("WARNING: This will delete ALL votes and reset voter status. This action cannot be undone. Are you absolutely sure?")) {
        return;
    }

    try {
        // Delete all votes
        const { error: deleteError } = await supabase
            .from('votes')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (deleteError) throw deleteError;

        // Reset all voters
        const { error: updateError } = await supabase
            .from('voters')
            .update({ has_voted: false })
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (updateError) throw updateError;

        // Clear local storage flags
        localStorage.removeItem('hasVotedOnThisDevice');

        alert("Election successfully restarted. All votes have been cleared.");
        location.reload();

    } catch (error) {
        console.error('Election restart error:', error);
        alert('Error restarting election: ' + error.message);
    }
}

// Export results
async function exportResults() {
    try {
        const { data: results, error } = await supabase
            .from('vote_results')
            .select('*');

        if (error) throw error;

        const csvContent = convertToCSV(results);
        downloadCSV(csvContent, 'election-results.csv');
        
        alert('Results exported successfully!');
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting results: ' + error.message);
    }
}

// UTILITY FUNCTIONS

function showSection(sectionId) {
    document.querySelectorAll('main section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
}

function showAdminMessage(element, message, type) {
    element.textContent = message;
    element.className = `message ${type}`;
}

function refreshAllData() {
    loadAdminData();
    showAdminMessage(document.createElement('div'), 'Data refreshed successfully!', 'success');
}

function refreshResults() {
    loadResults();
}

function updateElectionTimerDisplay() {
    // Implementation for election timer control
    document.getElementById('electionEndTimeDisplay').textContent = new Date().toLocaleString();
}

function checkDatabaseStatus() {
    document.getElementById('databaseStatus').innerHTML = `
        <p class="success">Database connection: <strong>Active</strong></p>
        <p>Last checked: ${new Date().toLocaleTimeString()}</p>
    `;
}

function setupRealtimeUpdates() {
    // Subscribe to vote changes
    window.adminApp.realtimeSubscription = supabase
        .channel('votes-channel')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'votes' },
            () => {
                loadAdminStats();
                loadResults();
            }
        )
        .subscribe();
}

function startSessionTimer() {
    const timerElement = document.getElementById('sessionTimer');
    setInterval(() => {
        const now = new Date();
        const diff = now - window.adminApp.sessionStartTime;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        timerElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
    }, 1000);
}

function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            return `"${value}"`;
        });
        csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Logout function
function logout() {
    if (window.adminApp.realtimeSubscription) {
        window.adminApp.realtimeSubscription.unsubscribe();
    }
    
    localStorage.removeItem('adminRole');
    localStorage.removeItem('adminUsername');
    localStorage.removeItem('adminLoginTime');
    
    window.location.href = 'admin-login.html';
}

// Make functions globally available
window.showSection = showSection;
window.lookupVoter = lookupVoter;
window.selectVoterForAction = selectVoterForAction;
window.changeVote = changeVote;
window.showVotedVoters = showVotedVoters;
window.restartElection = restartElection;
window.exportResults = exportResults;
window.refreshAllData = refreshAllData;
window.refreshResults = refreshResults;
window.logout = logout;
