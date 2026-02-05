const SESSION_KEY = 'ocpp_auth_session';
const SESSION_DURATION = 8 * 60 * 60 * 1000;

async function hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const CREDENTIALS = {
    hash: '8e9a7d3b2c1f4e6a5d8c9b0e1f2a3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    salt: 'ocpp_secure_salt_2024'
};

async function generateHash(username, password) {
    const combined = username + ':' + password + ':' + CREDENTIALS.salt;
    return await hashString(combined);
}

(async function initAuth() {
    const actualHash = await generateHash('evoxcharge', 'ocppnibryan');
    CREDENTIALS.hash = actualHash;
})();

async function verifyCredentials(username, password) {
    const inputHash = await generateHash(username, password);
    return inputHash === CREDENTIALS.hash;
}

// Check if session is valid
function isSessionValid() {
    const session = localStorage.getItem(SESSION_KEY);

    if (!session) return false;

    try {
        const sessionData = JSON.parse(session);
        const now = Date.now();

        // Check if session has expired
        if (now > sessionData.expiry) {
            localStorage.removeItem(SESSION_KEY);
            return false;
        }

        return true;
    } catch (e) {
        localStorage.removeItem(SESSION_KEY);
        return false;
    }
}

// Create session
function createSession() {
    const session = {
        authenticated: true,
        timestamp: Date.now(),
        expiry: Date.now() + SESSION_DURATION
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// Clear session
function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// Handle login form submission
async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    const loginBtn = document.getElementById('loginBtn');

    // Hide error message
    errorMessage.classList.remove('show');

    // Disable button and show loading
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> Authenticating...';

    // Simulate network delay for security
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify credentials
    const isValid = await verifyCredentials(username, password);

    if (isValid) {
        // Create session
        createSession();

        // Success feedback
        loginBtn.innerHTML = '<i class="fas fa-check-circle"></i> Success!';
        loginBtn.style.background = 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)';

        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 800);
    } else {
        // Show error
        errorMessage.classList.add('show');
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';

        // Clear password field
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
    }
}

// Toggle password visibility
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.getElementById('toggleIcon');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

function checkAuth() {
    // If we're on login page
    if (window.location.pathname.includes('login.html')) {

        if (isSessionValid()) {
            window.location.href = 'index.html';
        }
    } else {
        if (!isSessionValid()) {

            sessionStorage.setItem('ocpp_redirect_url', window.location.href);
            window.location.href = 'login.html';
        }
    }
}

// Logout function
function logout() {
    clearSession();
    window.location.href = 'login.html';
}

// Auto-check authentication when script loads
if (!window.location.pathname.includes('login.html')) {
    checkAuth();
}

// Prevent back button after logout
window.addEventListener('pageshow', function(event) {
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        if (!window.location.pathname.includes('login.html')) {
            checkAuth();
        }
    }
});

// Session timeout warning (optional - 5 minutes before expiry)
setInterval(() => {
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
        try {
            const sessionData = JSON.parse(session);
            const timeRemaining = sessionData.expiry - Date.now();

            if (timeRemaining < 5 * 60 * 1000 && timeRemaining > 0) {
                console.log('Session expiring soon. Please save your work.');
            }

            if (timeRemaining <= 0) {
                alert('Your session has expired. Please login again.');
                logout();
            }
        } catch (e) {

        }
    }
}, 60000);
