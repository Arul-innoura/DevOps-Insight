package com.devops.backend.repository;

import com.devops.backend.model.StandupNote;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StandupNoteRepository extends MongoRepository<StandupNote, String> {
    List<StandupNote> findAllByOrderByDateDescCreatedAtDesc();
    List<StandupNote> findByDateOrderByCreatedAtDesc(String date);
}
