document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user) {
        window.location.href = 'index.html';
        return;
    }

    // Set user initial
    document.getElementById('user-initial').textContent = user.email.charAt(0).toUpperCase();

    // Logout functionality
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    // Initialize Socket.IO connection
    const socket = io('http://localhost:8000', {
        auth: {
            token: token
        }
    });

    let currentRoom = 'global';
    let isTyping = false;
    let typingTimeout;

    // Room descriptions
    const roomDescriptions = {
        'global': 'Discuss general topics with the community',
        'crypto': 'Talk about cryptocurrencies and blockchain',
        'fiat': 'Discuss fiat currency transactions and banking'
    };

    // Join initial room
    joinRoom(currentRoom);

    // Handle room switching
    document.querySelectorAll('.chat-room-btn').forEach(button => {
        button.addEventListener('click', function() {
            const room = this.getAttribute('data-room');
            if (room !== currentRoom) {
                // Update UI
                document.querySelectorAll('.chat-room-btn').forEach(btn => {
                    btn.classList.remove('bg-gray-100');
                });
                this.classList.add('bg-gray-100');
                
                // Leave current room and join new one
                socket.emit('leave_room', currentRoom);
                joinRoom(room);
                currentRoom = room;
            }
        });
    });

    // Handle message submission
    document.getElementById('message-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('message-input');
        const message = input.value.trim();
        
        if (message) {
            socket.emit('send_message', {
                room: currentRoom,
                content: message
            });
            input.value = '';
        }
    });

    // Typing indicator
    document.getElementById('message-input').addEventListener('input', () => {
        if (!isTyping) {
            isTyping = true;
            socket.emit('typing', currentRoom);
        }
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            socket.emit('stop_typing', currentRoom);
        }, 2000);
    });

    // Socket event handlers
    socket.on('connect', () => {
        console.log('Connected to chat server');
    });

    socket.on('receive_message', (data) => {
        addMessage(data);
    });

    socket.on('message_history', (messages) => {
        displayMessages(messages);
    });

    socket.on('user_typing', () => {
        const indicator = document.getElementById('typing-indicator');
        indicator.textContent = 'Someone is typing';
        indicator.classList.remove('hidden');
    });

    socket.on('user_stop_typing', () => {
        document.getElementById('typing-indicator').classList.add('hidden');
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    function joinRoom(room) {
        // Update UI
        document.getElementById('current-room').textContent = 
            room.charAt(0).toUpperCase() + room.slice(1).replace('_', ' ');
        document.getElementById('room-description').textContent = roomDescriptions[room] || '';
        
        // Clear messages
        document.getElementById('messages').innerHTML = '<div class="text-center text-gray-500 py-8">Loading messages...</div>';
        
        // Join room
        socket.emit('join_room', room);
    }

    function displayMessages(messages) {
        const container = document.getElementById('messages');
        container.innerHTML = '';

        if (messages.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 py-8">No messages yet. Be the first to say something!</div>';
            return;
        }

        messages.forEach(message => {
            addMessage(message, false);
        });

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }

    function addMessage(data, scroll = true) {
        const container = document.getElementById('messages');
        const isCurrentUser = data.user_id === user.id;
        
        // Remove loading message if present
        if (container.children.length === 1 && container.children[0].classList.contains('text-center')) {
            container.innerHTML = '';
        }

        const messageElement = document.createElement('div');
        messageElement.className = `mb-4 flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`;
        
        messageElement.innerHTML = `
            <div class="max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl">
                <div class="${isCurrentUser ? 'bg-blue-500 text-white' : 'bg-gray-200'} rounded-lg p-3">
                    <p>${data.content}</p>
                </div>
                <div class="text-xs mt-1 ${isCurrentUser ? 'text-right' : 'text-left'} text-gray-500">
                    ${new Date(data.timestamp).toLocaleTimeString()}
                </div>
            </div>
        `;
        
        container.appendChild(messageElement);
        
        if (scroll) {
            container.scrollTop = container.scrollHeight;
        }
    }
});