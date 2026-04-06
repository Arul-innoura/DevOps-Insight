package com.devops.backend.service;

import com.devops.backend.dto.ManagerRequest;
import com.devops.backend.model.Manager;

import java.util.List;
import java.util.Optional;

public interface ManagerService {
    
    List<Manager> getAllManagers();
    
    List<Manager> getActiveManagers();
    
    Optional<Manager> getManagerById(String id);
    
    Optional<Manager> getManagerByEmail(String email);
    
    Manager createManager(ManagerRequest request, String createdBy);
    
    Manager updateManager(String id, ManagerRequest request, String updatedBy);
    
    void deleteManager(String id);
    
    void toggleManagerStatus(String id, boolean active, String updatedBy);
}
