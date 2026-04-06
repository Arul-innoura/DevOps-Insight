package com.devops.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ManagerRequest {
    
    @NotBlank(message = "Manager name is required")
    private String name;
    
    @NotBlank(message = "Manager email is required")
    @Email(message = "Invalid email format")
    private String email;
}
