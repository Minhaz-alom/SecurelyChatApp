package com.chat.app.controller;

import com.chat.app.model.ChatMessage;
import com.chat.app.model.ChatRoom;
import com.chat.app.model.User;
import com.chat.app.repository.ChatMessageRepository;
import com.chat.app.repository.ChatRoomRepository;
import com.chat.app.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@RestController
public class ChatController {

    @Autowired
    private ChatMessageRepository chatMessageRepository;

    @Autowired
    private ChatRoomRepository chatRoomRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    // Login request DTO
    public static class LoginRequest {
        private String username;
        private String keyHash;

        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getKeyHash() { return keyHash; }
        public void setKeyHash(String keyHash) { this.keyHash = keyHash; }
    }

    // Pseudo Login Endpoint
    @PostMapping("/api/login")
    public User login(@RequestBody LoginRequest request) {
        String username = request.getUsername();
        // Temporarily ignore keyHash to fix login
        // String keyHash = request.getKeyHash();

        System.out.println("Login attempt for username: " + username);

        Optional<User> existingUser = userRepository.findByUsername(username);
        if(existingUser.isPresent()) {
            User user = existingUser.get();
            System.out.println("Found existing user: " + user.getId());
            return user;
        }

        // Create new user
        User newUser = new User(username);
        User savedUser = userRepository.save(newUser);
        System.out.println("Created new user: " + savedUser.getId());
        return savedUser;
    }

    // Get User's Rooms
    @GetMapping("/api/rooms/{userId}")
    public List<ChatRoom> getUserRooms(@PathVariable Long userId) {
        return chatRoomRepository.findByMembersId(userId);
    }

    // Get All Users (for starting new chats) - temporarily disabled key filtering
    @GetMapping("/api/users")
    public List<User> getAllUsers(@RequestParam Long currentUserId) {
        // Temporarily return all users
        return userRepository.findAll();
    }

    // Create or Get 1-to-1 Room
    @PostMapping("/api/rooms/direct")
    public ChatRoom getOrCreateDirectRoom(@RequestParam Long user1Id, @RequestParam Long user2Id) {
        List<ChatRoom> rooms = chatRoomRepository.findAll();
        for (ChatRoom room : rooms) {
            if (!room.isGroup() && room.getMembers().size() == 2) {
                boolean hasUser1 = room.getMembers().stream().anyMatch(u -> u.getId().equals(user1Id));
                boolean hasUser2 = room.getMembers().stream().anyMatch(u -> u.getId().equals(user2Id));
                if (hasUser1 && hasUser2) {
                    return room;
                }
            }
        }
        
        User u1 = userRepository.findById(user1Id).orElseThrow();
        User u2 = userRepository.findById(user2Id).orElseThrow();
        
        ChatRoom newRoom = new ChatRoom();
        newRoom.setGroup(false);
        newRoom.setName(u1.getUsername() + " & " + u2.getUsername());
        newRoom.getMembers().add(u1);
        newRoom.getMembers().add(u2);
        
        return chatRoomRepository.save(newRoom);
    }

    // Get Room History
    @GetMapping("/api/messages/{roomId}")
    public List<ChatMessage> getMessages(@PathVariable Long roomId) {
        return chatMessageRepository.findTop50ByRoomIdOrderByTimestampAsc(roomId);
    }

    // Get or create the default public room
    @GetMapping("/api/rooms/default-room")
    public ChatRoom getDefaultRoom() {
        return chatRoomRepository.findByName("general-encrypted")
                .orElseGet(() -> {
                    ChatRoom room = new ChatRoom();
                    room.setGroup(true);
                    room.setName("general-encrypted");
                    return chatRoomRepository.save(room);
                });
    }

    // WebSocket - Send Message to a specific room
    @MessageMapping("/chat/{roomId}/sendMessage")
    public void sendMessage(@DestinationVariable String roomId, @Payload ChatMessage chatMessage) {
        if (chatMessage.getTimestamp() == null) {
            chatMessage.setTimestamp(LocalDateTime.now());
        }
        chatMessage.setRoomId(Long.valueOf(roomId));
        chatMessageRepository.save(chatMessage);
        
        // Broadcast to the specific room topic
        messagingTemplate.convertAndSend("/topic/room." + roomId, chatMessage);
    }

    // WebSocket - Add User to a specific room topic conceptually
    @MessageMapping("/chat/{roomId}/addUser")
    public void addUser(@DestinationVariable String roomId, @Payload ChatMessage chatMessage,
                                SimpMessageHeaderAccessor headerAccessor) {
        headerAccessor.getSessionAttributes().put("username", chatMessage.getSender());
        chatMessage.setTimestamp(LocalDateTime.now());
        chatMessage.setRoomId(Long.valueOf(roomId));
        
        // Broadcast to the specific room topic
        messagingTemplate.convertAndSend("/topic/room." + roomId, chatMessage);
    }
}
