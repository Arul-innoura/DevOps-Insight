package com.devops.backend.controller;

import com.devops.backend.dto.WorkflowDirectoryContactDto;
import com.devops.backend.service.WorkflowDirectoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Read-only directory of people and emails gathered from all products' saved workflows (for autocomplete).
 */
@RestController
@RequestMapping("/api/workflow-directory")
@RequiredArgsConstructor
public class WorkflowDirectoryController {

    private final WorkflowDirectoryService workflowDirectoryService;

    @GetMapping("/contacts")
    public ResponseEntity<List<WorkflowDirectoryContactDto>> contacts(
            @RequestParam(value = "excludeProjectId", required = false) String excludeProjectId,
            @RequestParam(value = "q", required = false) String q) {
        return ResponseEntity.ok(workflowDirectoryService.listContacts(excludeProjectId, q));
    }
}
