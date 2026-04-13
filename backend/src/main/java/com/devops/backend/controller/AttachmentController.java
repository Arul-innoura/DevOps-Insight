package com.devops.backend.controller;

import com.devops.backend.service.BlobStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Handles file uploads for ticket note attachments.
 * Files are stored in Azure Blob Storage under ticket-notes/{ticketId}/...
 * Maximum per file: 5 MB. Maximum per request: 10 files.
 */
@RestController
@RequestMapping("/api/tickets")
@RequiredArgsConstructor
@Slf4j
public class AttachmentController {

    private static final int MAX_FILES_PER_REQUEST = 10;

    private final BlobStorageService blobStorageService;

    /**
     * POST /api/tickets/{ticketId}/attachments/upload
     * Accepts multipart/form-data with field name "files".
     * Returns JSON: { uploaded: [{url, name, type, size}], errors: [string] }
     */
    @PostMapping("/{ticketId}/attachments/upload")
    @PreAuthorize("hasAnyAuthority('APPROLE_User', 'APPROLE_DevOps', 'APPROLE_Admin')")
    public ResponseEntity<Map<String, Object>> uploadAttachments(
            @PathVariable String ticketId,
            @RequestParam("files") List<MultipartFile> files) {

        if (files == null || files.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "No files provided"));
        }

        List<Map<String, String>> uploaded = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (MultipartFile file : files.subList(0, Math.min(files.size(), MAX_FILES_PER_REQUEST))) {
            String displayName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "file";
            try {
                String url = blobStorageService.uploadNoteAttachment(ticketId, file);
                Map<String, String> meta = new LinkedHashMap<>();
                meta.put("url", url);
                meta.put("name", displayName);
                meta.put("type", file.getContentType() != null ? file.getContentType() : "application/octet-stream");
                meta.put("size", String.valueOf(file.getSize()));
                uploaded.add(meta);
            } catch (IllegalArgumentException e) {
                log.warn("Rejected file '{}' for ticket {}: {}", displayName, ticketId, e.getMessage());
                errors.add(displayName + ": " + e.getMessage());
            } catch (IOException e) {
                log.error("Upload failed for '{}' ticket {}: {}", displayName, ticketId, e.getMessage());
                errors.add(displayName + ": Upload failed, please try again.");
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("uploaded", uploaded);
        result.put("errors", errors);
        return ResponseEntity.ok(result);
    }
}
