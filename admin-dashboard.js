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

// Candidate Management State
let currentEditingCandidateId = null;

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
    await loadPositionsForDropdown(); // Load positions for candidate management
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
        document.getElementById('superAdminCandidateSection').style.display = 'none';
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

// Load admin statistics (Only show total voters and turnout)
async function loadAdminStats() {
    try {
        const [
            { count: totalVoters },
            { count: votedCount }
        ] = await Promise.all([
            supabase.from('voters').select('*', { count: 'exact', head: true }),
            supabase.from('voters').select('*', { count: 'exact', head: true }).eq('has_voted', true)
        ]);

        const turnout = totalVoters > 0 ? Math.round((votedCount / totalVoters) * 100) : 0;

        document.getElementById('adminStats').innerHTML = `
            <div class="stat-item">
                <i class="fas fa-users"></i>
                <span class="stat-value">${totalVoters || 0}</span>
                <span class="stat-label">Total Voters</span>
            </div>
            <div class="stat-item">
                <i class="fas fa-chart-pie"></i>
                <span class="stat-value">${turnout}%</span>
                <span class="stat-label">Turnout</span>
            </div>
        `;

    } catch (error) {
        console.error('Error loading admin stats:', error);
        document.getElementById('adminStats').innerHTML = '<p class="error">Error loading statistics</p>';
    }
}

// Load election results (Admin sees percentages only, not actual vote counts)
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

        // Full results display (Show percentages only)
        let resultsHTML = '';
        let previewHTML = '';

        for (const [positionTitle, candidates] of Object.entries(resultsByPosition)) {
            const totalVotes = candidates.reduce((sum, cand) => sum + cand.vote_count, 0);
            
            const positionResultsHTML = `
                <div class="position-results">
                    <h3>${positionTitle}</h3>
                    ${candidates.map(candidate => {
                        const percentage = totalVotes > 0 ? Math.round((candidate.vote_count / totalVotes) * 100) : 0;
                        return `
                            <div class="candidate-result">
                                <span>${candidate.candidate_name}</span>
                                <strong>${percentage}%</strong>
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

// Load voter statistics
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
    
    // Get voter's current votes
    let currentVotesInfo = 'Not voted yet';
    try {
        const { data: votes, error } = await supabase
            .from('votes')
            .select('candidates(name), positions(title)')
            .eq('voter_id', voterId);

        if (!error && votes && votes.length > 0) {
            currentVotesInfo = votes.map(vote => 
                `${vote.positions.title}: ${vote.candidates.name}`
            ).join('; ');
        }
    } catch (error) {
        console.error('Error getting voter votes:', error);
    }

    const statusText = hasVoted ? `Voted - ${currentVotesInfo}` : 'Not voted yet';
    document.getElementById('voterVoteStatus').textContent = statusText;
    document.getElementById('voterVoteStatus').className = `status-badge ${hasVoted ? 'voted' : 'not-voted'}`;
    
    document.getElementById('voterActionSection').style.display = 'block';
    
    // Scroll to action section
    document.getElementById('voterActionSection').scrollIntoView({ behavior: 'smooth' });
}

// Change voter's vote (superadmin override) - Only override specific position, keep others
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

        // Get the position title for the selected candidate
        const { data: position, error: positionError } = await supabase
            .from('positions')
            .select('title')
            .eq('id', candidate.position_id)
            .single();

        if (positionError) throw positionError;

        // Delete only the vote for this specific position
        const { error: deleteError } = await supabase
            .from('votes')
            .delete()
            .eq('voter_id', window.adminApp.selectedVoterId)
            .eq('position_id', candidate.position_id);

        if (deleteError && deleteError.code !== 'P0001') { // Ignore no rows affected
            throw deleteError;
        }

        // Insert new vote for this position
        const { error: insertError } = await supabase
            .from('votes')
            .insert([{
                voter_id: window.adminApp.selectedVoterId,
                candidate_id: candidateId,
                position_id: candidate.position_id
            }]);

        if (insertError) throw insertError;

        // Update voter status if not already voted
        const { error: updateError } = await supabase
            .from('voters')
            .update({ has_voted: true })
            .eq('id', window.adminApp.selectedVoterId)
            .eq('has_voted', false);

        if (updateError) throw updateError;

        showAdminMessage(messageElement, `Vote for ${position.title} successfully updated! Other votes remain unchanged.`, 'success');
        
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

// CANDIDATE MANAGEMENT FUNCTIONS

// Load positions for dropdown
async function loadPositionsForDropdown() {
    try {
        const { data: positions, error } = await supabase
            .from('positions')
            .select('*')
            .order('title');

        if (error) throw error;

        const editSelect = document.getElementById('editCandidatePosition');
        const addSelect = document.getElementById('newCandidatePosition');
        
        editSelect.innerHTML = '<option value="">Select Position</option>';
        addSelect.innerHTML = '<option value="">Select Position</option>';
        
        if (positions && positions.length > 0) {
            positions.forEach(position => {
                const option = document.createElement('option');
                option.value = position.id;
                option.textContent = position.title;
                editSelect.appendChild(option.cloneNode(true));
                addSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading positions:', error);
    }
}

// Search candidates
async function searchCandidates() {
    const searchTerm = document.getElementById('candidateSearch').value.trim();
    const resultsDiv = document.getElementById('candidateSearchResults');
    
    if (!searchTerm) {
        resultsDiv.innerHTML = '<p class="message error">Please enter a search term</p>';
        return;
    }

    resultsDiv.innerHTML = '<p class="message info">Searching...</p>';

    try {
        const { data: candidates, error } = await supabase
            .from('candidates')
            .select(`
                *,
                positions (title)
            `)
            .ilike('name', `%${searchTerm}%`)
            .order('name')
            .limit(10);

        if (error) throw error;

        if (!candidates || candidates.length === 0) {
            resultsDiv.innerHTML = '<p class="message warning">No candidates found</p>';
            return;
        }

        let html = '<div class="search-results-list">';
        candidates.forEach(candidate => {
            html += `
                <div class="candidate-search-result">
                    <div class="candidate-info">
                        <strong>${candidate.name}</strong>
                        <span>${candidate.positions?.title || 'No position'}</span>
                        ${candidate.picture_url ? '<i class="fas fa-camera has-photo"></i>' : '<i class="fas fa-camera-slash no-photo"></i>'}
                    </div>
                    <button onclick="editCandidate('${candidate.id}')" class="secondary-btn btn-sm">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            `;
        });
        html += '</div>';

        resultsDiv.innerHTML = html;

    } catch (error) {
        console.error('Candidate search error:', error);
        resultsDiv.innerHTML = '<p class="message error">Error searching candidates</p>';
    }
}

// Edit candidate
async function editCandidate(candidateId) {
    try {
        const { data: candidate, error } = await supabase
            .from('candidates')
            .select(`
                *,
                positions (title)
            `)
            .eq('id', candidateId)
            .single();

        if (error) throw error;

        currentEditingCandidateId = candidateId;
        
        // Populate form
        document.getElementById('editingCandidateName').textContent = candidate.name;
        document.getElementById('editCandidateName').value = candidate.name;
        document.getElementById('editCandidateDescription').value = candidate.description || '';
        document.getElementById('editCandidatePosition').value = candidate.position_id;
        
        // Handle photo display
        const photoImg = document.getElementById('currentCandidatePhoto');
        const noPhotoMsg = document.getElementById('noPhotoMessage');
        const removeBtn = document.getElementById('removePhotoBtn');
        
        if (candidate.picture_url) {
            photoImg.src = candidate.picture_url;
            photoImg.style.display = 'block';
            noPhotoMsg.style.display = 'none';
            removeBtn.style.display = 'block';
        } else {
            photoImg.style.display = 'none';
            noPhotoMsg.style.display = 'block';
            removeBtn.style.display = 'none';
        }
        
        // Show edit form
        document.getElementById('candidateEditForm').style.display = 'block';
        document.getElementById('candidateSearchResults').innerHTML = '';
        
        // Scroll to form
        document.getElementById('candidateEditForm').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Error loading candidate:', error);
        showAdminMessage(document.getElementById('candidateEditMessage'), 'Error loading candidate: ' + error.message, 'error');
    }
}

// Upload candidate photo
async function uploadCandidatePhoto() {
    const fileInput = document.getElementById('newCandidatePhoto');
    const messageElement = document.getElementById('candidateEditMessage');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        showAdminMessage(messageElement, 'Please select a photo to upload', 'error');
        return;
    }

    const file = fileInput.files[0];
    const maxSize = 2 * 1024 * 1024; // 2MB limit for candidate photos
    
    if (file.size > maxSize) {
        showAdminMessage(messageElement, 'File too large. Maximum size is 2MB.', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showAdminMessage(messageElement, 'Please select a valid image file.', 'error');
        return;
    }

    showAdminMessage(messageElement, 'Uploading photo...', 'info');

    try {
        // Create unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentEditingCandidateId}-${Date.now()}.${fileExt}`;
        const filePath = `candidate-photos/${fileName}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('candidate-photos')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('candidate-photos')
            .getPublicUrl(filePath);

        // Update candidate record with photo URL
        const { error: updateError } = await supabase
            .from('candidates')
            .update({ picture_url: urlData.publicUrl })
            .eq('id', currentEditingCandidateId);

        if (updateError) throw updateError;

        // Update UI
        const photoImg = document.getElementById('currentCandidatePhoto');
        const noPhotoMsg = document.getElementById('noPhotoMessage');
        const removeBtn = document.getElementById('removePhotoBtn');
        
        photoImg.src = urlData.publicUrl;
        photoImg.style.display = 'block';
        noPhotoMsg.style.display = 'none';
        removeBtn.style.display = 'block';
        
        fileInput.value = ''; // Clear file input
        
        showAdminMessage(messageElement, 'Photo uploaded successfully!', 'success');
        
        // Refresh candidates list
        setTimeout(() => {
            loadAllCandidates();
        }, 1000);

    } catch (error) {
        console.error('Photo upload error:', error);
        showAdminMessage(messageElement, 'Error uploading photo: ' + error.message, 'error');
    }
}

// Remove candidate photo
async function removeCandidatePhoto() {
    const messageElement = document.getElementById('candidateEditMessage');
    
    if (!confirm('Are you sure you want to remove this photo?')) {
        return;
    }

    showAdminMessage(messageElement, 'Removing photo...', 'info');

    try {
        // Update candidate record to remove photo URL
        const { error: updateError } = await supabase
            .from('candidates')
            .update({ picture_url: null })
            .eq('id', currentEditingCandidateId);

        if (updateError) throw updateError;

        // Update UI
        const photoImg = document.getElementById('currentCandidatePhoto');
        const noPhotoMsg = document.getElementById('noPhotoMessage');
        const removeBtn = document.getElementById('removePhotoBtn');
        
        photoImg.style.display = 'none';
        noPhotoMsg.style.display = 'block';
        removeBtn.style.display = 'none';
        
        showAdminMessage(messageElement, 'Photo removed successfully!', 'success');
        
        // Refresh candidates list
        setTimeout(() => {
            loadAllCandidates();
        }, 1000);

    } catch (error) {
        console.error('Photo removal error:', error);
        showAdminMessage(messageElement, 'Error removing photo: ' + error.message, 'error');
    }
}

// Update candidate details
async function updateCandidate() {
    const name = document.getElementById('editCandidateName').value.trim();
    const description = document.getElementById('editCandidateDescription').value.trim();
    const positionId = document.getElementById('editCandidatePosition').value;
    const messageElement = document.getElementById('candidateEditMessage');

    if (!name) {
        showAdminMessage(messageElement, 'Please enter a candidate name', 'error');
        return;
    }

    if (!positionId) {
        showAdminMessage(messageElement, 'Please select a position', 'error');
        return;
    }

    showAdminMessage(messageElement, 'Updating candidate...', 'info');

    try {
        const { error } = await supabase
            .from('candidates')
            .update({
                name: name,
                description: description,
                position_id: positionId,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentEditingCandidateId);

        if (error) throw error;

        showAdminMessage(messageElement, 'Candidate updated successfully!', 'success');
        
        // Refresh search results and list
        setTimeout(() => {
            searchCandidates();
            loadAllCandidates();
        }, 1000);

    } catch (error) {
        console.error('Candidate update error:', error);
        showAdminMessage(messageElement, 'Error updating candidate: ' + error.message, 'error');
    }
}

// Show add candidate form
function showAddCandidateForm() {
    document.getElementById('addCandidateForm').style.display = 'block';
    document.getElementById('candidateSearchResults').innerHTML = '';
    document.getElementById('addCandidateMessage').innerHTML = '';
    
    // Clear form
    document.getElementById('newCandidateName').value = '';
    document.getElementById('newCandidateDescription').value = '';
    document.getElementById('newCandidatePosition').value = '';
    document.getElementById('newCandidatePhotoInput').value = '';
    
    // Scroll to form
    document.getElementById('addCandidateForm').scrollIntoView({ behavior: 'smooth' });
}

// Create new candidate
async function createCandidate() {
    const name = document.getElementById('newCandidateName').value.trim();
    const description = document.getElementById('newCandidateDescription').value.trim();
    const positionId = document.getElementById('newCandidatePosition').value;
    const photoFile = document.getElementById('newCandidatePhotoInput').files[0];
    const messageElement = document.getElementById('addCandidateMessage');

    if (!name) {
        showAdminMessage(messageElement, 'Please enter a candidate name', 'error');
        return;
    }

    if (!positionId) {
        showAdminMessage(messageElement, 'Please select a position', 'error');
        return;
    }

    showAdminMessage(messageElement, 'Creating candidate...', 'info');

    try {
        // First create the candidate
        const { data: candidate, error: createError } = await supabase
            .from('candidates')
            .insert([{
                name: name,
                description: description,
                position_id: positionId,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (createError) throw createError;

        let pictureUrl = null;

        // Upload photo if provided
        if (photoFile) {
            const maxSize = 2 * 1024 * 1024;
            if (photoFile.size > maxSize) {
                throw new Error('Photo file too large. Maximum size is 2MB.');
            }

            if (!photoFile.type.startsWith('image/')) {
                throw new Error('Please select a valid image file.');
            }

            const fileExt = photoFile.name.split('.').pop();
            const fileName = `${candidate.id}-${Date.now()}.${fileExt}`;
            const filePath = `candidate-photos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('candidate-photos')
                .upload(filePath, photoFile);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('candidate-photos')
                .getPublicUrl(filePath);

            pictureUrl = urlData.publicUrl;

            // Update candidate with photo URL
            const { error: updateError } = await supabase
                .from('candidates')
                .update({ picture_url: pictureUrl })
                .eq('id', candidate.id);

            if (updateError) throw updateError;
        }

        showAdminMessage(messageElement, 'Candidate created successfully!', 'success');
        
        // Clear form and hide it
        setTimeout(() => {
            document.getElementById('addCandidateForm').style.display = 'none';
            document.getElementById('newCandidateName').value = '';
            document.getElementById('newCandidateDescription').value = '';
            document.getElementById('newCandidatePosition').value = '';
            document.getElementById('newCandidatePhotoInput').value = '';
            
            // Refresh lists
            loadAllCandidates();
        }, 1500);

    } catch (error) {
        console.error('Candidate creation error:', error);
        showAdminMessage(messageElement, 'Error creating candidate: ' + error.message, 'error');
    }
}

// Load all candidates
async function loadAllCandidates() {
    const listDiv = document.getElementById('allCandidatesList');
    listDiv.innerHTML = '<p class="message info">Loading candidates...</p>';

    try {
        const { data: candidates, error } = await supabase
            .from('candidates')
            .select(`
                *,
                positions (title)
            `)
            .order('name');

        if (error) throw error;

        if (!candidates || candidates.length === 0) {
            listDiv.innerHTML = '<p class="message warning">No candidates found</p>';
            return;
        }

        let html = `
            <div class="candidates-table">
                <div class="table-header">
                    <span>Photo</span>
                    <span>Name</span>
                    <span>Position</span>
                    <span>Actions</span>
                </div>
        `;

        candidates.forEach(candidate => {
            html += `
                <div class="table-row">
                    <span class="photo-cell">
                        ${candidate.picture_url 
                            ? `<img src="${candidate.picture_url}" alt="${candidate.name}" class="candidate-thumb">`
                            : '<i class="fas fa-user-circle no-photo"></i>'
                        }
                    </span>
                    <span class="name-cell">${candidate.name}</span>
                    <span class="position-cell">${candidate.positions?.title || 'N/A'}</span>
                    <span class="actions-cell">
                        <button onclick="editCandidate('${candidate.id}')" class="secondary-btn btn-sm">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button onclick="deleteCandidate('${candidate.id}')" class="danger-btn btn-sm">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </span>
                </div>
            `;
        });

        html += '</div>';
        listDiv.innerHTML = html;

    } catch (error) {
        console.error('Error loading candidates:', error);
        listDiv.innerHTML = '<p class="message error">Error loading candidates</p>';
    }
}

// Delete candidate
async function deleteCandidate(candidateId) {
    if (!confirm('WARNING: This will permanently delete the candidate and all their votes. This action cannot be undone. Are you sure?')) {
        return;
    }

    try {
        // First check if candidate has votes
        const { data: votes, error: votesError } = await supabase
            .from('votes')
            .select('id')
            .eq('candidate_id', candidateId)
            .limit(1);

        if (votesError) throw votesError;

        if (votes && votes.length > 0) {
            if (!confirm('This candidate has votes recorded. Deleting them will also delete all their votes. Continue?')) {
                return;
            }
        }

        // Delete candidate
        const { error: deleteError } = await supabase
            .from('candidates')
            .delete()
            .eq('id', candidateId);

        if (deleteError) throw deleteError;

        alert('Candidate deleted successfully!');
        loadAllCandidates();

    } catch (error) {
        console.error('Error deleting candidate:', error);
        alert('Error deleting candidate: ' + error.message);
    }
}

// Cancel edit
function cancelEdit() {
    document.getElementById('candidateEditForm').style.display = 'none';
    currentEditingCandidateId = null;
    document.getElementById('candidateEditMessage').innerHTML = '';
}

// Cancel add
function cancelAdd() {
    document.getElementById('addCandidateForm').style.display = 'none';
    document.getElementById('addCandidateMessage').innerHTML = '';
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

// Candidate Management Functions
window.searchCandidates = searchCandidates;
window.editCandidate = editCandidate;
window.uploadCandidatePhoto = uploadCandidatePhoto;
window.removeCandidatePhoto = removeCandidatePhoto;
window.updateCandidate = updateCandidate;
window.showAddCandidateForm = showAddCandidateForm;
window.createCandidate = createCandidate;
window.loadAllCandidates = loadAllCandidates;
window.deleteCandidate = deleteCandidate;
window.cancelEdit = cancelEdit;
window.cancelAdd = cancelAdd;
