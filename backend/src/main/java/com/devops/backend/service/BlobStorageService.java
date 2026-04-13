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

    private static final long MAX_FILE_BYTES = 5L * 1024 * 1024; // 5 MB

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
            throw new IllegalArgumentException("File exceeds 5 MB limit: " + file.getOriginalFilename());
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
     * Delete a blob by its full URL (best-effort; logs on failure).
     */
    public void deleteAttachment(String blobUrl) {
        if (blobUrl == null || blobUrl.isBlank()) return;
        try {
            // Strip container base URL to get the blob path
            String prefix = containerUrl.endsWith("/") ? containerUrl : containerUrl + "/";
            if (blobUrl.startsWith(prefix)) {
                String blobName = blobUrl.substring(prefix.length());
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
