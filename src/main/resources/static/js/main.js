'use strict';

const usernamePage = document.querySelector('#username-page');
const chatPage = document.querySelector('#chat-page');
const usernameForm = document.querySelector('#username-form');
const messageForm = document.querySelector('#message-form');
const messageInput = document.querySelector('#message');
const messageArea = document.querySelector('#messageArea');
const currentUserDisplay = document.querySelector('#current-user');

const roomsArea = document.querySelector('#roomsArea');
const activeRoomNameDisplay = document.querySelector('#active-room-name');
const userSelect = document.querySelector('#user-select');
const startDmBtn = document.querySelector('#start-dm-btn');
const logoutBtn = document.querySelector('#logout-btn');

let stompClient = null;
let currentUser = null;
let e2eSecret = null;
let activeRoomId = null;
let roomsList = []; // Track all rooms

let colors = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6'];

// Use explicit backend URL from window or fallback to empty (relative)
const API_BASE = window.SECURELY_BACKEND_URL || '';

// --- Session Storage Helpers ---
function saveRoomsToSession() {
    sessionStorage.setItem('securelyRooms', JSON.stringify(roomsList));
    sessionStorage.setItem('securelyActiveRoomId', activeRoomId);
}

function loadRoomsFromSession() {
    const saved = sessionStorage.getItem('securelyRooms');
    return saved ? JSON.parse(saved) : [];
}

// --- Debug Helper ---
async function debugBackendConnection() {
    console.log('=== Securely Debug Info ===');
    console.log('Backend URL:', API_BASE || 'localhost (relative)');
    console.log('Page URL:', window.location.href);
    try {
        const res = await fetch(`${API_BASE}/api/users`, { method: 'GET' });
        console.log('GET /api/users status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('Users:', data);
        }
    } catch (e) {
        console.error('Connection test failed:', e);
    }
}

// --- CryptoUtils for End-to-End Encryption ---
const CryptoUtils = {
    encrypt: (text, secret) => {
        if (!text) return text;
        return CryptoJS.AES.encrypt(text, secret).toString();
    },
    decrypt: (ciphertext, secret) => {
        if (!ciphertext) return ciphertext;
        try {
            const bytes = CryptoJS.AES.decrypt(ciphertext, secret);
            return bytes.toString(CryptoJS.enc.Utf8) || '[Decryption Failed: Bad Key]';
        } catch (e) {
            return '[Decryption Failed: Invalid Ciphertext]';
        }
    },
    // Generate SHA-256 hash for key grouping
    hashKey: (key) => {
        return CryptoJS.SHA256(key).toString();
    }
};

// --- Initialization & Flow ---
async function init() {
    // Check for existing session
    const savedSession = sessionStorage.getItem('securelyUserSession');
    
    if (savedSession) {
        const session = JSON.parse(savedSession);
        currentUser = session.user;
        e2eSecret = session.secret;
        
        // Load saved rooms
        roomsList = loadRoomsFromSession();
        const savedActiveRoomId = sessionStorage.getItem('securelyActiveRoomId');
        
        transitionToHome(roomsList, savedActiveRoomId);
    }
}

async function loginUser(event) {
    event.preventDefault();
    const rawUsername = document.querySelector('#name').value.trim();
    const rawSecret = document.querySelector('#secret-key').value.trim();

    if (rawUsername && rawSecret) {
        try {
            console.log(`Attempting login to ${API_BASE}/api/login`);
            const keyHash = CryptoUtils.hashKey(rawSecret);
            const loginRes = await fetch(`${API_BASE}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: rawUsername, keyHash: keyHash })
            });

            console.log(`Login response status: ${loginRes.status}`);
            
            if (!loginRes.ok) {
                const errorText = await loginRes.text();
                throw new Error(`Login failed: ${loginRes.status} - ${errorText}`);
            }

            currentUser = await loginRes.json();
            e2eSecret = rawSecret;
            
            // Reset rooms for new login
            roomsList = [];
            activeRoomId = null;

            // Persist session
            sessionStorage.setItem('securelyUserSession', JSON.stringify({
                user: currentUser,
                secret: e2eSecret
            }));

            transitionToHome();
        } catch (err) {
            console.error('Login error:', err);
            alert(`Could not reach Securely backend: ${err.message}\n\nBackend URL: ${API_BASE || 'localhost (relative)'}\n\nCheck browser console for details.`);
        }
    }
}

async function transitionToHome(savedRooms = [], savedActiveRoomId = null) {
    usernamePage.classList.add('hidden');
    chatPage.classList.remove('hidden');
    currentUserDisplay.textContent = currentUser.username;

    // Load necessary data
    await loadAvailableUsers();
    
    // If there are saved rooms, restore them; otherwise load default room
    if (savedRooms && savedRooms.length > 0) {
        await restoreSavedRooms(savedRooms, savedActiveRoomId);
    } else {
        await connectToDefaultRoom();
    }
}

function handleLogout() {
    sessionStorage.removeItem('securelyUserSession');
    sessionStorage.removeItem('securelyRooms');
    sessionStorage.removeItem('securelyActiveRoomId');
    if(stompClient) {
        stompClient.disconnect();
    }
    window.location.reload();
}

// --- WebSocket & Stomp ---
async function restoreSavedRooms(savedRooms, savedActiveRoomId) {
    try {
        // Add all saved rooms to the sidebar
        for (const room of savedRooms) {
            addRoomToSidebar(room);
        }
        
        // Determine which room to activate
        let roomToActivate = savedRooms[0]; // Default to first room
        if (savedActiveRoomId) {
            const found = savedRooms.find(r => r.id == savedActiveRoomId);
            if (found) roomToActivate = found;
        }
        
        switchActiveRoom(roomToActivate);
        
        // Connect WebSocket
        let socket = new SockJS(`${API_BASE}/ws`);
        stompClient = Stomp.over(socket);
        stompClient.debug = null;
        stompClient.connect({}, onConnected, onError);
    } catch (err) {
        console.error('Failed to restore rooms', err);
        messageArea.innerHTML = '<div class="error-message">Unable to restore rooms. Check the backend server.</div>';
    }
}
async function connectToDefaultRoom() {
    try {
        const roomRes = await fetch(`${API_BASE}/api/rooms/default-room`);
        if (!roomRes.ok) throw new Error(`Default room returned ${roomRes.status}`);

        const defaultRoom = await roomRes.json();
        addRoomToSidebar(defaultRoom);
        switchActiveRoom(defaultRoom);

        let socket = new SockJS(`${API_BASE}/ws`);
        stompClient = Stomp.over(socket);
        stompClient.debug = null;
        stompClient.connect({}, onConnected, onError);
    } catch (err) {
        console.error('Failed to load default room or connect websocket', err);
        messageArea.innerHTML = '<div class="error-message">Unable to load the default room. Check the backend server.</div>';
    }
}

function onConnected() {
    subscribeToRoom(activeRoomId);
}

function subscribeToRoom(roomId) {
    // Note: in a real production environment, you'd unsubscribe from previous rooms if switching frequently
    stompClient.subscribe(`/topic/room.${roomId}`, onMessageReceived);
    stompClient.send(`/app/chat/${roomId}/addUser`, {}, JSON.stringify({ 
        sender: currentUser.username, 
        type: 'JOIN' 
    }));
}

function onError(error) {
    console.error('WebSocket Error:', error);
    const errElem = document.createElement('div');
    errElem.style.color = "red";
    errElem.textContent = "Could not connect to WebSocket. Connecting to local server?";
    messageArea.appendChild(errElem);
}

// --- API Calls ---
async function fetchMessages(roomId) {
    messageArea.innerHTML = ''; // Clear chat area
    try {
        const response = await fetch(`${API_BASE}/api/messages/${roomId}`);
        if (response.ok) {
            const messages = await response.json();
            messages.forEach(message => {
                // DECRYPT HISTORY HERE
                if (message.type === 'CHAT') {
                    message.content = CryptoUtils.decrypt(message.content, e2eSecret);
                }
                displayMessage(message, true);
            });
            messageArea.scrollTop = messageArea.scrollHeight;
        }
    } catch (e) {
        console.error("Failed to load chat history", e);
    }
}

async function loadAvailableUsers() {
    try {
        const res = await fetch(`${API_BASE}/api/users?currentUserId=${currentUser.id}`);
        if (!res.ok) {
            console.error('Failed to load users:', res.status, res.statusText);
            return;
        }
        const users = await res.json();
        
        userSelect.innerHTML = '<option value="">Select a user...</option>';
        users.forEach(u => {
            if (u.id !== currentUser.id) {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.username;
                userSelect.appendChild(opt);
            }
        });
    } catch(e) {
        console.error('Failed to load users:', e);
        alert('Error loading users. Check console and backend connection.');
    }
}

async function startDirectMessage() {
    const partnerId = userSelect.value;
    if(!partnerId) return;

    try {
        const res = await fetch(`${API_BASE}/api/rooms/direct?user1Id=${currentUser.id}&user2Id=${partnerId}`, {
            method: 'POST'
        });
        const room = await res.json();
        
        // Add to sidebar visually
        addRoomToSidebar(room);
        switchActiveRoom(room);
        subscribeToRoom(room.id);
        
    } catch(e) {
        console.error('Could not create direct chat', e);
    }
}

// --- UI Rendering ---
function switchActiveRoom(room) {
    activeRoomId = room.id;
    activeRoomNameDisplay.textContent = room.name;
    
    // Update sidebar active state
    document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
    let roomEl = document.querySelector(`.room-item[data-room-id="${room.id}"]`);
    if(roomEl) roomEl.classList.add('active');
    
    // Save active room to session
    saveRoomsToSession();
    
    // Switch messages
    fetchMessages(room.id);
}

function addRoomToSidebar(room) {
    let existing = document.querySelector(`.room-item[data-room-id="${room.id}"]`);
    if(!existing) {
        existing = document.createElement('li');
        existing.classList.add('room-item');
        existing.setAttribute('data-room-id', room.id);
        existing.innerHTML = `<span class="hash">#</span> ${room.name}`;
        existing.addEventListener('click', () => switchActiveRoom(room));
        roomsArea.appendChild(existing);
        
        // Add room to our tracking list if not already there
        if (!roomsList.find(r => r.id === room.id)) {
            roomsList.push(room);
            saveRoomsToSession();
        }
    }
}

function sendMessage(event) {
    event.preventDefault();
    const rawContent = messageInput.value.trim();

    if (!rawContent) {
        return;
    }

    if (!stompClient || !activeRoomId) {
        console.error('Cannot send message: websocket is not connected or no active room selected');
        return;
    }

    const encryptedContent = CryptoUtils.encrypt(rawContent, e2eSecret);
    const chatMessage = {
        sender: currentUser.username,
        content: encryptedContent,
        type: 'CHAT'
    };

    stompClient.send(`/app/chat/${activeRoomId}/sendMessage`, {}, JSON.stringify(chatMessage));
    messageInput.value = '';
}

function onMessageReceived(payload) {
    const message = JSON.parse(payload.body);
    
    // Only display if it's for our active room visually
    if (message.roomId && message.roomId !== activeRoomId) return;

    // DECRYPT REALTIME MESSAGES HERE
    if (message.type === 'CHAT') {
        message.content = CryptoUtils.decrypt(message.content, e2eSecret);
    }
    
    displayMessage(message, false);
}

function displayMessage(message, isHistory) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    if (message.type === 'JOIN') {
        messageElement.classList.add('event-message');
        messageElement.textContent = `${message.sender} joined the channel.`;
        messageArea.appendChild(messageElement);
        return;
    } else if (message.type === 'LEAVE') {
        messageElement.classList.add('event-message');
        messageElement.textContent = `${message.sender} left the channel.`;
        messageArea.appendChild(messageElement);
        return;
    }

    const isOwn = message.sender === currentUser.username;
    messageElement.classList.add(isOwn ? 'own-message' : 'other-message');

    const metaDiv = document.createElement('div');
    metaDiv.classList.add('message-meta');
    
    // Add sender info
    const senderSpan = document.createElement('span');
    senderSpan.classList.add('sender-name');
    senderSpan.textContent = message.sender;
    senderSpan.style.color = getAvatarColor(message.sender);
    
    // Add timestamp info if present
    const timeSpan = document.createElement('span');
    timeSpan.classList.add('timestamp');
    if (message.timestamp) {
        timeSpan.textContent = new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    metaDiv.appendChild(senderSpan);
    metaDiv.appendChild(timeSpan);

    const bubbleDiv = document.createElement('div');
    bubbleDiv.classList.add('message-bubble');
    
    // Check if decryption failed
    if (message.content.includes('[Decryption Failed:')) {
        bubbleDiv.classList.add('decryption-failed');
    }
    bubbleDiv.textContent = message.content;

    messageElement.appendChild(metaDiv);
    messageElement.appendChild(bubbleDiv);
    
    messageArea.appendChild(messageElement);
    
    if (!isHistory) {
        messageArea.scrollTop = messageArea.scrollHeight;
    }
}

function getAvatarColor(messageSender) {
    let hash = 0;
    for (let i = 0; i < messageSender.length; i++) {
        hash = 31 * hash + messageSender.charCodeAt(i);
    }
    const index = Math.abs(hash % colors.length);
    return colors[index];
}

// --- Event Listeners ---
usernameForm.addEventListener('submit', loginUser, true);
messageForm.addEventListener('submit', sendMessage, true);
startDmBtn.addEventListener('click', startDirectMessage);
logoutBtn.addEventListener('click', handleLogout);

// Run init
init();
