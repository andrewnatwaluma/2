// app.js - Complete Voting System with Multi-Position Support
const SUPABASE_URL = 'https://aeulakfebabgocbevjis.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFldWxha2ZlYmFiZ29jYmV2amlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1NzYzMjIsImV4cCI6MjA3NDE1MjMyMn0.TAdkgFLLdpfn38YWRSnTtveEJLFVk_c8EgE9nEwoLf0';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
window.votingApp = {
    selectedCandidates: {},
    currentVoterId: null,
    currentVoterHasVoted: false,
    hasVotedOnThisDevice: localStorage.getItem('hasVotedOnThisDevice') === 'true',
    positions: [],
    electionEndTime: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeElectionTimer();
    checkDeviceVotingStatus();
});

// Election timer functionality
function initializeElectionTimer() {
    const timerElement = document.getElementById('electionTimer');
    const countdownElement = document.getElementById('countdown');
    
    function updateTimer() {
        const now = new Date().getTime();
        const distance = window.votingApp.electionEndTime - now;
        
        if (distance < 0) {
            timerElement.classList.add('closed');
            countdownElement.textContent = 'ELECTION CLOSED';
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

// Check if device has already been used for voting
function checkDeviceVotingStatus() {
    if (window.votingApp.hasVotedOnThisDevice) {
        const loginSection = document.getElementById('loginSection');
        loginSection.innerHTML += `
            <div class="message warning">
                <i class="fas fa-exclamation-triangle"></i>
                This device has already been used to vote. Please use a different device if you need to vote again.
            </div>
        `;
    }
}

// Handle voter login
async function handleVoterLogin() {
    const voterNameInput = document.getElementById('voterName');
    const voterName = voterNameInput.value.trim();
    const loginMessage = document.getElementById('loginMessage');

    if (!voterName) {
        showMessage(loginMessage, 'Please enter your name.', 'error');
        return;
    }

    // Check device voting status
    if (window.votingApp.hasVotedOnThisDevice) {
        showAlreadyVotedNotification();
        return;
    }

    showMessage(loginMessage, 'Checking voter registration...', 'info');

    try {
        const { data: voter, error } = await supabase
            .from('voters')
            .select('*')
            .ilike('name', voterName)
            .maybeSingle();

        if (error) throw error;

        if (!voter) {
            showMessage(loginMessage, 'Voter not found. Please check your name and try again.', 'error');
            return;
        }

        if (voter.has_voted) {
            showAlreadyVotedNotification();
            return;
        }

        showMessage(loginMessage, 'Login successful!', 'success');

        // Store voter info and proceed to next step
        window.votingApp.currentVoterId = voter.id;
        window.votingApp.currentVoterHasVoted = voter.has_voted;

        setTimeout(() => {
            showSection('voterDetailsSection');
            displayVoterDetails(voter);
            updateProgress(2, 'Step 2 of 4: Verify Identity');
        }, 1000);

    } catch (error) {
        console.error('Login error:', error);
        showMessage(loginMessage, 'Error: ' + error.message, 'error');
    }
}

// Display voter details
function displayVoterDetails(voter) {
    document.getElementById('displayName').textContent = voter.name;
    document.getElementById('displayUniversity').textContent = voter.university || 'Not specified';
    document.getElementById('displayQualification').textContent = voter.qualification || 'Not specified';
    document.getElementById('displaySex').textContent = voter.sex || 'Not specified';
    document.getElementById('displayNationality').textContent = voter.nationality || 'Not specified';
    document.getElementById('displayCompletionYear').textContent = voter.completion_year || 'Not specified';
    document.getElementById('displayInternshipCenter').textContent = voter.internship_center || 'Not specified';
}

// Handle license upload
function handleLicenseUpload() {
    const uploadMessage = document.getElementById('uploadMessage');
    const fileInput = document.getElementById('licenseUpload');
    
    if (!fileInput.files || fileInput.files.length === 0) {
        showMessage(uploadMessage, 'Please select a license file to upload.', 'error');
        return;
    }
    
    showMessage(uploadMessage, 'License uploaded successfully!', 'success');
    
    setTimeout(() => {
        showSection('votingSection');
        loadCandidates();
        updateProgress(3, 'Step 3 of 4: Cast Your Votes');
    }, 1500);
}

// Load candidates for all positions
async function loadCandidates() {
    const positionsContainer = document.getElementById('positionsContainer');
    positionsContainer.innerHTML = '<p>Loading positions...</p>';

    try {
        // Load positions
        const { data: positions, error: positionsError } = await supabase
            .from('positions')
            .select('*')
            .order('title');

        if (positionsError) throw positionsError;

        window.votingApp.positions = positions || [];
        positionsContainer.innerHTML = '';

        if (positions.length === 0) {
            positionsContainer.innerHTML = '<p>No positions available for voting.</p>';
            return;
        }

        // Load candidates for each position
        for (const position of positions) {
            const { data: candidates, error: candidatesError } = await supabase
                .from('candidates')
                .select('*')
                .eq('position_id', position.id)
                .order('name');

            if (candidatesError) {
                console.error(`Error loading candidates for ${position.title}:`, candidatesError);
                continue;
            }

            const positionDiv = createPositionElement(position, candidates || []);
            positionsContainer.appendChild(positionDiv);
            
            // Initialize selection state
            window.votingApp.selectedCandidates[position.id] = null;
        }

        updateCompletionStatus();

    } catch (error) {
        console.error('Error loading candidates:', error);
        positionsContainer.innerHTML = '<p class="error">Error loading voting positions. Please try again.</p>';
    }
}

// Create position element with candidates
function createPositionElement(position, candidates) {
    const positionDiv = document.createElement('div');
    positionDiv.className = 'position-section pending';
    positionDiv.id = `position-${position.id}`;
    
    let candidatesHTML = '';
    if (candidates.length > 0) {
        candidates.forEach(candidate => {
            candidatesHTML += `
                <div class="candidate" onclick="selectCandidate('${position.id}', '${candidate.id}', this)">
                    <h3>${candidate.name}</h3>
                    <p>${candidate.description || 'No description available'}</p>
                    <button>SELECT</button>
                </div>
            `;
        });
    } else {
        candidatesHTML = '<p>No candidates available for this position</p>';
    }
    
    positionDiv.innerHTML = `
        <div class="position-title">
            <span>${position.title}</span>
            <span class="position-status">Not Voted</span>
        </div>
        <div class="candidates-container">
            ${candidatesHTML}
        </div>
        <button class="skip-btn" onclick="skipPosition('${position.id}')">Skip This Position</button>
    `;
    
    return positionDiv;
}

// Select candidate for a position
function selectCandidate(positionId, candidateId, element) {
    const positionDiv = document.getElementById(`position-${positionId}`);
    
    // Deselect all candidates in this position
    const candidates = positionDiv.querySelectorAll('.candidate');
    candidates.forEach(candidate => {
        candidate.classList.remove('selected');
        const btn = candidate.querySelector('button');
        if (btn) {
            btn.textContent = 'SELECT';
            btn.classList.remove('voted');
        }
    });
    
    // Select the clicked candidate
    if (element) {
        const button = element.querySelector('button');
        button.textContent = 'SELECTED ✓';
        button.classList.add('voted');
        element.classList.add('selected');
    }
    
    // Store selection
    window.votingApp.selectedCandidates[positionId] = candidateId;
    updateCompletionStatus();
}

// Skip a position
function skipPosition(positionId) {
    window.votingApp.selectedCandidates[positionId] = 'skipped';
    
    const positionDiv = document.getElementById(`position-${positionId}`);
    if (positionDiv) {
        const candidates = positionDiv.querySelectorAll('.candidate');
        candidates.forEach(candidate => {
            candidate.classList.remove('selected');
            const btn = candidate.querySelector('button');
            if (btn) {
                btn.textContent = 'SELECT';
                btn.classList.remove('voted');
            }
        });
    }
    
    updateCompletionStatus();
}

// Update completion status
function updateCompletionStatus() {
    const totalPositions = Object.keys(window.votingApp.selectedCandidates).length;
    const votedPositions = Object.values(window.votingApp.selectedCandidates).filter(
        candidateId => candidateId && candidateId !== 'skipped'
    ).length;
    
    const completionText = document.getElementById('completionText');
    const reviewButton = document.getElementById('reviewButton');
    
    if (completionText) {
        completionText.textContent = `You have voted for ${votedPositions} of ${totalPositions} positions`;
    }
    
    if (reviewButton) {
        reviewButton.disabled = votedPositions === 0;
        reviewButton.textContent = votedPositions > 0 ? 
            `Review Votes (${votedPositions}/${totalPositions})` : 
            'Review Votes';
    }
    
    // Update position status indicators
    for (const [positionId, candidateId] of Object.entries(window.votingApp.selectedCandidates)) {
        updatePositionStatus(positionId, candidateId);
    }
}

// Update individual position status
function updatePositionStatus(positionId, candidateId) {
    const positionDiv = document.getElementById(`position-${positionId}`);
    if (!positionDiv) return;
    
    const statusElement = positionDiv.querySelector('.position-status');
    if (!statusElement) return;
    
    if (candidateId && candidateId !== 'skipped') {
        positionDiv.className = 'position-section voted';
        statusElement.textContent = 'Voted';
    } else if (candidateId === 'skipped') {
        positionDiv.className = 'position-section skipped';
        statusElement.textContent = 'Skipped';
    } else {
        positionDiv.className = 'position-section pending';
        statusElement.textContent = 'Not Voted';
    }
}

// Review votes before submission
function reviewVotes() {
    const reviewContainer = document.getElementById('reviewContainer');
    if (!reviewContainer) return;
    
    let reviewHTML = '<h3>Your Votes</h3>';
    
    for (const [positionId, candidateId] of Object.entries(window.votingApp.selectedCandidates)) {
        const positionDiv = document.getElementById(`position-${positionId}`);
        if (positionDiv) {
            const positionTitle = positionDiv.querySelector('.position-title span').textContent;
            
            if (candidateId && candidateId !== 'skipped') {
                const candidateDiv = positionDiv.querySelector(`.candidate[onclick*="${candidateId}"]`);
                if (candidateDiv) {
                    const candidateName = candidateDiv.querySelector('h3').textContent;
                    reviewHTML += `
                        <div class="review-item">
                            <span class="review-position">${positionTitle}</span>
                            <span class="review-candidate">${candidateName}</span>
                            <span class="change-vote" onclick="changeVoteForPosition('${positionId}')">Change</span>
                        </div>
                    `;
                }
            } else if (candidateId === 'skipped') {
                reviewHTML += `
                    <div class="review-item">
                        <span class="review-position">${positionTitle}</span>
                        <span class="review-skipped">Skipped</span>
                        <span class="change-vote" onclick="changeVoteForPosition('${positionId}')">Change</span>
                    </div>
                `;
            } else {
                reviewHTML += `
                    <div class="review-item">
                        <span class="review-position">${positionTitle}</span>
                        <span class="review-skipped">Not voted yet</span>
                        <span class="change-vote" onclick="changeVoteForPosition('${positionId}')">Change</span>
                    </div>
                `;
            }
        }
    }
    
    reviewContainer.innerHTML = reviewHTML;
    showSection('reviewSection');
    updateProgress(4, 'Step 4 of 4: Review and Submit');
}

// Change vote for a specific position
function changeVoteForPosition(positionId) {
    window.votingApp.selectedCandidates[positionId] = null;
    updatePositionStatus(positionId, null);
    updateCompletionStatus();
    goBackToVoting();
    
    // Scroll to the position
    setTimeout(() => {
        const positionDiv = document.getElementById(`position-${positionId}`);
        if (positionDiv) {
            positionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

// Navigate back to voting section
function goBackToVoting() {
    showSection('votingSection');
    updateProgress(3, 'Step 3 of 4: Cast Your Votes');
}

// Cast votes - Multi-position voting
async function castVotes() {
    const votingMessage = document.getElementById('votingMessage');
    const submitButton = document.getElementById('submitVoteButton');
    
    // Validation checks
    if (window.votingApp.currentVoterHasVoted) {
        showMessage(votingMessage, 'You have already voted. You cannot vote again.', 'error');
        return;
    }
    
    if (window.votingApp.hasVotedOnThisDevice) {
        showMessage(votingMessage, 'This device has already been used to vote.', 'error');
        return;
    }
    
    showMessage(votingMessage, 'Submitting your votes...', 'info');
    submitButton.disabled = true;
    
    try {
        let votesCast = 0;
        let errors = [];
        
        // Cast votes for each selected candidate
        for (const [positionId, candidateId] of Object.entries(window.votingApp.selectedCandidates)) {
            if (candidateId && candidateId !== 'skipped') {
                const { error } = await supabase
                    .from('votes')
                    .insert([{ 
                        voter_id: window.votingApp.currentVoterId, 
                        candidate_id: candidateId,
                        position_id: positionId
                    }]);
                
                if (error) {
                    errors.push(`Position ${positionId}: ${error.message}`);
                } else {
                    votesCast++;
                }
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Failed to cast some votes: ${errors.join('; ')}`);
        }
        
        // Mark voter as voted
        const { error: updateError } = await supabase
            .from('voters')
            .update({ has_voted: true })
            .eq('id', window.votingApp.currentVoterId);
            
        if (updateError) throw updateError;
        
        // Mark device as used for voting
        localStorage.setItem('hasVotedOnThisDevice', 'true');
        window.votingApp.hasVotedOnThisDevice = true;
        window.votingApp.currentVoterHasVoted = true;
        
        showMessage(votingMessage, `Success! ${votesCast} vote(s) recorded.`, 'success');
        
        // Show completion screen
        setTimeout(() => {
            showSection('completionSection');
        }, 2000);
        
    } catch (error) {
        console.error('Vote submission error:', error);
        showMessage(votingMessage, 'Error submitting votes: ' + error.message, 'error');
        submitButton.disabled = false;
    }
}

// Utility functions
function showMessage(element, message, type) {
    if (!element) return;
    
    element.textContent = message;
    element.className = `message ${type}`;
}

function showSection(sectionId) {
    document.querySelectorAll('main section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
}

function updateProgress(step, text) {
    const steps = document.querySelectorAll('.step');
    steps.forEach((stepEl, index) => {
        stepEl.classList.remove('active', 'completed');
        if (index + 1 < step) {
            stepEl.classList.add('completed');
        } else if (index + 1 === step) {
            stepEl.classList.add('active');
        }
    });
    
    document.querySelector('.progress-text').textContent = text;
}

function showAlreadyVotedNotification() {
    const loginMessage = document.getElementById('loginMessage');
    showMessage(loginMessage, 'You have already voted. Redirecting to results...', 'error');
    
    setTimeout(() => {
        window.location.href = 'results.html';
    }, 2000);
}

// Make functions globally available
window.handleVoterLogin = handleVoterLogin;
window.handleLicenseUpload = handleLicenseUpload;
window.selectCandidate = selectCandidate;
window.skipPosition = skipPosition;
window.reviewVotes = reviewVotes;
window.changeVoteForPosition = changeVoteForPosition;
window.goBackToVoting = goBackToVoting;
window.castVotes = castVotes;
