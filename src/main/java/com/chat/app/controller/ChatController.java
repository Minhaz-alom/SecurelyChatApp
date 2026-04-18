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

    // Pseudo Login Endpoint
    @PostMapping("/api/login")
    public User login(@RequestBody User user) {
        Optional<User> existingUser = userRepository.findByUsername(user.getUsername());
        if(existingUser.isPresent()) {
            return existingUser.get();
        }
        return userRepository.save(user);
    }

    // Get User's Rooms
    @GetMapping("/api/rooms/{userId}")
    public List<ChatRoom> getUserRooms(@PathVariable Long userId) {
        return chatRoomRepository.findByMembersId(userId);
    }

    // Get Default General Room
    @GetMapping("/api/rooms/default")
    public ChatRoom getDefaultRoom() {
        List<ChatRoom> rooms = chatRoomRepository.findAll();
        for (ChatRoom room : rooms) {
            if ("General".equals(room.getName())) {
                return room;
            }
        }
        ChatRoom general = new ChatRoom();
        general.setName("General");
        general.setGroup(true);
        return chatRoomRepository.save(general);
    }

    // Get Room History
    @GetMapping("/api/messages/{roomId}")
    public List<ChatMessage> getMessages(@PathVariable Long roomId) {
        return chatMessageRepository.findTop50ByRoomIdOrderByTimestampAsc(roomId);
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
