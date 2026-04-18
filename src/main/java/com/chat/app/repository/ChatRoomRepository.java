package com.chat.app.repository;

import com.chat.app.model.ChatRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, Long> {

    @Query("SELECT r FROM ChatRoom r JOIN r.members m WHERE m.id = :userId")
    List<ChatRoom> findByMembersId(@Param("userId") Long userId);

    Optional<ChatRoom> findByName(String name);
}
