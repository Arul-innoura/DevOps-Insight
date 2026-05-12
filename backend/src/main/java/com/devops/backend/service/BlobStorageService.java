package com.devops.backend.service;

import com.azure.storage.blob.BlobClient;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobServiceClient;
import com.azure.storage.blob.BlobServiceClientBuilder;
import com.azure.storage.blob.models.BlobHttpHeaders;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
@Slf4j
public class BlobStorageService {

    private static final long MAX_FILE_BYTES = 12L * 1024 * 1024; // 12 MB (ticket note attachments)
    private static final long MAX_AVATAR_BYTES = 1024L * 1024;   // 1 MB (profile pictures)

    private final BlobContainerClient containerClient;
    private final String containerUrl;

    public BlobStorageService(
            @Value("${app.azure.blob.connection-string}") String connectionString,
            @Value("${app.azure.blob.container-name}") String containerName) {
        BlobServiceClient serviceClient = new BlobServiceClientBuilder()
                .connectionString(connectionString)
                .buildClient();
        this.containerClient = serviceClient.getBlobContainerClient(containerName);
        this.containerUrl = this.containerClient.getBlobContainerUrl();
        log.info("BlobStorageService initialised — container: {}", containerName);
    }

    /**
     * Upload a note attachment into ticket-notes/{ticketId}/{uuid}/{filename}.
     * Returns the public blob URL.
     */
    public String uploadNoteAttachment(String ticketId, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File must not be empty");
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            throw new IllegalArgumentException("File exceeds 12 MB limit: " + file.getOriginalFilename());
        }

        String originalName = sanitizeFilename(
                file.getOriginalFilename() != null ? file.getOriginalFilename() : "file");
        String blobName = "ticket-notes/" + ticketId + "/" + UUID.randomUUID() + "/" + originalName;

        BlobClient blobClient = containerClient.getBlobClient(blobName);

        BlobHttpHeaders headers = new BlobHttpHeaders()
                .setContentType(file.getContentType() != null ? file.getContentType() : "application/octet-stream")
                .setContentDisposition("inline; filename=\"" + originalName + "\"");

        blobClient.upload(file.getInputStream(), file.getSize(), true);
        blobClient.setHttpHeaders(headers);

        String url = blobClient.getBlobUrl();
        log.info("Uploaded note attachment for ticket {}: {}", ticketId, url);
        return url;
    }

    /**
     * Upload a user profile picture into profile-pics/{safeEmail}/avatar.{ext}.
     * Replaces any existing avatar at the same path. Hard cap of 1 MB.
     * Returns the public blob URL.
     */
    public String uploadProfilePicture(String email, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Profile picture must not be empty");
        }
        if (file.getSize() > MAX_AVATAR_BYTES) {
            throw new IllegalArgumentException("Profile picture exceeds 1 MB limit");
        }
        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase().startsWith("image/")) {
            throw new IllegalArgumentException("Only image uploads are allowed for profile pictures");
        }
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email is required to store a profile picture");
        }

        // Deterministic blob name per user so a new upload replaces the old one
        String safeEmail = email.replaceAll("[^a-zA-Z0-9._\\-]", "_").toLowerCase();
        String ext;
        String ct = contentType.toLowerCase();
        if (ct.contains("png")) ext = "png";
        else if (ct.contains("gif")) ext = "gif";
        else if (ct.contains("webp")) ext = "webp";
        else ext = "jpg";

        String blobName = "profile-pics/" + safeEmail + "/avatar." + ext;
        BlobClient blobClient = containerClient.getBlobClient(blobName);

        BlobHttpHeaders headers = new BlobHttpHeaders()
                .setContentType(contentType)
                .setContentDisposition("inline")
                // Short cache lifetime so newly uploaded avatars show up quickly
                .setCacheControl("public, max-age=300");

        blobClient.upload(file.getInputStream(), file.getSize(), true);
        blobClient.setHttpHeaders(headers);

        // Append a version query so the browser bypasses any cached old image
        String url = blobClient.getBlobUrl() + "?v=" + System.currentTimeMillis();
        log.info("Uploaded profile picture for {}: {}", email, url);
        return url;
    }

    /**
     * Delete a blob by its full URL (best-effort; logs on failure).
     */
    public void deleteAttachment(String blobUrl) {
        if (blobUrl == null || blobUrl.isBlank()) return;
        try {
            // Strip container base URL to get the blob path
            String prefix = containerUrl.endsWith("/") ? containerUrl : containerUrl + "/";
            // Strip any query string (e.g. cache-bust "?v=...") before resolving blob name
            String urlPathOnly = blobUrl.contains("?") ? blobUrl.substring(0, blobUrl.indexOf('?')) : blobUrl;
            if (urlPathOnly.startsWith(prefix)) {
                String blobName = urlPathOnly.substring(prefix.length());
                containerClient.getBlobClient(blobName).deleteIfExists();
                log.info("Deleted blob: {}", blobName);
            } else {
                log.warn("Blob URL does not belong to configured container, skipping delete: {}", blobUrl);
            }
        } catch (Exception e) {
            log.warn("Failed to delete blob {}: {}", blobUrl, e.getMessage());
        }
    }

    private String sanitizeFilename(String name) {
        // Replace characters unsafe for blob names / URLs while keeping extension
        return name.replaceAll("[^a-zA-Z0-9._\\-]", "_");
    }
}
