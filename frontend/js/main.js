'use strict';

const usernamePage = document.querySelector('#username-page');
const chatPage = document.querySelector('#chat-page');
const usernameForm = document.querySelector('#username-form');
const messageForm = document.querySelector('#message-form');
const messageInput = document.querySelector('#message');
const messageArea = document.querySelector('#messageArea');
const currentUserDisplay = document.querySelector('#current-user');

let stompClient = null;
let currentUser = null;
let currentRoomId = null;

let colors = [
    '#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6'
];

async function connect(event) {
    event.preventDefault();
    const rawUsername = document.querySelector('#name').value.trim();

    if (rawUsername) {
        // 1. Pseudo Login
        const loginRes = await fetch('http://localhost:8080/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: rawUsername })
        });
        currentUser = await loginRes.json();

        // 2. We'll join a default "General" group chat for this demo
        const roomRes = await fetch('http://localhost:8080/api/rooms/default');
        const room = await roomRes.json();
        currentRoomId = room.id;

        // Transition UI
        usernamePage.classList.add('hidden');
        chatPage.classList.remove('hidden');
        currentUserDisplay.textContent = currentUser.username;

        // Fetch past messages first
        await fetchMessages();

        // Then connect to WebSocket using the room ID
        let socket = new SockJS('http://localhost:8080/ws');
        stompClient = Stomp.over(socket);
        stompClient.debug = null;
        
        stompClient.connect({}, onConnected, onError);
    }
}

async function fetchMessages() {
    try {
        const response = await fetch(`http://localhost:8080/api/messages/${currentRoomId}`);
        if (response.ok) {
            const messages = await response.json();
            messages.forEach(message => {
                displayMessage(message, true);
            });
            messageArea.scrollTop = messageArea.scrollHeight;
        }
    } catch (e) {
        console.error("Failed to load chat history", e);
    }
}

function onConnected() {
    // Subscribe to the dynamic room Topic
    stompClient.subscribe(`/topic/room.${currentRoomId}`, onMessageReceived);

    // Tell your username to the server
    stompClient.send(`/app/chat/${currentRoomId}/addUser`,
        {},
        JSON.stringify({sender: currentUser.username, type: 'JOIN'})
    );
}

function onError(error) {
    console.error('Could not connect to WebSocket server. Please refresh this page to try again!');
}

function sendMessage(event) {
    event.preventDefault();
    const messageContent = messageInput.value.trim();

    if (messageContent && stompClient) {
        const chatMessage = {
            sender: currentUser.username,
            content: messageContent,
            type: 'CHAT'
        };

        stompClient.send(`/app/chat/${currentRoomId}/sendMessage`, {}, JSON.stringify(chatMessage));
        messageInput.value = '';
    }
}

function onMessageReceived(payload) {
    const message = JSON.parse(payload.body);
    displayMessage(message, false);
}

function displayMessage(message, isHistory) {
    const messageElement = document.createElement('div');
    
    if (message.type === 'JOIN') {
        messageElement.classList.add('message', 'event');
        message.content = `${message.sender} joined!`;
    } else if (message.type === 'LEAVE') {
        messageElement.classList.add('message', 'event');
        message.content = `${message.sender} left!`;
    } else {
        const isOwn = message.sender === currentUser.username;
        messageElement.classList.add('message', isOwn ? 'own' : 'other');

        const senderElement = document.createElement('span');
        senderElement.classList.add('message-sender');
        senderElement.textContent = message.sender;
        senderElement.style.color = getAvatarColor(message.sender);
        
        messageElement.appendChild(senderElement);
    }

    const textElement = document.createElement('div');
    textElement.classList.add('message-bubble');
    textElement.textContent = message.content;

    messageElement.appendChild(textElement);
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

usernameForm.addEventListener('submit', connect, true);
messageForm.addEventListener('submit', sendMessage, true);
