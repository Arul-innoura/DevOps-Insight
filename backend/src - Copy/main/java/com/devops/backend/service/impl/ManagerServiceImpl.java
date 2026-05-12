package com.devops.backend.service.impl;

import com.devops.backend.dto.ManagerRequest;
import com.devops.backend.model.Manager;
import com.devops.backend.repository.ManagerRepository;
import com.devops.backend.service.EventPublisherService;
import com.devops.backend.service.ManagerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class ManagerServiceImpl implements ManagerService {

    private final ManagerRepository managerRepository;
    private final EventPublisherService eventPublisher;

    @Override
    public List<Manager> getAllManagers() {
        return managerRepository.findAll();
    }

    @Override
    public List<Manager> getActiveManagers() {
        return managerRepository.findByActiveTrue();
    }

    @Override
    public Optional<Manager> getManagerById(String id) {
        return managerRepository.findById(id);
    }

    @Override
    public Optional<Manager> getManagerByEmail(String email) {
        return managerRepository.findByEmailIgnoreCase(email);
    }

    @Override
    public Manager createManager(ManagerRequest request, String createdBy) {
        if (managerRepository.existsByEmailIgnoreCase(request.getEmail())) {
            throw new IllegalArgumentException("Manager with email " + request.getEmail() + " already exists");
        }

        Manager manager = Manager.builder()
                .name(request.getName())
                .email(request.getEmail().toLowerCase())
                .active(true)
                .createdAt(Instant.now())
                .createdBy(createdBy)
                .build();

        Manager saved = managerRepository.save(manager);
        log.info("Manager created: {} by {}", saved.getEmail(), createdBy);
        eventPublisher.publishManagerEvent("CREATED", saved);
        return saved;
    }

    @Override
    public Manager updateManager(String id, ManagerRequest request, String updatedBy) {
        Manager manager = managerRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Manager not found: " + id));

        // Check if email changed and new email exists
        if (!manager.getEmail().equalsIgnoreCase(request.getEmail()) 
                && managerRepository.existsByEmailIgnoreCase(request.getEmail())) {
            throw new IllegalArgumentException("Manager with email " + request.getEmail() + " already exists");
        }

        manager.setName(request.getName());
        manager.setEmail(request.getEmail().toLowerCase());
        manager.setUpdatedAt(Instant.now());
        manager.setUpdatedBy(updatedBy);

        Manager saved = managerRepository.save(manager);
        log.info("Manager updated: {} by {}", saved.getEmail(), updatedBy);
        eventPublisher.publishManagerEvent("UPDATED", saved);
        return saved;
    }

    @Override
    public void deleteManager(String id) {
        Manager manager = managerRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Manager not found: " + id));
        managerRepository.delete(manager);
        log.info("Manager deleted: {}", manager.getEmail());
        eventPublisher.publishManagerEvent("DELETED", manager);
    }

    @Override
    public void toggleManagerStatus(String id, boolean active, String updatedBy) {
        Manager manager = managerRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Manager not found: " + id));

        manager.setActive(active);
        manager.setUpdatedAt(Instant.now());
        manager.setUpdatedBy(updatedBy);

        Manager saved = managerRepository.save(manager);
        log.info("Manager {} status set to {} by {}", saved.getEmail(), active, updatedBy);
        eventPublisher.publishManagerEvent("UPDATED", saved);
    }
}
